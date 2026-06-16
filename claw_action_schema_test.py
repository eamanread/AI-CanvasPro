import unittest

from services.claw_action_schema import ClawActionSchema


class ClawActionSchemaTests(unittest.TestCase):
    def setUp(self):
        self.schema = ClawActionSchema()

    def test_storyboard_script_create_is_accepted(self):
        # B0-C1 regression: storyboard-script is a first-class node type the
        # ViMax/QMAI director plans create. It was missing from SAFE_NODE_TYPES,
        # so every director plan was rejected here and nothing landed. This test
        # goes THROUGH claw (the production gate the ViMax tests bypassed).
        result = self.schema.validate_actions([
            {"type": "create_node", "id": "vimax-f-shot-0", "nodeType": "storyboard-script",
             "name": "Shot 0", "data": {"shotPrompt": "rainy night", "vimaxFlowId": "f", "vimaxShotIdx": 0}},
        ])
        self.assertTrue(result["valid"], result)
        self.assertEqual(result["actions"][0]["nodeType"], "storyboard-script")

    def test_storyboard_script_table_state_survives(self):
        # B0-C2/C3: the storyboard-script node renders from data.storyboardScript;
        # claw must NOT strip it (it did, so cards rendered empty tables).
        result = self.schema.validate_actions([
            {"type": "create_node", "id": "c0", "nodeType": "storyboard-script", "name": "Shot 0",
             "data": {"storyboardScript": {"rows": [{"镜号": "0", "图片提示词": "rainy street"}]}, "vimaxShotIdx": 0}},
        ])
        self.assertTrue(result["valid"], result)
        sb = result["actions"][0]["data"].get("storyboardScript")
        self.assertIsInstance(sb, dict)
        self.assertEqual(sb["rows"][0]["图片提示词"], "rainy street")

    def test_validate_preserves_story_to_video_metadata_and_layouts(self):
        actions = [
            {
                "id": "act_create_story",
                "type": "create_node",
                "nodeType": "ai-text",
                "name": "故事大纲",
                "data": {
                    "workflowKind": "story_to_video",
                    "workflowGroupId": "wf_1",
                    "workflowStep": "story_outline",
                    "storyDurationSec": 15,
                    "shotDurationSec": 3,
                    "shotVideoPrompt": "slow dolly in",
                },
            },
            {
                "id": "act_layout",
                "type": "layout_nodes",
                "nodeIds": ["act_create_story"],
                "layout": "storyboard_grid",
            },
        ]

        result = self.schema.validate_actions(actions)

        self.assertTrue(result["valid"], result)
        self.assertEqual(result["actions"][1]["layout"], "storyboard_grid")
        self.assertEqual(
            result["actions"][0]["data"]["workflowKind"],
            "story_to_video",
        )
        self.assertEqual(result["actions"][0]["data"]["shotVideoPrompt"], "slow dolly in")

    def test_validate_preserves_nested_story_to_video_metadata(self):
        actions = [
            {"id": "group_placeholder", "type": "create_group", "name": "故事视频"},
            {
                "id": "nested_story",
                "type": "create_node",
                "nodeType": "ai-text",
                "data": {
                    "metadata": {
                        "workflowKind": "story_to_video",
                        "workflowGroupId": "wf_nested",
                        "workflowStep": "story_outline",
                        "storyDurationSec": 15,
                    },
                    "prompt": "write outline",
                },
            },
        ]

        result = self.schema.validate_actions(actions)

        self.assertTrue(result["valid"], result)
        self.assertEqual([action["type"] for action in result["actions"]], ["create_node"])
        self.assertEqual(result["actions"][0]["data"]["workflowKind"], "story_to_video")
        self.assertEqual(result["actions"][0]["data"]["workflowGroupId"], "wf_nested")
        self.assertEqual(result["actions"][0]["data"]["workflowStep"], "story_outline")
        self.assertEqual(result["actions"][0]["data"]["storyDurationSec"], 15)
        self.assertEqual(result["actions"][0]["data"]["prompt"], "write outline")
        self.assertIn("ignored incomplete create_group", " ".join(result["warnings"]))

    def test_validate_repairs_common_live_aliases(self):
        actions = [
            {
                "id": "act_create_story_brief",
                "type": "create_node",
                "data": {
                    "type": "ai-text",
                    "workflowKind": "story_to_video",
                    "workflowStep": "story_outline",
                },
            },
            {
                "type": "connect_nodes",
                "source": "story_brief",
                "target": "act_create_story_brief",
            },
        ]

        result = self.schema.validate_actions(actions)

        self.assertTrue(result["valid"], result)
        self.assertEqual(result["actions"][0]["nodeType"], "ai-text")
        self.assertEqual(result["actions"][1]["from"], "act_create_story_brief")
        self.assertEqual(result["actions"][1]["to"], "act_create_story_brief")
        self.assertTrue(result["warnings"])

    def test_validate_ignores_empty_create_group_placeholder_in_story_workflow(self):
        actions = [
            {"id": "group_placeholder", "type": "create_group", "name": "故事视频"},
            {
                "id": "shot_script_1",
                "type": "create_node",
                "nodeType": "ai-text",
                "data": {
                    "workflowKind": "story_to_video",
                    "workflowStep": "shot_script",
                    "shotIndex": 1,
                },
            },
        ]

        result = self.schema.validate_actions(actions)

        self.assertTrue(result["valid"], result)
        self.assertEqual([action["type"] for action in result["actions"]], ["create_node"])
        self.assertIn("ignored incomplete create_group", " ".join(result["warnings"]))

    def test_validate_recognizes_workflow_batch_when_create_node_uses_action_alias(self):
        actions = [
            {"id": "group_placeholder", "type": "create_group", "name": "故事视频"},
            {"type": "connect_nodes"},
            {
                "id": "story_outline",
                "action": "create_node",
                "nodeType": "ai-text",
                "data": {
                    "workflowKind": "story_to_video",
                    "workflowStep": "story_outline",
                },
            },
        ]

        result = self.schema.validate_actions(actions)

        self.assertTrue(result["valid"], result)
        self.assertEqual([action["type"] for action in result["actions"]], ["create_node"])
        self.assertIn("ignored incomplete create_group", " ".join(result["warnings"]))
        self.assertIn("ignored empty connect_nodes", " ".join(result["warnings"]))

    def test_validate_rejects_unauthorized_video_generation(self):
        result = self.schema.validate_actions(
            [
                {
                    "type": "queue_generation_task",
                    "nodeId": "video_1",
                    "nodeType": "ai-video",
                }
            ]
        )

        self.assertFalse(result["valid"])
        self.assertIn("video generation requires confirmation", " ".join(result["errors"]))

    def test_validate_rejects_dangerous_values(self):
        result = self.schema.validate_actions(
            [
                {
                    "type": "create_node",
                    "nodeType": "ai-text",
                    "data": {"prompt": "Bearer sk-live-secret"},
                }
            ]
        )

        self.assertFalse(result["valid"])
        self.assertIn("dangerous", " ".join(result["errors"]))

    def test_validate_repairs_prompt_preset_generation_aliases_and_preserves_fields(self):
        actions = [
            {
                "id": "text",
                "type": "create_node",
                "nodeType": "ai-text",
            },
            {
                "action": "run_prompt_preset_generation",
                "targetNodeId": "text",
                "nodeType": "ai-text",
                "presetName": "故事大纲",
                "template": "write a concise story outline",
                "inputs": {"durationSec": 15},
            },
        ]

        result = self.schema.validate_actions(actions)

        self.assertTrue(result["valid"], result)
        preset_action = result["actions"][1]
        self.assertEqual(preset_action["type"], "run_prompt_preset_generation")
        self.assertEqual(preset_action["nodeId"], "text")
        self.assertEqual(preset_action["presetName"], "故事大纲")
        self.assertEqual(preset_action["template"], "write a concise story outline")
        self.assertEqual(preset_action["inputs"], {"durationSec": 15})
        self.assertTrue(result["warnings"])

    def test_validate_rejects_video_prompt_preset_generation_without_authorization(self):
        result = self.schema.validate_actions(
            [
                {"id": "video", "type": "create_node", "nodeType": "ai-video"},
                {
                    "type": "run_prompt_preset_generation",
                    "nodeId": "video",
                    "nodeType": "ai-video",
                    "presetId": "video-preset",
                },
            ]
        )

        self.assertFalse(result["valid"])
        self.assertIn("video generation requires confirmation", " ".join(result["errors"]))

    def test_validate_rejects_generation_for_same_batch_video_node_when_node_type_omitted(self):
        result = self.schema.validate_actions(
            [
                {"id": "video", "type": "create_node", "nodeType": "ai-video"},
                {
                    "type": "queue_generation_task",
                    "nodeId": "video",
                },
            ]
        )

        self.assertFalse(result["valid"])
        self.assertIn("video generation requires confirmation", " ".join(result["errors"]))

    def test_validate_rejects_generation_for_context_video_node_when_node_type_omitted(self):
        context = {
            "canvas": {
                "nodes": [
                    {"id": "existing_video", "type": "ai-video"},
                ]
            }
        }
        result = self.schema.validate_actions(
            [
                {
                    "type": "run_prompt_preset_generation",
                    "nodeId": "existing_video",
                    "presetId": "video-preset",
                },
            ],
            context=context,
        )

        self.assertFalse(result["valid"])
        self.assertIn("video generation requires confirmation", " ".join(result["errors"]))

    def test_validate_preserves_viral_lab_metadata(self):
        actions = [
            {
                "id": "viral_analysis",
                "type": "create_node",
                "nodeType": "ai-text",
                "data": {
                    "workflowKind": "viral_lab",
                    "workflowGroupId": "wf_viral_lab",
                    "workflowStep": "reference_analysis",
                    "viralReferenceId": "att-ref-video",
                    "viralSourceType": "video",
                    "viralHook": "cold-open transformation in the first second",
                    "viralPacing": "fast hook, three proof beats, short offer",
                    "viralStructure": "hook-problem-proof-offer",
                    "viralRemakeAngle": "adapt the rhythm to a bakery product demo",
                    "viralRisk": "avoid copying logo, face, music, or exact timing",
                    "viralReplicationStep": "deconstruct_reference",
                    "viralBeatIndex": 1,
                },
            }
        ]

        result = self.schema.validate_actions(actions)

        self.assertTrue(result["valid"], result)
        data = result["actions"][0]["data"]
        self.assertEqual(data["workflowKind"], "viral_lab")
        self.assertEqual(data["viralReferenceId"], "att-ref-video")
        self.assertEqual(data["viralSourceType"], "video")
        self.assertIn("first second", data["viralHook"])
        self.assertIn("proof beats", data["viralPacing"])
        self.assertEqual(data["viralStructure"], "hook-problem-proof-offer")
        self.assertIn("bakery", data["viralRemakeAngle"])
        self.assertIn("avoid copying", data["viralRisk"])
        self.assertEqual(data["viralReplicationStep"], "deconstruct_reference")
        self.assertEqual(data["viralBeatIndex"], 1)

    def test_validate_preserves_llm_wiki_knowledge_card_source_metadata_in_scope(self):
        context = {
            "knowledge": {
                "llmWiki": {
                    "mode": "readonly",
                    "searchResults": [
                        {
                            "title": "Brand Guide",
                            "fileId": "file-brand",
                            "projectId": "project-brand",
                            "citation": "p.12",
                            "citationDisplay": "Brand Guide (file-brand)",
                        }
                    ],
                }
            }
        }

        result = self.schema.validate_actions(
            [
                {
                    "id": "knowledge-card-1",
                    "type": "create_node",
                    "nodeType": "source-text",
                    "data": {
                        "workflowKind": "knowledge_card",
                        "workflowStep": "llm_wiki_card",
                        "sourceTitle": "Brand Guide",
                        "fileId": "file-brand",
                        "projectId": "project-brand",
                        "citation": "p.12",
                        "citationDisplay": "Brand Guide (file-brand)",
                        "summary": "Warm, ingredient-led brand voice.",
                    },
                }
            ],
            context=context,
        )

        self.assertTrue(result["valid"], result)
        data = result["actions"][0]["data"]
        self.assertEqual(data["workflowKind"], "knowledge_card")
        self.assertEqual(data["sourceTitle"], "Brand Guide")
        self.assertEqual(data["fileId"], "file-brand")
        self.assertEqual(data["projectId"], "project-brand")
        self.assertEqual(data["citation"], "p.12")
        self.assertEqual(data["citationDisplay"], "Brand Guide (file-brand)")
        self.assertEqual(data["summary"], "Warm, ingredient-led brand voice.")

    def test_validate_rejects_fabricated_llm_wiki_knowledge_card_source_metadata(self):
        context = {
            "knowledge": {
                "llmWiki": {
                    "mode": "readonly",
                    "searchResults": [
                        {
                            "title": "Brand Guide",
                            "fileId": "file-brand",
                            "projectId": "project-brand",
                            "citation": "p.12",
                        }
                    ],
                }
            }
        }

        result = self.schema.validate_actions(
            [
                {
                    "type": "create_node",
                    "nodeType": "source-text",
                    "data": {
                        "workflowKind": "knowledge_card",
                        "workflowStep": "llm_wiki_card",
                        "sourceTitle": "Invented Guide",
                        "fileId": "file-fake",
                        "projectId": "project-brand",
                        "citation": "p.99",
                    },
                }
            ],
            context=context,
        )

        self.assertFalse(result["valid"])
        self.assertIn("LLM Wiki source", " ".join(result["errors"]))

    def test_validate_workflow_template_preserves_governance_and_confirmation(self):
        result = self.schema.validate_actions(
            [
                {
                    "type": "create_workflow_template",
                    "templateId": "tpl-story",
                    "name": "Reusable story workflow",
                    "nodeIds": ["script", "image"],
                    "scope": "project",
                    "version": "1.0.0",
                    "author": "qa-user",
                    "tags": ["story", "video"],
                    "deprecated": False,
                    "rollbackOf": "tpl-story-0",
                    "description": "Reusable story workflow",
                    "metadata": {"templateKind": "story_to_video"},
                    "requiresConfirmation": False,
                    "riskLevel": "low",
                }
            ],
            context={
                "canvas": {
                    "nodes": [
                        {"id": "script", "type": "ai-text"},
                        {"id": "image", "type": "ai-image"},
                    ]
                }
            },
        )

        self.assertTrue(result["valid"], result)
        self.assertTrue(result["requiresConfirmation"])
        action = result["actions"][0]
        self.assertEqual(action["templateId"], "tpl-story")
        self.assertEqual(action["scope"], "project")
        self.assertEqual(action["version"], "1.0.0")
        self.assertEqual(action["author"], "qa-user")
        self.assertEqual(action["tags"], ["story", "video"])
        self.assertFalse(action["deprecated"])
        self.assertEqual(action["rollbackOf"], "tpl-story-0")
        self.assertEqual(action["description"], "Reusable story workflow")
        self.assertEqual(action["metadata"]["templateKind"], "story_to_video")
        self.assertTrue(action["requiresConfirmation"])
        self.assertEqual(action["riskLevel"], "high")

    def test_validate_apply_workflow_template_requires_project_template_id(self):
        result = self.schema.validate_actions(
            [
                {
                    "type": "apply_workflow_template",
                    "templateId": "tpl-story",
                    "scope": "project",
                    "version": "1.0.0",
                    "requiresConfirmation": False,
                    "riskLevel": "low",
                }
            ]
        )

        self.assertTrue(result["valid"], result)
        action = result["actions"][0]
        self.assertEqual(action["templateId"], "tpl-story")
        self.assertEqual(action["scope"], "project")
        self.assertEqual(action["version"], "1.0.0")
        self.assertTrue(action["requiresConfirmation"])
        self.assertEqual(action["riskLevel"], "high")

    def test_validate_apply_workflow_template_rejects_missing_template_id(self):
        result = self.schema.validate_actions([{"type": "apply_workflow_template"}])

        self.assertFalse(result["valid"])
        self.assertIn("templateId", " ".join(result["errors"]))

    def test_validate_preserves_multi_agent_metadata(self):
        result = self.schema.validate_actions(
            [
                {
                    "id": "story",
                    "type": "create_node",
                    "nodeType": "ai-text",
                    "data": {
                        "workflowKind": "story_to_video",
                        "workflowStep": "story_outline",
                        "agentRole": "storyboard",
                        "agentTaskId": "task-storyboard-1",
                        "agentHandoffTo": "prompt",
                        "agentPermissions": ["create_node", "connect_nodes"],
                    },
                },
                {
                    "type": "layout_nodes",
                    "layout": "storyboard_grid",
                    "nodeIds": ["story"],
                    "agentRole": "layout",
                    "agentTaskId": "task-layout-1",
                    "agentHandoffFrom": "prompt",
                },
            ]
        )

        self.assertTrue(result["valid"], result)
        data = result["actions"][0]["data"]
        self.assertEqual(data["agentRole"], "storyboard")
        self.assertEqual(data["agentTaskId"], "task-storyboard-1")
        self.assertEqual(data["agentHandoffTo"], "prompt")
        self.assertEqual(data["agentPermissions"], ["create_node", "connect_nodes"])
        self.assertEqual(result["actions"][1]["agentRole"], "layout")
        self.assertEqual(result["actions"][1]["agentHandoffFrom"], "prompt")

    def test_placement_field_survives_sanitization_with_safe_subfields(self):
        actions = [
            {
                "id": "act_prep",
                "type": "create_node",
                "nodeType": "ai-image",
                "name": "prep",
                "placement": {
                    "strategy": "below",
                    "anchor": "qmai-shot-shot-002",
                    "junk": "must-not-survive",
                    "x": 99999,
                },
            },
        ]

        result = self.schema.validate_actions(actions)

        self.assertTrue(result["valid"], result)
        placement = result["actions"][0].get("placement")
        self.assertIsNotNone(placement, result["actions"][0])
        self.assertEqual(placement["strategy"], "below")
        self.assertEqual(placement["anchor"], "qmai-shot-shot-002")
        self.assertNotIn("junk", placement)
        self.assertNotIn("x", placement)

    def test_tidy_canvas_action_validates_and_survives(self):
        result = self.schema.validate_actions([{"type": "tidy_canvas", "scope": "lane:r2"}])

        self.assertTrue(result["valid"], result)
        self.assertEqual(result["actions"][0]["type"], "tidy_canvas")
        self.assertEqual(result["actions"][0]["scope"], "lane:r2")

    def test_tidy_canvas_rejects_malformed_scope(self):
        result = self.schema.validate_actions([{"type": "tidy_canvas", "scope": "everything; rm -rf"}])

        self.assertFalse(result["valid"])
        self.assertTrue(any("tidy_canvas scope" in error for error in result["errors"]))

    def test_placement_with_unknown_strategy_is_dropped(self):
        actions = [
            {
                "id": "act_prep",
                "type": "create_node",
                "nodeType": "ai-image",
                "name": "prep",
                "placement": {"strategy": "teleport", "anchor": "n1"},
            },
        ]

        result = self.schema.validate_actions(actions)

        self.assertTrue(result["valid"], result)
        self.assertNotIn("placement", result["actions"][0])


class VimaxStoryCastClawTest(unittest.TestCase):
    """B3a: story/cast comment cards land through real claw with content +
    vimax lineage preserved, and the vimaxShotIdx:-1 sentinel survives."""

    def setUp(self):
        self.schema = ClawActionSchema()

    def test_story_comment_survives_with_content_and_lineage(self):
        result = self.schema.validate_actions([
            {"type": "create_node", "id": "vimax-f1-story", "nodeType": "comment", "name": "故事",
             "data": {"content": "雨夜告别。", "vimaxFlowId": "f1", "vimaxRole": "story", "vimaxShotIdx": -1}},
        ])
        self.assertTrue(result["valid"], result)
        data = result["actions"][0].get("data") or {}
        self.assertEqual(data.get("content"), "雨夜告别。")
        self.assertEqual(data.get("vimaxRole"), "story")
        self.assertEqual(data.get("vimaxShotIdx"), -1, "negative sentinel survives")

    def test_cast_comment_survives(self):
        result = self.schema.validate_actions([
            {"type": "create_node", "id": "vimax-f1-cast", "nodeType": "comment", "name": "角色表",
             "data": {"content": "【角色 0】Alice\n静态: x\n动态: y\n出镜: 是",
                      "vimaxFlowId": "f1", "vimaxRole": "cast", "vimaxShotIdx": -1}},
        ])
        self.assertTrue(result["valid"], result)
        self.assertIn("【角色 0】Alice", (result["actions"][0].get("data") or {}).get("content", ""))


if __name__ == "__main__":
    unittest.main()

