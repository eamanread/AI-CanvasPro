import { createAIGenerateNodeUiModule as createLegacyAIGenerateNodeUiModule } from "./uiModule.impl.js";
import {
  pickCanvasImageLocalPath,
  pickCanvasThumbLocalPath,
} from "../../services/imageDerivativeService.js";

function trimText(value) {
  return String(value ?? "").trim();
}

function withPreviewVersion(localPath, versionSeed) {
  const normalizedPath = trimText(localPath).replace(/^\/+/, "");
  if (!normalizedPath) {
    return "";
  }

  const seed = trimText(versionSeed);
  if (!seed) {
    return normalizedPath;
  }

  const [basePart, hashPart = ""] = normalizedPath.split("#", 2);
  const joiner = basePart.includes("?") ? "&" : "?";
  return `${basePart}${joiner}__aicv=${encodeURIComponent(seed)}${hashPart ? `#${hashPart}` : ""}`;
}

function buildPreviewVersionSeed(nodeData, imageData = null) {
  const image = imageData && typeof imageData === "object" ? imageData : null;
  const parts = [
    trimText(nodeData?.generationStartTime),
    trimText(nodeData?.generationDuration),
    trimText(nodeData?.jobStatus),
    trimText(image?.sourceUrl || image?.imageUrl || image?.thumbUrl),
  ].filter(Boolean);
  return parts.join("|");
}

function decorateImageForPreview(image, nodeData) {
  if (!image || typeof image !== "object") {
    return image;
  }

  const versionSeed = buildPreviewVersionSeed(nodeData, image);
  if (!versionSeed) {
    return image;
  }

  const previewPath = withPreviewVersion(pickCanvasImageLocalPath(image), versionSeed);
  const previewThumbPath = withPreviewVersion(pickCanvasThumbLocalPath(image), versionSeed);
  if (!previewPath && !previewThumbPath) {
    return image;
  }

  return {
    ...image,
    ...(previewPath ? { displayLocalPath: previewPath } : {}),
    ...(previewThumbPath ? { thumbLocalPath: previewThumbPath } : {}),
  };
}

function decorateNodeDataForPreview(data) {
  if (!data || typeof data !== "object") {
    return data;
  }

  let changed = false;
  const nextData = {
    ...data,
  };

  if (Array.isArray(data.images)) {
    const nextImages = data.images.map((image) => {
      const decorated = decorateImageForPreview(image, data);
      if (decorated !== image) {
        changed = true;
      }
      return decorated;
    });
    nextData.images = nextImages;
  }

  const topLevelSeed = buildPreviewVersionSeed(data, data);
  const topLevelPreviewPath = withPreviewVersion(pickCanvasImageLocalPath(data), topLevelSeed);
  const topLevelThumbPath = withPreviewVersion(pickCanvasThumbLocalPath(data), topLevelSeed);
  if (topLevelPreviewPath && topLevelPreviewPath !== trimText(data.displayLocalPath)) {
    nextData.displayLocalPath = topLevelPreviewPath;
    changed = true;
  }
  if (topLevelThumbPath && topLevelThumbPath !== trimText(data.thumbLocalPath)) {
    nextData.thumbLocalPath = topLevelThumbPath;
    changed = true;
  }

  return changed ? nextData : data;
}

function createWrappedModule(legacyModule, overrides) {
  const wrappedModule = {};
  Object.defineProperties(wrappedModule, Object.getOwnPropertyDescriptors(legacyModule));
  Object.defineProperties(wrappedModule, Object.getOwnPropertyDescriptors(overrides));
  return wrappedModule;
}

export function createAIGenerateNodeUiModule(deps) {
  const legacyModule = createLegacyAIGenerateNodeUiModule(deps);
  const originalLoadAndDisplayImage = legacyModule._loadAndDisplayImage;

  return createWrappedModule(legacyModule, {
    async _loadAndDisplayImage() {
      const originalData = this._data;
      const decoratedData = decorateNodeDataForPreview(originalData);
      if (decoratedData === originalData) {
        return originalLoadAndDisplayImage.call(this);
      }

      try {
        this._data = decoratedData;
        return await originalLoadAndDisplayImage.call(this);
      } finally {
        this._data = originalData;
      }
    },
  });
}
