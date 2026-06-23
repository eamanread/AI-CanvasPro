import { buildApiUrl } from "./apiUrl.js";
import { ApiError } from "./errors/ApiError.js";
import { parseError, parseNetworkError } from "./errors/ErrorParser.js";

const DEFAULT_TIMEOUT = 30000;
const INSTALL_ID_KEY = "aic-install-id";
const SUBSCRIPTION_REQUIRED_CODE = "SUBSCRIPTION_REQUIRED";
const GENERATION_ROUTE_PATHS = new Set([
  "/api/v2/proxy/completions",
  "/api/v2/proxy/image",
  "/api/v2/runninghubwf/run",
  "/api/v2/dreamina/text2image",
  "/api/v2/dreamina/image2image",
  "/api/v2/dreamina/text2video",
  "/api/v2/dreamina/image2video",
  "/api/v2/dreamina/frames2video",
  "/api/v2/dreamina/multiframe2video",
  "/api/v2/dreamina/multimodal2video",
]);

function isAbsoluteUrl(url) {
  return /^https?:\/\//i.test(url);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchWithTimeout(url, options = {}, timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    clearTimeout(timeoutId);
  });
}

function fetchWithTimeoutWithSignal(url, options = {}, timeout = DEFAULT_TIMEOUT, signal) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  let abortListener = null;
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      abortListener = () => controller.abort();
      signal.addEventListener("abort", abortListener, { once: true });
    }
  }
  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    clearTimeout(timeoutId);
    if (signal && abortListener) {
      signal.removeEventListener("abort", abortListener);
    }
  });
}

function shouldRetryError(error, retryCount, maxRetries, signal) {
  if (signal?.aborted) {
    return false;
  }
  return Boolean(error?.retryable) && retryCount < maxRetries;
}

async function parseResponseBody(response, responseType) {
  if (responseType === "blob") {
    return await response.blob();
  }
  if (responseType === "text") {
    return await response.text();
  }
  if (responseType === "auto") {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return await response.json();
    }
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return await response.json();
}

async function parseErrorBody(response) {
  try {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { error: text || `HTTP ${response.status}` };
    }
  } catch {
    return { error: `HTTP ${response.status}` };
  }
}

function resolveUrl(url) {
  try {
    const base =
      typeof location !== "undefined" && location?.origin
        ? location.origin
        : "http://127.0.0.1:8777";
    return new URL(String(url || ""), base);
  } catch {
    return null;
  }
}

function isLocalApiRequest(url) {
  const parsed = resolveUrl(url);
  if (!parsed || !parsed.pathname.startsWith("/api/")) {
    return false;
  }
  if (!isAbsoluteUrl(String(url || ""))) {
    return true;
  }
  return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
}

function isGenerationRoute(url) {
  const parsed = resolveUrl(url);
  if (!parsed) {
    return false;
  }
  return GENERATION_ROUTE_PATHS.has(parsed.pathname);
}

function inferProvider(url, fallback = "unknown") {
  const parsed = resolveUrl(url);
  const pathname = parsed?.pathname || "";
  if (pathname.startsWith("/api/v2/dreamina/")) {
    return "dreamina";
  }
  if (pathname === "/api/v2/runninghubwf/run") {
    return "runninghubwf";
  }
  return fallback || "unknown";
}

function inferNodeType(url, fallback = "") {
  const parsed = resolveUrl(url);
  const pathname = parsed?.pathname || "";
  if (pathname === "/api/v2/proxy/completions") {
    return "text";
  }
  if (pathname === "/api/v2/proxy/image") {
    return "image";
  }
  if (pathname === "/api/v2/runninghubwf/run") {
    return "video";
  }
  if (
    pathname === "/api/v2/dreamina/text2video" ||
    pathname === "/api/v2/dreamina/image2video" ||
    pathname === "/api/v2/dreamina/frames2video" ||
    pathname === "/api/v2/dreamina/multiframe2video" ||
    pathname === "/api/v2/dreamina/multimodal2video"
  ) {
    return "video";
  }
  if (
    pathname === "/api/v2/dreamina/text2image" ||
    pathname === "/api/v2/dreamina/image2image"
  ) {
    return "image";
  }
  return fallback || "";
}

function getWindowRef() {
  if (typeof window !== "undefined") {
    return window;
  }
  return globalThis;
}

function readInstallId() {
  const runtime = getWindowRef();
  const fromWindow = String(runtime?.__aicInstallId || "").trim();
  if (fromWindow) {
    return fromWindow;
  }
  try {
    const fromStorage = String(globalThis.localStorage?.getItem(INSTALL_ID_KEY) || "").trim();
    if (fromStorage) {
      runtime.__aicInstallId = fromStorage;
      return fromStorage;
    }
  } catch {
    return "";
  }
  return "";
}

function generateInstallId() {
  const seed = `${Date.now()}-${Math.random()}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash * 31) + seed.charCodeAt(index)) >>> 0;
  }
  return `aic-${Date.now().toString(36)}-${hash.toString(36)}`;
}

function ensureLocalInstallId() {
  const existing = readInstallId();
  if (existing) {
    return existing;
  }
  const generated = generateInstallId();
  const runtime = getWindowRef();
  runtime.__aicInstallId = generated;
  try {
    globalThis.localStorage?.setItem(INSTALL_ID_KEY, generated);
  } catch {
    // Ignore local persistence failures in non-browser environments.
  }
  return generated;
}

function hasHeader(headers, headerName) {
  const target = String(headerName || "").toLowerCase();
  return Object.keys(headers || {}).some((key) => String(key || "").toLowerCase() === target);
}

function getHeaderValue(headers, headerName) {
  const target = String(headerName || "").toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key || "").toLowerCase() === target) {
      return String(value || "");
    }
  }
  return "";
}

function withLocalInstallIdHeader(url, headers = {}) {
  const nextHeaders = { ...(headers || {}) };
  if (!isLocalApiRequest(url) || hasHeader(nextHeaders, "X-AIC-Install-Id")) {
    return nextHeaders;
  }
  const installId = ensureLocalInstallId();
  if (installId) {
    nextHeaders["X-AIC-Install-Id"] = installId;
  }
  return nextHeaders;
}

function withLocalInstallIdBody(url, headers = {}, body) {
  if (!isLocalApiRequest(url) || !isGenerationRoute(url) || typeof body !== "string") {
    return body;
  }

  const contentType = getHeaderValue(headers, "Content-Type").toLowerCase();
  if (!contentType.includes("application/json")) {
    return body;
  }

  const installId =
    String(getHeaderValue(headers, "X-AIC-Install-Id") || "").trim() || ensureLocalInstallId();
  if (!installId) {
    return body;
  }

  try {
    const payload = JSON.parse(body);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return body;
    }
    if (String(payload.installId || "").trim()) {
      return body;
    }
    return JSON.stringify({
      ...payload,
      installId,
    });
  } catch {
    return body;
  }
}

function getSubscriptionCode(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  return String(payload.code || payload.errorCode || "").trim().toUpperCase();
}

function parseJsonText(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeSubscriptionPayloadCandidate(payload) {
  if (!payload) {
    return payload;
  }
  if (typeof payload === "string") {
    const parsed = parseJsonText(payload);
    if (parsed) {
      return parsed;
    }

    const ssePayloads = payload
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.replace(/^data:\s*/, "").trim())
      .filter((line) => line && line !== "[DONE]");
    for (let index = ssePayloads.length - 1; index >= 0; index -= 1) {
      const sseParsed = parseJsonText(ssePayloads[index]);
      if (sseParsed) {
        return sseParsed;
      }
    }
  }
  return payload;
}

function isSubscriptionRequiredPayload(payload) {
  return getSubscriptionCode(normalizeSubscriptionPayloadCandidate(payload)) === SUBSCRIPTION_REQUIRED_CODE;
}

function triggerSubscriptionRequired(url, provider, error) {
  if (!isGenerationRoute(url)) {
    return;
  }
  const runtime = getWindowRef();
  const handler = runtime?.handleSubscriptionRequired;
  if (typeof handler !== "function") {
    return;
  }
  try {
    const serverProvider = String(error?.provider || "").trim();
    const serverNodeType = String(error?.nodeType || "").trim();
    const resolvedProvider = serverProvider || inferProvider(url, provider);
    const resolvedNodeType = serverNodeType || inferNodeType(url, "");
    handler({
      requiredModelId: error?.requiredModelId || "",
      modelId: error?.requiredModelId || "",
      provider: resolvedProvider,
      nodeType: resolvedNodeType,
      reasonCode: error?.reasonCode || "",
      subscriptionStatus: error?.subscriptionStatus || "",
      activationSource: error?.activationSource || "",
      generationScope: error?.generationScope || "",
      error,
    });
  } catch {
    // Keep the request error path intact even if UI hook fails.
  }
}

function buildSubscriptionError(url, provider, payload, status = 200) {
  const error = ApiError.subscriptionRequired(
    inferProvider(url, provider),
    payload,
    status,
  );
  triggerSubscriptionRequired(url, provider, error);
  return error;
}

function maybeThrowSubscriptionRequired(url, provider, payload, status = 200) {
  const normalizedPayload = normalizeSubscriptionPayloadCandidate(payload);
  if (!isLocalApiRequest(url) || !isGenerationRoute(url) || !isSubscriptionRequiredPayload(normalizedPayload)) {
    return;
  }
  throw buildSubscriptionError(url, provider, normalizedPayload, status);
}

export async function requester(options) {
  const {
    url,
    method = "GET",
    headers = {},
    body,
    timeout = DEFAULT_TIMEOUT,
    signal,
    retries = 0,
    retryDelay = 600,
    responseType = "auto",
    allow404Null = false,
    provider = "unknown",
    errorParser,
    buildUrl = true,
    returnMeta = false,
  } = options || {};

  let finalUrl = url || "";
  if (buildUrl && !isAbsoluteUrl(finalUrl)) {
    finalUrl = buildApiUrl(finalUrl);
  }

  const requestHeaders = withLocalInstallIdHeader(finalUrl, headers);
  const requestBody = withLocalInstallIdBody(finalUrl, requestHeaders, body);
  const doFetch = signal ? fetchWithTimeoutWithSignal : fetchWithTimeout;
  let retryCount = 0;

  while (true) {
    try {
      const response = await doFetch(
        finalUrl,
        { method, headers: requestHeaders, body: requestBody },
        timeout,
        signal,
      );

      if (response.status === 404 && allow404Null) {
        return returnMeta ? { data: null, status: 404, headers: response.headers } : null;
      }

      if (!response.ok) {
        const errorBody = await parseErrorBody(response);
        maybeThrowSubscriptionRequired(finalUrl, provider, errorBody, response.status);
        const parsedError =
          typeof errorParser === "function"
            ? errorParser(provider, errorBody, response.status)
            : parseError(provider, errorBody, response.status);
        if (parsedError && shouldRetryError(parsedError, retryCount, retries, signal)) {
          retryCount += 1;
          await sleep(retryDelay * retryCount);
          continue;
        }
        throw parsedError || ApiError.fromHttpStatus(response.status, provider);
      }

      const data = await parseResponseBody(response, responseType);
      maybeThrowSubscriptionRequired(finalUrl, provider, data, response.status);
      return returnMeta ? { data, status: response.status, headers: response.headers } : data;
    } catch (error) {
      const apiError =
        error instanceof ApiError ? error : parseNetworkError(provider, error, timeout);
      if (shouldRetryError(apiError, retryCount, retries, signal)) {
        retryCount += 1;
        await sleep(retryDelay * retryCount);
        continue;
      }
      throw apiError;
    }
  }
}

export function get(url, options = {}) {
  return requester({ url, method: "GET", ...options });
}

export function del(url, options = {}) {
  return requester({ url, method: "DELETE", ...options });
}

export function post(url, data, options = {}) {
  const headers = { ...(options.headers || {}) };
  let body = data;
  if (
    data !== undefined &&
    !(data instanceof FormData) &&
    !(data instanceof Blob) &&
    !(data instanceof ArrayBuffer)
  ) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
    body = typeof data === "string" ? data : JSON.stringify(data);
  }
  return requester({
    url,
    method: "POST",
    headers,
    body,
    ...options,
  });
}

export function patch(url, data, options = {}) {
  const headers = { ...(options.headers || {}) };
  let body = data;
  if (
    data !== undefined &&
    !(data instanceof FormData) &&
    !(data instanceof Blob) &&
    !(data instanceof ArrayBuffer)
  ) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
    body = typeof data === "string" ? data : JSON.stringify(data);
  }
  return requester({
    url,
    method: "PATCH",
    headers,
    body,
    ...options,
  });
}
