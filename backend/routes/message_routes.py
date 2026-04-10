from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from database import db
from auth import get_current_user
import uuid
from datetime import datetime, timezone

router = APIRouter()


class SendMessageBody(BaseModel):
    content: str


def _now():
    return datetime.now(timezone.utc).isoformat()


async def _push(thread_id: str, message: dict, participant_ids: list, sender_id: str):
    try:
        from routes.ws_routes import manager
        for uid in participant_ids:
            if uid != sender_id:
                await manager.send_to_user(uid, {
                    "type": "new_message",
                    "thread_id": thread_id,
                    "message": message,
                })
    except Exception:
        pass


# ── GET /threads ──────────────────────────────────────────────────────────────

@router.get("/threads")
async def list_threads(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    is_admin = current_user["role"] in ("admin", "superadmin", "subadmin")

    if is_admin:
        threads = await db.msg_threads.find(
            {"$or": [{"type": "admin_chat"}, {"participant_ids": uid}]},
            {"_id": 0}
        ).sort("last_message_at", -1).to_list(200)
    else:
        threads = await db.msg_threads.find(
            {"participant_ids": uid}, {"_id": 0}
        ).sort("last_message_at", -1).to_list(100)

    for t in threads:
        t["my_unread"] = t.get("unread", {}).get(uid, 0)
    return threads


# ── POST /threads/job/{job_id} ─────────────────────────────────────────────────

@router.post("/threads/job/{job_id}")
async def get_or_create_job_thread(job_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    role = current_user["role"]

    if role not in ("crew", "contractor"):
        raise HTTPException(status_code=403, detail="Only crew/contractors can start job chats")

    if current_user.get("subscription_status") in ("free", "expired", None):
        raise HTTPException(status_code=403, detail="UPGRADE_REQUIRED: Upgrade to message on jobs")

    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    involved = job["contractor_id"] == uid or uid in job.get("crew_accepted", [])
    if not involved:
        raise HTTPException(status_code=403, detail="Not involved in this job")

    existing = await db.msg_threads.find_one({"type": "job_chat", "job_id": job_id}, {"_id": 0})
    if existing:
        existing.pop("_id", None)
        return existing

    # Build participants: contractor + all accepted crew
    contractor = await db.users.find_one({"id": job["contractor_id"]}, {"_id": 0, "id": 1, "name": 1, "role": 1})
    participants = [{"user_id": job["contractor_id"], "name": (contractor or {}).get("name", "Contractor"), "role": "contractor"}]
    participant_ids = [job["contractor_id"]]

    for crew_id in job.get("crew_accepted", []):
        if crew_id not in participant_ids:
            crew = await db.users.find_one({"id": crew_id}, {"_id": 0, "id": 1, "name": 1})
            if crew:
                participants.append({"user_id": crew_id, "name": crew["name"], "role": "crew"})
                participant_ids.append(crew_id)

    if uid not in participant_ids:
        participants.append({"user_id": uid, "name": current_user["name"], "role": role})
        participant_ids.append(uid)

    thread = {
        "id": str(uuid.uuid4()),
        "type": "job_chat",
        "job_id": job_id,
        "job_title": job["title"],
        "participants": participants,
        "participant_ids": participant_ids,
        "last_message": None,
        "last_message_at": _now(),
        "unread": {pid: 0 for pid in participant_ids},
        "created_at": _now(),
    }
    await db.msg_threads.insert_one(thread)
    thread.pop("_id", None)
    return thread


# ── POST /threads/admin ────────────────────────────────────────────────────────

@router.post("/threads/admin")
async def get_or_create_admin_thread(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    role = current_user["role"]

    if role in ("admin", "superadmin", "subadmin"):
        raise HTTPException(status_code=400, detail="Admins respond from the Messages page")

    existing = await db.msg_threads.find_one(
        {"type": "admin_chat", "participant_ids": uid}, {"_id": 0}
    )
    if existing:
        existing.pop("_id", None)
        return existing

    admins = await db.users.find(
        {"role": {"$in": ["admin", "superadmin"]}},
        {"_id": 0, "id": 1, "name": 1, "role": 1}
    ).to_list(10)

    participants = [{"user_id": uid, "name": current_user["name"], "role": role}]
    participant_ids = [uid]
    for a in admins:
        participants.append({"user_id": a["id"], "name": a["name"], "role": a["role"]})
        participant_ids.append(a["id"])

    thread = {
        "id": str(uuid.uuid4()),
        "type": "admin_chat",
        "job_id": None,
        "job_title": None,
        "user_name": current_user["name"],
        "user_role": role,
        "participants": participants,
        "participant_ids": participant_ids,
        "last_message": None,
        "last_message_at": _now(),
        "unread": {pid: 0 for pid in participant_ids},
        "created_at": _now(),
    }
    await db.msg_threads.insert_one(thread)
    thread.pop("_id", None)
    return thread


# ── GET /threads/{thread_id} ──────────────────────────────────────────────────

@router.get("/threads/{thread_id}")
async def get_thread_messages(thread_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    is_admin = current_user["role"] in ("admin", "superadmin", "subadmin")

    thread = await db.msg_threads.find_one({"id": thread_id}, {"_id": 0})
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    if uid not in thread["participant_ids"] and not is_admin:
        raise HTTPException(status_code=403, detail="Not a participant")

    messages = await db.msg_messages.find(
        {"thread_id": thread_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(300)

    return {"thread": thread, "messages": messages}


# ── POST /threads/{thread_id}/send ────────────────────────────────────────────

@router.post("/threads/{thread_id}/send")
async def send_message(thread_id: str, body: SendMessageBody, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    is_admin = current_user["role"] in ("admin", "superadmin", "subadmin")

    thread = await db.msg_threads.find_one({"id": thread_id}, {"_id": 0})
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Auto-add admin to thread participants if replying from outside
    if is_admin and uid not in thread["participant_ids"]:
        await db.msg_threads.update_one(
            {"id": thread_id},
            {
                "$push": {"participants": {"user_id": uid, "name": current_user["name"], "role": current_user["role"]},
                          "participant_ids": uid},
                "$set": {f"unread.{uid}": 0}
            }
        )
        thread = await db.msg_threads.find_one({"id": thread_id}, {"_id": 0})

    if uid not in thread["participant_ids"]:
        raise HTTPException(status_code=403, detail="Not a participant")

    if not is_admin:
        fresh = await db.users.find_one({"id": uid}, {"_id": 0, "subscription_status": 1})
        if fresh and fresh.get("subscription_status") in ("free", "expired", None):
            raise HTTPException(status_code=403, detail="UPGRADE_REQUIRED: Upgrade to send messages")

    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    msg = {
        "id": str(uuid.uuid4()),
        "thread_id": thread_id,
        "sender_id": uid,
        "sender_name": current_user["name"],
        "sender_role": current_user["role"],
        "content": content,
        "created_at": _now(),
        "read_by": [uid],
    }
    await db.msg_messages.insert_one(msg)
    msg.pop("_id", None)

    unread_set = {}
    for pid in thread["participant_ids"]:
        if pid != uid:
            unread_set[f"unread.{pid}"] = thread.get("unread", {}).get(pid, 0) + 1

    await db.msg_threads.update_one(
        {"id": thread_id},
        {"$set": {"last_message": content[:80], "last_message_at": msg["created_at"], **unread_set}}
    )

    await _push(thread_id, msg, thread["participant_ids"], uid)
    return msg


# ── POST /threads/{thread_id}/read ────────────────────────────────────────────

@router.post("/threads/{thread_id}/read")
async def mark_read(thread_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    await db.msg_threads.update_one({"id": thread_id}, {"$set": {f"unread.{uid}": 0}})
    return {"ok": True}


# ── GET /unread-count ─────────────────────────────────────────────────────────

@router.get("/unread-count")
async def unread_count(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    is_admin = current_user["role"] in ("admin", "superadmin", "subadmin")

    if is_admin:
        threads = await db.msg_threads.find(
            {"$or": [{"type": "admin_chat"}, {"participant_ids": uid}]},
            {"_id": 0, "unread": 1}
        ).to_list(200)
    else:
        threads = await db.msg_threads.find(
            {"participant_ids": uid}, {"_id": 0, "unread": 1}
        ).to_list(100)

    total = sum(t.get("unread", {}).get(uid, 0) for t in threads)
    return {"count": total}
