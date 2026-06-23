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
