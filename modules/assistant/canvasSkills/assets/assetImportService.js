import { createAssetDuplicateKey, normalizeAssetRecord } from "./assetCatalog.js";
import { isDuplicateAsset } from "./assetDuplicateDetector.js";

const IMAGE_MIME_BY_EXT = Object.freeze({
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
});

function text(value) {
  return String(value ?? "").trim();
}

function extension(name) {
  const match = text(name).toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

function createEmptyResult() {
  return { imported: [], skipped: [], failed: [], unsupported: [] };
}

function isUserFileLike(file) {
  return file && typeof file === "object" && text(file.name) && typeof file.size === "number";
}

export async function importLocalAssets({
  files = [],
  existingAssets = [],
  authorized = false,
  safeSvgEnabled = false,
  maxFiles = 50,
  maxFileSize = 25 * 1024 * 1024,
  saveAsset = async (asset) => asset,
} = {}) {
  const result = createEmptyResult();
  const list = Array.isArray(files) ? files.slice(0, maxFiles) : [];
  const known = [...(Array.isArray(existingAssets) ? existingAssets : [])].map(normalizeAssetRecord);

  for (const file of list) {
    if (!isUserFileLike(file) || !authorized) {
      result.failed.push({ fileName: text(file?.name || file), reason: "USER_FILE_AUTH_REQUIRED" });
      continue;
    }
    if (file.size > maxFileSize) {
      result.failed.push({ fileName: file.name, reason: "FILE_TOO_LARGE" });
      continue;
    }
    const ext = extension(file.name);
    const expectedMime = IMAGE_MIME_BY_EXT[ext];
    if (!expectedMime) {
      result.unsupported.push({ fileName: file.name, reason: "UNSUPPORTED_FILE_TYPE" });
      continue;
    }
    if (ext === "svg" && !safeSvgEnabled) {
      result.unsupported.push({ fileName: file.name, reason: "SVG_NOT_ENABLED" });
      continue;
    }
    if (text(file.type) !== expectedMime) {
      result.failed.push({ fileName: file.name, reason: "MIME_EXTENSION_MISMATCH" });
      continue;
    }
    const draft = normalizeAssetRecord({
      id: "",
      name: file.name.replace(/\.[^.]+$/, ""),
      fileName: file.name,
      size: file.size,
      category: "custom",
      sourceType: "local_import",
      duplicateKey: createAssetDuplicateKey({ fileName: file.name, size: file.size }),
    });
    if (isDuplicateAsset(draft, known)) {
      result.skipped.push({ fileName: file.name, duplicateKey: draft.duplicateKey, reason: "DUPLICATE_ASSET" });
      continue;
    }
    try {
      const saved = normalizeAssetRecord(await saveAsset(draft));
      known.push(saved);
      result.imported.push(saved);
    } catch (error) {
      result.failed.push({ fileName: file.name, reason: "SAVE_FAILED", message: error?.message || String(error) });
    }
  }
  return result;
}
