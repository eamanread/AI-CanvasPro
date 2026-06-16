// Single rule source for sensitive-data handling, shared by the assistant
// contract sanitizer (assistantProtocol.js) and the director context
// sanitizer (modules/directorBrain/directorContextSchema.js). Any new rule
// must be added HERE so the two layers cannot drift apart.

export const SENSITIVE_KEY_PATTERN =
  /(api|secret|token|key|password|credential|authorization|headers|cookie|localpath|filepath|path)/i;

const WINDOWS_PATH_RE = /\b[A-Za-z]:\\[^"'<>|\s]+/g;
const POSIX_HOME_PATH_RE = /(?:^|[\s"'(])\/(?:home|Users)\/[^"'<>|\s)]+/g;
const OPENAI_KEY_RE = /\bsk-[A-Za-z0-9_-]+/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

// Known-safe schema keys that the broad pattern would otherwise eat.
// Keep this list short and exact — every entry is a policy field whose NAME
// mentions sensitive words but whose VALUE is a boolean/flag, not a secret.
const SAFE_KEY_EXCEPTIONS = new Set([
  "redactedlocalpaths",
  "videogenerationrequiresconfirmation",
  "writebackallowed",
]);

export function isSensitiveKey(key) {
  const normalized = String(key ?? "").toLowerCase();
  if (SAFE_KEY_EXCEPTIONS.has(normalized)) {
    return false;
  }
  return SENSITIVE_KEY_PATTERN.test(normalized);
}

export function redactSensitiveText(value) {
  return String(value ?? "")
    .replace(WINDOWS_PATH_RE, "[REDACTED_PATH]")
    .replace(POSIX_HOME_PATH_RE, "[REDACTED_PATH]")
    .replace(BEARER_RE, "Bearer [REDACTED]")
    .replace(OPENAI_KEY_RE, "sk-[REDACTED]");
}
