import test from "node:test";
import assert from "node:assert/strict";

import { createVideoNodeTaskOrchestrationModule } from "./taskOrchestrationModule.js";

function createMemoryLocalStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function createStore(nodes = {}, incomingEdges = []) {
  return {
    getState() {
      return { nodes };
    },
    getIncomingEdges(targetId) {
      return incomingEdges.filter((edge) => edge.targetId === targetId);
    },
    updateNodeData(nodeId, patch) {
      nodes[nodeId] = { ...(nodes[nodeId] || {}), ...patch };
    },
  };
}

function createPromptEl(text) {
  return {
    innerText: text,
    textContent: text,
    childNodes: [{ nodeType: 3, textContent: text }],
  };
}

test("task orchestration: Dreamina video payload includes selected login region", async () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    __aicInstallId: "install-ok",
    localStorage: createMemoryLocalStorage({ dreaminaLoginRegion: "overseas" }),
    showToast() {},
    _triggerLocalCacheSave() {},
  };

  try {
    const nodeId = "dreamina-video-region";
    const nodes = {
      [nodeId]: {
        id: nodeId,
        type: "ai-video",
        provider: "dreamina",
        model: "dreamina/seedance2.0fast",
        dreaminaRouteMode: "text2video",
        aspectRatio: "16:9",
        resolution: "720p",
        duration: 5,
      },
    };
    const proto = createVideoNodeTaskOrchestrationModule({
      store: createStore(nodes),
      api: {},
      getImage: async () => null,
      startLoading() {},
      stopLoading() {},
      ensureConfig: async () => {},
      getProviderConfig: () => ({ apiKey: "" }),
      isVideoVipModel: () => false,
      ensureVipSessionRecheck: async () => {},
    });
    const ctx = Object.assign(Object.create(proto), {
      nodeId,
      _data: nodes[nodeId],
      promptEl: createPromptEl("a dog running"),
      _normalizeDreaminaNodeData(data) {
        return data;
      },
      _resolveMediaUrl(value) {
        return String(value || "");
      },
      _isDreaminaVideoNode(data) {
        return String(data?.provider || "").toLowerCase() === "dreamina";
      },
      _isRunninghubWorkflowModel() {
        return false;
      },
    });

    const payload = await proto._buildPayloadImpl.call(ctx);

    assert.equal(payload.provider, "dreamina");
    assert.equal(payload.dreaminaLoginRegion, "overseas");
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});
