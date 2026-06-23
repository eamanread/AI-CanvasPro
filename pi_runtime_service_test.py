import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from services.pi_runtime_service import PiRuntimeService


class PiRuntimeServiceTest(unittest.TestCase):
    def _create_runner(self, project_root):
        runner = Path(project_root) / "integrations" / "pi_canvas_agent" / "dist" / "runner.js"
        runner.parent.mkdir(parents=True, exist_ok=True)
        runner.write_text("console.log('runner');\n", encoding="utf-8")
        return runner

    def _create_source_runner(self, project_root):
        runner = Path(project_root) / "integrations" / "pi_canvas_agent" / "src" / "runner.js"
        runner.parent.mkdir(parents=True, exist_ok=True)
        runner.write_text("console.log('source runner');\n", encoding="utf-8")
        return runner

    def _create_bundled_node(self, project_root):
        node = Path(project_root) / "vendor" / "node" / "windows-x64" / "node.exe"
        node.parent.mkdir(parents=True, exist_ok=True)
        node.write_text("fake bundled node\n", encoding="utf-8")
        (node.parent / "LICENSE.node.txt").write_text("node license\n", encoding="utf-8")
        return node

    def _create_packaging_contract(self, project_root):
        package_root = Path(project_root) / "integrations" / "pi_canvas_agent"
        packaging_root = package_root / "packaging"
        packaging_root.mkdir(parents=True, exist_ok=True)
        (packaging_root / "sidecar-manifest.json").write_text(
            '{"kind":"huanying-pi-canvas-agent-sidecar","node":"vendor/node/windows-x64/node.exe"}\n',
            encoding="utf-8",
        )
        (packaging_root / "start-pi-canvas-agent.bat").write_text(
            '@echo off\r\n"%~dp0..\\..\\..\\vendor\\node\\windows-x64\\node.exe" "%~dp0..\\dist\\runner.js"\r\n',
            encoding="utf-8",
        )
        return packaging_root

    def test_packaged_distributions_require_bundled_runtime(self):
        self.assertFalse(PiRuntimeService.should_require_bundled_runtime("source"))
        self.assertTrue(PiRuntimeService.should_require_bundled_runtime("onedir"))
        self.assertTrue(PiRuntimeService.should_require_bundled_runtime("onefile"))
        self.assertTrue(PiRuntimeService.should_require_bundled_runtime(" ONEFILE "))

    def test_build_launch_spec_uses_project_sidecar_runner(self):
        with tempfile.TemporaryDirectory() as project_root:
            runner = self._create_runner(project_root)
            service = PiRuntimeService(project_root=project_root, node_command="node22")

            spec = service.build_launch_spec()

            self.assertEqual(str(runner), service.runner_path())
            self.assertEqual(["node22", str(runner)], spec["command"])
            self.assertEqual(str(runner.parent), spec["cwd"])
            self.assertEqual(str(runner), spec["runnerPath"])
            self.assertEqual("project_sidecar", spec["source"])

    def test_build_launch_spec_prefers_bundled_node_when_present(self):
        with tempfile.TemporaryDirectory() as project_root:
            runner = self._create_runner(project_root)
            bundled_node = self._create_bundled_node(project_root)
            service = PiRuntimeService(project_root=project_root, node_command="global-node")

            spec = service.build_launch_spec()
            status = service.status()

            self.assertEqual([str(bundled_node), str(runner)], spec["command"])
            self.assertEqual(str(runner.parent), spec["cwd"])
            self.assertEqual("bundled_sidecar", spec["source"])
            self.assertEqual("bundled", spec["nodeSource"])
            self.assertEqual(str(bundled_node), status["nodeCommand"])
            self.assertEqual("bundled_sidecar", status["source"])
            self.assertEqual("bundled", status["nodeSource"])

    def test_release_mode_requires_bundled_node(self):
        with tempfile.TemporaryDirectory() as project_root:
            self._create_runner(project_root)
            service = PiRuntimeService(
                project_root=project_root,
                node_command="global-node",
                require_bundled_runtime=True,
            )

            status = service.status()

            self.assertFalse(status["configured"])
            self.assertEqual("missing_bundled_node", status["status"])
            self.assertEqual("global-node", status["nodeCommand"])
            self.assertTrue(status["packaging"]["requiresBundledRuntime"])
            self.assertFalse(status["packaging"]["bundledNode"])
            with self.assertRaises(FileNotFoundError):
                service.build_launch_spec()

    def test_release_mode_uses_dist_runner_and_does_not_fallback_to_source_runner(self):
        with tempfile.TemporaryDirectory() as project_root:
            self._create_source_runner(project_root)
            bundled_node = self._create_bundled_node(project_root)
            service = PiRuntimeService(
                project_root=project_root,
                node_command="global-node",
                require_bundled_runtime=True,
            )

            status = service.status()

            self.assertFalse(status["configured"])
            self.assertEqual("missing_runner", status["status"])
            self.assertEqual(str(bundled_node), status["nodeCommand"])
            self.assertEqual("", status["runnerPath"])
            self.assertFalse(status["packaging"]["distRunner"])
            self.assertTrue(status["packaging"]["sourceRunner"])
            with self.assertRaises(FileNotFoundError):
                service.build_launch_spec()

    def test_build_launch_spec_maps_provider_config_to_proxy_environment(self):
        with tempfile.TemporaryDirectory() as project_root:
            self._create_runner(project_root)
            service = PiRuntimeService(project_root=project_root)
            provider_config = {
                "proxyBaseUrl": "http://local-proxy/v1",
                "apiUrl": "http://api-url-wins/v1",
                "proxyToken": "proxy-token",
                "apiKey": "api-key-wins",
                "model": "pi-test-model",
            }
            base_env = {
                "SystemRoot": "C:\\Windows",
                "WINDIR": "C:\\Windows",
                "TEMP": "C:\\Temp",
                "TMP": "C:\\Tmp",
                "PATH": "C:\\Windows\\System32",
                "COMSPEC": "C:\\Windows\\System32\\cmd.exe",
                "NUMBER_OF_PROCESSORS": "8",
                "PROCESSOR_ARCHITECTURE": "AMD64",
                "UNSAFE_SECRET": "do-not-copy",
            }

            with patch.dict(os.environ, base_env, clear=True):
                spec = service.build_launch_spec(provider_config=provider_config)

            env = spec["env"]
            self.assertEqual("http://api-url-wins/v1", env["OPENAI_BASE_URL"])
            self.assertEqual("api-key-wins", env["OPENAI_API_KEY"])
            self.assertEqual("pi-test-model", env["PI_MODEL"])
            self.assertEqual("1", env["HUANYING_CANVAS_AGENT"])
            self.assertEqual("C:\\Windows", env["SystemRoot"])
            self.assertEqual("AMD64", env["PROCESSOR_ARCHITECTURE"])
            self.assertNotIn("UNSAFE_SECRET", env)
            self.assertEqual(
                {
                    "SystemRoot",
                    "WINDIR",
                    "TEMP",
                    "TMP",
                    "PATH",
                    "COMSPEC",
                    "NUMBER_OF_PROCESSORS",
                    "PROCESSOR_ARCHITECTURE",
                    "OPENAI_BASE_URL",
                    "OPENAI_API_KEY",
                    "PI_MODEL",
                    "HUANYING_CANVAS_AGENT",
                },
                set(env.keys()),
            )


    def test_status_reports_runtime_requirements_for_release_preflight(self):
        with tempfile.TemporaryDirectory() as project_root:
            runner = self._create_runner(project_root)
            package_root = runner.parents[1]
            (package_root / "package-lock.json").write_text("{}\n", encoding="utf-8")
            (package_root / "LICENSE.pi.txt").write_text("license\n", encoding="utf-8")
            service = PiRuntimeService(project_root=project_root, node_command="node22")

            status = service.status()

            self.assertTrue(status["configured"])
            self.assertEqual("node22", status["nodeCommand"])
            self.assertEqual(">=22.19.0", status["requirements"]["node"])
            self.assertTrue(status["requirements"]["lockfile"])
            self.assertTrue(status["requirements"]["license"])

    def test_status_reports_bundled_packaging_readiness(self):
        with tempfile.TemporaryDirectory() as project_root:
            self._create_runner(project_root)
            self._create_bundled_node(project_root)
            self._create_packaging_contract(project_root)
            package_root = Path(project_root) / "integrations" / "pi_canvas_agent"
            (package_root / "package-lock.json").write_text("{}\n", encoding="utf-8")
            (package_root / "LICENSE.pi.txt").write_text("license\n", encoding="utf-8")
            service = PiRuntimeService(project_root=project_root, require_bundled_runtime=True)

            status = service.status()

            self.assertTrue(status["configured"])
            self.assertEqual("ready", status["status"])
            self.assertEqual("bundled_sidecar", status["source"])
            self.assertEqual("dist", status["runnerSource"])
            self.assertEqual(
                {
                    "ready": True,
                    "requiresBundledRuntime": True,
                    "bundledNode": True,
                    "distRunner": True,
                    "sourceRunner": False,
                    "packageManifest": True,
                    "launcher": True,
                    "lockfile": True,
                    "license": True,
                    "devDependenciesRequired": False,
                },
                status["packaging"],
            )
            self.assertTrue(status["requirements"]["packageManifest"])
            self.assertTrue(status["requirements"]["launcher"])

    def test_missing_runner_status_is_unconfigured_and_missing_runner(self):
        with tempfile.TemporaryDirectory() as project_root:
            service = PiRuntimeService(project_root=project_root)

            status = service.status()

            self.assertFalse(status["configured"])
            self.assertEqual("missing_runner", status["status"])
            self.assertEqual("", status["runnerPath"])
            self.assertEqual("project_sidecar", status["source"])
            self.assertEqual("node", status["nodeCommand"])
            self.assertEqual("configured", status["nodeSource"])
            self.assertEqual(">=22.19.0", status["requirements"]["node"])
            self.assertFalse(status["requirements"]["lockfile"])
            self.assertFalse(status["requirements"]["license"])
            self.assertFalse(status["packaging"]["ready"])

    def test_missing_runner_build_launch_spec_raises_file_not_found(self):
        with tempfile.TemporaryDirectory() as project_root:
            service = PiRuntimeService(project_root=project_root)

            with self.assertRaises(FileNotFoundError):
                service.build_launch_spec()

    def test_source_runner_js_is_offline_fallback_when_dist_runner_is_missing(self):
        with tempfile.TemporaryDirectory() as project_root:
            source_runner = (
                Path(project_root)
                / "integrations"
                / "pi_canvas_agent"
                / "src"
                / "runner.js"
            )
            source_runner.parent.mkdir(parents=True, exist_ok=True)
            source_runner.write_text("console.log('offline runner');\n", encoding="utf-8")
            service = PiRuntimeService(project_root=project_root, node_command="node22")

            spec = service.build_launch_spec()

            self.assertEqual(str(source_runner), service.runner_path())
            self.assertEqual(["node22", str(source_runner)], spec["command"])
            self.assertEqual(str(source_runner.parent), spec["cwd"])
            self.assertEqual("project_sidecar", spec["source"])


if __name__ == "__main__":
    unittest.main()
