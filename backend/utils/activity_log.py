"""
Activity Log Service
--------------------
Structured audit trail for all meaningful platform events.

MongoDB collection: activity_logs

Document shape:
  {
      "id":           str (uuid4),
      "actor_id":     str | None,
      "actor_name":   str | None,
      "actor_role":   str | None,
      "action":       str,          # e.g. "user.login", "job.created"
      "category":     str,          # auth | job | admin | payment | user
      "target_id":    str | None,   # the affected resource id
      "target_type":  str | None,   # e.g. "user", "job", "payment"
      "details":      dict | None,  # arbitrary extra context
      "ip":           str | None,
      "created_at":   str (ISO-8601 UTC)
  }

Usage
-----
from utils.activity_log import log_activity

# In a route handler:
await log_activity(
    actor=current_user,          # the dict from get_current_user()
    action="job.created",
    category="job",
    target_id=job_id,
    target_type="job",
    details={"title": job.title},
    request=request,             # FastAPI Request (optional, for IP)
)

# Auth events (no authenticated user yet):
await log_activity(
    actor=None,
    action="auth.login.success",
    category="auth",
    details={"email": email},
    request=request,
)
"""

from __future__ import annotations
import uuid
import logging
from datetime import datetime, timezone
from typing import Any

from database import db

logger = logging.getLogger(__name__)

# ─── Categories (used for filtering) ─────────────────────────────────────────

CATEGORIES = {"auth", "job", "admin", "payment", "user"}


# ─── Core write function ──────────────────────────────────────────────────────

async def log_activity(
    *,
    actor: dict | None,
    action: str,
    category: str,
    target_id: str | None = None,
    target_type: str | None = None,
    details: dict | None = None,
    request: Any = None,        # FastAPI Request – used to read client IP
) -> None:
    """
    Persist one activity log entry.  Never raises — failures are logged only.
    """
    try:
        ip = None
        if request is not None:
            # FastAPI: request.client.host (plain TCP) or X-Forwarded-For (proxy)
            fwd = getattr(request.headers, "get", lambda k, d=None: d)("x-forwarded-for")
            ip = fwd.split(",")[0].strip() if fwd else getattr(getattr(request, "client", None), "host", None)

        doc = {
            "id":          str(uuid.uuid4()),
            "actor_id":    actor["id"]   if actor else None,
            "actor_name":  actor["name"] if actor else None,
            "actor_role":  actor["role"] if actor else None,
            "action":      action,
            "category":    category if category in CATEGORIES else "user",
            "target_id":   target_id,
            "target_type": target_type,
            "details":     details or {},
            "ip":          ip,
            "created_at":  datetime.now(timezone.utc).isoformat(),
        }
        await db.activity_logs.insert_one(doc)
    except Exception as e:
        logger.warning(f"[activity_log] Failed to write log for action='{action}': {e}")


# ─── Read helpers ─────────────────────────────────────────────────────────────

async def get_logs(
    *,
    category:   str | None = None,
    actor_id:   str | None = None,
    target_id:  str | None = None,
    action:     str | None = None,
    page:       int = 1,
    limit:      int = 50,
) -> dict:
    """Paginated query over activity_logs."""
    query: dict = {}
    if category:
        query["category"] = category
    if actor_id:
        query["actor_id"] = actor_id
    if target_id:
        query["target_id"] = target_id
    if action:
        query["action"] = {"$regex": action, "$options": "i"}

    skip = (page - 1) * limit
    logs = await db.activity_logs.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.activity_logs.count_documents(query)

    return {
        "logs":  logs,
        "total": total,
        "page":  page,
        "pages": (total + limit - 1) // limit,
    }


async def get_logs_for_export(
    *,
    category: str | None = None,
    limit: int = 5000,
) -> list[dict]:
    """Fetch up to `limit` logs for CSV export (most recent first)."""
    query: dict = {}
    if category:
        query["category"] = category

    return await db.activity_logs.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
