import test from "node:test";
import assert from "node:assert/strict";
import {
  CHARACTER_SHOT_ACTION_PREFIX,
  CHARACTER_SHOT_STRIP_HTML,
  CHARACTER_SHOT_TOGGLE_ACTION,
  CHARACTER_SHOT_TOGGLE_BUTTON_HTML,
  extractCharacterShotPresetKey,
} from "./components/panoramaScene/CharacterShotStrip.js";
import {
  CHARACTER_SHOT_PRESET_KEYS,
  CHARACTER_SHOT_PRESETS,
} from "./modules/panoramaSceneNode/characterShotPresets.js";

test("strip HTML carries one action button per preset with tooltip labels", () => {
  assert.match(CHARACTER_SHOT_STRIP_HTML, /class="node-floating-toolbar v2-character-shot-strip"/);
  for (const key of CHARACTER_SHOT_PRESET_KEYS) {
    assert.ok(
      CHARACTER_SHOT_STRIP_HTML.includes(`act-${CHARACTER_SHOT_ACTION_PREFIX}${key}`),
      `${key} action class present`,
    );
    assert.ok(
      CHARACTER_SHOT_STRIP_HTML.includes(`data-tooltip="${CHARACTER_SHOT_PRESETS[key].label}"`),
      `${key} tooltip present`,
    );
  }
  const buttonCount = (CHARACTER_SHOT_STRIP_HTML.match(/<button /g) || []).length;
  assert.equal(buttonCount, 8);
});

test("preset keys are CSS-class safe and round-trip through class extraction", () => {
  for (const key of CHARACTER_SHOT_PRESET_KEYS) {
    assert.match(key, /^[a-z0-9-]+$/, `${key} class-safe`);
    const className = `ftb-btn icon-only character-shot-btn act-${CHARACTER_SHOT_ACTION_PREFIX}${key}`;
    assert.equal(extractCharacterShotPresetKey(className), key);
  }
});

test("extraction fails closed on unrelated class names", () => {
  assert.equal(extractCharacterShotPresetKey("ftb-btn act-enter-edit"), "");
  assert.equal(extractCharacterShotPresetKey(""), "");
  assert.equal(extractCharacterShotPresetKey(null), "");
});

test("固定机位 toggle button carries tooltip and action class, and is not a preset", () => {
  assert.ok(CHARACTER_SHOT_TOGGLE_BUTTON_HTML.includes(`act-${CHARACTER_SHOT_TOGGLE_ACTION}`));
  assert.ok(CHARACTER_SHOT_TOGGLE_BUTTON_HTML.includes('data-tooltip="固定机位"'));
  assert.ok(CHARACTER_SHOT_TOGGLE_BUTTON_HTML.includes("character-shot-toggle-btn"));
  // toggle 按钮不能被误识别为机位预设（toggle 不在 preset key 表里）
  assert.equal(extractCharacterShotPresetKey(`ftb-btn act-${CHARACTER_SHOT_TOGGLE_ACTION}`), "toggle");
  assert.equal(CHARACTER_SHOT_PRESETS["toggle"], undefined);
});
