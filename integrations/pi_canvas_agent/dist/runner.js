import { fileURLToPath } from "node:url";

export * from "../src/runner.js";
import { runJsonlLoop } from "../src/runner.js";

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runJsonlLoop();
}

