// 需求: 把"外部 Web 预设管理器"(window.open 独立窗口)改造为应用内弹窗, 业务逻辑不变。
// 形态: 套 settings-modal 设计范式的弹窗外壳, 主体内嵌同源 iframe 加载现有 /dev/preset-manager.html。
//   preset-manager.js 在 iframe 内照常运行(CRUD/导入导出/BroadcastChannel 同步零改动)。
// 入口: 暴露 window.openPresetManagerModal(nodeType); promptPresets.openCustomPresetsManager 优先调它。
// 关闭: × / 点遮罩 / Esc(焦点在弹窗外壳时; 焦点在 iframe 内时 Esc 由浏览器交给 iframe, 故以 × + 遮罩为主)。
// 回退: 删本文件 + index.html 一行 script + theme-upgrade.css [S11] + promptPresets.js 重定向。
(function () {
  if (document.getElementById("hy-preset-mgr-overlay")) return;

  const NODE_LABEL = {
    "ai-image": "图片节点",
    "ai-text": "文字节点",
    "ai-video": "视频节点",
    "ai-audio": "音频节点",
  };

  const overlay = document.createElement("div");
  overlay.id = "hy-preset-mgr-overlay";
  overlay.className = "hy-preset-mgr-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML =
    '<div class="hy-preset-mgr-modal" role="dialog" aria-modal="true" aria-label="提示词预设管理">' +
    '<div class="hy-preset-mgr-header">' +
    '<span class="hy-preset-mgr-title">提示词预设管理</span>' +
    '<span class="hy-preset-mgr-nodetype" id="hy-preset-mgr-nodetype"></span>' +
    '<span class="hy-preset-mgr-spacer"></span>' +
    '<button type="button" class="hy-preset-mgr-close" aria-label="关闭">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
    "</button>" +
    "</div>" +
    '<iframe class="hy-preset-mgr-frame" id="hy-preset-mgr-frame" title="提示词预设管理"></iframe>' +
    "</div>";
  document.body.appendChild(overlay);

  const frame = overlay.querySelector("#hy-preset-mgr-frame");
  const nodeTypeEl = overlay.querySelector("#hy-preset-mgr-nodetype");

  function open(nodeType) {
    const nt = nodeType || "ai-image";
    nodeTypeEl.textContent = NODE_LABEL[nt] || nt;
    // 仅当目标节点类型变化时重载 iframe, 否则保留已加载状态
    const src = "/dev/preset-manager.html?nodeType=" + encodeURIComponent(nt);
    if (frame.getAttribute("src") !== src) frame.setAttribute("src", src);
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
  }
  function close() {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
  }

  overlay.querySelector(".hy-preset-mgr-close").addEventListener("click", close);
  // 点遮罩(弹窗主体之外)关闭; iframe 内点击不冒泡到此, 故只命中背景
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("is-open")) close();
  });
  // Esc 桥接: 焦点在 iframe 内时, 由内嵌页同源 postMessage 通知关闭(#2)
  window.addEventListener("message", (e) => {
    if (
      e.origin === window.location.origin &&
      e.data &&
      e.data.type === "hy-preset-mgr-close" &&
      overlay.classList.contains("is-open")
    ) {
      close();
    }
  });

  window.openPresetManagerModal = open;
  window.closePresetManagerModal = close;
})();
