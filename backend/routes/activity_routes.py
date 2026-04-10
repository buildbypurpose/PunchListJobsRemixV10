"""
Activity Log Routes  –  /api/admin/activity-logs/*
---------------------------------------------------
Query, filter, and export the activity_logs collection.

Access:
  GET  /api/admin/activity-logs        → admin / superadmin / subadmin
  GET  /api/admin/activity-logs/export → admin / superadmin only (CSV)

Analytics endpoint:
  GET  /api/admin/analytics/profile-stats  → admin / superadmin
"""

import csv
import io
from fastapi import APIRouter, Query, Depends
from fastapi.responses import StreamingResponse
from auth import get_current_user
from utils.rbac import require_permission
from utils.activity_log import get_logs, get_logs_for_export, CATEGORIES
from utils.analytics_service import get_platform_stats
from typing import Optional

router = APIRouter()


@router.get("/activity-logs")
async def list_activity_logs(
    category:  Optional[str] = Query(None, description=f"One of: {', '.join(sorted(CATEGORIES))}"),
    actor_id:  Optional[str] = Query(None),
    target_id: Optional[str] = Query(None),
    action:    Optional[str] = Query(None, description="Partial match on action string"),
    page:      int = Query(1, ge=1),
    limit:     int = Query(50, ge=1, le=200),
    _:  dict = Depends(require_permission("activity_log:read")),
):
    """
    Paginated activity log viewer.
    Accessible to: superadmin, admin, subadmin.
    """
    return await get_logs(
        category=category,
        actor_id=actor_id,
        target_id=target_id,
        action=action,
        page=page,
        limit=limit,
    )


@router.get("/activity-logs/export")
async def export_activity_logs(
    category: Optional[str] = Query(None),
    limit:    int = Query(5000, ge=1, le=10000),
    _: dict = Depends(require_permission("activity_log:export")),
):
    """
    Download activity logs as a UTF-8 CSV file.
    Accessible to: superadmin, admin only.
    """
    logs = await get_logs_for_export(category=category, limit=limit)

    # Build CSV in memory
    output = io.StringIO()
    fieldnames = [
        "id", "created_at", "category", "action",
        "actor_id", "actor_name", "actor_role",
        "target_id", "target_type", "ip", "details",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    for log in logs:
        row = dict(log)
        # Flatten details dict to a readable string
        row["details"] = "; ".join(f"{k}={v}" for k, v in (log.get("details") or {}).items())
        writer.writerow(row)

    output.seek(0)
    filename = f"activity_logs{'_' + category if category else ''}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/analytics/profile-stats")
async def admin_profile_stats(
    _: dict = Depends(require_permission("analytics:read")),
):
    """
    Platform-wide profile view analytics.
    Returns total views and top-10 most-viewed profiles.
    """
    return await get_platform_stats()
