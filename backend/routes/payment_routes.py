"""
Payment routes — Square integration for subscriptions.
"""
from fastapi import APIRouter, HTTPException, Depends
from database import db
from auth import get_current_user
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from typing import Optional
import uuid
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# ─── Square SDK ────────────────────────────────────────────────────────────────
from square import Square
from square.environment import SquareEnvironment

SQUARE_ACCESS_TOKEN = os.environ.get("SQUARE_ACCESS_TOKEN", "")
SQUARE_LOCATION_ID = os.environ.get("SQUARE_LOCATION_ID", "")
SQUARE_APP_ID = os.environ.get("SQUARE_APPLICATION_ID", "")

square_client = Square(
    token=SQUARE_ACCESS_TOKEN,
    environment=SquareEnvironment.PRODUCTION,
)

# ─── Plan Pricing (cents) ──────────────────────────────────────────────────────
PLANS = {
    "daily":   {"amount": 500,   "days": 1,   "label": "Daily ($5)"},
    "weekly":  {"amount": 2500,  "days": 7,   "label": "Weekly ($25)"},
    "monthly": {"amount": 7500,  "days": 30,  "label": "Monthly ($75)"},
    "annual":  {"amount": 50000, "days": 365, "label": "Annual ($500)"},
}


class SquarePaymentRequest(BaseModel):
    source_id: str          # nonce from Square Web Payments SDK
    plan: str               # daily, weekly, monthly, annual
    verification_token: Optional[str] = None


class CashAppPaymentRequest(BaseModel):
    plan: str


class PayPalPaymentRequest(BaseModel):
    plan: str
    order_id: str  # PayPal order ID from client-side approval


# ─── Helpers ───────────────────────────────────────────────────────────────────

async def activate_subscription(user_id: str, plan: str, tx_id: str, method: str):
    """Activate a subscription for user."""
    plan_info = PLANS[plan]
    now = datetime.now(timezone.utc)
    end = now + timedelta(days=plan_info["days"])

    await db.users.update_one({"id": user_id}, {"$set": {
        "subscription_status": "active",
        "subscription_plan": plan,
        "subscription_start": now.isoformat(),
        "subscription_end": end.isoformat(),
    }})

    await db.payment_transactions.insert_one({
        "id": tx_id,
        "user_id": user_id,
        "amount": plan_info["amount"] / 100,
        "currency": "USD",
        "plan": plan,
        "payment_method": method,
        "status": "completed",
        "created_at": now.isoformat(),
    })


# ─── GET /subscription/status ─────────────────────────────────────────────────

@router.get("/subscription/status")
async def subscription_status(current_user: dict = Depends(get_current_user)):
    sub = current_user.get("subscription_status", "free")
    plan = current_user.get("subscription_plan")
    end = current_user.get("subscription_end")
    paid = sub == "active"

    # Auto-expire
    if paid and end:
        try:
            end_dt = datetime.fromisoformat(end) if isinstance(end, str) else end
            if datetime.now(timezone.utc) > end_dt:
                await db.users.update_one(
                    {"id": current_user["id"]},
                    {"$set": {"subscription_status": "expired"}}
                )
                sub = "expired"
                paid = False
        except Exception:
            pass

    return {
        "status": sub,
        "plan": plan,
        "end_date": end,
        "is_paid": paid,
    }


# ─── GET /plans ────────────────────────────────────────────────────────────────

@router.get("/plans")
async def list_plans():
    return [
        {"id": k, "label": v["label"], "amount": v["amount"] / 100, "days": v["days"]}
        for k, v in PLANS.items()
    ]


# ─── POST /square/pay — Process Square card payment ──────────────────────────

@router.post("/square/pay")
async def square_pay(req: SquarePaymentRequest, current_user: dict = Depends(get_current_user)):
    if req.plan not in PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")

    plan_info = PLANS[req.plan]
    idempotency_key = str(uuid.uuid4())

    body = {
        "source_id": req.source_id,
        "idempotency_key": idempotency_key,
        "amount_money": {
            "amount": plan_info["amount"],
            "currency": "USD",
        },
        "location_id": SQUARE_LOCATION_ID,
        "note": f"PunchListJobs subscription: {plan_info['label']}",
        "buyer_email_address": current_user.get("email"),
    }
    if req.verification_token:
        body["verification_token"] = req.verification_token

    try:
        result = square_client.payments.create(
            body=body
        )
    except Exception as e:
        logger.error(f"Square payment error: {e}")
        raise HTTPException(status_code=502, detail="Payment processing failed")

    payment = result.payment
    if not payment:
        detail = "Payment declined"
        if hasattr(result, 'errors') and result.errors:
            detail = result.errors[0].detail or detail
        raise HTTPException(status_code=400, detail=detail)

    tx_id = payment.id or str(uuid.uuid4())

    await activate_subscription(current_user["id"], req.plan, tx_id, "square")

    return {
        "message": "Payment successful",
        "transaction_id": tx_id,
        "plan": req.plan,
        "status": "active",
    }


# ─── POST /cashapp/pay — CashApp (manual / pending) ─────────────────────────

@router.post("/cashapp/pay")
async def cashapp_pay(req: CashAppPaymentRequest, current_user: dict = Depends(get_current_user)):
    if req.plan not in PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")

    plan_info = PLANS[req.plan]
    tx_id = str(uuid.uuid4())

    await db.payment_transactions.insert_one({
        "id": tx_id,
        "user_id": current_user["id"],
        "amount": plan_info["amount"] / 100,
        "currency": "USD",
        "plan": req.plan,
        "payment_method": "cashapp",
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    return {
        "message": "CashApp payment submitted. Admin will verify and activate your subscription.",
        "transaction_id": tx_id,
        "plan": req.plan,
        "status": "pending",
    }


# ─── POST /paypal/pay — PayPal (client-side approval) ───────────────────────

@router.post("/paypal/pay")
async def paypal_pay(req: PayPalPaymentRequest, current_user: dict = Depends(get_current_user)):
    if req.plan not in PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")
    if not req.order_id:
        raise HTTPException(status_code=400, detail="PayPal order ID is required")

    plan_info = PLANS[req.plan]
    tx_id = req.order_id

    await activate_subscription(current_user["id"], req.plan, tx_id, "paypal")

    return {
        "message": "PayPal payment successful!",
        "transaction_id": tx_id,
        "plan": req.plan,
        "status": "active",
    }


# ─── POST /points/redeem — Redeem points for subscription ────────────────────

@router.post("/points/redeem")
async def redeem_points(current_user: dict = Depends(get_current_user)):
    POINTS_FOR_DAY = 500
    pts = current_user.get("points", 0)
    if pts < POINTS_FOR_DAY:
        raise HTTPException(status_code=400, detail=f"Need {POINTS_FOR_DAY} points. You have {pts}.")

    await db.users.update_one(
        {"id": current_user["id"]},
        {"$inc": {"points": -POINTS_FOR_DAY}}
    )

    tx_id = str(uuid.uuid4())
    await activate_subscription(current_user["id"], "daily", tx_id, "points")

    return {
        "message": "Redeemed 500 points for 1 day subscription!",
        "transaction_id": tx_id,
        "remaining_points": pts - POINTS_FOR_DAY,
    }


# ─── GET /transactions — User's transaction history ──────────────────────────

@router.get("/transactions")
async def get_transactions(current_user: dict = Depends(get_current_user)):
    txs = await db.payment_transactions.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return txs


# ─── GET /history — Transactions + period totals ──────────────────────────────

@router.get("/history")
async def payment_history(current_user: dict = Depends(get_current_user)):
    txs = await db.payment_transactions.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)

    now = datetime.now(timezone.utc)
    day_start  = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = day_start - timedelta(days=now.weekday())
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    year_start  = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

    def _total(start):
        return round(sum(
            tx["amount"] for tx in txs
            if tx.get("status") == "completed" and
               datetime.fromisoformat(tx["created_at"].replace("Z","")) >= start
        ), 2)

    return {
        "transactions": txs,
        "totals": {
            "daily":   _total(day_start),
            "weekly":  _total(week_start),
            "monthly": _total(month_start),
            "yearly":  _total(year_start),
            "all_time": round(sum(tx["amount"] for tx in txs if tx.get("status") == "completed"), 2),
        },
    }
