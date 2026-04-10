import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, Query
from database import db
from auth import get_current_user, user_to_response
from models import JobCreate, JobUpdate, RatingCreate
from utils.geocoding import geocode_address, haversine_distance
from utils.email_utils import send_job_completion_email
from utils.matching import sort_jobs_for_crew
from utils.subscription import check_and_enforce_limit, increment_usage
from utils.notify import create_notification
from utils.activity_log import log_activity
from typing import Optional
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


def now_str():
    return datetime.now(timezone.utc).isoformat()


@router.post("/", status_code=201)
async def create_job(data: JobCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "contractor":
        raise HTTPException(status_code=403, detail="Only contractors can post jobs")
    await check_and_enforce_limit(current_user, "post")

    # Geocode the address
    location = await geocode_address(data.address)

    job_doc = {
        "id": str(uuid.uuid4()),
        "contractor_id": current_user["id"],
        "contractor_name": current_user.get("company_name") or current_user["name"],
        "title": data.title,
        "description": data.description,
        "trade": data.trade,
        "crew_needed": data.crew_needed,
        "crew_accepted": [],
        "start_time": data.start_time,
        "pay_rate": data.pay_rate,
        "address": data.address,
        "location": location,
        "status": "open",
        "is_emergency": data.is_emergency,
        "is_boosted": data.is_boosted,
        "created_at": now_str(),
        "completed_at": None,
        "rated_crew": [],
        "rated_by_crew": [],
    }

    await db.jobs.insert_one(job_doc)
    await increment_usage(current_user["id"])

    # Broadcast via WebSocket
    try:
        from routes.ws_routes import manager
        await manager.broadcast_new_job(job_doc)
    except Exception as e:
        logger.warning(f"WS broadcast failed: {e}")

    return {k: v for k, v in job_doc.items() if k != "_id"}


@router.get("/")
@router.get("")
async def list_jobs(
    status: Optional[str] = None,
    trade: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius: Optional[float] = 25,
    smart_match: Optional[bool] = False,
    current_user: dict = Depends(get_current_user)
):
    query = {"is_hidden": {"$ne": True}, "is_archived": {"$ne": True}}

    if current_user["role"] == "contractor":
        # Contractors only see their own jobs
        query["contractor_id"] = current_user["id"]
    else:
        # Crew sees all open/fulfilled jobs
        if status:
            query["status"] = status
        else:
            query["status"] = {"$in": ["open", "fulfilled"]}

    if trade:
        query["trade"] = trade

    jobs = await db.jobs.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)

    # Filter by radius if location provided
    if lat and lng:
        jobs = [j for j in jobs if j.get("location") and haversine_distance(
            lat, lng, j["location"]["lat"], j["location"]["lng"]
        ) <= radius]

    # Smart matching for crew: weighted distance + trade + skills
    if smart_match and current_user["role"] == "crew" and jobs:
        jobs = sort_jobs_for_crew(
            jobs,
            current_user,
            lat if (lat and lng) else None,
            lng if (lat and lng) else None,
            radius,
        )

    return jobs


@router.get("/archive")
async def list_archived_jobs(current_user: dict = Depends(get_current_user)):
    """Return archived jobs. Contractors see own; admins see all."""
    if current_user["role"] in ("admin", "superadmin"):
        query = {"is_archived": True}
    elif current_user["role"] == "contractor":
        query = {"is_archived": True, "contractor_id": current_user["id"]}
    else:
        raise HTTPException(status_code=403, detail="Only contractors and admins can view archive")
    jobs = await db.jobs.find(query, {"_id": 0}).sort("archived_at", -1).to_list(200)
    return jobs


@router.get("/my-jobs")
async def my_jobs(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == "contractor":
        jobs = await db.jobs.find({"contractor_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    else:
        jobs = await db.jobs.find(
            {"crew_accepted": current_user["id"]},
            {"_id": 0}
        ).sort("created_at", -1).to_list(100)
    return jobs


@router.get("/{job_id}")
async def get_job(job_id: str, current_user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.put("/{job_id}")
async def update_job(job_id: str, data: JobUpdate, current_user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["contractor_id"] != current_user["id"] and current_user["role"] not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Not authorized")

    update = {k: v for k, v in data.model_dump().items() if v is not None}

    # Re-geocode if address changed
    if "address" in update:
        location = await geocode_address(update["address"])
        update["location"] = location

    if update:
        await db.jobs.update_one({"id": job_id}, {"$set": update})

    # Notify crew members of the update
    for crew_id in job.get("crew_accepted", []):
        await create_notification(
            crew_id, "job_updated", "Job Updated",
            f"The job '{job['title']}' has been updated by the contractor."
        )

    await log_activity(
        actor=current_user, action="job.updated", category="job",
        target_id=job_id, target_type="job", details={"fields": list(update.keys())}
    )
    return {"message": "Job updated"}


@router.delete("/{job_id}")
async def delete_job(job_id: str, current_user: dict = Depends(get_current_user)):
    """Soft-delete: moves job to archive instead of permanent removal."""
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["contractor_id"] != current_user["id"] and current_user["role"] not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    now = datetime.now(timezone.utc).isoformat()
    await db.jobs.update_one({"id": job_id}, {"$set": {
        "is_archived": True,
        "archived_at": now,
        "archived_by": current_user["id"],
        "is_hidden": True,
        "status": "archived",
    }})
    await log_activity(
        actor=current_user, action="job.archived", category="job",
        target_id=job_id, target_type="job", details={"title": job.get("title")}
    )
    return {"message": "Job archived"}


@router.post("/{job_id}/archive")
async def archive_job(job_id: str, current_user: dict = Depends(get_current_user)):
    """Explicitly archive a job (e.g. after cancel)."""
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["contractor_id"] != current_user["id"] and current_user["role"] not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    if job.get("is_archived"):
        raise HTTPException(status_code=400, detail="Job is already archived")
    now = datetime.now(timezone.utc).isoformat()
    await db.jobs.update_one({"id": job_id}, {"$set": {
        "is_archived": True,
        "archived_at": now,
        "archived_by": current_user["id"],
        "pre_archive_status": job.get("status", "open"),
        "is_hidden": True,
        "status": "archived",
    }})
    await log_activity(
        actor=current_user, action="job.archived", category="job",
        target_id=job_id, target_type="job", details={"title": job.get("title")}
    )
    return {"message": "Job archived"}


@router.post("/{job_id}/unarchive")
async def unarchive_job(job_id: str, current_user: dict = Depends(get_current_user)):
    """Restore an archived job back to active state."""
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["contractor_id"] != current_user["id"] and current_user["role"] not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    if not job.get("is_archived"):
        raise HTTPException(status_code=400, detail="Job is not archived")
    restore_status = job.get("pre_archive_status") or "open"
    if restore_status in ("archived", "cancelled", "completed"):
        restore_status = "open"
    await db.jobs.update_one({"id": job_id}, {"$set": {
        "is_archived": False,
        "is_hidden": False,
        "status": restore_status,
    }, "$unset": {"archived_at": "", "archived_by": "", "pre_archive_status": ""}})
    await log_activity(
        actor=current_user, action="job.unarchived", category="job",
        target_id=job_id, target_type="job", details={"title": job.get("title"), "restored_to": restore_status}
    )
    return {"message": "Job unarchived", "status": restore_status}


@router.delete("/{job_id}/permanent")
async def permanent_delete_job(job_id: str, current_user: dict = Depends(get_current_user)):
    """Permanently delete an archived job — irreversible."""
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["contractor_id"] != current_user["id"] and current_user["role"] not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    if not job.get("is_archived"):
        raise HTTPException(status_code=400, detail="Only archived jobs can be permanently deleted. Archive it first.")
    await db.jobs.delete_one({"id": job_id})
    await log_activity(
        actor=current_user, action="job.permanently_deleted", category="job",
        target_id=job_id, target_type="job", details={"title": job.get("title")}
    )
    return {"message": "Job permanently deleted"}


@router.post("/{job_id}/cancel")
async def cancel_job(job_id: str, archive: bool = False, current_user: dict = Depends(get_current_user)):
    """Cancel a job and notify all accepted crew. Pass ?archive=true to also archive."""
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["contractor_id"] != current_user["id"] and current_user["role"] not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    if job["status"] in ("completed", "cancelled", "archived"):
        raise HTTPException(status_code=400, detail=f"Job is already {job['status']}")

    now = datetime.now(timezone.utc).isoformat()
    updates: dict = {"status": "cancelled"}
    if archive:
        updates.update({"is_archived": True, "archived_at": now,
                        "archived_by": current_user["id"], "pre_archive_status": "cancelled", "is_hidden": True})

    await db.jobs.update_one({"id": job_id}, {"$set": updates})

    for crew_id in job.get("crew_accepted", []):
        await create_notification(
            crew_id, "job_cancelled", "Job Cancelled",
            f"The job '{job['title']}' has been cancelled by the contractor."
        )
    action = "job.cancelled_and_archived" if archive else "job.cancelled"
    await log_activity(
        actor=current_user, action=action, category="job",
        target_id=job_id, target_type="job", details={"title": job["title"]}
    )
    return {"message": "Job cancelled and archived" if archive else "Job cancelled"}


@router.post("/{job_id}/suspend")
async def suspend_job(job_id: str, current_user: dict = Depends(get_current_user)):
    """Suspend an active job and notify accepted crew."""
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["contractor_id"] != current_user["id"] and current_user["role"] not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    if job["status"] not in ("open", "fulfilled"):
        raise HTTPException(status_code=400, detail="Can only suspend open or fulfilled jobs")

    await db.jobs.update_one({"id": job_id}, {"$set": {"status": "suspended"}})

    for crew_id in job.get("crew_accepted", []):
        await create_notification(
            crew_id, "job_suspended", "Job Suspended",
            f"The job '{job['title']}' has been temporarily suspended."
        )
    await log_activity(
        actor=current_user, action="job.suspended", category="job",
        target_id=job_id, target_type="job", details={"title": job["title"]}
    )
    return {"message": "Job suspended"}


@router.post("/{job_id}/reactivate")
async def reactivate_job(job_id: str, current_user: dict = Depends(get_current_user)):
    """Reactivate a suspended job and notify crew."""
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["contractor_id"] != current_user["id"] and current_user["role"] not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Not authorized")
    if job["status"] != "suspended":
        raise HTTPException(status_code=400, detail="Can only reactivate suspended jobs")

    crew = job.get("crew_accepted", [])
    new_status = "fulfilled" if len(crew) >= job.get("crew_needed", 1) else "open"
    await db.jobs.update_one({"id": job_id}, {"$set": {"status": new_status}})

    for crew_id in crew:
        await create_notification(
            crew_id, "job_reactivated", "Job Reactivated",
            f"Good news! The job '{job['title']}' has been reactivated."
        )
    await log_activity(
        actor=current_user, action="job.reactivated", category="job",
        target_id=job_id, target_type="job", details={"title": job["title"], "new_status": new_status}
    )
    return {"message": "Job reactivated", "status": new_status}


@router.post("/{job_id}/duplicate", status_code=201)
async def duplicate_job(job_id: str, current_user: dict = Depends(get_current_user)):
    """Duplicate an existing job to quickly repost it."""
    if current_user["role"] != "contractor":
        raise HTTPException(status_code=403, detail="Only contractors can duplicate jobs")
    await check_and_enforce_limit(current_user, "post")

    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["contractor_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    new_job = {
        "id": str(uuid.uuid4()),
        "contractor_id": job["contractor_id"],
        "contractor_name": job["contractor_name"],
        "title": f"{job['title']} (Copy)",
        "description": job["description"],
        "trade": job["trade"],
        "crew_needed": job["crew_needed"],
        "crew_accepted": [],
        "start_time": job["start_time"],
        "pay_rate": job["pay_rate"],
        "address": job.get("address", ""),
        "location": job["location"],
        "status": "open",
        "is_emergency": False,
        "is_boosted": False,
        "created_at": now_str(),
        "completed_at": None,
        "rated_crew": [],
        "rated_by_crew": [],
        "is_hidden": False,
    }
    await db.jobs.insert_one(new_job)
    await increment_usage(current_user["id"])

    try:
        from routes.ws_routes import manager
        await manager.broadcast_new_job(new_job)
    except Exception:
        pass

    return {k: v for k, v in new_job.items() if k != "_id"}


@router.post("/{job_id}/accept")
async def accept_job(job_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "crew":
        raise HTTPException(status_code=403, detail="Only crew members can accept jobs")
    await check_and_enforce_limit(current_user, "respond")

    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] not in ("open", "fulfilled"):
        raise HTTPException(status_code=400, detail=f"Job is {job['status']}, cannot accept")
    if current_user["id"] in job["crew_accepted"]:
        raise HTTPException(status_code=400, detail="Already accepted this job")

    if job.get("is_emergency"):
        # Atomic race-lock for emergency jobs: only first crew member wins
        result = await db.jobs.find_one_and_update(
            {
                "id": job_id,
                "status": {"$in": ["open", "fulfilled"]},
                "crew_accepted": {"$not": {"$elemMatch": {"$eq": current_user["id"]}}},
                "$expr": {"$lt": [{"$size": "$crew_accepted"}, "$crew_needed"]}
            },
            {"$push": {"crew_accepted": current_user["id"]}, "$set": {"status": "fulfilled"}},
            return_document=True
        )
        if not result:
            raise HTTPException(status_code=409, detail="Emergency job already claimed or slot unavailable")
        new_crew = result["crew_accepted"]
        new_status = result["status"]
    else:
        new_crew = job["crew_accepted"] + [current_user["id"]]
        new_status = "fulfilled" if len(new_crew) >= job["crew_needed"] else "open"
        await db.jobs.update_one(
            {"id": job_id},
            {"$set": {"crew_accepted": new_crew, "status": new_status}}
        )

    # Notify contractor via WebSocket
    try:
        from routes.ws_routes import manager
        await manager.send_to_user(job["contractor_id"], {
            "type": "job_accepted",
            "job_id": job_id,
            "crew_name": current_user["name"],
            "crew_count": len(new_crew),
            "crew_needed": job["crew_needed"]
        })
    except Exception:
        pass

    await increment_usage(current_user["id"])
    return {"message": "Job accepted", "status": new_status}


@router.post("/{job_id}/start")
async def start_job(job_id: str, current_user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["contractor_id"] != current_user["id"] and current_user["id"] not in job.get("crew_accepted", []):
        raise HTTPException(status_code=403, detail="Not authorized")
    if job["status"] not in ("open", "fulfilled"):
        raise HTTPException(status_code=400, detail="Job cannot be started in current status")

    await db.jobs.update_one({"id": job_id}, {"$set": {"status": "in_progress"}})
    return {"message": "Job started"}


@router.post("/{job_id}/complete")
async def complete_job(job_id: str, current_user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if current_user["id"] not in job.get("crew_accepted", []):
        raise HTTPException(status_code=403, detail="Not a crew member on this job")
    if job["status"] != "in_progress":
        raise HTTPException(status_code=400, detail="Job must be in_progress to complete")

    await db.jobs.update_one(
        {"id": job_id},
        {"$set": {"status": "completed_pending_review"}}
    )

    # Notify contractor (blocked for free-tier crew)
    contractor = await db.users.find_one({"id": job["contractor_id"]}, {"_id": 0})
    if contractor:
        await send_job_completion_email(contractor["email"], contractor["name"], job["title"], sender_user=current_user)
        try:
            from routes.ws_routes import manager
            await manager.send_to_user(job["contractor_id"], {
                "type": "job_completed",
                "job_id": job_id,
                "job_title": job["title"]
            })
        except Exception:
            pass

    return {"message": "Job marked complete, awaiting contractor review"}


@router.post("/{job_id}/verify")
async def verify_job(job_id: str, current_user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["contractor_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the contractor can verify")
    if job["status"] != "completed_pending_review":
        raise HTTPException(status_code=400, detail="Job not pending review")

    now = now_str()
    await db.jobs.update_one(
        {"id": job_id},
        {"$set": {"status": "completed", "completed_at": now}}
    )

    # Award points to crew members
    for crew_id in job.get("crew_accepted", []):
        await db.users.update_one(
            {"id": crew_id},
            {"$inc": {"points": 50, "jobs_completed": 1}}
        )

    return {"message": "Job verified and completed"}


@router.post("/{job_id}/rate")
async def rate_user(job_id: str, data: RatingCreate, current_user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] not in ("completed", "completed_pending_review"):
        raise HTTPException(status_code=400, detail="Can only rate after job completion")

    # Verify rater was part of this job
    is_contractor = job["contractor_id"] == current_user["id"]
    is_crew = current_user["id"] in job.get("crew_accepted", [])
    if not (is_contractor or is_crew):
        raise HTTPException(status_code=403, detail="Not part of this job")

    # Check no duplicate rating
    existing = await db.ratings.find_one({
        "job_id": job_id,
        "rater_id": current_user["id"],
        "rated_id": data.rated_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Already rated this person for this job")

    if not 1 <= data.stars <= 5:
        raise HTTPException(status_code=400, detail="Stars must be 1-5")

    rating_doc = {
        "id": str(uuid.uuid4()),
        "rater_id": current_user["id"],
        "rated_id": data.rated_id,
        "job_id": job_id,
        "stars": data.stars,
        "review": data.review,
        "created_at": now_str()
    }
    await db.ratings.insert_one(rating_doc)

    # Update average rating
    all_ratings = await db.ratings.find({"rated_id": data.rated_id}, {"_id": 0}).to_list(1000)
    avg = sum(r["stars"] for r in all_ratings) / len(all_ratings)
    await db.users.update_one(
        {"id": data.rated_id},
        {"$set": {"rating": round(avg, 1), "rating_count": len(all_ratings)}}
    )

    return {"message": "Rating submitted", "rating": {k: v for k, v in rating_doc.items() if k != "_id"}}


@router.get("/{job_id}/ratings")
async def get_job_ratings(job_id: str, current_user: dict = Depends(get_current_user)):
    ratings = await db.ratings.find({"job_id": job_id}, {"_id": 0}).to_list(100)
    return ratings
