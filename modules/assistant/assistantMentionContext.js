const SENSITIVE_KEY_RE = /^(apiKey|api_key|authorization|secret|token|password|credential|file|filePath|path|localPath|absolutePath)$/i;
const OPENAI_KEY_PREFIX = "s" + "k-";
const SENSITIVE_VALUE_PATTERNS = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]"],
  [new RegExp(`\\b${OPENAI_KEY_PREFIX}[A-Za-z0-9_-]+`, "g"), `${OPENAI_KEY_PREFIX}[REDACTED]`],
  [/data:[^\s"'<>]+/gi, "[REDACTED_DATA_URL]"],
  [/blob:[^\s"'<>]+/gi, "[REDACTED_BLOB_URL]"],
  [/\b[A-Za-z]:\\[^"'<>|]+/g, "[REDACTED_PATH]"],
];
const SECRET_QUERY_KEY_RE = /(token|api[_-]?key|key|secret|signature|password|credential|authorization|access[_-]?token)/i;

function safeText(value) {
  return String(value ?? "").trim();
}

function sanitizeUrlQuery(value) {
  return value.replace(/https?:\/\/[^\s"'<>]+/gi, (url) => {
    try {
      const parsed = new URL(url);
      parsed.username = "";
      parsed.password = "";
      for (const key of Array.from(parsed.searchParams.keys())) {
        if (SECRET_QUERY_KEY_RE.test(key)) {
          parsed.searchParams.delete(key);
        }
      }
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return url;
    }
  });
}

function redactString(value) {
  const withoutSensitiveValues = SENSITIVE_VALUE_PATTERNS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value
  );
  return sanitizeUrlQuery(withoutSensitiveValues);
}

function redactValue(value, seen = new WeakSet()) {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const result = value.map((item) => redactValue(item, seen));
    seen.delete(value);
    return result;
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEY_RE.test(key)) continue;
      const redacted = redactValue(child, seen);
      if (redacted !== undefined) result[key] = redacted;
    }
    seen.delete(value);
    return result;
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  return undefined;
}

function normalizeBinding(binding) {
  if (!binding || typeof binding !== "object") return null;
  const id = safeText(binding.id);
  const type = safeText(binding.type);
  if (!id || !type) return null;
  const item = {
    id: redactString(id),
    type: redactString(type),
    label: redactString(safeText(binding.label || id)),
    source: redactString(safeText(binding.source)),
    data: redactValue(binding.raw || binding.data || {}),
  };
  const assetType = safeText(binding.assetType);
  if (assetType) item.assetType = redactString(assetType);
  return item;
}

export function buildAssistantMentionContext(bindings = []) {
  const items = Array.isArray(bindings) ? bindings.map(normalizeBinding).filter(Boolean) : [];
  return items.length ? { mentions: { items } } : {};
}
