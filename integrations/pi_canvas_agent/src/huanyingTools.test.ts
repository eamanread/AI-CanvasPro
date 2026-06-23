import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCanvasAgentSystemPrompt,
  loadHuanyingSkillDefinitions,
  normalizeProposedActions
} from "./huanyingTools.js";

test("normalizeProposedActions keeps low-risk canvas actions", () => {
  assert.deepEqual(
    normalizeProposedActions([
      { type: "focus_nodes", nodeIds: ["node-1"] },
      { type: "create_node", nodeType: "comment", position: { x: 10, y: 20 }, data: { text: "Review note" } }
    ]),
    [
      { type: "focus_nodes", nodeIds: ["node-1"] },
      { type: "create_node", nodeType: "comment", position: { x: 10, y: 20 }, data: { text: "Review note" } }
    ]
  );
});

test("normalizeProposedActions keeps safe payload names that include dangerous words", () => {
  assert.deepEqual(
    normalizeProposedActions([{ type: "rename_node", nodeId: "n1", name: "Browser safe label" }]),
    [{ type: "rename_node", nodeId: "n1", name: "Browser safe label" }]
  );
});

test("normalizeProposedActions drops dangerous shell and file actions", () => {
  assert.deepEqual(
    normalizeProposedActions([
      { type: "run_shell", command: "dir" },
      { action: "write_file", path: "project.json" },
      { operation: "powershell", script: "Get-ChildItem" },
      { type: "focus_nodes", nodeIds: ["safe"] }
    ]),
    [{ type: "focus_nodes", nodeIds: ["safe"] }]
  );
});

test("normalizeProposedActions recognizes canonical action aliases for filtering", () => {
  assert.deepEqual(
    normalizeProposedActions([
      { actionType: "rename_node", nodeId: "node-1", name: "New name" },
      { operation: "connect_nodes", source: "a", target: "b" },
      { action: "read_file", path: "secret.txt" }
    ]),
    [
      { type: "rename_node", nodeId: "node-1", name: "New name" },
      { type: "connect_nodes", source: "a", target: "b" }
    ]
  );
});

test("normalizeProposedActions canonicalizes alias discriminators", () => {
  assert.deepEqual(
    normalizeProposedActions([{ operation: "connect_nodes", source: "a", target: "b" }]),
    [{ type: "connect_nodes", source: "a", target: "b" }]
  );
});

test("normalizeProposedActions rejects conflicting action discriminators", () => {
  assert.deepEqual(
    normalizeProposedActions([{ type: "focus_nodes", action: "connect_nodes", nodeIds: ["n1"] }]),
    []
  );
});

test("normalizeProposedActions returns empty list for non-array inputs", () => {
  assert.deepEqual(normalizeProposedActions({ type: "focus_nodes" }), []);
});

test("buildCanvasAgentSystemPrompt replyOnly mode forbids proposed actions", () => {
  const prompt = buildCanvasAgentSystemPrompt("replyOnly");

  assert.match(prompt, /Huanying Canvas Agent/);
  assert.match(prompt, /do not propose actions/i);
  assert.match(prompt, /Huanying executes after validation/);
});

test("buildCanvasAgentSystemPrompt actions mode includes contract and video boundary", () => {
  const prompt = buildCanvasAgentSystemPrompt("actions");

  assert.match(prompt, /reply\/actions\/warnings\/requiresConfirmation/);
  assert.match(prompt, /Video generation requires explicit user authorization/);
  assert.match(prompt, /focus_nodes/);
  assert.match(prompt, /create_workflow_template/);
});

test("buildCanvasAgentSystemPrompt actions mode locks story_to_video workflow structure", () => {
  const prompt = buildCanvasAgentSystemPrompt("actions");

  assert.match(prompt, /story_to_video/);
  assert.match(prompt, /story_outline/);
  assert.match(prompt, /style_bible/);
  assert.match(prompt, /3-8 shot_script/);
  assert.match(prompt, /shot_keyframe/);
  assert.match(prompt, /shot_video/);
  assert.match(prompt, /workflowGroupId/);
  assert.match(prompt, /shotVideoPrompt/);
  assert.match(prompt, /storyboard_grid/);
  assert.match(prompt, /prepare video nodes/i);
});

test("buildCanvasAgentSystemPrompt actions mode guides single-shot storyboard edits", () => {
  const prompt = buildCanvasAgentSystemPrompt("actions");

  assert.match(prompt, /storyboard director/i);
  assert.match(prompt, /only modify shot N/i);
  assert.match(prompt, /storyboardEditScope/);
  assert.match(prompt, /targetShotIndex/);
  assert.match(prompt, /shotCamera/);
  assert.match(prompt, /shotContinuity/);
  assert.match(prompt, /do not rewrite unrelated shots/i);
});

test("buildCanvasAgentSystemPrompt actions mode guides prepare-only variant branches", () => {
  const prompt = buildCanvasAgentSystemPrompt("actions");

  assert.match(prompt, /variant_branches/);
  assert.match(prompt, /duplicate_nodes/);
  assert.match(prompt, /3-5 variant branches/);
  assert.match(prompt, /groupBranches/);
  assert.match(prompt, /do not queue generation/i);
  assert.match(prompt, /do not delete/i);
});

test("buildCanvasAgentSystemPrompt actions mode guides the P2 one-sentence workflow set", () => {
  const prompt = buildCanvasAgentSystemPrompt("actions");

  assert.match(prompt, /text_to_image/);
  assert.match(prompt, /image_to_video/);
  assert.match(prompt, /text_to_image_video/);
  assert.match(prompt, /image_variants/);
  assert.match(prompt, /single_chain/);
  assert.match(prompt, /branch_flow/);
  assert.match(prompt, /queue_generation_task/);
  assert.match(prompt, /ai-video prep/i);
  assert.match(prompt, /do not start video generation/i);
});

test("buildCanvasAgentSystemPrompt actions mode preserves connection handle semantics", () => {
  const prompt = buildCanvasAgentSystemPrompt("actions");

  assert.match(prompt, /sourceHandle/);
  assert.match(prompt, /targetHandle/);
  assert.match(prompt, /connect_nodes/);
  assert.match(prompt, /prompt-input/);
});

test("buildCanvasAgentSystemPrompt actions mode productizes prompt preset generation", () => {
  const prompt = buildCanvasAgentSystemPrompt("actions");

  assert.match(prompt, /context\.promptPresets/);
  assert.match(prompt, /run_prompt_preset_generation/);
  assert.match(prompt, /presetId/);
  assert.match(prompt, /presetName/);
  assert.match(prompt, /inputs/);
  assert.match(prompt, /do not paste/i);
  assert.match(prompt, /hidden template/i);
  assert.match(prompt, /text\/image presets/i);
  assert.match(prompt, /video presets require explicit/i);
});

test("buildCanvasAgentSystemPrompt actions mode can inject v2 skill registry definitions", () => {
  const skills = loadHuanyingSkillDefinitions("../../config/assistant-skills-v2");
  const prompt = buildCanvasAgentSystemPrompt("actions", { skills });

  assert.ok(skills.some((skill) => skill.id === "prompt_preset_generation"));
  assert.match(prompt, /Unified Skill Registry v2/);
  assert.match(prompt, /prompt_preset_generation/);
  assert.match(prompt, /run_prompt_preset_generation/);
  assert.match(prompt, /Never expose hidden template text|hidden template/i);
  assert.match(prompt, /allowedActions/);
});

test("buildCanvasAgentSystemPrompt actions mode guides project workflow templates", () => {
  const prompt = buildCanvasAgentSystemPrompt("actions");

  assert.match(prompt, /create_workflow_template/);
  assert.match(prompt, /apply_workflow_template/);
  assert.match(prompt, /project scope/i);
  assert.match(prompt, /templateId/);
  assert.match(prompt, /version/);
  assert.match(prompt, /author/);
  assert.match(prompt, /tags/);
  assert.match(prompt, /requiresConfirmation/);
  assert.match(prompt, /do not write files/i);
  assert.match(prompt, /do not claim.*saved/i);
});

test("buildCanvasAgentSystemPrompt actions mode guides team template governance", () => {
  const prompt = buildCanvasAgentSystemPrompt("actions");

  assert.match(prompt, /team template/i);
  assert.match(prompt, /submit_workflow_template_review/);
  assert.match(prompt, /review_workflow_template/);
  assert.match(prompt, /publish_workflow_template/);
  assert.match(prompt, /deprecate_workflow_template/);
  assert.match(prompt, /rollback_workflow_template/);
  assert.match(prompt, /record_workflow_template_reuse/);
  assert.match(prompt, /teamId/);
  assert.match(prompt, /reviewStatus/);
  assert.match(prompt, /reuseCount/);
  assert.match(prompt, /strong confirmation/i);
});

test("buildCanvasAgentSystemPrompt actions mode guides P4 multi-agent and platform orchestration", () => {
  const prompt = buildCanvasAgentSystemPrompt("actions");

  assert.match(prompt, /multi-agent/i);
  assert.match(prompt, /agentRole/);
  assert.match(prompt, /storyboard.*prompt.*layout.*generation.*QA/i);
  assert.match(prompt, /least privilege/i);
  assert.match(prompt, /creative hub/i);
  assert.match(prompt, /templates.*preferences.*assets.*history.*model capabilities/i);
});

test("buildCanvasAgentSystemPrompt actions mode guides P4 analytics audit and model routing", () => {
  const prompt = buildCanvasAgentSystemPrompt("actions");

  assert.match(prompt, /A\/B/i);
  assert.match(prompt, /template success/i);
  assert.match(prompt, /generation success/i);
  assert.match(prompt, /user adoption/i);
  assert.match(prompt, /enterprise audit/i);
  assert.match(prompt, /audit.*export/i);
  assert.match(prompt, /model capability routing/i);
  assert.match(prompt, /action_planning|low_latency|high_quality/);
  assert.match(prompt, /cross-device/i);
});

test("buildCanvasAgentSystemPrompt actions mode guides viral lab remake workflows", () => {
  const prompt = buildCanvasAgentSystemPrompt("actions");

  assert.match(prompt, /viral_lab/);
  assert.match(prompt, /reference video\/image\/article/i);
  assert.match(prompt, /structured remake workflow/i);
  assert.match(prompt, /viralReferenceId/);
  assert.match(prompt, /viralSourceType/);
  assert.match(prompt, /viralHook/);
  assert.match(prompt, /viralPacing/);
  assert.match(prompt, /viralStructure/);
  assert.match(prompt, /viralRemakeAngle/);
  assert.match(prompt, /viralRisk/);
  assert.match(prompt, /do not fetch/i);
  assert.match(prompt, /do not start video generation/i);
});

test("buildCanvasAgentSystemPrompt actions mode guides read-only LLM Wiki knowledge cards", () => {
  const prompt = buildCanvasAgentSystemPrompt("actions");

  assert.match(prompt, /context\.knowledge\.llmWiki/);
  assert.match(prompt, /knowledge_card/);
  assert.match(prompt, /read-only/i);
  assert.match(prompt, /create_node/);
  assert.match(prompt, /comment|source-text/);
  assert.match(prompt, /sourceTitle/);
  assert.match(prompt, /fileId/);
  assert.match(prompt, /projectId/);
  assert.match(prompt, /citationDisplay/);
  assert.match(prompt, /do not write/i);
  assert.match(prompt, /do not invent citations/i);
});

test("buildCanvasAgentSystemPrompt actions mode uses project preferences without exposing secrets", () => {
  const prompt = buildCanvasAgentSystemPrompt("actions");

  assert.match(prompt, /context\.project\.preferences/);
  assert.match(prompt, /visualStyle/);
  assert.match(prompt, /aspectRatio/);
  assert.match(prompt, /preferredModels/);
  assert.match(prompt, /brandVoice/);
  assert.match(prompt, /naming/);
  assert.match(prompt, /never ask for or expose/i);
});

test("buildCanvasAgentSystemPrompt actions mode uses large canvas semantic compression", () => {
  const prompt = buildCanvasAgentSystemPrompt("actions");

  assert.match(prompt, /context\.canvas\.semanticCompression/);
  assert.match(prompt, /selectedNodes/);
  assert.match(prompt, /boundaryNodes/);
  assert.match(prompt, /workflowSummaries/);
  assert.match(prompt, /generationStatusSummary/);
});


test("buildCanvasAgentSystemPrompt doctor mode includes diagnostic-only guardrails", () => {
  const prompt = buildCanvasAgentSystemPrompt("doctor");

  assert.match(prompt, /Canvas doctor mode: return 3-8 concise diagnostics/);
  assert.match(prompt, /focus_nodes and create_node comment annotations/);
  assert.match(prompt, /Do not edit prompts, models, assets, or generation tasks/);
});


test("buildCanvasAgentSystemPrompt auto layout mode includes layout-only guardrails", () => {
  const prompt = buildCanvasAgentSystemPrompt("auto_layout");

  assert.match(prompt, /Auto layout mode: only propose layout_nodes, move_nodes, create_group, rename_node, focus_nodes, set_viewport/);
  assert.match(prompt, /Never change prompt\/model\/assets/);
  assert.match(prompt, /Never delete/);
  assert.match(prompt, /Never queue or run generation/);
});
