"""Run offline Claw assistant regression checks with explicit preflight status."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PREFLIGHT_EXIT_BLOCKED = 2
EXPECTED_NONPASS_SAMPLE = "docs/assistant_live_cases/samples/story_to_video_live_run_schema_fail.json"


@dataclass(frozen=True)
class RegressionStep:
    name: str
    command: tuple[str, ...]
    allowed_exit_codes: tuple[int, ...] = (0,)
    nonblocking: bool = False


def build_regression_steps() -> list[RegressionStep]:
    python = sys.executable
    return [
        RegressionStep(
            name="offline artifact unit tests",
            command=(
                python,
                "-m",
                "unittest",
                "claw_assistant_regression_artifacts_test.py",
                "assistant_live_run_scorecard_test.py",
                "assistant_scorecard_trends_test.py",
                "canvas_agent_r5_runner_test.py",
                "canvas_agent_p0_p4_completion_audit_test.py",
            ),
        ),
        RegressionStep(
            name="claw backend focused tests",
            command=(
                python,
                "-m",
                "unittest",
                "claw_skill_registry_service_test.py",
                "claw_action_schema_test.py",
                "claw_bridge_service_test.py",
            ),
        ),
        RegressionStep(
            name="assistant frontend focused tests",
            command=(
                "node",
                "--test",
                "--test-concurrency=1",
                "modules\\assistant\\assistantActionPreview.test.js",
                "modules\\assistant\\assistantActionExecutor.test.js",
                "modules\\assistant\\assistantSyncService.test.js",
                "modules\\app\\appAssistantPanel.test.js",
                "modules\\app\\appAssistantPanel.autoload.test.js",
            ),
        ),
        RegressionStep(
            name="assistant visual diff tests",
            command=(
                "node",
                "--test",
                "tools\\assistant_visual_diff.test.mjs",
                "tools\\assistant_panel_live_screenshot_check.test.mjs",
            ),
        ),
        RegressionStep(
            name="assistant live artifact validator tests",
            command=(
                "node",
                "--test",
                "tools\\assistant_live_artifact_validator.test.mjs",
            ),
        ),
        RegressionStep(
            name="assistant project sync tests",
            command=(
                python,
                "tools/run_assistant_project_sync_tests.py",
                "canvas_agent_sync_service_test.py",
                "modules\\assistant\\assistantSyncService.test.js",
            ),
        ),
        RegressionStep(
            name="assistant p4 platform tests",
            command=(
                "node",
                "--test",
                "modules\\assistant\\assistantAgentOrchestrator.test.js",
                "modules\\assistant\\assistantCreativeHub.test.js",
                "modules\\assistant\\assistantExperimentAnalytics.test.js",
                "modules\\assistant\\assistantAuditExport.test.js",
                "modules\\assistant\\assistantModelRegistry.test.js",
                "modules\\assistant\\assistantSyncService.test.js",
                "integrations\\pi_canvas_agent\\src\\huanyingTools.test.ts",
            ),
        ),
        RegressionStep(
            name="assistant tool syntax",
            command=(
                python,
                "-m",
                "py_compile",
                "tools/score_assistant_live_run.py",
                "tools/check_claw_assistant_source_tree.py",
                "tools/run_claw_assistant_offline_regression.py",
                "tools/run_assistant_project_sync_tests.py",
                "tools/audit_pi_canvas_agent_p0_p4_completion.py",
                "assistant_offline_regression_runner_test.py",
            ),
        ),
        RegressionStep(
            name="claw service source syntax",
            command=(
                python,
                "-m",
                "py_compile",
                "services\\claw_action_schema.py",
                "services\\claw_bridge_service.py",
                "services\\claw_skill_registry_service.py",
                "services\\claw_assistant_route_service.py",
                "services\\claw_context_service.py",
                "services\\claw_runtime_service.py",
                "services\\claw_provider_proxy_service.py",
                "services\\claw_conversation_memory_service.py",
                "services\\canvas_agent_sync_service.py",
            ),
        ),
        RegressionStep(
            name="assistant frontend source syntax",
            command=(
                "node",
                "--check",
                "modules\\assistant\\assistantActionPreview.js",
                "modules\\assistant\\assistantActionExecutor.js",
                "modules\\assistant\\assistantAgentOrchestrator.js",
                "modules\\assistant\\assistantCreativeHub.js",
                "modules\\assistant\\assistantExperimentAnalytics.js",
                "modules\\assistant\\assistantAuditExport.js",
                "modules\\assistant\\assistantModelRegistry.js",
                "modules\\assistant\\assistantSyncService.js",
                "modules\\app\\appAssistantPanel.js",
                "modules\\app\\appAssistantPanel.autoload.js",
            ),
        ),
        RegressionStep(
            name="offline manifest json",
            command=(
                python,
                "-m",
                "json.tool",
                "docs/assistant_live_cases/offline_regression_manifest.json",
            ),
        ),
        RegressionStep(
            name="assistant skill json: canvas_layout",
            command=(python, "-m", "json.tool", "config\\assistant-skills\\canvas_layout.json"),
        ),
        RegressionStep(
            name="assistant skill json: storyboard_director",
            command=(python, "-m", "json.tool", "config\\assistant-skills\\storyboard_director.json"),
        ),
        RegressionStep(
            name="assistant skill json: variant_branches",
            command=(python, "-m", "json.tool", "config\\assistant-skills\\variant_branches.json"),
        ),
        RegressionStep(
            name="assistant skill json: viral_lab",
            command=(python, "-m", "json.tool", "config\\assistant-skills\\viral_lab.json"),
        ),
        RegressionStep(
            name="assistant skill json: workflow_template",
            command=(python, "-m", "json.tool", "config\\assistant-skills\\workflow_template.json"),
        ),
        RegressionStep(
            name="passing sample score",
            command=(
                python,
                "tools/score_assistant_live_run.py",
                "docs/assistant_live_cases/samples/story_to_video_live_run_pass.json",
            ),
        ),
        RegressionStep(
            name="schema-fail sample score",
            command=(
                python,
                "tools/score_assistant_live_run.py",
                EXPECTED_NONPASS_SAMPLE,
            ),
            allowed_exit_codes=(1,),
        ),
        RegressionStep(
            name="source tree preflight",
            command=(python, "tools/check_claw_assistant_source_tree.py"),
        ),
        RegressionStep(
            name="pi canvas agent offline regression",
            command=(python, "tools/run_pi_canvas_agent_offline_regression.py"),
        ),
        RegressionStep(
            name="pi canvas agent source preflight",
            command=(python, "tools/check_pi_canvas_agent_source_tree.py"),
        ),
    ]


def _format_command(command: tuple[str, ...]) -> str:
    return " ".join(command)


def run_steps(steps: list[RegressionStep]) -> int:
    blocking_failures: list[str] = []
    nonblocking_warnings: list[str] = []

    for step in steps:
        print(f"\n== {step.name} ==")
        print(_format_command(step.command))
        completed = subprocess.run(step.command, cwd=ROOT, text=True)
        if completed.returncode in step.allowed_exit_codes:
            if step.nonblocking and completed.returncode != 0:
                nonblocking_warnings.append(step.name)
                print(f"[WARN] {step.name}: expected preflight blocker, exit {completed.returncode}")
            else:
                print(f"[OK] {step.name}")
            continue

        message = f"{step.name}: exit {completed.returncode}"
        if step.nonblocking:
            nonblocking_warnings.append(message)
            print(f"[WARN] {message}")
        else:
            blocking_failures.append(message)
            print(f"[FAIL] {message}")

    if nonblocking_warnings:
        print("\nNonblocking warnings:")
        for warning in nonblocking_warnings:
            print(f"- {warning}")

    if blocking_failures:
        print("\nBlocking failures:")
        for failure in blocking_failures:
            print(f"- {failure}")
        return 1

    print("\nOffline regression checks passed.")
    return 0


def main() -> int:
    return run_steps(build_regression_steps())


if __name__ == "__main__":
    raise SystemExit(main())
