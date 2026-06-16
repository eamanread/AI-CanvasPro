// 统一侧抽屉（D1=B）：右侧停靠，tab = 画布 / 资产 / 工作流。
// - 画布 tab：实时节点列表（graphStore 取节点 + subscribe 更新），行=类型图标+名称，点击 v2FocusOnNode 跳转。
// - 资产 / 工作流 tab：复用既有 btnAssets / btnWorkflows 面板，CSS 右停靠对齐。
// - 与 PI 助手面板互斥（D2）。开=右侧滑入，关=向右滑出。
// 回退：删本文件 + index.html 一行 script + theme-upgrade.css [S7] 区块。
import { graphStore } from "../src/core/stores/appStore.js";

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
    '<button type="button" class="hy-ud-tab is-active" data-tab="canvas">画布节点</button>' +
    '<button type="button" class="hy-ud-tab" data-tab="asset">资产</button>' +
    '<button type="button" class="hy-ud-tab" data-tab="workflow">工作流</button>' +
    '</div>' +
    '<div class="hy-ud-body">' +
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
    }
    countEl.textContent = "共 " + n + " 个" + unit;
  }

  // ---------- tab 切换 ----------
  function switchTab(tab) {
    currentTab = tab;
    drawer.querySelectorAll(".hy-ud-tab").forEach((t) => t.classList.toggle("is-active", t.dataset.tab === tab));
    drawer.querySelectorAll(".hy-ud-pane").forEach((p) => { p.hidden = p.dataset.pane !== tab; });
    document.body.setAttribute("data-ud-tab", tab);
    if (tab === "canvas") {
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
    if (t.closest && t.closest(".v2-asset-create-panel, .v2-asset-select-dropdown, .settings-overlay, .v2-canvas-ctx-menu, .save-dialog-overlay, .about-dialog, .canvas-proj-dropdown")) return;
    close();
  }, true);

  // 预热: 模块加载后约 1.2s(boot loader 仍覆盖屏幕时)静默建好资产/工作流面板, 消除资产抽屉首开卡顿。
  setTimeout(prewarm, 1200);

  // 对外暴露给顶栏 节点/资产/工作流 按钮
  window.hyUnifiedDrawer = { open, close, toggle, switchTab };
})();
