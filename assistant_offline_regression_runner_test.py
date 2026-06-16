import unittest

from tools.run_claw_assistant_offline_regression import (
    EXPECTED_NONPASS_SAMPLE,
    SOURCE_PREFLIGHT_EXIT_BLOCKED,
    build_regression_steps,
)


class AssistantOfflineRegressionRunnerTests(unittest.TestCase):
    def test_runner_includes_required_offline_regression_steps(self):
        steps = build_regression_steps()
        names = [step.name for step in steps]

        self.assertIn("offline artifact unit tests", names)
        self.assertIn("claw backend focused tests", names)
        self.assertIn("assistant frontend focused tests", names)
        self.assertIn("assistant tool syntax", names)
        self.assertIn("claw service source syntax", names)
        self.assertIn("assistant frontend source syntax", names)
        self.assertIn("offline manifest json", names)
        self.assertIn("assistant skill json: canvas_layout", names)
        self.assertIn("assistant skill json: storyboard_director", names)
        self.assertIn("assistant skill json: variant_branches", names)
        self.assertIn("assistant skill json: viral_lab", names)
        self.assertIn("assistant skill json: workflow_template", names)
        self.assertIn("passing sample score", names)
        self.assertIn("schema-fail sample score", names)
        self.assertIn("source tree preflight", names)
        self.assertIn("pi canvas agent offline regression", names)
        self.assertIn("pi canvas agent source preflight", names)
        self.assertIn("assistant visual diff tests", names)
        self.assertIn("assistant project sync tests", names)

    def test_artifact_step_runs_scorecard_trend_tests(self):
        steps = build_regression_steps()
        artifact_step = next(step for step in steps if step.name == "offline artifact unit tests")

        self.assertIn("assistant_scorecard_trends_test.py", artifact_step.command)
        self.assertIn("canvas_agent_r5_runner_test.py", artifact_step.command)
        self.assertIn("canvas_agent_p0_p4_completion_audit_test.py", artifact_step.command)

    def test_runner_includes_p0_p4_completion_audit_tool_syntax(self):
        steps = build_regression_steps()
        syntax_step = next(step for step in steps if step.name == "assistant tool syntax")

        self.assertIn("tools/audit_pi_canvas_agent_p0_p4_completion.py", syntax_step.command)

    def test_runner_includes_visual_diff_tool_tests(self):
        steps = build_regression_steps()
        visual_step = next(step for step in steps if step.name == "assistant visual diff tests")

        self.assertIn("tools\\assistant_visual_diff.test.mjs", visual_step.command)

    def test_runner_includes_live_artifact_validator_tests(self):
        steps = build_regression_steps()
        validator_step = next(step for step in steps if step.name == "assistant live artifact validator tests")

        self.assertIn("tools\\assistant_live_artifact_validator.test.mjs", validator_step.command)

    def test_runner_includes_project_sync_tests(self):
        steps = build_regression_steps()
        sync_step = next(step for step in steps if step.name == "assistant project sync tests")

        self.assertIn("modules\\assistant\\assistantSyncService.test.js", sync_step.command)
        self.assertIn("canvas_agent_sync_service_test.py", sync_step.command)

    def test_runner_includes_p4_platform_tests(self):
        steps = build_regression_steps()
        p4_step = next(step for step in steps if step.name == "assistant p4 platform tests")

        self.assertIn("modules\\assistant\\assistantAgentOrchestrator.test.js", p4_step.command)
        self.assertIn("modules\\assistant\\assistantCreativeHub.test.js", p4_step.command)
        self.assertIn("modules\\assistant\\assistantExperimentAnalytics.test.js", p4_step.command)
        self.assertIn("modules\\assistant\\assistantAuditExport.test.js", p4_step.command)

    def test_backend_and_frontend_steps_cover_recreated_assistant_sources(self):
        steps = build_regression_steps()
        backend_step = next(step for step in steps if step.name == "claw backend focused tests")
        frontend_step = next(step for step in steps if step.name == "assistant frontend focused tests")
        service_syntax_step = next(step for step in steps if step.name == "claw service source syntax")
        frontend_syntax_step = next(step for step in steps if step.name == "assistant frontend source syntax")

        self.assertIn("claw_skill_registry_service_test.py", backend_step.command)
        self.assertIn("claw_action_schema_test.py", backend_step.command)
        self.assertIn("claw_bridge_service_test.py", backend_step.command)
        self.assertIn("modules\\assistant\\assistantActionPreview.test.js", frontend_step.command)
        self.assertIn("modules\\assistant\\assistantActionExecutor.test.js", frontend_step.command)
        self.assertIn("modules\\assistant\\assistantSyncService.test.js", frontend_step.command)
        self.assertIn("modules\\app\\appAssistantPanel.test.js", frontend_step.command)
        self.assertIn("services\\claw_bridge_service.py", service_syntax_step.command)
        self.assertIn("services\\claw_action_schema.py", service_syntax_step.command)
        self.assertIn("services\\canvas_agent_sync_service.py", service_syntax_step.command)
        self.assertIn("modules\\assistant\\assistantActionPreview.js", frontend_syntax_step.command)
        self.assertIn("modules\\assistant\\assistantActionExecutor.js", frontend_syntax_step.command)
        self.assertIn("modules\\assistant\\assistantSyncService.js", frontend_syntax_step.command)

    def test_schema_fail_sample_is_expected_nonpass(self):
        steps = build_regression_steps()
        schema_step = next(step for step in steps if step.name == "schema-fail sample score")

        self.assertIn(EXPECTED_NONPASS_SAMPLE, schema_step.command)
        self.assertEqual(schema_step.allowed_exit_codes, (1,))

    def test_source_preflight_is_blocking_after_source_restoration(self):
        steps = build_regression_steps()
        preflight_step = next(step for step in steps if step.name == "source tree preflight")

        self.assertEqual(preflight_step.allowed_exit_codes, (0,))
        self.assertFalse(preflight_step.nonblocking)

    def test_pi_offline_regression_and_source_preflight_are_blocking(self):
        steps = build_regression_steps()
        pi_regression_step = next(step for step in steps if step.name == "pi canvas agent offline regression")
        pi_preflight_step = next(step for step in steps if step.name == "pi canvas agent source preflight")

        self.assertIn("tools/run_pi_canvas_agent_offline_regression.py", pi_regression_step.command)
        self.assertIn("tools/check_pi_canvas_agent_source_tree.py", pi_preflight_step.command)
        self.assertEqual(pi_regression_step.allowed_exit_codes, (0,))
        self.assertEqual(pi_preflight_step.allowed_exit_codes, (0,))
        self.assertFalse(pi_regression_step.nonblocking)
        self.assertFalse(pi_preflight_step.nonblocking)


if __name__ == "__main__":
    unittest.main()
