import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootPath = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(rootPath, path), "utf8");

test("director and storyboard product entries are visible and distinct", () => {
  const indexHtml = read("index.html");
  assert.match(indexHtml, /data-type=["']panorama-scene["']/);
  assert.match(indexHtml, /3D\u5bfc\u6f14\u53f0/);
  assert.match(indexHtml, /data-type=["']storyboard-script["']/);
  assert.match(indexHtml, /\u5206\u955c\u811a\u672c/);
  assert.doesNotMatch(indexHtml, /storyboard_director/);
});

test("upstream CSS files are loaded by index.html", () => {
  const indexHtml = read("index.html");
  assert.match(indexHtml, /panorama-scene-node\.css/);
  assert.match(indexHtml, /panorama-scene-toolbar\.css/);
  assert.match(indexHtml, /panorama-scene-popover\.css/);
  assert.match(indexHtml, /storyboard-script-node\.css/);
});

test("main registry keeps old storyboard and adds storyboard-script", () => {
  const mainJs = read("main.js");
  assert.match(mainJs, /StoryboardNode/);
  assert.match(mainJs, /StoryboardScriptNode/);
  assert.match(mainJs, /["']storyboard["']\s*:\s*StoryboardNode/);
  assert.match(mainJs, /["']storyboard-script["']\s*:\s*StoryboardScriptNode/);
  assert.match(mainJs, /["']panorama-scene["']\s*:\s*PanoramaSceneNode/);
});

test("node meta knows storyboard-script without touching assistant skill", () => {
  const nodeMeta = read("modules/nodeMeta.js");
  const assistantSkill = read("config/assistant-skills/storyboard_director.json");
  assert.match(nodeMeta, /["']storyboard-script["']/);
  assert.match(nodeMeta, /storyboard_script/);
  assert.doesNotMatch(nodeMeta, /storyboard_director/);
  assert.match(assistantSkill, /storyboard_director/);
});

test("expected upstream-backed files exist locally", () => {
  for (const path of [
    "src/core/storyboardScriptFactory.js",
    "src/core/storyboardScriptGeneration.js",
    "components/StoryboardScriptNode.js",
    "components/nodeToolbar/storyboardScriptAction.js",
    "components/nodeToolbar/storyboardScriptToolbarIcon.js",
    "styles/storyboard-script-node.css",
    "styles/panorama-scene-node.css",
    "styles/panorama-scene-toolbar.css",
    "styles/panorama-scene-popover.css"
  ]) {
    assert.equal(existsSync(join(rootPath, path)), true, `${path} should exist`);
  }
});
