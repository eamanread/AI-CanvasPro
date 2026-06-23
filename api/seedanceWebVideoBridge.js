import { applyCameraAngleToPrompt } from "./cameraPromptApi.js";
import { fetchRemoteBlob } from "./projectsV2Api.js";
import {
  querySeedanceWebResult,
  submitSeedanceWebVideoTask,
} from "./seedanceWebApi.js";

const SEEDANCE_WEB_PROVIDER = "seedance_web";
const SEEDANCE_WEB_TIMEOUT_MS = 10 * 60 * 1000;
const SEEDANCE_WEB_POLL_INTERVAL_MS = 2000;
const SEEDANCE_WEB_MAX_TRANSIENT_QUERY_FAILURES = 5;

function normalizeProvider(value) {
  return String(value || "").trim().toLowerCase();
}

function readSelectedDreaminaRegion() {
  try {
    return normalizeProvider(globalThis?.localStorage?.getItem("dreaminaLoginRegion"));
  } catch {
    return "";
  }
}

export function shouldUseSeedanceWebVideoBridge(source = {}, provider = "") {
  const explicit = normalizeProvider(
    source.seedanceProvider ||
      source.dreaminaProvider ||
      source.providerMode ||
      source.loginRegion ||
      source.dreaminaLoginRegion ||
      source.region,
  );
  const normalizedProvider = normalizeProvider(provider || source.provider);
  if (["seedance_web", "seedance-web"].includes(normalizedProvider)) {
    return true;
  }
  if (["seedance_web", "seedance-web"].includes(explicit)) {
    return true;
  }
  if (normalizedProvider !== "dreamina") {
    return false;
  }
  if (["overseas", "global", "international", "intl"].includes(explicit)) {
    return true;
  }
  return readSelectedDreaminaRegion() === "overseas";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeVideos(result = {}) {
  const rawVideos = Array.isArray(result.videos)
    ? result.videos
    : Array.isArray(result.outputs)
      ? result.outputs
      : [];
  return rawVideos
    .map((item) => {
      const videoUrl = String(
        item?.videoUrl || item?.url || item?.localUrl || item?.localPath || item || "",
      ).trim();
      const localPath = String(item?.localPath || "").trim();
      return { videoUrl, localPath };
    })
    .filter((item) => item.videoUrl || item.localPath);
}

function normalizeResult(result = {}) {
  const videos = normalizeVideos(result);
  return {
    isBatch: videos.length > 1,
    videos,
    videoUrl: videos[0]?.videoUrl || "",
    localPath: videos[0]?.localPath || "",
  };
}

async function urlToDataUrl(url) {
  const raw = String(url || "").trim();
  if (!raw || raw.startsWith("data:")) {
    return raw;
  }
  const blob = await fetchRemoteBlob(raw);
  if (!blob) {
    return "";
  }
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("读取参考素材失败"));
    reader.readAsDataURL(blob);
  });
}

async function buildReferenceFiles(source = {}) {
  const references = [];
  if (Array.isArray(source.referenceFiles)) {
    references.push(...source.referenceFiles);
  }
  const images = Array.isArray(source.images) && source.images.length
    ? source.images
    : source.inputUrls;
  if (Array.isArray(images)) {
    images.forEach((item, index) => {
      references.push({
        fileName: `reference-${index + 1}.png`,
        url: String(item || "").trim(),
        fileType: "image/png",
      });
    });
  }
  if (Array.isArray(source.videos)) {
    source.videos.forEach((item, index) => {
      const sourceItem = item && typeof item === "object" ? item : { url: item };
      references.push({
        ...sourceItem,
        fileName: `reference-video-${index + 1}.mp4`,
        url: String(sourceItem.url || sourceItem.localPath || "").trim(),
        fileType: sourceItem.fileType || sourceItem.type || "video/mp4",
      });
    });
  }

  const normalized = [];
  for (const item of references) {
    if (!item) {
      continue;
    }
    const data = String(item.data || item.base64 || "").trim() || await urlToDataUrl(item.url || item.localPath);
    normalized.push({
      ...item,
      data,
      base64: data,
      type: item.type || item.fileType || "image/png",
      fileType: item.fileType || item.type || "image/png",
      fileName: item.fileName || item.name || "reference.png",
    });
  }
  return normalized.filter((item) => item.data);
}

function normalizeSeedanceWebErrorDetail(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function isTransientSeedanceWebQueryError(error) {
  const message = normalizeSeedanceWebErrorDetail(error?.message || error).toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("network request failed") ||
    message.includes("networkerror") ||
    message.includes("network error") ||
    message.includes("网络请求失败") ||
    message.includes("请求超时") ||
    message.includes("request timeout")
  );
}

function translateSeedanceWebPresetError(rawMessage) {
  const raw = normalizeSeedanceWebErrorDetail(rawMessage);
  const lower = raw.toLowerCase();
  if (!lower.includes("preset failed")) {
    return "";
  }

  const fieldLabels = {
    model: "模型",
    "reference mode": "参考模式",
    "aspect ratio": "画面比例",
    duration: "时长",
  };
  const fieldMatch = raw.match(/(?:preset failed:\s*)?([a-z ]+?) did not switch to ([^;]+)/i);
  const fieldName = fieldLabels[String(fieldMatch?.[1] || "").trim().toLowerCase()] || "参数";
  const target = normalizeSeedanceWebErrorDetail(fieldMatch?.[2]);
  const current = normalizeSeedanceWebErrorDetail(raw.match(/;\s*current:\s*([^;]+)/i)?.[1]);
  const options = normalizeSeedanceWebErrorDetail(raw.match(/;\s*options:\s*(.+)$/i)?.[1]);
  const details = [];
  if (target) {
    details.push(`目标${fieldName}：${target}`);
  }
  if (current) {
    details.push(`当前：${current}`);
  }
  if (options) {
    details.push(`可选项：${options}`);
  }
  return details.length
    ? `海外版即梦参数设置失败，${details.join("；")}。请确认海外网页上的选项是否仍然可用。`
    : "海外版即梦参数设置失败，请确认海外网页上的模型、比例、时长等选项是否仍然可用。";
}

function toSeedanceWebNodeErrorMessage(message, status = "") {
  const raw = normalizeSeedanceWebErrorDetail(message);
  const lower = raw.toLowerCase();
  if (!raw) {
    return normalizeProvider(status) === "timeout"
      ? "海外版即梦视频生成超时，请稍后重试。"
      : "海外版即梦视频生成失败，请查看海外网页上的提示后重试。";
  }
  const presetMessage = translateSeedanceWebPresetError(raw);
  if (presetMessage) {
    return presetMessage;
  }
  if (lower.includes("page is not connected") || lower.includes("webpage is not connected")) {
    return "海外版即梦网页未连接，请先在设置中打开海外版登录窗口，并确认页面已连接到工作台。";
  }
  if (lower.includes("page script did not respond") || lower.includes("script did not respond")) {
    return "海外版即梦页面脚本没有响应，请刷新海外版网页后重试。";
  }
  if (lower.includes("fill/upload failed")) {
    return "海外版即梦填写提示词或上传素材失败，请检查参考素材是否可用后重试。";
  }
  if (lower.includes("click generate failed")) {
    return "海外版即梦点击生成失败，请确认网页没有验证码、弹窗或额度提示后重试。";
  }
  if (lower.includes("video upload back to workbench failed")) {
    return "海外版即梦视频已生成，但回传到工作台失败，请检查本地服务连接后重试。";
  }
  if (
    lower.includes("may contain inappropriate content") ||
    lower.includes("inappropriate content")
  ) {
    return "海外版即梦审核未通过：音频/视频可能包含不合规内容，请调整提示词或素材后重试。";
  }
  if (lower.includes("something went wrong") || lower.includes("refresh and try again")) {
    return "Overseas Dreamina page error: Something went wrong. Refresh and try again.";
  }
  if (lower.includes("video generation timed out") || lower.includes("generation timed out")) {
    return "海外版即梦视频生成超时，请稍后在网页中确认结果，或重新提交任务。";
  }
  if (lower.includes("missing overseas task code")) {
    return "海外版即梦任务创建失败：未返回任务编号。";
  }
  return raw;
}

export async function runSeedanceWebVideoGeneration(source = {}, options = {}) {
  const referenceFiles = await buildReferenceFiles(source);
  const task = await submitSeedanceWebVideoTask({
    prompt: applyCameraAngleToPrompt(source.prompt, source.cameraAngle),
    modelConfig: {
      model: source.model || source.modelVersion || "",
      aspectRatio: source.aspectRatio || source.ratio || "",
      duration: source.duration || "",
      routeMode: source.dreaminaRouteMode || "",
      taskType: source.dreaminaTaskType || "",
    },
    referenceFiles,
    realSubmit: true,
  });
  const taskCode = String(task?.taskCode || task?.submitId || task?.taskId || "").trim();
  if (!taskCode) {
    throw new Error("海外版 Seedance 任务提交失败：未返回 taskCode");
  }
  options?.onTaskMeta?.({
    taskId: taskCode,
    submitId: taskCode,
    provider: SEEDANCE_WEB_PROVIDER,
    kind: "video",
  });
  options?.onTaskId?.(taskCode);

  const startedAt = Date.now();
  let transientQueryFailures = 0;
  while (Date.now() - startedAt < SEEDANCE_WEB_TIMEOUT_MS) {
    if (options?.signal?.aborted) {
      throw new Error("CANCELLED");
    }
    let result;
    try {
      result = await querySeedanceWebResult(taskCode);
      transientQueryFailures = 0;
    } catch (error) {
      transientQueryFailures += 1;
      if (
        transientQueryFailures <= SEEDANCE_WEB_MAX_TRANSIENT_QUERY_FAILURES &&
        isTransientSeedanceWebQueryError(error)
      ) {
        await sleep(SEEDANCE_WEB_POLL_INTERVAL_MS);
        continue;
      }
      throw error;
    }
    const status = normalizeProvider(result?.status);
    if (["completed", "success", "succeeded", "done"].includes(status)) {
      return normalizeResult(result);
    }
    if (["failed", "timeout"].includes(status)) {
      throw new Error(toSeedanceWebNodeErrorMessage(result?.error || result?.message, status));
    }
    await sleep(SEEDANCE_WEB_POLL_INTERVAL_MS);
  }
  throw new Error("海外版 Seedance 视频生成超时");
}
