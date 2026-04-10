"""
Email utilities - currently in silent/mock mode.
All email functions log but do not send actual emails.
To enable: set RESEND_API_KEY and SENDER_EMAIL environment variables.
"""
import logging
import os

logger = logging.getLogger(__name__)

RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'noreply@punchlistjobs.com')


def is_free_tier(user: dict | None) -> bool:
    """Return True if user is on a free or expired subscription."""
    if not user:
        return True
    return user.get("subscription_status") in ("free", "expired", None)


async def send_email(to: str, subject: str, html: str, sender_user: dict | None = None) -> bool:
    """Send an email. If sender_user is provided, block free-tier users."""
    if sender_user and is_free_tier(sender_user):
        logger.info(f"[EMAIL BLOCKED] Free-tier user tried to send email to: {to} | Subject: {subject}")
        return False
    if not RESEND_API_KEY:
        logger.info(f"[EMAIL MOCK] To: {to} | Subject: {subject}")
        return True
    try:
        import resend
        resend.api_key = RESEND_API_KEY
        import asyncio
        params = {"from": SENDER_EMAIL, "to": [to], "subject": subject, "html": html}
        await asyncio.to_thread(resend.Emails.send, params)
        return True
    except Exception as e:
        logger.error(f"Email send failed: {e}")
        return False


async def send_welcome_email(name: str, email: str, role: str):
    await send_email(email, "Welcome to PunchListJobs!", f"<p>Welcome {name}! Your {role} account is ready.</p>")


async def send_job_notification_email(crew_email: str, crew_name: str, job_title: str, pay_rate: float, location: str, sender_user: dict | None = None):
    await send_email(crew_email, f"New Job: {job_title}", f"<p>Hi {crew_name}, a new job is available: {job_title} at ${pay_rate}/hr.</p>", sender_user=sender_user)


async def send_job_completion_email(contractor_email: str, contractor_name: str, job_title: str, sender_user: dict | None = None):
    await send_email(contractor_email, f"Job Completed: {job_title}", f"<p>Hi {contractor_name}, your job '{job_title}' has been marked complete.</p>", sender_user=sender_user)


async def send_subscription_email(email: str, name: str, plan: str, end_date: str, is_reminder: bool = False):
    subject = "Subscription Reminder - PunchListJobs" if is_reminder else "Subscription Activated - PunchListJobs"
    await send_email(email, subject, f"<p>Hi {name}, your {plan} subscription {'expires soon' if is_reminder else 'is active'} until {end_date}.</p>")
