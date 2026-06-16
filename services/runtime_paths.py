import os
import hashlib
import json
import shutil
import sys
import time
from pathlib import Path


APP_STORAGE_NAME = "AI-CanvasPro"
ONEFILE_ENV_FLAGS = ("1", "true", "yes", "on", "onefile")


def _abs(path):
    return os.path.abspath(os.fspath(path))


def get_distribution_kind():
    """Return source, onedir, or onefile without treating every frozen app as onefile."""
    forced_distribution = os.environ.get("AIC_DISTRIBUTION", "").strip().lower()
    packaged_launcher = os.environ.get("AIC_PACKAGED_LAUNCHER", "").strip().lower()
    if forced_distribution == "onefile" or packaged_launcher in ONEFILE_ENV_FLAGS:
        return "onefile"
    if getattr(sys, "frozen", False):
        return "onedir"
    return "source"


def get_platform_writable_root(app_name=APP_STORAGE_NAME):
    if os.name == "nt":
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~\\AppData\\Local")
        return _abs(os.path.join(base, app_name))

    if sys.platform == "darwin":
        return _abs(os.path.expanduser(os.path.join("~/Library/Application Support", app_name)))

    base = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
    return _abs(os.path.join(base, app_name))


def build_runtime_paths(
    *,
    source_root=None,
    bundle_root=None,
    executable_dir=None,
    distribution=None,
    writable_root=None,
):
    source_root = _abs(source_root or Path(__file__).resolve().parents[1])
    bundle_root = _abs(bundle_root or getattr(sys, "_MEIPASS", source_root))
    executable_dir = _abs(
        executable_dir
        or (os.path.dirname(sys.executable) if getattr(sys, "frozen", False) else source_root)
    )
    distribution = distribution or get_distribution_kind()

    if distribution == "source":
        resource_root = source_root
        writable_root = _abs(writable_root or source_root)
    elif distribution == "onedir":
        resource_root = executable_dir
        writable_root = _abs(writable_root or executable_dir)
    else:
        resource_root = bundle_root
        writable_root = _abs(writable_root or get_platform_writable_root())

    resource_root_override = str(os.environ.get("AIC_RESOURCE_ROOT") or "").strip()
    writable_root_override = str(os.environ.get("AIC_WRITABLE_ROOT") or "").strip()
    if resource_root_override:
        resource_root = _abs(os.path.expandvars(os.path.expanduser(resource_root_override)))
    if writable_root_override:
        writable_root = _abs(os.path.expandvars(os.path.expanduser(writable_root_override)))

    user_dir = os.path.join(writable_root, "user")
    data_dir = os.path.join(writable_root, "data")
    output_dir = os.path.join(writable_root, "output")
    uploads_dir = os.path.join(data_dir, "uploads")
    system_state_dir = get_platform_writable_root()

    return {
        "distribution": distribution,
        "sourceRoot": source_root,
        "importRoot": bundle_root,
        "resourceRoot": resource_root,
        "executableDir": executable_dir,
        "writableRoot": writable_root,
        "userDir": user_dir,
        "canvasDir": os.path.join(user_dir, "Canvas Project"),
        "outputDir": output_dir,
        "dataDir": data_dir,
        "uploadsDir": uploads_dir,
        "assetsDir": os.path.join(data_dir, "assets"),
        "assetThumbsDir": os.path.join(data_dir, "assets", "thumbs"),
        "workflowsDir": os.path.join(data_dir, "workflows"),
        "workflowThumbsDir": os.path.join(data_dir, "workflows", "thumbs"),
        "configFile": os.path.join(user_dir, "config.json"),
        "settingsFile": os.path.join(user_dir, "settings.json"),
        "systemStateDir": system_state_dir,
        "systemSettingsFile": os.path.join(system_state_dir, "settings.json"),
        "seedPresetDefinitionsPath": os.path.join(resource_root, "config", "prompt-presets.json"),
        "presetDefinitionsPath": os.path.join(user_dir, "prompt-presets.json"),
    }


def ensure_runtime_dirs(paths):
    for key in (
        "userDir",
        "canvasDir",
        "outputDir",
        "uploadsDir",
        "assetsDir",
        "assetThumbsDir",
        "workflowsDir",
        "workflowThumbsDir",
        "systemStateDir",
    ):
        os.makedirs(paths[key], exist_ok=True)


def copy_missing_tree(src, dst):
    if not os.path.isdir(src):
        return

    os.makedirs(dst, exist_ok=True)
    for root, dirs, files in os.walk(src):
        rel = os.path.relpath(root, src)
        target_root = dst if rel == "." else os.path.join(dst, rel)
        os.makedirs(target_root, exist_ok=True)
        for directory in dirs:
            os.makedirs(os.path.join(target_root, directory), exist_ok=True)
        for file_name in files:
            source_file = os.path.join(root, file_name)
            target_file = os.path.join(target_root, file_name)
            if not os.path.exists(target_file):
                try:
                    shutil.copy2(source_file, target_file)
                except Exception:
                    pass


def _read_json_object(path, fallback=None):
    result = {} if fallback is None else fallback
    try:
        with open(path, "r", encoding="utf-8-sig") as file:
            data = json.load(file)
        return data if isinstance(data, dict) else result
    except Exception:
        return result


def _write_json_object(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)


def _private_defaults_hash(manifest):
    payload = json.dumps(manifest if isinstance(manifest, dict) else {}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _private_defaults_rel_path(root, path):
    return Path(path).resolve().relative_to(Path(root).resolve()).as_posix()


def _is_skipped_private_default(rel_path):
    normalized = rel_path.replace("\\", "/").strip("/")
    parts = tuple(part for part in normalized.split("/") if part)
    if not parts:
        return True
    if parts[-1].lower() == "settings.json":
        return True
    if parts[0] in {".git", "release", "venv", "node_modules", "user_data"}:
        return True
    return False


def _should_overwrite_private_default(rel_path):
    normalized = rel_path.replace("\\", "/").strip("/")
    if normalized in {
        "user/config.json",
        "user/prompt-presets.json",
    }:
        return True
    if normalized.startswith("user/prompt/"):
        return True
    if normalized.startswith("user/tools/"):
        return True
    return False


def _copy_private_defaults(defaults_root, writable_root):
    copied = 0
    skipped = 0
    overwritten = 0
    defaults_root = os.path.abspath(os.fspath(defaults_root))
    writable_root = os.path.abspath(os.fspath(writable_root))
    for root, dirs, files in os.walk(defaults_root):
        dirs[:] = [
            dirname
            for dirname in dirs
            if not _is_skipped_private_default(
                os.path.join(os.path.relpath(root, defaults_root), dirname)
            )
        ]
        for file_name in files:
            src_file = os.path.join(root, file_name)
            rel_path = _private_defaults_rel_path(defaults_root, src_file)
            if rel_path == "manifest.json" or _is_skipped_private_default(rel_path):
                skipped += 1
                continue
            dst_file = os.path.join(writable_root, *rel_path.split("/"))
            overwrite = _should_overwrite_private_default(rel_path)
            if os.path.exists(dst_file) and not overwrite:
                skipped += 1
                continue
            os.makedirs(os.path.dirname(dst_file), exist_ok=True)
            if os.path.exists(dst_file) and overwrite:
                overwritten += 1
            try:
                shutil.copy2(src_file, dst_file)
                copied += 1
            except Exception:
                skipped += 1
    return {"copied": copied, "skipped": skipped, "overwritten": overwritten}


def apply_private_defaults(
    defaults_root,
    writable_root,
    *,
    manifest=None,
    marker_name=".private_defaults_applied.json",
    logger=None,
):
    defaults_root = os.path.abspath(os.fspath(defaults_root))
    writable_root = os.path.abspath(os.fspath(writable_root))
    if not os.path.isdir(defaults_root):
        return {"found": False, "applied": False, "reason": "missing", "copied": 0, "skipped": 0, "overwritten": 0}

    if manifest is None:
        manifest = _read_json_object(os.path.join(defaults_root, "manifest.json"), {})
    if not isinstance(manifest, dict):
        manifest = {}

    manifest_hash = _private_defaults_hash(manifest)
    marker_path = os.path.join(writable_root, marker_name)
    marker = _read_json_object(marker_path, {})
    if marker.get("manifestHash") == manifest_hash:
        return {"found": True, "applied": False, "reason": "already-applied", "copied": 0, "skipped": 0, "overwritten": 0}

    os.makedirs(writable_root, exist_ok=True)
    stats = _copy_private_defaults(defaults_root, writable_root)
    _write_json_object(
        marker_path,
        {
            "manifestHash": manifest_hash,
            "manifest": manifest,
            "appliedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "copied": stats["copied"],
            "skipped": stats["skipped"],
            "overwritten": stats["overwritten"],
        },
    )
    if logger is not None:
        try:
            logger(
                "private defaults applied: "
                f"copied={stats['copied']} overwritten={stats['overwritten']} skipped={stats['skipped']}"
            )
        except Exception:
            pass
    return {"found": True, "applied": True, "reason": "applied", **stats}


# 迁库后(预设落 libraryDir/presets/...),本机 writable_root/user 下的旧预设残留
# 不再被读取。默认策略=忽略:只在显式 dry_run=False 时清理,避免惊扰用户。
_LEGACY_USER_PRESET_TARGETS = (
    "user/prompt-presets.json",  # 单文件
    "user/prompt",               # 逐 txt 预设目录(整目录)
)


def cleanup_legacy_user_presets(writable_root, *, dry_run=True):
    """报告/清理迁库后遗留在本机 user/ 下的旧预设残留。

    迁移后系统预设整表与逐 txt 预设改读 libraryDir/presets/*,
    writable_root/user/prompt-presets.json 与 writable_root/user/prompt/
    成为不再被读取的死副本。本函数:
      - 始终只作用于本机 writable_root(绝不触碰 libraryDir);
      - dry_run=True(默认)只报告 found、不删;
      - dry_run=False 才真删,缺失项安全降级、不抛。

    返回 {"writableRoot": str, "dryRun": bool, "found": [rel...], "removed": [rel...]}。
    found/removed 用 posix 相对路径(相对 writable_root)。
    """
    writable_root = os.path.abspath(os.fspath(writable_root))
    found = []
    removed = []
    for rel in _LEGACY_USER_PRESET_TARGETS:
        target = os.path.join(writable_root, *rel.split("/"))
        if not os.path.exists(target):
            continue
        found.append(rel)
        if dry_run:
            continue
        try:
            if os.path.isdir(target):
                shutil.rmtree(target)
            else:
                os.remove(target)
            removed.append(rel)
        except Exception:
            # 残留删不掉(占用/权限)不应阻断启动:报告 found、不计入 removed。
            pass
    return {
        "writableRoot": writable_root,
        "dryRun": bool(dry_run),
        "found": found,
        "removed": removed,
    }


def summarize_model_registry_for_log(config):
    registry = config.get("modelRegistry") if isinstance(config, dict) else {}
    if not isinstance(registry, dict):
        return {}
    summary = {}
    for node_type, models in registry.items():
        if not isinstance(models, list):
            continue
        summarized_models = []
        for model in models:
            if not isinstance(model, dict):
                continue
            summarized_models.append(
                {
                    "modelName": str(model.get("modelName") or ""),
                    "modelId": str(model.get("modelId") or model.get("modelID") or ""),
                    "baseUrl": str(model.get("baseUrl") or ""),
                    "status": str(model.get("status") or ""),
                    "hasApiKey": bool(str(model.get("apiKey") or "").strip()),
                }
            )
        summary[str(node_type)] = summarized_models
    return summary
