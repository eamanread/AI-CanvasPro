import test from "node:test";
import assert from "node:assert/strict";

import { importLocalAssets } from "./assetImportService.js";

function fakeFile(name, type, content = "x") {
  return { name, type, size: content.length, content, arrayBuffer: async () => new TextEncoder().encode(content).buffer };
}

test("assetImportService: rejects path-only local import without user-selected File", async () => {
  const result = await importLocalAssets({ files: ["D:\\secret\\cat.png"] });
  assert.equal(result.imported.length, 0);
  assert.equal(result.failed[0].reason, "USER_FILE_AUTH_REQUIRED");
});

test("assetImportService: rejects svg unless safe pipeline flag is enabled", async () => {
  const result = await importLocalAssets({
    files: [fakeFile("logo.svg", "image/svg+xml", "<svg></svg>")],
    safeSvgEnabled: false,
    authorized: true,
  });
  assert.equal(result.unsupported[0].reason, "SVG_NOT_ENABLED");
});

test("assetImportService: reports partial success, skips duplicates, and rejects MIME mismatch", async () => {
  const saved = [];
  const result = await importLocalAssets({
    authorized: true,
    existingAssets: [{ id: "existing", duplicateKey: "file:hero.png:9" }],
    files: [
      fakeFile("hero.png", "image/png", "duplicate"),
      fakeFile("scene.webp", "image/webp", "new-image"),
      fakeFile("bad.jpg", "image/png", "bad"),
    ],
    saveAsset: async (asset) => { saved.push(asset); return { ...asset, id: `saved-${saved.length}` }; },
  });

  assert.deepEqual(result.skipped.map((item) => item.reason), ["DUPLICATE_ASSET"]);
  assert.deepEqual(result.imported.map((item) => item.id), ["saved-1"]);
  assert.equal(result.failed[0].reason, "MIME_EXTENSION_MISMATCH");
});
