function a57_0x4151(){const _0x128e46=['/api/v2/user/settings.json','135728zEnJUX','16QygsEY','930183sICmYQ','6547wumgcU','1433940Jmmuye','210679DUtRtZ','local','76WOMsYm','95QWdyMr','5144623iZwfvK','20dNhUza','2157453zkplfu'];a57_0x4151=function(){return _0x128e46;};return a57_0x4151();}(function(_0x34c04e,_0x1f4a85){const _0x597c77=a57_0x402c,_0x266d9f=_0x34c04e();while(!![]){try{const _0x4a5b35=parseInt(_0x597c77(0x16d))/0x1*(parseInt(_0x597c77(0x171))/0x2)+parseInt(_0x597c77(0x16c))/0x3+parseInt(_0x597c77(0x16a))/0x4*(parseInt(_0x597c77(0x172))/0x5)+parseInt(_0x597c77(0x16e))/0x6+parseInt(_0x597c77(0x16f))/0x7*(parseInt(_0x597c77(0x16b))/0x8)+-parseInt(_0x597c77(0x168))/0x9+parseInt(_0x597c77(0x167))/0xa*(-parseInt(_0x597c77(0x166))/0xb);if(_0x4a5b35===_0x1f4a85)break;else _0x266d9f['push'](_0x266d9f['shift']());}catch(_0x111bc9){_0x266d9f['push'](_0x266d9f['shift']());}}}(a57_0x4151,0x4ffd4));import{get as a57_0xec8750,post as a57_0x3bb283}from'./requester.js';export async function fetchUserSettingsFromServer(){const _0x5de37b=a57_0x402c,_0x33b99f=await a57_0xec8750(_0x5de37b(0x169),{'provider':'local'});return _0x33b99f;}function a57_0x402c(_0x4dbec9,_0x39dcaf){_0x4dbec9=_0x4dbec9-0x166;const _0x415196=a57_0x4151();let _0x402ccf=_0x415196[_0x4dbec9];return _0x402ccf;}export async function saveUserSettingsToServer(_0x1f52cc){const _0x16c82f=a57_0x402c;return await a57_0x3bb283(_0x16c82f(0x169),_0x1f52cc||{},{'provider':_0x16c82f(0x170)});}

// === 团队共享库状态（NAS 共享库 方案乙/4.2-B，新增非混淆出口）===
import { get as getLibraryStatusRequest } from "./requester.js";

/**
 * GET /api/v2/library/status -> { reachable, writable, counts:{assets,workflows,presets} }
 * 后端端点由 server 侧 library_status(LIBRARY_DIR) 提供（兄弟任务注册路由）。
 * 失败时返回安全降级对象，调用方据此渲染"未配置/不可达"。
 */
export async function fetchLibraryStatusFromServer() {
  try {
    const status = await getLibraryStatusRequest("/api/v2/library/status", {
      provider: "local",
    });
    return status || { reachable: false, writable: false, counts: {} };
  } catch (err) {
    return { reachable: false, writable: false, counts: {}, error: err };
  }
}