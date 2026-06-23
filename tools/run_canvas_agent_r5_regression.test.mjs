import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("run_canvas_agent_r5_regression: exposes real API smoke soft and strict flags", async () => {
  const script = await readFile("tools/run_canvas_agent_r5_regression.ps1", "utf8");

  assert.match(script, /\[switch\]\$RealApiSmoke/);
  assert.match(script, /\[ValidateSet\("Module",\s*"Browser",\s*"All"\)\]/);
  assert.match(script, /\[switch\]\$FailOnSmokeFailure/);
  assert.match(script, /run_canvas_agent_real_api_smoke\.ps1/);
  assert.match(script, /\$RealApiSmokeResult/);
  assert.match(script, /\$outputJson\s*=\s*\(\$outputLines\s*-\s*join\s+"`n"\)/);
  assert.doesNotMatch(script, /fixture\s*=\s*"real-api-smoke"/);
});

test("run_canvas_agent_r5_regression: forwards Chrome path to browser real API smoke", async () => {
  const script = await readFile("tools/run_canvas_agent_r5_regression.ps1", "utf8");

  assert.match(script, /-Chrome\s+\$Chrome/);
});

test("run_canvas_agent_r5_regression: scoped secret scan does not scan source test fixtures", async () => {
  const script = await readFile("tools/run_canvas_agent_r5_regression.ps1", "utf8");
  const secretScanSection = script.slice(script.indexOf("[R5] scoped secret scan"));

  assert.doesNotMatch(secretScanSection, /modules\\assistant\\\*\.test\.js/);
  assert.doesNotMatch(secretScanSection, /\*canvas_agent\*_test\.py/);
  assert.match(secretScanSection, /Get-ChildItem\s+-LiteralPath\s+\$Out/);
});

test("run_canvas_agent_r5_regression: preflight-only parses multi-line real API smoke JSON", () => {
  const command = [
    "$env:Path='D:\\Aic;' + $env:Path;",
    "function powershell {",
    "  '{';",
    "  '  \"status\": \"passed\",';",
    "  '  \"failureCategory\": \"\",';",
    "  '  \"artifactPath\": \"output/regression/real-api-smoke/real-api-smoke.json\"';",
    "  '}';",
    "  $global:LASTEXITCODE = 0;",
    "}",
    ". .\\tools\\run_canvas_agent_r5_regression.ps1 -PreflightOnly -RealApiSmoke -RealApiSmokeMode Module",
    "$script:RealApiSmokeResult | ConvertTo-Json -Depth 5",
  ].join(" ");
  const result = spawnSync("powershell", ["-NoProfile", "-Command", command], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /real API smoke/);
  assert.match(result.stdout, /"status":\s*"passed"/);
  assert.doesNotMatch(result.stdout, /parseWarning|ConvertFrom-Json/i);
});
