import test from "node:test";
import assert from "node:assert/strict";
import {
  CANVAS_SKILL_IDS,
  canvasSkillIdsForV2Skill,
  createAssistantCanvasSkillRegistry,
  isAiNodeActionConvertible,
  shouldConfirmCanvasSkillBatch,
} from "./assistantCanvasSkillRegistry.js";

test("registry exposes first-phase canvas skills", () => {
  const ids = createAssistantCanvasSkillRegistry().list().map((item) => item.id);
  assert.ok(ids.includes(CANVAS_SKILL_IDS.imageGenerate));
  assert.ok(ids.includes(CANVAS_SKILL_IDS.textGenerate));
  assert.ok(ids.includes(CANVAS_SKILL_IDS.videoGenerate));
  assert.ok(ids.includes(CANVAS_SKILL_IDS.workflowApply));
  assert.ok(ids.includes(CANVAS_SKILL_IDS.assetAdd));
  assert.ok(ids.includes(CANVAS_SKILL_IDS.nodeBindReferences));
});

test("registry detects old AI node actions", () => {
  assert.equal(isAiNodeActionConvertible({ type: "create_node", nodeType: "ai-image" }), true);
  assert.equal(isAiNodeActionConvertible({ type: "update_node_data", nodeType: "ai-text" }), true);
  assert.equal(isAiNodeActionConvertible({ type: "queue_generation_task", nodeType: "ai-video" }), true);
  assert.equal(isAiNodeActionConvertible({ type: "create_node", nodeType: "comment" }), false);
});

test("registry confirmation policy matches plan and act rules", () => {
  assert.equal(shouldConfirmCanvasSkillBatch([{ skillId: CANVAS_SKILL_IDS.imageGenerate, nodeType: "ai-image" }], { agentMode: "plan" }), false);
  assert.equal(shouldConfirmCanvasSkillBatch([{ skillId: CANVAS_SKILL_IDS.videoGenerate, nodeType: "ai-video" }], { agentMode: "plan" }), true);
  assert.equal(shouldConfirmCanvasSkillBatch([
    { skillId: CANVAS_SKILL_IDS.imageGenerate, nodeType: "ai-image" },
    { skillId: CANVAS_SKILL_IDS.textGenerate, nodeType: "ai-text" },
  ], { agentMode: "plan" }), true);
  assert.equal(shouldConfirmCanvasSkillBatch([{ skillId: CANVAS_SKILL_IDS.videoGenerate, nodeType: "ai-video" }], { agentMode: "act" }), true);
});

test("legacy assistant registry exports v2 canvas skill adapter", () => {
  const ids = canvasSkillIdsForV2Skill(
    { id: "prompt_preset_generation", allowedActions: ["run_prompt_preset_generation"] },
    { actionType: "run_prompt_preset_generation", nodeType: "ai-image" }
  );

  assert.deepEqual(ids, [CANVAS_SKILL_IDS.imageApplyPreset]);
});
