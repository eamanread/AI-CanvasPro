import assert from "node:assert/strict";
import test from "node:test";

import { createAssistantExecutionApiClient } from "./assistantExecutionApiClient.js";

test("assistantExecutionApiClient: upserts executions through canvas-agent namespace", async () => {
  const calls = [];
  const client = createAssistantExecutionApiClient({
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return { success: true, execution: { id: "exec-1", title: "Synced" } };
        },
      };
    },
  });

  const result = await client.upsertExecution({ id: "exec-1", title: "Synced" });

  assert.deepEqual(result, { success: true, execution: { id: "exec-1", title: "Synced" } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/v2/canvas-agent/executions");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].options.body), { id: "exec-1", title: "Synced" });
});

test("assistantExecutionApiClient: appends timeline events under execution id", async () => {
  const calls = [];
  const client = createAssistantExecutionApiClient({
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return { success: true };
        },
      };
    },
  });

  await client.appendTimelineEvent("exec/with space", { id: "evt-1", humanSummary: "Ready" });

  assert.equal(calls[0].url, "/api/v2/canvas-agent/executions/exec%2Fwith%20space/timeline");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), { id: "evt-1", humanSummary: "Ready" });
});

test("assistantExecutionApiClient: updates execution status through canvas-agent namespace", async () => {
  const calls = [];
  const client = createAssistantExecutionApiClient({
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return { success: true, execution: { id: "exec status", status: "paused" } };
        },
      };
    },
  });

  await client.updateExecutionStatus("exec status", "paused", {
    drawerState: { visible: true, line2: "Paused by user" },
  });

  assert.equal(calls[0].url, "/api/v2/canvas-agent/executions/exec%20status/status");
  assert.equal(calls[0].options.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    status: "paused",
    drawerState: { visible: true, line2: "Paused by user" },
  });
});

test("assistantExecutionApiClient: sends queued execution controls through canvas-agent namespace", async () => {
  const calls = [];
  const client = createAssistantExecutionApiClient({
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return { success: true, execution: { id: "exec queue", status: "queued" } };
        },
      };
    },
  });

  const result = await client.controlQueuedExecution("exec queue", "pause");

  assert.deepEqual(result.execution, { id: "exec queue", status: "queued" });
  assert.equal(calls[0].url, "/api/v2/canvas-agent/executions/exec%20queue/queue-control");
  assert.equal(calls[0].options.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[0].options.body), { action: "pause" });
});

test("assistantExecutionApiClient: sends queued execution move target index", async () => {
  const calls = [];
  const client = createAssistantExecutionApiClient({
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return { success: true, execution: { id: "exec move", status: "queued", queueIndex: 2 } };
        },
      };
    },
  });

  await client.controlQueuedExecution("exec move", "move", { targetIndex: 1 });

  assert.equal(calls[0].url, "/api/v2/canvas-agent/executions/exec%20move/queue-control");
  assert.equal(calls[0].options.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[0].options.body), { action: "move", targetIndex: 1 });
});

test("assistantExecutionApiClient: sends queued execution reorder ordered ids", async () => {
  const calls = [];
  const client = createAssistantExecutionApiClient({
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return { success: true, executions: [{ id: "exec-4", queueIndex: 1 }] };
        },
      };
    },
  });

  await client.controlQueuedExecution("exec-4", "reorder", {
    orderedIds: ["exec-4", "exec-2", "exec-1", "exec-3"],
  });

  assert.equal(calls[0].url, "/api/v2/canvas-agent/executions/exec-4/queue-control");
  assert.equal(calls[0].options.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    action: "reorder",
    orderedIds: ["exec-4", "exec-2", "exec-1", "exec-3"],
  });
});

test("assistantExecutionApiClient: prepares queued executions through explicit prepare route", async () => {
  const calls = [];
  const client = createAssistantExecutionApiClient({
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return {
            success: true,
            plan: { id: "plan-fresh" },
            actionsByStep: { "step-1": [{ id: "act-fresh" }] },
            drawerState: { line2: "Prepared from backend" },
          };
        },
      };
    },
  });

  const result = await client.prepareQueuedExecution("exec prepare", {
    executionId: "exec prepare",
    context: { canvas: { nodeCount: 2 } },
    agentMode: "act",
    videoAuthorized: false,
  });

  assert.equal(calls[0].url, "/api/v2/canvas-agent/executions/exec%20prepare/prepare");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    executionId: "exec prepare",
    context: { canvas: { nodeCount: 2 } },
    agentMode: "act",
    videoAuthorized: false,
  });
  assert.equal(result.plan.id, "plan-fresh");
  assert.equal(result.actionsByStep["step-1"][0].id, "act-fresh");
});

test("assistantExecutionApiClient: lists executions with encoded filters", async () => {
  const calls = [];
  const client = createAssistantExecutionApiClient({
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return { success: true, executions: [{ id: "exec-1", title: "History" }] };
        },
      };
    },
  });

  const result = await client.listExecutions({
    projectId: "project 1",
    status: "executing",
    empty: "",
  });

  assert.deepEqual(result.executions, [{ id: "exec-1", title: "History" }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/v2/canvas-agent/executions?projectId=project+1&status=executing");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.body, undefined);
});

test("assistantExecutionApiClient: throws readable errors for failed responses", async () => {
  const client = createAssistantExecutionApiClient({
    fetchFn: async () => ({
      ok: false,
      status: 503,
      async json() {
        return { error: "Store unavailable" };
      },
    }),
  });

  await assert.rejects(
    () => client.upsertExecution({ id: "exec-1" }),
    /Store unavailable/
  );
});

test("assistantExecutionApiClient: fetchMetrics GETs the metrics route with projectId", async () => {
  const calls = [];
  const client = createAssistantExecutionApiClient({
    fetchFn: async (url) => {
      calls.push(url);
      return {
        ok: true,
        status: 200,
        async json() {
          return { success: true, metrics: { totalExecutions: 2, skillHitRate: 0.5 } };
        },
      };
    },
  });

  const metrics = await client.fetchMetrics({ projectId: "project-a" });

  assert.equal(calls.length, 1);
  assert.match(String(calls[0]), /\/api\/v2\/canvas-agent\/metrics\?projectId=project-a$/);
  assert.equal(metrics.totalExecutions, 2);
});
