export interface PiCompletionInput {
  model: string;
  systemPrompt: string;
  message: string;
  context: unknown;
  toolName: string;
  baseUrl: string;
  apiKey: string;
}

function trimText(value: unknown): string {
  return String(value || "").trim();
}

function normalizeOpenAIBaseUrl(baseUrl: string): string {
  const normalized = trimText(baseUrl).replace(/\/+$/, "");
  if (normalized.endsWith("/chat/completions")) {
    return normalized.slice(0, -"/chat/completions".length);
  }
  return normalized;
}

function resolveOpenAIChatCompletionsUrl(baseUrl: string): string {
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

function responseText(response: unknown): string {
  if (typeof response === "string") {
    return response;
  }
  if (!response || typeof response !== "object") {
    return "";
  }
  const record = response as Record<string, unknown>;
  if (typeof record.output_text === "string") {
    return record.output_text;
  }
  if (typeof record.text === "string" || typeof record.content === "string" || typeof record.message === "string") {
    return String(record.text || record.content || record.message || "");
  }
  const firstChoice = Array.isArray(record.choices) ? record.choices[0] as Record<string, unknown> | undefined : undefined;
  if (firstChoice) {
    const message = firstChoice.message && typeof firstChoice.message === "object"
      ? firstChoice.message as Record<string, unknown>
      : null;
    return String(message?.content || firstChoice.text || firstChoice.content || "");
  }
  return "";
}

function buildMessages(input: PiCompletionInput): Array<Record<string, unknown>> {
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

async function parseJsonResponse(response: Response): Promise<Record<string, unknown>> {
  if (typeof response.json === "function") {
    try {
      return await response.json() as Record<string, unknown>;
    } catch {
      // Fall through to text parsing for non-standard response shims.
    }
  }
  const bodyText = typeof response.text === "function" ? await response.text() : "";
  if (!bodyText) {
    return {};
  }
  try {
    return JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    return { message: bodyText };
  }
}

async function runOpenAICompatibleCompletion(input: PiCompletionInput): Promise<string> {
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
    const errorPayload = payload.error && typeof payload.error === "object" ? payload.error as Record<string, unknown> : {};
    const rawError = typeof payload.error === "string" ? payload.error : "";
    const message = responseText(payload) || String(errorPayload.message || rawError || payload.message || `HTTP ${response.status || "error"}`);
    throw new Error(`OpenAI-compatible provider request failed: ${message}`);
  }
  const text = responseText(payload);
  if (!trimText(text)) {
    throw new Error("OpenAI-compatible provider returned an empty response.");
  }
  return text;
}

function shouldFallbackToDirectOpenAI(error: unknown): boolean {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const code = String(record.code || "");
  const message = String(record.message || "");
  return code === "ERR_MODULE_NOT_FOUND" && message.includes("@earendil-works/pi-ai");
}

export async function runPiCompletion(input: PiCompletionInput): Promise<string> {
  if (!input.apiKey || !input.baseUrl) {
    throw new Error("Pi model provider is not configured.");
  }

  let mod: unknown;
  try {
    mod = await import("@earendil-works/pi-ai");
  } catch (error) {
    if (shouldFallbackToDirectOpenAI(error)) {
      return runOpenAICompatibleCompletion(input);
    }
    throw error;
  }
  const record = mod as Record<string, unknown>;
  const createClient = record.createOpenAICompatibleClient || record.createClient || record.default;
  if (typeof createClient !== "function") {
    throw new Error("Pi SDK adapter is unavailable: model client factory missing.");
  }

  const client = createClient({
    baseUrl: normalizeOpenAIBaseUrl(input.baseUrl),
    apiKey: input.apiKey,
    model: input.model
  });
  if (!client || typeof (client as { complete?: unknown }).complete !== "function") {
    throw new Error("Pi SDK adapter is unavailable: complete method missing.");
  }

  const response = await (client as {
    complete(payload: unknown): Promise<unknown>;
  }).complete({
    messages: buildMessages(input)
  });

  return responseText(response);
}
