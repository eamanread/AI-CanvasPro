// 需求: 资产创建弹窗点「确定」添加后, 封面飞入动画应飞向右上角资产按钮。
// 实证: assetManager._playCreateAssetFly 飞入终点 = document.getElementById("btnAssets") 的 rect;
//   但 btnAssets(旧左下资产入口)已被顶栏迁移隐藏(display:none → rect 0×0 → 飞向左上角 0,0)。
//   顶栏资产按钮 = .hy-hc-asset(右上)。
// 方案: 覆盖 _playCreateAssetFly, 在其同步执行窗口内把 getElementById("btnAssets") 暂时改返回 .hy-hc-asset,
//   使飞入终点取右上按钮实时位置(自动跟随窗口尺寸); 仅拦截 "btnAssets", 其余透传, 执行后立即还原。
// 回退: 删本文件 + index.html 一行 script。
import { assetManager as am } from "./AssetManager.js";

(function () {
  if (!am || typeof am._playCreateAssetFly !== "function" || am.__hyFlyRetargeted) return;
  const origFly = am._playCreateAssetFly;
  am._playCreateAssetFly = function () {
    const realGEBI = document.getElementById;
    document.getElementById = function (id) {
      if (id === "btnAssets") {
        const top = document.querySelector(".hy-hc-asset");
        if (top) return top; // 右上资产按钮作飞入终点
      }
      return realGEBI.call(document, id);
    };
    try {
      return origFly.apply(this, arguments);
    } finally {
      document.getElementById = realGEBI; // 同步窗口结束即还原
    }
  };
  am.__hyFlyRetargeted = true;
})();
