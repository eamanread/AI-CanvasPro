import * as ApimartAdapter from "./adapters/ApimartAdapter.js";
import * as GeminiAdapter from "./adapters/GeminiAdapter.js";
import * as PpioAdapter from "./adapters/PpioAdapter.js";
import { ensureConfig, getProviderConfig } from "./configApi.js";
import { applyCameraAngleToPrompt } from "./cameraPromptApi.js";
import { buildApiUrl, fetchWithTimeout, fetchWithTimeoutWithSignal } from "./apiBase.js";
import { processInputImages, uploadToRunningHub } from "./imageUploadApi.js";
import { get as fetchRemoteBlob } from "./requester.js";
import { ApiError, parseError, parseNetworkError } from "./errors/index.js";

const GENERATION_TIMEOUT = 10 * 60 * 1000;
const RUNNINGHUB_POLL_INTERVAL_MS = 3000;
const IMAGE_MENTION_RE = /@图片\d+/g;
const RUNNINGHUB_CONTACT_SHEET_MAX_SIDE_PX = 2048;
const RUNNINGHUB_CONTACT_SHEET_GAP_PX = 24;
const RUNNINGHUB_CONTACT_SHEET_MIN_CELL_PX = 256;
const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";

function normalizeInputUrls(values) {
  return Array.isArray(values)
    ? values.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createAbortError() {
  const error = new Error("aborted");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function isAbortError(error) {
  return error?.name === "AbortError" || String(error?.message || "").toLowerCase().includes("abort");
}

async function sleepWithSignal(ms, signal) {
  if (!signal) {
    await sleep(ms);
    return;
  }

  throwIfAborted(signal);
  await new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal.removeEventListener("abort", abortListener);
      resolve();
    }, ms);
    const abortListener = () => {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", abortListener);
      reject(createAbortError());
    };
    signal.addEventListener("abort", abortListener, { once: true });
  });
}

function pickFirstNonEmptyString(values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function isRunningHubTextModel(provider, model) {
  return provider === "runninghub" && String(model || "").startsWith("runninghub-model/");
}

function parseRunningHubResponseData(value) {
  if (!value) {
    return {};
  }
  if (typeof value === "object") {
    return value;
  }

  const text = String(value || "").trim();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {}

  const sseLines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"));
  if (sseLines.length > 0) {
    const lastPayload = sseLines[sseLines.length - 1].replace(/^data:\s*/, "");
    try {
      return JSON.parse(lastPayload);
    } catch {}
  }

  throw new Error("无法解析 RunningHUB 文本接口响应");
}

function getRunningHubTaskId(payload) {
  return String(
    payload?.taskId ||
      payload?.task_id ||
      payload?.data?.taskId ||
      payload?.data?.task_id ||
      payload?.data?.id ||
      payload?.id ||
      ""
  ).trim();
}

function stringifyRunningHubReason(value) {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "object") {
    const direct = pickFirstNonEmptyString([
      value.message,
      value.msg,
      value.errorMessage,
      value.failedReason,
      value.reason,
      value.detail,
    ]);
    if (direct) {
      return direct;
    }
    try {
      return JSON.stringify(value);
    } catch {}
  }
  return String(value || "").trim();
}

function getRunningHubTextErrorMessage(payload, fallback = "文本生成失败") {
  return (
    pickFirstNonEmptyString([
      payload?.msg,
      payload?.message,
      payload?.errorMessage,
      payload?.failedReason,
      stringifyRunningHubReason(payload?.reason),
      stringifyRunningHubReason(payload?.detail),
    ]) || fallback
  );
}

function sanitizeGeneratedText(value) {
  return String(value || "").replace(/<think>[\s\S]*?<\/think>\n?/g, "").trim();
}

function hasImageMentions(prompt) {
  return /@图片\d+/.test(String(prompt || ""));
}

function guessImageMimeType(url) {
  const normalized = String(url || "").trim().toLowerCase();
  if (normalized.startsWith("data:")) {
    const match = normalized.match(/^data:(image\/[^;,]+)[;,]/i);
    return match?.[1] || "image/png";
  }
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.includes(".jpg") || normalized.includes(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".bmp")) return "image/bmp";
  if (normalized.endsWith(".gif")) return "image/gif";
  if (normalized.includes(".avif")) return "image/avif";
  if (normalized.endsWith(".svg")) return "image/svg+xml";
  return "image/jpeg";
}

function arrayBufferToBase64(buffer) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(buffer).toString("base64");
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  if (typeof btoa === "function") {
    return btoa(binary);
  }
  throw new Error("当前环境不支持图片 Base64 编码");
}

function resolveInputFetchUrl(url) {
  const normalized = String(url || "").trim();
  if (!normalized) {
    return "";
  }
  if (/^(?:https?:|data:|blob:)/i.test(normalized)) {
    return normalized;
  }
  if (normalized.startsWith("/")) {
    return buildApiUrl(normalized);
  }
  return normalized;
}

function loadCanvasImageFromObjectUrl(objectUrl) {
  return new Promise((resolve, reject) => {
    const ImageCtor = globalThis?.Image;
    if (typeof ImageCtor !== "function") {
      reject(new Error("当前环境不支持图片加载"));
      return;
    }

    const image = new ImageCtor();
    if ("crossOrigin" in image) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = objectUrl;
  });
}

async function loadCanvasImageSource(blob) {
  if (typeof globalThis?.createImageBitmap === "function") {
    const bitmap = await globalThis.createImageBitmap(blob);
    const width = Number(bitmap?.width || 0);
    const height = Number(bitmap?.height || 0);
    if (width > 0 && height > 0) {
      return {
        handle: bitmap,
        width,
        height,
        dispose: () => bitmap?.close?.(),
      };
    }
    bitmap?.close?.();
  }

  const urlApi = globalThis?.URL;
  if (typeof urlApi?.createObjectURL !== "function") {
    throw new Error("当前环境不支持图片加载");
  }

  const objectUrl = urlApi.createObjectURL(blob);
  try {
    const image = await loadCanvasImageFromObjectUrl(objectUrl);
    const width = Number(image?.naturalWidth || image?.width || 0);
    const height = Number(image?.naturalHeight || image?.height || 0);
    if (!(width > 0 && height > 0)) {
      throw new Error("图片尺寸无效");
    }
    return {
      handle: image,
      width,
      height,
      dispose: () => urlApi.revokeObjectURL?.(objectUrl),
    };
  } catch (error) {
    urlApi.revokeObjectURL?.(objectUrl);
    throw error;
  }
}

function createCanvasTarget(width, height) {
  if (typeof globalThis?.OffscreenCanvas === "function") {
    const canvas = new globalThis.OffscreenCanvas(width, height);
    return {
      canvas,
      toBlob: async () => {
        if (typeof canvas.convertToBlob === "function") {
          return await canvas.convertToBlob({ type: "image/png" });
        }
        return null;
      },
    };
  }

  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return {
      canvas,
      toBlob: async () =>
        await new Promise((resolve) => {
          if (typeof canvas.toBlob !== "function") {
            resolve(null);
            return;
          }
          canvas.toBlob((blob) => resolve(blob), "image/png");
        }),
    };
  }

  throw new Error("当前环境不支持多图合成");
}

function resolveRunningHubContactSheetGrid(count) {
  const safeCount = Math.max(1, Math.trunc(Number(count) || 1));
  const cols = safeCount === 2 ? 2 : Math.ceil(Math.sqrt(safeCount));
  const rows = Math.ceil(safeCount / cols);
  return { cols, rows };
}

function resolveRunningHubContactSheetCellSize(cols, rows) {
  const maxSide = RUNNINGHUB_CONTACT_SHEET_MAX_SIDE_PX;
  const gap = RUNNINGHUB_CONTACT_SHEET_GAP_PX;
  const byCols = Math.floor((maxSide - gap * (cols + 1)) / cols);
  const byRows = Math.floor((maxSide - gap * (rows + 1)) / rows);
  return Math.max(RUNNINGHUB_CONTACT_SHEET_MIN_CELL_PX, Math.min(byCols, byRows));
}

async function composeRunningHubMultiImageBlob(urls) {
  const normalizedUrls = normalizeInputUrls(urls);
  const images = [];

  for (const url of normalizedUrls) {
    try {
      const blob = await fetchRemoteBlob(resolveInputFetchUrl(url), {
        provider: "remote",
        buildUrl: false,
        responseType: "blob",
      });
      const source = await loadCanvasImageSource(blob);
      images.push({ blob, source });
    } catch {}
  }

  if (images.length === 0) {
    throw new Error("参考图片处理失败，无法合成多图输入");
  }
  if (images.length === 1) {
    const blob = images[0].blob;
    images[0].source?.dispose?.();
    return blob;
  }

  try {
    const { cols, rows } = resolveRunningHubContactSheetGrid(images.length);
    const gap = RUNNINGHUB_CONTACT_SHEET_GAP_PX;
    const cellSize = resolveRunningHubContactSheetCellSize(cols, rows);
    const width = cols * cellSize + gap * (cols + 1);
    const height = rows * cellSize + gap * (rows + 1);
    const { canvas, toBlob } = createCanvasTarget(width, height);
    const context = canvas?.getContext?.("2d");
    if (!context || typeof context.drawImage !== "function") {
      throw new Error("当前环境不支持多图合成");
    }

    context.fillStyle = "#f5f7fb";
    context.fillRect?.(0, 0, width, height);

    const badgeSize = Math.max(30, Math.round(cellSize * 0.14));
    const badgeFontSize = Math.max(16, Math.round(badgeSize * 0.48));

    images.forEach((entry, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      const x = gap + col * (cellSize + gap);
      const y = gap + row * (cellSize + gap);

      context.fillStyle = "#ffffff";
      context.fillRect?.(x, y, cellSize, cellSize);

      const srcWidth = Math.max(1, Number(entry.source.width || 1));
      const srcHeight = Math.max(1, Number(entry.source.height || 1));
      const scale = Math.min(cellSize / srcWidth, cellSize / srcHeight);
      const drawWidth = Math.max(1, Math.round(srcWidth * scale));
      const drawHeight = Math.max(1, Math.round(srcHeight * scale));
      const drawX = x + Math.round((cellSize - drawWidth) / 2);
      const drawY = y + Math.round((cellSize - drawHeight) / 2);

      context.drawImage(entry.source.handle, drawX, drawY, drawWidth, drawHeight);
      context.strokeStyle = "#d8dee8";
      context.lineWidth = 2;
      context.strokeRect?.(x + 1, y + 1, cellSize - 2, cellSize - 2);

      context.fillStyle = "rgba(15, 23, 42, 0.82)";
      context.fillRect?.(x + 12, y + 12, badgeSize, badgeSize);
      context.fillStyle = "#f5f7fb";
      context.font = `600 ${badgeFontSize}px sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText?.(String(index + 1), x + 12 + badgeSize / 2, y + 12 + badgeSize / 2);
    });

    const resultBlob = await toBlob();
    if (!resultBlob) {
      throw new Error("多图合成失败");
    }
    return resultBlob;
  } finally {
    images.forEach((entry) => entry.source?.dispose?.());
  }
}

async function buildRunningHubTextImageUrl(inputImageUrls, apiKey) {
  const normalizedUrls = normalizeInputUrls(inputImageUrls);
  if (normalizedUrls.length === 0) {
    return "";
  }
  if (normalizedUrls.length === 1) {
    const processed = await processInputImages(normalizedUrls, apiKey, {
      applyInputQualityProfile: true,
      provider: "runninghub",
      preferFree: false,
    });
    return String(processed[0] || "").trim();
  }

  const mergedBlob = await composeRunningHubMultiImageBlob(normalizedUrls);
  return String(await uploadToRunningHub(mergedBlob, apiKey)).trim();
}

function mergeAdjacentTextParts(parts, { createTextPart, isTextPart }) {
  const merged = [];
  let bufferedText = "";

  const flush = () => {
    if (!bufferedText) {
      return;
    }
    merged.push(createTextPart(bufferedText));
    bufferedText = "";
  };

  for (const part of parts) {
    if (!part) {
      continue;
    }
    if (isTextPart(part)) {
      bufferedText += String(part.text || "");
      continue;
    }
    flush();
    merged.push(part);
  }

  flush();
  return merged;
}

function buildPromptMediaParts(prompt, mediaParts, { createTextPart, isTextPart }) {
  const sourcePrompt = String(prompt || "");
  const normalizedMediaParts = Array.isArray(mediaParts) ? mediaParts.filter(Boolean) : [];

  if (normalizedMediaParts.length === 0) {
    return sourcePrompt ? [createTextPart(sourcePrompt)] : [];
  }

  const parts = [];
  let cursor = 0;
  let mediaIndex = 0;
  let match;

  IMAGE_MENTION_RE.lastIndex = 0;
  while ((match = IMAGE_MENTION_RE.exec(sourcePrompt))) {
    const prefix = sourcePrompt.slice(cursor, match.index);
    if (prefix) {
      parts.push(createTextPart(prefix));
    }
    const mediaPart = normalizedMediaParts[mediaIndex++];
    if (mediaPart) {
      parts.push(mediaPart);
    } else {
      parts.push(createTextPart(match[0]));
    }
    cursor = match.index + match[0].length;
  }

  const suffix = sourcePrompt.slice(cursor);
  if (suffix) {
    parts.push(createTextPart(suffix));
  }

  while (mediaIndex < normalizedMediaParts.length) {
    parts.push(normalizedMediaParts[mediaIndex++]);
  }

  if (parts.length === 0) {
    return normalizedMediaParts.slice();
  }

  return mergeAdjacentTextParts(parts, { createTextPart, isTextPart });
}

async function fetchInlineImagePart(url) {
  const dataUrlMatch = String(url || "")
    .trim()
    .match(/^data:(image\/[^;,]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    return {
      inline_data: {
        mime_type: dataUrlMatch[1],
        data: dataUrlMatch[2],
      },
    };
  }

  const blob = await fetchRemoteBlob(url, {
    provider: "remote",
    buildUrl: false,
    responseType: "blob",
  });
  const mimeType = String(blob?.type || "").trim() || guessImageMimeType(url);
  if (!mimeType.startsWith("image/")) {
    return null;
  }

  const buffer = await blob.arrayBuffer();
  return {
    inline_data: {
      mime_type: mimeType,
      data: arrayBufferToBase64(buffer),
    },
  };
}

async function buildGeminiUserParts(prompt, inputUrls) {
  const mediaParts = [];
  for (const inputUrl of inputUrls) {
    try {
      const inlinePart = await fetchInlineImagePart(inputUrl);
      if (inlinePart) {
        mediaParts.push(inlinePart);
      }
    } catch {}
  }

  if (hasImageMentions(prompt) && inputUrls.length > 0 && mediaParts.length === 0) {
    throw new Error("参考图片处理失败，无法映射 @图片 引用");
  }

  return buildPromptMediaParts(prompt, mediaParts, {
    createTextPart: (text) => ({ text }),
    isTextPart: (part) => !!part && typeof part.text === "string",
  });
}

async function buildChatCompletionUserContent(prompt, inputUrls, apiKey, provider) {
  const processedUrls = await processInputImages(inputUrls, apiKey, {
    applyInputQualityProfile: true,
    provider,
    preferFree: true,
  });
  const imageParts = processedUrls.map((url) => ({
    type: "image_url",
    image_url: { url },
  }));

  if (hasImageMentions(prompt) && inputUrls.length > 0 && imageParts.length === 0) {
    throw new Error("参考图片处理失败，无法映射 @图片 引用");
  }

  const content = buildPromptMediaParts(prompt, imageParts, {
    createTextPart: (text) => ({ type: "text", text }),
    isTextPart: (part) => !!part && part.type === "text",
  });
  if (content.length === 1 && content[0]?.type === "text") {
    return content[0].text;
  }
  return content.length > 0 ? content : String(prompt || "");
}

function resolveProxyApiUrl(provider, baseApiUrl, model, isGeminiModel) {
  if (provider === "ppio") {
    return PpioAdapter.getTextProxyApiUrl(baseApiUrl);
  }
  if (provider === "apimart") {
    return ApimartAdapter.getTextProxyApiUrl(baseApiUrl, model, isGeminiModel);
  }
  if (provider === "openai") {
    if (baseApiUrl.endsWith("/v1")) {
      return baseApiUrl;
    }
    return `${baseApiUrl}/v1`;
  }

  if (
    baseApiUrl.includes("/api/") ||
    baseApiUrl.endsWith("/chat/completions") ||
    (baseApiUrl.includes("/api/") && baseApiUrl.split("/api/").length > 1)
  ) {
    return baseApiUrl;
  }
  if (baseApiUrl.endsWith("/v1")) {
    return baseApiUrl;
  }
  return `${baseApiUrl}/v1/chat/completions`;
}

function resolveDirectApiUrl(baseApiUrl) {
  if (
    baseApiUrl.includes(":generateContent") ||
    baseApiUrl.includes("/v1beta/models") ||
    baseApiUrl.endsWith("/chat/completions") ||
    (baseApiUrl.includes("/api/") && baseApiUrl.split("/api/").length > 1)
  ) {
    return baseApiUrl;
  }
  if (baseApiUrl.endsWith("/api")) {
    return `${baseApiUrl}/v1/chat/completions`;
  }
  if (baseApiUrl.endsWith("/v1")) {
    return `${baseApiUrl}/chat/completions`;
  }
  return `${baseApiUrl}/v1/chat/completions`;
}

export async function buildGenerateTextRequest(payload) {
  await ensureConfig();

  const prompt = applyCameraAngleToPrompt(payload?.prompt, payload?.cameraAngle);
  const promptLength = prompt.length;
  if (promptLength > 50000) {
    throw new Error(
      `提示词过长（${promptLength} 字符）。为避免接口/代理返回异常，请分段生成：先让模型输出大纲，再按章节逐段生成。`
    );
  }

  let model = payload?.model || "gpt-4o-mini";
  model = ApimartAdapter.normalizeTextModel(model);

  const provider = payload?.provider === "custom" ? "openai" : payload?.provider || "grsai";
  const providerConfig = getProviderConfig(provider);
  const baseApiUrl = providerConfig.apiUrl.replace(/\/v1\/?$/, "");
  const apiKey = isRunningHubTextModel(provider, model)
    ? providerConfig.modelApiKey || payload?.apiKey || providerConfig.apiKey
    : payload?.apiKey || providerConfig.apiKey;

  if (!apiKey) {
    throw ApiError.authError(provider, null, `API Key 未配置（厂商：${provider}）`);
  }

  const isGeminiModel = ApimartAdapter.isGeminiTextModel(provider, model);
  const inputUrls = normalizeInputUrls(payload?.inputUrls);
  const inputImageUrls = normalizeInputUrls(payload?.inputImageUrls);

  if (isRunningHubTextModel(provider, model)) {
    if (inputImageUrls.length === 0) {
      throw new Error("该模型需要图片参考");
    }

    const imageUrl = await buildRunningHubTextImageUrl(inputImageUrls, apiKey);
    if (!imageUrl) {
      throw new Error("参考图片处理失败，无法上传到 RunningHUB");
    }

    return {
      url: "/api/v2/proxy/image",
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        apiUrl: `https://www.runninghub.cn/openapi/v2/${String(model).replace(/^runninghub-model\//, "")}`,
        apiKey,
        prompt,
        imageUrl,
      },
      isProxy: true,
    };
  }

  let body;
  if (isGeminiModel) {
    const parts = await buildGeminiUserParts(prompt, inputUrls);
    body = GeminiAdapter.buildGenerateContentBody(parts.length > 0 ? parts : prompt, payload?.systemPrompt);
  } else {
    const userContent = await buildChatCompletionUserContent(prompt, inputUrls, apiKey, provider);
    body = {
      model,
      stream: false,
      messages: [
        {
          role: "system",
          content: payload?.systemPrompt || DEFAULT_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: userContent,
        },
      ],
    };
  }

  if (provider === "ppio" || provider === "runninghub" || provider === "apimart" || provider === "openai") {
    return {
      url: "/api/v2/proxy/completions",
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        apiUrl: resolveProxyApiUrl(provider, baseApiUrl, model, isGeminiModel),
        apiKey,
        ...body,
      },
      isProxy: true,
    };
  }

  return {
    url: resolveDirectApiUrl(baseApiUrl),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body,
    isProxy: false,
  };
}

function parseTextResponse(text, status) {
  const length = text.length;
  const head = text.slice(0, 400);
  const tail = text.slice(Math.max(0, length - 400));
  const looksLikeHtml = /<!doctype\s+html|<html[\s>]/i.test(head);
  const normalized = text.replace(/^\uFEFF/, "").trim();

  let payload;
  try {
    payload = JSON.parse(normalized);
  } catch (firstError) {
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        payload = JSON.parse(normalized.slice(start, end + 1));
      } catch {}
    }

    if (!payload) {
      const sseLines = normalized
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("data:"));
      if (sseLines.length > 0) {
        const lastPayload = sseLines[sseLines.length - 1].replace(/^data:\s*/, "").trim();
        if (lastPayload === "[DONE]") {
          const meaningfulLines = sseLines
            .map((line) => line.replace(/^data:\s*/, "").trim())
            .filter((line) => line && line !== "[DONE]");
          if (meaningfulLines.length > 0) {
            payload = JSON.parse(meaningfulLines[meaningfulLines.length - 1]);
          } else {
            throw new ApiError({
              type: "PARSE_ERROR",
              message: "服务端返回了空响应",
              status,
              retryable: false,
            });
          }
        } else {
          try {
            payload = JSON.parse(lastPayload);
          } catch (error) {
            throw new ApiError({
              type: "PARSE_ERROR",
              message: `无法解析服务端响应: ${error.message}`,
              status,
              retryable: false,
            });
          }
        }
      } else {
        throw new ApiError({
          type: "PARSE_ERROR",
          message:
            `服务端返回的不是可解析的 JSON。HTTP ${status}，长度 ${length}。\n` +
            (looksLikeHtml
              ? "响应看起来像 HTML（常见原因：网关/防火墙拦截、API 地址错误、上游返回了错误页）。\n"
              : "") +
            `响应片段(截断)：\n[开头]\n${head}\n[结尾]\n${tail}`,
          status,
          retryable: false,
        });
      }
    }
  }

  return payload;
}

function extractTextContent(payload) {
  const choiceList = payload?.choices || payload?.data?.choices;
  let text = choiceList?.[0]?.message?.content;

  if (!text && payload?.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
    text = payload.data.candidates[0].content.parts[0].text;
  }
  if (!text && payload?.candidates?.[0]?.content?.parts?.[0]?.text) {
    text = payload.candidates[0].content.parts[0].text;
  }

  if (!text) {
    const results = Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload?.data?.results)
        ? payload.data.results
        : [];
    text =
      pickFirstNonEmptyString(results.map((entry) => entry?.text)) ||
      pickFirstNonEmptyString([
        payload?.text,
        payload?.output,
        typeof payload?.content === "string" ? payload.content : "",
        payload?.markdown,
        payload?.caption,
        payload?.data?.text,
        payload?.data?.output,
        typeof payload?.data?.content === "string" ? payload.data.content : "",
      ]);
  }

  return text;
}

async function pollRunningHubTextTask(taskId, apiKey, provider, options = {}) {
  const startedAt = Date.now();
  const signal = options?.signal;
  const doFetch = signal ? fetchWithTimeoutWithSignal : fetchWithTimeout;

  while (Date.now() - startedAt < GENERATION_TIMEOUT) {
    await sleepWithSignal(RUNNINGHUB_POLL_INTERVAL_MS, signal);

    const response = await doFetch(
      buildApiUrl("/api/v2/proxy/image"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apiUrl: "https://www.runninghub.cn/openapi/v2/query",
          apiKey,
          taskId,
        }),
      },
      30000,
      signal
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let errorBody;
      try {
        errorBody = JSON.parse(text);
      } catch {
        errorBody = { error: text };
      }
      throw parseError(provider, errorBody, response.status);
    }

    const payload = parseRunningHubResponseData(await response.text());
    const code = Number(payload?.code);
    if (Number.isFinite(code)) {
      if (code === 804 || code === 813) {
        continue;
      }
      if (code !== 0) {
        throw new Error(getRunningHubTextErrorMessage(payload, "文本任务轮询失败"));
      }
    }

    const taskPayload = payload?.data && typeof payload.data === "object" ? payload.data : payload;
    const status = String(taskPayload?.status || "").toUpperCase();
    if (["SUCCESS", "SUCCEEDED", "COMPLETED"].includes(status)) {
      return taskPayload;
    }
    if (["FAILED", "FAIL", "ERROR", "CANCELED", "CANCELLED"].includes(status)) {
      throw new Error(getRunningHubTextErrorMessage(taskPayload, "文本任务执行失败"));
    }
  }

  throw new Error("文本任务超时，请稍后重试");
}

export async function generateText(payload, options = {}) {
  const request = await buildGenerateTextRequest(payload);
  const provider = payload?.provider === "custom" ? "openai" : payload?.provider || "grsai";
  const signal = options?.signal;
  const doFetch = signal ? fetchWithTimeoutWithSignal : fetchWithTimeout;

  let response;
  try {
    const url = request.isProxy ? buildApiUrl(request.url) : request.url;
    response = await doFetch(
      url,
      {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(request.body),
      },
      GENERATION_TIMEOUT,
      signal
    );
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) {
      throw createAbortError();
    }
    throw parseNetworkError(provider, error, GENERATION_TIMEOUT);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let errorBody;
    try {
      errorBody = JSON.parse(text);
    } catch {
      errorBody = { error: text };
    }
    throw parseError(provider, errorBody, response.status);
  }

  const text = await response.text();
  if (isRunningHubTextModel(provider, payload?.model)) {
    const createPayload = parseRunningHubResponseData(text);
    const createCode = Number(createPayload?.code);
    if (Number.isFinite(createCode) && createCode !== 0) {
      throw new Error(getRunningHubTextErrorMessage(createPayload, "文本任务创建失败"));
    }

    let taskPayload = createPayload;
    const status = String(createPayload?.status || createPayload?.data?.status || "").toUpperCase();
    const taskId = getRunningHubTaskId(createPayload);
    if (taskId) {
      options?.onTaskMeta?.({
        taskId,
        apiKey: request.body.apiKey,
        useOpenapiQuery: true,
        provider,
      });
      options?.onTaskId?.(taskId);
    }

    if (
      ["SUBMITTED", "QUEUED", "RUNNING", "PENDING"].includes(status) ||
      (taskId && !["SUCCESS", "SUCCEEDED", "COMPLETED"].includes(status))
    ) {
      if (!taskId) {
        throw new Error("RunningHUB 文本任务创建成功但未返回 taskId");
      }
      taskPayload = await pollRunningHubTextTask(taskId, request.body.apiKey, provider, options);
    } else if (["FAILED", "FAIL", "ERROR", "CANCELED", "CANCELLED"].includes(status)) {
      throw new Error(getRunningHubTextErrorMessage(createPayload, "文本任务创建失败"));
    }

    const outputText = extractTextContent(taskPayload);
    if (!outputText) {
      throw new ApiError({
        type: "PARSE_ERROR",
        provider,
        message: "RunningHUB 未返回文本内容",
        raw: taskPayload,
        retryable: false,
      });
    }

    return {
      text: sanitizeGeneratedText(outputText),
    };
  }

  const parsed = parseTextResponse(text, response.status);
  const outputText = extractTextContent(parsed);
  if (!outputText) {
    throw new ApiError({
      type: "PARSE_ERROR",
      provider,
      message: "服务端未返回文本内容",
      raw: parsed,
      retryable: false,
    });
  }

  return {
    text: sanitizeGeneratedText(outputText),
  };
}
