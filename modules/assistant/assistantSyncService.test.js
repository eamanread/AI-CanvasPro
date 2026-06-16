import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAssistantProjectSyncSnapshot,
  createAssistantProjectSyncSnapshot,
} from "./assistantSyncService.js";
import { createAssistantConversationStore } from "./assistantConversationStore.js";
import { createAssistantGenerationTaskStore } from "./assistantGenerationTaskStore.js";
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

test("assistantSyncService: exports only the active project and team without secrets", () => {
  const storage = createMemoryStorage();
  let tick = 0;
  const clock = () => `2026-06-05T00:00:0${tick++}.000Z`;
  const conversationStore = createAssistantConversationStore({ storage, clock });
  const generationTaskStore = createAssistantGenerationTaskStore({ storage, clock });
  const templateStore = createAssistantWorkflowTemplateStore({
    storage,
    projectId: "project-a",
    teamId: "team-alpha",
    clock,
  });

  const keptConversation = conversationStore.create({
    id: "ignored",
    title: "Project A story",
    projectId: "project-a",
  });
  conversationStore.appendMessage(keptConversation.id, {
    role: "user",
    content: "keep this project",
  });
  conversationStore.create({ title: "Project B story", projectId: "project-b" });
  generationTaskStore.queue({
    id: "gen-a",
    projectId: "project-a",
    conversationId: keptConversation.id,
    nodeId: "node-a",
    prompt: "safe prompt",
  });
  generationTaskStore.queue({
    id: "gen-b",
    projectId: "project-b",
    conversationId: "conv-b",
    nodeId: "node-b",
    prompt: "other project",
  });
  templateStore.save({
    templateId: "tpl-project-a",
    projectId: "project-a",
    nodes: [{ id: "n1", data: { prompt: "safe", apiKey: "must-not-leak" } }],
  });
  templateStore.save({
    templateId: "tpl-team-alpha",
    scope: "team",
    projectId: "project-a",
    teamId: "team-alpha",
    nodes: [{ id: "n2", data: { prompt: "team", localPath: "D:\\private\\asset.png" } }],
  });

  const snapshot = createAssistantProjectSyncSnapshot({
    projectId: "project-a",
    teamId: "team-alpha",
    conversationStore,
    generationTaskStore,
    templateStore,
    clock,
  });
  const serialized = JSON.stringify(snapshot);

  assert.equal(snapshot.schemaVersion, "canvas-agent-sync-v1");
  assert.equal(snapshot.projectId, "project-a");
  assert.deepEqual(snapshot.conversations.map((item) => item.projectId), ["project-a"]);
  assert.deepEqual(snapshot.generationTasks.map((item) => item.id), ["gen-a"]);
  assert.deepEqual(
    snapshot.workflowTemplates.map((item) => item.templateId).sort(),
    ["tpl-project-a", "tpl-team-alpha"]
  );
  assert.doesNotMatch(serialized, /project-b|gen-b|must-not-leak|apiKey|localPath|D:\\private/);
});

test("assistantSyncService: applies snapshots with project and team isolation", () => {
  const storage = createMemoryStorage();
  const conversationStore = createAssistantConversationStore({ storage });
  const generationTaskStore = createAssistantGenerationTaskStore({ storage });
  const templateStore = createAssistantWorkflowTemplateStore({
    storage,
    projectId: "project-a",
    teamId: "team-alpha",
  });

  const result = applyAssistantProjectSyncSnapshot({
    projectId: "project-a",
    teamId: "team-alpha",
    conversationStore,
    generationTaskStore,
    templateStore,
    snapshot: {
      schemaVersion: "canvas-agent-sync-v1",
      projectId: "project-a",
      teamId: "team-alpha",
      conversations: [
        { id: "conv-a", title: "Project A", projectId: "project-a", messages: [] },
        { id: "conv-b", title: "Project B", projectId: "project-b", messages: [] },
      ],
      generationTasks: [
        { id: "gen-a", projectId: "project-a", conversationId: "conv-a", nodeId: "node-a" },
        { id: "gen-b", projectId: "project-b", conversationId: "conv-b", nodeId: "node-b" },
      ],
      workflowTemplates: [
        { templateId: "tpl-a", projectId: "project-a", nodes: [{ id: "n1" }], edges: [] },
        { templateId: "tpl-team", scope: "team", projectId: "project-b", teamId: "team-alpha", nodes: [{ id: "n2" }], edges: [] },
        { templateId: "tpl-other-team", scope: "team", projectId: "project-a", teamId: "team-beta", nodes: [{ id: "n3" }], edges: [] },
      ],
    },
  });

  assert.deepEqual(result, {
    importedConversations: 1,
    importedGenerationTasks: 1,
    importedWorkflowTemplates: 2,
    skipped: 3,
  });
  assert.equal(conversationStore.get("conv-a").title, "Project A");
  assert.equal(conversationStore.get("conv-b"), null);
  assert.equal(generationTaskStore.get("gen-a").nodeId, "node-a");
  assert.equal(generationTaskStore.get("gen-b"), null);
  assert.equal(templateStore.get("tpl-a").templateId, "tpl-a");
  assert.equal(templateStore.get("tpl-team", { scope: "team" }).teamId, "team-alpha");
  assert.equal(templateStore.get("tpl-other-team", { scope: "team" }), null);
});

test("assistantSyncService: builds cross-device collaboration envelopes without secrets", () => {
  const snapshot = createAssistantProjectSyncSnapshot({
    projectId: "project-a",
    teamId: "team-alpha",
    deviceId: "desktop-a",
    conversations: [{ id: "conv-a", projectId: "project-a", title: "A", token: "must-not-leak" }],
    generationTasks: [{ id: "gen-a", projectId: "project-a", status: "queued" }],
    workflowTemplates: [{ templateId: "tpl-a", projectId: "project-a" }],
  });

  assert.equal(snapshot.schemaVersion, "canvas-agent-sync-v1");
  assert.equal(snapshot.deviceId, "desktop-a");
  assert.deepEqual(snapshot.collaboration, {
    mode: "snapshot",
    consistency: "last_writer_wins",
    permissionScope: "project_team",
  });
  assert.equal(JSON.stringify(snapshot).includes("must-not-leak"), false);
  assert.equal(JSON.stringify(snapshot).includes("token"), false);
});
