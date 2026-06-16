import legacyController, {
  createRunningHubTaskStateMachine,
} from "./ImageFreeAngleController.js";
import appStore from "../src/core/stores/appStore.js";
import { generateId } from "../src/core/math.js";
import { applyCameraAngleToPrompt } from "../api/cameraPromptApi.js";
import { processInputImages } from "../api/imageUploadApi.js";
import {
  generateImageWithRegistryModel,
  REGISTRY_IMAGE_PROVIDER,
} from "../components/aigenImage/modelRegistryRuntime.js";
import {
  buildSourceMediaNodePayload,
  getAutoMediaSizeByShortSide,
} from "../services/fileService.js";
import { calcSafeSpawnPosNearNode } from "./nodeSpawn.js";
import { getDisplayModelName } from "./providers.js";
import { resolveImageToolRuntimeModel } from "./toolModelResolutionService.js";
import {
  applyToolModelUiState,
  createToolModelUiState,
} from "./toolModelUiStateService.js";
import { buildStandardImageToolPayload } from "./imageToolGenerationRuntime.js";
import { mountImageToolModelPicker } from "./imageToolModelPicker.js";

const originalRender = legacyController.render;
const originalHandleGenerate = legacyController._handleGenerate;
const originalHandleDebug = legacyController._handleDebug;

function trimText(value) {
  return String(value ?? "").trim();
}

function showToast(message, level = "error") {
  if (typeof window !== "undefined" && typeof window.showToast === "function") {
    window.showToast(message, level);
  }
}

function isRegistryToolState(result) {
  return result?.source === "registry";
}

function findToolRoot(controller, renderedRoot) {
  if (renderedRoot && typeof renderedRoot.querySelectorAll === "function") {
    return renderedRoot;
  }

  const candidates = [
    controller?.rootEl,
    controller?.root,
    controller?.overlayEl,
    controller?.panelEl,
    controller?.container,
    controller?.el,
    controller?.viewEl,
    controller?.cubeEl?.parentElement,
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate.querySelectorAll === "function") {
      return candidate;
    }
  }

  if (typeof document !== "undefined") {
    return document.querySelector?.(".v2-free-angle-embedded") || null;
  }

  return null;
}

export function applyResolvedToolUiState(
  controller,
  sourceNode,
  resolved,
  renderedRoot
) {
  const root = findToolRoot(controller, renderedRoot);
  if (!root) {
    return false;
  }

  const uiState = createToolModelUiState(resolved, {
    imageSize: sourceNode?.imageSize || controller?.nodeData?.imageSize,
  });
  const applied = applyToolModelUiState(root, uiState);

  if (uiState.isRegistryBacked) {
    mountImageToolModelPicker({
      root,
      nodeId: controller?.nodeId,
      nodeData: sourceNode || controller?.nodeData || {},
      store: appStore,
      onChange({ patch }) {
        controller.model = patch.model;
        controller.provider = patch.provider;
        controller.nodeData = {
          ...(controller.nodeData || {}),
          ...patch,
        };
      },
    });
  }

  return applied;
}

function getCurrentStoreState() {
  return appStore.getStateRaw?.() || appStore.getState?.() || { nodes: {} };
}

function getNodeData(nodeId) {
  return getCurrentStoreState().nodes?.[nodeId] || null;
}

function buildCameraAngle(state) {
  const sourceState = state && typeof state === "object" ? state : {};
  return {
    rotation: Number(sourceState.rotation ?? 35) || 35,
    pitch: Number(sourceState.pitch ?? 20) || 20,
    scale: Number(sourceState.scale ?? 0.5) || 0.5,
  };
}

function getSourceNodeElement(nodeId) {
  if (!nodeId || typeof document === "undefined") {
    return null;
  }
  return document.getElementById(nodeId);
}

function getRenderableSourceImage(nodeId, nodeData) {
  const sourceElement = getSourceNodeElement(nodeId);
  const imageEl = sourceElement?.querySelector?.("img") || null;
  const imageUrl =
    trimText(imageEl?.src) ||
    trimText(nodeData?.imageUrl) ||
    trimText(nodeData?.outputImage) ||
    trimText(nodeData?.sourceUrl);

  return {
    imageUrl,
    imageEl,
  };
}

function resolveImageAspectRatio(nodeId, nodeData, fallback = "1:1") {
  const candidate = trimText(nodeData?.aspectRatio);
  if (candidate && candidate !== "auto" && candidate !== "1:1") {
    return candidate;
  }

  const { imageEl } = getRenderableSourceImage(nodeId, nodeData);
  const width =
    Number(nodeData?.imgWidth || nodeData?.naturalWidth || nodeData?.originalWidth) ||
    Number(imageEl?.naturalWidth || 0);
  const height =
    Number(nodeData?.imgHeight || nodeData?.naturalHeight || nodeData?.originalHeight) ||
    Number(imageEl?.naturalHeight || 0);

  if (!width || !height) {
    return fallback;
  }

  const actualRatio = width / height;
  const ratioCandidates = [
    { label: "1:1", value: 1 / 1 },
    { label: "9:10", value: 9 / 10 },
    { label: "10:9", value: 10 / 9 },
    { label: "3:4", value: 3 / 4 },
    { label: "4:3", value: 4 / 3 },
    { label: "3:2", value: 3 / 2 },
    { label: "2:3", value: 2 / 3 },
    { label: "5:4", value: 5 / 4 },
    { label: "4:5", value: 4 / 5 },
    { label: "21:9", value: 21 / 9 },
  ];

  let bestMatch = ratioCandidates[0];
  let smallestDelta = Math.abs(actualRatio - bestMatch.value);
  for (const candidateRatio of ratioCandidates.slice(1)) {
    const delta = Math.abs(actualRatio - candidateRatio.value);
    if (delta < smallestDelta) {
      bestMatch = candidateRatio;
      smallestDelta = delta;
    }
  }

  return bestMatch.label;
}

function getOutputNodeSize(aspectRatio) {
  let width = 288;
  let height = 288;
  const [rawW, rawH] = String(aspectRatio || "")
    .split(":")
    .map((item) => Number.parseFloat(item));

  if (rawW && rawH) {
    const size = getAutoMediaSizeByShortSide(rawW, rawH);
    width = size.width;
    height = size.height;
  }

  return { width, height };
}

function createPendingOutputNode({
  nodeId,
  resolved,
  aspectRatio,
  imageSize,
  cameraAngle,
  generationStartTime,
}) {
  const state = getCurrentStoreState();
  const sourceNode = state.nodes?.[nodeId];
  const { width, height } = getOutputNodeSize(aspectRatio);
  const position = calcSafeSpawnPosNearNode(state.nodes, sourceNode, width, height);
  const outputNodeId = generateId("source-image-rotate");

  const nodePayload = buildSourceMediaNodePayload({
    id: outputNodeId,
    type: "source-image",
    x: position.x,
    y: position.y,
    width,
    height,
    name: "旋转中...",
    src: "",
    jobStatus: "generating",
    generationStartTime,
    generationDuration: null,
    isGenerating: true,
    provider: resolved.provider,
    model: resolved.model,
    selectedModelId: resolved.selectedModelId,
    selectedModelNameSnapshot: resolved.selectedModelNameSnapshot,
    aspectRatio,
    imageSize,
    asyncTaskStatus: "running",
    outputText: `模型: ${getDisplayModelName(resolved.model)}\n旋转${cameraAngle.rotation}° 俯仰${cameraAngle.pitch}° 缩放${cameraAngle.scale}`,
  });

  appStore.addNode(nodePayload);
  appStore.setSelectedNodes?.([outputNodeId]);

  if (typeof window !== "undefined") {
    if (typeof window.v2FocusOnNodes === "function") {
      window.v2FocusOnNodes([nodeId, outputNodeId]);
    } else if (typeof window.v2FocusOnNode === "function") {
      window.v2FocusOnNode(outputNodeId);
    }
  }

  return {
    outputNodeId,
    width,
    height,
  };
}

function normalizeGeneratedImageResult(result) {
  if (Array.isArray(result?.images)) {
    return result.images[0] || null;
  }
  if (result && typeof result === "object") {
    return result;
  }
  return null;
}

function buildRegistryDebugRequestPayload({
  resolved,
  prompt,
  inputUrls,
  aspectRatio,
  imageSize,
}) {
  const requestBody = {
    apiUrl: resolved.baseUrl,
    apiKey: resolved.apiKey,
    model: resolved.model,
    prompt,
    urls: inputUrls,
    shutProgress: true,
  };

  if ((trimText(resolved.adapterType) || "openai_compatible") === "openai_compatible") {
    requestBody.n = 1;
  } else {
    requestBody.batchSize = 1;
  }

  if (trimText(aspectRatio)) {
    requestBody.aspectRatio = trimText(aspectRatio);
  }
  if (trimText(imageSize)) {
    requestBody.imageSize = trimText(imageSize);
  }

  return requestBody;
}

function maskSecret(value) {
  const text = trimText(value);
  if (!text) {
    return "";
  }
  if (text.length <= 8) {
    return `${text.slice(0, 2)}***${text.slice(-1)}`;
  }
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

function upsertDebugNode(outputText, sourceNode) {
  const state = getCurrentStoreState();
  const existingNode = Object.values(state.nodes || {}).find(
    (node) => node?.type === "debug"
  );
  const position = calcSafeSpawnPosNearNode(state.nodes, sourceNode, 380, 300);

  if (!existingNode) {
    appStore.addNode({
      id: `debug-${Date.now()}`,
      type: "debug",
      x: position.x,
      y: position.y,
      width: 380,
      height: 300,
      name: "调试信息",
      outputText,
    });
    return;
  }

  appStore.updateNodeData(existingNode.id, {
    outputText,
    x: position.x,
    y: position.y,
  });
}

async function handleRegistryGenerate(controller) {
  if (!controller?.nodeId) {
    return;
  }

  const sourceNode = getNodeData(controller.nodeId);
  if (!sourceNode) {
    return;
  }

  const resolved = resolveImageToolRuntimeModel(sourceNode);
  if (resolved.state === "deleted") {
    showToast("模型已删除，请重新选择", "warn");
    return;
  }
  if (resolved.state !== "ready") {
    showToast("该模型未配置", "warn");
    return;
  }

  const cameraAngle = buildCameraAngle(controller.state);
  appStore.updateNodeData(controller.nodeId, { cameraAngle });

  const { imageUrl } = getRenderableSourceImage(controller.nodeId, sourceNode);
  const aspectRatio = resolveImageAspectRatio(controller.nodeId, sourceNode);
  const prompt = applyCameraAngleToPrompt("", cameraAngle);
  const payload = buildStandardImageToolPayload({
    operation: "free-angle",
    sourceNode,
    resolved,
    prompt,
    aspectRatio,
    imageSize: trimText(sourceNode.imageSize) || "2K",
    batchSize: 1,
    inputUrls: imageUrl ? [imageUrl] : [],
    extra: { cameraAngle },
  });
  const generationStartTime = Date.now();
  const { outputNodeId } = createPendingOutputNode({
    nodeId: controller.nodeId,
    resolved,
    aspectRatio,
    imageSize: payload.imageSize,
    cameraAngle,
    generationStartTime,
  });

  try {
    const result = normalizeGeneratedImageResult(
      await generateImageWithRegistryModel(payload)
    );
    if (!result) {
      throw new Error("无法获取生成的图像 URL");
    }

    const localPath = trimText(result.localPath).replace(/^\/+/, "");
    const src =
      trimText(result.imageUrl || result.thumbUrl || result.sourceUrl) ||
      (localPath ? `/${localPath}` : "");

    if (!src) {
      throw new Error("无法获取生成的图像 URL");
    }

    appStore.updateNodeData(outputNodeId, {
      name: "旋转图",
      src,
      jobStatus: "success",
      generationDuration: Date.now() - generationStartTime,
      isGenerating: false,
      asyncTaskStatus: "success",
      sourceUrl: trimText(result.sourceUrl),
      imageUrl: trimText(result.imageUrl || result.thumbUrl || result.sourceUrl),
      thumbUrl: trimText(result.thumbUrl || result.imageUrl || result.sourceUrl),
      localPath: localPath || undefined,
      fileName: localPath.split("/").pop() || "",
      outputText: `模型: ${resolved.displayLabel}\n旋转${cameraAngle.rotation}° 俯仰${cameraAngle.pitch}° 缩放${cameraAngle.scale}`,
    });

    showToast("图像生成成功", "success");
  } catch (error) {
    const message = trimText(error?.message) || "图像生成失败";
    appStore.updateNodeData(outputNodeId, {
      name: "旋转失败",
      src: "",
      jobStatus: "error",
      jobError: message,
      generationDuration: Date.now() - generationStartTime,
      isGenerating: false,
      asyncTaskStatus: "failed",
      outputText: `错误: ${message}`,
    });
    showToast(`图像生成失败: ${message}`, "error");
  }
}

async function handleRegistryDebug(controller) {
  if (!controller?.nodeId) {
    return;
  }

  const sourceNode = getNodeData(controller.nodeId);
  if (!sourceNode) {
    return;
  }

  const resolved = resolveImageToolRuntimeModel(sourceNode);
  if (resolved.state === "deleted") {
    showToast("模型已删除，请重新选择", "warn");
    return;
  }
  if (resolved.state !== "ready") {
    showToast("该模型未配置", "warn");
    return;
  }

  const cameraAngle = buildCameraAngle(controller.state);
  const { imageUrl } = getRenderableSourceImage(controller.nodeId, sourceNode);
  const aspectRatio = resolveImageAspectRatio(controller.nodeId, sourceNode);
  const prompt = applyCameraAngleToPrompt("", cameraAngle);
  const processedUrls = await processInputImages(
    imageUrl ? [imageUrl] : [],
    resolved.apiKey,
    {
      applyInputQualityProfile: true,
      provider: "grsai",
    }
  );
  const requestBody = buildRegistryDebugRequestPayload({
    resolved,
    prompt,
    inputUrls: processedUrls,
    aspectRatio,
    imageSize: trimText(sourceNode.imageSize) || "2K",
  });

  const outputText =
    `registry provider = ${REGISTRY_IMAGE_PROVIDER}\n` +
    `selectedModelId = ${resolved.selectedModelId}\n` +
    `selectedModelName = ${resolved.displayLabel}\n\n` +
    `url = "/api/v2/proxy/image"\n\n` +
    `headers = ${JSON.stringify({ "Content-Type": "application/json" }, null, 2)}\n\n` +
    `payload = ${JSON.stringify(
      {
        ...requestBody,
        apiKey: maskSecret(requestBody.apiKey),
      },
      null,
      2
    )}`;

  upsertDebugNode(outputText, sourceNode);
}

legacyController.render = async function renderRegistryAwareImageFreeAngleController(
  ...args
) {
  const sourceNode = args[0] || this.nodeData || getNodeData(this.nodeId);
  const resolved = resolveImageToolRuntimeModel(sourceNode);
  if (isRegistryToolState(resolved) && resolved.state === "ready") {
    this.model = resolved.model;
    this.nodeData = {
      ...(sourceNode || {}),
      model: resolved.model,
      provider: resolved.provider,
    };
  }

  const rendered = await originalRender.apply(this, args);
  applyResolvedToolUiState(this, sourceNode, resolved, rendered);
  return rendered;
};

legacyController._handleGenerate =
  async function handleRegistryAwareImageFreeAngleGenerate() {
    const sourceNode = getNodeData(this.nodeId);
    const resolved = resolveImageToolRuntimeModel(sourceNode);
    if (!isRegistryToolState(resolved)) {
      return originalHandleGenerate.call(this);
    }
    return handleRegistryGenerate(this);
  };

legacyController._handleDebug =
  async function handleRegistryAwareImageFreeAngleDebug() {
    const sourceNode = getNodeData(this.nodeId);
    const resolved = resolveImageToolRuntimeModel(sourceNode);
    if (!isRegistryToolState(resolved)) {
      return originalHandleDebug.call(this);
    }
    return handleRegistryDebug(this);
  };

export { createRunningHubTaskStateMachine };
export default legacyController;
