import { isSelectableApiModel } from "../modelRegistryFilters.js";

const DEFAULT_TEXT_CONTEXT = 8192;
export const REGISTRY_TEXT_PROVIDER = "model_registry";


function providerValue(provider, ...keys) {
  for (const key of keys) {
    const value = provider?.[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return value;
    }
  }
  return "";
}

function configured(provider) {
  const endpoint = providerValue(provider, "apiUrl", "proxyBaseUrl", "baseUrl", "endpoint");
  const secret = providerValue(provider, "apiKey", "proxyToken", "token");
  const secretConfigured =
    provider.apiKeyConfigured === true ||
    provider.proxyTokenConfigured === true ||
    provider.tokenConfigured === true;
  return Boolean(endpoint && (secret || secretConfigured));
}

function modelName(provider, fallback) {
  return String(providerValue(provider, "model", "modelName", "defaultModel") || fallback || "").trim();
}

function displayName(name, provider, model) {
  return String(providerValue(provider, "displayName", "label", "name") || model || name).trim();
}

function disabledReason(provider) {
  const endpoint = providerValue(provider, "apiUrl", "proxyBaseUrl", "baseUrl", "endpoint");
  const secret = providerValue(provider, "apiKey", "proxyToken", "token");
  const secretConfigured =
    provider?.apiKeyConfigured === true ||
    provider?.proxyTokenConfigured === true ||
    provider?.tokenConfigured === true;
  if (!endpoint && !(secret || secretConfigured)) {
    return "缺少 API Key 或 Endpoint";
  }
  if (!endpoint) {
    return "缺少 Endpoint";
  }
  if (!(secret || secretConfigured)) {
    return "缺少 API Key";
  }
  return "";
}

function registryTextValue(model, ...keys) {
  for (const key of keys) {
    const value = model?.[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function registryTextConfigured(model) {
  return Boolean(
    registryTextValue(model, "id") &&
      registryTextValue(model, "modelName", "name") &&
      registryTextValue(model, "modelId", "model") &&
      registryTextValue(model, "apiKey") &&
      registryTextValue(model, "baseUrl", "apiUrl", "endpoint") &&
      registryTextValue(model, "status").toLowerCase() !== "deleted" &&
      model?.disabled !== true
  );
}

function registryTextDisabledReason(model) {
  const modelId = registryTextValue(model, "modelId", "model");
  const endpoint = registryTextValue(model, "baseUrl", "apiUrl", "endpoint");
  const secret = registryTextValue(model, "apiKey");
  if (!modelId && !endpoint && !secret) {
    return "\u7f3a\u5c11\u6587\u672c\u6a21\u578b\u914d\u7f6e";
  }
  if (!modelId) {
    return "\u7f3a\u5c11 modelId";
  }
  if (!endpoint) {
    return "\u7f3a\u5c11 baseUrl";
  }
  if (!secret) {
    return "\u7f3a\u5c11 API Key";
  }
  if (registryTextValue(model, "status").toLowerCase() === "deleted" || model?.disabled === true) {
    return "\u6a21\u578b\u5df2\u505c\u7528";
  }
  return "";
}

function normalizeRegistryTextModel(model = {}, index = 0) {
  const id = registryTextValue(model, "id") || `text_model_${index + 1}`;
  const modelId = registryTextValue(model, "modelId", "model") || registryTextValue(model, "modelName", "name") || id;
  const display = registryTextValue(model, "modelName", "displayName", "name") || modelId;
  const status = registryTextValue(model, "status").toLowerCase();
  const isConfigured = registryTextConfigured(model);
  return {
    id,
    provider: REGISTRY_TEXT_PROVIDER,
    model: modelId,
    displayName: display,
    configured: isConfigured,
    disabled: model?.disabled === true,
    disabledReason: isConfigured ? "" : registryTextDisabledReason(model),
    capabilities: ["text"],
    providerType: registryTextValue(model, "adapterType") || "openai_compatible",
    status,
    priority: Number(model.priority || 0) || 0,
    supportsText: true,
    supportsImageInput: false,
    supportsImageGeneration: false,
    supportsVideoGeneration: false,
    supportsTools: false,
    maxReferenceImages: 0,
    contextWindow: Number(model.contextWindow || DEFAULT_TEXT_CONTEXT) || DEFAULT_TEXT_CONTEXT,
    requiresProxy: false,
    nodeType: "text",
  };
}

function registryTextModels(config = {}) {
  const registry = config?.modelRegistry && typeof config.modelRegistry === "object" ? config.modelRegistry : {};
  const textModels = Array.isArray(registry.text) ? registry.text : [];
  // Single source of truth for raw-entry selectability: the text generation
  // node rule in modules/modelRegistryFilters.js (only deleted/disabled drop out).
  return textModels
    .filter((model) => model && typeof model === "object")
    .filter((model) => isSelectableApiModel(model))
    .map((model, index) => normalizeRegistryTextModel(model, index));
}


function capabilitiesFor(name, provider, { supportsImageInput, isAgent, isImage, isVideo }) {
  const configuredCapabilities = Array.isArray(provider.capabilities)
    ? provider.capabilities.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (configuredCapabilities.length) {
    return configuredCapabilities;
  }
  const capabilities = ["text"];
  if (supportsImageInput) {
    capabilities.push("vision");
  }
  if (isAgent) {
    capabilities.push("action_planning");
  }
  if (isImage) {
    capabilities.push("image_generation");
  }
  if (isVideo) {
    capabilities.push("video_generation");
  }
  if (/low|fast|turbo|mini/i.test(`${name} ${modelName(provider, "")}`)) {
    capabilities.push("low_latency");
  } else if (isAgent) {
    capabilities.push("high_quality");
  }
  return capabilities;
}

function normalizeProvider(name, provider = {}) {
  const model = modelName(provider, name);
  const isVideo = /video|seedance|veo|kling|hailuo/i.test(`${name} ${model}`);
  const isImage = /image|gpt-image|flux|sd|midjourney|即梦|jimeng/i.test(`${name} ${model}`);
  const isAgent = name === "canvas_agent" || name === "pi_canvas_agent";
  const supportsImageInput =
    provider.supportsImageInput !== undefined
      ? Boolean(provider.supportsImageInput)
      : /vision|gpt-4o|gemini|claude|image|pi/i.test(`${name} ${model}`);
  const isConfigured = configured(provider);
  const capabilities = capabilitiesFor(name, provider, {
    supportsImageInput,
    isAgent,
    isImage,
    isVideo,
  });
  return {
    id: model || name,
    provider: name,
    model,
    displayName: displayName(name, provider, model),
    configured: isConfigured,
    disabledReason: isConfigured ? "" : disabledReason(provider),
    capabilities,
    providerType: String(provider.providerType || ""),
    priority: Number(provider.priority || 0) || 0,
    supportsText: true,
    supportsImageInput,
    supportsImageGeneration:
      provider.supportsImageGeneration !== undefined ? Boolean(provider.supportsImageGeneration) : isImage,
    supportsVideoGeneration:
      provider.supportsVideoGeneration !== undefined ? Boolean(provider.supportsVideoGeneration) : isVideo,
    supportsTools: provider.supportsTools !== undefined ? Boolean(provider.supportsTools) : isAgent,
    maxReferenceImages: Number(provider.maxReferenceImages || (supportsImageInput ? 8 : 0)) || 0,
    contextWindow: Number(provider.contextWindow || DEFAULT_TEXT_CONTEXT) || DEFAULT_TEXT_CONTEXT,
    requiresProxy: Boolean(provider.proxyBaseUrl || provider.proxyToken || name === "pi_canvas_agent"),
  };
}

export function buildAssistantModelRegistry(config = {}) {
  const providers = config?.providers && typeof config.providers === "object" ? config.providers : {};
  const registryModels = registryTextModels(config);
  const providerModels = Object.entries(providers)
    .filter(([, provider]) => provider && typeof provider === "object")
    .map(([name, provider]) => normalizeProvider(name, provider));
  const models = [...registryModels, ...providerModels];

  const options = models.map((model) => ({
    id: model.id,
    provider: model.provider,
    model: model.model,
    displayName: model.displayName,
    configured: model.configured,
    disabled: model.disabled === true,
    disabledReason: model.disabledReason,
    capabilities: model.capabilities,
    supportsText: model.supportsText,
    supportsImageGeneration: model.supportsImageGeneration,
    supportsVideoGeneration: model.supportsVideoGeneration,
    supportsImageInput: model.supportsImageInput,
    supportsTools: model.supportsTools,
    maxReferenceImages: model.maxReferenceImages,
    status: model.status,
    nodeType: model.nodeType,
  }));
  const configuredTextOptions = filterConfiguredTextModelOptions(options);
  const defaultModel =
    configuredTextOptions.find((model) => String(model.status || "").toLowerCase() !== "failed") ||
    configuredTextOptions[0] ||
    options.find((model) => model.provider === "canvas_agent" && model.configured) ||
    options.find((model) => model.provider === "pi_canvas_agent" && model.configured) ||
    options.find((model) => model.supportsTools && model.configured) ||
    options.find((model) => model.configured) ||
    null;

  return {
    models,
    options,
    defaultModel,

    configuredModels() {
      return options.filter((model) => model.configured);
    },

    configuredTextModels() {
      return filterConfiguredTextModelOptions(options);
    },

    defaultAgentModel() {
      return (
        models.find((model) => model.provider === "canvas_agent" && model.configured) ||
        models.find((model) => model.provider === "pi_canvas_agent" && model.configured) ||
        models.find((model) => model.supportsTools && model.configured) ||
        null
      );
    },

    modelsForIntent(intentId) {
      const id = String(intentId || "").trim();
      if (id === "marketing_video" || id === "story_short" || id === "comic_drama") {
        return models.filter((model) => model.configured && (model.supportsVideoGeneration || model.supportsTools));
      }
      if (id === "commerce_pack" || id === "poster_design" || id === "brand_design") {
        return models.filter((model) => model.configured && (model.supportsImageGeneration || model.supportsTools));
      }
      return models.filter((model) => model.configured);
    },

    routeForCapabilities(requiredCapabilities = []) {
      const required = Array.isArray(requiredCapabilities)
        ? requiredCapabilities.map((item) => String(item || "").trim()).filter(Boolean)
        : [String(requiredCapabilities || "").trim()].filter(Boolean);
      if (!required.length) {
        return null;
      }
      const candidates = models
        .filter((model) => model.configured)
        .filter((model) => required.every((capability) => model.capabilities.includes(capability)))
        .sort((a, b) => {
          const priorityDelta = Number(b.priority || 0) - Number(a.priority || 0);
          if (priorityDelta) {
            return priorityDelta;
          }
          return Number(b.contextWindow || 0) - Number(a.contextWindow || 0);
        });
      return candidates[0] || null;
    },

    routingTable() {
      const routes = {};
      for (const model of models.filter((item) => item.configured)) {
        for (const capability of model.capabilities) {
          if (!routes[capability]) {
            routes[capability] = [];
          }
          routes[capability].push({
            id: model.id,
            provider: model.provider,
            model: model.model,
            displayName: model.displayName,
            priority: Number(model.priority || 0),
            contextWindow: Number(model.contextWindow || 0),
          });
        }
      }
      for (const capability of Object.keys(routes)) {
        routes[capability].sort((a, b) => {
          const priorityDelta = b.priority - a.priority;
          if (priorityDelta) {
            return priorityDelta;
          }
          return b.contextWindow - a.contextWindow;
        });
      }
      return {
        schemaVersion: "canvas-agent-model-routing-v1",
        routes,
      };
    },

    canUseReferenceImages(providerName, count = 1) {
      const model = models.find((item) => item.provider === providerName);
      return Boolean(model?.supportsImageInput && model.maxReferenceImages >= Number(count || 0));
    },
  };
}

export function isConfiguredTextModelOption(model = {}) {
  const status = String(model?.status || "").toLowerCase();
  return Boolean(
    model &&
      typeof model === "object" &&
      model.provider === REGISTRY_TEXT_PROVIDER &&
      model.configured === true &&
      model.supportsText === true &&
      model.supportsImageGeneration !== true &&
      model.supportsVideoGeneration !== true &&
      model.supportsTools !== true &&
      status !== "deleted"
  );
}

export function filterConfiguredTextModelOptions(options = []) {
  return Array.isArray(options) ? options.filter(isConfiguredTextModelOption) : [];
}

// Mirrors the text generation node menu rules (isSelectableApiModel): untested
// or incompletely configured models stay listed; only deleted/disabled drop out.
export function isSelectableTextModelOption(model = {}) {
  const status = String(model?.status || "").toLowerCase();
  return Boolean(
    model &&
      typeof model === "object" &&
      model.provider === REGISTRY_TEXT_PROVIDER &&
      model.disabled !== true &&
      model.supportsText === true &&
      model.supportsImageGeneration !== true &&
      model.supportsVideoGeneration !== true &&
      model.supportsTools !== true &&
      status !== "deleted"
  );
}

export function filterSelectableTextModelOptions(options = []) {
  return Array.isArray(options) ? options.filter(isSelectableTextModelOption) : [];
}
