import assert from "node:assert/strict";
import test from "node:test";

import { executeAssistantActions } from "../assistant/assistantActionExecutor.js";
import { createCanvasSkillsRuntime } from "../assistant/canvasSkills/runtime.js";
import { buildDirectorBrainCanvasPlan } from "./directorBrainService.js";

function createGraphStore() {
  const nodes = [];
  const edges = [];
  return {
    nodes,
    edges,
    addNode(node) {
      nodes.push(node);
      return node;
    },
    addEdge(edge) {
      edges.push(edge);
      return edge;
    },
    updateNodeData(nodeId, patch) {
      const node = nodes.find((item) => item.id === nodeId);
      if (node) {
        node.data = { ...(node.data || {}), ...(patch || {}) };
      }
    },
    setSelectedNodes() {},
  };
}

const QMAI_FILES = new Map([
  ["D:\\qmai\\project\\wiki\\memory\\character-states.md", "## 林澈\n- 黑色短发\n- 米色风衣"],
  ["D:\\qmai\\project\\wiki\\memory\\timeline.md", "## 时间线\n- 雨夜回到旧宅"],
  ["D:\\qmai\\project\\project-meta.json", JSON.stringify({ title: "雨夜旧宅", genre: "悬疑" })],
]);

const KNOWLEDGE_CARDS = [{
  schemaVersion: "director-knowledge-card/v1",
  id: "knowledge-negative-space",
  title: "负空间调度",
  craftDomain: "directing",
  principle: "负空间留给缺席的人。",
  productionRule: "构图时在画面左侧保留空位。",
  promptImplication: "prompt 中明确 negative space 位置。",
  source: { fileName: "director-book.md" },
}];

const STORYBOARD = {
  schemaVersion: "director-storyboard/v1",
  projectId: "project-rain",
  title: "旧伞告别",
  totalDurationSeconds: 12,
  format: "短片",
  visualStyle: "雨夜冷暖对比",
  traceIds: ["recipe-rain-night-short"],
  shots: [{
    id: "shot-001",
    shotNumber: 1,
    durationSeconds: 12,
    shotSize: "wide",
    cameraMove: "固定观察",
    action: "女主门外停顿",
    emotionalBeat: "建立环境",
    visualFocus: "雨幕便利店",
    dramaticBeat: "establish",
    assetIds: ["character-rain-woman"],
    continuityAnchors: ["深色湿外套必须连续"],
    traceIds: ["recipe-rain-night-short"],
  }],
};

const PROMPTS = [{
  schemaVersion: "director-prompt-draft/v1",
  id: "prompt-shot-001-image",
  shotId: "shot-001",
  target: "text_to_image",
  promptLanguage: "Chinese",
  positivePrompt: "雨夜便利店,冷蓝低饱和",
  continuityAnchors: ["深色湿外套必须连续"],
  keyElementIds: ["character-rain-woman"],
  traceIds: ["recipe-rain-night-short"],
}];

test("directorBrainService: builds a canvas plan from real QMAI memory and executes through the real executor", async () => {
  const plan = await buildDirectorBrainCanvasPlan({
    qmaiProjectPath: "D:\\qmai\\project",
    knowledgeCards: KNOWLEDGE_CARDS,
    storyboard: STORYBOARD,
    prompts: PROMPTS,
    readFile: async (path) => QMAI_FILES.get(path),
    listFiles: async () => [...QMAI_FILES.keys()],
  });

  assert.equal(plan.memory.project.name, "雨夜旧宅");
  assert.equal(plan.memory.entryCount > 0, true);
  // No continuity report -> unverified, never a silent pass.
  assert.equal(plan.status, "unverified");
  assert.equal(plan.requiresUserConfirmation, true);
  assert.equal(plan.verdicts.length, 1);
  assert.equal(plan.verdicts[0].schemaVersion, "gate-verdict/v1");
  assert.equal(plan.verdicts[0].status, "unverified");
  assert.equal(plan.blocked.length, 0);
  assert.equal(plan.actions.every((action) => action.metadata?.source === "qmai_director_brain"), true);

  // RED-LINE-2 canvas truth: the plan must execute through the real
  // assistant executor and land real nodes in the graph store.
  const graphStore = createGraphStore();
  const result = await executeAssistantActions({ actions: plan.actions, graphStore });

  assert.equal(result.createdNodeIds.length >= 3, true);
  assert.equal(result.knowledgeCards.length, 1);
  assert.equal(result.queuedGenerationNodeIds.length, 0);
  const shotNode = graphStore.nodes.find((node) => node.type === "storyboard-script");
  assert.equal(shotNode.data.shotIndex, 1);
  const imageNode = graphStore.nodes.find((node) => node.type === "ai-image");
  assert.match(imageNode.data.prompt, /冷蓝低饱和/);
  assert.equal(JSON.stringify(graphStore.nodes).includes("D:\\\\qmai"), false);
});

test("directorBrainService: continuity blockers gate generation while prep actions land", async () => {
  const plan = await buildDirectorBrainCanvasPlan({
    qmaiProjectPath: "D:\\qmai\\project",
    knowledgeCards: KNOWLEDGE_CARDS,
    storyboard: STORYBOARD,
    prompts: PROMPTS,
    extraActions: [{ type: "queue_generation_task", nodeId: "qmai-image-prompt-shot-001-image", nodeType: "ai-video" }],
    continuityReport: {
      schemaVersion: "director-continuity-report/v1",
      status: "block",
      issues: [{
        id: "semantic-character-1",
        severity: "block",
        dimension: "character",
        message: "外套颜色语义漂移",
        evidence: ["beige trench coat"],
        suggestedFix: "改为 dark wet coat",
        confidence: 0.95,
      }],
    },
    readFile: async (path) => QMAI_FILES.get(path),
    listFiles: async () => [...QMAI_FILES.keys()],
  });

  assert.equal(plan.status, "block");
  assert.equal(plan.blocked.length, 1);
  assert.equal(plan.actions.some((action) => action.type === "queue_generation_task"), false);
  assert.equal(plan.actions.some((action) => action.nodeType === "ai-image"), true);
  assert.equal(plan.verdicts[0].status, "block");
});

test("directorBrainService: a pass continuity report yields a pass plan with a pass verdict", async () => {
  const plan = await buildDirectorBrainCanvasPlan({
    qmaiProjectPath: "D:\\qmai\\project",
    knowledgeCards: KNOWLEDGE_CARDS,
    storyboard: STORYBOARD,
    prompts: PROMPTS,
    continuityReport: {
      schemaVersion: "director-continuity-report/v1",
      status: "pass",
      issues: [],
    },
    readFile: async (path) => QMAI_FILES.get(path),
    listFiles: async () => [...QMAI_FILES.keys()],
  });

  assert.equal(plan.status, "pass");
  assert.equal(plan.requiresUserConfirmation, undefined);
  assert.equal(plan.verdicts[0].status, "pass");
  assert.equal(plan.blocked.length, 0);
});

test("directorBrainService: fails fast when the QMAI project has no readable memory", async () => {
  await assert.rejects(
    buildDirectorBrainCanvasPlan({
      qmaiProjectPath: "D:\\qmai\\empty",
      knowledgeCards: [],
      readFile: async () => undefined,
      listFiles: async () => [],
    }),
    /no QMAI memory files/i,
  );
});

test("directorBrainService: unverified plan never auto-starts generation through the canvas-skills path", async () => {
  const plan = await buildDirectorBrainCanvasPlan({
    qmaiProjectPath: "D:\\qmai\\project",
    knowledgeCards: KNOWLEDGE_CARDS,
    storyboard: STORYBOARD,
    prompts: PROMPTS,
    readFile: async (path) => QMAI_FILES.get(path),
    listFiles: async () => [...QMAI_FILES.keys()],
  });
  assert.equal(plan.status, "unverified");

  const graphStore = createGraphStore();
  const generated = [];
  const rendererBridge = {
    isNodeMounted: () => true,
    getMountedWrapper: () => ({}),
    pinNode() {},
    unpinNode() {},
    nodeInstances: new Map(),
  };
  const nodeFlows = {
    createNodeAtCursor(nodeType, width, height, name) {
      const node = { id: `${nodeType}-${graphStore.nodes.length + 1}`, type: nodeType, width, height, name, data: {} };
      graphStore.addNode(node);
      rendererBridge.nodeInstances.set(node.id, {
        async onGenerate(prompt, task) {
          generated.push({ prompt, task });
          return { started: true };
        },
      });
      return node;
    },
  };
  const runtime = createCanvasSkillsRuntime({
    graphStore,
    adapters: {
      nodeFlows,
      rendererBridge,
      modelRegistry: {
        getModelsByNodeType: () => [{ id: "img-1", configured: true }],
        listModels: () => [{ id: "img-1", configured: true }],
      },
    },
    pollIntervalMs: 1,
    readinessTimeoutMs: 20,
  });

  const result = await executeAssistantActions({ actions: plan.actions, graphStore, canvasSkillsRuntime: runtime });

  // RED-LINE-3: unverified plans land prep nodes for inspection but
  // must not fire a single generation - not even via auto-start.
  assert.equal(result.createdNodeIds.length >= 2, true);
  assert.equal(result.startedGenerationNodeIds.length, 0);
  assert.equal(result.queuedGenerationNodeIds.length, 0);
  assert.equal(generated.length, 0);
});
