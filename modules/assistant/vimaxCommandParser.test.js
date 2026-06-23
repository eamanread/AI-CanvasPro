import assert from "node:assert/strict";
import test from "node:test";

import { extractSkillRefs, parseVimaxCommand } from "./vimaxCommandParser.js";

test("vimaxCommandParser: 导演: prefix -> plan mode", () => {
  const out = parseVimaxCommand("导演: 雨夜告别 3 镜");
  assert.equal(out.mode, "plan");
  assert.equal(out.body, "雨夜告别 3 镜");
  assert.equal(out.wantsFilm, false);
});

test("vimaxCommandParser: 成片: -> plan in P1 but flags wantsFilm", () => {
  const out = parseVimaxCommand("成片：推这支登山杖，60秒");
  assert.equal(out.mode, "plan");
  assert.equal(out.wantsFilm, true, "成片 keeps the go-to-film intent for P2");
});

test("vimaxCommandParser: 定妆: -> portraits mode", () => {
  const out = parseVimaxCommand("定妆: 男主，硬汉登山向导");
  assert.equal(out.mode, "portraits");
});

test("vimaxCommandParser: 定妆 with empty body -> portraits (定妆 all visible); plan modes still need a body", () => {
  const cast = parseVimaxCommand("定妆:");
  assert.equal(cast?.mode, "portraits");
  assert.equal(cast.body, "");
  // plan prefixes still reject an empty body
  assert.equal(parseVimaxCommand("成片:"), null);
});

test("vimaxCommandParser: english aliases director:/film:/cast: are NOT prefixes (B0-M1, no normal-message hijack)", () => {
  // Dropped to stop plausible normal English ("film: my favorite movie",
  // "cast: ...") being pulled into the billable director lane.
  assert.equal(parseVimaxCommand("director: x"), null);
  assert.equal(parseVimaxCommand("film: x"), null);
  assert.equal(parseVimaxCommand("cast: x"), null);
  assert.equal(parseVimaxCommand("film: my favorite movie is Inception"), null);
});

test("vimaxCommandParser: extracts 《拍法》 picks (deduped, capped)", () => {
  const out = parseVimaxCommand("成片: 用《商品宣传短片》和《电影布光大师》的拍法推产品");
  assert.deepEqual(out.skillRefs, ["商品宣传短片", "电影布光大师"]);
});

test("vimaxCommandParser: 《》 dedup", () => {
  assert.deepEqual(extractSkillRefs("《A》《A》《B》"), ["A", "B"]);
});

test("vimaxCommandParser: full-width and half-width colon both work", () => {
  assert.ok(parseVimaxCommand("导演：x"));
  assert.ok(parseVimaxCommand("导演:x"));
});

test("vimaxCommandParser: non-prefixed message falls through (null)", () => {
  assert.equal(parseVimaxCommand("画一只猫"), null);
  assert.equal(parseVimaxCommand("导演:"), null, "empty body -> null");
  assert.equal(parseVimaxCommand(""), null);
});
