import os
import shutil
import subprocess
import sys
import glob
import json


class SeedanceBrowserLauncher:
    DEFAULT_LOGIN_URL = "https://dreamina.capcut.com/"

    def __init__(
        self,
        *,
        resource_root,
        writable_root,
        browser_path="",
        login_url="",
        popen_factory=None,
    ):
        self.resource_root = os.path.abspath(resource_root)
        self.writable_root = os.path.abspath(writable_root)
        self.browser_path = str(browser_path or "").strip()
        self.login_url = str(login_url or "").strip() or self.DEFAULT_LOGIN_URL
        self._popen_factory = popen_factory or subprocess.Popen

    @property
    def extension_dir(self):
        return os.path.join(
            self.resource_root,
            "integrations",
            "seedance_extension_bridge",
            "extension",
        )

    @property
    def profile_dir(self):
        return os.path.join(
            self.writable_root,
            "user_data",
            "seedance_web",
            "profile",
        )

    @property
    def _extension_version_marker_path(self):
        return os.path.join(self.profile_dir, ".seedance_extension_version")

    def _read_extension_version(self):
        manifest_path = os.path.join(self.extension_dir, "manifest.json")
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return str(data.get("version") or "").strip()
        except Exception:
            return ""

    def _clear_extension_runtime_cache_if_needed(self):
        version = self._read_extension_version()
        if not version:
            return
        try:
            with open(self._extension_version_marker_path, "r", encoding="utf-8") as f:
                previous_version = f.read().strip()
        except Exception:
            previous_version = ""
        if previous_version == version:
            return

        default_dir = os.path.abspath(os.path.join(self.profile_dir, "Default"))
        cache_paths = [
            os.path.join(default_dir, "Extension State"),
            os.path.join(default_dir, "Extension Scripts"),
            os.path.join(default_dir, "Extension Rules"),
            os.path.join(default_dir, "Local Extension Settings"),
            os.path.join(default_dir, "Service Worker", "ScriptCache"),
            os.path.join(default_dir, "Service Worker", "Database"),
            os.path.join(default_dir, "Service Worker", "CacheStorage"),
        ]
        for path in cache_paths:
            target = os.path.abspath(path)
            if not target.startswith(default_dir + os.sep):
                continue
            if os.path.isdir(target):
                shutil.rmtree(target, ignore_errors=True)
            elif os.path.exists(target):
                try:
                    os.remove(target)
                except OSError:
                    pass

        try:
            with open(self._extension_version_marker_path, "w", encoding="utf-8") as f:
                f.write(version)
        except Exception:
            pass

    def _candidate_browser_paths(self):
        if self.browser_path:
            yield self.browser_path
        env_browser_path = os.environ.get("AIC_SEEDANCE_WEB_BROWSER_PATH", "").strip()
        if env_browser_path:
            yield env_browser_path
        if sys.platform.startswith("win"):
            local_app_data = os.environ.get("LOCALAPPDATA", "")
            if local_app_data:
                pattern = os.path.join(
                    local_app_data,
                    "ms-playwright",
                    "chromium-*",
                    "chrome-win64",
                    "chrome.exe",
                )
                for candidate in sorted(glob.glob(pattern), reverse=True):
                    yield candidate
            program_files = (
                os.environ.get("PROGRAMFILES", ""),
                os.environ.get("PROGRAMFILES(X86)", ""),
                os.environ.get("LOCALAPPDATA", ""),
            )
            for root in program_files:
                if not root:
                    continue
                yield os.path.join(root, "Google", "Chrome for Testing", "Application", "chrome.exe")
                yield os.path.join(root, "Google", "Chrome", "Application", "chrome.exe")
                yield os.path.join(root, "Microsoft", "Edge", "Application", "msedge.exe")
        for name in ("chrome", "google-chrome", "chromium", "chromium-browser", "msedge"):
            found = shutil.which(name)
            if found:
                yield found

    def resolve_browser_path(self):
        for candidate in self._candidate_browser_paths():
            if candidate and os.path.exists(candidate):
                return os.path.abspath(candidate)
        return ""

    def get_runtime_info(self):
        browser_path = self.resolve_browser_path()
        return {
            "extensionDir": self.extension_dir,
            "extensionAvailable": os.path.isdir(self.extension_dir),
            "profileDir": self.profile_dir,
            "browserPath": browser_path,
            "browserAvailable": bool(browser_path),
            "loginUrl": self.login_url,
        }

    def launch_login(self, *, force=False):
        browser_path = self.resolve_browser_path()
        if not browser_path:
            raise RuntimeError("未找到 Chrome/Edge 浏览器，请先安装 Chrome 或 Edge")
        if not os.path.isdir(self.extension_dir):
            raise RuntimeError("未找到内置 Seedance 扩展目录")
        os.makedirs(self.profile_dir, exist_ok=True)
        self._clear_extension_runtime_cache_if_needed()
        args = [
            browser_path,
            f"--user-data-dir={self.profile_dir}",
            f"--disable-extensions-except={self.extension_dir}",
            f"--load-extension={self.extension_dir}",
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
            "--disable-backgrounding-occluded-windows",
            "--disable-features=DisableLoadExtensionCommandLineSwitch,CalculateNativeWinOcclusion",
            "--new-window",
            "--no-first-run",
            "--no-default-browser-check",
            self.login_url,
        ]
        api_base = os.environ.get("AIC_SEEDANCE_WEB_API_BASE", "").strip() or "http://127.0.0.1:8777"
        self._popen_factory(args)
        return {
            "active": True,
            "phase": "browser_started",
            "force": bool(force),
            "url": self.login_url,
            "profileDir": self.profile_dir,
            "extensionDir": self.extension_dir,
            "apiBaseUrl": api_base,
        }
