/**
 * modules/settings/librarySettings.js
 * 团队共享库目录（NAS 共享库 方案乙/4.2-B）设置面板模块。
 *
 * 独立非混淆模块，不改动 fileSaveSettings.js（混淆体）。
 * HTML 侧由 index.html 在 settings-file-save-card 之后新增一张卡。
 * 本模块导出 initLibrarySettings()，由 index.html 内联 <script type="module"> 调用。
 */

import {
  fetchUserSettingsFromServer,
  fetchLibraryStatusFromServer,
} from "../../api/index.js";
import { post } from "../../api/requester.js";
import { showError, showSuccess } from "../../services/toastService.js";

// 首次设库会同步把本机素材/工作流/预设/输出/上传 copy-missing 迁入 NAS，
// 大库经 SMB 复制可能很久；用 600s 超时，别让 30s 默认（DEFAULT_TIMEOUT）把迁移打断。
const LIBRARY_SAVE_TIMEOUT_MS = 600000;
const USER_SETTINGS_ENDPOINT = "/api/v2/user/settings.json";

/**
 * 刷新 #libraryStatusLine 的状态文案与 CSS class。
 * @param {HTMLElement} statusLine
 * @param {string} inputValue  当前输入框的值（用来判断是否已填）
 */
async function refreshStatus(statusLine, inputValue) {
  if (!statusLine) return;
  if (!inputValue || !inputValue.trim()) {
    statusLine.textContent = "未启用共享库（各机本地保存）";
    statusLine.className = "settings-desc library-status-inactive";
    return;
  }
  try {
    const s = await fetchLibraryStatusFromServer();
    if (!s.reachable) {
      statusLine.textContent = "共享库不可达：检查网络/挂载";
      statusLine.className = "settings-desc library-status-error";
    } else if (!s.writable) {
      statusLine.textContent = "可读不可写：检查共享权限";
      statusLine.className = "settings-desc library-status-warn";
    } else {
      const c = s.counts || {};
      statusLine.textContent =
        `已连接 · 素材 ${c.assets ?? 0} · 工作流 ${c.workflows ?? 0} · 预设 ${c.presets ?? 0}`;
      statusLine.className = "settings-desc library-status-ok";
    }
  } catch (err) {
    statusLine.textContent = "共享库状态获取失败";
    statusLine.className = "settings-desc library-status-error";
  }
}

/**
 * 初始化共享库目录设置面板。
 * 挂载 #libraryDirInput / #btnLibraryDirSave / #libraryStatusLine 的交互逻辑。
 * 任一 DOM 元素缺失则安全退出（面板不在当前页面时不报错）。
 */
export function initLibrarySettings() {
  const input = document.getElementById("libraryDirInput");
  const btn = document.getElementById("btnLibraryDirSave");
  const statusLine = document.getElementById("libraryStatusLine");

  if (!input || !btn || !statusLine) return;

  // 初始化时从 settings 回填，再刷新状态行
  fetchUserSettingsFromServer()
    .then((settings) => {
      input.value = settings?.libraryDir || "";
      refreshStatus(statusLine, input.value);
    })
    .catch((err) => {
      console.error("[LibrarySettings] 加载共享库目录失败:", err);
    });

  // 保存按钮
  btn.addEventListener("click", async () => {
    const libraryDir = input.value.trim();
    btn.disabled = true;
    const origText = btn.textContent;
    btn.textContent = "保存中...";
    try {
      const cur = await fetchUserSettingsFromServer().catch(() => ({}));
      // 等价于 saveUserSettingsToServer，但带 600s 超时以容纳首次设库的大库迁移
      await post(
        USER_SETTINGS_ENDPOINT,
        { ...(cur || {}), libraryDir },
        { provider: "local", timeout: LIBRARY_SAVE_TIMEOUT_MS },
      );
      showSuccess("共享库目录已更新");
      await refreshStatus(statusLine, libraryDir);
    } catch (err) {
      console.error("[LibrarySettings] 保存共享库目录失败:", err);
      showError("保存共享库目录失败：" + (err?.message || "未知错误"));
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  });
}
