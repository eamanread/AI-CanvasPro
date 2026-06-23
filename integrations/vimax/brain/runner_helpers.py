"""Pure file helpers shared by the native runners (Phase C). Copied from
integrations/vimax/huanying_runner.py (merge_shot_edits :67-101, invalidate_shots
:104-137, _read_json :226-231 + the field/glob constants :46-64); stdlib-only (no
ViMax import) so brain stays self-contained and import-isolated. The source
helpers' dead `import glob as _glob` (never used) is dropped."""
import json
import os

# Editable shot fields: panel camelCase edit -> ViMax snake_case field.
_EDIT_FIELD_MAP = {
    "shotPrompt": "ff_desc",
    "ffDesc": "ff_desc",
    "shotLastFrame": "lf_desc",
    "lfDesc": "lf_desc",
    "shotVideoPrompt": "motion_desc",
    "motionDesc": "motion_desc",
    "shotAudio": "audio_desc",
    "audioDesc": "audio_desc",
}
# Derived render products to delete when a shot is edited/invalidated, so
# ViMax's file-exists-skip recomputes instead of serving the stale cache
# (G3 double-edge).
_DERIVED_GLOBS = (
    "first_frame.png", "last_frame.png",
    "first_frame_selector_output.json", "last_frame_selector_output.json",
    "video.mp4",
)
_DERIVED_PREFIXES = ("transition_video_", "new_camera_")


def merge_shot_edits(working_dir, edits, scene_idx=0):
    """Merge panel edits into ViMax's per-shot files (P2-M10 writeback).
    Each edit is keyed by localIdx (ViMax's own shot idx). Reads the
    existing JSON, overwrites only the mapped editable fields, atomic
    write-back. Pure file op - no ViMax/network. Returns touched localIdxs."""
    touched = []
    for edit in edits or []:
        local_idx = edit.get("localIdx")
        if local_idx is None:
            local_idx = edit.get("vimaxShotIdx")
        if local_idx is None:
            continue
        shot_path = os.path.join(working_dir, f"scene_{scene_idx}", "shots", str(local_idx), "shot_description.json")
        if not os.path.isfile(shot_path):
            continue
        try:
            with open(shot_path, "r", encoding="utf-8") as handle:
                shot = json.load(handle)
        except (OSError, ValueError):
            continue
        changed = False
        for edit_key, vimax_key in _EDIT_FIELD_MAP.items():
            if edit_key in edit and edit[edit_key] is not None:
                shot[vimax_key] = edit[edit_key]
                changed = True
        if not changed:
            continue
        tmp = shot_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as handle:
            json.dump(shot, handle, ensure_ascii=False, indent=2)
        os.replace(tmp, shot_path)
        touched.append(int(local_idx))
    return touched


def invalidate_shots(working_dir, shot_idxs, scene_idx=0):
    """Delete a shot's derived render products so the next render
    recomputes it (P2-M10 重拍失效协议). Also drops the scene's final video
    (else concat is skipped and the output is stale). Pure file op."""
    removed = []
    for idx in shot_idxs or []:
        shot_dir = os.path.join(working_dir, f"scene_{scene_idx}", "shots", str(idx))
        if not os.path.isdir(shot_dir):
            continue
        for name in _DERIVED_GLOBS:
            target = os.path.join(shot_dir, name)
            if os.path.isfile(target):
                try:
                    os.remove(target)
                    removed.append(target)
                except OSError:
                    pass
        for entry in os.listdir(shot_dir):
            if any(entry.startswith(p) for p in _DERIVED_PREFIXES):
                try:
                    os.remove(os.path.join(shot_dir, entry))
                    removed.append(os.path.join(shot_dir, entry))
                except OSError:
                    pass
    final_video = os.path.join(working_dir, f"scene_{scene_idx}", "final_video.mp4")
    if os.path.isfile(final_video):
        try:
            os.remove(final_video)
            removed.append(final_video)
        except OSError:
            pass
    return removed


def _read_json(path, default=None):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return default


# --- 定妆 (portraits) pure helpers, verbatim from huanying_runner.py:418-512 ---

RENDER_SCHEMA_VERSION = "vimax-render-result/v1"
PORTRAITS_SCHEMA_VERSION = "vimax-portraits-result/v1"
_PORTRAIT_VIEWS = ("front", "side", "back")


def _safe_path_component(name):
    """Mirror of ViMax utils.text.safe_path_component (kept local so the
    portrait helpers are testable without the ViMax tree on sys.path, and so
    invalidate/generate build identical per-character dir names)."""
    import re

    cleaned = re.sub(r"[^\w\-. ]", "_", str(name))
    cleaned = cleaned.strip().lstrip(".")
    return cleaned or "unnamed"


def portrait_character_dicts(shotplan, selected_idxs=None):
    """shotplan.characters (camelCase mirror) -> snake_case dicts ready for
    the portrait generator. Default = visible characters only; an explicit idx
    selection overrides visibility (user named them)."""
    chars = (shotplan or {}).get("characters") or []
    sel = set(selected_idxs) if selected_idxs is not None else None
    out = []
    for c in chars:
        idx = c.get("idx")
        if sel is not None:
            if idx not in sel:
                continue
        elif not c.get("isVisible", True):
            continue
        out.append({
            "idx": idx,
            "identifier_in_scene": c.get("identifierInScene") or "",
            "is_visible": bool(c.get("isVisible", True)),
            "static_features": c.get("staticFeatures") or "",
            "dynamic_features": c.get("dynamicFeatures") or "",
        })
    return out


def portrait_capacity(char_dicts):
    """The BILLED draw ceiling: 3 views (front/side/back) per character. Each
    view bills exactly one successful draw; tenacity retries on a failed draw
    are refunded by the broker (reserve->fail->refund) and draws here run
    sequentially, so a retry never transiently overshoots the cap. M15 must
    size the render-ticket capTotal from THIS number (not from anything
    smaller)."""
    return len(_PORTRAIT_VIEWS) * len(char_dicts or [])


def fanout_portrait_registry(working_dir, scene_count, registry):
    """Render reads the portrait registry per-scene (scene_<n>/...); portraits
    are flow-level (one 定妆 per character, reused across scenes), so write the
    same registry to the flow root AND each scene dir. Atomic per file."""
    # Scene copies first, flow-root LAST: the root is the commit marker, so a
    # crash mid-fanout never leaves the root newer than a scene dir. Each
    # run_portraits rewrites every scene copy from the fresh registry, so any
    # partial state self-heals on the next successful run.
    paths = []
    for s in range(max(0, int(scene_count or 0))):
        scene_dir = os.path.join(working_dir, f"scene_{s}")
        os.makedirs(scene_dir, exist_ok=True)
        paths.append(os.path.join(scene_dir, "character_portraits_registry.json"))
    paths.append(os.path.join(working_dir, "character_portraits_registry.json"))
    for p in paths:
        tmp = p + ".tmp"
        with open(tmp, "w", encoding="utf-8") as handle:
            json.dump(registry, handle, ensure_ascii=False, indent=2)
        os.replace(tmp, p)
    return paths


def invalidate_portraits(working_dir, char_dicts):
    """重摇整套: delete a character's front/side/back pngs and drop it from the
    registry so the next portraits run regenerates it. Returns removed paths."""
    removed = []
    reg_path = os.path.join(working_dir, "character_portraits_registry.json")
    registry = _read_json(reg_path) or {}
    for cd in char_dicts or []:
        ident = cd.get("identifier_in_scene") or cd.get("identifier") or ""
        char_dir = os.path.join(working_dir, "character_portraits", f"{cd.get('idx')}_{_safe_path_component(ident)}")
        for view in _PORTRAIT_VIEWS:
            png = os.path.join(char_dir, f"{view}.png")
            try:
                if os.path.isfile(png):
                    os.remove(png)
                    removed.append(png)
            except OSError:
                pass
        registry.pop(ident, None)
    try:
        with open(reg_path, "w", encoding="utf-8") as handle:
            json.dump(registry, handle, ensure_ascii=False, indent=2)
    except OSError:
        pass
    return removed
