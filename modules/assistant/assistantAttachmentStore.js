const DEFAULT_ALLOWED_KINDS = new Set(["image", "video", "document"]);

export const AssistantAttachmentUsage = Object.freeze({
  Style: "style",
  Character: "character",
  Composition: "composition",
  Product: "product",
  FirstFrame: "firstFrame",
  Mask: "mask",
  General: "general",
});

function createId(prefix) {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${random}`;
}

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

function kindFromMime(mime) {
  const value = String(mime || "").toLowerCase();
  if (value.startsWith("image/")) {
    return "image";
  }
  if (value.startsWith("video/")) {
    return "video";
  }
  return "document";
}

function sanitizeUrl(url) {
  const value = String(url || "").trim();
  if (!value) {
    return "";
  }
  if (/^[a-z]:\\/i.test(value) || value.startsWith("\\\\")) {
    return "";
  }
  return value;
}

function safeContextPreviewUrl(url) {
  const value = sanitizeUrl(url);
  if (value.startsWith("blob:") || value.startsWith("data:")) {
    return "";
  }
  return value;
}

function sanitizeAttachment(raw, { idFactory = createId, clock = nowIso } = {}) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const mime = String(raw.mime || raw.type || "").trim();
  const kind = String(raw.kind || kindFromMime(mime)).trim();
  if (!DEFAULT_ALLOWED_KINDS.has(kind)) {
    return null;
  }
  const id = String(raw.id || idFactory("att")).trim();
  return {
    id,
    kind,
    name: String(raw.name || raw.fileName || id).trim() || id,
    mime,
    size: Number(raw.size || 0) || 0,
    width: Number(raw.width || 0) || 0,
    height: Number(raw.height || 0) || 0,
    assetId: raw.assetId ? String(raw.assetId) : "",
    previewUrl: sanitizeUrl(raw.previewUrl || raw.url || ""),
    usage: String(raw.usage || "reference").trim() || "reference",
    thumbnailHint: String(raw.thumbnailHint || "").trim(),
    createdAt: raw.createdAt || clock(),
    metadata: raw.metadata && typeof raw.metadata === "object" ? cloneJson(raw.metadata) : {},
  };
}

export function createAssistantAttachmentStore({
  uploader = null,
  idFactory = createId,
  clock = nowIso,
} = {}) {
  let attachments = [];

  function snapshot() {
    return attachments.map(cloneJson);
  }

  return {
    list() {
      return snapshot();
    },

    get(id) {
      const attachment = attachments.find((item) => item.id === String(id || ""));
      return attachment ? cloneJson(attachment) : null;
    },

    add(raw) {
      const attachment = sanitizeAttachment(raw, { idFactory, clock });
      if (!attachment) {
        throw new Error("Unsupported assistant attachment.");
      }
      attachments = attachments.filter((item) => item.id !== attachment.id);
      attachments.push(attachment);
      return cloneJson(attachment);
    },

    async upload(file, options = {}) {
      if (typeof uploader !== "function") {
        throw new TypeError("assistant attachment uploader is required");
      }
      const uploaded = await uploader(file, options);
      return this.add({
        name: file?.name,
        mime: file?.type,
        size: file?.size,
        ...uploaded,
        usage: options.usage || uploaded?.usage || "reference",
      });
    },

    remove(id) {
      const before = attachments.length;
      attachments = attachments.filter((item) => item.id !== String(id || ""));
      return attachments.length !== before;
    },

    setUsage(id, usage) {
      const attachment = attachments.find((item) => item.id === String(id || ""));
      if (!attachment) {
        return null;
      }
      attachment.usage = String(usage || "reference").trim() || "reference";
      return cloneJson(attachment);
    },

    toContext() {
      return attachments.map((attachment) => ({
        id: attachment.id,
        kind: attachment.kind,
        name: attachment.name,
        mime: attachment.mime,
        size: attachment.size,
        width: attachment.width,
        height: attachment.height,
        dimensions: {
          width: attachment.width,
          height: attachment.height,
        },
        assetId: attachment.assetId,
        previewUrl: safeContextPreviewUrl(attachment.previewUrl),
        usage: attachment.usage,
        thumbnailHint: attachment.thumbnailHint,
      }));
    },

    resolveMention(token) {
      const text = String(token || "").replace(/^@/, "").trim().toLowerCase();
      if (!text) {
        return null;
      }
      const attachment = attachments.find(
        (item) => item.id.toLowerCase() === text || item.name.toLowerCase() === text
      );
      return attachment ? cloneJson(attachment) : null;
    },

    clear() {
      attachments = [];
    },
  };
}
