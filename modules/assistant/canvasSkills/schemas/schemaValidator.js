import { FIELD_STATUS, findSchemaField, getCanvasNodeSchema } from "./index.js";

const SECRET_FIELD_NAMES = new Set([
  "apikey",
  "api_key",
  "authorization",
  "headers",
  "token",
  "proxytoken",
  "accesstoken",
  "refreshtoken",
  "secret",
  "password",
  "credential",
  "cookie",
]);

const META_FIELDS = new Set([
  "id",
  "type",
  "action",
  "kind",
  "nodeType",
  "targetType",
  "nodeId",
  "targetNodeId",
  "data",
  "size",
  "width",
  "height",
  "advancedOptions",
  "assistantReferences",
  // Action envelope fields consumed by the executors themselves
  // (spatial policy / display name / auto-start stamp / contract
  // envelope), never node parameters.
  "placement",
  "name",
  "title",
  "autoStart",
  "metadata",
  "riskLevel",
  "requiresConfirmation",
]);

function text(value) {
  return String(value ?? "").trim();
}

function fieldKey(value) {
  return text(value).replace(/[-_\s]/g, "").toLowerCase();
}

function isSecretField(key) {
  const normalized = fieldKey(key);
  return SECRET_FIELD_NAMES.has(normalized) || /key|token|secret|password|credential|cookie|authorization/.test(normalized);
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function sourceEntries(action = {}) {
  const data = action.data && typeof action.data === "object" && !Array.isArray(action.data) ? action.data : {};
  const advancedOptions =
    action.advancedOptions && typeof action.advancedOptions === "object" && !Array.isArray(action.advancedOptions)
      ? action.advancedOptions
      : {};
  return Object.entries({ ...data, ...advancedOptions, ...action }).filter(([key]) => !META_FIELDS.has(key));
}

function nodeModelType(nodeType) {
  if (nodeType === "ai-image") return "image";
  if (nodeType === "ai-text") return "text";
  if (nodeType === "ai-video") return "video";
  return text(nodeType).replace(/^ai-/, "");
}

function getModelsForNodeType(modelRegistry, nodeType) {
  const modelType = nodeModelType(nodeType);
  if (typeof modelRegistry?.getModelsByNodeType === "function") {
    const direct = modelRegistry.getModelsByNodeType(nodeType);
    if (Array.isArray(direct) && direct.length) return direct;
    const normalized = modelRegistry.getModelsByNodeType(modelType);
    if (Array.isArray(normalized)) return normalized;
  }
  if (modelRegistry && typeof modelRegistry === "object") {
    const list = modelRegistry[modelType] || modelRegistry[nodeType];
    if (Array.isArray(list)) return list;
  }
  return [];
}

function listAllModels(modelRegistry) {
  if (typeof modelRegistry?.listModels === "function") {
    const models = modelRegistry.listModels();
    if (Array.isArray(models)) return models;
  }
  if (modelRegistry && typeof modelRegistry === "object") {
    return ["text", "image", "video", "ai-text", "ai-image", "ai-video"]
      .flatMap((type) => (Array.isArray(modelRegistry[type]) ? modelRegistry[type] : []));
  }
  return ["text", "image", "video"].flatMap((type) => getModelsForNodeType(modelRegistry, type));
}

function modelTexts(model = {}) {
  return [model.id, model.modelId, model.modelName, model.displayName, model.name, model.model]
    .map((value) => text(value))
    .filter(Boolean);
}

function modelMatches(model, value) {
  const expected = text(value).toLowerCase();
  return Boolean(expected && modelTexts(model).some((item) => item.toLowerCase() === expected));
}

function modelConfigured(model = {}) {
  const status = text(model.status).toLowerCase();
  if (model.configured === false || model.disabled === true || status === "failed" || status === "deleted") return false;
  if (model.configured === true) return true;
  return Boolean(status && status !== "unconfigured");
}

export function validateModelField({ nodeType, value, modelRegistry } = {}) {
  const requested = text(value);
  if (!requested) {
    return { ok: false, warnings: [], model: null };
  }
  const sameNodeModels = getModelsForNodeType(modelRegistry, nodeType);
  const sameNodeMatch = sameNodeModels.find((model) => modelMatches(model, requested));
  if (sameNodeMatch && modelConfigured(sameNodeMatch)) {
    return { ok: true, model: sameNodeMatch, warnings: [] };
  }
  const allMatch = listAllModels(modelRegistry).find((model) => modelMatches(model, requested));
  if (allMatch) {
    return {
      ok: false,
      model: null,
      warnings: [`Field model is not usable for ${text(nodeType) || "this"} node type.`],
    };
  }
  return {
    ok: false,
    model: null,
    warnings: [`Field model is not configured or not usable for ${text(nodeType) || "this"} node type.`],
  };
}

function normalizeValue(field, value) {
  if (!hasValue(value)) return undefined;
  if (field.type === "integer") {
    const number = Number(value);
    if (!Number.isFinite(number)) return undefined;
    const min = Number.isFinite(Number(field.min)) ? Number(field.min) : -Infinity;
    const max = Number.isFinite(Number(field.max)) ? Number(field.max) : Infinity;
    return Math.max(min, Math.min(max, Math.floor(number)));
  }
  if (field.type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) return undefined;
    if (Number.isFinite(Number(field.min)) && number <= Number(field.min)) return undefined;
    if (Number.isFinite(Number(field.max)) && number > Number(field.max)) return undefined;
    return number;
  }
  if (field.type === "array") {
    return Array.isArray(value) ? value : undefined;
  }
  if (field.type === "object") {
    return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
  }
  return value;
}

export function validateNodeParameters({ nodeType = "", action = {}, modelRegistry = null, source = "" } = {}) {
  const schema = getCanvasNodeSchema(nodeType);
  const patch = {};
  const acceptedFields = [];
  const rejectedFields = [];
  const warnings = [];

  if (!schema) {
    return {
      patch,
      acceptedFields,
      rejectedFields,
      warnings: [`Node type ${text(nodeType) || "unknown"} has no canvas skill schema.`],
    };
  }

  for (const [inputKey, inputValue] of sourceEntries(action)) {
    if (isSecretField(inputKey)) {
      rejectedFields.push(inputKey);
      warnings.push(`Field ${inputKey} is secret-like and was not written.`);
      continue;
    }

    const field = findSchemaField(nodeType, inputKey);
    if (!field) {
      rejectedFields.push(inputKey);
      warnings.push(`Field ${inputKey} is unknown for ${schema.nodeType} and was not written.`);
      continue;
    }

    // Trusted-source write policy: lineage-class fields are writable
    // only when the EXECUTION came from a trusted code path. `source`
    // is an execution option set at the call site - never read from
    // the action itself (action metadata survives the claw sanitizer
    // and is therefore LLM-forgeable).
    const trusted =
      field.trustedSources?.length > 0 && Boolean(text(source)) && field.trustedSources.includes(text(source));
    if ((field.status !== FIELD_STATUS.SUPPORTED || field.agentWritable === false) && !trusted) {
      rejectedFields.push(field.key);
      warnings.push(`Field ${field.key} is ${field.status} for ${schema.nodeType} and was not written.`);
      continue;
    }

    if (field.key === "modelId") {
      const modelResult = validateModelField({ nodeType: schema.nodeType, value: inputValue, modelRegistry });
      if (!modelResult.ok) {
        rejectedFields.push(inputKey);
        warnings.push(...modelResult.warnings);
        continue;
      }
      patch.modelId = text(modelResult.model.id || modelResult.model.modelId || inputValue);
      if (modelResult.model.provider) patch.provider = text(modelResult.model.provider);
      acceptedFields.push(field.key);
      continue;
    }

    const value = normalizeValue(field, inputValue);
    if (value === undefined) {
      rejectedFields.push(field.key);
      warnings.push(`Field ${field.key} has an invalid value and was not written.`);
      continue;
    }

    patch[field.mapsTo || field.key] = value;
    acceptedFields.push(field.key);
  }

  return {
    patch,
    acceptedFields: [...new Set(acceptedFields)],
    rejectedFields,
    warnings,
  };
}
