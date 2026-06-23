# Windows Onefile GitHub Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the current Python local server plus native ES-module frontend into a Windows single-file `huanying-workbench.exe` with PyInstaller `--onefile`, then publish it from GitHub Actions as a workflow artifact and tag-driven GitHub Release asset.

**Implementation status:** Completed in T009. The landed workflow uses `softprops/action-gh-release@v2` for tag release uploads, and editable preset definitions persist as `user/prompt-presets.json`.

**Architecture:** Keep the app as a local-first browser application. The exe is a launcher/server process that bundles Python code and read-only static resources, opens `http://127.0.0.1:<port>/`, and writes all user data to a stable writable storage root instead of PyInstaller's temporary extraction directory. Existing API payloads, virtual paths, model fields, generation fields, and prompt preset schemas remain compatible.

**Tech Stack:** Python 3.12, `http.server`, PyInstaller `--onefile`, GitHub Actions `windows-latest`, `softprops/action-gh-release@v2`, native browser frontend, Node test runner for JS tests.

---

## Reference Documents

- PyInstaller usage and `--onefile` / `--add-data`: https://pyinstaller.org/en/stable/usage.html
- PyInstaller runtime resource location and `sys._MEIPASS`: https://pyinstaller.org/en/stable/runtime-information.html
- GitHub Actions workflow artifacts: https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-what-your-workflow-does/storing-and-sharing-data-from-a-workflow
- GitHub-hosted Windows runners: https://docs.github.com/en/actions/reference/runners/github-hosted-runners
- GitHub Release upload action: https://github.com/softprops/action-gh-release

## Current State

Existing packaging already proves most dependencies are buildable:

- `.github/workflows/build-windows-exe.yml` runs on `windows-latest`, installs Python 3.12 dependencies, installs PyInstaller, and calls `python tools/build_windows_bundle.py`.
- `tools/build_windows_bundle.py` currently uses PyInstaller `--onedir`, copies static runtime files into `release/windows/huanying-workbench/`, and zips that directory.
- `server.py` already recognizes frozen execution through `sys.frozen` and `sys._MEIPASS`, but `DIRECTORY`, writable `user/`, writable `output/`, writable `data/uploads/`, library assets, workflows, and static files are still coupled through `APP_ROOT`.

That layout works for `--onedir` because files are copied next to the exe. It is not safe for `--onefile` because PyInstaller extracts bundled resources to a temporary directory that can be deleted after process exit and should not be used as persistent user storage.

## Non-Negotiable Contracts

### Runtime Path Contract

The implementation must split roots:

| Name | Source mode | PyInstaller onedir | PyInstaller onefile |
| --- | --- | --- | --- |
| `importRoot` | repo root | exe bundle internals | `sys._MEIPASS` |
| `resourceRoot` | repo root | exe directory | `sys._MEIPASS` |
| `writableRoot` | repo root | exe directory by default | `%LOCALAPPDATA%\AI-CanvasPro` |
| `userDir` | `<writableRoot>/user` | `<writableRoot>/user` | `<writableRoot>/user` |
| `outputDir` | `<writableRoot>/output` | `<writableRoot>/output` | `<writableRoot>/output` |
| `uploadsDir` | `<writableRoot>/data/uploads` | `<writableRoot>/data/uploads` | `<writableRoot>/data/uploads` |
| `assetsDir` | `<writableRoot>/data/assets` | `<writableRoot>/data/assets` | `<writableRoot>/data/assets` |
| `workflowsDir` | `<writableRoot>/data/workflows` | `<writableRoot>/data/workflows` | `<writableRoot>/data/workflows` |

Environment overrides must remain possible:

- `AIC_RESOURCE_ROOT`: overrides read-only static resource root.
- `AIC_WRITABLE_ROOT`: overrides writable root for portable/testing builds.
- `AICANVAS_PORT`: keeps its current meaning.
- `AIC_BIND_HOST`, `AIC_LAN_MODE`, `AIC_ALLOWED_ORIGINS`, `AIC_LOCAL_TOKEN`: unchanged.

### API And Data Contract

No existing frontend call site should need a request-shape change.

| API / path | Current fields to preserve | Root after onefile |
| --- | --- | --- |
| `GET /api/v2/runtime/info` | `success`, `isDevBuild`, `isAdvancedMode`, `localVersion` | add optional runtime fields only |
| `GET/POST /api/v2/user/settings.json` | `fileSavePaths.userDir`, `fileSavePaths.outputDir`, `fileSavePaths.tempDir`, `installId` | `SYSTEM_STATE_DIR` plus `userDir/settings.json` compatibility |
| `GET/POST /api/config` | provider config, API keys, special provider config | `userDir/config.json` |
| `GET /api/v2/projects` | `filename`, `name`, `mtime` | `userDir/Canvas Project` |
| `POST /api/v2/projects/save` | `projectName`, `canvases`, `activeCanvasId`, legacy `nodes/edges/viewport` | `userDir/Canvas Project` |
| `GET/POST /api/v2/assets` | asset JSON objects, `id` | `data/assets` under writable root |
| `GET/POST /api/v2/workflows` | workflow JSON objects, `id`, `scope` | `data/workflows` under writable root |
| `POST /api/upload` | response `success`, `url`, `localPath`, `filename` | `data/uploads/<file>` under writable root |
| `POST /api/v2/save_output` | response `success`, `url`, `localPath`, media metadata | `output/<file>` under writable root |
| `GET /output/...` | serves generated files | virtual root to `outputDir` |
| `GET /data/uploads/...` | serves uploaded files | virtual root to `uploadsDir` |
| `GET /data/assets/...` | serves user asset thumbnails | virtual root to `assetsDir` |
| `GET /data/workflows/...` | serves user workflow thumbnails | virtual root to `workflowsDir` |
| `GET /api/v2/user/presets` | `{ [nodeType]: [{ title, template }] }` | `userDir/prompt/<nodeType>/*.txt` |
| `GET /api/v2/user/presets/definitions` | system preset definitions with `subItems` support | seeded from bundled `config/prompt-presets.json`, persisted to `userDir/prompt-presets.json` |
| `POST /api/v2/user/presets/dev/save` | `nodeType`, `title`, `template`, `originalTitle` | `userDir/prompt/<nodeType>/<title>.txt` |

Generation payload fields are not part of packaging and must remain untouched:

- image/text registry fields: `selectedModelId`, `selectedModelNameSnapshot`, `provider`, `model`, `apiUrl`, `apiKey`, `adapterType`.
- image batch fields: `batchSize`, `n`.
- generated media fields: `images`, `imageUrl`, `sourceUrl`, `thumbUrl`, `localPath`, `outputPath`, `generationStartTime`, `generationDuration`.
- requested duration fields: `durationSec` remains requested duration; `generationDuration` remains elapsed runtime.

## File Structure

Create:

- `services/runtime_paths.py`: single source of truth for source/frozen/onefile path resolution.
- `packaging/huanying_onefile_launcher.py`: PyInstaller entrypoint that chooses port, opens browser, and runs `server` as `__main__`.
- `tools/build_windows_onefile.py`: deterministic onefile build script, manifest, sha256, privacy guard.
- `tools/smoke_windows_onefile.ps1`: local/CI smoke test for the generated exe.
- `server_runtime_paths_test.py`: Python unit tests for path contracts.

Modify:

- `server.py`: use `runtime_paths`; split `DIRECTORY`/static resources from writable directories; expose runtime info; map virtual media roots.
- `services/library_file_route_service.py`: seed read-only prompt preset definitions from bundled config and persist editable definitions under user storage.
- `services/http_route_dispatcher.py`: pass through optional runtime diagnostic fields in `/api/v2/runtime/info`.
- `.github/workflows/build-windows-exe.yml`: build single exe artifact and publish on `v*` tags.
- `tools/build_windows_bundle.py`: keep existing zip build unchanged, or add a comment pointing to onefile script as the single-exe path.
- `docs/TASKS.md`: add executable P0 task.
- `docs/DECISIONS.md`: record the resource/writable-root split and API compatibility decision.

## Task 1: Runtime Path Service

**Files:**
- Create: `services/runtime_paths.py`
- Test: `server_runtime_paths_test.py`

- [ ] **Step 1: Add failing tests for runtime path modes**

Create `server_runtime_paths_test.py`:

```python
import os
import tempfile
import unittest
from unittest import mock

from services.runtime_paths import build_runtime_paths, get_distribution_kind


class RuntimePathsTest(unittest.TestCase):
    def test_source_mode_uses_source_root_for_resources_and_writes(self):
        with tempfile.TemporaryDirectory() as tmp:
            paths = build_runtime_paths(source_dir=tmp, frozen=False, meipass="")
            self.assertEqual(paths["distribution"], "source")
            self.assertEqual(paths["resourceRoot"], os.path.abspath(tmp))
            self.assertEqual(paths["writableRoot"], os.path.abspath(tmp))
            self.assertEqual(paths["userDir"], os.path.join(os.path.abspath(tmp), "user"))
            self.assertEqual(paths["uploadsDir"], os.path.join(os.path.abspath(tmp), "data", "uploads"))

    def test_onefile_uses_meipass_for_resources_and_local_appdata_for_writes(self):
        with tempfile.TemporaryDirectory() as source_dir, tempfile.TemporaryDirectory() as meipass, tempfile.TemporaryDirectory() as local_appdata:
            with mock.patch.dict(os.environ, {"LOCALAPPDATA": local_appdata}, clear=False):
                paths = build_runtime_paths(source_dir=source_dir, frozen=True, meipass=meipass, executable_dir="C:\\dist")
            self.assertEqual(paths["distribution"], "onefile")
            self.assertEqual(paths["resourceRoot"], os.path.abspath(meipass))
            self.assertEqual(paths["writableRoot"], os.path.join(local_appdata, "AI-CanvasPro"))
            self.assertTrue(paths["presetDefinitionsPath"].endswith(os.path.join("user", "prompt-presets.json")))
            self.assertTrue(paths["seedPresetDefinitionsPath"].endswith(os.path.join("config", "prompt-presets.json")))

    def test_environment_overrides_win(self):
        with tempfile.TemporaryDirectory() as source_dir, tempfile.TemporaryDirectory() as resource_root, tempfile.TemporaryDirectory() as writable_root:
            with mock.patch.dict(os.environ, {"AIC_RESOURCE_ROOT": resource_root, "AIC_WRITABLE_ROOT": writable_root}, clear=False):
                paths = build_runtime_paths(source_dir=source_dir, frozen=True, meipass="C:\\temp\\bundle", executable_dir="C:\\dist")
            self.assertEqual(paths["resourceRoot"], os.path.abspath(resource_root))
            self.assertEqual(paths["writableRoot"], os.path.abspath(writable_root))

    def test_distribution_kind(self):
        self.assertEqual(get_distribution_kind(frozen=False, meipass=""), "source")
        self.assertEqual(get_distribution_kind(frozen=True, meipass=""), "onedir")
        self.assertEqual(get_distribution_kind(frozen=True, meipass="C:\\temp\\bundle"), "onefile")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
python -m unittest server_runtime_paths_test.py
```

Expected: `ModuleNotFoundError: No module named 'services.runtime_paths'`.

- [ ] **Step 3: Implement `services/runtime_paths.py`**

Create `services/runtime_paths.py`:

```python
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path


APP_STATE_FOLDER = "AI-CanvasPro"


def _abs(path: str | os.PathLike[str]) -> str:
    return os.path.abspath(os.path.expandvars(os.path.expanduser(str(path))))


def get_distribution_kind(*, frozen: bool | None = None, meipass: str | None = None) -> str:
    is_frozen = bool(getattr(sys, "frozen", False) if frozen is None else frozen)
    bundle_root = str(getattr(sys, "_MEIPASS", "") if meipass is None else meipass or "")
    if not is_frozen:
        return "source"
    if bundle_root:
        return "onefile"
    return "onedir"


def get_platform_state_dir(app_folder: str = APP_STATE_FOLDER) -> str:
    if sys.platform.startswith("win"):
        base_dir = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA") or os.path.expanduser("~")
        return _abs(Path(base_dir) / app_folder)
    if sys.platform == "darwin":
        return _abs(Path.home() / "Library" / "Application Support" / app_folder)
    base_dir = os.environ.get("XDG_STATE_HOME") or str(Path.home() / ".local" / "state")
    return _abs(Path(base_dir) / app_folder)


def build_runtime_paths(
    *,
    source_dir: str,
    frozen: bool | None = None,
    meipass: str | None = None,
    executable_dir: str | None = None,
) -> dict[str, str]:
    source_root = _abs(source_dir)
    is_frozen = bool(getattr(sys, "frozen", False) if frozen is None else frozen)
    bundle_root = str(getattr(sys, "_MEIPASS", "") if meipass is None else meipass or "")
    exe_dir = executable_dir or (os.path.dirname(sys.executable) if is_frozen else source_root)
    distribution = get_distribution_kind(frozen=is_frozen, meipass=bundle_root)

    env_resource_root = str(os.environ.get("AIC_RESOURCE_ROOT") or "").strip()
    env_writable_root = str(os.environ.get("AIC_WRITABLE_ROOT") or "").strip()

    if env_resource_root:
        resource_root = _abs(env_resource_root)
    elif distribution == "onefile":
        resource_root = _abs(bundle_root)
    elif distribution == "onedir":
        resource_root = _abs(exe_dir)
    else:
        resource_root = source_root

    if env_writable_root:
        writable_root = _abs(env_writable_root)
    elif distribution == "onefile":
        writable_root = get_platform_state_dir()
    elif distribution == "onedir":
        writable_root = _abs(exe_dir)
    else:
        writable_root = source_root

    user_dir = _abs(Path(writable_root) / "user")
    output_dir = _abs(Path(writable_root) / "output")
    uploads_dir = _abs(Path(writable_root) / "data" / "uploads")
    assets_dir = _abs(Path(writable_root) / "data" / "assets")
    workflows_dir = _abs(Path(writable_root) / "data" / "workflows")

    return {
        "distribution": distribution,
        "sourceRoot": source_root,
        "importRoot": _abs(bundle_root or source_root),
        "resourceRoot": resource_root,
        "writableRoot": writable_root,
        "executableDir": _abs(exe_dir),
        "userDir": user_dir,
        "canvasDir": _abs(Path(user_dir) / "Canvas Project"),
        "outputDir": output_dir,
        "uploadsDir": uploads_dir,
        "assetsDir": assets_dir,
        "assetThumbsDir": _abs(Path(assets_dir) / "thumbs"),
        "workflowsDir": workflows_dir,
        "workflowThumbsDir": _abs(Path(workflows_dir) / "thumbs"),
        "configFile": _abs(Path(user_dir) / "config.json"),
        "settingsFile": _abs(Path(user_dir) / "settings.json"),
        "systemStateDir": get_platform_state_dir(),
        "systemSettingsFile": _abs(Path(get_platform_state_dir()) / "settings.json"),
        "presetDefinitionsPath": _abs(Path(user_dir) / "prompt-presets.json"),
        "seedPresetDefinitionsPath": _abs(Path(resource_root) / "config" / "prompt-presets.json"),
    }


def ensure_runtime_dirs(paths: dict[str, str]) -> None:
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
    for preset_type in ("ai-image", "ai-text", "ai-video", "ai-audio"):
        os.makedirs(os.path.join(paths["userDir"], "prompt", preset_type), exist_ok=True)


def copy_missing_tree(src: str, dst: str) -> None:
    src_abs = _abs(src)
    dst_abs = _abs(dst)
    if not os.path.isdir(src_abs):
        return
    os.makedirs(dst_abs, exist_ok=True)
    for root, dirs, files in os.walk(src_abs):
        rel_root = os.path.relpath(root, src_abs)
        target_root = dst_abs if rel_root == "." else os.path.join(dst_abs, rel_root)
        os.makedirs(target_root, exist_ok=True)
        for dirname in dirs:
            os.makedirs(os.path.join(target_root, dirname), exist_ok=True)
        for filename in files:
            src_file = os.path.join(root, filename)
            dst_file = os.path.join(target_root, filename)
            if not os.path.exists(dst_file):
                shutil.copy2(src_file, dst_file)
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
python -m unittest server_runtime_paths_test.py
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add services/runtime_paths.py server_runtime_paths_test.py
git commit -m "feat: add runtime path contract for packaged builds"
```

## Task 2: Refactor `server.py` Root Usage

**Files:**
- Modify: `server.py`
- Test: `server_runtime_paths_test.py`

- [ ] **Step 1: Add runtime path imports and replace root initialization**

Replace the current `SOURCE_DIR`, `IMPORT_ROOT`, `APP_ROOT`, `CURRENT_DIR`, and `DIRECTORY` initialization block with:

```python
SOURCE_DIR = os.path.abspath(os.path.dirname(__file__))

from services.runtime_paths import (
    build_runtime_paths,
    copy_missing_tree,
    ensure_runtime_dirs,
)

RUNTIME_PATHS = build_runtime_paths(source_dir=SOURCE_DIR)
IMPORT_ROOT = RUNTIME_PATHS["importRoot"]
RESOURCE_ROOT = RUNTIME_PATHS["resourceRoot"]
WRITABLE_ROOT = RUNTIME_PATHS["writableRoot"]
APP_ROOT = RESOURCE_ROOT
CURRENT_DIR = RESOURCE_ROOT
DIRECTORY = RESOURCE_ROOT

if IMPORT_ROOT not in sys.path:
    sys.path.insert(0, IMPORT_ROOT)
```

- [ ] **Step 2: Replace default writable directory definitions**

Replace:

```python
DEFAULT_USER_DIR = os.path.join(DIRECTORY, "user")
DEFAULT_OUTPUT_DIR = os.path.join(DIRECTORY, "output")
DEFAULT_UPLOADS_DIR = os.path.join(DIRECTORY, "data", "uploads")
```

with:

```python
DEFAULT_USER_DIR = RUNTIME_PATHS["userDir"]
DEFAULT_OUTPUT_DIR = RUNTIME_PATHS["outputDir"]
DEFAULT_UPLOADS_DIR = RUNTIME_PATHS["uploadsDir"]
```

Then replace writable library roots:

```python
ASSETS_DIR = RUNTIME_PATHS["assetsDir"]
ASSET_THUMBS_DIR = RUNTIME_PATHS["assetThumbsDir"]
WORKFLOWS_DIR = RUNTIME_PATHS["workflowsDir"]
WORKFLOW_THUMBS_DIR = RUNTIME_PATHS["workflowThumbsDir"]
```

Keep `DIRECTORY` as the static resource root.

- [ ] **Step 3: Use runtime system state path**

Replace `SYSTEM_STATE_DIR = _get_system_state_dir()` and `SYSTEM_SETTINGS_FILE = ...` with:

```python
SYSTEM_STATE_DIR = RUNTIME_PATHS["systemStateDir"]
SYSTEM_SETTINGS_FILE = RUNTIME_PATHS["systemSettingsFile"]
```

Keep `_get_system_state_dir()` only if other code still imports it; otherwise remove it after tests pass.

- [ ] **Step 4: Ensure runtime directories before route service construction**

Before `_startup_system_settings = _read_json_file(...)`, add:

```python
ensure_runtime_dirs(RUNTIME_PATHS)
```

This prevents the first run of the exe from failing before `user/`, `output/`, `data/uploads/`, `data/assets/`, and `data/workflows/` exist.

- [ ] **Step 5: Add a onefile legacy migration guard**

After `ensure_runtime_dirs(RUNTIME_PATHS)`, add:

```python
def _migrate_legacy_packaged_storage_if_needed():
    if RUNTIME_PATHS.get("distribution") != "onefile":
        return
    legacy_root = RUNTIME_PATHS.get("executableDir") or ""
    writable_root = RUNTIME_PATHS.get("writableRoot") or ""
    if not legacy_root or os.path.abspath(legacy_root) == os.path.abspath(writable_root):
        return
    if os.path.exists(SYSTEM_SETTINGS_FILE):
        return
    legacy_user = os.path.join(legacy_root, "user")
    legacy_output = os.path.join(legacy_root, "output")
    legacy_uploads = os.path.join(legacy_root, "data", "uploads")
    copy_missing_tree(legacy_user, DEFAULT_USER_DIR)
    copy_missing_tree(legacy_output, DEFAULT_OUTPUT_DIR)
    copy_missing_tree(legacy_uploads, DEFAULT_UPLOADS_DIR)


_migrate_legacy_packaged_storage_if_needed()
```

This migrates adjacent `user/`, `output/`, and `data/uploads/` from an old portable folder only on first packaged onefile launch.

- [ ] **Step 6: Map user asset/workflow virtual roots**

In `Handler.translate_path`, expand `virtual_roots` to:

```python
virtual_roots = (
    ("/output/", OUTPUT_DIR),
    ("/data/uploads/", UPLOADS_DIR),
    ("/data/assets/", ASSETS_DIR),
    ("/data/workflows/", WORKFLOWS_DIR),
)
```

This keeps returned `localPath` fields usable:

- `output/<file>`
- `data/uploads/<file>`
- `data/assets/thumbs/<file>`
- `data/workflows/thumbs/<file>`

- [ ] **Step 7: Pass preset definition paths into `LibraryFileRouteService`**

Change the construction to:

```python
LIBRARY_FILE_ROUTE_SERVICE = LibraryFileRouteService(
    user_dir_getter=lambda: USER_DIR,
    asset_thumbs_dir_getter=lambda: ASSET_THUMBS_DIR,
    workflow_thumbs_dir_getter=lambda: WORKFLOW_THUMBS_DIR,
    preset_definitions_path_getter=lambda: RUNTIME_PATHS["presetDefinitionsPath"],
    preset_definitions_seed_path_getter=lambda: RUNTIME_PATHS["seedPresetDefinitionsPath"],
)
```

- [ ] **Step 8: Extend runtime info payload inputs**

When constructing `HttpRouteDispatcher`, add:

```python
runtime_paths_getter=lambda: {
    "distribution": RUNTIME_PATHS["distribution"],
    "resourceRoot": RESOURCE_ROOT,
    "writableRoot": WRITABLE_ROOT,
    "userDir": USER_DIR,
    "outputDir": OUTPUT_DIR,
    "uploadsDir": UPLOADS_DIR,
}
```

This is additive and keeps existing frontend code compatible.

- [ ] **Step 9: Run syntax check**

Run:

```powershell
python -m py_compile server.py services\runtime_paths.py
```

Expected: no output and exit code 0.

- [ ] **Step 10: Commit**

```powershell
git add server.py
git commit -m "feat: split packaged resource and writable roots"
```

## Task 3: Preserve Prompt Preset Definition Persistence

**Files:**
- Modify: `services/library_file_route_service.py`
- Test: `library_file_route_service_test.py`

- [ ] **Step 1: Add tests for seed-read and writable-save behavior**

Append tests to `library_file_route_service_test.py`:

```python
def test_preset_definitions_read_from_seed_when_writable_missing(self):
    with tempfile.TemporaryDirectory() as temp_dir:
        user_dir = os.path.join(temp_dir, "user")
        seed_path = os.path.join(temp_dir, "bundle", "config", "prompt-presets.json")
        writable_path = os.path.join(user_dir, "prompt-presets.json")
        os.makedirs(os.path.dirname(seed_path), exist_ok=True)
        with open(seed_path, "w", encoding="utf-8") as file:
            json.dump({"ai-image": [{"title": "Seed", "template": "seed prompt"}]}, file)

        service = LibraryFileRouteService(
            user_dir_getter=lambda: user_dir,
            asset_thumbs_dir_getter=lambda: os.path.join(temp_dir, "data", "assets", "thumbs"),
            workflow_thumbs_dir_getter=lambda: os.path.join(temp_dir, "data", "workflows", "thumbs"),
            preset_definitions_path_getter=lambda: writable_path,
            preset_definitions_seed_path_getter=lambda: seed_path,
        )

        response = service.handle_get(None, "/api/v2/user/presets/definitions")
        self.assertEqual(response["kind"], "json_ok")
        self.assertEqual(response["data"]["ai-image"][0]["title"], "Seed")

def test_preset_definitions_save_writes_to_writable_path_not_seed(self):
    with tempfile.TemporaryDirectory() as temp_dir:
        user_dir = os.path.join(temp_dir, "user")
        seed_path = os.path.join(temp_dir, "bundle", "config", "prompt-presets.json")
        writable_path = os.path.join(user_dir, "prompt-presets.json")
        os.makedirs(os.path.dirname(seed_path), exist_ok=True)
        with open(seed_path, "w", encoding="utf-8") as file:
            json.dump({"ai-text": [{"title": "Seed", "template": "seed text"}]}, file)

        service = LibraryFileRouteService(
            user_dir_getter=lambda: user_dir,
            asset_thumbs_dir_getter=lambda: os.path.join(temp_dir, "data", "assets", "thumbs"),
            workflow_thumbs_dir_getter=lambda: os.path.join(temp_dir, "data", "workflows", "thumbs"),
            preset_definitions_path_getter=lambda: writable_path,
            preset_definitions_seed_path_getter=lambda: seed_path,
        )
        body = json.dumps({"definitions": {"ai-text": [{"title": "User", "template": "user text"}]}})
        response = service.handle_post(None, "/api/v2/user/presets/definitions/save", body)

        self.assertEqual(response["kind"], "json_ok")
        self.assertTrue(os.path.exists(writable_path))
        with open(writable_path, "r", encoding="utf-8") as file:
            saved = json.load(file)
        self.assertEqual(saved["ai-text"][0]["title"], "User")
        with open(seed_path, "r", encoding="utf-8") as file:
            seed = json.load(file)
        self.assertEqual(seed["ai-text"][0]["title"], "Seed")
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
python -m unittest library_file_route_service_test.py
```

Expected: constructor does not accept `preset_definitions_seed_path_getter`.

- [ ] **Step 3: Modify constructor and read path fallback**

Update the constructor signature:

```python
def __init__(
    self,
    *,
    user_dir_getter,
    asset_thumbs_dir_getter,
    workflow_thumbs_dir_getter,
    preset_definitions_path_getter=None,
    preset_definitions_seed_path_getter=None,
):
    self._get_user_dir = user_dir_getter
    self._get_asset_thumbs_dir = asset_thumbs_dir_getter
    self._get_workflow_thumbs_dir = workflow_thumbs_dir_getter
    self._get_preset_definitions_path = (
        preset_definitions_path_getter or self._default_preset_definitions_path
    )
    self._get_preset_definitions_seed_path = preset_definitions_seed_path_getter
```

Add:

```python
def _preset_definitions_seed_path(self):
    if not self._get_preset_definitions_seed_path:
        return ""
    return os.path.abspath(str(self._get_preset_definitions_seed_path() or "").strip())
```

Change `_read_preset_definitions` to select writable first, seed second:

```python
def _read_preset_definitions(self):
    path = self._preset_definitions_path()
    seed_path = self._preset_definitions_seed_path()
    read_path = path if path and os.path.exists(path) else seed_path
    if not read_path or not os.path.exists(read_path):
        return {node_type: [] for node_type in self._DEFAULT_PRESET_TYPES}
    try:
        with open(read_path, "r", encoding="utf-8") as file:
            raw = json.load(file)
        return self._normalize_preset_definitions(raw)
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Failed to read preset definitions: {exc}") from exc
```

Keep `_write_preset_definitions` writing only to `_preset_definitions_path()`.

- [ ] **Step 4: Run tests**

Run:

```powershell
python -m unittest library_file_route_service_test.py
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add services/library_file_route_service.py library_file_route_service_test.py
git commit -m "feat: persist packaged preset definitions in user storage"
```

## Task 4: Runtime Info Passthrough

**Files:**
- Modify: `services/http_route_dispatcher.py`
- Test: `http_route_dispatcher_test.py`

- [ ] **Step 1: Add test for additive runtime fields**

Add a test that constructs `HttpRouteDispatcher` with:

```python
runtime_paths_getter=lambda: {
    "distribution": "onefile",
    "resourceRoot": "C:\\temp\\_MEI123",
    "writableRoot": "C:\\Users\\User\\AppData\\Local\\AI-CanvasPro",
    "userDir": "C:\\Users\\User\\AppData\\Local\\AI-CanvasPro\\user",
    "outputDir": "C:\\Users\\User\\AppData\\Local\\AI-CanvasPro\\output",
    "uploadsDir": "C:\\Users\\User\\AppData\\Local\\AI-CanvasPro\\data\\uploads",
}
```

Assert `_runtime_info_payload()` includes:

```python
self.assertEqual(payload["distribution"], "onefile")
self.assertEqual(payload["storage"]["userDir"], "C:\\Users\\User\\AppData\\Local\\AI-CanvasPro\\user")
self.assertTrue(payload["isPackaged"])
self.assertTrue(payload["isOnefile"])
```

- [ ] **Step 2: Modify dispatcher constructor**

Add the constructor parameter:

```python
runtime_paths_getter=None,
```

Store it:

```python
self._get_runtime_paths = runtime_paths_getter or (lambda: {})
```

- [ ] **Step 3: Extend `_runtime_info_payload` without removing current fields**

Replace `_runtime_info_payload` with:

```python
def _runtime_info_payload(self):
    runtime_paths = self._get_runtime_paths() or {}
    distribution = str(runtime_paths.get("distribution") or "source")
    payload = {
        "success": True,
        "isDevBuild": bool(self._is_dev_build()),
        "isAdvancedMode": bool(self._is_advanced_mode()),
        "localVersion": self.local_version,
        "distribution": distribution,
        "isPackaged": distribution in ("onedir", "onefile"),
        "isOnefile": distribution == "onefile",
        "storage": {
            "resourceRoot": str(runtime_paths.get("resourceRoot") or ""),
            "writableRoot": str(runtime_paths.get("writableRoot") or ""),
            "userDir": str(runtime_paths.get("userDir") or ""),
            "outputDir": str(runtime_paths.get("outputDir") or ""),
            "uploadsDir": str(runtime_paths.get("uploadsDir") or ""),
        },
    }
    return payload
```

- [ ] **Step 4: Run tests**

Run:

```powershell
python -m unittest http_route_dispatcher_test.py
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add services/http_route_dispatcher.py http_route_dispatcher_test.py
git commit -m "feat: expose packaged runtime storage info"
```

## Task 5: Onefile Launcher

**Files:**
- Create: `packaging/huanying_onefile_launcher.py`

- [ ] **Step 1: Create launcher**

Create `packaging/huanying_onefile_launcher.py`:

```python
from __future__ import annotations

import os
import runpy
import socket
import sys
import threading
import time
import urllib.request
import webbrowser


def _int_env(name: str, default: int) -> int:
    try:
        value = int(str(os.environ.get(name, default)).strip())
        return value if value > 0 else default
    except Exception:
        return default


def _is_port_available(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.25)
        return sock.connect_ex((host, int(port))) != 0


def _find_free_port(host: str) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return int(sock.getsockname()[1])


def _choose_port(host: str, preferred: int) -> int:
    if _is_port_available(host, preferred):
        return preferred
    return _find_free_port(host)


def _wait_for_http(url: str, timeout_sec: float = 30.0) -> bool:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.5) as response:
                return 200 <= int(response.status) < 500
        except Exception:
            time.sleep(0.5)
    return False


def _open_browser_when_ready(url: str) -> None:
    if _wait_for_http(url):
        webbrowser.open(url)


def main() -> int:
    host = "127.0.0.1"
    preferred_port = _int_env("AICANVAS_PORT", 8777)
    port = _choose_port(host, preferred_port)
    url = f"http://{host}:{port}/"

    os.environ["AICANVAS_PORT"] = str(port)
    os.environ.setdefault("AIC_BIND_HOST", host)
    os.environ.setdefault("AIC_PACKAGED_LAUNCHER", "1")

    opener = threading.Thread(
        target=_open_browser_when_ready,
        args=(url,),
        daemon=True,
        name="OpenBrowserWhenReady",
    )
    opener.start()

    sys.argv = [sys.argv[0], f"--port={port}", f"--host={host}"]
    runpy.run_module("server", run_name="__main__")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

The launcher does not change HTTP payloads. It only sets `AICANVAS_PORT`, `AIC_BIND_HOST`, and `AIC_PACKAGED_LAUNCHER`, then starts the existing `server.py` main block.

- [ ] **Step 2: Syntax check**

Run:

```powershell
python -m py_compile packaging\huanying_onefile_launcher.py
```

Expected: no output and exit code 0.

- [ ] **Step 3: Commit**

```powershell
git add packaging/huanying_onefile_launcher.py
git commit -m "feat: add onefile launcher entrypoint"
```

## Task 6: Onefile Build Script

**Files:**
- Create: `tools/build_windows_onefile.py`

- [ ] **Step 1: Create onefile build script**

Create `tools/build_windows_onefile.py`:

```python
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP_SLUG = "huanying-workbench"
RELEASE_DIR = ROOT / "release" / "windows"
PYINSTALLER_DIR = ROOT / "release" / ".pyinstaller-onefile"
ENTRYPOINT = ROOT / "packaging" / "huanying_onefile_launcher.py"

RUNTIME_FILES = ("index.html", "main.js", "style.css", "README.md")
RUNTIME_DIRS = (
    "api",
    "assets",
    "components",
    "config",
    "dev",
    "hooks",
    "images",
    "modules",
    "src",
    "styles",
    "ui",
    "vendor",
)
PYINSTALLER_COLLECTS = ("onnxruntime", "scenedetect", "tokenizers", "transformers")
DENIED_INPUTS = {"user", "output", "release", "venv", "venv-clean", "node_modules", "__pycache__"}


def run(cmd: list[str]) -> None:
    print("+", " ".join(cmd))
    subprocess.run(cmd, cwd=ROOT, check=True)


def ensure_clean_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def read_version() -> str:
    content = (ROOT / "index.html").read_text(encoding="utf-8")
    match = re.search(r'<meta name="app-version" content="([^"]+)"', content)
    version = (match.group(1) if match else "V0.0.0").strip()
    normalized = re.sub(r"[^A-Za-z0-9._-]+", "-", version).strip("-")
    return normalized or "V0.0.0"


def add_data_arg(src: Path, dest: str) -> str:
    return f"{src}{os.pathsep}{dest}"


def validate_runtime_inputs(paths: list[tuple[Path, str]]) -> None:
    for src, dest in paths:
        rel = src.relative_to(ROOT).parts[0]
        if rel in DENIED_INPUTS:
            raise RuntimeError(f"Denied runtime input: {src}")
        if not src.exists():
            raise FileNotFoundError(src)
        if dest.replace("\\", "/").strip("/").split("/")[0] in DENIED_INPUTS:
            raise RuntimeError(f"Denied runtime destination: {dest}")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_runtime_data_args() -> list[str]:
    paths: list[tuple[Path, str]] = []
    for rel in RUNTIME_FILES:
        src = ROOT / rel
        if src.exists():
            paths.append((src, "."))
    for rel in RUNTIME_DIRS:
        src = ROOT / rel
        if src.exists():
            paths.append((src, rel))
    validate_runtime_inputs(paths)
    args: list[str] = []
    for src, dest in paths:
        args.extend(["--add-data", add_data_arg(src, dest)])
    return args


def write_manifest(exe_path: Path, version: str, digest: str) -> Path:
    manifest_path = RELEASE_DIR / f"{APP_SLUG}-{version}-windows-x64.manifest.json"
    manifest = {
        "app": APP_SLUG,
        "version": version,
        "artifact": exe_path.name,
        "sha256": digest,
        "entrypoint": str(ENTRYPOINT.relative_to(ROOT)).replace("\\", "/"),
        "mode": "pyinstaller-onefile",
        "runtimeFiles": list(RUNTIME_FILES),
        "runtimeDirs": list(RUNTIME_DIRS),
        "deniedInputs": sorted(DENIED_INPUTS),
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest_path


def build_onefile() -> Path:
    version = read_version()
    ensure_clean_dir(RELEASE_DIR)
    ensure_clean_dir(PYINSTALLER_DIR)

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--name",
        APP_SLUG,
        "--distpath",
        str(RELEASE_DIR),
        "--workpath",
        str(PYINSTALLER_DIR / "build"),
        "--specpath",
        str(PYINSTALLER_DIR / "spec"),
    ]
    for package_name in PYINSTALLER_COLLECTS:
        cmd.extend(["--collect-all", package_name])
    cmd.extend(build_runtime_data_args())
    cmd.append(str(ENTRYPOINT))
    run(cmd)

    built_exe = RELEASE_DIR / f"{APP_SLUG}.exe"
    if not built_exe.exists():
        raise FileNotFoundError(f"PyInstaller output not found: {built_exe}")
    final_exe = RELEASE_DIR / f"{APP_SLUG}-{version}-windows-x64.exe"
    if final_exe.exists():
        final_exe.unlink()
    built_exe.rename(final_exe)
    digest = sha256_file(final_exe)
    (RELEASE_DIR / f"{final_exe.name}.sha256").write_text(f"{digest}  {final_exe.name}\n", encoding="utf-8")
    write_manifest(final_exe, version, digest)
    print(f"exe_path={final_exe}")
    print(f"sha256={digest}")
    return final_exe


def main() -> int:
    build_onefile()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Syntax check**

Run:

```powershell
python -m py_compile tools\build_windows_onefile.py
```

Expected: no output and exit code 0.

- [ ] **Step 3: Build locally**

Run:

```powershell
python -m pip install -r requirements.txt
python -m pip install pyinstaller
python tools\build_windows_onefile.py
```

Expected:

- `release/windows/huanying-workbench-<version>-windows-x64.exe`
- `release/windows/huanying-workbench-<version>-windows-x64.exe.sha256`
- `release/windows/huanying-workbench-<version>-windows-x64.manifest.json`

- [ ] **Step 4: Commit**

```powershell
git add tools/build_windows_onefile.py
git commit -m "feat: build windows onefile exe"
```

## Task 7: Onefile Smoke Test Script

**Files:**
- Create: `tools/smoke_windows_onefile.ps1`

- [ ] **Step 1: Create smoke test**

Create `tools/smoke_windows_onefile.ps1`:

```powershell
param(
  [Parameter(Mandatory = $true)]
  [string]$ExePath,
  [int]$Port = 18777
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ExePath)) {
  throw "Exe not found: $ExePath"
}

$env:AICANVAS_PORT = [string]$Port
$env:AIC_BIND_HOST = "127.0.0.1"
$runtimeUrl = "http://127.0.0.1:$Port/api/v2/runtime/info"
$indexUrl = "http://127.0.0.1:$Port/"

$process = Start-Process -FilePath $ExePath -PassThru -WindowStyle Hidden
try {
  $runtime = $null
  for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 1
    try {
      $runtime = Invoke-RestMethod -Uri $runtimeUrl -TimeoutSec 2
      break
    } catch {
      if ($process.HasExited) {
        throw "Exe exited before server became ready. ExitCode=$($process.ExitCode)"
      }
    }
  }

  if ($null -eq $runtime) {
    throw "Runtime endpoint did not become ready: $runtimeUrl"
  }
  if (-not $runtime.success) {
    throw "Runtime endpoint returned success=false"
  }
  if ($runtime.distribution -ne "onefile") {
    throw "Expected distribution=onefile, got $($runtime.distribution)"
  }
  if (-not $runtime.storage.userDir) {
    throw "Runtime storage.userDir missing"
  }

  $index = Invoke-WebRequest -Uri $indexUrl -TimeoutSec 5
  if ($index.StatusCode -lt 200 -or $index.StatusCode -ge 300) {
    throw "Index returned status $($index.StatusCode)"
  }

  Write-Host "onefile smoke passed"
  Write-Host "distribution=$($runtime.distribution)"
  Write-Host "userDir=$($runtime.storage.userDir)"
  Write-Host "outputDir=$($runtime.storage.outputDir)"
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force
  }
}
```

- [ ] **Step 2: Run smoke locally after build**

Run:

```powershell
$exe = Get-ChildItem release\windows\huanying-workbench-*-windows-x64.exe | Select-Object -First 1
powershell -ExecutionPolicy Bypass -File tools\smoke_windows_onefile.ps1 -ExePath $exe.FullName
```

Expected:

```text
onefile smoke passed
distribution=onefile
userDir=...
outputDir=...
```

- [ ] **Step 3: Commit**

```powershell
git add tools/smoke_windows_onefile.ps1
git commit -m "test: add onefile exe smoke test"
```

## Task 8: GitHub Actions Workflow

**Files:**
- Add: `.github/workflows/build-windows-onefile.yml`

- [ ] **Step 1: Replace workflow with onefile artifact and release publishing**

Use this workflow:

```yaml
name: Build Windows EXE

on:
  workflow_dispatch:
  push:
    branches:
      - main
      - feat/huanying-local-release-20260430
    tags:
      - "v*"

permissions:
  contents: write

jobs:
  build-windows-onefile:
    runs-on: windows-latest
    timeout-minutes: 90

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: "pip"

      - name: Install Python dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
          pip install pyinstaller

      - name: Python syntax check
        run: |
          python -m py_compile server.py
          python -m py_compile services\runtime_paths.py
          python -m py_compile services\http_route_dispatcher.py
          python -m py_compile services\library_file_route_service.py
          python -m py_compile packaging\windows_onefile_launcher.py
          python -m py_compile tools\build_windows_onefile.py

      - name: Python unit tests
        run: |
          python -m unittest server_runtime_paths_test.py library_file_route_service_test.py http_route_dispatcher_test.py

      - name: Build Windows onefile exe
        run: python tools/build_windows_onefile.py

      - name: Smoke test onefile exe
        shell: pwsh
        run: |
          $exe = Get-ChildItem release\windows\huanying-workbench-*-windows-x64-onefile.exe | Select-Object -First 1
          powershell -ExecutionPolicy Bypass -File tools\smoke_windows_onefile.ps1 -ExePath $exe.FullName

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: huanying-workbench-windows-onefile
          path: |
            release/windows/*onefile.exe
            release/windows/*onefile.exe.sha256
            release/windows/*onefile.manifest.json
          if-no-files-found: error

      - name: Publish GitHub Release assets
        if: startsWith(github.ref, 'refs/tags/')
        uses: softprops/action-gh-release@v2
        with:
          files: |
            release/windows/*onefile.exe
            release/windows/*onefile.exe.sha256
            release/windows/*onefile.manifest.json
```

- [ ] **Step 2: Run local YAML sanity check**

Run:

```powershell
Get-Content .github\workflows\build-windows-onefile.yml -Raw
```

Expected: YAML contains `--onefile` build script indirectly through `python tools/build_windows_onefile.py`, uploads `.exe`, and releases only on `refs/tags/`.

- [ ] **Step 3: Commit**

```powershell
git add .github/workflows/build-windows-exe.yml
git commit -m "ci: build and publish windows onefile exe"
```

## Task 9: Release Privacy Guard

**Files:**
- Modify: `tools/build_windows_onefile.py`
- Test: local build manifest inspection

- [ ] **Step 1: Verify denied inputs remain excluded**

Add this function to `tools/build_windows_onefile.py`:

```python
def audit_manifest_inputs(manifest_path: Path) -> None:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    denied = set(manifest.get("deniedInputs") or [])
    runtime_dirs = set(manifest.get("runtimeDirs") or [])
    runtime_files = set(manifest.get("runtimeFiles") or [])
    included_roots = {item.split("/", 1)[0].split("\\", 1)[0] for item in runtime_dirs | runtime_files}
    leaked = sorted(included_roots & denied)
    if leaked:
        raise RuntimeError(f"Release manifest includes denied roots: {leaked}")
```

Call it after `write_manifest(...)`:

```python
manifest_path = write_manifest(final_exe, version, digest)
audit_manifest_inputs(manifest_path)
```

- [ ] **Step 2: Build and inspect manifest**

Run:

```powershell
python tools\build_windows_onefile.py
Get-Content release\windows\*.manifest.json
```

Expected:

- no `user`
- no `output`
- no `release`
- no `venv`
- no `node_modules`
- includes `config` only as bundled seed/static config, not user config.

- [ ] **Step 3: Commit**

```powershell
git add tools/build_windows_onefile.py
git commit -m "chore: audit onefile release inputs"
```

## Task 10: End-To-End Validation Matrix

**Files:**
- No production file changes
- Validation commands only

- [ ] **Step 1: Run focused Python tests**

```powershell
python -m unittest server_runtime_paths_test.py library_file_route_service_test.py http_route_dispatcher_test.py
```

Expected: pass.

- [ ] **Step 2: Run focused JS tests that protect generation fields**

```powershell
node --test components\aigenImage\modelRegistryRuntime.batchSize.test.js components\aigenImage\taskOrchestrationModule.batch.test.js components\aigenImage\taskOrchestrationModule.registry.test.js
```

Expected: pass. These tests protect `batchSize`, registry model fields, and task result writeback from packaging-side regressions.

- [ ] **Step 3: Build onefile**

```powershell
python tools\build_windows_onefile.py
```

Expected: exe, sha256, and manifest exist under `release/windows/`.

- [ ] **Step 4: Smoke onefile runtime**

```powershell
$exe = Get-ChildItem release\windows\huanying-workbench-*-windows-x64.exe | Select-Object -First 1
powershell -ExecutionPolicy Bypass -File tools\smoke_windows_onefile.ps1 -ExePath $exe.FullName
```

Expected: runtime info reports `distribution=onefile`; `/` returns HTTP 200.

- [ ] **Step 5: Verify writable data behavior manually**

With the exe running:

```powershell
$runtime = Invoke-RestMethod http://127.0.0.1:18777/api/v2/runtime/info
$runtime.storage
```

Expected:

- `resourceRoot` points to a PyInstaller temporary extraction directory.
- `writableRoot`, `userDir`, `outputDir`, and `uploadsDir` point to a stable writable directory.
- Saving settings keeps `fileSavePaths.userDir`, `fileSavePaths.outputDir`, and `fileSavePaths.tempDir`.
- Creating a custom prompt preset writes a `.txt` file under `userDir/prompt/<nodeType>/`.
- Generated images still return `localPath` beginning with `output/` and load through `/output/...`.

- [ ] **Step 6: Trigger GitHub artifact build**

Push the branch or run `workflow_dispatch`.

Expected:

- Actions artifact `huanying-workbench-windows-onefile` contains `.exe`, `.sha256`, and `.manifest.json`.

- [ ] **Step 7: Trigger GitHub Release build**

```powershell
git tag v0.1.0-onefile
git push origin v0.1.0-onefile
```

Expected:

- A GitHub Release named `v0.1.0-onefile` exists.
- Release assets include `.exe`, `.sha256`, and `.manifest.json`.

## Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| PyInstaller onefile startup is slow because it extracts bundled Python and ML packages | Users wait longer before browser opens | Launcher opens browser only after HTTP readiness; keep console visible for MVP diagnostics |
| Antivirus flags unsigned onefile exe | Download/run friction | Add sha256 asset now; plan code signing as a later distribution-hardening task |
| Bundled resources are read from temp extraction directory | User edits disappear if written there | Split `resourceRoot` and `writableRoot`; write config, projects, prompts, uploads, assets, workflows, output to writable root |
| Existing zip portable users have data next to exe | Data appears missing after switching to onefile | First onefile launch migrates adjacent `user/`, `output/`, and `data/uploads/` if system settings are absent |
| Prompt preset definitions were previously under `config/prompt-presets.json` | Saving definitions into bundled config will not persist | Treat bundled config as seed; save editable definitions to `userDir/prompt-presets.json` |
| `data/assets` and `data/workflows` move to writable root | Thumbnail URLs could 404 | Map `/data/assets/` and `/data/workflows/` virtual roots in `Handler.translate_path` |
| Full `npm test` can timeout in this repo | CI could block unrelated release work | Run focused JS tests for generation fields; keep full test timeout as separate cleanup task |

## Acceptance Criteria

- `python tools/build_windows_onefile.py` produces exactly one distributable `.exe` plus checksum/manifest files.
- Generated exe starts the existing app at `http://127.0.0.1:<port>/` and opens the browser.
- `/api/v2/runtime/info` preserves current fields and reports `distribution=onefile` in packaged builds.
- Static frontend resources load from the bundled resource root.
- `user/config.json`, `user/settings.json`, prompt TXT presets, projects, uploads, assets, workflows, and outputs are written to stable writable storage.
- Existing API response fields and frontend request fields remain compatible.
- `localPath` values beginning with `output/`, `data/uploads/`, `data/assets/`, and `data/workflows/` are still serveable.
- GitHub Actions uploads the exe as a workflow artifact.
- Pushing a `v*` tag creates or updates a GitHub Release with exe, sha256, and manifest assets.

## Execution Notes

- Keep the existing zip/onedir build script available until the onefile release has passed smoke testing on a clean Windows machine.
- Do not add code signing in this task; it requires certificate material and secret handling.
- Do not bundle `user/`, `output/`, `release/`, `venv/`, `node_modules/`, `server-run*.log`, `.env*`, or API key files.
- Do not change generation model payload contracts while implementing packaging.
