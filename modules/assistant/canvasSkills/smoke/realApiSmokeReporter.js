import { normalizeSmokeArtifact } from "./realApiSmokeArtifacts.js";
import { redactSmokeArtifact, scanSmokeArtifactForSecrets } from "./realApiSmokeSecretScan.js";

export function finalizeSmokeArtifact(artifact = {}) {
  const normalized = normalizeSmokeArtifact(artifact);
  const redacted = redactSmokeArtifact(normalized);
  const secretScan = scanSmokeArtifactForSecrets(redacted);
  redacted.secretScan = secretScan;
  if (secretScan.status !== "passed") {
    redacted.status = "failed";
    redacted.failureCategory = "SECRET_SCAN_FAILED";
  }
  return redacted;
}
