const DEFAULT_STORAGE_KEY = "huanying.canvasAgent.workflowTemplates.v1";

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

function sanitizeIdPart(value, fallback = "workflow-template") {
  const text = safeString(value)
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return text || fallback;
}

function looksLikeLocalPath(value) {
  const text = safeString(value);
  return /^[a-z]:\\/i.test(text) || text.startsWith("\\\\") || text.startsWith("/") || text.includes("\\");
}

function isDangerousField(key, value) {
  const name = safeString(key);
  if (/api[_-]?key|access[_-]?token|secret|password|credential|authorization/i.test(name)) {
    return true;
  }
  if (/^(localPath|filePath|filesystemPath|absolutePath|shellCommand|command)$/i.test(name)) {
    return true;
  }
  return /path$/i.test(name) && looksLikeLocalPath(value);
}

function sanitizeJson(value, key = "") {
  if (value === undefined || typeof value === "function") {
    return undefined;
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJson(item)).filter((item) => item !== undefined);
  }
  const output = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (isDangerousField(entryKey, entryValue)) {
      continue;
    }
    const sanitized = sanitizeJson(entryValue, entryKey);
    if (sanitized !== undefined) {
      output[entryKey] = sanitized;
    }
  }
  return output;
}

function safeStringList(value, limit = 12) {
  if (!Array.isArray(value)) {
    const text = safeString(value);
    return text ? [text] : [];
  }
  return value.map(safeString).filter(Boolean).slice(0, limit);
}

function sanitizeTemplateRecord(raw, { projectId = "", clock = nowIso } = {}) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const templateId = sanitizeIdPart(raw.templateId || raw.id || raw.name, "");
  if (!templateId) {
    return null;
  }
  const timestamp = clock();
  const ownerProjectId = safeString(raw.projectId || projectId);
  const scope = safeString(raw.scope).toLowerCase() === "team" ? "team" : "project";
  const nodes = safeArray(raw.nodes).map((node) => sanitizeJson(node)).filter(Boolean);
  const edges = safeArray(raw.edges).map((edge) => sanitizeJson(edge)).filter(Boolean);
  const nodeIds = safeArray(raw.nodeIds)
    .map(safeString)
    .filter(Boolean);
  const derivedNodeIds = nodes.map((node) => safeString(node?.id || node?.nodeId)).filter(Boolean);
  return {
    templateId,
    name: safeString(raw.name || raw.title) || templateId,
    description: safeString(raw.description),
    scope,
    projectId: ownerProjectId,
    teamId: safeString(raw.teamId),
    version: safeString(raw.version || raw.templateVersion) || "1.0.0",
    author: safeString(raw.author),
    tags: safeStringList(raw.tags),
    reviewStatus: safeString(raw.reviewStatus),
    reviewRequestedBy: safeString(raw.reviewRequestedBy),
    reviewRequestedAt: safeString(raw.reviewRequestedAt),
    reviewNote: safeString(raw.reviewNote),
    reviewedBy: safeString(raw.reviewedBy || raw.reviewer),
    reviewedAt: safeString(raw.reviewedAt),
    reviewDecision: safeString(raw.reviewDecision),
    reviewComment: safeString(raw.reviewComment),
    publishedBy: safeString(raw.publishedBy),
    publishedAt: safeString(raw.publishedAt),
    reuseCount: Number.isFinite(Number(raw.reuseCount)) ? Number(raw.reuseCount) : 0,
    lastReusedBy: safeString(raw.lastReusedBy),
    lastReusedAt: safeString(raw.lastReusedAt),
    lastReuseProjectId: safeString(raw.lastReuseProjectId),
    deprecated: raw.deprecated === true,
    deprecatedReason: safeString(raw.deprecatedReason),
    deprecatedBy: safeString(raw.deprecatedBy),
    deprecatedAt: safeString(raw.deprecatedAt),
    rollbackOf: safeString(raw.rollbackOf),
    rollbackToVersion: safeString(raw.rollbackToVersion),
    nodeIds: nodeIds.length ? nodeIds : derivedNodeIds,
    nodes,
    edges,
    metadata: raw.metadata && typeof raw.metadata === "object" ? sanitizeJson(raw.metadata) : {},
    createdAt: safeString(raw.createdAt) || timestamp,
    updatedAt: safeString(raw.updatedAt) || timestamp,
  };
}

function readStorage(storage, key, options) {
  if (!storage || typeof storage.getItem !== "function") {
    return [];
  }
  const text = storage.getItem(key);
  if (!text) {
    return [];
  }
  try {
    const parsed = JSON.parse(text);
    return safeArray(parsed?.templates || parsed)
      .map((record) => sanitizeTemplateRecord(record, options))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function writeStorage(storage, key, templates, clock = nowIso) {
  if (!storage || typeof storage.setItem !== "function") {
    return;
  }
  storage.setItem(
    key,
    JSON.stringify({
      version: 1,
      updatedAt: clock(),
      templates,
    })
  );
}

export function createAssistantWorkflowTemplateStore({
  storage = globalThis.localStorage,
  storageKey = DEFAULT_STORAGE_KEY,
  projectId = "",
  teamId = "",
  clock = nowIso,
} = {}) {
  const ownerProjectId = safeString(projectId);
  const ownerTeamId = safeString(teamId);
  let templates = readStorage(storage, storageKey, { projectId: ownerProjectId, clock });

  function persist() {
    writeStorage(storage, storageKey, templates, clock);
  }

  function recordScope(record) {
    return safeString(record?.scope).toLowerCase() === "team" ? "team" : "project";
  }

  function inProject(record) {
    return recordScope(record) === "project" && safeString(record?.projectId) === ownerProjectId;
  }

  function inTeam(record) {
    return (
      recordScope(record) === "team" &&
      ownerTeamId &&
      safeString(record?.teamId) === ownerTeamId
    );
  }

  function inScope(record, scope = "project") {
    const normalized = safeString(scope || "project").toLowerCase();
    if (normalized === "team") {
      return inTeam(record);
    }
    if (normalized === "all") {
      return inProject(record) || inTeam(record);
    }
    return inProject(record);
  }

  function matching(templateId, options = {}) {
    const id = sanitizeIdPart(templateId, "");
    const templateVersion = safeString(options.version);
    const scope = safeString(options.scope || "project").toLowerCase();
    return templates.filter((record) => {
      if (record.templateId !== id || !inScope(record, scope)) {
        return false;
      }
      return !templateVersion || record.version === templateVersion;
    });
  }

  function latestRecord(templateId, options = {}) {
    const candidates = matching(templateId, options);
    return candidates.length ? candidates[candidates.length - 1] : null;
  }

  function replaceOrAppend(record) {
    const index = templates.findIndex(
      (item) =>
        item.templateId === record.templateId &&
        item.version === record.version &&
        item.projectId === record.projectId &&
        recordScope(item) === recordScope(record) &&
        safeString(item.teamId) === safeString(record.teamId)
    );
    if (index >= 0) {
      templates[index] = record;
    } else {
      templates.push(record);
    }
    persist();
    return cloneJson(record);
  }

  return {
    save(raw = {}) {
      const scope = safeString(raw.scope).toLowerCase() === "team" ? "team" : "project";
      const record = sanitizeTemplateRecord(
        {
          ...raw,
          scope,
          projectId: scope === "team" ? raw.projectId : ownerProjectId || raw.projectId,
          teamId: scope === "team" ? raw.teamId || ownerTeamId : raw.teamId,
          updatedAt: clock(),
        },
        { projectId: ownerProjectId, clock }
      );
      if (!record) {
        return null;
      }
      return replaceOrAppend(record);
    },

    get(templateId, options = {}) {
      const record = latestRecord(templateId, options);
      return record ? cloneJson(record) : null;
    },

    list(filter = {}) {
      const includeDeprecated = filter.includeDeprecated === true;
      const scope = safeString(filter.scope || "project").toLowerCase();
      const latestById = new Map();
      for (const record of templates) {
        if (!inScope(record, scope)) {
          continue;
        }
        latestById.set(record.templateId, record);
      }
      const list = [...latestById.values()].filter(
        (record) => includeDeprecated || record.deprecated !== true
      );
      return cloneJson(list);
    },

    submitForReview(templateId, { author = "", note = "", version = "" } = {}) {
      const record = latestRecord(templateId, { scope: "project", version });
      if (!record) {
        return null;
      }
      record.reviewStatus = "pending_review";
      record.reviewRequestedBy = safeString(author) || record.author;
      record.reviewRequestedAt = clock();
      record.reviewNote = safeString(note);
      record.updatedAt = clock();
      persist();
      return cloneJson(record);
    },

    review(templateId, { decision = "approve", reviewer = "", note = "", version = "" } = {}) {
      const record = latestRecord(templateId, { scope: "project", version });
      if (!record) {
        return null;
      }
      const normalizedDecision = safeString(decision).toLowerCase() === "reject" ? "rejected" : "approved";
      record.reviewStatus = normalizedDecision;
      record.reviewDecision = normalizedDecision;
      record.reviewedBy = safeString(reviewer);
      record.reviewedAt = clock();
      record.reviewComment = safeString(note);
      record.updatedAt = clock();
      persist();
      return cloneJson(record);
    },

    publish(templateId, { teamId = ownerTeamId, publishedBy = "", version = "" } = {}) {
      const source = latestRecord(templateId, { scope: "project", version });
      const targetTeamId = safeString(teamId);
      if (!source || !targetTeamId) {
        return null;
      }
      return replaceOrAppend(
        sanitizeTemplateRecord(
          {
            ...source,
            scope: "team",
            teamId: targetTeamId,
            reviewStatus: "published",
            publishedBy: safeString(publishedBy),
            publishedAt: clock(),
            deprecated: false,
            updatedAt: clock(),
          },
          { projectId: ownerProjectId, clock }
        )
      );
    },

    recordReuse(templateId, { scope = "project", userId = "", consumerProjectId = "" } = {}) {
      const record =
        latestRecord(templateId, { scope }) ||
        (safeString(scope || "project").toLowerCase() === "project"
          ? latestRecord(templateId, { scope: "team" })
          : null);
      if (!record) {
        return null;
      }
      record.reuseCount = Number(record.reuseCount || 0) + 1;
      record.lastReusedBy = safeString(userId);
      record.lastReusedAt = clock();
      record.lastReuseProjectId = safeString(consumerProjectId || ownerProjectId);
      record.updatedAt = clock();
      persist();
      return cloneJson(record);
    },

    deprecate(templateId, { scope = "project", reason = "", author = "" } = {}) {
      const record = latestRecord(templateId, { scope });
      if (!record) {
        return null;
      }
      record.deprecated = true;
      record.deprecatedReason = safeString(reason);
      record.deprecatedBy = safeString(author);
      record.deprecatedAt = clock();
      record.updatedAt = clock();
      persist();
      return cloneJson(record);
    },

    rollback(templateId, { scope = "project", toVersion = "", version = "", author = "" } = {}) {
      const current = latestRecord(templateId, { scope });
      const target = latestRecord(templateId, { scope, version: toVersion });
      if (!current || !target) {
        return null;
      }
      return this.save({
        ...target,
        version: safeString(version) || `${target.version}-rollback`,
        author: safeString(author) || target.author,
        deprecated: false,
        deprecatedReason: "",
        deprecatedBy: "",
        deprecatedAt: "",
        rollbackOf: current.version,
        rollbackToVersion: target.version,
        createdAt: clock(),
        updatedAt: clock(),
      });
    },

    importTemplates(records = []) {
      let imported = 0;
      let skipped = 0;
      for (const raw of safeArray(records)) {
        const record = sanitizeTemplateRecord(raw, { projectId: ownerProjectId, clock });
        if (!record) {
          skipped += 1;
          continue;
        }
        const scope = recordScope(record);
        const allowed =
          (scope === "project" && record.projectId === ownerProjectId) ||
          (scope === "team" && ownerTeamId && record.teamId === ownerTeamId);
        if (!allowed) {
          skipped += 1;
          continue;
        }
        replaceOrAppend(record);
        imported += 1;
      }
      return { imported, skipped };
    },
  };
}
