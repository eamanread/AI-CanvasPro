// Canvas Agent execution drawer live UI acceptance (real Chromium via Playwright).
// Usage: node tools/run_canvas_agent_ui_acceptance.mjs [baseUrl]
// Seeds executions under a dedicated projectId and cleans them up afterwards.
import { chromium } from "@playwright/test";

const BASE = process.argv[2] || "http://127.0.0.1:8777";
const PID = "live-accept-ui-8777";
const results = [];
function check(name, ok, detail = "") {
  results.push([name, ok]);
  console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : ` | ${detail}`));
}

async function api(method, path, payload) {
  const response = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

// ---- Idempotent cleanup of any prior seeded data ----
await api("PATCH", "/api/v2/canvas-agent/executions/live-ui-exec-1/status", { status: "completed" });
await api("PATCH", "/api/v2/canvas-agent/executions/live-ui-exec-2/status", { status: "completed" });
await api("DELETE", `/api/v2/canvas-agent/executions?projectId=${PID}&status=completed`);

// ---- Seed backend executions for the panel to import ----
await api("POST", "/api/v2/canvas-agent/executions", {
  id: "live-ui-exec-1",
  projectId: PID,
  title: "Live 验收：可撤销任务",
  status: "paused",
  orchestratorState: { nextActionIndex: 1, pausedAtActionId: "a2", running: false },
  progress: { done: 1, total: 3 },
  drawerState: { visible: true, line1: "Live 验收：可撤销任务", line2: "已暂停" },
  plan: {
    steps: [
      { id: "s1", title: "已执行步骤" },
      { id: "s2", title: "未执行步骤甲" },
      { id: "s3", title: "未执行步骤乙" },
    ],
  },
  actionsByStep: {
    s1: [{ id: "a1", type: "create_node", nodeId: "live-node-1" }],
    s2: [{ id: "a2", type: "create_node", nodeId: "live-node-2" }],
    s3: [{ id: "a3", type: "create_node", nodeId: "live-node-3" }],
  },
});
await api("POST", "/api/v2/canvas-agent/executions/live-ui-exec-1/timeline", {
  id: "live-evt-1",
  stepId: "s1",
  actionId: "a1",
  status: "completed",
  humanSummary: "已生成节点（live 种子）",
  nodeIds: ["live-node-1"],
  canRetry: true,
  canUndo: true,
  inverse: { aiOwned: true, ops: [{ type: "remove_node", nodeId: "live-node-1" }] },
  developer: { actionJson: { id: "a1", type: "create_node", nodeId: "live-node-1", title: "已执行步骤" } },
});
await api("POST", "/api/v2/canvas-agent/executions/live-ui-exec-1/timeline", {
  id: "live-evt-2",
  stepId: "s1",
  actionId: "a1",
  status: "completed",
  humanSummary: "已生成第二个节点（live 种子）",
  nodeIds: ["live-node-9"],
  canRetry: true,
  canUndo: true,
  inverse: { aiOwned: true, ops: [{ type: "remove_node", nodeId: "live-node-9" }] },
  developer: { actionJson: { id: "a1", type: "create_node", nodeId: "live-node-9" } },
});
await api("POST", "/api/v2/canvas-agent/executions", {
  id: "live-ui-exec-2",
  projectId: PID,
  title: "Live 验收：历史海报任务",
  status: "cancelled",
  drawerState: { visible: false, line1: "Live 验收：历史海报任务", line2: "已取消" },
});

// ---- Launch real Chromium ----
const browser = await chromium.launch({
  headless: false,
  executablePath: "C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe",
  args: ["--no-sandbox", "--window-position=40,40"],
});
const page = await browser.newPage({ viewport: { width: 1480, height: 920 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));

try {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => Boolean(window.__huanyingCanvasAgentAssistant), null, { timeout: 45000 });
  check("app boots and assistant installs in real Chromium", true);

  await page.evaluate(() => window.__huanyingCanvasAgentAssistant.open());
  await page.waitForTimeout(400);
  await page.evaluate(async () => {
    const controller = window.__huanyingCanvasAgentAssistant;
    controller.state.loadExecutionHistory?.();
    await controller.state.lastExecutionSyncPromise;
  });
  await page.waitForTimeout(600);

  const drawerVisible = await page.evaluate(() => {
    const drawer = document.querySelector(".hy-canvas-agent-execution-drawer");
    return Boolean(drawer) && drawer.hidden !== true && drawer.textContent.includes("Live 验收：可撤销任务");
  });
  check("drawer shows seeded execution above input", drawerVisible);

  await page.click(".hy-canvas-agent-execution-expand");
  await page.waitForTimeout(300);
  const expandedState = await page.evaluate(() => {
    const drawer = document.querySelector(".hy-canvas-agent-execution-drawer");
    const backdrop = document.querySelector(".hy-canvas-agent-execution-backdrop");
    return {
      expanded: drawer?.getAttribute("aria-expanded"),
      backdropVisible: Boolean(backdrop) && backdrop.hidden !== true,
      planSteps: document.querySelectorAll(".hy-canvas-agent-execution-step").length,
      toggles: document.querySelectorAll(".hy-canvas-agent-execution-step-toggle").length,
      upButtons: document.querySelectorAll(".hy-canvas-agent-execution-step-up").length,
      draggable: document.querySelectorAll('.hy-canvas-agent-execution-step[draggable="true"]').length,
      events: document.querySelectorAll(".hy-canvas-agent-execution-event").length,
    };
  });
  check("expanded drawer renders plan/timeline", expandedState.expanded === "true" && expandedState.planSteps === 3 && expandedState.events >= 2, JSON.stringify(expandedState));
  check("blur backdrop visible when expanded", expandedState.backdropVisible === true);
  check("plan toggles and reorder buttons for unexecuted steps", expandedState.toggles === 2 && expandedState.upButtons === 2 && expandedState.draggable === 2, JSON.stringify(expandedState));

  await page.click('.hy-canvas-agent-execution-step-toggle[data-step-id="s3"]');
  await page.waitForTimeout(400);
  const toggled = await page.evaluate(() => {
    const row = document.querySelector('.hy-canvas-agent-execution-step[data-step-id="s3"]');
    return row ? row.textContent : "";
  });
  check("plan step disable live", toggled.includes("已停用"), toggled);

  await page.click('.hy-canvas-agent-execution-step-up[data-step-id="s3"]');
  await page.waitForTimeout(400);
  const orderAfter = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".hy-canvas-agent-execution-step")).map((row) => row.getAttribute("data-step-id"))
  );
  check("plan step reorder live", JSON.stringify(orderAfter) === JSON.stringify(["s1", "s3", "s2"]), JSON.stringify(orderAfter));
  const backendPlan = await api("GET", `/api/v2/canvas-agent/executions/live-ui-exec-1?projectId=${PID}`);
  const backendOrder = (backendPlan.body?.execution?.plan?.steps || []).map((step) => step.id);
  check("plan reorder synced to backend", JSON.stringify(backendOrder) === JSON.stringify(["s1", "s3", "s2"]), JSON.stringify(backendOrder));

  await page.click('.hy-canvas-agent-execution-event[data-event-id="live-evt-1"]');
  await page.waitForTimeout(200);
  const undoButtons = await page.evaluate(() => ({
    undo: Boolean(document.querySelector(".hy-canvas-agent-execution-detail-undo")),
    undoTo: Boolean(document.querySelector(".hy-canvas-agent-execution-detail-undo-to")),
  }));
  check("撤销此步 and 撤销到这里 render for undoable event", undoButtons.undo && undoButtons.undoTo, JSON.stringify(undoButtons));

  await page.click(".hy-canvas-agent-execution-detail-undo");
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    const controller = window.__huanyingCanvasAgentAssistant;
    await controller.state.lastExecutionSyncPromise;
  });
  const afterUndo = await api("GET", `/api/v2/canvas-agent/executions/live-ui-exec-1?projectId=${PID}`);
  const conflictEvent = (afterUndo.body?.execution?.timeline || []).find((event) => event.status === "undo_conflict");
  check("undo conflict keeps canvas and syncs undo_conflict event", Boolean(conflictEvent), JSON.stringify((afterUndo.body?.execution?.timeline || []).map((e) => e.status)));

  await page.click(".hy-canvas-agent-execution-backdrop");
  await page.waitForTimeout(200);
  const collapsed = await page.evaluate(() => {
    const drawer = document.querySelector(".hy-canvas-agent-execution-drawer");
    return { expanded: drawer?.getAttribute("aria-expanded"), hidden: drawer?.hidden === true };
  });
  check("chat click collapses drawer to status bar", collapsed.expanded === "false" && collapsed.hidden === false, JSON.stringify(collapsed));

  await api("PATCH", "/api/v2/canvas-agent/executions/live-ui-exec-1/status", {
    status: "completed",
    drawerState: { visible: true, line1: "Live 验收：可撤销任务", line2: "执行完成" },
  });
  await page.evaluate(async () => {
    const controller = window.__huanyingCanvasAgentAssistant;
    controller.state.loadExecutionHistory?.();
    await controller.state.lastExecutionSyncPromise;
  });
  await page.waitForTimeout(300);
  await page.click(".hy-canvas-agent-execution-expand");
  await page.waitForTimeout(300);
  const closeLabel = await page.evaluate(() => {
    const button = document.querySelector(".hy-canvas-agent-execution-action");
    return button ? button.textContent : "";
  });
  check("completed execution shows 关闭 button", closeLabel === "关闭", closeLabel);
  await page.click(".hy-canvas-agent-execution-action");
  await page.waitForTimeout(400);
  const historyToggle = await page.evaluate(() => {
    const toggle = document.querySelector(".hy-canvas-agent-execution-history-toggle");
    return toggle ? toggle.textContent : "";
  });
  check("close summary shows 执行历史 entry", historyToggle.includes("执行历史"), historyToggle);

  await page.click(".hy-canvas-agent-execution-history-toggle");
  await page.waitForTimeout(300);
  const beforeFilter = await page.evaluate(
    () => document.querySelectorAll(".hy-canvas-agent-execution-history-item").length
  );
  await page.fill(".hy-canvas-agent-execution-history-search", "海报");
  await page.waitForTimeout(300);
  const afterFilter = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".hy-canvas-agent-execution-history-item")).map((item) => item.textContent)
  );
  check(
    "history search filters items live",
    beforeFilter >= 2 && afterFilter.length >= 1 && afterFilter.every((text) => text.includes("海报")),
    JSON.stringify({ beforeFilter, afterFilter })
  );

  await page.click('.hy-canvas-agent-execution-history-item:has-text("历史海报任务")');
  await page.waitForTimeout(400);
  const reopened = await page.evaluate(() => {
    const line1 = document.querySelector(".hy-canvas-agent-execution-line1");
    return line1 ? line1.textContent : "";
  });
  check("history item reopens execution drawer", reopened.includes("历史海报任务"), reopened);

  check("page errors stayed empty", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
}

// ---- cleanup seeded data ----
await api("PATCH", "/api/v2/canvas-agent/executions/live-ui-exec-1/status", { status: "completed" });
await api("PATCH", "/api/v2/canvas-agent/executions/live-ui-exec-2/status", { status: "completed" });
await api("DELETE", `/api/v2/canvas-agent/executions?projectId=${PID}&status=completed`);
const left = await api("GET", `/api/v2/canvas-agent/executions?projectId=${PID}`);
check("cleanup seeded executions", (left.body?.executions || []).length === 0);

const failed = results.filter(([, ok]) => !ok);
console.log(`\nLIVE UI ACCEPTANCE: ${results.length - failed.length} pass / ${failed.length} fail`);
process.exit(failed.length ? 1 : 0);
