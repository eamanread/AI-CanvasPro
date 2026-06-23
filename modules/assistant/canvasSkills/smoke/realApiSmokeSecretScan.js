const SECRET_KEY_RE = /^(apiKey|api_key|authorization|headers|token|proxyToken|accessToken|refreshToken|secret|password|credential|cookie)$/i;
const SECRET_QUERY_KEY_RE = /^(token|api[_-]?key|key|secret|signature|X-Amz-Signature|access_token|authorization|password|credential)$/i;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const OPENAI_SECRET_RE = /\bsk-[A-Za-z0-9_-]{16,}\b/g;
const LONG_BASE64_RE = /\b[A-Za-z0-9+/]{400,}={0,2}\b/g;
const DATA_URL_RE = /data:[^"'\s<>]+/gi;

function redactString(value) {
  let next = String(value ?? "");
  next = next.replace(BEARER_RE, "[REDACTED_BEARER]");
  next = next.replace(OPENAI_SECRET_RE, "sk-[REDACTED]");
  next = next.replace(DATA_URL_RE, "[REDACTED_DATA_URL]");
  next = next.replace(LONG_BASE64_RE, "[REDACTED_BASE64]");
  next = next.replace(/https?:\/\/[^\s"'<>]+/gi, (url) => {
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
      return "[REDACTED_URL]";
    }
  });
  return next;
}

export function redactSmokeArtifact(value, seen = new WeakSet()) {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);
    const result = value.map((item) => redactSmokeArtifact(item, seen));
    seen.delete(value);
    return result;
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = SECRET_KEY_RE.test(key) ? "[REDACTED]" : redactSmokeArtifact(child, seen);
    }
    seen.delete(value);
    return result;
  }
  return value;
}

export function scanSmokeArtifactForSecrets(value) {
  const body = JSON.stringify(value || {});
  const findings = [];
  const patterns = [
    ["authorization", /\bAuthorization\b/i],
    ["bearer", /\bBearer\s+[A-Za-z0-9._~+/=-]+/i],
    ["openai-secret", OPENAI_SECRET_RE],
    ["secret-query", /[?&](token|api[_-]?key|secret|signature|X-Amz-Signature|access_token)=((?!%5BREDACTED%5D|\[REDACTED\])[^&#]+)/i],
    ["long-base64", LONG_BASE64_RE],
    ["raw-data-url", DATA_URL_RE],
  ];
  for (const [name, pattern] of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(body)) {
      findings.push(name);
    }
  }
  return {
    status: findings.length ? "failed" : "passed",
    totalFindings: findings.length,
    findings,
  };
}
