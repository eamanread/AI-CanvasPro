const DEFAULT_STORAGE_KEY = "huanying.canvasAgent.conversations.v1";

function nowIso() {
  return new Date().toISOString();
}

const SIGNED_QUERY_PATTERN = /^(token|api[_-]?key|key|secret|signature|x-amz-signature|access[_-]?token|authorization)$/i;

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

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function sanitizeJson(value) {
  if (value === undefined || typeof value === "function") {
    return undefined;
  }
  if (typeof value === "string") {
    return sanitizeReferenceUrl(value)
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
      .replace(/\bsk-[A-Za-z0-9_-]+/gi, "sk-[REDACTED]")
      .replace(/data:[^;,\s]+;base64,[A-Za-z0-9+/=]{80,}/gi, "data:[REDACTED_BASE64]");
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeJson).filter((item) => item !== undefined);
  }
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (/api[_-]?key|access[_-]?token|refresh[_-]?token|proxy[_-]?token|authorization|secret|password|credential|headers|cookie/i.test(key)) {
      continue;
    }
    const sanitized = sanitizeJson(item);
    if (sanitized !== undefined) {
      output[key] = sanitized;
    }
  }
  return output;
}

function sanitizeReferenceUrl(url) {
  const value = String(url || "").trim();
  if (!value || /^[a-z]:\\/i.test(value) || value.startsWith("\\\\")) {
    return "";
  }
  try {
    const parsed = new URL(value);
    for (const key of [...parsed.searchParams.keys()]) {
      if (SIGNED_QUERY_PATTERN.test(key)) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return value;
  }
}

function sanitizeGenerationReference(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const id = raw.id ? String(raw.id) : "";
  const assetId = raw.assetId ? String(raw.assetId) : "";
  const url = raw.url || raw.previewUrl;
  return {
    id,
    kind: raw.kind ? String(raw.kind) : "",
    name: raw.name ? String(raw.name) : "",
    mime: raw.mime ? String(raw.mime) : "",
    size: Number(raw.size || 0) || 0,
    width: Number(raw.width || 0) || 0,
    height: Number(raw.height || 0) || 0,
    assetId,
    previewUrl: sanitizeReferenceUrl(url),
    usage: raw.usage ? String(raw.usage) : "reference",
  };
}

function sanitizeGenerationTask(raw, { clock = nowIso, idFactory = createId } = {}) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  return {
    id: raw.id ? String(raw.id) : idFactory("gen"),
    nodeId: raw.nodeId ? String(raw.nodeId) : "",
    nodeType: raw.nodeType ? String(raw.nodeType) : "",
    status: String(raw.status || "queued"),
    provider: raw.provider ? String(raw.provider) : "",
    model: raw.model ? String(raw.model) : "",
    prompt: raw.prompt ? String(raw.prompt) : "",
    references: safeArray(raw.references).map(sanitizeGenerationReference).filter(Boolean),
    createdAt: raw.createdAt || clock(),
    updatedAt: raw.updatedAt || clock(),
    error: raw.error ? String(raw.error) : "",
  };
}

function sanitizeConversation(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const id = String(raw.id || "").trim();
  if (!id) {
    return null;
  }
  const createdAt = raw.createdAt || nowIso();
  return {
    id,
    title: String(raw.title || "新会话").trim() || "新会话",
    projectId: raw.projectId ? String(raw.projectId) : "",
    workspaceId: raw.workspaceId ? String(raw.workspaceId) : "",
    canvasId: raw.canvasId ? String(raw.canvasId) : "",
    createdAt,
    updatedAt: raw.updatedAt || createdAt,
    assistantIntent:
      raw.assistantIntent && typeof raw.assistantIntent === "object"
        ? sanitizeJson(raw.assistantIntent)
        : null,
    model: raw.model && typeof raw.model === "object" ? sanitizeJson(raw.model) : null,
    messages: safeArray(raw.messages).map(sanitizeJson),
    contextSnapshots: safeArray(raw.contextSnapshots).map(sanitizeJson),
    transactions: safeArray(raw.transactions).map(sanitizeJson),
    generationTasks: safeArray(raw.generationTasks).map((task) => sanitizeGenerationTask(task)).filter(Boolean),
    receipts: safeArray(raw.receipts).map(sanitizeJson),
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
    return safeArray(parsed?.conversations || parsed).map(sanitizeConversation).filter(Boolean);
  } catch {
    return [];
  }
}

function serializeConversations(conversations) {
  return JSON.stringify({
    version: 1,
    updatedAt: nowIso(),
    conversations,
  });
}

function isQuotaExceeded(error) {
  if (!error) {
    return false;
  }
  return (
    error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error.code === 22 ||
    error.code === 1014 ||
    /quota|exceeded/i.test(String(error.message || error.name || ""))
  );
}

// 配额超限时就地渐进裁剪(原数组引用与内存态一致): 先从最旧会话剥离重字段(上下文快照/事务/票据/生成任务
// 是体积主因), 再整条删除最旧会话(保留≥1条), 最后裁剪仅存会话的历史消息。返回 false 表示已无可裁剪。
function pruneConversationsOneStep(conversations) {
  const HEAVY_FIELDS = ["contextSnapshots", "transactions", "receipts", "generationTasks"];
  const byOldest = conversations
    .map((conversation) => conversation)
    .sort((left, right) =>
      String(left.updatedAt || "").localeCompare(String(right.updatedAt || "")),
    );
  for (const conversation of byOldest) {
    for (const field of HEAVY_FIELDS) {
      if (Array.isArray(conversation[field]) && conversation[field].length) {
        conversation[field] = [];
        return true;
      }
    }
  }
  if (conversations.length > 1) {
    const idx = conversations.indexOf(byOldest[0]);
    if (idx >= 0) {
      conversations.splice(idx, 1);
      return true;
    }
  }
  const last = conversations[0];
  if (last && Array.isArray(last.messages) && last.messages.length > 6) {
    last.messages = last.messages.slice(-6);
    return true;
  }
  return false;
}

function writeStorage(storage, key, conversations) {
  if (!storage || typeof storage.setItem !== "function") {
    return;
  }
  for (let attempt = 0; attempt < 64; attempt += 1) {
    try {
      storage.setItem(key, serializeConversations(conversations));
      return;
    } catch (error) {
      // 仅对配额超限做裁剪重试; 其它错误静默放弃, 绝不让报错冒泡到 UI 形成报错气泡。
      if (!isQuotaExceeded(error)) {
        return;
      }
      if (!pruneConversationsOneStep(conversations)) {
        try {
          storage.setItem(key, serializeConversations(conversations.slice(-1)));
        } catch {
          try {
            storage.removeItem(key);
          } catch {
            /* ignore */
          }
        }
        return;
      }
    }
  }
}

export function createAssistantConversationStore({
  storage = globalThis.localStorage,
  storageKey = DEFAULT_STORAGE_KEY,
  clock = nowIso,
  idFactory = createId,
  api = null,
} = {}) {
  let conversations = readStorage(storage, storageKey);

  function persist() {
    writeStorage(storage, storageKey, conversations);
  }

  function findIndex(id) {
    return conversations.findIndex((conversation) => conversation.id === id);
  }

  function touch(conversation) {
    conversation.updatedAt = clock();
    persist();
    return cloneJson(conversation);
  }

  function updateConversation(id, updater) {
    const index = findIndex(id);
    if (index < 0) {
      return null;
    }
    const next = updater(conversations[index]);
    conversations[index] = next || conversations[index];
    return touch(conversations[index]);
  }

  return {
    list() {
      return cloneJson(
        conversations
          .slice()
          .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
      );
    },

    get(id) {
      const conversation = conversations[findIndex(String(id || ""))];
      return conversation ? cloneJson(conversation) : null;
    },

    create({
      title = "新会话",
      projectId = "",
      workspaceId = "",
      canvasId = "",
      assistantIntent = null,
      model = null,
      inherit = {},
    } = {}) {
      const timestamp = clock();
      const conversation = sanitizeConversation({
        id: idFactory("conv"),
        title,
        projectId,
        workspaceId,
        canvasId,
        createdAt: timestamp,
        updatedAt: timestamp,
        assistantIntent: assistantIntent || inherit.assistantIntent || null,
        model: model || inherit.model || null,
        messages: [],
        contextSnapshots: [],
        transactions: [],
        generationTasks: [],
        receipts: [],
      });
      conversations.push(conversation);
      persist();
      return cloneJson(conversation);
    },

    async ensureConversation(payload = {}) {
      if (api && typeof api.createConversation === "function") {
        try {
          const response = await api.createConversation(payload);
          const remote = sanitizeConversation(response?.conversation || response?.data?.conversation || response);
          if (remote) {
            const index = findIndex(remote.id);
            if (index >= 0) {
              conversations[index] = remote;
            } else {
              conversations.push(remote);
            }
            persist();
            return cloneJson(remote);
          }
        } catch {
          // Fall back to a local draft below; callers can keep working offline.
        }
      }
      return this.create(payload);
    },

    rename(id, title) {
      return updateConversation(String(id || ""), (conversation) => ({
        ...conversation,
        title: String(title || "").trim() || conversation.title,
      }));
    },

    delete(id) {
      const index = findIndex(String(id || ""));
      if (index < 0) {
        return false;
      }
      conversations.splice(index, 1);
      persist();
      return true;
    },

    deleteConversation(id) {
      return this.delete(id);
    },

    exportAll() {
      return cloneJson(conversations);
    },

    appendMessage(id, message) {
      return updateConversation(String(id || ""), (conversation) => {
        const nextMessage = {
          id: message?.id || idFactory("msg"),
          role: String(message?.role || "assistant"),
          content: String(message?.content || ""),
          status: String(message?.status || "done"),
          createdAt: message?.createdAt || clock(),
          traceId: message?.traceId ? String(message.traceId) : "",
          cards: safeArray(message?.cards).map(sanitizeJson),
        };
        if (message?.kind) {
          nextMessage.kind = String(message.kind);
        }
        if (message?.queueControl && typeof message.queueControl === "object") {
          nextMessage.queueControl = sanitizeJson(message.queueControl);
        }
        if (message?.executionControl && typeof message.executionControl === "object") {
          nextMessage.executionControl = sanitizeJson(message.executionControl);
        }
        conversation.messages.push(nextMessage);
        return conversation;
      });
    },

    updateMessageCard(id, cardId, patch = {}) {
      const conversation = conversations[findIndex(String(id || ""))];
      const targetCardId = String(cardId || "").trim();
      if (!conversation || !targetCardId) {
        return null;
      }
      for (let messageIndex = conversation.messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
        const message = conversation.messages[messageIndex];
        const cards = safeArray(message?.cards);
        for (let cardIndex = cards.length - 1; cardIndex >= 0; cardIndex -= 1) {
          const card = cards[cardIndex];
          if (String(card?.id || "") !== targetCardId) {
            continue;
          }
          message.cards[cardIndex] = sanitizeJson({
            ...card,
            ...safeObject(patch),
            id: card.id || targetCardId,
          });
          return touch(conversation);
        }
      }
      return null;
    },

    async syncMessage(id, message) {
      const conversation = this.appendMessage(id, message);
      if (api && typeof api.appendConversationMessage === "function") {
        try {
          await api.appendConversationMessage(id, message);
        } catch {
          return conversation ? { ...conversation, syncStatus: "failed" } : null;
        }
      }
      return conversation;
    },

    attachContextSnapshot(id, snapshot) {
      return updateConversation(String(id || ""), (conversation) => {
        conversation.contextSnapshots.push({
          id: snapshot?.id || idFactory("ctx"),
          messageId: snapshot?.messageId ? String(snapshot.messageId) : "",
          createdAt: snapshot?.createdAt || clock(),
          context: cloneJson(snapshot?.context || {}),
        });
        return conversation;
      });
    },

    appendTransaction(id, transaction) {
      return updateConversation(String(id || ""), (conversation) => {
        conversation.transactions.push({
          id: transaction?.id || idFactory("txn"),
          status: String(transaction?.status || "proposed"),
          messageId: transaction?.messageId ? String(transaction.messageId) : "",
          createdAt: transaction?.createdAt || clock(),
          updatedAt: transaction?.updatedAt || clock(),
          actions: safeArray(transaction?.actions).map(cloneJson),
          selectedActionIndexes: safeArray(transaction?.selectedActionIndexes)
            .map((index) => Number(index))
            .filter((index) => Number.isInteger(index) && index >= 0),
          validation:
            transaction?.validation && typeof transaction.validation === "object"
              ? cloneJson(transaction.validation)
              : {},
          receipt:
            transaction?.receipt && typeof transaction.receipt === "object"
              ? cloneJson(transaction.receipt)
              : {},
          receiptId: transaction?.receiptId ? String(transaction.receiptId) : "",
        });
        return conversation;
      });
    },

    appendReceipt(id, receipt) {
      return updateConversation(String(id || ""), (conversation) => {
        conversation.receipts.push({
          id: receipt?.id || idFactory("rcpt"),
          transactionId: receipt?.transactionId ? String(receipt.transactionId) : "",
          createdAt: receipt?.createdAt || clock(),
          success: receipt?.success !== false,
          summary: String(receipt?.summary || ""),
          details: cloneJson(receipt?.details || {}),
        });
        return conversation;
      });
    },

    async syncReceipt(id, receipt) {
      const conversation = this.appendReceipt(id, receipt);
      if (api && typeof api.appendConversationReceipt === "function") {
        try {
          await api.appendConversationReceipt(id, receipt);
        } catch {
          return conversation ? { ...conversation, syncStatus: "failed" } : null;
        }
      }
      return conversation;
    },

    appendGenerationTask(id, task) {
      return updateConversation(String(id || ""), (conversation) => {
        const nextTask = sanitizeGenerationTask(task, { clock, idFactory });
        if (nextTask) {
          conversation.generationTasks.push(nextTask);
        }
        return conversation;
      });
    },

    search(query) {
      const text = String(query || "").trim().toLowerCase();
      if (!text) {
        return this.list();
      }
      return this.list().filter((conversation) => {
        const haystack = [
          conversation.title,
          conversation.projectId,
          conversation.assistantIntent?.id,
          conversation.assistantIntent?.title,
          conversation.model?.provider,
          conversation.model?.model,
          ...conversation.messages.map((message) => message.content),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(text);
      });
    },

    export(id) {
      const conversation = this.get(id);
      if (!conversation) {
        return null;
      }
      return {
        version: 1,
        exportedAt: clock(),
        conversation,
      };
    },

    importConversations(records = [], { projectId = "" } = {}) {
      const targetProjectId = String(projectId || "").trim();
      let imported = 0;
      let skipped = 0;
      for (const raw of safeArray(records)) {
        const sanitized = sanitizeConversation(raw);
        if (!sanitized) {
          skipped += 1;
          continue;
        }
        if (targetProjectId && sanitized.projectId !== targetProjectId) {
          skipped += 1;
          continue;
        }
        const index = findIndex(sanitized.id);
        if (index >= 0) {
          conversations[index] = {
            ...conversations[index],
            ...sanitized,
            projectId: targetProjectId || sanitized.projectId,
          };
        } else {
          conversations.push({
            ...sanitized,
            projectId: targetProjectId || sanitized.projectId,
          });
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
