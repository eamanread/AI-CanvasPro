import assert from "node:assert/strict";
import test from "node:test";

import { loadDirectorMemoryExport } from "./directorMemoryExportLoader.js";

// RED-LINE-1 (real memory first): this test reads a real QMAI project
// or export directory from disk through the default filesystem
// functions — no injected mocks. Point HY_QMAI_PROJECT_DIR at a real
// QMAI project root (live layout) or exportProject output directory.
const realDir = process.env.HY_QMAI_PROJECT_DIR?.trim();

test(
  "directorMemoryExportLoader: loads a real on-disk QMAI project read-only without leaking source paths",
  { skip: !realDir },
  async () => {
    const memory = await loadDirectorMemoryExport(realDir);

    assert.equal(typeof memory.project.id, "string");
    assert.equal(memory.project.id.length > 0, true);
    assert.equal(Array.isArray(memory.entries), true);
    assert.equal(memory.entries.length > 0, true);
    for (const entry of memory.entries) {
      assert.equal(typeof entry.type, "string");
      assert.equal(typeof entry.title, "string");
    }

    const serialized = JSON.stringify(memory);
    const driveRoot = realDir.slice(0, 2);
    assert.equal(serialized.includes(realDir.replace(/\\/g, "\\\\")), false);
    assert.equal(new RegExp(`${driveRoot.replace(":", "")}:\\\\\\\\`).test(serialized), false);
  },
);
