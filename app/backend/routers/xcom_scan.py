"""X.com (Twitter) scan router — powered by the real X API v2.

Fetches posts from monitored X.com profiles in real time using Twitter/X API v2
(`GET /2/users/by/username/{username}` + `GET /2/users/{id}/tweets`). Requires
`TWITTER_BEARER_TOKEN` in the environment. Results are persisted into
`ingested_posts` (deduped by raw_url).
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from dependencies.auth import get_current_user
from models.ingested_posts import Ingested_posts
from models.monitored_profiles import Monitored_profiles
from schemas.auth import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/xcom", tags=["xcom"])

X_API_BASE = "https://api.twitter.com/2"


def _twitter_profile_scan_filter():
    """Match UI semantics: active = not explicitly False (includes NULL/unset)."""
    return or_(
        Monitored_profiles.is_active.is_(True),
        Monitored_profiles.is_active.is_(None),
    )


def _x_error_detail(body: Any) -> str:
    """Best-effort message from X API JSON error payloads."""
    if isinstance(body, dict):
        errs = body.get("errors")
        if isinstance(errs, list) and errs:
            parts: List[str] = []
            for e in errs[:4]:
                if isinstance(e, dict):
                    chunk = (
                        e.get("detail")
                        or e.get("message")
                        or e.get("title")
                    )
                    if chunk:
                        parts.append(str(chunk))
            if parts:
                return "; ".join(parts)
        for key in ("detail", "title", "type"):
            v = body.get(key)
            if v and isinstance(v, str):
                return v[:500]
    return str(body)[:300]


# ----------------------------- Schemas -----------------------------
class XcomScanRequest(BaseModel):
    """Request body for triggering a live X.com scan."""

    profile_ids: Optional[List[int]] = Field(
        default=None,
        description="Only these monitored X.com profiles are scanned. Empty = all active.",
    )
    posts_per_profile: int = Field(
        default=10, ge=5, le=100, description="Max posts to fetch per profile (X API: 5-100)."
    )
    date_from: Optional[str] = Field(
        default=None, description="ISO date (YYYY-MM-DD). Sent as start_time to X API."
    )
    date_to: Optional[str] = Field(
        default=None, description="ISO date (YYYY-MM-DD). Sent as end_time to X API."
    )
    dry_run: bool = Field(
        default=False,
        description="If true, do not persist — return fetched posts as preview.",
    )


class XcomProfileResult(BaseModel):
    profile_id: int
    handle: str
    fetched: int
    saved: int
    status: str
    error: Optional[str] = None


class XcomScanResponse(BaseModel):
    total_fetched: int
    total_saved: int
    profiles: List[XcomProfileResult]
    using_mock: bool = False  # kept for frontend compat; always False now
    started_at: str
    finished_at: str
    posts: Optional[List[Dict[str, Any]]] = None


# ----------------------------- Helpers -----------------------------
def _get_bearer_token() -> str:
    token = (settings.twitter_bearer_token or os.environ.get("TWITTER_BEARER_TOKEN") or "").strip()
    if not token:
        raise HTTPException(
            status_code=500,
            detail="TWITTER_BEARER_TOKEN is not configured on the server.",
        )
    return token


def _to_iso8601_z(date_str: Optional[str], end_of_day: bool = False) -> Optional[str]:
    """Convert YYYY-MM-DD (or full ISO) to RFC 3339 UTC as required by X API."""
    if not date_str:
        return None
    s = date_str.strip()
    try:
        if len(s) == 10:  # YYYY-MM-DD
            suffix = "T23:59:59Z" if end_of_day else "T00:00:00Z"
            return f"{s}{suffix}"
        # Already a full datetime; normalize to Z
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:  # noqa: BLE001
        return None


def _raise_for_x_api(resp: httpx.Response, handle: str) -> None:
    """Translate X API error responses into user-friendly HTTPException."""
    if resp.status_code == 200:
        return
    retry_after = resp.headers.get("retry-after") or resp.headers.get("x-rate-limit-reset")
    if resp.status_code == 401:
        raise HTTPException(
            status_code=502,
            detail="X API auth failed — check TWITTER_BEARER_TOKEN.",
        )
    if resp.status_code == 429:
        raise HTTPException(
            status_code=429,
            detail=f"X API rate limit reached — retry in {retry_after or '?'}s.",
        )
    if resp.status_code == 403:
        raise HTTPException(
            status_code=403,
            detail=f"Profile @{handle.lstrip('@')} is protected, suspended or not accessible.",
        )
    if resp.status_code == 404:
        raise HTTPException(
            status_code=404,
            detail=f"Profile @{handle.lstrip('@')} not found on X.",
        )
    # generic
    try:
        body = resp.json()
        detail_txt = _x_error_detail(body)
    except Exception:  # noqa: BLE001
        detail_txt = resp.text[:300]
    raise HTTPException(
        status_code=502,
        detail=f"X API error {resp.status_code}: {detail_txt}",
    )


async def _resolve_user_id(
    client: httpx.AsyncClient, handle: str, cache: Dict[str, str]
) -> str:
    """Resolve a username to numeric X user_id, with in-memory cache."""
    clean = handle.lstrip("@").strip()
    if clean in cache:
        return cache[clean]
    url = f"{X_API_BASE}/users/by/username/{clean}"
    params = {"user.fields": "profile_image_url,name,username"}
    resp = await client.get(url, params=params)
    _raise_for_x_api(resp, clean)
    data = resp.json().get("data") or {}
    user_id = data.get("id")
    if not user_id:
        raise HTTPException(
            status_code=404, detail=f"Profile @{clean} not found on X."
        )
    cache[clean] = str(user_id)
    # Stash profile meta too for reuse
    cache[f"__meta__{clean}"] = {
        "name": data.get("name"),
        "username": data.get("username"),
        "profile_image_url": data.get("profile_image_url"),
    }  # type: ignore[assignment]
    return str(user_id)


async def _fetch_user_tweets(
    client: httpx.AsyncClient,
    user_id: str,
    handle: str,
    max_results: int,
    start_time: Optional[str],
    end_time: Optional[str],
) -> tuple[List[Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    """Call `GET /2/users/{id}/tweets` with media expansions when the API accepts them."""
    url = f"{X_API_BASE}/users/{user_id}/tweets"
    # X API v2 requires max_results between 5 and 100
    capped = max(5, min(100, max_results))
    time_params: Dict[str, Any] = {}
    if start_time:
        time_params["start_time"] = start_time
    if end_time:
        time_params["end_time"] = end_time

    expanded: Dict[str, Any] = {
        "max_results": capped,
        "tweet.fields": "created_at,public_metrics,text,entities,attachments,lang",
        "exclude": "retweets,replies",
        "expansions": "attachments.media_keys",
        # Omit variants/duration_ms — some apps/tiers return 400 for non-default field sets.
        "media.fields": "media_key,type,url,preview_image_url,alt_text,width,height",
        **time_params,
    }

    resp = await client.get(url, params=expanded)
    if resp.status_code == 400:
        logger.warning(
            "X API 400 for @%s (expanded timeline). Retrying without media. Body: %s",
            handle.lstrip("@"),
            resp.text[:400],
        )
        minimal: Dict[str, Any] = {
            "max_results": capped,
            "tweet.fields": "created_at,public_metrics,text,entities,lang",
            "exclude": "retweets,replies",
            **time_params,
        }
        resp = await client.get(url, params=minimal)

    _raise_for_x_api(resp, handle)
    payload = resp.json()
    tweets = payload.get("data") or []
    includes = payload.get("includes") or {}
    media_list = includes.get("media") or []
    media_by_key: Dict[str, Dict[str, Any]] = {}
    for m in media_list:
        mk = m.get("media_key")
        if mk:
            media_by_key[str(mk)] = m
    # Trim to requested number (user may have requested less than the 5-min floor)
    return tweets[:max_results], media_by_key


def _extract_tweet_media(tweet: Dict[str, Any], media_by_key: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Build lightweight media descriptors for persistence + UI."""
    out: List[Dict[str, Any]] = []
    attachments = tweet.get("attachments") or {}
    for k in attachments.get("media_keys") or []:
        key = str(k)
        m = media_by_key.get(key)
        if not m:
            continue
        mt = (m.get("type") or "").lower()
        alt = m.get("alt_text")
        if mt == "photo" and m.get("url"):
            item: Dict[str, Any] = {"type": "photo", "url": m["url"]}
            if alt:
                item["alt_text"] = alt
            out.append(item)
        elif mt in ("animated_gif", "video"):
            pv = m.get("preview_image_url")
            if pv:
                out.append({"type": mt, "preview_url": pv, "alt_text": alt})
        elif m.get("url"):
            item = {"type": mt or "media", "url": m["url"]}
            if alt:
                item["alt_text"] = alt
            out.append(item)
        elif m.get("preview_image_url"):
            out.append({"type": mt or "media", "preview_url": m["preview_image_url"], "alt_text": alt})
    return out


def _extract_tweet_urls(tweet: Dict[str, Any]) -> List[Dict[str, str]]:
    ents = tweet.get("entities") or {}
    raw = ents.get("urls") or []
    out: List[Dict[str, str]] = []
    for u in raw:
        if not isinstance(u, dict):
            continue
        exp = u.get("expanded_url") or u.get("url")
        if not exp:
            continue
        out.append(
            {
                "expanded_url": exp,
                "display_url": u.get("display_url") or exp,
            }
        )
    return out


def _build_post_extras(tweet: Dict[str, Any], media_by_key: Dict[str, Dict[str, Any]]) -> Optional[str]:
    media = _extract_tweet_media(tweet, media_by_key)
    urls = _extract_tweet_urls(tweet)
    if not media and not urls:
        return None
    return json.dumps({"media": media, "urls": urls}, separators=(",", ":"))


def _normalize_tweet(
    tweet: Dict[str, Any],
    profile: Monitored_profiles,
    author_meta: Dict[str, Any],
    media_by_key: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    metrics = tweet.get("public_metrics") or {}
    tweet_id = tweet.get("id") or ""
    username = (author_meta.get("username") or profile.handle or "").lstrip("@")
    return {
        "external_id": str(tweet_id),
        "profile_id": profile.id,
        "platform": "twitter",
        "author_handle": username,
        "author_name": author_meta.get("name") or profile.display_name or profile.handle,
        "author_avatar": author_meta.get("profile_image_url") or profile.avatar_url or "",
        "content": tweet.get("text") or "",
        "likes": int(metrics.get("like_count") or 0),
        "retweets": int(metrics.get("retweet_count") or 0),
        "replies": int(metrics.get("reply_count") or 0),
        "posted_at": tweet.get("created_at") or datetime.now(timezone.utc).isoformat(),
        "raw_url": f"https://x.com/{username}/status/{tweet_id}" if tweet_id else "",
        "category_id": profile.category_id,
        "post_extras": _build_post_extras(tweet, media_by_key),
    }


def _compute_engagement(item: Dict[str, Any]) -> float:
    return float(
        (item.get("likes") or 0)
        + 2.0 * (item.get("retweets") or 0)
        + 1.5 * (item.get("replies") or 0)
    )


def _compute_trend(score: float, prev_score: Optional[float]) -> str:
    if prev_score is None:
        return "flat"
    if score > prev_score * 1.1:
        return "up"
    if score < prev_score * 0.9:
        return "down"
    return "flat"


async def _persist_posts(db: AsyncSession, items: List[Dict[str, Any]]) -> int:
    if not items:
        return 0
    saved = 0
    for item in items:
        raw_url = item.get("raw_url") or ""
        if raw_url:
            existing = await db.execute(
                select(Ingested_posts)
                .where(Ingested_posts.platform == "twitter")
                .where(Ingested_posts.raw_url == raw_url)
                .limit(1)
            )
            existing_row = existing.scalar_one_or_none()
            if existing_row:
                prev_score = existing_row.engagement_score
                new_score = _compute_engagement(item)
                existing_row.likes = item.get("likes") or 0
                existing_row.retweets = item.get("retweets") or 0
                existing_row.replies = item.get("replies") or 0
                existing_row.engagement_score = new_score
                existing_row.virality_trend = _compute_trend(new_score, prev_score)
                existing_row.is_new = False
                if item.get("content"):
                    existing_row.content = item["content"]
                if item.get("post_extras"):
                    existing_row.post_extras = item["post_extras"]
                continue

        score = _compute_engagement(item)
        row = Ingested_posts(
            profile_id=item.get("profile_id"),
            platform="twitter",
            author_handle=item.get("author_handle"),
            author_name=item.get("author_name"),
            author_avatar=item.get("author_avatar"),
            content=item.get("content") or "",
            post_extras=item.get("post_extras"),
            likes=item.get("likes") or 0,
            retweets=item.get("retweets") or 0,
            replies=item.get("replies") or 0,
            engagement_score=score,
            virality_trend=_compute_trend(score, None),
            posted_at=item.get("posted_at"),
            raw_url=raw_url,
            category_id=item.get("category_id"),
            is_new=True,
        )
        db.add(row)
        saved += 1
    await db.commit()
    return saved


# ----------------------------- Routes -----------------------------
@router.post("/scan", response_model=XcomScanResponse)
async def scan_xcom(
    body: XcomScanRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Live-scan X.com profiles via X API v2 and persist results."""
    token = _get_bearer_token()
    started = datetime.now(timezone.utc).isoformat()

    profiles_q = select(Monitored_profiles).where(Monitored_profiles.platform == "twitter")
    if body.profile_ids:
        profiles_q = profiles_q.where(Monitored_profiles.id.in_(body.profile_ids))
    else:
        profiles_q = profiles_q.where(_twitter_profile_scan_filter())
    profiles = (await db.execute(profiles_q)).scalars().all()

    if not profiles:
        raise HTTPException(
            status_code=400,
            detail=(
                "No matching X.com profiles to scan. Add profiles on the Profiles tab, "
                "or pass valid profile_ids."
            ),
        )

    start_time = _to_iso8601_z(body.date_from, end_of_day=False)
    end_time = _to_iso8601_z(body.date_to, end_of_day=True)

    results: List[XcomProfileResult] = []
    all_items: List[Dict[str, Any]] = []
    user_id_cache: Dict[str, Any] = {}

    headers = {"Authorization": f"Bearer {token}", "User-Agent": "ViralFeed/1.0"}
    async with httpx.AsyncClient(timeout=30.0, headers=headers) as client:
        for profile in profiles:
            fetched = 0
            saved = 0
            error: Optional[str] = None
            status_value = "ok"
            items: List[Dict[str, Any]] = []
            try:
                handle_clean = profile.handle.lstrip("@").strip()
                user_id = await _resolve_user_id(client, handle_clean, user_id_cache)
                author_meta = user_id_cache.get(f"__meta__{handle_clean}") or {}
                tweets, media_lookup = await _fetch_user_tweets(
                    client=client,
                    user_id=user_id,
                    handle=handle_clean,
                    max_results=body.posts_per_profile,
                    start_time=start_time,
                    end_time=end_time,
                )
                items = [_normalize_tweet(t, profile, author_meta, media_lookup) for t in tweets]
                fetched = len(items)
                all_items.extend(items)
                if not body.dry_run:
                    saved = await _persist_posts(db, items)
            except HTTPException as he:
                status_value = "error"
                error = str(he.detail)
                logger.warning("X scan failed for @%s: %s", profile.handle, error)
            except httpx.HTTPError as e:
                status_value = "error"
                error = f"Network error contacting X API: {e}"
                logger.warning("X scan network error for @%s: %s", profile.handle, error)
            except Exception as e:  # noqa: BLE001
                status_value = "error"
                error = str(e)
                logger.exception("X scan unexpected failure for @%s", profile.handle)

            results.append(
                XcomProfileResult(
                    profile_id=profile.id,
                    handle=profile.handle,
                    fetched=fetched,
                    saved=saved,
                    status=status_value,
                    error=error,
                )
            )

    finished = datetime.now(timezone.utc).isoformat()
    return XcomScanResponse(
        total_fetched=sum(r.fetched for r in results),
        total_saved=sum(r.saved for r in results),
        profiles=results,
        using_mock=False,
        started_at=started,
        finished_at=finished,
        posts=all_items if body.dry_run else None,
    )


@router.delete("/clear-feed")
async def clear_xcom_feed(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove all ingested X.com (twitter) posts.

    Useful for purging stale mock/seed data before running a fresh live scan.
    Requires the caller to be authenticated.
    """
    # Count first so we can report it
    existing = (
        await db.execute(
            select(Ingested_posts).where(Ingested_posts.platform == "twitter")
        )
    ).scalars().all()
    count = len(existing)
    if count:
        await db.execute(
            delete(Ingested_posts).where(Ingested_posts.platform == "twitter")
        )
        await db.commit()
    logger.info("User %s cleared %d twitter posts from ingested_posts", current_user.id, count)
    return {"deleted": count, "platform": "twitter"}


@router.get("/status")
async def xcom_status(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return whether the X API bearer token is configured and profile counts."""
    token = (settings.twitter_bearer_token or os.environ.get("TWITTER_BEARER_TOKEN") or "").strip()
    has_token = bool(token)

    profiles_count = (
        await db.execute(
            select(Monitored_profiles)
            .where(Monitored_profiles.platform == "twitter")
            .where(_twitter_profile_scan_filter())
        )
    ).scalars().all()

    return {
        "has_active_api_space": has_token,
        "has_token": has_token,
        "using_mock": False,
        "active_profiles": len(profiles_count),
        "api_space_label": "X API v2 (live)" if has_token else None,
        "provider": "x_api_v2",
    }