import defaultPromptPresets from "../config/prompt-presets.json" with { type: "json" };
import {
  fetchPromptPresetDefinitionsFromServer,
  fetchPromptPresetsFromServer,
} from "../api/index.js";

const PRESET_SYNC_CHANNEL = "huanying-preset-manager";
const DEFAULT_MANAGER_NODE_TYPE = "ai-image";
const DEFAULT_MANAGER_WIDTH = 1480;
const DEFAULT_MANAGER_HEIGHT = 960;
const DEFAULT_NODE_TYPES = ["ai-image", "ai-text", "ai-video", "ai-audio"];

let customPresets = {};
let syncChannel = null;

export let PROMPT_PRESETS = normalizePresetCollection(defaultPromptPresets, {
  allowSubItems: true,
});

function cloneJsonValue(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function normalizePresetItem(value, { allowSubItems }) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const title = String(value.title || "").trim();
  if (!title) {
    return null;
  }

  const normalized = { title };
  const desc = String(value.desc || "");
  if (desc.trim()) {
    normalized.desc = desc;
  }

  if (allowSubItems && Array.isArray(value.subItems)) {
    normalized.subItems = value.subItems
      .map((item) => normalizePresetItem(item, { allowSubItems: false }))
      .filter(Boolean);
    return normalized;
  }

  const template = String(value.template || "");
  if (!template.trim()) {
    return null;
  }
  normalized.template = template;
  return normalized;
}

function normalizePresetCollection(value, { allowSubItems }) {
  const normalized = {};
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([nodeType, items]) => {
      if (!Array.isArray(items)) {
        return;
      }
      normalized[nodeType] = items
        .map((item) => normalizePresetItem(item, { allowSubItems }))
        .filter(Boolean);
    });
  }
  DEFAULT_NODE_TYPES.forEach((nodeType) => {
    normalized[nodeType] = normalized[nodeType] || [];
  });
  return normalized;
}

function showPresetToast(message, tone = "success") {
  if (typeof window === "undefined") {
    return;
  }
  window.showToast?.(message, tone);
}

function buildPresetManagerUrl(nodeType = DEFAULT_MANAGER_NODE_TYPE) {
  const params = new URLSearchParams();
  if (nodeType) {
    params.set("nodeType", nodeType);
  }
  const query = params.toString();
  return `/dev/preset-manager.html${query ? `?${query}` : ""}`;
}

async function syncCustomPresetsFromExternalManager() {
  await loadCustomPresets();
  showPresetToast("已重新加载预设");
}

function attachPresetSyncListeners() {
  if (typeof window === "undefined") {
    return;
  }
  if (typeof BroadcastChannel === "function" && !syncChannel) {
    syncChannel = new BroadcastChannel(PRESET_SYNC_CHANNEL);
    syncChannel.addEventListener("message", (event) => {
      if (event?.data?.type === "preset-changed") {
        syncCustomPresetsFromExternalManager().catch(() => {});
      }
    });
  }
  window.addEventListener("storage", (event) => {
    if (event.key === PRESET_SYNC_CHANNEL && event.newValue) {
      syncCustomPresetsFromExternalManager().catch(() => {});
    }
  });
}

function resetBuiltinPresetsToDefaults() {
  PROMPT_PRESETS = normalizePresetCollection(cloneJsonValue(defaultPromptPresets), {
    allowSubItems: true,
  });
}

async function loadBuiltinPresetDefinitionsFromServer() {
  try {
    const definitions = await fetchPromptPresetDefinitionsFromServer();
    PROMPT_PRESETS = normalizePresetCollection(definitions, {
      allowSubItems: true,
    });
  } catch (error) {
    console.warn("[promptPresets] Builtin preset definitions load failed.", error);
    resetBuiltinPresetsToDefaults();
  }
}

async function loadCustomPresetFilesFromServer() {
  try {
    const presets = await fetchPromptPresetsFromServer();
    customPresets = normalizePresetCollection(presets, {
      allowSubItems: false,
    });
  } catch (error) {
    console.warn("[promptPresets] Custom presets load failed.", error);
    customPresets = normalizePresetCollection({}, { allowSubItems: false });
  }
}

export async function loadCustomPresets() {
  await Promise.allSettled([
    loadBuiltinPresetDefinitionsFromServer(),
    loadCustomPresetFilesFromServer(),
  ]);
}

export function getPromptPresets(nodeType) {
  const builtinPresets = PROMPT_PRESETS[nodeType] || [];
  const externalPresets = customPresets[nodeType] || [];
  return [...builtinPresets, ...externalPresets];
}

export function openCustomPresetsManager(nodeType = DEFAULT_MANAGER_NODE_TYPE) {
  if (typeof window === "undefined") {
    return null;
  }
  // 优先应用内弹窗(presetManagerModal.autoload.js); 不可用时回退外部窗口。业务逻辑不变。
  if (typeof window.openPresetManagerModal === "function") {
    window.openPresetManagerModal(nodeType);
    return null;
  }
  const url = buildPresetManagerUrl(nodeType);
  const left = Math.max(40, Math.round((window.screen.width - DEFAULT_MANAGER_WIDTH) / 2));
  const top = Math.max(40, Math.round((window.screen.height - DEFAULT_MANAGER_HEIGHT) / 2));
  const features = [
    "popup=yes",
    `width=${DEFAULT_MANAGER_WIDTH}`,
    `height=${DEFAULT_MANAGER_HEIGHT}`,
    `left=${left}`,
    `top=${top}`,
    "resizable=yes",
    "scrollbars=yes",
  ].join(",");
  const managerWindow = window.open(url, "huanying-preset-manager", features);
  if (!managerWindow) {
    window.location.href = url;
    return null;
  }
  managerWindow.focus?.();
  return managerWindow;
}

attachPresetSyncListeners();

if (typeof window !== "undefined") {
  window.openCustomPresetsManager = openCustomPresetsManager;
}
