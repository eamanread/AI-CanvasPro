import unittest

from services.canvas_agent_action_schema import CanvasAgentActionSchema


class CanvasAgentActionSchemaTests(unittest.TestCase):
    def setUp(self):
        self.schema = CanvasAgentActionSchema()
        self.key_prefix = "s" + "k-"

    def test_safe_create_comment_node_passes(self):
        result = self.schema.validate_actions(
            [
                {
                    "type": "create_node",
                    "nodeType": "comment",
                    "name": "Canvas note",
                    "data": {"content": "Check pacing before generation."},
                }
            ]
        )

        self.assertTrue(result["valid"], result)
        self.assertEqual(result["actions"][0]["type"], "create_node")
        self.assertEqual(result["actions"][0]["nodeType"], "comment")

    def test_rejects_unauthorized_generation_for_existing_video_node(self):
        context = {"canvas": {"nodes": [{"id": "video-1", "type": "ai-video"}]}}

        result = self.schema.validate_actions(
            [
                {
                    "type": "queue_generation_task",
                    "nodeId": "video-1",
                }
            ],
            context=context,
            video_authorized=False,
        )

        self.assertFalse(result["valid"])
        self.assertIn("video generation requires confirmation", " ".join(result["errors"]))

    def test_repairs_common_create_node_aliases(self):
        result = self.schema.validate_actions(
            [
                {
                    "actionType": "create_node",
                    "id": "text-brief",
                    "data": {"type": "ai-text", "prompt": "Draft a concise brief."},
                }
            ]
        )

        self.assertTrue(result["valid"], result)
        action = result["actions"][0]
        self.assertEqual(action["type"], "create_node")
        self.assertEqual(action["nodeType"], "ai-text")
        self.assertTrue(result["warnings"])

    def test_repairs_connect_endpoint_aliases_for_same_batch_create_id(self):
        result = self.schema.validate_actions(
            [
                {
                    "id": "act_create_story_brief_node",
                    "type": "create_node",
                    "nodeType": "ai-text",
                },
                {
                    "id": "act_create_review_note_node",
                    "type": "create_node",
                    "nodeType": "comment",
                },
                {
                    "type": "connect_nodes",
                    "source": "story_brief",
                    "target": "review_note",
                },
            ]
        )

        self.assertTrue(result["valid"], result)
        action = result["actions"][2]
        self.assertEqual(action["from"], "act_create_story_brief_node")
        self.assertEqual(action["to"], "act_create_review_note_node")
        self.assertNotIn("source", action)
        self.assertNotIn("target", action)
        self.assertTrue(result["warnings"])

    def test_connect_nodes_preserves_handle_aliases(self):
        context = {
            "canvas": {
                "nodes": [
                    {"id": "text", "type": "ai-text"},
                    {"id": "image", "type": "ai-image"},
                ]
            }
        }

        result = self.schema.validate_actions(
            [
                {
                    "type": "connect_nodes",
                    "sourceId": "text",
                    "targetId": "image",
                    "sourcePort": "text-output",
                    "targetPort": "prompt-input",
                }
            ],
            context=context,
        )

        self.assertTrue(result["valid"], result)
        action = result["actions"][0]
        self.assertEqual(action["from"], "text")
        self.assertEqual(action["to"], "image")
        self.assertEqual(action["sourceHandle"], "text-output")
        self.assertEqual(action["targetHandle"], "prompt-input")

    def test_canvas_agent_update_node_alias_passes(self):
        context = {"canvas": {"nodes": [{"id": "node-1", "type": "comment"}]}}

        result = self.schema.validate_actions(
            [
                {
                    "type": "update_node",
                    "nodeId": "node-1",
                    "data": {"content": "Updated note"},
                }
            ],
            context=context,
        )

        self.assertTrue(result["valid"], result)
        self.assertEqual(result["actions"][0]["type"], "update_node")
        self.assertEqual(result["actions"][0]["nodeId"], "node-1")

    def test_canvas_agent_start_generation_video_is_valid_but_requires_confirmation(self):
        result = self.schema.validate_actions(
            [
                {
                    "type": "start_generation",
                    "nodeId": "video-1",
                    "nodeType": "ai-video",
                    "prompt": "make a cinematic shot",
                }
            ],
            context={"canvas": {"nodes": [{"id": "video-1", "type": "ai-video"}]}},
        )

        self.assertTrue(result["valid"], result)
        self.assertTrue(result.get("requiresConfirmation"))
        self.assertTrue(result["actions"][0]["requiresConfirmation"])
        self.assertEqual(result["actions"][0]["type"], "start_generation")

    def test_canvas_agent_forbidden_shell_action_is_rejected_as_forbidden(self):
        result = self.schema.validate_actions(
            [{"type": "run_shell", "command": "whoami"}],
            context={},
        )

        self.assertFalse(result["valid"])
        self.assertIn("forbidden", " ".join(result["errors"]).lower())

    def test_pi_schema_repairs_real_model_aliases(self):
        result = self.schema.validate_actions(
            [
                {
                    "action": "create_node",
                    "id": "script_1",
                    "data": {"type": "ai-text", "prompt": "write a script"},
                },
                {
                    "operation": "create_node",
                    "id": "image_1",
                    "data": {"nodeType": "ai-image", "prompt": "key frame"},
                },
                {
                    "actionType": "connect_nodes",
                    "data": {"sourceId": "script_1", "targetId": "image_1"},
                },
            ],
            context={"canvas": {"nodes": []}},
        )

        self.assertTrue(result["valid"], result.get("errors"))
        self.assertEqual(result["actions"][0]["type"], "create_node")
        self.assertEqual(result["actions"][0]["nodeType"], "ai-text")
        self.assertEqual(result["actions"][2]["from"], "script_1")
        self.assertEqual(result["actions"][2]["to"], "image_1")

    def test_pi_schema_rejects_forbidden_tool_shapes_as_forbidden(self):
        for action in [
            {"tool": "write_file", "path": "D:\\secret.txt"},
            {"toolName": "browser.open", "url": "http://example.com"},
            {"operation": "mcp.call", "server": "filesystem"},
            {"actionType": "package.install", "name": "unsafe"},
        ]:
            with self.subTest(action=action):
                result = self.schema.validate_actions([action], context={"canvas": {"nodes": []}})

                self.assertFalse(result["valid"])
                self.assertIn("forbidden", " ".join(result["errors"]).lower())

    def test_pi_schema_blocks_video_generation_without_node_type_when_target_is_video_node(self):
        result = self.schema.validate_actions(
            [{"type": "queue_generation_task", "nodeId": "video-1"}],
            context={"canvas": {"nodes": [{"id": "video-1", "type": "ai-video"}]}},
            video_authorized=False,
        )

        self.assertFalse(result["valid"])
        self.assertIn("video generation requires confirmation", " ".join(result["errors"]))


    def test_auto_layout_intent_rejects_generation_and_prompt_edits(self):
        context = {
            "assistantIntent": {"id": "auto_layout"},
            "canvas": {"nodes": [{"id": "n1", "type": "ai-image"}]},
        }
        for action in [
            {"type": "queue_generation_task", "nodeId": "n1", "nodeType": "ai-image"},
            {"type": "run_prompt_preset_generation", "nodeId": "n1", "nodeType": "ai-image", "presetId": "p1"},
            {"type": "update_node_data", "nodeId": "n1", "data": {"prompt": "new prompt"}},
            {"type": "create_node", "nodeType": "ai-image", "data": {"prompt": "new image"}},
            {"type": "delete_node", "nodeId": "n1"},
        ]:
            with self.subTest(action=action):
                result = self.schema.validate_actions([action], context=context)

                self.assertFalse(result["valid"])
                self.assertIn("auto_layout", " ".join(result["errors"]))

    def test_auto_layout_intent_allows_layout_only_actions(self):
        context = {
            "assistantIntent": {"id": "auto_layout"},
            "canvas": {"nodes": [{"id": "n1", "type": "ai-image"}, {"id": "n2", "type": "comment"}]},
        }

        result = self.schema.validate_actions(
            [
                {"type": "layout_nodes", "layout": "single_chain", "nodeIds": ["n1", "n2"]},
                {"type": "move_nodes", "nodeIds": ["n1", "n2"]},
                {"type": "focus_nodes", "nodeIds": ["n1"]},
                {"type": "rename_node", "nodeId": "n2", "name": "Layout note"},
                {"type": "create_group", "nodeIds": ["n1", "n2"], "name": "Group"},
                {"type": "set_viewport", "nodeIds": ["n1"]},
            ],
            context=context,
        )

        self.assertTrue(result["valid"], result)

    def test_prompt_surgery_preserves_diff_metadata_and_undo_patch(self):
        context = {"canvas": {"nodes": [{"id": "prompt-1", "type": "ai-image"}]}}

        result = self.schema.validate_actions(
            [
                {
                    "type": "update_node_data",
                    "nodeId": "prompt-1",
                    "data": {"prompt": "new rainy neon street"},
                    "previousPrompt": "old rainy street",
                    "nextPrompt": "new rainy neon street",
                    "promptDiff": "- old rainy street\n+ new rainy neon street",
                    "undoPatch": {
                        "type": "update_node_data",
                        "nodeId": "prompt-1",
                        "data": {"prompt": "old rainy street"},
                    },
                }
            ],
            context=context,
        )

        self.assertTrue(result["valid"], result)
        action = result["actions"][0]
        self.assertEqual(action["previousPrompt"], "old rainy street")
        self.assertEqual(action["nextPrompt"], "new rainy neon street")
        self.assertIn("+ new rainy neon street", action["promptDiff"])
        self.assertEqual(action["undoPatch"]["data"]["prompt"], "old rainy street")
        self.assertNotIn("delete", repr(action["undoPatch"]).lower())

    def test_duplicate_nodes_preserves_variant_branch_fields(self):
        context = {
            "canvas": {
                "nodes": [
                    {"id": "script", "type": "ai-text"},
                    {"id": "image", "type": "ai-image"},
                ]
            }
        }

        result = self.schema.validate_actions(
            [
                {
                    "type": "duplicate_nodes",
                    "nodeIds": ["script", "image"],
                    "variants": [
                        {"id": "noir", "label": "Noir", "difference": "rain and contrast"},
                        {"id": "pop", "label": "Pop", "difference": "bright product colors"},
                        {"id": "doc", "label": "Documentary", "difference": "handheld realism"},
                    ],
                    "groupBranches": True,
                    "gap": 180,
                    "padding": 56,
                    "metadata": {"assistantIntent": "variant_branches"},
                }
            ],
            context=context,
        )

        self.assertTrue(result["valid"], result)
        action = result["actions"][0]
        self.assertEqual(action["type"], "duplicate_nodes")
        self.assertEqual(len(action["variants"]), 3)
        self.assertEqual(action["variants"][0]["id"], "noir")
        self.assertEqual(action["variants"][1]["difference"], "bright product colors")
        self.assertTrue(action["groupBranches"])
        self.assertEqual(action["gap"], 180)
        self.assertEqual(action["padding"], 56)
        self.assertEqual(action["metadata"]["assistantIntent"], "variant_branches")

    def test_duplicate_nodes_limits_variant_descriptors_to_five(self):
        context = {"canvas": {"nodes": [{"id": "n1", "type": "comment"}]}}

        result = self.schema.validate_actions(
            [
                {
                    "type": "duplicate_nodes",
                    "nodeIds": ["n1"],
                    "variants": [
                        {"id": "a"},
                        {"id": "b"},
                        {"id": "c"},
                        {"id": "d"},
                        {"id": "e"},
                        {"id": "f"},
                    ],
                }
            ],
            context=context,
        )

        self.assertTrue(result["valid"], result)
        self.assertEqual([item["id"] for item in result["actions"][0]["variants"]], ["a", "b", "c", "d", "e"])

    def test_storyboard_shot_edit_preserves_single_shot_metadata(self):
        context = {
            "canvas": {
                "nodes": [
                    {"id": "shot-script-2", "type": "ai-text"},
                    {"id": "shot-keyframe-2", "type": "ai-image"},
                ]
            }
        }

        result = self.schema.validate_actions(
            [
                {
                    "type": "update_node_data",
                    "nodeId": "shot-keyframe-2",
                    "metadata": {
                        "storyboardEditScope": "single_shot",
                        "targetShotIndex": 2,
                    },
                    "data": {
                        "workflowKind": "story_to_video",
                        "workflowStep": "shot_keyframe",
                        "storyboardId": "storyboard-rain",
                        "shotIndex": 2,
                        "shotTitle": "Market turn",
                        "shotVisual": "Courier cuts through a holographic food market.",
                        "shotCamera": "Fast lateral tracking shot.",
                        "shotStyle": "Rainy neon, shallow depth of field.",
                        "shotPrompt": "Rainy neon market chase keyframe.",
                        "shotVideoPrompt": "Lateral tracking through hologram stalls.",
                        "shotContinuity": "Keep the same red jacket and drone threat from shots 1 and 3.",
                    },
                }
            ],
            context=context,
        )

        self.assertTrue(result["valid"], result)
        action = result["actions"][0]
        self.assertEqual(action["metadata"]["storyboardEditScope"], "single_shot")
        self.assertEqual(action["metadata"]["targetShotIndex"], 2)
        self.assertEqual(action["data"]["storyboardId"], "storyboard-rain")
        self.assertEqual(action["data"]["shotCamera"], "Fast lateral tracking shot.")
        self.assertEqual(action["data"]["shotStyle"], "Rainy neon, shallow depth of field.")
        self.assertIn("same red jacket", action["data"]["shotContinuity"])

    def test_prompt_preset_generation_keeps_id_name_inputs_and_sanitized_template_body(self):
        context = {"canvas": {"nodes": [{"id": "image-1", "type": "ai-image"}]}}

        result = self.schema.validate_actions(
            [
                {
                    "type": "run_prompt_preset_generation",
                    "nodeId": "image-1",
                    "nodeType": "ai-image",
                    "presetId": "product-hero",
                    "presetName": "Product Hero",
                    "template": "OPTIONAL SAFE TEMPLATE BODY",
                    "inputs": {
                        "brief": "warm bakery window",
                        "apiKey": self.key_prefix + "preset-secret",
                        "localPath": "D:\\private\\asset.png",
                    },
                }
            ],
            context=context,
        )

        self.assertTrue(result["valid"], result)
        action = result["actions"][0]
        self.assertEqual(action["presetId"], "product-hero")
        self.assertEqual(action["presetName"], "Product Hero")
        self.assertEqual(action["inputs"], {"brief": "warm bakery window"})
        self.assertEqual(action["template"], "OPTIONAL SAFE TEMPLATE BODY")
        self.assertNotIn("preset-secret", repr(action))
        self.assertNotIn("D:\\private", repr(action))

    def test_viral_lab_metadata_survives_canvas_agent_schema(self):
        result = self.schema.validate_actions(
            [
                {
                    "type": "create_node",
                    "nodeType": "ai-text",
                    "data": {
                        "workflowKind": "viral_lab",
                        "workflowStep": "reference_analysis",
                        "viralReferenceId": "asset-ref-1",
                        "viralSourceType": "article",
                        "viralHook": "numbered myth-busting opening",
                        "viralPacing": "fast listicle beats",
                        "viralStructure": "hook-list-proof-CTA",
                        "viralRemakeAngle": "remake as a product education carousel",
                        "viralRisk": "do not copy screenshots or brand marks",
                    },
                }
            ],
            context={"canvas": {"nodes": []}},
        )

        self.assertTrue(result["valid"], result)
        data = result["actions"][0]["data"]
        self.assertEqual(data["workflowKind"], "viral_lab")
        self.assertEqual(data["viralReferenceId"], "asset-ref-1")
        self.assertEqual(data["viralSourceType"], "article")
        self.assertEqual(data["viralStructure"], "hook-list-proof-CTA")
        self.assertIn("product education", data["viralRemakeAngle"])

    def test_llm_wiki_knowledge_card_metadata_survives_canvas_agent_schema(self):
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
            },
            "canvas": {"nodes": []},
        }

        result = self.schema.validate_actions(
            [
                {
                    "type": "create_node",
                    "nodeType": "comment",
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

    def test_llm_wiki_knowledge_card_rejects_out_of_scope_canvas_agent_source(self):
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
            },
            "canvas": {"nodes": []},
        }

        result = self.schema.validate_actions(
            [
                {
                    "type": "create_node",
                    "nodeType": "comment",
                    "data": {
                        "workflowKind": "knowledge_card",
                        "sourceTitle": "Fake Guide",
                        "fileId": "file-fake",
                    },
                }
            ],
            context=context,
        )

        self.assertFalse(result["valid"])
        self.assertIn("LLM Wiki source", " ".join(result["errors"]))

    def test_workflow_template_create_preserves_governance_and_forces_confirmation(self):
        context = {
            "canvas": {
                "nodes": [
                    {"id": "script", "type": "ai-text"},
                    {"id": "image", "type": "ai-image"},
                ]
            }
        }

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
                    "metadata": {"description": "Reusable text to image story workflow"},
                    "requiresConfirmation": False,
                    "riskLevel": "low",
                }
            ],
            context=context,
        )

        self.assertTrue(result["valid"], result)
        self.assertTrue(result.get("requiresConfirmation"))
        action = result["actions"][0]
        self.assertEqual(action["templateId"], "tpl-story")
        self.assertEqual(action["scope"], "project")
        self.assertEqual(action["version"], "1.0.0")
        self.assertEqual(action["author"], "qa-user")
        self.assertEqual(action["tags"], ["story", "video"])
        self.assertFalse(action["deprecated"])
        self.assertEqual(action["rollbackOf"], "tpl-story-0")
        self.assertEqual(action["metadata"]["description"], "Reusable text to image story workflow")
        self.assertTrue(action["requiresConfirmation"])
        self.assertEqual(action["riskLevel"], "high")

    def test_workflow_template_apply_preserves_governance_and_forces_confirmation(self):
        result = self.schema.validate_actions(
            [
                {
                    "type": "apply_workflow_template",
                    "templateId": "tpl-story",
                    "scope": "project",
                    "version": "1.0.0",
                    "offset": {"x": 640, "y": 220},
                    "requiresConfirmation": False,
                    "riskLevel": "low",
                }
            ],
            context={"canvas": {"nodes": []}},
        )

        self.assertTrue(result["valid"], result)
        self.assertTrue(result.get("requiresConfirmation"))
        action = result["actions"][0]
        self.assertEqual(action["templateId"], "tpl-story")
        self.assertEqual(action["scope"], "project")
        self.assertEqual(action["version"], "1.0.0")
        self.assertEqual(action["offset"], {"x": 640, "y": 220})
        self.assertTrue(action["requiresConfirmation"])
        self.assertEqual(action["riskLevel"], "high")

    def test_workflow_template_rejects_unsafe_metadata(self):
        result = self.schema.validate_actions(
            [
                {
                    "type": "create_workflow_template",
                    "templateId": "tpl-story",
                    "name": "Unsafe template",
                    "nodeIds": ["script"],
                    "scope": "project",
                    "metadata": {"localPath": "D:\\private\\template.json"},
                }
            ],
            context={"canvas": {"nodes": [{"id": "script", "type": "ai-text"}]}},
        )

        self.assertFalse(result["valid"])
        self.assertIn("dangerous", " ".join(result["errors"]))

    def test_team_workflow_template_governance_actions_preserve_audit_fields(self):
        result = self.schema.validate_actions(
            [
                {
                    "type": "publish_workflow_template",
                    "templateId": "tpl-team-story",
                    "scope": "team",
                    "teamId": "team-alpha",
                    "version": "1.0.0",
                    "author": "alice",
                    "reviewStatus": "approved",
                    "reviewer": "lead",
                    "publishedBy": "lead",
                    "tags": ["story", "team"],
                    "requiresConfirmation": False,
                    "riskLevel": "low",
                },
                {
                    "type": "record_workflow_template_reuse",
                    "templateId": "tpl-team-story",
                    "scope": "team",
                    "teamId": "team-alpha",
                    "userId": "designer-b",
                    "consumerProjectId": "project-b",
                    "reuseCount": 2,
                },
                {
                    "type": "rollback_workflow_template",
                    "templateId": "tpl-team-story",
                    "scope": "team",
                    "teamId": "team-alpha",
                    "rollbackToVersion": "1.0.0",
                    "version": "1.0.1",
                    "author": "lead",
                },
            ],
            context={"canvas": {"nodes": []}},
        )

        self.assertTrue(result["valid"], result)
        self.assertTrue(result.get("requiresConfirmation"))
        publish, reuse, rollback = result["actions"]
        self.assertEqual(publish["templateId"], "tpl-team-story")
        self.assertEqual(publish["scope"], "team")
        self.assertEqual(publish["teamId"], "team-alpha")
        self.assertEqual(publish["reviewStatus"], "approved")
        self.assertEqual(publish["reviewer"], "lead")
        self.assertEqual(publish["publishedBy"], "lead")
        self.assertEqual(publish["tags"], ["story", "team"])
        self.assertTrue(publish["requiresConfirmation"])
        self.assertEqual(publish["riskLevel"], "high")
        self.assertEqual(reuse["consumerProjectId"], "project-b")
        self.assertEqual(reuse["reuseCount"], 2)
        self.assertEqual(rollback["rollbackToVersion"], "1.0.0")
        self.assertEqual(rollback["version"], "1.0.1")

    def test_team_workflow_template_publish_requires_team_scope_and_team_id(self):
        result = self.schema.validate_actions(
            [
                {
                    "type": "publish_workflow_template",
                    "templateId": "tpl-team-story",
                    "scope": "project",
                    "version": "1.0.0",
                }
            ],
            context={"canvas": {"nodes": []}},
        )

        self.assertFalse(result["valid"])
        message = " ".join(result["errors"])
        self.assertIn("team scope", message)
        self.assertIn("teamId", message)

    def test_multi_agent_metadata_survives_canvas_agent_schema(self):
        result = self.schema.validate_actions(
            [
                {
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
                    "nodeIds": ["act_create_story"],
                    "agentRole": "layout",
                    "agentTaskId": "task-layout-1",
                    "agentHandoffFrom": "prompt",
                },
            ],
            context={"canvas": {"nodes": [{"id": "act_create_story", "type": "ai-text"}]}},
        )

        self.assertTrue(result["valid"], result)
        create_data = result["actions"][0]["data"]
        self.assertEqual(create_data["agentRole"], "storyboard")
        self.assertEqual(create_data["agentTaskId"], "task-storyboard-1")
        self.assertEqual(create_data["agentHandoffTo"], "prompt")
        self.assertEqual(create_data["agentPermissions"], ["create_node", "connect_nodes"])
        layout = result["actions"][1]
        self.assertEqual(layout["agentRole"], "layout")
        self.assertEqual(layout["agentHandoffFrom"], "prompt")


    def test_blocks_actions_forbidden_by_matched_skills(self):
        import json
        import os
        import tempfile

        schema = CanvasAgentActionSchema()
        with tempfile.TemporaryDirectory() as tmp:
            skill_dir = os.path.join(tmp, "canvas_layout")
            os.makedirs(skill_dir)
            with open(os.path.join(skill_dir, "skill.json"), "w", encoding="utf-8") as handle:
                json.dump({
                    "id": "canvas_layout",
                    "allowedActions": ["layout_nodes", "focus_nodes"],
                    "forbiddenActions": ["queue_generation_task"],
                }, handle)
            schema._skill_dir = tmp

            blocked = schema.validate_actions(
                [{"type": "queue_generation_task", "nodeId": "n1", "nodeType": "ai-image"}],
                matched_skills=["canvas_layout"],
            )
            self.assertFalse(blocked.get("valid", True))
            self.assertTrue(blocked.get("blockedBySkill"))
            self.assertTrue(any("queue_generation_task" in str(e) for e in blocked.get("errors", [])))

            outside_allowed = schema.validate_actions(
                [{"type": "create_node", "nodeType": "text"}],
                matched_skills=["canvas_layout"],
            )
            self.assertFalse(outside_allowed.get("valid", True))
            self.assertTrue(outside_allowed.get("blockedBySkill"))

            ok = schema.validate_actions(
                [{"type": "layout_nodes", "nodeIds": ["n1"]}],
                matched_skills=["canvas_layout"],
            )
            self.assertNotEqual(ok.get("blockedBySkill"), True)

            unknown_skill = schema.validate_actions(
                [{"type": "create_node", "nodeType": "text"}],
                matched_skills=["no_such_skill"],
            )
            self.assertNotEqual(unknown_skill.get("blockedBySkill"), True)


if __name__ == "__main__":
    unittest.main()
