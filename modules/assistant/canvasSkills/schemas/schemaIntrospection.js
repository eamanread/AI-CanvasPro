import { getCanvasNodeSchema } from "./index.js";

function collectKeys(...sources) {
  const keys = new Set();
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    if (Array.isArray(source.writableKeys)) {
      for (const key of source.writableKeys) {
        if (key) keys.add(String(key));
      }
    }
    if (source.nodeDefaults && typeof source.nodeDefaults === "object") {
      for (const key of Object.keys(source.nodeDefaults)) {
        if (key) keys.add(key);
      }
    }
  }
  return [...keys];
}

export function introspectSupportedFields({
  nodeType = "",
  nodeDefaults = {},
  mapperSnapshot = {},
  uiControlSnapshot = {},
  modelRegistry = null,
} = {}) {
  const schema = getCanvasNodeSchema(nodeType);
  const classified = new Set();
  if (schema) {
    for (const field of schema.fields) {
      classified.add(field.key);
      for (const alias of field.aliases || []) classified.add(alias);
    }
  }

  const discoveredFields = collectKeys(
    mapperSnapshot,
    uiControlSnapshot,
    { writableKeys: Object.keys(nodeDefaults || {}) },
    modelRegistry?.fieldSnapshot || {}
  );
  const unclassifiedFields = discoveredFields.filter((field) => !classified.has(field));

  return {
    nodeType,
    discoveredFields,
    unclassifiedFields,
  };
}
