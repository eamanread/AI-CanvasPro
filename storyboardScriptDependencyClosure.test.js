import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const rootPath = dirname(fileURLToPath(import.meta.url));
const requiredFiles = [
  "src/core/generationTaskRuntime.js",
  "src/core/generationTaskUiState.js",
  "manifests/index.js",
  "manifests/modelRegistry.js",
  "manifests/image",
  "manifests/video",
  "manifests/text",
  "manifests/audio",
  "manifests/executions",
  "manifests/shared",
  "manifests/subscription",
  "modules/modelInputPolicy.js",
  "modules/dreaminaVideoModelHelper.js",
  "modules/imageModelCapabilities.js",
  "modules/previewGenerateButtonUi.js",
  "modules/perf/perfProbe.js",
  "services/canvasMediaLocalService.js",
  "src/utils/localMediaPath.js",
  "src/utils/dom.js",
  "src/utils/debugRequestMasking.js",
  "modules/nodeMediaMetrics.js",
  "api/imageRatioPolicy.js",
  "api/storyboardVideoFrameApi.js",
  "components/aigenImage/defaults.js",
  "components/aigenImage/uiModuleModelHelpers.js",
  "components/aigenImage/uiSchemaRenderer.js",
  "components/aigenText/apimartTextModelMenu.js",
  "components/aigenText/nodeResizeUi.js",
  "components/shared/nodeFooterControls.js",
  "components/sharedPromptPanel.js"
];

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const resolved = normalize(join(dirname(join(rootPath, fromFile)), specifier));
  if (existsSync(resolved)) return resolved;
  if (existsSync(`${resolved}.js`)) return `${resolved}.js`;
  return resolved;
}

function collectImports(file) {
  const content = readFileSync(join(rootPath, file), "utf8");
  return [...content.matchAll(/(?:import\s*(?:[^"';]*?from\s*)?|export\s+(?:[^"';]*?from\s*))["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g)]
    .map((match) => match[1] || match[2]);
}

function toProjectPath(absolutePath) {
  return normalize(absolutePath).slice(normalize(rootPath).length + 1).replace(/\\/g, "/");
}

function collectMissingRelativeImports(entryFiles) {
  const queue = [...entryFiles];
  const seen = new Set();
  const missing = [];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of collectImports(file)) {
      const resolved = resolveImport(file, specifier);
      if (!resolved) continue;
      if (!existsSync(resolved)) {
        missing.push(`${file} -> ${specifier} -> ${resolved}`);
        continue;
      }
      if (resolved.endsWith(".js")) {
        queue.push(toProjectPath(resolved));
      }
    }
  }
  return missing;
}

test("storyboard upstream dependency files and full manifest tree exist", () => {
  for (const file of requiredFiles) {
    assert.equal(existsSync(join(rootPath, file)), true, `${file} should exist`);
  }
  assert.equal(statSync(join(rootPath, "manifests/image")).isDirectory(), true);
  assert.equal(statSync(join(rootPath, "manifests/video")).isDirectory(), true);
});

test("StoryboardScriptNode relative imports resolve locally", () => {
  const files = [
    "components/StoryboardScriptNode.js",
    "components/nodeToolbar/storyboardScriptAction.js",
    "services/canvasMediaLocalService.js",
    "components/sharedPromptPanel.js",
    "components/aigenImage/uiModuleModelHelpers.js",
    "components/aigenImage/uiSchemaRenderer.js",
    "components/aigenText/apimartTextModelMenu.js",
    "components/aigenText/nodeResizeUi.js",
    "modules/modelInputPolicy.js",
    "modules/previewGenerateButtonUi.js",
    "manifests/index.js",
    "manifests/modelRegistry.js"
  ];
  const missing = [];
  for (const file of files) {
    for (const specifier of collectImports(file)) {
      const resolved = resolveImport(file, specifier);
      if (resolved && !existsSync(resolved)) {
        missing.push(`${file} -> ${specifier} -> ${resolved}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test("storyboard upstream dependency closure resolves transitively", () => {
  assert.deepEqual(collectMissingRelativeImports([
    "components/StoryboardScriptNode.js",
    "components/nodeToolbar/storyboardScriptAction.js",
    "components/sharedPromptPanel.js"
  ]), []);
});

test("upstream model input policy has required Dreamina style-video exports", () => {
  const content = readFileSync(join(rootPath, "modules/dreaminaVideoModelHelper.js"), "utf8");
  assert.match(content, /export function isDreaminaStyleVideoModel/);
  assert.match(content, /export function normalizeDreaminaVideoRouteMode/);
});

test("upstream image UI helpers have required image capability exports", () => {
  const content = readFileSync(join(rootPath, "modules/imageModelCapabilities.js"), "utf8");
  assert.match(content, /export function isRunningHubGptImage2OfficialModel/);
  assert.match(content, /export function normalizeImageSizeForProviderModel/);
});

test("upstream image ratio policy exposes provider-model ratio picker", () => {
  const content = readFileSync(join(rootPath, "api/imageRatioPolicy.js"), "utf8");
  assert.match(content, /export function pickClosestRatioForProviderModel/);
  assert.match(content, /export function getAllowedRatiosForProviderModel/);
});

test("upstream image ratio policy imports without syntax errors", async () => {
  const moduleUrl = new URL(`./api/imageRatioPolicy.js?test=${Date.now()}`, import.meta.url);
  const ratioPolicy = await import(moduleUrl.href);
  assert.equal(typeof ratioPolicy.pickClosestRatioForProviderModel, "function");
  assert.equal(typeof ratioPolicy.getAllowedRatiosForProviderModel, "function");
});

test("upstream resize preview perf probe exposes resize FPS hooks", async () => {
  const content = readFileSync(join(rootPath, "modules/perf/perfProbe.js"), "utf8");
  assert.match(content, /export function beginResizeFpsSession/);
  assert.match(content, /export function endResizeFpsSession/);
  const moduleUrl = new URL(`./modules/perf/perfProbe.js?test=${Date.now()}`, import.meta.url);
  const perfProbe = await import(moduleUrl.href);
  assert.equal(typeof perfProbe.beginResizeFpsSession, "function");
  assert.equal(typeof perfProbe.endResizeFpsSession, "function");
});

test("upstream DOM utilities expose prompt sanitizers and media metric dependency", async () => {
  const domContent = readFileSync(join(rootPath, "src/utils/dom.js"), "utf8");
  assert.match(domContent, /export function sanitizePromptHtml/);
  assert.match(domContent, /export function sanitizeRichTextHtml/);
  const mediaMetricsContent = readFileSync(join(rootPath, "modules/nodeMediaMetrics.js"), "utf8");
  assert.match(mediaMetricsContent, /export function readNodeMediaMetricsDataset/);
  const moduleUrl = new URL(`./src/utils/dom.js?test=${Date.now()}`, import.meta.url);
  const domUtils = await import(moduleUrl.href);
  assert.equal(typeof domUtils.sanitizePromptHtml, "function");
  assert.equal(typeof domUtils.sanitizeRichTextHtml, "function");
});

test("upstream node spawn exposes batch layout helper for storyboard image batches", async () => {
  const content = readFileSync(join(rootPath, "modules/nodeSpawn.js"), "utf8");
  assert.match(content, /export function createBatchSpawnLayoutNearNode/);
  const moduleUrl = new URL(`./modules/nodeSpawn.js?test=${Date.now()}`, import.meta.url);
  const nodeSpawn = await import(moduleUrl.href);
  assert.equal(typeof nodeSpawn.createBatchSpawnLayoutNearNode, "function");
});

test("upstream node prompt shared exposes deferred prompt commit helpers", async () => {
  const content = readFileSync(join(rootPath, "modules/nodePromptShared.js"), "utf8");
  assert.match(content, /export function flushPromptHtmlCommit/);
  assert.match(content, /export function schedulePromptHtmlCommit/);
  const moduleUrl = new URL(`./modules/nodePromptShared.js?test=${Date.now()}`, import.meta.url);
  const nodePromptShared = await import(moduleUrl.href);
  assert.equal(typeof nodePromptShared.flushPromptHtmlCommit, "function");
  assert.equal(typeof nodePromptShared.schedulePromptHtmlCommit, "function");
});
