"""
RBAC (Role-Based Access Control)
----------------------------------
Roles (in descending privilege order):
  superadmin > admin > subadmin > contractor | crew

Permissions are additive — higher roles inherit lower-role perms.

Usage
-----
# Simple guard in a route
from utils.rbac import require_permission

@router.get("/something")
async def my_endpoint(user = Depends(require_permission("analytics:read"))):
    ...

# Programmatic check (no HTTP raise)
from utils.rbac import can
if can(user["role"], "jobs:delete"):
    ...
"""

from __future__ import annotations
from fastapi import HTTPException, Depends
from auth import get_current_user

# ─── Role hierarchy (higher value = more privilege) ──────────────────────────

ROLE_LEVEL: dict[str, int] = {
    "crew":        10,
    "contractor":  10,
    "subadmin":    20,
    "admin":       30,
    "superadmin":  40,
}

# ─── Permission sets per role ─────────────────────────────────────────────────
# Each set is cumulative: a role also has all perms of lower-level roles
# that are explicitly listed here.

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "crew": {
        "profile:read",
        "profile:write",
        "jobs:read",
        "jobs:apply",
        "subscription:read",
        "subscription:write",
    },
    "contractor": {
        "profile:read",
        "profile:write",
        "jobs:read",
        "jobs:create",
        "jobs:update",
        "jobs:delete",
        "crew:search",
        "subscription:read",
        "subscription:write",
    },
    "subadmin": {
        # Can view — cannot change prices, settings, or manage admins
        "analytics:read",
        "users:read",
        "users:suspend",   # can suspend/activate crew & contractor only
        "jobs:read",
        "jobs:update",
        "activity_log:read",
        "profile:read",
        "profile:write",
        "subscription:read",
    },
    "admin": {
        "analytics:read",
        "analytics:write",
        "users:read",
        "users:write",
        "users:suspend",
        "users:delete",
        "users:reset-password",
        "users:import",
        "users:export",
        "jobs:read",
        "jobs:update",
        "jobs:delete",
        "payments:read",
        "settings:read",
        "settings:write",
        "terms:read",
        "terms:write",
        "activity_log:read",
        "activity_log:export",
        "subadmins:read",
        "subadmins:write",
        "cms:read",
        "cms:write",
        "coupons:read",
        "coupons:write",
        "profile:read",
        "profile:write",
        "subscription:read",
    },
    "superadmin": {
        # All permissions — including admin management
        "analytics:read",
        "analytics:write",
        "users:read",
        "users:write",
        "users:suspend",
        "users:delete",
        "users:reset-password",
        "users:import",
        "users:export",
        "jobs:read",
        "jobs:update",
        "jobs:delete",
        "payments:read",
        "settings:read",
        "settings:write",
        "terms:read",
        "terms:write",
        "activity_log:read",
        "activity_log:export",
        "admins:read",
        "admins:write",
        "admins:delete",
        "subadmins:read",
        "subadmins:write",
        "cms:read",
        "cms:write",
        "coupons:read",
        "coupons:write",
        "profile:read",
        "profile:write",
        "subscription:read",
    },
}


# ─── Public helpers ───────────────────────────────────────────────────────────

def can(role: str, permission: str) -> bool:
    """Return True if `role` has `permission`."""
    return permission in ROLE_PERMISSIONS.get(role, set())


def has_role_level(role: str, minimum_role: str) -> bool:
    """Return True if `role` is at or above `minimum_role` in hierarchy."""
    return ROLE_LEVEL.get(role, 0) >= ROLE_LEVEL.get(minimum_role, 0)


def get_permissions(role: str) -> list[str]:
    """Return sorted permission list for a role."""
    return sorted(ROLE_PERMISSIONS.get(role, set()))


# ─── FastAPI dependency ───────────────────────────────────────────────────────

def require_permission(permission: str):
    """
    FastAPI dependency factory.

    Usage:
        @router.get("/x")
        async def x(user = Depends(require_permission("analytics:read"))):
    """
    async def _checker(current_user: dict = Depends(get_current_user)):
        if not can(current_user["role"], permission):
            raise HTTPException(
                status_code=403,
                detail=f"Permission '{permission}' required (your role: {current_user['role']})",
            )
        return current_user

    return _checker


def require_min_role(minimum_role: str):
    """
    FastAPI dependency: user must be at or above `minimum_role` in hierarchy.
    """
    async def _checker(current_user: dict = Depends(get_current_user)):
        if not has_role_level(current_user["role"], minimum_role):
            raise HTTPException(
                status_code=403,
                detail=f"Role '{minimum_role}' or higher required",
            )
        return current_user

    return _checker
