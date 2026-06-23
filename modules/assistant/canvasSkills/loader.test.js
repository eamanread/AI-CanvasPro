import assert from "node:assert/strict";
import test from "node:test";

import { loadCanvasSkillsRuntime } from "./loader.js";

test("canvasSkills loader: returns chat-only degraded runtime when canvas dependencies are missing", async () => {
  const runtime = loadCanvasSkillsRuntime({ adapters: {} });

  assert.equal(runtime.ready, false);
  assert.equal(runtime.chatOnly, true);
  assert.equal(runtime.notice, "画布 Skills 未加载，当前只能聊天，不能操作画布。");
  assert.equal(typeof runtime.executeActions, "function");

  const result = await runtime.executeActions({
    actions: [{ type: "create_node", nodeType: "ai-image" }],
  });
  assert.equal(result.success, false);
  assert.equal(result.appliedCount, 0);
  assert.match(result.warnings.join("\n"), /画布 Skills 未加载/);
});

test("canvasSkills loader: returns ready runtime when dependencies are available", async () => {
  const runtime = loadCanvasSkillsRuntime({
    executeActions: async () => ({ success: true, appliedCount: 1, warnings: [] }),
    adapters: {
      nodeLifecycle: {},
      rendererBridge: {},
    },
  });

  assert.equal(runtime.ready, true);
  assert.equal(runtime.chatOnly, false);
  assert.equal(runtime.notice, "");
  assert.equal(runtime.manifest.moduleId, "huanying.canvasSkills");
  const result = await runtime.executeActions({ actions: [] });
  assert.equal(result.success, true);
});

test("canvasSkills loader: node flows are enough for ready runtime because renderer can resolve lazily", () => {
  const runtime = loadCanvasSkillsRuntime({
    adapters: {
      nodeLifecycle: {
        createNodeAtCursor() {},
      },
      rendererBridge: null,
    },
  });

  assert.equal(runtime.ready, true);
  assert.equal(runtime.chatOnly, false);
});
