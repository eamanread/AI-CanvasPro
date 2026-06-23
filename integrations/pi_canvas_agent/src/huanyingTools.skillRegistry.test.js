import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCanvasAgentSystemPrompt,
  loadHuanyingSkillDefinitions
} from "./huanyingTools.js";

test("buildCanvasAgentSystemPrompt can inject Unified Skill Registry v2 definitions", () => {
  const skills = loadHuanyingSkillDefinitions("config/assistant-skills-v2");
  const prompt = buildCanvasAgentSystemPrompt("actions", { skills });

  assert.ok(skills.some((skill) => skill.id === "prompt_preset_generation"));
  assert.match(prompt, /Unified Skill Registry v2/);
  assert.match(prompt, /prompt_preset_generation/);
  assert.match(prompt, /run_prompt_preset_generation/);
  assert.match(prompt, /hidden template/i);
  assert.match(prompt, /allowedActions/);
});

test("huanyingTools: loaded skill definitions keep triggers for local matching", () => {
  const skills = loadHuanyingSkillDefinitions();
  const storyboard = skills.find((skill) => skill.id === "storyboard_workflow");
  assert.ok(storyboard, "storyboard_workflow skill should load");
  assert.ok(Array.isArray(storyboard.triggers) && storyboard.triggers.length > 0, JSON.stringify(storyboard));
});

test("buildCanvasAgentSystemPrompt: actions mode teaches the spatial placement vocabulary", () => {
  const prompt = buildCanvasAgentSystemPrompt("actions");

  assert.match(prompt, /placement field/);
  assert.match(prompt, /in-zone/);
  assert.match(prompt, /new-lane/);
  assert.match(prompt, /NEVER output pixel coordinates/);
  assert.match(prompt, /spatialDigest/);
  assert.match(prompt, /Allowed actions:.*tidy_canvas/);
});

