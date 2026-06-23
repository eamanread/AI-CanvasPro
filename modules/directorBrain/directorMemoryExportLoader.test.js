import assert from "node:assert/strict";
import test from "node:test";

import {
  loadDirectorMemoryExport,
  normalizeDirectorMemoryExport,
  normalizeQmaiExportDirectory,
  normalizeQmaiLiveMemory,
} from "./directorMemoryExportLoader.js";

test("directorMemoryExportLoader: loads normalized director memory export through injected readFile", async () => {
  const raw = JSON.stringify({
    schemaVersion: "qmai-director-memory/v1",
    project: { id: "qmai_project_rain_house", name: "雨夜旧宅", localPath: "D:\\secret\\qmai" },
    entries: [
      { id: "src_char_linche", type: "character", title: "林澈人物设定", text: "黑色短发，左眉浅疤，米色风衣" },
    ],
  });
  const memory = await loadDirectorMemoryExport("D:\\exports\\director-memory.json", {
    readFile: async () => raw,
  });
  assert.equal(memory.project.id, "qmai_project_rain_house");
  assert.equal(memory.entries.length, 1);
  assert.equal(JSON.stringify(memory).includes("D:\\\\secret"), false);
  assert.equal(JSON.stringify(memory).includes("localPath"), false);
});

test("directorMemoryExportLoader: rejects unsupported export schema", () => {
  assert.throws(() => normalizeDirectorMemoryExport({ schemaVersion: "unknown/v9" }), /schemaVersion/);
});

test("directorMemoryExportLoader: loads today's QMAI export directory layout", async () => {
  const files = new Map([
    ["D:\\exports\\rain-house\\meta\\character-states.json", JSON.stringify([
      { name: "林澈", currentCostume: "米色风衣", appearance: "黑色短发，左眉浅疤" },
    ])],
    ["D:\\exports\\rain-house\\meta\\cognition-state.json", JSON.stringify({ characters: { "林澈": { performance: "表演克制" } } })],
    ["D:\\exports\\rain-house\\meta\\foreshadowing-tracker.json", JSON.stringify([
      { id: "fs-photo", description: "童年照片伏笔", status: "open" },
    ])],
    ["D:\\exports\\rain-house\\snapshots\\001.snapshot.json", JSON.stringify({
      timelineEvents: ["雨夜回到旧宅"],
      characterStateChanges: ["林澈发现童年照片"],
    })],
  ]);
  const memory = await loadDirectorMemoryExport("D:\\exports\\rain-house", {
    readFile: async (path) => files.get(path),
    listFiles: async () => [...files.keys()],
  });
  assert.equal(memory.project.id.length > 0, true);
  assert.equal(memory.entries.some((entry) => entry.type === "character"), true);
  assert.equal(memory.entries.some((entry) => entry.type === "timeline"), true);
  assert.equal(memory.entries.some((entry) => entry.type === "foreshadowing"), true);
  assert.equal(JSON.stringify(memory).includes("D:\\\\exports"), false);
});

test("directorMemoryExportLoader: loads a real Director OS project layout (director/memory/*.json)", async () => {
  const files = new Map([
    ["D:\\qmai\\dir-project\\director\\memory\\style-memory.json", JSON.stringify({
      schemaVersion: "director-memory/v1",
      facts: ["全片冷蓝低饱和", "雨声盖过对白"],
      candidateFacts: [],
      updatedAt: "2026-06-11T15:00:00.000Z",
    })],
    ["D:\\qmai\\dir-project\\director\\memory\\review-memory-candidate-asset-coat.json", JSON.stringify({
      schemaVersion: "director-review-memory/v1",
      id: "review-memory-candidate-asset-coat",
      status: "accepted",
      dimension: "asset",
      text: "资产连续性规则：外套必须始终湿透并保持深色",
      sourceReviewId: "dailies-round-1-output",
      traceIds: ["round-1-output"],
      acceptedAt: "2026-06-11T15:20:00.000Z",
    })],
    ["D:\\qmai\\dir-project\\director\\director-meta.json", JSON.stringify({
      schemaVersion: "director-meta/v1",
      version: "director-os/v1",
      title: "旧伞告别",
    })],
    ["D:\\qmai\\dir-project\\director\\outputs\\storyboards\\round-2.json", JSON.stringify({ schemaVersion: "director-storyboard/v1" })],
  ]);
  const memory = await loadDirectorMemoryExport("D:\\qmai\\dir-project", {
    readFile: async (path) => files.get(path),
    listFiles: async () => [...files.keys()],
  });

  assert.equal(memory.project.name, "旧伞告别");
  assert.equal(memory.entries.some((entry) => entry.type === "director-memory" && entry.text.includes("冷蓝")), true);
  assert.equal(memory.entries.some((entry) => entry.type === "review-asset" && entry.text.includes("湿透")), true);
  assert.equal(JSON.stringify(memory).includes("D:\\\\qmai"), false);
});

test("directorMemoryExportLoader: loads QMAI live project memory markdown layout read-only", async () => {
  const files = new Map([
    ["D:\\qmai\\project\\wiki\\memory\\character-states.md", "## 林澈\n- 黑色短发\n- 左眉浅疤\n- 米色风衣"],
    ["D:\\qmai\\project\\wiki\\memory\\timeline.md", "## 时间线\n- 雨夜回到旧宅"],
    ["D:\\qmai\\project\\wiki\\memory\\canon-facts.md", "- 父亲十年前失踪"],
    ["D:\\qmai\\project\\project-meta.json", JSON.stringify({ title: "雨夜旧宅", genre: "悬疑" })],
  ]);
  const memory = await loadDirectorMemoryExport("D:\\qmai\\project", {
    readFile: async (path) => files.get(path),
    listFiles: async () => [...files.keys()],
  });
  assert.equal(memory.project.name, "雨夜旧宅");
  assert.equal(memory.entries.some((entry) => entry.type === "character"), true);
  assert.equal(memory.entries.some((entry) => entry.type === "timeline"), true);
  assert.equal(memory.entries.some((entry) => entry.type === "canon"), true);
  assert.equal(JSON.stringify(memory).includes("D:\\\\qmai"), false);
});

test("directorMemoryExportLoader: throws actionable errors for unreadable or empty inputs", async () => {
  await assert.rejects(
    loadDirectorMemoryExport("D:\\exports\\missing.json", {
      readFile: async () => {
        throw new Error("ENOENT");
      },
    }),
    /director-memory|read/i,
  );

  await assert.rejects(
    loadDirectorMemoryExport("D:\\exports\\empty-dir", {
      readFile: async () => undefined,
      listFiles: async () => [],
    }),
    /no QMAI memory files/i,
  );

  await assert.rejects(
    loadDirectorMemoryExport("D:\\exports\\bad.json", {
      readFile: async () => "not json {",
    }),
    /JSON/i,
  );
});

test("directorMemoryExportLoader: normalizeQmaiExportDirectory drops sensitive nested fields", () => {
  const memory = normalizeQmaiExportDirectory(new Map([
    ["D:\\exports\\x\\meta\\character-states.json", JSON.stringify([
      { name: "林澈", appearance: "黑色短发", snapshotPath: "D:\\secret\\snap.json" },
    ])],
  ]));
  assert.equal(JSON.stringify(memory).includes("snapshotPath"), false);
  assert.equal(JSON.stringify(memory).includes("D:\\\\secret"), false);
});

test("directorMemoryExportLoader: normalizeQmaiLiveMemory requires at least one known memory file", () => {
  assert.throws(
    () => normalizeQmaiLiveMemory(new Map([["D:\\proj\\readme.md", "hello"]])),
    /no QMAI memory files/i,
  );
});

test("directorMemoryExportLoader: golden fixture for the live QMAI layout stays stable", async () => {
  const { fileURLToPath } = await import("node:url");
  const fixtureDir = fileURLToPath(new URL("./__fixtures__/qmai-live-sample", import.meta.url));
  const memory = await loadDirectorMemoryExport(fixtureDir);

  assert.equal(memory.project.name, "雨屋样例项目");
  assert.equal(memory.entries.length, 3);
  assert.deepEqual(
    memory.entries.map((entry) => [entry.type, entry.title]).sort(),
    [["canon", "正典事实"], ["character", "林侦探"], ["timeline", "第一夜"]].sort()
  );
  assert.equal(JSON.stringify(memory).includes("D:\\"), false);
});
