"""
Coupon Routes – /api/coupons/
─────────────────────────────
Admin: POST   /api/coupons              – create coupon
       GET    /api/coupons              – list coupons
       PATCH  /api/coupons/{id}/toggle  – enable / disable
       DELETE /api/coupons/{id}         – delete

User:  POST   /api/coupons/validate     – validate code + get discount info
"""
import uuid
from fastapi import APIRouter, HTTPException, Depends
from database import db
from models import CouponCreate
from utils.rbac import require_permission
from auth import get_current_user
from datetime import datetime, timezone

router = APIRouter()


def _now():
    return datetime.now(timezone.utc).isoformat()


# ─── Admin endpoints ──────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_coupon(data: CouponCreate, _: dict = Depends(require_permission("coupons:write"))):
    code = data.code.upper().strip()
    if await db.coupons.find_one({"code": code}):
        raise HTTPException(status_code=400, detail="Coupon code already exists")
    if data.type not in ("percent", "fixed"):
        raise HTTPException(status_code=400, detail="type must be 'percent' or 'fixed'")
    if data.type == "percent" and not (0 < data.value <= 100):
        raise HTTPException(status_code=400, detail="Percent value must be between 1 and 100")

    doc = {
        "id": str(uuid.uuid4()),
        "code": code,
        "type": data.type,
        "value": data.value,
        "max_uses": data.max_uses,
        "used_count": 0,
        "expires_at": data.expires_at,
        "plan_restriction": data.plan_restriction,
        "is_active": True,
        "created_at": _now(),
    }
    await db.coupons.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.get("")
async def list_coupons(_: dict = Depends(require_permission("coupons:read"))):
    return await db.coupons.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)


@router.patch("/{coupon_id}")
async def update_coupon(coupon_id: str, data: dict, _: dict = Depends(require_permission("coupons:write"))):
    coupon = await db.coupons.find_one({"id": coupon_id})
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found")
    allowed = {"code", "type", "value", "max_uses", "expires_at", "plan_restriction"}
    update = {k: v for k, v in data.items() if k in allowed}
    if "code" in update:
        update["code"] = update["code"].upper().strip()
        existing = await db.coupons.find_one({"code": update["code"], "id": {"$ne": coupon_id}})
        if existing:
            raise HTTPException(status_code=400, detail="Coupon code already exists")
    if "value" in update:
        update["value"] = float(update["value"])
    if "max_uses" in update and update["max_uses"] is not None:
        update["max_uses"] = int(update["max_uses"])
    if not update:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    await db.coupons.update_one({"id": coupon_id}, {"$set": update})
    updated = await db.coupons.find_one({"id": coupon_id}, {"_id": 0})
    return updated


@router.patch("/{coupon_id}/toggle")
async def toggle_coupon(coupon_id: str, _: dict = Depends(require_permission("coupons:write"))):
    coupon = await db.coupons.find_one({"id": coupon_id})
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found")
    new_state = not coupon["is_active"]
    await db.coupons.update_one({"id": coupon_id}, {"$set": {"is_active": new_state}})
    return {"is_active": new_state}


@router.delete("/{coupon_id}")
async def delete_coupon(coupon_id: str, _: dict = Depends(require_permission("coupons:write"))):
    result = await db.coupons.delete_one({"id": coupon_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Coupon not found")
    return {"message": "Coupon deleted"}


# ─── User endpoint ────────────────────────────────────────────────────────────

@router.post("/validate")
async def validate_coupon(data: dict, _: dict = Depends(get_current_user)):
    """Validate a coupon code and return discount details before checkout."""
    from routes.payment_routes import PLANS

    code = (data.get("code") or "").upper().strip()
    plan = data.get("plan", "")

    coupon = await db.coupons.find_one({"code": code})
    if not coupon or not coupon.get("is_active"):
        raise HTTPException(status_code=404, detail="Invalid or inactive coupon code")

    if coupon.get("expires_at"):
        try:
            exp = datetime.fromisoformat(coupon["expires_at"].replace("Z", "+00:00"))
            if exp < datetime.now(timezone.utc):
                raise HTTPException(status_code=400, detail="Coupon has expired")
        except ValueError:
            pass

    if coupon.get("max_uses") and coupon.get("used_count", 0) >= coupon["max_uses"]:
        raise HTTPException(status_code=400, detail="Coupon has reached its maximum usage limit")

    if coupon.get("plan_restriction") and coupon["plan_restriction"] != plan:
        raise HTTPException(
            status_code=400,
            detail=f"Coupon is only valid for '{coupon['plan_restriction']}' plan"
        )

    # Calculate discounted amount
    settings = await db.settings.find_one({}, {"_id": 0})
    plan_info = PLANS.get(plan, {})
    base_amount = float(plan_info.get("amount", 0))
    if settings:
        base_amount = float(settings.get(f"{plan}_price", base_amount))

    if coupon["type"] == "percent":
        discount = round(base_amount * coupon["value"] / 100, 2)
    else:
        discount = min(float(coupon["value"]), base_amount)

    return {
        "valid": True,
        "code": code,
        "type": coupon["type"],
        "value": coupon["value"],
        "discount_amount": discount,
        "original_amount": base_amount,
        "final_amount": max(0.0, round(base_amount - discount, 2)),
        "plan": plan,
    }
