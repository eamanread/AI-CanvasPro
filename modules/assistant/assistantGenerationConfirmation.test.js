import assert from "node:assert/strict";
import test from "node:test";

import {
  countGenerationActions,
  generationConfirmationMessage,
  generationConfirmationRequired,
} from "./assistantGenerationConfirmation.js";

const graphStore = {
  nodes: [
    { id: "existing-image", type: "ai-image" },
    { id: "existing-video", type: "ai-video" },
  ],
};

test("assistantGenerationConfirmation: counts only real generation dispatch actions", () => {
  const counts = countGenerationActions(
    [
      { type: "create_node", nodeType: "ai-image", name: "PREP 空节点" },
      { type: "create_node", nodeType: "ai-video", name: "PREP 视频" },
      { type: "connect_nodes", from: "a", to: "b" },
      { type: "layout_nodes", layout: "grid", nodeIds: ["a"] },
      { type: "queue_generation_task", nodeId: "n1", nodeType: "ai-text" },
      { type: "queue_generation_task", nodeId: "n2", nodeType: "ai-image" },
      { type: "run_prompt_preset_generation", nodeId: "existing-image" },
      { type: "queue_generation_task", nodeId: "existing-video" },
    ],
    graphStore
  );

  assert.deepEqual(counts, { text: 1, image: 2, video: 1 });
});

test("assistantGenerationConfirmation: plan mode requires confirm for image or video only", () => {
  assert.equal(generationConfirmationRequired({ text: 0, image: 1, video: 0 }, "plan"), true);
  assert.equal(generationConfirmationRequired({ text: 0, image: 0, video: 1 }, "plan"), true);
  assert.equal(generationConfirmationRequired({ text: 3, image: 0, video: 0 }, "plan"), false);
  assert.equal(generationConfirmationRequired({ text: 0, image: 0, video: 0 }, "plan"), false);
});

test("assistantGenerationConfirmation: act mode requires confirm for video only", () => {
  assert.equal(generationConfirmationRequired({ text: 0, image: 5, video: 0 }, "act"), false);
  assert.equal(generationConfirmationRequired({ text: 2, image: 0, video: 1 }, "act"), true);
  assert.equal(generationConfirmationRequired({ text: 9, image: 0, video: 0 }, "act"), false);
});

test("assistantGenerationConfirmation: message omits zero counts", () => {
  assert.equal(
    generationConfirmationMessage({ text: 2, image: 3, video: 1 }),
    "本次将生成 2 个文本节点、3 个图片节点、1 个视频节点，确认执行吗？"
  );
  assert.equal(
    generationConfirmationMessage({ text: 0, image: 2, video: 0 }),
    "本次将生成 2 个图片节点，确认执行吗？"
  );
  assert.equal(
    generationConfirmationMessage({ text: 0, image: 0, video: 1 }),
    "本次将生成 1 个视频节点，确认执行吗？"
  );
  assert.equal(generationConfirmationMessage({ text: 0, image: 0, video: 0 }), "");
});
