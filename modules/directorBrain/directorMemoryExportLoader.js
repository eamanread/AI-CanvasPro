import { promises as fs } from "node:fs";
import path from "node:path";

import { isSensitiveContextKey, sanitizeDirectorContext } from "./directorContextSchema.js";

export const DIRECTOR_MEMORY_EXPORT_SCHEMA_VERSION = "qmai-director-memory/v1";
export const DIRECTOR_EXPORT_ENVELOPE_SCHEMA_VERSION = "qmai-director-export/v1";

const EXPORT_META_FILES = Object.freeze({
  "character-states.json": "character",
  "cognition-state.json": "cognition",
  "foreshadowing-tracker.json": "foreshadowing",
});

const LIVE_MEMORY_FILES = Object.freeze({
  "character-states.md": "character",
  "character-cognition.md": "cognition",
  "foreshadowing-tracker.md": "foreshadowing",
  "timeline.md": "timeline",
  "canon-facts.md": "canon",
  "conflicts.md": "conflict",
});

async function defaultReadFile(filePath) {
  return fs.readFile(filePath, "utf-8");
}

async function defaultListFiles(dirPath) {
  const collected = [];
  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(entryPath);
      else collected.push(entryPath);
    }
  }
  await walk(dirPath);
  return collected;
}

/**
 * Read-only loader for the four real QMAI memory shapes: a normalized
 * qmai-director-memory/v1 JSON, today's exportProject directory,
 * today's live wiki/memory markdown layout, and the real Director OS
 * project layout (director/memory/*.json + director/director-meta.json,
 * as written by the QMAI director flywheel). The source path is only
 * used to read; it never enters the returned memory.
 */
export async function loadDirectorMemoryExport(filePath, { readFile, listFiles } = {}) {
  const read = readFile || defaultReadFile;
  const list = listFiles || defaultListFiles;
  if (typeof filePath !== "string" || !filePath.trim()) {
    throw new Error("director-memory source path is required");
  }

  if (filePath.toLowerCase().endsWith(".json")) {
    let raw;
    try {
      raw = await read(filePath);
    } catch (error) {
      throw new Error(`failed to read director-memory export: ${error?.message || error}`);
    }
    let parsed;
    try {
      parsed = JSON.parse(stripBom(raw));
    } catch {
      throw new Error("director-memory export is not valid JSON");
    }
    if (isRecord(parsed) && parsed.schemaVersion === DIRECTOR_EXPORT_ENVELOPE_SCHEMA_VERSION) {
      return normalizeDirectorExportEnvelope(parsed);
    }
    return normalizeDirectorMemoryExport(parsed);
  }

  let allFiles;
  try {
    allFiles = await list(filePath);
  } catch (error) {
    throw new Error(`failed to list QMAI memory directory: ${error?.message || error}`);
  }

  const filesByPath = new Map();
  for (const entryPath of allFiles) {
    const name = baseName(entryPath)
    if (isKnownMemoryFile(entryPath, name) || isDirectorProjectFile(entryPath, name)) {
      const content = await read(entryPath);
      if (content !== undefined && content !== null) filesByPath.set(entryPath, String(content));
    }
  }

  if (filesByPath.size === 0) {
    throw new Error("no QMAI memory files found in the selected directory");
  }

  const looksLikeDirectorProject = [...filesByPath.keys()].some((entryPath) =>
    isDirectorProjectFile(entryPath, baseName(entryPath)),
  );
  if (looksLikeDirectorProject) {
    return normalizeQmaiDirectorProject(filesByPath);
  }
  const looksLikeLiveProject = [...filesByPath.keys()].some((entryPath) =>
    normalizeSlashes(entryPath).includes("/wiki/memory/") || baseName(entryPath) === "project-meta.json",
  );
  return looksLikeLiveProject
    ? normalizeQmaiLiveMemory(filesByPath)
    : normalizeQmaiExportDirectory(filesByPath);
}

/**
 * The real Director OS on-disk project: long-term memory lives in
 * director/memory/*.json as director-memory/v1 (facts[]) or
 * director-review-memory/v1 (accepted review facts), with the project
 * title in director/director-meta.json.
 */
export function normalizeQmaiDirectorProject(filesByPath) {
  const entries = [];
  let projectName = "";

  for (const [entryPath, content] of filesByPath) {
    const name = baseName(entryPath);
    if (name === "director-meta.json") {
      const meta = safeJsonParse(content, entryPath);
      if (typeof meta?.title === "string" && meta.title.trim()) projectName = meta.title.trim();
      continue;
    }
    if (!isDirectorMemoryJson(entryPath, name)) continue;
    const parsed = safeJsonParse(content, entryPath);
    const stem = name.replace(/\.json$/i, "");
    if (parsed?.schemaVersion === "director-memory/v1" && Array.isArray(parsed.facts)) {
      parsed.facts.forEach((fact, index) => {
        entries.push({
          id: `${stem}-fact-${index + 1}`,
          type: "director-memory",
          title: `${stem} 事实 ${index + 1}`,
          text: String(fact ?? ""),
        });
      });
    } else if (parsed?.schemaVersion === "director-review-memory/v1" && typeof parsed.text === "string") {
      entries.push({
        id: String(parsed.id || stem),
        type: `review-${String(parsed.dimension || "note")}`,
        title: `审片记忆(${String(parsed.dimension || "note")})`,
        text: parsed.text,
      });
    }
  }

  if (entries.length === 0) {
    throw new Error("no QMAI memory files found in the director project layout");
  }
  return finalizeMemory(slugify(projectName || "qmai-director-project"), projectName || "QMAI 导演项目", entries);
}

/**
 * The single-envelope bridge contract (qmai-director-export/v1):
 * project + memory entries + optional artifacts (storyboard, prompts,
 * continuity verdict) + flowId in one file, generated by QMAI's real
 * export code. This is the preferred form — the directory layouts
 * below remain as compatibility fallbacks. Fail-closed on schema,
 * project identity, and empty memory.
 */
export function normalizeDirectorExportEnvelope(raw) {
  if (!isRecord(raw) || raw.schemaVersion !== DIRECTOR_EXPORT_ENVELOPE_SCHEMA_VERSION) {
    throw new Error(`unsupported director-export schemaVersion: expected ${DIRECTOR_EXPORT_ENVELOPE_SCHEMA_VERSION}`);
  }
  if (!isRecord(raw.project) || typeof raw.project.id !== "string" || !raw.project.id.trim()) {
    throw new Error("director-export project.id is required");
  }
  if (!isSafeIdText(raw.project.id)) {
    throw new Error("director-export project.id must not contain path separators or control characters");
  }
  if (!isIsoTimestampText(raw.exportedAt)) {
    throw new Error("director-export exportedAt must be a strict ISO timestamp");
  }
  if (raw.flowId !== undefined && (typeof raw.flowId !== "string" || !raw.flowId.trim() || !isSafeIdText(raw.flowId))) {
    throw new Error("director-export flowId must be a safe non-empty string");
  }
  if (!isRecord(raw.memory) || !Array.isArray(raw.memory.entries) || raw.memory.entries.length === 0) {
    throw new Error("director-export memory entries must be a non-empty array");
  }

  // Symmetric validation with the QMAI producer: artifacts and
  // knowledge cards are checked fail-closed before anything reaches
  // the canvas mappers or the gate.
  const artifacts = isRecord(raw.artifacts) ? raw.artifacts : {};
  if (artifacts.storyboard !== undefined) {
    if (!isRecord(artifacts.storyboard)
      || artifacts.storyboard.schemaVersion !== "director-storyboard/v1"
      || !Array.isArray(artifacts.storyboard.shots)
      || artifacts.storyboard.shots.length === 0) {
      throw new Error("director-export artifacts.storyboard is malformed");
    }
  }
  if (artifacts.prompts !== undefined) {
    if (!Array.isArray(artifacts.prompts) || artifacts.prompts.some((prompt) =>
      !isRecord(prompt)
      || prompt.schemaVersion !== "director-prompt-draft/v1"
      || typeof prompt.id !== "string" || !prompt.id.trim()
      || typeof prompt.shotId !== "string" || !prompt.shotId.trim()
      || typeof prompt.positivePrompt !== "string" || !prompt.positivePrompt.trim(),
    )) {
      throw new Error("director-export artifacts.prompts contain malformed drafts");
    }
  }
  if (artifacts.continuityReport !== undefined) {
    if (!isRecord(artifacts.continuityReport)
      || artifacts.continuityReport.schemaVersion !== "director-continuity-report/v1"
      || !["pass", "warn", "block"].includes(artifacts.continuityReport.status)
      || !Array.isArray(artifacts.continuityReport.issues)) {
      throw new Error("director-export artifacts.continuityReport is malformed");
    }
  }
  const knowledgeCards = raw.knowledgeCards === undefined ? [] : raw.knowledgeCards;
  if (!Array.isArray(knowledgeCards) || knowledgeCards.some((card) =>
    !isRecord(card) || typeof card.id !== "string" || !card.id.trim() || typeof card.title !== "string" || !card.title.trim(),
  )) {
    throw new Error("director-export knowledgeCards are malformed");
  }

  const entries = raw.memory.entries.map((entry, index) => ({
    id: String(entry?.id || `entry-${index + 1}`),
    type: String(entry?.type || "note"),
    title: String(entry?.title || `条目 ${index + 1}`),
    text: String(entry?.text || ""),
  }));
  const base = finalizeMemory(raw.project.id, raw.project.name || raw.project.id, entries);

  return sanitizeDirectorContext({
    ...base,
    exportedAt: raw.exportedAt,
    ...(typeof raw.flowId === "string" && raw.flowId.trim() ? { flowId: raw.flowId.trim() } : {}),
    knowledgeCards,
    artifacts: {
      ...(isRecord(artifacts.storyboard) ? { storyboard: artifacts.storyboard } : {}),
      ...(Array.isArray(artifacts.prompts) ? { prompts: artifacts.prompts } : {}),
      ...(isRecord(artifacts.continuityReport) ? { continuityReport: artifacts.continuityReport } : {}),
    },
  });
}

function isSafeIdText(value) {
  if (typeof value !== "string" || /[\\/]/.test(value)) return false;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

function isIsoTimestampText(value) {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

export function normalizeDirectorMemoryExport(raw) {
  if (!isRecord(raw)) {
    throw new Error("director-memory export must be an object");
  }
  if (raw.schemaVersion !== DIRECTOR_MEMORY_EXPORT_SCHEMA_VERSION) {
    throw new Error(`unsupported director-memory schemaVersion: expected ${DIRECTOR_MEMORY_EXPORT_SCHEMA_VERSION}`);
  }
  if (!isRecord(raw.project) || typeof raw.project.id !== "string" || !raw.project.id.trim()) {
    throw new Error("director-memory export project.id is required");
  }
  if (!Array.isArray(raw.entries) || raw.entries.length === 0) {
    throw new Error("director-memory export entries must be a non-empty array");
  }
  return finalizeMemory(raw.project.id, raw.project.name || raw.project.id, raw.entries.map((entry, index) => ({
    id: String(entry?.id || `entry-${index + 1}`),
    type: String(entry?.type || "note"),
    title: String(entry?.title || `条目 ${index + 1}`),
    text: String(entry?.text || ""),
  })));
}

export function normalizeQmaiExportDirectory(filesByPath) {
  const entries = [];
  let projectName = "";

  for (const [entryPath, content] of filesByPath) {
    const name = baseName(entryPath);
    if (EXPORT_META_FILES[name]) {
      const parsed = safeJsonParse(content, entryPath);
      entries.push(...entriesFromExportMeta(EXPORT_META_FILES[name], parsed));
    } else if (name.endsWith(".snapshot.json")) {
      const parsed = safeJsonParse(content, entryPath);
      entries.push(...entriesFromSnapshot(parsed));
    } else if (name === "complete-novel.md") {
      projectName = firstHeading(content) || projectName;
    }
  }

  if (entries.length === 0) {
    throw new Error("no QMAI memory files found in the export directory");
  }
  return finalizeMemory(slugify(projectName || "qmai-export"), projectName || "QMAI 导出项目", entries);
}

export function normalizeQmaiLiveMemory(filesByPath) {
  const entries = [];
  let projectName = "";

  for (const [entryPath, content] of filesByPath) {
    const name = baseName(entryPath);
    if (name === "project-meta.json") {
      const meta = safeJsonParse(content, entryPath);
      if (typeof meta?.title === "string" && meta.title.trim()) projectName = meta.title.trim();
      continue;
    }
    const type = LIVE_MEMORY_FILES[name];
    if (!type) continue;
    const sections = markdownToEntries(type, name, content);
    entries.push(...sections);
  }

  if (entries.length === 0) {
    throw new Error("no QMAI memory files found in the live project layout");
  }
  return finalizeMemory(slugify(projectName || "qmai-live-project"), projectName || "QMAI 项目", entries);
}

function entriesFromExportMeta(type, parsed) {
  if (Array.isArray(parsed)) {
    return parsed.map((item, index) => ({
      id: `${type}-${index + 1}`,
      type,
      title: String(item?.name || item?.id || item?.description || `${type} ${index + 1}`),
      text: recordToText(item),
    }));
  }
  if (isRecord(parsed)) {
    if (type === "cognition" && isRecord(parsed.characters)) {
      return Object.entries(parsed.characters).map(([characterName, state], index) => ({
        id: `cognition-${index + 1}`,
        type,
        title: `${characterName} 认知状态`,
        text: recordToText(state),
      }));
    }
    return [{ id: `${type}-1`, type, title: type, text: recordToText(parsed) }];
  }
  return [];
}

function entriesFromSnapshot(parsed) {
  const entries = [];
  if (Array.isArray(parsed?.timelineEvents)) {
    entries.push(...parsed.timelineEvents.map((event, index) => ({
      id: `timeline-${index + 1}`,
      type: "timeline",
      title: `时间线事件 ${index + 1}`,
      text: String(event),
    })));
  }
  if (Array.isArray(parsed?.characterStateChanges)) {
    entries.push(...parsed.characterStateChanges.map((change, index) => ({
      id: `character-change-${index + 1}`,
      type: "character",
      title: `人物状态变化 ${index + 1}`,
      text: String(change),
    })));
  }
  return entries;
}

function markdownToEntries(type, fileName, content) {
  const text = String(content).trim();
  if (!text) return [];
  const sections = text.split(/\n(?=##\s)/).map((section) => section.trim()).filter(Boolean);
  if (sections.length === 0) return [];
  return sections.map((section, index) => {
    const heading = firstHeading(section);
    return {
      id: `${type}-${index + 1}`,
      type,
      title: heading || `${fileName} 段落 ${index + 1}`,
      text: section,
    };
  });
}

function finalizeMemory(projectId, projectName, entries) {
  const memory = {
    project: { id: projectId, name: projectName },
    entries: entries.filter((entry) => entry.text.trim().length > 0 || entry.title.trim().length > 0),
  };
  if (memory.entries.length === 0) {
    throw new Error("no QMAI memory files found with readable content");
  }
  // Deep-redacts local paths and secret-like keys so the source
  // machine layout can never leak into LLM context or canvas data.
  return sanitizeDirectorContext(memory);
}

function isKnownMemoryFile(entryPath, name) {
  if (EXPORT_META_FILES[name] || LIVE_MEMORY_FILES[name]) return true;
  if (name === "project-meta.json" || name === "complete-novel.md") return true;
  return name.endsWith(".snapshot.json");
}

function isDirectorProjectFile(entryPath, name) {
  return isDirectorMemoryJson(entryPath, name) || (
    name === "director-meta.json" && normalizeSlashes(entryPath).includes("/director/")
  );
}

function isDirectorMemoryJson(entryPath, name) {
  return normalizeSlashes(entryPath).includes("/director/memory/") && name.toLowerCase().endsWith(".json");
}

function recordToText(value) {
  if (!isRecord(value)) return String(value ?? "");
  return Object.entries(value)
    .filter(([key, child]) => !isSensitiveContextKey(key) && (typeof child === "string" || typeof child === "number"))
    .map(([key, child]) => `${key}: ${child}`)
    .join("\n");
}

function firstHeading(content) {
  const match = String(content).match(/^#+\s*(.+)$/m);
  return match ? match[1].trim() : "";
}

function safeJsonParse(content, entryPath) {
  try {
    return JSON.parse(stripBom(content));
  } catch {
    throw new Error(`QMAI memory file is not valid JSON: ${baseName(entryPath)}`);
  }
}

// Real Windows-authored QMAI files frequently carry a UTF-8 BOM,
// which JSON.parse rejects.
function stripBom(content) {
  return String(content).replace(/^﻿/, "");
}

function baseName(entryPath) {
  return normalizeSlashes(entryPath).split("/").pop() || "";
}

function normalizeSlashes(entryPath) {
  return String(entryPath).replace(/\\/g, "/");
}

function slugify(value) {
  const slug = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "qmai-project";
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
