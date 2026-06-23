const DEFAULT_STORAGE_KEY = "huanying.canvasAgent.generationTasks.v1";

export const AssistantGenerationTaskStatus = Object.freeze({
  PendingRenderer: "pendingRenderer",
  Queued: "queued",
  Submitting: "submitting",
  Running: "running",
  Completed: "completed",
  Failed: "failed",
  Retryable: "retryable",
  Cancelled: "cancelled",
  Paused: "paused",
});

const ALLOWED_TRANSITIONS = Object.freeze({
  [AssistantGenerationTaskStatus.PendingRenderer]: new Set([
    AssistantGenerationTaskStatus.Submitting,
    AssistantGenerationTaskStatus.Retryable,
    AssistantGenerationTaskStatus.Cancelled,
  ]),
  [AssistantGenerationTaskStatus.Queued]: new Set([
    AssistantGenerationTaskStatus.Submitting,
    AssistantGenerationTaskStatus.Running,
    AssistantGenerationTaskStatus.Cancelled,
  ]),
  [AssistantGenerationTaskStatus.Submitting]: new Set([
    AssistantGenerationTaskStatus.Running,
    AssistantGenerationTaskStatus.Retryable,
    AssistantGenerationTaskStatus.Failed,
    AssistantGenerationTaskStatus.Cancelled,
  ]),
  [AssistantGenerationTaskStatus.Running]: new Set([
    AssistantGenerationTaskStatus.Completed,
    AssistantGenerationTaskStatus.Failed,
    AssistantGenerationTaskStatus.Paused,
    AssistantGenerationTaskStatus.Cancelled,
  ]),
  [AssistantGenerationTaskStatus.Paused]: new Set([
    AssistantGenerationTaskStatus.Running,
    AssistantGenerationTaskStatus.Cancelled,
    AssistantGenerationTaskStatus.Retryable,
  ]),
  [AssistantGenerationTaskStatus.Retryable]: new Set([
    AssistantGenerationTaskStatus.PendingRenderer,
    AssistantGenerationTaskStatus.Submitting,
    AssistantGenerationTaskStatus.Cancelled,
  ]),
  [AssistantGenerationTaskStatus.Completed]: new Set(),
  [AssistantGenerationTaskStatus.Failed]: new Set([AssistantGenerationTaskStatus.Retryable]),
  [AssistantGenerationTaskStatus.Cancelled]: new Set(),
});

function canTransition(from, to) {
  return Boolean(ALLOWED_TRANSITIONS[from]?.has(to));
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${random}`;
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

function normalizeStatus(status) {
  const value = String(status || "").trim();
  return Object.values(AssistantGenerationTaskStatus).includes(value)
    ? value
    : AssistantGenerationTaskStatus.Queued;
}

function sanitizeTask(raw, { idFactory = createId, clock = nowIso } = {}) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const id = String(raw.id || idFactory("gen")).trim();
  return {
    id,
    idempotencyKey: raw.idempotencyKey ? String(raw.idempotencyKey) : "",
    projectId: raw.projectId ? String(raw.projectId) : "",
    transactionId: raw.transactionId ? String(raw.transactionId) : "",
    conversationId: raw.conversationId ? String(raw.conversationId) : "",
    messageId: raw.messageId ? String(raw.messageId) : "",
    traceId: raw.traceId ? String(raw.traceId) : "",
    nodeId: raw.nodeId ? String(raw.nodeId) : "",
    nodeType: raw.nodeType ? String(raw.nodeType) : "",
    provider: raw.provider ? String(raw.provider) : "",
    model: raw.model ? String(raw.model) : "",
    prompt: raw.prompt ? String(raw.prompt) : "",
    references: safeArray(raw.references).map(cloneJson),
    status: normalizeStatus(raw.status),
    result: raw.result && typeof raw.result === "object" ? cloneJson(raw.result) : {},
    error: raw.error ? String(raw.error) : "",
    createdAt: raw.createdAt || clock(),
    updatedAt: raw.updatedAt || raw.createdAt || clock(),
    startedAt: raw.startedAt || "",
    completedAt: raw.completedAt || "",
  };
}

function readStorage(storage, key) {
  if (!storage || typeof storage.getItem !== "function") {
    return [];
  }
  const text = storage.getItem(key);
  if (!text) {
    return [];
  }
  try {
    const parsed = JSON.parse(text);
    return safeArray(parsed?.tasks || parsed).map(sanitizeTask).filter(Boolean);
  } catch {
    return [];
  }
}

function writeStorage(storage, key, tasks) {
  if (!storage || typeof storage.setItem !== "function") {
    return;
  }
  storage.setItem(
    key,
    JSON.stringify({
      version: 1,
      updatedAt: nowIso(),
      tasks,
    })
  );
}

export function createAssistantGenerationTaskStore({
  storage = globalThis.localStorage,
  storageKey = DEFAULT_STORAGE_KEY,
  clock = nowIso,
  idFactory = createId,
} = {}) {
  let tasks = readStorage(storage, storageKey);

  function persist() {
    writeStorage(storage, storageKey, tasks);
  }

  function findIndex(id) {
    return tasks.findIndex((task) => task.id === String(id || ""));
  }

  function update(id, updater) {
    const index = findIndex(id);
    if (index < 0) {
      return null;
    }
    const next = updater(tasks[index]);
    if (!next) {
      return null;
    }
    next.updatedAt = clock();
    tasks[index] = next;
    persist();
    return cloneJson(next);
  }

  function transition(id, status, patch = {}) {
    return update(id, (task) => {
      if (!canTransition(task.status, status)) {
        return null;
      }
      return {
        ...task,
        ...patch,
        status,
      };
    });
  }

  return {
    list(filter = {}) {
      const status = filter.status ? normalizeStatus(filter.status) : "";
      const conversationId = filter.conversationId ? String(filter.conversationId) : "";
      const nodeId = filter.nodeId ? String(filter.nodeId) : "";
      const projectId = filter.projectId ? String(filter.projectId) : "";
      return cloneJson(
        tasks.filter((task) => {
          if (projectId && task.projectId !== projectId) {
            return false;
          }
          if (status && task.status !== status) {
            return false;
          }
          if (conversationId && task.conversationId !== conversationId) {
            return false;
          }
          if (nodeId && task.nodeId !== nodeId) {
            return false;
          }
          return true;
        })
      );
    },

    get(id) {
      const task = tasks[findIndex(id)];
      return task ? cloneJson(task) : null;
    },

    queue(raw = {}) {
      const task = sanitizeTask(
        {
          ...raw,
          status: raw.status || AssistantGenerationTaskStatus.Queued,
          createdAt: raw.createdAt || clock(),
          updatedAt: raw.updatedAt || clock(),
        },
        { idFactory, clock }
      );
      tasks.push(task);
      persist();
      return cloneJson(task);
    },

    queueOnce(raw = {}) {
      const idempotencyKey = String(raw.idempotencyKey || "").trim();
      if (idempotencyKey) {
        const existing = tasks.find((task) => task.idempotencyKey === idempotencyKey);
        if (existing) {
          return cloneJson(existing);
        }
      }
      return this.queue(raw);
    },

    submit(id) {
      return transition(id, AssistantGenerationTaskStatus.Submitting, { error: "" });
    },

    start(id) {
      const task = this.get(id);
      return transition(id, AssistantGenerationTaskStatus.Running, {
        startedAt: task?.startedAt || clock(),
        error: "",
      });
    },

    complete(id, result = {}) {
      return transition(id, AssistantGenerationTaskStatus.Completed, {
        result: result && typeof result === "object" ? cloneJson(result) : {},
        error: "",
        completedAt: clock(),
      });
    },

    fail(id, error) {
      return transition(id, AssistantGenerationTaskStatus.Failed, {
        error: String(error || "Generation failed."),
        completedAt: clock(),
      });
    },

    markRetryable(id, error) {
      return transition(id, AssistantGenerationTaskStatus.Retryable, {
        error: String(error || "Generation can be retried."),
        completedAt: clock(),
      });
    },

    pause(id) {
      return transition(id, AssistantGenerationTaskStatus.Paused, {});
    },

    cancel(id) {
      return transition(id, AssistantGenerationTaskStatus.Cancelled, {
        completedAt: clock(),
      });
    },

    retry(id) {
      const task = this.get(id);
      if (
        !task ||
        (task.status !== AssistantGenerationTaskStatus.Failed &&
          task.status !== AssistantGenerationTaskStatus.Retryable)
      ) {
        return null;
      }
      return this.queue({
        ...task,
        id: idFactory("gen"),
        status: AssistantGenerationTaskStatus.PendingRenderer,
        result: {},
        error: "",
        startedAt: "",
        completedAt: "",
        createdAt: clock(),
        updatedAt: clock(),
      });
    },

    clearCompleted() {
      const before = tasks.length;
      tasks = tasks.filter(
        (task) =>
          task.status !== AssistantGenerationTaskStatus.Completed &&
          task.status !== AssistantGenerationTaskStatus.Cancelled
      );
      persist();
      return before - tasks.length;
    },

    importTasks(records = [], { projectId = "" } = {}) {
      const targetProjectId = String(projectId || "").trim();
      let imported = 0;
      let skipped = 0;
      for (const raw of safeArray(records)) {
        const task = sanitizeTask(raw, { idFactory, clock });
        if (!task) {
          skipped += 1;
          continue;
        }
        if (targetProjectId && task.projectId !== targetProjectId) {
          skipped += 1;
          continue;
        }
        const index = findIndex(task.id);
        const next = {
          ...task,
          projectId: targetProjectId || task.projectId,
          updatedAt: task.updatedAt || clock(),
        };
        if (index >= 0) {
          tasks[index] = next;
        } else {
          tasks.push(next);
        }
        imported += 1;
      }
      if (imported) {
        persist();
      }
      return { imported, skipped };
    },
  };
}
