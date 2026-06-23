r"""
./server.py - 幻映 V2 ????

????:
  cd v2
  venv\Scripts\python server.py

?????: http://localhost:8777

??????? v2/ ??:
  user/Canvas Project/  - ??????
  user/shortcuts.json   - ?????
  user/settings.json    - ?????
  user/config.json      - API Key ??
  data/uploads/         - ??????

"""

import http.server
import socketserver
import os
import json
import threading
import subprocess
import time
import mimetypes
import sys
import urllib.request
import urllib.error
import urllib.parse
from urllib.parse import unquote
import base64
import re
import random
import hashlib
import datetime
import hmac
import ipaddress
import shutil

SOURCE_DIR = os.path.abspath(os.path.dirname(__file__))
from services.runtime_paths import (
    apply_private_defaults,
    build_runtime_paths,
    copy_missing_tree as _copy_missing_runtime_tree,
    ensure_runtime_dirs,
    summarize_model_registry_for_log,
)
RUNTIME_PATHS = build_runtime_paths(
    source_root=SOURCE_DIR,
    bundle_root=getattr(sys, "_MEIPASS", SOURCE_DIR),
    executable_dir=os.path.dirname(sys.executable) if getattr(sys, "frozen", False) else SOURCE_DIR,
)


def _startup_log(message):
    try:
        root = os.environ.get("LOCALAPPDATA") or os.environ.get("TEMP") or os.getcwd()
        path = os.path.join(root, "AI-CanvasPro", "launcher.log")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        with open(path, "a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] server: {message}\n")
    except Exception:
        pass


_startup_log("module import start")
IMPORT_ROOT = RUNTIME_PATHS["importRoot"]
RESOURCE_ROOT = RUNTIME_PATHS["resourceRoot"]
WRITABLE_ROOT = RUNTIME_PATHS["writableRoot"]
APP_ROOT = RESOURCE_ROOT

if IMPORT_ROOT not in sys.path:
    sys.path.insert(0, IMPORT_ROOT)

CURRENT_DIR = RESOURCE_ROOT

def _prepend_bundled_tool_dir(*parts):
    tool_dir = os.path.join(RESOURCE_ROOT, *parts)
    if not os.path.isdir(tool_dir):
        return
    current_path = os.environ.get("PATH", "") or ""
    normalized_tool_dir = os.path.normcase(os.path.abspath(tool_dir))
    existing = [
        os.path.normcase(os.path.abspath(item.strip().strip('"')))
        for item in current_path.split(os.pathsep)
        if item.strip()
    ]
    if normalized_tool_dir not in existing:
        os.environ["PATH"] = tool_dir + os.pathsep + current_path

_prepend_bundled_tool_dir("vendor", "ffmpeg", "bin")

from services.hot_update_service import HotUpdateService
from services.http_route_dispatcher import HttpRouteDispatcher
from services.config_route_service import ConfigRouteService
from services.json_file_route_service import JsonFileRouteService
from services.library_file_route_service import LibraryFileRouteService
from services.media_file_route_service import MediaFileRouteService
from services.local_media_processing_route_service import LocalMediaProcessingRouteService
from services.remote_proxy_route_service import RemoteProxyRouteService
from services.subscription_gate_service import SubscriptionGateService
from services.local_subscription_client import LocalSubscriptionClient
from services.dreamina_cli_service import DreaminaCliService
from services.dreamina_route_service import DreaminaRouteService
from integrations.seedance_extension_bridge import (
    SeedanceBrowserLauncher,
    SeedanceWebBridgeService,
    SeedanceWebRouteService,
)
from services.sam3_service import Sam3Service
from services.sam3_route_service import Sam3RouteService
from services.canvas_agent_action_schema import CanvasAgentActionSchema
from services.director_bridge_service import DirectorBridgeService

DIRECTOR_BRIDGE_SERVICE = DirectorBridgeService()
from services.canvas_agent_conversation_service import CanvasAgentConversationService
from services.canvas_agent_context_service import CanvasAgentContextService
from services.canvas_agent_execution_service import CanvasAgentExecutionService
from services.canvas_agent_route_service import CanvasAgentRouteService
from services.canvas_agent_sync_service import CanvasAgentSyncService
from services.pi_bridge_service import PiBridgeService
from services.pi_runtime_service import PiRuntimeService
from services.library_storage import (
    derive_library_paths,
    validate_library_dir,
    library_connection_state as _lib_connection_state,
    library_status,
    machine_id,
    next_gen_filename,
    parse_gen_seq,
    atomic_replace_with_retry,
    resolve_startup_library_dir,
    migrate_into_library,
)
from services.runtime_paths import cleanup_legacy_user_presets as _cleanup_legacy_user_presets

_startup_log("service imports complete")

mimetypes.add_type("text/javascript; charset=utf-8", ".js")
mimetypes.add_type("text/javascript; charset=utf-8", ".mjs")
mimetypes.add_type("text/css; charset=utf-8", ".css")


class ReusableThreadingTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True

def _get_int_env(name, default, min_value=None):
    try:
        value = int(str(os.environ.get(name, default)).strip())
    except Exception:
        return default
    if min_value is not None and value < min_value:
        return default
    return value

def _get_bool_env(name, default=False):
    raw = os.environ.get(name)
    if raw is None:
        return bool(default)
    return str(raw).strip().lower() in ("1", "true", "yes", "on")

def _split_env_list(name):
    raw = str(os.environ.get(name, "") or "").strip()
    if not raw:
        return []
    return [item.strip() for item in re.split(r"[\s,]+", raw) if item.strip()]

def _normalize_origin(origin):
    raw = str(origin or "").strip().rstrip("/")
    if not raw or raw == "null":
        return ""
    try:
        parsed = urllib.parse.urlparse(raw)
    except Exception:
        return ""
    if parsed.scheme.lower() not in ("http", "https") or not parsed.netloc:
        return ""
    try:
        if parsed.port is not None and (parsed.port < 1 or parsed.port > 65535):
            return ""
    except ValueError:
        return ""
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"

PORT      = _get_int_env("AICANVAS_PORT", 8777, 1)
BIND_HOST = (os.environ.get("AIC_BIND_HOST", "127.0.0.1") or "").strip() or "127.0.0.1"
LAN_MODE  = _get_bool_env("AIC_LAN_MODE") or _get_bool_env("AIC_ENABLE_LAN")
ALLOWED_ORIGINS = tuple(
    origin for origin in (_normalize_origin(item) for item in _split_env_list("AIC_ALLOWED_ORIGINS")) if origin
)
SEEDANCE_WEB_ALLOWED_ORIGINS = (
    "https://dreamina.capcut.com",
    "https://www.dreamina.ai",
    "https://jimeng.jianying.com",
)
LOCAL_ACCESS_TOKEN = str(os.environ.get("AIC_LOCAL_TOKEN", "") or "").strip()
DIRECTORY = APP_ROOT   # v2/ 绝对路径
DIRECTORY = RESOURCE_ROOT
# --- ???? ---
# ? index.html ????
import re

def get_version_from_index_html():
    """? index.html ??????"""
    index_path = os.path.join(DIRECTORY, "index.html")
    try:
        with open(index_path, 'r', encoding='utf-8') as f:
            content = f.read()
        # 匹配 <meta name="app-version" content="V0.0.7">
        match = re.search(r'<meta name="app-version" content="([^"]+)"', content)
        if match:
            return match.group(1)
    except Exception:
        pass
    return "V0.0.7"  # ????

LOCAL_VERSION   = get_version_from_index_html()  # ? index.html ????
_gen_seq_lock   = threading.Lock()
_smart_clip_jobs = {}
_smart_clip_lock = threading.Lock()

# --- ???????? v2/ ?? ---
DEFAULT_USER_DIR = os.path.join(DIRECTORY, "user")
DEFAULT_OUTPUT_DIR = os.path.join(DIRECTORY, "output")
DEFAULT_UPLOADS_DIR = os.path.join(DIRECTORY, "data", "uploads")

USER_DIR       = DEFAULT_USER_DIR
CANVAS_DIR     = os.path.join(USER_DIR,  "Canvas Project")
ASSETS_DIR     = os.path.join(DIRECTORY, "data", "assets")
ASSET_THUMBS_DIR = os.path.join(ASSETS_DIR, "thumbs")
WORKFLOWS_DIR  = os.path.join(DIRECTORY, "data", "workflows")
WORKFLOW_THUMBS_DIR = os.path.join(WORKFLOWS_DIR, "thumbs")
UPLOADS_DIR    = DEFAULT_UPLOADS_DIR
OUTPUT_DIR     = DEFAULT_OUTPUT_DIR
CONFIG_FILE    = os.path.join(USER_DIR, "config.json")
SETTINGS_FILE  = os.path.join(USER_DIR, "settings.json")
DEFAULT_USER_DIR = RUNTIME_PATHS["userDir"]
DEFAULT_OUTPUT_DIR = RUNTIME_PATHS["outputDir"]
DEFAULT_UPLOADS_DIR = RUNTIME_PATHS["uploadsDir"]
USER_DIR = DEFAULT_USER_DIR
CANVAS_DIR = RUNTIME_PATHS["canvasDir"]
ASSETS_DIR = RUNTIME_PATHS["assetsDir"]
ASSET_THUMBS_DIR = RUNTIME_PATHS["assetThumbsDir"]
WORKFLOWS_DIR = RUNTIME_PATHS["workflowsDir"]
WORKFLOW_THUMBS_DIR = RUNTIME_PATHS["workflowThumbsDir"]
UPLOADS_DIR = DEFAULT_UPLOADS_DIR
OUTPUT_DIR = DEFAULT_OUTPUT_DIR
CONFIG_FILE = RUNTIME_PATHS["configFile"]
SETTINGS_FILE = RUNTIME_PATHS["settingsFile"]
GEN_SEQ_STATE_FILE = os.path.join(OUTPUT_DIR, ".gen_seq_state.json")

# === NAS 共享库（方案乙/4.2-B）===
LIBRARY_DIR = ""

# 启动期判定为"配了库但不可达"时置 True：功能降级、UI 报错、不回退 DEFAULT_*。
LIBRARY_DISCONNECTED = False


def _library_enabled():
    return bool(LIBRARY_DIR)


def _library_connection_status():
    """server.py 薄包装：把判定逻辑全推给 library_storage 纯函数。"""
    return _lib_connection_state(LIBRARY_DIR)


MAX_UPLOAD_BYTES = _get_int_env("AIC_UPLOAD_MAX_BYTES", 100 * 1024 * 1024, 1)
IMAGE_DERIVATIVE_DISPLAY_MAX_EDGE = 1280
IMAGE_DERIVATIVE_THUMB_MAX_EDGE = 320
IMAGE_DERIVATIVE_DISPLAY_QUALITY = 78
IMAGE_DERIVATIVE_THUMB_QUALITY = 70
IMAGE_DERIVATIVE_ROOT_DIRNAME = "_derived"

V54_VIP_MODEL_ID = "runninghub/2041741496667348994"
V54_VIP_WORKFLOW_ID = "2041741496667348994"
DREAMINA_VIDEO_VIP_MODEL_ID = "dreamina/video_vip"
VIDEO_VIP_MODEL_IDS = (
    "runninghub/2041741496667348994",
    "dreamina/video_vip",
)
VIDEO_VIP_WORKFLOW_IDS = set(
    mid.split("/", 1)[1]
    for mid in VIDEO_VIP_MODEL_IDS
    if mid.startswith("runninghub/") and "/" in mid
)
RUNNINGHUB_WORKFLOW_NODE_TYPE_MAP = {
    "1991510999935172610": "audio",
    "2013613374315171841": "audio",
    **{
        workflow_id: "video"
        for workflow_id in VIDEO_VIP_WORKFLOW_IDS
    },
}
VIDEO_VIP_MODEL_NAME_MAP = {
    "runninghub/2041741496667348994": "视频编辑V5.4",
    "dreamina/video_vip": "即梦视频",
}
SUB_STATUS_NONE = "none"
SUB_STATUS_ACTIVE = "active"
SUB_STATUS_EXPIRED = "expired"
SUB_ERROR_INVALID_ARGUMENTS = "INVALID_ARGUMENTS"
SUB_ERROR_INVALID_CDKEY = "INVALID_CDKEY"
SUB_ERROR_CDKEY_ALREADY_USED = "CDKEY_ALREADY_USED"
SUB_ERROR_REQUIRED = "SUBSCRIPTION_REQUIRED"
SUB_ERROR_MODEL_NOT_ENTITLED = "SUBSCRIPTION_MODEL_NOT_ENTITLED"
SUB_MESSAGE_V54_REQUIRED = "请先完成授权激活后再继续生成"
LOCAL_FIXED_CDKEY = "ycfh5566"
LOCAL_ONE_TIME_CDKEY = "fcyh0012"
# 分级一次性授权码：每台设备激活一次即作废，按各自有效期计算到期时间。
# 原有的 ycfh5566 / fcyh0012 语义不变，本表仅做新增。
_LOCAL_WEEK_SECONDS = 7 * 24 * 60 * 60
_LOCAL_MONTH_SECONDS = 30 * 24 * 60 * 60
_LOCAL_HALF_YEAR_SECONDS = 180 * 24 * 60 * 60
LOCAL_TIERED_CDKEYS = [
    # 周卡（7 天）
    {"code": "wkfh0701", "duration_seconds": _LOCAL_WEEK_SECONDS},
    {"code": "wkfh0702", "duration_seconds": _LOCAL_WEEK_SECONDS},
    {"code": "wkfh0703", "duration_seconds": _LOCAL_WEEK_SECONDS},
    # 月卡（30 天）
    {"code": "mofh3001", "duration_seconds": _LOCAL_MONTH_SECONDS},
    {"code": "mofh3002", "duration_seconds": _LOCAL_MONTH_SECONDS},
    {"code": "mofh3003", "duration_seconds": _LOCAL_MONTH_SECONDS},
    # 半年卡（180 天）
    {"code": "byfh1801", "duration_seconds": _LOCAL_HALF_YEAR_SECONDS},
]
LOCAL_FIXED_SUBSCRIPTION_ENABLED = True
DEFAULT_SUB_CONTACT_TEXT = os.environ.get(
    "AIC_SUB_CONTACT_TEXT",
    "联系管理员获取授权码",
).strip() or "联系管理员获取授权码"
DEFAULT_SUB_CONTACT_URL = os.environ.get("AIC_SUB_CONTACT_URL", "").strip()
OFFICIAL_SUBSCRIPTION_API_BASE = "https://api.ashuoai.com"


def _get_system_state_dir():
    app_folder = "AI-CanvasPro"
    if sys.platform.startswith("win"):
        base_dir = (
            os.environ.get("LOCALAPPDATA")
            or os.environ.get("APPDATA")
            or os.path.expanduser("~")
        )
        return os.path.join(base_dir, app_folder)
    if sys.platform == "darwin":
        return os.path.join(
            os.path.expanduser("~/Library/Application Support"),
            app_folder,
        )
    base_dir = (
        os.environ.get("XDG_STATE_HOME")
        or os.path.expanduser("~/.local/state")
    )
    return os.path.join(base_dir, app_folder)


SYSTEM_STATE_DIR = RUNTIME_PATHS["systemStateDir"]
SYSTEM_SETTINGS_FILE = RUNTIME_PATHS["systemSettingsFile"]


def _read_json_file(path, default=None):
    fallback = {} if default is None else default
    try:
        with open(path, "r", encoding="utf-8-sig") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else fallback
    except Exception:
        return fallback


def _write_json_file(path, data):
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _normalize_storage_dir(raw, fallback):
    value = str(raw or "").strip()
    if not value:
        return os.path.abspath(fallback)
    value = os.path.expandvars(os.path.expanduser(value))
    return os.path.abspath(value)


def _file_save_paths_from_settings(settings):
    src = settings.get("fileSavePaths") if isinstance(settings, dict) else {}
    if not isinstance(src, dict):
        src = {}
    return {
        "userDir": _normalize_storage_dir(src.get("userDir"), DEFAULT_USER_DIR),
        "outputDir": _normalize_storage_dir(src.get("outputDir"), DEFAULT_OUTPUT_DIR),
        "tempDir": _normalize_storage_dir(src.get("tempDir"), DEFAULT_UPLOADS_DIR),
    }


def _current_file_save_paths():
    return {
        "userDir": os.path.abspath(USER_DIR),
        "outputDir": os.path.abspath(OUTPUT_DIR),
        "tempDir": os.path.abspath(UPLOADS_DIR),
    }


def _is_path_inside(candidate, root):
    try:
        candidate_abs = os.path.normcase(os.path.abspath(candidate))
        root_abs = os.path.normcase(os.path.abspath(root))
        return os.path.commonpath([candidate_abs, root_abs]) == root_abs
    except Exception:
        return False


def _is_same_or_nested_path(a, b):
    aa = os.path.normcase(os.path.abspath(a))
    bb = os.path.normcase(os.path.abspath(b))
    return aa == bb or _is_path_inside(aa, bb) or _is_path_inside(bb, aa)


def _validate_file_save_paths(paths):
    normalized = {
        "userDir": _normalize_storage_dir(paths.get("userDir"), DEFAULT_USER_DIR),
        "outputDir": _normalize_storage_dir(paths.get("outputDir"), DEFAULT_OUTPUT_DIR),
        "tempDir": _normalize_storage_dir(paths.get("tempDir"), DEFAULT_UPLOADS_DIR),
    }
    for label, p in (
        ("用户设置保存路径", normalized["userDir"]),
        ("输出文件保存路径", normalized["outputDir"]),
        ("临时文件保存路径", normalized["tempDir"]),
    ):
        if not os.path.isabs(p):
            raise ValueError(f"{label}必须是绝对路径")
        if os.path.exists(p) and not os.path.isdir(p):
            raise ValueError(f"{label}不能指向文件")

    pairs = (
        ("用户设置保存路径", normalized["userDir"], "输出文件保存路径", normalized["outputDir"]),
        ("用户设置保存路径", normalized["userDir"], "临时文件保存路径", normalized["tempDir"]),
        ("输出文件保存路径", normalized["outputDir"], "临时文件保存路径", normalized["tempDir"]),
    )
    for left_label, left, right_label, right in pairs:
        if _is_same_or_nested_path(left, right):
            raise ValueError(f"{left_label}和{right_label}不能相同或互相包含")
    return normalized


def _copy_missing_tree(src, dst):
    src = os.path.abspath(src)
    dst = os.path.abspath(dst)
    if not os.path.isdir(src):
        return
    os.makedirs(dst, exist_ok=True)
    for root, dirs, files in os.walk(src):
        rel_root = os.path.relpath(root, src)
        target_root = dst if rel_root == "." else os.path.join(dst, rel_root)
        os.makedirs(target_root, exist_ok=True)
        for dirname in dirs:
            os.makedirs(os.path.join(target_root, dirname), exist_ok=True)
        for filename in files:
            src_file = os.path.join(root, filename)
            dst_file = os.path.join(target_root, filename)
            if os.path.exists(dst_file):
                continue
            try:
                shutil.copy2(src_file, dst_file)
            except Exception:
                pass


def _migrate_legacy_packaged_storage_if_needed():
    if RUNTIME_PATHS["distribution"] != "onefile":
        return
    legacy_root = os.path.abspath(RUNTIME_PATHS["executableDir"])
    writable_root = os.path.abspath(RUNTIME_PATHS["writableRoot"])
    if os.path.normcase(legacy_root) == os.path.normcase(writable_root):
        return
    if os.path.exists(SYSTEM_SETTINGS_FILE):
        return
    for relative_path in ("user", "output", os.path.join("data", "uploads")):
        _copy_missing_runtime_tree(
            os.path.join(legacy_root, relative_path),
            os.path.join(writable_root, relative_path),
        )


def _refresh_storage_globals(paths):
    global USER_DIR, CANVAS_DIR, UPLOADS_DIR, OUTPUT_DIR, CONFIG_FILE, SETTINGS_FILE
    global GEN_SEQ_STATE_FILE, DREAMINA_CLI_SERVICE, DREAMINA_ROUTE_SERVICE
    global ASSETS_DIR, ASSET_THUMBS_DIR, WORKFLOWS_DIR, WORKFLOW_THUMBS_DIR
    USER_DIR = os.path.abspath(paths["userDir"])
    CANVAS_DIR = os.path.join(USER_DIR, "Canvas Project")
    UPLOADS_DIR = os.path.abspath(paths["tempDir"])
    OUTPUT_DIR = os.path.abspath(paths["outputDir"])
    CONFIG_FILE = os.path.join(USER_DIR, "config.json")
    SETTINGS_FILE = os.path.join(USER_DIR, "settings.json")
    GEN_SEQ_STATE_FILE = os.path.join(OUTPUT_DIR, ".gen_seq_state.json")
    if _library_enabled():
        lib = derive_library_paths(LIBRARY_DIR)
        ASSETS_DIR = os.path.abspath(lib["assetsDir"])
        ASSET_THUMBS_DIR = os.path.abspath(lib["assetThumbsDir"])
        WORKFLOWS_DIR = os.path.abspath(lib["workflowsDir"])
        WORKFLOW_THUMBS_DIR = os.path.abspath(lib["workflowThumbsDir"])
        OUTPUT_DIR = os.path.abspath(lib["outputDir"])
        UPLOADS_DIR = os.path.abspath(lib["uploadsDir"])
        GEN_SEQ_STATE_FILE = os.path.join(OUTPUT_DIR, ".gen_seq_state.json")
    try:
        DREAMINA_CLI_SERVICE = DreaminaCliService(CONFIG_FILE, output_root_dir=OUTPUT_DIR)
        DREAMINA_ROUTE_SERVICE = DreaminaRouteService(
            cli_service=DREAMINA_CLI_SERVICE,
            subscription_gate_service=SUBSCRIPTION_GATE_SERVICE,
            video_required_model_id=DREAMINA_VIDEO_VIP_MODEL_ID,
        )
    except NameError:
        pass


def _ensure_storage_dirs():
    os.makedirs(USER_DIR, exist_ok=True)
    os.makedirs(CANVAS_DIR, exist_ok=True)
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    if _library_enabled():
        os.makedirs(ASSETS_DIR, exist_ok=True)
        os.makedirs(ASSET_THUMBS_DIR, exist_ok=True)
        os.makedirs(WORKFLOWS_DIR, exist_ok=True)
        os.makedirs(WORKFLOW_THUMBS_DIR, exist_ok=True)


def _apply_file_save_paths(paths, migrate=False):
    normalized = _validate_file_save_paths(paths)
    previous = _current_file_save_paths()
    for p in normalized.values():
        os.makedirs(p, exist_ok=True)
    if migrate:
        _copy_missing_tree(previous["userDir"], normalized["userDir"])
        _copy_missing_tree(previous["outputDir"], normalized["outputDir"])
        _copy_missing_tree(previous["tempDir"], normalized["tempDir"])
    _refresh_storage_globals(normalized)
    _ensure_storage_dirs()
    return _current_file_save_paths()


def _persist_system_file_save_paths(paths):
    system_settings = _read_json_file(SYSTEM_SETTINGS_FILE, {})
    next_system_settings = dict(system_settings)
    next_system_settings["fileSavePaths"] = dict(paths)
    if system_settings.get("installId"):
        next_system_settings["installId"] = system_settings.get("installId")
    _write_json_file(SYSTEM_SETTINGS_FILE, next_system_settings)


def _persist_system_library_dir(library_dir):
    """把 libraryDir 写进 system settings（独立键，不并入 fileSavePaths）。"""
    system_settings = _read_json_file(SYSTEM_SETTINGS_FILE, {})
    next_system_settings = dict(system_settings)
    if library_dir:
        next_system_settings["libraryDir"] = library_dir
    else:
        next_system_settings.pop("libraryDir", None)
    if system_settings.get("installId"):
        next_system_settings["installId"] = system_settings.get("installId")
    _write_json_file(SYSTEM_SETTINGS_FILE, next_system_settings)


def _apply_library_dir(library_dir, migrate=False):
    """校验库目录 -> 设 LIBRARY_DIR -> 用 derive_library_paths 覆盖存储 globals。

    返回规范化绝对路径；空串表示关闭共享库，恢复到本机 fileSavePaths 推导的目录。
    migrate=True（首次设库）：在覆盖 globals 之前，先把本机已有库 copy-missing
    迁入共享库（Task 10 的 migrate_into_library，目标存在即跳过），迁完再调用
    cleanup_legacy_user_presets 删本机旧预设残留（§E/§F 接线点）。
    """
    global LIBRARY_DIR
    global ASSETS_DIR, ASSET_THUMBS_DIR, WORKFLOWS_DIR, WORKFLOW_THUMBS_DIR
    global OUTPUT_DIR, UPLOADS_DIR

    raw = str(library_dir or "").strip()
    if not raw:
        LIBRARY_DIR = ""
        # 关闭库：按本机 fileSavePaths 重新推导（_refresh_storage_globals 在
        # _library_enabled()==False 时把 ASSETS/WORKFLOWS/OUTPUT/UPLOADS 复位本机默认）。
        _refresh_storage_globals(_current_file_save_paths())
        return ""

    normalized = validate_library_dir(raw, USER_DIR)
    library_paths = derive_library_paths(normalized)

    # §F 首次设库 copy-missing 迁移：必须在切换 LIBRARY_DIR 之前用"迁移前的本机全局"
    # 组装 previous_paths，把本机 assets/workflows/presets/output/uploads 补缺式迁入库。
    if migrate:
        previous_paths = {
            "userDir": USER_DIR,
            "outputDir": OUTPUT_DIR,
            "uploadsDir": UPLOADS_DIR,
            "assetsDir": ASSETS_DIR,
            "workflowsDir": WORKFLOWS_DIR,
            "presetDefinitionsPath": os.path.join(USER_DIR, "prompt-presets.json"),
            "presetRootDir": os.path.join(USER_DIR, "prompt"),
        }
        migrate_into_library(previous_paths, library_paths)  # 目标存在即跳过
        # §E 迁移完成后真删本机旧预设残留（Task 6 纯函数）。
        _cleanup_legacy_user_presets(WRITABLE_ROOT, dry_run=False)

    LIBRARY_DIR = normalized
    for key in (
        "assetsDir", "assetThumbsDir", "workflowsDir", "workflowThumbsDir",
        "outputDir", "uploadsDir", "presetRootDir",
    ):
        os.makedirs(library_paths[key], exist_ok=True)
    # 先按本机 fileSavePaths 刷新 USER_DIR 等基础 globals（用户目录始终留在本机），
    # 再用库路径覆盖共享态四件套 + 输出/上传。_refresh_storage_globals 的库覆盖逻辑
    # 由 Task 2 实现；本函数在其后再显式覆盖一遍同名 globals 以保证本块可测，语义一致。
    _refresh_storage_globals(_current_file_save_paths())
    ASSETS_DIR = library_paths["assetsDir"]
    ASSET_THUMBS_DIR = library_paths["assetThumbsDir"]
    WORKFLOWS_DIR = library_paths["workflowsDir"]
    WORKFLOW_THUMBS_DIR = library_paths["workflowThumbsDir"]
    OUTPUT_DIR = library_paths["outputDir"]
    UPLOADS_DIR = library_paths["uploadsDir"]
    return normalized


def _is_enabled_env(name):
    try:
        value = str(os.environ.get(name, "") or "").strip().lower()
    except Exception:
        return False
    return value in ("1", "true", "yes", "on")

def _resolve_subscription_api_base():
    allow_override = (
        _is_enabled_env("AIC_ALLOW_SUBSCRIPTION_API_OVERRIDE")
        or _is_enabled_env("AIC_DEV_MODE")
    )
    raw_override = (os.environ.get("AIC_SUBSCRIPTION_API_BASE", "") or "").strip()
    if allow_override and raw_override:
        return raw_override.rstrip("/"), True
    return OFFICIAL_SUBSCRIPTION_API_BASE, False

SUBSCRIPTION_API_BASE, SUBSCRIPTION_API_BASE_OVERRIDDEN = _resolve_subscription_api_base()
try:
    SUBSCRIPTION_TIMEOUT_SECONDS = int(
        (os.environ.get("AIC_SUBSCRIPTION_TIMEOUT_SEC", "5") or "5").strip()
    )
except Exception:
    SUBSCRIPTION_TIMEOUT_SECONDS = 5
ENFORCE_GENERATION_SUBSCRIPTION = (
    True if LOCAL_FIXED_SUBSCRIPTION_ENABLED else _is_enabled_env("AIC_ENFORCE_GENERATION_SUBSCRIPTION")
)
REQUIRE_CDKEY_SOURCE = (
    _is_enabled_env("AIC_REQUIRE_CDKEY_SOURCE")
)
INTERNAL_PROXY_CONTROL_FIELDS = {
    "installId",
    "provider",
    "activationSource",
    "activation_source",
    "generationScope",
    "generation_scope",
    "entitledNodeTypes",
    "entitled_node_types",
    "entitledProviders",
    "entitled_providers",
    "entitledModelIds",
    "entitled_model_ids",
    "entitledModelKeys",
    "entitled_model_keys",
    "requireCdkeySource",
    "require_cdkey_source",
    "rhInstanceType",
}

def _normalize_local_install_id(value):
    install = str(value or "").strip()
    if not install or len(install) > 128:
        return ""
    if not re.match(r"^[A-Za-z0-9._:-]+$", install):
        return ""
    return install


def _read_license_install_id():
    license_payload = _read_json_file(os.path.join(SYSTEM_STATE_DIR, "license.json"), {})
    if not bool(license_payload.get("activated")):
        return ""
    return _normalize_local_install_id(license_payload.get("lastInstallId"))


def _read_persisted_install_id():
    system_settings = _read_json_file(SYSTEM_SETTINGS_FILE, {})
    system_install_id = _normalize_local_install_id(system_settings.get("installId"))
    if system_install_id:
        return system_install_id
    legacy_settings = _read_json_file(os.path.join(DEFAULT_USER_DIR, "settings.json"), {})
    legacy_install_id = _normalize_local_install_id(legacy_settings.get("installId"))
    if legacy_install_id:
        return legacy_install_id
    return _read_license_install_id()

SUBSCRIPTION_CLIENT = LocalSubscriptionClient(
    state_dir=SYSTEM_STATE_DIR,
    fixed_cdkey=LOCAL_FIXED_CDKEY,
    one_time_cdkey=LOCAL_ONE_TIME_CDKEY,
    tiered_cdkeys=LOCAL_TIERED_CDKEYS,
    status_active=SUB_STATUS_ACTIVE,
    err_required=SUB_ERROR_REQUIRED,
    required_message=SUB_MESSAGE_V54_REQUIRED,
    contact_text=DEFAULT_SUB_CONTACT_TEXT,
    contact_url=DEFAULT_SUB_CONTACT_URL,
    invalid_cdkey_error_code=SUB_ERROR_INVALID_CDKEY,
    cdkey_already_used_error_code=SUB_ERROR_CDKEY_ALREADY_USED,
    local_install_id_resolver=_read_persisted_install_id,
)
SUBSCRIPTION_GATE_SERVICE = SubscriptionGateService(
    client=SUBSCRIPTION_CLIENT,
    status_active=SUB_STATUS_ACTIVE,
    status_none=SUB_STATUS_NONE,
    error_model_not_entitled=SUB_ERROR_MODEL_NOT_ENTITLED,
    model_name_map=VIDEO_VIP_MODEL_NAME_MAP,
    success_logger=lambda decision: print(
        "[subscription][generation_gate] first generation access verification passed"
    ),
    enforce_generation_subscription=ENFORCE_GENERATION_SUBSCRIPTION,
    require_cdkey_source=REQUIRE_CDKEY_SOURCE,
)
_startup_log("subscription services ready")
ensure_runtime_dirs(RUNTIME_PATHS)
_startup_log("runtime dirs ready")
_migrate_legacy_packaged_storage_if_needed()
_startup_log("legacy storage migration checked")
try:
    _private_defaults_result = apply_private_defaults(
        os.path.join(RESOURCE_ROOT, "private_defaults"),
        WRITABLE_ROOT,
        logger=_startup_log,
    )
    _startup_log(
        "private defaults status: "
        f"found={_private_defaults_result.get('found')} "
        f"applied={_private_defaults_result.get('applied')} "
        f"reason={_private_defaults_result.get('reason')} "
        f"copied={_private_defaults_result.get('copied')} "
        f"overwritten={_private_defaults_result.get('overwritten')} "
        f"skipped={_private_defaults_result.get('skipped')}"
    )
except Exception as exc:
    _startup_log(f"private defaults failed: {exc}")
_startup_system_settings = _read_json_file(SYSTEM_SETTINGS_FILE, {})
_startup_local_settings = _read_json_file(os.path.join(DEFAULT_USER_DIR, "settings.json"), {})
_startup_settings = dict(_startup_local_settings)
if isinstance(_startup_system_settings.get("fileSavePaths"), dict):
    _startup_settings["fileSavePaths"] = _startup_system_settings.get("fileSavePaths")
# 先解析库目录（PRD §8.9）：LIBRARY_DIR 必须在 try/except 前就绪，
# 使 _library_enabled() 在 except 块内能正确判定"是否配了库"。
LIBRARY_DIR = resolve_startup_library_dir(_startup_system_settings, USER_DIR)
try:
    _apply_file_save_paths(_file_save_paths_from_settings(_startup_settings), migrate=False)
except Exception as exc:
    # 库不可达不静默回退本地（PRD §8.9）：
    # 配了库 + 失败 -> 停在"未连接"态（记住配置值、功能降级、日志告警），不抹成 DEFAULT_*。
    if _library_enabled():
        _conn = _library_connection_status()
        if _conn.get("disconnected"):
            LIBRARY_DISCONNECTED = True
            _startup_log(
                "WARNING library unreachable, entering DISCONNECTED state "
                "(NOT falling back to local). "
                f"libraryDir={_conn.get('libraryDir')!r} reason={exc}"
            )
            # 不调用 _apply_file_save_paths 回退；存储全局保持库路径口径，由 UI 报错。
        else:
            # 配了库但失败不是"不可达"（如校验/权限其它原因）-> 仍按未连接处理，避免悄悄回退。
            LIBRARY_DISCONNECTED = True
            _startup_log(
                "WARNING library apply failed but reachable!=disconnected; "
                f"holding DISCONNECTED, not falling back. reason={exc}"
            )
    else:
        # 未配库（纯本地模式）：维持历史行为——回退本机默认，保证应用可用。
        _apply_file_save_paths(
            {
                "userDir": DEFAULT_USER_DIR,
                "outputDir": DEFAULT_OUTPUT_DIR,
                "tempDir": DEFAULT_UPLOADS_DIR,
            },
            migrate=False,
        )
if _library_enabled():
    # 库感知刷新（库覆盖逻辑由 Task 2 在 _refresh_storage_globals 内实现）。
    _refresh_storage_globals(_current_file_save_paths())
try:
    _startup_log(
        "config summary: "
        + json.dumps(
            summarize_model_registry_for_log(_read_json_file(CONFIG_FILE, {})),
            ensure_ascii=False,
            separators=(",", ":"),
        )
    )
except Exception as exc:
    _startup_log(f"config summary failed: {exc}")
SEEDANCE_WEB_BROWSER_LAUNCHER = None
SEEDANCE_WEB_BRIDGE_SERVICE = None
SEEDANCE_WEB_ROUTE_SERVICE = None

DREAMINA_CLI_SERVICE = DreaminaCliService(CONFIG_FILE, output_root_dir=OUTPUT_DIR)
_startup_log("dreamina cli ready")
DREAMINA_ROUTE_SERVICE = DreaminaRouteService(
    cli_service=DREAMINA_CLI_SERVICE,
    subscription_gate_service=SUBSCRIPTION_GATE_SERVICE,
    video_required_model_id=DREAMINA_VIDEO_VIP_MODEL_ID,
)
_startup_log("dreamina route ready")
SEEDANCE_WEB_BROWSER_LAUNCHER = SeedanceBrowserLauncher(
    resource_root=RESOURCE_ROOT,
    writable_root=WRITABLE_ROOT,
)
SEEDANCE_WEB_BRIDGE_SERVICE = SeedanceWebBridgeService(
    browser_launcher=SEEDANCE_WEB_BROWSER_LAUNCHER,
    logger=_startup_log,
)
SEEDANCE_WEB_ROUTE_SERVICE = SeedanceWebRouteService(
    bridge_service=SEEDANCE_WEB_BRIDGE_SERVICE,
    upload_dir_getter=lambda: os.path.join(OUTPUT_DIR, "seedance_web"),
    upload_local_prefix="output/seedance_web",
)
_startup_log("seedance web bridge ready")
# 确保目录存在
os.makedirs(ASSETS_DIR,  exist_ok=True)
os.makedirs(ASSET_THUMBS_DIR, exist_ok=True)
os.makedirs(WORKFLOWS_DIR, exist_ok=True)
os.makedirs(WORKFLOW_THUMBS_DIR, exist_ok=True)


def _read_user_settings():
    local_settings = _read_json_file(SETTINGS_FILE, {})
    system_settings = _read_json_file(SYSTEM_SETTINGS_FILE, {})

    system_install_id = str(system_settings.get("installId") or "").strip()
    local_install_id = str(local_settings.get("installId") or "").strip()
    system_file_save_paths = (
        system_settings.get("fileSavePaths")
        if isinstance(system_settings.get("fileSavePaths"), dict)
        else None
    )

    # 兼容旧版本：首次读到仓库内 settings.json 的 installId 时自动迁移到系统目录。
    if not system_install_id and local_install_id:
        system_settings = dict(system_settings)
        system_settings["installId"] = local_install_id
        try:
            _write_json_file(SYSTEM_SETTINGS_FILE, system_settings)
        except Exception:
            pass
        system_install_id = local_install_id

    merged = dict(local_settings)
    if system_install_id:
        merged["installId"] = system_install_id
    if system_file_save_paths:
        merged["fileSavePaths"] = _file_save_paths_from_settings(
            {"fileSavePaths": system_file_save_paths}
        )
    else:
        merged["fileSavePaths"] = _current_file_save_paths()
    # 共享库目录以 system settings（每机各自）为准回显，未启用则回空串。
    system_library_dir = str(system_settings.get("libraryDir") or "").strip()
    merged["libraryDir"] = system_library_dir or str(LIBRARY_DIR or "")
    return merged


def _write_user_settings(data):
    payload = dict(data) if isinstance(data, dict) else {}
    # 共享库目录：独立键，先于 fileSavePaths 处理。仅当 payload 显式带 libraryDir 才动，
    # 避免普通三框保存误触库逻辑。校验失败（ValueError）原样冒泡给路由层返回 4xx。
    # migrate=True：首次设库触发 copy-missing 迁移（Task 10 的 migrate_into_library，
    # 目标存在即跳过；幂等，非首次设库时迁移为空操作）。
    if "libraryDir" in payload:
        applied_library_dir = _apply_library_dir(payload.get("libraryDir"), migrate=True)
        payload["libraryDir"] = applied_library_dir
        _persist_system_library_dir(applied_library_dir)
    if isinstance(payload.get("fileSavePaths"), dict):
        # 路径不可达时 _apply_file_save_paths 内 os.makedirs 直接抛 —— 故意不在此捕获，
        # 让异常传到路由层转成明确 JSON 错误（PRD §8.9 / §9 表"运行时保存"口径：
        # 明确报错、不静默回退本地）。切勿在此加 except 回退默认路径。
        applied_paths = _apply_file_save_paths(payload["fileSavePaths"], migrate=True)
        payload["fileSavePaths"] = applied_paths
        _persist_system_file_save_paths(applied_paths)
    elif "fileSavePaths" not in payload:
        payload["fileSavePaths"] = _current_file_save_paths()
    _write_json_file(SETTINGS_FILE, payload)

    install_id = str(payload.get("installId") or "").strip()
    system_settings = _read_json_file(SYSTEM_SETTINGS_FILE, {})
    next_system_settings = dict(system_settings)
    if install_id:
        next_system_settings["installId"] = install_id
    next_system_settings["fileSavePaths"] = dict(payload.get("fileSavePaths") or _current_file_save_paths())
    _write_json_file(SYSTEM_SETTINGS_FILE, next_system_settings)

def _is_dev_build():
    return os.path.exists(os.path.join(DIRECTORY, ".dev"))

def _is_advanced_mode():
    return os.path.exists(os.path.join(DIRECTORY, ".Advanced"))

UPDATE_SERVICE = HotUpdateService(
    directory=DIRECTORY,
    local_version=LOCAL_VERSION,
    is_dev_build=_is_dev_build,
)
_startup_log("update service ready")

SAM3_SERVICE = Sam3Service(
    directory=DIRECTORY,
    assets_dir_provider=lambda: ASSETS_DIR,
    uploads_dir_provider=lambda: UPLOADS_DIR,
    output_dir_provider=lambda: OUTPUT_DIR,
    path_inside_checker=_is_path_inside,
)
_startup_log("sam3 service ready")
SAM3_ROUTE_SERVICE = Sam3RouteService(sam3_service=SAM3_SERVICE)
_startup_log("sam3 route ready")
CONFIG_ROUTE_SERVICE = ConfigRouteService(config_file_getter=lambda: CONFIG_FILE)
JSON_FILE_ROUTE_SERVICE = JsonFileRouteService(
    canvas_dir_getter=lambda: CANVAS_DIR,
    assets_dir_getter=lambda: ASSETS_DIR,
    workflows_dir_getter=lambda: WORKFLOWS_DIR,
    user_dir_getter=lambda: USER_DIR,
    read_user_settings=_read_user_settings,
    write_user_settings=_write_user_settings,
    atomic_write_json=lambda path, data: _atomic_write_json(path, data),
)
LIBRARY_FILE_ROUTE_SERVICE = LibraryFileRouteService(
    user_dir_getter=lambda: USER_DIR,
    asset_thumbs_dir_getter=lambda: ASSET_THUMBS_DIR,
    workflow_thumbs_dir_getter=lambda: WORKFLOW_THUMBS_DIR,
    preset_definitions_path_getter=lambda: (
        derive_library_paths(LIBRARY_DIR)["presetDefinitionsPath"]
        if _library_enabled()
        else os.path.join(USER_DIR, "prompt-presets.json")
    ),
    preset_definitions_seed_path_getter=lambda: RUNTIME_PATHS["seedPresetDefinitionsPath"],
    preset_root_getter=lambda: (
        derive_library_paths(LIBRARY_DIR)["presetRootDir"]
        if _library_enabled()
        else os.path.join(USER_DIR, "prompt")
    ),
)

def _get_custom_ai_config():
    return CONFIG_ROUTE_SERVICE.get_custom_ai_config()


def _get_canvas_agent_config():
    return _read_json_file(CONFIG_FILE, {})


def _get_canvas_agent_provider_config(model=None):
    _provider_name, provider = CanvasAgentRouteService.select_provider_config(
        _get_canvas_agent_config(),
        model=model,
    )
    return provider


def _safe_canvas_agent_text(value, fallback=""):
    text = str(value or "").strip()
    return text or fallback


def _compact_json_for_prompt(value, max_chars=6000):
    try:
        text = json.dumps(value if value is not None else {}, ensure_ascii=False)
    except (TypeError, ValueError):
        text = "{}"
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "...[truncated]"


def _prepare_canvas_agent_queued_execution(payload):
    payload = payload if isinstance(payload, dict) else {}
    execution = payload.get("execution") if isinstance(payload.get("execution"), dict) else {}
    context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    title = _safe_canvas_agent_text(execution.get("title"), "Queued canvas task")
    agent_mode = _safe_canvas_agent_text(payload.get("agentMode"), "act")
    video_authorized = payload.get("videoAuthorized") is True
    conversation_id = _safe_canvas_agent_text(execution.get("conversationId"))
    previous_plan = execution.get("plan") if isinstance(execution.get("plan"), dict) else {}
    previous_actions = execution.get("actionsByStep") if isinstance(execution.get("actionsByStep"), dict) else {}
    video_boundary = (
        "video generation is authorized for this prepare pass"
        if video_authorized
        else "video generation is not authorized; keep video steps waiting for explicit authorization"
    )
    message = "\n".join(
        [
            "Recompile this queued canvas-agent execution using the latest canvas context.",
            f"Task title: {title}",
            f"Agent mode: {agent_mode}",
            f"Video boundary: {video_boundary}.",
            "Return the Assistant Response Contract v2 fields: plan, actionsByStep, developer, and reply.",
            "Do not execute anything. Only rebuild a safe plan/actionsByStep for the current canvas.",
            "Previous plan:",
            _compact_json_for_prompt(previous_plan),
            "Previous actionsByStep:",
            _compact_json_for_prompt(previous_actions),
        ]
    )
    bridge = globals().get("PI_BRIDGE_SERVICE")
    if bridge is None or not hasattr(bridge, "chat"):
        raise RuntimeError("Canvas agent prepare runner is not configured")
    response = bridge.chat(
        message=message,
        context=context,
        conversation_id=conversation_id or None,
        mode="actions",
    )
    if not isinstance(response, dict):
        raise RuntimeError("Canvas agent prepare returned an invalid response")
    if response.get("success") is False:
        raise RuntimeError(
            _safe_canvas_agent_text(
                response.get("reply") or response.get("error") or response.get("message"),
                "Canvas agent prepare failed",
            )
        )
    plan = response.get("plan") if isinstance(response.get("plan"), dict) else {}
    actions_by_step = response.get("actionsByStep") if isinstance(response.get("actionsByStep"), dict) else {}
    actions = response.get("actions") if isinstance(response.get("actions"), list) else []
    if not actions_by_step and actions:
        step_id = "step-1"
        plan = plan or {"id": "plan-prepared", "title": title, "steps": [{"id": step_id, "title": title}]}
        actions_by_step = {step_id: actions}
    if not plan and not actions_by_step:
        raise RuntimeError("Canvas agent prepare returned no plan or actions")
    reply = _safe_canvas_agent_text(response.get("reply"), "Prepared from latest canvas")
    prepared = {
        "plan": plan,
        "actionsByStep": actions_by_step,
        "drawerState": {"line2": reply},
        "summary": reply,
        "developer": response.get("developer") if isinstance(response.get("developer"), dict) else {},
    }
    sanitized = CanvasAgentExecutionService._sanitize_json(prepared)
    return sanitized if isinstance(sanitized, dict) else {}


CANVAS_AGENT_ACTION_SCHEMA = CanvasAgentActionSchema()
CANVAS_AGENT_CONTEXT_SERVICE = CanvasAgentContextService()
CANVAS_AGENT_CONVERSATION_SERVICE = CanvasAgentConversationService(
    storage_path=os.path.join(USER_DIR, "canvas-agent-conversations.json")
)
CANVAS_AGENT_EXECUTION_SERVICE = CanvasAgentExecutionService(
    storage_path=os.path.join(USER_DIR, "canvas-agent-executions.json"),
    prepare_runner=_prepare_canvas_agent_queued_execution,
)
CANVAS_AGENT_SYNC_SERVICE = CanvasAgentSyncService(
    conversation_service=CANVAS_AGENT_CONVERSATION_SERVICE,
)
PI_RUNTIME_SERVICE = PiRuntimeService(
    project_root=RESOURCE_ROOT,
    require_bundled_runtime=PiRuntimeService.should_require_bundled_runtime(
        RUNTIME_PATHS["distribution"]
    ),
)
PI_BRIDGE_SERVICE = PiBridgeService(
    PI_RUNTIME_SERVICE,
    provider_config_getter=_get_canvas_agent_provider_config,
    action_schema=CANVAS_AGENT_ACTION_SCHEMA,
)
CANVAS_AGENT_ROUTE_SERVICE = CanvasAgentRouteService(
    bridge_service=PI_BRIDGE_SERVICE,
    action_schema=CANVAS_AGENT_ACTION_SCHEMA,
    director_bridge_service=DIRECTOR_BRIDGE_SERVICE,
    context_service=CANVAS_AGENT_CONTEXT_SERVICE,
    runtime_service=PI_RUNTIME_SERVICE,
    conversation_service=CANVAS_AGENT_CONVERSATION_SERVICE,
    execution_service=CANVAS_AGENT_EXECUTION_SERVICE,
    sync_service=CANVAS_AGENT_SYNC_SERVICE,
    config_getter=_get_canvas_agent_config,
)

# ViMax bridge (α′ F1/F3). user_dir_getter reads the module global at
# call time so it tracks the packaged-mode USER_DIR rebinding (H8);
# HY_VIMAX_HOME is read per request (unset -> status not-configured).
from services.vimax_bridge_service import VimaxBridgeService
from services.vimax_route_service import VimaxRouteService
from services.vimax_broker_service import VimaxBroker

VIMAX_BRIDGE_SERVICE = VimaxBridgeService(
    user_dir_getter=lambda: USER_DIR,
)
VIMAX_BROKER = VimaxBroker(
    user_dir_getter=lambda: USER_DIR,
    credentials_getter=VIMAX_BRIDGE_SERVICE._default_credentials,
)

# ViMax director brain (Phase C, native-only). The external venv plan/render/
# portraits runtime (huanying_runner + the Popen bridge) was RETIRED in C5.2 after
# real-machine verification (C4.3); the in-process brain is now the SOLE runtime,
# always instantiated. VimaxBridgeService survives ONLY as the credential +
# skills-dir resolver the broker + orchestrator share (single source, H6).
# Rollback = git revert the C5.2 commit (no runtime flag).
from services.vimax_native_orchestrator import NativeOrchestratorService

# B5: decompose max_workers tunable; default 1 because the 2026-06-14 probe found
# grsai concurrency-INtolerant under load (c=3 -> 2/3 timeout). Raise via
# HY_VIMAX_MAX_WORKERS only after re-probing a healthy grsai.
try:
    _vimax_workers = max(1, int(os.environ.get("HY_VIMAX_MAX_WORKERS", "1")))
except (TypeError, ValueError):
    _vimax_workers = 1
VIMAX_NATIVE_ORCHESTRATOR = NativeOrchestratorService(
    user_dir_getter=lambda: USER_DIR,
    credentials_getter=VIMAX_BRIDGE_SERVICE._default_credentials,
    skills_dir_getter=VIMAX_BRIDGE_SERVICE._default_skills_dir,
    # native render/portraits draws route through the loopback broker (ticketId
    # Bearer -> /api/v2/vimax/draw); the cost/cap/ledger path is unchanged.
    broker_url_getter=lambda: f"http://127.0.0.1:{PORT}/api/v2/vimax/draw",
    max_workers=_vimax_workers,
)

VIMAX_ROUTE_SERVICE = VimaxRouteService(
    vimax_bridge_service=VIMAX_BRIDGE_SERVICE,
    vimax_broker=VIMAX_BROKER,
    native_orchestrator=VIMAX_NATIVE_ORCHESTRATOR,
)


def _request_server_port(handler):
    try:
        return int(handler.server.server_address[1])
    except Exception:
        return int(PORT)


def _local_allowed_origins(handler):
    port = _request_server_port(handler)
    return {
        f"http://127.0.0.1:{port}",
        f"http://localhost:{port}",
        f"http://[::1]:{port}",
    }


def _is_allowed_origin(handler, origin):
    normalized = _normalize_origin(origin)
    if not normalized:
        return False
    if normalized in SEEDANCE_WEB_ALLOWED_ORIGINS:
        return True
    return normalized in _local_allowed_origins(handler) or normalized in ALLOWED_ORIGINS


def _allowed_cors_origin(handler):
    origin = handler.headers.get("Origin", "")
    normalized = _normalize_origin(origin)
    if normalized and _is_allowed_origin(handler, normalized):
        return normalized
    return ""


def _send_cors_origin_header(handler):
    origin = _allowed_cors_origin(handler)
    if not origin:
        return
    handler.send_header("Access-Control-Allow-Origin", origin)
    handler.send_header("Vary", "Origin")


def _client_is_loopback(handler):
    try:
        host = str(handler.client_address[0] or "").strip()
    except Exception:
        return False
    if host in ("localhost",):
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except Exception:
        return False


def _request_has_valid_local_token(handler):
    if not LOCAL_ACCESS_TOKEN:
        return False
    token = str(handler.headers.get("X-AIC-Local-Token", "") or "").strip()
    auth = str(handler.headers.get("Authorization", "") or "").strip()
    if not token and auth.lower().startswith("bearer "):
        token = auth[7:].strip()
    return bool(token) and hmac.compare_digest(token, LOCAL_ACCESS_TOKEN)


_SENSITIVE_API_PREFIXES = (
    "/api/config",
    "/api/upload",
    "/api/v2/assets",
    "/api/v2/chat",
    "/api/v2/config",
    "/api/v2/dreamina",
    "/api/v2/images/derivatives",
    "/api/v2/matting",
    "/api/v2/projects",
    "/api/v2/proxy",
    "/api/v2/runninghubwf",
    "/api/v2/save_output",
    "/api/v2/seedance-web",
    "/api/v2/subscription/activate",
    "/api/v2/update/apply",
    "/api/v2/user",
    "/api/v2/video",
    "/api/v2/workflows",
)


def _is_sensitive_api_path(path):
    clean_path = str(path or "").split("?", 1)[0].rstrip("/") or "/"
    return any(
        clean_path == prefix or clean_path.startswith(prefix + "/")
        for prefix in _SENSITIVE_API_PREFIXES
    )


def _request_passes_local_security(handler, path):
    if not _is_sensitive_api_path(path):
        return True
    if str(path or "").split("?", 1)[0] == "/api/v2/seedance-web/page-status":
        return _client_is_loopback(handler)
    if SeedanceWebRouteService.is_bridge_route(path):
        return _client_is_loopback(handler)
    origin = handler.headers.get("Origin", "")
    if origin:
        return _is_allowed_origin(handler, origin) or _request_has_valid_local_token(handler)
    return _client_is_loopback(handler) or _request_has_valid_local_token(handler)


def _enforce_local_api_access(handler, path):
    if _request_passes_local_security(handler, path):
        return True
    _json_err(handler, 403, "Forbidden: request origin is not allowed")
    return False


def _extract_install_id_from_request(handler, payload=None):
    return SUBSCRIPTION_GATE_SERVICE.extract_install_id_from_request(handler, payload)


def _strip_internal_control_fields(payload, extra_fields=None):
    if not isinstance(payload, dict):
        return {}
    forwarded = dict(payload)
    fields = set(INTERNAL_PROXY_CONTROL_FIELDS)
    if isinstance(extra_fields, (set, list, tuple)):
        fields.update(str(item or "").strip() for item in extra_fields if str(item or "").strip())
    for field in fields:
        forwarded.pop(field, None)
    return forwarded


def _enforce_generation_subscription_gate(
    handler,
    payload=None,
    required_model_id="",
    provider="",
    node_type="",
):
    decision = SUBSCRIPTION_GATE_SERVICE.check_generation_access(
        handler,
        payload,
        required_model_id=required_model_id,
        provider=provider,
        node_type=node_type,
    )
    if bool(decision.get("allowed")):
        return True
    _json_ok(handler, SUBSCRIPTION_GATE_SERVICE.build_subscription_denial_payload(decision))
    return False


def _infer_proxy_image_generation_metadata(api_url, payload=None):
    api_url_value = str(api_url or "").strip()
    source = payload if isinstance(payload, dict) else {}
    provider = str(source.get("provider") or "").strip()
    workflow_match = re.search(
        r"/openapi/v2/run/ai-app/(\d+)$",
        api_url_value,
        flags=re.IGNORECASE,
    )
    workflow_id = workflow_match.group(1) if workflow_match else ""
    is_runninghub_query_endpoint = bool(
        re.search(r"/openapi/v2/query(?:$|[/?])", api_url_value, flags=re.IGNORECASE)
    )
    is_grsai_query_endpoint = bool(
        re.search(r"/v1/draw/(?:result|query)(?:$|[/?])", api_url_value, flags=re.IGNORECASE)
    )
    required_model_id = f"runninghub/{workflow_id}" if workflow_id else ""
    node_type = ""

    if workflow_id:
        provider = provider or "runninghubwf"
        node_type = RUNNINGHUB_WORKFLOW_NODE_TYPE_MAP.get(workflow_id, "")
    else:
        provider = provider or "proxy"

    return {
        "workflow_id": workflow_id,
        "provider": provider,
        "node_type": node_type,
        "required_model_id": required_model_id,
        # 仅在“提交任务”类端点启用 task_id 快速探测；
        # 查询类端点必须透传完整响应，否则前端无法拿到最终出图 URL。
        "allow_task_probe_short_circuit": not (
            is_runninghub_query_endpoint or is_grsai_query_endpoint
        ),
    }


def _json_ok(handler, data):
    body = json.dumps(data, ensure_ascii=False, indent=2).encode()
    handler.send_response(200)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    _send_cors_origin_header(handler)
    handler.end_headers()
    try:
        handler.wfile.write(body)
    except (BrokenPipeError, ConnectionResetError):
        pass

def _json_err(handler, code, msg):
    body = json.dumps({"error": msg}, ensure_ascii=False, indent=2).encode()
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    _send_cors_origin_header(handler)
    handler.end_headers()
    try:
        handler.wfile.write(body)
    except (BrokenPipeError, ConnectionResetError):
        pass


def _send_route_response(handler, response):
    if not isinstance(response, dict):
        raise ValueError("Route response must be a dict")
    kind = str(response.get("kind") or "").strip()
    if kind == "json_ok":
        _json_ok(handler, response.get("data"))
        return
    if kind == "json_err":
        _json_err(
            handler,
            int(response.get("code") or 500),
            response.get("message") or "Unknown error",
        )
        return
    if kind == "binary":
        body = response.get("body") or b""
        if isinstance(body, str):
            body = body.encode("utf-8")
        else:
            body = bytes(body)
        handler.send_response(int(response.get("status") or 200))
        handler.send_header(
            "Content-Type",
            str(response.get("contentType") or "application/octet-stream"),
        )
        headers = response.get("headers") if isinstance(response.get("headers"), dict) else {}
        for name, value in headers.items():
            if str(name).lower() == "access-control-allow-origin":
                continue
            handler.send_header(str(name), str(value))
        handler.send_header("Content-Length", str(len(body)))
        handler.end_headers()
        try:
            handler.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass
        return
    raise ValueError(f"Unknown route response kind: {kind}")

def _read_body(handler, max_bytes=None):
    te = (handler.headers.get("Transfer-Encoding", "") or "").lower()
    if "chunked" in te:
        chunks = []
        total = 0
        while True:
            line = handler.rfile.readline()
            if not line:
                break
            size_hex = line.split(b";", 1)[0].strip()
            try:
                size = int(size_hex, 16)
            except Exception:
                break
            if size == 0:
                handler.rfile.readline()
                break
            chunk = handler.rfile.read(size)
            total += len(chunk)
            if max_bytes is not None and total > max_bytes:
                raise ValueError("REQUEST_BODY_TOO_LARGE")
            chunks.append(chunk)
            handler.rfile.read(2)
        return b"".join(chunks)
    length = int(handler.headers.get("Content-Length", 0))
    if max_bytes is not None and length > max_bytes:
        raise ValueError("REQUEST_BODY_TOO_LARGE")
    return handler.rfile.read(length) if length > 0 else b""


MEDIA_FILE_ROUTE_SERVICE = MediaFileRouteService(
    directory=DIRECTORY,
    uploads_dir_getter=lambda: UPLOADS_DIR,
    output_dir_getter=lambda: OUTPUT_DIR,
    max_upload_bytes=MAX_UPLOAD_BYTES,
    next_output_filename=lambda ext: _next_gen_output_filename(ext),
    load_json_file=lambda path: _load_json_file(path),
    atomic_write_json=lambda path, data: _atomic_write_json(path, data),
    read_body=_read_body,
    image_derivative_display_max_edge=IMAGE_DERIVATIVE_DISPLAY_MAX_EDGE,
    image_derivative_thumb_max_edge=IMAGE_DERIVATIVE_THUMB_MAX_EDGE,
    image_derivative_display_quality=IMAGE_DERIVATIVE_DISPLAY_QUALITY,
    image_derivative_thumb_quality=IMAGE_DERIVATIVE_THUMB_QUALITY,
    image_derivative_root_dirname=IMAGE_DERIVATIVE_ROOT_DIRNAME,
)


LOCAL_MEDIA_PROCESSING_ROUTE_SERVICE = LocalMediaProcessingRouteService(
    output_dir_getter=lambda: OUTPUT_DIR,
    resolve_local_virtual_path=lambda src_path: _resolve_local_virtual_path(src_path),
    read_body=_read_body,
)


REMOTE_PROXY_ROUTE_SERVICE = RemoteProxyRouteService(
    read_body=_read_body,
    subscription_gate_service_getter=lambda: SUBSCRIPTION_GATE_SERVICE,
    video_vip_workflow_ids=VIDEO_VIP_WORKFLOW_IDS,
)


def _smart_clip_new_job_id():
    ts = int(time.time() * 1000)
    return f"smartclip_{ts}_{random.randint(1000, 9999)}"

def _smart_clip_cleanup(max_age_sec=2 * 60 * 60):
    try:
        now = time.time()
    except Exception:
        now = 0.0
    with _smart_clip_lock:
        expired = []
        for jid, job in list(_smart_clip_jobs.items()):
            try:
                created = float(job.get("createdAt") or 0.0)
            except Exception:
                created = 0.0
            if now - created > max_age_sec:
                expired.append(jid)
        for jid in expired:
            _smart_clip_jobs.pop(jid, None)

def _smart_clip_update(job_id, **kwargs):
    with _smart_clip_lock:
        job = _smart_clip_jobs.get(job_id)
        if not job:
            return
        for k, v in kwargs.items():
            job[k] = v


HTTP_ROUTE_DISPATCHER = HttpRouteDispatcher(
    local_version=LOCAL_VERSION,
    is_dev_build=_is_dev_build,
    is_advanced_mode=_is_advanced_mode,
    subscription_client_getter=lambda: SUBSCRIPTION_CLIENT,
    subscription_gate_service_getter=lambda: SUBSCRIPTION_GATE_SERVICE,
    config_route_service_getter=lambda: CONFIG_ROUTE_SERVICE,
    json_file_route_service_getter=lambda: JSON_FILE_ROUTE_SERVICE,
    library_file_route_service_getter=lambda: LIBRARY_FILE_ROUTE_SERVICE,
    media_file_route_service_getter=lambda: MEDIA_FILE_ROUTE_SERVICE,
    local_media_processing_route_service_getter=lambda: LOCAL_MEDIA_PROCESSING_ROUTE_SERVICE,
    remote_proxy_route_service_getter=lambda: REMOTE_PROXY_ROUTE_SERVICE,
    dreamina_route_service_getter=lambda: DREAMINA_ROUTE_SERVICE,
    seedance_web_route_service_getter=lambda: SEEDANCE_WEB_ROUTE_SERVICE,
    sam3_route_service_getter=lambda: SAM3_ROUTE_SERVICE,
    canvas_agent_route_service_getter=lambda: CANVAS_AGENT_ROUTE_SERVICE,
    vimax_route_service_getter=lambda: VIMAX_ROUTE_SERVICE,
    update_service_getter=lambda: UPDATE_SERVICE,
    smart_clip_cleanup=_smart_clip_cleanup,
    smart_clip_jobs=_smart_clip_jobs,
    smart_clip_lock=_smart_clip_lock,
    sub_status_none=SUB_STATUS_NONE,
    sub_error_invalid_arguments=SUB_ERROR_INVALID_ARGUMENTS,
    default_sub_contact_text=DEFAULT_SUB_CONTACT_TEXT,
    default_sub_contact_url=DEFAULT_SUB_CONTACT_URL,
    json_ok=_json_ok,
    json_err=_json_err,
    send_route_response=_send_route_response,
    read_body=_read_body,
    runtime_paths_getter=lambda: {
        "distribution": RUNTIME_PATHS["distribution"],
        "resourceRoot": RESOURCE_ROOT,
        "writableRoot": WRITABLE_ROOT,
        "userDir": USER_DIR,
        "outputDir": OUTPUT_DIR,
        "uploadsDir": UPLOADS_DIR,
    },
    library_status_getter=lambda: library_status(LIBRARY_DIR),
)


def _run_smart_clip_job(job_id, local_src, options):
    try:
        try:
            from scenedetect import open_video, SceneManager
            from scenedetect.detectors import ContentDetector
        except Exception as e:
            _smart_clip_update(
                job_id,
                status="error",
                stage="import",
                error=f"缺少依赖 scenedetect/opencv: {str(e)}。请在 venv 中执行 pip install -r requirements.txt",
                progress=0.0,
            )
            return

        opt = options if isinstance(options, dict) else {}
        raw_mode = str(opt.get("mode") or "stable").strip().lower()
        mode_map = {"stable": "stable", "balanced": "balanced", "sensitive": "sensitive"}
        mode = mode_map.get(raw_mode, raw_mode)
        if mode not in ("stable", "balanced", "sensitive"):
            mode = "stable"
        try:
            max_segments = int(opt.get("maxSegments", 20))
        except Exception:
            max_segments = 20
        max_segments = max(2, min(200, max_segments))

        try:
            black_luma_thr = float(opt.get("blackLuma", 16.0))
        except Exception:
            black_luma_thr = 16.0
        black_luma_thr = max(0.0, min(60.0, black_luma_thr))
        try:
            min_black_sec = float(opt.get("minBlackSec", 0.5))
        except Exception:
            min_black_sec = 0.5
        min_black_sec = max(0.1, min(10.0, min_black_sec))

        _smart_clip_update(job_id, status="running", stage="detect", progress=0.01)

        startupinfo = None
        if os.name == "nt":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

        def _ffprobe_duration_sec(p):
            try:
                cmd = [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "default=nw=1:nk=1",
                    p,
                ]
                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    startupinfo=startupinfo,
                )
                stdout, _ = process.communicate(timeout=20)
                if process.returncode != 0:
                    return 0.0
                txt = (stdout or b"").decode("utf-8", errors="ignore").strip()
                return float(txt) if txt else 0.0
            except Exception:
                return 0.0

        def _ffprobe_video_fps_str(p):
            try:
                cmd = [
                    "ffprobe",
                    "-v",
                    "error",
                    "-select_streams",
                    "v:0",
                    "-show_entries",
                    "stream=avg_frame_rate,r_frame_rate",
                    "-of",
                    "json",
                    p,
                ]
                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    startupinfo=startupinfo,
                )
                stdout, _ = process.communicate(timeout=20)
                if process.returncode != 0:
                    return None
                txt = (stdout or b"").decode("utf-8", errors="ignore").strip()
                if not txt:
                    return None
                j = json.loads(txt)
                streams = j.get("streams") or []
                if not streams:
                    return None
                s0 = streams[0] if isinstance(streams[0], dict) else {}
                avg = (s0.get("avg_frame_rate") or "").strip()
                rr = (s0.get("r_frame_rate") or "").strip()
                cand = None
                if avg and avg not in ("0/0", "0"):
                    cand = avg
                elif rr and rr not in ("0/0", "0"):
                    cand = rr
                if not cand:
                    return None

                def _to_float(x):
                    raw = (x or "").strip()
                    if not raw:
                        return 0.0
                    if "/" in raw:
                        a, b = raw.split("/", 1)
                        na = float(a)
                        nb = float(b)
                        if nb == 0:
                            return 0.0
                        return na / nb
                    return float(raw)

                fps_v = _to_float(cand)
                if not fps_v or fps_v <= 0:
                    return None
                buckets = (24, 25, 30, 50, 60)
                closest = None
                closest_d = 999.0
                for b in buckets:
                    d = abs(fps_v - float(b))
                    if d < closest_d:
                        closest_d = d
                        closest = b
                fps_i = int(closest) if closest is not None and closest_d <= 0.2 else int(round(fps_v))
                if fps_i <= 0:
                    return None
                return str(fps_i)
            except Exception:
                return None

        duration_sec = _ffprobe_duration_sec(local_src)
        if not duration_sec or duration_sec <= 0:
            duration_sec = 0.0
        fps_str = _ffprobe_video_fps_str(local_src)

        def _run_detect_content_boundaries(threshold, min_scene_sec):
            try:
                scene_manager = SceneManager()
                video = open_video(local_src)
                try:
                    fps = float(getattr(video, "frame_rate", 0.0) or 0.0)
                except Exception:
                    fps = 0.0
                if not fps or fps <= 0:
                    fps = 30.0
                min_scene_len = max(1, int(round(float(min_scene_sec) * fps)))
                scene_manager.add_detector(
                    ContentDetector(
                        threshold=float(threshold), min_scene_len=int(min_scene_len)
                    )
                )
                scene_manager.detect_scenes(video, show_progress=False)
                scene_list = scene_manager.get_scene_list() or []
                boundaries = []
                for i, (start_tc, _end_tc) in enumerate(scene_list):
                    if i == 0:
                        continue
                    try:
                        t = float(start_tc.get_seconds())
                    except Exception:
                        continue
                    if t and t > 0:
                        boundaries.append(t)
                dur = duration_sec
                if not dur or dur <= 0:
                    try:
                        if scene_list:
                            dur = float(scene_list[-1][1].get_seconds())
                    except Exception:
                        dur = 0.0
                return boundaries, dur
            except Exception:
                return [], duration_sec

        black_intervals = []
        try:
            import cv2

            if duration_sec and duration_sec > 0:
                sample_fps = 2.0 if duration_sec <= 900 else 1.0
                step = 1.0 / sample_fps
                cap = cv2.VideoCapture(local_src)
                t = 0.0
                blk_start = None
                margin = 0.15
                while t <= duration_sec:
                    cap.set(cv2.CAP_PROP_POS_MSEC, int(round(t * 1000)))
                    ok, frame = cap.read()
                    if not ok or frame is None:
                        t += step
                        continue
                    try:
                        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                        mean_luma = float(gray.mean())
                    except Exception:
                        mean_luma = 999.0
                    is_black = mean_luma <= black_luma_thr
                    if is_black:
                        if blk_start is None:
                            blk_start = t
                    else:
                        if blk_start is not None:
                            blk_end = t
                            if blk_end - blk_start >= min_black_sec:
                                s = max(0.0, blk_start - margin)
                                e = min(duration_sec, blk_end + margin)
                                if e > s:
                                    black_intervals.append((s, e))
                            blk_start = None
                    t += step
                if blk_start is not None:
                    blk_end = duration_sec
                    if blk_end - blk_start >= min_black_sec:
                        s = max(0.0, blk_start - margin)
                        e = min(duration_sec, blk_end)
                        if e > s:
                            black_intervals.append((s, e))
                try:
                    cap.release()
                except Exception:
                    pass
        except Exception:
            black_intervals = []

        def _is_in_black(mid_t):
            for s, e in black_intervals:
                if mid_t >= s and mid_t <= e:
                    return True
            return False

        def _postprocess(boundaries, min_scene_sec, debounce_sec, strip_black):
            bds = []
            for t in boundaries or []:
                try:
                    bds.append(float(t))
                except Exception:
                    pass
            for s, e in black_intervals:
                bds.append(float(s))
                bds.append(float(e))
            bds = [t for t in bds if duration_sec and t > 0.0 and t < duration_sec]
            bds.sort()

            debounced = []
            prev = None
            for t in bds:
                if prev is None:
                    debounced.append(t)
                    prev = t
                    continue
                if t - prev < float(debounce_sec):
                    continue
                debounced.append(t)
                prev = t
            bds = debounced

            raw_segments = []
            cur = 0.0
            for t in bds:
                if t - cur >= 0.05:
                    raw_segments.append((cur, t))
                cur = t
            if duration_sec and duration_sec - cur >= 0.05:
                raw_segments.append((cur, duration_sec))

            segments2 = []
            for s, e in raw_segments:
                if not (e > s):
                    continue
                mid = (s + e) / 2.0
                if strip_black and _is_in_black(mid):
                    continue
                segments2.append([float(s), float(e)])

            i = 0
            while i < len(segments2):
                s, e = segments2[i]
                dur = e - s
                if dur < float(min_scene_sec) and len(segments2) > 1:
                    if i == 0:
                        ns, ne = segments2[i + 1]
                        segments2[i + 1] = [s, ne]
                        segments2.pop(i)
                        continue
                    ps, pe = segments2[i - 1]
                    segments2[i - 1] = [ps, e]
                    segments2.pop(i)
                    i = max(0, i - 1)
                    continue
                i += 1

            segments2 = [seg for seg in segments2 if (seg[1] - seg[0]) >= 0.2]

            def _merge_to_limit(segs, limit):
                out = [list(x) for x in (segs or [])]
                if limit <= 1:
                    return out
                while len(out) > int(limit):
                    shortest_i = 0
                    shortest_d = 999999.0
                    for i, (s, e) in enumerate(out):
                        d = float(e) - float(s)
                        if d < shortest_d:
                            shortest_d = d
                            shortest_i = i
                    if len(out) <= 1:
                        break
                    if shortest_i == 0:
                        out[1] = [out[0][0], out[1][1]]
                        out.pop(0)
                        continue
                    if shortest_i == len(out) - 1:
                        out[-2] = [out[-2][0], out[-1][1]]
                        out.pop(-1)
                        continue
                    left_d = out[shortest_i - 1][1] - out[shortest_i - 1][0]
                    right_d = out[shortest_i + 1][1] - out[shortest_i + 1][0]
                    if left_d <= right_d:
                        out[shortest_i - 1] = [out[shortest_i - 1][0], out[shortest_i][1]]
                        out.pop(shortest_i)
                    else:
                        out[shortest_i + 1] = [out[shortest_i][0], out[shortest_i + 1][1]]
                        out.pop(shortest_i)
                return out

            segments2 = _merge_to_limit(segments2, max_segments)
            return segments2

        def _equal_split(duration_sec, max_segments):
            if not duration_sec or duration_sec <= 0:
                return []
            desired = int(round(duration_sec / 3.0))
            desired = max(2, desired)
            desired = min(int(max_segments), desired)
            step = float(duration_sec) / float(desired)
            if step < 0.2:
                desired = max(2, min(int(max_segments), int(duration_sec / 0.2)))
                if desired <= 1:
                    return []
                step = float(duration_sec) / float(desired)
            out = []
            t = 0.0
            for i in range(desired):
                s = t
                e = float(duration_sec) if i == desired - 1 else min(float(duration_sec), s + step)
                if e - s >= 0.2:
                    out.append([s, e])
                t = e
                if t >= duration_sec:
                    break
            return out

        profiles = {
            "stable": {"threshold": 27.0, "min_scene_sec": 1.0, "debounce_sec": 0.3, "strip_black": True},
            "balanced": {"threshold": 23.0, "min_scene_sec": 0.6, "debounce_sec": 0.2, "strip_black": True},
            "sensitive": {"threshold": 18.0, "min_scene_sec": 0.25, "debounce_sec": 0.1, "strip_black": False},
        }
        chain = ["stable", "balanced", "sensitive"] if mode == "stable" else (["balanced", "sensitive"] if mode == "balanced" else ["sensitive"])

        segments2 = []
        for key in chain:
            prof = profiles[key]
            content_boundaries, dur2 = _run_detect_content_boundaries(prof["threshold"], prof["min_scene_sec"])
            if dur2 and dur2 > 0 and (not duration_sec or duration_sec <= 0):
                duration_sec = dur2
            segments2 = _postprocess(content_boundaries, prof["min_scene_sec"], prof["debounce_sec"], prof["strip_black"])
            if len(segments2) >= 2:
                break

        if len(segments2) <= 1:
            segments2 = _equal_split(duration_sec, max_segments)

        if len(segments2) <= 1:
            _smart_clip_update(job_id, status="done", stage="done", progress=1.0, segments=[])
            return

        segments = []
        for i, (s, e) in enumerate(segments2):
            segments.append({"index": i + 1, "start": s, "end": e, "duration": e - s})

        _smart_clip_update(job_id, stage="cut", progress=0.05, total=len(segments))

        out_dir = os.path.join(OUTPUT_DIR, "SceneCuts", job_id)
        os.makedirs(out_dir, exist_ok=True)

        out_segments = []
        total = len(segments)
        for idx, seg in enumerate(segments):
            s = float(seg["start"])
            e = float(seg["end"])
            dur = max(0.01, e - s)
            ms_s = int(round(s * 1000))
            ms_e = int(round(e * 1000))
            filename = f"scene_{idx+1:03d}_{ms_s}-{ms_e}.mp4"
            out_path = os.path.join(out_dir, filename)

            cmd = [
                "ffmpeg",
                "-y",
                "-i",
                local_src,
                "-ss",
                str(s),
                "-t",
                str(dur),
                "-c:v",
                "libx264",
                "-preset",
                "fast",
                "-c:a",
                "aac",
                out_path,
            ]
            if fps_str:
                cmd.insert(-1, "-r")
                cmd.insert(-1, fps_str)

            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                startupinfo=startupinfo,
            )
            try:
                _, stderr = process.communicate(timeout=300)
            except subprocess.TimeoutExpired:
                process.kill()
                _smart_clip_update(job_id, status="error", stage="cut", error="FFmpeg process timeout")
                return
            if process.returncode != 0:
                try:
                    err_text = (stderr or b"").decode("utf-8", errors="ignore").strip()
                except Exception:
                    err_text = ""
                _smart_clip_update(job_id, status="error", stage="cut", error=f"FFmpeg processing failed: {err_text or 'unknown error'}")
                return

            rel = f"output/SceneCuts/{job_id}/{filename}"
            out_segments.append(
                {
                    "index": idx + 1,
                    "start": s,
                    "end": e,
                    "duration": dur,
                    "path": rel,
                    "localPath": rel,
                    "url": f"/{rel}",
                }
            )

            p = 0.05 + 0.95 * float(idx + 1) / float(total)
            _smart_clip_update(job_id, stage="cut", progress=min(0.999, p), doneCount=idx + 1, total=total)

        _smart_clip_update(job_id, status="done", stage="done", progress=1.0, segments=out_segments)
    except Exception as e:
        _smart_clip_update(job_id, status="error", stage="error", error=str(e))

def _load_json_file(p):
    try:
        if not os.path.exists(p):
            return {}
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}

def _atomic_write_json(p, data):
    tmp = p + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        atomic_replace_with_retry(tmp, p)
    except Exception:
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except Exception:
            pass
        raise

def _scan_max_gen_seq_for_date(date_str):
    try:
        mid = machine_id()
        max_n = 0
        for root, _, files in os.walk(OUTPUT_DIR):
            for fn in files:
                # 只数本机前缀（含旧的无前缀历史名）；别机文件不纳入，避免跨机拉高序号。
                n = parse_gen_seq(fn, mid, date_str)
                if n is None:
                    continue
                if n > max_n:
                    max_n = n
        return max_n
    except Exception:
        return 0

def _next_gen_output_filename(ext):
    date_str = datetime.datetime.now().strftime("%Y%m%d")
    with _gen_seq_lock:
        state = _load_json_file(GEN_SEQ_STATE_FILE)
        last = 0
        try:
            last = int(state.get(date_str) or 0)
        except Exception:
            last = 0
        if last <= 0:
            scanned = _scan_max_gen_seq_for_date(date_str)
            if scanned > last:
                last = scanned
        n = last + 1
        state[date_str] = n
        try:
            _atomic_write_json(GEN_SEQ_STATE_FILE, state)
        except Exception:
            pass
    return next_gen_filename(machine_id(), date_str, n, ext)


def _normalize_posix_rel_path(path_value):
    return MediaFileRouteService._normalize_posix_rel_path(path_value)


def _join_virtual_local_path(root_prefix, rel_path):
    return MediaFileRouteService._join_virtual_local_path(root_prefix, rel_path)


def _resolve_virtual_media_root(local_path=None, abs_path=None):
    return MEDIA_FILE_ROUTE_SERVICE.resolve_virtual_media_root(local_path, abs_path)


def _collect_image_derivative_payload(abs_path, root_abs, root_prefix, rel_original_path):
    return MEDIA_FILE_ROUTE_SERVICE.collect_image_derivative_payload(
        abs_path,
        root_abs,
        root_prefix,
        rel_original_path,
    )


def _augment_saved_media_response(payload, abs_path, local_path):
    return MEDIA_FILE_ROUTE_SERVICE.augment_saved_media_response(payload, abs_path, local_path)


def _resolve_local_virtual_path(src_path):
    return MEDIA_FILE_ROUTE_SERVICE.resolve_local_virtual_path(src_path)


class Handler(http.server.SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def translate_path(self, path):
        raw_path = urllib.parse.urlsplit(path).path
        decoded_path = urllib.parse.unquote(raw_path).replace("\\", "/")
        virtual_roots = (
            ("/output/", OUTPUT_DIR),
            ("/data/uploads/", UPLOADS_DIR),
            ("/data/assets/", ASSETS_DIR),
            ("/data/workflows/", WORKFLOWS_DIR),
        )
        for prefix, root_dir in virtual_roots:
            if decoded_path == prefix[:-1] or decoded_path.startswith(prefix):
                rel = decoded_path[len(prefix):].lstrip("/")
                rel = os.path.normpath(rel)
                if rel in ("", "."):
                    return os.path.abspath(root_dir)
                if rel.startswith(".."):
                    return os.path.abspath(root_dir)
                return os.path.abspath(os.path.join(root_dir, rel))
        return super().translate_path(path)

    # 屏蔽日志噪音（按霢注释掉）
    def log_message(self, fmt, *args):
        pass

    def send_head(self):
        path = self.translate_path(self.path)
        f = None
        if os.path.isdir(path):
            parts = urllib.parse.urlsplit(self.path)
            if not parts.path.endswith('/'):
                self.send_response(301)
                new_parts = (parts[0], parts[1], parts[2] + '/', parts[3], parts[4])
                new_url = urllib.parse.urlunsplit(new_parts)
                self.send_header("Location", new_url)
                self.end_headers()
                return None
            for index in ("index.html", "index.htm"):
                index_path = os.path.join(path, index)
                if os.path.exists(index_path):
                    path = index_path
                    break
            else:
                return self.list_directory(path)
        ctype = self.guess_type(path)
        try:
            f = open(path, 'rb')
        except OSError:
            self.send_error(404, "File not found")
            return None

        fs = os.fstat(f.fileno())
        size = fs.st_size
        range_header = self.headers.get("Range", "")
        self._range = None

        if range_header.startswith("bytes="):
            spec = range_header[6:].strip()
            if "," not in spec:
                start_s, dash, end_s = spec.partition("-")
                try:
                    if start_s == "":
                        suffix_len = int(end_s)
                        if suffix_len <= 0:
                            raise ValueError()
                        start = max(0, size - suffix_len)
                        end = size - 1
                    else:
                        start = int(start_s)
                        end = int(end_s) if end_s else size - 1
                    if start < 0 or start >= size:
                        raise ValueError()
                    end = min(end, size - 1)
                    if end < start:
                        raise ValueError()
                    self._range = (start, end)
                except Exception:
                    f.close()
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.end_headers()
                    return None

        if self._range:
            start, end = self._range
            self.send_response(206)
            self.send_header("Content-Type", ctype)
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.send_header("Content-Length", str(end - start + 1))
            self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
            self.end_headers()
            f.seek(start)
            return f

        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(size))
        self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
        self.end_headers()
        return f

    def copyfile(self, source, outputfile):
        rng = getattr(self, "_range", None)
        if not rng:
            return super().copyfile(source, outputfile)
        start, end = rng
        remaining = end - start + 1
        bufsize = 64 * 1024
        while remaining > 0:
            chunk = source.read(min(bufsize, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)

    # ┢┢ OPTIONS 预检（CORS）─┢┢┢┢┢┢┢┢┢┢┢┢┢┢┢┢┢┢┢┢┢┢┢┢┢┢┢┢┢
    def do_OPTIONS(self):
        path = self.path.split("?")[0]
        if not _enforce_local_api_access(self, path):
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, PATCH, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization, X-AIC-Install-Id, X-AIC-Local-Token",
        )
        self.end_headers()

    # ════════════════════════════════════════════════════
    #  DELETE  /api/v2/projects/{filename}
    # ════════════════════════════════════════════════════
    def do_DELETE(self):
        path = self.path.split("?")[0]
        if not _enforce_local_api_access(self, path):
            return
        if HTTP_ROUTE_DISPATCHER.handle_delete(self, path):
            return

        _json_err(self, 400, "Invalid request")

    # ════════════════════════════════════════════════════
    #  PATCH  /api/v2/projects/{filename}  ?rename
    # ════════════════════════════════════════════════════
    def do_PATCH(self):
        path = self.path.split("?")[0]
        if not _enforce_local_api_access(self, path):
            return
        if HTTP_ROUTE_DISPATCHER.handle_patch(self, path):
            return

        _json_err(self, 400, "Invalid request")

    # ════════════════════════════════════════════════════
    #  GET
    # ════════════════════════════════════════════════════
    def do_GET(self):
        path = self.path.split("?")[0]
        if not _enforce_local_api_access(self, path):
            return

        if HTTP_ROUTE_DISPATCHER.handle_get(self, path):
            return

        # --- ???????? SimpleHTTPRequestHandler ??? ---
        try:
            super().do_GET()
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass

    def end_headers(self):
        # 避免重复响应头导致浏览器 CORS 拒绝（例如 "*, *"）
        header_buf = getattr(self, "_headers_buffer", []) or []
        has_cache_control = any(b"Cache-Control:" in h for h in header_buf)
        has_cors = any(b"Access-Control-Allow-Origin:" in h for h in header_buf)
        if not has_cache_control:
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        if not has_cors:
            _send_cors_origin_header(self)
        super().end_headers()

    # ════════════════════════════════════════════════════
    #  POST
    # ════════════════════════════════════════════════════
    def do_POST(self):
        path = self.path.split("?")[0]
        if not _enforce_local_api_access(self, path):
            return

        if HTTP_ROUTE_DISPATCHER.handle_post(self, path):
            return

        # ┢┢ 文件上传 ┢┢
        if path.rstrip("/") == "/api/v2/video/smart_clip":
            body = _read_body(self)
            try:
                data = json.loads(body or b"{}")
            except Exception:
                _json_err(self, 400, "Invalid JSON")
                return

            src_path = (data.get("src") or "").strip()
            options = data.get("options") or {}
            if not isinstance(options, dict):
                options = {}

            if not src_path:
                _json_err(self, 400, "Missing src")
                return

            safe_src = src_path.lstrip("/")
            norm_src = os.path.normpath(safe_src)
            if norm_src.startswith("..") or norm_src.startswith("../") or norm_src.startswith("..\\"):
                _json_err(self, 400, "Invalid src path")
                return
            local_src = _resolve_local_virtual_path(src_path)

            if not local_src or not os.path.exists(local_src):
                _json_err(self, 404, "Source video not found")
                return

            job_id = _smart_clip_new_job_id()
            try:
                created_at = time.time()
            except Exception:
                created_at = 0.0

            with _smart_clip_lock:
                _smart_clip_jobs[job_id] = {
                    "success": True,
                    "jobId": job_id,
                    "status": "running",
                    "stage": "queued",
                    "progress": 0.0,
                    "segments": None,
                    "error": None,
                    "createdAt": created_at,
                }

            t = threading.Thread(
                target=_run_smart_clip_job,
                args=(job_id, local_src, options),
                daemon=True,
            )
            t.start()

            _json_ok(self, {"success": True, "jobId": job_id})
            return

        if path == "/api/v2/video/matting/run":
            body = _read_body(self)
            try:
                data = json.loads(body)
            except json.JSONDecodeError:
                _json_err(self, 400, "Invalid JSON"); return

            api_key = (data.get("apiKey") or "").strip()
            node_info_list = data.get("nodeInfoList")
            if not api_key or not isinstance(node_info_list, list):
                _json_err(self, 400, "Missing apiKey or nodeInfoList"); return

            app_id = str(data.get("appId") or "2042569732972355585").strip() or "2042569732972355585"
            instance_type = data.get("instanceType") or data.get("rhInstanceType") or ""
            instance_type = str(instance_type).strip().lower()
            if instance_type in ("24g", "default", "basic"):
                instance_type = "default"
            elif instance_type in ("48g", "plus", "pro"):
                instance_type = "plus"
            else:
                instance_type = "default"

            def _resolve_local_file(url_or_path: str):
                s = (url_or_path or "").strip()
                if not s:
                    return None
                s2 = s.lstrip("/")
                if s2.startswith("output/"):
                    rel = s2[len("output/"):].lstrip("/\\")
                    fp = os.path.abspath(os.path.join(OUTPUT_DIR, rel))
                    if _is_path_inside(fp, OUTPUT_DIR) and os.path.isfile(fp):
                        return fp
                if s2.startswith("data/uploads/"):
                    rel = s2[len("data/uploads/"):].lstrip("/\\")
                    fp = os.path.abspath(os.path.join(UPLOADS_DIR, rel))
                    if _is_path_inside(fp, UPLOADS_DIR) and os.path.isfile(fp):
                        return fp
                if os.path.isabs(s) and os.path.isfile(s):
                    return s
                return None

            def _guess_filename(raw: str, fallback_name: str):
                path_name = ""
                try:
                    path_name = os.path.basename(urllib.parse.urlparse(raw).path or "")
                except Exception:
                    path_name = ""
                candidate = path_name or fallback_name
                if "." not in os.path.basename(candidate):
                    fallback_ext = os.path.splitext(fallback_name)[1] or ".bin"
                    candidate = f"{candidate}{fallback_ext}"
                return candidate

            def _download_remote_bytes(url: str):
                try:
                    import requests as _req
                    resp = _req.get(url, timeout=120)
                    resp.raise_for_status()
                    return resp.content
                except ImportError:
                    with urllib.request.urlopen(url, timeout=120) as resp:
                        return resp.read()

            def _upload_to_runninghub(file_bytes: bytes, filename: str, content_type: str = "application/octet-stream"):
                upload_api_url = "https://www.runninghub.cn/openapi/v2/media/upload/binary"
                try:
                    import requests as _req
                    files = {"file": (filename, file_bytes, content_type or "application/octet-stream")}
                    resp = _req.post(
                        upload_api_url,
                        files=files,
                        headers={"Authorization": f"Bearer {api_key}"},
                        timeout=120,
                    )
                    resp.raise_for_status()
                    js = resp.json()
                    if js.get("code") != 0:
                        raise RuntimeError(js.get("message") or js.get("msg") or "upload failed")
                    u = (js.get("data") or {}).get("download_url") or ""
                    if not u:
                        raise RuntimeError("upload missing download_url")
                    return u
                except ImportError:
                    import uuid
                    import urllib.request
                    import urllib.error
                    boundary = "----WebKitFormBoundary" + uuid.uuid4().hex
                    head = (
                        f"--{boundary}\r\n"
                        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
                        f"Content-Type: {content_type or 'application/octet-stream'}\r\n\r\n"
                    ).encode("utf-8")
                    tail = f"\r\n--{boundary}--\r\n".encode("utf-8")
                    payload = head + file_bytes + tail
                    req = urllib.request.Request(upload_api_url, data=payload, method="POST")
                    req.add_header("Authorization", f"Bearer {api_key}")
                    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
                    req.add_header("Content-Length", str(len(payload)))
                    with urllib.request.urlopen(req, timeout=120) as resp:
                        rb = resp.read()
                    js = json.loads(rb.decode("utf-8", errors="replace"))
                    if js.get("code") != 0:
                        raise RuntimeError(js.get("message") or js.get("msg") or "upload failed")
                    u = (js.get("data") or {}).get("download_url") or ""
                    if not u:
                        raise RuntimeError("upload missing download_url")
                    return u

            def _materialize_media_url(raw_value: str, fallback_name: str, fallback_content_type: str):
                raw = str(raw_value or "").strip()
                if not raw:
                    raise RuntimeError("missing media fieldValue")
                if "runninghub.cn" in raw:
                    return raw

                local_file = _resolve_local_file(raw)
                if local_file:
                    with open(local_file, "rb") as f:
                        file_bytes = f.read()
                    filename = os.path.basename(local_file) or fallback_name
                    content_type = mimetypes.guess_type(filename)[0] or fallback_content_type
                    return _upload_to_runninghub(file_bytes, filename, content_type)

                if raw.startswith("data:"):
                    match = re.match(r"^data:([^;,]+)?;base64,(.*)$", raw, re.DOTALL)
                    if not match:
                        raise RuntimeError("invalid data url")
                    mime_type = (match.group(1) or fallback_content_type or "application/octet-stream").strip()
                    ext = mimetypes.guess_extension(mime_type) or os.path.splitext(fallback_name)[1] or ".bin"
                    filename_root = os.path.splitext(fallback_name)[0] or "upload"
                    filename = f"{filename_root}{ext}"
                    try:
                        file_bytes = base64.b64decode(match.group(2))
                    except Exception as exc:
                        raise RuntimeError("invalid base64 media payload") from exc
                    return _upload_to_runninghub(file_bytes, filename, mime_type)

                if raw.startswith("http://") or raw.startswith("https://"):
                    file_bytes = _download_remote_bytes(raw)
                    filename = _guess_filename(raw, fallback_name)
                    content_type = mimetypes.guess_type(filename)[0] or fallback_content_type
                    return _upload_to_runninghub(file_bytes, filename, content_type)

                raise RuntimeError("unsupported media url")

            try:
                source_video_item = None
                mask_item = None
                for item in node_info_list:
                    if not isinstance(item, dict):
                        continue
                    node_id = str(item.get("nodeId") or "")
                    field_name = str(item.get("fieldName") or "")
                    if node_id == "117" and field_name == "video":
                        source_video_item = item
                    elif node_id == "63" and field_name == "image":
                        mask_item = item

                if not source_video_item:
                    _json_err(self, 400, "Missing source video node 117/video"); return
                if not mask_item:
                    _json_err(self, 400, "Missing erase mask node 63/image"); return

                source_video_item["fieldValue"] = _materialize_media_url(
                    source_video_item.get("fieldValue"),
                    "input.mp4",
                    "video/mp4",
                )
                mask_item["fieldValue"] = _materialize_media_url(
                    mask_item.get("fieldValue"),
                    "erase-mask.png",
                    "image/png",
                )

                api_url = f"https://www.runninghub.cn/openapi/v2/run/ai-app/{app_id}"
                payload = {
                    "nodeInfoList": node_info_list,
                    "instanceType": instance_type,
                    "usePersonalQueue": "false",
                }
                request_headers = {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                }

                try:
                    import requests as _req
                    resp = _req.post(
                        api_url,
                        json=payload,
                        headers=request_headers,
                        timeout=900,
                    )
                    self.send_response(resp.status_code)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    _send_cors_origin_header(self)
                    self.end_headers()
                    self.wfile.write(resp.content)
                except ImportError:
                    import urllib.request, urllib.error
                    req_body = json.dumps(payload).encode("utf-8")
                    req = urllib.request.Request(api_url, data=req_body, method="POST")
                    req.add_header("Authorization", f"Bearer {api_key}")
                    req.add_header("Content-Type", "application/json")
                    req.add_header("User-Agent", "Mozilla/5.0")
                    try:
                        with urllib.request.urlopen(req, timeout=900) as resp:
                            resp_data = resp.read()
                        self.send_response(resp.status)
                        self.send_header("Content-Type", "application/json; charset=utf-8")
                        _send_cors_origin_header(self)
                        self.end_headers()
                        self.wfile.write(resp_data)
                    except urllib.error.HTTPError as e:
                        self.send_response(e.code)
                        self.send_header("Content-Type", "application/json; charset=utf-8")
                        _send_cors_origin_header(self)
                        self.end_headers()
                        self.wfile.write(e.read())
            except Exception as e:
                _json_err(self, 500, f"Video matting proxy error: {repr(e)}")
            return

        # ┢┢ PPIO 图像生成代理 ┢┢
        if path == "/api/v2/proxy/image":
            body = _read_body(self)
            try:
                data = json.loads(body)
                if not isinstance(data, dict):
                    raise json.JSONDecodeError("Invalid JSON", str(body), 0)
                api_url = data.pop("apiUrl", "").strip().rstrip("/")
                api_key = data.pop("apiKey", "").strip()
            except json.JSONDecodeError:
                _json_err(self, 400, "Invalid JSON"); return
            if not api_url or not api_key:
                _json_err(self, 400, "Missing apiUrl or apiKey"); return
            def _extract_task_id_from_text(raw_text):
                text = str(raw_text or "")
                if not text:
                    return ""
                patterns = [
                    r'"task_id"\s*:\s*"([^"]+)"',
                    r'"taskId"\s*:\s*"([^"]+)"',
                    r'"id"\s*:\s*"([^"]+)"',
                    r'"data"\s*:\s*"([^"]{8,})"',
                    r'\btask[_-]?id\b\s*[:=]\s*["\']?([a-zA-Z0-9._:-]+)["\']?',
                    r'\bid\b\s*[:=]\s*["\']?([a-zA-Z0-9._:-]{8,})["\']?',
                ]
                for pattern in patterns:
                    match = re.search(pattern, text, flags=re.IGNORECASE)
                    if match:
                        value = str(match.group(1) or "").strip()
                        if value:
                            return value
                return ""
            generation_meta = _infer_proxy_image_generation_metadata(api_url, data)
            allow_task_probe_short_circuit = generation_meta["allow_task_probe_short_circuit"]
            if allow_task_probe_short_circuit:
                if not _enforce_generation_subscription_gate(
                    self,
                    data,
                    required_model_id=generation_meta["required_model_id"],
                    provider=generation_meta["provider"],
                    node_type=generation_meta["node_type"],
                ):
                    return
            forward_data = _strip_internal_control_fields(data)
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0",
                # 减少代理复用连接被远端提前关闭导致的偶发断链
                "Connection": "close",
            }
            try:
                import requests as _req
                retry_delays = (0.0, 0.3, 0.9)
                proxy_error_markers = (
                    "ProxyError",
                    "Unable to connect to proxy",
                    "RemoteDisconnected",
                    "MaxRetryError",
                )
                for attempt_idx, delay_sec in enumerate(retry_delays):
                    if delay_sec > 0:
                        time.sleep(delay_sec)
                    try:
                        resp = _req.post(
                            api_url,
                            json=forward_data,
                            headers=headers,
                            timeout=900,
                            stream=True,
                        )
                        header_task_id = ""
                        for key in (
                            "x-task-id",
                            "x-taskid",
                            "task-id",
                            "taskid",
                            "x-request-id",
                            "request-id",
                            "x-job-id",
                            "job-id",
                        ):
                            value = str(resp.headers.get(key, "") or "").strip()
                            if value:
                                header_task_id = value
                                break
                        if header_task_id and allow_task_probe_short_circuit:
                            _json_ok(
                                self,
                                {
                                    "task_id": header_task_id,
                                    "status": "submitted",
                                    "source": "header",
                                },
                            )
                            try:
                                resp.close()
                            except Exception:
                                pass
                            return

                        chunks = []
                        bytes_read = 0
                        max_probe_bytes = 256 * 1024
                        found_task_id = ""
                        for chunk in resp.iter_content(chunk_size=4096):
                            if not chunk:
                                continue
                            chunks.append(chunk)
                            bytes_read += len(chunk)
                            if found_task_id:
                                continue
                            if bytes_read <= max_probe_bytes:
                                probe_text = b"".join(chunks).decode("utf-8", "ignore")
                                found_task_id = _extract_task_id_from_text(probe_text)
                                if found_task_id and allow_task_probe_short_circuit:
                                    _json_ok(
                                        self,
                                        {
                                            "task_id": found_task_id,
                                            "status": "submitted",
                                            "source": "body-probe",
                                        },
                                    )
                                    try:
                                        resp.close()
                                    except Exception:
                                        pass
                                    return

                        full_content = b"".join(chunks)
                        self.send_response(resp.status_code)
                        self.send_header("Content-Type", "application/json; charset=utf-8")
                        _send_cors_origin_header(self)
                        self.end_headers()
                        self.wfile.write(full_content)
                        return
                    except _req.exceptions.ProxyError:
                        if attempt_idx == len(retry_delays) - 1:
                            raise
                    except _req.exceptions.ConnectionError as e:
                        msg = repr(e)
                        is_proxy_chain_error = any(
                            marker in msg for marker in proxy_error_markers
                        )
                        if is_proxy_chain_error:
                            if attempt_idx == len(retry_delays) - 1:
                                raise
                            continue
                        raise
            except ImportError:
                import urllib.request, urllib.error
                req_body = json.dumps(forward_data).encode("utf-8")
                req = urllib.request.Request(api_url, data=req_body, headers=headers, method="POST")
                retry_delays = (0.0, 0.3, 0.9)
                proxy_error_markers = (
                    "ProxyError",
                    "Unable to connect to proxy",
                    "RemoteDisconnected",
                    "MaxRetryError",
                )
                for attempt_idx, delay_sec in enumerate(retry_delays):
                    if delay_sec > 0:
                        time.sleep(delay_sec)
                    try:
                        with urllib.request.urlopen(req, timeout=900) as resp:
                            resp_data = resp.read()
                        self.send_response(resp.status)
                        self.send_header("Content-Type", "application/json; charset=utf-8")
                        _send_cors_origin_header(self)
                        self.end_headers()
                        self.wfile.write(resp_data)
                        return
                    except urllib.error.HTTPError as e:
                        self.send_response(e.code)
                        self.send_header("Content-Type", "application/json; charset=utf-8")
                        _send_cors_origin_header(self)
                        self.end_headers()
                        self.wfile.write(e.read())
                        return
                    except urllib.error.URLError as e:
                        msg = repr(e)
                        is_proxy_chain_error = any(
                            marker in msg for marker in proxy_error_markers
                        )
                        if is_proxy_chain_error:
                            if attempt_idx == len(retry_delays) - 1:
                                raise
                            continue
                        raise
            except Exception as e:
                _json_err(self, 500, f"Proxy error: {repr(e)}")
            return

        # ┢┢ 通用代理 forwarded ┢┢
        if path == "/api/v2/proxy/completions":
            body = _read_body(self)
            try:
                data = json.loads(body)
                if not isinstance(data, dict):
                    raise json.JSONDecodeError("Invalid JSON", str(body), 0)
                api_url = data.pop("apiUrl", "").strip().rstrip("/")
                api_key = data.pop("apiKey", "").strip()
            except json.JSONDecodeError:
                _json_err(self, 400, "Invalid JSON"); return
            
            if not api_url or not api_key:
                global_cfg = _get_custom_ai_config()
                api_url = api_url or global_cfg["apiUrl"]
                api_key = api_key or global_cfg["apiKey"]

            if not api_url or not api_key:
                _json_err(self, 400, "Missing apiUrl or apiKey"); return

            if not _enforce_generation_subscription_gate(
                self,
                data,
                required_model_id=str(data.get("model") or "").strip(),
                provider=str(data.get("provider") or "").strip() or "text",
                node_type="text",
            ):
                return
            forward_data = _strip_internal_control_fields(data)
            
            # ?? Gemini ???????????
            if ":generateContent" in api_url or "/v1beta/models" in api_url or api_url.endswith("/chat/completions"):
                endpoint = api_url
            else:
                endpoint = f"{api_url}/chat/completions"
            
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "application/json"
            }
            
            try:
                import requests
                req_body = json.dumps(forward_data)
                try:
                    # ??????? 300 ???? aiTextApi.js ??????
                    resp = requests.post(endpoint, data=req_body, headers=headers, timeout=600)
                except requests.exceptions.ConnectionError as ce:
                    _json_err(self, 502, f"????? AI ???: {str(ce)}")
                    return
                except requests.exceptions.Timeout as te:
                    _json_err(self, 504, f"AI ???????: {str(te)}")
                    return
                except requests.exceptions.RequestException as req_err:
                    _json_err(self, 502, f"AI ???????: {str(req_err)}")
                    return
                
                # ??????? SSE ??????????? JSON
                resp_text = resp.text
                resp_content_type = resp.headers.get('Content-Type', '')
                
                # ?????? text/event-stream ??? data: ??????? JSON
                is_sse = 'text/event-stream' in resp_content_type or resp_text.strip().startswith('data:')
                if is_sse:
                    try:
                        # ??? SSE ??????? JSON
                        lines = [l.strip() for l in resp_text.split('\n') if l.strip().startswith('data:')]
                        if lines:
                            last_line = lines[-1].replace('data:', '').strip()
                            if last_line == '[DONE]':
                                # 找数第二个有效行
                                valid_lines = [l for l in lines if l.replace('data:', '').strip() != '[DONE]']
                                if valid_lines:
                                    json_str = valid_lines[-1].replace('data:', '').strip()
                                    json_data = json.loads(json_str)
                                    resp_text = json.dumps(json_data)
                            else:
                                json_data = json.loads(last_line)
                                resp_text = json.dumps(json_data)
                    except Exception:
                        # ?????????????
                        pass
                
                self.send_response(resp.status_code)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                _send_cors_origin_header(self)
                self.end_headers()
                self.wfile.write(resp_text.encode('utf-8'))
            except ImportError:
                # Fallback to urllib if requests is not installed
                import urllib.request
                req_body = json.dumps(forward_data).encode("utf-8")
                req = urllib.request.Request(endpoint, data=req_body, headers=headers, method="POST")
                try:
                    with urllib.request.urlopen(req, timeout=600) as resp:
                        resp_data = resp.read()
                        resp_text = resp_data.decode('utf-8')
                    
                    # ??????? SSE ??????????? JSON
                    if resp_text.strip().startswith('data:'):
                        try:
                            lines = [l.strip() for l in resp_text.split('\n') if l.strip().startswith('data:')]
                            if lines:
                                last_line = lines[-1].replace('data:', '').strip()
                                if last_line == '[DONE]':
                                    valid_lines = [l for l in lines if l.replace('data:', '').strip() != '[DONE]']
                                    if valid_lines:
                                        json_str = valid_lines[-1].replace('data:', '').strip()
                                        json_data = json.loads(json_str)
                                        resp_text = json.dumps(json_data)
                                else:
                                    json_data = json.loads(last_line)
                                    resp_text = json.dumps(json_data)
                        except Exception:
                            pass

                    self.send_response(resp.status)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    _send_cors_origin_header(self)
                    self.end_headers()
                    self.wfile.write(resp_text.encode('utf-8'))
                except urllib.error.HTTPError as e:
                    self.send_response(e.code)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    _send_cors_origin_header(self)
                    self.end_headers()
                    self.wfile.write(e.read())
            except Exception as e:
                _json_err(self, 500, repr(e))
            return

        # --- ??? AI ????????? OpenAI ????? ---
        if path == "/api/v2/chat":
            body = _read_body(self)
            try:
                data = json.loads(body)
            except json.JSONDecodeError:
                _json_err(self, 400, "Invalid JSON"); return
            api_url  = data.get("apiUrl", "").strip().rstrip("/")
            api_key  = data.get("apiKey", "").strip()
            model    = data.get("model", "")
            prompt   = data.get("prompt", "")
            # apiUrl/apiKey ??????????? config.json ????? AI ??
            if not api_url or not api_key:
                global_cfg = _get_custom_ai_config()
                api_url = api_url or global_cfg["apiUrl"]
                api_key = api_key or global_cfg["apiKey"]
            if not api_url or not api_key or not model or not prompt:
                _json_err(self, 400, "Missing required fields: apiUrl, apiKey, model, prompt"); return
            
            # ????????????? /chat/completions ????
            endpoint = api_url if api_url.endswith("/chat/completions") else f"{api_url}/chat/completions"
            
            import urllib.request
            req_body = json.dumps({
                "model": model,
                "messages": [{"role": "user", "content": prompt}]
            }).encode("utf-8")
            req = urllib.request.Request(
                endpoint,
                data=req_body,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=600) as resp:
                    resp_data = json.loads(resp.read().decode("utf-8"))

                content = resp_data["choices"][0]["message"]["content"]
                _json_ok(self, {"content": content})
            except urllib.error.HTTPError as e:
                err_body = e.read().decode("utf-8", errors="ignore")
                try: err_msg = json.loads(err_body).get("error", {}).get("message", err_body)
                except: err_msg = err_body
                _json_err(self, e.code, err_msg)
            except urllib.error.URLError as e:
                _json_err(self, 502, f"AI service connection failed: {getattr(e, 'reason', e)}")
            except Exception as e:
                _json_err(self, 500, str(e))
            return

        _json_err(self, 404, "Not found")


def _is_wildcard_bind_host(host):
    normalized = str(host or "").strip().lower()
    return normalized in ("0.0.0.0", "::", "[::]", "*")


def _parse_server_args(argv):
    port = PORT
    bind_host = BIND_HOST
    lan_mode = bool(LAN_MODE)
    positional = []
    for arg in argv:
        raw = str(arg or "").strip()
        if not raw:
            continue
        if raw == "--lan":
            lan_mode = True
            continue
        if raw.startswith("--host="):
            bind_host = raw.split("=", 1)[1].strip() or bind_host
            continue
        if raw.startswith("--port="):
            try:
                port = int(raw.split("=", 1)[1].strip())
            except Exception:
                port = PORT
            continue
        positional.append(raw)

    if positional:
        try:
            port = int(positional[0])
        except Exception:
            port = PORT
    if len(positional) > 1:
        bind_host = positional[1].strip() or bind_host

    return port, bind_host, lan_mode


def _resolve_bind_host(bind_host, lan_mode):
    host = str(bind_host or "").strip() or "127.0.0.1"
    if lan_mode and host in ("127.0.0.1", "localhost"):
        return "0.0.0.0", False
    if _is_wildcard_bind_host(host) and not lan_mode:
        return "127.0.0.1", True
    return host, False


def _display_urls(bind_host, port):
    host = str(bind_host or "").strip()
    if _is_wildcard_bind_host(host):
        hosts = ["127.0.0.1", "localhost"]
    elif host in ("127.0.0.1", "localhost"):
        hosts = ["127.0.0.1", "localhost"]
    else:
        hosts = [host]
    urls = []
    for item in hosts:
        url_host = f"[{item}]" if ":" in item and not item.startswith("[") else item
        urls.append(f"http://{url_host}:{port}/")
    return urls


# --- ?? ---
if __name__ == "__main__":
    # ????????????
    _startup_log("main entry")
    _t = threading.Thread(target=UPDATE_SERVICE.update_check_loop, daemon=True, name='AutoUpdateChecker')
    _t.start()
    _startup_log("update thread started")
    SAM3_SERVICE.start_background_workers()
    _startup_log("sam3 workers started")
    port, requested_bind_host, lan_mode = _parse_server_args(sys.argv[1:])
    # Sync the actual serve port into the module global so the ViMax
    # broker_url_getter (read lazily at render time) points the runner's
    # draw calls at the real port, not the 8777 default. (Module top-level,
    # so this rebinds the global the broker lambda closes over.)
    PORT = port
    bind_host, bind_host_was_restricted = _resolve_bind_host(requested_bind_host, lan_mode)
    _startup_log(f"binding {bind_host}:{port}")
    with ReusableThreadingTCPServer((bind_host, port), Handler) as httpd:
        _startup_log(f"bound {bind_host}:{port}")
        print("=" * 56)
        if LOCAL_FIXED_SUBSCRIPTION_ENABLED:
            print("[subscription] mode = local-admin-cdkey + local-one-time-cdkey + mac-binding")
            print(f"[subscription] license state dir = {SYSTEM_STATE_DIR}")
        elif SUBSCRIPTION_API_BASE_OVERRIDDEN:
            print(f"[subscription] api base override enabled: {SUBSCRIPTION_API_BASE}")
        else:
            print("[subscription] api base = official")
        if bind_host_was_restricted:
            print("[security] 0.0.0.0 需要显式局域网模式，已回退到 127.0.0.1")
        if lan_mode:
            print("[security] 局域网模式已开启，请通过 AIC_ALLOWED_ORIGINS 配置可信 Origin")
        print("幻映服务已启动")
        for url in _display_urls(bind_host, port):
            print(url)
        print("按 Ctrl+C 停止服务")
        print("=" * 56)
        _startup_log("entering serve_forever")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n服务已停止。")
