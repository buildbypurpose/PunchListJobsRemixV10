from fastapi import APIRouter, HTTPException, Depends, Query
from database import db
from auth import get_current_user
from models import TradeCategory, TradeCategoryUpdate, TradeCreate, TradeUpdate
from datetime import datetime, timezone
from typing import Optional
import uuid

router = APIRouter()


async def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


# ─── Public ──────────────────────────────────────────────────────────────────

@router.get("")
async def get_trades_tree(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = None,
):
    """Public: returns [{id, name, trades:[{id, name}]}] for active categories/trades."""
    cat_query = {"is_active": True}
    if search:
        cat_query["name"] = {"$regex": search, "$options": "i"}

    total_cats = await db.trade_categories.count_documents(cat_query)
    skip = (page - 1) * limit
    cats = await db.trade_categories.find(
        cat_query, {"_id": 0}
    ).sort("name", 1).skip(skip).limit(limit).to_list(limit)

    result = []
    for cat in cats:
        trades = await db.trades.find(
            {"category_id": cat["id"], "is_active": True},
            {"_id": 0}
        ).sort("name", 1).to_list(100)
        result.append({**cat, "trades": trades})
    return {"categories": result, "total": total_cats, "page": page, "limit": limit}


# ─── Admin: Categories ────────────────────────────────────────────────────────

@router.get("/admin/categories")
async def list_categories(admin: dict = Depends(require_admin)):
    cats = await db.trade_categories.find({}, {"_id": 0}).sort("name", 1).to_list(200)
    for cat in cats:
        cat["trade_count"] = await db.trades.count_documents({"category_id": cat["id"]})
    return {"categories": cats}


@router.post("/admin/categories", status_code=201)
async def create_category(data: TradeCategory, admin: dict = Depends(require_admin)):
    existing = await db.trade_categories.find_one({"name": {"$regex": f"^{data.name}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    doc = {
        "id": str(uuid.uuid4()),
        "name": data.name.strip(),
        "slug": data.name.strip().lower().replace(" ", "-"),
        "is_active": data.is_active,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.trade_categories.insert_one(doc)
    doc.pop("_id", None)
    return {"message": "Category created", "category": doc}


@router.put("/admin/categories/{cat_id}")
async def update_category(cat_id: str, data: TradeCategoryUpdate, admin: dict = Depends(require_admin)):
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if "name" in update:
        update["slug"] = update["name"].strip().lower().replace(" ", "-")
        # propagate name to all trades in this category
        await db.trades.update_many({"category_id": cat_id}, {"$set": {"category_name": update["name"]}})
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    result = await db.trade_categories.update_one({"id": cat_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category updated"}


@router.delete("/admin/categories/{cat_id}")
async def delete_category(cat_id: str, admin: dict = Depends(require_admin)):
    trade_count = await db.trades.count_documents({"category_id": cat_id})
    if trade_count > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete: category has {trade_count} trade(s). Delete trades first or suspend the category.")
    result = await db.trade_categories.delete_one({"id": cat_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deleted"}


@router.post("/admin/categories/{cat_id}/suspend")
async def suspend_category(cat_id: str, admin: dict = Depends(require_admin)):
    result = await db.trade_categories.update_one({"id": cat_id}, {"$set": {"is_active": False}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category suspended"}


@router.post("/admin/categories/{cat_id}/activate")
async def activate_category(cat_id: str, admin: dict = Depends(require_admin)):
    result = await db.trade_categories.update_one({"id": cat_id}, {"$set": {"is_active": True}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category activated"}


# ─── Admin: Trades ────────────────────────────────────────────────────────────

@router.get("/admin/trades")
async def list_all_trades(
    category_id: str = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    admin: dict = Depends(require_admin),
):
    query = {"category_id": category_id} if category_id else {}
    total = await db.trades.count_documents(query)
    skip = (page - 1) * limit
    trades = await db.trades.find(query, {"_id": 0}).sort("name", 1).skip(skip).limit(limit).to_list(limit)
    return {"trades": trades, "total": total, "page": page, "limit": limit}


@router.post("/admin/trades", status_code=201)
async def create_trade(data: TradeCreate, admin: dict = Depends(require_admin)):
    cat = await db.trade_categories.find_one({"id": data.category_id}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    existing = await db.trades.find_one({
        "category_id": data.category_id,
        "name": {"$regex": f"^{data.name}$", "$options": "i"}
    })
    if existing:
        raise HTTPException(status_code=400, detail="Trade already exists in this category")
    doc = {
        "id": str(uuid.uuid4()),
        "name": data.name.strip(),
        "category_id": data.category_id,
        "category_name": cat["name"],
        "is_active": data.is_active,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.trades.insert_one(doc)
    doc.pop("_id", None)
    return {"message": "Trade created", "trade": doc}


@router.put("/admin/trades/{trade_id}")
async def update_trade(trade_id: str, data: TradeUpdate, admin: dict = Depends(require_admin)):
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    result = await db.trades.update_one({"id": trade_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Trade not found")
    return {"message": "Trade updated"}


@router.delete("/admin/trades/{trade_id}")
async def delete_trade(trade_id: str, admin: dict = Depends(require_admin)):
    result = await db.trades.delete_one({"id": trade_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Trade not found")
    return {"message": "Trade deleted"}


@router.post("/admin/trades/{trade_id}/suspend")
async def suspend_trade(trade_id: str, admin: dict = Depends(require_admin)):
    result = await db.trades.update_one({"id": trade_id}, {"$set": {"is_active": False}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Trade not found")
    return {"message": "Trade suspended"}


@router.post("/admin/trades/{trade_id}/activate")
async def activate_trade(trade_id: str, admin: dict = Depends(require_admin)):
    result = await db.trades.update_one({"id": trade_id}, {"$set": {"is_active": True}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Trade not found")
    return {"message": "Trade activated"}
