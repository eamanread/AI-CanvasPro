import { getProviderConfig } from "../api/configApi.js";
import { findModelById } from "./modelRegistryService.js";
import { hasCompleteModelConfig } from "./modelValidationService.js";

const REGISTRY_PROVIDER_ID = "registry-openai";

function trimText(value) {
  return String(value ?? "").trim();
}

function normalizeNodeData(data) {
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

function createRegistryResult({ data, modelRecord, state }) {
  const sourceData = normalizeNodeData(data);
  const selectedModelNameSnapshot =
    trimText(modelRecord?.modelName) ||
    trimText(sourceData.selectedModelNameSnapshot) ||
    trimText(sourceData.modelName) ||
    trimText(sourceData.model);

  return {
    source: "registry",
    state,
    provider: REGISTRY_PROVIDER_ID,
    model: trimText(modelRecord?.modelId) || trimText(sourceData.model),
    apiKey: trimText(modelRecord?.apiKey),
    baseUrl: trimText(modelRecord?.baseUrl),
    adapterType: trimText(modelRecord?.adapterType) || "openai_compatible",
    selectedModelId: trimText(sourceData.selectedModelId),
    selectedModelNameSnapshot,
    displayLabel: selectedModelNameSnapshot || "模型已删除",
    modelRecord: modelRecord || null,
  };
}

function inferImageLegacyProvider(model, explicitProvider = "") {
  const normalizedProvider = trimText(explicitProvider).toLowerCase();
  if (normalizedProvider) {
    return normalizedProvider;
  }

  const normalizedModel = trimText(model).toLowerCase();
  if (normalizedModel.startsWith("apimart/")) {
    return "apimart";
  }
  if (normalizedModel.startsWith("ppio/")) {
    return "ppio";
  }
  if (
    normalizedModel.startsWith("runninghub-model/") ||
    normalizedModel.startsWith("runninghub/")
  ) {
    return "runninghub";
  }
  if (normalizedModel.startsWith("dreamina/")) {
    return "dreamina";
  }
  return "grsai";
}

function inferTextLegacyProvider(model, explicitProvider = "") {
  const normalizedProvider = trimText(explicitProvider).toLowerCase();
  if (normalizedProvider) {
    return normalizedProvider;
  }

  const normalizedModel = trimText(model).toLowerCase();
  if (normalizedModel.startsWith("apimart/")) {
    return "apimart";
  }
  if (normalizedModel.startsWith("ppio/")) {
    return "ppio";
  }
  if (
    normalizedModel.startsWith("runninghub-model/") ||
    normalizedModel.startsWith("runninghub/")
  ) {
    return "runninghub";
  }
  if (normalizedModel.startsWith("dreamina/")) {
    return "dreamina";
  }
  return "grsai";
}

function resolveLegacyApiKey(providerId, model, providerConfig) {
  const normalizedProvider = trimText(providerId).toLowerCase();
  const normalizedModel = trimText(model).toLowerCase();

  if (
    normalizedProvider === "runninghub" &&
    normalizedModel.startsWith("runninghub-model/")
  ) {
    return trimText(providerConfig?.modelApiKey) || trimText(providerConfig?.apiKey);
  }

  return trimText(providerConfig?.apiKey);
}

function createLegacyResult({
  provider,
  configProviderId = provider,
  model,
  displayLabel = model,
  adapterType = "legacy",
}) {
  const providerConfig = getProviderConfig(configProviderId);
  const apiKey = resolveLegacyApiKey(provider, model, providerConfig);

  return {
    source: "legacy",
    state: trimText(model) && apiKey ? "ready" : "unconfigured",
    provider,
    model: trimText(model),
    apiKey,
    baseUrl: trimText(providerConfig?.apiUrl),
    adapterType,
    selectedModelId: "",
    selectedModelNameSnapshot: "",
    displayLabel: trimText(displayLabel) || trimText(model) || "未配置模型",
    modelRecord: null,
  };
}

function resolveRegistryModel(data) {
  const sourceData = normalizeNodeData(data);
  const selectedModelId = trimText(sourceData.selectedModelId);
  const selectedModelNameSnapshot = trimText(sourceData.selectedModelNameSnapshot);
  const isRegistryNode =
    Boolean(selectedModelId) ||
    trimText(sourceData.provider).toLowerCase() === REGISTRY_PROVIDER_ID ||
    Boolean(selectedModelNameSnapshot && sourceData.modelDeleted);

  if (!isRegistryNode) {
    return null;
  }

  if (!selectedModelId) {
    return createRegistryResult({
      data: sourceData,
      modelRecord: null,
      state: sourceData.modelDeleted ? "deleted" : "unconfigured",
    });
  }

  const modelRecord = findModelById(selectedModelId);
  if (!modelRecord) {
    return createRegistryResult({
      data: sourceData,
      modelRecord: null,
      state: "deleted",
    });
  }

  return createRegistryResult({
    data: sourceData,
    modelRecord,
    state: hasCompleteModelConfig(modelRecord) ? "ready" : "unconfigured",
  });
}

export function resolveImageToolRuntimeModel(data) {
  const sourceData = normalizeNodeData(data);
  const registryResult = resolveRegistryModel(sourceData);
  if (registryResult) {
    return registryResult;
  }

  const model = trimText(sourceData.model);
  const provider = inferImageLegacyProvider(model, sourceData.provider);

  return createLegacyResult({
    provider,
    configProviderId: provider,
    model,
    displayLabel: trimText(sourceData.modelName) || model,
  });
}

export function resolveTextToolRuntimeModel(data) {
  const sourceData = normalizeNodeData(data);
  const registryResult = resolveRegistryModel(sourceData);
  if (registryResult) {
    return registryResult;
  }

  const model = trimText(sourceData.model);
  const provider = inferTextLegacyProvider(model, sourceData.provider);

  return createLegacyResult({
    provider,
    configProviderId: provider,
    model,
    displayLabel: trimText(sourceData.modelName) || model,
  });
}

export { REGISTRY_PROVIDER_ID };
