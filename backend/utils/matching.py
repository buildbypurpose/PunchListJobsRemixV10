"""
Pure-Python weighted matching — no external API calls.

Crew ↔ Job  weights : distance 0.30 | trade 0.40 | skills 0.30
Crew ↔ Contractor   : trade   0.40 | skills 0.40 | rating 0.20
"""
from utils.geocoding import haversine_distance


# ─── helpers ─────────────────────────────────────────────────────────────────

def _trade_score(crew_trade: str, target_trade: str) -> float:
    """Exact = 1.0, partial = 0.6, none = 0.0, missing = 0.4 (neutral)."""
    a = (crew_trade or "").lower().strip()
    b = (target_trade or "").lower().strip()
    if not a or not b:
        return 0.4
    if a == b:
        return 1.0
    if a in b or b in a:
        return 0.6
    return 0.0


def _skill_score(crew_skills: list, reference_text: str) -> float:
    """Fraction of crew skills that appear in reference_text (amplified)."""
    skills = [s.lower() for s in crew_skills if s]
    if not skills:
        return 0.25          # neutral penalty if no skills on profile
    ref = reference_text.lower()
    hits = sum(1 for s in skills if s in ref)
    # Amplify: even 1 hit out of 5 → 0.4 (not 0.2)
    return min(1.0, (hits / len(skills)) * 2.5)


def _distance_score(lat1, lng1, lat2, lng2, radius: float) -> float:
    """Linear decay: 0 miles → 1.0, radius miles → 0.0."""
    if None in (lat1, lng1, lat2, lng2):
        return 0.45          # neutral: no location data
    dist = haversine_distance(lat1, lng1, lat2, lng2)
    return max(0.0, 1.0 - dist / max(radius, 1))


def _rating_score(rating) -> float:
    return min(1.0, float(rating or 0) / 5.0)


# ─── Crew ↔ Job ───────────────────────────────────────────────────────────────

def score_job_for_crew(
    job: dict,
    crew: dict,
    user_lat: float = None,
    user_lng: float = None,
    radius: float = 25,
) -> float:
    """
    Weighted score: how well this job fits the crew member.
      distance 30% | trade 40% | skills 30%
    """
    job_loc = job.get("location") or {}
    dist = _distance_score(
        user_lat, user_lng,
        job_loc.get("lat"), job_loc.get("lng"),
        radius,
    )
    trade = _trade_score(crew.get("trade"), job.get("trade"))

    ref = f"{job.get('trade', '')} {job.get('title', '')} {job.get('description', '')}"
    skills = _skill_score(crew.get("skills", []), ref)

    return round(0.30 * dist + 0.40 * trade + 0.30 * skills, 4)


def sort_jobs_for_crew(
    jobs: list,
    crew: dict,
    user_lat: float = None,
    user_lng: float = None,
    radius: float = 25,
) -> list:
    """Return jobs sorted by descending match_score; score attached to each job dict."""
    scored = []
    for j in jobs:
        score = score_job_for_crew(j, crew, user_lat, user_lng, radius)
        scored.append({**j, "match_score": score})
    return sorted(scored, key=lambda x: x["match_score"], reverse=True)


# ─── Crew ↔ Contractor ────────────────────────────────────────────────────────

def score_crew_for_contractor(
    crew_member: dict,
    trade_query: str = "",
    skills_context: str = "",
) -> float:
    """
    Weighted score: how well this crew member matches a contractor's need.
      trade 40% | skills 40% | rating 20%
    """
    trade = _trade_score(crew_member.get("trade"), trade_query)

    ref = f"{trade_query} {skills_context}"
    skills = _skill_score(crew_member.get("skills", []), ref)

    rating = _rating_score(crew_member.get("rating"))

    return round(0.40 * trade + 0.40 * skills + 0.20 * rating, 4)


def sort_crew_for_contractor(
    crew_list: list,
    trade_query: str = "",
    skills_context: str = "",
) -> list:
    """Return crew sorted by descending match_score; score attached to each dict."""
    scored = []
    for c in crew_list:
        score = score_crew_for_contractor(c, trade_query, skills_context)
        scored.append({**c, "match_score": score})
    return sorted(scored, key=lambda x: x["match_score"], reverse=True)
