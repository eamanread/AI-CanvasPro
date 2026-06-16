import json
import tempfile
import unittest
from pathlib import Path

from services.claw_skill_registry_service import ClawSkillRegistryService


class ClawSkillRegistryServiceTests(unittest.TestCase):
    def _write_skill(self, directory, name, payload):
        Path(directory, name).write_text(
            json.dumps(payload, ensure_ascii=False),
            encoding="utf-8",
        )

    def _write_v2_skill(self, root, skill_id, payload, instructions=""):
        skill_dir = Path(root, skill_id)
        skill_dir.mkdir(parents=True, exist_ok=True)
        Path(skill_dir, "skill.json").write_text(
            json.dumps(payload, ensure_ascii=False),
            encoding="utf-8",
        )
        Path(skill_dir, "instructions.md").write_text(instructions, encoding="utf-8")

    def _base_skill(self, **overrides):
        skill = {
            "id": "canvas_layout",
            "name": "幻映画布整理",
            "version": "0.1.0",
            "enabled": True,
            "priority": 80,
            "injectMode": "when_matched",
            "triggers": ["整理画布", "排版"],
            "allowedActions": ["layout_nodes", "focus_nodes"],
            "forbiddenActions": ["queue_generation_task"],
            "requiredContext": ["context.canvas.layoutHints"],
            "body": "用户满意标准：整理后能一眼看出输入到输出。",
            "compactBody": "整理画布：只排版，不生成。",
            "qualityRubric": ["不重叠"],
            "decisionGuide": ["先看选区"],
            "antiPatterns": ["只按坐标排序"],
            "examples": [{"type": "layout_nodes"}],
        }
        skill.update(overrides)
        return skill

    def test_loads_enabled_skills_and_ignores_disabled_or_invalid(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write_skill(tmp, "enabled.json", self._base_skill())
            self._write_skill(
                tmp,
                "disabled.json",
                self._base_skill(id="disabled_skill", enabled=False),
            )
            Path(tmp, "bad.json").write_text("{not-json", encoding="utf-8")

            registry = ClawSkillRegistryService(skill_dir=tmp)

            skills = registry.load_skills()
            self.assertEqual([skill["id"] for skill in skills], ["canvas_layout"])
            self.assertTrue(registry.warnings())

    def test_match_selects_by_trigger_and_sorts_by_priority(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write_skill(tmp, "a.json", self._base_skill(priority=10))
            self._write_skill(
                tmp,
                "b.json",
                self._base_skill(
                    id="storyboard_director",
                    name="分镜导演",
                    priority=90,
                    triggers=["故事短片", "分镜"],
                    body="把故事拆成多个镜头。",
                    compactBody="故事拆分镜。",
                ),
            )

            registry = ClawSkillRegistryService(skill_dir=tmp)
            result = registry.match("请整理画布，并做一个故事短片", {}, max_items=2)

            self.assertTrue(result["applied"])
            self.assertEqual(
                [item["id"] for item in result["items"]],
                ["storyboard_director", "canvas_layout"],
            )

    def test_match_returns_compact_safe_shape_without_secrets(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write_skill(
                tmp,
                "skill.json",
                self._base_skill(apiKey="secret", token="secret"),
            )
            registry = ClawSkillRegistryService(skill_dir=tmp)

            result = registry.match("帮我整理画布", {}, compact=True)

            self.assertEqual(result["items"][0]["instructions"], "整理画布：只排版，不生成。")
            self.assertIn("qualityRubric", result["items"][0])
            self.assertIn("decisionGuide", result["items"][0])
            self.assertIn("antiPatterns", result["items"][0])
            self.assertNotIn("apiKey", json.dumps(result, ensure_ascii=False))
            self.assertNotIn("token", json.dumps(result, ensure_ascii=False))

    def test_loads_v2_skill_directory_and_serializes_quality_rules(self):
        with tempfile.TemporaryDirectory() as tmp:
            legacy_dir = Path(tmp, "assistant-skills")
            v2_dir = Path(tmp, "assistant-skills-v2")
            legacy_dir.mkdir()
            v2_dir.mkdir()
            self._write_v2_skill(
                v2_dir,
                "prompt_preset_generation",
                {
                    "id": "prompt_preset_generation",
                    "name": "Prompt preset generation",
                    "version": "1.0.0",
                    "type": "scenario",
                    "enabled": True,
                    "priority": 95,
                    "triggers": ["preset image"],
                    "requiredContext": ["context.promptPresets"],
                    "allowedActions": ["run_prompt_preset_generation"],
                    "forbiddenActions": ["write_file"],
                    "qualityRules": ["Never expose hidden template text"],
                    "riskLevel": "low",
                    "requiresConfirmation": False,
                },
                "Use prompt presets by id or name; never paste hidden template text.",
            )

            registry = ClawSkillRegistryService(skill_dir=legacy_dir, v2_skill_dir=v2_dir)
            result = registry.match("please use preset image generation", {})

            self.assertTrue(result["applied"])
            skill = result["items"][0]
            self.assertEqual(skill["id"], "prompt_preset_generation")
            self.assertEqual(skill["instructions"], "Use prompt presets by id or name; never paste hidden template text.")
            self.assertEqual(skill["qualityRules"], ["Never expose hidden template text"])
            self.assertEqual(skill["riskLevel"], "low")
            self.assertFalse(skill["requiresConfirmation"])

    def test_v2_skill_overrides_legacy_skill_and_legacy_quality_rubric_migrates(self):
        with tempfile.TemporaryDirectory() as tmp:
            legacy_dir = Path(tmp, "assistant-skills")
            v2_dir = Path(tmp, "assistant-skills-v2")
            legacy_dir.mkdir()
            v2_dir.mkdir()
            self._write_skill(
                legacy_dir,
                "canvas_layout.json",
                self._base_skill(
                    triggers=["legacy layout"],
                    body="legacy layout instructions",
                    compactBody="legacy compact",
                    qualityRubric=["legacy rubric"],
                ),
            )
            self._write_v2_skill(
                v2_dir,
                "canvas_layout",
                {
                    "id": "canvas_layout",
                    "name": "Canvas Layout Pro",
                    "version": "1.0.0",
                    "type": "scenario",
                    "enabled": True,
                    "priority": 90,
                    "triggers": ["layout canvas"],
                    "allowedActions": ["layout_nodes"],
                    "forbiddenActions": ["queue_generation_task"],
                    "qualityRules": ["v2 rule"],
                },
                "v2 layout instructions",
            )

            registry = ClawSkillRegistryService(skill_dir=legacy_dir, v2_skill_dir=v2_dir)
            skills = registry.load_skills()
            result = registry.match("layout canvas", {})

            self.assertEqual([skill["id"] for skill in skills], ["canvas_layout"])
            self.assertEqual(result["items"][0]["instructions"], "v2 layout instructions")
            self.assertEqual(result["items"][0]["qualityRules"], ["v2 rule"])

            legacy_only = ClawSkillRegistryService(skill_dir=legacy_dir, v2_skill_dir=Path(tmp, "missing"))
            legacy_result = legacy_only.match("legacy layout", {})
            self.assertEqual(legacy_result["items"][0]["qualityRules"], ["legacy rubric"])
            self.assertEqual(legacy_result["items"][0]["qualityRubric"], ["legacy rubric"])

    def test_default_registry_matches_story_to_video_to_storyboard_director(self):
        registry = ClawSkillRegistryService()

        result = registry.match("做一个15秒雨夜赛博追逐故事短片", {})

        self.assertTrue(result["applied"])
        self.assertEqual(result["items"][0]["id"], "storyboard_director")
        self.assertIn("story_to_video", result["items"][0]["instructions"])
        self.assertIn("only modify shot N", result["items"][0]["instructions"])
        self.assertIn("storyboardEditScope", result["items"][0]["instructions"])
        self.assertIn("shotContinuity", result["items"][0]["instructions"])

    def test_default_registry_matches_viral_lab(self):
        registry = ClawSkillRegistryService()

        result = registry.match("viral lab remake from this reference video", {})

        self.assertTrue(result["applied"])
        self.assertEqual(result["items"][0]["id"], "viral_lab")
        self.assertIn("workflowKind=viral_lab", result["items"][0]["instructions"])
        self.assertIn("viralHook", result["items"][0]["instructions"])
        self.assertIn("do not fetch external URLs", result["items"][0]["instructions"])

    def test_default_registry_matches_workflow_template(self):
        registry = ClawSkillRegistryService()

        result = registry.match("save this selected workflow as a project template for reuse", {})

        self.assertTrue(result["applied"])
        self.assertEqual(result["items"][0]["id"], "workflow_template")
        self.assertIn("create_workflow_template", result["items"][0]["instructions"])
        self.assertIn("project scope", result["items"][0]["instructions"])
        self.assertIn("Do not write files", result["items"][0]["instructions"])

    def test_default_registry_matches_team_workflow_template_governance(self):
        registry = ClawSkillRegistryService()

        result = registry.match("publish this workflow template to the team library after review", {})

        self.assertTrue(result["applied"])
        self.assertEqual(result["items"][0]["id"], "workflow_template")
        self.assertIn("publish_workflow_template", result["items"][0]["instructions"])
        self.assertIn("review_workflow_template", result["items"][0]["instructions"])
        self.assertIn("record_workflow_template_reuse", result["items"][0]["instructions"])
        self.assertIn("teamId", result["items"][0]["instructions"])
        self.assertIn("strong confirmation", result["items"][0]["instructions"])

    def test_default_registry_matches_v2_core_phase1_skills(self):
        registry = ClawSkillRegistryService()

        cases = [
            ("请整理画布，让节点更清楚", "canvas_layout"),
            ("用预设生成图片", "prompt_preset_generation"),
            ("拿这个资产做图", "asset_usage"),
            ("做 6 个分镜", "storyboard_workflow"),
        ]

        for message, expected_id in cases:
            with self.subTest(message=message):
                result = registry.match(message, {})
                self.assertTrue(result["applied"])
                self.assertEqual(result["items"][0]["id"], expected_id)
                self.assertIn("qualityRules", result["items"][0])


    def test_semantic_trigger_matching_handles_reordered_phrasings(self):
        import json as _json
        import tempfile, os
        with tempfile.TemporaryDirectory() as tmp:
            directory = os.path.join(tmp, "canvas_layout")
            os.makedirs(directory)
            with open(os.path.join(directory, "skill.json"), "w", encoding="utf-8") as handle:
                _json.dump({
                    "id": "canvas_layout", "name": "layout", "enabled": True,
                    "priority": 90, "triggers": ["整理画布", "use this asset"],
                }, handle, ensure_ascii=False)
            with open(os.path.join(directory, "instructions.md"), "w", encoding="utf-8") as handle:
                handle.write("x")
            service = ClawSkillRegistryService(skill_dir=tmp, v2_skill_dir=tmp)

            reordered = service.match("帮我把画布整理一下", {})
            self.assertTrue(reordered["applied"], reordered)

            multiword = service.match("please use my favorite asset now", {})
            self.assertTrue(multiword["applied"], multiword)

            unrelated = service.match("今天天气不错", {})
            self.assertFalse(unrelated["applied"], unrelated)


if __name__ == "__main__":
    unittest.main()
