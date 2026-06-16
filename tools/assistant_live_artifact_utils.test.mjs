import assert from "node:assert/strict";
import test from "node:test";

import { buildArtifactSummary, sanitizeArtifactValue } from "./assistant_live_artifact_utils.mjs";

const keyPrefix = "s" + "k-";

test("assistant live artifacts redact secrets, signed URLs, and local paths", () => {
  const input = {
    apiKey: `${keyPrefix}fixtureSecret`,
    authorization: "Bearer bearer-secret",
    url: "https://user:pass@example.test/v1?token=abc&safe=1#frag",
    file: "D:\\private\\asset.png",
    nested: {
      note: `OpenAI ${keyPrefix}nestedSecret`,
      keep: "safe text",
    },
  };

  const sanitized = sanitizeArtifactValue(input);
  const serialized = JSON.stringify(sanitized);

  assert.doesNotMatch(serialized, new RegExp(`${keyPrefix}fixtureSecret|${keyPrefix}nestedSecret`));
  assert.doesNotMatch(serialized, /bearer-secret|user:pass|token=abc|D:\\private/);
  assert.match(serialized, /safe text/);
  assert.equal(sanitized.apiKey, "[REDACTED]");
  assert.equal(sanitized.authorization, "[REDACTED]");
  assert.equal(sanitized.url, "https://example.test/v1?safe=1");
});

test("buildArtifactSummary keeps command-safe public run metadata only", () => {
  const summary = buildArtifactSummary({
    runId: "run-1",
    success: false,
    failedStep: "apply-actions",
    artifactDir: "output/regression/assistant-live/run-1",
    issues: ["console: boom"],
    model: { provider: "pi_canvas_agent", modelId: "agent-live-fixture", apiKey: `${keyPrefix}secret` },
  });

  const serialized = JSON.stringify(summary);
  assert.equal(summary.runId, "run-1");
  assert.equal(summary.failedStep, "apply-actions");
  assert.doesNotMatch(serialized, new RegExp(`${keyPrefix}secret`));
});

test("assistant live sanitizer removes real-key-shaped strings from nested artifacts", () => {
  const sanitized = sanitizeArtifactValue({
    logs: [`using ${keyPrefix}abc123456789`, "safe"],
    network: [{ requestHeaders: { authorization: "Bearer private-token" } }],
  });
  const serialized = JSON.stringify(sanitized);

  assert.doesNotMatch(serialized, new RegExp(`${keyPrefix}abc123456789|private-token`));
});
