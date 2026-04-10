import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, EmailStr


def utc_now_str() -> str:
    return datetime.now(timezone.utc).isoformat()


def trial_end_str(days: int = 30) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


# ─── Auth Models ─────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    role: str  # crew, contractor, admin
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    trade: Optional[str] = None
    bio: Optional[str] = None
    referral_code_used: Optional[str] = None
    company_name: Optional[str] = None
    captcha_token: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str
    captcha_token: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict


# ─── User Models ─────────────────────────────────────────────────────────────

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    bio: Optional[str] = None
    trade: Optional[str] = None
    skills: Optional[List[str]] = None
    availability: Optional[bool] = None
    is_online: Optional[bool] = None
    location: Optional[Dict] = None
    address: Optional[str] = None
    company_name: Optional[str] = None
    hide_location: Optional[bool] = None
    email: Optional[str] = None


class OnlineStatusUpdate(BaseModel):
    is_online: bool


class LocationUpdate(BaseModel):
    lat: float
    lng: float
    city: Optional[str] = None


# ─── Job Models ──────────────────────────────────────────────────────────────

class JobCreate(BaseModel):
    title: str
    description: str
    trade: str
    crew_needed: int
    start_time: str
    pay_rate: float
    address: str
    is_emergency: bool = False
    is_boosted: bool = False


class JobUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    trade: Optional[str] = None
    crew_needed: Optional[int] = None
    start_time: Optional[str] = None
    pay_rate: Optional[float] = None
    address: Optional[str] = None
    is_emergency: Optional[bool] = None
    is_boosted: Optional[bool] = None


# ─── Rating Models ───────────────────────────────────────────────────────────

class RatingCreate(BaseModel):
    rated_id: str
    job_id: str
    stars: int  # 1-5
    review: Optional[str] = None


# ─── Payment Models ──────────────────────────────────────────────────────────

class CheckoutRequest(BaseModel):
    plan: str  # daily, weekly, monthly, annual
    payment_method: str  # stripe, paypal, square, demo
    origin_url: str
    coupon_code: Optional[str] = None


class PayPalCaptureRequest(BaseModel):
    order_id: str
    plan: str
    user_id: str


# ─── Admin Models ────────────────────────────────────────────────────────────

class AdminUserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None
    role: Optional[str] = None
    points: Optional[int] = None
    subscription_status: Optional[str] = None


class TermsUpdate(BaseModel):
    content: str


class TradeCategory(BaseModel):
    name: str
    is_active: Optional[bool] = True

class TradeCategoryUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None

class TradeCreate(BaseModel):
    name: str
    category_id: str
    is_active: Optional[bool] = True

class TradeUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None

class SettingsUpdate(BaseModel):
    daily_price: Optional[float] = None
    weekly_price: Optional[float] = None
    monthly_price: Optional[float] = None
    annual_price: Optional[float] = None
    job_visibility_hours: Optional[int] = None
    free_crew_responses_per_month: Optional[int] = None
    free_contractor_posts_per_month: Optional[int] = None
    social_linkedin_enabled: Optional[bool] = None
    social_twitter_enabled: Optional[bool] = None
    social_facebook_enabled: Optional[bool] = None
    social_native_share_enabled: Optional[bool] = None
    show_verification_sidebar: Optional[bool] = None
    profile_boost_price: Optional[float] = None
    job_boost_price: Optional[float] = None
    emergency_post_price: Optional[float] = None
    accent_color: Optional[str] = None
    brand_color: Optional[str] = None
    nav_bg_color: Optional[str] = None


class CouponCreate(BaseModel):
    code: str
    type: str                            # "percent" | "fixed"
    value: float                         # percent (1-100) or fixed dollar amount
    max_uses: Optional[int] = None       # None = unlimited
    expires_at: Optional[str] = None     # ISO datetime string
    plan_restriction: Optional[str] = None  # None = any plan


class PasswordResetAdmin(BaseModel):
    new_password: str


class CMSPageUpdate(BaseModel):
    title: Optional[str] = None
    header_text: Optional[str] = None
    content: Optional[str] = None
    youtube_url: Optional[str] = None


# ─── Crew Request Models ─────────────────────────────────────────────────────

class CrewRequest(BaseModel):
    crew_id: str
    message: Optional[str] = None
    job_context: Optional[Dict] = None  # Optional job details to pre-fill


# ─── Referral / Points ───────────────────────────────────────────────────────

class RedeemPoints(BaseModel):
    points: int  # points to redeem for subscription days
