import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";

import { normalizeBridgeRequest, safeResponse } from "./protocol.js";
import { createPiModelClient } from "./piClient.js";

let activeClient = createPiModelClient();

export function setPiModelClientForTests(client) {
  activeClient = client || createPiModelClient();
}

function warningFromError(error) {
  return error instanceof Error ? error.message : String(error);
}

function requestIdFromValue(value) {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value.id === "string" &&
    value.id.trim().length > 0
  ) {
    return value.id;
  }
  return "unknown";
}

export async function handleChat(request) {
  try {
    return await activeClient.complete(request);
  } catch (error) {
    return safeResponse(request.id, {
      success: false,
      errorCode: "pi_agent_failed",
      reply: "Pi canvas agent failed before producing a response.",
      actions: [],
      warnings: [warningFromError(error)],
      requiresConfirmation: false
    });
  }
}

export async function handleLine(line) {
  if (line.trim().length === 0) {
    return undefined;
  }

  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    return JSON.stringify(
      safeResponse("unknown", {
        success: false,
        errorCode: "invalid_jsonl",
        reply: "Pi canvas agent received invalid JSONL.",
        warnings: [warningFromError(error)]
      })
    );
  }

  try {
    const request = normalizeBridgeRequest(parsed);
    return JSON.stringify(await handleChat(request));
  } catch (error) {
    return JSON.stringify(
      safeResponse(requestIdFromValue(parsed), {
        success: false,
        errorCode: "invalid_request",
        reply: "Pi canvas agent received an invalid request.",
        warnings: [warningFromError(error)]
      })
    );
  }
}

export async function runJsonlLoop() {
  stdin.setEncoding("utf8");

  let pending = "";
  for await (const chunk of stdin) {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";

    for (const line of lines) {
      const responseLine = await handleLine(line);
      if (responseLine !== undefined) {
        stdout.write(`${responseLine}\n`);
      }
    }
  }

  const responseLine = await handleLine(pending);
  if (responseLine !== undefined) {
    stdout.write(`${responseLine}\n`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runJsonlLoop();
}
