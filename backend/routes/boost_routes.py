"""
Boost Routes – /api/boost/
──────────────────────────
POST  /api/boost/profile              – activate 7-day profile boost
GET   /api/boost/profile/status       – check profile boost status + price

POST  /api/boost/job/{job_id}         – activate 7-day job boost
POST  /api/boost/emergency/{job_id}   – activate emergency flag on a job

All run in demo mode (no real payment). Hooks are in place for real
payment integration — replace the tx record with a Stripe/PayPal charge
and only call update_one after successful payment confirmation.
"""
import uuid
from fastapi import APIRouter, HTTPException, Depends
from database import db
from auth import get_current_user
from datetime import datetime, timezone, timedelta

router = APIRouter()

BOOST_DAYS = 7


async def _boost_price(key: str, default: float) -> float:
    s = await db.settings.find_one({}, {"_id": 0})
    return float((s or {}).get(key, default))


def _now():
    return datetime.now(timezone.utc).isoformat()


# ─── Profile Boost ────────────────────────────────────────────────────────────

@router.post("/profile")
async def boost_profile(current_user: dict = Depends(get_current_user)):
    """Activate a 7-day profile boost. DEMO mode – charge simulated."""
    if current_user["role"] not in ("crew", "contractor"):
        raise HTTPException(status_code=403, detail="Only crew and contractors can boost profiles")

    price = await _boost_price("profile_boost_price", 4.99)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=BOOST_DAYS)).isoformat()

    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"profile_boost_expires_at": expires_at, "is_profile_boosted": True}}
    )

    tx = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "session_id": f"boost_profile_{uuid.uuid4().hex[:12]}",
        "amount": price,
        "currency": "usd",
        "plan": "profile_boost",
        "payment_method": "demo",
        "payment_status": "paid",
        "created_at": _now(),
    }
    await db.payment_transactions.insert_one(tx)

    return {
        "message": f"Profile boosted for {BOOST_DAYS} days",
        "expires_at": expires_at,
        "amount_charged": price,
        "demo_mode": True,
    }


@router.get("/profile/status")
async def profile_boost_status(current_user: dict = Depends(get_current_user)):
    """Check if the current user's profile is actively boosted."""
    user = await db.users.find_one(
        {"id": current_user["id"]},
        {"_id": 0, "profile_boost_expires_at": 1, "is_profile_boosted": 1}
    )
    expires_at = (user or {}).get("profile_boost_expires_at")
    price = await _boost_price("profile_boost_price", 4.99)

    if not expires_at:
        return {"is_boosted": False, "expires_at": None, "price": price}

    try:
        exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        is_active = exp > datetime.now(timezone.utc)
    except ValueError:
        is_active = False

    if not is_active:
        await db.users.update_one({"id": current_user["id"]}, {"$set": {"is_profile_boosted": False}})

    return {"is_boosted": is_active, "expires_at": expires_at if is_active else None, "price": price}


# ─── Job Boost ────────────────────────────────────────────────────────────────

@router.post("/job/{job_id}")
async def boost_job(job_id: str, current_user: dict = Depends(get_current_user)):
    """Activate priority listing for a job for 7 days. DEMO mode."""
    if current_user["role"] != "contractor":
        raise HTTPException(status_code=403, detail="Only contractors can boost jobs")

    job = await db.jobs.find_one({"id": job_id, "contractor_id": current_user["id"]})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or not owned by you")

    price = await _boost_price("job_boost_price", 9.99)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=BOOST_DAYS)).isoformat()

    await db.jobs.update_one(
        {"id": job_id},
        {"$set": {"is_boosted": True, "boost_expires_at": expires_at}}
    )

    tx = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "session_id": f"boost_job_{uuid.uuid4().hex[:12]}",
        "amount": price,
        "currency": "usd",
        "plan": "job_boost",
        "payment_method": "demo",
        "payment_status": "paid",
        "job_id": job_id,
        "created_at": _now(),
    }
    await db.payment_transactions.insert_one(tx)

    return {"message": f"Job boosted for {BOOST_DAYS} days", "expires_at": expires_at, "amount_charged": price, "demo_mode": True}


# ─── Emergency Post ───────────────────────────────────────────────────────────

@router.post("/emergency/{job_id}")
async def activate_emergency_post(job_id: str, current_user: dict = Depends(get_current_user)):
    """Activate emergency broadcast flag on a job. DEMO mode."""
    if current_user["role"] != "contractor":
        raise HTTPException(status_code=403, detail="Only contractors can set emergency posts")

    job = await db.jobs.find_one({"id": job_id, "contractor_id": current_user["id"]})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or not owned by you")

    price = await _boost_price("emergency_post_price", 2.99)
    await db.jobs.update_one({"id": job_id}, {"$set": {"is_emergency": True}})

    tx = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "session_id": f"emergency_{uuid.uuid4().hex[:12]}",
        "amount": price,
        "currency": "usd",
        "plan": "emergency_post",
        "payment_method": "demo",
        "payment_status": "paid",
        "job_id": job_id,
        "created_at": _now(),
    }
    await db.payment_transactions.insert_one(tx)

    return {"message": "Emergency post activated", "amount_charged": price, "demo_mode": True}
