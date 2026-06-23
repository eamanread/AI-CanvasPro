import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, "preset-manager.html");
const jsPath = path.join(__dirname, "preset-manager.js");

test("preset manager hides template content in the editor copy", () => {
  const html = fs.readFileSync(htmlPath, "utf8");
  assert.match(html, /提示词模板已隐藏|提示词内容已隐藏/);
});

test("preset manager no longer renders raw template text in list snippets", () => {
  const js = fs.readFileSync(jsPath, "utf8");
  assert.doesNotMatch(js, /snippet\.textContent\s*=\s*preset\.template\s*\|\|\s*""/);
  assert.doesNotMatch(js, /snippet\.textContent\s*=\s*item\.desc\s*\|\|\s*item\.template/);
});

test("preset manager no longer writes raw template text into the visible textarea", () => {
  const js = fs.readFileSync(jsPath, "utf8");
  assert.doesNotMatch(js, /target\.source\s*===\s*"system"[\s\S]{0,240}sourceValue\?\.template/);
  assert.match(js, /target\.source\s*===\s*"custom"[\s\S]{0,160}sourceValue\?\.template/);
});

test("preset manager allows a new system leaf template to be edited and saved once", () => {
  const js = fs.readFileSync(jsPath, "utf8");
  assert.match(js, /target\.source\s*===\s*"system"[\s\S]*target\.mode\s*===\s*"create"[\s\S]*target\.kind\s*!==\s*"group"/);
  assert.match(js, /presetTemplateInput\.readOnly\s*=\s*!\s*canEditTemplate/);
  assert.match(js, /target\.mode\s*===\s*"create"[\s\S]*draft\.template/);
});

test("preset manager renders import and export controls", () => {
  const html = fs.readFileSync(htmlPath, "utf8");
  const js = fs.readFileSync(jsPath, "utf8");

  assert.match(html, /id="import-file-input"/);
  assert.match(html, /id="import-button"/);
  assert.match(html, /id="export-button"/);
  assert.match(js, /handleImportPresets/);
  assert.match(js, /handleExportPresets/);
});

test("preset manager removes the custom TXT creation entry without keeping a placeholder", () => {
  const html = fs.readFileSync(htmlPath, "utf8");
  const js = fs.readFileSync(jsPath, "utf8");

  assert.doesNotMatch(html, /id="new-custom-button"/);
  assert.doesNotMatch(html, /新建 TXT 预设|鏂板缓 TXT 棰勮/);
  assert.doesNotMatch(js, /newCustomButton/);
  assert.doesNotMatch(js, /startNewCustomPreset/);

  const toolbarActions = html.match(/<div class="toolbar-actions">([\s\S]*?)<\/div>/);
  assert.ok(toolbarActions);
  const buttonIds = Array.from(toolbarActions[1].matchAll(/<button id="([^"]+)"/g)).map(
    (match) => match[1],
  );
  assert.deepEqual(buttonIds, [
    "import-button",
    "export-button",
    "refresh-button",
    "new-system-group-button",
    "new-system-button",
  ]);
});
