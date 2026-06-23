import io
import json
import threading
import time
import unittest

from services.director_bridge_service import DirectorBridgeService


class _Completed:
    def __init__(self, stdout="", returncode=0, stderr=""):
        self.stdout = stdout
        self.returncode = returncode
        self.stderr = stderr


class _FakeProcess:
    """Popen stand-in: file-like pipes, optional gate to hold wait()."""

    def __init__(self, stdout="", stderr="", gate=None):
        self.stdin = io.StringIO()
        self.stdout = io.StringIO(stdout)
        self.stderr = io.StringIO(stderr)
        self._gate = gate
        self.killed = False

    def wait(self, timeout=None):
        if self._gate is not None and not self._gate.wait(timeout or 5):
            raise AssertionError("fake process gate never opened")
        return 0

    def kill(self):
        self.killed = True


def _wait_for_terminal(service, job_id, deadline_seconds=3):
    deadline = time.time() + deadline_seconds
    while time.time() < deadline:
        status = service.refresh_status(job_id)
        if status.get("status") not in ("running",):
            return status
        time.sleep(0.01)
    raise AssertionError("refresh job never left running")


class DirectorBridgeServiceTests(unittest.TestCase):
    def test_plan_runs_node_runner_and_parses_v2_response(self):
        calls = []

        def runner(cmd, **kwargs):
            calls.append((cmd, kwargs.get("input")))
            return _Completed(stdout=json.dumps({
                "success": True,
                "reply": "导演计划已生成",
                "intent": {"id": "director_plan", "matchedSkills": ["director"]},
                "plan": {"id": "p1", "steps": []},
                "actionsByStep": {},
                "actions": [],
            }))

        service = DirectorBridgeService(command_runner=runner, node_path="node-x", runner_path="runner.mjs")
        response = service.plan({"message": "导演计划", "qmaiProjectPath": "ignored"})

        self.assertTrue(response["success"])
        self.assertEqual(response["intent"]["matchedSkills"], ["director"])
        cmd, stdin_payload = calls[0]
        self.assertEqual(cmd[0], "node-x")
        self.assertIn("runner.mjs", cmd[1])
        self.assertIn("导演计划", stdin_payload)

    def test_plan_fails_closed_on_bad_output(self):
        service = DirectorBridgeService(
            command_runner=lambda cmd, **kwargs: _Completed(stdout="not-json"),
            node_path="node", runner_path="runner.mjs",
        )
        response = service.plan({"message": "x"})
        self.assertFalse(response["success"])
        self.assertIn("error", response)

    def test_plan_fails_closed_on_runner_exception(self):
        def runner(cmd, **kwargs):
            raise OSError("node missing")

        service = DirectorBridgeService(command_runner=runner, node_path="node", runner_path="runner.mjs")
        response = service.plan({"message": "x"})
        self.assertFalse(response["success"])
        self.assertIn("node missing", response["error"])

    def test_refresh_fails_closed_when_unconfigured(self):
        service = DirectorBridgeService(
            command_runner=lambda cmd, **kwargs: _Completed(stdout="{}"),
            refresh_command="",
        )
        response = service.refresh({})
        self.assertFalse(response["success"])
        self.assertIn("HY_QMAI_HEADLESS_CMD", response["error"])

    def test_refresh_returns_a_job_and_finishes_with_last_stdout_json_line(self):
        calls = []

        def spawner(cmd, **kwargs):
            calls.append((cmd, kwargs.get("cwd")))
            return _FakeProcess(
                stdout="vite-node banner noise\n{\"success\": true, \"rounds\": 1}",
                stderr="non-json tool warning\n{\"kind\": \"director-progress\", \"phase\": \"storyboard\"}\n",
            )

        service = DirectorBridgeService(
            process_spawner=spawner,
            refresh_command='npx vite-node "scripts/director-headless.ts"',
            refresh_cwd="D:/qmai-repo",
            refresh_timeout_seconds=120,
        )
        started = service.refresh({"intentFile": "intent-1.json"})

        self.assertTrue(started["success"])
        self.assertEqual(started["status"], "running")
        self.assertTrue(started["jobId"].startswith("refresh-"))
        cmd, cwd = calls[0]
        self.assertEqual(cmd[0], "npx")
        self.assertEqual(cwd, "D:/qmai-repo")

        status = _wait_for_terminal(service, started["jobId"])
        self.assertEqual(status["status"], "done")
        self.assertEqual(status["result"]["rounds"], 1)
        # ndjson progress lines parsed, tool noise skipped.
        self.assertEqual(status["progress"], [{"kind": "director-progress", "phase": "storyboard"}])

    def test_refresh_fails_closed_on_spawn_exception(self):
        def spawner(cmd, **kwargs):
            raise OSError("headless missing")

        service = DirectorBridgeService(process_spawner=spawner, refresh_command="headless run")
        response = service.refresh({})
        self.assertFalse(response["success"])
        self.assertIn("headless missing", response["error"])
        status = service.refresh_status(response["jobId"])
        self.assertEqual(status["status"], "failed")

    def test_repeated_refresh_joins_the_running_job(self):
        gate = threading.Event()

        def spawner(cmd, **kwargs):
            return _FakeProcess(stdout='{"success": true}', gate=gate)

        service = DirectorBridgeService(process_spawner=spawner, refresh_command="headless run")
        first = service.refresh({})
        second = service.refresh({})
        try:
            self.assertEqual(first["jobId"], second["jobId"])
            self.assertTrue(second.get("alreadyRunning"))
        finally:
            gate.set()
        status = _wait_for_terminal(service, first["jobId"])
        self.assertEqual(status["status"], "done")

    def test_refresh_status_not_found_after_restart_semantics(self):
        service = DirectorBridgeService(refresh_command="headless run")
        status = service.refresh_status("refresh-gone")
        self.assertFalse(status["success"])
        self.assertEqual(status["status"], "not-found")


class DirectorBridgeKnowledgeTests(unittest.TestCase):
    def _service(self, calls):
        def runner(cmd, **kwargs):
            calls.append(json.loads(kwargs.get("input")))
            return _Completed(stdout=json.dumps({
                "success": True,
                "schemaVersion": "director-knowledge-projection/v1",
                "cards": [{"title": "C", "citationKind": "qmai", "cardId": "c1"}],
                "exportedAt": "2026-06-12T00:00:00.000Z",
            }))

        return DirectorBridgeService(command_runner=runner, node_path="node", runner_path="runner.mjs")

    def test_knowledge_runs_runner_in_knowledge_mode(self):
        calls = []
        service = self._service(calls)

        response = service.knowledge()

        self.assertTrue(response["success"])
        self.assertEqual(response["schemaVersion"], "director-knowledge-projection/v1")
        self.assertEqual(response["cards"][0]["cardId"], "c1")
        self.assertIn("cachedAt", response)
        self.assertEqual(calls[0]["mode"], "knowledge")

    def test_knowledge_is_cached_within_ttl(self):
        calls = []
        service = self._service(calls)

        first = service.knowledge()
        second = service.knowledge()

        self.assertEqual(len(calls), 1)
        self.assertEqual(first, second)
