"""Native planner (Phase A): runs the narrative brain steps via a plain chat
client, mirroring run_plan's screenwriter + character_extractor calls but with
zero ViMax runtime. Output is normalized to the vimax-shotplan/v1 camelCase
character mirror so it slots into the existing contract + canvas mapper.

A2 extends this with storyboard / shot-decompose / camera; A3 golden-compares
the assembled shotplan against the external runner.
"""
from . import prompts
from .chat_client import extract_json


def _to_bool(value, default=True):
    if isinstance(value, bool):
        return value
    s = str(value).strip().lower()
    if s in ("true", "yes", "1"):
        return True
    if s in ("false", "no", "0"):
        return False
    return default


def normalize_character(raw, fallback_idx):
    """LLM character dict (snake or camel keys) -> vimax-shotplan/v1 mirror
    {idx, identifierInScene, isVisible, staticFeatures, dynamicFeatures}. Pure."""
    c = raw if isinstance(raw, dict) else {}

    def pick(*keys):
        for k in keys:
            v = c.get(k)
            if v not in (None, ""):
                return v
        return ""

    try:
        idx = int(c.get("idx", fallback_idx))
    except (TypeError, ValueError):
        idx = fallback_idx
    # Tolerate common LLM key paraphrases (name/visible/appearance/outfit) so a
    # reworded key doesn't silently become empty/default - the [Output] block
    # pins the canonical keys, these are just safety nets.
    return {
        "idx": idx,
        "identifierInScene": str(pick("identifier_in_scene", "identifierInScene", "name", "identifier") or "").strip(),
        "isVisible": _to_bool(pick("is_visible", "isVisible", "visible"), default=True),
        "staticFeatures": str(pick("static_features", "staticFeatures", "appearance") or "").strip(),
        "dynamicFeatures": str(pick("dynamic_features", "dynamicFeatures", "outfit", "attire") or "").strip(),
    }


def develop_story(client, idea, user_requirement=""):
    messages = [
        {"role": "system", "content": prompts.DEVELOP_STORY_SYSTEM},
        {"role": "user", "content": prompts.DEVELOP_STORY_HUMAN.format(
            idea=idea or "", user_requirement=user_requirement or "")},
    ]
    return client.chat(messages).strip()


def write_script(client, story, user_requirement=""):
    """Returns a list of per-scene script strings."""
    messages = [
        {"role": "system", "content": prompts.WRITE_SCRIPT_SYSTEM},
        {"role": "user", "content": prompts.WRITE_SCRIPT_HUMAN.format(
            story=story or "", user_requirement=user_requirement or "")},
    ]
    data = extract_json(client.chat(messages)) or {}
    scenes = data.get("script") if isinstance(data, dict) else None
    return [str(s).strip() for s in (scenes or []) if str(s).strip()]


def extract_characters(client, script):
    """Returns a list of normalized character mirrors (idx-ordered)."""
    messages = [
        {"role": "system", "content": prompts.EXTRACT_CHARACTERS_SYSTEM},
        {"role": "user", "content": prompts.EXTRACT_CHARACTERS_HUMAN.format(script=script or "")},
    ]
    data = extract_json(client.chat(messages)) or {}
    raw = data.get("characters") if isinstance(data, dict) else None
    return [normalize_character(c, i) for i, c in enumerate(raw or [])]


# --- A2: storyboard + shot decomposition ------------------------------------

class PlanCancelled(Exception):
    """Raised when should_cancel() trips at a stage/shot boundary, so the
    orchestrator can mark the job cancelled rather than failed (B-review M1)."""


def _to_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _check_cancel(should_cancel):
    if callable(should_cancel) and should_cancel():
        raise PlanCancelled()


def _character_block_for_storyboard(characters):
    """Reproduce CharacterInScene.__str__ exactly (design_storyboard's
    characters_str = "Character {i}: {char}\\n..."), so the prompt input matches
    the external runner byte-for-byte."""
    lines = []
    for i, c in enumerate(characters or []):
        c = c if isinstance(c, dict) else {}
        vis = "[visible]" if c.get("isVisible") else "[not visible]"
        block = (f"{c.get('identifierInScene', '')}{vis}\n"
                 f"static features: {c.get('staticFeatures', '')}\n"
                 f"dynamic features: {c.get('dynamicFeatures', '')}\n")
        lines.append(f"Character {i}: {block}")
    return "\n".join(lines)


def _character_block_for_decompose(characters):
    """decompose's characters_str: "{ident}: (static) {s}; (dynamic) {d}"."""
    return "\n".join(
        f"{(c if isinstance(c, dict) else {}).get('identifierInScene', '')}: "
        f"(static) {(c if isinstance(c, dict) else {}).get('staticFeatures', '')}; "
        f"(dynamic) {(c if isinstance(c, dict) else {}).get('dynamicFeatures', '')}"
        for c in characters or []
    )


def filter_char_idxs(idxs, num_characters):
    """Keep only in-range integer character indices (port of ViMax's
    validate_char_idxs intent: out-of-range/negative idxs would select the
    wrong character or crash the render). Native path FILTERS rather than
    raise+retry; a divergence here would surface in the A3 golden对账."""
    out = []
    for i in idxs or []:
        if isinstance(i, bool):
            continue
        if isinstance(i, int) and 0 <= i < int(num_characters or 0):
            out.append(i)
    return out


def design_storyboard(client, script, characters, user_requirement=""):
    """Returns a list of shot-brief dicts {idx, is_last, cam_idx, visual_desc, audio_desc}."""
    messages = [
        {"role": "system", "content": prompts.DESIGN_STORYBOARD_SYSTEM},
        {"role": "user", "content": prompts.DESIGN_STORYBOARD_HUMAN.format(
            script_str=(script or "").strip(),
            characters_str=_character_block_for_storyboard(characters),
            user_requirement_str=(user_requirement or "").strip())},
    ]
    data = extract_json(client.chat(messages)) or {}
    raw = data.get("storyboard") if isinstance(data, dict) else None
    briefs = []
    for i, b in enumerate(raw or []):
        if not isinstance(b, dict):
            continue
        briefs.append({
            "idx": _to_int(b.get("idx"), i),
            "is_last": _to_bool(b.get("is_last"), default=False),
            "cam_idx": _to_int(b.get("cam_idx"), 0),
            "visual_desc": str(b.get("visual_desc") or "").strip(),
            "audio_desc": str(b.get("audio_desc") or "").strip(),
        })
    return briefs


def decompose_visual_description(client, brief, characters):
    """Decompose one shot brief -> ShotDescription-shaped dict (snake keys, so
    huanying_runner.assemble_shotplan reads it identically to the external
    runner's pydantic objects)."""
    brief = brief if isinstance(brief, dict) else {}
    messages = [
        {"role": "system", "content": prompts.DECOMPOSE_SYSTEM},
        {"role": "user", "content": prompts.DECOMPOSE_HUMAN.format(
            visual_desc=str(brief.get("visual_desc") or "").strip(),
            characters_str=_character_block_for_decompose(characters))},
    ]
    d = extract_json(client.chat(messages))
    d = d if isinstance(d, dict) else {}
    n = len(characters or [])
    vt = str(d.get("variation_type") or "small").strip().lower()
    if vt not in ("large", "medium", "small"):
        vt = "small"
    return {
        "idx": _to_int(brief.get("idx"), 0),
        "is_last": _to_bool(brief.get("is_last"), default=False),
        "cam_idx": _to_int(brief.get("cam_idx"), 0),
        "visual_desc": str(brief.get("visual_desc") or ""),
        "variation_type": vt,
        "variation_reason": str(d.get("variation_reason") or "").strip(),
        "ff_desc": str(d.get("ff_desc") or "").strip(),
        "ff_vis_char_idxs": filter_char_idxs(d.get("ff_vis_char_idxs"), n),
        "lf_desc": str(d.get("lf_desc") or "").strip(),
        "lf_vis_char_idxs": filter_char_idxs(d.get("lf_vis_char_idxs"), n),
        "motion_desc": str(d.get("motion_desc") or "").strip(),
        "audio_desc": str(brief.get("audio_desc") or ""),
    }


def plan_scene(client, script, characters, user_requirement="", max_workers=1, should_cancel=None):
    """One scene: design storyboard -> decompose each shot. Returns shot_descriptions.
    Per-shot decompose runs in parallel when max_workers>1 (the external runner
    already asyncio.gathers these - sequential native was the A3 369s-vs-235s
    regression, B-review M1). ThreadPoolExecutor.map PRESERVES input order, so
    assemble_shotplan's positional global_idx stays correct even though futures
    finish out of order. (urllib releases the GIL on socket IO; the chat client
    is per-call stateless, so concurrent reuse is safe.)
    should_cancel() is checked at the START of each shot, so a cancel is observed
    within ~one chat() call rather than after the whole scene (B-review M1).
    NOTE: a single shot's decompose raising (after chat retries) fails the WHOLE
    scene/plan - same fail-all semantics as the external runner's asyncio.gather;
    intended (no partial-plan)."""
    briefs = design_storyboard(client, script, characters, user_requirement)

    def _one(b):
        _check_cancel(should_cancel)
        return decompose_visual_description(client, b, characters)

    if int(max_workers) <= 1 or len(briefs) <= 1:
        return [_one(b) for b in briefs]
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=int(max_workers)) as ex:
        return list(ex.map(_one, briefs))


def plan_story_and_characters(client, idea, user_requirement="", style="", flow_id="",
                              skill_refs=None, skills_dir="", on_step=None, should_cancel=None):
    """Phase 1 (B3b steer): craft selection + story + characters. Emits on_step
    story/characters. Returns {story, characters, effective_requirement,
    resolved_refs} for phase 2. Splitting here lets the orchestrator PAUSE after
    character extraction so the user can edit the cast before decomposition."""
    from shotplan_assembly import _select_craft
    _step = on_step if callable(on_step) else (lambda *a, **k: None)
    effective_req = user_requirement or ""
    resolved_refs = list(skill_refs or [])
    if skills_dir:
        # Same selection + prepend as run_plan (_select_craft + the exact craft
        # preamble), so the native prompt matches the external runner.
        craft, resolved_refs = _select_craft({
            "skillsDir": skills_dir, "skillRefs": skill_refs or [],
            "userRequirement": user_requirement or "", "idea": idea or "",
        })
        if craft:
            effective_req = f"{effective_req}\n\n参考以下影视拍法(融入分镜与镜头语言):\n{craft}"

    _check_cancel(should_cancel)
    story = develop_story(client, idea, effective_req)
    _step("story", {"story": story})
    _check_cancel(should_cancel)
    characters = extract_characters(client, story)
    _step("characters", {"characters": characters})
    return {"story": story, "characters": characters,
            "effective_requirement": effective_req, "resolved_refs": resolved_refs}


def plan_from_characters(client, story, characters, effective_requirement="", resolved_refs=None,
                         flow_id="", on_step=None, max_workers=1, should_cancel=None, started_at=None):
    """Phase 2 (B3b steer): script + per-scene storyboard/decompose + assemble.
    Emits on_step scene per scene. `characters` is the SINGLE source for
    design_storyboard, decompose AND assemble_shotplan - so the EDITED cast
    flows everywhere (M4: shotplan.characters carries the approved cast, which
    定妆/portrait_character_dicts then read)."""
    import time
    # Side-effect-free assembly module, NOT huanying_runner (whose module-level
    # sys.stdout.reconfigure would mutate the server console in-process, C4).
    from shotplan_assembly import assemble_shotplan
    _step = on_step if callable(on_step) else (lambda *a, **k: None)
    t0 = started_at if started_at is not None else time.time()

    _check_cancel(should_cancel)
    scene_scripts = write_script(client, story, effective_requirement)
    scene_artifacts = []
    for scene_idx, scene_script in enumerate(scene_scripts):
        _check_cancel(should_cancel)
        shot_descriptions = plan_scene(client, scene_script, characters, effective_requirement,
                                       max_workers=max_workers, should_cancel=should_cancel)
        scene_artifacts.append({"script": scene_script, "shot_descriptions": shot_descriptions})
        _step("scene", {"sceneIdx": scene_idx, "script": scene_script, "shots": shot_descriptions})
    return assemble_shotplan(
        flow_id=flow_id, story=story, characters=characters,
        scene_artifacts=scene_artifacts, skill_refs=list(resolved_refs or []),
        elapsed_sec=time.time() - t0,
    )


def plan_shotplan(client, idea, user_requirement="", style="", flow_id="", skill_refs=None,
                  skills_dir="", on_step=None, max_workers=1, should_cancel=None):
    """Full native chain -> vimax-shotplan/v1, mirroring run_plan's sequence but
    venv-free. Thin wrapper over plan_story_and_characters -> plan_from_characters
    so the batch / non-steer path, B1 tests, and the A3 golden对账 are unchanged
    (the steer path calls the two phases directly so it can pause between them)."""
    import time
    t0 = time.time()
    p1 = plan_story_and_characters(
        client, idea=idea, user_requirement=user_requirement, style=style, flow_id=flow_id,
        skill_refs=skill_refs, skills_dir=skills_dir, on_step=on_step, should_cancel=should_cancel)
    return plan_from_characters(
        client, story=p1["story"], characters=p1["characters"],
        effective_requirement=p1["effective_requirement"], resolved_refs=p1["resolved_refs"],
        flow_id=flow_id, on_step=on_step, max_workers=max_workers, should_cancel=should_cancel,
        started_at=t0,
    )
