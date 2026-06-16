import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { detectUnsafeArtifactSecrets } from "./assistant_live_artifact_utils.mjs";

export const REQUIRED_R5_SCREENSHOTS = Object.freeze([
  "01-open-panel.png",
  "02-model-dropdown.png",
  "03-streaming.png",
  "04-action-preview.png",
  "05-applied-receipt.png",
  "06-history-restore.png",
  "07-generation-pending.png",
  "08-video-strong-confirm.png",
]);

export const REQUIRED_R5_CHECKS = Object.freeze([
  "panelOpen",
  "modelDropdown",
  "streaming",
  "actionPreview",
  "applyReceipt",
  "historyRestore",
  "generationGate",
  "pendingState",
  "secretSafety",
]);

const REQUIRED_ARTIFACT_FILES = Object.freeze([
  "summary.md",
  "summary.json",
  "scorecard.json",
  "trace.json",
  "console.json",
  "network.json",
  "assistant-state.json",
  "graph-before.json",
  "graph-after.json",
  "p0-p4-live-artifact-provenance.json",
]);

const PROVENANCE_SCHEMA = "canvas-agent-r5-artifact-provenance-v1";
const REQUIRED_PROVENANCE_PREFLIGHTS = Object.freeze([
  "frontend regression",
  "backend regression",
  "P0-P4 audit",
  "P4 platform regression",
]);

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath, issues) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    issues.push(`${path.basename(filePath)}: invalid JSON (${error?.message || error})`);
    return {};
  }
}

async function collectArtifactFiles(artifactDir) {
  const entries = await readdir(artifactDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(artifactDir, entry.name))
    .filter((filePath) => /\.(?:json|md|txt)$/i.test(filePath));
}

async function validateSecretSafety(artifactDir, issues) {
  for (const filePath of await collectArtifactFiles(artifactDir)) {
    const name = path.basename(filePath);
    const raw = await readFile(filePath, "utf8");
    const value = /\.json$/i.test(filePath) ? JSON.parse(raw) : raw;
    const detection = detectUnsafeArtifactSecrets(value);
    if (!detection.safe) {
      for (const issue of detection.issues) {
        issues.push(`${name}: ${issue}`);
      }
    }
  }
}

async function validateOptionalRealApiSmoke(artifactDir, issues) {
  const smokePath = path.join(artifactDir, "real-api-smoke.json");
  if (!(await exists(smokePath))) {
    return;
  }
  const smoke = await readJson(smokePath, issues);
  if (smoke.schemaVersion !== "canvas-agent-real-api-smoke-v1") {
    issues.push("real-api-smoke.json: schemaVersion must be canvas-agent-real-api-smoke-v1");
  }
  if (smoke.secretScan?.status !== "passed") {
    issues.push("real-api-smoke.json: secret scan must pass");
  }
  if (smoke.status === "passed" && smoke.submission?.accepted !== true) {
    issues.push("real-api-smoke.json: passed smoke must include accepted submission");
  }
}

async function validateRequiredFiles(artifactDir, issues) {
  for (const fileName of REQUIRED_ARTIFACT_FILES) {
    const filePath = path.join(artifactDir, fileName);
    if (!(await exists(filePath))) {
      issues.push(`missing artifact file ${fileName}`);
      continue;
    }
    const fileStat = await stat(filePath);
    if (fileStat.size <= 0) {
      issues.push(`empty artifact file ${fileName}`);
    }
  }
}

async function validateScreenshots(artifactDir, issues) {
  const screenshotsDir = path.join(artifactDir, "screenshots");
  if (!(await exists(screenshotsDir))) {
    issues.push("missing screenshots directory");
    return { screenshotCount: 0 };
  }
  let screenshotCount = 0;
  for (const name of REQUIRED_R5_SCREENSHOTS) {
    const filePath = path.join(screenshotsDir, name);
    if (!(await exists(filePath))) {
      issues.push(`missing screenshot ${name}`);
      continue;
    }
    const fileStat = await stat(filePath);
    if (fileStat.size <= 0) {
      issues.push(`empty screenshot ${name}`);
      continue;
    }
    screenshotCount += 1;
  }
  return { screenshotCount };
}

function validateSummary({ summary, summaryMd }, issues) {
  if (summary.success !== true) {
    issues.push("summary.success must be true");
  }
  if (!/success:\s*true/i.test(summaryMd)) {
    issues.push("summary.md must record success: true");
  }
  if (!/scorecard:\s*scorecard\.json/i.test(summaryMd)) {
    issues.push("summary.md must link scorecard.json");
  }
}

function validateScorecard(scorecard, issues) {
  if (scorecard.passesTarget !== true) {
    issues.push("scorecard.passesTarget must be true");
  }
  const journey = scorecard.r5Journey || {};
  if (journey.passesTarget !== true) {
    issues.push("scorecard.r5Journey.passesTarget must be true");
  }
  if (Number(journey.total || 0) !== Number(journey.max || 0) || Number(journey.max || 0) <= 0) {
    issues.push("scorecard.r5Journey total must equal max");
  }
  const checks = journey.checks || {};
  for (const checkName of REQUIRED_R5_CHECKS) {
    if (checks?.[checkName]?.pass !== true) {
      issues.push(`r5Journey.${checkName} must pass`);
    }
  }
}

function validateProvenance(provenance, issues) {
  if (provenance.schema !== PROVENANCE_SCHEMA) {
    issues.push(`provenance.schema must be ${PROVENANCE_SCHEMA}`);
  }
  if (provenance.producedBy !== "tools/run_canvas_agent_r5_regression.ps1") {
    issues.push("provenance.producedBy must be tools/run_canvas_agent_r5_regression.ps1");
  }
  if (provenance.sourceRequirement !== "docs/PI_CANVAS_AGENT_CLAW_PARITY_P0_P4_PRODUCT_REQUIREMENTS.md") {
    issues.push("provenance.sourceRequirement must reference the P0-P4 PRD");
  }
  if (provenance.p0P4AuditPath !== "docs/PI_CANVAS_AGENT_P0_P4_COMPLETION_AUDIT.md") {
    issues.push("provenance.p0P4AuditPath must reference the completion audit");
  }
  if (provenance.artifactValidator !== "tools/assistant_live_artifact_validator.mjs") {
    issues.push("provenance.artifactValidator must reference tools/assistant_live_artifact_validator.mjs");
  }
  if (!/^docs\/assistant_live_cases\/r5-[^/\\]+\.json$/i.test(String(provenance.fixture || ""))) {
    issues.push("provenance.fixture must reference an R5 fixture under docs/assistant_live_cases");
  }
  if (!/^r5-wrapper-run-[A-Za-z0-9_.:-]+$/.test(String(provenance.artifactSetId || ""))) {
    issues.push("provenance.artifactSetId must identify the R5 wrapper run");
  }
  const preflightGates = Array.isArray(provenance.preflightGates) ? provenance.preflightGates : [];
  const preflightResults = Array.isArray(provenance.preflightResults) ? provenance.preflightResults : [];
  for (const gate of REQUIRED_PROVENANCE_PREFLIGHTS) {
    if (!preflightGates.includes(gate)) {
      issues.push(`provenance preflight ${gate} must be present`);
    }
    const result = preflightResults.find((item) => item?.name === gate);
    if (!result) {
      issues.push(`provenance preflight result ${gate} must be present`);
    } else if (result.passed !== true) {
      issues.push(`provenance preflight result ${gate} must pass`);
    }
  }
  const servicePolicy = provenance.servicePolicy || {};
  if (servicePolicy.userManaged8777 !== true) {
    issues.push("provenance.servicePolicy.userManaged8777 must be true");
  }
  if (servicePolicy.noServiceManagementOrProbe !== true) {
    issues.push("provenance.servicePolicy.noServiceManagementOrProbe must be true");
  }
}

export async function validateAssistantLiveArtifactDirectory(artifactDir) {
  const resolvedDir = path.resolve(artifactDir || "");
  const issues = [];
  if (!artifactDir || !(await exists(resolvedDir))) {
    return {
      valid: false,
      artifactDir: resolvedDir,
      passesTarget: false,
      screenshotCount: 0,
      issues: [`artifact directory does not exist: ${resolvedDir}`],
    };
  }

  await validateRequiredFiles(resolvedDir, issues);
  const { screenshotCount } = await validateScreenshots(resolvedDir, issues);
  const summaryPath = path.join(resolvedDir, "summary.json");
  const scorecardPath = path.join(resolvedDir, "scorecard.json");
  const summaryMdPath = path.join(resolvedDir, "summary.md");
  const provenancePath = path.join(resolvedDir, "p0-p4-live-artifact-provenance.json");
  const summary = await readJson(summaryPath, issues);
  const scorecard = await readJson(scorecardPath, issues);
  const provenance = await readJson(provenancePath, issues);
  const summaryMd = await readFile(summaryMdPath, "utf8").catch(() => "");
  validateSummary({ summary, summaryMd }, issues);
  validateScorecard(scorecard, issues);
  validateProvenance(provenance, issues);
  await validateOptionalRealApiSmoke(resolvedDir, issues);

  const visualDiffPath = path.join(resolvedDir, "visual-diff.json");
  if (await exists(visualDiffPath)) {
    const visualDiff = await readJson(visualDiffPath, issues);
    if (Object.keys(visualDiff || {}).length > 0 && visualDiff.passesTarget !== true) {
      issues.push("visual-diff.json must pass when present");
    }
  }

  try {
    await validateSecretSafety(resolvedDir, issues);
  } catch (error) {
    issues.push(`artifact secret-safety scan failed: ${error?.message || error}`);
  }

  return {
    valid: issues.length === 0,
    artifactDir: resolvedDir,
    passesTarget: scorecard.passesTarget === true && scorecard.r5Journey?.passesTarget === true,
    screenshotCount,
    issues,
  };
}

async function main() {
  const artifactDir = process.argv[2] || "";
  const result = await validateAssistantLiveArtifactDirectory(artifactDir);
  console.log(JSON.stringify(result, null, 2));
  if (!result.valid) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  });
}
