import assert from "node:assert/strict";
import test from "node:test";

import {
  AssistantAttachmentUsage,
  createAssistantAttachmentStore,
} from "./assistantAttachmentStore.js";

test("assistantAttachmentStore: adds image attachments and exports safe context", () => {
  const store = createAssistantAttachmentStore({
    clock: () => "2026-06-03T00:00:00.000Z",
    idFactory: () => "att_1",
  });

  const attachment = store.add({
    name: "参考图.png",
    mime: "image/png",
    size: 123,
    width: 512,
    height: 512,
    assetId: "asset-1",
    previewUrl: "/api/media/asset-1",
    usage: "style_reference",
  });

  assert.equal(attachment.kind, "image");
  assert.deepEqual(store.toContext(), [
    {
      id: "att_1",
      kind: "image",
      name: "参考图.png",
      mime: "image/png",
      size: 123,
      width: 512,
      height: 512,
      dimensions: {
        width: 512,
        height: 512,
      },
      assetId: "asset-1",
      previewUrl: "/api/media/asset-1",
      usage: "style_reference",
      thumbnailHint: "",
    },
  ]);
});

test("assistantAttachmentStore: strips local Windows paths from previewUrl", () => {
  const store = createAssistantAttachmentStore({ idFactory: () => "att_local" });
  const attachment = store.add({
    name: "secret.png",
    mime: "image/png",
    previewUrl: "D:\\Aic\\secret.png",
  });

  assert.equal(attachment.previewUrl, "");
  assert.equal(store.toContext()[0].previewUrl, "");
});

test("assistantAttachmentStore: keeps blob previews in UI state but removes them from agent context", () => {
  const store = createAssistantAttachmentStore({ idFactory: () => "att_blob" });
  const attachment = store.add({
    name: "local-preview.png",
    mime: "image/png",
    previewUrl: "blob:http://127.0.0.1/local-preview",
  });

  assert.match(attachment.previewUrl, /^blob:/);
  assert.equal(store.toContext()[0].previewUrl, "");
});

test("assistantAttachmentStore: uploads through injected uploader and resolves mentions", async () => {
  const store = createAssistantAttachmentStore({
    idFactory: () => "att_upload",
    async uploader(file, options) {
      return {
        assetId: `asset-${file.name}`,
        previewUrl: "/api/media/uploaded",
        width: 800,
        height: 600,
        usage: options.usage,
      };
    },
  });

  await store.upload(
    { name: "product.png", type: "image/png", size: 88 },
    { usage: "product_reference" }
  );

  assert.equal(store.resolveMention("@product.png").assetId, "asset-product.png");
  assert.equal(store.resolveMention("@att_upload").usage, "product_reference");
});

test("assistantAttachmentStore: normalizes usage enum and context thumbnail fields", () => {
  const store = createAssistantAttachmentStore({ idFactory: () => "att_usage" });

  store.add({
    name: "style.png",
    mime: "image/png",
    usage: AssistantAttachmentUsage.Style,
    assetId: "asset-style",
    width: 640,
    height: 360,
    thumbnailHint: "muted color palette",
    localPath: "D:\\secret\\style.png",
    file: { name: "style.png" },
  });
  const context = store.toContext()[0];
  const serialized = JSON.stringify(context);

  assert.equal(AssistantAttachmentUsage.FirstFrame, "firstFrame");
  assert.equal(context.usage, "style");
  assert.equal(context.assetId, "asset-style");
  assert.deepEqual(context.dimensions, { width: 640, height: 360 });
  assert.equal(context.thumbnailHint, "muted color palette");
  assert.doesNotMatch(serialized, /localPath|file|D:\\secret/);
});
