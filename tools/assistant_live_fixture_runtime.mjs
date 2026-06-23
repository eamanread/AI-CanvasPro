import { readFile } from "node:fs/promises";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function loadLiveFixtureFromObject(raw = {}) {
  return {
    id: String(raw.id || "fixture"),
    title: String(raw.title || raw.id || "Fixture"),
    initialCanvas: {
      nodes: safeArray(raw.initialCanvas?.nodes).map(clone),
      edges: safeArray(raw.initialCanvas?.edges).map(clone),
      selectedNodeIds: safeArray(raw.initialCanvas?.selectedNodeIds).map(String),
    },
    modelOptions: safeArray(raw.modelOptions).map(clone),
    streamFrames: safeArray(raw.streamFrames).map(clone),
    validationResult:
      raw.validationResult && typeof raw.validationResult === "object" ? clone(raw.validationResult) : null,
    expected: raw.expected && typeof raw.expected === "object" ? clone(raw.expected) : {},
  };
}

export async function loadLiveFixture(filePath) {
  return loadLiveFixtureFromObject(JSON.parse(await readFile(filePath, "utf8")));
}

export function createFixtureCanvasAgentApi(fixture) {
  const normalized = loadLiveFixtureFromObject(fixture);
  return {
    async status() {
      return { success: true, available: true, status: "ready" };
    },
    async chat() {
      const done = normalized.streamFrames.find((frame) => frame.type === "message.done") || {};
      return clone(done);
    },
    async chatStream(_payload, handlers = {}) {
      let final = null;
      for (const frame of normalized.streamFrames) {
        const next = clone(frame);
        handlers.onEvent?.(next);
        handlers.onFrame?.(clone(frame));
        if (frame.type === "message.done") {
          final = clone(frame);
        }
        await Promise.resolve();
      }
      handlers.onDone?.(clone(final || {}));
      return final || { reply: "", actions: [], warnings: [] };
    },
    async validateActions(actions) {
      if (normalized.validationResult) {
        return clone(normalized.validationResult);
      }
      return { valid: true, actions: clone(actions), warnings: [] };
    },
    async previewContext(context) {
      return { success: true, context: clone(context), warnings: [] };
    },
  };
}

export function createFixtureGraphStore(initialCanvas = {}) {
  const state = {
    nodes: safeArray(initialCanvas.nodes).map((node) => ({ x: 0, y: 0, ...clone(node) })),
    edges: safeArray(initialCanvas.edges).map(clone),
    selectedNodeIds: safeArray(initialCanvas.selectedNodeIds).map(String),
  };
  return {
    get nodes() {
      return state.nodes;
    },
    get edges() {
      return state.edges;
    },
    getState() {
      return {
        nodes: state.nodes,
        edges: state.edges,
        selectedNodeIds: state.selectedNodeIds,
      };
    },
    addNode(node = {}) {
      state.nodes.push({ x: 0, y: 0, ...clone(node) });
    },
    addEdge(edge = {}) {
      state.edges.push(clone(edge));
    },
    updateNodeData(nodeId, patch = {}) {
      const node = state.nodes.find((item) => item.id === nodeId);
      if (node) {
        node.data = { ...(node.data || {}), ...clone(patch) };
      }
    },
    updateNode(nodeId, patch = {}) {
      const node = state.nodes.find((item) => item.id === nodeId);
      if (node) {
        Object.assign(node, clone(patch));
      }
    },
    setSelectedNodes(nodeIds = []) {
      state.selectedNodeIds = safeArray(nodeIds).map(String);
    },
  };
}

export function graphSnapshot(graphStore) {
  const state = typeof graphStore?.getState === "function" ? graphStore.getState() : graphStore || {};
  const nodes = safeArray(state.nodes || graphStore?.nodes);
  const edges = safeArray(state.edges || graphStore?.edges);
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodes: nodes.map((node) => ({
      id: String(node?.id || ""),
      nodeType: String(node?.nodeType || ""),
      type: String(node?.type || ""),
      name: String(node?.name || node?.title || ""),
      x: Number(node?.x || 0),
      y: Number(node?.y || 0),
    })),
    edges: edges.map((edge) => ({
      id: String(edge?.id || ""),
      source: String(edge?.source || edge?.sourceId || edge?.from || ""),
      target: String(edge?.target || edge?.targetId || edge?.to || ""),
    })),
    selectedNodeIds: safeArray(state.selectedNodeIds).map(String),
  };
}
