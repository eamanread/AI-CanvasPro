// Phase D · D9 — central string table for the launch-chip / living-contract-card
// UI (PRD §4.1: collect user-facing text in one place for translation-readiness).
//
// Scope: the strings the PANEL renders for the launch feature. Provider chip
// labels (导演/成片/定妆/换拍法) intentionally stay in their provider module
// (vimaxLaunchProvider.js) — a provider owns its own vocabulary. This table is
// the i18n layer, NOT the AC8-gated generic logic layer (the AC8 grep covers
// launchProviderRegistry.js / launchContract.js, never this file), so it may name
// the (single, this-phase) ViMax flow it serves.

export const LAUNCH_STRINGS = Object.freeze({
  offerTitle: "继续创作",
  offerSummary: "选择启动方式",
  contractConfirm: "确认开始",
  contractCancel: "取消",
  flowSeparator: " → ",
  costFree: "规划免费",
  updatedBadge: "已更新",
  // D4 paused living card (ViMax director flow):
  pausedTitle: "导演规划 · 已暂停",
  resumeLabel: "继续",
  resumeAria: "继续分镜",
  cancelLabel: "取消",
  cancelAria: "取消导演规划",
});

// Step-row labels for the paused card's story/cast/storyboard progress.
export const LAUNCH_STEP_LABELS = Object.freeze({
  story: "故事",
  cast: "角色表",
  storyboard: "分镜表",
  render: "成片",
  portraits: "定妆",
});

export function launchStepLabel(stage) {
  return LAUNCH_STEP_LABELS[stage] || String(stage || "");
}

export function launchContractNodesText(nodeCount) {
  return `将生成 ${Number(nodeCount) || 0} 个节点`;
}

// Contract-preview cost line (before confirm): estimated => 约 N 张.
export function launchPreviewCostText(cost = {}) {
  if (cost.tier !== "confirm") return LAUNCH_STRINGS.costFree;
  const n = cost.drawCount ?? "?";
  return cost.estimated ? `需出图 · 约 ${n} 张(以规划为准)` : `需出图 · ${n} 张`;
}

// D7 running cost row (after confirm): 约 N 张(规划中) flips to the real N.
export function launchRunningCostText(cost = {}) {
  if (cost.tier !== "confirm") return LAUNCH_STRINGS.costFree;
  const n = cost.drawCount ?? "?";
  return cost.estimated ? `成片约 ${n} 张(规划中)` : `成片 ${n} 张`;
}
