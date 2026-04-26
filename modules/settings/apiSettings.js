import { showError, showToast, showWarning } from "../../services/toastService.js";
import {
  MODEL_NODE_TYPES,
  createDefaultRegistry,
  getModelRegistry,
  saveModelRegistry,
} from "../modelRegistryService.js";
import {
  SUPPORTED_VALIDATION_NODE_TYPES,
  buildValidationConfigSignature,
  hasCompleteModelConfig,
  validateModel,
} from "../modelValidationService.js";

const NODE_TYPE_META = Object.freeze({
  text: {
    badge: "文",
    title: "文本节点模型",
    description: "节点下拉只显示 modelName。新建文本节点默认选当前列表第一个模型。",
  },
  image: {
    badge: "图",
    title: "图片节点模型",
    description: "图片测试会发起一次最小真实出图请求，可能产生费用。",
  },
  video: {
    badge: "视",
    title: "视频节点模型",
    description: "当前阶段先纳入全局注册表管理，运行时链路暂不在本批次调整。",
  },
  audio: {
    badge: "音",
    title: "音频节点模型",
    description: "当前阶段先纳入全局注册表管理，运行时链路暂不在本批次调整。",
  },
  other: {
    badge: "其",
    title: "其他 / 定制节点模型",
    description: "用于保留定制链路或后续扩展模型，当前阶段仅做注册表管理。",
  },
});

const STATUS_LABELS = Object.freeze({
  unconfigured: "未配置",
  unverified: "未验证",
  available: "可用",
  failed: "失败",
  deleted: "已删除",
});

const TEMPLATE_ENDPOINTS = Object.freeze({
  text: "https://example.com/v1/chat/completions",
  image: "https://example.com/v1/draw/nano-banana",
  video: "https://example.com/v1/video/generations",
  audio: "https://example.com/v1/audio/speech",
  other: "https://example.com/v1/chat/completions",
});

let draftCounter = 0;

function trimText(value) {
  return String(value ?? "").trim();
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function supportsValidation(nodeType) {
  return SUPPORTED_VALIDATION_NODE_TYPES.includes(trimText(nodeType).toLowerCase());
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function getStatusLabel(status) {
  return STATUS_LABELS[trimText(status).toLowerCase()] || "未验证";
}

function createEmptyValidationState(status) {
  return {
    status,
    lastTestedAt: null,
    lastError: "",
    lastTestResult: null,
  };
}

function areConnectionFieldsEqual(left, right) {
  return (
    trimText(left?.modelId) === trimText(right?.modelId) &&
    trimText(left?.apiKey) === trimText(right?.apiKey) &&
    trimText(left?.baseUrl) === trimText(right?.baseUrl)
  );
}

function getRecommendedTemplate(nodeType, modelName = "") {
  const normalizedNodeType = MODEL_NODE_TYPES.includes(nodeType) ? nodeType : "other";
  const fallbackDefaults = createDefaultRegistry()[normalizedNodeType]?.[0] || {};
  return {
    modelId: trimText(modelName) || trimText(fallbackDefaults.modelId || fallbackDefaults.modelName),
    baseUrl:
      trimText(fallbackDefaults?.templateHints?.baseUrl) ||
      TEMPLATE_ENDPOINTS[normalizedNodeType] ||
      TEMPLATE_ENDPOINTS.other,
  };
}

function normalizeTemplateHints(model, nodeType) {
  const recommended = getRecommendedTemplate(nodeType, model?.modelName);
  return {
    modelId: trimText(model?.templateHints?.modelId || model?.templateHints?.modelID) || recommended.modelId,
    baseUrl: trimText(model?.templateHints?.baseUrl) || recommended.baseUrl,
  };
}

function findModelById(registry, modelId) {
  const expectedId = trimText(modelId);
  if (!expectedId) {
    return null;
  }

  for (const nodeType of MODEL_NODE_TYPES) {
    const match = (registry?.[nodeType] || []).find(
      (model) => trimText(model?.id) === expectedId
    );
    if (match) {
      return match;
    }
  }
  return null;
}

function createDraftId(nodeType) {
  draftCounter += 1;
  return `mdl_${nodeType}_${Date.now()}_${draftCounter}`;
}

function buildUniqueModelName(name, usedNames) {
  const baseName = trimText(name);
  let candidate = baseName;
  let suffix = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${baseName} (${suffix})`;
    suffix += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function createDraftModel(nodeType, registry) {
  const meta = NODE_TYPE_META[nodeType] || NODE_TYPE_META.other;
  const models = Array.isArray(registry?.[nodeType]) ? registry[nodeType] : [];
  const nameBase = `${meta.title.replace("节点模型", "")}模型`;
  const usedNames = new Set(models.map((model) => trimText(model?.modelName).toLowerCase()).filter(Boolean));
  const preferredName = buildUniqueModelName(`${nameBase} ${models.length + 1}`, usedNames);
  const templateHints = getRecommendedTemplate(nodeType, preferredName);
  return {
    id: createDraftId(nodeType),
    nodeType,
    modelName: preferredName,
    modelId: templateHints.modelId,
    apiKey: "",
    baseUrl: "",
    adapterType: "openai_compatible",
    templateHints,
    ...createEmptyValidationState("unconfigured"),
  };
}

function reconcileDraftModel(rawModel, previousSavedModel) {
  const model = {
    ...rawModel,
    id: trimText(rawModel?.id) || createDraftId(trimText(rawModel?.nodeType) || "other"),
    nodeType: MODEL_NODE_TYPES.includes(rawModel?.nodeType) ? rawModel.nodeType : "other",
    modelName: trimText(rawModel?.modelName),
    modelId: trimText(rawModel?.modelId),
    apiKey: trimText(rawModel?.apiKey),
    baseUrl: trimText(rawModel?.baseUrl),
    adapterType: "openai_compatible",
    templateHints: normalizeTemplateHints(rawModel, rawModel?.nodeType),
  };

  const currentStatus = trimText(model.status).toLowerCase();
  if (currentStatus === "deleted") {
    return model;
  }

  if (!hasCompleteModelConfig(model)) {
    return {
      ...model,
      ...createEmptyValidationState("unconfigured"),
    };
  }

  if (previousSavedModel && areConnectionFieldsEqual(model, previousSavedModel)) {
    return {
      ...model,
      status: currentStatus || trimText(previousSavedModel.status).toLowerCase() || "unverified",
      lastTestedAt: model.lastTestedAt ?? previousSavedModel.lastTestedAt ?? null,
      lastError: trimText(model.lastError) || trimText(previousSavedModel.lastError),
      lastTestResult: model.lastTestResult ?? previousSavedModel.lastTestResult ?? null,
    };
  }

  if (
    ["available", "failed"].includes(currentStatus) &&
    (model.lastTestedAt || model.lastTestResult) &&
    trimText(model?.lastTestResult?.validatedConfigSignature) ===
      buildValidationConfigSignature(model)
  ) {
    return model;
  }

  return {
    ...model,
    ...createEmptyValidationState("unverified"),
  };
}

export function prepareRegistryForPersistence(registry, previousRegistry = null) {
  const normalizedPreviousRegistry = previousRegistry || createDefaultRegistry();
  const nextRegistry = {};
  const warnings = [];
  const errors = [];

  for (const nodeType of MODEL_NODE_TYPES) {
    const usedNames = new Set();
    const sourceModels = Array.isArray(registry?.[nodeType]) ? registry[nodeType] : [];
    nextRegistry[nodeType] = [];

    sourceModels.forEach((rawModel, index) => {
      const rawName = trimText(rawModel?.modelName);
      if (!rawName) {
        errors.push(`${NODE_TYPE_META[nodeType].title} 第 ${index + 1} 个模型缺少 modelName`);
        return;
      }

      const uniqueName = buildUniqueModelName(rawName, usedNames);
      if (uniqueName !== rawName) {
        warnings.push(
          `${NODE_TYPE_META[nodeType].title} 中存在重名，已自动调整为 ${uniqueName}`
        );
      }

      const previousSavedModel = findModelById(normalizedPreviousRegistry, rawModel?.id);
      const draftModel = reconcileDraftModel(
        {
          ...rawModel,
          id: trimText(rawModel?.id) || createDraftId(nodeType),
          nodeType,
          modelName: uniqueName,
        },
        previousSavedModel
      );

      nextRegistry[nodeType].push(draftModel);
    });
  }

  return {
    registry: nextRegistry,
    warnings,
    errors,
  };
}

function renderModelMeta(model) {
  const parts = [`状态：${getStatusLabel(model.status)}`];
  const testedAtLabel = formatDateTime(model.lastTestedAt);
  if (testedAtLabel) {
    parts.push(`最近测试：${testedAtLabel}`);
  }
  return parts.join(" · ");
}

function renderModelCard(nodeType, model, index, state) {
  const validationSupported = supportsValidation(nodeType);
  const disabledAttr = state.loading || state.saving || Boolean(state.testingModelId) ? " disabled" : "";
  const isTesting = state.testingModelId === model.id;
  const canDelete = true;

  return `
    <div class="settings-section settings-card model-registry-card" data-node-type="${nodeType}" data-model-id="${model.id}">
      <div class="model-registry-card-head">
        <div class="model-registry-card-title-wrap">
          <div class="settings-card-badge">${index + 1}</div>
          <div>
            <div class="model-registry-card-title js-model-title">${model.modelName || "未命名模型"}</div>
            <div class="model-registry-card-meta js-model-meta">${renderModelMeta(model)}</div>
          </div>
        </div>
        <div class="model-registry-card-actions">
          <button type="button" class="settings-btn-ghost model-registry-action-btn" data-action="move-up" data-model-id="${model.id}"${disabledAttr}>上移</button>
          <button type="button" class="settings-btn-ghost model-registry-action-btn" data-action="move-down" data-model-id="${model.id}"${disabledAttr}>下移</button>
          <button type="button" class="settings-btn-ghost model-registry-action-btn" data-action="apply-template" data-model-id="${model.id}"${disabledAttr}>套用模板</button>
          <button type="button" class="settings-btn-ghost model-registry-action-btn" data-action="test-model" data-model-id="${model.id}"${disabledAttr}${validationSupported ? "" : ' disabled title="当前阶段仅支持文本/图片模型测试"'}>${isTesting ? "测试中..." : "测试"}</button>
          <button type="button" class="settings-btn-ghost model-registry-action-btn model-registry-action-btn--danger" data-action="delete-model" data-model-id="${model.id}"${disabledAttr}${canDelete ? "" : " disabled"}>删除</button>
        </div>
      </div>
      <div class="model-registry-grid">
        <label class="model-registry-field">
          <span class="settings-label">modelName</span>
          <input type="text" class="settings-input" data-field="modelName" value="${escapeHtml(model.modelName)}" placeholder="例如 gemini-3.1"${disabledAttr}>
        </label>
        <label class="model-registry-field">
          <span class="settings-label">modelId</span>
          <input type="text" class="settings-input" data-field="modelId" value="${escapeHtml(model.modelId)}" placeholder="例如 gemini-3.1"${disabledAttr}>
        </label>
        <label class="model-registry-field model-registry-field--full">
          <span class="settings-label">baseUrl</span>
          <input type="text" class="settings-input" data-field="baseUrl" value="${escapeHtml(model.baseUrl)}" placeholder="完整请求地址，例如 https://example.com/v1/chat/completions"${disabledAttr}>
        </label>
        <label class="model-registry-field model-registry-field--full">
          <span class="settings-label">apiKey</span>
          <input type="password" class="settings-input" data-field="apiKey" value="${escapeHtml(model.apiKey)}" placeholder="sk-..."${disabledAttr}>
        </label>
      </div>
      <div class="model-registry-inline-note">推荐模板：modelId=${escapeHtml(model.templateHints?.modelId || "")}，baseUrl=${escapeHtml(model.templateHints?.baseUrl || "")}</div>
      <div class="model-registry-error js-model-error"${model.lastError ? "" : " hidden"}>${escapeHtml(model.lastError || "")}</div>
    </div>
  `;
}

function renderNodeTypeSection(nodeType, state) {
  const meta = NODE_TYPE_META[nodeType] || NODE_TYPE_META.other;
  const models = state.registry[nodeType] || [];
  const disabledAttr = state.loading || state.saving || Boolean(state.testingModelId) ? " disabled" : "";
  const validationNote = supportsValidation(nodeType)
    ? "支持最小真实请求测试。"
    : "当前分组仅支持保存和排序，测试按钮暂不启用。";

  return `
    <section class="model-registry-section" data-node-type="${nodeType}">
      <div class="model-registry-section-head">
        <div class="settings-card-head model-registry-section-title">
          <div class="settings-card-badge">${meta.badge}</div>
          <span class="settings-card-title">${meta.title}</span>
        </div>
        <button type="button" class="settings-save-btn settings-btn-ghost model-registry-add-btn" data-action="add-model" data-node-type="${nodeType}"${disabledAttr}>新增模型</button>
      </div>
      <div class="settings-desc model-registry-section-desc">${meta.description} ${validationNote}</div>
      ${
        models.length > 0
          ? models.map((model, index) => renderModelCard(nodeType, model, index, state)).join("")
          : `<div class="model-registry-empty">
              <div>当前分组还没有模型。</div>
              <button type="button" class="settings-btn-ghost model-registry-action-btn" data-action="add-model" data-node-type="${nodeType}"${disabledAttr}>新增一个模型</button>
            </div>`
      }
    </section>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderRegistry(root, state) {
  root.innerHTML = MODEL_NODE_TYPES.map((nodeType) => renderNodeTypeSection(nodeType, state)).join("");
}

function updateSaveButton(button, state) {
  if (!button) {
    return;
  }

  button.disabled = state.loading || state.saving || Boolean(state.testingModelId);
  if (state.saving) {
    button.textContent = "保存中...";
    return;
  }
  if (state.testingModelId) {
    button.textContent = "测试中...";
    return;
  }
  button.textContent = "保存模型配置";
}

function markDirty(state, button) {
  state.dirty = true;
  updateSaveButton(button, state);
}

function findModelLocation(registry, modelId) {
  const expectedId = trimText(modelId);
  for (const nodeType of MODEL_NODE_TYPES) {
    const index = (registry[nodeType] || []).findIndex(
      (model) => trimText(model?.id) === expectedId
    );
    if (index >= 0) {
      return { nodeType, index };
    }
  }
  return null;
}

function mutateModel(registry, modelId, updater) {
  const location = findModelLocation(registry, modelId);
  if (!location) {
    return false;
  }

  const current = registry[location.nodeType][location.index];
  registry[location.nodeType][location.index] = updater(current, location);
  return true;
}

async function persistRegistry(state, saveButton, { successMessage } = {}) {
  const { registry, warnings, errors } = prepareRegistryForPersistence(
    state.registry,
    state.lastSavedRegistry
  );

  if (errors.length > 0) {
    showError(errors[0]);
    return false;
  }

  state.saving = true;
  updateSaveButton(saveButton, state);

  try {
    const savedRegistry = await saveModelRegistry(registry);
    state.registry = cloneJson(savedRegistry);
    state.lastSavedRegistry = cloneJson(savedRegistry);
    state.dirty = false;
    warnings.forEach((warning) => showToast(warning, "warn", 2200));
    if (successMessage) {
      showToast(successMessage, "success");
    }
    return true;
  } catch (error) {
    showError(error?.message || "保存模型配置失败");
    return false;
  } finally {
    state.saving = false;
    updateSaveButton(saveButton, state);
  }
}

function syncModelCardView(cardEl, model) {
  if (!cardEl) {
    return;
  }

  const titleEl = cardEl.querySelector(".js-model-title");
  const metaEl = cardEl.querySelector(".js-model-meta");
  const errorEl = cardEl.querySelector(".js-model-error");

  if (titleEl) {
    titleEl.textContent = model.modelName || "未命名模型";
  }
  if (metaEl) {
    metaEl.textContent = renderModelMeta(model);
  }
  if (errorEl) {
    const message = trimText(model.lastError);
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }
}

export function initApiSettings() {
  const root = document.getElementById("modelRegistrySettingsRoot");
  const saveButton = document.getElementById("btnModelRegistrySave");
  if (!root || !saveButton) {
    return;
  }

  const state = {
    registry: createDefaultRegistry(),
    lastSavedRegistry: createDefaultRegistry(),
    loading: true,
    saving: false,
    dirty: false,
    testingModelId: "",
  };

  updateSaveButton(saveButton, state);
  renderRegistry(root, state);

  getModelRegistry()
    .then((registry) => {
      state.registry = cloneJson(registry);
      state.lastSavedRegistry = cloneJson(registry);
      state.loading = false;
      renderRegistry(root, state);
      updateSaveButton(saveButton, state);
    })
    .catch((error) => {
      console.error("[Settings] 加载模型注册表失败:", error);
      state.loading = false;
      renderRegistry(root, state);
      updateSaveButton(saveButton, state);
      showError(error?.message || "加载模型注册表失败");
    });

  saveButton.addEventListener("click", async () => {
    await persistRegistry(state, saveButton, { successMessage: "模型配置已保存" });
    renderRegistry(root, state);
  });

  root.addEventListener("input", (event) => {
    const input = event.target.closest("[data-field]");
    if (!input) {
      return;
    }

    const cardEl = input.closest("[data-model-id]");
    const modelId = trimText(cardEl?.dataset?.modelId);
    if (!modelId) {
      return;
    }

    const field = trimText(input.dataset.field);
    mutateModel(state.registry, modelId, (current) => {
      const previousSavedModel = findModelById(state.lastSavedRegistry, modelId);
      const nextModel = reconcileDraftModel(
        {
          ...current,
          [field]: input.value,
        },
        previousSavedModel
      );
      syncModelCardView(cardEl, nextModel);
      return nextModel;
    });
    markDirty(state, saveButton);
  });

  root.addEventListener("click", async (event) => {
    const trigger = event.target.closest("[data-action]");
    if (!trigger) {
      return;
    }

    const action = trimText(trigger.dataset.action);
    const nodeType = trimText(trigger.dataset.nodeType) || trimText(trigger.closest("[data-node-type]")?.dataset?.nodeType);
    const modelId = trimText(trigger.dataset.modelId);

    if (action === "add-model") {
      state.registry[nodeType] = [...(state.registry[nodeType] || []), createDraftModel(nodeType, state.registry)];
      markDirty(state, saveButton);
      renderRegistry(root, state);
      return;
    }

    if (!modelId) {
      return;
    }

    if (action === "delete-model") {
      state.registry[nodeType] = (state.registry[nodeType] || []).filter(
        (model) => trimText(model.id) !== modelId
      );
      markDirty(state, saveButton);
      renderRegistry(root, state);
      return;
    }

    if (action === "move-up" || action === "move-down") {
      const items = [...(state.registry[nodeType] || [])];
      const currentIndex = items.findIndex((model) => trimText(model.id) === modelId);
      if (currentIndex < 0) {
        return;
      }
      const targetIndex = action === "move-up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= items.length) {
        return;
      }
      [items[currentIndex], items[targetIndex]] = [items[targetIndex], items[currentIndex]];
      state.registry[nodeType] = items;
      markDirty(state, saveButton);
      renderRegistry(root, state);
      return;
    }

    if (action === "apply-template") {
      mutateModel(state.registry, modelId, (current) => {
        const previousSavedModel = findModelById(state.lastSavedRegistry, modelId);
        const templateHints = normalizeTemplateHints(current, current.nodeType);
        return reconcileDraftModel(
          {
            ...current,
            modelId: templateHints.modelId || current.modelId,
            baseUrl: templateHints.baseUrl || current.baseUrl,
            templateHints,
          },
          previousSavedModel
        );
      });
      markDirty(state, saveButton);
      renderRegistry(root, state);
      showToast("已填入推荐模板，请补充 API Key 后测试", "success");
      return;
    }

    if (action === "test-model") {
      if (!supportsValidation(nodeType)) {
        showWarning("当前阶段仅支持文本/图片模型测试");
        return;
      }

      const model = findModelById(state.registry, modelId);
      if (!model) {
        return;
      }

      if (!hasCompleteModelConfig(model)) {
        showWarning("缺少 modelId、apiKey 或 baseUrl，无法测试");
        return;
      }

      if (
        nodeType === "image" &&
        typeof window !== "undefined" &&
        typeof window.confirm === "function"
      ) {
        const confirmed = window.confirm(
          "图片模型测试会发起一次真实出图请求，可能产生费用。是否继续？"
        );
        if (!confirmed) {
          return;
        }
      }

      state.testingModelId = modelId;
      renderRegistry(root, state);

      const validationResult = await validateModel(model);
      mutateModel(state.registry, modelId, (current) => ({
        ...current,
        ...validationResult,
      }));

      const persisted = await persistRegistry(state, saveButton, {
        successMessage:
          validationResult.status === "available"
            ? "模型测试通过，结果已保存"
            : "模型测试失败，结果已保存",
      });

      state.testingModelId = "";
      renderRegistry(root, state);

      if (!persisted && validationResult.status === "failed") {
        showWarning(validationResult.lastError || "模型测试失败");
      }
    }
  });
}
