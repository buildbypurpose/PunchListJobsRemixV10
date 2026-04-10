import os
import uuid
import shutil
from pathlib import Path
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query
from database import db
from auth import get_current_user, user_to_response
from models import ProfileUpdate, LocationUpdate, OnlineStatusUpdate, CrewRequest
from utils.analytics_service import increment_profile_views
from typing import Optional
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

UPLOAD_DIR = Path("/app/backend/uploads")
PROFILE_DIR = UPLOAD_DIR / "profile_photos"
LOGO_DIR = UPLOAD_DIR / "logos"
PORTFOLIO_DIR = UPLOAD_DIR / "portfolio"
PROFILE_DIR.mkdir(parents=True, exist_ok=True)
LOGO_DIR.mkdir(parents=True, exist_ok=True)
PORTFOLIO_DIR.mkdir(parents=True, exist_ok=True)


PROFILE_COMPLETE_BONUS = 100  # Points awarded for reaching 100%


def calc_profile_completion(user: dict) -> dict:
    """Calculate profile completion percentage and missing fields."""
    role = user.get("role", "crew")
    checks = {
        "photo":   bool(user.get("profile_photo") or user.get("logo")),
        "phone":   bool(user.get("phone")),
        "address": bool(user.get("address")),
        "bio":     bool(user.get("bio")),
        "name":    bool(user.get("name") or (user.get("first_name") and user.get("last_name"))),
    }
    if role == "contractor":
        checks["company_name"] = bool(user.get("company_name"))
    else:
        checks["skills"]    = bool(user.get("skills") or user.get("trade"))
        checks["portfolio"] = bool(user.get("portfolio_images"))
    completed = sum(1 for v in checks.values() if v)
    pct = int((completed / len(checks)) * 100)
    return {"percentage": pct, "checks": checks, "is_complete": pct == 100}


async def check_and_award_profile_bonus(user_id: str):
    """Award bonus points when user first reaches 100% profile completion."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        return None
    result = calc_profile_completion(user)
    if result["is_complete"] and not user.get("profile_bonus_awarded"):
        await db.users.update_one(
            {"id": user_id},
            {"$inc": {"points": PROFILE_COMPLETE_BONUS}, "$set": {"profile_bonus_awarded": True}}
        )
        return PROFILE_COMPLETE_BONUS
    return None


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return user_to_response(current_user)


@router.get("/profile-completion")
async def get_profile_completion(current_user: dict = Depends(get_current_user)):
    result = calc_profile_completion(current_user)
    result["bonus_points"] = PROFILE_COMPLETE_BONUS
    result["bonus_awarded"] = bool(current_user.get("profile_bonus_awarded"))
    return result


@router.put("/online-status")
async def set_online_status(data: OnlineStatusUpdate, current_user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"is_online": data.is_online, "availability": data.is_online}}
    )
    return {"is_online": data.is_online}


@router.put("/profile")
async def update_profile(data: ProfileUpdate, current_user: dict = Depends(get_current_user)):
    update = {k: v for k, v in data.model_dump().items() if v is not None}

    # Email change: validate and require verification
    if data.email and data.email != current_user.get("email"):
        import re
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", data.email):
            raise HTTPException(status_code=400, detail="Invalid email format")
        existing = await db.users.find_one({"email": data.email.lower(), "id": {"$ne": current_user["id"]}})
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        # Generate verification code
        import secrets
        code = secrets.token_urlsafe(6)[:6].upper()
        await db.users.update_one({"id": current_user["id"]}, {"$set": {
            "pending_email": data.email.lower(),
            "email_verify_code": code,
            "email_verified": False,
        }})
        from utils.email_utils import send_email
        await send_email(data.email, "PunchListJobs - Verify your email",
            f"<p>Your verification code is: <strong>{code}</strong></p><p>Enter this code in your profile to confirm your new email.</p>")
        update.pop("email", None)  # Don't update email yet
        return {"message": "Verification code sent to new email", "pending_email": data.email, "needs_verification": True}
    update.pop("email", None)  # Never set email directly

    # Compose full name from first_name / last_name if provided
    if data.first_name or data.last_name:
        fn = data.first_name or current_user.get("first_name", "")
        ln = data.last_name  or current_user.get("last_name",  "")
        update["name"] = f"{fn} {ln}".strip()

    # Geocode address if address field changed
    if data.address and data.address != current_user.get("address"):
        try:
            from utils.geocoding import geocode_address
            geo = await geocode_address(data.address)
            if geo and geo.get("lat"):
                update["location"] = {
                    "lat": geo["lat"], "lng": geo["lng"],
                    "city": geo.get("city", ""),
                    "state": geo.get("state", ""),
                    "address": data.address
                }
                # Store GeoJSON format for 2dsphere index
                update["location_geo"] = {
                    "type": "Point",
                    "coordinates": [geo["lng"], geo["lat"]]  # GeoJSON: [lng, lat]
                }
        except Exception as e:
            logger.warning(f"Geocoding failed for address '{data.address}': {e}")

    if update:
        await db.users.update_one({"id": current_user["id"]}, {"$set": update})
    # Check if profile just reached 100% — award bonus
    bonus = await check_and_award_profile_bonus(current_user["id"])
    updated = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    resp = user_to_response(updated)
    if bonus:
        resp["profile_bonus_awarded"] = bonus
    return resp


@router.post("/verify-email")
async def verify_email(data: dict, current_user: dict = Depends(get_current_user)):
    """Verify pending email change with code."""
    code = data.get("code", "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Verification code is required")
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    if not user.get("pending_email") or not user.get("email_verify_code"):
        raise HTTPException(status_code=400, detail="No pending email change")
    if user["email_verify_code"] != code:
        raise HTTPException(status_code=400, detail="Invalid verification code")
    await db.users.update_one({"id": current_user["id"]}, {
        "$set": {"email": user["pending_email"], "email_verified": True},
        "$unset": {"pending_email": "", "email_verify_code": ""}
    })
    return {"message": "Email verified and updated", "email": user["pending_email"]}
async def get_public_profile(user_id: str, current_user: dict = Depends(get_current_user)):
    """Get a user's public profile (for popup or profile page)."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Fetch recent ratings
    recent_ratings = await db.ratings.find(
        {"rated_id": user_id}, {"_id": 0}
    ).sort("created_at", -1).limit(5).to_list(5)
    profile = user_to_response(user)
    profile["recent_ratings"] = recent_ratings
    # Mask phone/email for free-tier viewers (unless viewing own profile)
    viewer_is_free = current_user.get("subscription_status") in ("free", "expired", None)
    if viewer_is_free and user_id != current_user["id"]:
        profile.pop("phone", None)
        profile.pop("email", None)
    await increment_profile_views(user_id, viewer_id=current_user["id"])
    return profile


@router.post("/location")
async def update_location(data: LocationUpdate, current_user: dict = Depends(get_current_user)):
    location = {"lat": data.lat, "lng": data.lng, "city": data.city or ""}
    # Also save GeoJSON format for 2dsphere index
    location_geo = {"type": "Point", "coordinates": [data.lng, data.lat]}
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"location": location, "location_geo": location_geo}}
    )
    # Update WS location
    try:
        from routes.ws_routes import manager
        manager.update_user_location(current_user["id"], data.lat, data.lng)
    except Exception:
        pass
    return {"message": "Location updated"}


@router.post("/upload-photo")
async def upload_photo(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    filename = f"{current_user['id']}.{ext}"

    if current_user["role"] == "contractor":
        path = LOGO_DIR / filename
        field = "logo"
    else:
        path = PROFILE_DIR / filename
        field = "profile_photo"

    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    if current_user["role"] == "contractor":
        photo_url = f"/api/uploads/logos/{filename}"
    else:
        photo_url = f"/api/uploads/profile_photos/{filename}"

    await db.users.update_one({"id": current_user["id"]}, {"$set": {field: photo_url}})
    bonus = await check_and_award_profile_bonus(current_user["id"])
    resp = {"url": photo_url}
    if bonus:
        resp["profile_bonus_awarded"] = bonus
    return resp


# ─── Portfolio Images ─────────────────────────────────────────────────────────

@router.post("/upload-portfolio")
async def upload_portfolio_image(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """Upload one portfolio image (max 8 total)."""
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "portfolio_images": 1})
    existing = user.get("portfolio_images") or []
    if len(existing) >= 8:
        raise HTTPException(status_code=400, detail="Maximum 8 portfolio images allowed")
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
    filename = f"{current_user['id']}_{uuid.uuid4().hex[:8]}.{ext}"
    path = PORTFOLIO_DIR / filename

    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    url = f"/api/uploads/portfolio/{filename}"
    await db.users.update_one({"id": current_user["id"]}, {"$push": {"portfolio_images": url}})
    return {"url": url, "total": len(existing) + 1}


@router.delete("/portfolio/{filename}")
async def delete_portfolio_image(filename: str, current_user: dict = Depends(get_current_user)):
    """Remove a portfolio image by filename (last path segment)."""
    # Support both old (/uploads/...) and new (/api/uploads/...) URL formats
    url_new = f"/api/uploads/portfolio/{filename}"
    url_old = f"/uploads/portfolio/{filename}"
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "portfolio_images": 1})
    existing = user.get("portfolio_images") or []
    actual_url = url_new if url_new in existing else (url_old if url_old in existing else None)
    if not actual_url:
        raise HTTPException(status_code=404, detail="Image not found in your portfolio")

    await db.users.update_one({"id": current_user["id"]}, {"$pull": {"portfolio_images": actual_url}})
    try:
        (PORTFOLIO_DIR / filename).unlink(missing_ok=True)
    except Exception:
        pass
    return {"message": "Image removed"}


# ─── Profile Boost ────────────────────────────────────────────────────────────

@router.post("/boost")
async def activate_profile_boost(current_user: dict = Depends(get_current_user)):
    """Activate a 7-day profile boost (no payment required in current phase)."""
    boost_expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"is_boosted": True, "boost_expires_at": boost_expires_at}}
    )
    return {"is_boosted": True, "boost_expires_at": boost_expires_at, "days": 7}


@router.get("/boost/status")
async def get_boost_status(current_user: dict = Depends(get_current_user)):
    """Return current boost status, auto-expiring if past expiry date."""
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "is_boosted": 1, "boost_expires_at": 1})
    is_boosted = user.get("is_boosted", False)
    expires_at = user.get("boost_expires_at")

    if is_boosted and expires_at:
        try:
            if datetime.fromisoformat(expires_at) < datetime.now(timezone.utc):
                await db.users.update_one({"id": current_user["id"]}, {"$set": {"is_boosted": False}})
                is_boosted = False
                expires_at = None
        except Exception:
            pass

    return {"is_boosted": is_boosted, "boost_expires_at": expires_at}


# ─── Profile Stats ────────────────────────────────────────────────────────────

@router.get("/profile-stats")
async def get_my_profile_stats(current_user: dict = Depends(get_current_user)):
    """Return own profile analytics (views, rating, jobs)."""
    from utils.analytics_service import get_profile_stats
    return await get_profile_stats(current_user["id"])


# ─── Crew Search ──────────────────────────────────────────────────────────────

@router.get("/crew")
async def search_crew(
    trade: Optional[str] = None,
    name: Optional[str] = None,
    address: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius: Optional[float] = 50,
    available_only: bool = True,
    smart_match: bool = False,
    current_user: dict = Depends(get_current_user)
):
    query = {"role": "crew", "is_active": True}
    if trade:
        query["$or"] = [
            {"trade": {"$regex": trade, "$options": "i"}},
            {"skills": {"$elemMatch": {"$regex": trade, "$options": "i"}}}
        ]
    if name:
        query["name"] = {"$regex": name, "$options": "i"}
    if available_only:
        query["$and"] = query.get("$and", []) + [{"$or": [{"availability": True}, {"is_online": True}]}]

    # Profile gate: only show crew with at least a phone or trade set (basic completion)
    query["$and"] = query.get("$and", []) + [
        {"$or": [
            {"phone": {"$exists": True, "$nin": [None, ""]}},
            {"trade": {"$exists": True, "$nin": [None, ""]}}
        ]}
    ]

    # Geocode address if provided and no lat/lng
    if address and not (lat and lng):
        try:
            from utils.geocoding import geocode_address
            geo = await geocode_address(address)
            lat, lng = geo.get("lat"), geo.get("lng")
        except Exception:
            pass

    # Use MongoDB 2dsphere geo query if lat/lng available
    if lat and lng:
        query["location_geo"] = {
            "$geoWithin": {
                "$centerSphere": [[lng, lat], radius / 3958.8]  # radius in radians (earth radius ~3958.8 mi)
            }
        }

    crew = await db.users.find(query, {"_id": 0, "password_hash": 0}).to_list(100)

    # Fallback: if no location_geo data but lat/lng given, use haversine
    if lat and lng and not any(c.get("location_geo") for c in crew):
        from utils.geocoding import haversine_distance
        crew = [c for c in crew if c.get("location") and
                haversine_distance(lat, lng, c["location"]["lat"], c["location"]["lng"]) <= radius]

    # Contact masking: hide phone/email unless viewing own profile or job is active
    # Free-tier viewers always get full masking regardless of job relationship
    viewer_is_free = current_user.get("subscription_status") in ("free", "expired")
    is_contractor = current_user["role"] == "contractor"
    accepted_crew_ids = set()
    if is_contractor and not viewer_is_free:
        # Find contractor's accepted/in-progress jobs crew IDs
        active_jobs = await db.jobs.find(
            {"contractor_id": current_user["id"], "status": {"$in": ["fulfilled", "in_progress"]}},
            {"_id": 0, "crew_accepted": 1}
        ).to_list(50)
        for j in active_jobs:
            accepted_crew_ids.update(j.get("crew_accepted", []))

    for c in crew:
        if viewer_is_free:
            # Free tier: completely strip phone and email from all crew
            c.pop("phone", None)
            c.pop("email", None)
        elif c["id"] not in accepted_crew_ids and c["id"] != current_user["id"]:
            # Paid, non-accepted: mask phone, always hide email
            phone = c.get("phone")
            if phone:
                digits = ''.join(filter(str.isdigit, phone))
                c["phone"] = f"***-***-{digits[-4:]}" if len(digits) >= 4 else "***"
            c.pop("email", None)

        # Location masking for privacy (~1km precision)
        if c.get("location") and c.get("hide_location", True):
            c["location"] = {
                "lat": round(c["location"]["lat"], 2),
                "lng": round(c["location"]["lng"], 2),
                "city": c["location"].get("city", "")
            }
        # Remove GeoJSON internal field
        c.pop("location_geo", None)
        c.pop("password_hash", None)

    # Smart matching: sort crew by trade + skills + rating
    if smart_match:
        from utils.matching import sort_crew_for_contractor
        crew = sort_crew_for_contractor(crew, trade_query=trade or "", skills_context=trade or "")

    return crew


@router.get("/crew/{user_id}")
async def get_crew_member(user_id: str, current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": user_id, "role": "crew"}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Crew member not found")
    ratings = await db.ratings.find({"rated_id": user_id}, {"_id": 0}).to_list(50)
    return {**user_to_response(user), "recent_ratings": ratings[-5:]}


@router.post("/favorites/{user_id}")
async def add_favorite(user_id: str, current_user: dict = Depends(get_current_user)):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if user_id not in current_user.get("favorite_crew", []):
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$push": {"favorite_crew": user_id}}
        )
    return {"message": "Added to favorites"}


@router.delete("/favorites/{user_id}")
async def remove_favorite(user_id: str, current_user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$pull": {"favorite_crew": user_id}}
    )
    return {"message": "Removed from favorites"}


@router.get("/favorites")
async def get_favorites(current_user: dict = Depends(get_current_user)):
    fav_ids = current_user.get("favorite_crew", [])
    users = await db.users.find({"id": {"$in": fav_ids}}, {"_id": 0, "password_hash": 0}).to_list(100)
    return users


@router.get("/referral/info")
async def referral_info(current_user: dict = Depends(get_current_user)):
    referrals = await db.referrals.find({"referrer_id": current_user["id"]}, {"_id": 0}).to_list(100)
    return {
        "referral_code": current_user["referral_code"],
        "points": current_user["points"],
        "total_referrals": len(referrals),
        "referrals": referrals
    }


@router.post("/redeem-points")
async def redeem_points(points: int, current_user: dict = Depends(get_current_user)):
    if current_user["points"] < points:
        raise HTTPException(status_code=400, detail="Insufficient points")
    if points < 500:
        raise HTTPException(status_code=400, detail="Minimum 500 points to redeem")

    days = points // 500  # 500 points = 1 day subscription
    from datetime import datetime, timezone, timedelta
    sub_end = current_user.get("subscription_end")
    if sub_end:
        try:
            base = datetime.fromisoformat(sub_end)
        except Exception:
            base = datetime.now(timezone.utc)
    else:
        base = datetime.now(timezone.utc)

    new_end = (base + timedelta(days=days)).isoformat()
    await db.users.update_one(
        {"id": current_user["id"]},
        {
            "$inc": {"points": -points},
            "$set": {"subscription_end": new_end, "subscription_status": "active"}
        }
    )
    return {"message": f"Redeemed {points} points for {days} days", "new_subscription_end": new_end}


@router.get("/trial-status")
async def trial_status(current_user: dict = Depends(get_current_user)):
    from datetime import datetime, timezone
    trial_end = current_user.get("trial_end_date")
    if not trial_end:
        return {"is_trial": False, "days_remaining": 0}
    try:
        end = datetime.fromisoformat(trial_end)
        remaining = (end - datetime.now(timezone.utc)).days
        return {
            "is_trial": current_user.get("subscription_status") == "trial",
            "days_remaining": max(0, remaining),
            "trial_end": trial_end
        }
    except Exception:
        return {"is_trial": False, "days_remaining": 0}


# ─── Crew Request System ──────────────────────────────────────────────────────

@router.post("/request/{crew_id}")
async def send_crew_request(crew_id: str, data: CrewRequest, current_user: dict = Depends(get_current_user)):
    """Contractor sends a direct request to a crew member."""
    if current_user["role"] != "contractor":
        raise HTTPException(status_code=403, detail="Only contractors can send crew requests")
    if current_user.get("subscription_status") in ("free", "expired"):
        raise HTTPException(status_code=403, detail="Upgrade to a paid plan to use these features!")

    crew_member = await db.users.find_one({"id": crew_id, "role": "crew"}, {"_id": 0})
    if not crew_member:
        raise HTTPException(status_code=404, detail="Crew member not found")

    from datetime import datetime, timezone
    request_doc = {
        "id": str(uuid.uuid4()),
        "contractor_id": current_user["id"],
        "contractor_name": current_user["name"],
        "contractor_company": current_user.get("company_name", ""),
        "crew_id": crew_id,
        "crew_name": crew_member["name"],
        "message": data.message or "",
        "job_context": data.job_context,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.crew_requests.insert_one(request_doc)

    # Notify crew via WebSocket
    try:
        from routes.ws_routes import manager
        await manager.send_to_user(crew_id, {
            "type": "crew_request",
            "request_id": request_doc["id"],
            "contractor_name": current_user["name"],
            "contractor_company": current_user.get("company_name", ""),
            "message": data.message or "",
            "job_context": data.job_context,
        })
    except Exception:
        pass

    return {k: v for k, v in request_doc.items() if k != "_id"}


@router.get("/requests")
async def get_crew_requests(current_user: dict = Depends(get_current_user)):
    """Get pending crew requests for crew member, or sent requests for contractor."""
    if current_user["role"] == "crew":
        requests = await db.crew_requests.find(
            {"crew_id": current_user["id"]},
            {"_id": 0}
        ).sort("created_at", -1).to_list(50)
    else:
        requests = await db.crew_requests.find(
            {"contractor_id": current_user["id"]},
            {"_id": 0}
        ).sort("created_at", -1).to_list(50)
    return requests


@router.put("/requests/{request_id}/accept")
async def accept_crew_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """Crew member accepts a contractor request."""
    if current_user["role"] != "crew":
        raise HTTPException(status_code=403, detail="Only crew can accept requests")

    req = await db.crew_requests.find_one({"id": request_id, "crew_id": current_user["id"]}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Request already {req['status']}")

    await db.crew_requests.update_one({"id": request_id}, {"$set": {"status": "accepted"}})

    # Notify contractor via WebSocket
    try:
        from routes.ws_routes import manager
        await manager.send_to_user(req["contractor_id"], {
            "type": "crew_request_accepted",
            "request_id": request_id,
            "crew_name": current_user["name"],
            "crew_id": current_user["id"],
        })
    except Exception:
        pass

    return {"message": "Request accepted"}


@router.put("/requests/{request_id}/decline")
async def decline_crew_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """Crew member declines a contractor request."""
    if current_user["role"] != "crew":
        raise HTTPException(status_code=403, detail="Only crew can decline requests")

    req = await db.crew_requests.find_one({"id": request_id, "crew_id": current_user["id"]}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    await db.crew_requests.update_one({"id": request_id}, {"$set": {"status": "declined"}})

    # Notify contractor via WebSocket
    try:
        from routes.ws_routes import manager
        await manager.send_to_user(req["contractor_id"], {
            "type": "crew_request_declined",
            "request_id": request_id,
            "crew_name": current_user["name"],
        })
    except Exception:
        pass

    return {"message": "Request declined"}
