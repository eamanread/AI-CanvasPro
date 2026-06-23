import assert from "node:assert/strict";
import test from "node:test";

import { buildStrictActionContractPrompt, createPiModelClient, matchedSkillIdsForMessage, responseFromModelText, setRunPiCompletionForTests } from "./piClient.js";
import { handleLine, setPiModelClientForTests } from "./runner.js";

const request = {
  id: "req-1",
  type: "chat",
  mode: "actions",
  message: "focus",
  context: {}
};

test("piClient: parses model JSON contract", () => {
  const response = responseFromModelText(request, JSON.stringify({
    reply: "I will focus it.",
    actions: [{ type: "focus_nodes", nodeIds: ["n1"] }],
    warnings: [],
    requiresConfirmation: false
  }));

  assert.equal(response.reply, "I will focus it.");
  assert.deepEqual(response.actions, [{ type: "focus_nodes", nodeIds: ["n1"] }]);
});

test("piClient: drops forbidden shell-like actions", () => {
  const response = responseFromModelText(request, JSON.stringify({
    reply: "bad",
    actions: [
      { type: "run_shell", command: "dir" },
      { type: "focus_nodes", nodeIds: ["n1"] }
    ],
    warnings: []
  }));

  assert.deepEqual(response.actions, [{ type: "focus_nodes", nodeIds: ["n1"] }]);
});

test("piClient: plain text stays reply-only", () => {
  const response = responseFromModelText(request, "Plain answer.");

  assert.equal(response.reply, "Plain answer.");
  assert.deepEqual(response.actions, []);
  assert.match(response.warnings.join(" "), /plain text/i);
});

test("runner: delegates chat to injected Pi model client instead of echoing", async () => {
  setPiModelClientForTests({
    async complete(bridgeRequest) {
      return {
        id: bridgeRequest.id,
        type: "response",
        success: true,
        reply: "Real model response",
        actions: [{ type: "focus_nodes", nodeIds: ["n1"] }],
        warnings: [],
        requiresConfirmation: false
      };
    }
  });

  const responseLine = await handleLine(JSON.stringify({
    id: "offline-1",
    type: "chat",
    mode: "actions",
    message: "focus",
    context: { canvas: { nodes: [{ id: "n1" }] } }
  }));
  const response = JSON.parse(responseLine || "");

  assert.equal(response.reply, "Real model response");
  assert.deepEqual(response.actions, [{ type: "focus_nodes", nodeIds: ["n1"] }]);
});


test("piClient: uses selected real model over internal model registry id", async () => {
  const captured = [];
  setRunPiCompletionForTests(async (input) => {
    captured.push(input);
    return JSON.stringify({ reply: "ok", actions: [], warnings: [] });
  });

  try {
    const client = createPiModelClient();
    const response = await client.complete({
      id: "model-priority-1",
      type: "chat",
      mode: "actions",
      message: "create layout",
      context: {},
      model: {
        provider: "model_registry",
        modelId: "mdl_text_1778725775635_1",
        id: "mdl_text_1778725775635_1",
        model: "gpt-5.5",
        displayName: "gpt"
      }
    }, {
      baseUrl: "https://text.example/v1",
      apiKey: "text-key"
    });

    assert.equal(response.reply, "ok");
    assert.equal(captured.length, 1);
    assert.equal(captured[0].model, "gpt-5.5");
  } finally {
    setRunPiCompletionForTests(null);
  }
});

test("piClient: parses assistant response contract v2 from model JSON", () => {
  const response = responseFromModelText(request, JSON.stringify({
    reply: "planned",
    intent: {
      id: "intent_1",
      mode: "act",
      matchedSkills: ["storyboard_workflow"]
    },
    plan: {
      id: "plan_1",
      title: "6 镜头分镜",
      status: "draft",
      steps: [{ id: "step_1", title: "生成分镜" }]
    },
    actionsByStep: {
      step_1: [{ type: "create_node", nodeType: "ai-text", name: "分镜 01" }]
    },
    execution: {
      id: "exec_1",
      status: "draft"
    },
    actions: [{ type: "create_node", nodeType: "ai-text", name: "分镜 01" }],
    warnings: []
  }));

  assert.equal(response.intent.id, "intent_1");
  assert.equal(response.plan.id, "plan_1");
  assert.deepEqual(response.actionsByStep.step_1, [
    { type: "create_node", nodeType: "ai-text", name: "分镜 01" }
  ]);
  assert.equal(response.execution.id, "exec_1");
});

test("piClient: wraps legacy actions into a minimal response contract v2 plan", () => {
  const response = responseFromModelText(request, JSON.stringify({
    reply: "legacy",
    actions: [{ type: "focus_nodes", nodeIds: ["n1"] }],
    warnings: []
  }));

  assert.equal(response.intent.id, "intent_req-1");
  assert.equal(response.plan.id, "plan_req-1");
  assert.deepEqual(response.actionsByStep.step_actions, [{ type: "focus_nodes", nodeIds: ["n1"] }]);
  assert.equal(response.execution.id, "exec_req-1");
});


test("piClient: injects unified v2 skills into real completion prompt by default", async () => {
  const captured = [];
  setRunPiCompletionForTests(async (input) => {
    captured.push(input);
    return JSON.stringify({ reply: "ok", actions: [], warnings: [] });
  });

  try {
    const client = createPiModelClient();
    const response = await client.complete({
      id: "skill-registry-default-1",
      type: "chat",
      mode: "actions",
      message: "用预设生成图片",
      context: {}
    }, {
      baseUrl: "https://text.example/v1",
      apiKey: "text-key"
    });

    assert.equal(response.reply, "ok");
    assert.equal(captured.length, 1);
    assert.match(captured[0].systemPrompt, /Unified Skill Registry v2/);
    assert.match(captured[0].systemPrompt, /skill=prompt_preset_generation/);
    assert.match(captured[0].systemPrompt, /allowedActions=.*run_prompt_preset_generation/s);
  } finally {
    setRunPiCompletionForTests(null);
  }
});


test("piClient: strict action contract documents schema-required fields and valid R5 fallback", () => {
  const prompt = buildStrictActionContractPrompt();

  assert.match(prompt, /create_node.*nodeType.*name/s);
  assert.match(prompt, /layout_nodes.*layout.*nodeIds/s);
  assert.match(prompt, /focus_nodes.*nodeIds/s);
  assert.doesNotMatch(prompt, /Do not use create_workflow_template/);
  assert.match(prompt, /create_workflow_template.*explicit template-save/i);
  assert.match(prompt, /apply_workflow_template.*explicit template-reuse/i);
  assert.match(prompt, /requiresConfirmation=true/);
  assert.match(prompt, /project scope/i);
  assert.match(prompt, /Do not write files/i);
  assert.match(prompt, /R5 deterministic canvas assistant journey/);
  assert.match(prompt, /"type":"create_node"/);
});

test("piClient: parses action JSON wrapped in markdown code fences", () => {
  const fenced = [
    "```json",
    JSON.stringify({
      reply: "已创建文本节点",
      actions: [{ type: "create_node", id: "node-1", nodeType: "text", name: "Live 联调验证" }],
      warnings: []
    }),
    "```"
  ].join("\n");

  const response = responseFromModelText({ id: "req-fenced" }, fenced);

  assert.equal(response.reply, "已创建文本节点");
  assert.equal(response.actions.length, 1);
  assert.equal(response.actions[0].type, "create_node");
  assert.equal(response.warnings.length, 0);
  assert.ok(response.plan);
  assert.equal(response.actionsByStep.step_actions.length, 1);
});

test("piClient: backfills intent.matchedSkills from local skill triggers", () => {
  const skills = [
    { id: "canvas_layout", name: "整理画布", triggers: ["整理画布"] },
    { id: "storyboard_workflow", name: "分镜", triggers: ["分镜", "storyboard workflow"] },
  ];
  const response = responseFromModelText(
    { id: "req-skill", message: "根据故事做 2 个分镜，每个分镜一个文本节点" },
    JSON.stringify({
      reply: "好的",
      actions: [{ type: "create_node", nodeType: "text", name: "分镜1" }],
      warnings: [],
    }),
    skills
  );
  assert.deepEqual(response.intent.matchedSkills, ["storyboard_workflow"]);
});

test("piClient: complete() wires loaded skills into matchedSkills backfill", async () => {
  setRunPiCompletionForTests(async () =>
    JSON.stringify({
      reply: "已整理",
      actions: [{ type: "layout_nodes", layout: "grid", nodeIds: ["n1"] }],
      warnings: [],
    })
  );
  try {
    const client = createPiModelClient();
    const response = await client.complete(
      { id: "req-complete-skill", mode: "actions", message: "请帮我整理画布让节点更清楚" },
      { skills: [{ id: "canvas_layout", name: "整理画布", triggers: ["整理画布"] }] }
    );
    assert.deepEqual(response.intent.matchedSkills, ["canvas_layout"]);
  } finally {
    setRunPiCompletionForTests(null);
  }
});

test("piClient: backfills matchedSkills when the model already returned v2 fields", () => {
  const skills = [{ id: "canvas_layout", name: "整理画布", triggers: ["整理画布"] }];
  const response = responseFromModelText(
    { id: "req-v2-skill", mode: "actions", message: "请帮我整理画布" },
    JSON.stringify({
      reply: "已整理",
      intent: { id: "intent_model", mode: "act", matchedSkills: [] },
      plan: { id: "plan_model", steps: [{ id: "s1", title: "Layout" }] },
      actionsByStep: { s1: [{ id: "a1", type: "layout_nodes", layout: "grid", nodeIds: ["n1"] }] },
      actions: [{ id: "a1", type: "layout_nodes", layout: "grid", nodeIds: ["n1"] }],
      warnings: [],
    }),
    skills
  );
  assert.deepEqual(response.intent.matchedSkills, ["canvas_layout"]);
  assert.equal(response.intent.id, "intent_model");
});

test("piClient: semantic trigger matching handles reordered and split phrasings", () => {
  const skills = [
    { id: "canvas_layout", name: "整理画布", triggers: ["整理画布"] },
    { id: "asset_usage", name: "资产", triggers: ["use this asset"] },
  ];
  assert.deepEqual(
    matchedSkillIdsForMessage("帮我把画布整理一下，让节点更清楚", skills),
    ["canvas_layout"]
  );
  assert.deepEqual(
    matchedSkillIdsForMessage("please use my favorite asset for this", skills),
    ["asset_usage"]
  );
  assert.deepEqual(matchedSkillIdsForMessage("今天天气不错", skills), []);
});
