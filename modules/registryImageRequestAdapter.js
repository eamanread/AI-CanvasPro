function trimText(value) {
  return String(value ?? "").trim();
}

function parseUrl(value) {
  const text = trimText(value).replace(/\/+$/, "");
  if (!text) {
    return null;
  }
  try {
    return new URL(text);
  } catch {
    return null;
  }
}

export function normalizeRegistryImageAdapterType(value) {
  return trimText(value).toLowerCase().replace(/-/g, "_") || "openai_compatible";
}

function normalizeGrsaiModelId(modelId) {
  return trimText(modelId).replace(/^grsai\//i, "");
}

function isGrsaiGptImage2Request(baseUrl, modelId) {
  const rawModel = trimText(modelId);
  const normalizedModel = normalizeGrsaiModelId(rawModel).toLowerCase();
  if (normalizedModel !== "gpt-image-2") {
    return false;
  }

  const parsed = parseUrl(baseUrl);
  const host = parsed?.host || "";
  return /^grsai\//i.test(rawModel) || /grsai/i.test(host);
}

function normalizeGrsaiDrawCompletionsApiUrl(baseUrl) {
  const text = trimText(baseUrl).replace(/\/+$/, "");
  const parsed = parseUrl(text);
  if (!parsed) {
    return text;
  }

  const path = parsed.pathname.replace(/\/+$/, "");
  if (/\/v1\/draw\/completions$/i.test(path)) {
    return `${parsed.origin}${path}`;
  }
  return `${parsed.origin}/v1/draw/completions`;
}

export function isMidjourneyProxyImageModel({ modelId = "", adapterType = "" } = {}) {
  const normalizedAdapter = normalizeRegistryImageAdapterType(adapterType);
  const normalizedModel = trimText(modelId).toLowerCase();
  return (
    normalizedAdapter === "midjourney" ||
    normalizedAdapter === "midjourney_proxy" ||
    normalizedModel === "midjourney" ||
    normalizedModel.includes("midjourney") ||
    /^mj[_-]/i.test(normalizedModel)
  );
}

export function normalizeOpenAiCompatibleImageApiUrl(baseUrl, adapterType = "openai_compatible") {
  const normalizedAdapter = normalizeRegistryImageAdapterType(adapterType);
  const text = trimText(baseUrl).replace(/\/+$/, "");
  if (!text || normalizedAdapter !== "openai_compatible") {
    return text;
  }

  const parsed = parseUrl(text);
  if (!parsed) {
    return text;
  }

  const path = parsed.pathname.replace(/\/+$/, "");
  if (!path || path === "/") {
    return `${parsed.origin}/v1/images/generations`;
  }

  if (/\/v1$/i.test(path)) {
    return `${parsed.origin}${path}/images/generations`;
  }

  return text;
}

export function resolveMidjourneySubmitApiUrl(baseUrl, modelId = "") {
  const text = trimText(baseUrl).replace(/\/+$/, "");
  const parsed = parseUrl(text);
  if (!parsed) {
    return text;
  }

  const path = parsed.pathname.replace(/\/+$/, "");
  if (/\/mj\/submit\/[^/]+$/i.test(path)) {
    return `${parsed.origin}${path}`;
  }

  const normalizedModel = trimText(modelId).toLowerCase();
  const action = normalizedModel.includes("blend")
    ? "blend"
    : normalizedModel.includes("describe")
      ? "describe"
      : "imagine";
  return `${parsed.origin}/mj/submit/${action}`;
}

export function buildMidjourneyTaskFetchApiUrl(submitApiUrl, taskId) {
  const parsed = parseUrl(submitApiUrl);
  const normalizedTaskId = trimText(taskId);
  if (!parsed || !normalizedTaskId) {
    return "";
  }
  const path = parsed.pathname.replace(/\/+$/, "");
  if (!/\/mj\/submit\/[^/]+$/i.test(path)) {
    return "";
  }
  return `${parsed.origin}/mj/task/${encodeURIComponent(normalizedTaskId)}/fetch`;
}

export function buildRegistryImageSubmitRequest(payload, requestBatchSize = 1) {
  const adapterType = normalizeRegistryImageAdapterType(payload?.adapterType);
  const modelId = trimText(payload?.model);
  const baseUrl = trimText(payload?.apiUrl);
  const prompt = trimText(payload?.prompt);
  const inputUrls = Array.isArray(payload?.inputUrls) ? payload.inputUrls.filter(Boolean) : [];

  if (isMidjourneyProxyImageModel({ modelId, adapterType })) {
    if (inputUrls.length > 0) {
      throw new Error("MJ imagine currently supports text-to-image only.");
    }
    return {
      mode: "midjourney_proxy",
      apiUrl: resolveMidjourneySubmitApiUrl(baseUrl, modelId),
      body: {
        prompt,
      },
      nativeBatchSize: 1,
    };
  }

  const normalizedBatchSize = Math.max(1, Math.trunc(Number(requestBatchSize || 1)) || 1);
  if (isGrsaiGptImage2Request(baseUrl, modelId)) {
    const apiUrl = normalizeGrsaiDrawCompletionsApiUrl(baseUrl);
    const body = {
      apiUrl,
      apiKey: trimText(payload?.apiKey),
      model: normalizeGrsaiModelId(modelId),
      prompt,
      urls: inputUrls,
      batchSize: normalizedBatchSize,
      shutProgress: true,
    };

    if (!payload?.suppressAspectRatio && trimText(payload?.aspectRatio)) {
      body.aspectRatio = trimText(payload.aspectRatio);
    }
    if (!payload?.suppressImageSize && trimText(payload?.imageSize)) {
      body.imageSize = trimText(payload.imageSize);
    }

    return {
      mode: "grsai_draw_completions",
      apiUrl,
      body,
      nativeBatchSize: normalizedBatchSize,
    };
  }

  const apiUrl = normalizeOpenAiCompatibleImageApiUrl(baseUrl, adapterType);
  const body = {
    apiUrl,
    apiKey: trimText(payload?.apiKey),
    model: modelId,
    prompt,
    urls: inputUrls,
    shutProgress: true,
  };

  if (adapterType === "openai_compatible") {
    body.n = normalizedBatchSize;
  } else {
    body.batchSize = normalizedBatchSize;
  }

  if (!payload?.suppressAspectRatio && trimText(payload?.aspectRatio)) {
    body.aspectRatio = trimText(payload.aspectRatio);
  }
  if (!payload?.suppressImageSize && trimText(payload?.imageSize)) {
    body.imageSize = trimText(payload.imageSize);
  }

  return {
    mode: adapterType,
    apiUrl,
    body,
    nativeBatchSize: normalizedBatchSize,
  };
}
