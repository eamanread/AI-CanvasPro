// 统一侧抽屉（D1=B）：右侧停靠，tab = 画布 / 资产 / 工作流。
// - 画布 tab：实时节点列表（graphStore 取节点 + subscribe 更新），行=类型图标+名称，点击 v2FocusOnNode 跳转。
// - 资产 / 工作流 tab：复用既有 btnAssets / btnWorkflows 面板，CSS 右停靠对齐。
// - 与 PI 助手面板互斥（D2）。开=右侧滑入，关=向右滑出。
// 回退：删本文件 + index.html 一行 script + theme-upgrade.css [S7] 区块。
import { graphStore } from "../src/core/stores/appStore.js";
import { saveProject, resolveCanvasData } from "../services/projectService.js";
import { filterByName, sortSavedByMtime, buildSingleCanvasSnapshot, selectTempCanvases, findOverwriteTarget } from "./myCanvases/myCanvasesLogic.js";
import { listSavedProjects, loadSavedProjectRaw, deleteSavedProject, renameProjectOnServer } from "./myCanvases/api.js";
import { confirmDialog, namePrompt } from "./myCanvases/dialog.js";

(function () {
  if (document.getElementById("hy-unified-drawer")) return;

  // ---------- 类型 → 图标（沿用 index.html nodeMenu 图标族） ----------
  const SVG = {
    text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>',
    audio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    storyboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="14" x2="21" y2="14"/><line x1="8" y1="4" x2="8" y2="20"/></svg>',
    panorama: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.6 3.5 5.4 3.5 8.5S14.4 17.9 12 20.5"/><path d="M12 3.5C9.6 6.1 8.5 8.9 8.5 12s1.1 5.9 3.5 8.5"/></svg>',
    group: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="14" height="11" rx="2"/><rect x="7" y="3" width="14" height="11" rx="2"/></svg>',
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v12l-4 4H4z"/><path d="M16 20v-4h4"/></svg>',
    dot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/></svg>',
  };
  function iconFor(type) {
    const t = String(type || "");
    if (/storyboard/.test(t)) return SVG.storyboard;
    if (/panorama|360|scene/.test(t)) return SVG.panorama;
    if (/group/.test(t)) return SVG.group;
    if (/comment|note/.test(t)) return SVG.note;
    if (/text/.test(t)) return SVG.text;
    if (/image/.test(t)) return SVG.image;
    if (/video/.test(t)) return SVG.video;
    if (/audio/.test(t)) return SVG.audio;
    return SVG.dot;
  }

  // ---------- 抽屉外壳 ----------
  const drawer = document.createElement("aside");
  drawer.id = "hy-unified-drawer";
  drawer.className = "hy-unified-drawer";
  drawer.setAttribute("aria-hidden", "true");
  drawer.innerHTML =
    '<div class="hy-ud-tabs">' +
    '<button type="button" class="hy-ud-tab" data-tab="mycanvas">我的画布</button>' +
    '<button type="button" class="hy-ud-tab is-active" data-tab="canvas">画布节点</button>' +
    '<button type="button" class="hy-ud-tab" data-tab="asset">资产</button>' +
    '<button type="button" class="hy-ud-tab" data-tab="workflow">工作流</button>' +
    '</div>' +
    '<div class="hy-ud-body">' +
    '<div class="hy-ud-pane" data-pane="mycanvas" hidden>' +
    '<div class="hy-mc-toolbar"><input type="text" class="hy-mc-search" placeholder="搜索画布…"><button type="button" class="hy-mc-newbtn">+ 新建画布</button></div>' +
    '<div class="hy-mc-list"></div>' +
    '</div>' +
    '<div class="hy-ud-pane" data-pane="canvas"><div class="hy-ud-nodelist"></div></div>' +
    '<div class="hy-ud-pane" data-pane="asset" hidden><div class="hy-ud-embed-note">资产面板</div></div>' +
    '<div class="hy-ud-pane" data-pane="workflow" hidden><div class="hy-ud-embed-note">工作流面板</div></div>' +
    '</div>' +
    '<div class="hy-ud-footer">' +
    '<span class="hy-ud-count"></span>' +
    '<button type="button" class="hy-ud-collapse" aria-label="收起抽屉">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>' +
    '</button>' +
    '</div>';
  document.body.appendChild(drawer);

  const nodeListEl = drawer.querySelector(".hy-ud-nodelist");
  const countEl = drawer.querySelector(".hy-ud-count");
  let currentTab = "canvas";

  // ---------- 节点列表渲染 ----------
  function renderNodes() {
    let nodes = [];
    try {
      const st = graphStore.getState();
      nodes = Object.values(st.nodes || {});
    } catch (e) {}
    const frag = document.createDocumentFragment();
    for (const n of nodes) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "hy-ud-node-row";
      row.dataset.nodeId = n.id;
      const icon = document.createElement("span");
      icon.className = "hy-ud-node-icon";
      icon.innerHTML = iconFor(n.type);
      const name = document.createElement("span");
      name.className = "hy-ud-node-name";
      name.textContent = n.name || n.type || "未命名";
      row.appendChild(icon);
      row.appendChild(name);
      row.addEventListener("click", () => {
        if (typeof window.v2FocusOnNode === "function") window.v2FocusOnNode(n.id);
        drawer.querySelectorAll(".hy-ud-node-row.is-active").forEach((r) => r.classList.remove("is-active"));
        row.classList.add("is-active");
      });
      frag.appendChild(row);
    }
    nodeListEl.replaceChildren(frag);
    countEl.textContent = "共 " + nodes.length + " 节点";
  }
  try {
    graphStore.subscribe(() => { if (currentTab === "canvas") renderNodes(); });
  } catch (e) {}
  renderNodes();

  // ---------- 资产/工作流面板复用 ----------
  // 面板惰性创建 + toggle + JS 内联 transform 定位 → 把它 appendChild 进抽屉 pane,
  // 清内联定位让它自然填充 pane(CSS [S7.5] 接管); 短时反复清以对抗混淆 JS 回写。
  function adoptPanel(tab) {
    const cls = tab === "asset" ? "v2-asset-sidebar-panel" : "v2-workflow-sidebar-panel";
    const pane = drawer.querySelector('.hy-ud-pane[data-pane="' + tab + '"]');
    const panel = document.querySelector("." + cls);
    if (!panel || !pane) return;
    panel.classList.add("show");
    if (panel.parentElement !== pane) {
      const note = pane.querySelector(".hy-ud-embed-note");
      if (note) note.remove();
      pane.appendChild(panel);
    }
    // 清内联定位/transform, 让 [S7.5] 的 relative 填充生效
    panel.style.setProperty("position", "relative", "important");
    panel.style.setProperty("inset", "auto", "important");
    panel.style.setProperty("left", "auto", "important");
    panel.style.setProperty("right", "auto", "important");
    panel.style.setProperty("top", "auto", "important");
    panel.style.setProperty("bottom", "auto", "important");
    panel.style.setProperty("transform", "none", "important");
    panel.style.setProperty("width", "100%", "important");
    panel.style.setProperty("height", "100%", "important");
  }
  // 资产面板首次打开时 item 不渲染(appendChild 打断了首次加载), 自动点激活分类触发加载
  function kickAssetCategory() {
    const ap = document.querySelector(".v2-asset-sidebar-panel");
    if (!ap) return;
    if (ap.querySelectorAll(".v2-asset-item").length > 0) return; // 已有 item 不重复
    const active = ap.querySelector(".v2-asset-sidebar-tab.active") || ap.querySelector(".v2-asset-sidebar-tab");
    if (active) active.click();
  }
  function showExternalPanel(tab) {
    const cls = tab === "asset" ? "v2-asset-sidebar-panel" : "v2-workflow-sidebar-panel";
    const btnId = tab === "asset" ? "btnAssets" : "btnWorkflows";
    if (!document.querySelector("." + cls)) {
      const btn = document.getElementById(btnId);
      if (btn) btn.click(); // 惰性创建
    }
    // 多次兜底 adopt(等待创建 + 对抗回写); 资产 tab 兜底触发分类加载 + 刷新计数
    [0, 80, 200, 450, 700].forEach((d) => setTimeout(() => {
      if (currentTab !== tab) return;
      adoptPanel(tab);
      if (tab === "asset") kickAssetCategory();
      updateFooterCount(tab);
    }, d));
  }
  function hideExternalPanels() {
    document.querySelectorAll(".v2-asset-sidebar-panel, .v2-workflow-sidebar-panel").forEach((p) => p.classList.remove("show"));
  }

  // ---------- 预热(需求: 资产抽屉首次打开卡顿) ----------
  // 首开卡顿根因: open() 同步触发 btnAssets.click() 重建整面板 + appendChild 重排 + kick 渲染条目,
  //   全撞在抽屉滑入动画上 → 掉帧。对策: 在 boot loader 仍覆盖屏幕时(模块加载后约 1.2s)静默建好
  //   资产/工作流面板并 adopt 进「关闭态(屏幕外)」抽屉; 临时 guard 规则把面板钉到屏外杜绝旧位置闪烁。
  //   首次真正打开时面板已就绪, 滑入动画主线程空闲 → 顺滑。已预热则后续 adopt/kick 均为 no-op。
  let prewarmed = false;
  function prewarm() {
    if (prewarmed || drawer.classList.contains("is-open")) return;
    if (document.querySelector('.hy-ud-pane[data-pane="asset"] .v2-asset-sidebar-panel')) { prewarmed = true; return; }
    prewarmed = true;
    const guard = document.createElement("style");
    guard.id = "hy-ud-prewarm-guard";
    guard.textContent = ".v2-asset-sidebar-panel,.v2-workflow-sidebar-panel{position:fixed!important;left:-99999px!important;top:0!important;visibility:hidden!important;}";
    document.head.appendChild(guard);
    ["asset", "workflow"].forEach((tab) => {
      const cls = tab === "asset" ? "v2-asset-sidebar-panel" : "v2-workflow-sidebar-panel";
      const btnId = tab === "asset" ? "btnAssets" : "btnWorkflows";
      if (!document.querySelector("." + cls)) { const b = document.getElementById(btnId); if (b) b.click(); }
    });
    let tries = 0;
    const iv = setInterval(() => {
      if (drawer.classList.contains("is-open")) { clearInterval(iv); if (guard.parentElement) guard.remove(); return; }
      adoptPanel("asset"); adoptPanel("workflow"); kickAssetCategory();
      const aReady = document.querySelector('.hy-ud-pane[data-pane="asset"] .v2-asset-sidebar-panel');
      const wReady = document.querySelector('.hy-ud-pane[data-pane="workflow"] .v2-workflow-sidebar-panel');
      if ((aReady && wReady) || tries++ > 40) {
        clearInterval(iv);
        hideExternalPanels(); // 清 show 态, 等真正打开再点亮
        setTimeout(() => { if (guard.parentElement) guard.remove(); }, 60);
      }
    }, 120);
  }

  // ---------- 统一计数 footer(需求4: 节点/资产/工作流 各显示 共N个 + 收起) ----------
  function updateFooterCount(tab) {
    let n = 0, unit = "节点";
    if (tab === "canvas") {
      try { n = Object.keys(graphStore.getState().nodes || {}).length; } catch (e) {}
      unit = "节点";
    } else if (tab === "asset") {
      n = document.querySelectorAll(".v2-asset-sidebar-panel .v2-asset-item").length;
      unit = "资产";
    } else if (tab === "workflow") {
      n = document.querySelectorAll(".v2-workflow-sidebar-panel .v2-workflow-card").length;
      unit = "工作流";
    } else if (tab === "mycanvas") {
      n = __mcTempCount + __mcSavedCount;
      unit = "画布";
    }
    countEl.textContent = "共 " + n + " 个" + unit;
  }

  // ---------- tab 切换 ----------
  function switchTab(tab) {
    currentTab = tab;
    drawer.querySelectorAll(".hy-ud-tab").forEach((t) => t.classList.toggle("is-active", t.dataset.tab === tab));
    drawer.querySelectorAll(".hy-ud-pane").forEach((p) => { p.hidden = p.dataset.pane !== tab; });
    document.body.setAttribute("data-ud-tab", tab);
    if (tab === "mycanvas") {
      hideExternalPanels();
      renderMyCanvases();
    } else if (tab === "canvas") {
      hideExternalPanels();
      renderNodes();
    } else {
      hideExternalPanels();
      showExternalPanel(tab);
      // 面板异步加载, 多次兜底刷新计数
      [120, 300, 600].forEach((d) => setTimeout(() => { if (currentTab === tab) updateFooterCount(tab); }, d));
    }
    updateFooterCount(tab);
  }
  drawer.querySelectorAll(".hy-ud-tab").forEach((t) => {
    t.addEventListener("click", () => switchTab(t.dataset.tab));
  });

  // ---------- 开 / 关（与 PI 面板互斥, D2） ----------
  function closePiPanel() {
    const pi = document.querySelector(".hy-canvas-agent-panel");
    if (pi && getComputedStyle(pi).display !== "none" && !pi.hidden) {
      const closeBtn = pi.querySelector(".hy-canvas-agent-close");
      if (closeBtn) closeBtn.click();
    }
  }
  function open(tab) {
    closePiPanel();
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("hy-ud-open");
    switchTab(tab || currentTab || "canvas");
  }
  function close() {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("hy-ud-open");
    hideExternalPanels();
  }
  function toggle(tab) {
    if (drawer.classList.contains("is-open") && (!tab || tab === currentTab)) close();
    else open(tab);
  }
  drawer.querySelector(".hy-ud-collapse").addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && drawer.classList.contains("is-open")) close(); });

  // ---------- 需求: 抽屉打开后, 点击画布任意位置(抽屉外)即关闭 ----------
  // capture 相位先于画布指针捕获; 不 preventDefault/stopPropagation, 画布交互照常(可同时选中节点)。
  // 排除: 抽屉内部、顶栏开关按钮(否则开抽屉那次点击会立刻关掉)、抽屉派生浮层(资产创建弹窗/分类下拉/
  //   设置弹窗/右键菜单/保存对话框)。
  document.addEventListener("pointerdown", (e) => {
    if (!drawer.classList.contains("is-open")) return;
    const t = e.target;
    if (!t || drawer.contains(t)) return;
    if (t.closest && t.closest("#hy-header-controls")) return;
    if (t.closest && t.closest(".v2-asset-create-panel, .v2-asset-select-dropdown, .settings-overlay, .v2-canvas-ctx-menu, .save-dialog-overlay, .about-dialog, .canvas-proj-dropdown, .hy-mycanvas-dialog")) return;
    close();
  }, true);

  // 预热: 模块加载后约 1.2s(boot loader 仍覆盖屏幕时)静默建好资产/工作流面板, 消除资产抽屉首开卡顿。
  setTimeout(prewarm, 1200);

  // ========== 「我的画布」面板（T5–T13，文档 doc27） ==========
  const MC_ICON = {
    canvas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7"/><rect x="8" y="13" width="8" height="6"/></svg>',
    open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2H3z"/><path d="M3 7l1.5 12h15L21 9"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M5 7l1 13h12l1-13"/><path d="M9 7V4h6v3"/></svg>',
  };
  // canvasId -> filename：本会话内经本面板[保存]过的临时画布（剔出临时区、其 .json 进已保存区）。刷新重置（已与用户确认）。
  const savedTempCanvasMap = new Map();
  let __mcSearch = "";
  let __mcTempCount = 0, __mcSavedCount = 0;
  let __mcRenderToken = 0;
  const mcPane = drawer.querySelector('.hy-ud-pane[data-pane="mycanvas"]');
  const mcListEl = mcPane && mcPane.querySelector(".hy-mc-list");
  const mcSearchEl = mcPane && mcPane.querySelector(".hy-mc-search");
  const mcNewBtn = mcPane && mcPane.querySelector(".hy-mc-newbtn");

  function ctm() { return window.CanvasTabManager; }
  function mcToast(msg, kind) { if (typeof window.showToast === "function") window.showToast(msg, kind || "info"); }
  function mcEl(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function mcRelTime(mtimeSec) {
    const ms = Number(mtimeSec) * 1000;
    if (!Number.isFinite(ms) || ms <= 0) return "";
    const diff = Date.now() - ms, day = 86400000;
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return Math.floor(diff / 60000) + " 分钟前";
    if (diff < day) return Math.floor(diff / 3600000) + " 小时前";
    if (diff < 7 * day) return Math.floor(diff / day) + " 天前";
    try { return new Date(ms).toLocaleDateString("zh-CN"); } catch (e) { return ""; }
  }
  function mcIconBtn(svg, label, onClick) {
    const b = mcEl("button", "hy-mc-act"); b.type = "button"; b.setAttribute("aria-label", label); b.title = label; b.innerHTML = svg;
    b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    return b;
  }
  // 行内改名：name 元素 → 临时 input；回车/失焦提交，Esc 取消。
  function mcStartRename(nameEl, getCur, commit) {
    const input = mcEl("input", "hy-mc-rename-input"); input.type = "text"; input.value = String(getCur() || "");
    nameEl.replaceWith(input); input.focus(); input.select();
    let done = false;
    const finish = (save) => {
      if (done) return; done = true;
      input.removeEventListener("blur", onBlur);
      if (save) commit(input.value); else renderMyCanvases();
    };
    const onBlur = () => finish(true);
    input.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") { ev.preventDefault(); finish(true); }
      else if (ev.key === "Escape") { ev.preventDefault(); finish(false); }
    });
    input.addEventListener("click", (ev) => ev.stopPropagation()); // 改名时点输入框不触发行切换
    input.addEventListener("blur", onBlur);
  }
  // 行交互：单击行=激活/切换该画布(延时去抖,让出双击改名);双击名=改名。操作按钮已 stopPropagation 不冒泡到行。
  function mcWireRow(row, nameEl, opts) {
    row.style.cursor = "pointer";
    let timer = null;
    row.addEventListener("click", (e) => {
      if (e.target.closest && e.target.closest(".hy-mc-act")) return;     // 操作按钮自管
      if (e.target.tagName === "INPUT") return;                            // 改名输入框
      if (timer) { clearTimeout(timer); timer = null; return; }            // 双击前奏 → 取消激活
      timer = setTimeout(() => { timer = null; if (opts.onActivate) opts.onActivate(); }, 250);
    });
    nameEl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      if (timer) { clearTimeout(timer); timer = null; }
      mcStartRename(nameEl, opts.getCur, opts.onRename);
    });
  }

  function mcGroupLabel(t) { return mcEl("div", "hy-mc-group", t); }
  function mcEmpty(t) { return mcEl("div", "hy-mc-empty", t); }
  function mcTempRow(c) {
    const row = mcEl("div", "hy-mc-row" + (c.isCurrent ? " is-current" : ""));
    row.dataset.cid = String(c.id);
    const ico = mcEl("span", "hy-mc-ico"); ico.innerHTML = MC_ICON.canvas; row.appendChild(ico);
    const name = mcEl("span", "hy-mc-name", c.name || "未命名");
    row.appendChild(name);
    if (c.isCurrent) row.appendChild(mcEl("span", "hy-mc-badge", "当前"));
    row.appendChild(mcEl("span", "hy-mc-spacer"));
    row.appendChild(mcIconBtn(MC_ICON.save, "保存为画布", () => mcSaveTemp(c.id, c.name)));
    row.appendChild(mcIconBtn(MC_ICON.trash, "删除", () => mcDeleteTemp(c.id, c.name)));
    mcWireRow(row, name, { onActivate: () => mcSwitchTemp(c.id), getCur: () => c.name || "", onRename: (nv) => mcRenameTemp(c.id, nv, c.name) });
    return row;
  }
  function mcSavedRow(p) {
    const row = mcEl("div", "hy-mc-row hy-mc-saved-row");
    const ico = mcEl("span", "hy-mc-ico"); ico.innerHTML = MC_ICON.folder; row.appendChild(ico);
    const meta = mcEl("div", "hy-mc-meta");
    const name = mcEl("div", "hy-mc-name", p.name || p.filename);
    meta.appendChild(name);
    meta.appendChild(mcEl("div", "hy-mc-time", mcRelTime(p.mtime)));
    row.appendChild(meta);
    row.appendChild(mcIconBtn(MC_ICON.open, "打开", () => mcOpenSaved(p.filename)));
    row.appendChild(mcIconBtn(MC_ICON.trash, "删除", () => mcDeleteSaved(p.filename, p.name || p.filename)));
    mcWireRow(row, name, { onActivate: () => mcOpenSaved(p.filename), getCur: () => p.name || "", onRename: (nv) => mcRenameSaved(p.filename, nv, p.name) });
    return row;
  }

  async function renderMyCanvases() {
    if (!mcListEl) return;
    const token = ++__mcRenderToken;
    const tm = ctm();
    const canvases = tm && Array.isArray(tm._canvases) ? tm._canvases : [];
    const activeId = tm ? tm._activeId : null;
    const temp = selectTempCanvases(canvases, savedTempCanvasMap, activeId);
    let saved = [], savedErr = false;
    try {
      const list = await listSavedProjects();         // 裸 get，错误抛出（区分真空/加载失败）
      if (token !== __mcRenderToken) return;           // 竞态：已有更新渲染
      saved = Array.isArray(list) ? list : [];
    } catch (e) { savedErr = true; console.error("[我的画布] 已保存列表加载失败:", e); }
    if (token !== __mcRenderToken) return;
    const kw = __mcSearch;
    const tempShown = filterByName(temp, kw);
    const savedShown = sortSavedByMtime(filterByName(saved, kw));
    __mcTempCount = temp.length; __mcSavedCount = saved.length;
    const frag = document.createDocumentFragment();
    frag.appendChild(mcGroupLabel("临时画布 · 未保存"));
    if (!tempShown.length) frag.appendChild(mcEmpty(kw ? "无匹配结果" : "暂无未保存画布"));
    else tempShown.forEach((c) => frag.appendChild(mcTempRow(c)));
    frag.appendChild(mcGroupLabel("已保存画布 · 最近在前"));
    if (savedErr) frag.appendChild(mcEmpty("加载失败，请重试"));
    else if (!savedShown.length) frag.appendChild(mcEmpty(kw ? "无匹配结果" : "暂无已保存画布"));
    else savedShown.forEach((p) => frag.appendChild(mcSavedRow(p)));
    mcListEl.replaceChildren(frag);
    if (currentTab === "mycanvas") updateFooterCount("mycanvas");
  }

  // ---- 操作（多数复用 CanvasTabManager / 非吞错 api） ----
  // 单击临时画布行 → 切到该工作区标签(它本就是打开的画布)。
  // 同步把"当前"徽标移到对应行：switchTo 是【同步重活会阻塞主线程~1s】，异步渲染来不及在它之前绘制，
  // 故先同步改 DOM + 让出一帧把徽标画出来，再做阻塞式 switchTo，最后 renderMyCanvases 收口。
  function mcMoveActiveBadge(canvasId) {
    if (!mcListEl) return;
    mcListEl.querySelectorAll('.hy-mc-row:not(.hy-mc-saved-row)').forEach((row) => {
      const isTarget = row.dataset.cid === String(canvasId);
      row.classList.toggle("is-current", isTarget);
      const existing = row.querySelector(".hy-mc-badge");
      if (isTarget && !existing) {
        const name = row.querySelector(".hy-mc-name");
        const badge = mcEl("span", "hy-mc-badge", "当前");
        if (name && name.nextSibling) row.insertBefore(badge, name.nextSibling); else row.appendChild(badge);
      } else if (!isTarget && existing) { existing.remove(); }
    });
  }
  async function mcSwitchTemp(canvasId) {
    const tm = ctm();
    if (!tm || typeof tm.switchTo !== "function") return;
    if (tm._activeId === canvasId) return;        // 已是当前,免重复
    mcMoveActiveBadge(canvasId);                   // 即时反馈
    await new Promise((res) => setTimeout(res, 30)); // 让出一帧绘制徽标,再做阻塞式 switchTo
    await tm.switchTo(canvasId);
    renderMyCanvases();                            // 真实 activeId 收口(顺带刷新已保存区)
  }
  function mcNewCanvas() {
    const tm = ctm();
    if (!tm || typeof tm.addCanvas !== "function") { mcToast("新建失败", "error"); return; }
    tm.addCanvas();
    renderMyCanvases();
  }

  async function mcSaveTemp(canvasId, curName) {
    const tm = ctm();
    if (!tm) { mcToast("保存失败", "error"); return; }
    const name = await namePrompt({ title: "保存画布", defaultValue: curName || "" });
    if (name == null) return;                          // 取消
    const trimmed = String(name).trim();
    if (!trimmed) { mcToast("请输入画布名称", "warn"); return; }
    let savedList = [];
    try { savedList = await listSavedProjects(); } catch (e) { console.warn("[我的画布] 覆盖检测取列表失败,降级处理:", e); }
    const overwrite = findOverwriteTarget(trimmed, savedList);
    if (overwrite) {
      const ok = await confirmDialog({ title: "覆盖同名项目", message: "已存在同名画布「" + overwrite.replace(/\.json$/, "") + "」，保存将覆盖它。继续？", confirmText: "覆盖", danger: true });
      if (!ok) return;
    }
    const snap = typeof tm.getMultiDataSnapshot === "function" ? tm.getMultiDataSnapshot() : null;
    const single = buildSingleCanvasSnapshot(snap, canvasId);
    if (!single) { mcToast("保存失败：找不到该画布", "warn"); return; }
    const prevId = window.currentProjectId, prevName = window.currentProjectName;
    try {
      const result = await saveProject(trimmed, single);
      window.currentProjectId = prevId; window.currentProjectName = prevName; // 复位：单画布另存不劫持全局当前项目指针
      const filename = result && result.filename ? result.filename : (trimmed + ".json");
      savedTempCanvasMap.set(canvasId, filename);
      mcToast("已保存", "success");
      renderMyCanvases();
    } catch (e) {
      window.currentProjectId = prevId; window.currentProjectName = prevName;
      mcToast("保存失败：" + (e && e.message ? e.message : e), "error");
    }
  }

  async function mcDeleteTemp(canvasId, name) {
    const tm = ctm();
    if (!tm) return;
    if (Array.isArray(tm._canvases) && tm._canvases.length <= 1) { mcToast("至少保留一个画布页面", "warn"); return; }
    const ok = await confirmDialog({ title: "删除画布", message: "确定删除画布「" + (name || "未命名") + "」？此操作不可撤销。", confirmText: "删除", danger: true });
    if (!ok) return;
    tm.deleteCanvas(canvasId);                          // 同步、无返回值
    const stillThere = Array.isArray(tm._canvases) && tm._canvases.some((c) => c && c.id === canvasId);
    if (stillThere) { mcToast("删除失败", "error"); return; }
    savedTempCanvasMap.delete(canvasId);
    renderMyCanvases();
  }

  // 打开 = 【追加】（复用 app 现有"打开项目"的非破坏行为）：把该项目的活动画布作为新标签加入工作区并切过去，
  // 未保存的画布【全部原样保留】（绝不替换/删除）。多画布项目只取其活动那一张。打开后该标签归"已保存"。
  async function mcOpenSaved(filename) {
    const tm = ctm();
    if (!tm || typeof tm.addCanvas !== "function") { mcToast("打开失败", "error"); return; }
    let raw;
    try { raw = await loadSavedProjectRaw(filename); } catch (e) { mcToast("打开失败：" + (e && e.message ? e.message : e), "error"); return; }
    if (raw == null) { mcToast("打开失败：项目不存在（请刷新）", "error"); return; }
    const data = resolveCanvasData(raw);
    const canvases = data && Array.isArray(data.canvases) ? data.canvases : [];
    if (!canvases.length) { mcToast("打开失败：项目数据异常", "error"); return; }
    const active = canvases.find((c) => c && String(c.id) === String(data.activeCanvasId)) || canvases[0];
    const projName = String(filename).replace(/\.json$/, "");
    // 工作区已有同名标签 → 切过去；否则新增一张（addCanvas 追加，未保存画布不受影响）。
    let targetId;
    // 按"已从该 .json 打开过"(映射命中)匹配,而非显示名——避免用户手动把草稿改成恰好同名时被 hydrate 覆盖(review)
    const existing = (tm._canvases || []).find((c) => c && savedTempCanvasMap.get(c.id) === filename);
    if (existing && typeof tm.switchTo === "function") {
      await tm.switchTo(existing.id);
      targetId = existing.id;
    } else {
      tm.addCanvas();
      targetId = tm._activeId;
      if (typeof tm.renameCanvas === "function") tm.renameCanvas(targetId, projName);
    }
    if (typeof tm.hydrateActiveCanvasSnapshot === "function") tm.hydrateActiveCanvasSnapshot(active);
    if (typeof tm.renderTabs === "function") tm.renderTabs();
    savedTempCanvasMap.set(targetId, filename);         // 来自已保存 .json → 归"已保存"区（剔出临时）
    window.currentProjectId = filename;
    window.currentProjectName = projName;
    window._v2CurrentFile = projName;
    mcToast("已打开", "success");
    renderMyCanvases();
  }

  async function mcDeleteSaved(filename, name) {
    const ok = await confirmDialog({ title: "删除项目", message: "确定删除已保存画布「" + (name || filename) + "」？此操作不可撤销。", confirmText: "删除", danger: true });
    if (!ok) return;
    try { await deleteSavedProject(filename); } catch (e) { mcToast("删除失败：" + (e && e.message ? e.message : e), "error"); return; }
    for (const [cid, fn] of [...savedTempCanvasMap.entries()]) { if (fn === filename) savedTempCanvasMap.delete(cid); }
    if (window.currentProjectId === filename) { window.currentProjectId = null; window.currentProjectName = null; }
    mcToast("已删除", "success");
    renderMyCanvases();
  }

  function mcRenameTemp(canvasId, newName, oldName) {
    const tm = ctm();
    if (!tm) return;
    const nv = String(newName == null ? "" : newName).trim();
    if (!nv || nv === oldName) { renderMyCanvases(); return; }   // 空/同名 → 不改（恢复显示）
    if (typeof tm.renameCanvas === "function") tm.renameCanvas(canvasId, nv);
    if (typeof tm.renderTabs === "function") tm.renderTabs();    // renameCanvas 不自动 renderTabs
    renderMyCanvases();
  }

  async function mcRenameSaved(filename, newName, oldName) {
    const nv = String(newName == null ? "" : newName).trim();
    if (!nv || nv === oldName) { renderMyCanvases(); return; }
    try {
      const result = await renameProjectOnServer(filename, nv);
      const newFn = result && result.filename ? result.filename : null;
      if (newFn) {
        for (const [cid, fn] of [...savedTempCanvasMap.entries()]) { if (fn === filename) savedTempCanvasMap.set(cid, newFn); }
        if (window.currentProjectId === filename) { window.currentProjectId = newFn; window.currentProjectName = String(newFn).replace(/\.json$/, ""); }
      }
      mcToast("已重命名", "success");
      renderMyCanvases();
    } catch (e) {
      const st = e && e.status;
      if (st === 409) mcToast("重命名失败：已存在同名项目", "warn");
      else if (st === 404) mcToast("重命名失败：项目不存在，请刷新", "warn");
      else mcToast("重命名失败：" + (e && e.message ? e.message : e), "error");
      renderMyCanvases();                                          // 恢复原名显示
    }
  }

  if (mcSearchEl) mcSearchEl.addEventListener("input", () => { __mcSearch = mcSearchEl.value || ""; renderMyCanvases(); });
  if (mcNewBtn) mcNewBtn.addEventListener("click", mcNewCanvas);

  // 对外暴露给顶栏 节点/资产/工作流 按钮
  window.hyUnifiedDrawer = { open, close, toggle, switchTab };
})();
