"""
AI persona suggestion custom API.

Endpoint:
- POST /api/v1/personas/suggest: generate N AI-suggested personas given a category/topic.
"""
import json
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from services.aihub import AIHubService
from schemas.aihub import GenTxtRequest, ChatMessage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/personas", tags=["personas-ai"])


class SuggestPersonasRequest(BaseModel):
    category_name: str
    category_description: Optional[str] = ""
    count: int = 3
    target_platform: str = "twitter"


class SuggestedPersona(BaseModel):
    name: str
    tone_description: str
    style_rules: str  # JSON string
    funnel_stages: str  # JSON string: {"TOFU": "...", "MOFU": "...", "BOFU": "..."}
    default_platform: str = "twitter"
    default_max_words: int = 60
    few_shot_examples: str = "[]"


class SuggestPersonasResponse(BaseModel):
    personas: List[SuggestedPersona]
    model_used: str


def _strip_code_fences(raw: str) -> str:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```", 2)[1]
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip().rstrip("`").strip()
    return cleaned


@router.post("/suggest", response_model=SuggestPersonasResponse)
async def suggest_personas(
    data: SuggestPersonasRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate AI-suggested personas for a category using gpt-5.4."""
    try:
        count = max(1, min(int(data.count or 3), 6))
        service = AIHubService()

        system = (
            "You are a brand voice strategist. Given a content category, invent distinctive "
            "writing personas that a creator could use to repurpose viral content. Each persona "
            "must feel clearly different (voice, angle, audience). For EACH persona also produce "
            "funnel stage content guidance for TOFU (awareness/educational), MOFU (consideration/"
            "comparison, how-to, case study), and BOFU (decision/offer/CTA).\n\n"
            "Reply with ONLY valid JSON — no markdown, no prose. Schema:\n"
            "{\n"
            '  "personas": [\n'
            "    {\n"
            '      "name": "short memorable persona name",\n'
            '      "tone_description": "1-2 sentences on voice, vibe, POV",\n'
            '      "style_rules": ["rule 1", "rule 2", "forbidden: ..."] ,\n'
            '      "funnel_stages": {\n'
            '        "TOFU": "1-2 sentence content guidance for top of funnel",\n'
            '        "MOFU": "1-2 sentence content guidance for middle",\n'
            '        "BOFU": "1-2 sentence content guidance for bottom"\n'
            "      },\n"
            '      "few_shot_examples": ["<= 280 char example post 1", "example 2"]\n'
            "    }\n"
            "  ]\n"
            "}"
        )

        user_msg = (
            f"Category: {data.category_name}\n"
            f"Category description: {data.category_description or '(none)'}\n"
            f"Target platform: {data.target_platform}\n"
            f"Generate exactly {count} distinct personas."
        )

        request = GenTxtRequest(
            messages=[
                ChatMessage(role="system", content=system),
                ChatMessage(role="user", content=user_msg),
            ],
            model="gpt-5.4",
        )
        response = await service.gentxt(request)
        raw = _strip_code_fences(response.content or "")

        try:
            parsed = json.loads(raw)
        except Exception as e:
            logger.error(f"Failed to parse persona JSON: {e}; raw={raw[:400]}")
            raise HTTPException(status_code=500, detail="AI returned invalid JSON")

        items = parsed.get("personas", []) or []
        out: List[SuggestedPersona] = []
        for item in items[:count]:
            style_rules = item.get("style_rules", [])
            if isinstance(style_rules, list):
                style_rules_str = json.dumps(style_rules)
            else:
                style_rules_str = json.dumps([str(style_rules)])

            funnel = item.get("funnel_stages", {}) or {}
            if not isinstance(funnel, dict):
                funnel = {}
            funnel_norm = {
                "TOFU": str(funnel.get("TOFU", "")),
                "MOFU": str(funnel.get("MOFU", "")),
                "BOFU": str(funnel.get("BOFU", "")),
            }

            examples = item.get("few_shot_examples", [])
            if not isinstance(examples, list):
                examples = [str(examples)]
            examples_str = json.dumps([str(x) for x in examples])

            out.append(
                SuggestedPersona(
                    name=str(item.get("name", "Untitled persona")).strip()[:80],
                    tone_description=str(item.get("tone_description", "")).strip(),
                    style_rules=style_rules_str,
                    funnel_stages=json.dumps(funnel_norm),
                    default_platform=data.target_platform or "twitter",
                    default_max_words=60,
                    few_shot_examples=examples_str,
                )
            )

        if not out:
            raise HTTPException(status_code=500, detail="AI returned no personas")

        return SuggestPersonasResponse(personas=out, model_used="gpt-5.4")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"suggest_personas error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to suggest personas: {str(e)}")