import json
import unittest

from services.claw_bridge_service import ClawBridgeService
from services.claw_skill_registry_service import ClawSkillRegistryService


class FakeRuntimeService:
    def build_launch_spec(self):
        return {
            "command": ["claw", "--output-format", "json", "prompt"],
            "cwd": ".",
            "env": {},
        }


class ClawBridgeServiceTests(unittest.TestCase):
    def test_chat_prompt_contains_story_to_video_workflow_protocol(self):
        service = ClawBridgeService(runtime_service=FakeRuntimeService())

        payload = service._build_prompt_payload(
            message="做一个15秒故事短片",
            context={},
        )

        text = json.dumps(payload, ensure_ascii=False)
        self.assertIn("story_to_video", text)
        self.assertIn("story_outline", text)
        self.assertIn("style_bible", text)
        self.assertIn("shot_keyframe", text)
        self.assertIn("shot_video", text)
        self.assertIn("视频生成必须等待用户明确授权", text)

    def test_prompt_injects_storyboard_director_skill(self):
        service = ClawBridgeService(runtime_service=FakeRuntimeService())

        payload = service._build_prompt_payload(
            message="做一个15秒故事短片",
            context={},
        )

        self.assertTrue(payload["assistantSkills"]["applied"])
        self.assertEqual(payload["assistantSkills"]["items"][0]["id"], "storyboard_director")

    def test_unmatched_prompt_has_empty_skills(self):
        service = ClawBridgeService(runtime_service=FakeRuntimeService())

        payload = service._build_prompt_payload(message="你好", context={})

        self.assertFalse(payload["assistantSkills"]["applied"])
        self.assertEqual(payload["assistantSkills"]["items"], [])

    def test_compact_prompt_uses_compact_skill_body(self):
        service = ClawBridgeService(
            runtime_service=FakeRuntimeService(),
            skill_registry=ClawSkillRegistryService(),
        )

        payload = service._build_prompt_payload(
            message="做一个15秒故事短片",
            context={},
            compact_skills=True,
        )

        instructions = payload["assistantSkills"]["items"][0]["instructions"]
        self.assertLess(len(instructions), 260)
        self.assertIn("story_to_video", instructions)

    def test_parse_claw_json_message_contract(self):
        service = ClawBridgeService(runtime_service=FakeRuntimeService())

        parsed = service.parse_claw_output(
            json.dumps(
                {
                    "message": json.dumps(
                        {
                            "reply": "OK",
                            "actions": [],
                            "warnings": [],
                            "requiresConfirmation": False,
                        }
                    )
                }
            )
        )

        self.assertTrue(parsed["success"])
        self.assertEqual(parsed["reply"], "OK")

    def test_parse_claw_fenced_json_output_contract(self):
        service = ClawBridgeService(runtime_service=FakeRuntimeService())

        parsed = service.parse_claw_output(
            "\n".join(
                [
                    "```json",
                    json.dumps(
                        {
                            "reply": "OK",
                            "actions": [
                                {
                                    "type": "create_node",
                                    "nodeType": "ai-text",
                                    "data": {"workflowKind": "story_to_video"},
                                }
                            ],
                            "warnings": ["safe repair"],
                            "requiresConfirmation": False,
                        }
                    ),
                    "```",
                ]
            )
        )

        self.assertTrue(parsed["success"])
        self.assertEqual(parsed["reply"], "OK")
        self.assertEqual(parsed["actions"][0]["type"], "create_node")
        self.assertEqual(parsed["warnings"], ["safe repair"])

    def test_parse_claw_preserves_assistant_response_contract_v2(self):
        service = ClawBridgeService(runtime_service=FakeRuntimeService())

        parsed = service.parse_claw_output(
            json.dumps(
                {
                    "reply": "planned",
                    "intent": {
                        "id": "intent_1",
                        "mode": "act",
                        "matchedSkills": ["canvas_layout"],
                    },
                    "plan": {
                        "id": "plan_1",
                        "title": "Layout canvas",
                        "status": "draft",
                        "steps": [{"id": "step_1", "title": "Layout"}],
                    },
                    "actionsByStep": {
                        "step_1": [{"type": "layout_nodes", "nodeIds": ["n1"]}]
                    },
                    "execution": {"id": "exec_1", "status": "draft"},
                    "developer": {
                        "rawModelContractVersion": "v2",
                        "skillWarnings": ["ok"],
                        "apiKey": "must-not-leak",
                    },
                    "actions": [{"type": "layout_nodes", "nodeIds": ["n1"]}],
                    "warnings": [],
                }
            )
        )

        self.assertTrue(parsed["success"])
        self.assertEqual(parsed["intent"]["id"], "intent_1")
        self.assertEqual(parsed["plan"]["id"], "plan_1")
        self.assertEqual(
            parsed["actionsByStep"],
            {"step_1": [{"type": "layout_nodes", "nodeIds": ["n1"]}]},
        )
        self.assertEqual(parsed["execution"]["id"], "exec_1")
        self.assertEqual(
            parsed["developer"],
            {"rawModelContractVersion": "v2", "skillWarnings": ["ok"]},
        )

    def test_parse_claw_extracts_json_from_surrounding_text(self):
        service = ClawBridgeService(runtime_service=FakeRuntimeService())

        parsed = service.parse_claw_output(
            '好的，下面是动作：\n{"reply":"OK","actions":[],"warnings":[]}\n请应用。'
        )

        self.assertTrue(parsed["success"])
        self.assertEqual(parsed["reply"], "OK")
        self.assertEqual(parsed["actions"], [])


if __name__ == "__main__":
    unittest.main()
