"""
AI Rewrite custom API.

Provides two endpoints:
- /api/v1/rewrite/extract_hook: extract the hook (model: APP_AI_EXTRACT_HOOK_MODEL)
- /api/v1/rewrite/generate: rewrite in persona voice (model: APP_AI_REWRITE_MODEL)
"""
import json
import logging
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from services.aihub import AIHubService
from schemas.aihub import GenTxtRequest, ChatMessage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/rewrite", tags=["rewrite"])


class ExtractHookRequest(BaseModel):
    content: str


class ExtractHookResponse(BaseModel):
    hook: str
    hook_type: str  # stat, question, claim, curiosity


class GenerateRewriteRequest(BaseModel):
    original_content: str
    original_hook: Optional[str] = None
    persona_name: str
    persona_tone: str
    persona_style_rules: Optional[str] = ""
    few_shot_examples: Optional[List[str]] = []
    target_platform: str = "twitter"  # twitter or linkedin
    max_words: int = 60
    max_chars: int = 280
    lock_hook: bool = False
    funnel_stage: Optional[str] = None  # "TOFU" | "MOFU" | "BOFU"
    funnel_stage_guidance: Optional[str] = None


class GenerateRewriteResponse(BaseModel):
    rewritten_content: str
    hook: str
    word_count: int
    char_count: int
    model_used: str
    tokens_input: int
    tokens_output: int


def _word_count(text: str) -> int:
    return len([w for w in text.split() if w.strip()])


# Default funnel-stage instructions used when the persona has no
# stage-specific guidance.
_DEFAULT_STAGE_GUIDANCE = {
    "TOFU": (
        "Earn attention. Open with a contrarian hook or pattern interrupt, "
        "tease insight, no CTA needed. Feel like a thought, not a sales pitch."
    ),
    "MOFU": (
        "Educate and differentiate. Use frameworks, comparisons, case snippets, "
        "teach the 'how'. End with a soft nudge (learn more / DM me)."
    ),
    "BOFU": (
        "Drive decision. Use proof, specificity, ROI language, a single clear CTA, "
        "urgency without hype. Make the next step obvious."
    ),
}

# Platform-specific best-practice guidance that is injected verbatim into the
# system prompt so the model actually adapts voice and structure per platform.
_PLATFORM_GUIDANCE = {
    "twitter": (
        "Twitter/X: punchy, thread-style rhythm. Short declarative lines. "
        "No hashtag soup. Strong opener in the first 7 words. "
        "Hard ceiling ~280 characters per post unit."
    ),
    "linkedin": (
        "LinkedIn: narrative + insight. Hook line, one empty line, then a short "
        "story or framework in 3-5 short paragraphs. Use line breaks for rhythm. "
        "End with a reflective question or soft CTA. Aim for ~1300 characters."
    ),
    "instagram": (
        "Instagram: visual-first caption. Emotional, sensory opener. "
        "Short lines, emoji used sparingly for rhythm, ends with an engagement prompt."
    ),
}


@router.post("/extract_hook", response_model=ExtractHookResponse)
async def extract_hook(
    data: ExtractHookRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Extract the opening hook (model from APP_AI_EXTRACT_HOOK_MODEL; default DeepSeek via OpenRouter)."""
    try:
        service = AIHubService()
        hook_model = settings.app_ai_extract_hook_model
        system = (
            "You analyze social media posts and extract the opening HOOK — the first "
            "attention-grabbing element. Classify it as one of: stat, question, claim, "
            "curiosity. Reply ONLY with JSON: {\"hook\": \"...\", \"hook_type\": \"...\"}."
        )
        user_msg = f"Extract the hook from this post:\n\n{data.content}"

        request = GenTxtRequest(
            messages=[
                ChatMessage(role="system", content=system),
                ChatMessage(role="user", content=user_msg),
            ],
            model=hook_model,
        )
        response = await service.gentxt(request)
        raw = response.content.strip()

        hook = raw
        hook_type = "claim"
        try:
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("```", 2)[1]
                if cleaned.lower().startswith("json"):
                    cleaned = cleaned[4:]
                cleaned = cleaned.strip().rstrip("`").strip()
            parsed = json.loads(cleaned)
            hook = parsed.get("hook", raw) or raw
            hook_type = parsed.get("hook_type", "claim") or "claim"
        except Exception:
            first_line = data.content.split("\n")[0].split(".")[0].strip()
            hook = first_line[:120] if first_line else data.content[:120]

        return ExtractHookResponse(hook=hook, hook_type=hook_type)
    except Exception as e:
        logger.error(f"extract_hook error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to extract hook: {str(e)}")


@router.post("/generate", response_model=GenerateRewriteResponse)
async def generate_rewrite(
    data: GenerateRewriteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Rewrite in persona voice (model from APP_AI_REWRITE_MODEL; default deepseek/deepseek-chat on OpenRouter).

    The system prompt ties together persona, target platform, funnel stage,
    and the max-words target so the output honors every input the user set.
    """
    try:
        service = AIHubService()
        rewrite_model = settings.app_ai_rewrite_model

        # --- Normalize + resolve inputs ---
        max_words = max(20, int(data.max_words or 60))
        # Soft lower bound: we want the model to aim close to the target,
        # not land dramatically below it.
        min_words = max(int(max_words * 0.7), max(20, max_words - 40))
        # max_tokens budget: ~1.5 tokens per word is a safe upper bound,
        # plus a small buffer for punctuation.
        max_tokens_budget = int(max_words * 1.8) + 80
        max_tokens_budget = min(max_tokens_budget, 4096)

        platform_key = (data.target_platform or "twitter").lower()
        platform_note = _PLATFORM_GUIDANCE.get(
            platform_key, _PLATFORM_GUIDANCE["twitter"]
        )

        style_rules = data.persona_style_rules or "No additional rules."
        examples = "\n\n".join(
            [f"Example {i + 1}: {ex}" for i, ex in enumerate(data.few_shot_examples or []) if ex]
        ) or "(no examples)"

        hook_instruction = ""
        if data.lock_hook and data.original_hook:
            hook_instruction = (
                f"\n\nCRITICAL: You MUST preserve this exact hook at the start of your rewrite: "
                f"\"{data.original_hook}\". Do not paraphrase it."
            )

        # --- Funnel stage block (always present, with sane defaults) ---
        if data.funnel_stage:
            stage = data.funnel_stage.upper()
        else:
            stage = "MOFU"  # sensible default when caller omits it
        stage_guidance = (
            (data.funnel_stage_guidance or "").strip()
            or _DEFAULT_STAGE_GUIDANCE.get(stage, _DEFAULT_STAGE_GUIDANCE["MOFU"])
        )

        system = f"""You are a world-class B2B copywriter known for high-converting, human-sounding copy that avoids generic AI phrasing. You do not use words like "unlock", "leverage", "delve", "game-changer", "in today's fast-paced world", or other telltale AI clichés unless they are clearly justified.

Your job: rewrite the ORIGINAL post so it feels like it was written BY the PERSONA below, FOR the TARGET PLATFORM below, at the specified FUNNEL STAGE, within the WORD BUDGET. Every sentence must earn its place.

=== PERSONA ===
Name: {data.persona_name}
Tone: {data.persona_tone}
Style rules: {style_rules}

Few-shot examples of this persona's voice:
{examples}

=== TARGET PLATFORM ===
{platform_key.upper()} — {platform_note}

=== FUNNEL STAGE ===
Stage: {stage}
Stage intent: {stage_guidance}
The copy must clearly behave like {stage} content — not generic content that vaguely fits any stage.

=== LENGTH BUDGET (HARD REQUIREMENT) ===
Target length: around {max_words} words.
Acceptable range: {min_words}–{max_words} words.
Aim for close to {max_words} words, not drastically shorter. A 30-word reply when the target is {max_words} is a failure.
Character ceiling: {data.max_chars} characters max.

=== ORIGINALITY & COMPLIANCE ===
- Frame the output as an ORIGINAL ADAPTATION / INSPIRATION, never a direct repost.
- Do not copy any verbatim phrase longer than 5 words from the original.
- Keep the core INSIGHT of the original, but express it in the persona's voice.{hook_instruction}

=== OUTPUT CONTRACT ===
Return ONLY the rewritten post text. No preamble. No explanations. No quotes. No markdown fences. No meta commentary. Just the post, ready to publish."""

        user_msg = (
            "Rewrite this post in the persona's voice, for the specified platform, "
            f"at the {stage} funnel stage, aiming for ~{max_words} words:\n\n"
            f"---ORIGINAL---\n{data.original_content}\n---END---"
        )

        request = GenTxtRequest(
            messages=[
                ChatMessage(role="system", content=system),
                ChatMessage(role="user", content=user_msg),
            ],
            model=rewrite_model,
            temperature=0.8,
            max_tokens=max_tokens_budget,
        )
        response = await service.gentxt(request)
        rewritten = response.content.strip()

        # Strip any enclosing quotes or code fences
        if rewritten.startswith("```"):
            rewritten = rewritten.split("```", 2)[1]
            if rewritten.lower().startswith("text") or rewritten.lower().startswith("markdown"):
                rewritten = rewritten.split("\n", 1)[1] if "\n" in rewritten else rewritten
            rewritten = rewritten.strip().rstrip("`").strip()
        if rewritten.startswith('"') and rewritten.endswith('"'):
            rewritten = rewritten[1:-1].strip()

        word_count = _word_count(rewritten)
        char_count = len(rewritten)

        # Retry once if the model drastically undershot the word budget.
        # This handles the common case where a small model ignores length hints.
        if word_count < min_words and max_words >= 60:
            logger.info(
                f"Rewrite undershot word budget ({word_count} < {min_words}), retrying with expansion."
            )
            expansion_user_msg = (
                f"Your previous draft was only {word_count} words, but the target was "
                f"around {max_words} words (acceptable range {min_words}-{max_words}). "
                "Rewrite it again — same persona, same platform, same funnel stage — "
                "but expand with more concrete substance (specific examples, one "
                "piece of proof or a micro-story, a sharper insight) so it lands "
                f"close to {max_words} words. Do NOT pad with filler. "
                "Return ONLY the rewritten post text.\n\n"
                f"---ORIGINAL---\n{data.original_content}\n---END---\n\n"
                f"---PREVIOUS DRAFT ({word_count} words)---\n{rewritten}\n---END---"
            )
            retry_req = GenTxtRequest(
                messages=[
                    ChatMessage(role="system", content=system),
                    ChatMessage(role="user", content=expansion_user_msg),
                ],
                model=rewrite_model,
                temperature=0.8,
                max_tokens=max_tokens_budget,
            )
            try:
                retry_resp = await service.gentxt(retry_req)
                retry_text = retry_resp.content.strip()
                if retry_text.startswith("```"):
                    retry_text = retry_text.split("```", 2)[1]
                    if retry_text.lower().startswith("text") or retry_text.lower().startswith("markdown"):
                        retry_text = retry_text.split("\n", 1)[1] if "\n" in retry_text else retry_text
                    retry_text = retry_text.strip().rstrip("`").strip()
                if retry_text.startswith('"') and retry_text.endswith('"'):
                    retry_text = retry_text[1:-1].strip()
                retry_wc = _word_count(retry_text)
                if retry_wc > word_count:
                    rewritten = retry_text
                    word_count = retry_wc
                    char_count = len(rewritten)
                    # Merge token usage from both calls for accurate cost logging.
                    r1_in = getattr(response, "prompt_tokens", 0) or 0
                    r1_out = getattr(response, "completion_tokens", 0) or 0
                    r2_in = getattr(retry_resp, "prompt_tokens", 0) or 0
                    r2_out = getattr(retry_resp, "completion_tokens", 0) or 0
                    tokens_input = (r1_in + r2_in) or int(
                        (len(system) + len(user_msg) + len(expansion_user_msg)) / 4
                    )
                    tokens_output = (r1_out + r2_out) or int(
                        (len(response.content) + len(retry_resp.content)) / 4
                    )
                    return GenerateRewriteResponse(
                        rewritten_content=rewritten,
                        hook=data.original_hook or "",
                        word_count=word_count,
                        char_count=char_count,
                        model_used=rewrite_model,
                        tokens_input=tokens_input,
                        tokens_output=tokens_output,
                    )
            except Exception as retry_err:
                logger.warning(f"rewrite expansion retry failed: {retry_err}")

        tokens_input = getattr(response, "prompt_tokens", None) or int(len(system + user_msg) / 4)
        tokens_output = getattr(response, "completion_tokens", None) or int(len(rewritten) / 4)

        return GenerateRewriteResponse(
            rewritten_content=rewritten,
            hook=data.original_hook or "",
            word_count=word_count,
            char_count=char_count,
            model_used=rewrite_model,
            tokens_input=tokens_input,
            tokens_output=tokens_output,
        )
    except Exception as e:
        logger.error(f"generate_rewrite error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate rewrite: {str(e)}")