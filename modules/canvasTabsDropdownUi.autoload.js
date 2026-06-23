// 画布切换器下拉化（liblib 式交互）：chip 显示当前画布名，点击展开面板。
// 仅负责开合状态与当前名同步；切换/改名/关闭画布仍由既有 CanvasTabManager 处理。
// 移除本文件 + index.html 对应 script 标签即整体回退为原横排标签。
(function () {
  const wrap = document.getElementById("canvasTabsWrap");
  const tabs = document.getElementById("canvasTabs");
  if (!wrap || !tabs) return;
  wrap.classList.add("hy-tabs-dd");

  function currentName() {
    const act = tabs.querySelector(".canvas-tab.active .canvas-tab-name");
    const name = act ? (act.textContent || "").trim() : "";
    return name || "画布";
  }
  function sync() {
    wrap.setAttribute("data-current", currentName());
  }
  new MutationObserver(sync).observe(tabs, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class"],
  });
  sync();

  function close() {
    wrap.classList.remove("is-open");
  }
  wrap.addEventListener("click", (e) => {
    if (!wrap.classList.contains("is-open")) {
      // 关闭态: 点击 chip(伪元素命中 wrap 本体)展开
      if (e.target === wrap) wrap.classList.add("is-open");
      return;
    }
    const tab = e.target.closest(".canvas-tab");
    // 点击非激活画布 = 切换, 让既有处理器先执行再收起;
    // 点击激活画布保持展开(保留双击改名入口)
    if (tab && !tab.classList.contains("active")) setTimeout(close, 60);
    if (e.target.closest(".canvas-tab-add")) setTimeout(close, 80);
  });
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
})();
