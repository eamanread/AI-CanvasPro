// Canvas Agent live E2E: real LLM (model_registry gemini text model) -> v2 contract ->
// panel send -> drawer confirm -> executed timeline -> nodes on canvas.
// Usage: node tools/run_canvas_agent_llm_e2e.mjs [baseUrl]
import { chromium } from "@playwright/test";

const BASE = process.argv[2] || "http://127.0.0.1:8777";
const results = [];
function check(name, ok, detail = "") {
  results.push([name, ok]);
  console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : ` | ${detail}`));
}

const browser = await chromium.launch({
  headless: false,
  executablePath: "C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe",
  args: ["--no-sandbox", "--window-position=40,40"],
});
const page = await browser.newPage({ viewport: { width: 1480, height: 920 } });

async function cleanBackendTestExecutions() {
  // E2E executions are created with the exec_pi- prefix and an empty projectId.
  // Close any non-terminal leftovers so a stale failed/draft task cannot occupy
  // the drawer or force the new response into the queue.
  const listed = await fetch(BASE + "/api/v2/canvas-agent/executions").then((r) => r.json()).catch(() => ({}));
  for (const execution of listed.executions || []) {
    const id = String(execution.id || "");
    if (!id.startsWith("exec_pi-")) continue;
    if (["completed", "cancelled"].includes(String(execution.status))) continue;
    await fetch(`${BASE}/api/v2/canvas-agent/executions/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed", drawerState: { visible: false } }),
    }).catch(() => {});
  }
  await fetch(BASE + "/api/v2/canvas-agent/executions?status=completed", { method: "DELETE" }).catch(() => {});
}

try {
  await cleanBackendTestExecutions();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
  // Clean leftover local executions so a stale failed task cannot occupy the drawer.
  await page.evaluate(() => localStorage.removeItem("huanying.canvasAgent.executions.v1"));
  await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => Boolean(window.__huanyingCanvasAgentAssistant), null, { timeout: 45000 });
  await page.evaluate(() => window.__huanyingCanvasAgentAssistant.open());
  await page.waitForTimeout(400);

  // Drive the UI like a real user: pick the gemini model from the menu, type, click send.
  const sendResult = await page.evaluate(() => {
    const controller = window.__huanyingCanvasAgentAssistant;
    return {
      hasGemini: controller.state.modelOptions.some((model) =>
        /gemini/i.test(`${model.displayName || ""} ${model.model || ""}`)
      ),
    };
  });
  await page.click(".hy-canvas-agent-mode-pill");
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const options = Array.from(document.querySelectorAll(".hy-canvas-agent-model-option"));
    const gemini = options.find((option) => /gemini/i.test(option.textContent || ""));
    if (gemini) gemini.click();
  });
  await page.waitForTimeout(300);
  const selected = await page.evaluate(
    () => window.__huanyingCanvasAgentAssistant.state.selectedModel?.model || ""
  );
  check("gemini model selected via menu", /gemini/i.test(selected), selected);

  await page.fill(
    ".hy-canvas-agent-input",
    "根据“雨夜侦探发现线索”做 2 个分镜，每个分镜创建一个文本节点写出画面描述，不要生成图片或视频"
  );
  await page.dispatchEvent(".hy-canvas-agent-input", "input");
  await page.click(".hy-canvas-agent-send");
  check("message sent through real input", true);

  // Wait for the streaming round-trip to finish and the drawer to render the new execution.
  await page.waitForFunction(() => {
    const controller = window.__huanyingCanvasAgentAssistant;
    return controller.state.streaming === false && /done/.test(String(controller.state.status || ""));
  }, null, { timeout: 180000 });
  const responseInfo = await page.evaluate(() => {
    const drawer = document.querySelector(".hy-canvas-agent-execution-drawer");
    return {
      drawerVisible: Boolean(drawer) && drawer.hidden !== true,
      drawerText: drawer ? String(drawer.textContent || "").slice(0, 60) : "",
    };
  });
  check("v2 response rendered an execution drawer", responseInfo.drawerVisible, JSON.stringify(responseInfo));

  await page.waitForTimeout(600);
  const confirmLabel = await page.evaluate(() => {
    const button = document.querySelector(".hy-canvas-agent-execution-action");
    return button ? button.textContent : "";
  });
  if (confirmLabel === "确认") {
    await page.click(".hy-canvas-agent-execution-action");
  }
  await page.waitForFunction(() => {
    const drawer = document.querySelector(".hy-canvas-agent-execution-drawer");
    return drawer && /执行完成|失败|failed/.test(drawer.textContent || "");
  }, null, { timeout: 150000 });

  const outcome = await page.evaluate(() => {
    const controller = window.__huanyingCanvasAgentAssistant;
    const metrics = controller.state.debugSnapshot ? controller.state.debugSnapshot().executionMetrics : null;
    const raw = localStorage.getItem("huanying.canvasAgent.executions.v1");
    let lastExecution = null;
    try {
      const executions = (JSON.parse(raw || "{}").executions || []);
      lastExecution = executions[executions.length - 1] || null;
    } catch {
      lastExecution = null;
    }
    return {
      status: lastExecution?.status,
      matchedSkills: lastExecution?.matchedSkills || [],
      completedEvents: (lastExecution?.timeline || []).filter((event) => event.status === "completed").length,
      withDuration: (lastExecution?.timeline || []).filter((event) => Number(event.durationMs) > 0).length,
      withTarget: (lastExecution?.timeline || []).filter((event) => event.target && event.target.actionType).length,
      metrics,
      canvasNodeIds: [...new Set(
        (lastExecution?.timeline || [])
          .filter((event) => event.status === "completed")
          .flatMap((event) => event.nodeIds || [])
      )],
    };
  });
  check("execution completed", outcome.status === "completed", JSON.stringify(outcome));
  check(
    "actions executed with real durations and targets",
    outcome.completedEvents >= 1 && outcome.withDuration >= 1 && outcome.withTarget >= 1,
    JSON.stringify({ completedEvents: outcome.completedEvents, withDuration: outcome.withDuration, withTarget: outcome.withTarget })
  );
  check(
    "canvas gained real nodes (timeline nodeIds from live graph store)",
    outcome.canvasNodeIds.length >= 2,
    JSON.stringify({ canvasNodeIds: outcome.canvasNodeIds })
  );
  check(
    "matchedSkills backfilled on the real chat path",
    outcome.matchedSkills.length >= 1,
    JSON.stringify(outcome.matchedSkills)
  );
  check(
    "skillHitRate metric is live",
    Boolean(outcome.metrics) && outcome.metrics.skillHitRate > 0,
    JSON.stringify(outcome.metrics)
  );
  console.log("matchedSkills:", JSON.stringify(outcome.matchedSkills));
  console.log("metrics:", JSON.stringify(outcome.metrics));
} finally {
  await browser.close();
  await cleanBackendTestExecutions();
}
const failed = results.filter(([, ok]) => !ok);
console.log(`\nLIVE LLM E2E: ${results.length - failed.length} pass / ${failed.length} fail`);
process.exit(failed.length ? 1 : 0);
