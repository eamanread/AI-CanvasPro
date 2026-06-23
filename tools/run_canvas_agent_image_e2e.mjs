// Canvas Agent live E2E with a REAL image generation step.
// Usage: node tools/run_canvas_agent_image_e2e.mjs [baseUrl]
// Asserts the storyboard+image plan executes, the generation task is queued
// against the live provider, and reports (best-effort) the final task state.
import { chromium } from "@playwright/test";

const BASE = process.argv[2] || "http://127.0.0.1:8777";
const results = [];
function check(name, ok, detail = "") {
  results.push([name, ok]);
  console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : ` | ${detail}`));
}

async function cleanBackendTestExecutions() {
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

const browser = await chromium.launch({
  headless: false,
  executablePath: "C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe",
  args: ["--no-sandbox", "--window-position=40,40"],
});
const page = await browser.newPage({ viewport: { width: 1480, height: 920 } });
try {
  await cleanBackendTestExecutions();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.evaluate(() => localStorage.removeItem("huanying.canvasAgent.executions.v1"));
  await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => Boolean(window.__huanyingCanvasAgentAssistant), null, { timeout: 45000 });
  await page.evaluate(() => window.__huanyingCanvasAgentAssistant.open());
  await page.waitForTimeout(400);

  await page.click(".hy-canvas-agent-mode-pill");
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const options = Array.from(document.querySelectorAll(".hy-canvas-agent-model-option"));
    const gemini = options.find((option) => /gemini/i.test(option.textContent || ""));
    if (gemini) gemini.click();
  });
  await page.waitForTimeout(300);

  await page.fill(
    ".hy-canvas-agent-input",
    "为“雨夜侦探发现线索”生成分镜：做 1 个分镜，创建一个文本节点写画面描述，并为这个分镜创建一个 ai-image 节点排队生成 1 张关键帧图片"
  );
  await page.dispatchEvent(".hy-canvas-agent-input", "input");
  await page.click(".hy-canvas-agent-send");
  check("storyboard+image message sent", true);

  await page.waitForFunction(() => {
    const controller = window.__huanyingCanvasAgentAssistant;
    return controller.state.streaming === false && /done/.test(String(controller.state.status || ""));
  }, null, { timeout: 180000 });

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
  }, null, { timeout: 180000 });

  const outcome = await page.evaluate(() => {
    const controller = window.__huanyingCanvasAgentAssistant;
    const raw = localStorage.getItem("huanying.canvasAgent.executions.v1");
    let lastExecution = null;
    try {
      const executions = JSON.parse(raw || "{}").executions || [];
      lastExecution = executions[executions.length - 1] || null;
    } catch {}
    const completed = (lastExecution?.timeline || []).filter((event) => event.status === "completed");
    const queuedGenerationNodeIds = [...new Set(completed.flatMap((event) =>
      (event.target && Array.isArray(event.target.nodeIds) ? event.target.nodeIds : [])
    ))];
    const generationEvents = (lastExecution?.timeline || []).filter((event) => {
      const actionType = String(event?.developer?.actionJson?.type || "");
      return actionType === "queue_generation_task" || actionType === "run_prompt_preset_generation";
    });
    const generationResults = generationEvents
      .filter((event) => event.status === "completed")
      .map((event) => ({
        nodeIds: event.nodeIds || [],
        queued: event?.developer?.result?.queuedGenerationNodeIds || [],
        started: event?.developer?.result?.startedGenerationNodeIds || [],
        tasks: (event?.developer?.result?.generationTasks || []).map((task) => ({
          id: task.id,
          status: task.status,
          nodeId: task.nodeId,
        })),
        warnings: event?.developer?.result?.warnings || [],
      }));
    return {
      status: lastExecution?.status,
      matchedSkills: lastExecution?.matchedSkills || [],
      completedCount: completed.length,
      generationEventStatuses: generationEvents.map((event) => event.status),
      queuedGenerationNodeIds,
      generationResults,
    };
  });
  check("execution completed", outcome.status === "completed", JSON.stringify(outcome));
  check(
    "image generation action executed",
    outcome.generationEventStatuses.includes("completed"),
    JSON.stringify(outcome.generationEventStatuses)
  );
  check(
    "matchedSkills present on real path",
    outcome.matchedSkills.length >= 1,
    JSON.stringify(outcome.matchedSkills)
  );
  console.log("generationResults:", JSON.stringify(outcome.generationResults));
  check(
    "real generation queued/started node ids recorded",
    outcome.generationResults.some(
      (entry) => entry.queued.length > 0 || entry.started.length > 0 || entry.tasks.length > 0 || entry.nodeIds.length > 0
    ),
    JSON.stringify(outcome.generationResults)
  );
} finally {
  await browser.close();
  await cleanBackendTestExecutions();
}
const failed = results.filter(([, ok]) => !ok);
console.log(`\nLIVE IMAGE E2E: ${results.length - failed.length} pass / ${failed.length} fail`);
process.exit(failed.length ? 1 : 0);
