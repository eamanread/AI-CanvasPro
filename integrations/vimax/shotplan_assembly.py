"""Pure shotplan assembly + skills-craft selection (Phase B B1).

Extracted from huanying_runner so it can be imported WITHOUT huanying_runner's
module-level side effects (the `sys.stdout/stderr.reconfigure(utf-8)` that, when
imported in-process by the server, would permanently mutate the server's GBK
console for all threads - B-review C4). This module only imports json/os/
skills_index and defines functions; importing it changes nothing global.

Both the external runner (huanying_runner) and the native brain (brain.planner)
import assemble_shotplan + _select_craft from here, so the assembled
vimax-shotplan/v1 + the 《》skills injection stay byte-identical across paths.
"""
import json  # noqa: F401 - kept for parity / future use
import os

import skills_index as si

SCHEMA_VERSION = "vimax-shotplan/v1"


def _get(obj, *names):
    """Read an attr or dict key by any of the given names."""
    for n in names:
        if isinstance(obj, dict) and n in obj:
            return obj[n]
        if hasattr(obj, n):
            return getattr(obj, n)
    return None


def assemble_shotplan(flow_id, story, characters, scene_artifacts, skill_refs, elapsed_sec):
    """Pure assembler: ViMax artifacts -> vimax-shotplan/v1. Globally
    contiguous shot idx (canvas/writeback key, collision-free across
    scenes) plus sceneIdx + localIdx (ViMax per-scene addressing for the
    P2 render/writeback). No ViMax / network deps - unit-testable."""
    out_chars = []
    for c in characters or []:
        out_chars.append({
            "idx": _get(c, "idx"),
            "identifierInScene": _get(c, "identifier_in_scene", "identifierInScene") or "",
            "isVisible": bool(_get(c, "is_visible", "isVisible")),
            "staticFeatures": _get(c, "static_features", "staticFeatures") or "",
            "dynamicFeatures": _get(c, "dynamic_features", "dynamicFeatures") or "",
        })

    scenes = []
    shots = []
    divergences = []
    global_idx = 0
    for scene_idx, art in enumerate(scene_artifacts):
        scenes.append({"idx": scene_idx, "script": str(art.get("script") or "")})
        for position, sd in enumerate(art.get("shot_descriptions") or []):
            variation = str(_get(sd, "variation_type", "variationType") or "")
            # localIdx is ViMax's OWN shot_description.idx - the key the
            # P2 render/writeback uses to address shots/<idx>/. ViMax's
            # render ALSO indexes by list position, so a divergence
            # (LLM emitting non-contiguous idx) misrenders on both sides;
            # record it for a loud warning rather than silently picking
            # the wrong file later.
            vimax_idx = _get(sd, "idx")
            local_idx = int(vimax_idx) if vimax_idx is not None else position
            if vimax_idx is not None and int(vimax_idx) != position:
                divergences.append((scene_idx, position, int(vimax_idx)))
            shot = {
                "idx": global_idx,
                "sceneIdx": scene_idx,
                "localIdx": local_idx,
                "camIdx": int(_get(sd, "cam_idx", "camIdx") or 0),
                "visualDesc": str(_get(sd, "visual_desc", "visualDesc") or ""),
                "ffDesc": str(_get(sd, "ff_desc", "ffDesc") or ""),
                "motionDesc": str(_get(sd, "motion_desc", "motionDesc") or ""),
                "audioDesc": str(_get(sd, "audio_desc", "audioDesc") or ""),
                "variationType": variation,
            }
            # lf_desc is a required ViMax field (always present), but only
            # medium/large variations actually render a last frame - keep
            # it only for those to match the contract (§6) and avoid a
            # dead editable field on small shots.
            lf = _get(sd, "lf_desc", "lfDesc")
            if lf and variation in ("medium", "large"):
                shot["lfDesc"] = str(lf)
            shots.append(shot)
            global_idx += 1

    plan = {
        "schemaVersion": SCHEMA_VERSION,
        "flowId": flow_id,
        "story": story or "",
        "scenes": scenes,
        "characters": out_chars,
        "shots": shots,
        "skillRefs": list(skill_refs or []),
        "elapsedSec": round(elapsed_sec, 1),
    }
    # Surface (don't swallow) any ViMax idx != list-position divergence
    # so the bridge/operator sees it; pure return value also carries it.
    if divergences:
        plan["_idxDivergences"] = [{"sceneIdx": s, "position": p, "vimaxIdx": v} for s, p, v in divergences]
    return plan


def _select_craft(req, emit=None):
    """S1: pick top-k skills for the request, return (injection_text, names).
    `emit` (optional ndjson progress callback) defaults to a no-op so this stays
    side-effect-free for the native/brain caller; the external runner passes its
    stderr emitter to surface ambiguous/unmatched 《》 warns."""
    _emit = emit if callable(emit) else (lambda *a, **k: None)
    skills_dir = req.get("skillsDir")
    if not skills_dir or not os.path.isdir(skills_dir):
        return "", []
    query = f"{req.get('userRequirement', '')} {req.get('idea', '')}".strip()
    roster = si.load_roster(skills_dir)
    # Explicit 《》 picks (skillRefs from the panel) are POINT-NAMED: resolve
    # them by name (S2/M16). Exact/unique hits are forced in (not subject to
    # the fuzzy min_score); ambiguous picks are surfaced for clarification
    # (the panel can re-ask); unmatched picks warn + the query still gets a
    # fuzzy top-up so the user isn't left with nothing.
    explicit = [name for name in (req.get("skillRefs") or []) if name]
    if explicit:
        res = si.resolve_named_skill_refs(explicit, roster)
        chosen = list(res["resolved"])
        for amb in res["ambiguous"]:
            _emit("warn", phase="skills",
                  message=f"《{amb['ref']}》命中多个拍法,已跳过待澄清:{('、'.join(amb['candidates']))[:120]}")
        for ref in res["unmatched"]:
            _emit("warn", phase="skills", message=f"《{ref}》未匹配到拍法,改用相关度检索")
        # Top up to k with fuzzy matches when the named picks under-fill (or
        # all were ambiguous/unmatched), never duplicating a resolved skill.
        if len(chosen) < 3:
            have = {s["name"] for s in chosen}
            for s in si.select_skills(query, roster, k=3):
                if s["name"] not in have:
                    chosen.append(s)
                    if len(chosen) >= 3:
                        break
    else:
        chosen = si.select_skills(query, roster, k=3)
    return si.build_injection([dict(s, _score=1.0) for s in chosen]), [s["name"] for s in chosen]
