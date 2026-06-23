// 3D导演台·角色机位速切（零侵入 autoload，文档 docs/superpowers/specs/2026-06-12-character-shot-presets-development.md §4/§10/§11）
// 全屏模式：选中人台时右侧竖排自动浮现（贴黑夜/白天按钮下方）。
// 非全屏模式：编辑工具栏注入"固定机位"icon 按钮，点击展开机位下拉（同位置），选中机位即运镜并收起。
// 全屏采用 shell 传送门（shell 被搬运到 body 级 .panorama-scene-browser-fullscreen 容器），
// 因此 nodeId 以 data 戳记随 shell 携带，不依赖 DOM 祖先链。
// 移除本文件 + index.html 对应 script 标签 + theme-upgrade.css 对应区块即整体回退。
import appStore from "../src/core/stores/appStore.js";
import {
  CHARACTER_SHOT_STRIP_HTML,
  CHARACTER_SHOT_TOGGLE_ACTION,
  CHARACTER_SHOT_TOGGLE_BUTTON_HTML,
  extractCharacterShotPresetKey,
} from "../components/panoramaScene/CharacterShotStrip.js";
import { applyPanoramaSceneCharacterShot } from "./panoramaSceneNode/characterShotActions.js";
import {
  isPanoramaSceneNodeType,
  normalizePanoramaSceneState,
} from "./panoramaSceneNode/sceneNode.js";

(function installCharacterShotStrip() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const POLL_MS = 300;
  const SHELL_SELECTOR = ".panorama-scene-shell";
  const STRIP_SELECTOR = ".v2-character-shot-strip";
  const FULLSCREEN_SELECTOR = ".panorama-scene-browser-fullscreen";
  const MODE_TOOLBAR_SELECTOR = ".node-floating-toolbar.v2-panorama-mode-toolbar";
  const TOGGLE_BTN_SELECTOR = `.act-${CHARACTER_SHOT_TOGGLE_ACTION}`;

  function getStateSnapshot() {
    if (typeof appStore?.getStateRaw === "function") return appStore.getStateRaw();
    if (typeof appStore?.getState === "function") return appStore.getState();
    return null;
  }

  function resolveShellNodeId(shell) {
    const host = shell?.closest?.("[data-node-id]");
    const hostId = host?.dataset?.nodeId || host?.id || "";
    if (hostId) {
      if (shell.dataset.shotNodeId !== hostId) shell.dataset.shotNodeId = hostId;
      return hostId;
    }
    return shell?.dataset?.shotNodeId || "";
  }

  function hasSelectedMannequin(node) {
    if (!node || !isPanoramaSceneNodeType(node.type)) return false;
    const sceneState = normalizePanoramaSceneState(node.sceneNode);
    const selection = sceneState.selection || {};
    if (selection.selectedObjectType !== "mannequin" || !selection.selectedObjectId) return false;
    const selectedCount = Array.isArray(selection.selectedObjects) ? selection.selectedObjects.length : 0;
    return selectedCount <= 1;
  }

  function onStripClick(event) {
    const button = event.target?.closest?.("button");
    if (!button) return;
    const presetKey = extractCharacterShotPresetKey(button.className);
    if (!presetKey) return;
    event.preventDefault();
    event.stopPropagation();
    const strip = button.closest(STRIP_SELECTOR);
    const shell = button.closest(SHELL_SELECTOR);
    const nodeId = shell ? resolveShellNodeId(shell) : "";
    if (!nodeId) return;
    const result = applyPanoramaSceneCharacterShot({ nodeId, presetKey, storeInstance: appStore });
    if (!result?.ok) {
      console.warn("[characterShotStrip] preset apply refused:", result?.reason || "unknown");
    }
    // 非全屏的下拉用法：选完即收起；全屏（is-visible 自动态）保持常驻
    if (strip && !shell.closest(FULLSCREEN_SELECTOR)) strip.classList.remove("is-open");
  }

  function stopCanvasGesture(event) {
    event.stopPropagation();
  }

  function ensureStrip(shell) {
    let strip = shell.querySelector(STRIP_SELECTOR);
    if (!strip) {
      const holder = document.createElement("div");
      holder.innerHTML = CHARACTER_SHOT_STRIP_HTML;
      strip = holder.firstElementChild;
      if (!strip) return null;
      strip.addEventListener("pointerdown", stopCanvasGesture);
      strip.addEventListener("dblclick", stopCanvasGesture);
      strip.addEventListener("click", onStripClick);
      shell.appendChild(strip);
    }
    return strip;
  }

  function onToggleClick(event) {
    const button = event.target?.closest?.(TOGGLE_BTN_SELECTOR);
    if (!button || button.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const comp = button.closest(".panorama-scene-component");
    const shell = comp?.querySelector(SHELL_SELECTOR);
    if (!shell) return;
    const strip = ensureStrip(shell);
    if (strip) strip.classList.toggle("is-open");
  }

  function ensureToggleButton(comp) {
    const toolbar = comp.querySelector(MODE_TOOLBAR_SELECTOR);
    if (!toolbar) return null;
    let button = toolbar.querySelector(TOGGLE_BTN_SELECTOR);
    if (!button) {
      const holder = document.createElement("div");
      holder.innerHTML = CHARACTER_SHOT_TOGGLE_BUTTON_HTML;
      button = holder.firstElementChild;
      if (!button) return null;
      button.addEventListener("pointerdown", stopCanvasGesture);
      button.addEventListener("click", onToggleClick);
      toolbar.appendChild(button);
    }
    return button;
  }

  function syncOnce() {
    const state = getStateSnapshot();
    const nodes = state?.nodes;
    if (!nodes) return;

    // 节点内：戳记 shell + 维护"固定机位"按钮
    for (const comp of document.querySelectorAll(".panorama-scene-component")) {
      const shellInNode = comp.querySelector(SHELL_SELECTOR);
      if (shellInNode) resolveShellNodeId(shellInNode);
      const nodeId = shellInNode ? shellInNode.dataset.shotNodeId : "";
      const button = ensureToggleButton(comp);
      if (button) {
        const enabled = Boolean(nodeId) && hasSelectedMannequin(nodes[nodeId]);
        button.disabled = !enabled;
        button.classList.toggle("is-disabled", !enabled);
      }
    }

    // 所有 shell（含被传送到全屏容器的）：同步 strip 可见性
    for (const shell of document.querySelectorAll(SHELL_SELECTOR)) {
      const nodeId = resolveShellNodeId(shell);
      const selected = Boolean(nodeId) && hasSelectedMannequin(nodes[nodeId]);
      const isFullscreen = Boolean(shell.closest(FULLSCREEN_SELECTOR));
      if (selected) {
        const strip = ensureStrip(shell);
        if (!strip) continue;
        strip.classList.add("is-visible");
        strip.classList.toggle("is-fullscreen", isFullscreen);
        if (isFullscreen) strip.classList.remove("is-open");
      } else {
        const strip = shell.querySelector(STRIP_SELECTOR);
        if (strip) {
          strip.classList.remove("is-visible");
          strip.classList.remove("is-open");
        }
      }
    }
  }

  function closeAllDropdowns() {
    for (const strip of document.querySelectorAll(`${STRIP_SELECTOR}.is-open`)) {
      strip.classList.remove("is-open");
    }
  }

  document.addEventListener("click", (event) => {
    if (event.target?.closest?.(STRIP_SELECTOR) || event.target?.closest?.(TOGGLE_BTN_SELECTOR)) return;
    closeAllDropdowns();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAllDropdowns();
  });

  window.setInterval(syncOnce, POLL_MS);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncOnce, { once: true });
  } else {
    syncOnce();
  }
})();
