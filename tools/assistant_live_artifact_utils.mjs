import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OPENAI_KEY_PREFIX = "s" + "k-";
const SECRET_KEY_RE =
  /^(apiKey|api_key|authorization|secret|token|password|credential|proxyToken)$/i;
const SECRET_QUERY_RE =
  /^(token|api[_-]?key|key|secret|signature|password|credential|authorization|access[_-]?token|x-amz-signature)$/i;

function redactString(value) {
  let text = String(value ?? "");
  text = text.replace(
    new RegExp(`\\b${OPENAI_KEY_PREFIX}[A-Za-z0-9_-]+`, "g"),
    `${OPENAI_KEY_PREFIX}[REDACTED]`
  );
  text = text.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]");
  text = text.replace(/\b[A-Za-z]:\\[^"'<>|]+/g, "[REDACTED_PATH]");
  try {
    const url = new URL(text);
    for (const key of [...url.searchParams.keys()]) {
      if (SECRET_QUERY_RE.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.username = "";
    url.password = "";
    url.hash = "";
    return url.toString();
  } catch {
    return text;
  }
}

function isRedactedValue(value) {
  return /^\[(?:REDACTED|REDACTED_PATH)\]$/i.test(String(value ?? "").trim()) ||
    /^Bearer\s+\[REDACTED\]$/i.test(String(value ?? "").trim());
}

function collectUnsafeStringIssues(value, pathName, issues) {
  const text = String(value ?? "");
  if (!text || isRedactedValue(text)) {
    return;
  }
  if (new RegExp(`\\b${OPENAI_KEY_PREFIX}[A-Za-z0-9_-]+`, "i").test(text)) {
    issues.push(`${pathName}: OpenAI-style key`);
  }
  if (/\bBearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]+/i.test(text)) {
    issues.push(`${pathName}: bearer token`);
  }
  if (/\b[A-Za-z]:\\[^"'<>|]+/.test(text)) {
    issues.push(`${pathName}: local path`);
  }
  if (/must-not-leak/i.test(text)) {
    issues.push(`${pathName}: leak sentinel`);
  }
  try {
    const url = new URL(text);
    for (const [key, paramValue] of url.searchParams.entries()) {
      if (SECRET_QUERY_RE.test(key) && String(paramValue || "").trim()) {
        issues.push(`${pathName}: signed URL query ${key}`);
      }
    }
    if (url.username || url.password) {
      issues.push(`${pathName}: URL credential`);
    }
  } catch {
    // Plain strings are handled by the regex checks above.
  }
}

function collectUnsafeArtifactIssues(value, pathName, issues) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => collectUnsafeArtifactIssues(child, `${pathName}[${index}]`, issues));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const childPath = pathName ? `${pathName}.${key}` : key;
      if (SECRET_KEY_RE.test(key)) {
        const serialized = typeof child === "string" ? child : JSON.stringify(child ?? "");
        if (serialized && !isRedactedValue(serialized)) {
          issues.push(`${childPath}: secret field`);
        }
        continue;
      }
      collectUnsafeArtifactIssues(child, childPath, issues);
    }
    return;
  }
  if (typeof value === "string") {
    collectUnsafeStringIssues(value, pathName || "$", issues);
  }
}

export function detectUnsafeArtifactSecrets(value) {
  const issues = [];
  collectUnsafeArtifactIssues(value, "$", issues);
  return {
    safe: issues.length === 0,
    issues,
  };
}

export function sanitizeArtifactValue(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeArtifactValue);
  }
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = SECRET_KEY_RE.test(key) ? "[REDACTED]" : sanitizeArtifactValue(child);
    }
    return result;
  }
  if (typeof value === "string") {
    return redactString(value);
  }
  return value;
}

export function buildRunId(prefix = "assistant-live") {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

export async function createArtifactBundle({
  outputDir = "output/regression/assistant-live",
  runId = buildRunId(),
} = {}) {
  const artifactDir = path.resolve(outputDir, runId);
  const screenshotsDir = path.join(artifactDir, "screenshots");
  await mkdir(screenshotsDir, { recursive: true });
  return { runId, artifactDir, screenshotsDir };
}

export async function writeSanitizedJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(sanitizeArtifactValue(value), null, 2), "utf8");
}

export async function writeTextArtifact(filePath, text) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, redactString(text), "utf8");
}

export function buildArtifactSummary({
  runId,
  success,
  failedStep = "",
  artifactDir = "",
  issues = [],
  model = null,
  screenshotPaths = [],
  scorecard = null,
} = {}) {
  return sanitizeArtifactValue({
    runId,
    success: Boolean(success),
    failedStep,
    artifactDir,
    issues,
    model,
    screenshotPaths,
    scorecard,
  });
}
