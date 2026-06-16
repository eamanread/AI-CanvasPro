import { FIELD_STATUS, createField } from "./field.js";

const NODE_TYPES = ["ai-text"];

export const TEXT_NODE_SCHEMA = Object.freeze({
  nodeType: "ai-text",
  fields: Object.freeze([
    createField({ key: "prompt", nodeTypes: NODE_TYPES, description: "Text generation prompt." }),
    createField({ key: "modelId", label: "Model", nodeTypes: NODE_TYPES, aliases: ["model", "modelName", "modelDisplayName"] }),
    createField({ key: "provider", nodeTypes: NODE_TYPES }),
    createField({ key: "references", type: "array", nodeTypes: NODE_TYPES }),
    createField({ key: "presetId", nodeTypes: NODE_TYPES }),
    createField({ key: "presetName", nodeTypes: NODE_TYPES }),
    createField({ key: "template", nodeTypes: NODE_TYPES }),
    createField({ key: "inputs", type: "object", nodeTypes: NODE_TYPES }),
    ...["temperature", "topP", "maxTokens", "systemPrompt", "responseFormat", "tools", "memoryPolicy"].map((key) =>
      createField({ key, nodeTypes: NODE_TYPES, status: FIELD_STATUS.PLANNED, agentWritable: false })
    ),
  ]),
});
