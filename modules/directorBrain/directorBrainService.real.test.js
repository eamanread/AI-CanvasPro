import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";

import { executeAssistantActions } from "../assistant/assistantActionExecutor.js";
import { buildDirectorBrainCanvasPlan } from "./directorBrainService.js";

// Full-real acceptance: a real Director OS project on disk (written by
// the QMAI flywheel with real LLM artifacts) flows through the loader,
// the brain service, and the REAL assistant executor, landing real
// storyboard shot nodes on the canvas. No fixtures, no mocks.
const realDir = process.env.HY_QMAI_PROJECT_DIR?.trim();

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

async function readJson(filePath) {
  return JSON.parse((await fs.readFile(filePath, "utf-8")).replace(/^﻿/, ""));
}

test(
  "directorBrainService: real flywheel artifacts land as real canvas shot nodes",
  { skip: !realDir },
  async () => {
    const storyboard = await readJson(path.join(realDir, "director/outputs/storyboards/round-2.json"));
    const prompts = await readJson(path.join(realDir, "director/outputs/prompts/round-2.json"));
    assert.equal(storyboard.schemaVersion, "director-storyboard/v1");
    assert.equal(Array.isArray(prompts) && prompts.length > 0, true);

    let continuityReport = null;
    try {
      continuityReport = await readJson(path.join(realDir, "director/outputs/continuity/round-2.json"));
    } catch {
      continuityReport = null;
    }

    const plan = await buildDirectorBrainCanvasPlan({
      qmaiProjectPath: realDir,
      storyboard,
      prompts,
      continuityReport,
    });

    assert.equal(plan.memory.entryCount > 0, true);
    if (continuityReport) {
      // The real exported verdict governs the plan status.
      assert.equal(plan.status, continuityReport.status);
    } else {
      // No exported continuity report may never silently pass.
      assert.equal(plan.status, "unverified");
      assert.equal(plan.requiresUserConfirmation, true);
    }
    assert.equal(plan.verdicts[0].schemaVersion, "gate-verdict/v1");

    const graphStore = createGraphStore();
    const result = await executeAssistantActions({ actions: plan.actions, graphStore });

    const shotNodes = graphStore.nodes.filter((node) => node.type === "storyboard-script");
    assert.equal(shotNodes.length, storyboard.shots.length);
    assert.equal(shotNodes.every((node) => Number.isFinite(node.data.shotIndex)), true);
    assert.equal(shotNodes.every((node) => String(node.data.shotContinuity).length > 0), true);

    const imageNodes = graphStore.nodes.filter((node) => node.type === "ai-image");
    assert.equal(imageNodes.length, prompts.filter((prompt) => prompt.target === "text_to_image").length);
    assert.equal(imageNodes.every((node) => String(node.data.prompt).length > 0), true);

    assert.equal(result.queuedGenerationNodeIds.length, 0);
    assert.equal(graphStore.edges.length, imageNodes.length);
    const serialized = JSON.stringify(graphStore.nodes);
    assert.equal(serialized.includes(realDir.replace(/\\/g, "\\\\")), false);
  },
);
