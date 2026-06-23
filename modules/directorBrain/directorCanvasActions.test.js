import assert from "node:assert/strict";
import test from "node:test";

import {
  mapActionPackageToCanvasActions,
  mapKnowledgeCardsToCanvasActions,
  mapStoryboardToCanvasActions,
} from "./directorCanvasActions.js";

const KNOWLEDGE_CARDS = [
  {
    schemaVersion: "director-knowledge-card/v1",
    id: "knowledge-negative-space",
    title: "负空间调度",
    craftDomain: "directing",
    principle: "负空间留给缺席的人。",
    productionRule: "构图时在画面左侧保留空位。",
    promptImplication: "prompt 中明确 negative space 位置。",
    source: { fileName: "director-book.md", shortQuote: "负空间是缺席者的位置" },
  },
];

const STORYBOARD = {
  schemaVersion: "director-storyboard/v1",
  projectId: "project-rain",
  title: "旧伞告别",
  totalDurationSeconds: 30,
  format: "短片",
  visualStyle: "雨夜冷暖对比",
  traceIds: ["recipe-rain-night-short", "character-rain-woman"],
  shots: [
    {
      id: "shot-001",
      shotNumber: 1,
      durationSeconds: 12,
      shotSize: "wide",
      cameraMove: "固定在玻璃外观察",
      action: "女主门外停顿",
      emotionalBeat: "建立环境",
      visualFocus: "雨幕中的便利店",
      dramaticBeat: "establish",
      assetIds: ["character-rain-woman"],
      continuityAnchors: ["深色湿外套必须连续"],
      traceIds: ["recipe-rain-night-short", "character-rain-woman"],
    },
    {
      id: "shot-002",
      shotNumber: 2,
      durationSeconds: 18,
      shotSize: "medium",
      cameraMove: "跟随到柜台",
      action: "递伞避开对视",
      emotionalBeat: "主动放手",
      visualFocus: "柜台上的旧伞",
      dramaticBeat: "twist",
      assetIds: ["character-rain-woman"],
      continuityAnchors: ["深色湿外套必须连续"],
      traceIds: ["recipe-rain-night-short", "character-rain-woman"],
    },
  ],
};

const PROMPTS = [
  {
    schemaVersion: "director-prompt-draft/v1",
    id: "prompt-shot-001-image",
    shotId: "shot-001",
    target: "text_to_image",
    modelHint: "GPT Image 2",
    promptLanguage: "Chinese",
    positivePrompt: "雨夜便利店,冷蓝低饱和,深色湿外套女主",
    negativePrompt: "禁止暖光",
    continuityAnchors: ["深色湿外套必须连续"],
    keyElementIds: ["character-rain-woman"],
    traceIds: ["recipe-rain-night-short", "character-rain-woman"],
  },
];

test("directorCanvasActions: maps QMAI knowledge cards to knowledge_card canvas nodes", () => {
  const actions = mapKnowledgeCardsToCanvasActions({ cards: KNOWLEDGE_CARDS, projectId: "project-rain" });

  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, "create_node");
  assert.equal(actions[0].nodeType, "comment");
  assert.equal(actions[0].data.workflowKind, "knowledge_card");
  assert.equal(actions[0].data.citationKind, "qmai");
  assert.equal(actions[0].data.qmaiCardId, "knowledge-negative-space");
  assert.match(actions[0].data.content, /负空间/);
});

test("directorCanvasActions: storyboard maps to shot nodes, prep image nodes, edges, and grid layout", () => {
  const { actions } = mapStoryboardToCanvasActions({ storyboard: STORYBOARD, prompts: PROMPTS });

  const shotNodes = actions.filter((action) => action.type === "create_node" && action.nodeType === "storyboard-script");
  assert.equal(shotNodes.length, 2);
  assert.equal(shotNodes[0].data.storyboardId, "project-rain");
  assert.equal(shotNodes[0].data.shotIndex, 1);
  assert.match(shotNodes[0].data.shotContinuity, /深色湿外套/);

  const imageNodes = actions.filter((action) => action.type === "create_node" && action.nodeType === "ai-image");
  assert.equal(imageNodes.length, 1);
  assert.match(imageNodes[0].data.prompt, /冷蓝低饱和/);

  const edges = actions.filter((action) => action.type === "connect_nodes");
  assert.equal(edges.length, 1);

  // Dogfooding the placement resolver: shots open lanes, preps join
  // their shot's lane, and a tidy sweep replaces the legacy grid.
  assert.equal(shotNodes.every((action) => action.placement?.strategy === "new-lane"), true);
  const imagePlacement = imageNodes[0].placement;
  assert.equal(imagePlacement.strategy, "right-of");
  assert.equal(imagePlacement.anchor, `qmai-shot-${PROMPTS[0].shotId}`);

  const tidy = actions.find((action) => action.type === "tidy_canvas");
  assert.equal(tidy.scope, "all");
  assert.equal(actions.some((action) => action.type === "layout_nodes"), false);

  assert.equal(actions.some((action) => String(action.type).includes("generation")), false);
});

test("directorCanvasActions: ghost prompt shot ids fail closed instead of creating dangling edges", () => {
  const ghostPrompt = { ...PROMPTS[0], id: "prompt-ghost", shotId: "shot-999" };

  assert.throws(
    () => mapStoryboardToCanvasActions({ storyboard: STORYBOARD, prompts: [ghostPrompt] }),
    /shot-999/,
  );
});

test("directorCanvasActions: action package mapper refuses real-send or blocked packages", () => {
  const base = {
    schemaVersion: "qmai-director-action-package/v0",
    packageId: "pkg-001",
    projectId: "project-rain",
    allowRealSend: false,
    continuity: { status: "pass", warnings: [], blocks: [] },
    actions: [
      { id: "act-note-1", type: "note", payload: { note: "等待用户确认 Final_Video_Spec", traceIds: ["recipe-rain-night-short"] } },
    ],
  };

  const mapped = mapActionPackageToCanvasActions(base);
  assert.equal(mapped.actions.length, 1);
  assert.equal(mapped.actions[0].nodeType, "comment");

  assert.throws(
    () => mapActionPackageToCanvasActions({ ...base, allowRealSend: true }),
    /allowRealSend/,
  );
  assert.throws(
    () => mapActionPackageToCanvasActions({ ...base, continuity: { status: "pass", warnings: [], blocks: ["外套颜色漂移"] } }),
    /block/i,
  );
  assert.throws(
    () => mapActionPackageToCanvasActions({ ...base, schemaVersion: "qmai-director-action-package/v9" }),
    /schemaVersion/,
  );
});

test("directorCanvasActions: mapped actions never leak local source paths", () => {
  const dirty = [{
    ...KNOWLEDGE_CARDS[0],
    principle: "出处在 D:\\secret\\qmai\\wiki\\book.md 第三章。",
  }];
  const actions = mapKnowledgeCardsToCanvasActions({ cards: dirty, projectId: "project-rain" });

  assert.equal(JSON.stringify(actions).includes("D:\\\\secret"), false);
});

test("directorCanvasActions: prompt-bearing creates are double-stamped autoStart:false (gate bypass guard)", () => {
  const { actions } = mapStoryboardToCanvasActions({ storyboard: STORYBOARD, prompts: PROMPTS });
  const prepNodes = actions.filter((action) => action.type === "create_node" && action.nodeType === "ai-image");
  assert.equal(prepNodes.length > 0, true);
  for (const action of prepNodes) {
    assert.equal(action.autoStart, false);
    assert.equal(action.data.autoStart, false);
  }

  const pkg = {
    schemaVersion: "qmai-director-action-package/v0",
    packageId: "pkg-rain-1",
    allowRealSend: false,
    actions: [{ id: "a1", type: "prompt", payload: { shotId: "shot-001", positivePrompt: "雨夜便利店" } }],
  };
  const mapped = mapActionPackageToCanvasActions(pkg);
  const promptNodes = mapped.actions.filter((action) => action.nodeType === "ai-image");
  assert.equal(promptNodes.length, 1);
  for (const action of promptNodes) {
    assert.equal(action.autoStart, false);
    assert.equal(action.data.autoStart, false);
  }
});
