"""
Address Service
--------------
Reusable address autofill, reverse-geocode, and validation using
Nominatim (OpenStreetMap). No API key required. Falls back gracefully
to the raw input string when the network is unavailable.

Returned address shape (AddressResult):
  {
      "full_address": str,
      "city":         str,
      "state":        str,
      "country":      str,
      "zipcode":      str,
      "lat":          float | None,
      "lng":          float | None,
      "source":       "nominatim" | "manual"
  }
"""

from __future__ import annotations
import logging
import httpx
from typing import Optional

logger = logging.getLogger(__name__)

_NOMINATIM_URL = "https://nominatim.openstreetmap.org"
_HEADERS = {"User-Agent": "PunchListJobs/1.0 (contact@punchlistjobs.com)"}
_TIMEOUT = 8


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _parse_components(result: dict) -> dict:
    """Extract normalised city / state / country / zipcode from a Nominatim result."""
    addr = result.get("address", {})

    city = (
        addr.get("city")
        or addr.get("town")
        or addr.get("village")
        or addr.get("suburb")
        or addr.get("county")
        or result.get("display_name", "").split(",")[0]
        or ""
    )
    state   = addr.get("state", "")
    country = addr.get("country", "")
    zipcode = addr.get("postcode", "")

    return {
        "city":    city.strip(),
        "state":   state.strip(),
        "country": country.strip(),
        "zipcode": zipcode.strip(),
    }


def _manual_result(raw: str) -> dict:
    """Return a safe fallback result when geocoding is unavailable."""
    return {
        "full_address": raw,
        "city":    "",
        "state":   "",
        "country": "",
        "zipcode": "",
        "lat":     None,
        "lng":     None,
        "source":  "manual",
    }


# ─── Public API ───────────────────────────────────────────────────────────────

async def search_addresses(query: str, limit: int = 5) -> list[dict]:
    """
    Auto-complete / search addresses by free-text query.
    Returns up to `limit` AddressResult dicts ordered by relevance.
    """
    if not query or len(query.strip()) < 3:
        return []

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                f"{_NOMINATIM_URL}/search",
                params={
                    "q":              query,
                    "format":         "json",
                    "addressdetails": 1,
                    "limit":          limit,
                },
                headers=_HEADERS,
            )
            resp.raise_for_status()
            results = resp.json()
    except Exception as e:
        logger.warning(f"[address_service] search_addresses failed: {e}")
        return []

    out = []
    for r in results:
        comps = _parse_components(r)
        out.append({
            "full_address": r.get("display_name", ""),
            "lat":    float(r["lat"]),
            "lng":    float(r["lon"]),
            "source": "nominatim",
            **comps,
        })
    return out


async def reverse_geocode(lat: float, lng: float) -> dict:
    """
    Convert lat/lng coordinates to a structured address.
    Falls back to manual result on failure.
    """
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                f"{_NOMINATIM_URL}/reverse",
                params={"lat": lat, "lon": lng, "format": "json", "addressdetails": 1},
                headers=_HEADERS,
            )
            resp.raise_for_status()
            r = resp.json()

        comps = _parse_components(r)
        return {
            "full_address": r.get("display_name", ""),
            "lat":    lat,
            "lng":    lng,
            "source": "nominatim",
            **comps,
        }
    except Exception as e:
        logger.warning(f"[address_service] reverse_geocode failed ({lat},{lng}): {e}")
        return _manual_result(f"{lat},{lng}")


async def validate_and_parse(raw_address: str) -> dict:
    """
    Validate a free-text address string.
    Returns the best matching AddressResult, or a manual fallback.
    """
    if not raw_address or not raw_address.strip():
        return _manual_result("")

    results = await search_addresses(raw_address, limit=1)
    if results:
        return results[0]

    return _manual_result(raw_address)


async def geocode_to_location(address: str) -> Optional[dict]:
    """
    Convenience wrapper used by job_routes / user_routes.
    Returns {"lat", "lng", "city", "state", "full_address"} or None.
    """
    result = await validate_and_parse(address)
    if result["lat"] is None:
        return None
    return {
        "lat":          result["lat"],
        "lng":          result["lng"],
        "city":         result["city"],
        "state":        result["state"],
        "full_address": result["full_address"],
        "address":      address,
    }
