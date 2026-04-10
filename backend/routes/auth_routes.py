import uuid
import random
import string
import secrets
import os
import httpx
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, status, Depends
from database import db
from models import UserCreate, UserLogin
from auth import hash_password, verify_password, create_token, user_to_response, get_current_user
from utils.email_utils import send_welcome_email
from utils.activity_log import log_activity

router = APIRouter()

RECAPTCHA_SECRET = os.environ.get("RECAPTCHA_SECRET_KEY", "")


async def verify_captcha(token: str | None):
    """Verify reCAPTCHA token with Google. Skip if no secret configured."""
    if not RECAPTCHA_SECRET or not token:
        return  # skip verification if not configured
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://www.google.com/recaptcha/api/siteverify",
            data={"secret": RECAPTCHA_SECRET, "response": token},
        )
        result = resp.json()
        if not result.get("success"):
            raise HTTPException(status_code=400, detail="CAPTCHA verification failed")


def generate_referral_code(length: int = 8) -> str:
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))


@router.post("/register", status_code=201)
async def register(data: UserCreate):
    await verify_captcha(data.captcha_token)
    existing = await db.users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    if data.role not in ("crew", "contractor"):
        raise HTTPException(status_code=400, detail="Role must be crew or contractor")

    code = generate_referral_code()
    while await db.users.find_one({"referral_code": code}):
        code = generate_referral_code()

    now = datetime.now(timezone.utc).isoformat()

    user_doc = {
        "id": str(uuid.uuid4()),
        "email": data.email.lower(),
        "password_hash": hash_password(data.password),
        "role": data.role,
        "name": data.name,
        "phone": data.phone,
        "is_active": True,
        "is_verified": False,
        "created_at": now,
        "subscription_status": "free",
        "subscription_plan": None,
        "subscription_end": None,
        "usage_month": datetime.now(timezone.utc).strftime("%Y-%m"),
        "usage_count": 0,
        "points": 50,
        "referral_code": code,
        "referred_by": None,
        "bio": data.bio or "",
        "trade": data.trade or "",
        "address": data.address or "",
        "skills": [],
        "profile_photo": None,
        "availability": True,
        "is_online": False,
        "location": None,
        "rating": 0.0,
        "rating_count": 0,
        "jobs_completed": 0,
        "company_name": data.company_name or "",
        "logo": None,
        "hide_location": False,
        "favorite_crew": [],
    }

    if data.referral_code_used:
        referrer = await db.users.find_one({"referral_code": data.referral_code_used})
        if referrer:
            user_doc["referred_by"] = referrer["id"]
            await db.users.update_one(
                {"id": referrer["id"]},
                {"$inc": {"points": 100}}
            )
            await db.referrals.insert_one({
                "id": str(uuid.uuid4()),
                "referrer_id": referrer["id"],
                "referred_id": user_doc["id"],
                "points_awarded": 100,
                "created_at": now
            })

    await db.users.insert_one(user_doc)
    token = create_token({"sub": user_doc["id"], "role": user_doc["role"]})
    await send_welcome_email(data.name, data.email, data.role)
    await log_activity(actor=user_to_response(user_doc), action="auth.register", category="auth",
                       details={"role": data.role, "email": data.email})
    return {"access_token": token, "token_type": "bearer", "user": user_to_response(user_doc)}


@router.post("/login")
async def login(data: UserLogin):
    await verify_captcha(data.captcha_token)
    user = await db.users.find_one({"email": data.email.lower()}, {"_id": 0})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account suspended")

    token = create_token({"sub": user["id"], "role": user["role"]})
    await log_activity(actor=user_to_response(user), action="auth.login", category="auth",
                       details={"email": data.email.lower()})
    return {"access_token": token, "token_type": "bearer", "user": user_to_response(user)}


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return user_to_response(current_user)


# ─── Forgot / Reset Password ──────────────────────────────────────────────────

@router.post("/forgot-password")
async def forgot_password(data: dict):
    """Request a password reset. In demo mode the token is returned in the response."""
    email = (data.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    user = await db.users.find_one({"email": email})
    # Don't reveal whether the email exists
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()

    if user:
        await db.password_resets.delete_many({"user_id": user["id"]})
        await db.password_resets.insert_one({
            "token": token,
            "user_id": user["id"],
            "email": email,
            "expires_at": expires_at,
            "used": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        # Production: send email here. Demo mode: token returned below.
        await log_activity(
            actor={"id": user["id"], "name": user.get("name", ""), "role": user.get("role", "")},
            action="auth.forgot_password", category="auth",
            details={"email": email}
        )
        return {
            "message": "If this email is registered, a reset link has been sent.",
            "demo_token": token,
            "reset_url": f"/auth?mode=reset&token={token}",
        }

    return {"message": "If this email is registered, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(data: dict):
    """Set a new password using the token from forgot-password."""
    token = (data.get("token") or "").strip()
    new_password = data.get("new_password", "")

    if not token or not new_password:
        raise HTTPException(status_code=400, detail="Token and new_password are required")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    reset = await db.password_resets.find_one({"token": token, "used": False})
    if not reset:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    try:
        exp = datetime.fromisoformat(reset["expires_at"].replace("Z", "+00:00"))
        if exp < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Reset token has expired. Please request a new one.")
    except ValueError:
        pass

    await db.users.update_one(
        {"id": reset["user_id"]},
        {"$set": {"password_hash": hash_password(new_password)}}
    )
    await db.password_resets.update_one({"token": token}, {"$set": {"used": True}})

    await log_activity(
        actor={"id": reset["user_id"], "name": "", "role": ""},
        action="auth.password_reset", category="auth",
        details={"email": reset.get("email")}
    )
    return {"message": "Password reset successfully. You can now log in."}
