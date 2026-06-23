import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const autoloadImportPath = path.join(__dirname, "..", "main.js");
const autoloadPath = path.join(__dirname, "panorama360DirectToolbarAction.js");

test("image toolbar intercepts panorama action before the legacy RunningHUB workflow", () => {
  const importJs = fs.readFileSync(autoloadImportPath, "utf8");
  const js = fs.readFileSync(autoloadPath, "utf8");

  assert.match(importJs, /panorama360DirectToolbarAction/);
  assert.match(js, /createPanorama360FromImageNode/);
  assert.match(js, /act-panorama-360/);
  assert.match(js, /stopImmediatePropagation/);
});
