import fs from "node:fs";
import path from "node:path";

export const REAL_API_SMOKE_SCHEMA_VERSION = "canvas-agent-real-api-smoke-v1";

export function writeSmokeJsonArtifact({ artifact, outputDir }) {
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(outputDir, `real-api-smoke-${stamp}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return filePath;
}

export function normalizeSmokeArtifact({ artifact = {}, schemaVersion = REAL_API_SMOKE_SCHEMA_VERSION } = {}) {
  return {
    schemaVersion,
    mode: artifact.mode || "Module",
    status: artifact.status || "failed",
    failureCategory: artifact.failureCategory || "",
    timeoutMs: Number(artifact.timeoutMs || 0),
    textModel: artifact.textModel || { configured: false },
    imageModel: artifact.imageModel || { configured: false },
    createdNodeId: artifact.createdNodeId || "",
    submission: artifact.submission || { accepted: false },
    warnings: Array.isArray(artifact.warnings) ? artifact.warnings : [],
    secretScan: artifact.secretScan || { status: "not_run", totalFindings: 0 },
    startedAt: artifact.startedAt || "",
    endedAt: artifact.endedAt || "",
    ...artifact,
  };
}
