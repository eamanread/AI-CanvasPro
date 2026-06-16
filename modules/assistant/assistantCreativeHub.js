const HUB_SCHEMA_VERSION = "canvas-agent-creative-hub-v1";
const WORKFLOW_SCHEMA_VERSION = "canvas-agent-creative-workflow-v1";

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeString(value) {
  return String(value ?? "").trim();
}

function sanitizeJson(value) {
  if (value === undefined || typeof value === "function") {
    return undefined;
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeJson).filter((item) => item !== undefined);
  }
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (/api[_-]?key|access[_-]?token|proxy[_-]?token|authorization|secret|password|credential|headers|localPath|filePath|absolutePath|signedUrl/i.test(key)) {
      continue;
    }
    const sanitized = sanitizeJson(child);
    if (sanitized !== undefined) {
      output[key] = sanitized;
    }
  }
  return output;
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

function projectMatches(item, projectId) {
  return !projectId || safeString(item?.projectId) === projectId;
}

function teamTemplateMatches(item, teamId) {
  return safeString(item?.scope).toLowerCase() === "team" && teamId && safeString(item?.teamId) === teamId;
}

function templateMatches(item, projectId, teamId) {
  return projectMatches(item, projectId) || teamTemplateMatches(item, teamId);
}

function compactModelCapability(model) {
  const capabilities = safeArray(model?.capabilities).map(safeString).filter(Boolean);
  return {
    id: safeString(model?.id || model?.model || model?.provider),
    provider: safeString(model?.provider),
    model: safeString(model?.model),
    displayName: safeString(model?.displayName || model?.name),
    capabilities,
  };
}

export function buildAssistantCreativeHubContext({
  projectId = "",
  teamId = "",
  templates = [],
  preferences = {},
  assets = [],
  conversations = [],
  modelCapabilities = [],
} = {}) {
  const targetProjectId = safeString(projectId);
  const targetTeamId = safeString(teamId);
  return {
    schemaVersion: HUB_SCHEMA_VERSION,
    projectId: targetProjectId,
    teamId: targetTeamId,
    templates: safeArray(templates)
      .filter((item) => templateMatches(item, targetProjectId, targetTeamId))
      .map(sanitizeJson),
    preferences: sanitizeJson(preferences) || {},
    assets: safeArray(assets)
      .filter((item) => projectMatches(item, targetProjectId))
      .map(sanitizeJson),
    history: safeArray(conversations)
      .filter((item) => projectMatches(item, targetProjectId))
      .map((item) =>
        sanitizeJson({
          id: item.id,
          title: item.title,
          summary: item.summary,
          updatedAt: item.updatedAt,
          assistantIntent: item.assistantIntent,
        })
      ),
    modelCapabilities: safeArray(modelCapabilities)
      .filter((model) => model?.configured !== false)
      .map(compactModelCapability)
      .filter((model) => model.id || model.provider || model.model),
  };
}

function firstTemplate(context) {
  return safeArray(context?.templates)[0] || null;
}

function firstAsset(context) {
  return safeArray(context?.assets)[0] || null;
}

function firstHistory(context) {
  return safeArray(context?.history)[0] || null;
}

function firstModel(context, capability = "action_planning") {
  return (
    safeArray(context?.modelCapabilities).find((model) => safeArray(model.capabilities).includes(capability)) ||
    safeArray(context?.modelCapabilities)[0] ||
    null
  );
}

export function recommendCreativeHubWorkflow({
  intent = "",
  projectId = "",
  sourceProjectId = "",
  context = {},
} = {}) {
  const hub = context && typeof context === "object" ? context : {};
  const steps = [];
  const template = firstTemplate(hub);
  const asset = firstAsset(hub);
  const history = firstHistory(hub);
  const model = firstModel(hub);
  if (template) {
    steps.push({ kind: "template", templateId: safeString(template.templateId || template.id), name: safeString(template.name) });
  }
  if (hub.preferences && Object.keys(hub.preferences).length) {
    steps.push({ kind: "preferences", preferences: cloneJson(hub.preferences) });
  }
  if (asset) {
    steps.push({ kind: "asset", assetId: safeString(asset.id || asset.assetId), usage: safeString(asset.usage || "reference") });
  }
  if (history) {
    steps.push({ kind: "history", conversationId: safeString(history.id), title: safeString(history.title) });
  }
  if (model) {
    steps.push({ kind: "model", modelId: safeString(model.id), capabilities: safeArray(model.capabilities) });
  }
  return sanitizeJson({
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    intent: safeString(intent),
    projectId: safeString(projectId || hub.projectId),
    sourceProjectId: safeString(sourceProjectId),
    steps,
  });
}
