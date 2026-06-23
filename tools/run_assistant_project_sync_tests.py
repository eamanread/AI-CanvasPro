"""Run the mixed Python/Node assistant project-sync regression slice."""

from __future__ import annotations

from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
NODE_TESTS = (
    "modules\\assistant\\assistantSyncService.test.js",
    "modules\\assistant\\assistantConversationStore.test.js",
    "modules\\assistant\\assistantGenerationTaskStore.test.js",
    "modules\\assistant\\assistantWorkflowTemplateStore.test.js",
    "api\\canvasAgentApi.test.js",
)
PYTHON_TESTS = (
    "canvas_agent_sync_service_test.py",
    "canvas_agent_conversation_service_test.py",
    "canvas_agent_route_service_test.py",
    "http_route_dispatcher_test.py",
    "assistant_offline_regression_runner_test.py",
)


def _run(command: tuple[str, ...]) -> int:
    print(" ".join(command))
    return subprocess.run(command, cwd=ROOT).returncode


def main() -> int:
    python_status = _run((sys.executable, "-m", "unittest", *PYTHON_TESTS))
    if python_status:
        return python_status
    node_status = _run(("node", "--test", *NODE_TESTS))
    return node_status


if __name__ == "__main__":
    raise SystemExit(main())
