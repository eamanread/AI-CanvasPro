import test from "node:test";
import assert from "node:assert/strict";

import { createAIGenerateNodeTaskOrchestrationModule } from "./taskOrchestrationModule.js";

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalNode = globalThis.Node;

if (!globalThis.window) {
  globalThis.window = {};
}
if (!globalThis.window.showToast) {
  globalThis.window.showToast = () => {};
}
if (!globalThis.Node) {
  globalThis.Node = {
    TEXT_NODE: 3,
    ELEMENT_NODE: 1,
  };
}
if (!globalThis.document) {
  globalThis.document = {
    getElementById: () => null,
  };
}

test.after(() => {
  if (originalWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }

  if (originalDocument === undefined) {
    delete globalThis.document;
  } else {
    globalThis.document = originalDocument;
  }

  if (originalNode === undefined) {
    delete globalThis.Node;
  } else {
    globalThis.Node = originalNode;
  }
});

function createStore(nodeId, nodeData) {
  const state = {
    nodes: {
      [nodeId]: {
        ...nodeData,
      },
    },
  };

  return {
    getState() {
      return state;
    },
    getIncomingEdges() {
      return [];
    },
    updateNodeData(targetId, patch) {
      state.nodes[targetId] = {
        ...(state.nodes[targetId] || {}),
        ...patch,
      };
    },
  };
}

function createPromptEl(text) {
  return {
    childNodes: [
      {
        nodeType: Node.TEXT_NODE,
        textContent: text,
      },
    ],
  };
}

test("aigenImage task orchestration: batch image result keeps every generated image", async () => {
  const nodeId = "node-ai-image-batch-result";
  const store = createStore(nodeId, {
    id: nodeId,
    type: "ai-image",
    model: "grsai/seedream-4.0",
    provider: "grsai",
    aspectRatio: "1:1",
    imageSize: "2K",
    batchSize: 2,
  });
  let submittedPayload = null;

  const module = createAIGenerateNodeTaskOrchestrationModule({
    store,
    getRefKindByNodeType: () => null,
    getImage: async () => null,
    ensureConfig: async () => {},
    getProviderConfig: () => ({ apiKey: "k_grsai" }),
    api: {
      generateImage: async (payload) => {
        submittedPayload = payload;
        return {
          isBatch: true,
          images: [
            {
              imageUrl: "/output/batch-1.png",
              sourceUrl: "https://img.example.com/batch-1.png",
              thumbUrl: "/output/batch-1.png",
            },
            {
              imageUrl: "/output/batch-2.png",
              sourceUrl: "https://img.example.com/batch-2.png",
              thumbUrl: "/output/batch-2.png",
            },
          ],
        };
      },
    },
    startLoading: () => {},
    stopLoading: () => {},
  });

  const ctx = Object.assign(Object.create(module), {
    nodeId,
    _data: store.getState().nodes[nodeId],
    promptEl: createPromptEl("batch prompt"),
    _isRunninghubWorkflowModel: () => false,
  });

  await module._onGenerate.call(ctx);

  assert.equal(submittedPayload.batchSize, 2);
  const updated = store.getState().nodes[nodeId];
  assert.equal(updated.jobStatus, "success");
  assert.equal(updated.isGenerating, false);
  assert.equal(updated.images.length, 2);
  assert.equal(updated.imageUrl, "/output/batch-1.png");
  assert.equal(updated.images[1].imageUrl, "/output/batch-2.png");
});
