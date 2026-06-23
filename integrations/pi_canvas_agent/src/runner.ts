import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";

import {
  type BridgeRequest,
  type BridgeResponse,
  normalizeBridgeRequest,
  safeResponse
} from "./protocol.js";
import { createPiModelClient, type PiModelClient } from "./piClient.js";

let activeClient: PiModelClient = createPiModelClient();

export function setPiModelClientForTests(client: PiModelClient): void {
  activeClient = client || createPiModelClient();
}

function warningFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requestIdFromValue(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { id?: unknown }).id === "string" &&
    (value as { id: string }).id.trim().length > 0
  ) {
    return (value as { id: string }).id;
  }
  return "unknown";
}

export async function handleChat(request: BridgeRequest): Promise<BridgeResponse> {
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

export async function handleLine(line: string): Promise<string | undefined> {
  if (line.trim().length === 0) {
    return undefined;
  }

  let parsed: unknown;
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

export async function runJsonlLoop(): Promise<void> {
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
