"""
Analytics Service
-----------------
Lightweight profile-view counter and read helpers.

Schema addition:
  users.profile_views  (int, default 0)  — incremented each time
  another authenticated user views the profile.

All writes are fire-and-forget ($inc) so they never block a request.
"""

from __future__ import annotations
import logging
from database import db

logger = logging.getLogger(__name__)


async def increment_profile_views(user_id: str, viewer_id: str | None = None) -> None:
    """
    Increment the profile_views counter for `user_id`.
    Silently skipped when `viewer_id == user_id` (own profile).
    """
    if viewer_id and viewer_id == user_id:
        return
    try:
        await db.users.update_one(
            {"id": user_id},
            {"$inc": {"profile_views": 1}},
        )
    except Exception as e:
        logger.warning(f"[analytics] increment_profile_views failed for {user_id}: {e}")


async def get_profile_stats(user_id: str) -> dict:
    """
    Return lightweight analytics for a single user profile.
    Safe to expose to the profile owner.
    """
    user = await db.users.find_one(
        {"id": user_id},
        {"_id": 0, "profile_views": 1, "rating": 1, "rating_count": 1, "jobs_completed": 1},
    )
    if not user:
        return {"profile_views": 0, "rating": 0.0, "rating_count": 0, "jobs_completed": 0}

    return {
        "profile_views":  user.get("profile_views", 0),
        "rating":         user.get("rating", 0.0),
        "rating_count":   user.get("rating_count", 0),
        "jobs_completed": user.get("jobs_completed", 0),
    }


async def get_platform_stats() -> dict:
    """
    Aggregate counts useful for admin analytics.
    Returns cheaply-computed totals from existing fields.
    """
    total_views = 0
    pipeline = [
        {"$group": {"_id": None, "total": {"$sum": "$profile_views"}}},
    ]
    try:
        result = await db.users.aggregate(pipeline).to_list(1)
        total_views = result[0]["total"] if result else 0
    except Exception:
        pass

    most_viewed = await db.users.find(
        {"role": {"$in": ["crew", "contractor"]}, "profile_views": {"$gt": 0}},
        {"_id": 0, "id": 1, "name": 1, "role": 1, "trade": 1, "profile_views": 1},
    ).sort("profile_views", -1).limit(10).to_list(10)

    return {
        "total_profile_views": total_views,
        "most_viewed_profiles": most_viewed,
    }
