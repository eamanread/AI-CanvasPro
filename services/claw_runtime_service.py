import os
import subprocess


LOCAL_PROXY_TOKEN = "aic-local-assistant-token"


class ClawRuntimeService:
    def __init__(self, *, runtime_path=None, work_dir=None, popen_factory=None):
        self._runtime_path = runtime_path
        self._work_dir = work_dir or os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "user_data", "claw_assistant")
        )
        self._popen = popen_factory or subprocess.Popen
        self._process = None

    def resolve_runtime_path(self):
        if self._runtime_path and os.path.exists(self._runtime_path):
            return os.path.abspath(self._runtime_path)
        root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        for name in ("claw.exe", "claw-code.exe", "claw", "claw-code"):
            candidate = os.path.join(root, "integrations", "claw_code", "runtime", name)
            if os.path.exists(candidate):
                return candidate
        return ""

    def build_launch_spec(self):
        os.makedirs(self._work_dir, exist_ok=True)
        runtime_path = self.resolve_runtime_path() or "claw"
        env = {
            key: os.environ[key]
            for key in ("PATH", "SystemRoot", "TEMP", "TMP", "ComSpec")
            if key in os.environ
        }
        env.update(
            {
                "OPENAI_BASE_URL": "http://127.0.0.1:8777/api/v2/assistant/provider-proxy/v1",
                "OPENAI_API_KEY": LOCAL_PROXY_TOKEN,
                "CLAW_CODE_HOME": self._work_dir,
            }
        )
        return {
            "command": [runtime_path, "--output-format", "json", "prompt"],
            "cwd": self._work_dir,
            "env": env,
            "runtimePath": runtime_path,
            "workDir": self._work_dir,
        }

    def status(self):
        runtime_path = self.resolve_runtime_path()
        running = bool(self._process and self._process.poll() is None)
        return {
            "configured": bool(runtime_path),
            "running": running,
            "pid": getattr(self._process, "pid", None) if running else None,
            "workDir": self._work_dir,
            "runtimePath": runtime_path,
            "source": "configured" if self._runtime_path else "bundled",
            "proxyBaseUrl": "http://127.0.0.1:8777/api/v2/assistant/provider-proxy/v1",
        }

    def start(self):
        if self._process and self._process.poll() is None:
            return {"success": True, "alreadyRunning": True, "runtime": self.status()}
        spec = self.build_launch_spec()
        self._process = self._popen(spec["command"], cwd=spec["cwd"], env=spec["env"])
        return {"success": True, "runtime": self.status()}

    def stop(self):
        if not self._process or self._process.poll() is not None:
            return {"success": True, "alreadyStopped": True, "runtime": self.status()}
        self._process.terminate()
        try:
            self._process.wait(timeout=5)
        except Exception:
            self._process.kill()
        return {"success": True, "runtime": self.status()}

