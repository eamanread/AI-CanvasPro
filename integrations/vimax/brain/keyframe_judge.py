"""Sync stdlib port of keyframe_judge (Phase C). SYSTEM_PROMPT + pure helpers
(parse_judge_verdict / should_reshoot / judge_capacity / _coerce_bool / _data_uri)
copied VERBATIM from integrations/vimax/keyframe_judge.py. The async langchain
KeyframeJudge.judge + generate_with_judge are re-ported to SYNC (callbacks sync;
langchain SystemMessage/HumanMessage + ainvoke -> OpenAI messages + sync
GrsaiChatClient.chat). Budget-loop semantics unchanged (re-pinned by the sync
test). The old async integrations/vimax/keyframe_judge.py stays until C5.

Billing (spec §6): a judge REJECTION re-runs generate -> another full, charged
draw (the broker has no view of the verdict, so no refund); only an upstream
grsai/broker draw failure is refunded. The GLOBAL retries_remaining bounds total
reshoots so draws <= shots + retryBudget <= ticket capTotal.
"""
import base64
import json
import os
import re

SYSTEM_PROMPT = """\
[Role]
You are a professional visual QC judge for film keyframes. You assess whether a
single generated keyframe is acceptable against its reference images and target
description, on three axes:
- Character Consistency: gender, ethnicity, age, facial features, body shape,
  outfit, hairstyle match the character reference portraits.
- Spatial Consistency: relative character positions, scene layout, perspective
  are coherent with the references.
- Description Accuracy: the frame depicts what the target description asks for.

[Input]
- Reference images (character portraits / prior frames), each with a short text.
- The target description, enclosed in <TARGET_DESCRIPTION_START/END> tags.
- The generated keyframe to evaluate (the LAST image).

[Output]
Return ONLY a JSON object: {"acceptable": <true|false>, "issues": "<short, concrete>"}.
- acceptable=true unless there is a CLEAR failure (wrong character identity,
  reversed/мixed-up subjects, a key described element missing, or obvious
  artifacts like white borders / black edges / duplicated faces).
- Be conservative: minor stylistic differences are acceptable (do NOT reshoot
  on nitpicks - reshoots cost real money). Only reject genuine inconsistencies.
- issues: one concise sentence naming the concrete problem (used as a hint to
  re-render); empty string when acceptable.
"""


def _coerce_bool(value, default=True):
    if isinstance(value, bool):
        return value
    s = str(value or "").strip().lower()
    if s in ("true", "yes", "y", "1", "acceptable", "pass", "ok"):
        return True
    if s in ("false", "no", "n", "0", "unacceptable", "fail", "reject"):
        return False
    return default


def parse_judge_verdict(raw):
    """Parse the judge's reply into {acceptable: bool, issues: str}. Robust to
    fenced/loose JSON. FAILS OPEN (acceptable=true) on anything unparseable - a
    judge error must never trigger a reshoot (no spend on judge uncertainty)."""
    text = str(raw or "")
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        return {"acceptable": True, "issues": ""}
    try:
        data = json.loads(match.group(0))
    except (ValueError, TypeError):
        return {"acceptable": True, "issues": ""}
    if not isinstance(data, dict):
        return {"acceptable": True, "issues": ""}
    return {
        "acceptable": _coerce_bool(data.get("acceptable"), default=True),
        "issues": str(data.get("issues") or "").strip(),
    }


def should_reshoot(acceptable, attempts_used, max_attempts, global_retries_remaining):
    """Reshoot only when the frame failed AND the shot hasn't hit its per-shot
    attempt cap (no infinite loop) AND the global retry budget (= the ticket's
    extra draws beyond one-per-shot) isn't exhausted (cap sovereignty)."""
    if acceptable:
        return False
    if attempts_used >= max_attempts:
        return False
    return global_retries_remaining > 0


def judge_capacity(num_shots, retry_budget):
    """Total billed-draw ceiling for a judged render: one draw per shot plus the
    global retry budget. No shots -> no budget (retries are meaningless)."""
    n = int(num_shots or 0)
    if n <= 0:
        return 0
    return n + max(0, int(retry_budget or 0))


def generate_with_judge(*, generate, judge=None, max_attempts, retries_remaining, on_reshoot=None):
    """Sync port of keyframe_judge.generate_with_judge:99-126 (callbacks sync).
    Generate -> judge -> reshoot, GLOBAL retries_remaining gates total reshoots.
      generate(issues:str) -> result   # generate+persist a frame; return its url
      judge(result) -> {acceptable, issues}  (None disables judging)
      on_reshoot()                      # caller drops the rejected frame
    Returns {result, attempts, retries_remaining, verdict}."""
    attempts = 0
    issues = ""
    verdict = {"acceptable": True, "issues": ""}
    result = None
    while True:
        attempts += 1
        result = generate(issues)
        if judge is None:
            break
        verdict = judge(result)
        if not should_reshoot(verdict.get("acceptable", True), attempts, max_attempts, retries_remaining):
            break
        retries_remaining -= 1
        issues = verdict.get("issues", "")
        if on_reshoot is not None:
            on_reshoot()
    return {"result": result, "attempts": attempts, "retries_remaining": retries_remaining, "verdict": verdict}


def _data_uri(path):
    with open(path, "rb") as handle:
        b64 = base64.b64encode(handle.read()).decode("ascii")
    ext = os.path.splitext(path)[1].lower().lstrip(".") or "png"
    mime = "jpeg" if ext in ("jpg", "jpeg") else ext
    return f"data:image/{mime};base64,{b64}"


class KeyframeJudge:
    """VLM pass/fail judge. chat_model is brain.chat_client.GrsaiChatClient
    (sync, vision-capable - the same grsai gemini-3.1-pro the runner builds)."""

    def __init__(self, chat_model):
        self.chat_model = chat_model

    def judge(self, frame_path, reference_pairs, target_description):
        """reference_pairs: [(image_path, text), ...]. Returns the verdict dict.
        Any exception -> fail-open accept (never reshoot on a judge failure)."""
        try:
            content = [{"type": "text",
                        "text": f"<TARGET_DESCRIPTION_START>\n{target_description}\n<TARGET_DESCRIPTION_END>"}]
            for idx, (path, text) in enumerate(reference_pairs or []):
                if not path or not os.path.isfile(path):
                    continue
                content.append({"type": "text", "text": f"Reference Image {idx}: {text or ''}"})
                content.append({"type": "image_url", "image_url": {"url": _data_uri(path)}})
            if not frame_path or not os.path.isfile(frame_path):
                return {"acceptable": True, "issues": ""}
            content.append({"type": "text", "text": "Generated keyframe to evaluate:"})
            content.append({"type": "image_url", "image_url": {"url": _data_uri(frame_path)}})
            messages = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": content}]
            reply = self.chat_model.chat(messages)
            return parse_judge_verdict(reply or "")
        except Exception:  # noqa: BLE001 - judge failure must not break/charge the render
            return {"acceptable": True, "issues": ""}
