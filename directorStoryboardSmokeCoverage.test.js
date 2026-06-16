import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootPath = dirname(fileURLToPath(import.meta.url));

test("director/storyboard browser smoke records model, fusion removal, and character acceptance", () => {
  const source = readFileSync(
    join(rootPath, "tools/smoke/director-storyboard-product-smoke.mjs"),
    "utf8",
  );

  assert.match(source, /storyboardModelSelector/);
  assert.match(source, /sceneFusionRemoved/);
  assert.match(source, /directorCharacterPlacement/);
  assert.match(source, /storyboardModelSelector.pass/);
  assert.match(source, /sceneFusionRemoved.pass/);
  assert.match(source, /directorCharacterPlacement.pass/);
  assert.doesNotMatch(source, /sceneImageFusion/);
});
