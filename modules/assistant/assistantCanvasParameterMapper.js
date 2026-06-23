import { validateNodeParameters } from "./canvasSkills/schemas/schemaValidator.js";

const BASE_NODE_PATCH_KEYS = new Set(["name", "title", "description"]);

function present(value) {
  return value !== undefined && value !== null && value !== "";
}

function text(value) {
  return String(value ?? "").trim();
}

function batch(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.min(8, Math.floor(n))) : undefined;
}

function sourceFromAction(action = {}) {
  const data = action.data && typeof action.data === "object" ? action.data : {};
  return { ...data, ...action };
}

function pickExistingPatchDefaults(existingData, nodeType) {
  const defaults = {};
  if (nodeType === "ai-image") {
    if (present(existingData.imageSize)) defaults.imageSize = existingData.imageSize;
    if (present(existingData.batchSize)) defaults.batchSize = batch(existingData.batchSize) ?? existingData.batchSize;
  }
  return defaults;
}

function compactUnique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function compatibleModelRegistryFromAction(source) {
  const model = text(source.modelId || source.model || source.modelName);
  if (!model) return null;
  return {
    getModelsByNodeType: () => [{ id: model, modelId: model, modelName: model, displayName: model, configured: true }],
    listModels: () => [{ id: model, modelId: model, modelName: model, displayName: model, configured: true }],
  };
}

export function mapAssistantNodeParameters({
  nodeType = "",
  action = {},
  existingData = {},
  modelRegistry = null,
  trustedSource = "",
} = {}) {
  const type = text(nodeType);
  const source = sourceFromAction(action);
  const registry = modelRegistry || compatibleModelRegistryFromAction(source);
  const validated = validateNodeParameters({ nodeType: type, action, modelRegistry: registry, source: trustedSource });
  const patch = { ...pickExistingPatchDefaults(existingData, type), ...validated.patch };
  const warnings = [...validated.warnings];

  if (patch.modelId) {
    patch.model = patch.modelId;
  }
  if (source.modelName && patch.modelId) {
    patch.modelName = text(source.modelName);
  }

  for (const key of BASE_NODE_PATCH_KEYS) {
    if (present(source[key])) patch[key] = source[key];
  }

  return {
    patch,
    warnings,
    rejectedAdvancedOptions: compactUnique(validated.rejectedFields),
    acceptedFields: validated.acceptedFields,
    rejectedFields: validated.rejectedFields,
  };
}
