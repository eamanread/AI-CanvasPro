import assert from "node:assert/strict";
import test from "node:test";

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

test("assistantExecutionStore: creates project executions and persists queue state", () => {
  let next = 0;
  const storage = memoryStorage();
  const store = createAssistantExecutionStore({
    storage,
    projectId: "project-a",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}_${++next}`,
  });

  const active = store.createExecution({
    conversationId: "conv-1",
    intentId: "intent-1",
    planId: "plan-1",
    title: "6 镜头分镜",
    status: "executing",
    drawerState: { visible: true, expanded: false, line2: "正在生成第 1 张图" },
    progress: { done: 1, total: 6 },
  });
  const queued = store.enqueueExecution({
    title: "排队任务",
    status: "queued",
    progress: { done: 0, total: 2 },
  });

  assert.equal(active.id, "exec_1");
  assert.equal(queued.queueIndex, 1);
  assert.equal(store.snapshot().activeExecutionId, "exec_1");
  assert.deepEqual(store.snapshot().queue.map((item) => item.id), ["exec_2"]);

  const restored = createAssistantExecutionStore({ storage, projectId: "project-a" });
  assert.equal(restored.getExecution("exec_1").title, "6 镜头分镜");
  assert.equal(restored.snapshot().queue[0].title, "排队任务");
});

test("assistantExecutionStore: a persisted draft is demoted to history on reload (no ghost 常驻 抽屉 bar)", () => {
  const storage = memoryStorage();
  const store = createAssistantExecutionStore({ storage, projectId: "p", clock: () => "2026-06-10T00:00:00.000Z" });
  // a stale draft persisted with drawerState.visible:true (the "已为您重新整理布局" ghost)
  store.createExecution({ id: "exec-draft", title: "已为您重新整理布局", status: "draft", drawerState: { visible: true, line1: "已为您重新整理布局" } });
  // a paused execution genuinely needs attention across a restart → must stay visible
  store.createExecution({ id: "exec-paused", title: "Paused", status: "paused", drawerState: { visible: true, line1: "Paused" } });

  // reload (fresh session from the same storage)
  const reloaded = createAssistantExecutionStore({ storage, projectId: "p" });
  assert.equal(reloaded.getExecution("exec-draft").drawerState.visible, false, "stale draft demoted to history on reload");
  assert.equal(reloaded.getExecution("exec-paused").drawerState.visible, true, "paused stays visible (needs attention)");

  // the demotion is persisted — a second reload still sees visible:false (no re-ghosting)
  const reloaded2 = createAssistantExecutionStore({ storage, projectId: "p" });
  assert.equal(reloaded2.getExecution("exec-draft").drawerState.visible, false);
});



test("assistantExecutionStore: queued draft participates in queue ordering and controls", () => {
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-queued-draft",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  store.createExecution({ id: "exec-active", title: "Active", status: "executing" });
  const draft = store.enqueueExecution({
    id: "exec-draft",
    title: "Draft queued task",
    status: "queued_draft",
    drawerState: { line1: "Draft queued task" },
  });
  store.enqueueExecution({ id: "exec-queued", title: "Normal queued task" });

  assert.equal(draft.status, "queued_draft");
  assert.deepEqual(store.snapshot().queue.map((item) => [item.id, item.status]), [
    ["exec-draft", "queued_draft"],
    ["exec-queued", "queued"],
  ]);
  assert.equal(store.snapshot().activeExecutionId, "exec-active");

  const paused = store.pauseQueuedExecution("exec-draft");
  assert.equal(paused.status, "queued_draft");
  assert.equal(paused.drawerState.queuePaused, true);

  const resumed = store.resumeQueuedExecution("exec-draft");
  assert.equal(resumed.status, "queued_draft");
  assert.equal(resumed.drawerState.queuePaused, false);

  const cancelled = store.cancelQueuedExecution("exec-draft");
  assert.equal(cancelled.status, "cancelled");
  assert.deepEqual(store.snapshot().queue.map((item) => item.id), ["exec-queued"]);
});

test("assistantExecutionStore: moving queued draft to top preserves mixed queue order", () => {
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-queued-draft-top",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  store.createExecution({ id: "exec-active", title: "Active", status: "executing" });
  store.enqueueExecution({ id: "exec-queued-1", title: "Queued 1" });
  store.enqueueExecution({ id: "exec-draft-1", title: "Draft 1", status: "queued_draft" });
  store.enqueueExecution({ id: "exec-queued-2", title: "Queued 2" });
  store.enqueueExecution({ id: "exec-draft-2", title: "Draft 2", status: "queued_draft" });

  const topped = store.moveQueuedExecutionToTop("exec-draft-2");

  assert.equal(topped.status, "queued_draft");
  assert.deepEqual(store.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-draft-2", "queued_draft", 1],
    ["exec-queued-1", "queued", 2],
    ["exec-draft-1", "queued_draft", 3],
    ["exec-queued-2", "queued", 4],
  ]);
  assert.equal(store.snapshot().activeExecutionId, "exec-active");
});

test("assistantExecutionStore: moves queued execution to requested index preserving mixed queue order", () => {
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-queued-move-index",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  store.createExecution({ id: "exec-active", title: "Active", status: "executing" });
  store.enqueueExecution({ id: "exec-queued-1", title: "Queued 1" });
  store.enqueueExecution({ id: "exec-draft-1", title: "Draft 1", status: "queued_draft" });
  store.enqueueExecution({ id: "exec-queued-2", title: "Queued 2" });
  store.enqueueExecution({ id: "exec-draft-2", title: "Draft 2", status: "queued_draft" });

  const moved = store.moveQueuedExecutionToIndex("exec-draft-2", 1);

  assert.equal(moved.status, "queued_draft");
  assert.deepEqual(store.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-1", "queued", 1],
    ["exec-draft-2", "queued_draft", 2],
    ["exec-draft-1", "queued_draft", 3],
    ["exec-queued-2", "queued", 4],
  ]);
  assert.equal(store.snapshot().activeExecutionId, "exec-active");
});

test("assistantExecutionStore: reorders queued executions by explicit ordered ids", () => {
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-queued-reorder",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  store.createExecution({ id: "exec-active", title: "Active", status: "executing" });
  store.enqueueExecution({ id: "exec-queued-1", title: "Queued 1" });
  store.enqueueExecution({ id: "exec-draft-1", title: "Draft 1", status: "queued_draft" });
  store.enqueueExecution({ id: "exec-queued-2", title: "Queued 2" });
  store.enqueueExecution({ id: "exec-draft-2", title: "Draft 2", status: "queued_draft" });

  const reordered = store.reorderQueuedExecutions([
    "exec-draft-2",
    "exec-draft-1",
    "exec-queued-1",
    "exec-queued-2",
  ]);

  assert.deepEqual(reordered.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-draft-2", "queued_draft", 1],
    ["exec-draft-1", "queued_draft", 2],
    ["exec-queued-1", "queued", 3],
    ["exec-queued-2", "queued", 4],
  ]);
  assert.deepEqual(store.snapshot().queue.map((item) => item.id), [
    "exec-draft-2",
    "exec-draft-1",
    "exec-queued-1",
    "exec-queued-2",
  ]);
  assert.equal(store.snapshot().activeExecutionId, "exec-active");
});

test("assistantExecutionStore: controls queued executions without changing active execution", () => {
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-queue-controls",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  store.createExecution({
    id: "exec-active",
    title: "Active task",
    status: "executing",
    drawerState: { visible: true, line1: "Active task" },
  });
  store.enqueueExecution({ id: "exec-queued-1", title: "Queued 1" });
  store.enqueueExecution({ id: "exec-queued-2", title: "Queued 2" });
  store.enqueueExecution({ id: "exec-queued-3", title: "Queued 3" });

  const topped = store.moveQueuedExecutionToTop("exec-queued-3");

  assert.equal(topped.id, "exec-queued-3");
  assert.deepEqual(store.snapshot().queue.map((item) => item.id), [
    "exec-queued-3",
    "exec-queued-1",
    "exec-queued-2",
  ]);

  const paused = store.pauseQueuedExecution("exec-queued-3");
  assert.equal(paused.status, "queued");
  assert.equal(paused.drawerState.queuePaused, true);
  assert.equal(store.snapshot().activeExecutionId, "exec-active");

  const resumed = store.resumeQueuedExecution("exec-queued-3");
  assert.equal(resumed.drawerState.queuePaused, false);

  const cancelled = store.cancelQueuedExecution("exec-queued-1");
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.queueIndex, 0);
  assert.equal(cancelled.drawerState.visible, false);
  assert.deepEqual(store.snapshot().queue.map((item) => item.id), [
    "exec-queued-3",
    "exec-queued-2",
  ]);
  assert.equal(store.snapshot().activeExecutionId, "exec-active");
});

test("assistantExecutionStore: appends timeline events, updates status, and hides completed drawer without deleting history", () => {
  let time = 0;
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-a",
    clock: () => `2026-06-10T00:00:0${time++}.000Z`,
    idFactory: (prefix) => `${prefix}-fixed`,
  });
  const execution = store.createExecution({
    id: "exec-story",
    title: "故事分镜",
    status: "executing",
    drawerState: { visible: true, expanded: true },
  });

  const event = store.appendTimelineEvent(execution.id, {
    stepId: "step_keyframes",
    actionId: "act-image-1",
    status: "running",
    humanSummary: "正在生成关键帧 01",
    nodeIds: ["image-1", "text-1"],
    developer: {
      apiKey: "sk-secret",
      localPath: "D:\\secret\\asset.png",
      actionJson: { type: "queue_generation_task", nodeId: "image-1" },
    },
  });
  const completed = store.updateStatus(execution.id, "completed", {
    drawerState: { visible: false, expanded: false, line2: "已完成" },
  });

  assert.equal(event.id, "evt-fixed");
  assert.equal(completed.status, "completed");
  assert.equal(completed.drawerState.visible, false);
  const stored = store.getExecution(execution.id);
  assert.equal(stored.timeline.length, 1);
  assert.equal(stored.timeline[0].humanSummary, "正在生成关键帧 01");
  assert.deepEqual(stored.timeline[0].nodeIds, ["image-1", "text-1"]);
  assert.equal(stored.timeline[0].developer.apiKey, undefined);
  assert.equal(stored.timeline[0].developer.localPath, undefined);
  assert.deepEqual(stored.timeline[0].developer.actionJson, {
    type: "queue_generation_task",
    nodeId: "image-1",
  });
});

test("assistantExecutionStore: persists orchestrator pause cursor state", () => {
  const storage = memoryStorage();
  const store = createAssistantExecutionStore({
    storage,
    projectId: "project-a",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  store.createExecution({
    id: "exec-cursor",
    title: "Cursor task",
    status: "executing",
  });

  store.updateStatus("exec-cursor", "paused", {
    orchestratorState: {
      nextActionIndex: 2,
      pausedAtActionId: "act-2",
      running: true,
      ignored: "drop me",
    },
  });

  const restored = createAssistantExecutionStore({ storage, projectId: "project-a" });
  assert.deepEqual(restored.getExecution("exec-cursor").orchestratorState, {
    nextActionIndex: 2,
    pausedAtActionId: "act-2",
    running: false,
  });
});

test("assistantExecutionStore: restores interrupted executing tasks as paused after restart", () => {
  const storage = memoryStorage();
  storage.setItem(
    "huanying.canvasAgent.executions.v1",
    JSON.stringify({
      version: 1,
      executions: [
        {
          id: "exec-interrupted",
          projectId: "project-a",
          title: "Interrupted task",
          status: "executing",
          createdAt: "2026-06-10T00:00:00.000Z",
          updatedAt: "2026-06-10T00:00:01.000Z",
          progress: { done: 1, total: 3 },
          drawerState: { visible: true, expanded: true, line1: "Interrupted task", line2: "Running old action" },
          orchestratorState: { nextActionIndex: 1, pausedAtActionId: "act-2", running: true },
          timeline: [{ id: "evt-running", status: "running", humanSummary: "Running old action" }],
        },
        {
          id: "exec-draft",
          projectId: "project-a",
          title: "Queued draft",
          status: "queued_draft",
          queueIndex: 2,
        },
        {
          id: "exec-queued",
          projectId: "project-a",
          title: "Queued task",
          status: "queued",
          queueIndex: 1,
        },
      ],
    })
  );

  const restored = createAssistantExecutionStore({
    storage,
    projectId: "project-a",
    clock: () => "2026-06-10T00:01:00.000Z",
    idFactory: (prefix) => `${prefix}-restore`,
  });

  const interrupted = restored.getExecution("exec-interrupted");
  assert.equal(interrupted.status, "paused");
  assert.equal(interrupted.drawerState.visible, true);
  assert.equal(interrupted.drawerState.line2, "重启后已暂停，可继续执行");
  assert.deepEqual(interrupted.orchestratorState, {
    nextActionIndex: 1,
    pausedAtActionId: "act-2",
    running: false,
  });
  assert.equal(interrupted.timeline.at(-1).status, "restored_paused");
  assert.equal(interrupted.timeline.at(-1).developer.restoreReason, "local_storage_restart");
  assert.equal(restored.snapshot().activeExecutionId, "exec-interrupted");
  assert.deepEqual(restored.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued", "queued", 1],
    ["exec-draft", "queued_draft", 2],
  ]);

  const persistedAgain = createAssistantExecutionStore({ storage, projectId: "project-a" });
  assert.equal(persistedAgain.getExecution("exec-interrupted").status, "paused");
  assert.equal(
    persistedAgain
      .getExecution("exec-interrupted")
      .timeline.filter((event) => event.status === "restored_paused").length,
    1
  );
});

test("assistantExecutionStore: imports interrupted backend executing history as paused", () => {
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-a",
    clock: () => "2026-06-10T00:01:00.000Z",
    idFactory: (prefix) => `${prefix}-import-restore`,
  });

  const imported = store.importExecutions([
    {
      id: "exec-backend-running",
      projectId: "project-a",
      title: "Backend running task",
      status: "executing",
      drawerState: { visible: true, line1: "Backend running task", line2: "Running on old session" },
      orchestratorState: { nextActionIndex: 3, pausedAtActionId: "act-4", running: true },
      timeline: [{ id: "evt-backend-running", status: "running", humanSummary: "Running on old session" }],
    },
  ]);

  assert.equal(imported.length, 1);
  assert.equal(imported[0].status, "paused");
  assert.equal(imported[0].drawerState.line2, "重启后已暂停，可继续执行");
  assert.deepEqual(imported[0].orchestratorState, {
    nextActionIndex: 3,
    pausedAtActionId: "act-4",
    running: false,
  });
  assert.equal(imported[0].timeline.at(-1).status, "restored_paused");
  assert.equal(imported[0].timeline.at(-1).developer.restoreReason, "backend_import_restart");
});

test("assistantExecutionStore: imports backend execution history into the current project", () => {
  const storage = memoryStorage();
  const store = createAssistantExecutionStore({
    storage,
    projectId: "project-a",
    clock: () => "2026-06-10T00:00:00.000Z",
  });

  const imported = store.importExecutions([
    {
      id: "exec-history",
      projectId: "project-a",
      title: "Backend history",
      status: "executing",
      drawerState: { visible: true, line1: "Backend history 1/2" },
      timeline: [
        {
          id: "evt-history",
          humanSummary: "Loaded from backend",
          developer: {
            apiKey: "sk-secret",
            actionJson: { type: "layout_nodes", nodeIds: ["node-1"] },
          },
        },
      ],
    },
    {
      id: "exec-other-project",
      projectId: "project-b",
      title: "Other project",
      status: "executing",
    },
  ]);

  assert.equal(imported.length, 1);
  assert.equal(imported[0].id, "exec-history");
  assert.equal(store.getExecution("exec-history").drawerState.line1, "Backend history 1/2");
  assert.equal(store.getExecution("exec-history").timeline[0].developer.apiKey, undefined);
  assert.deepEqual(store.getExecution("exec-history").timeline[0].developer.actionJson, {
    type: "layout_nodes",
    nodeIds: ["node-1"],
  });
  assert.equal(store.getExecution("exec-other-project"), null);

  const restored = createAssistantExecutionStore({ storage, projectId: "project-a" });
  assert.equal(restored.getExecution("exec-history").title, "Backend history");
});

test("assistantExecutionStore: keeps only the requested project and limits completed history", () => {
  const storage = memoryStorage();
  const storeA = createAssistantExecutionStore({
    storage,
    projectId: "project-a",
    maxExecutions: 2,
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  storeA.createExecution({ id: "exec-a-old", title: "old", status: "completed" });
  storeA.createExecution({ id: "exec-a-mid", title: "mid", status: "completed" });
  storeA.createExecution({ id: "exec-a-active", title: "active", status: "executing" });

  const storeB = createAssistantExecutionStore({ storage, projectId: "project-b" });
  storeB.createExecution({ id: "exec-b", title: "other project", status: "executing" });

  const restoredA = createAssistantExecutionStore({ storage, projectId: "project-a", maxExecutions: 2 });
  assert.deepEqual(
    restoredA.snapshot().executions.map((item) => item.id),
    ["exec-a-mid", "exec-a-active"]
  );
  assert.equal(restoredA.getExecution("exec-b"), null);
});

test("assistantExecutionStore: timeline events keep sanitized inverse patch data", () => {
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-inverse",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-fixed`,
  });
  store.createExecution({ id: "exec-inverse", title: "Undo source", status: "completed" });
  store.appendTimelineEvent("exec-inverse", {
    id: "evt-create",
    actionId: "act-create",
    status: "completed",
    humanSummary: "已生成节点",
    canUndo: true,
    inverse: {
      aiOwned: true,
      ops: [
        { type: "remove_node", nodeId: "text-1", signature: "{\"name\":\"标题\",\"data\":{}}" },
        { type: "remove_edge", edgeId: "edge-1" },
        { type: "drop_everything", nodeId: "text-2" },
        { type: "remove_node" },
      ],
    },
  });

  const stored = store.getExecution("exec-inverse");
  const event = stored.timeline.find((item) => item.id === "evt-create");
  assert.equal(event.canUndo, true);
  assert.deepEqual(event.inverse, {
    aiOwned: true,
    ops: [
      { type: "remove_node", nodeId: "text-1", signature: "{\"name\":\"标题\",\"data\":{}}" },
      { type: "remove_edge", edgeId: "edge-1" },
    ],
  });

  const restored = createAssistantExecutionStore({ storage: memoryStorage(), projectId: "project-inverse" });
  assert.equal(restored.getExecution("exec-inverse"), null);
});

test("assistantExecutionStore: events without inverse stay unchanged and persist across reload", () => {
  const storage = memoryStorage();
  const store = createAssistantExecutionStore({
    storage,
    projectId: "project-inverse-reload",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-fixed`,
  });
  store.createExecution({ id: "exec-reload", title: "Undo reload", status: "completed" });
  store.appendTimelineEvent("exec-reload", {
    id: "evt-plain",
    status: "completed",
    humanSummary: "无 inverse",
    canUndo: false,
  });
  store.appendTimelineEvent("exec-reload", {
    id: "evt-undoable",
    status: "completed",
    humanSummary: "可撤销",
    canUndo: true,
    inverse: { aiOwned: true, ops: [{ type: "remove_node", nodeId: "node-1" }] },
  });

  const plain = store.getExecution("exec-reload").timeline.find((item) => item.id === "evt-plain");
  assert.equal(Object.prototype.hasOwnProperty.call(plain, "inverse"), false);

  const restored = createAssistantExecutionStore({ storage, projectId: "project-inverse-reload" });
  const event = restored.getExecution("exec-reload").timeline.find((item) => item.id === "evt-undoable");
  assert.deepEqual(event.inverse, { aiOwned: true, ops: [{ type: "remove_node", nodeId: "node-1" }] });
});

test("assistantExecutionStore: setPlanStepEnabled toggles unexecuted steps in editable statuses only", () => {
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-plan-edit",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-fixed`,
  });
  store.createExecution({
    id: "exec-plan-edit",
    title: "Editable plan",
    status: "paused",
    orchestratorState: { nextActionIndex: 1, pausedAtActionId: "act-second", running: false },
    progress: { done: 1, total: 3 },
    plan: {
      steps: [
        { id: "step-done", title: "Executed step" },
        { id: "step-second", title: "Second step" },
        { id: "step-third", title: "Third step" },
      ],
    },
    actionsByStep: {
      "step-done": [{ id: "act-done", type: "create_node", nodeId: "n-1" }],
      "step-second": [{ id: "act-second", type: "create_node", nodeId: "n-2" }],
      "step-third": [{ id: "act-third", type: "create_node", nodeId: "n-3" }],
    },
  });
  store.appendTimelineEvent("exec-plan-edit", {
    id: "evt-done",
    stepId: "step-done",
    actionId: "act-done",
    status: "completed",
    humanSummary: "已生成节点",
  });

  const disabled = store.setPlanStepEnabled("exec-plan-edit", "step-third", false);
  assert.ok(disabled);
  const storedStep = disabled.plan.steps.find((step) => step.id === "step-third");
  assert.equal(storedStep.enabled, false);

  assert.equal(store.setPlanStepEnabled("exec-plan-edit", "step-done", false), null);
  assert.equal(store.setPlanStepEnabled("exec-plan-edit", "step-third", true), null);
  assert.equal(store.setPlanStepEnabled("exec-plan-edit", "missing-step", false), null);

  store.updateStatus("exec-plan-edit", "executing", {});
  assert.equal(store.setPlanStepEnabled("exec-plan-edit", "step-second", false), null);
});

test("assistantExecutionStore: setPlanStepEnabled re-enables steps before execution starts", () => {
  const storage = memoryStorage();
  const store = createAssistantExecutionStore({
    storage,
    projectId: "project-plan-enable",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-fixed`,
  });
  store.createExecution({
    id: "exec-plan-enable",
    title: "Draft plan",
    status: "draft",
    plan: {
      steps: [
        { id: "step-a", title: "A" },
        { id: "step-b", title: "B", enabled: false },
      ],
    },
    actionsByStep: {
      "step-a": [{ id: "act-a", type: "create_node", nodeId: "n-a" }],
      "step-b": [{ id: "act-b", type: "create_node", nodeId: "n-b" }],
    },
  });

  const enabled = store.setPlanStepEnabled("exec-plan-enable", "step-b", true);
  assert.ok(enabled);
  assert.equal(enabled.plan.steps.find((step) => step.id === "step-b").enabled, true);

  const restored = createAssistantExecutionStore({ storage, projectId: "project-plan-enable" });
  assert.equal(
    restored.getExecution("exec-plan-enable").plan.steps.find((step) => step.id === "step-b").enabled,
    true
  );
});

test("assistantExecutionStore: inverse keeps restore_node ops with prior name/data", () => {
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-restore-inverse",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-fixed`,
  });
  store.createExecution({ id: "exec-restore", title: "Restore", status: "completed" });
  store.appendTimelineEvent("exec-restore", {
    id: "evt-update",
    actionId: "act-update",
    status: "completed",
    humanSummary: "已更新节点",
    canUndo: true,
    inverse: {
      aiOwned: true,
      ops: [
        {
          type: "restore_node",
          nodeId: "n1",
          name: "旧标题",
          data: { text: "old", apiKey: "sk-secretsecret1234" },
          signature: "{\"name\":\"旧标题\"}",
        },
        { type: "restore_node" },
      ],
    },
  });

  const event = store.getExecution("exec-restore").timeline.find((item) => item.id === "evt-update");
  assert.equal(event.inverse.ops.length, 1);
  assert.equal(event.inverse.ops[0].type, "restore_node");
  assert.equal(event.inverse.ops[0].nodeId, "n1");
  assert.equal(event.inverse.ops[0].name, "旧标题");
  assert.equal(event.inverse.ops[0].data.text, "old");
  assert.equal(event.inverse.ops[0].data.apiKey, undefined);
});

test("assistantExecutionStore: inverse keeps restore_node_position ops with coordinates", () => {
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-position-inverse",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-fixed`,
  });
  store.createExecution({ id: "exec-pos", title: "Position", status: "completed" });
  store.appendTimelineEvent("exec-pos", {
    id: "evt-pos",
    actionId: "act-layout",
    status: "completed",
    canUndo: true,
    inverse: {
      aiOwned: true,
      ops: [
        { type: "restore_node_position", nodeId: "n1", x: 10.5, y: -20, signature: "{\"x\":100,\"y\":0}" },
        { type: "restore_node_position", nodeId: "n2", x: "bad", y: 0 },
        { type: "restore_node_position", x: 1, y: 2 },
      ],
    },
  });

  const event = store.getExecution("exec-pos").timeline.find((item) => item.id === "evt-pos");
  assert.deepEqual(event.inverse.ops, [
    { type: "restore_node_position", nodeId: "n1", x: 10.5, y: -20, signature: "{\"x\":100,\"y\":0}" },
  ]);
});

test("assistantExecutionStore: reorderPlanSteps reorders unexecuted steps and records plan_edited", () => {
  const store = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-plan-reorder",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  store.createExecution({
    id: "exec-reorder",
    title: "Reorder plan",
    status: "paused",
    orchestratorState: { nextActionIndex: 1, pausedAtActionId: "act-2", running: false },
    progress: { done: 1, total: 3 },
    plan: {
      steps: [
        { id: "s1", title: "Done step" },
        { id: "s2", title: "Second" },
        { id: "s3", title: "Third" },
      ],
    },
    actionsByStep: {
      s1: [{ id: "act-1", type: "create_node", nodeId: "n1" }],
      s2: [{ id: "act-2", type: "create_node", nodeId: "n2" }],
      s3: [{ id: "act-3", type: "create_node", nodeId: "n3" }],
    },
  });
  store.appendTimelineEvent("exec-reorder", {
    id: "evt-done",
    stepId: "s1",
    actionId: "act-1",
    status: "completed",
    humanSummary: "已生成节点",
  });

  const updated = store.reorderPlanSteps("exec-reorder", ["s1", "s3", "s2"]);
  assert.ok(updated);
  assert.deepEqual(updated.plan.steps.map((step) => step.id), ["s1", "s3", "s2"]);
  const editEvent = updated.timeline.find((event) => event.status === "plan_edited");
  assert.ok(editEvent);
  assert.deepEqual(editEvent.developer.orderedStepIds, ["s1", "s3", "s2"]);

  assert.equal(store.reorderPlanSteps("exec-reorder", ["s3", "s1", "s2"]), null);
  assert.equal(store.reorderPlanSteps("exec-reorder", ["s1", "s3"]), null);
  store.updateStatus("exec-reorder", "executing", {});
  assert.equal(store.reorderPlanSteps("exec-reorder", ["s1", "s2", "s3"]), null);
});

test("assistantExecutionStore: persists matchedSkills from the v2 intent", () => {
  const storage = memoryStorage();
  const store = createAssistantExecutionStore({ storage, projectId: "project-skills" });
  store.createExecution({
    id: "exec-skills",
    title: "Skill run",
    status: "draft",
    matchedSkills: ["canvas_layout", "", "asset_usage", 42],
  });
  assert.deepEqual(store.getExecution("exec-skills").matchedSkills, ["canvas_layout", "asset_usage", "42"]);
  const restored = createAssistantExecutionStore({ storage, projectId: "project-skills" });
  assert.deepEqual(restored.getExecution("exec-skills").matchedSkills, ["canvas_layout", "asset_usage", "42"]);
});

test("assistantExecutionStore: timeline events keep structured target", () => {
  const store = createAssistantExecutionStore({ storage: memoryStorage(), projectId: "project-target" });
  store.createExecution({ id: "exec-target", status: "completed" });
  store.appendTimelineEvent("exec-target", {
    id: "evt-target",
    status: "completed",
    target: { actionType: "create_node", nodeType: "ai-image", nodeIds: ["n1"], stepId: "s1", extra: "drop-me" },
  });
  const event = store.getExecution("exec-target").timeline.find((item) => item.id === "evt-target");
  assert.deepEqual(event.target, { actionType: "create_node", nodeType: "ai-image", nodeIds: ["n1"], stepId: "s1" });
});
