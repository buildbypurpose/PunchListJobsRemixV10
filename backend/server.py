from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
import uuid
from auth import hash_password
from database import db, client
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from datetime import datetime, timezone, timedelta
import random
import string

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

app = FastAPI(title="PunchListJobs API", version="1.0.0", redirect_slashes=False)
api_router = APIRouter(prefix="/api")

from routes.auth_routes import router as auth_router
from routes.job_routes import router as job_router
from routes.user_routes import router as user_router
from routes.admin_routes import router as admin_router
from routes.payment_routes import router as payment_router
from routes.ws_routes import router as ws_router
from routes.address_routes import router as address_router
from routes.activity_routes import router as activity_router
from routes.cms_routes import router as cms_router
from routes.coupon_routes import router as coupon_router
from routes.boost_routes import router as boost_router
from routes.trades_routes import router as trades_router

api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(job_router, prefix="/jobs", tags=["jobs"])
api_router.include_router(user_router, prefix="/users", tags=["users"])
api_router.include_router(admin_router, prefix="/admin", tags=["admin"])
api_router.include_router(payment_router, prefix="/payments", tags=["payments"])
api_router.include_router(ws_router)
api_router.include_router(address_router, prefix="/utils/address", tags=["address"])
api_router.include_router(activity_router, prefix="/admin", tags=["activity_logs"])
api_router.include_router(cms_router, prefix="/cms", tags=["cms"])
api_router.include_router(coupon_router, prefix="/coupons", tags=["coupons"])
api_router.include_router(boost_router, prefix="/boost", tags=["boost"])
api_router.include_router(trades_router, prefix="/trades", tags=["trades"])

from fastapi import APIRouter as _AR
from database import db as _db

_pub = _AR()

@_pub.get("/settings/public")
async def public_settings():
    settings = await _db.settings.find_one({}, {"_id": 0})
    defaults = {
        "social_linkedin_enabled": True, "social_twitter_enabled": True,
        "social_facebook_enabled": True, "social_native_share_enabled": True,
        "show_verification_sidebar": True,
    }
    if not settings:
        return defaults
    result = {k: v for k, v in settings.items() if k.startswith("social_") or k in ("show_verification_sidebar", "accent_color", "brand_color", "nav_bg_color")}
    return {**defaults, **result}

api_router.include_router(_pub)

@api_router.get("/")
async def root():
    return {"message": "PunchListJobs API", "status": "operational", "version": "1.0.0"}

app.include_router(api_router)

uploads_dir = ROOT_DIR / "uploads"
uploads_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")
app.mount("/api/uploads", StaticFiles(directory=str(uploads_dir)), name="api_uploads")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


def gen_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))


def base_user(email, password, role, name, **extra):
    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": str(uuid.uuid4()),
        "email": email.lower(),
        "password_hash": hash_password(password),
        "role": role,
        "name": name,
        "phone": extra.get("phone"),
        "is_active": True,
        "is_verified": True,
        "created_at": now,
        "trial_start_date": now,
        "trial_end_date": (datetime.now(timezone.utc) + timedelta(days=3650)).isoformat(),
        "subscription_status": "active",
        "subscription_plan": "monthly",
        "subscription_end": (datetime.now(timezone.utc) + timedelta(days=3650)).isoformat(),
        "usage_month": datetime.now(timezone.utc).strftime("%Y-%m"),
        "usage_count": 0,
        "points": extra.get("points", 0),
        "referral_code": gen_code(),
        "referred_by": None,
        "bio": extra.get("bio", ""),
        "trade": extra.get("trade", ""),
        "skills": extra.get("skills", []),
        "profile_photo": None,
        "availability": extra.get("availability", True),
        "is_online": extra.get("is_online", False),
        "location": extra.get("location"),
        "rating": extra.get("rating", 0.0),
        "rating_count": extra.get("rating_count", 0),
        "jobs_completed": extra.get("jobs_completed", 0),
        "company_name": extra.get("company_name", ""),
        "logo": None,
        "hide_location": False,
        "favorite_crew": [],
        "profile_views": 0,
    }


async def seed_accounts():
    """Seed demo accounts if they don't exist."""

    # 1. SuperAdmin
    if not await db.users.find_one({"email": "superadmin@punchlistjobs.com"}):
        doc = base_user(
            "superadmin@punchlistjobs.com", "SuperAdmin@123", "superadmin",
            "Super Administrator", is_online=True
        )
        await db.users.insert_one(doc)
        logger.info("SuperAdmin created: superadmin@punchlistjobs.com")

    # 2. Admin
    if not await db.users.find_one({"email": "admin@punchlistjobs.com"}):
        doc = base_user(
            "admin@punchlistjobs.com", "Admin@123", "admin",
            "Platform Admin", is_online=True
        )
        await db.users.insert_one(doc)
        logger.info("Admin created: admin@punchlistjobs.com")

    # 2b. SubAdmin (demo account)
    if not await db.users.find_one({"email": "subadmin@punchlistjobs.com"}):
        doc = base_user(
            "subadmin@punchlistjobs.com", "SubAdmin@123", "subadmin",
            "Sub Administrator", is_online=False
        )
        await db.users.insert_one(doc)
        logger.info("SubAdmin created: subadmin@punchlistjobs.com")

    # 3. Seed Crew Members
    crew_seeds = [
        {
            "email": "crew1@punchlistjobs.com", "password": "Crew@123",
            "name": "Marcus Johnson", "trade": "Carpentry",
            "skills": ["Framing", "Drywall", "Finishing"], "bio": "10 years of carpentry experience",
            "phone": "555-101-0001", "rating": 4.8, "rating_count": 24,
            "jobs_completed": 47, "is_online": True,
            "location": {"lat": 33.7490, "lng": -84.3880, "city": "Atlanta"},
            "points": 2350, "availability": True,
        },
        {
            "email": "crew2@punchlistjobs.com", "password": "Crew@123",
            "name": "Darius Williams", "trade": "Electrical",
            "skills": ["Wiring", "Panel Install", "Lighting"], "bio": "Licensed electrician, residential & commercial",
            "phone": "555-101-0002", "rating": 4.9, "rating_count": 31,
            "jobs_completed": 62, "is_online": False,
            "location": {"lat": 33.8490, "lng": -84.2880, "city": "Decatur"},
            "points": 3100, "availability": True,
        },
        {
            "email": "crew3@punchlistjobs.com", "password": "Crew@123",
            "name": "Andre Thomas", "trade": "Plumbing",
            "skills": ["Pipe Installation", "Leak Repair", "Fixture Install"], "bio": "Master plumber with 15 years",
            "phone": "555-101-0003", "rating": 4.7, "rating_count": 18,
            "jobs_completed": 33, "is_online": True,
            "location": {"lat": 33.6490, "lng": -84.4880, "city": "Marietta"},
            "points": 1650, "availability": True,
        },
        {
            "email": "crew4@punchlistjobs.com", "password": "Crew@123",
            "name": "Kevin Brown", "trade": "General Labor",
            "skills": ["Demo", "Clean-up", "Moving", "Hauling"], "bio": "Reliable and hardworking",
            "phone": "555-101-0004", "rating": 4.5, "rating_count": 12,
            "jobs_completed": 28, "is_online": False,
            "location": {"lat": 33.9490, "lng": -84.1880, "city": "Smyrna"},
            "points": 1400, "availability": True,
        },
        {
            "email": "crew5@punchlistjobs.com", "password": "Crew@123",
            "name": "Terrence Davis", "trade": "HVAC",
            "skills": ["AC Install", "Ductwork", "Refrigerant"], "bio": "EPA certified HVAC technician",
            "phone": "555-101-0005", "rating": 4.6, "rating_count": 15,
            "jobs_completed": 29, "is_online": True,
            "location": {"lat": 33.7790, "lng": -84.3580, "city": "Atlanta"},
            "points": 1450, "availability": False,
        },
    ]

    for c in crew_seeds:
        if not await db.users.find_one({"email": c["email"]}):
            doc = base_user(
                c["email"], c["password"], "crew", c["name"],
                trade=c["trade"], skills=c["skills"], bio=c["bio"],
                phone=c["phone"], rating=c["rating"], rating_count=c["rating_count"],
                jobs_completed=c["jobs_completed"], is_online=c["is_online"],
                location=c["location"], points=c["points"], availability=c["availability"]
            )
            await db.users.insert_one(doc)
            logger.info(f"Crew seeded: {c['email']}")

    # 4. Seed Contractor Accounts
    contractor_seeds = [
        {
            "email": "contractor1@punchlistjobs.com", "password": "Contractor@123",
            "name": "Robert BuildCo", "company_name": "BuildCo Construction",
            "trade": "General Contracting", "bio": "Full-service construction company",
            "phone": "555-200-0001", "is_online": True,
            "location": {"lat": 33.7490, "lng": -84.3880, "city": "Atlanta"},
        },
        {
            "email": "contractor2@punchlistjobs.com", "password": "Contractor@123",
            "name": "Sarah Renovate Pro", "company_name": "Renovate Pro LLC",
            "trade": "Renovation", "bio": "Residential renovation specialists",
            "phone": "555-200-0002", "is_online": False,
            "location": {"lat": 33.8490, "lng": -84.2880, "city": "Decatur"},
        },
        {
            "email": "contractor3@punchlistjobs.com", "password": "Contractor@123",
            "name": "James Elite Build", "company_name": "Elite Build Group",
            "trade": "Commercial Construction", "bio": "Commercial & industrial projects",
            "phone": "555-200-0003", "is_online": True,
            "location": {"lat": 33.6490, "lng": -84.4880, "city": "Marietta"},
        },
    ]

    for c in contractor_seeds:
        if not await db.users.find_one({"email": c["email"]}):
            doc = base_user(
                c["email"], c["password"], "contractor", c["name"],
                company_name=c["company_name"], trade=c["trade"], bio=c["bio"],
                phone=c["phone"], is_online=c["is_online"], location=c["location"]
            )
            await db.users.insert_one(doc)
            logger.info(f"Contractor seeded: {c['email']}")


async def hide_old_completed_jobs():
    try:
        settings = await db.settings.find_one({}, {"_id": 0})
        hours = settings.get("job_visibility_hours", 12) if settings else 12
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
        result = await db.jobs.update_many(
            {"status": "completed", "completed_at": {"$lt": cutoff}, "is_hidden": {"$ne": True}},
            {"$set": {"is_hidden": True}}
        )
        if result.modified_count > 0:
            logger.info(f"Cron: hid {result.modified_count} completed jobs older than {hours}h")
    except Exception as e:
        logger.error(f"Cron job error: {e}")


async def expire_emergency_jobs():
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
        result = await db.jobs.update_many(
            {"is_emergency": True, "status": "open", "created_at": {"$lt": cutoff}},
            {"$set": {"status": "expired", "is_hidden": True}}
        )
        if result.modified_count > 0:
            logger.info(f"Cron: expired {result.modified_count} emergency jobs")
    except Exception as e:
        logger.error(f"Emergency expiry cron error: {e}")


_SEED_TRADES = [
    {"name": "Carpentry",     "trades": ["Framing", "Rough Carpentry", "Finish Carpentry", "Cabinet Making", "Deck Building", "Drywall Hanging"]},
    {"name": "Electrical",    "trades": ["Wiring", "Panel Install", "Lighting", "Low Voltage", "Solar Install"]},
    {"name": "Plumbing",      "trades": ["Pipe Installation", "Leak Repair", "Fixture Install", "Gas Lines", "Drain Cleaning"]},
    {"name": "HVAC",          "trades": ["AC Install", "Ductwork", "Refrigerant", "Heat Pump", "Ventilation"]},
    {"name": "Painting",      "trades": ["Interior Painting", "Exterior Painting", "Staining", "Wallpaper", "Drywall Finishing"]},
    {"name": "Landscaping",   "trades": ["Lawn Care", "Hardscaping", "Irrigation", "Tree Trimming", "Grading"]},
    {"name": "Masonry",       "trades": ["Brickwork", "Stonework", "Concrete Work", "Block Laying", "Stucco"]},
    {"name": "Roofing",       "trades": ["Shingle Install", "Flat Roofing", "Gutters", "Skylight Install", "Roof Repair"]},
    {"name": "General Labor", "trades": ["Demo", "Clean-up", "Moving", "Hauling", "Site Prep", "Material Handling"]},
    {"name": "Flooring",      "trades": ["Hardwood", "Tile Setting", "Carpet Install", "LVP Install", "Refinishing"]},
]


async def seed_trades():
    """Idempotent seed: insert categories and trades only if missing."""
    for entry in _SEED_TRADES:
        cat = await db.trade_categories.find_one({"name": entry["name"]})
        if not cat:
            cat_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc).isoformat()
            await db.trade_categories.insert_one({
                "id": cat_id,
                "name": entry["name"],
                "slug": entry["name"].lower().replace(" ", "-"),
                "is_active": True,
                "created_at": now,
            })
            logger.info(f"Seeded category: {entry['name']}")
        else:
            cat_id = cat["id"]

        for trade_name in entry["trades"]:
            existing = await db.trades.find_one({"category_id": cat_id, "name": trade_name})
            if not existing:
                now = datetime.now(timezone.utc).isoformat()
                await db.trades.insert_one({
                    "id": str(uuid.uuid4()),
                    "name": trade_name,
                    "category_id": cat_id,
                    "category_name": entry["name"],
                    "is_active": True,
                    "created_at": now,
                })


@app.on_event("startup")
async def startup_event():
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("referral_code", sparse=True)
        await db.users.create_index("is_online")
        await db.users.create_index([("location_geo", "2dsphere")], sparse=True)
        await db.jobs.create_index("status")
        await db.jobs.create_index("contractor_id")
        await db.jobs.create_index("created_at")
        await db.jobs.create_index([("location_geo", "2dsphere")], sparse=True)
        await db.jobs.create_index([("completed_at", 1), ("status", 1)])
        await db.crew_requests.create_index([("crew_id", 1), ("status", 1)])
        await db.crew_requests.create_index([("contractor_id", 1)])
        # Activity log indexes
        await db.activity_logs.create_index("created_at")
        await db.activity_logs.create_index("category")
        await db.activity_logs.create_index("actor_id")
        await db.activity_logs.create_index("target_id")
        logger.info("Database indexes created")
    except Exception as e:
        logger.warning(f"Index creation: {e}")

    # Migrate: ensure all users have profile_views field (default 0)
    try:
        result = await db.users.update_many(
            {"profile_views": {"$exists": False}},
            {"$set": {"profile_views": 0}}
        )
        if result.modified_count:
            logger.info(f"Migration: added profile_views to {result.modified_count} users")
    except Exception as e:
        logger.warning(f"profile_views migration: {e}")

    # Migrate: trial / expired → free plan
    try:
        result = await db.users.update_many(
            {"subscription_status": {"$in": ["trial", "expired"]}},
            {"$set": {"subscription_status": "free", "subscription_plan": None, "subscription_end": None}}
        )
        if result.modified_count:
            logger.info(f"Migration: converted {result.modified_count} trial/expired users to free plan")
    except Exception as e:
        logger.warning(f"Free plan migration: {e}")

    # Migrate: ensure usage tracking fields exist on all users
    try:
        current_month = datetime.now(timezone.utc).strftime("%Y-%m")
        await db.users.update_many(
            {"usage_month": {"$exists": False}},
            {"$set": {"usage_month": current_month, "usage_count": 0}}
        )
    except Exception as e:
        logger.warning(f"Usage fields migration: {e}")

    # Seed all accounts
    await seed_accounts()

    # Init default settings
    existing_settings = await db.settings.find_one({})
    if not existing_settings:
        await db.settings.insert_one({
            "daily_price": 1.99,
            "weekly_price": 9.99,
            "monthly_price": 29.99,
            "annual_price": 179.94,
            "trial_days": 30,
            "annual_trial_days": 180,
            "job_visibility_hours": 12,
            "emergency_expiry_minutes": 30,
            "cashapp_cashtag": os.environ.get("CASHAPP_CASHTAG", "punchlistjobs"),
            "social_linkedin_enabled": True,
            "social_twitter_enabled": True,
            "social_facebook_enabled": True,
            "social_native_share_enabled": True,
            "free_crew_responses_per_month": 3,
            "free_contractor_posts_per_month": 2,
            "accent_color": "#ccff00",
            "brand_color": "#0000FF",
            "nav_bg_color": "#050A30",
        })
        logger.info("Default settings created")
    else:
        updates = {}
        if not existing_settings.get("annual_price"):
            updates["annual_price"] = 179.94
        if "free_crew_responses_per_month" not in existing_settings:
            updates["free_crew_responses_per_month"] = 3
        if "free_contractor_posts_per_month" not in existing_settings:
            updates["free_contractor_posts_per_month"] = 2
        if "accent_color" not in existing_settings:
            updates["accent_color"] = "#ccff00"
        if "brand_color" not in existing_settings:
            updates["brand_color"] = "#0000FF"
        if "nav_bg_color" not in existing_settings:
            updates["nav_bg_color"] = "#050A30"
        if updates:
            await db.settings.update_one({}, {"$set": updates})

    scheduler.add_job(hide_old_completed_jobs, "interval", hours=1, id="hide_jobs_cron", replace_existing=True)
    scheduler.add_job(expire_emergency_jobs, "interval", minutes=15, id="emergency_expiry_cron", replace_existing=True)
    scheduler.start()

    # Seed trade categories + trades (idempotent — skip if already seeded)
    await seed_trades()

    logger.info("PunchListJobs API started successfully")
    logger.info("Demo Accounts:")
    logger.info("  SuperAdmin: superadmin@punchlistjobs.com / SuperAdmin@123")
    logger.info("  Admin:      admin@punchlistjobs.com / Admin@123")
    logger.info("  Crew:       crew1@punchlistjobs.com / Crew@123")
    logger.info("  Contractor: contractor1@punchlistjobs.com / Contractor@123")


@app.on_event("shutdown")
async def shutdown_db_client():
    scheduler.shutdown(wait=False)
    client.close()
