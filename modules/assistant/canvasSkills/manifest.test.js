import assert from "node:assert/strict";
import test from "node:test";
import {
  CANVAS_SKILLS_MANIFEST,
  CANVAS_SKILL_IDS,
} from "./manifest.js";
import * as registry from "./registry.js";
import * as canvasSkills from "./index.js";
import { createAssistantCanvasSkillRegistry } from "../assistantCanvasSkillRegistry.js";

test("canvasSkills manifest: exposes schema version and stable skill ids", () => {
  assert.equal(CANVAS_SKILLS_MANIFEST.schemaVersion, "canvas-skills-manifest-v1");
  assert.equal(CANVAS_SKILLS_MANIFEST.moduleId, "huanying.canvasSkills");
  assert.equal(CANVAS_SKILL_IDS.imageCreateDraft, "imageNode.createDraft");
  assert.equal(CANVAS_SKILL_IDS.videoGenerate, "videoNode.generate");
  assert.ok(registry.createCanvasSkillRegistry().get("asset.add"));
});



test("canvasSkills index: exposes the public module surface", () => {
  assert.equal(canvasSkills.CANVAS_SKILLS_MANIFEST.moduleId, "huanying.canvasSkills");
  assert.equal(canvasSkills.CANVAS_SKILL_IDS.imageGenerate, "imageNode.generate");
  assert.equal(typeof canvasSkills.createCanvasSkillRegistry, "function");
  assert.equal(typeof canvasSkills.findCanvasSkill, "function");
  assert.equal(typeof canvasSkills.canvasSkillIdsForV2Skill, "function");
  assert.equal(typeof canvasSkills.canvasSkillCallsForV2Skill, "function");
  assert.equal(typeof canvasSkills.loadCanvasSkillsRuntime, "function");
  assert.equal(typeof canvasSkills.createCanvasSkillsRuntime, "function");
  assert.equal(typeof canvasSkills.createCanvasSkillsSmokeRuntime, "function");
  assert.equal(typeof canvasSkills.normalizeBrowserSmokeResult, "function");
});

test("canvasSkills registry: legacy registry delegates to canvasSkills registry", () => {
  const legacy = createAssistantCanvasSkillRegistry().list().map((skill) => skill.id).sort();
  const modern = registry.createCanvasSkillRegistry().list().map((skill) => skill.id).sort();

  assert.deepEqual(legacy, modern);
});

test("canvasSkills registry: maps v2 preset and generation skills to stable canvas skill ids", () => {
  assert.equal(typeof registry.canvasSkillIdsForV2Skill, "function");
  assert.equal(typeof registry.canvasSkillCallsForV2Skill, "function");

  const presetSkill = {
    id: "prompt_preset_generation",
    allowedActions: ["run_prompt_preset_generation"],
    requiresConfirmation: false,
  };

  assert.deepEqual(
    registry.canvasSkillIdsForV2Skill(presetSkill, {
      actionType: "run_prompt_preset_generation",
      nodeType: "ai-image",
    }),
    [CANVAS_SKILL_IDS.imageApplyPreset]
  );
  assert.deepEqual(
    registry.canvasSkillIdsForV2Skill(presetSkill, {
      action: { type: "run_prompt_preset_generation", nodeType: "ai-text" },
    }),
    [CANVAS_SKILL_IDS.textApplyPreset]
  );

  const videoPresetCalls = registry.canvasSkillCallsForV2Skill(presetSkill, {
    actionType: "run_prompt_preset_generation",
    nodeType: "ai-video",
  });
  assert.deepEqual(videoPresetCalls.map((call) => call.skillId), [CANVAS_SKILL_IDS.videoApplyPreset]);
  assert.equal(videoPresetCalls[0].requiresConfirmation, true);

  const generateCalls = registry.canvasSkillCallsForV2Skill(
    { id: "node_generate", allowedActions: ["queue_generation_task"] },
    { actionType: "queue_generation_task", nodeType: "ai-video" }
  );
  assert.deepEqual(generateCalls.map((call) => call.skillId), [CANVAS_SKILL_IDS.videoGenerate]);
  assert.equal(generateCalls[0].requiresConfirmation, true);

  assert.deepEqual(
    registry.canvasSkillIdsForV2Skill(presetSkill, {
      actionType: "queue_generation_task",
      nodeType: "ai-image",
    }),
    []
  );
});

test("canvasSkills registry: maps v2 asset usage to existing asset and reference skills", () => {
  const assetIds = registry.canvasSkillIdsForV2Skill(
    { id: "asset_usage", allowedActions: ["update_node_data"] },
    { actionType: "update_node_data", nodeType: "ai-image" }
  );

  assert.deepEqual(assetIds, [CANVAS_SKILL_IDS.assetUse, CANVAS_SKILL_IDS.nodeBindReferences]);
});
