function trimText(value) {
  return String(value || "").trim();
}

function normalizeOpenAIBaseUrl(baseUrl) {
  const normalized = trimText(baseUrl).replace(/\/+$/, "");
  if (normalized.endsWith("/chat/completions")) {
    return normalized.slice(0, -"/chat/completions".length);
  }
  return normalized;
}

function resolveOpenAIChatCompletionsUrl(baseUrl) {
  const normalized = trimText(baseUrl).replace(/\/+$/, "");
  if (!normalized) {
    return "";
  }
  if (normalized.endsWith("/chat/completions")) {
    return normalized;
  }
  if (normalized.endsWith("/openai")) {
    return `${normalized}/v1/chat/completions`;
  }
  return `${normalized}/chat/completions`;
}

function responseText(response) {
  if (typeof response === "string") {
    return response;
  }
  if (!response || typeof response !== "object") {
    return "";
  }
  if (typeof response.output_text === "string") {
    return response.output_text;
  }
  if (typeof response.text === "string" || typeof response.content === "string" || typeof response.message === "string") {
    return String(response.text || response.content || response.message || "");
  }
  const firstChoice = Array.isArray(response.choices) ? response.choices[0] : null;
  if (firstChoice && typeof firstChoice === "object") {
    const message = firstChoice.message && typeof firstChoice.message === "object" ? firstChoice.message : null;
    return String(message?.content || firstChoice.text || firstChoice.content || "");
  }
  return "";
}

function buildMessages(input) {
  return [
    { role: "system", content: input.systemPrompt },
    {
      role: "user",
      content: JSON.stringify({
        message: input.message,
        context: input.context,
        responseContract: {
          reply: "string",
          actions: [],
          warnings: [],
          requiresConfirmation: false
        },
        onlyToolName: input.toolName
      })
    }
  ];
}

async function parseJsonResponse(response) {
  if (typeof response.json === "function") {
    try {
      return await response.json();
    } catch {
      // Fall through to text parsing for non-standard response shims.
    }
  }
  const bodyText = typeof response.text === "function" ? await response.text() : "";
  if (!bodyText) {
    return {};
  }
  try {
    return JSON.parse(bodyText);
  } catch {
    return { message: bodyText };
  }
}

async function runOpenAICompatibleCompletion(input) {
  if (typeof fetch !== "function") {
    throw new Error("OpenAI-compatible fetch is unavailable in this Node runtime.");
  }
  const url = resolveOpenAIChatCompletionsUrl(input.baseUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`
    },
    body: JSON.stringify({
      model: input.model,
      stream: false,
      messages: buildMessages(input)
    })
  });
  const payload = await parseJsonResponse(response);
  if (response && response.ok === false) {
    const errorPayload = payload.error && typeof payload.error === "object" ? payload.error : {};
    const rawError = typeof payload.error === "string" ? payload.error : "";
    const message = responseText(payload) || errorPayload.message || rawError || payload.message || `HTTP ${response.status || "error"}`;
    throw new Error(`OpenAI-compatible provider request failed: ${message}`);
  }
  const text = responseText(payload);
  if (!trimText(text)) {
    throw new Error("OpenAI-compatible provider returned an empty response.");
  }
  return text;
}

function shouldFallbackToDirectOpenAI(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code === "ERR_MODULE_NOT_FOUND" && message.includes("@earendil-works/pi-ai");
}

export async function runPiCompletion(input) {
  if (!input.apiKey || !input.baseUrl) {
    throw new Error("Pi model provider is not configured.");
  }

  let mod;
  try {
    mod = await import("@earendil-works/pi-ai");
  } catch (error) {
    if (shouldFallbackToDirectOpenAI(error)) {
      return runOpenAICompatibleCompletion(input);
    }
    throw error;
  }
  const createClient = mod.createOpenAICompatibleClient || mod.createClient || mod.default;
  if (typeof createClient !== "function") {
    throw new Error("Pi SDK adapter is unavailable: model client factory missing.");
  }

  const client = createClient({
    baseUrl: normalizeOpenAIBaseUrl(input.baseUrl),
    apiKey: input.apiKey,
    model: input.model
  });
  if (!client || typeof client.complete !== "function") {
    throw new Error("Pi SDK adapter is unavailable: complete method missing.");
  }

  const response = await client.complete({
    messages: buildMessages(input)
  });

  return responseText(response);
}
