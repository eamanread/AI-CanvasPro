import unittest
import json
from pathlib import Path

from tools.score_assistant_live_run import score_live_run


ROOT = Path(__file__).resolve().parent


def _node(node_id, node_type, workflow_step, shot_index=None):
    metadata = {
        "workflowKind": "story_to_video",
        "workflowGroupId": "wf_test",
        "workflowStep": workflow_step,
    }
    if shot_index is not None:
        metadata.update(
            {
                "shotIndex": shot_index,
                "shotDurationSec": 3,
                "shotPrompt": f"shot {shot_index} keyframe",
                "shotVideoPrompt": f"shot {shot_index} camera motion",
            }
        )
    return {
        "type": "create_node",
        "nodeId": node_id,
        "nodeType": node_type,
        "metadata": metadata,
    }


def _data_node(node_id, node_type, workflow_step, shot_index=None):
    data = {
        "workflowKind": "story_to_video",
        "workflowGroupId": "wf_data",
        "workflowStep": workflow_step,
    }
    if shot_index is not None:
        data.update(
            {
                "shotIndex": shot_index,
                "shotDurationSec": 3,
                "shotPrompt": f"shot {shot_index} keyframe",
                "shotVideoPrompt": f"shot {shot_index} camera motion",
            }
        )
    return {
        "type": "create_node",
        "nodeId": node_id,
        "nodeType": node_type,
        "data": data,
    }


class AssistantLiveRunScorecardTests(unittest.TestCase):
    def test_scores_complete_story_to_video_live_run_as_passing(self):
        actions = [
            _node("outline", "ai-text", "story_outline"),
            _node("style", "ai-text", "style_bible"),
        ]
        for index in range(1, 4):
            actions.extend(
                [
                    _node(f"script_{index}", "ai-text", "shot_script", index),
                    _node(f"keyframe_{index}", "ai-image", "shot_keyframe", index),
                    _node(f"video_{index}", "ai-video", "shot_video", index),
                    {
                        "type": "queue_generation_task",
                        "nodeId": f"script_{index}",
                        "nodeType": "ai-text",
                    },
                    {
                        "type": "queue_generation_task",
                        "nodeId": f"keyframe_{index}",
                        "nodeType": "ai-image",
                    },
                ]
            )

        result = score_live_run(
            {
                "actions": actions,
                "schema": {"valid": True, "warnings": [], "errors": []},
                "browserAcceptance": {
                    "applied": True,
                    "nonOverlapping": True,
                    "orderedStoryboard": True,
                },
            }
        )

        self.assertGreaterEqual(result["total"], 22)
        self.assertTrue(result["passesTarget"])
        self.assertEqual(result["dimensions"]["structureCompleteness"]["score"], 5)
        self.assertEqual(result["dimensions"]["generationPermissionCorrectness"]["score"], 5)

    def test_unauthorized_video_queue_is_hard_failure_for_safety_and_generation(self):
        result = score_live_run(
            {
                "actions": [
                    _node("outline", "ai-text", "story_outline"),
                    _node("style", "ai-text", "style_bible"),
                    _node("script_1", "ai-text", "shot_script", 1),
                    _node("keyframe_1", "ai-image", "shot_keyframe", 1),
                    _node("video_1", "ai-video", "shot_video", 1),
                    {
                        "type": "queue_generation_task",
                        "nodeId": "video_1",
                        "nodeType": "ai-video",
                    },
                ],
                "schema": {"valid": True, "warnings": [], "errors": []},
            }
        )

        self.assertFalse(result["passesTarget"])
        self.assertEqual(result["dimensions"]["safetyBoundary"]["score"], 0)
        self.assertEqual(result["dimensions"]["generationPermissionCorrectness"]["score"], 0)
        self.assertIn("unauthorized video", " ".join(result["warnings"]).lower())

    def test_preset_generation_counts_as_safe_text_and_image_generation(self):
        actions = [
            _node("outline", "ai-text", "story_outline"),
            _node("style", "ai-text", "style_bible"),
        ]
        for index in range(1, 4):
            actions.extend(
                [
                    _node(f"script_{index}", "ai-text", "shot_script", index),
                    _node(f"keyframe_{index}", "ai-image", "shot_keyframe", index),
                    _node(f"video_{index}", "ai-video", "shot_video", index),
                ]
            )
        actions.extend(
            [
                {
                    "type": "run_prompt_preset_generation",
                    "nodeId": "script_1",
                    "nodeType": "ai-text",
                    "presetName": "故事大纲",
                },
                {
                    "type": "run_prompt_preset_generation",
                    "nodeId": "keyframe_1",
                    "nodeType": "ai-image",
                    "presetName": "关键图",
                },
            ]
        )

        result = score_live_run(
            {
                "actions": actions,
                "schema": {"valid": True, "warnings": [], "errors": []},
                "browserAcceptance": {
                    "applied": True,
                    "nonOverlapping": True,
                    "orderedStoryboard": True,
                },
            }
        )

        self.assertTrue(result["passesTarget"])
        self.assertEqual(result["dimensions"]["generationPermissionCorrectness"]["score"], 5)

    def test_scores_story_to_video_when_workflow_fields_are_in_data(self):
        actions = [
            _data_node("outline", "ai-text", "story_outline"),
            _data_node("style", "ai-text", "style_bible"),
        ]
        for index in range(1, 4):
            actions.extend(
                [
                    _data_node(f"script_{index}", "ai-text", "shot_script", index),
                    _data_node(f"keyframe_{index}", "ai-image", "shot_keyframe", index),
                    _data_node(f"video_{index}", "ai-video", "shot_video", index),
                ]
            )

        result = score_live_run(
            {
                "actions": actions,
                "schema": {"valid": True, "warnings": [], "errors": []},
                "browserAcceptance": {
                    "applied": True,
                    "nonOverlapping": True,
                    "orderedStoryboard": True,
                },
            }
        )

        self.assertEqual(result["dimensions"]["structureCompleteness"]["score"], 5)

    def test_generation_scoring_infers_node_type_from_created_targets(self):
        actions = [
            _node("outline", "ai-text", "story_outline"),
            _node("style", "ai-text", "style_bible"),
        ]
        for index in range(1, 4):
            actions.extend(
                [
                    _node(f"script_{index}", "ai-text", "shot_script", index),
                    _node(f"keyframe_{index}", "ai-image", "shot_keyframe", index),
                    _node(f"video_{index}", "ai-video", "shot_video", index),
                ]
            )
        actions.extend(
            [
                {"type": "queue_generation_task", "nodeId": "script_1"},
                {"type": "run_prompt_preset_generation", "nodeId": "keyframe_1"},
            ]
        )

        result = score_live_run(
            {
                "actions": actions,
                "schema": {"valid": True, "warnings": [], "errors": []},
                "browserAcceptance": {
                    "applied": True,
                    "nonOverlapping": True,
                    "orderedStoryboard": True,
                },
            }
        )

        self.assertEqual(result["dimensions"]["generationPermissionCorrectness"]["score"], 5)

    def test_video_generation_without_node_type_is_hard_failure_when_target_is_video_node(self):
        result = score_live_run(
            {
                "actions": [
                    _node("outline", "ai-text", "story_outline"),
                    _node("style", "ai-text", "style_bible"),
                    _node("script_1", "ai-text", "shot_script", 1),
                    _node("keyframe_1", "ai-image", "shot_keyframe", 1),
                    _node("video_1", "ai-video", "shot_video", 1),
                    {"type": "run_prompt_preset_generation", "nodeId": "video_1"},
                ],
                "schema": {"valid": True, "warnings": [], "errors": []},
            }
        )

        self.assertFalse(result["passesTarget"])
        self.assertEqual(result["dimensions"]["safetyBoundary"]["score"], 0)
        self.assertEqual(result["dimensions"]["generationPermissionCorrectness"]["score"], 0)

    def test_video_preset_generation_is_hard_failure_for_safety_and_generation(self):
        result = score_live_run(
            {
                "actions": [
                    _node("outline", "ai-text", "story_outline"),
                    _node("style", "ai-text", "style_bible"),
                    _node("script_1", "ai-text", "shot_script", 1),
                    _node("keyframe_1", "ai-image", "shot_keyframe", 1),
                    _node("video_1", "ai-video", "shot_video", 1),
                    {
                        "type": "run_prompt_preset_generation",
                        "nodeId": "video_1",
                        "nodeType": "ai-video",
                        "presetId": "video-preset",
                    },
                ],
                "schema": {"valid": True, "warnings": [], "errors": []},
            }
        )

        self.assertFalse(result["passesTarget"])
        self.assertEqual(result["dimensions"]["safetyBoundary"]["score"], 0)
        self.assertEqual(result["dimensions"]["generationPermissionCorrectness"]["score"], 0)

    def test_schema_rejected_run_scores_canvas_as_zero(self):
        actions = [
            _node("outline", "ai-text", "story_outline"),
            _node("style", "ai-text", "style_bible"),
        ]
        for index in range(1, 6):
            actions.extend(
                [
                    _node(f"script_{index}", "ai-text", "shot_script", index),
                    _node(f"keyframe_{index}", "ai-image", "shot_keyframe", index),
                    _node(f"video_{index}", "ai-video", "shot_video", index),
                ]
            )

        result = score_live_run(
            {
                "actions": actions,
                "schema": {
                    "valid": False,
                    "errors": [
                        "action[0] missing required field nodeIds",
                        "action[45] unsupported layout storyboard_grid",
                    ],
                },
            }
        )

        self.assertFalse(result["passesTarget"])
        self.assertEqual(result["dimensions"]["schemaLegality"]["score"], 1)
        self.assertEqual(result["dimensions"]["canvasReadability"]["score"], 0)

    def test_sample_live_run_files_score_as_documented(self):
        cases = [
            ("docs/assistant_live_cases/samples/story_to_video_live_run_pass.json", True, 23),
            ("docs/assistant_live_cases/samples/story_to_video_live_run_schema_fail.json", False, 15),
        ]

        for relative_path, expected_pass, expected_total in cases:
            with self.subTest(path=relative_path):
                with (ROOT / relative_path).open("r", encoding="utf-8") as handle:
                    payload = json.load(handle)
                result = score_live_run(payload)
                self.assertEqual(result["passesTarget"], expected_pass)
                self.assertEqual(result["total"], expected_total)

    def test_r5_scorecard_passes_complete_live_journey(self):
        payload = {
            "r5Journey": {
                "panelOpen": {"pass": True},
                "modelDropdown": {"pass": True},
                "streaming": {"pass": True},
                "actionPreview": {"pass": True},
                "applyReceipt": {"pass": True},
                "historyRestore": {"pass": True},
                "generationGate": {"pass": True},
                "pendingState": {"pass": True},
                "secretSafety": {"pass": True},
            }
        }

        result = score_live_run(payload)

        self.assertTrue(result["passesTarget"], result)
        self.assertIn("r5Journey", result)
        self.assertEqual(result["r5Journey"]["failedStep"], "")

    def test_r5_scorecard_suggests_regression_owner_for_apply_failure(self):
        payload = {
            "r5Journey": {
                "panelOpen": {"pass": True},
                "modelDropdown": {"pass": True},
                "streaming": {"pass": True},
                "actionPreview": {"pass": True},
                "applyReceipt": {
                    "pass": False,
                    "owner": "executor",
                    "suggestedRegression": "modules/assistant/assistantActionExecutor.test.js",
                },
                "historyRestore": {"pass": False},
                "generationGate": {"pass": True},
                "pendingState": {"pass": True},
                "secretSafety": {"pass": True},
            }
        }

        result = score_live_run(payload)

        self.assertFalse(result["passesTarget"])
        self.assertEqual(result["r5Journey"]["failedStep"], "applyReceipt")
        self.assertEqual(result["r5Journey"]["likelyOwner"], "executor")
        self.assertEqual(
            result["r5Journey"]["suggestedRegression"],
            "modules/assistant/assistantActionExecutor.test.js",
        )


if __name__ == "__main__":
    unittest.main()
