import assert from "node:assert/strict";
import test from "node:test";

import {
  createAssistantExperimentAnalytics,
  summarizeAssistantExperimentMetrics,
} from "./assistantExperimentAnalytics.js";

test("assistantExperimentAnalytics: records template generation and adoption events", () => {
  const analytics = createAssistantExperimentAnalytics({
    clock: (() => {
      let index = 0;
      return () => `2026-06-05T00:00:0${++index}Z`;
    })(),
  });

  analytics.recordEvent({
    type: "template_applied",
    projectId: "project-a",
    templateId: "tpl-story",
    variantId: "A",
    userId: "designer-a",
    apiKey: "must-not-leak",
  });
  analytics.recordEvent({
    type: "generation_completed",
    projectId: "project-a",
    templateId: "tpl-story",
    variantId: "A",
    success: true,
  });
  analytics.recordEvent({
    type: "user_adopted",
    projectId: "project-a",
    templateId: "tpl-story",
    variantId: "A",
    accepted: true,
  });
  analytics.recordEvent({
    type: "generation_failed",
    projectId: "project-a",
    templateId: "tpl-story",
    variantId: "B",
    success: false,
    error: "provider timeout",
  });

  const summary = summarizeAssistantExperimentMetrics(analytics.listEvents());
  const template = summary.templates.find((item) => item.templateId === "tpl-story");

  assert.equal(summary.schemaVersion, "canvas-agent-experiment-metrics-v1");
  assert.equal(template.appliedCount, 1);
  assert.equal(template.generationSuccessRate, 0.5);
  assert.equal(template.userAdoptionRate, 1);
  assert.deepEqual(
    template.variants.map((variant) => `${variant.variantId}:${variant.generationSuccessRate}`).sort(),
    ["A:1", "B:0"]
  );
  assert.equal(JSON.stringify(summary).includes("must-not-leak"), false);
});

test("assistantExperimentAnalytics: filters metrics by project and team", () => {
  const analytics = createAssistantExperimentAnalytics();
  analytics.recordEvent({ type: "template_applied", projectId: "project-a", teamId: "team-alpha", templateId: "tpl-a" });
  analytics.recordEvent({ type: "template_applied", projectId: "project-b", teamId: "team-alpha", templateId: "tpl-b" });
  analytics.recordEvent({ type: "template_applied", projectId: "project-a", teamId: "team-beta", templateId: "tpl-c" });

  const summary = analytics.summary({ projectId: "project-a", teamId: "team-alpha" });

  assert.deepEqual(summary.templates.map((item) => item.templateId), ["tpl-a"]);
  assert.equal(summary.counts.totalEvents, 1);
});
