"""
CMS Routes – /api/cms/
─────────────────────
Public:  GET  /api/cms/pages          – list all pages
         GET  /api/cms/pages/{slug}   – single page

Admin:   PUT  /api/cms/pages/{slug}   – update a page (cms:write)
"""

import json
from fastapi import APIRouter, HTTPException, Depends
from database import db
from models import CMSPageUpdate
from utils.rbac import require_permission
from datetime import datetime, timezone

router = APIRouter()

# Default seed content for each CMS page
CMS_DEFAULTS = [
    {
        "slug": "terms",
        "title": "Terms & Conditions",
        "header_text": "Please read our terms carefully",
        "content": "<p>Terms and Conditions will be added here.</p>",
        "youtube_url": None,
    },
    {
        "slug": "privacy",
        "title": "Privacy Policy",
        "header_text": "Your privacy is important to us",
        "content": "<p>Privacy Policy will be added here.</p>",
        "youtube_url": None,
    },
    {
        "slug": "community-guidelines",
        "title": "Community Guidelines",
        "header_text": "Standards that keep our community strong",
        "content": "<p>Community Guidelines will be added here.</p>",
        "youtube_url": None,
    },
    {
        "slug": "about",
        "title": "About PunchListJobs",
        "header_text": "Connecting skilled trades with contractors",
        "content": "<p>Learn more about the PunchListJobs platform.</p>",
        "youtube_url": "",
    },
    {
        "slug": "faqs",
        "title": "FAQs",
        "header_text": "Frequently Asked Questions",
        "content": json.dumps([
            {"question": "What is PunchListJobs?", "answer": "A platform connecting contractors with skilled trade workers."},
            {"question": "How do I get paid?", "answer": "Payment terms are set directly between you and the contractor."},
        ]),
        "youtube_url": None,
    },
    {
        "slug": "what-is-a-punch-list",
        "title": "What is a Punch List?",
        "header_text": "Understanding the Punch List",
        "content": "<p>A punch list is a document used in construction that lists work that does not conform to contract specifications.</p>",
        "youtube_url": None,
    },
]


async def _get_or_seed(slug: str):
    """Return a page from DB, seeding defaults on first access."""
    page = await db.cms_pages.find_one({"slug": slug}, {"_id": 0})
    if not page:
        default = next((p for p in CMS_DEFAULTS if p["slug"] == slug), None)
        if not default:
            raise HTTPException(status_code=404, detail="Page not found")
        await db.cms_pages.insert_one({**default})
        return {**default}
    return page


@router.get("/pages")
async def list_cms_pages():
    """Public: return all CMS pages (auto-seeds defaults on first call)."""
    pages = await db.cms_pages.find({}, {"_id": 0}).to_list(20)
    if not pages:
        # Seed all defaults
        await db.cms_pages.insert_many([{**p} for p in CMS_DEFAULTS])
        pages = [{**p} for p in CMS_DEFAULTS]
    # Ensure every default slug is present
    existing_slugs = {p["slug"] for p in pages}
    for d in CMS_DEFAULTS:
        if d["slug"] not in existing_slugs:
            await db.cms_pages.insert_one({**d})
            pages.append({**d})
    return pages


@router.get("/pages/{slug}")
async def get_cms_page(slug: str):
    """Public: return a single CMS page."""
    return await _get_or_seed(slug)


@router.put("/pages/{slug}")
async def update_cms_page(
    slug: str,
    data: CMSPageUpdate,
    _: dict = Depends(require_permission("cms:write")),
):
    """Admin only: update a CMS page."""
    # Make sure the page exists (seeds if not)
    await _get_or_seed(slug)
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.cms_pages.update_one({"slug": slug}, {"$set": update}, upsert=True)
    return {"message": "Page updated"}
