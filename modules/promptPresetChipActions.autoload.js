// 需求: 生成文字/图片节点预设提示词 —— 输入框 chip 的「×」与底部按钮的「×」均一键清除预设。
// 机制: 全局委托 click(capture 相位)。命中清除元素 → 还原选区(移除输入框 chip + 复位按钮标签 + 持久化 null)。
//   stopPropagation 防止点底部按钮「×」误触发其打开预设选择器。
// 节点上下文从被点元素就近的节点容器推导(与 slashMenu.findCommonPromptButtonForPrompt 同一套选择器)。
// 回退: 删本文件 + index.html 一行 script。
import { graphStore } from "../src/core/stores/appStore.js";
import { clearPromptPresetSelection } from "./promptPresetPillRuntime.js";

(function () {
  const NODE_SEL = ".node, .node-wrapper, .canvas-node, [data-node-id]";
  const CLEAR_SEL =
    "[data-prompt-preset-remove], [data-prompt-preset-clear], .prompt-preset-pill__remove, .common-prompt-btn__clear";

  document.addEventListener(
    "click",
    (e) => {
      const target = e.target;
      if (!target || !target.closest) return;
      const hit = target.closest(CLEAR_SEL);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      const nodeEl = hit.closest(NODE_SEL);
      const promptEl =
        nodeEl?.querySelector?.(".prompt-textarea, [contenteditable='true']") || null;
      const buttonEl = nodeEl?.querySelector?.(".common-prompt-btn") || null;
      const idEl = hit.closest("[data-node-id]");
      const nodeId =
        idEl?.getAttribute?.("data-node-id") || nodeEl?.dataset?.nodeId || null;
      clearPromptPresetSelection({ promptEl, nodeId, store: graphStore, buttonEl });
    },
    true,
  );
})();
