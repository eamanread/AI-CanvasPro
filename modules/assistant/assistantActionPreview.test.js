import assert from "node:assert/strict";
import test from "node:test";

import {
  summarizeAssistantActions,
  buildAssistantActionReceipt,
} from "./assistantActionPreview.js";

test("assistantActionPreview: detects workflow kind from nested metadata", () => {
  const summary = summarizeAssistantActions([
    {
      type: "create_node",
      nodeType: "ai-text",
      data: {
        metadata: {
          workflowKind: "story_to_video",
          workflowStep: "story_outline",
        },
      },
    },
  ]);

  assert.equal(summary.workflowKind, "story_to_video");
});

test("assistantActionPreview: summarizes story to video workflow", () => {
  const summary = summarizeAssistantActions([
    {
      type: "create_node",
      nodeType: "ai-text",
      data: { workflowKind: "story_to_video", workflowStep: "story_outline" },
    },
    {
      type: "create_node",
      nodeType: "ai-image",
      data: { workflowKind: "story_to_video", workflowStep: "shot_keyframe" },
    },
    { type: "connect_nodes", from: "a", to: "b" },
    { type: "queue_generation_task", nodeType: "ai-image", nodeId: "b" },
  ]);

  assert.equal(summary.workflowKind, "story_to_video");
  assert.match(summary.title, /故事视频工作流/);
  assert.match(summary.description, /将创建 2 个节点，连接 1 条线/);
  assert.match(summary.description, /文本\/图片生成将自动执行 1 个任务/);
  assert.match(summary.description, /视频生成仍需确认/);
});

test("assistantActionPreview: receipt keeps video gated wording", () => {
  const receipt = buildAssistantActionReceipt({
    actions: [
      {
        type: "create_node",
        nodeType: "ai-video",
        data: { workflowKind: "story_to_video", workflowStep: "shot_video" },
      },
    ],
    result: { appliedCount: 1 },
  });

  assert.match(receipt, /故事视频工作流/);
  assert.match(receipt, /视频生成仍需确认/);
});

test("assistantActionPreview: distinguishes prompt preset generation receipts", () => {
  const actions = [
    {
      type: "run_prompt_preset_generation",
      nodeId: "image-1",
      nodeType: "ai-image",
      presetId: "product-hero",
      presetName: "Product Hero",
      inputs: { brief: "warm bakery window" },
    },
  ];
  const summary = summarizeAssistantActions(actions);
  const receipt = buildAssistantActionReceipt({
    actions,
    result: { appliedCount: 1, startedGenerationNodeIds: ["image-1"] },
  });

  assert.equal(summary.promptPresetGenerationCount, 1);
  assert.match(summary.title, /Prompt preset generation/);
  assert.match(summary.description, /Product Hero/);
  assert.doesNotMatch(summary.description, /视频生成|Video generation/);
  assert.match(receipt, /Prompt preset generation/);
  assert.match(receipt, /Product Hero/);
  assert.match(receipt, /Started 1 text\/image generation task/);
});

test("assistantActionPreview: summarizes storyboard single-shot edits without video warning", () => {
  const summary = summarizeAssistantActions([
    {
      type: "update_node_data",
      nodeId: "shot-script-2",
      metadata: { storyboardEditScope: "single_shot", targetShotIndex: 2 },
      data: {
        workflowKind: "story_to_video",
        workflowStep: "shot_script",
        shotIndex: 2,
        shotTitle: "Market turn",
      },
    },
    {
      type: "update_node_data",
      nodeId: "shot-keyframe-2",
      metadata: { storyboardEditScope: "single_shot", targetShotIndex: 2 },
      data: {
        workflowKind: "story_to_video",
        workflowStep: "shot_keyframe",
        shotIndex: 2,
        shotTitle: "Market turn",
      },
    },
  ]);

  assert.equal(summary.workflowKind, "story_to_video");
  assert.equal(summary.storyboardEditScope, "single_shot");
  assert.equal(summary.targetShotIndex, 2);
  assert.match(summary.title, /Storyboard shot edit/);
  assert.match(summary.description, /shot 2/);
  assert.match(summary.description, /2 nodes/);
  assert.doesNotMatch(summary.description, /Video generation/);
  assert.doesNotMatch(summary.description, /create 0/i);
});

test("assistantActionPreview: labels one-sentence workflows in receipts", () => {
  const summary = summarizeAssistantActions([
    {
      type: "create_node",
      nodeType: "source-text",
      data: { workflowKind: "text_to_image_video", workflowStep: "source_prompt" },
    },
    {
      type: "create_node",
      nodeType: "ai-image",
      data: { workflowKind: "text_to_image_video", workflowStep: "image_generation" },
    },
    {
      type: "create_node",
      nodeType: "ai-video",
      data: { workflowKind: "text_to_image_video", workflowStep: "video_prep" },
    },
    { type: "connect_nodes", from: "prompt", to: "image" },
    { type: "connect_nodes", from: "image", to: "video" },
    { type: "queue_generation_task", nodeType: "ai-image", nodeId: "image" },
  ]);

  assert.equal(summary.workflowKind, "text_to_image_video");
  assert.match(summary.title, /\u56fe\u6587\u89c6\u9891\u5de5\u4f5c\u6d41/);
  assert.match(summary.description, /3 \u4e2a\u8282\u70b9/);
  assert.match(summary.description, /2 \u6761\u7ebf/);
  assert.match(summary.description, /\u89c6\u9891\u751f\u6210\u4ecd\u9700\u786e\u8ba4/);
});

test("assistantActionPreview: labels viral lab remake workflow receipts", () => {
  const summary = summarizeAssistantActions([
    {
      type: "create_node",
      nodeType: "ai-text",
      data: {
        workflowKind: "viral_lab",
        workflowStep: "reference_analysis",
        viralReferenceId: "att-ref-video",
        viralHook: "cold open transformation",
        viralStructure: "hook-proof-offer",
        viralRemakeAngle: "turn the structure into a bakery product demo",
      },
    },
    {
      type: "create_node",
      nodeType: "ai-video",
      data: { workflowKind: "viral_lab", workflowStep: "video_prep" },
    },
    { type: "connect_nodes", from: "viral-analysis", to: "viral-video" },
    { type: "queue_generation_task", nodeType: "ai-image", nodeId: "viral-keyframe" },
  ]);
  const receipt = buildAssistantActionReceipt({ actions: [], result: { appliedCount: 4 } });

  assert.equal(summary.workflowKind, "viral_lab");
  assert.match(summary.title, /Viral Lab/i);
  assert.match(summary.description, /2 \u4e2a\u8282\u70b9/);
  assert.match(summary.description, /1 \u6761\u7ebf/);
  assert.match(summary.description, /\u89c6\u9891\u751f\u6210\u4ecd\u9700\u786e\u8ba4/);
  assert.match(
    buildAssistantActionReceipt({
      actions: [
        {
          type: "create_node",
          nodeType: "ai-text",
          data: { workflowKind: "viral_lab", workflowStep: "reference_analysis" },
        },
      ],
      result: { appliedCount: 1 },
    }),
    /Viral Lab/i
  );
  assert.match(receipt, /Canvas|画布|鐢诲竷/);
});

test("assistantActionPreview: labels knowledge card receipts with source trace", () => {
  const actions = [
    {
      type: "create_node",
      nodeType: "source-text",
      data: {
        workflowKind: "knowledge_card",
        workflowStep: "llm_wiki_card",
        sourceTitle: "Brand Guide",
        fileId: "file-brand",
        projectId: "project-brand",
        citation: "p.12",
        citationDisplay: "Brand Guide (file-brand)",
      },
    },
  ];
  const summary = summarizeAssistantActions(actions);
  const receipt = buildAssistantActionReceipt({
    actions,
    result: {
      appliedCount: 1,
      knowledgeCards: [
        {
          nodeId: "knowledge-card-1",
          title: "Brand Guide",
          fileId: "file-brand",
          projectId: "project-brand",
          citation: "p.12",
          citationDisplay: "Brand Guide (file-brand)",
        },
      ],
    },
  });

  assert.equal(summary.workflowKind, "knowledge_card");
  assert.match(summary.title, /Knowledge card/i);
  assert.match(summary.description, /Brand Guide/);
  assert.match(summary.description, /file-brand/);
  assert.doesNotMatch(summary.description, /Video generation/);
  assert.doesNotMatch(summary.description, /\u89c6\u9891\u751f\u6210/);
  assert.match(receipt, /Knowledge card/i);
  assert.match(receipt, /Brand Guide/);
  assert.match(receipt, /file-brand/);
  assert.match(receipt, /p\.12/);
});
