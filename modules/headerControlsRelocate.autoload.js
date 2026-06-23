// 顶栏控件迁移（需求1+3+5）：把左下控件 + 左侧悬浮栏功能搬进顶栏一行，删悬浮栏。
// 顺序：开关小地图 · 网格对齐 · 黑夜模式 · 适应画布 · 画布百分比 · 设置 · 节点 · 资产 · 工作流
// 节点/资产/工作流 → 打开统一抽屉对应 tab（window.hyUnifiedDrawer）。
// 回退：删本文件 + index.html 一行 script + theme-upgrade.css [S7]。
import { graphStore } from "../src/core/stores/appStore.js";

(function () {
  const header = document.querySelector(".header");
  const tabsWrap = document.getElementById("canvasTabsWrap");
  if (!header || document.getElementById("hy-header-controls")) return;

  // 修复(需求): 第一个名字 = 镜像当前画布名; 点击可编辑; 提交时重命名画布 →
  // 第二个名字(切换器)经 [S4.9] 自动跟随。两名字始终一致。
  const projectNameEl = document.querySelector(".project-name");
  const projectNameText = document.getElementById("projectNameText");
  if (projectNameEl && projectNameText) {
    const canvasTabs = document.getElementById("canvasTabs");
    function activeCanvasName() {
      const el = document.querySelector(".canvas-tab.active .canvas-tab-name") ||
                 document.querySelector(".canvas-tab .canvas-tab-name");
      return el ? (el.textContent || "").trim() : "";
    }
    // 镜像: 把第一个名字同步为当前画布名(编辑中不覆盖)
    function syncFirstName() {
      if (document.activeElement === projectNameText) return;
      const name = activeCanvasName();
      if (name && projectNameText.textContent !== name) projectNameText.textContent = name;
    }
    // 提交: 编辑第一个名字 → 重命名当前画布(直改 rec.name + renderTabs + 持久化)
    function commitRename() {
      const newName = (projectNameText.textContent || "").trim();
      if (!newName) { syncFirstName(); return; }
      try {
        const ctm = window.CanvasTabManager;
        if (ctm && Array.isArray(ctm._canvases) && ctm._activeId) {
          const rec = ctm._canvases.find((c) => c.id === ctm._activeId);
          if (rec && rec.name !== newName) {
            rec.name = newName;
            if (ctm.renderTabs) ctm.renderTabs();
            if (ctm._markCanvasMetaDirty) ctm._markCanvasMetaDirty(ctm._activeId);
            if (ctm._scheduleWorkspaceMetaCacheSave) ctm._scheduleWorkspaceMetaCacheSave();
          }
        }
      } catch (e) {}
      setTimeout(syncFirstName, 60);
    }
    function grabEditFocus() {
      let tries = 0;
      const grab = () => {
        projectNameText.focus();
        try {
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(projectNameText);
          sel.removeAllRanges();
          sel.addRange(range);
        } catch (e) {}
        if (document.activeElement !== projectNameText && tries++ < 12) requestAnimationFrame(grab);
      };
      requestAnimationFrame(grab);
    }
    projectNameEl.addEventListener("mousedown", (e) => { e.stopPropagation(); }, true);
    projectNameEl.addEventListener("click", (e) => { e.stopPropagation(); grabEditFocus(); });
    projectNameText.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); projectNameText.blur(); }
      else if (e.key === "Escape") { syncFirstName(); projectNameText.blur(); }
    });
    projectNameText.addEventListener("blur", commitRename);
    // 初始同步 + 观察画布 tab 变化(切换/重命名)实时镜像
    if (canvasTabs) {
      new MutationObserver(syncFirstName).observe(canvasTabs, { subtree: true, childList: true, characterData: true, attributes: true });
    }
    [200, 600, 1200].forEach((d) => setTimeout(syncFirstName, d));
  }

  const cluster = document.createElement("div");
  cluster.id = "hy-header-controls";
  cluster.className = "hy-header-controls";
  // 放在顶栏右上角(.header-right); 无则 append 到 header 并靠右
  const headerRight = header.querySelector(".header-right");
  if (headerRight) headerRight.appendChild(cluster);
  else header.appendChild(cluster);

  function relocate(id) {
    const el = document.getElementById(id);
    if (el) { el.classList.add("hy-hc-btn"); cluster.appendChild(el); }
    return el;
  }
  function makeBtn(cls, title, svg, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "hy-hc-btn " + cls;
    b.title = title;
    b.setAttribute("aria-label", title);
    b.innerHTML = svg;
    b.addEventListener("click", onClick);
    cluster.appendChild(b);
    return b;
  }
  function sep() {
    const s = document.createElement("span");
    s.className = "hy-hc-sep";
    cluster.appendChild(s);
  }

  // 1. 开关小地图  2. 网格对齐 —— 搬迁既有
  relocate("btnMinimap");
  relocate("btnToggleDots");

  // (需求1) 黑夜/白昼模式切换按钮已移除; 主题仍可在 设置→画布底色 切换

  // 4. 适应画布  5. 画布百分比 —— 搬迁既有
  relocate("btnFitAction");
  const zoomControls = document.querySelector(".zoom-controls");
  if (zoomControls) { zoomControls.classList.add("hy-hc-zoom"); cluster.appendChild(zoomControls); }

  // 需求5: 点击百分比 → 输入编辑 → 设置画布缩放(中心保持; getStateRaw 直写 viewport)
  const zoomPercent = document.getElementById("zoomPercent");
  function setZoomPercent(pct) {
    // (需求6) 范围 1~100% → 缩放 0.01~1.0
    const target = Math.max(0.01, Math.min(1, pct / 100));
    let vp;
    try { vp = graphStore.getState().viewport; } catch (e) { return; }
    const z0 = vp && vp.zoom ? vp.zoom : 1;
    const x0 = (vp && typeof vp.x === "number") ? vp.x : 0;
    const y0 = (vp && typeof vp.y === "number") ? vp.y : 0;
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const x1 = cx - (cx - x0) * (target / z0);
    const y1 = cy - (cy - y0) * (target / z0);
    try {
      const raw = graphStore.getStateRaw();
      raw.viewport.x = x1; raw.viewport.y = y1; raw.viewport.zoom = target;
      graphStore.requestRender && graphStore.requestRender();
      graphStore.markViewportPersist && graphStore.markViewportPersist();
    } catch (e) {}
  }
  if (zoomPercent) {
    zoomPercent.style.cursor = "pointer";
    zoomPercent.title = "点击修改缩放比例";
    zoomPercent.addEventListener("click", (e) => {
      e.stopPropagation();
      if (zoomPercent.querySelector("input")) return;
      const cur = parseInt((zoomPercent.textContent || "100").replace(/[^\d]/g, ""), 10) || 100;
      const input = document.createElement("input");
      input.type = "text";
      input.className = "hy-zoom-input";
      input.value = String(cur);
      zoomPercent.textContent = "";
      zoomPercent.appendChild(input);
      input.focus();
      input.select();
      function commit() {
        // (需求6) 范围 1~100 整数; 超界/非整数/空 → 静默不改, 不提示错误
        const raw = (input.value || "").trim();
        const valid = /^\d+$/.test(raw) && Number(raw) >= 1 && Number(raw) <= 100;
        if (valid) setZoomPercent(Number(raw));
        if (input.parentElement === zoomPercent) zoomPercent.textContent = (valid ? Number(raw) : cur) + "%";
      }
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") { ev.preventDefault(); commit(); input.blur(); }
        else if (ev.key === "Escape") { zoomPercent.textContent = cur + "%"; }
      });
      input.addEventListener("blur", commit);
    });
  }

  sep();

  // 6. 设置 —— 搬迁 userAvatar; 点击直开设置弹窗(需求2: 一级菜单, 无下拉)
  const avatarWrap = document.querySelector(".avatar-wrap");
  if (avatarWrap) {
    avatarWrap.classList.add("hy-hc-avatar");
    cluster.appendChild(avatarWrap);
    const userAvatar = document.getElementById("userAvatar");
    if (userAvatar) {
      // 捕获拦截残留原 handler(防双开), 直接触发设置
      userAvatar.addEventListener("click", (e) => {
        e.stopImmediatePropagation();
        e.preventDefault();
        const openSettings = document.getElementById("btnOpenSettings");
        if (openSettings) openSettings.click();
      }, true);
    }
  }

  // 7/8/9. 节点 / 资产 / 工作流 —— 新建, 开统一抽屉
  const ICON_NODE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M10 6.5h4a3 3 0 0 1 3 3V14"/></svg>';
  const ICON_ASSET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>';
  const ICON_FLOW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>';
  function openDrawer(tab) {
    if (window.hyUnifiedDrawer) window.hyUnifiedDrawer.toggle(tab);
  }
  makeBtn("hy-hc-node", "画布节点", ICON_NODE, () => openDrawer("canvas"));
  makeBtn("hy-hc-asset", "资产", ICON_ASSET, () => openDrawer("asset"));
  makeBtn("hy-hc-flow", "工作流", ICON_FLOW, () => openDrawer("workflow"));

  // 删除左侧悬浮栏 + 清空的左下控件簇外壳
  document.body.classList.add("hy-controls-relocated");
})();
