import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Phase D · D9 — AC8 gate as a DURABLE test (not just a one-time grep): the
// generic launch LOGIC layer must contain ZERO provider vocabulary. All ViMax
// words live in vimaxLaunchProvider.js; the registry/contract logic stays
// provider-agnostic so "add a new source = register a provider", never touch the
// generic layer. (launchStrings.js is the i18n table — user text, not logic —
// and is deliberately NOT gated here, matching the dev-doc §D9 grep targets.)
const FORBIDDEN = /vimax|导演|成片|定妆|换拍法/; // case-sensitive, matches the dev-doc grep
const GENERIC_LOGIC_LAYER = ["launchProviderRegistry.js"]; // + launchContract.js if/when added

test("D9 AC8: the generic launch logic layer has zero provider vocabulary", () => {
  for (const file of GENERIC_LOGIC_LAYER) {
    const src = readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8");
    const lines = src.split(/\r?\n/);
    const idx = lines.findIndex((line) => FORBIDDEN.test(line));
    assert.equal(
      idx,
      -1,
      `${file}:${idx + 1} contains provider vocabulary (AC8 violation): ${lines[idx]}`
    );
  }
});
