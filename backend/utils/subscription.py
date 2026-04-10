"""
Subscription / Freemium Utility
---------------------------------
Single source of truth for plan limits, enforcement, and usage tracking.

FREE plan limits (configurable via settings collection):
  crew        → 3 job responses  / month
  contractor  → 2 job posts      / month

Usage is tracked in the user document:
  usage_month : str  "YYYY-MM"  — resets on new calendar month
  usage_count : int             — actions taken in current month

Upgrade resets usage immediately.
Expired paid plan reverts to free (never to "expired").
"""

from __future__ import annotations
from datetime import datetime, timezone
from fastapi import HTTPException
from database import db

# ─── Default free limits (overridden by settings collection) ─────────────────

DEFAULT_FREE_LIMITS: dict[str, int] = {
    "crew":       3,   # job responses per month
    "contractor": 2,   # job posts per month
}


async def get_free_limits() -> dict[str, int]:
    """Return current limits from settings, falling back to defaults."""
    settings = await db.settings.find_one({}, {"_id": 0,
        "free_crew_responses_per_month": 1,
        "free_contractor_posts_per_month": 1})
    if not settings:
        return dict(DEFAULT_FREE_LIMITS)
    return {
        "crew":       settings.get("free_crew_responses_per_month",  DEFAULT_FREE_LIMITS["crew"]),
        "contractor": settings.get("free_contractor_posts_per_month", DEFAULT_FREE_LIMITS["contractor"]),
    }


# ─── Paid-plan check (auto-reverts to free on expiry) ────────────────────────

async def is_paid_active(user: dict) -> bool:
    """
    Return True if the user has a valid, non-expired paid subscription.
    Side-effect: if the paid subscription has expired, revert status to "free".
    """
    if user.get("subscription_status") != "active":
        return False

    sub_end = user.get("subscription_end")
    if not sub_end:
        return False

    try:
        end = datetime.fromisoformat(sub_end)
        if end < datetime.now(timezone.utc):
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": {"subscription_status": "free", "subscription_plan": None}}
            )
            return False
    except Exception:
        return False

    return True


# ─── Usage tracking ───────────────────────────────────────────────────────────

def _current_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


async def get_usage(user: dict) -> tuple[int, int]:
    """
    Return (used, limit) for the current calendar month.
    Resets the counter in the DB if the stored month is stale.
    """
    limits = await get_free_limits()
    limit = limits.get(user.get("role", "crew"), 3)

    stored_month = user.get("usage_month", "")
    current = _current_month()

    if stored_month != current:
        # New month — reset counter (lazy reset on first access)
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"usage_month": current, "usage_count": 0}}
        )
        return 0, limit

    return user.get("usage_count", 0), limit


async def increment_usage(user_id: str) -> None:
    """Increment monthly usage counter after a billable action."""
    current = _current_month()
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"usage_month": current}, "$inc": {"usage_count": 1}}
    )


async def reset_usage(user_id: str) -> None:
    """Reset usage when user upgrades to a paid plan."""
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"usage_month": _current_month(), "usage_count": 0}}
    )


# ─── Enforcement ─────────────────────────────────────────────────────────────

async def check_and_enforce_limit(user: dict, action: str) -> None:
    """
    Raise HTTP 402 if a free-plan user has hit their monthly limit.
    Call BEFORE executing the billable action.

    action: "post"    → contractor posting a job
            "respond" → crew accepting a job
    """
    if await is_paid_active(user):
        return  # paid plan → unlimited

    used, limit = await get_usage(user)
    role = user.get("role", "")

    if role == "contractor" and action == "post" and used >= limit:
        raise HTTPException(
            status_code=402,
            detail=(
                f"FREE_LIMIT_REACHED: You've used {used}/{limit} free job posts this month. "
                "Upgrade to a paid plan to post unlimited jobs."
            )
        )
    if role == "crew" and action == "respond" and used >= limit:
        raise HTTPException(
            status_code=402,
            detail=(
                f"FREE_LIMIT_REACHED: You've used {used}/{limit} free job responses this month. "
                "Upgrade to a paid plan to respond to unlimited jobs."
            )
        )


# ─── Status summary ────────────────────────────────────────────────────────────

async def get_subscription_summary(user: dict) -> dict:
    """
    Return a complete subscription + usage summary for the current user.
    Used by the subscription status endpoint.
    """
    paid = await is_paid_active(user)
    # Re-fetch user in case is_paid_active just reverted the status
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0,
        "subscription_status": 1, "subscription_plan": 1,
        "subscription_end": 1, "usage_month": 1, "usage_count": 1})
    user = {**user, **(fresh or {})}

    status = user.get("subscription_status", "free")
    plan   = user.get("subscription_plan") or "free"
    sub_end = user.get("subscription_end")

    days_remaining = 0
    if paid and sub_end:
        try:
            end = datetime.fromisoformat(sub_end)
            days_remaining = max(0, (end - datetime.now(timezone.utc)).days)
        except Exception:
            pass

    used, limit = await get_usage(user)

    return {
        "status":         status,
        "plan":           plan,
        "days_remaining": days_remaining,
        "subscription_end": sub_end,
        "usage_used":     used,
        "usage_limit":    limit,
        "usage_remaining": max(0, limit - used),
        "is_paid":        paid,
    }
