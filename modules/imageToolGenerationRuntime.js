function trimText(value) {
  return String(value ?? "").trim();
}

function normalizeInputUrls(inputUrls) {
  return Array.isArray(inputUrls)
    ? inputUrls.map((url) => trimText(url)).filter(Boolean)
    : [];
}

export function assertResolvedImageToolModelReady(resolved) {
  if (resolved?.state === "ready") {
    return resolved;
  }

  const label =
    trimText(resolved?.selectedModelNameSnapshot) ||
    trimText(resolved?.displayLabel) ||
    "Selected image model";
  if (resolved?.state === "deleted") {
    throw new Error(`${label} has been deleted. Select another image model before using this tool.`);
  }
  throw new Error(`${label} is not configured. Configure the image model before using this tool.`);
}

export function buildStandardImageToolPayload({
  operation,
  sourceNode = {},
  resolved,
  prompt,
  inputUrls = [],
  aspectRatio = sourceNode.aspectRatio,
  imageSize = sourceNode.imageSize,
  batchSize = sourceNode.batchSize,
  extra = {},
} = {}) {
  assertResolvedImageToolModelReady(resolved);

  return {
    operation: trimText(operation),
    prompt: trimText(prompt),
    inputUrls: normalizeInputUrls(inputUrls),
    aspectRatio: trimText(aspectRatio) || "auto",
    imageSize: trimText(imageSize) || "2K",
    batchSize: Math.max(1, Math.trunc(Number(batchSize || 1)) || 1),
    provider: trimText(resolved.provider),
    model: trimText(resolved.model),
    apiUrl: trimText(resolved.baseUrl || resolved.apiUrl),
    apiKey: trimText(resolved.apiKey),
    adapterType: trimText(resolved.adapterType) || "openai_compatible",
    selectedModelId: trimText(resolved.selectedModelId || sourceNode.selectedModelId),
    selectedModelNameSnapshot: trimText(
      resolved.selectedModelNameSnapshot || sourceNode.selectedModelNameSnapshot
    ),
    ...extra,
  };
}

export function normalizeGeneratedImageOutputFields({
  result = {},
  sourceNode = {},
  resolved = {},
  generationStartTime,
  now = Date.now(),
  status = "success",
  error = "",
  extra = {},
} = {}) {
  const hasTiming = Number.isFinite(Number(generationStartTime)) && Number.isFinite(Number(now));
  const sourceUrl = trimText(result.sourceUrl || result.imageUrl || result.url);
  const imageUrl = trimText(result.imageUrl || result.sourceUrl || result.url);
  const thumbUrl = trimText(result.thumbUrl || result.imageUrl || result.sourceUrl || result.url);

  return {
    provider: trimText(resolved.provider || sourceNode.provider),
    model: trimText(resolved.model || sourceNode.model),
    selectedModelId: trimText(resolved.selectedModelId || sourceNode.selectedModelId),
    selectedModelNameSnapshot: trimText(
      resolved.selectedModelNameSnapshot || sourceNode.selectedModelNameSnapshot
    ),
    sourceUrl,
    thumbUrl,
    imageUrl,
    localPath: trimText(result.localPath),
    originalLocalPath: trimText(result.originalLocalPath),
    displayLocalPath: trimText(result.displayLocalPath),
    thumbLocalPath: trimText(result.thumbLocalPath),
    fileName: trimText(result.fileName),
    generationStartTime,
    generationDuration: hasTiming ? Number(now) - Number(generationStartTime) : null,
    jobStatus: status,
    jobError: trimText(error),
    asyncTaskProvider: trimText(resolved.provider || sourceNode.provider),
    asyncTaskKind: "image-tool",
    asyncTaskStatus: status,
    ...extra,
  };
}
