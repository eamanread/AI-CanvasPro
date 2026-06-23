// 需求: 生成图片节点(ai-image)与源图片节点(source-image), 选中后右键 → 新增「添加到资产」项;
//   点击后打开资产创建弹窗, 走原生添加资产流程。
// 实证依据:
//   · 右键菜单容器 = .v2-canvas-ctx-menu, 行 = .v2-menu-row / .v2-menu-sep。
//   · 添加资产流程入口 = assetManager.showCreatePanel(nodeIds[], anchorEl):
//       arg1 读 graphStore.getState().nodes[ids[0]] 解析封面; arg2 为锚点(外部点击关闭 + 跟随定位)。
//       _startCreatePanelFollow 要求 document.body.contains(anchor) 恒真, 故锚点用常驻顶栏资产按钮。
//   · 空画布菜单特征: 含「添加节点」+「粘贴/撤销」; 仅节点菜单且全为图片节点时注入。
// 回退: 删本文件 + index.html 一行 script。
import { graphStore } from "../src/core/stores/appStore.js";
import { assetManager } from "./AssetManager.js";

(function () {
  var IMG_TYPES = { "ai-image": 1, "source-image": 1 };

  // 选中节点全部为图片类型时, 返回其 id 数组; 否则 null(不显示菜单项)。
  function selectedImageIds() {
    try {
      var st = graphStore.getState();
      var ids = st.selectedNodeIds || [];
      if (!ids.length) return null;
      var nodes = st.nodes || {};
      for (var i = 0; i < ids.length; i++) {
        var n = nodes[ids[i]];
        if (!n || !IMG_TYPES[n.type]) return null;
      }
      return ids.slice();
    } catch (e) { return null; }
  }

  // 空画布右键菜单(添加节点/粘贴/撤销/重做) → 不注入。
  function isCanvasMenu(menu) {
    var t = menu.textContent || "";
    return t.indexOf("添加节点") >= 0 &&
           (t.indexOf("粘贴") >= 0 || t.indexOf("撤销") >= 0);
  }

  function injectRow(menu, ids) {
    if (menu.querySelector(".hy-ctx-add-asset")) return;
    var sep = document.createElement("div");
    sep.className = "v2-menu-sep hy-ctx-add-asset-sep";
    var row = document.createElement("div");
    row.className = "v2-menu-row hy-ctx-add-asset";
    row.innerHTML = "<span>添加到资产</span>"; // 添加到资产
    row.addEventListener("click", function (e) {
      e.stopPropagation();
      try {
        var anchor = document.querySelector(".hy-hc-asset") || document.body;
        assetManager.showCreatePanel(ids, anchor);
      } catch (err) {}
      if (menu.parentElement) menu.remove();
    });
    menu.appendChild(sep);
    menu.appendChild(row);
  }

  function handleMenu(menu) {
    // 延一拍, 确保菜单行已构建完成再判定文本
    setTimeout(function () {
      if (!menu.isConnected) return;
      if (isCanvasMenu(menu)) return;
      var ids = selectedImageIds();
      if (ids) injectRow(menu, ids);
    }, 0);
  }

  var mo = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var added = muts[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var el = added[j];
        if (!el || el.nodeType !== 1) continue;
        if (el.classList && el.classList.contains("v2-canvas-ctx-menu")) handleMenu(el);
        else if (el.querySelector) {
          var m = el.querySelector(".v2-canvas-ctx-menu");
          if (m) handleMenu(m);
        }
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
})();
