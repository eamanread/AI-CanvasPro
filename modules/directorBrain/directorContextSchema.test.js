import assert from "node:assert/strict";
import test from "node:test";

import {
  DIRECTOR_CONTEXT_SCHEMA_VERSION,
  sanitizeDirectorContext,
  validateDirectorContext,
} from "./directorContextSchema.js";
import { rainHouseDirectorContext } from "./directorContextFixtures.js";

test("directorContextSchema: valid director context passes validation", () => {
  const result = validateDirectorContext(rainHouseDirectorContext);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.context.schemaVersion, DIRECTOR_CONTEXT_SCHEMA_VERSION);
});

test("directorContextSchema: schemaVersion is required", () => {
  const context = { ...rainHouseDirectorContext };
  delete context.schemaVersion;
  const result = validateDirectorContext(context);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /schemaVersion/);
});

test("directorContextSchema: write back is forbidden in phase 0-3", () => {
  const context = {
    ...rainHouseDirectorContext,
    sourcePolicy: {
      ...rainHouseDirectorContext.sourcePolicy,
      writeBackAllowed: true,
    },
  };
  const result = validateDirectorContext(context);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /writeBackAllowed/);
});

test("directorContextSchema: read-only and confirmation policies are enforced", () => {
  const result = validateDirectorContext({
    ...rainHouseDirectorContext,
    sourcePolicy: {
      readOnly: false,
      redactedLocalPaths: false,
      writeBackAllowed: false,
      videoGenerationRequiresConfirmation: false,
    },
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /readOnly/);
  assert.match(result.errors.join("\n"), /redactedLocalPaths/);
  assert.match(result.errors.join("\n"), /videoGenerationRequiresConfirmation/);
});

test("directorContextSchema: sanitize removes local paths and secret-like fields", () => {
  const context = sanitizeDirectorContext({
    ...rainHouseDirectorContext,
    localPath: "D:\\secret\\qmai",
    apiKey: "sk-secret",
    project: {
      ...rainHouseDirectorContext.project,
      localPath: "D:\\secret\\qmai",
    },
    retrieval: {
      ...rainHouseDirectorContext.retrieval,
      sources: [
        {
          ...rainHouseDirectorContext.retrieval.sources[0],
          snippet: "出处文件在 D:\\secret\\qmai\\wiki\\memory\\character-states.md 里",
        },
      ],
    },
  });
  const serialized = JSON.stringify(context);
  assert.equal(serialized.includes("D:\\\\secret"), false);
  assert.equal(serialized.includes("sk-secret"), false);
  assert.equal(serialized.includes("[REDACTED_PATH]"), true);
});

test("directorContextSchema: sanitize survives circular references", () => {
  const circular = { ...rainHouseDirectorContext };
  circular.self = circular;
  const sanitized = sanitizeDirectorContext(circular);
  assert.equal(sanitized.self, "[Circular]");
});

test("directorContextSchema: validation rejects missing retrieval and constraints", () => {
  const result = validateDirectorContext({
    ...rainHouseDirectorContext,
    retrieval: undefined,
    constraints: undefined,
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /retrieval/);
  assert.match(result.errors.join("\n"), /constraints/);
});

test("directorContextSchema: shared rules redact bearer tokens in strings", () => {
  const sanitized = sanitizeDirectorContext({ note: "send Authorization: Bearer abc123DEF as header" });
  assert.equal(sanitized.note.includes("abc123DEF"), false);
  assert.match(sanitized.note, /Bearer \[REDACTED\]/);
});
