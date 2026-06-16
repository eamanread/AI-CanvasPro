import {
  AssistantStreamEventType,
  normalizeAssistantResponse,
  normalizeAssistantStreamEvent,
} from "./assistantProtocol.js";

function parseJsonLine(line) {
  const text = String(line || "").trim();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (cause) {
    const error = new Error("Canvas agent stream event was not valid JSON.");
    error.cause = cause;
    error.line = text;
    throw error;
  }
}

function parseSseFrame(frame) {
  const lines = String(frame || "").split(/\r?\n/);
  let eventType = "";
  const data = [];
  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventType = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice("data:".length).trimStart());
    }
  }
  if (!data.length) {
    return null;
  }
  const parsed = parseJsonLine(data.join("\n"));
  if (eventType && parsed && typeof parsed === "object" && !parsed.type) {
    parsed.type = eventType;
  }
  return parsed;
}

async function* iterateResponseText(response) {
  if (!response?.body?.getReader) {
    return;
  }
  if (typeof TextDecoder !== "function") {
    throw new Error("TextDecoder is required to consume canvas agent streams.");
  }
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      yield decoder.decode(value, { stream: true });
    }
    const tail = decoder.decode();
    if (tail) {
      yield tail;
    }
  } finally {
    reader.releaseLock?.();
  }
}

async function* iterateStreamSource(source) {
  if (!source) {
    return;
  }
  if (typeof source[Symbol.asyncIterator] === "function") {
    for await (const item of source) {
      yield item;
    }
    return;
  }
  if (Array.isArray(source)) {
    for (const item of source) {
      yield item;
    }
    return;
  }
  if (source.body?.getReader) {
    let buffer = "";
    const contentType = String(source.headers?.get?.("content-type") || "");
    const isSse = contentType.includes("text/event-stream");
    for await (const chunk of iterateResponseText(source)) {
      buffer += chunk;
      let delimiterMatch = isSse ? buffer.match(/\r?\n\r?\n/) : null;
      let index = isSse ? delimiterMatch?.index ?? -1 : buffer.indexOf("\n");
      while (index >= 0) {
        const frame = buffer.slice(0, index);
        const delimiterLength = isSse ? delimiterMatch[0].length : 1;
        buffer = buffer.slice(index + delimiterLength);
        const parsed = isSse ? parseSseFrame(frame) : parseJsonLine(frame);
        if (parsed) {
          yield parsed;
        }
        delimiterMatch = isSse ? buffer.match(/\r?\n\r?\n/) : null;
        index = isSse ? delimiterMatch?.index ?? -1 : buffer.indexOf("\n");
      }
    }
    const tail = buffer.trim();
    if (tail) {
      yield isSse ? parseSseFrame(tail) : parseJsonLine(tail);
    }
  }
}

export async function consumeAssistantStream(source, { onEvent } = {}) {
  const response = normalizeAssistantResponse();
  let streamedReply = "";

  for await (const rawEvent of iterateStreamSource(source)) {
    const event = normalizeAssistantStreamEvent(rawEvent);
    if (!event) {
      continue;
    }
    onEvent?.(event);

    if (event.type === AssistantStreamEventType.MessageDelta) {
      streamedReply += String(event.delta ?? event.content ?? event.text ?? "");
    } else if (event.type === AssistantStreamEventType.MessageDone) {
      const finalResponse = normalizeAssistantResponse(event.response || event);
      const proposedActions = response.actions;
      const streamedWarnings = response.warnings;
      Object.assign(response, finalResponse);
      if (!finalResponse.actions.length && proposedActions.length) {
        response.actions = proposedActions;
      }
      if (!finalResponse.warnings.length && streamedWarnings.length) {
        response.warnings = streamedWarnings;
      }
      if (!response.reply && streamedReply) {
        response.reply = streamedReply;
      }
    } else if (event.type === AssistantStreamEventType.ActionProposed) {
      const actions = Array.isArray(event.actions) ? event.actions : event.action ? [event.action] : [];
      response.actions = actions;
    } else if (event.type === AssistantStreamEventType.Warning) {
      response.warnings.push(String(event.message || event.warning || "").trim());
      response.warnings = response.warnings.filter(Boolean);
    } else if (event.type === AssistantStreamEventType.Error) {
      const error = new Error(event.message || event.error || "Canvas agent stream failed.");
      error.event = event;
      error.friendlyMessage = String(event.friendlyMessage || event.message || event.error || "").trim();
      error.errorCode = String(event.errorCode || event.code || "assistant_stream_error").trim();
      error.traceId = String(event.traceId || "").trim();
      error.diagnostics = Array.isArray(event.diagnostics)
        ? event.diagnostics.map((item) => String(item || "").trim()).filter(Boolean)
        : Array.isArray(event.warnings)
          ? event.warnings.map((item) => String(item || "").trim()).filter(Boolean)
          : [];
      error.retryable = event.retryable !== false;
      throw error;
    }
  }

  if (!response.reply && streamedReply) {
    response.reply = streamedReply;
  }
  return response;
}
