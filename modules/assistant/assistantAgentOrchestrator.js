const MULTI_AGENT_SCHEMA_VERSION = "canvas-agent-multi-agent-v1";

const AGENTS = Object.freeze([
  {
    role: "storyboard",
    title: "Storyboard Agent",
    allowedActions: ["create_node", "connect_nodes", "update_node_data", "rename_node"],
    permissionSummary: "Creates and edits storyboard/script structure only.",
  },
  {
    role: "prompt",
    title: "Prompt Agent",
    allowedActions: ["update_node_data", "rename_node", "create_node"],
    permissionSummary: "Edits prompt and copy nodes without generation.",
  },
  {
    role: "layout",
    title: "Layout Agent",
    allowedActions: ["layout_nodes", "move_nodes", "create_group", "rename_node", "focus_nodes", "set_viewport"],
    permissionSummary: "Arranges canvas layout and focus only.",
  },
  {
    role: "generation",
    title: "Generation Agent",
    allowedActions: ["queue_generation_task", "run_prompt_preset_generation"],
    permissionSummary: "Queues text/image generation; video stays gated by confirmation.",
  },
  {
    role: "qa",
    title: "QA Agent",
    allowedActions: [],
    permissionSummary: "Read-only QA review and audit notes.",
  },
]);

const ROLE_ORDER = AGENTS.map((agent) => agent.role);

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function actionType(action) {
  return String(action?.type || action?.action || action?.actionType || action?.operation || "").trim();
}

function actionData(action) {
  return action?.data && typeof action.data === "object" ? action.data : {};
}

function actionMetadata(action) {
  return action?.metadata && typeof action.metadata === "object" ? action.metadata : {};
}

function actionRole(action) {
  const data = actionData(action);
  const metadata = actionMetadata(action);
  return String(action?.agentRole || data.agentRole || metadata.agentRole || inferAgentRole(action)).trim();
}

function nodeType(action) {
  const data = actionData(action);
  return String(action?.nodeType || data.nodeType || data.type || "").trim();
}

function inferAgentRole(action) {
  const type = actionType(action);
  if (["layout_nodes", "move_nodes", "create_group", "focus_nodes", "set_viewport"].includes(type)) {
    return "layout";
  }
  if (["queue_generation_task", "run_prompt_preset_generation"].includes(type)) {
    return "generation";
  }
  if (["update_node_data", "rename_node"].includes(type)) {
    return "prompt";
  }
  if (type === "create_node" || type === "connect_nodes") {
    return "storyboard";
  }
  return "qa";
}

function agentFor(role) {
  return AGENTS.find((agent) => agent.role === role) || null;
}

function cloneJson(value) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export function buildAssistantAgentRoster() {
  return {
    schemaVersion: MULTI_AGENT_SCHEMA_VERSION,
    agents: cloneJson(AGENTS),
  };
}

export function validateAssistantAgentPlan({
  agentRole = "",
  actions = [],
  videoAuthorized = false,
} = {}) {
  const role = String(agentRole || "").trim();
  const agent = agentFor(role);
  const errors = [];
  if (!agent) {
    return { valid: false, errors: [`unknown agent role ${role || "<missing>"}`] };
  }
  const allowed = new Set(agent.allowedActions);
  for (const action of safeArray(actions)) {
    const type = actionType(action);
    if (!allowed.has(type)) {
      errors.push(`${role} agent cannot use ${type || "<missing>"}`);
      continue;
    }
    if (
      role === "generation" &&
      nodeType(action) === "ai-video" &&
      videoAuthorized !== true
    ) {
      errors.push("generation agent cannot start video generation without authorization");
    }
  }
  return { valid: errors.length === 0, errors };
}

export function buildAssistantMultiAgentPlan({
  intent = "",
  actions = [],
  videoAuthorized = false,
} = {}) {
  const actionList = safeArray(actions);
  const tasks = [];
  const errors = [];
  for (const role of ROLE_ORDER) {
    const roleActions = actionList.filter((action) => actionRole(action) === role);
    if (!roleActions.length && role !== "qa") {
      continue;
    }
    const validation = validateAssistantAgentPlan({
      agentRole: role,
      actions: roleActions,
      videoAuthorized,
    });
    errors.push(...validation.errors);
    const agent = agentFor(role);
    tasks.push({
      agentRole: role,
      title: agent.title,
      intent: String(intent || ""),
      actionCount: roleActions.length,
      actions: cloneJson(roleActions),
      permissions: {
        allowedActions: [...agent.allowedActions],
        summary: agent.permissionSummary,
      },
    });
  }
  const handoffs = [];
  for (let index = 1; index < tasks.length; index += 1) {
    handoffs.push({
      from: tasks[index - 1].agentRole,
      to: tasks[index].agentRole,
    });
  }
  return {
    schemaVersion: MULTI_AGENT_SCHEMA_VERSION,
    intent: String(intent || ""),
    tasks,
    handoffs,
    validation: {
      valid: errors.length === 0,
      errors,
    },
  };
}
