import test from "node:test";
import assert from "node:assert/strict";

import { validateNodeParameters } from "./schemaValidator.js";

function fakeModelRegistry(models = {}) {
  return {
    getModelsByNodeType(nodeType) {
      if (nodeType === "ai-image" || nodeType === "image") return models.image || [];
      if (nodeType === "ai-text" || nodeType === "text") return models.text || [];
      if (nodeType === "ai-video" || nodeType === "video") return models.video || [];
      return [];
    },
    listModels() {
      return [models.image || [], models.text || [], models.video || []].flat();
    },
  };
}

test("schemaValidator: supported image fields become patch", () => {
  const result = validateNodeParameters({
    nodeType: "ai-image",
    action: { prompt: "cat", modelId: "img-1", aspectRatio: "16:9", batchSize: 4 },
    modelRegistry: fakeModelRegistry({ image: [{ id: "img-1", configured: true }] }),
  });

  assert.deepEqual(result.patch, { prompt: "cat", modelId: "img-1", aspectRatio: "16:9", batchSize: 4 });
  assert.deepEqual(result.rejectedFields, []);
});

test("schemaValidator: supported text and video fields become patch", () => {
  const textResult = validateNodeParameters({
    nodeType: "ai-text",
    action: { prompt: "写分镜", modelId: "text-1", presetName: "分镜" },
    modelRegistry: fakeModelRegistry({ text: [{ id: "text-1", configured: true }] }),
  });
  assert.equal(textResult.patch.modelId, "text-1");
  assert.equal(textResult.patch.presetName, "分镜");

  const videoResult = validateNodeParameters({
    nodeType: "ai-video",
    action: { prompt: "镜头推进", modelId: "video-1", duration: 5, fps: 24, resolution: "1080p" },
    modelRegistry: fakeModelRegistry({ video: [{ id: "video-1", configured: true }] }),
  });
  assert.equal(videoResult.patch.duration, 5);
  assert.equal(videoResult.patch.fps, 24);
});

test("schemaValidator: planned fields warn only and never enter patch", () => {
  const result = validateNodeParameters({
    nodeType: "ai-image",
    action: { prompt: "cat", seed: 123, negativePrompt: "rain" },
    modelRegistry: fakeModelRegistry(),
  });

  assert.equal(result.patch.seed, undefined);
  assert.equal(result.patch.negativePrompt, undefined);
  assert.match(result.warnings.join("\n"), /seed.*planned|negativePrompt.*planned/);
});

test("schemaValidator: secret fields do not leak in JSON stringify", () => {
  const result = validateNodeParameters({
    nodeType: "ai-image",
    action: { apiKey: "sk-secret-1234567890", headers: { Authorization: "Bearer hidden" } },
    modelRegistry: fakeModelRegistry(),
  });

  assert.doesNotMatch(JSON.stringify(result), /sk-secret|Bearer hidden/);
  assert.deepEqual(result.acceptedFields, []);
});

test("schemaValidator: unknown fields are rejected with warnings", () => {
  const result = validateNodeParameters({
    nodeType: "ai-text",
    action: { prompt: "write", inventedFlag: true },
    modelRegistry: fakeModelRegistry(),
  });

  assert.equal(result.patch.inventedFlag, undefined);
  assert.deepEqual(result.rejectedFields, ["inventedFlag"]);
});

test("schemaValidator: model aliases resolve only to configured same-node model", () => {
  const result = validateNodeParameters({
    nodeType: "ai-image",
    action: { modelName: "Text Model A" },
    modelRegistry: fakeModelRegistry({
      text: [{ id: "text-1", displayName: "Text Model A", configured: true }],
      image: [{ id: "img-1", displayName: "Image Model A", configured: true }],
    }),
  });

  assert.equal(result.patch.modelId, undefined);
  assert.match(result.warnings.join("\n"), /model.*not usable.*ai-image|model.*node type/i);
});

test("schemaValidator: action envelope fields (placement/name/title) are silently skipped, not warned", () => {
  const result = validateNodeParameters({
    nodeType: "ai-image",
    action: {
      prompt: "cat",
      name: "Probe",
      title: "Probe",
      placement: { strategy: "right-of", anchor: "text_gen_1" },
    },
    modelRegistry: fakeModelRegistry({ image: [{ id: "img-1", configured: true }] }),
  });

  assert.deepEqual(result.patch, { prompt: "cat" });
  assert.deepEqual(result.rejectedFields, []);
  assert.deepEqual(result.warnings, []);
});

test("schemaValidator: director lineage fields require the trusted execution source", () => {
  const lineageAction = {
    prompt: "rainy night",
    negativePrompt: "no warm light",
    qmaiPromptId: "prompt-shot-001-image",
    qmaiShotId: "shot-001",
    dramaticBeat: "establish",
    shotContinuity: "dark wet coat",
    continuityAnchors: ["dark wet coat"],
  };

  const trusted = validateNodeParameters({
    nodeType: "ai-image",
    action: lineageAction,
    source: "qmai-director",
  });
  assert.equal(trusted.patch.qmaiPromptId, "prompt-shot-001-image");
  assert.equal(trusted.patch.qmaiShotId, "shot-001");
  assert.equal(trusted.patch.dramaticBeat, "establish");
  assert.equal(trusted.patch.shotContinuity, "dark wet coat");
  assert.deepEqual(trusted.patch.continuityAnchors, ["dark wet coat"]);
  assert.equal(trusted.patch.negativePrompt, "no warm light");
  assert.deepEqual(trusted.rejectedFields, []);

  const untrusted = validateNodeParameters({ nodeType: "ai-image", action: lineageAction });
  assert.equal(untrusted.patch.qmaiPromptId, undefined);
  assert.equal(untrusted.patch.negativePrompt, undefined);
  assert.equal(untrusted.rejectedFields.includes("qmaiPromptId"), true);
  assert.equal(untrusted.rejectedFields.includes("negativePrompt"), true);
});

test("schemaValidator: forged action metadata.source never grants trust", () => {
  // The claw sanitizer whitelists metadata.source, so an LLM-authored
  // action can carry it - trust must come from the execution option
  // only (claw_action_schema.py:600 is the reason this test exists).
  const forged = validateNodeParameters({
    nodeType: "ai-image",
    action: {
      prompt: "rainy night",
      qmaiPromptId: "prompt-forged",
      metadata: { source: "qmai_director_brain" },
      source: "qmai-director",
    },
  });
  assert.equal(forged.patch.qmaiPromptId, undefined);
  assert.equal(forged.rejectedFields.includes("qmaiPromptId"), true);
});

test("schemaValidator: envelope fields (autoStart/metadata/riskLevel/requiresConfirmation) are silently skipped", () => {
  const result = validateNodeParameters({
    nodeType: "ai-image",
    action: {
      prompt: "cat",
      autoStart: false,
      metadata: { source: "qmai_director_brain" },
      riskLevel: "low",
      requiresConfirmation: false,
      data: { autoStart: false },
    },
  });
  assert.deepEqual(result.patch, { prompt: "cat" });
  assert.deepEqual(result.rejectedFields, []);
  assert.deepEqual(result.warnings, []);
});
