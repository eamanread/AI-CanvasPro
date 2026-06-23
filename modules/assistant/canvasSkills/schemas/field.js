export const FIELD_STATUS = Object.freeze({
  SUPPORTED: "supported",
  PLANNED: "planned",
  DEPRECATED: "deprecated",
  INTERNAL: "internal",
});

export function createField({
  key,
  label = key,
  type = "string",
  status = FIELD_STATUS.SUPPORTED,
  nodeTypes = [],
  aliases = [],
  mapsTo = key,
  agentWritable = status === FIELD_STATUS.SUPPORTED,
  uiReusable = true,
  redaction = "none",
  // Writers whose actions may set this field even when it is not
  // agent-writable. The source is a code-determined execution option
  // (never an action field - action metadata is LLM-forgeable).
  trustedSources = [],
  min,
  max,
  defaultValue,
  description = "",
} = {}) {
  return Object.freeze({
    key,
    label,
    type,
    status,
    nodeTypes: Object.freeze([...nodeTypes]),
    aliases: Object.freeze([...aliases]),
    mapsTo,
    agentWritable,
    uiReusable,
    redaction,
    trustedSources: Object.freeze([...trustedSources]),
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    description,
  });
}
