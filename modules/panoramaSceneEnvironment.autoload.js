// 3D导演台·全景环境 autoload（P1-P3 + 连线同步，文档 §12/§13）
// ①对 PanoramaScene3DBridge 安装访问器钩子：scene 模式消费 sceneNode.panorama；
// ②轮询同步 panorama-360 节点连线 → 导演台 sceneNode.panorama（签名比对，零变化零写入）。
// 移除本文件 + index.html 对应 script 标签即整体回退（依赖的两个模块为纯库无副作用）。
import appStore from "../src/core/stores/appStore.js";
import { installPanoramaEnvironmentRuntime } from "./panoramaSceneNode/panoramaEnvironmentRuntime.js";
import { syncPanoramaSceneFromIncomingEdges } from "./panoramaSceneNode/panoramaSceneEdgeSync.js";

if (typeof window !== "undefined") {
  const ok = installPanoramaEnvironmentRuntime();
  if (!ok) console.warn("[panoramaEnvironment] install skipped: bridge prototype unavailable");

  const EDGE_SYNC_MS = 500;
  window.setInterval(() => {
    try {
      syncPanoramaSceneFromIncomingEdges({ storeInstance: appStore });
    } catch (error) {
      if (!window.__hyPanoEdgeSyncWarned) {
        window.__hyPanoEdgeSyncWarned = true;
        console.warn("[panoramaEnvironment] edge sync failed:", error?.message || error);
      }
    }
  }, EDGE_SYNC_MS);
}
