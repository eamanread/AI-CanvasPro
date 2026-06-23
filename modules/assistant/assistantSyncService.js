const SYNC_SCHEMA_VERSION = "canvas-agent-sync-v1";

function nowIso() {
  return new Date().toISOString();
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
  for (const [key, item] of Object.entries(value)) {
    if (/api[_-]?key|access[_-]?token|proxy[_-]?token|(^|[_-])token($|[_-])|authorization|secret|password|credential|headers|localPath|filePath|absolutePath/i.test(key)) {
      continue;
    }
    const sanitized = sanitizeJson(item);
    if (sanitized !== undefined) {
      output[key] = sanitized;
    }
  }
  return output;
}

function directStoreItems(items, projectId, teamId, matcher = projectMatches) {
  return safeArray(items)
    .filter((item) => matcher(item, projectId, teamId))
    .map(sanitizeJson);
}

function projectMatches(item, projectId) {
  return !projectId || safeString(item?.projectId) === projectId;
}

function templateMatches(item, projectId, teamId) {
  const scope = safeString(item?.scope || "project").toLowerCase();
  if (scope === "team") {
    return Boolean(teamId && safeString(item?.teamId) === teamId);
  }
  return projectMatches(item, projectId);
}

function listStoreItems(store, filter = {}) {
  if (typeof store?.list !== "function") {
    return [];
  }
  try {
    return safeArray(store.list(filter));
  } catch {
    return [];
  }
}

export function createAssistantProjectSyncSnapshot({
  projectId = "",
  teamId = "",
  conversationStore = null,
  generationTaskStore = null,
  templateStore = null,
  conversations = null,
  generationTasks = null,
  workflowTemplates = null,
  deviceId = "",
  clock = nowIso,
} = {}) {
  const targetProjectId = safeString(projectId);
  const targetTeamId = safeString(teamId);
  const snapshotConversations = (conversations ? directStoreItems(conversations, targetProjectId) : listStoreItems(conversationStore)
    .filter((item) => projectMatches(item, targetProjectId))
    .map(sanitizeJson));
  const snapshotGenerationTasks = (generationTasks ? directStoreItems(generationTasks, targetProjectId) : listStoreItems(generationTaskStore, { projectId: targetProjectId })
    .filter((item) => projectMatches(item, targetProjectId))
    .map(sanitizeJson));
  const snapshotWorkflowTemplates = (workflowTemplates ? directStoreItems(workflowTemplates, targetProjectId, targetTeamId, templateMatches) : listStoreItems(templateStore, {
    scope: "all",
    includeDeprecated: true,
  })
    .filter((item) => templateMatches(item, targetProjectId, targetTeamId))
    .map(sanitizeJson));

  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    exportedAt: clock(),
    projectId: targetProjectId,
    teamId: targetTeamId,
    ...(safeString(deviceId) ? { deviceId: safeString(deviceId) } : {}),
    collaboration: {
      mode: "snapshot",
      consistency: "last_writer_wins",
      permissionScope: "project_team",
    },
    conversations: snapshotConversations,
    generationTasks: snapshotGenerationTasks,
    workflowTemplates: snapshotWorkflowTemplates,
  };
}

export function applyAssistantProjectSyncSnapshot({
  projectId = "",
  teamId = "",
  conversationStore = null,
  generationTaskStore = null,
  templateStore = null,
  snapshot = {},
} = {}) {
  const targetProjectId = safeString(projectId || snapshot?.projectId);
  const targetTeamId = safeString(teamId || snapshot?.teamId);
  const source = snapshot && typeof snapshot === "object" ? snapshot : {};
  const conversations = safeArray(source.conversations).filter((item) =>
    projectMatches(item, targetProjectId)
  );
  const generationTasks = safeArray(source.generationTasks).filter((item) =>
    projectMatches(item, targetProjectId)
  );
  const workflowTemplates = safeArray(source.workflowTemplates).filter((item) =>
    templateMatches(item, targetProjectId, targetTeamId)
  );

  const conversationResult =
    typeof conversationStore?.importConversations === "function"
      ? conversationStore.importConversations(conversations, { projectId: targetProjectId })
      : { imported: 0, skipped: conversations.length };
  const generationResult =
    typeof generationTaskStore?.importTasks === "function"
      ? generationTaskStore.importTasks(generationTasks, { projectId: targetProjectId })
      : { imported: 0, skipped: generationTasks.length };
  const templateResult =
    typeof templateStore?.importTemplates === "function"
      ? templateStore.importTemplates(workflowTemplates)
      : { imported: 0, skipped: workflowTemplates.length };

  const skippedByFilter =
    safeArray(source.conversations).length - conversations.length +
    safeArray(source.generationTasks).length - generationTasks.length +
    safeArray(source.workflowTemplates).length - workflowTemplates.length;

  return {
    importedConversations: Number(conversationResult.imported || 0),
    importedGenerationTasks: Number(generationResult.imported || 0),
    importedWorkflowTemplates: Number(templateResult.imported || 0),
    skipped:
      skippedByFilter +
      Number(conversationResult.skipped || 0) +
      Number(generationResult.skipped || 0) +
      Number(templateResult.skipped || 0),
  };
}

export function normalizeAssistantProjectSyncSnapshot(snapshot = {}) {
  const source = snapshot && typeof snapshot === "object" ? snapshot : {};
  return cloneJson({
    schemaVersion: safeString(source.schemaVersion) || SYNC_SCHEMA_VERSION,
    projectId: safeString(source.projectId),
    teamId: safeString(source.teamId),
    deviceId: safeString(source.deviceId),
    collaboration:
      source.collaboration && typeof source.collaboration === "object"
        ? sanitizeJson(source.collaboration)
        : {
            mode: "snapshot",
            consistency: "last_writer_wins",
            permissionScope: "project_team",
          },
    conversations: safeArray(source.conversations).map(sanitizeJson),
    generationTasks: safeArray(source.generationTasks).map(sanitizeJson),
    workflowTemplates: safeArray(source.workflowTemplates).map(sanitizeJson),
  });
}
