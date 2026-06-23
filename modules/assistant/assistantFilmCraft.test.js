import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeFilmCraftRoster,
  craftRef,
  synthesizeFilmCraftCommand,
  isDirectorCommand,
  appendCurrentCraft,
} from "./assistantFilmCraft.js";

test("normalizeFilmCraftRoster maps the skills API shape and drops nameless entries", () => {
  const roster = normalizeFilmCraftRoster({
    success: true,
    skills: [
      { name: "东亚文艺片", summary: "情绪驱动", coverUrl: "x.webp", uses: 5 },
      { name: "", summary: "nameless" },
      { name: "GTA6 风格", summary: "玩转人生", uses: 2 },
    ],
  });
  assert.deepEqual(roster, [
    { name: "东亚文艺片", summary: "情绪驱动", uses: 5 },
    { name: "GTA6 风格", summary: "玩转人生", uses: 2 },
  ]);
});

test("normalizeFilmCraftRoster tolerates a missing/empty response", () => {
  assert.deepEqual(normalizeFilmCraftRoster(undefined), []);
  assert.deepEqual(normalizeFilmCraftRoster({ skills: null }), []);
});

test("craftRef builds the 《名》 form the brain parses (and empty for no name)", () => {
  assert.equal(craftRef("东亚文艺片"), "《东亚文艺片》");
  assert.equal(craftRef("  "), "");
});

test("synthesizeFilmCraftCommand (立即开拍) carries the brief + the craft ref", () => {
  assert.equal(synthesizeFilmCraftCommand("雨夜追杀", "东亚文艺片"), "导演:雨夜追杀《东亚文艺片》");
  assert.equal(synthesizeFilmCraftCommand("", "东亚文艺片"), "导演:《东亚文艺片》");
  assert.equal(synthesizeFilmCraftCommand("  雨夜  ", "GTA6"), "导演:雨夜《GTA6》");
});

test("isDirectorCommand recognizes 导演/成片 prefixes (both colons)", () => {
  assert.equal(isDirectorCommand("导演:雨夜"), true);
  assert.equal(isDirectorCommand("成片：确认"), true);
  assert.equal(isDirectorCommand("今天天气不错"), false);
});

test("appendCurrentCraft (设为当前拍法) appends the ref only to director commands, never doubling", () => {
  // appended to a bare director command
  assert.equal(appendCurrentCraft("导演:雨夜追杀", "东亚文艺片"), "导演:雨夜追杀《东亚文艺片》");
  // a non-director message is untouched
  assert.equal(appendCurrentCraft("随便聊聊", "东亚文艺片"), "随便聊聊");
  // an explicit 《拍法 the user already typed wins — no double-inject
  assert.equal(appendCurrentCraft("导演:雨夜《别的》", "东亚文艺片"), "导演:雨夜《别的》");
  // trailing whitespace trimmed before append
  assert.equal(appendCurrentCraft("导演:雨夜  ", "东亚文艺片"), "导演:雨夜《东亚文艺片》");
  // no craft -> passthrough
  assert.equal(appendCurrentCraft("导演:雨夜", ""), "导演:雨夜");
});
