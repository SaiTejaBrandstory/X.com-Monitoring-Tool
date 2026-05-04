"""Look up public X user fields (name, avatar, canonical username) via X API v2."""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

import httpx

from core.config import settings

logger = logging.getLogger(__name__)

X_API_BASE = "https://api.twitter.com/2"


def _bearer() -> Optional[str]:
    tok = (settings.twitter_bearer_token or os.environ.get("TWITTER_BEARER_TOKEN") or "").strip()
    return tok or None


async def fetch_x_user_public_fields(username: str) -> Optional[Dict[str, Any]]:
    """
    Call GET /2/users/by/username/{username}.

    Returns dict with username, name, profile_image_url, or None if token missing / user not found.
    """
    token = _bearer()
    clean = username.lstrip("@").strip()
    if not token or not clean:
        return None

    url = f"{X_API_BASE}/users/by/username/{clean}"
    params = {
        "user.fields": "name,username,profile_image_url",
    }
    headers = {"Authorization": f"Bearer {token}", "User-Agent": "PersonaRewire/1.0"}

    try:
        async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
            resp = await client.get(url, params=params)
    except httpx.HTTPError as exc:
        logger.warning("X user lookup network error for @%s: %s", clean, exc)
        return None

    if resp.status_code == 404:
        logger.info("X user lookup: @%s not found", clean)
        return None
    if resp.status_code != 200:
        logger.info(
            "X user lookup: @%s HTTP %s %s",
            clean,
            resp.status_code,
            (resp.text or "")[:160],
        )
        return None

    data = resp.json().get("data") or {}
    un = (data.get("username") or clean).lstrip("@")
    name = (data.get("name") or "").strip() or un
    avatar = (data.get("profile_image_url") or "").strip()
    return {
        "username": un,
        "name": name,
        "profile_image_url": avatar,
    }


async def merge_twitter_row(data: Dict[str, Any]) -> Dict[str, Any]:
    """If platform is twitter, fill handle/display/avatar/profile_url from X when possible."""
    if (data.get("platform") or "").lower() != "twitter":
        return data

    raw_handle = (data.get("handle") or "").strip().lstrip("@")
    if not raw_handle:
        return data

    out = dict(data)
    meta = await fetch_x_user_public_fields(raw_handle)

    if not meta:
        if not out.get("profile_url"):
            out["profile_url"] = f"https://x.com/{raw_handle}"
        logger.debug(
            "Twitter profile enrich skipped for @%s (token missing or API miss); using stored fields",
            raw_handle,
        )
        return out

    un = meta["username"]
    out["handle"] = un
    out["display_name"] = meta["name"]
    if meta.get("profile_image_url"):
        out["avatar_url"] = meta["profile_image_url"]
    out["profile_url"] = f"https://x.com/{un}"
    return out
