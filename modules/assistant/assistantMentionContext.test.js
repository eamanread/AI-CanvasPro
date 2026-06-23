import assert from "node:assert/strict";
import test from "node:test";

import { buildAssistantMentionContext } from "./assistantMentionContext.js";

test("assistantMentionContext: builds safe mention items and redacts sensitive data", () => {
  const context = buildAssistantMentionContext([
    {
      id: "asset-1",
      type: "asset",
      label: "Little Girl",
      assetType: "角色",
      source: "asset_library",
      raw: {
        name: "Little Girl",
        apiKey: "secret",
        token: "token",
        localPath: "D:\\private\\girl.png",
        previewUrl: "blob:http://local/private",
        prompt: "use sk-live-secret and https://x.test/file?token=abc",
        nested: { filePath: "C:\\Users\\Admin\\asset.png", style: "warm" },
      },
    },
  ]);

  const serialized = JSON.stringify(context);
  assert.equal(context.mentions.items[0].id, "asset-1");
  assert.equal(context.mentions.items[0].assetType, "角色");
  assert.equal(context.mentions.items[0].data.name, "Little Girl");
  assert.equal(context.mentions.items[0].data.nested.style, "warm");
  assert.doesNotMatch(serialized, /apiKey|token|secret|D:\\|C:\\|blob:|sk-live-secret/);
  assert.match(serialized, /\[REDACTED_PATH\]|\[REDACTED_BLOB_URL\]|\[REDACTED\]/);
});

test("assistantMentionContext: returns an empty object when no valid bindings exist", () => {
  assert.deepEqual(buildAssistantMentionContext([null, {}, { id: "" }]), {});
});
