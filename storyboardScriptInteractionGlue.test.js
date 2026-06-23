import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createStoryboardScriptNodeData } from "./src/core/storyboardScriptFactory.js";
import { getNodeDefaultSize } from "./services/fileService.js";
import { getAllowedInputNodeTypesForSidePlus, isValidConnection } from "./modules/interaction/EdgeController.js";

const rootPath = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(rootPath, path), "utf8");

test("canvas creation glue uses upstream storyboard-script factory and size", () => {
  const interaction = read("src/core/interaction.js");
  assert.match(interaction, /createStoryboardScriptNodeData/);
  assert.match(interaction, /STORYBOARD_SCRIPT_DEFAULT_SIZE/);
  assert.match(interaction, /['"]storyboard-script['"]/);
  assert.match(interaction, /\u5206\u955c\u811a\u672c|分镜脚本/);
});

test("left menu creation uses upstream storyboard-script default size", () => {
  assert.deepEqual(getNodeDefaultSize("storyboard-script"), { width: 1024, height: 576 });
});

test("edge controller exposes upstream storyboard-script side-plus inputs", () => {
  assert.deepEqual(getAllowedInputNodeTypesForSidePlus("storyboard-script"), [
    "source-text",
    "source-image",
    "source-video",
    "ai-image",
    "ai-text",
    "ai-video"
  ]);
});

test("edge validation accepts source video and source text into storyboard-script", () => {
  const target = createStoryboardScriptNodeData({ id: "story-1" });
  assert.equal(isValidConnection({ id: "video-1", type: "source-video", src: "/video.mp4" }, target), true);
  assert.equal(isValidConnection({ id: "text-1", type: "source-text", text: "story" }, target), true);
  assert.equal(isValidConnection({ id: "story-2", type: "storyboard-script" }, target), false);
});

test("video toolbar includes and binds upstream storyboard action", () => {
  const html = read("components/nodeToolbar/videoToolbarHtml.js");
  const logic = read("components/nodeToolbar/videoToolbar.js");
  assert.match(html, /STORYBOARD_SCRIPT_TOOLBAR_ICON_SVG/);
  assert.match(html, /['"]storyboard-script['"]/);
  assert.match(logic, /bindStoryboardScriptToolbarAction/);
  assert.match(logic, /toolbarEl/);
  assert.match(logic, /nodeData/);
});
