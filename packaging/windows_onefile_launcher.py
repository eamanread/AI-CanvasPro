from __future__ import annotations

import os
import runpy
import subprocess
import sys
import threading
import time
import traceback
import urllib.request
import webbrowser


TRUE_VALUES = {"1", "true", "yes", "on"}


def _log_path() -> str:
    root = os.environ.get("LOCALAPPDATA") or os.environ.get("TEMP") or os.getcwd()
    return os.path.join(root, "AI-CanvasPro", "launcher.log")


def _log(message: str) -> None:
    try:
        path = _log_path()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        with open(path, "a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] {message}\n")
    except Exception:
        pass


def _redirect_stdio_to_log() -> None:
    try:
        path = _log_path()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        stream = open(path, "a", encoding="utf-8", buffering=1)
        sys.stdout = stream
        sys.stderr = stream
    except Exception:
        try:
            devnull = open(os.devnull, "w", encoding="utf-8")
            sys.stdout = devnull
            sys.stderr = devnull
        except Exception:
            pass


def _env_enabled(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in TRUE_VALUES


def _browser_candidates() -> list[str]:
    env_names = ("ProgramFiles", "ProgramFiles(x86)", "LocalAppData")
    roots = [os.environ.get(name, "") for name in env_names]
    candidates = []
    for root in roots:
        if not root:
            continue
        candidates.extend(
            [
                os.path.join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
                os.path.join(root, "Google", "Chrome", "Application", "chrome.exe"),
            ]
        )
    return candidates


def _open_preferred_browser(url: str) -> bool:
    for browser_path in _browser_candidates():
        if not os.path.isfile(browser_path):
            continue
        try:
            subprocess.Popen(
                [browser_path, url],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                close_fds=True,
            )
            return True
        except Exception:
            continue
    try:
        return bool(webbrowser.open(url))
    except Exception:
        return False


def _wait_and_open_browser() -> None:
    if not _env_enabled("AIC_OPEN_BROWSER", True):
        return

    port = str(os.environ.get("AICANVAS_PORT", "8777") or "8777").strip() or "8777"
    url = f"http://127.0.0.1:{port}/"
    for _ in range(80):
        try:
            with urllib.request.urlopen(url, timeout=0.5) as response:
                if 200 <= int(response.status) < 500:
                    _open_preferred_browser(url)
                    return
        except Exception:
            time.sleep(0.25)


def main() -> int:
    os.environ.setdefault("AIC_PACKAGED_LAUNCHER", "1")
    os.environ.setdefault("AIC_DISTRIBUTION", "onefile")
    os.environ.setdefault("AIC_BIND_HOST", "127.0.0.1")
    _log(
        "launcher start "
        f"python={sys.version.split()[0]} "
        f"cwd={os.getcwd()} "
        f"meipass={getattr(sys, '_MEIPASS', '')} "
        f"port={os.environ.get('AICANVAS_PORT', '8777')}"
    )
    _redirect_stdio_to_log()

    browser_thread = threading.Thread(target=_wait_and_open_browser, daemon=True)
    browser_thread.start()
    _log("starting server module")
    try:
        runpy.run_module("server", run_name="__main__")
    except Exception:
        _log("server module crashed")
        _log(traceback.format_exc())
        raise
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
