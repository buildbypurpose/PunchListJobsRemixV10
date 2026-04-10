"""
Address Routes  –  /api/utils/address/*
-----------------------------------------
Thin HTTP wrapper around utils/address_service.py.
All endpoints require authentication to prevent abuse.
"""

from fastapi import APIRouter, Query, Depends, HTTPException
from pydantic import BaseModel
from auth import get_current_user
from utils.address_service import search_addresses, reverse_geocode, validate_and_parse

router = APIRouter()


class ReverseRequest(BaseModel):
    lat: float
    lng: float


class ValidateRequest(BaseModel):
    address: str


@router.get("/search")
async def address_search(
    q: str = Query(..., min_length=3, description="Address search query"),
    limit: int = Query(5, ge=1, le=10),
    _: dict = Depends(get_current_user),
):
    """
    Auto-complete: return up to `limit` address suggestions for `q`.

    Response: list of { full_address, city, state, country, zipcode, lat, lng, source }
    """
    results = await search_addresses(q, limit=limit)
    return {"query": q, "results": results, "count": len(results)}


@router.post("/reverse")
async def address_reverse(
    data: ReverseRequest,
    _: dict = Depends(get_current_user),
):
    """
    Reverse-geocode lat/lng → structured address.

    Response: { full_address, city, state, country, zipcode, lat, lng, source }
    """
    result = await reverse_geocode(data.lat, data.lng)
    return result


@router.post("/validate")
async def address_validate(
    data: ValidateRequest,
    _: dict = Depends(get_current_user),
):
    """
    Validate and normalise a free-text address.
    Returns best match or manual fallback (source="manual").
    """
    if not data.address.strip():
        raise HTTPException(status_code=400, detail="Address must not be empty")
    result = await validate_and_parse(data.address)
    return result
