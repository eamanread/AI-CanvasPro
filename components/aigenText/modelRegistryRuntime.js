import { requester } from "../../api/requester.js";
import { processInputImages } from "../../api/imageUploadApi.js";
import {
  findModelById,
  getModelsByNodeType,
} from "../../modules/modelRegistryService.js";
import {
  extractTextResponseContent,
  hasCompleteModelConfig,
} from "../../modules/modelValidationService.js";
import { getModelMenuSubtitle } from "../../modules/modelMenuDescriptions.js";
import { filterSelectableTextModels } from "../../modules/modelRegistryFilters.js";

export const REGISTRY_TEXT_PROVIDER = "registry-openai";

const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";
const GENERATION_TIMEOUT_MS = 10 * 60 * 1000;
const IMAGE_MENTION_RE = /@图片\d+/g;

function trimText(value) {
  return String(value ?? "").trim();
}

function resolveRegistryTextApiUrl(apiUrl) {
  const normalizedApiUrl = trimText(apiUrl).replace(/\/+$/, "");
  if (!normalizedApiUrl) {
    return "";
  }

  if (
    normalizedApiUrl.includes(":generateContent") ||
    normalizedApiUrl.includes("/v1beta/models") ||
    normalizedApiUrl.endsWith("/chat/completions")
  ) {
    return normalizedApiUrl;
  }

  return `${normalizedApiUrl}/chat/completions`;
}

function normalizeInputUrls(values) {
  return Array.isArray(values)
    ? values.map((value) => trimText(value)).filter(Boolean)
    : [];
}

function uniqueStrings(values) {
  const seen = new Set();
  return values.filter((value) => {
    const text = trimText(value);
    if (!text || seen.has(text)) {
      return false;
    }
    seen.add(text);
    return true;
  });
}

function hasImageMentions(prompt) {
  return /@图片\d+/.test(String(prompt || ""));
}

function mergeAdjacentTextParts(parts) {
  const merged = [];
  let bufferedText = "";

  const flush = () => {
    if (!bufferedText) {
      return;
    }
    merged.push({ type: "text", text: bufferedText });
    bufferedText = "";
  };

  for (const part of parts) {
    if (!part) {
      continue;
    }
    if (part.type === "text") {
      bufferedText += String(part.text || "");
      continue;
    }
    flush();
    merged.push(part);
  }

  flush();
  return merged;
}

function buildPromptMediaParts(prompt, mediaParts) {
  const sourcePrompt = String(prompt || "");
  const normalizedMediaParts = Array.isArray(mediaParts)
    ? mediaParts.filter(Boolean)
    : [];

  if (normalizedMediaParts.length === 0) {
    return sourcePrompt ? [{ type: "text", text: sourcePrompt }] : [];
  }

  const parts = [];
  let cursor = 0;
  let mediaIndex = 0;
  let match;

  IMAGE_MENTION_RE.lastIndex = 0;
  while ((match = IMAGE_MENTION_RE.exec(sourcePrompt))) {
    const prefix = sourcePrompt.slice(cursor, match.index);
    if (prefix) {
      parts.push({ type: "text", text: prefix });
    }
    const mediaPart = normalizedMediaParts[mediaIndex++];
    if (mediaPart) {
      parts.push(mediaPart);
    } else {
      parts.push({ type: "text", text: match[0] });
    }
    cursor = match.index + match[0].length;
  }

  const suffix = sourcePrompt.slice(cursor);
  if (suffix) {
    parts.push({ type: "text", text: suffix });
  }

  while (mediaIndex < normalizedMediaParts.length) {
    parts.push(normalizedMediaParts[mediaIndex++]);
  }

  return parts.length > 0 ? mergeAdjacentTextParts(parts) : normalizedMediaParts.slice();
}

async function buildOpenAICompatibleUserContent(prompt, inputUrls, apiKey) {
  const normalizedInputUrls = normalizeInputUrls(inputUrls);
  const processedUrls = await processInputImages(normalizedInputUrls, apiKey, {
    applyInputQualityProfile: true,
    provider: "openai",
    preferFree: true,
  });

  const imageParts = processedUrls.map((url) => ({
    type: "image_url",
    image_url: { url },
  }));

  if (hasImageMentions(prompt) && normalizedInputUrls.length > 0 && imageParts.length === 0) {
    throw new Error("参考图片处理失败，无法映射 @图片 引用");
  }

  const content = buildPromptMediaParts(prompt, imageParts);
  if (content.length === 1 && content[0]?.type === "text") {
    return content[0].text;
  }
  return content.length > 0 ? content : String(prompt || "");
}

function getTextModels() {
  return filterSelectableTextModels(getModelsByNodeType("text"));
}

export function getSelectableTextModels() {
  return getTextModels();
}

export function buildTextModelSelectionPatch(model) {
  if (!model) {
    return {
      selectedModelId: "",
      selectedModelNameSnapshot: "",
      modelDeleted: true,
    };
  }

  return {
    selectedModelId: model.id,
    selectedModelNameSnapshot: model.modelName,
    modelDeleted: false,
    model: model.modelId || model.modelName,
    provider: REGISTRY_TEXT_PROVIDER,
  };
}

export function normalizeTextNodeData(data) {
  const sourceData =
    data && typeof data === "object" && !Array.isArray(data) ? data : {};
  const selectedModelId = trimText(sourceData.selectedModelId);
  const selectedModelNameSnapshot = trimText(sourceData.selectedModelNameSnapshot);
  const model = selectedModelId ? findModelById(selectedModelId) : null;
  const patch = {};

  if (model) {
    if (selectedModelNameSnapshot !== model.modelName) {
      patch.selectedModelNameSnapshot = model.modelName;
    }
    if (sourceData.modelDeleted) {
      patch.modelDeleted = false;
    }
    return {
      data: {
        ...sourceData,
        selectedModelId: model.id,
        selectedModelNameSnapshot: model.modelName,
        modelDeleted: false,
      },
      model,
      state: hasCompleteModelConfig(model) ? "ready" : "unconfigured",
      patch,
    };
  }

  const fallbackSnapshot =
    selectedModelNameSnapshot || trimText(sourceData.model) || trimText(sourceData.modelName);
  if (fallbackSnapshot && fallbackSnapshot !== selectedModelNameSnapshot) {
    patch.selectedModelNameSnapshot = fallbackSnapshot;
  }
  if (!sourceData.modelDeleted) {
    patch.modelDeleted = true;
  }

  return {
    data: {
      ...sourceData,
      selectedModelId: "",
      selectedModelNameSnapshot: fallbackSnapshot,
      modelDeleted: true,
    },
    model: null,
    state: "deleted",
    patch,
  };
}

export function getTextNodeModelLabel(data) {
  const normalized = normalizeTextNodeData(data);
  if (normalized.model) {
    return normalized.model.modelName;
  }
  return trimText(normalized.data.selectedModelNameSnapshot) || "模型已删除";
}

export function applyTextNodeSelectionPatch(node, store, patch) {
  const nextPatch =
    patch && typeof patch === "object" && !Array.isArray(patch) ? patch : null;
  if (!node || !store || !nextPatch || Object.keys(nextPatch).length === 0) {
    return;
  }

  const currentData = store.getState()?.nodes?.[node.nodeId] || node._data || {};
  const changedPatch = {};
  for (const [key, value] of Object.entries(nextPatch)) {
    if (currentData[key] !== value) {
      changedPatch[key] = value;
    }
  }

  if (Object.keys(changedPatch).length === 0) {
    return;
  }

  node._data = {
    ...currentData,
    ...changedPatch,
  };
  store.updateNodeData(node.nodeId, changedPatch);
}

function buildTextMenuHtml(models, selectedModelId) {
  if (!Array.isArray(models) || models.length === 0) {
    return `
      <div class="floating-menu-item is-empty" data-empty="true" style="cursor:default;opacity:0.7;">
        <div class="fmi-content">
          <div class="fmi-title">暂无文本模型</div>
          <div class="fmi-sub">请先到设置页完成模型配置</div>
        </div>
      </div>
    `;
  }

  return models
    .map((model) => {
      const isActive = trimText(model.id) === trimText(selectedModelId);
      const subText = getModelMenuSubtitle(model, { nodeType: "text" });
      return `
        <div
          class="floating-menu-item${isActive ? " active" : ""}"
          data-model-id="${model.id}"
          style="display:flex;align-items:center;gap:8px;"
        >
          <div class="fmi-content">
            <div class="fmi-title">${model.modelName}</div>
            <div class="fmi-sub">${subText}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

function buildTextMenuSignature(models, selectedModelId) {
  return JSON.stringify({
    selectedModelId: trimText(selectedModelId),
    models: models.map((model) => [
      model.id,
      model.modelName,
      trimText(model.modelId),
      trimText(model.baseUrl),
    ]),
  });
}

function syncTextMenuActiveState(menuEl, selectedModelId) {
  const nextSelectedModelId = trimText(selectedModelId);
  const items = menuEl?.querySelectorAll?.(".floating-menu-item") || [];
  for (const itemEl of items) {
    const isActive = trimText(itemEl?.dataset?.modelId) === nextSelectedModelId;
    if (typeof itemEl?.classList?.toggle === "function") {
      itemEl.classList.toggle("active", isActive);
    } else if (isActive) {
      itemEl?.classList?.add?.("active");
    } else {
      itemEl?.classList?.remove?.("active");
    }
  }
}

export function applyTextModelSelectorUi({ node, data, store }) {
  if (!node?.modelWrap || !store) {
    return;
  }

  const triggerEl = node.modelWrap.querySelector(".img-model-btn-trigger");
  const menuEl = node.modelWrap.querySelector(".img-model-menu");
  const labelEl = node.modelWrap.querySelector(".img-model-label");
  if (!triggerEl || !menuEl || !labelEl) {
    return;
  }

  const normalized = normalizeTextNodeData(data || node._data);
  const models = getTextModels();
  const selectedModelId = trimText(normalized.data.selectedModelId);
  const labelText = normalized.model
    ? normalized.model.modelName
    : trimText(normalized.data.selectedModelNameSnapshot) || "模型已删除";

  labelEl.textContent = labelText;
  triggerEl.title = labelText;
  triggerEl.style.opacity = models.length > 0 ? "" : "0.6";
  triggerEl.disabled = models.length === 0;

  const signature = buildTextMenuSignature(models, selectedModelId);

  if (menuEl.dataset.registrySignature !== signature) {
    menuEl.innerHTML = buildTextMenuHtml(models, selectedModelId);
    menuEl.dataset.registrySignature = signature;
  }
  menuEl.__registryModels = models;
  menuEl.__registryContext = {
    node,
    store,
    labelEl,
    triggerEl,
  };

  if (menuEl.dataset.registryBound === "true") {
    menuEl.dataset.registryNodeId = node.nodeId;
    return;
  }

  menuEl.dataset.registryBound = "true";
  menuEl.dataset.registryNodeId = node.nodeId;
  menuEl.addEventListener("click", (event) => {
    const itemEl = event.target.closest("[data-model-id]");
    if (!itemEl) {
      return;
    }

    const availableModels = Array.isArray(menuEl.__registryModels) ? menuEl.__registryModels : [];
    const model = availableModels.find(
      (entry) => trimText(entry.id) === trimText(itemEl.dataset.modelId)
    );
    if (!model) {
      return;
    }

    const context = menuEl.__registryContext || {};
    const currentNode = context.node || node;
    const currentStore = context.store || store;
    const currentLabelEl = context.labelEl || labelEl;
    const currentTriggerEl = context.triggerEl || triggerEl;

    applyTextNodeSelectionPatch(
      currentNode,
      currentStore,
      buildTextModelSelectionPatch(model)
    );
    currentLabelEl.textContent = model.modelName;
    currentTriggerEl.title = model.modelName;
    syncTextMenuActiveState(menuEl, model.id);
    menuEl.dataset.registrySignature = buildTextMenuSignature(availableModels, model.id);
    menuEl.classList.remove("show");
  });
}

export function resolveTextNodeModelState(data) {
  const normalized = normalizeTextNodeData(data);
  if (normalized.state === "deleted") {
    return {
      state: "deleted",
      model: null,
      data: normalized.data,
      patch: normalized.patch,
    };
  }
  if (!normalized.model || !hasCompleteModelConfig(normalized.model)) {
    return {
      state: "unconfigured",
      model: normalized.model,
      data: normalized.data,
      patch: normalized.patch,
    };
  }
  return {
    state: "ready",
    model: normalized.model,
    data: normalized.data,
    patch: normalized.patch,
  };
}

export function buildRegistryTextPayload(basePayload, model) {
  return {
    ...basePayload,
    model: trimText(model?.modelId),
    provider: REGISTRY_TEXT_PROVIDER,
    apiUrl: trimText(model?.baseUrl),
    apiKey: trimText(model?.apiKey),
    adapterType: trimText(model?.adapterType) || "openai_compatible",
    selectedModelId: trimText(model?.id),
    selectedModelNameSnapshot: trimText(model?.modelName),
  };
}

export async function generateTextWithRegistryModel(payload, options = {}) {
  const apiUrl = resolveRegistryTextApiUrl(payload?.apiUrl);
  const apiKey = trimText(payload?.apiKey);
  const modelId = trimText(payload?.model);
  if (!apiUrl || !apiKey || !modelId) {
    throw new Error("该模型未配置");
  }

  const userContent = await buildOpenAICompatibleUserContent(
    trimText(payload?.prompt),
    uniqueStrings(normalizeInputUrls(payload?.inputUrls)),
    apiKey
  );

  const response = await requester({
    url: apiUrl,
    method: "POST",
    provider: "openai",
    buildUrl: false,
    signal: options?.signal,
    timeout: GENERATION_TIMEOUT_MS,
    responseType: "auto",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      stream: false,
      messages: [
        {
          role: "system",
          content: trimText(payload?.systemPrompt) || DEFAULT_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: userContent,
        },
      ],
    }),
  });

  const text = extractTextResponseContent(response);
  if (!trimText(text)) {
    throw new Error("服务端未返回文本内容");
  }

  return {
    text: trimText(text),
  };
}
