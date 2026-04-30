import { get, post } from "../api/apiBase.js";

export const SUPPORTED_VALIDATION_NODE_TYPES = Object.freeze(["text", "image"]);

const TEXT_TEST_TIMEOUT_MS = 45_000;
const IMAGE_SUBMIT_TIMEOUT_MS = 60_000;
const IMAGE_QUERY_TIMEOUT_MS = 30_000;
const IMAGE_POLL_INTERVAL_MS = 3_000;
const IMAGE_MAX_POLL_ROUNDS = 100;

const TEXT_TEST_PROMPT = "Reply with OK only.";
const IMAGE_TEST_PROMPT = "single gray sphere, plain gray background";

function trimText(value) {
  return String(value ?? "").trim();
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uniqueStrings(values) {
  const seen = new Set();
  return values
    .map((value) => trimText(value))
    .filter((value) => {
      if (!value || seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
}

function pickFirstNonEmptyString(values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
}

function looksLikeTaskToken(value) {
  const text = trimText(value);
  if (!text) {
    return false;
  }

  if (/^(https?:|data:image\/)/i.test(text)) {
    return false;
  }

  const normalized = text.toLowerCase();
  if (
    [
      "success",
      "succeeded",
      "submitted",
      "pending",
      "queued",
      "running",
      "processing",
      "complete",
      "completed",
      "done",
      "ok",
      "true",
      "false",
    ].includes(normalized)
  ) {
    return false;
  }

  return /^[a-zA-Z0-9._:-]+$/.test(text) && text.length >= 6;
}

function truncateText(value, limit = 180) {
  const text = trimText(value);
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}...`;
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

function hashString(value) {
  let hash = 5381;
  const source = String(value || "");
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 33) ^ source.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}

export function hasCompleteModelConfig(model) {
  return Boolean(
    trimText(model?.modelId) && trimText(model?.apiKey) && trimText(model?.baseUrl)
  );
}

export function buildValidationConfigSignature(model) {
  return hashString(
    [
      trimText(model?.nodeType).toLowerCase(),
      trimText(model?.modelId),
      trimText(model?.apiKey),
      trimText(model?.baseUrl),
    ].join("|")
  );
}

export function extractTextResponseContent(payload) {
  if (!payload) {
    return "";
  }

  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  const choiceMessageContent = choices[0]?.message?.content;
  if (typeof choiceMessageContent === "string" && choiceMessageContent.trim()) {
    return choiceMessageContent.trim();
  }

  if (Array.isArray(choiceMessageContent)) {
    const textFromParts = choiceMessageContent
      .map((part) => trimText(part?.text || part?.content))
      .find(Boolean);
    if (textFromParts) {
      return textFromParts;
    }
  }

  const resultText = (Array.isArray(payload?.results) ? payload.results : [])
    .map((item) => trimText(item?.text || item?.content || item?.output))
    .find(Boolean);
  if (resultText) {
    return resultText;
  }

  const geminiText = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => trimText(part?.text))
    .find(Boolean);
  if (geminiText) {
    return geminiText;
  }

  return pickFirstNonEmptyString([
    payload?.text,
    payload?.output,
    typeof payload?.content === "string" ? payload.content : "",
    typeof payload?.data?.content === "string" ? payload.data.content : "",
    payload?.data?.text,
    payload?.data?.output,
  ]);
}

function collectImageUrls(value, bucket) {
  if (!value) {
    return;
  }

  if (typeof value === "string") {
    const text = value.trim();
    if (/^(https?:|data:image\/)/i.test(text)) {
      bucket.push(text);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectImageUrls(item, bucket));
    return;
  }

  if (!isPlainObject(value)) {
    return;
  }

  [
    "url",
    "imageUrl",
    "image_url",
    "fileUrl",
    "file_url",
    "sourceUrl",
    "thumbUrl",
    "localUrl",
    "displayUrl",
    "image",
    "output",
  ].forEach((field) => collectImageUrls(value[field], bucket));

  ["results", "images", "outputs", "data", "image_urls"].forEach((field) => {
    collectImageUrls(value[field], bucket);
  });
}

export function extractImageUrls(payload) {
  const bucket = [];
  collectImageUrls(payload, bucket);
  return uniqueStrings(bucket);
}

export function extractTaskId(payload) {
  if (!payload) {
    return "";
  }

  const directTaskId = pickFirstNonEmptyString([
    payload?.task_id,
    payload?.taskId,
    payload?.taskid,
    payload?.request_id,
    payload?.requestId,
    payload?.id,
    payload?.job_id,
    payload?.jobId,
    payload?.submit_id,
    payload?.submitId,
    payload?.task,
    payload?.job,
    payload?.request,
    payload?.submit,
    payload?.data?.task_id,
    payload?.data?.taskId,
    payload?.data?.taskid,
    payload?.data?.request_id,
    payload?.data?.requestId,
    payload?.data?.id,
    payload?.data?.job_id,
    payload?.data?.jobId,
    payload?.data?.submit_id,
    payload?.data?.submitId,
    payload?.data?.task?.task_id,
    payload?.data?.task?.taskId,
    payload?.data?.task?.id,
    payload?.data?.request?.request_id,
    payload?.data?.request?.requestId,
    payload?.data?.request?.id,
    payload?.data?.job?.job_id,
    payload?.data?.job?.jobId,
    payload?.data?.job?.id,
    payload?.data?.submit?.submit_id,
    payload?.data?.submit?.submitId,
    payload?.data?.submit?.id,
    payload?.response?.task_id,
    payload?.response?.taskId,
    payload?.response?.request_id,
    payload?.response?.requestId,
    payload?.response?.submit_id,
    payload?.response?.submitId,
    payload?.response?.job_id,
    payload?.response?.jobId,
    payload?.response?.id,
  ]);

  if (directTaskId) {
    return directTaskId;
  }

  if (looksLikeTaskToken(payload?.data)) {
    return trimText(payload.data);
  }

  return "";
}

export function extractTaskStatus(payload) {
  return trimText(
    pickFirstNonEmptyString([
      payload?.status,
      payload?.task_status,
      payload?.taskStatus,
      payload?.state,
      payload?.phase,
      payload?.data?.status,
      payload?.data?.task_status,
      payload?.data?.taskStatus,
      payload?.response?.status,
      payload?.response?.task_status,
    ])
  ).toLowerCase();
}

function isFailureStatus(status) {
  return [
    "failed",
    "fail",
    "error",
    "cancelled",
    "canceled",
    "forbidden",
    "task_failed",
    "content_filtered",
  ].includes(trimText(status).toLowerCase());
}

function isPendingStatus(status) {
  return [
    "submitted",
    "pending",
    "queued",
    "queueing",
    "running",
    "processing",
    "querying",
    "waiting",
    "in_progress",
  ].includes(trimText(status).toLowerCase());
}

export function extractErrorMessage(payload, fallback = "模型验证失败") {
  const message = pickFirstNonEmptyString([
    payload?.error,
    payload?.errorMessage,
    payload?.failure_reason,
    payload?.failReason,
    payload?.failedReason,
    payload?.msg,
    payload?.message,
    payload?.data?.error,
    payload?.data?.errorMessage,
    payload?.data?.failure_reason,
    payload?.data?.msg,
    payload?.data?.message,
    payload?.response?.error,
    payload?.response?.message,
  ]);

  if (message) {
    return truncateText(message);
  }

  try {
    return truncateText(JSON.stringify(payload));
  } catch {
    return fallback;
  }
}

export function buildImageQueryCandidates(baseUrl, taskId) {
  const normalizedBaseUrl = trimText(baseUrl);
  const normalizedTaskId = trimText(taskId);
  if (!normalizedBaseUrl || !normalizedTaskId) {
    return [];
  }

  const candidates = [];

  try {
    const parsedUrl = new URL(normalizedBaseUrl);
    const origin = `${parsedUrl.protocol}//${parsedUrl.host}`;
    const pathname = parsedUrl.pathname.replace(/\/+$/, "");

    if (/\/v1\/draw(?:\/[^/?#]+)*$/i.test(pathname)) {
      candidates.push(`${origin}/v1/draw/result?task_id=${encodeURIComponent(normalizedTaskId)}`);
      candidates.push(`${origin}/v1/draw/query?task_id=${encodeURIComponent(normalizedTaskId)}`);
      candidates.push(
        `${origin}/v1/draw/nano-banana/query?task_id=${encodeURIComponent(normalizedTaskId)}`
      );
    }

    if (/\/v1\/tasks(?:\/[^/?#]+)?$/i.test(pathname) || /api\.apimart\.ai/i.test(origin)) {
      candidates.push(`${origin}/v1/tasks/${encodeURIComponent(normalizedTaskId)}`);
    }
  } catch {
    const trimmed = normalizedBaseUrl.replace(/[?#].*$/, "").replace(/\/+$/, "");
    const drawMatch = trimmed.match(/^(https?:\/\/[^/]+)\/v1\/draw(?:\/[^/?#]+)*$/i);
    if (drawMatch) {
      candidates.push(`${drawMatch[1]}/v1/draw/result?task_id=${encodeURIComponent(normalizedTaskId)}`);
      candidates.push(`${drawMatch[1]}/v1/draw/query?task_id=${encodeURIComponent(normalizedTaskId)}`);
      candidates.push(
        `${drawMatch[1]}/v1/draw/nano-banana/query?task_id=${encodeURIComponent(normalizedTaskId)}`
      );
    }
    const taskMatch = trimmed.match(/^(https?:\/\/[^/]+)\/v1\/tasks(?:\/[^/?#]+)?$/i);
    if (taskMatch) {
      candidates.push(`${taskMatch[1]}/v1/tasks/${encodeURIComponent(normalizedTaskId)}`);
    }
  }

  return uniqueStrings(candidates);
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

function createValidationSuccess(nodeType, model, meta) {
  return {
    status: "available",
    lastError: "",
    lastTestResult: {
      ok: true,
      nodeType,
      validatedConfigSignature: buildValidationConfigSignature(model),
      ...meta,
    },
  };
}

function createValidationFailure(nodeType, model, message) {
  return {
    status: "failed",
    lastError: truncateText(message, 240) || "模型验证失败",
    lastTestResult: {
      ok: false,
      nodeType,
      validatedConfigSignature: buildValidationConfigSignature(model),
      message: truncateText(message, 240) || "模型验证失败",
    },
  };
}

async function validateTextModel(model) {
  const response = await post(
    "/api/v2/proxy/completions",
    {
      apiUrl: trimText(model.baseUrl),
      apiKey: trimText(model.apiKey),
      model: trimText(model.modelId),
      stream: false,
      max_tokens: 8,
      messages: [
        {
          role: "system",
          content: "You are a validation assistant.",
        },
        {
          role: "user",
          content: TEXT_TEST_PROMPT,
        },
      ],
    },
    TEXT_TEST_TIMEOUT_MS
  );

  if (!response.success) {
    throw new Error(response.error || "文本模型测试失败");
  }

  const content = extractTextResponseContent(response.data);
  if (!content) {
    throw new Error(extractErrorMessage(response.data, "文本模型未返回可解析内容"));
  }

  return createValidationSuccess("text", model, {
    summary: `最小请求成功：${truncateText(content, 60)}`,
    responseStatus: response.status,
    previewText: truncateText(content, 120),
  });
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

async function waitForImageTask(model, taskId) {
  const apiKey = trimText(model.apiKey);
  const queryCandidates = buildImageQueryCandidates(model.baseUrl, taskId);
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
        return createValidationSuccess("image", model, {
          summary: `真实图片测试成功，返回 ${urls.length} 张图片`,
          taskId,
          queryUrl,
          imageCount: urls.length,
          outputUrl: urls[0],
        });
      }

      const status = extractTaskStatus(snapshot);
      if (isFailureStatus(status)) {
        throw new Error(extractErrorMessage(snapshot, "图片模型测试失败"));
      }

      if (status && !isPendingStatus(status)) {
        lastPendingMessage = extractErrorMessage(
          snapshot,
          `任务状态异常：${status || "unknown"}`
        );
      }
    }

    if (round < IMAGE_MAX_POLL_ROUNDS - 1) {
      await sleep(IMAGE_POLL_INTERVAL_MS);
    }
  }

  throw new Error(lastPendingMessage || "图片模型测试超时，请稍后重试");
}

async function validateImageModel(model) {
  const response = await post(
    "/api/v2/proxy/image",
    {
      apiUrl: trimText(model.baseUrl),
      apiKey: trimText(model.apiKey),
      model: trimText(model.modelId),
      prompt: IMAGE_TEST_PROMPT,
      urls: [],
      batchSize: 1,
      shutProgress: true,
      aspectRatio: "1:1",
      imageSize: "1K",
    },
    IMAGE_SUBMIT_TIMEOUT_MS
  );

  if (!response.success) {
    throw new Error(response.error || "图片模型测试失败");
  }

  const directUrls = extractImageUrls(response.data);
  if (directUrls.length > 0) {
    return createValidationSuccess("image", model, {
      summary: `真实图片测试成功，返回 ${directUrls.length} 张图片`,
      imageCount: directUrls.length,
      outputUrl: directUrls[0],
      responseStatus: response.status,
    });
  }

  const taskId = extractTaskId(response.data);
  if (!taskId) {
    throw new Error(
      extractErrorMessage(response.data, "图片模型未返回任务ID或图片地址")
    );
  }

  return waitForImageTask(model, taskId);
}

export async function validateModel(model) {
  const nodeType = trimText(model?.nodeType).toLowerCase();
  const lastTestedAt = new Date().toISOString();

  if (!SUPPORTED_VALIDATION_NODE_TYPES.includes(nodeType)) {
    return {
      lastTestedAt,
      ...createValidationFailure(
        nodeType || "unknown",
        model,
        "当前阶段仅支持文本/图片模型测试"
      ),
    };
  }

  if (!hasCompleteModelConfig(model)) {
    return {
      lastTestedAt,
      status: "unconfigured",
      lastError: "缺少 modelId、apiKey 或 baseUrl，无法测试",
      lastTestResult: {
        ok: false,
        nodeType,
        message: "缺少 modelId、apiKey 或 baseUrl，无法测试",
      },
    };
  }

  try {
    const result =
      nodeType === "text" ? await validateTextModel(model) : await validateImageModel(model);
    return {
      lastTestedAt,
      ...result,
    };
  } catch (error) {
    return {
      lastTestedAt,
      ...createValidationFailure(nodeType, model, error?.message),
    };
  }
}
