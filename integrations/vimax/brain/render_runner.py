"""Sync port of huanying_runner.run_render (Phase C). IO is INJECTED (chat_client
+ image_gen), so no venv/langchain/subprocess and the cost path is the caller's
(the orchestrator builds image_gen = ImageGeneratorGrsai(api_key=ticketId,
base_url=brokerUrl)). The source is async; every `await` is dropped because the
injected brain clients are sync (the orchestrator runs this in a worker thread).
Shots render SEQUENTIALLY, mirroring the source `for` loop one-for-one.

Pure file helpers come from brain.runner_helpers; reference selection + the VLM
judge come from the C1 brain modules. The result.json schema, the writeback/
invalidate protocol, cross-shot continuity, and the verbatim assembly strings
(reference prefix, the "[QC 反馈,请修正]:" reshoot prefix, the continuity label)
are preserved from huanying_runner.py:234-409."""
import json
import os
import time

from .keyframe_judge import KeyframeJudge, generate_with_judge
from .portraits import CharacterPortraitsGenerator
from .reference_selector import select_reference_images_and_generate_prompt
from .runner_helpers import (
    _PORTRAIT_VIEWS, _read_json, _safe_path_component, PORTRAITS_SCHEMA_VERSION,
    RENDER_SCHEMA_VERSION, fanout_portrait_registry, invalidate_portraits,
    invalidate_shots, merge_shot_edits, portrait_character_dicts,
)


def run_render(*, working_dir, flow_id, chat_client, image_gen,
               shot_idxs=None, edits=None, invalidate_shot_idxs=None,
               retry_budget=0, max_reshoots_per_shot=1, on_step=None, should_cancel=None):
    """Keyframe-only render. Returns the vimax-render-result/v1 dict (also written
    to working_dir/result.json). on_step(stage, data) streams progress; should_cancel()
    is polled at each shot boundary (stop -> partial result with cancelled=True)."""
    t0 = time.time()

    def _emit(stage, **data):
        if on_step is not None:
            on_step(stage, data)

    shotplan = _read_json(os.path.join(working_dir, "shotplan.json"))
    if not isinstance(shotplan, dict):
        raise ValueError("shotplan.json missing - run plan first")
    shots = shotplan.get("shots") or []
    selected = set(shot_idxs) if shot_idxs is not None else {s.get("idx") for s in shots}

    # VLM 判官 (P3-M17), gated on a retry budget. retryBudget = total extra draws
    # allowed across the render for reshooting; maxReshootsPerShot caps one shot's
    # reshoots (no infinite loop). Judge off when retryBudget==0.
    retry_budget = int(retry_budget or 0)
    max_reshoots_per_shot = max(1, int(max_reshoots_per_shot or 1))
    judge_enabled = retry_budget > 0
    judge = KeyframeJudge(chat_client) if judge_enabled else None
    global_retries_remaining = retry_budget

    # Writeback edits + invalidate (per scene). Panel edits are keyed by CANVAS
    # shot idx; map to ViMax (sceneIdx, localIdx) via shotplan.
    by_canvas_idx = {s.get("idx"): s for s in shots}
    edits_by_scene = {}
    for edit in edits or []:
        shot = by_canvas_idx.get(edit.get("shotIdx"))
        if not shot:
            continue
        scene_idx = int(shot.get("sceneIdx") or 0)
        mapped = dict(edit)
        mapped["localIdx"] = int(shot.get("localIdx"))
        edits_by_scene.setdefault(scene_idx, []).append(mapped)
    for scene_idx, scene_edits in edits_by_scene.items():
        merge_shot_edits(working_dir, scene_edits, scene_idx=scene_idx)
    inval_by_scene = {}
    for shot in shots:
        if shot.get("idx") in (invalidate_shot_idxs or []):
            inval_by_scene.setdefault(int(shot.get("sceneIdx") or 0), []).append(int(shot.get("localIdx")))
    for scene_idx, idxs in inval_by_scene.items():
        invalidate_shots(working_dir, idxs, scene_idx=scene_idx)

    characters_cache = {}
    registry_cache = {}
    prev_frame = {}  # sceneIdx -> (local_path, text) for cross-shot continuity
    outputs = []
    cancelled = False
    for shot in shots:
        if should_cancel is not None and should_cancel():
            cancelled = True
            break
        if shot.get("idx") not in selected:
            continue
        scene_idx = int(shot.get("sceneIdx") or 0)
        local_idx = int(shot.get("localIdx"))
        scene_dir = os.path.join(working_dir, f"scene_{scene_idx}")
        shot_dir = os.path.join(scene_dir, "shots", str(local_idx))
        sd = _read_json(os.path.join(shot_dir, "shot_description.json")) or {}
        ff_desc = str(sd.get("ff_desc") or shot.get("ffDesc") or "")
        if not ff_desc:
            continue
        frame_path = os.path.join(shot_dir, "first_frame.png")
        _emit("progress", phase=f"frame-{scene_idx}-{local_idx}")

        if os.path.isfile(frame_path):
            outputs.append({"shotIdx": shot.get("idx"), "localPath": frame_path, "skipped": True})
            continue

        # Characters + portraits for this scene (cached per scene). Loaded as plain
        # dicts straight from characters.json (snake JSON) - NO pydantic/ViMax
        # CharacterInScene deserialization, so the brain stays import-isolated;
        # access is via dict .get() (the source used a pydantic object + dot access).
        if scene_idx not in characters_cache:
            characters_cache[scene_idx] = _read_json(os.path.join(scene_dir, "characters.json")) or []
            registry_cache[scene_idx] = _read_json(os.path.join(scene_dir, "character_portraits_registry.json")) or {}
        characters = characters_cache[scene_idx]
        registry = registry_cache[scene_idx]

        pairs = []
        for cidx in sd.get("ff_vis_char_idxs") or []:
            try:
                ident = characters[cidx].get("identifier_in_scene")
            except (IndexError, AttributeError):
                continue
            if not ident:
                continue
            for _view, item in (registry.get(ident) or {}).items():
                # Prefer the persisted public url over the server-local path:
                # portraits + render are separate runs, so a local path may be
                # absent here and would be silently dropped as a reference,
                # killing 定妆 consistency (B0-C4).
                pairs.append((item.get("url") or item.get("path"), item.get("description", "")))
        if scene_idx in prev_frame:
            pairs.append(prev_frame[scene_idx])

        try:
            sel = select_reference_images_and_generate_prompt(
                chat_client, pairs, ff_desc,
            )
            ref_pairs = sel.get("reference_image_path_and_text_pairs") or []
            prefix = "".join(f"Image {i}: {t}\n" for i, (_p, t) in enumerate(ref_pairs))
            base_prompt = f"{prefix}\n{sel.get('text_prompt') or ff_desc}"
            ref_paths = [p[0] for p in ref_pairs]
            shot_url = {"v": ""}

            def _gen(issues, _bp=base_prompt, _rp=ref_paths, _fp=frame_path, _su=shot_url):
                prompt = _bp if not issues else f"{_bp}\n\n[QC 反馈,请修正]:{issues}"
                frame = image_gen.generate_single_image(prompt=prompt, reference_image_paths=_rp)
                frame.save(_fp)  # registers local->url for continuity
                _su["v"] = getattr(frame, "data", "")
                return _su["v"]

            def _judge(_url, _ff=ff_desc, _rpairs=ref_pairs, _fp=frame_path):
                return judge.judge(_fp, _rpairs, _ff)

            def _on_reshoot(_idx=shot.get("idx"), _fp=frame_path):
                _emit("warn", phase="judge", message=(f"shot {_idx} 判官打回,重摇")[:160])
                try:
                    os.remove(_fp)
                except OSError:
                    pass

            outcome = generate_with_judge(
                generate=_gen,
                judge=(_judge if judge_enabled else None),
                max_attempts=1 + max_reshoots_per_shot,
                retries_remaining=global_retries_remaining,
                on_reshoot=_on_reshoot,
            )
            global_retries_remaining = outcome["retries_remaining"]
            url = shot_url["v"]
            verdict = outcome["verdict"]
            prev_frame[scene_idx] = (frame_path, "Previous shot's frame - keep characters/style consistent.")
            rec = {"shotIdx": shot.get("idx"), "localPath": frame_path, "url": url,
                   "attempts": outcome["attempts"], "judged": judge_enabled,
                   "acceptable": bool(verdict.get("acceptable", True))}
            outputs.append(rec)
            _emit("output", shotIdx=shot.get("idx"), url=url, localPath=frame_path)
        except Exception as exc:  # noqa: BLE001 - per-shot, never crash the whole render
            outputs.append({"shotIdx": shot.get("idx"), "error": str(exc)})
            _emit("warn", phase="frame", message=f"shot {shot.get('idx')} failed: {exc}")

    result = {
        "schemaVersion": RENDER_SCHEMA_VERSION,
        "flowId": flow_id,
        "mode": "render",
        "outputs": outputs,
        "elapsedSec": round(time.time() - t0, 1),
    }
    if cancelled:
        result["cancelled"] = True
    # render result goes to a file (atomic).
    try:
        tmp = os.path.join(working_dir, "result.json.tmp")
        with open(tmp, "w", encoding="utf-8") as handle:
            json.dump(result, handle, ensure_ascii=False, indent=2)
        os.replace(tmp, os.path.join(working_dir, "result.json"))
    except OSError:
        pass
    return result


def run_portraits(*, working_dir, flow_id, image_gen, style="",
                  character_idxs=None, invalidate_character_idxs=None,
                  on_step=None, should_cancel=None):
    """Sync port of huanying_runner.run_portraits (定妆). Draws the three-view
    portraits (front, then side/back referencing the saved front.png) through
    the injected image_gen, persists the registry (flow root + each scene dir),
    returns vimax-portraits-result/v1 (also written to result.json). The source
    is async; the three generator awaits are dropped (brain generator is sync)."""
    t0 = time.time()

    def _emit(stage, **data):
        if on_step is not None:
            on_step(stage, data)

    shotplan = _read_json(os.path.join(working_dir, "shotplan.json"))
    if not isinstance(shotplan, dict):
        raise ValueError("shotplan.json missing - run plan first")
    style = str(style or "")
    char_dicts = portrait_character_dicts(shotplan, character_idxs)
    if not char_dicts:
        if character_idxs:
            raise ValueError("selected character idx not found in shotplan")
        raise ValueError("no visible characters to 定妆")

    # 重摇整套: delete prior pngs for named chars so they redraw this run.
    inval = set(invalidate_character_idxs or [])
    if inval:
        invalidate_portraits(working_dir, [c for c in char_dicts if c["idx"] in inval])

    gen = CharacterPortraitsGenerator(image_gen)

    reg_path = os.path.join(working_dir, "character_portraits_registry.json")
    registry = _read_json(reg_path) or {}

    out_chars = []
    cancelled = False
    for cd in char_dicts:
        if should_cancel is not None and should_cancel():
            cancelled = True
            break
        # CharacterInScene pydantic -> plain dict (the brain generator reads dict).
        ident = cd.get("identifier_in_scene") or ""
        char_dir = os.path.join(working_dir, "character_portraits", f"{cd['idx']}_{_safe_path_component(ident)}")
        os.makedirs(char_dir, exist_ok=True)
        existing = registry.get(ident) or {}
        try:
            paths = {v: os.path.join(char_dir, f"{v}.png") for v in _PORTRAIT_VIEWS}
            urls = {v: ((existing.get(v) or {}).get("url") or "") for v in _PORTRAIT_VIEWS}

            # Skip a view only when the png AND its url both exist - a png
            # without a persisted url would land a blank node on the canvas, so
            # redraw it to recover the url. front first (no reference), side/back
            # reference the front png.
            _emit("progress", phase=f"portrait-{cd['idx']}-front")
            if not (os.path.isfile(paths["front"]) and urls["front"]):
                out = gen.generate_front_portrait(cd, style)
                out.save(paths["front"])
                urls["front"] = getattr(out, "data", "")
                _emit("output", charIdx=cd["idx"], view="front", url=urls["front"], localPath=paths["front"])
            _emit("progress", phase=f"portrait-{cd['idx']}-side")
            if not (os.path.isfile(paths["side"]) and urls["side"]):
                out = gen.generate_side_portrait(cd, paths["front"])
                out.save(paths["side"])
                urls["side"] = getattr(out, "data", "")
                _emit("output", charIdx=cd["idx"], view="side", url=urls["side"], localPath=paths["side"])
            _emit("progress", phase=f"portrait-{cd['idx']}-back")
            if not (os.path.isfile(paths["back"]) and urls["back"]):
                out = gen.generate_back_portrait(cd, paths["front"])
                out.save(paths["back"])
                urls["back"] = getattr(out, "data", "")
                _emit("output", charIdx=cd["idx"], view="back", url=urls["back"], localPath=paths["back"])

            registry[ident] = {
                v: {"path": paths[v], "description": f"A {v} view portrait of {ident}.", "url": urls[v]}
                for v in _PORTRAIT_VIEWS
            }
            out_chars.append({
                "idx": cd["idx"], "identifier": ident,
                "views": [{"view": v, "url": urls[v], "localPath": paths[v]} for v in _PORTRAIT_VIEWS],
            })
        except Exception as exc:  # noqa: BLE001 - per-character, never crash the set
            out_chars.append({"idx": cd["idx"], "identifier": ident, "error": str(exc)})
            _emit("warn", phase="portrait", message=f"character {ident} failed: {exc}")

    scene_count = len(shotplan.get("scenes") or [])
    if not scene_count:
        scene_count = max((int(s.get("sceneIdx") or 0) for s in (shotplan.get("shots") or [])), default=-1) + 1
    fanout_portrait_registry(working_dir, scene_count, registry)

    result = {
        "schemaVersion": PORTRAITS_SCHEMA_VERSION,
        "flowId": flow_id,
        "mode": "portraits",
        "characters": out_chars,
        "elapsedSec": round(time.time() - t0, 1),
    }
    if cancelled:
        result["cancelled"] = True
    try:
        tmp = os.path.join(working_dir, "result.json.tmp")
        with open(tmp, "w", encoding="utf-8") as handle:
            json.dump(result, handle, ensure_ascii=False, indent=2)
        os.replace(tmp, os.path.join(working_dir, "result.json"))
    except OSError:
        pass
    return result
