import { FIELD_STATUS, createField } from "./field.js";
import { IMAGE_NODE_SCHEMA } from "./imageNode.schema.js";
import { TEXT_NODE_SCHEMA } from "./textNode.schema.js";
import { VIDEO_NODE_SCHEMA } from "./videoNode.schema.js";

const SCHEMAS = Object.freeze({
  "ai-image": IMAGE_NODE_SCHEMA,
  "ai-text": TEXT_NODE_SCHEMA,
  "ai-video": VIDEO_NODE_SCHEMA,
});

export { FIELD_STATUS, createField, IMAGE_NODE_SCHEMA, TEXT_NODE_SCHEMA, VIDEO_NODE_SCHEMA };

export function getCanvasNodeSchema(nodeType) {
  return SCHEMAS[String(nodeType || "").trim()] || null;
}

export function listCanvasNodeSchemas() {
  return Object.values(SCHEMAS);
}

export function listWritableFields(nodeType) {
  const schema = getCanvasNodeSchema(nodeType);
  if (!schema) return [];
  return schema.fields
    .filter((field) => field.status === FIELD_STATUS.SUPPORTED && field.agentWritable !== false)
    .map((field) => field.key);
}

export function findSchemaField(nodeType, inputKey) {
  const key = String(inputKey || "").trim();
  if (!key) return null;
  const schema = getCanvasNodeSchema(nodeType);
  if (!schema) return null;
  return (
    schema.fields.find((field) => field.key === key || field.aliases?.includes(key)) ||
    null
  );
}
