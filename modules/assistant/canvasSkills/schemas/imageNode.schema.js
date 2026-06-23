import { FIELD_STATUS, createField } from "./field.js";

const NODE_TYPES = ["ai-image"];

export const IMAGE_NODE_SCHEMA = Object.freeze({
  nodeType: "ai-image",
  fields: Object.freeze([
    createField({ key: "prompt", nodeTypes: NODE_TYPES, description: "Image generation prompt." }),
    createField({ key: "modelId", label: "Model", nodeTypes: NODE_TYPES, aliases: ["model", "modelName", "modelDisplayName"] }),
    createField({ key: "provider", nodeTypes: NODE_TYPES }),
    createField({ key: "aspectRatio", nodeTypes: NODE_TYPES }),
    createField({ key: "imageSize", nodeTypes: NODE_TYPES }),
    createField({ key: "quality", nodeTypes: NODE_TYPES }),
    createField({ key: "batchSize", type: "integer", nodeTypes: NODE_TYPES, min: 1, max: 8, defaultValue: 1 }),
    createField({ key: "references", type: "array", nodeTypes: NODE_TYPES }),
    createField({ key: "presetId", nodeTypes: NODE_TYPES }),
    createField({ key: "presetName", nodeTypes: NODE_TYPES }),
    createField({ key: "template", nodeTypes: NODE_TYPES }),
    createField({ key: "inputs", type: "object", nodeTypes: NODE_TYPES }),
    // PLANNED for the agent, but the director envelope may write it
    // (plan-time creative output, not agent improvisation). Generation-
    // side consumption is a later slice; landing it keeps the field
    // visible on the node and in dailies.
    createField({
      key: "negativePrompt",
      nodeTypes: NODE_TYPES,
      status: FIELD_STATUS.PLANNED,
      agentWritable: false,
      trustedSources: ["qmai-director"],
    }),
    ...[
      "seed",
      "steps",
      "guidanceScale",
      "sampler",
      "style",
      "lora",
      "controlNet",
      "referenceWeights",
      "background",
      "safetyLevel",
    ].map((key) => createField({ key, nodeTypes: NODE_TYPES, status: FIELD_STATUS.PLANNED, agentWritable: false })),
    // Director lineage (qmai-director-export/v1 -> node -> canvas-
    // dailies, CONTRACTS.md invariant 7): written only by the trusted
    // director execution path, never by the agent.
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
    // ViMax lineage (vimax-shotplan/v1 -> node -> render-ticket, α′ F8):
    // written only by the trusted ViMax execution path, never by the
    // agent. Separate channel from qmai-director (must not be conflated).
    // shotIdx/camIdx are integers (shotplan idx is numeric) so writeback
    // can match on them without string/number === traps.
    // shotIdx/camIdx/charIdx are integers so writeback + group selection
    // match without string/number === traps. charIdx groups a character's
    // three-view 定妆 set (P3); view is the view name (front/side/back).
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
