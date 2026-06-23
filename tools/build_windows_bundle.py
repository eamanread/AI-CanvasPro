from __future__ import annotations

import re
import shutil
import subprocess
import sys
import zipfile
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_SLUG = "huanying-workbench"
RELEASE_DIR = ROOT / "release" / "windows"
PYINSTALLER_DIR = ROOT / "release" / ".pyinstaller"

RUNTIME_FILES = (
    "index.html",
    "main.js",
    "style.css",
    "README.md",
)

RUNTIME_DIRS = (
    "api",
    "assets",
    "components",
    "config",
    "dev",
    "docs",
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


def run(cmd: list[str]) -> None:
    print("+", " ".join(cmd))
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
    index_path = ROOT / "index.html"
    content = index_path.read_text(encoding="utf-8")
    match = re.search(r'<meta name="app-version" content="([^"]+)"', content)
    version = (match.group(1) if match else "V0.0.0").strip()
    normalized = re.sub(r"[^A-Za-z0-9._-]+", "-", version).strip("-")
    return normalized or "V0.0.0"


def make_zip(src_dir: Path, zip_path: Path) -> None:
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(src_dir.rglob("*")):
            archive.write(path, path.relative_to(src_dir.parent))


def create_runtime_dirs(bundle_dir: Path) -> None:
    (bundle_dir / "data" / "assets").mkdir(parents=True, exist_ok=True)
    (bundle_dir / "data" / "uploads").mkdir(parents=True, exist_ok=True)
    (bundle_dir / "data" / "workflows").mkdir(parents=True, exist_ok=True)
    (bundle_dir / "output").mkdir(parents=True, exist_ok=True)
    (bundle_dir / "user" / "Canvas Project").mkdir(parents=True, exist_ok=True)
    (bundle_dir / "user" / "prompt" / "ai-audio").mkdir(parents=True, exist_ok=True)
    (bundle_dir / "user" / "prompt" / "ai-image").mkdir(parents=True, exist_ok=True)
    (bundle_dir / "user" / "prompt" / "ai-text").mkdir(parents=True, exist_ok=True)
    (bundle_dir / "user" / "prompt" / "ai-video").mkdir(parents=True, exist_ok=True)


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


def copy_referenced_outputs(bundle_dir: Path) -> int:
    refs: set[str] = set()
    for rel_dir in ("data/assets", "data/workflows"):
        root = ROOT / rel_dir
        if not root.is_dir():
            continue
        for path in root.rglob("*.json"):
            try:
                refs.update(_collect_output_refs(json.loads(path.read_text(encoding="utf-8-sig"))))
            except Exception:
                refs.update(_collect_output_refs(path.read_text(encoding="utf-8", errors="ignore")))

    copied = 0
    for rel_path in sorted(refs):
        src = ROOT / rel_path
        if src.is_file():
            copy_path(src, bundle_dir / rel_path)
            copied += 1
    return copied


def copy_private_defaults(bundle_dir: Path, version: str) -> None:
    copied_paths: list[str] = []
    for rel_path in PRIVATE_DEFAULT_FILE_PATHS:
        src = ROOT / rel_path
        if src.is_file() and src.name not in PRIVATE_DEFAULT_DENIED_FILES:
            copy_path(src, bundle_dir / rel_path)
            copied_paths.append(rel_path)

    for rel_path in PRIVATE_DEFAULT_DIR_PATHS:
        src = ROOT / rel_path
        if src.is_dir():
            copy_path(src, bundle_dir / rel_path)
            copied_paths.append(rel_path)

    referenced_outputs = copy_referenced_outputs(bundle_dir)
    manifest_path = bundle_dir / "private_defaults_manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "kind": "private-defaults",
                "version": version,
                "sourcePaths": copied_paths,
                "referencedOutputFiles": referenced_outputs,
                "excluded": sorted(PRIVATE_DEFAULT_DENIED_NAMES | PRIVATE_DEFAULT_DENIED_FILES),
                "generatedUtc": datetime.now(timezone.utc).isoformat(),
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def write_launcher(bundle_dir: Path) -> None:
    launcher = bundle_dir / "start-huanying.bat"
    launcher.write_text(
        "@echo off\r\n"
        "setlocal\r\n"
        "cd /d \"%~dp0\"\r\n"
        "set \"AIC_OPEN_BROWSER=0\"\r\n"
        "start \"\" /min powershell -NoProfile -ExecutionPolicy Bypass -Command \"Start-Sleep -Seconds 150; Start-Process 'http://127.0.0.1:8777/'\"\r\n"
        "huanying-workbench.exe\r\n",
        encoding="utf-8",
    )


def write_build_info(bundle_dir: Path, version: str) -> None:
    info_path = bundle_dir / "BUILD_INFO.txt"
    info_path.write_text(
        "\n".join(
            (
                f"app={APP_SLUG}",
                f"version={version}",
                f"python={sys.version.split()[0]}",
                "entry=huanying-workbench.exe",
                "launcher=start-huanying.bat",
                "url=http://127.0.0.1:8777/",
            )
        )
        + "\n",
        encoding="utf-8",
    )


def build_bundle() -> tuple[Path, Path]:
    version = read_version()
    ensure_clean_dir(RELEASE_DIR)
    ensure_clean_dir(PYINSTALLER_DIR)

    run(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--clean",
            "--onedir",
            "--name",
            APP_SLUG,
            "--distpath",
            str(RELEASE_DIR),
            "--workpath",
            str(PYINSTALLER_DIR / "build"),
            "--specpath",
            str(PYINSTALLER_DIR / "spec"),
            *pyinstaller_collect_args(),
            "server.py",
        ]
    )

    bundle_dir = RELEASE_DIR / APP_SLUG
    if not bundle_dir.exists():
        raise FileNotFoundError(f"bundle dir not found: {bundle_dir}")

    for rel_path in RUNTIME_FILES:
        src = ROOT / rel_path
        if src.exists():
            copy_path(src, bundle_dir / rel_path)

    for rel_path in RUNTIME_DIRS:
        src = ROOT / rel_path
        if src.exists():
            copy_path(src, bundle_dir / rel_path)

    for rel_path in OPTIONAL_RUNTIME_PATHS:
        src = ROOT / rel_path
        if src.exists():
            copy_path(src, bundle_dir / rel_path)

    create_runtime_dirs(bundle_dir)
    copy_private_defaults(bundle_dir, version)
    write_launcher(bundle_dir)
    write_build_info(bundle_dir, version)

    zip_path = RELEASE_DIR / f"{APP_SLUG}-{version}-windows-x64.zip"
    make_zip(bundle_dir, zip_path)
    return bundle_dir, zip_path


def main() -> int:
    bundle_dir, zip_path = build_bundle()
    print(f"bundle_dir={bundle_dir}")
    print(f"zip_path={zip_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
