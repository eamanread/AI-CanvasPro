"""Working-dir bridge (Phase B1.3b / B-review C3): lay down the ViMax
working_dir files a NATIVE plan needs so the still-external 成片 (run_render) /
定妆 (run_portraits) runner modes can consume it unchanged.

The external `run_plan` produced these as a side effect of the ViMax pipeline;
the native brain only returns the assembled shotplan + streams per-stage step
payloads, so the orchestrator re-materializes the same on-disk layout here:

    working_dir/shotplan.json                                  (the plan)
    working_dir/scene_<N>/characters.json                      (snake char list)
    working_dir/scene_<N>/shots/<localIdx>/shot_description.json (snake decompose)

render reads ff_vis_char_idxs from shot_description.json and indexes
characters.json POSITIONALLY (characters[cidx].identifier_in_scene), so:
  - characters.json keeps ALL characters in idx order (no visibility filter -
    filtering would misalign the positional indices), and
  - shot dirs use the shot's localIdx (= its own idx, matching
    assemble_shotplan), not list position, so a divergent idx still lines up.

Pure stdlib I/O, no network. Side-effect-free import (no stdout reconfigure),
so it is safe to import in-process in the server (mirrors shotplan_assembly).
"""
import json
import os
import shutil


def character_to_snake(c, fallback_idx=None):
    """Brain camelCase mirror -> snake dict accepted by CharacterInScene
    (same shape huanying_runner.portrait_character_dicts emits), tolerating
    either casing on input. idx falls back to the list position when absent so
    it is never None - mirrors planner.normalize_character and keeps the dict
    self-describing even if a future caller skips normalization (review#R5)."""
    c = c if isinstance(c, dict) else {}

    def pick(camel, snake, default=""):
        v = c.get(camel)
        if v in (None, ""):
            v = c.get(snake)
        return default if v in (None, "") else v

    idx = c.get("idx")
    if idx is None:
        idx = fallback_idx
    return {
        "idx": idx,
        "identifier_in_scene": str(pick("identifierInScene", "identifier_in_scene") or "").strip(),
        "is_visible": bool(c.get("isVisible", c.get("is_visible", True))),
        "static_features": str(pick("staticFeatures", "static_features") or "").strip(),
        "dynamic_features": str(pick("dynamicFeatures", "dynamic_features") or "").strip(),
    }


def _atomic_write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def local_idx_for(sd, position):
    """Match shotplan_assembly: localIdx is the shot's OWN idx when present,
    else its list position. render addresses shots/<localIdx>/ from the
    shotplan, so writing at the same index keeps the two in lockstep even when
    the LLM emits a non-contiguous idx."""
    vimax_idx = (sd if isinstance(sd, dict) else {}).get("idx")
    try:
        return int(vimax_idx) if vimax_idx is not None else int(position)
    except (TypeError, ValueError):
        return int(position)


def persist_native_run(working_dir, shotplan, characters, scene_shots, clear=True):
    """Write the working_dir files for a completed native plan.

    characters: brain camelCase mirror list (global, shared by every scene).
    scene_shots: list indexed by sceneIdx; each entry is that scene's list of
        snake shot-description dicts (the raw decompose output streamed via the
        on_step("scene") payload - NOT the lossy camelCase shotplan shots,
        which drop ff_vis_char_idxs that render needs).
    clear: wipe working_dir first (default). A re-plan with the same flowId must
        not inherit a prior run's scene dirs / generated frames - run_render
        skips any shot whose first_frame.png already exists, so stale frames
        would be silently reused as the new plan's output (review#R3).

    Write order is deliberate: all scene files FIRST, then shotplan.json LAST as
    a commit marker. run_render/run_portraits refuse to start without
    shotplan.json ("shotplan.json missing - run plan first"), so a write that
    fails partway leaves NO marker -> they refuse and bill nothing, rather than
    half-rendering a corrupt/incomplete plan (review#R2). Per-file writes are
    atomic (tmp+os.replace); the marker makes the whole SET effectively atomic.

    Returns the list of written paths. Raises OSError/TypeError on write
    failure; the orchestrator treats it as non-fatal (records persistError +
    warns) - the canvas landing doesn't depend on these files."""
    if clear and os.path.isdir(working_dir):
        shutil.rmtree(working_dir, ignore_errors=True)

    written = []
    snake_chars = [character_to_snake(c, i) for i, c in enumerate(characters or [])]
    for scene_idx, shots in enumerate(scene_shots or []):
        scene_dir = os.path.join(working_dir, f"scene_{scene_idx}")
        chars_path = os.path.join(scene_dir, "characters.json")
        _atomic_write_json(chars_path, snake_chars)
        written.append(chars_path)
        for position, sd in enumerate(shots or []):
            li = local_idx_for(sd, position)
            sd_path = os.path.join(scene_dir, "shots", str(li), "shot_description.json")
            _atomic_write_json(sd_path, sd)
            written.append(sd_path)
    # commit marker LAST - see docstring
    plan_path = os.path.join(working_dir, "shotplan.json")
    _atomic_write_json(plan_path, shotplan)
    written.append(plan_path)
    return written
