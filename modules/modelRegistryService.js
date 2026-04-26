import {
  ensureConfig,
  fetchApiConfigFromServer,
  getApiConfigSnapshot,
  saveApiConfigToServer,
} from "../api/configApi.js";

export const MODEL_NODE_TYPES = Object.freeze([
  "text",
  "image",
  "video",
  "audio",
  "other",
]);

export const MODEL_STATUSES = Object.freeze([
  "unconfigured",
  "unverified",
  "available",
  "failed",
  "deleted",
]);

const VALID_MODEL_STATUSES = new Set(MODEL_STATUSES);

const DEFAULT_MODEL_REGISTRY = Object.freeze({
  text: [
    {
      id: "mdl_text_default_gemini_3_1",
      nodeType: "text",
      modelName: "gemini-3.1",
      modelId: "",
      apiKey: "",
      baseUrl: "",
      adapterType: "openai_compatible",
      status: "unconfigured",
      lastTestedAt: null,
      lastError: "",
      lastTestResult: null,
      templateHints: {
        modelId: "gemini-3.1",
        baseUrl: "https://example.com/v1/chat/completions",
      },
    },
  ],
  image: [
    {
      id: "mdl_image_default_nano_banana_2",
      nodeType: "image",
      modelName: "NanoBanana-2",
      modelId: "",
      apiKey: "",
      baseUrl: "",
      adapterType: "openai_compatible",
      status: "unconfigured",
      lastTestedAt: null,
      lastError: "",
      lastTestResult: null,
      templateHints: {
        modelId: "nano-banana-2",
        baseUrl: "https://example.com/v1/images/generations",
      },
    },
  ],
  video: [
    {
      id: "mdl_video_default_seedance_2_0",
      nodeType: "video",
      modelName: "seedance-2.0",
      modelId: "",
      apiKey: "",
      baseUrl: "",
      adapterType: "openai_compatible",
      status: "unconfigured",
      lastTestedAt: null,
      lastError: "",
      lastTestResult: null,
      templateHints: {
        modelId: "seedance-2.0",
        baseUrl: "https://example.com/v1/video/generations",
      },
    },
  ],
  audio: [
    {
      id: "mdl_audio_default_minimax",
      nodeType: "audio",
      modelName: "minimax",
      modelId: "",
      apiKey: "",
      baseUrl: "",
      adapterType: "openai_compatible",
      status: "unconfigured",
      lastTestedAt: null,
      lastError: "",
      lastTestResult: null,
      templateHints: {
        modelId: "minimax",
        baseUrl: "https://example.com/v1/audio/speech",
      },
    },
  ],
  other: [],
});

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function coerceText(value) {
  return String(value ?? "").trim();
}

function slugify(value) {
  const slug = coerceText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "model";
}

function normalizeNodeType(nodeType) {
  const normalized = coerceText(nodeType).toLowerCase();
  return MODEL_NODE_TYPES.includes(normalized) ? normalized : "other";
}

function normalizeTemplateHints(rawHints) {
  if (!rawHints || typeof rawHints !== "object" || Array.isArray(rawHints)) {
    return { modelId: "", baseUrl: "" };
  }

  return {
    modelId: coerceText(rawHints.modelId || rawHints.modelID),
    baseUrl: coerceText(rawHints.baseUrl),
  };
}

function normalizeModelStatus(rawStatus, { isFullyConfigured }) {
  const status = coerceText(rawStatus);
  if (status === "deleted") {
    return status;
  }
  if (!isFullyConfigured) {
    return "unconfigured";
  }
  if (VALID_MODEL_STATUSES.has(status) && status !== "unconfigured") {
    return status;
  }
  return "unverified";
}

function normalizeModelRecord(nodeType, rawModel, index) {
  if (!rawModel || typeof rawModel !== "object" || Array.isArray(rawModel)) {
    return null;
  }

  const modelName = coerceText(rawModel.modelName);
  if (!modelName) {
    return null;
  }

  const modelId = coerceText(rawModel.modelId || rawModel.modelID);
  const apiKey = coerceText(rawModel.apiKey);
  const baseUrl = coerceText(rawModel.baseUrl);
  const isFullyConfigured = Boolean(modelId && apiKey && baseUrl);

  return {
    id:
      coerceText(rawModel.id) ||
      `mdl_${nodeType}_${slugify(modelName)}_${Number(index) + 1}`,
    nodeType,
    modelName,
    modelId,
    apiKey,
    baseUrl,
    adapterType: coerceText(rawModel.adapterType) || "openai_compatible",
    status: normalizeModelStatus(rawModel.status, { isFullyConfigured }),
    lastTestedAt: rawModel.lastTestedAt ?? null,
    lastError: coerceText(rawModel.lastError),
    lastTestResult: rawModel.lastTestResult ?? null,
    templateHints: normalizeTemplateHints(rawModel.templateHints),
  };
}

function dedupeModelNames(models) {
  const seen = new Map();
  return models
    .filter(Boolean)
    .map((model) => {
      const name = coerceText(model.modelName);
      const key = name.toLowerCase();
      const nextCount = (seen.get(key) || 0) + 1;
      seen.set(key, nextCount);

      if (nextCount === 1) {
        return model;
      }

      return {
        ...model,
        modelName: `${name} (${nextCount})`,
      };
    });
}

export function createDefaultRegistry() {
  return cloneJson(DEFAULT_MODEL_REGISTRY);
}

export function normalizeRegistry(rawRegistry) {
  const source =
    rawRegistry && typeof rawRegistry === "object" && !Array.isArray(rawRegistry)
      ? rawRegistry
      : {};

  const normalized = {};
  for (const rawNodeType of MODEL_NODE_TYPES) {
    const nodeType = normalizeNodeType(rawNodeType);
    const sourceValue = source[nodeType];
    const hasExplicitList = Array.isArray(sourceValue);

    let models = [];
    if (hasExplicitList) {
      models = sourceValue
        .map((item, index) => normalizeModelRecord(nodeType, item, index))
        .filter(Boolean);
      models = dedupeModelNames(models);
    } else {
      models = cloneJson(DEFAULT_MODEL_REGISTRY[nodeType]);
    }

    normalized[nodeType] = models;
  }

  return normalized;
}

export function getCachedModelRegistry() {
  return normalizeRegistry(getApiConfigSnapshot()?.modelRegistry);
}

export async function getModelRegistry() {
  await ensureConfig();
  return getCachedModelRegistry();
}

export function getModelsByNodeType(nodeType, registry = null) {
  const normalizedNodeType = normalizeNodeType(nodeType);
  const resolvedRegistry = registry ? normalizeRegistry(registry) : getCachedModelRegistry();
  return Array.isArray(resolvedRegistry[normalizedNodeType])
    ? resolvedRegistry[normalizedNodeType]
    : [];
}

export function findModelById(modelId, registry = null) {
  const expectedId = coerceText(modelId);
  if (!expectedId) {
    return null;
  }

  const resolvedRegistry = registry ? normalizeRegistry(registry) : getCachedModelRegistry();
  for (const nodeType of MODEL_NODE_TYPES) {
    const match = (resolvedRegistry[nodeType] || []).find(
      (model) => coerceText(model?.id) === expectedId
    );
    if (match) {
      return match;
    }
  }

  return null;
}

export function isModelNameUnique(nodeType, modelName, registry = null, excludeId = "") {
  const normalizedNodeType = normalizeNodeType(nodeType);
  const normalizedName = coerceText(modelName).toLowerCase();
  if (!normalizedName) {
    return true;
  }

  const expectedExcludeId = coerceText(excludeId);
  const models = getModelsByNodeType(normalizedNodeType, registry);
  return !models.some((model) => {
    if (expectedExcludeId && coerceText(model?.id) === expectedExcludeId) {
      return false;
    }
    return coerceText(model?.modelName).toLowerCase() === normalizedName;
  });
}

export async function saveModelRegistry(nextRegistry) {
  const currentConfig = getApiConfigSnapshot() || (await fetchApiConfigFromServer());
  const normalizedRegistry = normalizeRegistry(nextRegistry);
  const payload = {
    ...(currentConfig || {}),
    modelRegistry: normalizedRegistry,
  };

  await saveApiConfigToServer(payload);
  const savedConfig = await fetchApiConfigFromServer();
  return normalizeRegistry(savedConfig?.modelRegistry);
}
