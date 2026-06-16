import os


class PiRuntimeService:
    SAFE_BASE_ENV_KEYS = (
        "SystemRoot",
        "WINDIR",
        "TEMP",
        "TMP",
        "PATH",
        "COMSPEC",
        "NUMBER_OF_PROCESSORS",
        "PROCESSOR_ARCHITECTURE",
    )

    @staticmethod
    def should_require_bundled_runtime(distribution):
        return str(distribution or "").strip().lower() in {"onedir", "onefile"}

    def __init__(self, *, project_root=None, node_command="node", require_bundled_runtime=False):
        self._project_root = os.path.abspath(
            project_root or os.path.join(os.path.dirname(__file__), "..")
        )
        self._node_command = node_command
        self._require_bundled_runtime = bool(require_bundled_runtime)

    def _dist_runner_path(self):
        return os.path.join(
            self._project_root,
            "integrations",
            "pi_canvas_agent",
            "dist",
            "runner.js",
        )

    def _source_runner_path(self):
        return os.path.join(
            self._project_root,
            "integrations",
            "pi_canvas_agent",
            "src",
            "runner.js",
        )

    def _bundled_node_path(self):
        return os.path.join(
            self._project_root,
            "vendor",
            "node",
            "windows-x64",
            "node.exe",
        )

    def runner_path(self):
        dist_runner = self._dist_runner_path()
        source_runner = self._source_runner_path()
        if os.path.exists(dist_runner):
            return dist_runner
        if self._require_bundled_runtime:
            return dist_runner
        if os.path.exists(source_runner):
            return source_runner
        return dist_runner

    def _package_root(self):
        return os.path.join(self._project_root, "integrations", "pi_canvas_agent")

    def _packaging_manifest_path(self):
        return os.path.join(self._package_root(), "packaging", "sidecar-manifest.json")

    def _packaging_launcher_path(self):
        return os.path.join(self._package_root(), "packaging", "start-pi-canvas-agent.bat")

    def _node_license_path(self):
        return os.path.join(self._project_root, "vendor", "node", "windows-x64", "LICENSE.node.txt")

    def _lockfile_path(self):
        return os.path.join(self._package_root(), "package-lock.json")

    def _has_pi_license(self):
        package_root = self._package_root()
        return (
            os.path.exists(os.path.join(package_root, "LICENSE"))
            or os.path.exists(os.path.join(package_root, "LICENSE.pi.txt"))
        )

    def _requirements_status(self):
        return {
            "node": ">=22.19.0",
            "lockfile": os.path.exists(self._lockfile_path()),
            "license": self._has_pi_license(),
            "packageManifest": os.path.exists(self._packaging_manifest_path()),
            "launcher": os.path.exists(self._packaging_launcher_path()),
        }

    def _node_command_status(self):
        bundled_node = self._bundled_node_path()
        if os.path.exists(bundled_node):
            return bundled_node, "bundled"
        return self._node_command, "configured"

    def _runner_source(self):
        runner = self.runner_path()
        if runner == self._dist_runner_path() and os.path.exists(runner):
            return "dist"
        if runner == self._source_runner_path() and os.path.exists(runner):
            return "source"
        return ""

    def _packaging_status(self):
        requirements = self._requirements_status()
        bundled_node = os.path.exists(self._bundled_node_path())
        dist_runner = os.path.exists(self._dist_runner_path())
        source_runner = os.path.exists(self._source_runner_path())
        ready = bool(
            bundled_node
            and dist_runner
            and requirements["packageManifest"]
            and requirements["launcher"]
            and requirements["lockfile"]
            and requirements["license"]
            and os.path.exists(self._node_license_path())
        )
        return {
            "ready": ready,
            "requiresBundledRuntime": self._require_bundled_runtime,
            "bundledNode": bundled_node,
            "distRunner": dist_runner,
            "sourceRunner": source_runner,
            "packageManifest": requirements["packageManifest"],
            "launcher": requirements["launcher"],
            "lockfile": requirements["lockfile"],
            "license": requirements["license"],
            "devDependenciesRequired": not dist_runner,
        }

    def status(self):
        runner = self.runner_path()
        node_command, node_source = self._node_command_status()
        has_runner = os.path.exists(runner)
        has_bundled_node = node_source == "bundled"
        configured = has_runner and (has_bundled_node or not self._require_bundled_runtime)
        if configured:
            status = "ready"
        elif self._require_bundled_runtime and not has_bundled_node:
            status = "missing_bundled_node"
        else:
            status = "missing_runner"
        source = "bundled_sidecar" if has_bundled_node else "project_sidecar"
        return {
            "success": True,
            "configured": configured,
            "running": False,
            "status": status,
            "runnerPath": runner if configured else "",
            "source": source,
            "nodeCommand": node_command,
            "nodeSource": node_source,
            "runnerSource": self._runner_source() if has_runner else "",
            "requirements": self._requirements_status(),
            "packaging": self._packaging_status(),
        }

    def build_launch_spec(self, provider_config=None):
        runner = self.runner_path()
        if not os.path.exists(runner):
            raise FileNotFoundError(runner)
        node_command, node_source = self._node_command_status()
        if self._require_bundled_runtime and node_source != "bundled":
            raise FileNotFoundError(self._bundled_node_path())

        provider_config = provider_config or {}
        env = {
            key: os.environ[key]
            for key in self.SAFE_BASE_ENV_KEYS
            if key in os.environ
        }
        env.update(
            {
                "OPENAI_BASE_URL": provider_config.get("apiUrl")
                or provider_config.get("proxyBaseUrl")
                or provider_config.get("baseUrl")
                or provider_config.get("endpoint")
                or "",
                "OPENAI_API_KEY": provider_config.get("apiKey")
                or provider_config.get("proxyToken")
                or provider_config.get("token")
                or "",
                "PI_MODEL": provider_config.get("model")
                or provider_config.get("modelName")
                or provider_config.get("defaultModel")
                or "",
                "HUANYING_CANVAS_AGENT": "1",
            }
        )

        return {
            "command": [node_command, runner],
            "cwd": os.path.dirname(runner),
            "env": env,
            "runnerPath": runner,
            "source": "bundled_sidecar" if node_source == "bundled" else "project_sidecar",
            "nodeSource": node_source,
            "runnerSource": self._runner_source(),
        }
