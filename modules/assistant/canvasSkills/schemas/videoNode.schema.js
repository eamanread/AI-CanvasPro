import { FIELD_STATUS, createField } from "./field.js";

const NODE_TYPES = ["ai-video"];

export const VIDEO_NODE_SCHEMA = Object.freeze({
  nodeType: "ai-video",
  fields: Object.freeze([
    createField({ key: "prompt", nodeTypes: NODE_TYPES, description: "Video generation prompt." }),
    createField({ key: "modelId", label: "Model", nodeTypes: NODE_TYPES, aliases: ["model", "modelName", "modelDisplayName"] }),
    createField({ key: "provider", nodeTypes: NODE_TYPES }),
    createField({ key: "duration", type: "number", nodeTypes: NODE_TYPES, min: 0 }),
    createField({ key: "fps", type: "number", nodeTypes: NODE_TYPES, min: 0 }),
    createField({ key: "resolution", nodeTypes: NODE_TYPES }),
    createField({ key: "references", type: "array", nodeTypes: NODE_TYPES }),
    createField({ key: "presetId", nodeTypes: NODE_TYPES }),
    createField({ key: "presetName", nodeTypes: NODE_TYPES }),
    createField({ key: "template", nodeTypes: NODE_TYPES }),
    createField({ key: "inputs", type: "object", nodeTypes: NODE_TYPES }),
    createField({
      key: "negativePrompt",
      nodeTypes: NODE_TYPES,
      status: FIELD_STATUS.PLANNED,
      agentWritable: false,
      trustedSources: ["qmai-director"],
    }),
    ...[
      "cameraMotion",
      "motionStrength",
      "firstFrame",
      "lastFrame",
      "seed",
      "aspectRatio",
      "style",
      "audio",
      "loop",
      "transition",
    ].map((key) => createField({ key, nodeTypes: NODE_TYPES, status: FIELD_STATUS.PLANNED, agentWritable: false })),
    // Director lineage - see imageNode.schema.js for the rationale.
    ...["qmaiPromptId", "qmaiShotId", "dramaticBeat", "shotContinuity"].map((key) =>
      createField({ key, nodeTypes: NODE_TYPES, status: FIELD_STATUS.INTERNAL, agentWritable: false, trustedSources: ["qmai-director"] }),
    ),
    createField({
      key: "continuityAnchors",
      type: "array",
      nodeTypes: NODE_TYPES,
      status: FIELD_STATUS.INTERNAL,
      agentWritable: false,
      trustedSources: ["qmai-director"],
    }),
    // ViMax lineage (α′ F8) - see imageNode.schema.js for the rationale.
    ...["vimaxShotIdx", "vimaxCamIdx", "vimaxCharIdx"].map((key) =>
      createField({ key, type: "integer", min: 0, nodeTypes: NODE_TYPES, status: FIELD_STATUS.INTERNAL, agentWritable: false, trustedSources: ["vimax-director"] }),
    ),
    ...["vimaxFlowId", "vimaxRole", "assetRole", "vimaxView"].map((key) =>
      createField({ key, nodeTypes: NODE_TYPES, status: FIELD_STATUS.INTERNAL, agentWritable: false, trustedSources: ["vimax-director"] }),
    ),
    createField({
      key: "skillRefs",
      type: "array",
      nodeTypes: NODE_TYPES,
      status: FIELD_STATUS.INTERNAL,
      agentWritable: false,
      trustedSources: ["vimax-director"],
    }),
  ]),
});
