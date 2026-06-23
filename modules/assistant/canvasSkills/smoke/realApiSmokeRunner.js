import { createCanvasSkillsRuntime } from "../runtime.js";

const ACCEPTED_GENERATION_STATES = new Set(["submitted", "queued", "running", "generating"]);

function text(value) {
  return String(value ?? "").trim();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function modelId(model = {}) {
  return text(model.id || model.modelId || model.model || model.name);
}

function normalizeNodeType(nodeType = "") {
  const value = text(nodeType).toLowerCase();
  if (value === "ai-image") return "image";
  if (value === "ai-text") return "text";
  if (value === "ai-video") return "video";
  return value.replace(/^ai-/, "");
}

export function createSmokeGraphStore() {
  const nodes = [];
  const edges = [];
  const store = {
    nodes,
    edges,
    selectedNodeIds: [],
    addNode(node = {}) {
      const next = cloneJson(node);
      nodes.push(next);
      return next;
    },
    addEdge(edge = {}) {
      const next = cloneJson(edge);
      edges.push(next);
      return next;
    },
    updateNodeData(nodeId, patch = {}) {
      const node = nodes.find((item) => text(item?.id) === text(nodeId));
      if (node) {
        node.data = { ...(node.data || {}), ...cloneJson(patch) };
      }
    },
    updateNode(nodeId, patch = {}) {
      const node = nodes.find((item) => text(item?.id) === text(nodeId));
      if (node) {
        Object.assign(node, cloneJson(patch));
      }
    },
    setSelectedNodes(nodeIds = []) {
      store.selectedNodeIds = safeArray(nodeIds).map(String);
    },
    getState() {
      return { nodes, edges, selectedNodeIds: store.selectedNodeIds };
    },
  };
  return store;
}

export function createSmokeModelRegistry({ textModel = null, imageModel = null, videoModel = null, models = [] } = {}) {
  const explicitModels = safeArray(models);
  const typedModels = [
    textModel ? { ...textModel, nodeType: textModel.nodeType || "text" } : null,
    imageModel ? { ...imageModel, nodeType: imageModel.nodeType || "image" } : null,
    videoModel ? { ...videoModel, nodeType: videoModel.nodeType || "video" } : null,
    ...explicitModels,
  ].filter(Boolean);

  return {
    getModelsByNodeType(nodeType = "") {
      const normalized = normalizeNodeType(nodeType);
      return typedModels.filter((model) => normalizeNodeType(model.nodeType || model.type) === normalized);
    },
    listModels() {
      return typedModels;
    },
    resolveModel(value = "") {
      const expected = text(value).toLowerCase();
      return typedModels.find((model) => modelId(model).toLowerCase() === expected) || null;
    },
  };
}

export function createCanvasSkillsSmokeRuntime({
  textModel = null,
  imageModel = null,
  videoModel = null,
  graphStore = createSmokeGraphStore(),
  taskIdFactory = () => `canvas-skills-smoke-${Date.now()}`,
} = {}) {
  let nextId = 0;
  const nodeInstances = new Map();
  const rendererBridge = {
    nodeInstances,
    isNodeMounted(nodeId) {
      return nodeInstances.has(text(nodeId));
    },
    getMountedWrapper(nodeId) {
      return nodeInstances.has(text(nodeId)) ? {} : null;
    },
    pinNode() {},
    unpinNode() {},
  };
  const nodeFlows = {
    createNodeAtCursor(nodeType, width = 320, height = 220, name = "") {
      const id = `${text(nodeType) || "node"}-smoke-${++nextId}`;
      const node = {
        id,
        type: nodeType,
        nodeType,
        width,
        height,
        name: text(name || nodeType || "Smoke Node"),
        data: {},
      };
      graphStore.addNode(node);
      nodeInstances.set(id, {
        async _onGenerate(prompt, task = {}) {
          const taskId = taskIdFactory({ nodeId: id, prompt, task });
          graphStore.updateNodeData(id, {
            prompt: text(prompt),
            generationStatus: "submitted",
            taskStatus: "submitted",
            taskId,
          });
          return { started: true, taskId, nodeState: "submitted" };
        },
        async onGenerate(prompt, task = {}) {
          return this._onGenerate(prompt, task);
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
      modelRegistry: createSmokeModelRegistry({ textModel, imageModel, videoModel }),
    },
    pollIntervalMs: 1,
    readinessTimeoutMs: 50,
  });
  return { ...runtime, graphStore, rendererBridge, nodeFlows };
}

function snapshotAssistant(snapshot = {}) {
  return snapshot?.assistant || snapshot?.state?.assistant || {};
}

function snapshotGraph(snapshot = {}) {
  return snapshot?.graph || snapshot?.state?.graph || {};
}

function messageCards(snapshot = {}) {
  return safeArray(snapshotAssistant(snapshot)?.messages).flatMap((message) => safeArray(message?.cards));
}

function graphSubmittedImageNode(snapshot = {}) {
  return safeArray(snapshotGraph(snapshot)?.nodes).find((node) => {
    const nodeType = text(node?.nodeType || node?.type || node?.data?.nodeType);
    const status = text(node?.generationStatus || node?.status || node?.data?.generationStatus || node?.data?.taskStatus).toLowerCase();
    return nodeType === "ai-image" && ACCEPTED_GENERATION_STATES.has(status);
  }) || null;
}

function receiptSubmittedNodeId(snapshot = {}) {
  const details = snapshotAssistant(snapshot)?.lastReceiptDetails || {};
  const directNodeId = text(
    safeArray(details.queuedGenerationNodeIds)[0] ||
      safeArray(details.startedGenerationNodeIds)[0]
  );
  if (directNodeId) {
    return directNodeId;
  }
  const receipt = safeArray(details.canvasSkillReceipts).find((item) => {
    if (!item || typeof item !== "object") return false;
    return text(item.nodeId) ||
      safeArray(item.queuedGenerationNodeIds).some((nodeId) => text(nodeId)) ||
      safeArray(item.startedGenerationNodeIds).some((nodeId) => text(nodeId));
  });
  return text(
    safeArray(receipt?.queuedGenerationNodeIds)[0] ||
      safeArray(receipt?.startedGenerationNodeIds)[0] ||
      receipt?.nodeId
  );
}

export function normalizeBrowserSmokeResult(raw = {}) {
  const snapshots = safeArray(raw.assistantSnapshots || raw.debugSnapshots || raw.snapshots);
  const sawStreaming = snapshots.some((snapshot) => snapshotAssistant(snapshot)?.streaming === true);
  const finalSnapshot = snapshots[snapshots.length - 1] || {};
  const finalAssistant = snapshotAssistant(finalSnapshot);
  const traceCard = snapshots.some((snapshot) => messageCards(snapshot).some((card) => text(card?.type) === "skill_trace"));
  const submittedNode = snapshots.map(graphSubmittedImageNode).find(Boolean) || null;
  const submittedReceiptNodeId = snapshots.map(receiptSubmittedNodeId).find(Boolean) || "";
  const submission = {
    ...((raw.submission && typeof raw.submission === "object") ? raw.submission : {}),
    accepted: raw.submission?.accepted === true || Boolean(submittedNode) || Boolean(submittedReceiptNodeId),
    nodeState: raw.submission?.nodeState || submittedNode?.generationStatus || submittedNode?.data?.generationStatus || (submittedReceiptNodeId ? "submitted" : ""),
  };
  const passed = raw.status === "passed" && submission.accepted && (traceCard || Boolean(submittedNode));

  return {
    status: passed ? "passed" : "failed",
    mode: "Browser",
    failureCategory: passed ? "" : "GENERATION_SUBMIT_FAILED",
    submission,
    createdNodeId: text(raw.createdNodeId || submittedNode?.id || submittedReceiptNodeId),
    sawStreaming,
    sawDone: finalAssistant.streaming === false || raw.done === true,
    sawSkillTraceCard: traceCard,
    submittedImageNode: submittedNode || submittedReceiptNodeId
      ? { id: text(submittedNode?.id || submittedReceiptNodeId), status: submission.nodeState }
      : null,
    warnings: safeArray(raw.warnings),
    rawSummary: {
      status: raw.status || "",
      artifactDir: raw.artifactDir || "",
      scorecardPath: raw.scorecardPath || "",
    },
  };
}
