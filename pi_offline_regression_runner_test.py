import unittest

from tools import run_pi_canvas_agent_offline_regression as runner


class PiOfflineRegressionRunnerTests(unittest.TestCase):
    def test_required_p0_p1_fixtures_are_declared(self):
        fixture_ids = {fixture.fixture_id for fixture in runner.REQUIRED_FIXTURES}

        self.assertIn("story_to_video", fixture_ids)
        self.assertIn("text_to_image", fixture_ids)
        self.assertIn("image_to_video", fixture_ids)
        self.assertIn("text_to_image_video", fixture_ids)
        self.assertIn("image_variants", fixture_ids)
        self.assertIn("storyboard_shot_edit", fixture_ids)
        self.assertIn("prompt_preset_generation", fixture_ids)
        self.assertIn("variant_branches", fixture_ids)
        self.assertIn("viral_lab", fixture_ids)
        self.assertIn("knowledge_card", fixture_ids)
        self.assertIn("workflow_template", fixture_ids)
        self.assertIn("team_workflow_template", fixture_ids)
        self.assertIn("multi_agent_story_workflow", fixture_ids)
        self.assertIn("invalid_delta_actions_do_not_execute", fixture_ids)
        self.assertIn("generation_permission_gate", fixture_ids)
        self.assertIn("history_restore_pending_actions", fixture_ids)
        self.assertIn("r5_basic_create_connect_layout_focus", fixture_ids)

    def test_story_to_video_fixture_has_complete_p0_structure(self):
        fixture = next(
            fixture
            for fixture in runner.REQUIRED_FIXTURES
            if fixture.fixture_id == "story_to_video"
        )

        result = runner.check_fixture(fixture.path)

        self.assertEqual(result["workflowKind"], "story_to_video")
        self.assertEqual(result["storyOutlineNodes"], 1)
        self.assertEqual(result["styleBibleNodes"], 1)
        self.assertGreaterEqual(result["shotScriptNodes"], 3)
        self.assertLessEqual(result["shotScriptNodes"], 8)
        self.assertEqual(result["shotKeyframeNodes"], result["shotScriptNodes"])
        self.assertEqual(result["shotVideoPrepNodes"], result["shotScriptNodes"])
        self.assertEqual(result["unauthorizedVideoGenerationActions"], 0)
        self.assertIn("storyboard_grid", result["layouts"])
        self.assertGreaterEqual(result["handledConnections"], result["shotScriptNodes"])

    def test_json_fixture_delta_actions_are_ignored(self):
        fixture = next(
            fixture
            for fixture in runner.REQUIRED_FIXTURES
            if fixture.fixture_id == "invalid_delta_actions_do_not_execute"
        )

        result = runner.check_fixture(fixture.path)

        self.assertEqual(result["finalActions"], 0)
        self.assertEqual(result["deltaActionFrames"], 1)
        self.assertTrue(result["deltaActionsIgnored"])

    def test_generation_gate_fixture_treats_confirmed_video_proposal_as_gated(self):
        fixture = next(
            fixture
            for fixture in runner.REQUIRED_FIXTURES
            if fixture.fixture_id == "generation_permission_gate"
        )

        result = runner.check_fixture(fixture.path)

        self.assertEqual(result["finalActions"], 3)
        self.assertEqual(result["unauthorizedVideoGenerationActions"], 0)

    def test_variant_branches_fixture_is_prepare_only_three_to_five_branches(self):
        fixture = next(
            fixture
            for fixture in runner.REQUIRED_FIXTURES
            if fixture.fixture_id == "variant_branches"
        )

        result = runner.check_fixture(fixture.path)

        self.assertEqual(result["variantBranchActions"], 1)
        self.assertGreaterEqual(result["variantBranchCount"], 3)
        self.assertLessEqual(result["variantBranchCount"], 5)
        self.assertEqual(result["generationActions"], 0)
        self.assertEqual(result["deleteActions"], 0)

    def test_storyboard_shot_edit_fixture_only_updates_one_shot(self):
        fixture = next(
            fixture
            for fixture in runner.REQUIRED_FIXTURES
            if fixture.fixture_id == "storyboard_shot_edit"
        )

        result = runner.check_fixture(fixture.path)

        self.assertEqual(result["storyboardShotEditActions"], 2)
        self.assertEqual(result["storyboardShotEditScope"], "single_shot")
        self.assertEqual(result["storyboardTargetShotIndex"], 2)
        self.assertEqual(result["storyboardEditedShotIndexes"], [2])
        self.assertEqual(result["storyboardNonTargetEditActions"], 0)
        self.assertEqual(result["generationActions"], 0)
        self.assertEqual(result["deleteActions"], 0)

    def test_prompt_preset_generation_fixture_uses_catalog_ids_without_video_auto_run(self):
        fixture = next(
            fixture
            for fixture in runner.REQUIRED_FIXTURES
            if fixture.fixture_id == "prompt_preset_generation"
        )

        result = runner.check_fixture(fixture.path)

        self.assertEqual(result["promptPresetGenerationActions"], 2)
        self.assertEqual(result["promptPresetTextImageActions"], 2)
        self.assertEqual(result["promptPresetVideoActions"], 0)
        self.assertEqual(result["promptPresetActionsMissingIdOrName"], 0)
        self.assertEqual(result["promptPresetTemplateLeaks"], 0)
        self.assertEqual(result["unauthorizedVideoGenerationActions"], 0)

    def test_viral_lab_fixture_has_structured_remake_workflow_without_video_auto_run(self):
        fixture = next(
            fixture
            for fixture in runner.REQUIRED_FIXTURES
            if fixture.fixture_id == "viral_lab"
        )

        result = runner.check_fixture(fixture.path)

        self.assertEqual(result["workflowKind"], "viral_lab")
        self.assertGreaterEqual(result["viralLabCreateNodes"], 4)
        self.assertEqual(result["viralLabMissingMetadataFields"], [])
        self.assertEqual(result["viralLabReferenceAnalysisNodes"], 1)
        self.assertGreaterEqual(result["viralLabRemakeWorkflowNodes"], 3)
        self.assertGreaterEqual(result["viralLabTextImageGenerationActions"], 1)
        self.assertEqual(result["viralLabVideoGenerationActions"], 0)
        self.assertEqual(result["viralLabExternalUrlMentions"], 0)
        self.assertEqual(result["unauthorizedVideoGenerationActions"], 0)
        self.assertEqual(result["deleteActions"], 0)
        self.assertIn("branch_flow", result["layouts"])

    def test_knowledge_card_fixture_is_readonly_and_cited(self):
        fixture = next(
            fixture
            for fixture in runner.REQUIRED_FIXTURES
            if fixture.fixture_id == "knowledge_card"
        )

        result = runner.check_fixture(fixture.path)

        self.assertEqual(result["workflowKind"], "knowledge_card")
        self.assertGreaterEqual(result["knowledgeCardCreateNodes"], 1)
        self.assertEqual(result["knowledgeCardMissingCitationFields"], [])
        self.assertEqual(result["knowledgeCardWriteActions"], 0)
        self.assertEqual(result["knowledgeCardGenerationActions"], 0)
        self.assertEqual(result["knowledgeCardExternalUrlMentions"], 0)
        self.assertEqual(result["deleteActions"], 0)

    def test_workflow_template_fixture_is_project_scoped_and_governed(self):
        fixture = next(
            fixture
            for fixture in runner.REQUIRED_FIXTURES
            if fixture.fixture_id == "workflow_template"
        )

        result = runner.check_fixture(fixture.path)

        self.assertEqual(result["workflowTemplateCreateActions"], 1)
        self.assertEqual(result["workflowTemplateApplyActions"], 1)
        self.assertEqual(result["workflowTemplateMissingMetadataFields"], [])
        self.assertEqual(result["workflowTemplateGenerationActions"], 0)
        self.assertEqual(result["workflowTemplateDeleteActions"], 0)
        self.assertEqual(result["workflowTemplateTeamWriteActions"], 0)
        self.assertTrue(result["workflowTemplateCreateRequiresConfirmation"])
        self.assertTrue(result["workflowTemplateApplyRequiresConfirmation"])

    def test_team_workflow_template_fixture_is_reviewed_published_and_audited(self):
        fixture = next(
            fixture
            for fixture in runner.REQUIRED_FIXTURES
            if fixture.fixture_id == "team_workflow_template"
        )

        result = runner.check_fixture(fixture.path)

        self.assertEqual(result["teamWorkflowTemplatePublishActions"], 1)
        self.assertEqual(result["teamWorkflowTemplateReviewActions"], 1)
        self.assertEqual(result["teamWorkflowTemplateReuseActions"], 1)
        self.assertEqual(result["teamWorkflowTemplateDeprecateActions"], 1)
        self.assertEqual(result["teamWorkflowTemplateRollbackActions"], 1)
        self.assertEqual(result["teamWorkflowTemplateMissingAuditFields"], [])
        self.assertEqual(result["workflowTemplateTeamWriteActions"], 0)
        self.assertEqual(result["workflowTemplateGenerationActions"], 0)
        self.assertEqual(result["workflowTemplateDeleteActions"], 0)
        self.assertTrue(result["teamWorkflowTemplateRequiresConfirmation"])

    def test_multi_agent_story_workflow_fixture_has_least_privilege_handoffs(self):
        fixture = next(
            fixture
            for fixture in runner.REQUIRED_FIXTURES
            if fixture.fixture_id == "multi_agent_story_workflow"
        )

        result = runner.check_fixture(fixture.path)

        self.assertEqual(result["multiAgentWorkflow"], True)
        self.assertGreaterEqual(result["multiAgentRoleCount"], 5)
        self.assertEqual(result["multiAgentPermissionViolations"], [])
        self.assertEqual(result["multiAgentQaReadOnly"], True)
        self.assertEqual(result["unauthorizedVideoGenerationActions"], 0)
        self.assertEqual(result["deleteActions"], 0)

    def test_non_knowledge_fixtures_do_not_report_knowledge_card_gaps(self):
        fixture = next(
            fixture
            for fixture in runner.REQUIRED_FIXTURES
            if fixture.fixture_id == "text_to_image"
        )

        result = runner.check_fixture(fixture.path)

        self.assertEqual(result["knowledgeCardCreateNodes"], 0)
        self.assertEqual(result["knowledgeCardMissingCitationFields"], [])
        self.assertEqual(result["knowledgeCardWriteActions"], 0)
        self.assertEqual(result["knowledgeCardGenerationActions"], 0)

    def test_non_viral_fixtures_do_not_report_viral_lab_gaps(self):
        fixture = next(
            fixture
            for fixture in runner.REQUIRED_FIXTURES
            if fixture.fixture_id == "text_to_image"
        )

        result = runner.check_fixture(fixture.path)

        self.assertEqual(result["viralLabCreateNodes"], 0)
        self.assertEqual(result["viralLabMissingMetadataFields"], [])
        self.assertEqual(result["viralLabTextImageGenerationActions"], 0)
        self.assertEqual(result["viralLabVideoGenerationActions"], 0)

    def test_one_sentence_workflow_fixtures_have_complete_structure(self):
        expected = {
            "text_to_image": {"nodes": 2, "edges": 1, "generation": 1, "layout": "single_chain"},
            "image_to_video": {"nodes": 2, "edges": 1, "generation": 0, "layout": "single_chain"},
            "text_to_image_video": {"nodes": 3, "edges": 2, "generation": 1, "layout": "single_chain"},
            "image_variants": {"nodes": 4, "edges": 3, "generation": 3, "layout": "branch_flow"},
        }
        fixtures = {fixture.fixture_id: fixture for fixture in runner.REQUIRED_FIXTURES}

        for fixture_id, contract in expected.items():
            with self.subTest(fixture_id=fixture_id):
                result = runner.check_fixture(fixtures[fixture_id].path)

                self.assertEqual(result["workflowKind"], fixture_id)
                self.assertEqual(result["workflowCreateNodes"], contract["nodes"])
                self.assertEqual(result["workflowConnectEdges"], contract["edges"])
                self.assertEqual(result["generationActions"], contract["generation"])
                self.assertEqual(result["unauthorizedVideoGenerationActions"], 0)
                self.assertIn(contract["layout"], result["layouts"])


if __name__ == "__main__":
    unittest.main()
