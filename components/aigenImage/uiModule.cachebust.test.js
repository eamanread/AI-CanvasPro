import test from "node:test";
import assert from "node:assert/strict";

import { createAIGenerateNodeUiModule } from "./uiModule.js";

function createStore(nodeId, initialData) {
  const state = {
    nodes: {
      [nodeId]: {
        ...initialData,
      },
    },
    ui: {},
  };

  return {
    getState() {
      return state;
    },
    getIncomingEdges() {
      return [];
    },
    updateNodeData(targetId, patch) {
      const current = state.nodes[targetId] || {};
      state.nodes[targetId] = {
        ...current,
        ...patch,
      };
    },
  };
}

function createPreviewEl() {
  return {
    style: {},
    clientWidth: 320,
    clientHeight: 180,
    offsetWidth: 320,
    offsetHeight: 180,
    offsetTop: 0,
    appendChild() {},
    querySelectorAll() {
      return [];
    },
  };
}

function createImgEl() {
  return {
    src: "",
    style: {},
    draggable: false,
    addEventListener() {},
    setAttribute() {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() {
        return false;
      },
    },
  };
}

function createUiContext(nodeId, data) {
  const store = createStore(nodeId, data);
  const proto = createAIGenerateNodeUiModule({
    store,
    getImage: async () => null,
    getIncomingEdges: () => [],
    bindImageToolbarEvents: () => {},
    bindTextToolbarEvents: () => {},
    openNodeImagePreview: async () => {},
  });

  return Object.assign(Object.create(proto), {
    nodeId,
    _data: store.getState().nodes[nodeId],
    imgEl: createImgEl(),
    previewEl: createPreviewEl(),
    _placeholderEl: { style: {} },
    _thumbObjectUrls: new Map(),
  });
}

test("aigenImage ui: 同一本地路径重生成后会刷新预览地址", async () => {
  const nodeId = "node-ai-image-cachebust";
  const initialData = {
    id: nodeId,
    type: "ai-image",
    images: [
      {
        localPath: "output/reused.png",
        imageUrl: "/output/reused.png",
        sourceUrl: "https://remote.example.com/old.png",
      },
    ],
    mainImageIndex: 0,
    generationStartTime: 100,
    generationDuration: 321,
  };

  const ctx = createUiContext(nodeId, initialData);
  await ctx._loadAndDisplayImage();

  const firstSrc = ctx.imgEl.src;
  assert.match(firstSrc, /\/output\/reused\.png/);

  ctx._data = {
    ...ctx._data,
    images: [
      {
        localPath: "output/reused.png",
        imageUrl: "/output/reused.png",
        sourceUrl: "https://remote.example.com/new.png",
      },
    ],
    generationStartTime: 200,
    generationDuration: 654,
  };

  await ctx._loadAndDisplayImage();

  assert.notEqual(ctx.imgEl.src, firstSrc);
  assert.match(ctx.imgEl.src, /\/output\/reused\.png/);
});
