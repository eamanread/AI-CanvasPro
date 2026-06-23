import assert from "node:assert/strict";
import test from "node:test";

import { createAssistantWorkflowTemplateStore } from "./assistantWorkflowTemplateStore.js";

function createMemoryStorage() {
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

test("assistantWorkflowTemplateStore: persists project-scoped template versions", () => {
  const storage = createMemoryStorage();
  const storeA = createAssistantWorkflowTemplateStore({
    storage,
    projectId: "project-a",
    clock: () => "2026-06-05T00:00:00.000Z",
  });

  const v1 = storeA.save({
    templateId: "tpl-story",
    name: "Story workflow",
    scope: "project",
    projectId: "project-a",
    version: "1.0.0",
    author: "qa-user",
    tags: ["story"],
    nodes: [{ id: "script", type: "ai-text", data: { prompt: "draft" } }],
    edges: [],
  });
  const v2 = storeA.save({
    ...v1,
    version: "1.1.0",
    tags: ["story", "image"],
    nodes: [
      ...v1.nodes,
      { id: "image", type: "ai-image", data: { prompt: "keyframe" } },
    ],
  });
  const restoredA = createAssistantWorkflowTemplateStore({ storage, projectId: "project-a" });
  const restoredB = createAssistantWorkflowTemplateStore({ storage, projectId: "project-b" });

  assert.equal(v2.templateId, "tpl-story");
  assert.equal(restoredA.get("tpl-story").version, "1.1.0");
  assert.equal(restoredA.get("tpl-story", { version: "1.0.0" }).nodes.length, 1);
  assert.equal(restoredA.get("tpl-story", { version: "1.1.0" }).nodes.length, 2);
  assert.deepEqual(
    restoredA.list().map((template) => template.templateId),
    ["tpl-story"]
  );
  assert.deepEqual(restoredB.list(), []);
});

test("assistantWorkflowTemplateStore: deprecates and rolls back templates with audit metadata", () => {
  const storage = createMemoryStorage();
  const store = createAssistantWorkflowTemplateStore({
    storage,
    projectId: "project-a",
    clock: () => "2026-06-05T00:00:00.000Z",
  });
  store.save({
    templateId: "tpl-story",
    name: "Story workflow",
    projectId: "project-a",
    version: "1.0.0",
    author: "qa-user",
    tags: ["story"],
    nodes: [{ id: "script", type: "ai-text" }],
    edges: [],
  });
  store.save({
    templateId: "tpl-story",
    name: "Story workflow",
    projectId: "project-a",
    version: "2.0.0",
    author: "qa-user",
    tags: ["story", "new"],
    nodes: [{ id: "script", type: "ai-text" }, { id: "image", type: "ai-image" }],
    edges: [],
  });

  const deprecated = store.deprecate("tpl-story", { reason: "Superseded by safer prompts" });
  const rollback = store.rollback("tpl-story", {
    toVersion: "1.0.0",
    version: "2.1.0",
    author: "qa-user",
  });

  assert.equal(deprecated.deprecated, true);
  assert.equal(deprecated.deprecatedReason, "Superseded by safer prompts");
  assert.equal(rollback.version, "2.1.0");
  assert.equal(rollback.rollbackOf, "2.0.0");
  assert.equal(rollback.rollbackToVersion, "1.0.0");
  assert.equal(store.get("tpl-story").version, "2.1.0");
  assert.equal(store.get("tpl-story").nodes.length, 1);
});

test("assistantWorkflowTemplateStore: governs local team templates with review publish reuse and rollback", () => {
  const storage = createMemoryStorage();
  let tick = 0;
  const clock = () => `2026-06-05T00:00:0${tick++}.000Z`;
  const storeA = createAssistantWorkflowTemplateStore({
    storage,
    projectId: "project-a",
    teamId: "team-alpha",
    clock,
  });

  storeA.save({
    templateId: "tpl-team-story",
    name: "Team story workflow",
    projectId: "project-a",
    version: "1.0.0",
    author: "alice",
    tags: ["story", "team"],
    nodes: [{ id: "script", type: "ai-text", data: { prompt: "team draft" } }],
    edges: [],
  });

  const submitted = storeA.submitForReview("tpl-team-story", {
    author: "alice",
    note: "Ready for team library review.",
  });
  const reviewed = storeA.review("tpl-team-story", {
    decision: "approve",
    reviewer: "lead",
    note: "Safe reusable workflow.",
  });
  const published = storeA.publish("tpl-team-story", {
    teamId: "team-alpha",
    publishedBy: "lead",
  });
  const storeB = createAssistantWorkflowTemplateStore({
    storage,
    projectId: "project-b",
    teamId: "team-alpha",
    clock,
  });
  const reused = storeB.recordReuse("tpl-team-story", {
    userId: "designer-b",
    consumerProjectId: "project-b",
  });
  const deprecated = storeB.deprecate("tpl-team-story", {
    scope: "team",
    reason: "Use the safer rollback.",
    author: "lead",
  });

  assert.equal(submitted.reviewStatus, "pending_review");
  assert.equal(submitted.reviewRequestedBy, "alice");
  assert.equal(reviewed.reviewStatus, "approved");
  assert.equal(reviewed.reviewedBy, "lead");
  assert.equal(published.scope, "team");
  assert.equal(published.teamId, "team-alpha");
  assert.equal(published.reviewStatus, "published");
  assert.equal(published.publishedBy, "lead");
  assert.equal(storeB.get("tpl-team-story", { scope: "team" }).scope, "team");
  assert.equal(reused.reuseCount, 1);
  assert.equal(reused.lastReusedBy, "designer-b");
  assert.equal(reused.lastReuseProjectId, "project-b");
  assert.equal(deprecated.deprecated, true);
  assert.deepEqual(storeB.list({ scope: "team" }), []);
  assert.equal(storeB.list({ scope: "team", includeDeprecated: true })[0].templateId, "tpl-team-story");

  const rollback = storeB.rollback("tpl-team-story", {
    scope: "team",
    toVersion: "1.0.0",
    version: "1.0.1",
    author: "lead",
  });

  assert.equal(rollback.scope, "team");
  assert.equal(rollback.teamId, "team-alpha");
  assert.equal(rollback.version, "1.0.1");
  assert.equal(rollback.rollbackToVersion, "1.0.0");
  assert.equal(storeB.get("tpl-team-story", { scope: "team" }).deprecated, false);
});

test("assistantWorkflowTemplateStore: imports project and team templates with isolation", () => {
  const storage = createMemoryStorage();
  const store = createAssistantWorkflowTemplateStore({
    storage,
    projectId: "project-a",
    teamId: "team-alpha",
  });

  const result = store.importTemplates([
    {
      templateId: "tpl-project-a",
      projectId: "project-a",
      nodes: [{ id: "n1", data: { prompt: "safe", apiKey: "must-not-leak" } }],
      edges: [],
    },
    {
      templateId: "tpl-project-b",
      projectId: "project-b",
      nodes: [{ id: "n2" }],
      edges: [],
    },
    {
      templateId: "tpl-team-alpha",
      scope: "team",
      projectId: "project-b",
      teamId: "team-alpha",
      nodes: [{ id: "n3" }],
      edges: [],
    },
    {
      templateId: "tpl-team-beta",
      scope: "team",
      projectId: "project-a",
      teamId: "team-beta",
      nodes: [{ id: "n4" }],
      edges: [],
    },
  ]);
  const serialized = JSON.stringify(store.list({ scope: "all", includeDeprecated: true }));

  assert.deepEqual(result, { imported: 2, skipped: 2 });
  assert.equal(store.get("tpl-project-a").projectId, "project-a");
  assert.equal(store.get("tpl-project-b"), null);
  assert.equal(store.get("tpl-team-alpha", { scope: "team" }).teamId, "team-alpha");
  assert.equal(store.get("tpl-team-beta", { scope: "team" }), null);
  assert.doesNotMatch(serialized, /must-not-leak|apiKey/);
});
