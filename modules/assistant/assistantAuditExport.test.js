import assert from "node:assert/strict";
import test from "node:test";

import {
  createAssistantAuditRecord,
  exportAssistantAuditBundle,
} from "./assistantAuditExport.js";

test("assistantAuditExport: creates sanitized enterprise audit records for AI operations", () => {
  const record = createAssistantAuditRecord({
    operationId: "op-1",
    projectId: "project-a",
    teamId: "team-alpha",
    userId: "designer-a",
    conversationId: "conv-1",
    messageId: "msg-1",
    traceId: "trace-1",
    model: { provider: "model_registry", model: "gpt-5.5", apiKey: "must-not-leak" },
    contextDigest: { selectedNodeIds: ["n1"], localPath: "D:\\secret\\asset.png" },
    actions: [
      { type: "create_node", nodeType: "ai-text", data: { prompt: "safe", authorization: "Bearer secret" } },
      { type: "queue_generation_task", nodeId: "image-1", nodeType: "ai-image" },
    ],
    receipt: { success: true, summary: "Created nodes", details: { apiKey: "hidden" } },
  });

  assert.equal(record.schemaVersion, "canvas-agent-audit-record-v1");
  assert.equal(record.operationId, "op-1");
  assert.equal(record.actionSummary.total, 2);
  assert.deepEqual(record.actionSummary.byType, { create_node: 1, queue_generation_task: 1 });
  assert.equal(record.model.provider, "model_registry");
  assert.equal(JSON.stringify(record).includes("must-not-leak"), false);
  assert.equal(JSON.stringify(record).includes("Bearer secret"), false);
  assert.equal(JSON.stringify(record).includes("D:\\secret"), false);
  assert.equal(JSON.stringify(record).includes("apiKey"), false);
});

test("assistantAuditExport: exports project and team filtered audit bundles", () => {
  const records = [
    createAssistantAuditRecord({ operationId: "op-a", projectId: "project-a", teamId: "team-alpha", actions: [] }),
    createAssistantAuditRecord({ operationId: "op-b", projectId: "project-b", teamId: "team-alpha", actions: [] }),
    createAssistantAuditRecord({ operationId: "op-c", projectId: "project-a", teamId: "team-beta", actions: [] }),
  ];

  const bundle = exportAssistantAuditBundle(records, {
    projectId: "project-a",
    teamId: "team-alpha",
    exportedBy: "compliance-admin",
  });

  assert.equal(bundle.schemaVersion, "canvas-agent-audit-bundle-v1");
  assert.equal(bundle.exportedBy, "compliance-admin");
  assert.deepEqual(bundle.records.map((record) => record.operationId), ["op-a"]);
  assert.equal(bundle.summary.totalRecords, 1);
  assert.equal(bundle.summary.projects[0], "project-a");
  assert.equal(bundle.summary.teams[0], "team-alpha");
});

test("assistantAuditExport: redacts skill trace cards again before bundle export", () => {
  const record = createAssistantAuditRecord({
    operationId: "op-trace",
    projectId: "project-a",
    receipt: {
      details: {
        skillTraces: [
          {
            id: "trace-1",
            skillId: "imageNode.generate",
            apiKey: "sk-secret-1234567890",
            headers: { Authorization: "Bearer hidden" },
            url: "https://cdn.example.test/a.png?token=hidden&safe=1",
            paramsSummary: { promptPreview: "cat" },
          },
        ],
      },
    },
  });
  const bundle = exportAssistantAuditBundle([record], { projectId: "project-a" });
  const serialized = JSON.stringify(bundle);

  assert.match(serialized, /trace-1/);
  assert.doesNotMatch(serialized, /sk-secret|Bearer hidden|token=hidden|apiKey|Authorization/);
});
