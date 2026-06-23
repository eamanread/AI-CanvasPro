import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootPath = dirname(fileURLToPath(import.meta.url));
const readIfExists = (path) => existsSync(join(rootPath, path)) ? readFileSync(join(rootPath, path), "utf8") : "";
const token = (...parts) => parts.join("");
const forbiddenRuntimeTokens = [
  token("canvas", "Execution", "Engine"),
  token("group", "Runtime"),
  token("group", "Execution", "Events"),
  token("workflow:", "execute", "-group"),
  token("video", "_generation", "_requires", "_authorization")
];
const forbiddenRuntimePattern = new RegExp(forbiddenRuntimeTokens.join("|"));

test("custom workflow execution engine is not reintroduced", () => {
  assert.equal(existsSync(join(rootPath, "modules/workflows", `${token("canvas", "Execution", "Engine")}.js`)), false);
  assert.equal(existsSync(join(rootPath, "modules/workflows", `${token("group", "Runtime")}.js`)), false);
  assert.equal(existsSync(join(rootPath, "modules/workflows", `${token("group", "Execution", "Events")}.js`)), false);
});

test("group execution is not in the baseline unless explicitly copied from upstream", () => {
  const groupExecutionPath = join(rootPath, "modules/groupExecution.js");
  if (!existsSync(groupExecutionPath)) {
    assert.equal(true, true);
    return;
  }
  const content = readFileSync(groupExecutionPath, "utf8");
  assert.match(content, /executeGroupGenerateButtons/);
  assert.match(content, /executeSelectedGenerateButtons/);
  assert.match(content, /\.prompt-submit\.img-gen-btn/);
  assert.doesNotMatch(content, new RegExp([
    token("canvas", "Execution", "Engine"),
    token("group", "Runtime"),
    token("workflow:", "execute", "-group")
  ].join("|")));
});

test("known custom execution tokens stay absent from baseline files", () => {
  const files = [
    "index.html",
    "main.js",
    "components/GroupNode.js",
    "modules/assistant/assistantCanvasWorkflowSkills.js",
    "modules/assistant/assistantCanvasSkillExecutor.js"
  ];
  for (const file of files) {
    const content = readIfExists(file);
    assert.doesNotMatch(content, forbiddenRuntimePattern);
  }
});
