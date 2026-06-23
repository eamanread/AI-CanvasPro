// Director-brain live E2E: 「导演：...」 command -> QMAI fixture memory ->
// knowledge-card actions -> drawer confirm -> real canvas nodes.
// Requires 8777 started with HY_QMAI_PROJECT_DIR pointing at a QMAI project.
// Usage: node tools/run_canvas_agent_director_e2e.mjs [baseUrl]
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
    if (!id.startsWith("exec_director_") && !id.startsWith("exec_pi-")) continue;
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

  await page.fill(".hy-canvas-agent-input", "导演：按 QMAI 项目铺一版导演计划");
  await page.dispatchEvent(".hy-canvas-agent-input", "input");
  await page.click(".hy-canvas-agent-send");
  check("director command sent", true);

  await page.waitForFunction(() => {
    const drawer = document.querySelector(".hy-canvas-agent-execution-drawer");
    return drawer && drawer.hidden !== true && /导演计划/.test(drawer.textContent || "");
  }, null, { timeout: 60000 });
  check("director plan rendered in the drawer", true);

  const confirmLabel = await page.evaluate(() => {
    const button = document.querySelector(".hy-canvas-agent-execution-action");
    return button ? button.textContent : "";
  });
  check(
    "structural director plan needs no confirmation (auto-executes)",
    confirmLabel !== "确认",
    confirmLabel
  );
  if (confirmLabel === "确认") {
    await page.click(".hy-canvas-agent-execution-action");
  }

  await page.waitForFunction(() => {
    const drawer = document.querySelector(".hy-canvas-agent-execution-drawer");
    return drawer && /执行完成|失败|failed/.test(drawer.textContent || "");
  }, null, { timeout: 60000 });

  const outcome = await page.evaluate(() => {
    const raw = localStorage.getItem("huanying.canvasAgent.executions.v1");
    let lastExecution = null;
    try {
      const executions = JSON.parse(raw || "{}").executions || [];
      lastExecution = executions[executions.length - 1] || null;
    } catch {}
    const completed = (lastExecution?.timeline || []).filter((event) => event.status === "completed");
    return {
      status: lastExecution?.status,
      matchedSkills: lastExecution?.matchedSkills || [],
      completedCount: completed.length,
      nodeIds: [...new Set(completed.flatMap((event) => event.nodeIds || []))],
      blockedBySkill: (lastExecution?.timeline || []).some((event) => event.status === "blocked_by_skill"),
    };
  });
  check("director execution completed", outcome.status === "completed", JSON.stringify(outcome));
  check("matchedSkills carried director", outcome.matchedSkills.includes("director"), JSON.stringify(outcome.matchedSkills));
  check(
    "knowledge-card nodes landed on the real canvas",
    outcome.completedCount >= 1 && outcome.nodeIds.length >= 1,
    JSON.stringify(outcome)
  );
  check("no skill-block on structural actions", outcome.blockedBySkill === false, JSON.stringify(outcome));
} finally {
  await browser.close();
  await cleanBackendTestExecutions();
}
const failed = results.filter(([, ok]) => !ok);
console.log(`\nLIVE DIRECTOR E2E: ${results.length - failed.length} pass / ${failed.length} fail`);
process.exit(failed.length ? 1 : 0);
