import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAssistantActionPreviewModel,
  formatAssistantActionPreviewModel,
} from "./assistantActionPreviewModel.js";

test("assistantActionPreviewModel: groups create, connect, layout, and generation actions", () => {
  const model = buildAssistantActionPreviewModel([
    { type: "create_node", nodeId: "script", nodeType: "ai-text", name: "脚本" },
    { type: "create_node", nodeId: "shot", nodeType: "ai-image", name: "分镜图" },
    { type: "connect_nodes", from: "script", to: "shot" },
    { type: "layout_nodes", layout: "storyboard", nodeIds: ["script", "shot"] },
    { type: "queue_generation_task", nodeId: "shot", nodeType: "ai-image" },
  ]);

  assert.equal(model.actionCount, 5);
  assert.deepEqual(
    model.sections.map((section) => section.id),
    ["create_nodes", "connect_nodes", "layout", "generation"]
  );
  assert.equal(model.requiresConfirmation, true);
  assert.equal(model.requiresStrongConfirmation, false);
});

test("assistantActionPreviewModel: marks video generation as strong confirmation", () => {
  const model = buildAssistantActionPreviewModel([
    { type: "queue_generation_task", nodeId: "video-1", nodeType: "ai-video" },
  ]);

  assert.equal(model.requiresStrongConfirmation, true);
  assert.equal(model.riskSummary.videoGeneration, 1);
  assert.match(formatAssistantActionPreviewModel(model), /Strong confirmation required/);
});

test("assistantActionPreviewModel: labels prompt preset generation by preset", () => {
  const model = buildAssistantActionPreviewModel([
    {
      type: "run_prompt_preset_generation",
      nodeId: "image-1",
      nodeType: "ai-image",
      presetId: "product-hero",
      presetName: "Product Hero",
      inputs: { brief: "warm bakery window" },
    },
  ]);

  assert.equal(model.sections[0].id, "generation");
  assert.match(model.sections[0].title, /Prompt preset generation/);
  assert.match(model.sections[0].actions[0].title, /Prompt preset Product Hero/);
  assert.match(model.sections[0].actions[0].subtitle, /product-hero/);
  assert.match(model.sections[0].actions[0].subtitle, /ai-image/);
  assert.match(formatAssistantActionPreviewModel(model), /Product Hero/);
});

test("assistantActionPreviewModel: prompt preset video generation stays strong confirmed", () => {
  const model = buildAssistantActionPreviewModel([
    { id: "video-1", type: "create_node", nodeType: "ai-video", name: "Video prep" },
    {
      type: "run_prompt_preset_generation",
      nodeId: "video-1",
      presetId: "video-teaser",
      presetName: "Video teaser",
    },
  ]);

  assert.equal(model.requiresStrongConfirmation, true);
  assert.equal(model.riskSummary.videoGeneration, 1);
  assert.match(model.sections.find((section) => section.id === "generation").title, /Prompt preset generation/);
});

test("assistantActionPreviewModel: infers omitted generation nodeType from same-batch video create", () => {
  const model = buildAssistantActionPreviewModel([
    { id: "video-1", type: "create_node", nodeType: "ai-video", name: "Video prep" },
    { type: "queue_generation_task", nodeId: "video-1" },
  ]);

  assert.equal(model.requiresStrongConfirmation, true);
  assert.equal(model.riskSummary.videoGeneration, 1);
});

test("assistantActionPreviewModel: act mode video generation still requires explicit video authorization", () => {
  const model = buildAssistantActionPreviewModel(
    [{ type: "queue_generation_task", nodeId: "video-1", nodeType: "ai-video" }],
    { agentMode: "act" }
  );
  const text = formatAssistantActionPreviewModel(model);

  assert.equal(model.requiresStrongConfirmation, true);
  assert.equal(model.requiresConfirmation, true);
  assert.equal(model.riskSummary.videoGeneration, 1);
  assert.match(text, /Strong confirmation required/);
});

test("assistantActionPreviewModel: plan single AI image generation auto applies", () => {
  const model = buildAssistantActionPreviewModel([
    { type: "queue_generation_task", nodeId: "image-1", nodeType: "ai-image" },
  ]);

  assert.equal(model.requiresStrongConfirmation, false);
  assert.equal(model.requiresConfirmation, false);
});

test("assistantActionPreviewModel: plan multi-node AI generation requires confirmation", () => {
  const model = buildAssistantActionPreviewModel([
    { type: "queue_generation_task", nodeId: "image-1", nodeType: "ai-image" },
    { type: "queue_generation_task", nodeId: "text-1", nodeType: "ai-text" },
  ]);

  assert.equal(model.requiresStrongConfirmation, false);
  assert.equal(model.requiresConfirmation, true);
});

test("assistantActionPreviewModel: formats readable preview text", () => {
  const text = formatAssistantActionPreviewModel(
    buildAssistantActionPreviewModel([
      { type: "focus_nodes", nodeIds: ["n1"] },
      { type: "create_node", nodeId: "n2", nodeType: "ai-text", name: "文案" },
    ])
  );

  assert.match(text, /Preview 2 canvas actions/);
  assert.match(text, /Create 1 node/);
  assert.match(text, /Adjust view\/layout/);
});

test("assistantActionPreviewModel: exposes selectable action items with stable indexes", () => {
  const model = buildAssistantActionPreviewModel(
    [
      { actionId: "focus-a", type: "focus_nodes", nodeIds: ["n1"] },
      { type: "layout_nodes", nodeIds: ["n1"], layout: "single_chain" },
    ],
    { selectedIndexes: [0] }
  );

  assert.deepEqual(model.selectedIndexes, [0]);
  assert.equal(model.sections[0].actions[0].index, 0);
  assert.equal(model.sections[0].actions[0].actionId, "focus-a");
  assert.equal(model.sections[0].actions[0].selected, true);
  assert.equal(model.sections[0].actions[1].index, 1);
  assert.equal(model.sections[0].actions[1].selected, false);
  assert.match(model.sections[0].actions[1].title, /layout_nodes|Layout/);
});


test("assistantActionPreviewModel: surfaces canvas doctor diagnostic metadata", () => {
  const model = buildAssistantActionPreviewModel([
    {
      actionId: "diag-1",
      type: "focus_nodes",
      nodeIds: ["text-1"],
      diagnosticKind: "missing_prompt",
      diagnosticSeverity: "high",
      diagnosticNodeIds: ["text-1"],
      diagnosticSuggestion: "Fill the image prompt before generation.",
    },
  ]);
  const text = formatAssistantActionPreviewModel(model);

  assert.equal(model.riskSummary.diagnostics, 1);
  assert.equal(model.sections[0].id, "diagnostics");
  assert.match(model.sections[0].actions[0].subtitle, /missing_prompt/);
  assert.match(model.sections[0].actions[0].subtitle, /high/);
  assert.match(model.sections[0].actions[0].subtitle, /text-1/);
  assert.match(model.sections[0].actions[0].subtitle, /Fill the image prompt/);
  assert.match(text, /Canvas doctor: 1 diagnostic action/);
  assert.match(text, /High severity: 1/);
});

test("assistantActionPreviewModel: groups duplicate_nodes as workflow variant branches", () => {
  const model = buildAssistantActionPreviewModel([
    {
      actionId: "variants-1",
      type: "duplicate_nodes",
      nodeIds: ["script", "image"],
      variants: [
        { id: "noir", label: "Noir", difference: "rainy monochrome mood" },
        { id: "pop", label: "Pop", difference: "bright playful mood" },
        { id: "doc", label: "Documentary", difference: "handheld realism" },
      ],
      groupBranches: true,
    },
  ]);

  assert.equal(model.sections[0].id, "workflow");
  assert.match(model.sections[0].title, /variant/i);
  assert.match(model.sections[0].actions[0].subtitle, /3 variant branches/);
  assert.match(formatAssistantActionPreviewModel(model), /variant/i);
});

test("assistantActionPreviewModel: surfaces workflow template governance metadata", () => {
  const model = buildAssistantActionPreviewModel([
    {
      actionId: "template-save-1",
      type: "create_workflow_template",
      templateId: "tpl-story",
      name: "Reusable story workflow",
      nodeIds: ["script", "image"],
      scope: "project",
      version: "1.0.0",
      author: "qa-user",
      tags: ["story", "video"],
      requiresConfirmation: true,
    },
  ]);
  const text = formatAssistantActionPreviewModel(model);

  assert.equal(model.sections[0].id, "workflow");
  assert.match(model.sections[0].title, /Template|workflow template/i);
  assert.equal(model.sections[0].risk, "high");
  assert.equal(model.requiresConfirmation, true);
  assert.match(model.sections[0].actions[0].title, /Reusable story workflow/);
  assert.match(model.sections[0].actions[0].subtitle, /tpl-story/);
  assert.match(model.sections[0].actions[0].subtitle, /project/);
  assert.match(model.sections[0].actions[0].subtitle, /1\.0\.0/);
  assert.match(model.sections[0].actions[0].subtitle, /qa-user/);
  assert.match(model.sections[0].actions[0].subtitle, /story/);
  assert.match(text, /Template|workflow template/i);
});

test("assistantActionPreviewModel: surfaces team template governance actions", () => {
  const model = buildAssistantActionPreviewModel([
    {
      actionId: "publish-team-template",
      type: "publish_workflow_template",
      templateId: "tpl-team-story",
      scope: "team",
      teamId: "team-alpha",
      version: "1.0.0",
      reviewStatus: "approved",
      reviewer: "lead",
      author: "alice",
      tags: ["story", "team"],
      requiresConfirmation: true,
    },
  ]);
  const text = formatAssistantActionPreviewModel(model);

  assert.equal(model.sections[0].id, "workflow");
  assert.match(model.sections[0].title, /Team template|workflow template/i);
  assert.equal(model.sections[0].risk, "high");
  assert.equal(model.requiresStrongConfirmation, true);
  assert.match(model.sections[0].actions[0].title, /Publish workflow template|tpl-team-story/i);
  assert.match(model.sections[0].actions[0].subtitle, /team-alpha/);
  assert.match(model.sections[0].actions[0].subtitle, /approved/);
  assert.match(model.sections[0].actions[0].subtitle, /lead/);
  assert.match(model.sections[0].actions[0].subtitle, /story/);
  assert.match(text, /Team template|workflow template/i);
});

test("assistantActionPreviewModel: labels viral lab remake workflow metadata", () => {
  const model = buildAssistantActionPreviewModel([
    {
      actionId: "viral-analysis",
      type: "create_node",
      nodeId: "viral-analysis",
      nodeType: "ai-text",
      name: "Reference deconstruction",
      data: {
        workflowKind: "viral_lab",
        workflowStep: "reference_analysis",
        viralReferenceId: "att-ref-video",
        viralSourceType: "video",
        viralHook: "first-second transformation hook",
        viralPacing: "fast cold-open then three proof beats",
        viralStructure: "hook-problem-proof-offer",
        viralRemakeAngle: "adapt the rhythm to a bakery product demo",
        viralRisk: "avoid copying logo, face, or exact edit timing",
      },
    },
    {
      actionId: "viral-keyframe",
      type: "create_node",
      nodeId: "viral-keyframe",
      nodeType: "ai-image",
      name: "Remake keyframe",
      data: {
        workflowKind: "viral_lab",
        workflowStep: "remake_keyframe",
        viralReplicationStep: "visual proof beat",
        viralBeatIndex: 2,
      },
    },
  ]);
  const text = formatAssistantActionPreviewModel(model);

  assert.equal(model.sections[0].id, "create_nodes");
  assert.match(model.sections[0].title, /Viral Lab/i);
  assert.match(model.sections[0].actions[0].subtitle, /viral_lab/);
  assert.match(model.sections[0].actions[0].subtitle, /att-ref-video/);
  assert.match(model.sections[0].actions[0].subtitle, /first-second transformation/);
  assert.match(model.sections[0].actions[0].subtitle, /bakery product demo/);
  assert.match(model.sections[0].actions[0].subtitle, /avoid copying/);
  assert.match(model.sections[0].actions[1].subtitle, /visual proof beat/);
  assert.match(text, /Viral Lab/i);
});

test("assistantActionPreviewModel: labels LLM Wiki knowledge cards with source metadata", () => {
  const model = buildAssistantActionPreviewModel([
    {
      actionId: "knowledge-card",
      type: "create_node",
      nodeId: "knowledge-card-1",
      nodeType: "source-text",
      name: "Brand Guide",
      data: {
        workflowKind: "knowledge_card",
        workflowStep: "llm_wiki_card",
        sourceTitle: "Brand Guide",
        fileId: "file-brand",
        projectId: "project-brand",
        citation: "p.12",
        citationDisplay: "Brand Guide (file-brand)",
        summary: "Warm, ingredient-led brand voice.",
      },
    },
  ]);
  const text = formatAssistantActionPreviewModel(model);

  assert.equal(model.sections[0].id, "create_nodes");
  assert.match(model.sections[0].title, /Knowledge card/i);
  assert.match(model.sections[0].actions[0].subtitle, /knowledge_card/);
  assert.match(model.sections[0].actions[0].subtitle, /Brand Guide/);
  assert.match(model.sections[0].actions[0].subtitle, /file-brand/);
  assert.match(model.sections[0].actions[0].subtitle, /project-brand/);
  assert.match(model.sections[0].actions[0].subtitle, /p\.12/);
  assert.match(text, /Knowledge card/i);
});

test("assistantActionPreviewModel: surfaces prompt surgery diff and undo metadata", () => {
  const model = buildAssistantActionPreviewModel([
    {
      actionId: "prompt-surgery-1",
      type: "update_node_data",
      nodeId: "prompt-1",
      data: { prompt: "new rainy neon street" },
      previousPrompt: "old rainy street",
      nextPrompt: "new rainy neon street",
      promptDiff: "- old rainy street\n+ new rainy neon street",
      undoPatch: {
        type: "update_node_data",
        nodeId: "prompt-1",
        data: { prompt: "old rainy street" },
      },
    },
  ]);
  const text = formatAssistantActionPreviewModel(model);

  assert.equal(model.sections[0].id, "prompt_surgery");
  assert.match(model.sections[0].title, /Prompt surgery/);
  assert.equal(model.sections[0].actions[0].diff, "- old rainy street\n+ new rainy neon street");
  assert.equal(model.sections[0].actions[0].hasUndoPatch, true);
  assert.match(text, /Prompt diff/);
  assert.match(text, /\+ new rainy neon street/);
});

test("assistantActionPreviewModel: groups storyboard single-shot edits", () => {
  const model = buildAssistantActionPreviewModel([
    {
      actionId: "edit-shot-2",
      type: "update_node_data",
      nodeId: "shot-keyframe-2",
      metadata: {
        storyboardEditScope: "single_shot",
        targetShotIndex: 2,
      },
      data: {
        workflowKind: "story_to_video",
        workflowStep: "shot_keyframe",
        shotIndex: 2,
        shotTitle: "Market turn",
        shotCamera: "Fast lateral tracking shot.",
        shotContinuity: "Keep red jacket continuity.",
      },
    },
  ]);
  const text = formatAssistantActionPreviewModel(model);

  assert.equal(model.sections[0].id, "storyboard_shot_edit");
  assert.match(model.sections[0].title, /Storyboard shot edit/);
  assert.match(model.sections[0].title, /shot 2/);
  assert.match(model.sections[0].actions[0].subtitle, /shot_keyframe/);
  assert.match(model.sections[0].actions[0].subtitle, /Market turn/);
  assert.match(model.sections[0].actions[0].subtitle, /Fast lateral/);
  assert.match(model.sections[0].actions[0].subtitle, /red jacket/);
  assert.match(text, /Storyboard shot edit/);
});
