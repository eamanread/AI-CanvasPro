// 3D导演台·编辑器外壳（P1 导演/机位视角 + P2 场景树+数值检查器，文档 §18）
// 零侵入 autoload：全屏 shell 上挂 顶部模式切换条 / 左场景树 / 右检查器。
// 纯逻辑在 components/panoramaScene/DirectorChrome.js；本文件只做 DOM 渲染 + 事件 + 轮询同步。
// 移除本文件 + index.html 对应 script 标签 + theme-upgrade.css 对应区块即整体回退。
import appStore from "../src/core/stores/appStore.js";
import {
  ASPECT_PRESETS,
  buildMannequinPosePatch,
  computeSafeFrameRect,
  deriveCaptureAspect,
  deriveInspector,
  deriveSceneTree,
  deriveTransformMode,
  filterSceneTree,
  mergeDirectorExt,
  transformModeForHotkey,
  TRANSFORM_MODES,
  deriveSceneGlobal,
  buildSceneDistancePatch,
  sphereYawPatch,
  sphereRadiusPatch,
  skyColorPatch,
  SCENE_DISTANCE_RANGE,
  SPHERE_RADIUS_SCALE_RANGE,
  cameraOrbitFromLookAt,
  resolveCameraLookAtPoint,
  cameraFovPatch,
  cameraLookAtTargetPatch,
  cameraLookAtPointPatch,
  deriveCameraInspector,
  MANNEQUIN_COLOR_HEX,
  toggleVisibilityPatch,
  toggleLockPatch,
  canSelectObject,
  isObjectLocked,
  deriveCameraOptions,
  resolveActiveCameraId,
  cameraPreviewPlaceholderText,
  resolveMannequinLabelsVisible,
  mannequinLabelsVisiblePatch,
  resolveSnapGridEnabled,
  snapGridPatch,
  buildGridSnapPose,
  SNAP_GRID_SIZE,
  resolveGroundOpacity,
  resolveGroundHeight,
  groundOpacityPatch,
  groundHeightPatch,
  GROUND_OPACITY_RANGE,
  GROUND_HEIGHT_RANGE,
  buildTreeContextMenuItems,
  resolveCameraCaptures,
  appendCameraCapturePatch,
  clearCameraCapturesPatch,
  cameraCapturesEmptyText,
  mannequinNamePatch,
} from "../components/panoramaScene/DirectorChrome.js";
import {
  POSE_PARTS,
  POSE_PRESET_KEYS,
  POSE_PRESET_LABELS,
  derivePoseValues,
  buildPoseDofPatch,
  buildPosePresetPatch,
  buildPosePresetPatchWithOverride,
  savePresetOverridePatch,
} from "../components/panoramaScene/characterPose.js";
import {
  activatePanoramaSceneCamera,
  addPanoramaSceneMannequin,
  addPanoramaSceneMannequinGrid,
  applyPanoramaSceneViewCommit,
  capturePanoramaSceneViewport,
  deletePanoramaSceneCamera,
  deleteSelectedPanoramaSceneObject,
  renamePanoramaSceneCamera,
  resetPanoramaSceneView,
  setPanoramaSceneEditing,
  setPanoramaSceneSafeFrameVisible,
  setPanoramaSceneSelection,
  setPanoramaSceneTool,
  updatePanoramaSceneObjectTransform,
} from "./panoramaSceneNode/sceneNodeActions.js";
import {
  isPanoramaSceneNodeType,
  normalizePanoramaSceneState,
} from "./panoramaSceneNode/sceneNode.js";
import { pickLocalImageAndCreatePanoramaBackground } from "./panoramaSceneBgLocalUpload.js";

(function installDirectorChrome() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const POLL_MS = 350;
  const SHELL_SELECTOR = ".panorama-scene-shell";
  const FULLSCREEN_SELECTOR = ".panorama-scene-browser-fullscreen";
  const CHROME_CLASS = "hy-director-chrome";

  function getState() {
    if (typeof appStore?.getStateRaw === "function") return appStore.getStateRaw();
    if (typeof appStore?.getState === "function") return appStore.getState();
    return null;
  }
  function resolveShellNodeId(shell) {
    const host = shell?.closest?.("[data-node-id]");
    const id = host?.dataset?.nodeId || host?.id || "";
    if (id) { if (shell.dataset.shotNodeId !== id) shell.dataset.shotNodeId = id; return id; }
    return shell?.dataset?.shotNodeId || "";
  }
  function sceneOf(node) {
    return node ? normalizePanoramaSceneState(node.sceneNode) : null;
  }
  function stop(e) { e.stopPropagation(); }

  // 编辑器 chrome 激活时隐藏与竞品布局冲突的原生 UI（退出由 header × 接管、日夜角标由检查器天空色替代）。
  // isFullscreen 区分两态：全屏=隐角标（× 退全屏）；内联编辑=【保留角标并抬到 chrome 之上】(节点逃生口：
  // 仍能用角标进全屏/收起)，避免内联开 chrome 后无处可退。原生底部工具栏两态都隐藏(由 .hy-dc-bottombar 接管)。
  function setNativeFullscreenUiHidden(shell, hidden, isFullscreen = true) {
    const fsRoot = shell.closest(FULLSCREEN_SELECTOR);
    const exitBtn = fsRoot && fsRoot.querySelector(".panorama-scene-browser-fullscreen__exit");
    if (exitBtn) exitBtn.style.display = hidden ? "none" : "";
    const corner = shell.querySelector(".v2-panorama-scene-corner-toolbar");
    if (corner) {
      const hideCorner = hidden && isFullscreen; // 仅全屏态隐角标；内联保留
      corner.style.display = hideCorner ? "none" : "";
      corner.style.zIndex = (hidden && !isFullscreen) ? "70" : ""; // 内联：抬到 chrome(z60) 之上，保证可点
    }
    // 原生底部工具栏：隐藏后由我的 .hy-dc-bottombar 接管（仍 .click() 代理其按钮）
    const fixed = (fsRoot || shell).querySelector(".panorama-scene-fixed-toolbar") || document.querySelector(".panorama-scene-fixed-toolbar");
    if (fixed) fixed.style.display = hidden ? "none" : "";
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  // ---- 视图模式（director|camera）：无原生字段，存 shell dataset ----
  function getViewMode(shell) {
    return shell.dataset.directorViewMode === "camera" ? "camera" : "director";
  }
  function applyViewMode(shell, nodeId, mode) {
    shell.dataset.directorViewMode = mode;
    // 始终关原生 3D 安全框（那是固定的丑框，对齐不了用户选的比例——spike B：capture.mode 白名单化）。
    // 取景比例改由自绘 2D 遮罩 .hy-dc-safeframe（updateSafeFrame，按 directorExt.aspect 画干净 letterbox，两视角通用）。
    setPanoramaSceneSafeFrameVisible({ nodeId, visible: false, storeInstance: appStore });
    if (mode === "camera") {
      const node = getState()?.nodes?.[nodeId];
      const scene = sceneOf(node);
      const sel = scene?.selection;
      // 机位选择优先级（复用纯函数 resolveActiveCameraId）：导演侧 dcCameraId（树点机位/下拉刚写的，校验存在）
      // → viewport.activeCameraId → 第 1 个机位。关键修复：机位不能经原生 selection 选中，
      // 以前用 sel.selectedObjectType==="camera"（永假）→ 恒落 cameras[0]，点树里第 2 个机位也只切第 1 个（“点机位无效”）。
      const camId = resolveActiveCameraId(scene, shell.dataset.dcCameraId);
      if (camId) {
        // 有 directorExt 注视/FOV/位置 覆盖 → 用注视点算 sceneView（绕 upsert）；否则走原生机位激活
        const camExt = node?.directorExt?.cameras && node.directorExt.cameras[String(camId)];
        const sv = camExt ? buildCameraSceneView(nodeId, camId) : null;
        if (sv) applyPanoramaSceneViewCommit({ nodeId, sceneView: sv, activeView: "default", activeCameraId: null, storeInstance: appStore });
        else activatePanoramaSceneCamera({ nodeId, cameraId: camId, storeInstance: appStore });
        // 机位视角自动选中该机位 → 右侧显示摄像机检查器（对齐竞品：机位视角下看/调机位参数）；
        // 清原生选中，避免人偶检查器覆盖摄像机检查器。
        shell.dataset.dcCameraId = String(camId);
        if (sel?.selectedObjectId) setPanoramaSceneSelection({ nodeId, objectId: null, storeInstance: appStore });
      }
    } else {
      delete shell.dataset.dcCameraId; // 回导演视角 → 清机位检查器
    }
  }

  // ---- 顶部模式切换条 ----
  function buildModeBar(shell, nodeId) {
    const bar = el("div", "hy-dc-modebar");
    for (const [mode, label] of [["director", "导演视角"], ["camera", "机位视角"]]) {
      const btn = el("button", "hy-dc-mode-btn", label);
      btn.dataset.mode = mode;
      btn.addEventListener("pointerdown", stop);
      btn.addEventListener("click", (e) => { stop(e); applyViewMode(shell, nodeId, mode); refreshChrome(shell, nodeId, true); });
      bar.appendChild(btn);
    }
    return bar;
  }
  function syncModeBar(bar, shell) {
    const mode = getViewMode(shell);
    for (const btn of bar.querySelectorAll(".hy-dc-mode-btn")) {
      btn.classList.toggle("is-active", btn.dataset.mode === mode);
    }
  }

  // ---- 顶栏 header（3D导演台 标题 + 视角切换 + ?× ，对齐竞品布局）----
  const HELP_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .8-1 1.7"/><line x1="12" y1="17" x2="12" y2="17"/></svg>';
  const CLOSE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  function exitFullscreen(shell) {
    // × = 退出全屏：点原生退出按钮或宿主全屏键
    const exitBtn = document.querySelector(".panorama-scene-browser-fullscreen__exit")
      || shell.closest(".panorama-scene-component")?.querySelector("button.act-fullscreen")
      || document.querySelector(".panorama-scene-component button.act-fullscreen");
    if (exitBtn) exitBtn.click();
  }
  // header × 按模式分流：全屏→退出全屏；内联编辑→退出编辑(收起回卡片)。
  // 内联绝不能调 exitFullscreen——它会点 act-fullscreen(切换键)反而【进入】全屏。
  function closeDirectorEditor(shell, nodeId) {
    if (shell.closest(FULLSCREEN_SELECTOR)) { exitFullscreen(shell); return; }
    try { setPanoramaSceneEditing({ nodeId, isEditing: false, storeInstance: appStore }); } catch (_) {}
  }
  function buildHeader(shell, nodeId) {
    const header = el("div", "hy-dc-header");
    header.appendChild(el("div", "hy-dc-header-title", "3D导演台"));
    header.appendChild(buildModeBar(shell, nodeId));
    const actions = el("div", "hy-dc-header-actions");
    const help = el("button", "hy-dc-header-btn"); help.innerHTML = HELP_SVG; help.title = "操作说明";
    help.addEventListener("pointerdown", stop);
    help.addEventListener("click", (e) => { stop(e); const c = help.closest(`.${CHROME_CLASS}`); if (c) c.classList.toggle("is-help-open"); });
    const close = el("button", "hy-dc-header-btn"); close.innerHTML = CLOSE_SVG; close.title = "退出";
    close.addEventListener("pointerdown", stop);
    close.addEventListener("click", (e) => { stop(e); closeDirectorEditor(shell, nodeId); });
    actions.appendChild(help); actions.appendChild(close);
    header.appendChild(actions);
    return header;
  }

  // 操作说明（点顶栏 ? 打开）。默会知识：每节 = 一个操作面 + 1 条「例」。尽量简单明了。
  const HELP_SECTIONS = [
    { t: "两种视角（顶栏切换）", items: [
      "导演视角：自由转动观察——摆人偶、布机位、调场景都在这里做。",
      "机位视角：锁定到某个机位的取景来构图，拖动视口画面不会乱动。",
    ], eg: "点「机位视角」→ 点左侧任一机位，画面立刻切到它所见。" },
    { t: "左侧 · 场景树", items: [
      "列出所有机位与角色；鼠标移到行上，行尾有 👁 显示/隐藏、🔒 锁定。",
      "双击角色名可改名；右键一行有 显示/隐藏、锁定、删除。",
    ], eg: "双击「角色A」改成「主角」，人偶头顶名牌会同步变。" },
    { t: "右侧 · 检查器（随选中对象切换）", items: [
      "不选任何东西 = 3D场景：场景缩放/平移/旋转、全景背景、天空色、角色标签、网格吸附、地面。",
      "选中人偶 = 属性(位置/旋转/缩放/颜色) + 姿势(20 套预设 + 骨骼微调)。",
      "选中机位 = 属性(位置/注视/视野 FOV) + 摄像机截图。",
    ], eg: "选中人偶 → 姿势 → 点「看手机」，人偶立刻摆出该动作。" },
    { t: "底部工具栏（从左到右）", items: [
      "选择、加角色、变换、加机位、取景比例、截图、背景源、全屏。",
    ], eg: "点「取景比例」选 9:16 → 出取景框 → 点「截图」按该比例出图到画布。" },
    { t: "键盘", items: [
      "V 移动、R 旋转、S 缩放。",
      "方向键：选中人偶 = 让人偶水平走动；没选人偶 = 平移镜头/视角。",
    ], eg: "选中人偶按 →，人偶朝右走一步。" },
    { t: "视野 FOV（机位）", items: [
      "数值小 = 聚焦、画面拉近（如 15）；数值大 = 广角、看到更多环境（如 90）。",
    ], eg: "机位视角选中机位，把 FOV 拖到 30，画面更聚焦人物。" },
    { t: "背景", items: [
      "连一个全景图节点到导演台，或用底部「背景源 → 本地上传」。",
    ], eg: "上传一张全景图，场景立刻有了环境背景。" },
  ];
  function buildHelpOverlay() {
    const overlay = el("div", "hy-dc-help");
    const closeHelp = () => { const c = overlay.closest(`.${CHROME_CLASS}`); if (c) c.classList.remove("is-help-open"); };
    const card = el("div", "hy-dc-help-card");
    card.addEventListener("pointerdown", stop);
    const head = el("div", "hy-dc-help-head");
    head.appendChild(el("div", "hy-dc-help-title", "3D 导演台 · 操作说明"));
    const x = el("button", "hy-dc-help-x"); x.innerHTML = CLOSE_SVG; x.title = "关闭";
    x.addEventListener("pointerdown", stop);
    x.addEventListener("click", (e) => { stop(e); closeHelp(); });
    head.appendChild(x);
    card.appendChild(head);
    const body = el("div", "hy-dc-help-body");
    for (const sec of HELP_SECTIONS) {
      const block = el("div", "hy-dc-help-sec");
      block.appendChild(el("div", "hy-dc-help-h", sec.t));
      for (const line of sec.items) block.appendChild(el("div", "hy-dc-help-p", line));
      if (sec.eg) {
        const eg = el("div", "hy-dc-help-eg");
        eg.appendChild(el("span", "hy-dc-help-tag", "例"));
        eg.appendChild(el("span", "hy-dc-help-egtext", sec.eg));
        block.appendChild(eg);
      }
      body.appendChild(block);
    }
    card.appendChild(body);
    overlay.appendChild(card);
    // 点卡片外的遮罩区域关闭
    overlay.addEventListener("pointerdown", stop);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeHelp(); });
    return overlay;
  }

  // ---- 左场景树 ----
  function buildTreePanel(shell, nodeId) {
    const panel = el("div", "hy-dc-panel hy-dc-tree");
    panel.appendChild(el("div", "hy-dc-panel-title", "场景"));
    const search = el("input", "hy-dc-search");
    search.type = "text";
    search.placeholder = "请输入搜索内容";
    search.addEventListener("pointerdown", stop);
    search.addEventListener("input", () => { shell.dataset.dcSearch = search.value; renderTree(panel, shell, nodeId); });
    panel.appendChild(search);
    const list = el("div", "hy-dc-tree-list");
    panel.appendChild(list);
    return panel;
  }
  // F1: 场景树行尾👁/🔒图标 SVG
  const EYE_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 3l18 18"/><path d="M10.6 6.1A10 10 0 0 1 12 6c7 0 10.5 6 10.5 6a17 17 0 0 1-3.4 3.9M6.3 7.9A17 17 0 0 0 1.5 12S5 18 12 18a10 10 0 0 0 3.3-.5"/></svg>';
  const LOCK_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  const UNLOCK_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.4-1.6"/></svg>';

  function renderTree(panel, shell, nodeId) {
    const node = getState()?.nodes?.[nodeId];
    const scene = sceneOf(node);
    const list = panel.querySelector(".hy-dc-tree-list");
    if (!scene || !list) return;
    const ext = node?.directorExt || null;
    const tree = filterSceneTree(deriveSceneTree(scene, ext), shell.dataset.dcSearch || "");
    const mannequinSelId = scene.selection?.selectedObjectType === "mannequin" ? scene.selection.selectedObjectId : null;
    const dcCamId = shell.dataset.dcCameraId || null;
    const sig = JSON.stringify({ tree, mannequinSelId, dcCamId });
    if (list.dataset.sig === sig) return;
    // 行内改名进行中（输入聚焦于树内）→ 不重建，避免吹掉编辑框（仿检查器编辑保护）
    const ae = document.activeElement;
    if (list.contains(ae) && ae.classList && ae.classList.contains("hy-dc-tree-rename")) return;
    list.dataset.sig = sig;
    list.replaceChildren();
    const addRow = (item) => {
      const row = el("div", "hy-dc-tree-row");
      const selected = item.type === "camera" ? String(item.id) === String(dcCamId) : String(item.id) === String(mannequinSelId);
      row.classList.toggle("is-selected", selected);
      row.classList.toggle("is-locked", !!item.locked);
      row.classList.toggle("is-hidden-obj", item.visible === false);
      const icon = el("span", `hy-dc-tree-icon hy-dc-icon-${item.type}`);
      if (item.type === "mannequin" && item.colorHex) icon.style.color = item.colorHex;
      row.appendChild(icon);
      const labelEl = el("span", "hy-dc-tree-label", item.label);
      row.appendChild(labelEl);
      // 人偶：双击标签 → 行内改名（落 directorExt.mannequins[id].name；空串清回派生标签）
      if (item.type === "mannequin") {
        labelEl.addEventListener("dblclick", (e) => {
          stop(e);
          beginInlineRename(shell, nodeId, row, labelEl, item.id);
        });
      }
      // F1: 行尾👁/🔒按钮（不用 pointer-events:none——保留 hover；锁定只在 click handler 拦截）
      const actions = el("span", "hy-dc-tree-actions");
      const eyeBtn = el("button", "hy-dc-tree-iconbtn");
      eyeBtn.type = "button";
      eyeBtn.innerHTML = item.visible === false ? EYE_OFF_SVG : EYE_SVG;
      eyeBtn.title = item.visible === false ? "显示" : "隐藏";
      eyeBtn.classList.toggle("is-off", item.visible === false);
      eyeBtn.addEventListener("pointerdown", stop);
      eyeBtn.addEventListener("click", (e) => {
        stop(e);
        writeDirectorExt(nodeId, toggleVisibilityPatch(item.type, item.id, getNode(nodeId)?.directorExt));
        refreshChrome(shell, nodeId, true);
      });
      const lockBtn = el("button", "hy-dc-tree-iconbtn");
      lockBtn.type = "button";
      lockBtn.innerHTML = item.locked ? LOCK_SVG : UNLOCK_SVG;
      lockBtn.title = item.locked ? "解锁" : "锁定";
      lockBtn.classList.toggle("is-on", !!item.locked);
      lockBtn.addEventListener("pointerdown", stop);
      lockBtn.addEventListener("click", (e) => {
        stop(e);
        writeDirectorExt(nodeId, toggleLockPatch(item.type, item.id, getNode(nodeId)?.directorExt));
        // 锁定后若当前正选中该对象 → 清选（仿 dcCameraId 条件清）
        if (!item.locked) clearSelectionIfLocked(shell, nodeId);
        refreshChrome(shell, nodeId, true);
      });
      actions.appendChild(eyeBtn);
      actions.appendChild(lockBtn);
      row.appendChild(actions);
      // 右键菜单（打组/显示·隐藏/锁定·解锁/删除）
      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        stop(e);
        openTreeContextMenu(shell, nodeId, item, e.clientX, e.clientY);
      });
      row.addEventListener("pointerdown", stop);
      row.addEventListener("click", (e) => {
        stop(e);
        // F1: 锁定对象不可选中（stopPropagation 已拦截，这里再 gate 一次 setSelection）
        if (!canSelectObject(item.type, item.id, getNode(nodeId)?.directorExt)) return;
        if (item.type === "camera") {
          // 机位不可经原生 selection 选中 → 导演侧记 dcCameraId，并清原生选中
          shell.dataset.dcCameraId = item.id;
          setPanoramaSceneSelection({ nodeId, objectType: "mannequin", objectId: null, storeInstance: appStore });
          // 机位视角下点机位 → 视角自动切到该机位（doc17 §1.2）
          if (getViewMode(shell) === "camera") applyViewMode(shell, nodeId, "camera");
        } else {
          delete shell.dataset.dcCameraId;
          setPanoramaSceneSelection({ nodeId, objectType: item.type, objectId: item.id, storeInstance: appStore });
        }
        refreshChrome(shell, nodeId, true);
      });
      list.appendChild(row);
    };
    tree.cameras.forEach(addRow);
    tree.characters.forEach(addRow);
  }

  // 树行行内改名（人偶）：把 label span 换成 input，Enter/blur 提交，Esc 取消。
  // 提交 → writeDirectorExt(mannequins[id].name)（空串清回派生标签）+ refreshChrome。
  function beginInlineRename(shell, nodeId, row, labelEl, mannequinId) {
    if (row.querySelector(".hy-dc-tree-rename")) return; // 已在编辑
    const input = el("input", "hy-dc-tree-rename");
    input.type = "text";
    input.value = labelEl.textContent || "";
    labelEl.style.display = "none";
    row.insertBefore(input, labelEl.nextSibling);
    let committed = false;
    const commit = (save) => {
      if (committed) return;
      committed = true;
      if (save) writeDirectorExt(nodeId, mannequinNamePatch(mannequinId, input.value));
      // 还原 + 重渲（重渲会按新 sig 重建该行；失败兜底恢复 span）
      input.remove();
      labelEl.style.display = "";
      refreshChrome(shell, nodeId, true);
    };
    // 编辑期间拦截行选中/右键/拖拽
    input.addEventListener("pointerdown", stop);
    input.addEventListener("click", stop);
    input.addEventListener("dblclick", stop);
    input.addEventListener("keydown", (e) => {
      stop(e);
      if (e.key === "Enter") { e.preventDefault(); commit(true); }
      else if (e.key === "Escape") { e.preventDefault(); commit(false); }
    });
    input.addEventListener("blur", () => commit(true));
    input.focus();
    input.select();
  }

  // 锁定生效后：若原生选中的人偶被锁，清原生选中；若导演侧机位被锁，清 dcCameraId
  function clearSelectionIfLocked(shell, nodeId) {
    const node = getNode(nodeId);
    const scene = sceneOf(node);
    const ext = node?.directorExt || null;
    const sel = scene?.selection;
    if (sel?.selectedObjectType === "mannequin" && sel.selectedObjectId
        && isObjectLocked("mannequin", sel.selectedObjectId, ext)) {
      setPanoramaSceneSelection({ nodeId, objectType: "mannequin", objectId: null, storeInstance: appStore });
    }
    const dcCamId = shell?.dataset?.dcCameraId;
    if (dcCamId && isObjectLocked("camera", dcCamId, ext)) {
      delete shell.dataset.dcCameraId;
    }
  }

  // ---- 场景树行右键菜单（打组 / 显示·隐藏 / 锁定·解锁 / 删除）----
  // 菜单项装配走纯逻辑 buildTreeContextMenuItems（已单测）；DOM/定位/事件在此。
  // 打组：禁用（无干净建组 action + 成组运行时语义未验证，不伪造）。
  // 删除：人偶=先选中再 deleteSelectedPanoramaSceneObject（删当前选中）；机位=原生无 camera-delete，禁用。
  function closeTreeContextMenu() {
    document.querySelectorAll(".hy-dc-ctx").forEach((m) => m.remove());
  }
  function deleteTreeItem(shell, nodeId, item) {
    if (item.type === "mannequin") {
      // 删人偶：先把它设为当前选中，再删当前选中（原生 deleteSelectedPanoramaSceneObject 删 selection）
      setPanoramaSceneSelection({ nodeId, objectType: "mannequin", objectId: item.id, storeInstance: appStore });
      deleteSelectedPanoramaSceneObject({ nodeId, storeInstance: appStore });
      return true;
    }
    if (item.type === "camera") {
      // 删机位：原生 deletePanoramaSceneCamera（按 cameraId）；若正选中该机位 → 清 dcCameraId
      deletePanoramaSceneCamera({ nodeId, cameraId: item.id, storeInstance: appStore });
      if (shell?.dataset?.dcCameraId === String(item.id)) delete shell.dataset.dcCameraId;
      return true;
    }
    return false;
  }
  function runTreeContextAction(shell, nodeId, item, action) {
    if (action === "toggleVisibility") {
      writeDirectorExt(nodeId, toggleVisibilityPatch(item.type, item.id, getNode(nodeId)?.directorExt));
    } else if (action === "toggleLock") {
      const wasLocked = !!item.locked;
      writeDirectorExt(nodeId, toggleLockPatch(item.type, item.id, getNode(nodeId)?.directorExt));
      if (!wasLocked) clearSelectionIfLocked(shell, nodeId);
    } else if (action === "delete") {
      deleteTreeItem(shell, nodeId, item);
    } else {
      return; // group (disabled) / unknown
    }
    refreshChrome(shell, nodeId, true);
  }
  function openTreeContextMenu(shell, nodeId, item, clientX, clientY) {
    closeTreeContextMenu();
    closeBottomPopups(shell.querySelector(".hy-dc-bottombar"));
    const menu = el("div", "hy-dc-ctx");
    const items = buildTreeContextMenuItems(item);
    for (const mi of items) {
      const disabled = mi.disabled;
      const row = el("button", "hy-dc-ctx-row", mi.label);
      row.type = "button";
      if (disabled) {
        row.classList.add("is-disabled");
        if (mi.devNote) row.title = mi.devNote;
      }
      if (mi.danger) row.classList.add("is-danger");
      row.addEventListener("pointerdown", stop);
      row.addEventListener("click", (e) => {
        stop(e);
        closeTreeContextMenu();
        if (!disabled) runTreeContextAction(shell, nodeId, item, mi.action);
      });
      menu.appendChild(row);
    }
    // 定位到光标（夹在 shell 视口内）
    shell.appendChild(menu);
    const rect = shell.getBoundingClientRect();
    let x = clientX - rect.left;
    let y = clientY - rect.top;
    const mw = menu.offsetWidth || 140;
    const mh = menu.offsetHeight || 160;
    if (x + mw > rect.width) x = Math.max(0, rect.width - mw - 4);
    if (y + mh > rect.height) y = Math.max(0, rect.height - mh - 4);
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    menu.addEventListener("pointerdown", stop);
    menu.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  // ---- 右数值检查器 ----
  // 三轴横排组（对齐竞品：位置/旋转/缩放 各一行 X|Y|Z，轴标在框内左侧）
  function xyzGroup(body, title, defs, step, insp, write) {
    body.appendChild(el("div", "hy-dc-insp-group", title));
    const row = el("div", "hy-dc-insp-xyz");
    for (const [key, label] of defs) {
      const cell = el("label", "hy-dc-insp-xyzcell");
      cell.appendChild(el("span", "hy-dc-insp-axis", label));
      const input = el("input", "hy-dc-insp-num");
      input.type = "number"; input.step = step;
      input.value = String(insp.fields[key]);
      input.disabled = !insp.editable;
      input.addEventListener("pointerdown", stop);
      input.addEventListener("change", () => write(key, input.value));
      cell.appendChild(input);
      row.appendChild(cell);
    }
    body.appendChild(row);
  }
  // 三轴横排（通用版，复用角色属性同款 .hy-dc-insp-xyz 布局）：给值-取数 getVal(axis) + 提交 onChange(axis,value)。
  // 用于机位 位置/注视坐标（数据形态是 {x,y,z}，与角色 fields 不同），保持原写回 wiring。
  function xyzAxisGroup(body, title, step, getVal, onChange, disabled) {
    body.appendChild(el("div", "hy-dc-insp-group", title));
    const row = el("div", "hy-dc-insp-xyz");
    for (const axis of ["x", "y", "z"]) {
      const cell = el("label", "hy-dc-insp-xyzcell");
      cell.appendChild(el("span", "hy-dc-insp-axis", axis.toUpperCase()));
      const input = el("input", "hy-dc-insp-num");
      input.type = "number"; input.step = step;
      input.value = String(getVal(axis));
      input.disabled = !!disabled;
      input.addEventListener("pointerdown", stop);
      input.addEventListener("change", () => onChange(axis, input.value));
      cell.appendChild(input);
      row.appendChild(cell);
    }
    body.appendChild(row);
  }
  function buildInspectorPanel() {
    const panel = el("div", "hy-dc-panel hy-dc-inspector");
    panel.appendChild(el("div", "hy-dc-panel-title hy-dc-insp-title", "属性"));
    panel.appendChild(el("div", "hy-dc-insp-body"));
    return panel;
  }
  function renderInspector(panel, shell, nodeId) {
    const node = getState()?.nodes?.[nodeId];
    const scene = sceneOf(node);
    const body = panel.querySelector(".hy-dc-insp-body");
    const titleEl = panel.querySelector(".hy-dc-insp-title");
    if (!scene || !body) return;
    // 机位选中走导演侧 dcCameraId（原生 selection 不支持 camera）；原生选了人偶则优先人偶
    const nativeMannequin = scene.selection?.selectedObjectType === "mannequin" && scene.selection?.selectedObjectId;
    let dcCamId = shell?.dataset?.dcCameraId || "";
    if (nativeMannequin && dcCamId && shell) { delete shell.dataset.dcCameraId; dcCamId = ""; }
    let insp = null;
    if (nativeMannequin) insp = deriveInspector(scene, node?.directorExt);
    else if (dcCamId) {
      insp = deriveCameraInspector(scene, node?.directorExt, dcCamId);
      if (!insp && shell) delete shell.dataset.dcCameraId;
    }
    const globalModel = insp ? null : deriveSceneGlobal(scene, node?.directorExt);
    // 姿势在 directorExt（不在 insp 模型）→ 姿势 tab 时把 pose 并入签名，否则改了不重渲
    const poseTabActive = insp?.kind === "mannequin" && shell?.dataset?.dcPoseTab === "pose";
    const camTabActive = insp?.kind === "camera" && shell?.dataset?.dcCamTab === "shots";
    const sig = JSON.stringify(
      insp
        ? { insp, tab: poseTabActive ? "pose" : (camTabActive ? "shots" : "props"), pose: poseTabActive ? (node?.directorExt?.mannequins?.[insp.id] || null) : null }
        : { g: globalModel },
    );
    // 编辑中（输入/滑杆/下拉/取色聚焦）时不重渲染，避免打断
    const ae = document.activeElement;
    if (body.contains(ae) && (ae.tagName === "INPUT" || ae.tagName === "SELECT")) return;
    if (body.dataset.sig === sig) return;
    body.dataset.sig = sig;
    body.replaceChildren();
    if (!insp) { titleEl.textContent = "3D场景"; renderSceneGlobal(body, nodeId, globalModel); return; }
    titleEl.textContent = insp.title;

    const nameRow = el("div", "hy-dc-insp-row");
    nameRow.appendChild(el("label", "hy-dc-insp-label", "名称"));
    if (insp.kind === "camera") {
      const nameInput = el("input", "hy-dc-insp-name");
      nameInput.type = "text";
      nameInput.value = insp.label;
      nameInput.addEventListener("pointerdown", stop);
      nameInput.addEventListener("change", () => {
        renamePanoramaSceneCamera({ nodeId, cameraId: insp.id, name: nameInput.value.trim(), storeInstance: appStore });
      });
      nameRow.appendChild(nameInput);
    } else if (insp.kind === "mannequin" && insp.editable) {
      // 人偶名称可编辑（落 directorExt.mannequins[id].name；空串清回派生标签）。镜像机位 name 模式。
      const nameInput = el("input", "hy-dc-insp-name");
      nameInput.type = "text";
      nameInput.value = insp.label;
      nameInput.addEventListener("pointerdown", stop);
      nameInput.addEventListener("change", () => {
        writeDirectorExt(nodeId, mannequinNamePatch(insp.id, nameInput.value));
        refreshChrome(shell, nodeId, true);
      });
      nameRow.appendChild(nameInput);
    } else {
      const nameVal = el("span", "hy-dc-insp-name-readonly", insp.label);
      nameRow.appendChild(nameVal);
    }
    body.appendChild(nameRow);

    if (insp.kind === "mannequin") {
      // 属性 | 姿势 tab（姿势 tab 状态存 shell.dataset.dcPoseTab）
      const poseTab = shell?.dataset?.dcPoseTab === "pose";
      const tabBar = el("div", "hy-dc-tabs");
      for (const [tk, tl] of [["props", "属性"], ["pose", "姿势"]]) {
        const tb = el("button", "hy-dc-tab", tl);
        tb.classList.toggle("is-active", (tk === "pose") === poseTab);
        tb.addEventListener("pointerdown", stop);
        tb.addEventListener("click", (e) => { stop(e); if (tk === "pose") shell.dataset.dcPoseTab = "pose"; else delete shell.dataset.dcPoseTab; renderInspector(panel, shell, nodeId); });
        tabBar.appendChild(tb);
      }
      // tab 插在名称行后、内容前
      body.insertBefore(tabBar, body.children[1] || null);
      if (poseTab) { renderPoseTab(body, nodeId, insp.id); return; }
      // 属性 tab：位置/旋转/缩放 三轴横排 + 统一缩放滑块 + 颜色（对齐竞品角色面板）
      // 写回时从 store 实时重取 fields（避免轮询 re-render 闭包陈旧 → 误重置其他轴）
      const writeXform = (key, value) => {
        const live = deriveInspector(sceneOf(getState()?.nodes?.[nodeId]));
        if (!live || live.kind !== "mannequin" || live.id !== insp.id) return;
        const patch = buildMannequinPosePatch(key, value, live.fields);
        if (patch) updatePanoramaSceneObjectTransform({ nodeId, objectType: "mannequin", objectId: insp.id, pose: patch, storeInstance: appStore });
      };
      xyzGroup(body, "位置", [["posX", "X"], ["posY", "Y"], ["posZ", "Z"]], "0.1", insp, writeXform);
      xyzGroup(body, "旋转", [["rotXDeg", "X"], ["rotYDeg", "Y"], ["rotZDeg", "Z"]], "1", insp, writeXform);
      // 缩放：原生人偶仅支持统一缩放 → XYZ 三轴联动（编辑任一=统一缩放）；真非等比缩放需运行时改造（同姿势活体集成）
      xyzGroup(body, "缩放", [["scale", "X"], ["scale", "Y"], ["scale", "Z"]], "0.01", insp, writeXform);
      body.appendChild(sliderRow("统一缩放", insp.fields.scale, 0.2, 3, 0.01, (v) => writeXform("scale", v)));
      // 颜色：可点选调色板（对齐竞品；人偶 colorKey 为枚举 red/blue/...）
      body.appendChild(el("div", "hy-dc-insp-group", "颜色"));
      const colorRow = el("div", "hy-dc-insp-colors");
      for (const key of Object.keys(MANNEQUIN_COLOR_HEX)) {
        const sw = el("button", "hy-dc-color-sw");
        sw.type = "button"; sw.title = key;
        sw.style.background = MANNEQUIN_COLOR_HEX[key];
        sw.classList.toggle("is-on", insp.colorKey === key);
        sw.addEventListener("pointerdown", stop);
        sw.addEventListener("click", (e) => { stop(e); setMannequinColor(nodeId, insp.id, key); refreshChrome(shell, nodeId, true); });
        colorRow.appendChild(sw);
      }
      body.appendChild(colorRow);
    } else if (insp.kind === "camera") {
      // 摄像机检查器：属性 | 摄像机截图 两 tab（对齐竞品，doc16）。tab 状态存 shell.dataset.dcCamTab。
      const camTab = shell?.dataset?.dcCamTab === "shots" ? "shots" : "props";
      const tabBar = el("div", "hy-dc-tabs");
      for (const [tk, tl] of [["props", "属性"], ["shots", "摄像机截图"]]) {
        const tb = el("button", "hy-dc-tab", tl);
        tb.classList.toggle("is-active", tk === camTab);
        tb.addEventListener("pointerdown", stop);
        tb.addEventListener("click", (e) => { stop(e); if (tk === "shots") shell.dataset.dcCamTab = "shots"; else delete shell.dataset.dcCamTab; renderInspector(panel, shell, nodeId); });
        tabBar.appendChild(tb);
      }
      body.insertBefore(tabBar, body.children[1] || null);

      if (camTab === "shots") {
        renderCameraCaptureGallery(body, shell, nodeId, insp.id);
        return;
      }

      // 属性 tab —— 顺序对齐竞品：预览 → 切换机位 → 位置 → 注视目标 → 注视坐标 → FOV
      const preview = el("div", "hy-dc-cam-preview");
      const previewIcon = el("div", "hy-dc-cam-preview-icon");
      previewIcon.innerHTML = BB_ICON.cam;
      preview.appendChild(previewIcon);
      preview.appendChild(el("div", "hy-dc-cam-preview-text", cameraPreviewPlaceholderText(insp)));
      body.appendChild(preview);

      // 切换机位下拉（>1 机位才显示）
      const scene2 = sceneOf(getNode(nodeId));
      const camOpts = deriveCameraOptions(scene2, resolveActiveCameraId(scene2, shell?.dataset?.dcCameraId));
      if (camOpts.length > 1) {
        body.appendChild(el("div", "hy-dc-insp-group", "切换机位"));
        const switchRow = el("div", "hy-dc-insp-row");
        const camSel = el("select", "hy-dc-insp-sel hy-dc-cam-switch");
        for (const opt of camOpts) {
          const o = document.createElement("option");
          o.value = opt.value; o.textContent = opt.label; camSel.appendChild(o);
        }
        camSel.value = insp.id;
        camSel.addEventListener("pointerdown", stop);
        camSel.addEventListener("change", () => {
          const camId = camSel.value;
          if (!camId) return;
          shell.dataset.dcCameraId = camId;
          const camExt = getNode(nodeId)?.directorExt?.cameras && getNode(nodeId).directorExt.cameras[String(camId)];
          const sv = camExt ? buildCameraSceneView(nodeId, camId) : null;
          if (sv) applyPanoramaSceneViewCommit({ nodeId, sceneView: sv, activeView: "default", activeCameraId: null, storeInstance: appStore });
          else activatePanoramaSceneCamera({ nodeId, cameraId: camId, storeInstance: appStore });
          refreshChrome(shell, nodeId, true);
        });
        switchRow.appendChild(camSel);
        body.appendChild(switchRow);
      }

      // 三轴横排（对齐角色属性 tab 的 hy-dc-insp-xyz；竞品机位 位置/注视坐标 均横排）
      const camXyz3 = (title, getVal, onAxis, step) => {
        body.appendChild(el("div", "hy-dc-insp-group", title));
        const row = el("div", "hy-dc-insp-xyz");
        for (const axis of ["x", "y", "z"]) {
          const cell = el("label", "hy-dc-insp-xyzcell");
          cell.appendChild(el("span", "hy-dc-insp-axis", axis.toUpperCase()));
          const input = el("input", "hy-dc-insp-num");
          input.type = "number"; input.step = step; input.value = String(getVal(axis));
          input.addEventListener("pointerdown", stop);
          input.addEventListener("change", () => { const v = Number(input.value); if (Number.isFinite(v)) onAxis(axis, v); });
          cell.appendChild(input);
          row.appendChild(cell);
        }
        body.appendChild(row);
      };

      // 位置 X|Y|Z
      camXyz3("位置", (a) => insp.position[a], (a, v) => {
        writeDirectorExt(nodeId, { cameras: { [insp.id]: { position: { [a]: v } } } });
        maybeApplyCameraView(nodeId, insp.id);
      }, "0.1");

      // 注视目标（手动/角色）
      body.appendChild(el("div", "hy-dc-insp-group", "注视目标"));
      const tgtRow = el("div", "hy-dc-insp-row");
      const tgtSel = el("select", "hy-dc-insp-sel");
      for (const opt of insp.targetOptions) {
        const o = document.createElement("option"); o.value = opt.value; o.textContent = opt.label; tgtSel.appendChild(o);
      }
      tgtSel.value = insp.lookAtTarget;
      tgtSel.addEventListener("pointerdown", stop);
      tgtSel.addEventListener("change", () => { writeDirectorExt(nodeId, cameraLookAtTargetPatch(insp.id, tgtSel.value)); maybeApplyCameraView(nodeId, insp.id); refreshChrome(shell, nodeId, true); });
      tgtRow.appendChild(tgtSel);
      body.appendChild(tgtRow);

      // 注视坐标 X|Y|Z（仅手动时可编辑）
      if (insp.lookAtTarget === "manual") {
        camXyz3("注视坐标", (a) => insp.lookAtPoint[a], (a, v) => {
          const patch = cameraLookAtPointPatch(insp.id, a, v);
          if (patch) { writeDirectorExt(nodeId, patch); maybeApplyCameraView(nodeId, insp.id); }
        }, "0.1");
      }

      // FOV 滑杆 15–90（对齐竞品）。检查器对外用【水平 FOV】(传感器宽 36mm)：cameraFovPatch/insp.fovDeg 经
      // horizontalFovToFocal/focalToHorizontalFov 换算，焦距[16,135]↔水平[15.2°,96.7°]，整段 15–90 落在合法焦距[18,135]、无死区。
      // 数值越低=焦距越长=越聚焦/画面越近；越高=焦距越短=越广/看到更多环境。桥层仍按焦距渲染(焦距才是真相)。
      // （旧 18–74 是垂直 FOV 的可达区间，标号与竞品不符、且 90 端到不了；水平 FOV 后整段 15–90 真起效。）
      body.appendChild(el("div", "hy-dc-insp-group", "视野角度 (FOV)"));
      body.appendChild(sliderRow(`${insp.fovDeg}° / ${insp.focalLength}mm`, insp.fovDeg, 15, 90, 1, (v) => {
        const patch = cameraFovPatch(insp.id, v);
        const fl = patch && patch.cameras && patch.cameras[insp.id] && patch.cameras[insp.id].focalLength;
        writeDirectorExt(nodeId, patch); // directorExt：检查器显示 + buildCameraSceneView 读取焦距
        setCameraFocalLength(nodeId, insp.id, fl); // 同步 sceneNode 机位焦距（保持机位数据一致）
        maybeApplyCameraView(nodeId, insp.id); // orbit sceneView 现带 fov=focalLengthToFov → 视野实时变窄/变宽
      }));
    }
  }

  // ---- 摄像机截图 gallery（每机位截图列表，状态 directorExt.cameras[id].captures = [dataURL,...]）----
  // 截图：抓取 shell 内 WebGL 画布(preserveDrawingBuffer:true) → toDataURL → push captures。
  // ⚠️ 真机依赖：画布选择器/读回是否成功须设备验证（见报告）；失败则 alert，不静默伪造。
  function findSceneCanvas(shell) {
    // 桥的 WebGL 画布在 shell 内；优先最大的 canvas（排除我们自绘的小 SVG/缩略图非 canvas）
    const canvases = shell.querySelectorAll("canvas");
    let best = null;
    let bestArea = 0;
    canvases.forEach((c) => {
      const a = (c.width || 0) * (c.height || 0);
      if (a > bestArea) { bestArea = a; best = c; }
    });
    return best;
  }
  function captureCameraDataUrl(shell) {
    const canvas = findSceneCanvas(shell);
    if (!canvas) return null;
    try {
      return canvas.toDataURL("image/png");
    } catch (_) {
      return null; // 画布被污染（跨域纹理）或非 readback 画布
    }
  }
  // 发送到画布：把 dataURL 落成真实 source-image 节点。
  // 优先复用原生 capturePanoramaSceneViewport（captureBlob 回调返回 blob → 它存盘+建节点+连画布，
  // 这是已验证的真实落画布链路）；把 dataURL 转 blob 喂进去。
  function dataUrlToBlob(dataUrl) {
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(String(dataUrl || ""));
    if (!m) return null;
    const mime = m[1] || "image/png";
    const isB64 = !!m[2];
    const data = isB64 ? atob(m[3]) : decodeURIComponent(m[3]);
    const buf = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i += 1) buf[i] = data.charCodeAt(i);
    return new Blob([buf], { type: mime });
  }
  function sendCaptureToCanvas(nodeId, dataUrl) {
    const blob = dataUrlToBlob(dataUrl);
    if (!blob) return false;
    // capturePanoramaSceneViewport 接受 captureBlob: async ()=>blob，内部存盘 + 建 source-image 节点 + 连画布
    try {
      capturePanoramaSceneViewport({ nodeId, captureBlob: async () => blob, storeInstance: appStore });
      return true;
    } catch (_) {
      return false;
    }
  }
  // 按 directorExt.aspect 把抓到的整幅 dataURL 裁切到取景比例框（修复 9:16 出宽幅）。
  function cropDataUrlToAspect(dataUrl, nodeId, cb) {
    const img = new Image();
    img.onload = () => {
      try {
        const frame = computeSafeFrameRect(deriveCaptureAspect(getNode(nodeId)), img.width, img.height);
        const sx = frame.full ? 0 : frame.x, sy = frame.full ? 0 : frame.y;
        const sw = frame.full ? img.width : frame.w, sh = frame.full ? img.height : frame.h;
        const cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(sw)); cv.height = Math.max(1, Math.round(sh));
        cv.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
        cb(cv.toDataURL("image/png"));
      } catch (_) { cb(null); }
    };
    img.onerror = () => cb(null);
    img.src = dataUrl;
  }
  // 底栏截图：①先清选中去掉变换 gizmo（人偶身上的空间操作箭头），抓干净画面；
  // ②按取景比例裁切；③落画布节点；④恢复选中。失败兜底原生截图。
  function captureWithAspectToCanvas(shell, nodeId) {
    const scene = sceneOf(getNode(nodeId));
    const sel = scene?.selection;
    const restore = (sel?.selectedObjectType === "mannequin" || sel?.selectedObjectType === "cube") && sel.selectedObjectId
      ? { type: sel.selectedObjectType, id: sel.selectedObjectId } : null;
    const reselect = () => { if (restore) setPanoramaSceneSelection({ nodeId, objectType: restore.type, objectId: restore.id, storeInstance: appStore }); };
    if (restore) setPanoramaSceneSelection({ nodeId, objectType: restore.type, objectId: null, storeInstance: appStore });
    // 等两帧让"无 gizmo"画面渲入绘制缓冲（preserveDrawingBuffer:true）再抓
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const raw = captureCameraDataUrl(shell);
      if (!raw) { clickNativeAction(shell, "capture"); reselect(); return; }
      cropDataUrlToAspect(raw, nodeId, (cropped) => {
        if (!(cropped && sendCaptureToCanvas(nodeId, cropped))) clickNativeAction(shell, "capture");
        reselect();
      });
    }));
  }
  function renderCameraCaptureGallery(body, shell, nodeId, cameraId) {
    body.appendChild(el("div", "hy-dc-insp-group", "摄像机截图"));
    // 截图按钮（抓当前机位视角画布）
    const actRow = el("div", "hy-dc-insp-row hy-dc-cap-actions");
    const shotBtn = el("button", "hy-dc-insp-btn", "截图");
    shotBtn.type = "button";
    shotBtn.addEventListener("pointerdown", stop);
    shotBtn.addEventListener("click", (e) => {
      stop(e);
      const url = captureCameraDataUrl(shell);
      if (!url) { try { window.alert("截图失败：未取到 3D 画布像素（需设备验证）"); } catch (_) {} return; }
      const patch = appendCameraCapturePatch(cameraId, url, getNode(nodeId)?.directorExt);
      if (patch) writeDirectorExt(nodeId, patch);
      refreshChrome(shell, nodeId, true);
    });
    actRow.appendChild(shotBtn);
    body.appendChild(actRow);

    const captures = resolveCameraCaptures(getNode(nodeId)?.directorExt, cameraId);
    if (!captures.length) {
      body.appendChild(el("div", "hy-dc-insp-empty hy-dc-cap-empty", cameraCapturesEmptyText()));
      return;
    }
    const grid = el("div", "hy-dc-cap-grid");
    captures.forEach((url) => {
      const cell = el("div", "hy-dc-cap-thumb");
      const img = document.createElement("img");
      img.src = url; img.loading = "lazy"; img.alt = "";
      cell.appendChild(img);
      grid.appendChild(cell);
    });
    body.appendChild(grid);

    const btnRow = el("div", "hy-dc-insp-row hy-dc-cap-actions");
    const clearBtn = el("button", "hy-dc-insp-btn hy-dc-insp-btn-ghost", "全部清空");
    clearBtn.type = "button";
    clearBtn.addEventListener("pointerdown", stop);
    clearBtn.addEventListener("click", (e) => {
      stop(e);
      writeDirectorExt(nodeId, clearCameraCapturesPatch(cameraId));
      refreshChrome(shell, nodeId, true);
    });
    const sendBtn = el("button", "hy-dc-insp-btn", "发送到画布");
    sendBtn.type = "button";
    sendBtn.addEventListener("pointerdown", stop);
    sendBtn.addEventListener("click", (e) => {
      stop(e);
      const latest = captures[captures.length - 1];
      const ok = sendCaptureToCanvas(nodeId, latest);
      if (!ok) { try { window.alert("发送到画布失败（dataURL 转换或落节点失败）"); } catch (_) {} }
    });
    btnRow.appendChild(clearBtn);
    btnRow.appendChild(sendBtn);
    body.appendChild(btnRow);
  }

  // ---- V3: 机位注视/位置/FOV → orbit sceneView（机位视角时实时套用，绕开 upsert/slot）----
  function buildCameraSceneView(nodeId, cameraId) {
    const node = getNode(nodeId);
    const scene = sceneOf(node);
    const cam = (scene?.cameras || []).find((c) => String(c.id) === String(cameraId));
    if (!cam) return null;
    const ext = (node?.directorExt?.cameras && node.directorExt.cameras[String(cameraId)]) || {};
    const position = ext.position && Number.isFinite(ext.position.x) ? ext.position : cam.position;
    const focalLength = Number.isFinite(ext.focalLength) ? ext.focalLength : cam.focalLength;
    const lookAtPoint = resolveCameraLookAtPoint(ext, scene?.mannequins);
    return cameraOrbitFromLookAt({ position, lookAtPoint, focalLength });
  }
  // 仅当当前在机位视角时，实时套用机位编辑结果（位置/注视/FOV）。
  // 机位视角检测改用视图模式 getViewMode——之前用 scene.capture.showSafeFrame，
  // 但取景比例修复后原生安全框恒关，该信号失效→FOV/位置/注视编辑在机位视角不再生效（本次回归修复）。
  function maybeApplyCameraView(nodeId, cameraId) {
    const ctx = activeDirectorContext();
    if (!ctx || getViewMode(ctx.shell) !== "camera") return;
    // 用 directorExt 位置/注视/焦距 派生 orbit sceneView（现已带 fov）→ 一次提交即得我的取景 + 正确 FOV。
    // （旧版先 activatePanoramaSceneCamera 再覆盖回 default，等于把机位 FOV 立刻抹掉 → FOV 永不变窄。）
    const sv = buildCameraSceneView(nodeId, cameraId);
    if (sv) applyPanoramaSceneViewCommit({ nodeId, sceneView: sv, activeView: "default", activeCameraId: null, storeInstance: appStore });
  }

  // ---- V2: 全局场景检查器（空选中"3D场景"）----
  function sliderRow(label, value, min, max, step, onInput) {
    const row = el("div", "hy-dc-insp-row hy-dc-slider-row");
    row.appendChild(el("label", "hy-dc-insp-label", label));
    const wrap = el("div", "hy-dc-slider-wrap");
    const slider = el("input", "hy-dc-slider");
    slider.type = "range"; slider.min = String(min); slider.max = String(max); slider.step = String(step); slider.value = String(value);
    const num = el("span", "hy-dc-slider-val", String(value));
    slider.addEventListener("pointerdown", stop);
    slider.addEventListener("input", () => { num.textContent = slider.value; onInput(Number(slider.value)); });
    wrap.appendChild(slider); wrap.appendChild(num);
    row.appendChild(wrap);
    return row;
  }
  function toggleRow(label, checked, onChange) {
    const row = el("div", "hy-dc-insp-row");
    row.appendChild(el("label", "hy-dc-insp-label", label));
    const sw = el("button", "hy-dc-toggle");
    sw.type = "button"; sw.setAttribute("role", "switch");
    sw.setAttribute("aria-checked", String(!!checked));
    sw.classList.toggle("is-on", !!checked);
    sw.appendChild(el("span", "hy-dc-toggle-knob"));
    sw.addEventListener("pointerdown", stop);
    sw.addEventListener("click", (e) => {
      stop(e);
      const next = !sw.classList.contains("is-on");
      sw.classList.toggle("is-on", next);
      sw.setAttribute("aria-checked", String(next));
      onChange(next);
    });
    row.appendChild(sw);
    return row;
  }
  function renderSceneGlobal(body, nodeId, g) {
    body.appendChild(el("div", "hy-dc-insp-group", "全景背景"));
    if (g.panorama.hasImage) {
      const thumbRow = el("div", "hy-dc-sg-thumbrow");
      const img = document.createElement("img");
      img.className = "hy-dc-sg-thumb"; img.src = g.panorama.imageUrl; img.loading = "lazy"; img.alt = "";
      thumbRow.appendChild(img);
      thumbRow.appendChild(el("span", "hy-dc-sg-fname", g.panorama.fileName || "已连接全景"));
      body.appendChild(thumbRow);
    } else {
      body.appendChild(el("div", "hy-dc-insp-empty", "未连接全景（连线 360 全景图节点）"));
    }
    const skyRow = el("div", "hy-dc-insp-row");
    skyRow.appendChild(el("label", "hy-dc-insp-label", "天空颜色"));
    const sky = el("input", "hy-dc-sky"); sky.type = "color"; sky.value = g.skyColor;
    sky.addEventListener("pointerdown", stop);
    sky.addEventListener("input", () => writeDirectorExt(nodeId, skyColorPatch(sky.value)));
    skyRow.appendChild(sky);
    skyRow.appendChild(el("span", "hy-dc-insp-hex", g.skyColor));
    body.appendChild(skyRow);

    body.appendChild(el("div", "hy-dc-insp-group", "全景球"));
    body.appendChild(sliderRow("水平旋转", g.sphereYawDeg, 0, 360, 1, (v) => writeDirectorExt(nodeId, sphereYawPatch(v))));
    body.appendChild(sliderRow("球形半径", g.sphereRadiusScale, SPHERE_RADIUS_SCALE_RANGE.min, SPHERE_RADIUS_SCALE_RANGE.max, 0.05, (v) => writeDirectorExt(nodeId, sphereRadiusPatch(v))));

    body.appendChild(el("div", "hy-dc-insp-group", "场景"));
    body.appendChild(sliderRow("场景缩放", g.sceneDistance, SCENE_DISTANCE_RANGE.min, SCENE_DISTANCE_RANGE.max, 0.5, (v) => {
      const sv = sceneOf(getNode(nodeId))?.viewport?.sceneView;
      applyPanoramaSceneViewCommit({ nodeId, sceneView: buildSceneDistancePatch(sv, v), storeInstance: appStore });
    }));

    // —— 场景平移 XYZ（对齐竞品；写 directorExt.sceneTransform.position，运行时叠加到人偶/方块 group）——
    body.appendChild(el("div", "hy-dc-insp-group", "场景平移"));
    const scenePos = getNode(nodeId)?.directorExt?.sceneTransform?.position || { x: 0, y: 0, z: 0 };
    const posRow = el("div", "hy-dc-insp-xyz");
    for (const axis of ["x", "y", "z"]) {
      const cell = el("label", "hy-dc-insp-xyzcell");
      cell.appendChild(el("span", "hy-dc-insp-axis", axis.toUpperCase()));
      const input = el("input", "hy-dc-insp-num");
      input.type = "number"; input.step = "0.1"; input.value = String(Number(scenePos[axis]) || 0);
      input.addEventListener("pointerdown", stop);
      input.addEventListener("change", () => {
        const v = Number(input.value);
        if (Number.isFinite(v)) writeDirectorExt(nodeId, { sceneTransform: { position: { [axis]: v } } });
      });
      cell.appendChild(input);
      posRow.appendChild(cell);
    }
    body.appendChild(posRow);

    // —— 场景旋转 XYZ（度数显示，写 directorExt.sceneTransform.rotation 弧度）——
    body.appendChild(el("div", "hy-dc-insp-group", "场景旋转"));
    const sceneRot = getNode(nodeId)?.directorExt?.sceneTransform?.rotation || { x: 0, y: 0, z: 0 };
    const rotRow = el("div", "hy-dc-insp-xyz");
    for (const axis of ["x", "y", "z"]) {
      const cell = el("label", "hy-dc-insp-xyzcell");
      cell.appendChild(el("span", "hy-dc-insp-axis", axis.toUpperCase()));
      const input = el("input", "hy-dc-insp-num");
      input.type = "number"; input.step = "5";
      input.value = String(Math.round((Number(sceneRot[axis]) || 0) * 180 / Math.PI));
      input.addEventListener("pointerdown", stop);
      input.addEventListener("change", () => {
        const deg = Number(input.value);
        if (Number.isFinite(deg)) writeDirectorExt(nodeId, { sceneTransform: { rotation: { [axis]: (deg * Math.PI) / 180 } } });
      });
      cell.appendChild(input);
      rotRow.appendChild(cell);
    }
    body.appendChild(rotRow);

    // —— 显示开关（对齐竞品 3D场景面板）——
    body.appendChild(el("div", "hy-dc-insp-group", "显示"));
    const ext = getNode(nodeId)?.directorExt;
    const groundOn = g.ground.visible !== false;
    // 地面 toggle → 改 ground.visible（轮询经 deriveSceneGlobal 签名变化重渲，显隐下方滑杆）
    body.appendChild(toggleRow("地面", groundOn, (on) => writeDirectorExt(nodeId, { ground: { visible: on } })));
    // 地面开 → 透明度 + 高度 滑杆（对齐竞品：仅地面 ON 时显示）
    if (groundOn) {
      body.appendChild(sliderRow("透明度", g.ground.opacity, GROUND_OPACITY_RANGE.min, GROUND_OPACITY_RANGE.max, 0.05, (v) => writeDirectorExt(nodeId, groundOpacityPatch(v))));
      body.appendChild(sliderRow("高度", g.ground.height, GROUND_HEIGHT_RANGE.min, GROUND_HEIGHT_RANGE.max, 0.1, (v) => writeDirectorExt(nodeId, groundHeightPatch(v))));
    }
    // F3: 人偶头顶名牌 开关（directorExt.mannequinLabels.visible，运行时 syncMannequinLabels 消费）
    body.appendChild(toggleRow("角色标签", resolveMannequinLabelsVisible(ext), (on) => writeDirectorExt(nodeId, mannequinLabelsVisiblePatch(on))));
    // F4: 网格吸附 开关（directorExt.snapGrid.enabled，拖拽落地时把人偶 X/Z 吸附到网格）
    // 开启时立即吸附当前选中人偶（即时反馈，否则"开了没反应"）
    body.appendChild(toggleRow("网格吸附", resolveSnapGridEnabled(ext), (on) => {
      writeDirectorExt(nodeId, snapGridPatch(on));
      if (on) setTimeout(() => { const c = activeDirectorContext(); if (c) applyGridSnapOnDrop(c.shell, c.nodeId); }, 60);
    }));
  }

  // ---- V4: 角色姿势 tab（预设网格 + 骨骼细调，状态落 directorExt.mannequins[id].pose）----
  function renderPoseTab(body, nodeId, mannequinId) {
    const node = getNode(nodeId);
    const derived = derivePoseValues(node?.directorExt, mannequinId);
    body.appendChild(el("div", "hy-dc-insp-group", "姿势预设"));
    const grid = el("div", "hy-dc-pose-grid");
    for (const k of POSE_PRESET_KEYS) {
      const btn = el("button", "hy-dc-pose-preset", POSE_PRESET_LABELS[k]);
      btn.classList.toggle("is-active", derived.presetKey === k);
      btn.addEventListener("pointerdown", stop);
      btn.addEventListener("click", (e) => {
        stop(e);
        // 套预设：优先项目级 override（用户「更正」过的修正定义），否则种子预设
        const patch = buildPosePresetPatchWithOverride(mannequinId, k, getNode(nodeId)?.directorExt);
        if (patch) writeDirectorExt(nodeId, patch);
      });
      grid.appendChild(btn);
    }
    body.appendChild(grid);

    // 「更正」：把当前细调后的姿势存为该预设的项目级修正定义（种子预设近似 → 用户校正）。
    // 仅当有激活预设时可用（刚套预设后细调最有意义）；无激活预设则禁用。
    const correctRow = el("div", "hy-dc-insp-row hy-dc-pose-correct-row");
    const correctBtn = el("button", "hy-dc-insp-btn hy-dc-pose-correct", "更正");
    correctBtn.type = "button";
    correctBtn.title = "把当前调整后的姿势保存为该预设的修正定义（本项目内生效）";
    const liveDerived = derivePoseValues(getNode(nodeId)?.directorExt, mannequinId);
    const activeKey = typeof liveDerived.presetKey === "string" ? liveDerived.presetKey : null;
    correctBtn.disabled = !activeKey;
    correctBtn.addEventListener("pointerdown", stop);
    correctBtn.addEventListener("click", (e) => {
      stop(e);
      const cur = derivePoseValues(getNode(nodeId)?.directorExt, mannequinId);
      const key = typeof cur.presetKey === "string" ? cur.presetKey : null;
      if (!key) return; // 无激活预设 → no-op
      const patch = savePresetOverridePatch(key, cur.values);
      if (patch) writeDirectorExt(nodeId, patch);
      // 轻量反馈：按钮短暂显示「已更正」
      const prev = correctBtn.textContent;
      correctBtn.textContent = "已更正";
      correctBtn.classList.add("is-done");
      setTimeout(() => { correctBtn.textContent = prev; correctBtn.classList.remove("is-done"); }, 1200);
    });
    correctRow.appendChild(correctBtn);
    body.appendChild(correctRow);
    body.appendChild(el("div", "hy-dc-insp-group", "姿势调节"));
    for (const part of POSE_PARTS) {
      const label = part.side ? `${part.label} · ${part.side}` : part.label;
      body.appendChild(el("div", "hy-dc-pose-part", label));
      for (const dof of part.dofs) {
        const dofKey = `${part.key}.${dof.key}`;
        body.appendChild(sliderRow(dof.label, derived.values[dofKey], dof.min, dof.max, 1, (v) => {
          const patch = buildPoseDofPatch(mannequinId, dofKey, v);
          if (patch) writeDirectorExt(nodeId, patch);
        }));
      }
    }
  }

  // ---- V1: 顶部工具条（变换模式 V/R/S + 取景比例，状态落 ui.transformTool / directorExt.aspect）----
  function getNode(nodeId) { return getState()?.nodes?.[nodeId]; }
  function writeDirectorExt(nodeId, patch) {
    const node = getNode(nodeId);
    const ext = (node && node.directorExt) || {};
    appStore.updateNodeData(nodeId, { directorExt: mergeDirectorExt(ext, patch) });
  }
  // 改人偶 colorKey（无原生 setColor action → 直接写 sceneNode.mannequins[id].colorKey；
  // colorKey 是 sceneNode 白名单字段，normalize 保留；桥 _syncMannequins 引用 colorKey → 重上色）
  function setMannequinColor(nodeId, mannequinId, colorKey) {
    const scene = sceneOf(getNode(nodeId));
    if (!scene || !Array.isArray(scene.mannequins)) return;
    const mannequins = scene.mannequins.map((m) => (String(m.id) === String(mannequinId) ? { ...m, colorKey } : m));
    appStore.updateNodeData(nodeId, { sceneNode: { ...scene, mannequins } });
  }
  // 写机位焦距到 sceneNode 机位（focalLength 是白名单字段），保持机位数据与 directorExt 一致。
  // 视图 FOV 不靠机位激活：orbit sceneView 现带 fov=focalLengthToFov(focal)，桥层 dampScalar 套用（见 cameraOrbitFromLookAt）。
  function setCameraFocalLength(nodeId, cameraId, focalLength) {
    const scene = sceneOf(getNode(nodeId));
    if (!scene || !Array.isArray(scene.cameras) || !Number.isFinite(focalLength)) return;
    const cameras = scene.cameras.map((c) => (String(c.id) === String(cameraId) ? { ...c, focalLength } : c));
    appStore.updateNodeData(nodeId, { sceneNode: { ...scene, cameras } });
  }
  // ---- 底部工具栏（对齐竞品图1：8 图标一条，变换/比例/背景源=弹出菜单，其余代理原生）----
  const BB_ICON = {
    select: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M5 3l14 7-6 2-2 6z"/></svg>',
    char: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="6" r="3"/><path d="M6 21v-2a6 6 0 0 1 12 0v2"/></svg>',
    transform: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v18M3 12h18M12 3l-2 2M12 3l2 2M12 21l-2-2M12 21l2-2M3 12l2-2M3 12l2 2M21 12l-2-2M21 12l-2 2"/></svg>',
    cam: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="13" height="12" rx="2"/><path d="M15 10l6-3v10l-6-3z"/></svg>',
    frame: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/></svg>',
    shot: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.2"/></svg>',
    bg: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 15V8m0 0-2.5 2.5M12 8l2.5 2.5"/></svg>',
    fs: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  };
  // 代理原生底栏按钮（.panorama-scene-fixed-toolbar__btn--<action>，隐藏后 .click() 仍触发 React 处理器）
  function clickNativeAction(shell, action) {
    const sel = `.panorama-scene-fixed-toolbar__btn--${action}`;
    const root = shell.closest(FULLSCREEN_SELECTOR) || shell.closest(".panorama-scene-component") || shell;
    const btn = root.querySelector(sel) || document.querySelector(sel);
    if (btn) { btn.click(); return true; }
    return false;
  }
  function closeBottomPopups(bar) {
    if (!bar) return;
    bar.querySelectorAll(".hy-dc-bb-popup").forEach((p) => p.remove());
    bar.querySelectorAll(".hy-dc-bb-btn.is-open").forEach((b) => b.classList.remove("is-open"));
  }
  function toggleBottomPopup(bar, btn, builder) {
    const wasOpen = btn.classList.contains("is-open");
    closeBottomPopups(bar);
    if (wasOpen) return;
    btn.classList.add("is-open");
    const popup = builder();
    popup.classList.add("hy-dc-bb-popup");
    popup.addEventListener("pointerdown", stop);
    btn.appendChild(popup);
  }
  function buildTransformPopup(shell, nodeId) {
    const m = el("div", "hy-dc-bb-menu");
    for (const t of TRANSFORM_MODES) {
      const row = el("button", "hy-dc-bb-menu-row");
      row.innerHTML = `<span>${t.label}</span><kbd class="hy-dc-bb-kbd">${t.hotkey}</kbd>`;
      if (deriveTransformMode(sceneOf(getNode(nodeId))) === t.key) row.classList.add("is-active");
      row.addEventListener("pointerdown", stop);
      row.addEventListener("click", (e) => { stop(e); setPanoramaSceneTool({ nodeId, tool: t.key, storeInstance: appStore }); closeBottomPopups(shell.querySelector(".hy-dc-bottombar")); refreshChrome(shell, nodeId, true); });
      m.appendChild(row);
    }
    return m;
  }
  function buildAspectPopup(shell, nodeId) {
    const wrap = el("div", "hy-dc-bb-aspectwrap");
    wrap.appendChild(el("div", "hy-dc-bb-aspect-title", "比例"));
    const grid = el("div", "hy-dc-bb-aspect-grid");
    const cur = deriveCaptureAspect(getNode(nodeId));
    for (const p of ASPECT_PRESETS) {
      const cell = el("button", "hy-dc-bb-aspect-cell", p.label);
      if (cur === p.key) cell.classList.add("is-active");
      cell.addEventListener("pointerdown", stop);
      cell.addEventListener("click", (e) => { stop(e); writeDirectorExt(nodeId, { aspect: p.key }); closeBottomPopups(shell.querySelector(".hy-dc-bottombar")); refreshChrome(shell, nodeId, true); });
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
    return wrap;
  }
  // 角色库（对齐竞品素体库；幻映仅有 male/female 真实模型 + 群众网格，不伪造缺失体型）
  function buildCharacterPopup(shell, nodeId) {
    const m = el("div", "hy-dc-bb-menu");
    const items = [
      ["男性素体", () => addPanoramaSceneMannequin({ nodeId, gender: "male", storeInstance: appStore })],
      ["女性素体", () => addPanoramaSceneMannequin({ nodeId, gender: "female", storeInstance: appStore })],
      ["群众 (3×3)", () => addPanoramaSceneMannequinGrid({ nodeId, storeInstance: appStore })],
    ];
    for (const [label, action] of items) {
      const row = el("button", "hy-dc-bb-menu-row"); row.textContent = label;
      row.addEventListener("pointerdown", stop);
      row.addEventListener("click", (e) => { stop(e); try { action(); } catch (_) {} closeBottomPopups(shell.querySelector(".hy-dc-bottombar")); refreshChrome(shell, nodeId, true); });
      m.appendChild(row);
    }
    return m;
  }
  function buildBgPopup(shell, nodeId) {
    const m = el("div", "hy-dc-bb-menu");
    // 背景源 = 连线 360 全景图节点喂入（见检查器"全景背景"）。
    // F5: "本地上传"已接真实链路（建 panorama-360 节点 + 连边 → edge-sync 轮询喂入背景）；
    //     "历史记录""AI生成"仍待接线（明确禁用、不伪造）。
    const items = [
      {
        label: "本地上传",
        enabled: true,
        title: "选本地图片 → 建 360 全景节点 → 连到本导演台",
        onClick: () => { try { pickLocalImageAndCreatePanoramaBackground(nodeId); } catch (_) {} },
      },
      { label: "历史记录", enabled: false, title: "连线 360 全景图节点喂入（接线开发中）" },
      { label: "AI生成", enabled: false, title: "连线 360 全景图节点喂入（接线开发中）" },
    ];
    for (const item of items) {
      const row = el("button", "hy-dc-bb-menu-row"); row.textContent = item.label;
      if (!item.enabled) row.classList.add("is-disabled");
      row.title = item.title;
      row.addEventListener("pointerdown", stop);
      row.addEventListener("click", (e) => {
        stop(e);
        closeBottomPopups(shell.querySelector(".hy-dc-bottombar"));
        if (item.enabled && typeof item.onClick === "function") item.onClick();
      });
      m.appendChild(row);
    }
    return m;
  }
  function buildBottomBar(shell, nodeId) {
    const bar = el("div", "hy-dc-bottombar");
    const add = (key, icon, title, onClick) => {
      const b = el("button", "hy-dc-bb-btn"); b.dataset.bb = key; b.innerHTML = icon; b.title = title;
      b.addEventListener("pointerdown", stop);
      b.addEventListener("click", (e) => { stop(e); onClick(b); });
      bar.appendChild(b);
    };
    add("select", BB_ICON.select, "选择 / 导航", () => { closeBottomPopups(bar); setPanoramaSceneTool({ nodeId, tool: "navigate", storeInstance: appStore }); refreshChrome(shell, nodeId, true); });
    add("char", BB_ICON.char, "添加角色", (b) => toggleBottomPopup(bar, b, () => buildCharacterPopup(shell, nodeId)));
    add("transform", BB_ICON.transform, "变换", (b) => toggleBottomPopup(bar, b, () => buildTransformPopup(shell, nodeId)));
    add("cam", BB_ICON.cam, "添加机位", () => { closeBottomPopups(bar); clickNativeAction(shell, "camera"); });
    add("frame", BB_ICON.frame, "取景比例", (b) => toggleBottomPopup(bar, b, () => buildAspectPopup(shell, nodeId)));
    add("shot", BB_ICON.shot, "截图", () => { closeBottomPopups(bar); captureWithAspectToCanvas(shell, nodeId); });
    add("bg", BB_ICON.bg, "背景源", (b) => toggleBottomPopup(bar, b, () => buildBgPopup(shell, nodeId)));
    add("fs", BB_ICON.fs, "退出全屏", () => { closeBottomPopups(bar); exitFullscreen(shell); });
    return bar;
  }
  function syncBottomBar(bar, nodeId) {
    if (!bar) return;
    const tmode = deriveTransformMode(sceneOf(getNode(nodeId)));
    const tb = bar.querySelector('.hy-dc-bb-btn[data-bb="transform"]');
    if (tb) tb.dataset.tmode = tmode;
  }

  // ---- V1: 自绘取景安全框遮罩（capture.mode 不可承载比例，UI 层自绘——spike 修正）----
  function updateSafeFrame(shell, nodeId) {
    // 安全框作为 chrome 子元素：chrome(z60) 在画布之上、面板之下，保证 letterbox 遮罩盖住画布、又不挡面板交互。
    const host = shell.querySelector(`.${CHROME_CLASS}`) || shell;
    let overlay = host.querySelector(".hy-dc-safeframe");
    const rect = shell.getBoundingClientRect();
    const frame = computeSafeFrameRect(deriveCaptureAspect(getNode(nodeId)), rect.width, rect.height);
    if (frame.full) { if (overlay) overlay.classList.remove("is-visible"); return; }
    if (!overlay) {
      overlay = el("div", "hy-dc-safeframe");
      overlay.innerHTML = '<div class="hy-dc-sf-mask hy-dc-sf-top"></div><div class="hy-dc-sf-mask hy-dc-sf-bottom"></div><div class="hy-dc-sf-mask hy-dc-sf-left"></div><div class="hy-dc-sf-mask hy-dc-sf-right"></div><div class="hy-dc-sf-rect"></div>';
      host.appendChild(overlay);
    }
    overlay.classList.add("is-visible");
    const set = (selp, css) => { const e = overlay.querySelector(selp); if (e) Object.assign(e.style, css); };
    set(".hy-dc-sf-top", { left: "0", top: "0", width: "100%", height: frame.y + "px" });
    set(".hy-dc-sf-bottom", { left: "0", top: (frame.y + frame.h) + "px", width: "100%", height: (rect.height - frame.y - frame.h) + "px" });
    set(".hy-dc-sf-left", { left: "0", top: frame.y + "px", width: frame.x + "px", height: frame.h + "px" });
    set(".hy-dc-sf-right", { left: (frame.x + frame.w) + "px", top: frame.y + "px", width: (rect.width - frame.x - frame.w) + "px", height: frame.h + "px" });
    set(".hy-dc-sf-rect", { left: frame.x + "px", top: frame.y + "px", width: frame.w + "px", height: frame.h + "px" });
  }

  // ---- V5: ViewCube 方位导航球（右上，对齐竞品）+ 重置视角 ----
  const VC_SNAP = {
    front:  { orbitYaw: 0,            orbitPitch: 0 },
    back:   { orbitYaw: Math.PI,      orbitPitch: 0 },
    right:  { orbitYaw: Math.PI / 2,  orbitPitch: 0 },
    left:   { orbitYaw: -Math.PI / 2, orbitPitch: 0 },
    top:    { orbitYaw: 0,            orbitPitch: 1.35 },
    bottom: { orbitYaw: 0,            orbitPitch: -1.35 },
  };
  function snapView(nodeId, key) {
    const m = VC_SNAP[key];
    if (!m) return;
    const sv = sceneOf(getNode(nodeId))?.viewport?.sceneView || {};
    applyPanoramaSceneViewCommit({ nodeId, sceneView: { ...sv, orbitYaw: m.orbitYaw, orbitPitch: m.orbitPitch }, storeInstance: appStore });
  }
  function buildViewCube(shell, nodeId) {
    const NS = "http://www.w3.org/2000/svg";
    const wrap = el("div", "hy-dc-viewcube");
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 96 96");
    svg.setAttribute("class", "hy-dc-vc-gizmo");
    const cx = 48, cy = 48, R = 30;
    // +X 右(红) / +Y 上(绿) / +Z 朝观众斜下(蓝)，负向小球在对侧
    const axes = [
      { key: "right",  label: "X", color: "#F75353", dx: 1,     dy: 0,     neg: false },
      { key: "left",   label: "",  color: "#F75353", dx: -1,    dy: 0,     neg: true },
      { key: "top",    label: "Y", color: "#7BD66B", dx: 0,     dy: -1,    neg: false },
      { key: "bottom", label: "",  color: "#7BD66B", dx: 0,     dy: 1,     neg: true },
      { key: "front",  label: "Z", color: "#4C7DF7", dx: 0.52,  dy: 0.52,  neg: false },
      { key: "back",   label: "",  color: "#4C7DF7", dx: -0.52, dy: -0.52, neg: true },
    ];
    const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
    for (const a of axes) if (!a.neg) svg.appendChild(mk("line", { x1: cx, y1: cy, x2: cx + a.dx * R, y2: cy + a.dy * R, stroke: a.color, "stroke-width": "2", opacity: "0.65" }));
    svg.appendChild(mk("circle", { cx, cy, r: "3.5", fill: "#9a9a9a" }));
    for (const a of axes) {
      const dot = mk("circle", { cx: cx + a.dx * R, cy: cy + a.dy * R, r: a.neg ? "4" : "7.5", fill: a.neg ? "#1b1b1b" : a.color, stroke: a.color, "stroke-width": a.neg ? "1.5" : "0", class: "hy-dc-vc-dot" });
      dot.dataset.snap = a.key;
      dot.addEventListener("pointerdown", stop);
      dot.addEventListener("click", (e) => { stop(e); snapView(nodeId, a.key); });
      svg.appendChild(dot);
      if (a.label) {
        const t = mk("text", { x: cx + a.dx * R, y: cy + a.dy * R + 3, "text-anchor": "middle", "font-size": "8.5", fill: "#fff", "pointer-events": "none" });
        t.textContent = a.label;
        svg.appendChild(t);
      }
    }
    wrap.appendChild(svg);
    const reset = el("button", "hy-dc-vc-reset", "重置视角");
    reset.addEventListener("pointerdown", stop);
    reset.addEventListener("click", (e) => { stop(e); resetPanoramaSceneView({ nodeId, storeInstance: appStore }); });
    wrap.appendChild(reset);
    return wrap;
  }

  // ---- 外壳装配与刷新 ----
  function ensureChrome(shell, nodeId) {
    let chrome = shell.querySelector(`.${CHROME_CLASS}`);
    if (!chrome) {
      chrome = el("div", CHROME_CLASS);
      chrome.appendChild(buildHeader(shell, nodeId));
      chrome.appendChild(buildViewCube(shell, nodeId));
      chrome.appendChild(buildBottomBar(shell, nodeId));
      chrome.appendChild(buildTreePanel(shell, nodeId));
      chrome.appendChild(buildInspectorPanel());
      // 机位视角锁定层：透明覆盖视口，吞掉拖拽 → 画布收不到 → 不能自由轨道（doc17 §1：机位视角视角锁定）。
      // 仅 .is-cameraview 时 pointer-events:auto；面板/顶栏/底栏 z 更高仍可交互。
      chrome.appendChild(el("div", "hy-dc-camlock"));
      chrome.appendChild(buildHelpOverlay()); // 操作说明浮层（顶栏 ? 切换 .is-help-open）
      chrome.addEventListener("dblclick", stop);
      shell.appendChild(chrome);
    }
    return chrome;
  }
  function refreshChrome(shell, nodeId, force) {
    const chrome = ensureChrome(shell, nodeId);
    syncModeBar(chrome.querySelector(".hy-dc-modebar"), shell);
    syncBottomBar(chrome.querySelector(".hy-dc-bottombar"), nodeId);
    renderTree(chrome.querySelector(".hy-dc-tree"), shell, nodeId);
    renderInspector(chrome.querySelector(".hy-dc-inspector"), shell, nodeId);
    updateSafeFrame(shell, nodeId);
    // 机位视角 → 给 chrome 加 is-cameraview，激活锁定层 + 隐藏 ViewCube（导演视角才需方位球）
    chrome.classList.toggle("is-cameraview", getViewMode(shell) === "camera");
    if (force) chrome.classList.add("is-visible");
  }

  function syncOnce() {
    const nodes = getState()?.nodes;
    if (!nodes) return;
    for (const shell of document.querySelectorAll(SHELL_SELECTOR)) {
      const nodeId = resolveShellNodeId(shell);
      const node = nodeId ? nodes[nodeId] : null;
      const isFullscreen = Boolean(shell.closest(FULLSCREEN_SELECTOR));
      // 内联编辑 与 全屏 都显示 chrome（shell 只在「双击进入编辑」/全屏态挂载）→ 两态交互/功能一致（用户要求同步）。
      // 以前 && isFullscreen → 内联编辑只剩原生旧交互，故用户感到“全屏新、非全屏旧”。
      const show = Boolean(node && isPanoramaSceneNodeType(node.type));
      if (show) {
        const chrome = ensureChrome(shell, nodeId);
        chrome.classList.add("is-visible");
        chrome.classList.toggle("is-inline", !isFullscreen); // 内联态标记，供 CSS/排查区分
        refreshChrome(shell, nodeId, false);
        setNativeFullscreenUiHidden(shell, true, isFullscreen);
      } else {
        const chrome = shell.querySelector(`.${CHROME_CLASS}`);
        if (chrome) chrome.classList.remove("is-visible");
        setNativeFullscreenUiHidden(shell, false, isFullscreen);
      }
    }
  }

  // ---- V1: V/R/S 全局变换快捷键（仅有可见 chrome 且未在输入框时）----
  function activeDirectorContext() {
    const shell = [...document.querySelectorAll(SHELL_SELECTOR)].find(
      (s) => s.querySelector(`.${CHROME_CLASS}.is-visible`),
    );
    if (!shell) return null;
    const nodeId = resolveShellNodeId(shell);
    return nodeId ? { shell, nodeId } : null;
  }
  document.addEventListener("keydown", (event) => {
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tool = transformModeForHotkey(event.key);
    if (!tool) return;
    const ctx = activeDirectorContext();
    if (!ctx) return;
    event.preventDefault();
    setPanoramaSceneTool({ nodeId: ctx.nodeId, tool, storeInstance: appStore });
    refreshChrome(ctx.shell, ctx.nodeId, true);
  });

  // 方向键水平移动（Y 不变）：选中人偶→移动人偶（模拟走动，免被网格吸附拉回）；未选人偶→移动镜头/视角。
  let arrowMoveUntil = 0; // 方向键移动人偶的免吸附窗口（被下方 grid-snap 订阅读取）
  const ARROW_STEP = 0.2;
  const ARROW_DIR = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  document.addEventListener("keydown", (event) => {
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const d = ARROW_DIR[event.key];
    if (!d) return;
    const ctx = activeDirectorContext();
    if (!ctx) return;
    const { shell, nodeId } = ctx;
    const dx = d[0] * ARROW_STEP, dz = d[1] * ARROW_STEP;
    const node = getNode(nodeId);
    const scene = sceneOf(node);
    const sel = scene?.selection;
    const selMan = sel?.selectedObjectType === "mannequin" && sel.selectedObjectId
      && canSelectObject("mannequin", sel.selectedObjectId, node?.directorExt);
    event.preventDefault();
    if (selMan) {
      // 选中人偶 → 移动人偶（X/Z，免吸附窗口避免被 grid-snap 拉回原位）
      const live = deriveInspector(scene, node?.directorExt);
      if (!live || live.kind !== "mannequin") return;
      const pose = buildMannequinPosePatch("posX", live.fields.posX + dx, live.fields);
      if (!pose || !pose.position) return;
      pose.position.z = live.fields.posZ + dz;
      arrowMoveUntil = Date.now() + 600;
      updatePanoramaSceneObjectTransform({ nodeId, objectType: "mannequin", objectId: sel.selectedObjectId, pose, storeInstance: appStore });
      refreshChrome(shell, nodeId, true);
    } else if (getViewMode(shell) === "camera") {
      // 未选人偶 + 机位视角 → 移动当前机位
      const camId = shell.dataset.dcCameraId;
      if (!camId) return;
      const ext = node?.directorExt?.cameras && node.directorExt.cameras[String(camId)];
      const cam = (scene?.cameras || []).find((c) => String(c.id) === String(camId));
      const pos = (ext && ext.position) || (cam && cam.position) || { x: 0, y: 1.6, z: 0 };
      writeDirectorExt(nodeId, { cameras: { [camId]: { position: { x: (Number(pos.x) || 0) + dx, y: Number(pos.y) || 0, z: (Number(pos.z) || 0) + dz } } } });
      maybeApplyCameraView(nodeId, camId);
      refreshChrome(shell, nodeId, true);
    } else {
      // 未选人偶 + 导演视角 → 平移镜头（移动 orbit 注视点 → 视角水平移动）
      const sv = scene?.viewport?.sceneView;
      if (!sv) return;
      const t = sv.target || { x: 0, y: 0, z: 0 };
      applyPanoramaSceneViewCommit({ nodeId, sceneView: { ...sv, target: { x: (Number(t.x) || 0) + dx, y: Number(t.y) || 0, z: (Number(t.z) || 0) + dz } }, activeView: "default", activeCameraId: null, storeInstance: appStore });
    }
  });

  // ---- F4: 网格吸附——拖拽落地时把选中人偶 X/Z 吸附到网格 ----
  // 桥 gizmo 的 pointerup 时序在混淆 scene3dBridge.js 中未确认（plan 项1 真机依赖）；
  // 这里在 shell 上挂 pointerup（捕获阶段，桥处理完拖拽提交后触发），读 snapGrid 开关 →
  // 取选中人偶当前位置 → computeStableGridSnap → 写回完整 pose。
  // per-puppet 滞回 state 存 Map，避免边界抖动；选中清空时清 entry（防泄漏）。
  const snapPrev = new Map(); // id -> {x,z}
  function applyGridSnapOnDrop(shell, nodeId) {
    const node = getNode(nodeId);
    if (!resolveSnapGridEnabled(node?.directorExt)) return;
    const scene = sceneOf(node);
    const sel = scene?.selection;
    if (sel?.selectedObjectType !== "mannequin" || !sel.selectedObjectId) return;
    if (Array.isArray(sel.selectedObjects) && sel.selectedObjects.length > 1) return; // 多选不吸附
    if (!canSelectObject("mannequin", sel.selectedObjectId, node?.directorExt)) return; // 锁定不动
    const live = deriveInspector(scene, node?.directorExt);
    if (!live || live.kind !== "mannequin" || live.id !== String(sel.selectedObjectId)) return;
    const prev = snapPrev.get(live.id) || null;
    const pose = buildGridSnapPose(live.fields, SNAP_GRID_SIZE, prev);
    snapPrev.set(live.id, { x: pose.position.x, z: pose.position.z });
    // 已对齐则不写（避免无谓提交）
    if (Math.abs(pose.position.x - live.fields.posX) < 1e-6 && Math.abs(pose.position.z - live.fields.posZ) < 1e-6) return;
    updatePanoramaSceneObjectTransform({ nodeId, objectType: "mannequin", objectId: live.id, pose, storeInstance: appStore });
    refreshChrome(shell, nodeId, true);
  }
  // 网格吸附触发：订阅 store——只要选中人偶的位置在 store 里变了（拖拽提交、检查器改值），
  // 去抖 220ms（拖拽过程中持续重置，松手停变后才吸）再吸附。比 pointerup 定时更稳：
  // 不依赖桥 gizmo 何时把拖拽落点写进 store，写进来那一刻就会触发。
  // applyGridSnapOnDrop 幂等（吸附后已对齐→跳过写）→ 不会自循环。
  let snapDebounce = null;
  let snapLastPos = null; // {id,x,z}
  try {
    appStore.subscribe(() => {
      const ctx = activeDirectorContext();
      if (!ctx) { snapLastPos = null; return; }
      const node = getNode(ctx.nodeId);
      if (!resolveSnapGridEnabled(node?.directorExt)) { snapLastPos = null; return; }
      const scene = sceneOf(node);
      const sel = scene?.selection;
      if (sel?.selectedObjectType !== "mannequin" || !sel.selectedObjectId) { snapLastPos = null; return; }
      const m = (Array.isArray(scene?.mannequins) ? scene.mannequins : []).find((x) => String(x?.id) === String(sel.selectedObjectId));
      if (!m || !m.position) return;
      const cur = { id: String(m.id), x: Number(m.position.x) || 0, z: Number(m.position.z) || 0 };
      // 方向键移动人偶期间免吸附（否则刚走出去就被吸回原格 = "跳回原位"）
      if (Date.now() < arrowMoveUntil) { snapLastPos = cur; return; }
      // 仅当选中人偶 X/Z 真的变了才重置去抖（忽略无关 store 变动）
      if (snapLastPos && snapLastPos.id === cur.id && Math.abs(snapLastPos.x - cur.x) < 1e-9 && Math.abs(snapLastPos.z - cur.z) < 1e-9) return;
      snapLastPos = cur;
      if (snapDebounce) clearTimeout(snapDebounce);
      snapDebounce = setTimeout(() => { if (Date.now() < arrowMoveUntil) return; try { applyGridSnapOnDrop(ctx.shell, ctx.nodeId); } catch (_) {} }, 220);
    });
  } catch (_) { /* subscribe 不可用则仅靠开关即时吸附 */ }

  // 点击底栏之外关闭弹出菜单（捕获阶段，popup 在按钮内 → closest 命中按钮则不关）
  document.addEventListener("pointerdown", (event) => {
    // 树行右键菜单：点菜单外即关（菜单内点击由其自身处理）
    if (!(event.target.closest && event.target.closest(".hy-dc-ctx"))) closeTreeContextMenu();
    const bar = document.querySelector(`.${CHROME_CLASS}.is-visible .hy-dc-bottombar`);
    if (!bar) return;
    if (event.target.closest && event.target.closest(".hy-dc-bb-btn")) return;
    closeBottomPopups(bar);
  }, true);
  // Esc 关闭树行右键菜单
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeTreeContextMenu();
  });

  window.setInterval(syncOnce, POLL_MS);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncOnce, { once: true });
  } else {
    syncOnce();
  }
})();
