import json
import tempfile
import unittest
from pathlib import Path

from services.assistant_skill_v2_offline_runner import run_v2_skill_offline_tests


class AssistantSkillV2OfflineRunnerTests(unittest.TestCase):
    def _write_v2_skill(self, root, skill_id, triggers, tests, allowed_actions=None):
        directory = Path(root, skill_id)
        directory.mkdir(parents=True, exist_ok=True)
        Path(directory, "skill.json").write_text(
            json.dumps(
                {
                    "id": skill_id,
                    "name": skill_id,
                    "enabled": True,
                    "priority": 90,
                    "triggers": triggers,
                    "allowedActions": allowed_actions or ["focus_nodes"],
                    "forbiddenActions": ["write_file"],
                    "qualityRules": ["rule"],
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        Path(directory, "instructions.md").write_text("Use the skill safely.", encoding="utf-8")
        Path(directory, "tests.json").write_text(json.dumps(tests, ensure_ascii=False), encoding="utf-8")

    def test_runner_executes_tests_json_cases_and_reports_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write_v2_skill(
                tmp,
                "canvas_layout",
                ["layout canvas"],
                [{"id": "layout_case", "input": "please layout canvas", "expectSkill": "canvas_layout"}],
            )

            result = run_v2_skill_offline_tests(skill_root=tmp)

            self.assertTrue(result["success"])
            self.assertEqual(result["total"], 2)
            self.assertEqual(result["passed"], 2)
            self.assertEqual(result["failed"], 0)
            self.assertTrue(all(case["status"] == "passed" for case in result["cases"]))

    def test_runner_fails_when_expected_skill_is_not_matched(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write_v2_skill(
                tmp,
                "canvas_layout",
                ["layout canvas"],
                [{"id": "bad_case", "input": "unmatched request", "expectSkill": "canvas_layout"}],
            )

            result = run_v2_skill_offline_tests(skill_root=tmp)

            self.assertFalse(result["success"])
            self.assertEqual(result["total"], 2)
            self.assertEqual(result["failed"], 1)
            failed_messages = [case["message"] for case in result["cases"] if case["status"] != "passed"]
            self.assertTrue(any("expected canvas_layout" in message for message in failed_messages))

    def test_default_runner_covers_built_in_v2_skill_tests(self):
        result = run_v2_skill_offline_tests()

        self.assertTrue(result["success"])
        self.assertGreaterEqual(result["total"], 4)
        self.assertEqual(result["failed"], 0)
        self.assertEqual(
            {"canvas_layout", "director", "prompt_preset_generation", "asset_usage", "storyboard_workflow"},
            {case["expectedSkill"] for case in result["cases"]},
        )


    def test_examples_must_respect_allowed_and_forbidden_actions(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write_v2_skill(
                tmp,
                "demo_skill",
                ["demo trigger"],
                [{"id": "demo_case", "input": "please demo trigger", "expectSkill": "demo_skill"}],
                allowed_actions=["layout_nodes"],
            )
            Path(tmp, "demo_skill", "examples.json").write_text(
                json.dumps([
                    {"input": "please demo trigger", "matchedSkill": "demo_skill", "actions": ["write_file"]},
                    {"input": "please demo trigger again", "matchedSkill": "demo_skill", "actions": ["create_node"]},
                ], ensure_ascii=False),
                encoding="utf-8",
            )

            result = run_v2_skill_offline_tests(skill_root=tmp)

            self.assertFalse(result["success"])
            failed_messages = [case["message"] for case in result["cases"] if case["status"] != "passed"]
            self.assertTrue(any("forbiddenActions" in message for message in failed_messages), failed_messages)
            self.assertTrue(any("allowedActions" in message for message in failed_messages), failed_messages)

    def test_missing_quality_rules_fails_constraint_check(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp, "no_rules")
            directory.mkdir(parents=True, exist_ok=True)
            Path(directory, "skill.json").write_text(
                json.dumps({
                    "id": "no_rules",
                    "name": "no_rules",
                    "enabled": True,
                    "priority": 90,
                    "triggers": ["no rules trigger"],
                    "allowedActions": ["focus_nodes"],
                    "forbiddenActions": [],
                }, ensure_ascii=False),
                encoding="utf-8",
            )
            Path(directory, "instructions.md").write_text("x", encoding="utf-8")
            Path(directory, "tests.json").write_text(
                json.dumps([{"id": "c1", "input": "please no rules trigger", "expectSkill": "no_rules"}], ensure_ascii=False),
                encoding="utf-8",
            )

            result = run_v2_skill_offline_tests(skill_root=tmp)

            self.assertFalse(result["success"])
            failed_messages = [case["message"] for case in result["cases"] if case["status"] != "passed"]
            self.assertTrue(any("qualityRules" in message for message in failed_messages), failed_messages)


    def test_quality_checks_are_enforced_against_examples(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp, "qc_skill")
            directory.mkdir(parents=True, exist_ok=True)
            Path(directory, "skill.json").write_text(
                json.dumps({
                    "id": "qc_skill",
                    "name": "qc_skill",
                    "enabled": True,
                    "priority": 90,
                    "triggers": ["quality trigger"],
                    "allowedActions": ["create_node", "layout_nodes", "focus_nodes"],
                    "forbiddenActions": [],
                    "qualityRules": ["rule"],
                    "qualityChecks": [
                        {"type": "requiresActionType", "action": "layout_nodes"},
                        {"type": "forbidsActionType", "action": "focus_nodes"},
                        {"type": "maxActions", "value": 2},
                    ],
                }, ensure_ascii=False),
                encoding="utf-8",
            )
            Path(directory, "instructions.md").write_text("x", encoding="utf-8")
            Path(directory, "tests.json").write_text(
                json.dumps([{"id": "c1", "input": "please quality trigger", "expectSkill": "qc_skill"}], ensure_ascii=False),
                encoding="utf-8",
            )
            Path(directory, "examples.json").write_text(
                json.dumps([
                    {"input": "please quality trigger", "matchedSkill": "qc_skill",
                     "actions": ["create_node", "focus_nodes", "create_node"]},
                ], ensure_ascii=False),
                encoding="utf-8",
            )

            result = run_v2_skill_offline_tests(skill_root=tmp)

            self.assertFalse(result["success"])
            messages = [case["message"] for case in result["cases"] if case["status"] != "passed"]
            joined = " | ".join(messages)
            self.assertIn("requiresActionType", joined)
            self.assertIn("forbidsActionType", joined)
            self.assertIn("maxActions", joined)


if __name__ == "__main__":
    unittest.main()
