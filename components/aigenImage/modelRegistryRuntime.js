import { get, post } from "../../api/apiBase.js";
import { processInputImages } from "../../api/imageUploadApi.js";
import { saveRemoteImageLocallyDetailed } from "../../modules/project.js";
import {
  findModelById,
  getModelsByNodeType,
} from "../../modules/modelRegistryService.js";
import {
  buildImageQueryCandidates,
  extractErrorMessage,
  extractImageUrls,
  extractTaskId,
  extractTaskStatus,
  hasCompleteModelConfig,
} from "../../modules/modelValidationService.js";

export const REGISTRY_IMAGE_PROVIDER = "registry-openai";

const IMAGE_SUBMIT_TIMEOUT_MS = 60_000;
const IMAGE_QUERY_TIMEOUT_MS = 30_000;
const IMAGE_POLL_INTERVAL_MS = 3_000;
const IMAGE_MAX_POLL_ROUNDS = 200;

function trimText(value) {
  return String(value ?? "").trim();
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

function getRenderableImageUrl(item) {
  return trimText(item?.imageUrl || item?.thumbUrl || item?.sourceUrl);
}

function parseUrlLike(value) {
  const text = trimText(value);
  if (!text) {
    return null;
  }
  try {
    return new URL(text);
  } catch {
    return null;
  }
}

function resolveGrsaiResultQueryApiUrl(queryUrl) {
  const parsed = parseUrlLike(queryUrl);
  if (!parsed) {
    return "";
  }

  if (!/\/v1\/draw\/(?:result|query|nano-banana\/query)(?:$|\/)/i.test(parsed.pathname)) {
    return "";
  }

  return `${parsed.protocol}//${parsed.host}/v1/draw/result`;
}

function getImageModels() {
  return getModelsByNodeType("image");
}

export function isRegistryImageNodeData(data) {
  const sourceData =
    data && typeof data === "object" && !Array.isArray(data) ? data : {};
  return Boolean(
    trimText(sourceData.selectedModelId) ||
      trimText(sourceData.selectedModelNameSnapshot) ||
      trimText(sourceData.provider) === REGISTRY_IMAGE_PROVIDER
  );
}

export function buildImageModelSelectionPatch(model) {
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
    provider: REGISTRY_IMAGE_PROVIDER,
  };
}

export function normalizeImageNodeData(data) {
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

export function getImageNodeModelLabel(data) {
  const normalized = normalizeImageNodeData(data);
  if (normalized.model) {
    return normalized.model.modelName;
  }
  return trimText(normalized.data.selectedModelNameSnapshot) || "模型已删除";
}

export function applyImageNodeSelectionPatch(node, store, patch) {
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

function buildImageMenuHtml(models, selectedModelId) {
  if (!Array.isArray(models) || models.length === 0) {
    return `
      <div class="floating-menu-item is-empty" data-empty="true" style="cursor:default;opacity:0.7;">
        <div class="fmi-content">
          <div class="fmi-title">暂无图片模型</div>
          <div class="fmi-sub">请先到设置页完成模型配置</div>
        </div>
      </div>
    `;
  }

  return models
    .map((model) => {
      const isActive = trimText(model.id) === trimText(selectedModelId);
      const subText = trimText(model.modelId) || "未配置";
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

export function applyImageModelSelectorUi({ node, data, store }) {
  if (!node?.modelWrap || !store) {
    return;
  }

  const triggerEl = node.modelWrap.querySelector(".img-model-btn-trigger");
  const menuEl = node.modelWrap.querySelector(".img-model-menu");
  const labelEl = node.modelWrap.querySelector(".img-model-label");
  if (!triggerEl || !menuEl || !labelEl) {
    return;
  }

  const normalized = normalizeImageNodeData(data || node._data);
  const models = getImageModels();
  const selectedModelId = trimText(normalized.data.selectedModelId);
  const labelText = getImageNodeModelLabel(normalized.data);

  labelEl.textContent = labelText;
  triggerEl.title = labelText;
  triggerEl.style.opacity = models.length > 0 ? "" : "0.6";
  triggerEl.disabled = models.length === 0;

  const signature = JSON.stringify({
    selectedModelId,
    models: models.map((model) => [
      model.id,
      model.modelName,
      trimText(model.modelId),
      trimText(model.baseUrl),
    ]),
  });

  if (menuEl.dataset.registrySignature !== signature) {
    menuEl.innerHTML = buildImageMenuHtml(models, selectedModelId);
    menuEl.dataset.registrySignature = signature;
  }
  menuEl.__registryModels = models;

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

    applyImageNodeSelectionPatch(node, store, buildImageModelSelectionPatch(model));
    labelEl.textContent = model.modelName;
    triggerEl.title = model.modelName;
    menuEl.classList.remove("show");
  });
}

export function resolveImageNodeModelState(data) {
  const normalized = normalizeImageNodeData(data);
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

export function buildRegistryImagePayload(basePayload, model) {
  return {
    ...basePayload,
    model: trimText(model?.modelId),
    provider: REGISTRY_IMAGE_PROVIDER,
    apiUrl: trimText(model?.baseUrl),
    apiKey: trimText(model?.apiKey),
    adapterType: trimText(model?.adapterType) || "openai_compatible",
    selectedModelId: trimText(model?.id),
    selectedModelNameSnapshot: trimText(model?.modelName),
  };
}

async function queryImageTaskOnce(apiKey, queryUrl) {
  const grsaiResultApiUrl = resolveGrsaiResultQueryApiUrl(queryUrl);
  if (grsaiResultApiUrl) {
    const response = await post(
      "/api/v2/proxy/image",
      {
        apiUrl: grsaiResultApiUrl,
        apiKey,
        id: trimText(parseUrlLike(queryUrl)?.searchParams?.get("task_id")),
      },
      IMAGE_QUERY_TIMEOUT_MS
    );

    if (!response.success) {
      throw new Error(response.error || "图片任务查询失败");
    }

    return response.data;
  }

  const response = await get(
    `/api/v2/proxy/task?apiUrl=${encodeURIComponent(queryUrl)}&apiKey=${encodeURIComponent(apiKey)}`,
    IMAGE_QUERY_TIMEOUT_MS
  );

  if (!response.success) {
    throw new Error(response.error || "图片任务查询失败");
  }

  return response.data;
}

async function waitForRegistryImageTask(payload, taskId) {
  const apiKey = trimText(payload?.apiKey);
  const baseUrl = trimText(payload?.apiUrl);
  const queryCandidates = buildImageQueryCandidates(baseUrl, taskId);
  if (queryCandidates.length === 0) {
    throw new Error(`图片任务已提交（${taskId}），但无法推导查询地址`);
  }

  let lastPendingMessage = "";
  for (let round = 0; round < IMAGE_MAX_POLL_ROUNDS; round += 1) {
    for (const queryUrl of queryCandidates) {
      let snapshot;
      try {
        snapshot = await queryImageTaskOnce(apiKey, queryUrl);
      } catch (error) {
        lastPendingMessage = trimText(error?.message);
        continue;
      }

      const urls = extractImageUrls(snapshot);
      if (urls.length > 0) {
        return urls;
      }

      const status = extractTaskStatus(snapshot);
      if (
        ["failed", "fail", "error", "cancelled", "canceled", "forbidden", "task_failed"].includes(
          status
        )
      ) {
        throw new Error(extractErrorMessage(snapshot, "图片生成失败"));
      }

      if (
        status &&
        ![
          "submitted",
          "pending",
          "queued",
          "queueing",
          "running",
          "processing",
          "querying",
          "waiting",
          "in_progress",
        ].includes(status)
      ) {
        lastPendingMessage = extractErrorMessage(snapshot, `任务状态异常：${status || "unknown"}`);
      }
    }

    if (round < IMAGE_MAX_POLL_ROUNDS - 1) {
      await new Promise((resolve) => setTimeout(resolve, IMAGE_POLL_INTERVAL_MS));
    }
  }

  throw new Error(lastPendingMessage || "图片生成超时，请稍后重试");
}

async function persistGeneratedImages(urls) {
  const projectId = trimText(window.currentProjectId) || "default_v2_project";
  const normalizedUrls = uniqueStrings(normalizeInputUrls(urls));
  const items = [];

  for (const sourceUrl of normalizedUrls) {
    try {
      const saved = await saveRemoteImageLocallyDetailed(sourceUrl, projectId);
      const localPath = trimText(saved?.localPath).replace(/^\/+/, "");
      const fallbackDisplayUrl =
        trimText(saved?.displayUrl) || (localPath ? `/${localPath}` : trimText(sourceUrl));
      items.push({
        sourceId: null,
        thumbId: null,
        sourceUrl,
        thumbUrl:
          trimText(saved?.thumbUrl) ||
          fallbackDisplayUrl ||
          trimText(saved?.localPath) ||
          trimText(sourceUrl),
        imageUrl: fallbackDisplayUrl,
        localPath,
        originalLocalPath: trimText(saved?.originalLocalPath || saved?.localPath),
        displayLocalPath: trimText(saved?.displayLocalPath),
        thumbLocalPath: trimText(saved?.thumbLocalPath),
        originalWidth: Number(saved?.originalWidth || 0) || undefined,
        originalHeight: Number(saved?.originalHeight || 0) || undefined,
      });
    } catch (error) {
      items.push({
        sourceId: null,
        thumbId: null,
        sourceUrl,
        thumbUrl: sourceUrl,
        imageUrl: sourceUrl,
        localPath: "",
        error: trimText(error?.message) || "保存到本地失败，请重试生成",
      });
    }
  }

  return items;
}

export function finalizeGeneratedImages(items) {
  const normalizedItems = Array.isArray(items) ? items.filter(Boolean) : [];
  const usableImages = normalizedItems.filter((item) => {
    return !trimText(item?.error) && Boolean(getRenderableImageUrl(item));
  });

  if (usableImages.length > 0) {
    return usableImages;
  }

  const firstError = normalizedItems.map((item) => trimText(item?.error)).find(Boolean);
  throw new Error(firstError || "图片已生成，但结果图片无法下载或显示");
}

export async function generateImageWithRegistryModel(payload) {
  const apiUrl = trimText(payload?.apiUrl);
  const apiKey = trimText(payload?.apiKey);
  const modelId = trimText(payload?.model);
  if (!apiUrl || !apiKey || !modelId) {
    throw new Error("该模型未配置");
  }

  const inputUrls = await processInputImages(
    uniqueStrings(normalizeInputUrls(payload?.inputUrls)),
    apiKey,
    {
      applyInputQualityProfile: true,
      provider: "grsai",
    }
  );

  const requestBody = {
    apiUrl,
    apiKey,
    model: modelId,
    prompt: trimText(payload?.prompt),
    urls: inputUrls,
    batchSize: Math.max(1, Number(payload?.batchSize || 1) || 1),
    shutProgress: true,
  };

  if (!payload?.suppressAspectRatio && trimText(payload?.aspectRatio)) {
    requestBody.aspectRatio = trimText(payload.aspectRatio);
  }
  if (!payload?.suppressImageSize && trimText(payload?.imageSize)) {
    requestBody.imageSize = trimText(payload.imageSize);
  }

  const response = await post("/api/v2/proxy/image", requestBody, IMAGE_SUBMIT_TIMEOUT_MS);
  if (!response.success) {
    throw new Error(response.error || "图片生成失败");
  }

  const directUrls = extractImageUrls(response.data);
  if (directUrls.length > 0) {
    const images = finalizeGeneratedImages(await persistGeneratedImages(directUrls));
    return images.length === 1 ? images[0] : { isBatch: true, images };
  }

  const taskId = extractTaskId(response.data);
  if (!taskId) {
    throw new Error(extractErrorMessage(response.data, "图片模型未返回任务ID或图片地址"));
  }

  const taskUrls = await waitForRegistryImageTask(payload, taskId);
  const images = finalizeGeneratedImages(await persistGeneratedImages(taskUrls));
  return images.length === 1 ? images[0] : { isBatch: true, images };
}
