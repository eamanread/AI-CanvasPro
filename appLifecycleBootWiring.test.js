import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("main wires project lifecycle boot through concrete upstream methods", () => {
  const mainJs = read("./main.js");
  assert.match(mainJs, /appProjectLifecycle\.bindLogoProjectSave\(\)/);
  assert.match(mainJs, /appProjectLifecycle\.bindHeaderProjectNameAutoSave\(\)/);
  assert.match(mainJs, /appProjectLifecycle\.bindPersistRevisionAutoSave\(\)/);
  assert.match(mainJs, /CanvasProjectDropdownManager\.init\(\)/);
  assert.match(mainJs, /SettingsManager\.init\(\)/);
  assert.match(mainJs, /MascotManager\.init\(\)/);
  assert.match(mainJs, /onBeforeUnload['"]?\s*:\s*appProjectLifecycle\.onBeforeUnload/);
  assert.match(mainJs, /onPageHide['"]?\s*:\s*appProjectLifecycle\.onPageHide/);
  assert.match(mainJs, /onVisibilityChange['"]?\s*:\s*appProjectLifecycle\.onVisibilityChange/);
  assert.match(mainJs, /onDocumentDragOver['"]?\s*:\s*appProjectLifecycle\.onDocumentDragOver/);
  assert.match(mainJs, /onDocumentDrop['"]?\s*:\s*appProjectLifecycle\.onDocumentDrop/);
  assert.match(mainJs, /onBoot['"]?\s*:\s*appProjectLifecycle\.initApp/);
});

test("main does not use stale obfuscated lifecycle property indexes", () => {
  const mainJs = read("./main.js");
  assert.doesNotMatch(mainJs, /appProjectLifecycle\[a123_0x269d14\(0xc3\)\]\(\)/);
  assert.doesNotMatch(mainJs, /CanvasProjectDropdownManager\[a123_0x269d14\(0xbb\)\]\(\)/);
  assert.doesNotMatch(mainJs, /SettingsManager\[a123_0x269d14\(0xbb\)\]\(\)/);
  assert.doesNotMatch(mainJs, /MascotManager\[a123_0x269d14\(0xbb\)\]\(\)/);
  assert.doesNotMatch(mainJs, /onBoot['"]?\s*:\s*appProjectLifecycle\[a123_0x269d14\(0x11b\)\]/);
});


test("index busts the main module URL for the upstream-first migration", () => {
  const indexHtml = read("./index.html");
  assert.match(indexHtml, /main\.js\?v=20260608/);
  assert.doesNotMatch(indexHtml, /main\.js\?v=2026060601/);
});
