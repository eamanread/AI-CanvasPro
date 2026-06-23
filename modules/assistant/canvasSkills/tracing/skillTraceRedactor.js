const SECRET_KEY_PATTERN = /api[_-]?key|access[_-]?token|refresh[_-]?token|proxy[_-]?token|authorization|secret|password|credential|cookie|headers/i;
const SIGNED_QUERY_PATTERN = /^(token|api[_-]?key|key|secret|signature|x-amz-signature|access[_-]?token|authorization)$/i;

function redactString(value) {
  const text = String(value ?? "");
  const withoutBearer = text
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]+/gi, "sk-[REDACTED]")
    .replace(/data:[^;,\s]+;base64,[A-Za-z0-9+/=]{80,}/gi, "data:[REDACTED_BASE64]");
  try {
    const parsed = new URL(withoutBearer);
    let changed = false;
    for (const key of [...parsed.searchParams.keys()]) {
      if (SIGNED_QUERY_PATTERN.test(key)) {
        parsed.searchParams.delete(key);
        changed = true;
      }
    }
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    return changed ? parsed.toString() : withoutBearer;
  } catch {
    return withoutBearer;
  }
}

export function redactSkillTrace(value) {
  if (value === undefined || typeof value === "function") return undefined;
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactSkillTrace).filter((item) => item !== undefined);
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      output[key] = "[REDACTED]";
      continue;
    }
    const redacted = redactSkillTrace(child);
    if (redacted !== undefined) output[key] = redacted;
  }
  return output;
}
