import assert from "node:assert/strict";
import test from "node:test";

import { createAssistantExecutionOrchestrator } from "./assistantExecutionOrchestrator.js";
import { createAssistantExecutionStore } from "./assistantExecutionStore.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
}

function createStoreWithPlan() {
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-orchestrator",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-fixed`,
  });
  store.createExecution({
    id: "exec-orchestrator",
    title: "Layout canvas",
    status: "draft",
    drawerState: { visible: true, line1: "Layout canvas", line2: "Waiting" },
    plan: {
      id: "plan-orchestrator",
      title: "Layout canvas",
      steps: [
        { id: "step-create", title: "Create text node" },
        { id: "step-connect", title: "Connect image node" },
      ],
    },
    actionsByStep: {
      "step-create": [
        { id: "act-create", type: "create_node", nodeId: "text-1", title: "Create text node" },
      ],
      "step-connect": [
        { id: "act-connect", type: "connect_nodes", from: "text-1", to: "image-1", title: "Connect image node" },
      ],
    },
  });
  return store;
}

function createStoreWithDependencyPlan() {
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-orchestrator-dependencies",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-fixed`,
  });
  store.createExecution({
    id: "exec-dependencies",
    title: "Recover dependency failure",
    status: "draft",
    drawerState: { visible: true, line1: "Recover dependency failure", line2: "Waiting" },
    plan: {
      id: "plan-dependencies",
      title: "Recover dependency failure",
      steps: [
        { id: "step-source", title: "Create source" },
        { id: "step-dependent", title: "Generate dependent image", dependsOn: ["step-source"] },
        { id: "step-independent", title: "Create independent caption" },
      ],
    },
    actionsByStep: {
      "step-source": [
        { id: "act-source", type: "create_node", nodeId: "source-1", title: "Create source" },
      ],
      "step-dependent": [
        {
          id: "act-dependent",
          type: "queue_generation_task",
          nodeId: "image-1",
          nodeType: "ai-image",
          title: "Generate dependent image",
        },
      ],
      "step-independent": [
        { id: "act-independent", type: "create_node", nodeId: "caption-1", title: "Create independent caption" },
      ],
    },
  });
  return store;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("assistantExecutionOrchestrator: executes v2 plan actions one by one and writes timeline/status", async () => {
  const store = createStoreWithPlan();
  const validateCalls = [];
  const executeCalls = [];
  const syncedTimeline = [];
  const syncedStatuses = [];
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => {
      validateCalls.push(payload);
      return { success: true, valid: true, actions: payload.actions };
    },
    executeActions: async (payload) => {
      executeCalls.push(payload);
      if (payload.actions[0].id === "act-create") {
        return { appliedCount: 1, createdNodeIds: ["text-1"] };
      }
      return { appliedCount: 1, createdEdgeIds: ["edge-1"] };
    },
    executionSyncClient: {
      async appendTimelineEvent(executionId, event) {
        syncedTimeline.push({ executionId, event });
      },
      async updateExecutionStatus(executionId, status, patch) {
        syncedStatuses.push({ executionId, status, patch });
      },
    },
  });

  const result = await orchestrator.run("exec-orchestrator", { agentMode: "act" });

  assert.equal(result.status, "completed");
  assert.equal(result.actionCount, 2);
  assert.deepEqual(validateCalls.map((call) => call.actions.map((action) => action.id)), [
    ["act-create"],
    ["act-connect"],
  ]);
  assert.deepEqual(executeCalls.map((call) => call.actions.map((action) => action.id)), [
    ["act-create"],
    ["act-connect"],
  ]);
  const stored = store.getExecution("exec-orchestrator");
  assert.equal(stored.status, "completed");
  assert.deepEqual(stored.progress, { done: 2, total: 2 });
  assert.equal(stored.drawerState.line2, "执行完成");
  assert.deepEqual(
    stored.timeline.map((event) => [event.actionId, event.status]),
    [
      ["act-create", "running"],
      ["act-create", "completed"],
      ["act-connect", "running"],
      ["act-connect", "completed"],
    ]
  );
  assert.deepEqual(stored.timeline[1].nodeIds, ["text-1"]);
  assert.equal(syncedTimeline.length, 4);
  assert.deepEqual(
    syncedStatuses.map((call) => call.status),
    ["executing", "executing", "executing", "completed"]
  );
});

test("assistantExecutionOrchestrator: humanizes technical action summaries for the timeline", async () => {
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-orchestrator-humanizer",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-fixed`,
  });
  store.createExecution({
    id: "exec-humanizer",
    title: "Generate storyboard image",
    status: "draft",
    drawerState: { visible: true, line1: "Generate storyboard image", line2: "Waiting" },
    plan: {
      id: "plan-humanizer",
      steps: [{ id: "step-image", title: "Generate image" }],
    },
    actionsByStep: {
      "step-image": [
        {
          id: "act-image",
          type: "queue_generation_task",
          nodeId: "image-1",
          nodeType: "ai-image",
        },
      ],
    },
  });
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ success: true, valid: true, actions: payload.actions }),
    executeActions: async () => ({ appliedCount: 1, queuedGenerationNodeIds: ["image-1"] }),
  });

  await orchestrator.run("exec-humanizer", { agentMode: "act" });

  const stored = store.getExecution("exec-humanizer");
  assert.deepEqual(
    stored.timeline.map((event) => event.humanSummary),
    ["正在生成图片", "已生成图片"]
  );
  assert.equal(stored.drawerState.line2, "执行完成");
  assert.equal(stored.timeline.some((event) => /Running:|Completed:|queue_generation_task/.test(event.humanSummary)), false);
  assert.equal(stored.timeline[0].developer.actionJson.type, "queue_generation_task");
});

test("assistantExecutionOrchestrator: starts next queued execution after current completes", async () => {
  const store = createStoreWithPlan();
  store.enqueueExecution({
    id: "exec-queued",
    title: "Queued layout",
    status: "queued",
    drawerState: { visible: false, line1: "Queued layout", line2: "Waiting in queue" },
    plan: {
      id: "plan-queued",
      steps: [{ id: "step-queued", title: "Layout queued nodes" }],
    },
    actionsByStep: {
      "step-queued": [
        { id: "act-queued", type: "layout_nodes", nodeIds: ["queued-1"], title: "Layout queued nodes" },
      ],
    },
  });
  const executed = [];
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ success: true, valid: true, actions: payload.actions }),
    executeActions: async (payload) => {
      executed.push([payload.executionId, payload.actions[0].id]);
      return { appliedCount: 1, updatedNodeIds: payload.actions[0].nodeIds || [] };
    },
  });

  const result = await orchestrator.run("exec-orchestrator", { agentMode: "act" });

  assert.equal(result.status, "completed");
  assert.deepEqual(executed, [
    ["exec-orchestrator", "act-create"],
    ["exec-orchestrator", "act-connect"],
    ["exec-queued", "act-queued"],
  ]);
  assert.equal(store.getExecution("exec-orchestrator").status, "completed");
  const queued = store.getExecution("exec-queued");
  assert.equal(queued.status, "completed");
  assert.equal(queued.drawerState.visible, true);
  assert.deepEqual(store.snapshot().queue.map((item) => item.id), []);
});

test("assistantExecutionOrchestrator: cancel stops after current action and keeps queued work", async () => {
  const store = createStoreWithPlan();
  store.enqueueExecution({
    id: "exec-queued-after-cancel",
    title: "Queued after cancel",
    status: "queued",
    drawerState: { visible: false, line1: "Queued after cancel", line2: "Waiting" },
    plan: {
      id: "plan-queued-after-cancel",
      steps: [{ id: "step-queued-after-cancel", title: "Queued after cancel" }],
    },
    actionsByStep: {
      "step-queued-after-cancel": [
        { id: "act-queued-after-cancel", type: "layout_nodes", nodeIds: ["queued-after-cancel"] },
      ],
    },
  });
  const firstAction = deferred();
  const executed = [];
  let orchestrator;
  orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ success: true, valid: true, actions: payload.actions }),
    executeActions: async (payload) => {
      executed.push([payload.executionId, payload.actions[0].id]);
      if (payload.actions[0].id === "act-create") {
        firstAction.resolve();
        const cancelResult = orchestrator.cancel("exec-orchestrator");
        assert.equal(cancelResult.status, "cancel_requested");
        await Promise.resolve();
      }
      return { appliedCount: 1, updatedNodeIds: payload.actions[0].nodeIds || [] };
    },
  });

  const result = await orchestrator.run("exec-orchestrator", { agentMode: "act" });
  await firstAction.promise;

  assert.equal(result.status, "cancelled");
  assert.deepEqual(executed, [["exec-orchestrator", "act-create"]]);
  const active = store.getExecution("exec-orchestrator");
  assert.equal(active.status, "cancelled");
  assert.deepEqual(active.progress, { done: 1, total: 2 });
  assert.equal(active.orchestratorState.running, false);
  assert.equal(active.timeline.some((event) => event.status === "cancelled"), true);
  assert.deepEqual(store.snapshot().queue.map((item) => item.id), ["exec-queued-after-cancel"]);
  assert.equal(store.getExecution("exec-queued-after-cancel").status, "queued");
});

test("assistantExecutionOrchestrator: skips queue-paused executions when starting the next queued task", async () => {
  const store = createStoreWithPlan();
  store.enqueueExecution({
    id: "exec-paused-queued",
    title: "Paused queued layout",
    status: "queued",
    drawerState: {
      visible: false,
      line1: "Paused queued layout",
      line2: "Paused in queue",
      queuePaused: true,
    },
    plan: {
      id: "plan-paused-queued",
      steps: [{ id: "step-paused-queued", title: "Paused queued nodes" }],
    },
    actionsByStep: {
      "step-paused-queued": [
        { id: "act-paused-queued", type: "layout_nodes", nodeIds: ["paused-queued-1"] },
      ],
    },
  });
  store.enqueueExecution({
    id: "exec-next-queued",
    title: "Next queued layout",
    status: "queued",
    drawerState: { visible: false, line1: "Next queued layout", line2: "Waiting in queue" },
    plan: {
      id: "plan-next-queued",
      steps: [{ id: "step-next-queued", title: "Next queued nodes" }],
    },
    actionsByStep: {
      "step-next-queued": [
        { id: "act-next-queued", type: "layout_nodes", nodeIds: ["next-queued-1"] },
      ],
    },
  });
  const executed = [];
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ success: true, valid: true, actions: payload.actions }),
    executeActions: async (payload) => {
      executed.push([payload.executionId, payload.actions[0].id]);
      return { appliedCount: 1, updatedNodeIds: payload.actions[0].nodeIds || [] };
    },
  });

  const result = await orchestrator.run("exec-orchestrator", { agentMode: "act" });

  assert.equal(result.status, "completed");
  assert.deepEqual(executed.map((item) => item[0]), [
    "exec-orchestrator",
    "exec-orchestrator",
    "exec-next-queued",
  ]);
  assert.equal(store.getExecution("exec-paused-queued").status, "queued");
  assert.equal(store.getExecution("exec-paused-queued").drawerState.queuePaused, true);
  assert.equal(store.getExecution("exec-next-queued").status, "completed");
  assert.deepEqual(store.snapshot().queue.map((item) => item.id), ["exec-paused-queued"]);
});

test("assistantExecutionOrchestrator: prepares queued execution before auto-start", async () => {
  const store = createStoreWithPlan();
  store.enqueueExecution({
    id: "exec-queued",
    title: "Queued layout",
    status: "queued",
    drawerState: { visible: false, line1: "Queued layout", line2: "Waiting in queue" },
    plan: {
      id: "plan-queued-stale",
      steps: [{ id: "step-queued", title: "Stale queued nodes" }],
    },
    actionsByStep: {
      "step-queued": [
        { id: "act-queued-stale", type: "layout_nodes", nodeIds: ["stale"] },
      ],
    },
  });
  const executed = [];
  const prepareCalls = [];
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ success: true, valid: true, actions: payload.actions }),
    executeActions: async (payload) => {
      executed.push([payload.executionId, payload.actions[0].id, payload.context]);
      return { appliedCount: 1, updatedNodeIds: payload.actions[0].nodeIds || [] };
    },
    prepareQueuedExecution: async (payload) => {
      prepareCalls.push(payload);
      return {
        plan: {
          id: "plan-queued-recompiled",
          steps: [{ id: "step-queued", title: "Recompiled queued nodes" }],
        },
        actionsByStep: {
          "step-queued": [
            { id: "act-queued-recompiled", type: "layout_nodes", nodeIds: ["fresh"] },
          ],
        },
        drawerState: { line2: "Prepared from latest canvas" },
      };
    },
  });

  await orchestrator.run("exec-orchestrator", {
    agentMode: "act",
    context: { canvas: { nodeCount: 9 } },
  });

  assert.equal(prepareCalls.length, 1);
  assert.equal(prepareCalls[0].execution.id, "exec-queued");
  assert.deepEqual(prepareCalls[0].context, { canvas: { nodeCount: 9 } });
  assert.deepEqual(
    executed.map(([executionId, actionId]) => [executionId, actionId]),
    [
      ["exec-orchestrator", "act-create"],
      ["exec-orchestrator", "act-connect"],
      ["exec-queued", "act-queued-recompiled"],
    ]
  );
  assert.equal(store.getExecution("exec-queued").actionsByStep["step-queued"][0].id, "act-queued-recompiled");
  assert.equal(
    store.getExecution("exec-queued").timeline.some((event) => event.status === "prepared"),
    true
  );
});



test("assistantExecutionOrchestrator: prepares queued draft before auto-start and does not run stale actions", async () => {
  const store = createStoreWithPlan();
  store.enqueueExecution({
    id: "exec-draft",
    title: "Draft queued layout",
    status: "queued_draft",
    drawerState: { visible: false, line1: "Draft queued layout", line2: "Waiting as draft" },
    plan: {
      id: "plan-draft-stale",
      steps: [{ id: "step-draft", title: "Stale draft nodes" }],
    },
    actionsByStep: {
      "step-draft": [
        { id: "act-draft-stale", type: "layout_nodes", nodeIds: ["stale"] },
      ],
    },
  });
  const executed = [];
  const prepareCalls = [];
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ success: true, valid: true, actions: payload.actions }),
    executeActions: async (payload) => {
      executed.push([payload.executionId, payload.actions[0].id]);
      return { appliedCount: 1, updatedNodeIds: payload.actions[0].nodeIds || [] };
    },
    prepareQueuedExecution: async (payload) => {
      prepareCalls.push(payload);
      return {
        plan: {
          id: "plan-draft-fresh",
          steps: [{ id: "step-draft", title: "Fresh draft nodes" }],
        },
        actionsByStep: {
          "step-draft": [
            { id: "act-draft-fresh", type: "layout_nodes", nodeIds: ["fresh"] },
          ],
        },
        drawerState: { line2: "Draft prepared from latest canvas" },
      };
    },
  });

  await orchestrator.run("exec-orchestrator", {
    agentMode: "act",
    context: { canvas: { nodeCount: 11 } },
  });

  assert.equal(prepareCalls.length, 1);
  assert.equal(prepareCalls[0].execution.status, "queued_draft");
  assert.deepEqual(prepareCalls[0].context, { canvas: { nodeCount: 11 } });
  assert.deepEqual(
    executed.map(([executionId, actionId]) => [executionId, actionId]),
    [
      ["exec-orchestrator", "act-create"],
      ["exec-orchestrator", "act-connect"],
      ["exec-draft", "act-draft-fresh"],
    ]
  );
  const draft = store.getExecution("exec-draft");
  assert.equal(draft.status, "completed");
  assert.equal(draft.actionsByStep["step-draft"][0].id, "act-draft-fresh");
  assert.equal(draft.timeline.some((event) => event.status === "prepared"), true);
});

test("assistantExecutionOrchestrator: queued draft without prepare fails closed", async () => {
  const store = createStoreWithPlan();
  store.enqueueExecution({
    id: "exec-draft",
    title: "Draft queued layout",
    status: "queued_draft",
    drawerState: { visible: false, line1: "Draft queued layout", line2: "Waiting as draft" },
    plan: {
      id: "plan-draft-stale",
      steps: [{ id: "step-draft", title: "Stale draft nodes" }],
    },
    actionsByStep: {
      "step-draft": [
        { id: "act-draft-stale", type: "layout_nodes", nodeIds: ["stale"] },
      ],
    },
  });
  const executed = [];
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ success: true, valid: true, actions: payload.actions }),
    executeActions: async (payload) => {
      executed.push([payload.executionId, payload.actions[0].id]);
      return { appliedCount: 1 };
    },
  });

  await orchestrator.run("exec-orchestrator", { agentMode: "act" });

  assert.deepEqual(executed, [
    ["exec-orchestrator", "act-create"],
    ["exec-orchestrator", "act-connect"],
  ]);
  const draft = store.getExecution("exec-draft");
  assert.equal(draft.status, "failed");
  assert.match(draft.drawerState.line2, /prepare/i);
  const failedEvent = draft.timeline.find((event) => event.status === "prepare_failed");
  assert.ok(failedEvent);
  assert.equal(failedEvent.developer.prepareErrorKind, "missing_prepare_hook");
  assert.match(failedEvent.developer.prepareErrorMessage, /not configured/i);
});

test("assistantExecutionOrchestrator: queued draft prepare non-object result is classified", async () => {
  const store = createStoreWithPlan();
  store.enqueueExecution({
    id: "exec-draft",
    title: "Draft queued layout",
    status: "queued_draft",
    drawerState: { visible: false, line1: "Draft queued layout", line2: "Waiting as draft" },
    plan: {
      id: "plan-draft-stale",
      steps: [{ id: "step-draft", title: "Stale draft nodes" }],
    },
    actionsByStep: {
      "step-draft": [
        { id: "act-draft-stale", type: "layout_nodes", nodeIds: ["stale"] },
      ],
    },
  });
  const executed = [];
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ success: true, valid: true, actions: payload.actions }),
    executeActions: async (payload) => {
      executed.push([payload.executionId, payload.actions[0].id]);
      return { appliedCount: 1 };
    },
    prepareQueuedExecution: async () => "not an object",
  });

  await orchestrator.run("exec-orchestrator", { agentMode: "act" });

  assert.deepEqual(executed, [
    ["exec-orchestrator", "act-create"],
    ["exec-orchestrator", "act-connect"],
  ]);
  const draft = store.getExecution("exec-draft");
  assert.equal(draft.status, "failed");
  const failedEvent = draft.timeline.find((event) => event.status === "prepare_failed");
  assert.ok(failedEvent);
  assert.equal(failedEvent.developer.prepareErrorKind, "invalid_prepare_result");
  assert.match(failedEvent.developer.prepareErrorMessage, /no plan or actions/i);
});

test("assistantExecutionOrchestrator: queued draft prepare without fresh actions fails closed", async () => {
  const store = createStoreWithPlan();
  store.enqueueExecution({
    id: "exec-draft",
    title: "Draft queued layout",
    status: "queued_draft",
    drawerState: { visible: false, line1: "Draft queued layout", line2: "Waiting as draft" },
    plan: {
      id: "plan-draft-stale",
      steps: [{ id: "step-draft", title: "Stale draft nodes" }],
    },
    actionsByStep: {
      "step-draft": [
        { id: "act-draft-stale", type: "layout_nodes", nodeIds: ["stale"] },
      ],
    },
  });
  const executed = [];
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ success: true, valid: true, actions: payload.actions }),
    executeActions: async (payload) => {
      executed.push([payload.executionId, payload.actions[0].id]);
      return { appliedCount: 1 };
    },
    prepareQueuedExecution: async () => ({
      plan: { id: "plan-draft-only", steps: [{ id: "step-draft", title: "Fresh title only" }] },
    }),
  });

  await orchestrator.run("exec-orchestrator", { agentMode: "act" });

  assert.deepEqual(executed, [
    ["exec-orchestrator", "act-create"],
    ["exec-orchestrator", "act-connect"],
  ]);
  const draft = store.getExecution("exec-draft");
  assert.equal(draft.status, "failed");
  assert.match(draft.drawerState.line2, /actions/i);
  const failedEvent = draft.timeline.find((event) => event.status === "prepare_failed");
  assert.ok(failedEvent);
  assert.equal(failedEvent.developer.prepareErrorKind, "missing_fresh_actions");
  assert.match(failedEvent.developer.prepareErrorMessage, /no plan or actions/i);
});

test("assistantExecutionOrchestrator: prepare failure stops queued stale actions", async () => {
  const store = createStoreWithPlan();
  store.enqueueExecution({
    id: "exec-queued",
    title: "Queued layout",
    status: "queued",
    drawerState: { visible: false, line1: "Queued layout", line2: "Waiting in queue" },
    plan: {
      id: "plan-queued-stale",
      steps: [{ id: "step-queued", title: "Stale queued nodes" }],
    },
    actionsByStep: {
      "step-queued": [
        { id: "act-queued-stale", type: "layout_nodes", nodeIds: ["stale"] },
      ],
    },
  });
  const executed = [];
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ success: true, valid: true, actions: payload.actions }),
    executeActions: async (payload) => {
      executed.push([payload.executionId, payload.actions[0].id]);
      return { appliedCount: 1 };
    },
    prepareQueuedExecution: async () => {
      throw new Error("fresh canvas unavailable");
    },
  });

  const result = await orchestrator.run("exec-orchestrator", { agentMode: "act" });

  assert.equal(result.status, "completed");
  assert.deepEqual(executed, [
    ["exec-orchestrator", "act-create"],
    ["exec-orchestrator", "act-connect"],
  ]);
  const queued = store.getExecution("exec-queued");
  assert.equal(queued.status, "failed");
  assert.equal(queued.drawerState.visible, true);
  assert.match(queued.drawerState.line2, /fresh canvas unavailable/);
  assert.equal(queued.orchestratorState.running, false);
  const failedEvent = queued.timeline.find((event) => event.status === "prepare_failed");
  assert.ok(failedEvent);
  assert.match(failedEvent.error, /fresh canvas unavailable/);
  assert.equal(failedEvent.developer.prepareErrorKind, "prepare_threw");
  assert.match(failedEvent.developer.prepareErrorMessage, /fresh canvas unavailable/);
});

test("assistantExecutionOrchestrator: pause stops after current action and resume continues from cursor", async () => {
  const store = createStoreWithPlan();
  const firstActionGate = deferred();
  const firstActionStarted = deferred();
  const executedActionIds = [];
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ success: true, valid: true, actions: payload.actions }),
    executeActions: async (payload) => {
      const actionId = payload.actions[0].id;
      executedActionIds.push(actionId);
      if (actionId === "act-create") {
        firstActionStarted.resolve();
        await firstActionGate.promise;
        return { appliedCount: 1, createdNodeIds: ["text-1"] };
      }
      return { appliedCount: 1, createdEdgeIds: ["edge-1"] };
    },
  });

  const runPromise = orchestrator.run("exec-orchestrator", { agentMode: "act" });
  await firstActionStarted.promise;
  assert.deepEqual(executedActionIds, ["act-create"]);

  const paused = orchestrator.pause("exec-orchestrator");
  assert.equal(paused.status, "pause_requested");
  firstActionGate.resolve();

  const pauseResult = await runPromise;
  assert.equal(pauseResult.status, "paused");
  assert.deepEqual(executedActionIds, ["act-create"]);
  const pausedExecution = store.getExecution("exec-orchestrator");
  assert.equal(pausedExecution.status, "paused");
  assert.deepEqual(pausedExecution.progress, { done: 1, total: 2 });
  assert.deepEqual(pausedExecution.orchestratorState, {
    nextActionIndex: 1,
    pausedAtActionId: "act-connect",
    running: false,
  });

  const resumeResult = await orchestrator.resume("exec-orchestrator", { agentMode: "act" });

  assert.equal(resumeResult.status, "completed");
  assert.deepEqual(executedActionIds, ["act-create", "act-connect"]);
  const completed = store.getExecution("exec-orchestrator");
  assert.equal(completed.status, "completed");
  assert.deepEqual(completed.progress, { done: 2, total: 2 });
  assert.deepEqual(completed.orchestratorState, {
    nextActionIndex: 2,
    pausedAtActionId: "",
    running: false,
  });
});

test("assistantExecutionOrchestrator: stops on invalid action and marks execution failed retryable", async () => {
  const store = createStoreWithPlan();
  const executeCalls = [];
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async () => ({ success: true, valid: false, errors: ["node not found"] }),
    executeActions: async (payload) => {
      executeCalls.push(payload);
      return { appliedCount: 1 };
    },
  });

  const result = await orchestrator.run("exec-orchestrator", { agentMode: "act" });

  assert.equal(result.status, "failed");
  assert.match(result.error, /node not found/);
  assert.equal(executeCalls.length, 0);
  const stored = store.getExecution("exec-orchestrator");
  assert.equal(stored.status, "failed");
  assert.deepEqual(stored.progress, { done: 0, total: 2 });
  assert.deepEqual(
    stored.timeline.map((event) => [event.actionId, event.status, event.canRetry]),
    [
      ["act-create", "running", false],
      ["act-create", "failed", true],
    ]
  );
});

test("assistantExecutionOrchestrator: blocks dependent steps after failure and continues independent actions", async () => {
  const store = createStoreWithDependencyPlan();
  const validateCalls = [];
  const executeCalls = [];
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => {
      validateCalls.push(payload);
      if (payload.actions[0].id === "act-source") {
        return { success: true, valid: false, errors: ["source missing"] };
      }
      return { success: true, valid: true, actions: payload.actions };
    },
    executeActions: async (payload) => {
      executeCalls.push(payload);
      return { appliedCount: 1, createdNodeIds: [payload.actions[0].nodeId] };
    },
  });

  const result = await orchestrator.run("exec-dependencies", { agentMode: "act" });

  assert.equal(result.status, "paused");
  assert.deepEqual(validateCalls.map((call) => call.actions[0].id), ["act-source", "act-independent"]);
  assert.deepEqual(executeCalls.map((call) => call.actions[0].id), ["act-independent"]);
  const stored = store.getExecution("exec-dependencies");
  assert.equal(stored.status, "paused");
  assert.deepEqual(stored.progress, { done: 1, total: 3 });
  assert.deepEqual(stored.orchestratorState, {
    nextActionIndex: 1,
    pausedAtActionId: "act-dependent",
    running: false,
  });
  assert.equal(stored.drawerState.line2, "已暂停：1 个后续步骤依赖失败步骤");
  assert.deepEqual(
    stored.timeline.map((event) => [event.actionId, event.status, event.humanSummary, event.canRetry]),
    [
      ["act-source", "running", "正在处理：Create source", false],
      ["act-source", "failed", "执行失败：Create source", true],
      ["act-dependent", "dependency_blocked", "已暂停：Generate dependent image 依赖失败步骤", false],
      ["act-independent", "running", "正在处理：Create independent caption", false],
      ["act-independent", "completed", "已完成：Create independent caption", true],
    ]
  );
  assert.deepEqual(stored.timeline[2].developer, {
    actionJson: {
      id: "act-dependent",
      type: "queue_generation_task",
      nodeId: "image-1",
      nodeType: "ai-image",
      title: "Generate dependent image",
    },
    blockedByActionId: "act-source",
    blockedByEventId: "evt-fixed",
    blockedByStepId: "step-source",
  });
});

test("assistantExecutionOrchestrator: retries failed execution from the failed action cursor", async () => {
  const store = createStoreWithPlan();
  const validateCalls = [];
  const executeCalls = [];
  let failConnectOnce = true;
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => {
      validateCalls.push(payload);
      if (payload.actions[0].id === "act-connect" && failConnectOnce) {
        failConnectOnce = false;
        return { success: true, valid: false, errors: ["edge target missing"] };
      }
      return { success: true, valid: true, actions: payload.actions };
    },
    executeActions: async (payload) => {
      executeCalls.push(payload);
      return { appliedCount: 1, updatedNodeIds: [payload.actions[0].nodeId || payload.actions[0].to] };
    },
  });

  const failed = await orchestrator.run("exec-orchestrator", { agentMode: "act" });

  assert.equal(failed.status, "failed");
  assert.deepEqual(executeCalls.map((call) => call.actions[0].id), ["act-create"]);
  assert.deepEqual(store.getExecution("exec-orchestrator").orchestratorState, {
    nextActionIndex: 1,
    pausedAtActionId: "act-connect",
    running: false,
  });

  const retried = await orchestrator.retry("exec-orchestrator", { agentMode: "act", videoAuthorized: false });

  assert.equal(retried.status, "completed");
  assert.deepEqual(executeCalls.map((call) => call.actions[0].id), ["act-create", "act-connect"]);
  assert.equal(validateCalls.at(-1).actions[0].id, "act-connect");
  assert.equal(validateCalls.at(-1).videoAuthorized, false);
  const completed = store.getExecution("exec-orchestrator");
  assert.equal(completed.status, "completed");
  assert.deepEqual(completed.progress, { done: 2, total: 2 });
  assert.deepEqual(completed.orchestratorState, {
    nextActionIndex: 2,
    pausedAtActionId: "",
    running: false,
  });
});

test("assistantExecutionOrchestrator: retry can target a selected timeline action id", async () => {
  const store = createStoreWithPlan();
  store.updateStatus("exec-orchestrator", "failed", {
    progress: { done: 0, total: 2 },
    orchestratorState: {
      nextActionIndex: 0,
      pausedAtActionId: "act-create",
      running: false,
    },
  });
  const validateCalls = [];
  const executeCalls = [];
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => {
      validateCalls.push(payload);
      return { success: true, valid: true, actions: payload.actions };
    },
    executeActions: async (payload) => {
      executeCalls.push(payload);
      return { appliedCount: 1 };
    },
  });

  const retried = await orchestrator.retry("exec-orchestrator", {
    agentMode: "act",
    actionId: "act-connect",
    eventId: "evt-connect-failed",
    videoAuthorized: false,
  });

  assert.equal(retried.status, "completed");
  assert.deepEqual(validateCalls.map((call) => call.actions[0].id), ["act-connect"]);
  assert.deepEqual(executeCalls.map((call) => call.actions[0].id), ["act-connect"]);
  assert.equal(validateCalls[0].actionId, "act-connect");
  assert.equal(validateCalls[0].eventId, "evt-connect-failed");
});

test("assistantExecutionOrchestrator: skips selected timeline action and advances cursor", async () => {
  const store = createStoreWithPlan();
  store.updateStatus("exec-orchestrator", "failed", {
    progress: { done: 1, total: 2 },
    orchestratorState: {
      nextActionIndex: 1,
      pausedAtActionId: "act-connect",
      running: false,
    },
  });
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ success: true, valid: true, actions: payload.actions }),
    executeActions: async () => ({ appliedCount: 1 }),
  });

  const skipped = await orchestrator.skip("exec-orchestrator", {
    actionId: "act-connect",
    eventId: "evt-connect-failed",
  });

  assert.equal(skipped.status, "completed");
  assert.equal(skipped.actionCount, 2);
  const stored = store.getExecution("exec-orchestrator");
  assert.equal(stored.status, "completed");
  assert.deepEqual(stored.progress, { done: 2, total: 2 });
  assert.deepEqual(stored.orchestratorState, {
    nextActionIndex: 2,
    pausedAtActionId: "",
    running: false,
  });
  assert.deepEqual(stored.timeline.at(-1), {
    id: "evt-fixed",
    stepId: "step-connect",
    actionId: "act-connect",
    status: "skipped",
    humanSummary: "已跳过：Connect image node",
    error: "",
    nodeIds: [],
    canRetry: true,
    canUndo: false,
    durationMs: 0,
    createdAt: "2026-06-10T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
    developer: {
      skippedFromEventId: "evt-connect-failed",
      actionJson: {
        id: "act-connect",
        type: "connect_nodes",
        from: "text-1",
        to: "image-1",
        title: "Connect image node",
      },
    },
  });
});

test("assistantExecutionOrchestrator: skip blocks dependent future steps", async () => {
  const store = createStoreWithDependencyPlan();
  store.updateStatus("exec-dependencies", "failed", {
    progress: { done: 0, total: 3 },
    orchestratorState: {
      nextActionIndex: 0,
      pausedAtActionId: "act-source",
      running: false,
    },
  });
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ success: true, valid: true, actions: payload.actions }),
    executeActions: async () => ({ appliedCount: 1 }),
  });

  const result = await orchestrator.skip("exec-dependencies", {
    actionId: "act-source",
    eventId: "evt-source-failed",
  });

  assert.equal(result.status, "paused");
  assert.equal(result.blockedActionCount, 1);
  const stored = store.getExecution("exec-dependencies");
  assert.equal(stored.status, "paused");
  assert.deepEqual(stored.progress, { done: 1, total: 3 });
  assert.deepEqual(stored.orchestratorState, {
    nextActionIndex: 1,
    pausedAtActionId: "act-dependent",
    running: false,
  });
  assert.equal(stored.drawerState.line2, "已暂停：1 个后续步骤依赖跳过步骤");
  assert.deepEqual(
    stored.timeline.map((event) => [event.actionId, event.status, event.humanSummary]),
    [
      ["act-source", "skipped", "已跳过：Create source"],
      ["act-dependent", "dependency_blocked", "已暂停：Generate dependent image 依赖跳过步骤"],
    ]
  );
  assert.deepEqual(stored.timeline[1].developer, {
    actionJson: {
      id: "act-dependent",
      type: "queue_generation_task",
      nodeId: "image-1",
      nodeType: "ai-image",
      title: "Generate dependent image",
    },
    blockedByActionId: "act-source",
    blockedByEventId: "evt-fixed",
    blockedByStepId: "step-source",
  });
});

test("assistantExecutionOrchestrator: retry waits for authorization before failed video action", async () => {
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-orchestrator-video-retry",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-fixed`,
  });
  store.createExecution({
    id: "exec-video-retry",
    title: "Retry failed video",
    status: "failed",
    progress: { done: 1, total: 2 },
    drawerState: { visible: true, line1: "Retry failed video", line2: "Video failed" },
    orchestratorState: {
      nextActionIndex: 1,
      pausedAtActionId: "act-video",
      running: false,
    },
    plan: {
      id: "plan-video-retry",
      steps: [
        { id: "step-text", title: "Create script" },
        { id: "step-video", title: "Generate video" },
      ],
    },
    actionsByStep: {
      "step-text": [{ id: "act-text", type: "create_node", nodeId: "text-1", title: "Create script" }],
      "step-video": [
        {
          id: "act-video",
          type: "queue_generation_task",
          nodeId: "video-1",
          nodeType: "ai-video",
          title: "Generate video",
        },
      ],
    },
  });
  const validateCalls = [];
  const executeCalls = [];
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => {
      validateCalls.push(payload);
      return { success: true, valid: true, actions: payload.actions };
    },
    executeActions: async (payload) => {
      executeCalls.push(payload);
      return { appliedCount: 1, queuedGenerationNodeIds: ["video-1"] };
    },
  });

  const result = await orchestrator.retry("exec-video-retry", { agentMode: "act", videoAuthorized: false });

  assert.equal(result.status, "waiting_video_authorization");
  assert.equal(result.requiresVideoAuthorization, true);
  assert.equal(validateCalls.length, 0);
  assert.equal(executeCalls.length, 0);
  const stored = store.getExecution("exec-video-retry");
  assert.equal(stored.status, "waiting_video_authorization");
  assert.deepEqual(stored.progress, { done: 1, total: 2 });
  assert.deepEqual(stored.orchestratorState, {
    nextActionIndex: 1,
    pausedAtActionId: "act-video",
    running: false,
  });
  assert.deepEqual(stored.timeline.at(-1), {
    id: "evt-fixed",
    stepId: "step-video",
    actionId: "act-video",
    status: "waiting_video_authorization",
    humanSummary: "需要先授权视频生成",
    error: "",
    nodeIds: [],
    canRetry: true,
    canUndo: false,
    durationMs: 0,
    createdAt: "2026-06-10T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
    developer: {
      actionJson: {
        id: "act-video",
        type: "queue_generation_task",
        nodeId: "video-1",
        nodeType: "ai-video",
        title: "Generate video",
      },
    },
  });
});

test("assistantExecutionOrchestrator: completed create/connect actions capture inverse patch and canUndo", async () => {
  const store = createStoreWithPlan();
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ success: true, valid: true, actions: payload.actions }),
    executeActions: async (payload) => {
      if (payload.actions[0].id === "act-create") {
        return { appliedCount: 1, createdNodeIds: ["text-1"] };
      }
      return { appliedCount: 1, createdEdgeIds: ["edge-1"] };
    },
    nodeSignatureProvider: (nodeId) => `sig:${nodeId}`,
  });

  await orchestrator.run("exec-orchestrator", { agentMode: "act" });

  const stored = store.getExecution("exec-orchestrator");
  const createEvent = stored.timeline.find(
    (event) => event.actionId === "act-create" && event.status === "completed"
  );
  assert.equal(createEvent.canUndo, true);
  assert.deepEqual(createEvent.inverse, {
    aiOwned: true,
    ops: [{ type: "remove_node", nodeId: "text-1", signature: "sig:text-1" }],
  });
  const connectEvent = stored.timeline.find(
    (event) => event.actionId === "act-connect" && event.status === "completed"
  );
  assert.equal(connectEvent.canUndo, true);
  assert.deepEqual(connectEvent.inverse, {
    aiOwned: true,
    ops: [{ type: "remove_edge", edgeId: "edge-1" }],
  });
});

test("assistantExecutionOrchestrator: generation actions stay without inverse and canUndo false", async () => {
  const store = createStoreWithDependencyPlan();
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ success: true, valid: true, actions: payload.actions }),
    executeActions: async (payload) => {
      if (payload.actions[0].type === "queue_generation_task") {
        return { appliedCount: 1, queuedGenerationNodeIds: ["image-1"], createdNodeIds: ["image-1"] };
      }
      return { appliedCount: 1, createdNodeIds: [payload.actions[0].nodeId] };
    },
  });

  await orchestrator.run("exec-dependencies", { agentMode: "act", videoAuthorized: true });

  const stored = store.getExecution("exec-dependencies");
  const generationEvent = stored.timeline.find(
    (event) => event.actionId === "act-dependent" && event.status === "completed"
  );
  assert.equal(generationEvent.canUndo, false);
  assert.equal(Object.prototype.hasOwnProperty.call(generationEvent, "inverse"), false);
});

function createUndoStoreWithPlan() {
  let eventCounter = 0;
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-orchestrator-undo",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-${(eventCounter += 1)}`,
  });
  store.createExecution({
    id: "exec-orchestrator",
    title: "Layout canvas",
    status: "draft",
    drawerState: { visible: true, line1: "Layout canvas", line2: "Waiting" },
    plan: {
      id: "plan-orchestrator",
      title: "Layout canvas",
      steps: [
        { id: "step-create", title: "Create text node" },
        { id: "step-connect", title: "Connect image node" },
      ],
    },
    actionsByStep: {
      "step-create": [
        { id: "act-create", type: "create_node", nodeId: "text-1", title: "Create text node" },
      ],
      "step-connect": [
        { id: "act-connect", type: "connect_nodes", from: "text-1", to: "image-1", title: "Connect image node" },
      ],
    },
  });
  return store;
}

test("assistantExecutionOrchestrator: undo applies inverse ops once and writes undone event", async () => {
  const store = createUndoStoreWithPlan();
  const undoCalls = [];
  const syncedTimeline = [];
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ success: true, valid: true, actions: payload.actions }),
    executeActions: async (payload) => {
      if (payload.actions[0].id === "act-create") {
        return { appliedCount: 1, createdNodeIds: ["text-1"] };
      }
      return { appliedCount: 1, createdEdgeIds: ["edge-1"] };
    },
    executionSyncClient: {
      async appendTimelineEvent(executionId, event) {
        syncedTimeline.push({ executionId, event });
      },
      async updateExecutionStatus() {},
    },
    applyInverseOps: async (payload) => {
      undoCalls.push(payload);
      return { removedNodeIds: ["text-1"], removedEdgeIds: [], conflicts: [] };
    },
  });

  await orchestrator.run("exec-orchestrator", { agentMode: "act" });
  const stored = store.getExecution("exec-orchestrator");
  const createEvent = stored.timeline.find(
    (event) => event.actionId === "act-create" && event.status === "completed"
  );

  const result = await orchestrator.undo("exec-orchestrator", { eventId: createEvent.id });

  assert.equal(result.status, "undone");
  assert.deepEqual(result.removedNodeIds, ["text-1"]);
  assert.equal(undoCalls.length, 1);
  assert.equal(undoCalls[0].executionId, "exec-orchestrator");
  assert.equal(undoCalls[0].eventId, createEvent.id);
  assert.deepEqual(undoCalls[0].ops, [{ type: "remove_node", nodeId: "text-1" }]);

  const after = store.getExecution("exec-orchestrator");
  const undoneEvent = after.timeline.find((event) => event.status === "undone");
  assert.ok(undoneEvent);
  assert.equal(undoneEvent.actionId, "act-create");
  assert.deepEqual(undoneEvent.nodeIds, ["text-1"]);
  assert.equal(undoneEvent.canUndo, false);
  assert.equal(undoneEvent.developer.undoneFromEventId, createEvent.id);
  assert.ok(syncedTimeline.some((entry) => entry.event.status === "undone"));
  assert.equal(after.status, "completed");

  const second = await orchestrator.undo("exec-orchestrator", { eventId: createEvent.id });
  assert.equal(second.status, "undo_unavailable");
  assert.equal(second.reason, "already_undone");
  assert.equal(undoCalls.length, 1);
});

test("assistantExecutionOrchestrator: undo conflicts keep canvas and write undo_conflict event", async () => {
  const store = createUndoStoreWithPlan();
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ success: true, valid: true, actions: payload.actions }),
    executeActions: async (payload) => {
      if (payload.actions[0].id === "act-create") {
        return { appliedCount: 1, createdNodeIds: ["text-1"] };
      }
      return { appliedCount: 1, createdEdgeIds: ["edge-1"] };
    },
    applyInverseOps: async () => ({
      removedNodeIds: [],
      removedEdgeIds: [],
      conflicts: [{ type: "remove_node", nodeId: "text-1", reason: "node_modified" }],
    }),
  });

  await orchestrator.run("exec-orchestrator", { agentMode: "act" });
  const createEvent = store
    .getExecution("exec-orchestrator")
    .timeline.find((event) => event.actionId === "act-create" && event.status === "completed");

  const result = await orchestrator.undo("exec-orchestrator", { eventId: createEvent.id });

  assert.equal(result.status, "undo_conflict");
  assert.deepEqual(result.conflicts, [
    { type: "remove_node", nodeId: "text-1", reason: "node_modified" },
  ]);
  const after = store.getExecution("exec-orchestrator");
  const conflictEvent = after.timeline.find((event) => event.status === "undo_conflict");
  assert.ok(conflictEvent);
  assert.equal(conflictEvent.developer.undoneFromEventId, createEvent.id);
  assert.equal(after.timeline.some((event) => event.status === "undone"), false);

  const retryUndo = await orchestrator.undo("exec-orchestrator", { eventId: createEvent.id });
  assert.equal(retryUndo.status, "undo_conflict");
});

test("assistantExecutionOrchestrator: undo is unavailable without hook or inverse data", async () => {
  const store = createUndoStoreWithPlan();
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ success: true, valid: true, actions: payload.actions }),
    executeActions: async () => ({ appliedCount: 1 }),
  });

  await orchestrator.run("exec-orchestrator", { agentMode: "act" });
  const stored = store.getExecution("exec-orchestrator");
  const createEvent = stored.timeline.find(
    (event) => event.actionId === "act-create" && event.status === "completed"
  );

  const noInverse = await orchestrator.undo("exec-orchestrator", { eventId: createEvent.id });
  assert.equal(noInverse.status, "undo_unavailable");
  assert.equal(noInverse.reason, "missing_inverse");
  assert.equal(
    store.getExecution("exec-orchestrator").timeline.some((event) => event.status === "undone"),
    false
  );
});

function createUpdateStoreWithPlan() {
  let eventCounter = 0;
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-orchestrator-restore",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-${(eventCounter += 1)}`,
  });
  store.createExecution({
    id: "exec-restore",
    title: "Update node",
    status: "draft",
    drawerState: { visible: true, line1: "Update node", line2: "Waiting" },
    plan: {
      id: "plan-restore",
      title: "Update node",
      steps: [{ id: "step-update", title: "Update prompt" }],
    },
    actionsByStep: {
      "step-update": [
        { id: "act-update", type: "update_node", nodeId: "n1", data: { text: "new" }, title: "Update prompt" },
      ],
    },
  });
  return store;
}

test("assistantExecutionOrchestrator: update actions capture restore_node inverse with prior state", async () => {
  const store = createUpdateStoreWithPlan();
  const nodeState = { name: "旧标题", data: { text: "old" } };
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ success: true, valid: true, actions: payload.actions }),
    executeActions: async () => {
      nodeState.name = "旧标题";
      nodeState.data = { text: "new" };
      return { appliedCount: 1, updatedNodeIds: ["n1"] };
    },
    nodeSnapshotProvider: () => ({ name: nodeState.name, data: { ...nodeState.data } }),
    nodeSignatureProvider: () => JSON.stringify({ name: nodeState.name, data: nodeState.data }),
  });

  await orchestrator.run("exec-restore", { agentMode: "act" });

  const stored = store.getExecution("exec-restore");
  const event = stored.timeline.find(
    (item) => item.actionId === "act-update" && item.status === "completed"
  );
  assert.equal(event.canUndo, true);
  assert.deepEqual(event.inverse, {
    aiOwned: true,
    ops: [
      {
        type: "restore_node",
        nodeId: "n1",
        name: "旧标题",
        data: { text: "old" },
        signature: JSON.stringify({ name: "旧标题", data: { text: "new" } }),
      },
    ],
  });
});

test("assistantExecutionOrchestrator: update actions without snapshot provider stay non-undoable", async () => {
  const store = createUpdateStoreWithPlan();
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ success: true, valid: true, actions: payload.actions }),
    executeActions: async () => ({ appliedCount: 1, updatedNodeIds: ["n1"] }),
  });

  await orchestrator.run("exec-restore", { agentMode: "act" });

  const event = store
    .getExecution("exec-restore")
    .timeline.find((item) => item.actionId === "act-update" && item.status === "completed");
  assert.equal(event.canUndo, false);
  assert.equal(Object.prototype.hasOwnProperty.call(event, "inverse"), false);
});

test("assistantExecutionOrchestrator: undo restores node attributes through restoredNodeIds", async () => {
  const store = createUpdateStoreWithPlan();
  const nodeState = { name: "旧标题", data: { text: "old" } };
  const undoCalls = [];
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ success: true, valid: true, actions: payload.actions }),
    executeActions: async () => {
      nodeState.data = { text: "new" };
      return { appliedCount: 1, updatedNodeIds: ["n1"] };
    },
    nodeSnapshotProvider: () => ({ name: nodeState.name, data: { ...nodeState.data } }),
    nodeSignatureProvider: () => JSON.stringify({ name: nodeState.name, data: nodeState.data }),
    applyInverseOps: async (payload) => {
      undoCalls.push(payload);
      return { removedNodeIds: [], removedEdgeIds: [], restoredNodeIds: ["n1"], conflicts: [] };
    },
  });

  await orchestrator.run("exec-restore", { agentMode: "act" });
  const sourceEvent = store
    .getExecution("exec-restore")
    .timeline.find((item) => item.actionId === "act-update" && item.status === "completed");

  const result = await orchestrator.undo("exec-restore", { eventId: sourceEvent.id });

  assert.equal(result.status, "undone");
  assert.deepEqual(result.restoredNodeIds, ["n1"]);
  assert.equal(undoCalls[0].ops[0].type, "restore_node");
  const undoneEvent = store
    .getExecution("exec-restore")
    .timeline.find((item) => item.status === "undone");
  assert.deepEqual(undoneEvent.nodeIds, ["n1"]);
});

test("assistantExecutionOrchestrator: undoTo rolls back selected and later undoable events in reverse", async () => {
  let eventCounter = 0;
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-orchestrator-undo-to",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-${(eventCounter += 1)}`,
  });
  store.createExecution({
    id: "exec-undo-to",
    title: "Multi step",
    status: "draft",
    drawerState: { visible: true, line1: "Multi step", line2: "Waiting" },
    plan: {
      id: "plan-undo-to",
      title: "Multi step",
      steps: [
        { id: "step-1", title: "Create first" },
        { id: "step-2", title: "Create second" },
        { id: "step-3", title: "Create third" },
      ],
    },
    actionsByStep: {
      "step-1": [{ id: "act-1", type: "create_node", nodeId: "n1", title: "Create first" }],
      "step-2": [{ id: "act-2", type: "create_node", nodeId: "n2", title: "Create second" }],
      "step-3": [{ id: "act-3", type: "create_node", nodeId: "n3", title: "Create third" }],
    },
  });
  const undoneOps = [];
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ success: true, valid: true, actions: payload.actions }),
    executeActions: async (payload) => ({
      appliedCount: 1,
      createdNodeIds: [payload.actions[0].nodeId],
    }),
    applyInverseOps: async ({ ops }) => {
      undoneOps.push(ops[0].nodeId);
      return { removedNodeIds: [ops[0].nodeId], removedEdgeIds: [], conflicts: [] };
    },
  });

  await orchestrator.run("exec-undo-to", { agentMode: "act" });
  const stored = store.getExecution("exec-undo-to");
  const secondEvent = stored.timeline.find(
    (item) => item.actionId === "act-2" && item.status === "completed"
  );

  const result = await orchestrator.undoTo("exec-undo-to", { eventId: secondEvent.id });

  assert.equal(result.status, "undone");
  assert.equal(result.undoneCount, 2);
  assert.deepEqual(undoneOps, ["n3", "n2"]);
  const after = store.getExecution("exec-undo-to");
  const undoneEvents = after.timeline.filter((item) => item.status === "undone");
  assert.equal(undoneEvents.length, 2);
  const firstEvent = after.timeline.find(
    (item) => item.actionId === "act-1" && item.status === "completed"
  );
  assert.equal(
    after.timeline.some(
      (item) =>
        item.status === "undone" &&
        item.developer?.undoneFromEventId === firstEvent.id
    ),
    false
  );

  const repeat = await orchestrator.undoTo("exec-undo-to", { eventId: secondEvent.id });
  assert.equal(repeat.status, "undo_unavailable");
});

test("assistantExecutionOrchestrator: layout/move actions capture restore_node_position inverse", async () => {
  let eventCounter = 0;
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-orchestrator-position",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-${(eventCounter += 1)}`,
  });
  store.createExecution({
    id: "exec-position",
    title: "Layout nodes",
    status: "draft",
    drawerState: { visible: true, line1: "Layout nodes", line2: "Waiting" },
    plan: { id: "plan-position", steps: [{ id: "step-layout", title: "Layout" }] },
    actionsByStep: {
      "step-layout": [
        { id: "act-layout", type: "layout_nodes", nodeIds: ["n1", "n2"], layout: "horizontal" },
      ],
    },
  });
  const positions = {
    n1: { x: 10, y: 20 },
    n2: { x: 30, y: 40 },
  };
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ success: true, valid: true, actions: payload.actions }),
    executeActions: async () => {
      positions.n1 = { x: 100, y: 0 };
      positions.n2 = { x: 200, y: 0 };
      return { appliedCount: 1, updatedNodeIds: ["n1", "n2"] };
    },
    nodePositionProvider: (nodeId) => ({ ...positions[nodeId] }),
  });

  await orchestrator.run("exec-position", { agentMode: "act" });

  const event = store
    .getExecution("exec-position")
    .timeline.find((item) => item.actionId === "act-layout" && item.status === "completed");
  assert.equal(event.canUndo, true);
  assert.deepEqual(event.inverse, {
    aiOwned: true,
    ops: [
      { type: "restore_node_position", nodeId: "n1", x: 10, y: 20, signature: JSON.stringify({ x: 100, y: 0 }) },
      { type: "restore_node_position", nodeId: "n2", x: 30, y: 40, signature: JSON.stringify({ x: 200, y: 0 }) },
    ],
  });
});

test("assistantExecutionOrchestrator: layout actions without position provider stay non-undoable", async () => {
  let eventCounter = 0;
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-orchestrator-position-none",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-${(eventCounter += 1)}`,
  });
  store.createExecution({
    id: "exec-position-none",
    title: "Move nodes",
    status: "draft",
    plan: { steps: [{ id: "step-move", title: "Move" }] },
    actionsByStep: {
      "step-move": [{ id: "act-move", type: "move_nodes", nodeIds: ["n1"] }],
    },
  });
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ success: true, valid: true, actions: payload.actions }),
    executeActions: async () => ({ appliedCount: 1, updatedNodeIds: ["n1"] }),
  });

  await orchestrator.run("exec-position-none", { agentMode: "act" });

  const event = store
    .getExecution("exec-position-none")
    .timeline.find((item) => item.actionId === "act-move" && item.status === "completed");
  assert.equal(event.canUndo, false);
  assert.equal(Object.prototype.hasOwnProperty.call(event, "inverse"), false);
});

test("assistantExecutionOrchestrator: skill-blocked validation writes blocked_by_skill and fails closed", async () => {
  let eventCounter = 0;
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-skill-block",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-${(eventCounter += 1)}`,
  });
  store.createExecution({
    id: "exec-skill-block",
    title: "Blocked run",
    status: "draft",
    matchedSkills: ["canvas_layout"],
    drawerState: { visible: true, line1: "Blocked run", line2: "Waiting" },
    plan: { steps: [{ id: "s1", title: "Generate" }] },
    actionsByStep: { s1: [{ id: "a1", type: "queue_generation_task", nodeId: "n1", nodeType: "ai-image" }] },
  });
  const validatePayloads = [];
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => {
      validatePayloads.push(payload);
      return { valid: false, blockedBySkill: true, errors: ["action[0] queue_generation_task is forbidden by matched skill constraints"] };
    },
    executeActions: async () => {
      throw new Error("must not execute blocked action");
    },
  });

  const result = await orchestrator.run("exec-skill-block", { agentMode: "act" });

  assert.equal(result.status, "failed");
  assert.deepEqual(validatePayloads[0].matchedSkills, ["canvas_layout"]);
  const stored = store.getExecution("exec-skill-block");
  const blocked = stored.timeline.find((event) => event.status === "blocked_by_skill");
  assert.ok(blocked);
  assert.equal(blocked.canRetry, false);
  assert.match(blocked.humanSummary, /技能约束/);
});

test("assistantExecutionOrchestrator: measures real action duration and writes structured target", async () => {
  const store = createUndoStoreWithPlan();
  let tick = 1000;
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    now: () => (tick += 250),
    validateActions: async (payload) => ({ valid: true, actions: payload.actions }),
    executeActions: async (payload) =>
      payload.actions[0].id === "act-create"
        ? { appliedCount: 1, createdNodeIds: ["text-1"] }
        : { appliedCount: 1, createdEdgeIds: ["edge-1"] },
  });

  await orchestrator.run("exec-orchestrator", { agentMode: "act" });

  const stored = store.getExecution("exec-orchestrator");
  const createEvent = stored.timeline.find((e) => e.actionId === "act-create" && e.status === "completed");
  assert.ok(createEvent.durationMs >= 250);
  assert.deepEqual(createEvent.target, {
    actionType: "create_node",
    nodeType: "",
    nodeIds: ["text-1"],
    stepId: "step-create",
  });
});

test("assistantExecutionOrchestrator: replay re-executes structural actions and skips generation", async () => {
  let eventCounter = 0;
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-replay",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-${(eventCounter += 1)}`,
  });
  store.createExecution({
    id: "exec-replay",
    title: "Replay run",
    status: "completed",
    drawerState: { visible: true, line1: "Replay run", line2: "执行完成" },
    plan: { steps: [{ id: "s1", title: "Create" }, { id: "s2", title: "Generate" }] },
    actionsByStep: {
      s1: [{ id: "a1", type: "create_node", nodeId: "n1", title: "Create text" }],
      s2: [{ id: "a2", type: "queue_generation_task", nodeId: "img-1", nodeType: "ai-image", title: "Generate image" }],
    },
  });
  const executed = [];
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ valid: true, actions: payload.actions }),
    executeActions: async (payload) => {
      executed.push(payload.actions[0].id);
      return { appliedCount: 1, createdNodeIds: [payload.actions[0].nodeId] };
    },
  });

  const result = await orchestrator.replay("exec-replay", { agentMode: "act" });

  assert.equal(result.status, "replayed");
  assert.equal(result.replayedCount, 1);
  assert.equal(result.skippedGenerationCount, 1);
  assert.deepEqual(executed, ["a1"]);
  const stored = store.getExecution("exec-replay");
  assert.ok(stored.timeline.some((e) => e.status === "replayed" && e.actionId === "a1"));
  assert.ok(stored.timeline.some((e) => e.status === "replay_skipped_generation" && e.actionId === "a2"));
  assert.equal(stored.status, "completed");
});

test("assistantExecutionOrchestrator: regenerateStep runs one generation action without moving the cursor", async () => {
  let eventCounter = 0;
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-regenerate",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-${(eventCounter += 1)}`,
  });
  store.createExecution({
    id: "exec-regen",
    title: "Regenerate run",
    status: "completed",
    orchestratorState: { nextActionIndex: 2, pausedAtActionId: "", running: false },
    plan: { steps: [{ id: "s1", title: "Create" }, { id: "s2", title: "Generate" }] },
    actionsByStep: {
      s1: [{ id: "a1", type: "create_node", nodeId: "n1" }],
      s2: [{ id: "a2", type: "queue_generation_task", nodeId: "img-1", nodeType: "ai-image" }],
    },
  });
  const executed = [];
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ valid: true, actions: payload.actions }),
    executeActions: async (payload) => {
      executed.push(payload.actions[0].id);
      return { appliedCount: 1, queuedGenerationNodeIds: ["img-1"] };
    },
  });

  const result = await orchestrator.regenerateStep("exec-regen", { actionId: "a2", eventId: "evt-x" });

  assert.equal(result.status, "regenerated");
  assert.deepEqual(executed, ["a2"]);
  const stored = store.getExecution("exec-regen");
  const regen = stored.timeline.find((e) => e.status === "completed" && e.developer?.regeneratedFromEventId === "evt-x");
  assert.ok(regen);
  assert.equal(stored.orchestratorState.nextActionIndex, 2);
  assert.equal(stored.status, "completed");
});

test("assistantExecutionOrchestrator: regenerating a video step requires fresh authorization", async () => {
  let eventCounter = 0;
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-regen-video",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-${(eventCounter += 1)}`,
  });
  store.createExecution({
    id: "exec-regen-video",
    title: "Video regen",
    status: "completed",
    plan: { steps: [{ id: "s1", title: "Video" }] },
    actionsByStep: { s1: [{ id: "a1", type: "queue_generation_task", nodeId: "v1", nodeType: "ai-video" }] },
  });
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ valid: true, actions: payload.actions }),
    executeActions: async () => {
      throw new Error("must not run unauthorized video");
    },
  });

  const result = await orchestrator.regenerateStep("exec-regen-video", { actionId: "a1" });

  assert.equal(result.status, "waiting_video_authorization");
  assert.ok(
    store.getExecution("exec-regen-video").timeline.some((e) => e.status === "waiting_video_authorization")
  );
});

test("assistantExecutionOrchestrator: node aliases survive across step-by-step execution", async () => {
  let eventCounter = 0;
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-alias",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-${(eventCounter += 1)}`,
  });
  store.createExecution({
    id: "exec-alias",
    title: "Alias run",
    status: "draft",
    drawerState: { visible: true, line1: "Alias run", line2: "Waiting" },
    plan: {
      steps: [
        { id: "s1", title: "Create outline" },
        { id: "s2", title: "Update outline" },
        { id: "s3", title: "Connect outline" },
      ],
    },
    actionsByStep: {
      s1: [{ id: "story_outline", type: "create_node", nodeType: "text", name: "大纲" }],
      s2: [{ id: "a2", type: "update_node", nodeId: "story_outline", data: { text: "更新" } }],
      s3: [{ id: "a3", type: "connect_nodes", from: "story_outline", to: "scene_1" }],
    },
  });
  const executedActions = [];
  const orchestrator = createAssistantExecutionOrchestrator({
    executionStore: store,
    validateActions: async (payload) => ({ valid: true, actions: payload.actions }),
    executeActions: async (payload) => {
      const action = payload.actions[0];
      executedActions.push(action);
      if (action.type === "create_node") {
        return {
          appliedCount: 1,
          createdNodeIds: ["node-real-1"],
          actionNodeIdMap: { story_outline: "node-real-1" },
        };
      }
      return { appliedCount: 1, updatedNodeIds: [action.nodeId || action.from] };
    },
  });

  const result = await orchestrator.run("exec-alias", { agentMode: "act" });

  assert.equal(result.status, "completed");
  assert.equal(executedActions[1].nodeId, "node-real-1");
  assert.equal(executedActions[2].from, "node-real-1");
  assert.equal(executedActions[2].to, "scene_1");
});
