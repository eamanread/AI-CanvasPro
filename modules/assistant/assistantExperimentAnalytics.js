const EVENT_SCHEMA_VERSION = "canvas-agent-experiment-event-v1";
const METRICS_SCHEMA_VERSION = "canvas-agent-experiment-metrics-v1";

function nowIso() {
  return new Date().toISOString();
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
  for (const [key, child] of Object.entries(value)) {
    if (/api[_-]?key|access[_-]?token|authorization|secret|password|credential|localPath|filePath|absolutePath/i.test(key)) {
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

function normalizeEvent(raw = {}, clock = nowIso) {
  const type = safeString(raw.type || raw.eventType);
  if (!type) {
    return null;
  }
  return sanitizeJson({
    schemaVersion: EVENT_SCHEMA_VERSION,
    id: safeString(raw.id) || `exp_${Math.random().toString(36).slice(2, 12)}`,
    type,
    projectId: safeString(raw.projectId),
    teamId: safeString(raw.teamId),
    templateId: safeString(raw.templateId),
    variantId: safeString(raw.variantId || raw.variant),
    generationTaskId: safeString(raw.generationTaskId),
    userId: safeString(raw.userId),
    success: raw.success === undefined ? undefined : raw.success === true,
    accepted: raw.accepted === undefined ? undefined : raw.accepted === true,
    error: safeString(raw.error),
    createdAt: safeString(raw.createdAt) || clock(),
  });
}

function rate(numerator, denominator) {
  if (!denominator) {
    return 0;
  }
  return Number((numerator / denominator).toFixed(4));
}

function summarizeGroup(events, { templateId = "", variantId = "" } = {}) {
  const scoped = events.filter((event) => {
    if (templateId && event.templateId !== templateId) {
      return false;
    }
    if (variantId && event.variantId !== variantId) {
      return false;
    }
    return true;
  });
  const generationEvents = scoped.filter((event) =>
    ["generation_completed", "generation_failed"].includes(event.type)
  );
  const adoptionEvents = scoped.filter((event) => event.type === "user_adopted");
  return {
    appliedCount: scoped.filter((event) => event.type === "template_applied").length,
    generationCount: generationEvents.length,
    generationSuccessRate: rate(
      generationEvents.filter((event) => event.type === "generation_completed" || event.success === true).length,
      generationEvents.length
    ),
    adoptionCount: adoptionEvents.length,
    userAdoptionRate: rate(
      adoptionEvents.filter((event) => event.accepted !== false).length,
      adoptionEvents.length
    ),
  };
}

export function summarizeAssistantExperimentMetrics(events = [], filter = {}) {
  const projectId = safeString(filter.projectId);
  const teamId = safeString(filter.teamId);
  const scoped = safeArray(events).filter((event) => {
    if (projectId && event.projectId !== projectId) {
      return false;
    }
    if (teamId && event.teamId !== teamId) {
      return false;
    }
    return true;
  });
  const templateIds = [...new Set(scoped.map((event) => event.templateId).filter(Boolean))].sort();
  const templates = templateIds.map((templateId) => {
    const templateEvents = scoped.filter((event) => event.templateId === templateId);
    const variantIds = [...new Set(templateEvents.map((event) => event.variantId).filter(Boolean))].sort();
    return {
      templateId,
      ...summarizeGroup(scoped, { templateId }),
      variants: variantIds.map((variantId) => ({
        variantId,
        ...summarizeGroup(scoped, { templateId, variantId }),
      })),
    };
  });
  return {
    schemaVersion: METRICS_SCHEMA_VERSION,
    counts: {
      totalEvents: scoped.length,
      templateCount: templates.length,
    },
    templates,
  };
}

export function createAssistantExperimentAnalytics({ clock = nowIso } = {}) {
  let events = [];
  return {
    recordEvent(raw = {}) {
      const event = normalizeEvent(raw, clock);
      if (!event) {
        return null;
      }
      events.push(event);
      return cloneJson(event);
    },
    listEvents(filter = {}) {
      const projectId = safeString(filter.projectId);
      const teamId = safeString(filter.teamId);
      return cloneJson(
        events.filter((event) => {
          if (projectId && event.projectId !== projectId) {
            return false;
          }
          if (teamId && event.teamId !== teamId) {
            return false;
          }
          return true;
        })
      );
    },
    summary(filter = {}) {
      return summarizeAssistantExperimentMetrics(events, filter);
    },
  };
}
