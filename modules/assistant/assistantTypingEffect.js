function waitWithScheduler(scheduler, delayMs) {
  if (typeof scheduler === "function") {
    return new Promise((resolve) => {
      scheduler(resolve, delayMs);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function appendAssistantTypingMessage({
  messages,
  text,
  onUpdate,
  signal,
  chunkSize = 1,
  delayMs = 12,
  scheduler,
} = {}) {
  if (!Array.isArray(messages)) {
    throw new TypeError("messages array is required");
  }
  const reply = String(text || "");
  const size = Math.max(1, Number(chunkSize || 1));
  const message = { role: "assistant", content: "" };
  messages.push(message);
  for (let index = 0; index < reply.length; index += size) {
    if (signal?.aborted) {
      break;
    }
    message.content += reply.slice(index, index + size);
    if (typeof onUpdate === "function") {
      onUpdate(message);
    }
    if (delayMs > 0 && !signal?.aborted) {
      await waitWithScheduler(scheduler, delayMs);
    }
  }
  return message;
}
