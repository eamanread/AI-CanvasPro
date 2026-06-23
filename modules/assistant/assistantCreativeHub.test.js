import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAssistantCreativeHubContext,
  recommendCreativeHubWorkflow,
} from "./assistantCreativeHub.js";

test("assistantCreativeHub: unifies project template preference asset history and model capability context", () => {
  const context = buildAssistantCreativeHubContext({
    projectId: "project-a",
    teamId: "team-alpha",
    templates: [
      { templateId: "tpl-story", projectId: "project-a", scope: "project", name: "Story", secret: "no" },
      { templateId: "tpl-other", projectId: "project-b", scope: "project", name: "Other" },
      { templateId: "tpl-team", scope: "team", teamId: "team-alpha", name: "Team Story" },
    ],
    preferences: {
      visualStyle: "warm cinematic",
      apiKey: "must-not-leak",
      localPath: "D:\\private\\brand.png",
    },
    assets: [
      { id: "asset-1", name: "Hero", projectId: "project-a", mime: "image/png", localPath: "D:\\secret.png" },
      { id: "asset-2", name: "Other", projectId: "project-b", mime: "image/png" },
    ],
    conversations: [
      { id: "conv-1", projectId: "project-a", title: "Rain story", summary: "Cyber chase" },
      { id: "conv-2", projectId: "project-b", title: "Skip" },
    ],
    modelCapabilities: [
      { id: "fast-agent", configured: true, capabilities: ["action_planning", "low_latency"], apiKey: "hidden" },
      { id: "image-gen", configured: true, capabilities: ["image_generation"] },
      { id: "off", configured: false, capabilities: ["text"] },
    ],
  });

  assert.equal(context.schemaVersion, "canvas-agent-creative-hub-v1");
  assert.deepEqual(context.templates.map((item) => item.templateId).sort(), ["tpl-story", "tpl-team"]);
  assert.deepEqual(context.assets.map((item) => item.id), ["asset-1"]);
  assert.deepEqual(context.history.map((item) => item.id), ["conv-1"]);
  assert.deepEqual(context.modelCapabilities.map((item) => item.id), ["fast-agent", "image-gen"]);
  assert.equal(JSON.stringify(context).includes("must-not-leak"), false);
  assert.equal(JSON.stringify(context).includes("D:\\private"), false);
  assert.equal(JSON.stringify(context).includes("apiKey"), false);
});

test("assistantCreativeHub: recommends a cross-project workflow without leaking unsafe fields", () => {
  const workflow = recommendCreativeHubWorkflow({
    intent: "story_to_video",
    projectId: "project-b",
    sourceProjectId: "project-a",
    context: buildAssistantCreativeHubContext({
      projectId: "project-b",
      teamId: "team-alpha",
      templates: [
        { templateId: "tpl-team-story", scope: "team", teamId: "team-alpha", name: "Team Story" },
      ],
      preferences: { visualStyle: "noir", aspectRatio: "16:9" },
      assets: [{ id: "asset-team", projectId: "project-b", usage: "style", signedUrl: "https://x.test/a.png?token=secret" }],
      conversations: [{ id: "conv-old", projectId: "project-b", title: "Reusable history" }],
      modelCapabilities: [{ id: "planner", configured: true, capabilities: ["action_planning", "high_quality"] }],
    }),
  });

  assert.equal(workflow.schemaVersion, "canvas-agent-creative-workflow-v1");
  assert.equal(workflow.intent, "story_to_video");
  assert.equal(workflow.projectId, "project-b");
  assert.equal(workflow.sourceProjectId, "project-a");
  assert.equal(workflow.steps[0].kind, "template");
  assert.equal(workflow.steps.some((step) => step.kind === "model"), true);
  assert.equal(JSON.stringify(workflow).includes("token=secret"), false);
  assert.equal(JSON.stringify(workflow).includes("signedUrl"), false);
});
