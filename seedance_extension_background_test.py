import json
import unittest
import subprocess
from pathlib import Path


BACKGROUND_PATH = (
    Path(__file__).resolve().parent
    / "integrations"
    / "seedance_extension_bridge"
    / "extension"
    / "background.js"
)
MANIFEST_PATH = BACKGROUND_PATH.with_name("manifest.json")


class SeedanceExtensionBackgroundTests(unittest.TestCase):
    def test_background_polls_active_dreamina_tabs_as_heartbeat_fallback(self):
        source = BACKGROUND_PATH.read_text(encoding="utf-8")

        self.assertIn("startSeedancePageStatusPolling", source)
        self.assertIn("reportActiveSeedancePageStatus", source)
        self.assertIn("collectSeedanceStatusFromPage", source)
        self.assertIn("reportSeedanceTabStatusWithScripting", source)
        self.assertIn("chrome.tabs.query", source)
        self.assertIn("chrome.scripting.executeScript", source)
        self.assertIn("chrome.tabs.onUpdated.addListener", source)
        self.assertIn("chrome.tabs.onActivated.addListener", source)
        self.assertIn("getPageInfo", source)
        self.assertIn("reportSeedancePageStatus", source)

    def test_content_get_page_info_includes_login_and_balance_signals(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        block = source.split("function getPageInfo()", 1)[1].split("function findByText", 1)[0]

        self.assertIn("hasLoginButton", block)
        self.assertIn("creditText", block)
        self.assertIn("hasLogoutButton", block)
        self.assertIn("readDreaminaLoginStatus()", block)
        self.assertIn("__GTW_LOGIN_STATUS__", source)
        self.assertIn("hasExplicitLoginStatus", block)
        self.assertIn("authenticated", block)
        self.assertIn("hasUserAvatar", block)

    def test_content_page_info_reports_account_data_and_sign_in_text(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        block = source.split("function getPageInfo()", 1)[1].split("function findByText", 1)[0]

        self.assertIn("extractSeedanceAccountData", source)
        self.assertIn("account", block)
        self.assertIn("loginText", block)
        self.assertIn("balanceText", source)

    def test_background_forwards_account_data_to_workbench(self):
        source = BACKGROUND_PATH.read_text(encoding="utf-8")
        block = source.split("function buildSeedancePageStatusFromInfo", 1)[1].split(
            "function isSeedancePageUrl", 1
        )[0]

        self.assertIn("account", block)
        self.assertIn("balanceText", block)
        self.assertIn("loginText", block)
        self.assertIn("hasUserAvatar", block)

    def test_background_page_probe_uses_avatar_as_login_signal(self):
        source = BACKGROUND_PATH.read_text(encoding="utf-8")
        block = source.split("function collectSeedanceStatusFromPage()", 1)[1].split(
            "function reportSeedanceTabStatusWithScripting", 1
        )[0]

        self.assertIn("hasUserAvatar", block)
        self.assertIn("hasResolvedLoginEvidence", block)

    def test_extension_does_not_fabricate_account_data_for_login(self):
        background = BACKGROUND_PATH.read_text(encoding="utf-8")
        content = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")

        self.assertNotIn("Dreamina Web", background)
        self.assertNotIn("Dreamina Web", content)

    def test_background_auto_polls_pending_tasks_without_panel(self):
        source = BACKGROUND_PATH.read_text(encoding="utf-8")

        self.assertIn("startSeedanceTaskPolling", source)
        self.assertIn("pollSeedancePendingTasks", source)
        self.assertIn("scheduleSeedancePendingPollSoon", source)
        self.assertIn("/api/tasks/pending", source)
        self.assertIn("executeSeedanceBridgeTask", source)
        self.assertIn("doGenerate", source)
        self.assertIn("clickGenerate", source)
        self.assertIn("findLatestSeedanceResultAfterSubmit", source)
        self.assertIn("captureAndUploadLatestSeedanceResult", source)

    def test_manifest_requests_alarm_permission_for_background_wakeup(self):
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

        self.assertIn("alarms", manifest.get("permissions", []))

    def test_background_wait_loop_and_alarm_wake_task_polling(self):
        source = BACKGROUND_PATH.read_text(encoding="utf-8")

        self.assertIn("SEEDANCE_TASK_WAIT_TIMEOUT_SECONDS", source)
        self.assertIn("waitRemoteTasks", source)
        self.assertIn("/api/tasks/wait", source)
        self.assertIn("startSeedanceTaskWaiting", source)
        self.assertIn("setupSeedanceTaskWakeAlarm", source)
        self.assertIn("chrome.alarms.create", source)
        self.assertIn("seedance-task-wakeup", source)
        self.assertIn("pollSeedancePendingTasks", source)

    def test_background_remembers_seedance_work_tab_before_fallback_lookup(self):
        source = BACKGROUND_PATH.read_text(encoding="utf-8")
        block = source.split("async function findActiveSeedanceTab()", 1)[1].split(
            "function sleep", 1
        )[0]

        self.assertIn("SEEDANCE_WORKER_TAB_STORAGE_KEY", source)
        self.assertIn("rememberSeedanceWorkerTab", source)
        self.assertIn("getRememberedSeedanceWorkerTab", source)
        self.assertIn("const rememberedTab = await getRememberedSeedanceWorkerTab();", block)
        self.assertIn("if (rememberedTab) return rememberedTab;", block)
        self.assertLess(
            block.index("getRememberedSeedanceWorkerTab"),
            block.index("chrome.tabs.query"),
        )

    def test_background_activates_work_tab_before_page_actions(self):
        source = BACKGROUND_PATH.read_text(encoding="utf-8")
        self.assertIn("async function activateSeedanceWorkTab", source)
        helper = source.split("async function activateSeedanceWorkTab", 1)[1].split(
            "async function sendSeedanceTabMessage", 1
        )[0]
        block = source.split("async function executeSeedanceBridgeTask(task)", 1)[1].split(
            "async function pollSeedanceSubmittedTaskResult", 1
        )[0]

        self.assertIn("chrome.tabs.update(tab.id, { active: true })", helper)
        self.assertIn("chrome.windows.update(tab.windowId", helper)
        self.assertIn("focused: true", helper)
        self.assertIn("state: 'normal'", helper)
        self.assertIn("await activateSeedanceWorkTab(tab);", block)
        self.assertLess(
            block.index("await activateSeedanceWorkTab(tab);"),
            block.index("await ensureSeedanceContentScriptReady(tab);"),
        )

    def test_background_sends_marked_prompt_and_polls_submitted_results_non_blocking(self):
        source = BACKGROUND_PATH.read_text(encoding="utf-8")
        block = source.split("async function executeSeedanceBridgeTask(task)", 1)[1].split(
            "async function pollSeedanceSubmittedTaskResult", 1
        )[0]

        self.assertNotIn("promptWithCode", block)
        self.assertNotIn("`${taskCode} ${task.prompt}`", block)
        self.assertIn("prompt: task.markedPrompt || task.prompt || ''", block)
        self.assertIn("resultAnchor: clickResp.resultAnchor || null", block)
        self.assertNotIn("while (Date.now() - startedAt", block)
        self.assertNotIn("action: 'findVideoByTaskCode'", block)

        monitor = source.split("async function pollSeedanceSubmittedTaskResult", 1)[1].split(
            "async function pollSeedancePendingTasks", 1
        )[0]
        self.assertIn("action: 'findLatestSeedanceResultAfterSubmit'", monitor)
        self.assertIn("expectedPromptMarker: task.promptMarker || ''", monitor)
        self.assertIn("expectedPrompt: task.prompt || ''", monitor)
        self.assertIn("expectedModel", monitor)
        self.assertIn("expectedDuration", monitor)
        self.assertIn("action: 'captureAndUploadLatestSeedanceResult'", monitor)
        self.assertIn("promptMarker: task.promptMarker || ''", monitor)
        self.assertIn("resultProbe: result.resultProbe || null", monitor)

        poller = source.split("async function pollSeedancePendingTasks", 1)[1].split(
            "function scheduleSeedancePendingPollSoon", 1
        )[0]
        self.assertIn("includeSubmitted=1", poller)
        self.assertIn("task.status === 'submitted'", poller)
        self.assertIn("pollSeedanceSubmittedTaskResult(task)", poller)

    def test_background_keeps_submitted_tasks_alive_on_transient_poll_errors(self):
        source = BACKGROUND_PATH.read_text(encoding="utf-8")
        self.assertIn("function isTransientSeedanceSubmittedTaskError", source)
        helper_block = source.split("function isTransientSeedanceSubmittedTaskError", 1)[1].split(
            "async function processSeedanceBridgeTasks", 1
        )[0]
        process_block = source.split("async function processSeedanceBridgeTasks", 1)[1].split(
            "async function pollSeedancePendingTasks", 1
        )[0]
        poller_block = source.split("async function pollSeedancePendingTasks", 1)[1].split(
            "function scheduleSeedancePendingPollSoon", 1
        )[0]

        self.assertIn("failed to fetch", helper_block.lower())
        self.assertIn("video upload back to workbench failed", helper_block)
        self.assertIn("task.status === 'submitted' && isTransientSeedanceSubmittedTaskError(err)", process_block)
        self.assertIn("continue;", process_block)
        self.assertIn("task.status === 'submitted' && isTransientSeedanceSubmittedTaskError(err)", poller_block)
        self.assertIn("continue;", poller_block)

    def test_content_supports_latest_submission_result_tracking(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")

        self.assertIn("findLatestSeedanceResultAfterSubmit", source)
        self.assertIn("captureAndUploadLatestSeedanceResult", source)
        self.assertIn("collectSeedanceGenerationRecords", source)
        self.assertIn("buildSeedanceResultProbe", source)
        self.assertIn("extractVisibleSeedanceErrorText", source)
        self.assertIn("unusual activity", source)

    def test_content_latest_submission_uses_record_signatures_not_position_only(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        anchor_block = source.split("function buildSeedanceResultAnchor()", 1)[1].split(
            "function extractVisibleSeedanceErrorText", 1
        )[0]
        latest_block = source.split("async function findLatestSeedanceResultAfterSubmit", 1)[1].split(
            "// ============================================================", 1
        )[0]

        self.assertIn("recordSignatures", anchor_block)
        self.assertIn("buildSeedanceRecordSignature", source)
        self.assertIn("new Set(resultAnchor?.recordSignatures", latest_block)
        self.assertIn("!anchorSignatures.has", latest_block)

    def test_content_latest_submission_ignores_rerendered_old_records_without_anchor_attr(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        latest_block = source.split("async function findLatestSeedanceResultAfterSubmit", 1)[1].split(
            "// ============================================================", 1
        )[0]

        self.assertIn("return !anchorSignatures.has(signature);", latest_block)
        self.assertNotIn("el.getAttribute(SEEDANCE_RECORD_ANCHOR_ATTR) !== anchorToken", latest_block)

    def test_content_latest_submission_requires_expected_prompt_match_for_candidates(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        latest_block = source.split("async function findLatestSeedanceResultAfterSubmit", 1)[1].split(
            "// ============================================================", 1
        )[0]

        self.assertIn("hasExpectedPrompt", latest_block)
        self.assertIn("!recordMatchesExpectedPrompt(el, expectedPrompt)", latest_block)
        self.assertLess(
            latest_block.index("!recordMatchesExpectedPrompt(el, expectedPrompt)"),
            latest_block.index("return !anchorSignatures.has(signature);"),
        )

    def test_content_latest_submission_matches_last_prompt_marker_when_available(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        marker_block = source.split("function recordMatchesExpectedPromptMarker", 1)[1].split(
            "function getSeedancePromptMatchWords", 1
        )[0]
        latest_block = source.split("async function findLatestSeedanceResultAfterSubmit", 1)[1].split(
            "// ============================================================", 1
        )[0]

        self.assertIn("extractSeedancePromptMarkers", source)
        self.assertIn("markers[markers.length - 1] === expected", marker_block)
        self.assertIn("expectedPromptMarker", latest_block)
        self.assertIn("hasExpectedPromptMarker", latest_block)
        self.assertIn("!recordMatchesExpectedPromptMarker(el, expectedPromptMarker)", latest_block)
        self.assertLess(
            latest_block.index("!recordMatchesExpectedPromptMarker(el, expectedPromptMarker)"),
            latest_block.index("!recordMatchesExpectedPrompt(el, expectedPrompt)"),
        )

    def test_content_latest_submission_filters_candidates_by_model_and_duration(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        latest_block = source.split("async function findLatestSeedanceResultAfterSubmit", 1)[1].split(
            "// ============================================================", 1
        )[0]

        self.assertIn("recordMatchesExpectedDuration", source)
        self.assertIn("seedanceModelTextMatches", source)
        self.assertIn("expectedDuration", latest_block)
        self.assertIn("expectedModel", latest_block)
        self.assertIn("!recordMatchesExpectedDuration(el, expectedDuration)", latest_block)
        self.assertIn("!seedanceModelTextMatches(el.textContent || '', expectedModel)", latest_block)

    def test_content_duration_match_accepts_seedance_model_joined_to_duration(self):
        content_path = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        )
        script = r"""
const fs = require('fs');
const source = fs.readFileSync(process.argv[1], 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`missing ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated ${name}`);
}

eval([
  extractFunction('normalizeSeedanceExpectedDuration'),
  extractFunction('recordMatchesExpectedDuration'),
].join('\n'));

const joined = { textContent: '吃面条 [[HY4078A001]] Dreamina Seedance 2.04s More info' };
const different = { textContent: '吃面条 [[HY4078A001]] Dreamina Seedance 2.05s More info' };

if (!recordMatchesExpectedDuration(joined, '4s')) {
  throw new Error('expected joined Seedance 2.0 + 4s text to match 4s');
}
if (recordMatchesExpectedDuration(different, '4s')) {
  throw new Error('expected joined Seedance 2.0 + 5s text not to match 4s');
}
"""
        result = subprocess.run(
            ["node", "-e", script, str(content_path)],
            cwd=Path(__file__).resolve().parent,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

    def test_content_latest_submission_never_fails_ambiguous_candidates_as_not_unique(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        latest_block = source.split("async function findLatestSeedanceResultAfterSubmit", 1)[1].split(
            "// ============================================================", 1
        )[0]
        ambiguous_block = latest_block.split("if (changedRecords.length > 1)", 1)[1].split(
            "const latestRecord", 1
        )[0]

        self.assertIn("changedRecords.length > 1", latest_block)
        self.assertIn("status: 'generating'", ambiguous_block)
        self.assertNotIn("status: 'failed'", ambiguous_block)
        self.assertNotIn("\u5019\u9009\u4e0d\u552f\u4e00", latest_block)

    def test_content_latest_submission_prefers_completed_marked_candidate_over_loading_candidates(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        latest_block = source.split("async function findLatestSeedanceResultAfterSubmit", 1)[1].split(
            "// ============================================================", 1
        )[0]

        self.assertIn("findCompletedSeedanceResultFromRecords", source)
        self.assertIn("completedResult", latest_block)
        self.assertLess(
            latest_block.index("completedResult"),
            latest_block.index("if (changedRecords.length > 1)"),
        )
        self.assertIn("info.status === 'completed' && info.videoUrl", source)

    def test_content_generation_records_skip_prompt_input_ancestor_containers(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        collect_block = source.split("function collectSeedanceGenerationRecords()", 1)[1].split(
            "function buildSeedanceRecordSignature", 1
        )[0]

        self.assertIn("const promptEditor = findPromptEditor()", collect_block)
        self.assertIn("const promptTextarea = findPromptTextarea()", collect_block)
        self.assertIn("const submitButton = findSubmitButton()", collect_block)
        self.assertIn("el.contains(promptEditor)", collect_block)
        self.assertIn("el.contains(promptTextarea)", collect_block)
        self.assertIn("el.contains(submitButton)", collect_block)

    def test_content_generation_records_reject_broad_workspace_ancestor_containers(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        collect_block = source.split("function collectSeedanceGenerationRecords()", 1)[1].split(
            "function buildSeedanceRecordSignature", 1
        )[0]

        self.assertIn("isSeedanceBroadRecordContainer", source)
        self.assertIn("countSeedanceRecordMedia", source)
        self.assertIn("isSeedanceBroadRecordContainer(el, rect)", collect_block)

    def test_content_prompt_matching_requires_distinctive_terms_not_short_prefix(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        match_block = source.split("function recordMatchesExpectedPrompt", 1)[1].split(
            "function isExplicitSeedanceFailureText", 1
        )[0]

        self.assertIn("getSeedancePromptMatchWords", source)
        self.assertIn("matched >= Math.min(5, words.length)", match_block)
        self.assertNotIn("prompt.slice(0, Math.min(12", match_block)

    def test_content_latest_submission_never_falls_back_to_old_records(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        latest_block = source.split("async function findLatestSeedanceResultAfterSubmit", 1)[1].split(
            "// ============================================================", 1
        )[0]

        self.assertIn("changedRecords", latest_block)
        self.assertIn("本次任务结果还没出现", latest_block)
        self.assertNotIn("records[0]?.el", latest_block)

    def test_content_marks_existing_records_before_submit_to_avoid_stale_video_pickup(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        anchor_block = source.split("function buildSeedanceResultAnchor()", 1)[1].split(
            "function isExplicitSeedanceFailureText", 1
        )[0]
        latest_block = source.split("async function findLatestSeedanceResultAfterSubmit", 1)[1].split(
            "// ============================================================", 1
        )[0]

        self.assertIn("SEEDANCE_RECORD_ANCHOR_ATTR", source)
        self.assertIn("SEEDANCE_RECORD_SIGNATURE_ATTR", source)
        self.assertIn("anchorToken", anchor_block)
        self.assertIn("setAttribute(SEEDANCE_RECORD_ANCHOR_ATTR", anchor_block)
        self.assertIn("setAttribute(SEEDANCE_RECORD_SIGNATURE_ATTR", anchor_block)
        self.assertIn("resultAnchor?.anchorToken", latest_block)
        self.assertIn("getAttribute(SEEDANCE_RECORD_ANCHOR_ATTR) === anchorToken", latest_block)
        self.assertIn("return !anchorSignatures.has(signature);", latest_block)

    def test_content_allows_reused_marked_record_when_prompt_matches_and_signature_changes(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        latest_block = source.split("async function findLatestSeedanceResultAfterSubmit", 1)[1].split(
            "// ============================================================", 1
        )[0]

        self.assertIn("expectedPrompt", latest_block)
        self.assertIn("recordMatchesExpectedPrompt", latest_block)
        self.assertIn("previousSignature", latest_block)
        self.assertIn("signature !== previousSignature", latest_block)

    def test_content_waits_for_current_record_to_finish_before_uploading_media(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        block = source.split("function extractVideoInfo(record, taskCode, isHD)", 1)[1].split(
            "async function findVideoByTaskCode", 1
        )[0]

        self.assertIn("isSeedanceRecordGenerating(record)", block)
        self.assertLess(block.index("isSeedanceRecordGenerating(record)"), block.index("const videoEl ="))
        self.assertIn("\\d{1,3}\\s*%", source)
        self.assertIn("dreaming", source.lower())

    def test_content_latest_video_result_does_not_treat_image_preview_as_complete(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        block = source.split("function extractSeedanceResultInfoFromRecord", 1)[1].split(
            "async function findLatestSeedanceResultAfterSubmit", 1
        )[0]

        self.assertIn("info.isImage", block)
        self.assertIn("海外版视频结果还没有最终视频", block)

    def test_content_failed_current_record_reports_error_before_media_upload(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        block = source.split("function extractVideoInfo(record, taskCode, isHD)", 1)[1].split(
            "async function findVideoByTaskCode", 1
        )[0]

        self.assertLess(block.index("extractSeedanceFailureText(failEl, record)"), block.index("const videoEl ="))
        self.assertLess(block.index("recordFailureText"), block.index("const videoEl ="))

    def test_content_failed_record_returns_visible_web_error_text(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        block = source.split("function extractVideoInfo(record, taskCode, isHD)", 1)[1].split(
            "async function findVideoByTaskCode", 1
        )[0]

        self.assertIn("extractSeedanceFailureText", source)
        self.assertIn("extractSeedanceFailureText(failEl, record)", block)
        self.assertIn("if (failureText)", block)

    def test_content_prefers_visible_media_over_retry_controls(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        block = source.split("function extractVideoInfo(record, taskCode, isHD)", 1)[1].split(
            "async function findVideoByTaskCode", 1
        )[0]

        self.assertIn("isExplicitSeedanceFailureText", source)
        self.assertLess(block.index("const failEl ="), block.index("const videoEl ="))
        self.assertNotRegex(block, r"\\[class\\*=\"retry\"\\]")

    def test_content_page_error_detection_requires_explicit_failure_text(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        block = source.split("function extractVisibleSeedanceErrorText", 1)[1].split(
            "function extractSeedanceFailureText", 1
        )[0]

        self.assertIn("isExplicitSeedanceFailureText", source)
        self.assertNotIn("'[class*=\"retry\"]'", block)
        self.assertNotIn("|retry", block)

    def test_content_reports_visible_policy_error_before_ambiguous_generating_state(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        failure_block = source.split("function isExplicitSeedanceFailureText", 1)[1].split(
            "function normalizeSeedanceFailureText", 1
        )[0].lower()
        visible_error_block = source.split("function extractVisibleSeedanceErrorText", 1)[1].split(
            "function extractSeedanceFailureText", 1
        )[0].lower()
        latest_block = source.split("async function findLatestSeedanceResultAfterSubmit", 1)[1].split(
            "// ============================================================", 1
        )[0]

        self.assertIn("community guidelines", failure_block)
        self.assertIn("prompt may contain content", failure_block)
        self.assertIn("change it and try again", failure_block)
        self.assertIn("audio may contain inappropriate content", failure_block)
        self.assertIn("community guidelines", visible_error_block)
        self.assertIn("const pageError = extractVisibleSeedanceErrorText(document);", latest_block)
        self.assertLess(
            latest_block.index("const pageError = extractVisibleSeedanceErrorText(document);"),
            latest_block.index("if (changedRecords.length > 1)"),
        )

    def test_content_treats_something_went_wrong_as_explicit_failure(self):
        content_path = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        )
        script = r"""
const fs = require('fs');
const source = fs.readFileSync(process.argv[1], 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`missing ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated ${name}`);
}

eval([
  extractFunction('isExplicitSeedanceFailureText'),
  extractFunction('normalizeSeedanceFailureText'),
].join('\n'));

const message = 'Something went wrong. Refresh and try again.';
if (!isExplicitSeedanceFailureText(message)) {
  throw new Error('expected something-went-wrong message to be explicit failure');
}
if (normalizeSeedanceFailureText(message + ' Give feedback') !== message) {
  throw new Error('expected something-went-wrong message to normalize');
}
"""
        result = subprocess.run(
            ["node", "-e", script, str(content_path)],
            cwd=Path(__file__).resolve().parent,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

    def test_content_visible_policy_error_does_not_override_current_generating_record(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        visible_error_block = source.split("function extractVisibleSeedanceErrorText", 1)[1].split(
            "function extractSeedanceFailureText", 1
        )[0].lower()
        known_messages_block = visible_error_block.split("const knownmessages = [", 1)[1].split(
            "];", 1
        )[0]
        latest_block = source.split("async function findLatestSeedanceResultAfterSubmit", 1)[1].split(
            "// ============================================================", 1
        )[0]

        self.assertNotIn("audio may contain inappropriate content", known_messages_block)
        self.assertNotIn("may contain inappropriate content", known_messages_block)
        self.assertIn("hasGeneratingCandidate", latest_block)
        self.assertIn("!hasGeneratingCandidate", latest_block)
        self.assertLess(
            latest_block.index("hasGeneratingCandidate"),
            latest_block.index("const pageError = extractVisibleSeedanceErrorText(document);"),
        )

    def test_content_ignores_visible_page_error_that_existed_before_submit(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        anchor_block = source.split("function buildSeedanceResultAnchor()", 1)[1].split(
            "function normalizeSeedancePromptText", 1
        )[0]
        latest_block = source.split("async function findLatestSeedanceResultAfterSubmit", 1)[1].split(
            "// ============================================================", 1
        )[0]

        self.assertIn("visibleErrorText", anchor_block)
        self.assertIn("resultAnchor?.visibleErrorText", latest_block)
        self.assertIn("anchorPageError", latest_block)
        self.assertIn("pageError !== anchorPageError", latest_block)

    def test_content_does_not_fail_marker_tracked_task_from_global_page_error(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        latest_block = source.split("async function findLatestSeedanceResultAfterSubmit", 1)[1].split(
            "// ============================================================", 1
        )[0]
        page_error_condition = next(
            line.strip()
            for line in latest_block.splitlines()
            if line.strip().startswith("if (pageError &&")
        )

        self.assertIn("hasExpectedPromptMarker", latest_block)
        self.assertIn("!hasExpectedPromptMarker", page_error_condition)

    def test_content_returns_current_record_failure_even_when_page_error_matches_anchor(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        latest_block = source.split("async function findLatestSeedanceResultAfterSubmit", 1)[1].split(
            "// ============================================================", 1
        )[0]

        self.assertIn("findFailedSeedanceResultFromRecords", source)
        self.assertIn("const failedResult = findFailedSeedanceResultFromRecords(changedRecords);", latest_block)
        self.assertIn("return failedResult", latest_block)
        self.assertLess(
            latest_block.index("const failedResult = findFailedSeedanceResultFromRecords(changedRecords);"),
            latest_block.index("const pageError = extractVisibleSeedanceErrorText(document);"),
        )
        self.assertLess(
            latest_block.index("const failedResult = findFailedSeedanceResultFromRecords(changedRecords);"),
            latest_block.index("if (changedRecords.length > 1)"),
        )

    def test_background_page_heartbeat_wakes_task_polling_immediately(self):
        source = BACKGROUND_PATH.read_text(encoding="utf-8")
        block = source.split("async function reportSeedancePageStatus(status)", 1)[1].split(
            "async function findActiveSeedanceTab", 1
        )[0]

        self.assertIn("pollSeedancePendingTasks().catch", block)
        self.assertNotIn("scheduleSeedancePendingPollSoon()", block)

    def test_background_applies_web_model_preset_before_generating(self):
        source = BACKGROUND_PATH.read_text(encoding="utf-8")
        block = source.split("async function executeSeedanceBridgeTask(task)", 1)[1].split(
            "async function pollSeedancePendingTasks", 1
        )[0]

        self.assertIn("buildSeedanceTaskPreset", source)
        self.assertIn("normalizeSeedanceWebModelLabel", source)
        self.assertIn("normalizeSeedanceWebDurationLabel", source)
        self.assertIn("action: 'applyPreset'", block)
        self.assertIn("preset", block)
        self.assertLess(block.index("action: 'applyPreset'"), block.index("action: 'doGenerate'"))

    def test_background_checks_content_script_ready_before_processing_task(self):
        source = BACKGROUND_PATH.read_text(encoding="utf-8")
        block = source.split("async function executeSeedanceBridgeTask(task)", 1)[1].split(
            "async function pollSeedancePendingTasks", 1
        )[0]

        self.assertIn("ensureSeedanceContentScriptReady", source)
        self.assertIn("await ensureSeedanceContentScriptReady(tab)", block)
        self.assertLess(
            block.index("await ensureSeedanceContentScriptReady(tab)"),
            block.index("await reportBridgeTaskStatus(taskCode, 'processing')"),
        )

    def test_background_prefers_active_seedance_tab_for_bridge_tasks(self):
        source = BACKGROUND_PATH.read_text(encoding="utf-8")
        block = source.split("async function findActiveSeedanceTab()", 1)[1].split(
            "function sleep", 1
        )[0]

        self.assertIn("active: true", block)
        self.assertIn("lastFocusedWindow: true", block)
        self.assertLess(
            block.index("active: true"),
            block.index("url: SEEDANCE_PAGE_URL_PATTERNS"),
        )

    def test_background_fallback_prefers_most_recent_seedance_tab(self):
        source = BACKGROUND_PATH.read_text(encoding="utf-8")
        block = source.split("async function findActiveSeedanceTab()", 1)[1].split(
            "function sleep", 1
        )[0]

        self.assertIn("rankSeedanceTabs", source)
        self.assertIn("lastAccessed", source)
        self.assertIn("rankSeedanceTabs(tabs)[0]", block)

    def test_background_does_not_version_gate_responsive_seedance_content_script(self):
        source = BACKGROUND_PATH.read_text(encoding="utf-8")
        block = source.split("async function ensureSeedanceContentScriptReady", 1)[1].split(
            "async function bridgeFetch", 1
        )[0]

        self.assertIn("if (ping && ping.success) return ping", block)
        self.assertNotIn("EXPECTED_SEEDANCE_CONTENT_VERSION", source)
        self.assertNotIn("ping.version", block)
        self.assertNotIn("stale overseas page script version", block)
        self.assertNotIn("reloadSeedanceTabAndWait(tab)", block)

    def test_background_retries_transient_chrome_service_worker_errors(self):
        source = BACKGROUND_PATH.read_text(encoding="utf-8")
        find_block = source.split("async function findActiveSeedanceTab()", 1)[1].split(
            "function sleep", 1
        )[0]
        send_block = source.split("async function sendSeedanceTabMessage", 1)[1].split(
            "async function ensureSeedanceContentScriptReady", 1
        )[0]

        self.assertIn("isTransientSeedanceChromeError", source)
        self.assertIn("withSeedanceChromeRetry", source)
        self.assertIn("No SW", source)
        self.assertIn("withSeedanceChromeRetry", find_block)
        self.assertIn("withSeedanceChromeRetry", send_block)

    def test_background_rejects_failed_or_partial_web_preset_application(self):
        source = BACKGROUND_PATH.read_text(encoding="utf-8")
        block = source.split("async function executeSeedanceBridgeTask(task)", 1)[1].split(
            "async function pollSeedancePendingTasks", 1
        )[0]

        self.assertIn("function validateSeedancePresetResult", source)
        self.assertIn("validateSeedancePresetResult(preset, presetResp.result)", block)
        validator = source.split("function validateSeedancePresetResult", 1)[1].split(
            "async function executeSeedanceBridgeTask", 1
        )[0]
        self.assertIn("result.error", validator)
        self.assertIn("result[key] !== true", validator)

    def test_background_keeps_web_preset_failure_message_simple(self):
        source = BACKGROUND_PATH.read_text(encoding="utf-8")
        validator = source.split("function validateSeedancePresetResult", 1)[1].split(
            "async function executeSeedanceBridgeTask", 1
        )[0]

        self.assertNotIn("result.details", validator)
        self.assertNotIn("detail.message", validator)

    def test_content_allows_overseas_workspace_without_chinese_video_generation_option(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        block = source.split("async function ensureVideoGenerationMode()", 1)[1].split(
            "function base64ToFile", 1
        )[0]

        self.assertIn("isUsableGenerationWorkspace", source)
        self.assertIn("isUsableGenerationWorkspace()", block)
        self.assertLess(
            block.index("isUsableGenerationWorkspace()"),
            block.index('throw new Error(\'未找到"视频生成"选项\')'),
        )

    def test_content_switches_overseas_page_to_ai_video_mode(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        block = source.split("async function ensureVideoGenerationMode()", 1)[1].split(
            "function base64ToFile", 1
        )[0]
        helper = source.split("function isVideoGenerationType(text)", 1)[1].split(
            "// ============================================================\n  // 导航", 1
        )[0]

        self.assertIn("isVideoGenerationType", source)
        self.assertIn("ai video", helper)
        self.assertIn("isVideoGenerationType(text)", block)
        self.assertIn("isVideoGenerationType(newType)", block)

    def test_content_uses_fixed_toolbar_indexes_for_overseas_parameters(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        block = source.split("async function applyPresetParams(preset)", 1)[1].split(
            "async function handleGenerateTask", 1
        )[0]

        self.assertIn("results.model = await selectOption(selects[1], preset.model", block)
        self.assertIn("results.referenceMode = await selectOption(selects[2], preset.referenceMode", block)
        self.assertIn("results.duration = await selectOption(selects[3], preset.duration", block)
        self.assertNotIn("preset.resolution", block)
        self.assertNotIn("await selectToolbarOption", block)


    def test_content_matches_options_case_insensitively(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        block = source.split("async function applyPresetParams(preset)", 1)[1].split(
            "async function handleGenerateTask", 1
        )[0]

        self.assertIn("function optionTextMatches", block)
        self.assertIn("toLowerCase()", block)
        self.assertIn("startsWith(targetLower)", block)

    def test_content_treats_dreamina_seedance_prefix_as_same_model(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        block = source.split("async function applyPresetParams(preset)", 1)[1].split(
            "async function handleGenerateTask", 1
        )[0]

        self.assertIn("function normalizeSeedanceModelOptionKey", block)
        self.assertIn("replace(/^dreamina\\s+/, '')", block)
        self.assertIn("normalizeSeedanceModelOptionKey(option)", block)
        self.assertIn("optionModelKey === targetModelKey", block)
        self.assertIn("optionTextMatches(currentText, targetText)", block)
        self.assertIn("sameSpeedTier", block)
        self.assertNotIn("option.toLowerCase().includes(target.toLowerCase())", block)

    def test_content_heartbeat_reuses_strict_page_info_login_detection(self):
        source = (
            Path(__file__).resolve().parent
            / "integrations"
            / "seedance_extension_bridge"
            / "extension"
            / "content.js"
        ).read_text(encoding="utf-8")
        block = source.split("function collectSeedancePageStatusForWorkbench()", 1)[1].split(
            "function startSeedancePageStatusHeartbeat", 1
        )[0]

        self.assertIn("getPageInfo()", block)
        self.assertNotIn("|| !hasLoginButton", block)

    def test_background_page_probe_reads_explicit_web_login_status(self):
        source = BACKGROUND_PATH.read_text(encoding="utf-8")
        block = source.split("function collectSeedanceStatusFromPage()", 1)[1].split(
            "function reportSeedanceTabStatusWithScripting", 1
        )[0]

        self.assertIn("__GTW_LOGIN_STATUS__", block)
        self.assertIn("hasExplicitLoginStatus", block)
        self.assertIn("authenticated", block)

    def test_background_page_probe_does_not_use_marketing_text_as_login_evidence(self):
        source = BACKGROUND_PATH.read_text(encoding="utf-8")
        block = source.split("function collectSeedanceStatusFromPage()", 1)[1].split(
            "function reportSeedanceTabStatusWithScripting", 1
        )[0]

        self.assertNotIn("/生成|Generate|Create|Upload|上传|创建/i.test(bodyText)", block)


if __name__ == "__main__":
    unittest.main()
