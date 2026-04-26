export const FEATURE_SELECTIONS_STORAGE_KEY = "v2-feature-selections";

const NODE_MODULE_KEY_MAP = {
  "ai-text": "ai-text",
  "ai-image": "ai-image",
  "ai-video": "ai-video",
  "ai-audio": "ai-audio",
};

const NODE_DEFAULT_SELECTIONS = {
  "ai-text": {
    selectedModelId: "mdl_text_default_gemini_3_1",
    selectedModelNameSnapshot: "gemini-3.1",
    modelDeleted: false,
  },
  "ai-image": {
    selectedModelId: "mdl_image_default_nano_banana_2",
    selectedModelNameSnapshot: "NanoBanana-2",
    modelDeleted: false,
    model: "nano-banana-2",
    provider: "registry-openai",
    rhInstanceType: "default",
  },
  "ai-video": {
    model: "runninghub/1971148165531475969",
    provider: "runninghubwf",
    resolution: "720p",
    duration: 5,
    rhInstanceType: "default",
  },
  "ai-audio": {
    model: "indextts2_clone",
    provider: "runninghubwf",
    audioWorkflowKey: "indextts2_clone",
    rhInstanceType: "default",
  },
};

const NODE_MEMORY_SELECTION_FIELDS = {
  "ai-text": [
    "selectedModelId",
    "selectedModelNameSnapshot",
    "modelDeleted",
    "model",
    "provider",
  ],
  "ai-image": [
    "selectedModelId",
    "selectedModelNameSnapshot",
    "modelDeleted",
    "model",
    "provider",
    "aspectRatio",
    "imageSize",
    "batchSize",
    "rhResolution",
    "rhInstanceType",
  ],
  "ai-video": [
    "model",
    "provider",
    "imageSize",
    "resolution",
    "duration",
    "mode",
    "dreaminaRouteMode",
    "rhInstanceType",
    "aspectRatio",
    "rhVideoFrames",
    "rhVideoSeconds",
    "rhVideoResolution",
    "rhVideoFps",
  ],
  "ai-audio": ["model", "provider", "audioWorkflowKey", "rhInstanceType"],
};

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasUsableValue(value) {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value === "boolean") {
    return true;
  }
  return false;
}

function toModuleKey(nodeType) {
  return NODE_MODULE_KEY_MAP[String(nodeType || "").trim()] || "";
}

function ensureModuleRecord(record, moduleKey) {
  if (!isPlainObject(record[moduleKey])) {
    record[moduleKey] = {};
  }
  return record[moduleKey];
}

function hasOwnField(record, field) {
  return !!record && Object.prototype.hasOwnProperty.call(record, field);
}

export function sanitizeFeatureSelectionsRecord(record) {
  if (!isPlainObject(record)) {
    return {};
  }

  const sanitized = {};
  for (const [moduleKey, moduleRecord] of Object.entries(record)) {
    if (!isPlainObject(moduleRecord)) {
      continue;
    }

    const nextRecord = {};
    for (const [field, value] of Object.entries(moduleRecord)) {
      if (hasUsableValue(value)) {
        nextRecord[String(field)] = value;
      }
    }

    if (Object.keys(nextRecord).length > 0) {
      sanitized[String(moduleKey)] = nextRecord;
    }
  }

  return sanitized;
}

export function applyFeatureSelectionsToNodeData(nodeData, selections) {
  if (!isPlainObject(nodeData)) {
    return nodeData;
  }

  const nodeType = String(nodeData.type || "").trim();
  const moduleKey = toModuleKey(nodeType);
  if (!moduleKey) {
    return nodeData;
  }

  const defaults = NODE_DEFAULT_SELECTIONS[nodeType] || {};
  const memoryFields = NODE_MEMORY_SELECTION_FIELDS[nodeType] || [];
  const moduleSelections = isPlainObject(selections?.[moduleKey])
    ? selections[moduleKey]
    : {};
  const nextNodeData = { ...nodeData };

  for (const field of memoryFields) {
    if (hasOwnField(nodeData, field)) {
      continue;
    }
    if (!hasUsableValue(moduleSelections[field])) {
      continue;
    }
    nextNodeData[field] = moduleSelections[field];
  }

  for (const [field, value] of Object.entries(defaults)) {
    if (hasOwnField(nodeData, field)) {
      continue;
    }
    if (hasUsableValue(nextNodeData[field])) {
      continue;
    }
    nextNodeData[field] = value;
  }

  const hasModelField = hasOwnField(nodeData, "model");
  const hasAudioWorkflowKeyField = hasOwnField(nodeData, "audioWorkflowKey");
  if (
    nodeType === "ai-audio" &&
    hasModelField &&
    !hasAudioWorkflowKeyField &&
    hasUsableValue(nextNodeData.model)
  ) {
    const normalizedModel = String(nextNodeData.model).trim();
    if (normalizedModel === "indextts2_clone" || normalizedModel === "voice_convert") {
      nextNodeData.audioWorkflowKey = normalizedModel;
    }
  }

  if (
    nodeType === "ai-audio" &&
    hasAudioWorkflowKeyField &&
    !hasModelField &&
    hasUsableValue(nextNodeData.audioWorkflowKey)
  ) {
    nextNodeData.model = String(nextNodeData.audioWorkflowKey).trim();
  }

  if (!hasUsableValue(nextNodeData.model) && hasUsableValue(nextNodeData.audioWorkflowKey)) {
    nextNodeData.model = String(nextNodeData.audioWorkflowKey).trim();
  }

  return nextNodeData;
}

export function captureFeatureSelectionsFromNodePatch(nodeData, patch, selections) {
  const nodeType = String(nodeData?.type || "").trim();
  const moduleKey = toModuleKey(nodeType);
  if (!moduleKey || !isPlainObject(patch) || !isPlainObject(selections)) {
    return false;
  }

  const memoryFields = NODE_MEMORY_SELECTION_FIELDS[nodeType] || [];
  if (memoryFields.length === 0) {
    return false;
  }

  const moduleRecord = ensureModuleRecord(selections, moduleKey);
  let changed = false;

  for (const field of memoryFields) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) {
      continue;
    }
    const nextValue = patch[field];
    if (!hasUsableValue(nextValue)) {
      continue;
    }
    if (moduleRecord[field] === nextValue) {
      continue;
    }
    moduleRecord[field] = nextValue;
    changed = true;
  }

  if (
    Object.prototype.hasOwnProperty.call(patch, "model") &&
    !Object.prototype.hasOwnProperty.call(patch, "audioWorkflowKey") &&
    nodeType === "ai-audio" &&
    hasUsableValue(patch.model)
  ) {
    const normalizedModel = String(patch.model).trim();
    if (normalizedModel === "indextts2_clone" || normalizedModel === "voice_convert") {
      if (moduleRecord.audioWorkflowKey !== normalizedModel) {
        moduleRecord.audioWorkflowKey = normalizedModel;
        changed = true;
      }
    }
  }

  return changed;
}
