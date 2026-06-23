# 预设提示词导入导出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在外部 Web 预设管理器中增加全节点提示词预设的加密导出、加密包导入和明文 JSON 导入能力。

**Architecture:** 新增一个小型前端工具模块负责预设包序列化、轻量加密/解密、明文 JSON 解析和结构校验。`dev/preset-manager.js` 只负责按钮事件、文件读写、调用现有保存接口和刷新 UI，后端复用已有 `/api/v2/user/presets/definitions/save` 接口。导入采用“先完整解析校验，再一次性保存”的全量替换策略。

**Tech Stack:** Browser ES modules, Web Crypto API with deterministic fallback for tests, Node built-in test runner, existing `api/requester.js` and preset manager API.

---

## File Structure

- Create: `dev/preset-pack-codec.js`
  - Owns `.hy-presets` file format, encryption/decryption, plaintext JSON import parsing, and preset structure validation.
  - Exports `PRESET_PACK_EXTENSION`, `PRESET_PACK_MAGIC`, `encodePresetPack(definitions)`, `decodePresetImportText(text)`, and `normalizePresetDefinitionsForImport(value)`.
- Create: `dev/preset-pack-codec.test.js`
  - Tests encrypted export is not plaintext JSON, encrypted import restores definitions, plaintext JSON import works, wrapped plaintext JSON import works, invalid data fails.
- Modify: `dev/preset-manager.html`
  - Adds `导入文件`, hidden file input, and `导出文件` beside the existing toolbar actions.
- Modify: `dev/preset-manager.js`
  - Imports codec helpers.
  - Adds DOM references for import/export controls.
  - Adds `handleExportPresets()` and `handleImportPresets()`.
  - Wires buttons in `init()`.
- Modify: `dev/preset-manager.visibility.test.js`
  - Adds smoke assertions that import/export controls exist and manager JS wires handlers.

## Task 1: Add Preset Pack Codec Tests

**Files:**
- Create: `dev/preset-pack-codec.test.js`
- Create later: `dev/preset-pack-codec.js`

- [ ] **Step 1: Write failing tests for encrypted and plaintext imports**

Create `dev/preset-pack-codec.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  PRESET_PACK_MAGIC,
  decodePresetImportText,
  encodePresetPack,
  normalizePresetDefinitionsForImport,
} from "./preset-pack-codec.js";

const sampleDefinitions = {
  "ai-image": [
    {
      title: "人设参考",
      icon: "P",
      desc: "角色多视图",
      subItems: [
        {
          title: "人物三视图",
          icon: "P",
          desc: "三视图",
          template: "生成三视图：{用户输入}",
        },
      ],
    },
  ],
  "ai-text": [
    {
      title: "文本压缩",
      icon: "T",
      desc: "压缩长文本",
      template: "压缩：{用户输入}",
    },
  ],
  "ai-video": [],
  "ai-audio": [],
};

test("preset pack codec: encrypted export is not plaintext JSON and imports back", async () => {
  const encoded = await encodePresetPack(sampleDefinitions);

  assert.ok(encoded.startsWith(PRESET_PACK_MAGIC));
  assert.doesNotMatch(encoded, /生成三视图/);
  assert.doesNotMatch(encoded, /文本压缩/);

  const decoded = await decodePresetImportText(encoded);
  assert.deepEqual(decoded, sampleDefinitions);
});

test("preset pack codec: plaintext prompt-presets JSON imports", async () => {
  const decoded = await decodePresetImportText(JSON.stringify(sampleDefinitions));
  assert.deepEqual(decoded, sampleDefinitions);
});

test("preset pack codec: wrapped plaintext preset pack imports", async () => {
  const decoded = await decodePresetImportText(
    JSON.stringify({
      app: "huanying-preset-pack",
      version: 1,
      presets: sampleDefinitions,
    }),
  );
  assert.deepEqual(decoded, sampleDefinitions);
});

test("preset pack codec: missing node types become empty arrays", () => {
  const normalized = normalizePresetDefinitionsForImport({
    "ai-image": sampleDefinitions["ai-image"],
  });

  assert.deepEqual(normalized["ai-image"], sampleDefinitions["ai-image"]);
  assert.deepEqual(normalized["ai-text"], []);
  assert.deepEqual(normalized["ai-video"], []);
  assert.deepEqual(normalized["ai-audio"], []);
});

test("preset pack codec: invalid JSON and invalid structure fail", async () => {
  await assert.rejects(
    () => decodePresetImportText("not-json"),
    /文件格式无法识别|JSON/,
  );

  await assert.rejects(
    () => decodePresetImportText(JSON.stringify({ "ai-image": { bad: true } })),
    /必须是数组/,
  );

  await assert.rejects(
    () =>
      decodePresetImportText(
        JSON.stringify({
          "ai-image": [{ title: "无模板叶子" }],
        }),
      ),
    /template/,
  );
});
```

- [ ] **Step 2: Run the failing codec tests**

Run:

```powershell
npm.cmd test -- dev/preset-pack-codec.test.js
```

Expected: FAIL because `dev/preset-pack-codec.js` does not exist.

## Task 2: Implement Preset Pack Codec

**Files:**
- Create: `dev/preset-pack-codec.js`
- Test: `dev/preset-pack-codec.test.js`

- [ ] **Step 1: Implement the codec module**

Create `dev/preset-pack-codec.js`:

```js
export const PRESET_PACK_MAGIC = "HUANYING_PRESETS_V1:";
export const PRESET_PACK_EXTENSION = ".hy-presets";

const PACK_APP = "huanying-preset-pack";
const PACK_VERSION = 1;
const DEFAULT_NODE_TYPES = ["ai-image", "ai-text", "ai-video", "ai-audio"];
const SECRET = "huanying-local-preset-pack-v1";

function trimText(value) {
  return String(value ?? "").trim();
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cloneJsonValue(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function utf8Encode(value) {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(String(value ?? ""));
  }
  return Buffer.from(String(value ?? ""), "utf8");
}

function utf8Decode(bytes) {
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(bytes).toString("utf8");
}

function bytesToBase64(bytes) {
  if (typeof btoa === "function") {
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(value) {
  const text = trimText(value);
  if (typeof atob === "function") {
    const binary = atob(text);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  return Uint8Array.from(Buffer.from(text, "base64"));
}

function buildKeyBytes(length) {
  const seed = utf8Encode(SECRET);
  const key = new Uint8Array(length);
  for (let index = 0; index < key.length; index += 1) {
    key[index] = seed[index % seed.length] ^ ((index * 31 + 17) & 0xff);
  }
  return key;
}

function xorBytes(bytes) {
  const key = buildKeyBytes(bytes.length);
  return Uint8Array.from(bytes, (byte, index) => byte ^ key[index]);
}

function encodePayloadText(text) {
  return bytesToBase64(xorBytes(utf8Encode(text)));
}

function decodePayloadText(text) {
  return utf8Decode(xorBytes(base64ToBytes(text)));
}

function normalizePresetItem(value, path, { allowSubItems }) {
  if (!isPlainObject(value)) {
    throw new Error(`${path} 必须是对象`);
  }

  const title = trimText(value.title);
  if (!title) {
    throw new Error(`${path}.title 不能为空`);
  }

  const item = { title };
  const icon = String(value.icon || "");
  const desc = String(value.desc || "");
  if (icon.trim()) {
    item.icon = icon;
  }
  if (desc.trim()) {
    item.desc = desc;
  }

  if (allowSubItems && Object.prototype.hasOwnProperty.call(value, "subItems")) {
    if (!Array.isArray(value.subItems)) {
      throw new Error(`${path}.subItems 必须是数组`);
    }
    item.subItems = value.subItems.map((child, index) =>
      normalizePresetItem(child, `${path}.subItems[${index}]`, { allowSubItems: false }),
    );
    return item;
  }

  if (typeof value.template !== "string") {
    throw new Error(`${path}.template 必须是字符串`);
  }
  if (!value.template.trim()) {
    throw new Error(`${path}.template 不能为空`);
  }
  item.template = value.template;
  return item;
}

function unwrapPresetPayload(value) {
  if (isPlainObject(value?.presets)) {
    return value.presets;
  }
  return value;
}

export function normalizePresetDefinitionsForImport(value) {
  const source = unwrapPresetPayload(value);
  if (!isPlainObject(source)) {
    throw new Error("预设文件顶层必须是对象");
  }

  const normalized = {};
  Object.entries(source).forEach(([nodeType, items]) => {
    if (!Array.isArray(items)) {
      throw new Error(`${nodeType} 必须是数组`);
    }
    normalized[nodeType] = items.map((item, index) =>
      normalizePresetItem(item, `${nodeType}[${index}]`, { allowSubItems: true }),
    );
  });

  DEFAULT_NODE_TYPES.forEach((nodeType) => {
    normalized[nodeType] = normalized[nodeType] || [];
  });

  return normalized;
}

export async function encodePresetPack(definitions) {
  const presets = normalizePresetDefinitionsForImport(definitions);
  const payload = {
    app: PACK_APP,
    version: PACK_VERSION,
    createdAt: new Date().toISOString(),
    presets,
  };
  return `${PRESET_PACK_MAGIC}${encodePayloadText(JSON.stringify(payload))}`;
}

function parseJsonText(text, errorPrefix) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${errorPrefix}: ${error?.message || "JSON 解析失败"}`);
  }
}

export async function decodePresetImportText(text) {
  const raw = String(text ?? "").trim();
  if (!raw) {
    throw new Error("导入文件为空");
  }

  if (raw.startsWith(PRESET_PACK_MAGIC)) {
    const encodedPayload = raw.slice(PRESET_PACK_MAGIC.length);
    let payloadText = "";
    try {
      payloadText = decodePayloadText(encodedPayload);
    } catch (error) {
      throw new Error(`加密包损坏或解密失败: ${error?.message || "无法解密"}`);
    }
    const payload = parseJsonText(payloadText, "加密包 JSON 格式错误");
    if (payload?.app !== PACK_APP || Number(payload?.version) !== PACK_VERSION) {
      throw new Error("加密包版本不兼容");
    }
    return normalizePresetDefinitionsForImport(payload);
  }

  if (!raw.startsWith("{")) {
    throw new Error("文件格式无法识别，请导入 .hy-presets 或 prompt-presets.json");
  }

  return normalizePresetDefinitionsForImport(parseJsonText(raw, "JSON 格式错误"));
}

export function clonePresetDefinitions(definitions) {
  return normalizePresetDefinitionsForImport(cloneJsonValue(definitions));
}
```

- [ ] **Step 2: Run codec tests**

Run:

```powershell
npm.cmd test -- dev/preset-pack-codec.test.js
```

Expected: PASS.

## Task 3: Add Import/Export Controls to HTML

**Files:**
- Modify: `dev/preset-manager.html`
- Test: `dev/preset-manager.visibility.test.js`

- [ ] **Step 1: Add failing smoke test for controls**

Append this test to `dev/preset-manager.visibility.test.js`:

```js
test("preset manager renders import and export controls", () => {
  const html = fs.readFileSync(htmlPath, "utf8");
  const js = fs.readFileSync(jsPath, "utf8");

  assert.match(html, /id="import-file-input"/);
  assert.match(html, /id="import-button"/);
  assert.match(html, /id="export-button"/);
  assert.match(js, /handleImportPresets/);
  assert.match(js, /handleExportPresets/);
});
```

- [ ] **Step 2: Run the smoke test and verify failure**

Run:

```powershell
npm.cmd test -- dev/preset-manager.visibility.test.js
```

Expected: FAIL because the controls and handlers are not present.

- [ ] **Step 3: Insert the controls**

In `dev/preset-manager.html`, inside `<div class="toolbar-actions">`, before `refresh-button`, add:

```html
          <input
            id="import-file-input"
            type="file"
            accept=".hy-presets,.json,application/json,text/plain"
            hidden
          />
          <button id="import-button" class="ghost-button" type="button">导入文件</button>
          <button id="export-button" class="ghost-button" type="button">导出文件</button>
```

Keep the existing buttons after these two new buttons.

## Task 4: Wire Import/Export in Preset Manager

**Files:**
- Modify: `dev/preset-manager.js`
- Test: `dev/preset-manager.visibility.test.js`
- Test: `dev/preset-pack-codec.test.js`

- [ ] **Step 1: Add imports and element references**

At the top of `dev/preset-manager.js`, after the existing `../api/index.js` import, add:

```js
import {
  PRESET_PACK_EXTENSION,
  decodePresetImportText,
  encodePresetPack,
} from "./preset-pack-codec.js";
```

In the `elements` object, add these entries near the toolbar buttons:

```js
  importFileInput: document.getElementById("import-file-input"),
  importButton: document.getElementById("import-button"),
  exportButton: document.getElementById("export-button"),
```

- [ ] **Step 2: Add file helper functions**

Add these functions before `handleSave()`:

```js
function buildPresetExportFileName() {
  const date = new Date().toISOString().slice(0, 10);
  return `huanying-presets-${date}${PRESET_PACK_EXTENSION}`;
}

function downloadTextFile(fileName, content, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsText(file, "utf-8");
  });
}
```

- [ ] **Step 3: Add export handler**

Add this function before `handleSave()`:

```js
async function handleExportPresets() {
  elements.exportButton.disabled = true;
  updateStatusChip("导出中...");

  try {
    const latestDefinitions = normalizePresetCollection(
      await fetchPromptPresetDefinitionsFromServer(),
      { allowSubItems: true },
    );
    const encoded = await encodePresetPack(latestDefinitions);
    downloadTextFile(buildPresetExportFileName(), encoded);
    updateStatusChip("已同步");
    showMessage("全节点系统预设已导出为加密文件。");
  } catch (error) {
    updateStatusChip("导出失败", "error");
    showMessage(error?.message || "导出失败");
  } finally {
    elements.exportButton.disabled = false;
    updateEditorChrome();
  }
}
```

- [ ] **Step 4: Add import handler**

Add these functions before `handleSave()`:

```js
async function importPresetFile(file) {
  const text = await readFileAsText(file);
  const definitions = await decodePresetImportText(text);
  await savePromptPresetDefinitionsToServer(definitions);
  state.definitionsByType = normalizePresetCollection(definitions, { allowSubItems: true });
  await reloadPresets({ preserveCurrent: false });
  broadcastPresetChange();
}

async function handleImportPresets(event) {
  const file = event?.target?.files?.[0] || null;
  if (!file) {
    return;
  }

  elements.importButton.disabled = true;
  updateStatusChip("导入中...");

  try {
    await importPresetFile(file);
    updateStatusChip("已同步");
    showMessage("导入成功：全节点系统预设已替换。");
  } catch (error) {
    updateStatusChip("导入失败", "error");
    showMessage(error?.message || "导入失败");
  } finally {
    elements.importButton.disabled = false;
    if (elements.importFileInput) {
      elements.importFileInput.value = "";
    }
    updateEditorChrome();
  }
}
```

- [ ] **Step 5: Wire events in init**

Inside `init()`, before `elements.refreshButton.addEventListener(...)`, add:

```js
  elements.importButton.addEventListener("click", () => {
    elements.importFileInput.click();
  });
  elements.importFileInput.addEventListener("change", handleImportPresets);
  elements.exportButton.addEventListener("click", handleExportPresets);
```

- [ ] **Step 6: Run manager smoke tests**

Run:

```powershell
npm.cmd test -- dev/preset-manager.visibility.test.js dev/preset-pack-codec.test.js
```

Expected: PASS.

## Task 5: Manual Verification and Regression

**Files:**
- Verify only; no source edits unless tests reveal a defect.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
npm.cmd test -- dev/preset-pack-codec.test.js dev/preset-manager.visibility.test.js modules/promptPresets.test.js modules/slashMenu.test.js
```

Expected: PASS.

- [ ] **Step 2: Run all JavaScript tests if focused tests pass**

Run:

```powershell
npm.cmd test
```

Expected: PASS. If unrelated existing tests fail, record exact failing test names and error messages before making any changes.

- [ ] **Step 3: Manual browser check**

Start or use the existing local server, then open:

```text
http://127.0.0.1:8777/dev/preset-manager.html?nodeType=ai-image
```

Verify:

- `导入文件` and `导出文件` appear in the toolbar.
- Clicking `导出文件` downloads a `.hy-presets` file.
- Opening the downloaded file does not reveal raw prompt words.
- Importing that `.hy-presets` file succeeds and refreshes the list.
- Importing a valid plaintext `prompt-presets.json` succeeds and refreshes the list.
- Importing invalid text fails and leaves current presets unchanged.

## Self-Review

- Spec coverage: The plan covers full-node export, encrypted package import/export, plaintext JSON import, full replacement, validation before save, UI placement, and tests.
- Placeholder scan: No `TBD`, `TODO`, or unspecified edge handling remains.
- Type consistency: The plan consistently uses `definitions`, `presets`, `PRESET_PACK_MAGIC`, `PRESET_PACK_EXTENSION`, `encodePresetPack()`, and `decodePresetImportText()`.
