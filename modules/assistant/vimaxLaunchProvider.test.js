import test from "node:test";
import assert from "node:assert/strict";
import { createVimaxLaunchProvider } from "./vimaxLaunchProvider.js";
import { createLaunchProviderRegistry } from "./launchProviderRegistry.js";

// Phase D · D3 — ViMax = launch provider #1. ALL ViMax vocabulary lives here
// (AC8: the generic registry/contract layer must stay vimax-free).

const provider = createVimaxLaunchProvider();

test("D3 vimax: id is vimax", () => {
  assert.equal(provider.id, "vimax");
});

test("D3 vimax: match true for a prefix-less creative brief", () => {
  assert.equal(provider.match("雨夜便利店，陌生人递来一把伞，简短告别"), true);
});

test("D3 vimax: match false when a command prefix is present (prefix priority)", () => {
  assert.equal(provider.match("导演：雨夜便利店"), false);
  assert.equal(provider.match("导演:雨夜便利店"), false);
  assert.equal(provider.match("成片:雨夜"), false);
  assert.equal(provider.match("定妆:老林"), false);
});

test("D3 vimax: match false for resume/control words (aligned with real confirm grammar)", () => {
  assert.equal(provider.match("继续"), false);
  assert.equal(provider.match("取消"), false);
  assert.equal(provider.match("确认成片"), false);
  assert.equal(provider.match("确认定妆"), false);
});

test("D3 vimax: match false while paused (pendingVimaxNativeResume frozen)", () => {
  assert.equal(provider.match("雨夜便利店的故事", { paused: true }), false);
});

test("D3 vimax: match false for canvas-op messages", () => {
  assert.equal(provider.match("把这个节点往右移动", { isCanvasOp: true }), false);
});

test("D3 vimax: match false for trivially short input", () => {
  assert.equal(provider.match("好"), false);
  assert.equal(provider.match("  "), false);
});

test("D3 vimax: 4 chips with valid ids/costTiers", () => {
  assert.deepEqual(provider.chips.map((c) => c.id), ["director", "film", "portraits", "skills"]);
  for (const c of provider.chips) {
    assert.ok(["free", "confirm"].includes(c.costTier), `chip ${c.id} costTier ${c.costTier}`);
    assert.ok(c.label && c.aria, `chip ${c.id} needs label + aria`);
  }
});

test("D3 vimax: synthesizeCommand maps chip -> existing command 1:1 (R2)", () => {
  assert.equal(provider.synthesizeCommand("director", "雨夜便利店"), "导演:雨夜便利店");
  assert.equal(provider.synthesizeCommand("film", "雨夜便利店"), "成片:雨夜便利店");
  assert.equal(provider.synthesizeCommand("portraits", "ignored"), "定妆:");
});

test("D3 vimax: synthesizeCommand injects 《拍法》 refs", () => {
  assert.equal(
    provider.synthesizeCommand("director", "雨夜", { skillRefs: ["希区柯克变焦", "《伦勃朗光》"] }),
    "导演:雨夜《希区柯克变焦》《伦勃朗光》"
  );
});

test("D3 vimax: deriveContract director -> 3 nodes, free, story/cast/PAUSE/storyboard", () => {
  const c = provider.deriveContract("director", "雨夜便利店");
  assert.equal(c.mode, "director");
  assert.equal(c.nodeCount, 3);
  assert.equal(c.cost.tier, "free");
  assert.deepEqual(c.flow, ["story", "cast", "PAUSE", "storyboard"]);
});

test("D3 vimax: deriveContract film -> confirm + estimated drawCount", () => {
  const c = provider.deriveContract("film", "雨夜便利店");
  assert.equal(c.cost.tier, "confirm");
  assert.equal(c.cost.estimated, true);
});

test("D3 vimax: deriveContract portraits -> nodeCount = visible chars, drawCount x3", () => {
  const c = provider.deriveContract("portraits", "", { visibleCharacterCount: 2 });
  assert.equal(c.mode, "portraits");
  assert.equal(c.nodeCount, 2);
  assert.equal(c.cost.tier, "confirm");
  assert.equal(c.cost.drawCount, 6);
});

test("D3 vimax: resumeAffordance only on cast nodes", () => {
  assert.equal(provider.resumeAffordance({ data: { vimaxRole: "cast" } }), true);
  assert.equal(provider.resumeAffordance({ data: { vimaxRole: "story" } }), false);
  assert.equal(provider.resumeAffordance({ data: {} }), false);
});

test("D3 vimax: registers cleanly into the generic registry", () => {
  const reg = createLaunchProviderRegistry();
  assert.doesNotThrow(() => reg.register(createVimaxLaunchProvider()));
  assert.equal(reg.listMatching("雨夜便利店").length, 1);
});
