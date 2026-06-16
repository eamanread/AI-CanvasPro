from __future__ import annotations

import os
import re
import json
import hashlib
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP_SLUG = "huanying-workbench"
EXE_NAME = f"{APP_SLUG}-onefile"
RELEASE_DIR = ROOT / "release" / "windows"
PYINSTALLER_DIR = ROOT / "release" / ".pyinstaller-onefile"
ENTRYPOINT = ROOT / "packaging" / "windows_onefile_launcher.py"

RUNTIME_FILES = (
    "index.html",
    "main.js",
    "style.css",
)

RUNTIME_DIRS = (
    "api",
    "assets",
    "components",
    "config",
    "dev",
    "hooks",
    "images",
    "integrations",
    "modules",
    "services",
    "src",
    "styles",
    "ui",
    "vendor",
)

OPTIONAL_RUNTIME_PATHS = (
    ".Advanced",
)

DENIED_RUNTIME_PATHS = (
    "data",
    "output",
    "user",
    "user_data",
    "release",
    ".git",
    "venv",
    "node_modules",
)

PRIVATE_DEFAULTS_DIR = ROOT / "release" / ".private-defaults"
PRIVATE_DEFAULT_FILE_PATHS = (
    "user/config.json",
    "user/prompt-presets.json",
)
PRIVATE_DEFAULT_DIR_PATHS = (
    "user/prompt",
    "user/tools",
    "data/assets",
    "data/workflows",
)
PRIVATE_DEFAULT_DENIED_NAMES = {
    ".git",
    "node_modules",
    "release",
    "venv",
    "user_data",
}
PRIVATE_DEFAULT_DENIED_FILES = {
    "settings.json",
}

PYINSTALLER_COLLECT_PACKAGES = (
    "PIL",
    "cv2",
    "numpy",
    "onnxruntime",
    "requests",
    "scenedetect",
    "tokenizers",
    "transformers",
)

PI_CANVAS_AGENT_SIDECAR = {
    "node": "vendor/node/windows-x64/node.exe",
    "nodeLicense": "vendor/node/windows-x64/LICENSE.node.txt",
    "runner": "integrations/pi_canvas_agent/dist/runner.js",
    "manifest": "integrations/pi_canvas_agent/packaging/sidecar-manifest.json",
    "launcher": "integrations/pi_canvas_agent/packaging/start-pi-canvas-agent.bat",
    "requiresGlobalNode": False,
    "requiresGlobalPi": False,
    "requiresDevDependencies": False,
}


def run(cmd: list[str]) -> None:
    print("+", " ".join(str(part) for part in cmd))
    subprocess.run(cmd, cwd=ROOT, check=True)


def pyinstaller_collect_args() -> list[str]:
    args: list[str] = []
    for package_name in PYINSTALLER_COLLECT_PACKAGES:
        args.extend(["--collect-all", package_name])
    return args


def ensure_clean_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def copy_path(src: Path, dst: Path) -> None:
    if src.is_dir():
        shutil.copytree(
            src,
            dst,
            dirs_exist_ok=True,
            ignore=shutil.ignore_patterns(*PRIVATE_DEFAULT_DENIED_NAMES, *PRIVATE_DEFAULT_DENIED_FILES),
        )
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def read_version() -> str:
    content = (ROOT / "index.html").read_text(encoding="utf-8")
    match = re.search(r'<meta name="app-version" content="([^"]+)"', content)
    version = (match.group(1) if match else "V0.0.0").strip()
    normalized = re.sub(r"[^A-Za-z0-9._-]+", "-", version).strip("-")
    return normalized or "V0.0.0"


def _read_version_from_root(source_root: Path) -> str:
    index_path = source_root / "index.html"
    if not index_path.is_file():
        return "test"
    content = index_path.read_text(encoding="utf-8")
    match = re.search(r'<meta name="app-version" content="([^"]+)"', content)
    version = (match.group(1) if match else "V0.0.0").strip()
    normalized = re.sub(r"[^A-Za-z0-9._-]+", "-", version).strip("-")
    return normalized or "V0.0.0"


def _is_safe_relative_output_path(value: str) -> str:
    raw = str(value or "").strip().replace("\\", "/")
    if not raw:
        return ""
    if raw.startswith("/"):
        raw = raw.lstrip("/")
    if raw.startswith("./"):
        raw = raw[2:]
    if not raw.startswith("output/"):
        return ""
    path = Path(raw)
    if path.is_absolute() or ".." in path.parts:
        return ""
    return path.as_posix()


def _collect_output_refs(value) -> set[str]:
    refs: set[str] = set()
    if isinstance(value, dict):
        for child in value.values():
            refs.update(_collect_output_refs(child))
        return refs
    if isinstance(value, list):
        for child in value:
            refs.update(_collect_output_refs(child))
        return refs
    if isinstance(value, str):
        for match in re.findall(r"(?:^|[\"'(\s])(/?output/[^\s\"')<>]+)", value):
            ref = _is_safe_relative_output_path(match)
            if ref:
                refs.add(ref)
    return refs


def _copy_referenced_outputs(source_root: Path, staging_root: Path) -> int:
    refs: set[str] = set()
    for rel_dir in ("data/assets", "data/workflows"):
        root = source_root / rel_dir
        if not root.is_dir():
            continue
        for path in root.rglob("*.json"):
            try:
                refs.update(_collect_output_refs(json.loads(path.read_text(encoding="utf-8-sig"))))
            except Exception:
                refs.update(_collect_output_refs(path.read_text(encoding="utf-8", errors="ignore")))

    copied = 0
    for rel_path in sorted(refs):
        src = source_root / rel_path
        if src.is_file():
            copy_path(src, staging_root / rel_path)
            copied += 1
    return copied


def prepare_private_defaults(
    *,
    source_root: Path = ROOT,
    staging_root: Path = PRIVATE_DEFAULTS_DIR,
) -> Path:
    source_root = Path(source_root)
    staging_root = Path(staging_root)
    ensure_clean_dir(staging_root)

    copied_paths: list[str] = []
    for rel_path in PRIVATE_DEFAULT_FILE_PATHS:
        src = source_root / rel_path
        if src.is_file() and src.name not in PRIVATE_DEFAULT_DENIED_FILES:
            copy_path(src, staging_root / rel_path)
            copied_paths.append(rel_path)

    for rel_path in PRIVATE_DEFAULT_DIR_PATHS:
        src = source_root / rel_path
        if src.is_dir():
            copy_path(src, staging_root / rel_path)
            copied_paths.append(rel_path)

    referenced_outputs = _copy_referenced_outputs(source_root, staging_root)
    manifest = {
        "kind": "private-defaults",
        "version": _read_version_from_root(source_root),
        "sourcePaths": copied_paths,
        "referencedOutputFiles": referenced_outputs,
        "excluded": sorted(PRIVATE_DEFAULT_DENIED_NAMES | PRIVATE_DEFAULT_DENIED_FILES),
        "generatedUtc": datetime.now(timezone.utc).isoformat(),
    }
    (staging_root / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return staging_root


def validate_runtime_sources() -> None:
    if not ENTRYPOINT.exists():
        raise FileNotFoundError(f"entrypoint not found: {ENTRYPOINT}")
    for rel_path in RUNTIME_FILES:
        path = ROOT / rel_path
        if not path.is_file():
            raise FileNotFoundError(f"required runtime file not found: {path}")
    for rel_path in DENIED_RUNTIME_PATHS:
        if rel_path in RUNTIME_DIRS or rel_path in RUNTIME_FILES:
            raise ValueError(f"writable or generated path must not be bundled: {rel_path}")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_release_manifest(
    *,
    exe_name: str,
    version: str,
    digest: str,
    size_bytes: int,
    build_utc: str,
) -> dict:
    return {
        "app": APP_SLUG,
        "version": version,
        "distribution": "windows-onefile",
        "platform": "windows-x64",
        "artifact": exe_name,
        "sha256": digest,
        "sizeBytes": size_bytes,
        "buildUtc": build_utc,
        "runtimeFiles": list(RUNTIME_FILES),
        "runtimeDirs": [item for item in RUNTIME_DIRS if (ROOT / item).exists()],
        "optionalRuntimePaths": [
            item for item in OPTIONAL_RUNTIME_PATHS if (ROOT / item).exists()
        ],
        "privateDefaults": {
            "bundled": True,
            "pathInBundle": "private_defaults",
        },
        "deniedInputs": list(DENIED_RUNTIME_PATHS),
        "runtime": {
            "entrypoint": "packaging/windows_onefile_launcher.py",
            "writableRoot": "%LOCALAPPDATA%\\AI-CanvasPro",
            "url": "http://127.0.0.1:8777/",
        },
        "piCanvasAgentSidecar": dict(PI_CANVAS_AGENT_SIDECAR),
    }


def write_release_metadata(exe_path: Path, *, version: str) -> tuple[Path, Path]:
    digest = sha256_file(exe_path)
    sha_path = exe_path.with_suffix(exe_path.suffix + ".sha256")
    manifest_path = exe_path.with_suffix(".manifest.json")
    build_utc = datetime.now(timezone.utc).isoformat()
    sha_path.write_text(f"{digest}  {exe_path.name}\n", encoding="utf-8")
    manifest_path.write_text(
        json.dumps(
            build_release_manifest(
                exe_name=exe_path.name,
                version=version,
                digest=digest,
                size_bytes=exe_path.stat().st_size,
                build_utc=build_utc,
            ),
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return sha_path, manifest_path


def add_data_args(
    *,
    source_root: Path = ROOT,
    private_defaults_root: Path | None = None,
) -> list[str]:
    args: list[str] = []
    for rel_path in RUNTIME_FILES:
        src = source_root / rel_path
        dest = Path(rel_path).parent
        dest_text = "." if str(dest) == "." else str(dest).replace("\\", "/")
        if src.exists():
            args.extend(["--add-data", f"{src}{os.pathsep}{dest_text}"])

    for rel_path in RUNTIME_DIRS:
        src = source_root / rel_path
        if src.exists():
            args.extend(["--add-data", f"{src}{os.pathsep}{rel_path}"])

    for rel_path in OPTIONAL_RUNTIME_PATHS:
        src = source_root / rel_path
        if src.exists():
            dest = "." if src.is_file() else rel_path
            args.extend(["--add-data", f"{src}{os.pathsep}{dest}"])

    if private_defaults_root is not None and Path(private_defaults_root).is_dir():
        args.extend(["--add-data", f"{private_defaults_root}{os.pathsep}private_defaults"])

    return args


def build_onefile() -> Path:
    validate_runtime_sources()
    version = read_version()
    ensure_clean_dir(RELEASE_DIR)
    ensure_clean_dir(PYINSTALLER_DIR)
    private_defaults_root = prepare_private_defaults()

    run(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--clean",
            "--onefile",
            "--name",
            EXE_NAME,
            "--distpath",
            str(RELEASE_DIR),
            "--workpath",
            str(PYINSTALLER_DIR / "build"),
            "--specpath",
            str(PYINSTALLER_DIR / "spec"),
            "--hidden-import",
            "server",
            *pyinstaller_collect_args(),
            *add_data_args(private_defaults_root=private_defaults_root),
            str(ENTRYPOINT),
        ]
    )

    built_exe = RELEASE_DIR / f"{EXE_NAME}.exe"
    if not built_exe.exists():
        raise FileNotFoundError(f"onefile exe not found: {built_exe}")

    versioned_exe = RELEASE_DIR / f"{APP_SLUG}-{version}-windows-x64-onefile.exe"
    if versioned_exe.exists():
        versioned_exe.unlink()
    built_exe.replace(versioned_exe)
    write_release_metadata(versioned_exe, version=version)
    return versioned_exe


def main() -> int:
    exe_path = build_onefile()
    print(f"exe_path={exe_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
