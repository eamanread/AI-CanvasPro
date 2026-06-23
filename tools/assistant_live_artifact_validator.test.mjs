import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  REQUIRED_R5_SCREENSHOTS,
  validateAssistantLiveArtifactDirectory,
} from "./assistant_live_artifact_validator.mjs";

const PASSING_R5_SCORECARD = {
  total: 13,
  max: 25,
  passesTarget: true,
  dimensions: {},
  warnings: [],
  r5Journey: {
    total: 110,
    max: 110,
    passesTarget: true,
    checks: {
      panelOpen: { pass: true },
      modelDropdown: { pass: true },
      streaming: { pass: true },
      actionPreview: { pass: true },
      applyReceipt: { pass: true },
      historyRestore: { pass: true },
      generationGate: { pass: true },
      pendingState: { pass: true },
      secretSafety: { pass: true },
    },
  },
};

const PASSING_P0_P4_PROVENANCE = {
  schema: "canvas-agent-r5-artifact-provenance-v1",
  producedBy: "tools/run_canvas_agent_r5_regression.ps1",
  sourceRequirement: "docs/PI_CANVAS_AGENT_CLAW_PARITY_P0_P4_PRODUCT_REQUIREMENTS.md",
  p0P4AuditPath: "docs/PI_CANVAS_AGENT_P0_P4_COMPLETION_AUDIT.md",
  artifactValidator: "tools/assistant_live_artifact_validator.mjs",
  fixture: "docs/assistant_live_cases/r5-basic-create-connect-layout-focus.json",
  artifactSetId: "r5-wrapper-run-test",
  preflightGates: [
    "frontend regression",
    "backend regression",
    "P0-P4 audit",
    "P4 platform regression",
  ],
  preflightResults: [
    { name: "frontend regression", passed: true },
    { name: "backend regression", passed: true },
    { name: "P0-P4 audit", passed: true },
    { name: "P4 platform regression", passed: true },
  ],
  servicePolicy: {
    userManaged8777: true,
    noServiceManagementOrProbe: true,
  },
};

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function createArtifact(overrides = {}) {
  const artifactDir = await mkdtemp(path.join(os.tmpdir(), "assistant-live-artifact-"));
  const screenshotsDir = path.join(artifactDir, "screenshots");
  await mkdir(screenshotsDir, { recursive: true });

  const scorecard = overrides.scorecard || PASSING_R5_SCORECARD;
  const summary = overrides.summary || {
    runId: "assistant-live-test",
    success: true,
    failedStep: "",
    issues: [],
    scorecard,
  };
  await writeJson(path.join(artifactDir, "summary.json"), summary);
  await writeJson(path.join(artifactDir, "scorecard.json"), scorecard);
  await writeJson(path.join(artifactDir, "trace.json"), []);
  await writeJson(path.join(artifactDir, "console.json"), { consoleErrors: [], pageErrors: [] });
  await writeJson(path.join(artifactDir, "network.json"), { httpErrors: [], requestFailures: [] });
  await writeJson(path.join(artifactDir, "assistant-state.json"), { final: { assistant: { status: "done_pending_actions" } } });
  await writeJson(path.join(artifactDir, "graph-before.json"), { nodes: [] });
  await writeJson(path.join(artifactDir, "graph-after.json"), { nodes: [] });
  if (overrides.provenance !== null) {
    await writeJson(
      path.join(artifactDir, "p0-p4-live-artifact-provenance.json"),
      overrides.provenance || PASSING_P0_P4_PROVENANCE
    );
  }
  if (overrides.realApiSmoke) {
    await writeJson(path.join(artifactDir, "real-api-smoke.json"), overrides.realApiSmoke);
  }
  await writeFile(
    path.join(artifactDir, "summary.md"),
    "# Assistant Live R5 Run\n\n- success: true\n- fixture: r5-basic-create-connect-layout-focus\n- scorecard: scorecard.json\n",
    "utf8"
  );

  const screenshotNames = overrides.screenshotNames || REQUIRED_R5_SCREENSHOTS;
  for (const name of screenshotNames) {
    await writeFile(path.join(screenshotsDir, name), Buffer.from([0x89, 0x50, 0x4e, 0x47, 1]));
  }
  return artifactDir;
}

test("assistant live artifact validator accepts a complete passing R5 artifact bundle", async () => {
  const artifactDir = await createArtifact();

  const result = await validateAssistantLiveArtifactDirectory(artifactDir);

  assert.equal(result.valid, true);
  assert.equal(result.passesTarget, true);
  assert.equal(result.screenshotCount, REQUIRED_R5_SCREENSHOTS.length);
  assert.deepEqual(result.issues, []);
});

test("assistant live artifact validator rejects missing screenshots and failed R5 checks", async () => {
  const scorecard = structuredClone(PASSING_R5_SCORECARD);
  scorecard.passesTarget = false;
  scorecard.r5Journey.passesTarget = false;
  scorecard.r5Journey.checks.applyReceipt.pass = false;
  const artifactDir = await createArtifact({
    scorecard,
    screenshotNames: REQUIRED_R5_SCREENSHOTS.slice(0, -1),
  });

  const result = await validateAssistantLiveArtifactDirectory(artifactDir);

  assert.equal(result.valid, false);
  assert.match(result.issues.join("\n"), /scorecard\.passesTarget must be true/);
  assert.match(result.issues.join("\n"), /r5Journey\.applyReceipt must pass/);
  assert.match(result.issues.join("\n"), /missing screenshot 08-video-strong-confirm\.png/);
});

test("assistant live artifact validator rejects unsanitized secrets in artifact files", async () => {
  const artifactDir = await createArtifact();
  await writeJson(path.join(artifactDir, "trace.json"), [{ note: "must-not-leak" }]);

  const result = await validateAssistantLiveArtifactDirectory(artifactDir);

  assert.equal(result.valid, false);
  assert.match(result.issues.join("\n"), /trace\.json.*leak sentinel/i);
});

test("assistant live artifact validator requires P0-P4 wrapper provenance", async () => {
  const artifactDir = await createArtifact({ provenance: null });

  const result = await validateAssistantLiveArtifactDirectory(artifactDir);

  assert.equal(result.valid, false);
  assert.match(result.issues.join("\n"), /missing artifact file p0-p4-live-artifact-provenance\.json/);
});

test("assistant live artifact validator rejects provenance that bypasses P0-P4 preflights", async () => {
  const artifactDir = await createArtifact({
    provenance: {
      schema: "canvas-agent-r5-artifact-provenance-v1",
      producedBy: "tools/assistant_panel_live_screenshot_check.mjs",
      preflightGates: ["frontend regression"],
      servicePolicy: {
        userManaged8777: true,
        noServiceManagementOrProbe: true,
      },
    },
  });

  const result = await validateAssistantLiveArtifactDirectory(artifactDir);

  assert.equal(result.valid, false);
  assert.match(result.issues.join("\n"), /provenance\.producedBy/);
  assert.match(result.issues.join("\n"), /provenance preflight P0-P4 audit/);
  assert.match(result.issues.join("\n"), /provenance\.p0P4AuditPath/);
});

test("assistant live artifact validator rejects failed or missing preflight results", async () => {
  const artifactDir = await createArtifact({
    provenance: {
      ...PASSING_P0_P4_PROVENANCE,
      preflightResults: [
        { name: "frontend regression", passed: true },
        { name: "backend regression", passed: false },
        { name: "P0-P4 audit", passed: true },
      ],
    },
  });

  const result = await validateAssistantLiveArtifactDirectory(artifactDir);

  assert.equal(result.valid, false);
  assert.match(result.issues.join("\n"), /provenance preflight result backend regression must pass/);
  assert.match(result.issues.join("\n"), /provenance preflight result P4 platform regression must be present/);
});

test("assistant live artifact validator requires a wrapper artifact set id", async () => {
  const provenance = structuredClone(PASSING_P0_P4_PROVENANCE);
  delete provenance.artifactSetId;
  const artifactDir = await createArtifact({ provenance });

  const result = await validateAssistantLiveArtifactDirectory(artifactDir);

  assert.equal(result.valid, false);
  assert.match(result.issues.join("\n"), /provenance\.artifactSetId/);
});

test("assistant live artifact validator accepts redacted optional real API smoke artifact", async () => {
  const artifactDir = await createArtifact({
    realApiSmoke: {
      schemaVersion: "canvas-agent-real-api-smoke-v1",
      mode: "Browser",
      status: "passed",
      submission: { accepted: true },
      secretScan: { status: "passed", totalFindings: 0 },
    },
  });

  const result = await validateAssistantLiveArtifactDirectory(artifactDir);

  assert.equal(result.valid, true);
});

test("assistant live artifact validator rejects optional real API smoke artifact with failed secret scan", async () => {
  const artifactDir = await createArtifact({
    realApiSmoke: {
      schemaVersion: "canvas-agent-real-api-smoke-v1",
      mode: "Browser",
      status: "failed",
      failureCategory: "SECRET_SCAN_FAILED",
      secretScan: { status: "failed", totalFindings: 1 },
    },
  });

  const result = await validateAssistantLiveArtifactDirectory(artifactDir);

  assert.equal(result.valid, false);
  assert.match(result.issues.join("\n"), /real-api-smoke.*secret scan/i);
});
