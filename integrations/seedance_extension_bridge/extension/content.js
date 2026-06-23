// content.js - 即梦AI页面内容脚本
// 负责在页面中执行实际的参考图上传和生成操作

(function () {
  'use strict';

  // ============================================================
  // 状态管理
  // ============================================================
  let isProcessing = false;
  let currentTaskIndex = -1;
  let ratioWatcherTimer = null;
  let ratioWatcherApplying = false;
  const SEEDANCE_RECORD_ANCHOR_ATTR = 'data-seedance-bridge-anchor';
  const SEEDANCE_RECORD_SIGNATURE_ATTR = 'data-seedance-bridge-signature';

  // ============================================================
  // 比例监控: 后台轮询, 检测到比例被 React 重置时自动恢复
  // ============================================================
  function startRatioWatcher(targetRatio, duration = 20000) {
    stopRatioWatcher();
    if (!targetRatio || targetRatio === '1:1') return; // 默认值不需要监控

    const startTime = Date.now();
    console.log(`[Seedance批量] 🔒 启动比例监控: "${targetRatio}" (${duration / 1000}秒)`);

    ratioWatcherTimer = setInterval(async () => {
      if (ratioWatcherApplying) return;
      if (Date.now() - startTime > duration) {
        stopRatioWatcher();
        return;
      }

      const toolbar = findToolbar();
      const ratioBtn = toolbar?.querySelector('button[class*="toolbar-button"]');
      const currentRatio = ratioBtn?.textContent?.trim();

      if (currentRatio && currentRatio !== targetRatio) {
        ratioWatcherApplying = true;
        console.log(`[Seedance批量] 🔒 比例监控: 检测到 "${currentRatio}" → 恢复 "${targetRatio}"`);
        try {
          await setAspectRatio(targetRatio);
        } catch (e) {
          console.error('[Seedance批量] 比例监控: 恢复失败:', e);
        }
        ratioWatcherApplying = false;
      }
    }, 1500);
  }

  function stopRatioWatcher() {
    if (ratioWatcherTimer) {
      clearInterval(ratioWatcherTimer);
      ratioWatcherTimer = null;
      console.log('[Seedance批量] 🔓 比例监控已停止');
    }
  }

  // ============================================================
  // 消息监听
  // ============================================================
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'ping') {
      sendResponse({ success: true, ready: true, processing: isProcessing });
      return false;
    }

    if (msg.action === 'getPageInfo') {
      const info = getPageInfo();
      sendResponse({ success: true, info });
      return false;
    }

    if (msg.action === 'applyPreset') {
      applyPresetParams(msg.preset || {})
        .then(result => sendResponse({ success: true, result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (msg.action === 'generateTask') {
      if (isProcessing) {
        sendResponse({ success: false, error: '正在处理其他任务，请稍候' });
        return false;
      }
      handleGenerateTask(msg)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true; // keep message channel open for async response
    }

    if (msg.action === 'clearReference') {
      clearReferenceImage()
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (msg.action === 'setPrompt') {
      setPrompt(msg.prompt || '')
        .then(() => {
          // 读取编辑器当前 <p> 内容返回用于验证
          const editor = findPromptEditor();
          const p = editor ? editor.querySelector('p') : null;
          const currentText = (p ? p.textContent : (editor ? editor.textContent : '')) || '';
          sendResponse({ success: true, currentText });
        })
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (msg.action === 'getPromptText') {
      const editor = findPromptEditor();
      const p = editor ? editor.querySelector('p') : null;
      const currentText = (p ? p.textContent : (editor ? editor.textContent : '')) || '';
      sendResponse({ success: true, currentText, hasEditor: !!editor });
      return false;
    }

    if (msg.action === 'doGenerate') {
      if (isProcessing) {
        sendResponse({ success: false, error: '正在处理其他任务，请稍候' });
        return false;
      }
      doGenerate(msg)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (msg.action === 'clickGenerate') {
      clickGenerate()
        .then(result => sendResponse({
          success: true,
          detail: result?.detail || result || 'ok',
          resultAnchor: result?.resultAnchor || null,
        }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (msg.action === 'findLatestSeedanceResultAfterSubmit') {
      findLatestSeedanceResultAfterSubmit(
        msg.resultAnchor || null,
        msg.expectedPrompt || '',
        msg.expectedModel || '',
        msg.expectedDuration || '',
        msg.expectedPromptMarker || ''
      )
        .then(result => sendResponse({ success: true, ...result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (msg.action === 'findVideoByTaskCode') {
      findVideoByTaskCode(msg.taskCode || '')
        .then(result => sendResponse({ success: true, ...result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (msg.action === 'triggerNativeDownload') {
      triggerNativeDownload(msg.taskCode || '', msg.preferHD !== false)
        .then(result => sendResponse({ success: true, ...result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (msg.action === 'triggerUpscale') {
      triggerUpscale(msg.taskCode || '')
        .then(result => sendResponse({ success: true, ...result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (msg.action === 'downloadVideoFile') {
      downloadVideoFile(msg.url || '', msg.filename || 'video.mp4')
        .then(result => sendResponse({ success: true, ...result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (msg.action === 'captureAndUpload') {
      captureAndUploadVideo(msg.taskCode || '', msg.serverUrl || '', msg.quality || '')
        .then(result => sendResponse({ success: true, ...result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (msg.action === 'captureAndUploadLatestSeedanceResult') {
      captureAndUploadLatestSeedanceResult(msg.taskCode || '', msg.serverUrl || '', msg.quality || '', msg.videoUrl || '', msg.promptMarker || '')
        .then(result => sendResponse({ success: true, ...result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (msg.action === 'lockRatio') {
      startRatioWatcher(msg.ratio, msg.duration || 20000);
      sendResponse({ success: true });
      return false;
    }

    if (msg.action === 'unlockRatio') {
      stopRatioWatcher();
      sendResponse({ success: true });
      return false;
    }
  });

  // ============================================================
  // 页面信息获取
  // ============================================================
  function hasVisibleLoginText(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map((line) => line.trim().toLowerCase())
      .some((line) => /^(sign in|log in|login|登录|登入)$/.test(line));
  }


  function isVisibleElement(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0;
  }

  function countSeedanceRecordMedia(el) {
    if (!el || typeof el.querySelectorAll !== 'function') return 0;
    return Array.from(el.querySelectorAll('video, canvas, img, source'))
      .filter((media) => {
        const src = String(media.src || media.currentSrc || media.getAttribute?.('src') || '').trim();
        if (media.tagName === 'SOURCE') return !!src;
        if (!isVisibleElement(media)) return false;
        const rect = media.getBoundingClientRect();
        if (media.tagName === 'IMG' && (rect.width < 64 || rect.height < 64)) return false;
        return true;
      })
      .length;
  }

  function isSeedanceBroadRecordContainer(el, rect = null) {
    if (!el || typeof el.querySelectorAll !== 'function') return false;
    const mediaCount = countSeedanceRecordMedia(el);
    if (mediaCount > 2) return true;

    const nestedRecordCount = Array.from(el.querySelectorAll('[class*="video-record-"], [class*="ai-generated-record"]'))
      .filter((child) => child !== el && !child.closest('#seedance-drawer-container'))
      .filter((child) => {
        const childRect = typeof child.getBoundingClientRect === 'function' ? child.getBoundingClientRect() : null;
        if (!childRect || childRect.width <= 0 || childRect.height <= 0) return false;
        return countSeedanceRecordMedia(child) > 0 ||
          !!child.querySelector('[class*="progress"], [class*="loading"], [class*="generating"], [class*="error"], [class*="fail"]');
      })
      .length;
    if (nestedRecordCount > 1) return true;

    const box = rect || (typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null);
    if (!box || mediaCount <= 0) return false;
    const viewportWidth = Math.max(document.documentElement?.clientWidth || 0, window.innerWidth || 0);
    const viewportHeight = Math.max(document.documentElement?.clientHeight || 0, window.innerHeight || 0);
    return viewportWidth > 0 && viewportHeight > 0 &&
      box.width > viewportWidth * 0.88 &&
      box.height > viewportHeight * 0.65;
  }

  function hasSeedanceUserAvatar() {
    const candidates = Array.from(document.querySelectorAll(
      'button, a, [role="button"], [aria-label], [data-testid], [class], img'
    ));
    return candidates.some((el) => {
      if (!isVisibleElement(el)) return false;
      const rect = el.getBoundingClientRect();
      const text = String(el.textContent || '').trim().toLowerCase();
      const aria = String(el.getAttribute?.('aria-label') || '').trim().toLowerCase();
      const testId = String(el.getAttribute?.('data-testid') || '').trim().toLowerCase();
      const className = String(el.className || '').trim().toLowerCase();
      const src = String(el.getAttribute?.('src') || '').trim().toLowerCase();
      const label = `${text} ${aria} ${testId} ${className} ${src}`;
      if (/sign in|login|log in|登录|登入/i.test(label)) return false;
      if (/avatar|account|profile|user|用户|账户/.test(label)) return true;
      return el.tagName === 'IMG' && rect.width >= 16 && rect.width <= 80 &&
        rect.height >= 16 && rect.height <= 80 && rect.left < 180;
    });
  }

  function getPageInfo() {
    const toolbar = findToolbar();
    const typeSelect = toolbar ? toolbar.querySelector('.lv-select') : null;
    const currentType = typeSelect ? typeSelect.textContent.trim() : "";
    const bodyText = String((document.body && document.body.innerText) || "").replace(/\u00a0/g, " " );
    const interactiveSelectors = "button, a, [role=\"button\"]";
    const hasLoginButton = hasVisibleLoginText(bodyText) || Array.from(document.querySelectorAll(interactiveSelectors)).some((el) => {
      const text = String(el.textContent || "").trim().toLowerCase();
      const aria = String(el.getAttribute?.('aria-label') || "").trim().toLowerCase();
      const label = text + " " + aria;
      return (
        text === "login" ||
        text === "log in" ||
        text === "sign in" ||
        label.includes("login") ||
        label.includes("sign in") ||
        label.includes("signin") ||
        label.includes("登录") ||
        label.includes("登入")
      );
    });
    const hasLogoutButton = Array.from(document.querySelectorAll(interactiveSelectors)).some((el) => {
      const text = String(el.textContent || "").trim().toLowerCase();
      const aria = String(el.getAttribute?.('aria-label') || "").trim().toLowerCase();
      const label = text + " " + aria;
      return (
        label.includes("logout") ||
        label.includes("log out") ||
        label.includes("sign out") ||
        label.includes("退出") ||
        label.includes("登出")
      );
    });
    const account = extractSeedanceAccountData(bodyText);
    const creditText = account.balanceText || "";
    const hasUserAvatar = hasSeedanceUserAvatar();
    const loginText = hasLoginButton ? "Sign in" : "";
    const hasAccountMenu =
      hasLogoutButton ||
      !!creditText ||
      Array.from(document.querySelectorAll('button, a, [role="button"], [aria-label], [data-testid]')).some((el) => {
        const text = String(el.textContent || "").trim().toLowerCase();
        const aria = String(el.getAttribute?.('aria-label') || "").trim().toLowerCase();
        const testId = String(el.getAttribute?.('data-testid') || "").trim().toLowerCase();
        const label = text + " " + aria + " " + testId;
        return (
          label.includes("account") ||
          label.includes("profile") ||
          label.includes("avatar") ||
          label.includes("balance") ||
          label.includes("credit") ||
          label.includes("quota") ||
          label.includes("账户") ||
          label.includes("余额") ||
          label.includes("额度")
        );
      });
    const explicitLoginStatus = readDreaminaLoginStatus();
    const hasExplicitLoginStatus = explicitLoginStatus !== null;
    const authenticated = explicitLoginStatus === true;
    const isLoginPage = /\/login|passport|sign[_-]?in|web_login/i.test(window.location.href);
    const hasSubmitButton = !!document.querySelector('[class*="submit-button"]');
    const hasPromptInput = !!findPromptTextarea() || !!findPromptEditor();
    const hasReferenceInput = !!document.querySelector('input[type="file"], [class*="reference-upload"]');
    const hasWorkspaceSignal = hasSubmitButton && (hasPromptInput || hasReferenceInput || Boolean(toolbar));
    return {
      url: window.location.href,
      isVideoGenMode: currentType === "视频生成",
      currentType,
      hasToolbar: !!toolbar,
      hasFileInput: !!document.querySelector('input[type="file"]'),
      hasSubmitButton,
      hasTextarea: !!findPromptTextarea(),
      hasPromptEditor: !!findPromptEditor(),
      hasLoginButton,
      hasLogoutButton,
      hasAccountMenu,
      hasUserAvatar,
      account,
      loginText,
      creditText,
      authenticated,
      hasExplicitLoginStatus,
      loggedIn: !isLoginPage && !hasLoginButton && (Object.keys(account).length > 0 || hasUserAvatar),
      selectCount: toolbar ? toolbar.querySelectorAll('.lv-select').length : 0,
      hasUploadArea: !!document.querySelector('[class*="reference-upload"]'),
      hasPreview: !!document.querySelector('[class*="preview-container"], img[src*="blob:"]'),
    };
  }
  function findByText(selector, text) {
    const els = document.querySelectorAll(selector);
    for (const el of els) {
      if (el.textContent.trim().includes(text)) {
        return el;
      }
    }
    return null;
  }

  // ============================================================
  // Helper: 模拟鼠标点击事件
  // ============================================================
  function simulateClick(el) {
    if (!el) return;
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }

  // ============================================================
  // Helper: 设置 React 受控输入的值
  // ============================================================
  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ============================================================
  // Helper: sleep
  // ============================================================
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }



  // ============================================================
  // Helper: 等待元素出现
  // ============================================================
  function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          observer.disconnect();
          clearTimeout(timer);
          resolve(found);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`等待元素超时: ${selector}`));
      }, timeout);
    });
  }

  // ============================================================
  // Helper: 查找非折叠的工具栏
  // ============================================================
  function readDreaminaLoginStatus() {
    const loginStatusEl = document.getElementById('__GTW_LOGIN_STATUS__');
    const raw = String(loginStatusEl?.textContent || '').trim();
    if (!raw) {
      return null;
    }
    try {
      const data = JSON.parse(raw);
      if (typeof data?.__isLogined === 'boolean') {
        return data.__isLogined;
      }
      if (typeof data?.isLogined === 'boolean') {
        return data.isLogined;
      }
      if (typeof data?.loggedIn === 'boolean') {
        return data.loggedIn;
      }
    } catch (err) {
      return null;
    }
    return null;
  }

  function extractSeedanceCreditText(bodyText) {
    const text = String(bodyText || '').replace(/\u00a0/g, ' ');
    if (!text.trim()) {
      return '';
    }
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const creditPattern = /(余额|额度|credit|balance|quota|remaining|可用|账户|wallet|credits)/i;
    const candidateLines = lines.filter((line) => creditPattern.test(line));
    const bestLine = candidateLines.find((line) => /[\d$€£¥]/.test(line)) || candidateLines[0] || '';
    if (bestLine) {
      return bestLine;
    }
    const textCandidates = Array.from(document.querySelectorAll('button, a, [role="button"], span, div, strong, small, p, li'))
      .map((el) => String(el.textContent || '').trim())
      .filter((line) => line && creditPattern.test(line) && line.length <= 100);
    return textCandidates.find((line) => /[\d$€£¥]/.test(line)) || textCandidates[0] || '';
  }

  function extractSeedanceAccountData(bodyText = '') {
    const balanceText = extractSeedanceCreditText(bodyText);
    const account = {};
    if (balanceText) {
      account.balanceText = balanceText;
    }
    const accountCandidates = Array.from(document.querySelectorAll(
      '[aria-label*="account" i], [aria-label*="profile" i], [data-testid*="account" i], [data-testid*="profile" i], button, a, [role="button"]'
    ))
      .map((el) => String(el.getAttribute?.('aria-label') || el.textContent || '').trim())
      .filter((value) => value && value.length <= 80 && !/sign in|login|log in|登录|登入/i.test(value));
    const accountText = accountCandidates.find((value) => /@|account|profile|user|credits?|balance|quota|账户|用户|余额|额度/i.test(value));
    if (accountText) {
      account.displayName = accountText;
    }
    return account;
  }

  function findToolbar() {
    // 优先找非折叠的 toolbar-settings-content
    const toolbars = document.querySelectorAll('[class*="toolbar-settings-content"]');
    for (const tb of toolbars) {
      if (tb.offsetParent !== null && !tb.className.includes('collapsed')) {
        return tb;
      }
    }
    // fallback: 找任何可见的
    for (const tb of toolbars) {
      if (tb.offsetParent !== null) return tb;
    }
    return null;
  }

  function isUsableGenerationWorkspace() {
    return Boolean(findPromptEditor() && findSubmitButton());
  }

  function isVideoGenerationType(text) {
    const value = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    return value === '视频生成' ||
      value.startsWith('视频生成') ||
      value === 'ai video' ||
      value.startsWith('ai video');
  }

  // ============================================================
  // 导航: 确保页面处于 "视频生成" 模式
  // ============================================================
  async function ensureVideoGenerationMode() {
    const toolbar = findToolbar();
    if (!toolbar) {
      // 可能页面还在首页、没有工具栏，尝试点击侧边栏"生成"
      const genNav = findByText('div, span, a', '生成');
      if (genNav && genNav.offsetParent !== null) {
        simulateClick(genNav);
        await sleep(2000);
      }
    }

    // 找到工具栏中的类型选择器 (第一个 .lv-select, 带有 type-select-* 类)
    const toolbar2 = findToolbar();
    if (!toolbar2) {
      throw new Error('未找到工具栏，请确认已打开即梦AI生成页面');
    }

    const selects = toolbar2.querySelectorAll('.lv-select');
    if (selects.length === 0) {
      throw new Error('工具栏中未找到选择器');
    }

    // 检查类型选择器 (第一个 select, 通常带 type-select-* class)
    const typeSelect = selects[0];
    const currentType = typeSelect.textContent.trim();
    console.log(`[Seedance批量] 当前创作类型: "${currentType}"`);

    if (isVideoGenerationType(currentType)) {
      console.log('[Seedance批量] 已在视频生成模式');
      return true;
    }

    // 点击类型选择器打开下拉
    console.log('[Seedance批量] 切换到视频生成模式...');
    simulateClick(typeSelect);
    await sleep(500);

    // 在弹出的选项中找到 "视频生成"
    const options = document.querySelectorAll('.lv-select-option');
    let clicked = false;
    for (const opt of options) {
      const text = opt.textContent.trim();
      if (isVideoGenerationType(text)) {
        simulateClick(opt);
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      // 备用: 找全局弹出的下拉选项
      const allOpts = document.querySelectorAll('[class*="select-option-label"]');
      for (const opt of allOpts) {
        if (isVideoGenerationType(opt.textContent) && opt.offsetParent !== null) {
          simulateClick(opt);
          clicked = true;
          break;
        }
      }
    }

    if (!clicked) {
      if (isUsableGenerationWorkspace()) {
        console.log('[Seedance批量] 未找到视频生成选项，但当前页面已有提示词框和生成按钮，继续执行');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return true;
      }
      // 关闭下拉
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      throw new Error('未找到"视频生成"选项');
    }

    // 等待页面切换
    await sleep(2000);

    // 验证切换成功
    const toolbar3 = findToolbar();
    if (toolbar3) {
      const newSelects = toolbar3.querySelectorAll('.lv-select');
      const newType = newSelects[0]?.textContent.trim();
      if (isVideoGenerationType(newType)) {
        console.log('[Seedance批量] 成功切换到视频生成模式');
        return true;
      }
    }

    console.warn('[Seedance批量] 切换后类型验证失败，继续尝试...');
    return true;
  }

  // ============================================================
  // Helper: base64 转 File
  // ============================================================
  function base64ToFile(base64Data, filename, mimeType) {
    const arr = base64Data.split(',');
    const bstr = atob(arr[1]);
    const n = bstr.length;
    const u8arr = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      u8arr[i] = bstr.charCodeAt(i);
    }
    return new File([u8arr], filename, { type: mimeType });
  }

  // ============================================================
  // Helper: 查找提示词输入框 (必须可见)
  // ============================================================
  // ============================================================
  // Helper: 查找提示词编辑器 (TipTap/ProseMirror contenteditable)
  // ============================================================
  function findPromptEditor() {
    // 即梦AI 使用 TipTap/ProseMirror 富文本编辑器
    // 结构: div[class*="main-content-"] > div[class*="prompt-editor-container-"]
    //        > div[class*="prompt-editor-"]:not([class*="sizer"])
    //          > div[contenteditable="true"].tiptap.ProseMirror

    // 方法1: 在 prompt-editor 容器中找 (排除 sizer)
    const editorWrappers = document.querySelectorAll('[class*="prompt-editor-"]:not([class*="sizer"])');
    for (const wrapper of editorWrappers) {
      const editor = wrapper.querySelector('div[contenteditable="true"].tiptap.ProseMirror');
      if (editor && editor.offsetParent !== null && !editor.closest('#seedance-drawer-container')) {
        const rect = editor.getBoundingClientRect();
        if (rect.width > 50 && rect.height > 10) {
          return editor;
        }
      }
    }

    // 方法2: 直接在 main-content 中找 contenteditable
    const mainContent = document.querySelector('[class*="main-content-"]');
    if (mainContent) {
      const editors = mainContent.querySelectorAll('div[contenteditable="true"].tiptap');
      for (const editor of editors) {
        // 排除 sizer 中的 (sizer 用于高度计算，不是真正的输入)
        if (editor.closest('[class*="sizer"]')) continue;
        if (editor.offsetParent !== null) {
          const rect = editor.getBoundingClientRect();
          if (rect.width > 50 && rect.height > 10) {
            return editor;
          }
        }
      }
    }

    // 方法3: 全局查找 ProseMirror 编辑器 (排除 sizer 和抽屉)
    const allEditors = document.querySelectorAll('div[contenteditable="true"].ProseMirror');
    for (const editor of allEditors) {
      if (editor.closest('[class*="sizer"]')) continue;
      if (editor.closest('#seedance-drawer-container')) continue;
      if (editor.offsetParent !== null) {
        const rect = editor.getBoundingClientRect();
        if (rect.width > 50 && rect.height > 10) {
          return editor;
        }
      }
    }

    // 方法4: 兜底 — 找任何 contenteditable (排除 sizer 和抽屉)
    const allContentEditable = document.querySelectorAll('div[contenteditable="true"]');
    for (const editor of allContentEditable) {
      if (editor.closest('[class*="sizer"]')) continue;
      if (editor.closest('#seedance-drawer-container')) continue;
      if (editor.offsetParent !== null) {
        const rect = editor.getBoundingClientRect();
        if (rect.width > 50 && rect.height > 10) {
          return editor;
        }
      }
    }

    return null;
  }

  // 保留旧函数名兼容
  function findPromptTextarea() {
    return findPromptEditor();
  }

  // ============================================================
  // Helper: 查找上传入口 (file input)
  // ============================================================
  function findUploadTarget() {
    const inputs = document.querySelectorAll('input[type="file"]');
    
    // 优先选择 parent reference-upload 容器可见的 file input
    // 页面上有多个 display:none 的 file input, 只有一个的父容器是可见的
    let bestMatch = null;
    let fallbackMatch = null;
    
    for (const input of inputs) {
      const acceptsMedia = input.accept && (input.accept.includes('image') || input.accept.includes('video'));
      if (!acceptsMedia) continue;
      
      // 检查 reference-upload 父容器是否可见
      const refParent = input.closest('[class*="reference-upload"]');
      if (refParent) {
        const rect = refParent.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          console.log(`[Seedance批量] findUploadTarget: 选择可见容器中的 input, parent rect=(${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)}x${Math.round(rect.height)})`);
          bestMatch = input;
          break;
        }
      }
      
      // 备选: 检查 input 自身或任意祖先是否可见
      if (!fallbackMatch) {
        // 逐级往上找到第一个有尺寸的容器
        let el = input.parentElement;
        while (el && el !== document.body) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            fallbackMatch = input;
            break;
          }
          el = el.parentElement;
        }
      }
    }
    
    if (bestMatch) return bestMatch;
    if (fallbackMatch) {
      console.log('[Seedance批量] findUploadTarget: 使用 fallback 可见祖先 input');
      return fallbackMatch;
    }
    
    // 最后的 fallback: 返回最后一个 accept media 的 input (通常靠后的是可见区域的)
    for (let i = inputs.length - 1; i >= 0; i--) {
      const input = inputs[i];
      if (input.accept && (input.accept.includes('image') || input.accept.includes('video'))) {
        console.log('[Seedance批量] findUploadTarget: 使用最后一个 media input (fallback)');
        return input;
      }
    }
    
    if (inputs.length > 0) return inputs[inputs.length - 1];
    return null;
  }

  // ============================================================
  // Helper: 查找生成/提交按钮
  // ============================================================
  function findSubmitButton() {
    // 排除我们自己的抽屉容器
    const exclude = '#seedance-drawer-container';

    // 方法1: 找 submit-button class 的 BUTTON 元素 (注意排除 container div)
    const submitBtns = document.querySelectorAll('button[class*="submit-button"]');
    for (const btn of submitBtns) {
      if (btn.closest(exclude)) continue;
      if (btn.offsetParent !== null) {
        console.log('[Seedance批量] findSubmitButton: 方法1命中 button[class*=submit-button]', btn.className.substring(0, 80));
        return btn;
      }
    }

    // 方法2: 在 submit-button-container 中找 button
    const containers = document.querySelectorAll('[class*="submit-button-container"]');
    for (const container of containers) {
      if (container.closest(exclude)) continue;
      const btn = container.querySelector('button');
      if (btn && btn.offsetParent !== null) {
        console.log('[Seedance批量] findSubmitButton: 方法2命中 container>button', btn.className.substring(0, 80));
        return btn;
      }
    }

    // 方法3: lv-btn-primary 在底部工具栏区域 (y > 600)
    const primaryBtns = document.querySelectorAll('button.lv-btn-primary');
    for (const btn of primaryBtns) {
      if (btn.closest(exclude)) continue;
      const rect = btn.getBoundingClientRect();
      if (rect.top > 600 && rect.width > 20 && rect.height > 20 && btn.offsetParent !== null) {
        console.log('[Seedance批量] findSubmitButton: 方法3命中 lv-btn-primary bottom', btn.className.substring(0, 80), `y=${Math.round(rect.top)}`);
        return btn;
      }
    }

    // 方法4: 找所有 submit 相关的 button
    const allSubmit = document.querySelectorAll('button[class*="submit"]');
    for (const btn of allSubmit) {
      if (btn.closest(exclude)) continue;
      const rect = btn.getBoundingClientRect();
      if (rect.width > 20 && rect.height > 20 && btn.offsetParent !== null) {
        console.log('[Seedance批量] findSubmitButton: 方法4命中 button[class*=submit]', btn.className.substring(0, 80));
        return btn;
      }
    }

    // 方法5: 按文本查找 (限定 bottom 区域，排除导航栏的"生成")
    const candidates = document.querySelectorAll('button, div[role="button"]');
    for (const el of candidates) {
      if (el.closest(exclude)) continue;
      const text = el.textContent.trim();
      if (text === '生成' || text === '立即生成' || text.includes('生成视频')) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 40 && rect.height > 20 && rect.top > 200) {
          console.log('[Seedance批量] findSubmitButton: 方法5命中 text', `"${text}" y=${Math.round(rect.top)}`);
          return el;
        }
      }
    }

    console.warn('[Seedance批量] findSubmitButton: 所有方法均未匹配');
    return null;
  }

  // ============================================================
  // 上传参考图
  // ============================================================
  async function uploadReferenceImage(fileData) {
    const file = base64ToFile(fileData.data, fileData.name, fileData.type);
    console.log(`[Seedance批量] 准备上传参考图: ${fileData.name} (${file.size} bytes, ${file.type})`);

    // 诊断: 列出页面上所有 file input
    const allInputs = document.querySelectorAll('input[type="file"]');
    console.log(`[Seedance批量] 页面中共有 ${allInputs.length} 个 file input:`);
    allInputs.forEach((inp, i) => {
      const rect = inp.getBoundingClientRect();
      console.log(`  [${i}] accept="${inp.accept}" visible=${inp.offsetParent !== null} rect=(${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)}x${Math.round(rect.height)}) parent=${inp.parentElement?.className?.substring(0, 50)}`);
    });

    // 尝试点击"添加参考图"或相关按钮
    const refButtonTexts = ['添加参考图', '上传图片', '添加参考', '上传参考图', '首帧', '尾帧', '添加图片'];
    let clickedRefBtn = false;
    for (const text of refButtonTexts) {
      const btn = findByText('span, div, button, p, a', text);
      if (btn && btn.offsetParent !== null) {
        console.log(`[Seedance批量] 点击参考图按钮: "${text}"`);
        simulateClick(btn);
        clickedRefBtn = true;
        await sleep(800);
        break;
      }
    }
    if (!clickedRefBtn) {
      console.log('[Seedance批量] 未找到"添加参考图"按钮，直接查找 file input');
    }

    // 通过 file input 上传
    const fileInput = findUploadTarget();
    if (fileInput) {
      const parentCls = fileInput.parentElement?.className?.substring(0, 50) || '';
      const refParent = fileInput.closest('[class*="reference-upload"]');
      const refRect = refParent ? refParent.getBoundingClientRect() : null;
      console.log(`[Seedance批量] 找到 file input: accept="${fileInput.accept}" parent="${parentCls}"`);
      if (refRect) {
        console.log(`[Seedance批量] reference-upload 容器 rect=(${Math.round(refRect.x)},${Math.round(refRect.y)},${Math.round(refRect.width)}x${Math.round(refRect.height)})`);
      }
      
      const dt = new DataTransfer();
      dt.items.add(file);
      
      // 使用 Object.getOwnPropertyDescriptor 设置 files (兼容 React/框架)
      const nativeInputFileSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'files'
      )?.set;
      if (nativeInputFileSetter) {
        nativeInputFileSetter.call(fileInput, dt.files);
        console.log('[Seedance批量] 使用 native setter 设置 files');
      } else {
        fileInput.files = dt.files;
        console.log('[Seedance批量] 使用直接赋值设置 files');
      }
      
      // 触发多种事件以确保框架捕获
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      fileInput.dispatchEvent(new Event('input', { bubbles: true }));
      console.log(`[Seedance批量] 已通过 input 上传: ${fileData.name}, files.length=${fileInput.files.length}`);
      await sleep(2000);

      // 验证上传是否成功: 检查页面中是否出现了预览图
      const hasPreview = !!document.querySelector(
        '[class*="preview-container"], [class*="preview-image"], img[src*="blob:"], ' +
        '[class*="uploaded"], [class*="image-preview"], ' + 
        '[class*="reference-image-"], [class*="reference-item-"]'
      );
      console.log(`[Seedance批量] 上传后预览检测: ${hasPreview}`);

      return true;
    }

    // 尝试拖放上传
    console.log('[Seedance批量] 未找到 file input，尝试拖放上传...');
    const dropSelectors = [
      '[class*="reference-upload"]',
      '[class*="upload-area"]',
      '[class*="drop-zone"]',
      '[class*="upload"]',
      '[class*="drop"]',
      '[class*="reference"]',
    ];
    for (const sel of dropSelectors) {
      const dropZone = document.querySelector(sel);
      if (dropZone && dropZone.offsetParent !== null) {
        const dtTransfer = new DataTransfer();
        dtTransfer.items.add(file);

        dropZone.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dtTransfer }));
        dropZone.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dtTransfer }));
        dropZone.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dtTransfer }));
        console.log(`[Seedance批量] 已通过拖放上传: ${fileData.name} (${sel})`);
        await sleep(2000);
        return true;
      }
    }

    throw new Error('未找到上传入口 (无 file input，无拖放区域)');
  }

  // ============================================================
  // 填写提示词
  // ============================================================
  async function setPrompt(prompt) {
    if (!prompt) return;

    const editor = findPromptEditor();
    if (!editor) {
      console.warn('[Seedance批量] 未找到提示词编辑器');
      return;
    }

    console.log(`[Seedance批量] 找到提示词编辑器: tag=${editor.tagName} cls=${editor.className.substring(0, 60)}`);
    console.log(`[Seedance批量] 要填入的提示词: "${prompt.substring(0, 40)}"`);

    // 辅助: 获取编辑器当前文本内容 (从 <p> 标签读取)
    function getEditorText() {
      const p = editor.querySelector('p');
      return (p ? p.textContent : editor.textContent) || '';
    }

    // 辅助: 检查提示词是否已正确填入
    function isPromptSet() {
      const text = getEditorText();
      return text.includes(prompt.substring(0, Math.min(10, prompt.length)));
    }

    // Step 1: 点击编辑器获得焦点
    editor.scrollIntoView({ block: 'center' });
    await sleep(200);
    simulateClick(editor);
    await sleep(300);
    editor.focus();
    await sleep(200);

    // Step 2: 选中全部内容 (Ctrl+A)
    editor.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true, cancelable: true,
    }));
    document.execCommand('selectAll', false, null);
    editor.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true,
    }));
    await sleep(200);

    // Step 3: 用 Backspace 删除所有选中内容
    const currentText = getEditorText();
    if (currentText.length > 0) {
      // 先尝试 execCommand delete 删除选中
      document.execCommand('delete', false, null);
      await sleep(200);

      // 如果还有内容，逐字 Backspace
      let remaining = getEditorText();
      let maxDelete = remaining.length + 5;
      while (remaining.length > 0 && maxDelete > 0) {
        editor.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Backspace', code: 'Backspace', keyCode: 8, bubbles: true, cancelable: true,
        }));
        editor.dispatchEvent(new InputEvent('beforeinput', {
          inputType: 'deleteContentBackward', bubbles: true, cancelable: true,
        }));
        document.execCommand('delete', false, null);
        editor.dispatchEvent(new InputEvent('input', {
          inputType: 'deleteContentBackward', bubbles: true,
        }));
        editor.dispatchEvent(new KeyboardEvent('keyup', {
          key: 'Backspace', code: 'Backspace', keyCode: 8, bubbles: true,
        }));
        await sleep(10);
        remaining = getEditorText();
        maxDelete--;
      }
      await sleep(200);
      console.log(`[Seedance批量] 清空后编辑器内容: "${getEditorText()}"`);
    }

    // Step 4: 逐字键盘输入提示词
    for (const char of prompt) {
      // keydown
      editor.dispatchEvent(new KeyboardEvent('keydown', {
        key: char, code: `Key${char.toUpperCase()}`,
        keyCode: char.charCodeAt(0), bubbles: true, cancelable: true,
      }));
      // beforeinput
      editor.dispatchEvent(new InputEvent('beforeinput', {
        data: char, inputType: 'insertText', bubbles: true, cancelable: true,
      }));
      // 使用 execCommand insertText 让 ProseMirror 处理
      document.execCommand('insertText', false, char);
      // input
      editor.dispatchEvent(new InputEvent('input', {
        data: char, inputType: 'insertText', bubbles: true,
      }));
      // keyup
      editor.dispatchEvent(new KeyboardEvent('keyup', {
        key: char, code: `Key${char.toUpperCase()}`,
        keyCode: char.charCodeAt(0), bubbles: true,
      }));
      await sleep(15);
    }
    await sleep(500);

    // Step 5: 验证结果
    const resultText = getEditorText();
    console.log(`[Seedance批量] 输入后 <p> 内容: "${resultText.substring(0, 50)}"`);

    if (isPromptSet()) {
      console.log('[Seedance批量] ✅ 提示词已成功设置 (键盘逐字输入)');
      return;
    }

    // ---- 兜底方式: 直接操作 ProseMirror DOM ----
    console.log('[Seedance批量] 键盘输入未生效，尝试直接操作 DOM...');
    const p = editor.querySelector('p');
    if (p) {
      p.textContent = prompt;
    } else {
      editor.innerHTML = `<p>${prompt}</p>`;
    }
    // 触发 input 事件让 ProseMirror 同步状态
    editor.dispatchEvent(new InputEvent('input', {
      data: prompt, inputType: 'insertText', bubbles: true,
    }));
    await sleep(500);

    const finalText = getEditorText();
    console.log(`[Seedance批量] DOM 操作后 <p> 内容: "${finalText.substring(0, 50)}"`);

    if (finalText.includes(prompt.substring(0, Math.min(10, prompt.length)))) {
      console.log('[Seedance批量] ✅ 提示词已设置 (DOM 直接操作)');
    } else {
      console.warn(`[Seedance批量] ⚠️ 提示词填充可能失败! 当前内容: "${finalText.substring(0, 50)}"`);
    }
  }

  // ============================================================
  // 从 @ 弹窗读取 UUID + 构建带 mention 的文档
  // 通过 mention-main-world.js (MAIN world 脚本, manifest 注册) 执行
  // 使用 window.postMessage 跨 world 通信
  // segments: 已解析的段落数组 [{type, value, fileIndex?}, ...]
  // ============================================================
  function insertDocWithMentionUUIDs(resolvedSegments) {
    return new Promise((resolve) => {
      const eventName = '__seedance_mention_doc_' + Date.now();

      // 监听 MAIN world 通过 window.postMessage 返回的结果
      const handler = (e) => {
        if (!e.data || e.data.type !== eventName) return;
        window.removeEventListener('message', handler);
        clearTimeout(timeoutId);
        const detail = e.data.detail || { success: false, error: 'no detail' };
        console.log(`[Seedance批量] [Mention] postMessage 收到结果: success=${detail.success}, mention=${detail.mentionCount || 0}, uuid=${detail.uuidCount || 0}`);
        resolve(detail);
      };
      window.addEventListener('message', handler);

      // 发送消息给 MAIN world 脚本 (mention-main-world.js)
      console.log(`[Seedance批量] [Mention] 发送构建请求到 MAIN world, segments=${resolvedSegments.length}`);
      window.postMessage({
        type: 'seedance-build-mention-doc',
        segments: resolvedSegments,
        eventName: eventName,
      }, '*');

      // 全局超时 (MAIN world 中的 setTimeout 链可能需要 ~12s)
      const timeoutId = setTimeout(() => {
        window.removeEventListener('message', handler);
        console.warn('[Seedance批量] [Mention] 超时 (25s)');
        resolve({ success: false, error: 'timeout (25s)' });
      }, 25000);
    });
  }

  // ============================================================
  // 填写提示词（支持 @mention 引用）
  // 用户提示词中 "(@filename.ext)" 会被转换为对应的 @图片N/@视频N mention 节点
  // 流程:
  //   1. 根据上传文件列表, 建立 filename → 图片N/视频N 的映射
  //   2. 解析提示词中的 (@xxx) 引用
  //   3. 将 filename 查找映射表, 转换为 "图片N" 标签
  //   4. 发送给 MAIN world, 由 MAIN world 触发 @ 弹窗读取 UUID
  //   5. MAIN world 按 "图片N" 标签匹配弹窗选项, 获取 UUID, 创建 mention 节点
  // ============================================================
  async function setPromptWithMentions(promptRaw, fileList) {
    if (!promptRaw) return;

    const editor = findPromptEditor();
    if (!editor) {
      console.warn('[Seedance批量] 未找到提示词编辑器');
      return;
    }

    console.log(`[Seedance批量] [Mention] 原始提示词: "${promptRaw.substring(0, 120)}"`);

    // ----------------------------------------------------------------
    // Step 1: 构建 filename → "图片N"/"视频N" 的映射
    // ----------------------------------------------------------------
    function sanitizeFileName(name) {
      return name.replace(/[()（）\[\]【】{}｛｝]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    }

    // fileNameToLabel: 各种可能的文件名形式 → 对应的 "图片N"/"视频N"
    const fileNameToLabel = new Map();
    let imgCounter = 0;
    let vidCounter = 0;

    if (fileList && fileList.length > 0) {
      for (let i = 0; i < fileList.length; i++) {
        const fd = fileList[i];
        const rawName = fd.name;
        const fname = sanitizeFileName(rawName);
        const isVideo = fd.type && fd.type.startsWith('video/');
        const label = isVideo ? `视频${++vidCounter}` : `图片${++imgCounter}`;

        // 注册各种可能的名称形式, 全部指向同一个 label
        const variants = new Set([rawName, fname]);
        // 不含扩展名的形式
        const rawNoExt = rawName.replace(/\.[^.]+$/, '');
        const fnameNoExt = fname.replace(/\.[^.]+$/, '');
        if (rawNoExt !== rawName) variants.add(rawNoExt);
        if (fnameNoExt !== fname) variants.add(fnameNoExt);
        // label 本身也可以直接引用
        variants.add(label);

        for (const v of variants) {
          fileNameToLabel.set(v, label);
          fileNameToLabel.set(v.toLowerCase(), label); // 大小写不敏感
        }

        console.log(`[Seedance批量] [Mention] 文件[${i}]: "${rawName}" → "${label}"`);
      }
    }

    // ----------------------------------------------------------------
    // Step 2: 解析提示词中的 @mention
    // 支持: (@xxx), （@xxx）, @xxx
    // ----------------------------------------------------------------
    const mentionRegex = /[（(]@(.+?)[）)]|@([^\s，。！？；：、,.!?;:()（）【】\[\]]+)/g;
    const segments = [];
    let lastIndex = 0;
    let match;
    while ((match = mentionRegex.exec(promptRaw)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: 'text', value: promptRaw.substring(lastIndex, match.index) });
      }
      const mentionValue = match[1] || match[2];
      segments.push({ type: 'mention', value: mentionValue });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < promptRaw.length) {
      segments.push({ type: 'text', value: promptRaw.substring(lastIndex) });
    }

    console.log(`[Seedance批量] [Mention] 解析得到 ${segments.length} 个段落:`);
    segments.forEach((s, i) => console.log(`  [${i}] ${s.type}: "${s.value.substring(0, 60)}"`));

    // 如果没有 mention，直接用普通 setPrompt
    if (!segments.some(s => s.type === 'mention')) {
      console.log('[Seedance批量] [Mention] 无 @mention，使用普通 setPrompt');
      await setPrompt(promptRaw);
      return;
    }

    // ----------------------------------------------------------------
    // Step 3: 将每个 mention 的 filename 转换为 "图片N" 标签
    // ----------------------------------------------------------------
    const resolvedSegments = segments.map(seg => {
      if (seg.type !== 'mention') return seg;

      // 查找文件名对应的标签
      let label = fileNameToLabel.get(seg.value) || fileNameToLabel.get(seg.value.toLowerCase());

      if (!label) {
        // 如果用户直接写了 @图片1 或 @视频1, 直接使用
        if (/^(图片|视频)\d+$/.test(seg.value)) {
          label = seg.value;
        } else {
          // 未找到映射, 不处理为 mention, 保留原文
          console.warn(`[Seedance批量] [Mention] "${seg.value}" 未在文件列表中找到, 保留原文不处理`);
          return { type: 'text', value: `(@${seg.value})` };
        }
      }

      console.log(`[Seedance批量] [Mention] (@${seg.value}) → @${label}`);
      return { type: 'mention', value: seg.value, label: label };
    });

    // ----------------------------------------------------------------
    // Step 4: 发送给 MAIN world, 由它触发 @ 弹窗并构建文档
    // ----------------------------------------------------------------
    const result = await insertDocWithMentionUUIDs(resolvedSegments);

    if (result.success) {
      console.log(`[Seedance批量] [Mention] ✅ 提示词插入成功`);
      console.log(`[Seedance批量] [Mention] 编辑器内容: "${result.text?.substring(0, 80)}"`);
      console.log(`[Seedance批量] [Mention] mention=${result.mentionCount}, uuid=${result.uuidCount}`);
    } else {
      console.warn(`[Seedance批量] [Mention] ⚠️ 插入失败: ${result.error}`);
      console.log('[Seedance批量] [Mention] 回退: 使用普通 setPrompt (不含 mention 标签)');
      const plainText = promptRaw.replace(/[（(]@(\S+?)[）)]/g, '$1').replace(/@([^\s，。！？；：、,.!?;:()（）【】\[\]]+)/g, '$1');
      await setPrompt(plainText);
    }
  }

  // ============================================================
  // doGenerate: 清除旧图 → 一次性上传所有参考文件 → 填写提示词（不点击生成）
  // files: 文件数据数组 [{name, data, type}, ...]
  // prompt: 提示词文本（支持 @mention）
  // ============================================================
  async function doGenerate(msg) {
    const { files, fileData, prompt, aspectRatio } = msg;

    // 兼容旧的单文件调用方式
    const fileList = files || (fileData ? [fileData] : []);

    isProcessing = true;
    currentTaskIndex = 0;

    try {
      console.log(`[Seedance批量] [doGenerate] 开始: ${fileList.length} 个文件`);
      console.log(`[Seedance批量] [doGenerate] 提示词: "${prompt || '(无)'}"`);

      // Step 0: 确保在视频生成模式
      await ensureVideoGenerationMode();
      await sleep(500);

      // 保存当前比例 (上传前), 用于后续恢复
      const toolbarBefore = findToolbar();
      const ratioBtnBefore = toolbarBefore?.querySelector('button[class*="toolbar-button"]');
      const savedRatio = aspectRatio || ratioBtnBefore?.textContent?.trim();
      console.log(`[Seedance批量] [doGenerate] 当前比例: "${savedRatio}"`);

      // 启动比例监控 (后台轮询, 上传导致 React 重渲染时自动恢复比例)
      if (savedRatio && savedRatio !== '1:1') {
        startRatioWatcher(savedRatio, 30000);
      }

      // Step 1: 清除所有已上传的参考图
      console.log('[Seedance批量] [doGenerate] Step 1: 清除所有已上传的参考图');
      await clearAllReferenceImages();
      // 等待页面刷新UI (清除后可能重新渲染上传区域)
      await sleep(500);

      // Step 2: 上传所有参考文件 (逐个到各自槽位)
      if (fileList.length > 0) {
        console.log(`[Seedance批量] [doGenerate] Step 2: 上传 ${fileList.length} 个文件`);
        await uploadAllReferenceFiles(fileList);
        console.log(`[Seedance批量] [doGenerate] Step 2 完成: 已上传 ${fileList.length} 个文件`);
        // 等待服务器处理完上传的文件 (生成 UUID 等), 否则 @ 弹窗中可能找不到引用
        console.log('[Seedance批量] [doGenerate] 等待上传处理完成...');
        await sleep(1500);
      } else {
        console.log('[Seedance批量] [doGenerate] Step 2: 无参考文件，跳过');
      }

      // Step 3: 填写提示词（@mention 会自动映射到上传顺序）
      if (prompt) {
        console.log('[Seedance批量] [doGenerate] Step 3: 填写提示词 (含 @mention 解析)');
        await setPromptWithMentions(prompt, fileList);

        // 验证
        const editor = findPromptEditor();
        if (editor) {
          const currentText = (editor.querySelector('p')?.textContent || editor.textContent || '');
          console.log(`[Seedance批量] [doGenerate] Step 3 完成, 编辑器内容: "${currentText.substring(0, 60)}"`);
        }
      } else {
        console.log('[Seedance批量] [doGenerate] Step 3: 无提示词，跳过');
      }

      // 不点击生成按钮，仅上传并填写提示词
      // 比例恢复由 ratioWatcher 后台处理 (持续 30 秒)
      console.log(`[Seedance批量] [doGenerate] ✅ 全部完成: ${fileList.length} 个文件已上传, 提示词已填写`);
    } finally {
      isProcessing = false;
      currentTaskIndex = -1;
    }
  }

  // ============================================================
  // 上传所有参考文件
  // 策略: 通过 postMessage 委托给 MAIN world (mention-main-world.js)
  // 因为 React 的 __reactProps$/onChange 只在 MAIN world 可访问
  // ============================================================
  async function uploadAllReferenceFiles(fileList) {
    console.log(`[Seedance批量] 准备上传 ${fileList.length} 个文件: ${fileList.map(f => f.name).join(', ')}`);

    // --- 诊断: 输出页面上传控件信息 ---
    const diagInputs = document.querySelectorAll('input[type="file"]');
    console.log(`[Seedance批量] 🔍 诊断: 页面共有 ${diagInputs.length} 个 file input`);
    diagInputs.forEach((inp, i) => {
      const refP = inp.closest('[class*="reference-upload"]');
      const upP = inp.closest('[class*="upload"]');
      const parent = refP || upP || inp.parentElement;
      const pRect = parent?.getBoundingClientRect();
      console.log(`[Seedance批量]   input[${i}]: accept="${inp.accept}", refParent=${!!refP}, uploadParent=${!!upP}, parentVisible=${pRect ? (pRect.width > 0 && pRect.height > 0) : false}`);
    });

    // 准备 base64 文件数据 (提取纯 base64, 去掉 data:xxx;base64, 前缀)
    const filesData = fileList.map(fd => {
      const base64Raw = fd.data.includes(',') ? fd.data.split(',')[1] : fd.data;
      return {
        base64: base64Raw,
        name: fd.name,
        mimeType: fd.type || 'image/png'
      };
    });

    console.log(`[Seedance批量] 文件数据准备完成, 大小: ${filesData.map(f => Math.round(f.base64.length * 0.75 / 1024) + 'KB').join(', ')}`);

    // 通过 postMessage 发送到 MAIN world
    const eventName = 'seedance-upload-result-' + Date.now();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('message', handler);
        console.error('[Seedance批量] ❌ MAIN world 文件上传超时 (15秒)');
        reject(new Error('MAIN world 文件上传超时'));
      }, 15000);

      function handler(e) {
        if (!e.data || e.data.type !== eventName) return;
        window.removeEventListener('message', handler);
        clearTimeout(timeout);

        const detail = e.data.detail;
        if (detail && detail.success) {
          console.log(`[Seedance批量] ✅ MAIN world 上传成功: ${detail.fileCount} 个文件, reactOnChange=${detail.reactOnChangeCalled}`);
          resolve(true);
        } else {
          console.error(`[Seedance批量] ❌ MAIN world 上传失败: ${detail?.error || '未知错误'}`);
          reject(new Error(detail?.error || 'MAIN world upload failed'));
        }
      }

      window.addEventListener('message', handler);

      // 发送上传请求到 MAIN world
      console.log(`[Seedance批量] 📤 发送文件到 MAIN world (eventName=${eventName})`);
      window.postMessage({
        type: 'seedance-upload-files',
        filesData: filesData,
        eventName: eventName
      }, '*');
    });
  }

  // ============================================================
  // 点击生成按钮
  // ============================================================
  async function clickGenerate() {
    const btn = findSubmitButton();
    if (!btn) {
      // 诊断信息
      const allBtns = document.querySelectorAll('button');
      const btnTexts = Array.from(allBtns).slice(0, 20).map(b => `"${b.textContent.trim().substring(0, 20)}" class=${b.className.substring(0, 40)}`);
      console.error('[Seedance批量] 未找到生成按钮! 页面上的按钮:', btnTexts.join(' | '));
      throw new Error('未找到生成按钮，请确认页面处于视频生成模式');
    }

    const rect = btn.getBoundingClientRect();
    const btnText = btn.textContent.trim().substring(0, 20) || '(icon-only)';
    const isDisabled = btn.disabled || btn.classList.contains('lv-btn-disabled') || btn.getAttribute('aria-disabled') === 'true';
    console.log(`[Seedance批量] 找到生成按钮: tag=${btn.tagName} text="${btnText}" class="${btn.className.substring(0, 80)}" rect=(${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)}x${Math.round(rect.height)}) disabled=${isDisabled}`);

    if (isDisabled) {
      console.warn('[Seedance批量] 生成按钮当前禁用，尝试移除 disabled 后点击');
      // 临时移除禁用状态
      btn.disabled = false;
      btn.classList.remove('lv-btn-disabled');
      btn.removeAttribute('aria-disabled');
      await sleep(100);
    }

    const resultAnchor = buildSeedanceResultAnchor();

    // 尝试1: 通过 React __reactProps$ 直接调用 onClick
    let reactClicked = false;
    const reactPropsKey = Object.keys(btn).find(k => k.startsWith('__reactProps$'));
    if (reactPropsKey && btn[reactPropsKey]?.onClick) {
      try {
        console.log('[Seedance批量] 通过 React props onClick 直接调用');
        const syntheticEvent = { preventDefault: () => {}, stopPropagation: () => {}, target: btn, currentTarget: btn, nativeEvent: new MouseEvent('click') };
        btn[reactPropsKey].onClick(syntheticEvent);
        reactClicked = true;
      } catch (e) {
        console.warn('[Seedance批量] React onClick 调用失败:', e.message);
      }
    }

    // 尝试2: 使用增强点击: PointerEvent + MouseEvent + native click
    if (!reactClicked) {
      console.log('[Seedance批量] 使用 simulateClickEnhanced 点击');
    }
    simulateClickEnhanced(btn);

    // 如果之前是禁用状态，恢复
    if (isDisabled) {
      await sleep(500);
      // 不恢复禁用 —— 如果生成成功，页面会自己管理状态
    }

    console.log(`[Seedance批量] 已点击生成按钮 (react=${reactClicked})`);
    await sleep(2000);
    return {
      detail: `tag=${btn.tagName} text="${btnText}" pos=(${Math.round(rect.x)},${Math.round(rect.y)}) react=${reactClicked} wasDisabled=${isDisabled}`,
      resultAnchor,
    };
  }

  // 增强版点击: 包含 PointerEvent (React 17+ 需要)
  function simulateClickEnhanced(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const evtInit = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse' };
    el.dispatchEvent(new PointerEvent('pointerdown', evtInit));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    el.dispatchEvent(new PointerEvent('pointerup', evtInit));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    // 兜底: native click
    el.click();
  }

  function collectSeedanceGenerationRecords() {
    const selectors = [
      '[class*="video-record-"]',
      '[class*="ai-generated-record"]',
      '[class*="record-list"] [class*="record"]',
      '[class*="history"] [class*="record"]',
    ];
    const seen = new Set();
    const records = [];
    const promptEditor = findPromptEditor();
    const promptTextarea = findPromptTextarea();
    const submitButton = findSubmitButton();
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        if (!el || seen.has(el) || el.closest('#seedance-drawer-container')) continue;
        if (
          (promptEditor && el.contains(promptEditor)) ||
          (promptTextarea && el.contains(promptTextarea)) ||
          (submitButton && el.contains(submitButton))
        ) {
          continue;
        }
        if (typeof el.getBoundingClientRect !== 'function') continue;
        const rect = el.getBoundingClientRect();
        if (isSeedanceBroadRecordContainer(el, rect)) continue;
        const text = String(el.textContent || '').trim();
        const hasMedia = !!el.querySelector('video, img, canvas, [class*="progress"], [class*="loading"], [class*="error"], [class*="fail"], [class*="retry"]');
        if (!hasMedia && !text) continue;
        seen.add(el);
        records.push({ el, rect, text });
      }
    }
    return records
      .filter(({ rect }) => rect.width > 0 && rect.height > 0)
      .sort((a, b) => {
        const byTop = a.rect.top - b.rect.top;
        if (Math.abs(byTop) > 4) return byTop;
        return a.rect.left - b.rect.left;
      });
  }

  function buildSeedanceRecordSignature(record) {
    if (!record) return '';
    const text = String(record.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    const media = Array.from(record.querySelectorAll('video, img, source'))
      .map((el) => String(el.src || el.currentSrc || el.getAttribute?.('src') || '').trim())
      .filter(Boolean)
      .slice(0, 4)
      .join('|');
    const rect = typeof record.getBoundingClientRect === 'function' ? record.getBoundingClientRect() : null;
    const shape = rect ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : '';
    return `${text}::${media}::${shape}`;
  }

  function buildSeedanceResultAnchor() {
    const records = collectSeedanceGenerationRecords();
    const anchorToken = `seedance-anchor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    records.forEach(({ el }) => {
      try {
        const signature = buildSeedanceRecordSignature(el);
        el.setAttribute(SEEDANCE_RECORD_ANCHOR_ATTR, anchorToken);
        el.setAttribute(SEEDANCE_RECORD_SIGNATURE_ATTR, signature);
      } catch (err) {
        // Ignore DOM nodes that cannot be marked.
      }
    });
    return {
      recordCount: records.length,
      recordSignatures: records.map(({ el }) => buildSeedanceRecordSignature(el)).filter(Boolean),
      anchorToken,
      capturedAt: Date.now(),
      visibleErrorText: extractVisibleSeedanceErrorText(document),
      latestText: records[0]?.text?.slice(0, 160) || '',
    };
  }

  function normalizeSeedancePromptText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function normalizeSeedancePromptMarker(value) {
    return String(value || '')
      .trim()
      .replace(/^\[\[\s*/, '')
      .replace(/\s*\]\]$/, '')
      .toUpperCase();
  }

  function extractSeedancePromptMarkers(value) {
    const text = String(value || '');
    const markers = [];
    const markerPattern = /\[\[\s*(HY[A-Z0-9]{4,8}A\d{3,4})\s*\]\]/gi;
    let match = null;
    while ((match = markerPattern.exec(text)) !== null) {
      markers.push(normalizeSeedancePromptMarker(match[1]));
    }
    return markers;
  }

  function recordMatchesExpectedPromptMarker(record, expectedPromptMarker = '') {
    const expected = normalizeSeedancePromptMarker(expectedPromptMarker);
    if (!expected) return false;
    const markers = extractSeedancePromptMarkers(record?.textContent || '');
    return markers.length > 0 && markers[markers.length - 1] === expected;
  }

  function getSeedancePromptMatchWords(prompt) {
    const stopWords = new Set([
      'with', 'that', 'this', 'from', 'into', 'onto', 'over', 'under', 'slowly',
      'cinematic', 'shallow', 'depth', 'field', 'soft', 'light', 'morning',
      'video', 'scene', 'shot', 'high', 'quality', 'style',
    ]);
    return normalizeSeedancePromptText(prompt)
      .split(/[\s,.;:!?，。；：！？、"'“”‘’()（）-]+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 4 && !/^\d+$/.test(word) && !stopWords.has(word))
      .slice(0, 10);
  }

  function recordMatchesExpectedPrompt(record, expectedPrompt = '') {
    const prompt = normalizeSeedancePromptText(expectedPrompt);
    if (!prompt) return false;
    const text = normalizeSeedancePromptText(record?.textContent || '');
    if (!text) return false;
    if (text.includes(prompt)) return true;
    const head = prompt.slice(0, Math.min(32, prompt.length));
    if (head.length >= 16 && text.includes(head)) return true;
    const words = getSeedancePromptMatchWords(prompt);
    if (words.length >= 5) {
      const matched = words.filter((word) => text.includes(word)).length;
      return matched >= Math.min(5, words.length);
    }
    if (words.length >= 3) {
      const matched = words.filter((word) => text.includes(word)).length;
      return matched === words.length;
    }
    return false;
  }

  function normalizeSeedanceExpectedDuration(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const match = raw.match(/\d+(?:\.\d+)?/);
    if (!match) return raw.toLowerCase();
    const duration = Math.trunc(Number(match[0]));
    return Number.isFinite(duration) && duration > 0 ? `${duration}s` : raw.toLowerCase();
  }

  function recordMatchesExpectedDuration(record, expectedDuration = '') {
    const normalized = normalizeSeedanceExpectedDuration(expectedDuration);
    if (!normalized) return true;
    const numberText = normalized.match(/\d+/)?.[0] || '';
    if (!numberText) return false;
    const text = String(record?.textContent || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/(seedance\s*2\.0(?:\s*(?:fast|vip))?)(?=\d+\s*(?:s|sec|secs|second|seconds|秒))/gi, '$1 ');
    const durationPattern = new RegExp(`(^|[^\\d.])${numberText}\\s*(?:s|sec|secs|second|seconds|秒)(?![\\d.])`, 'i');
    return durationPattern.test(text);
  }

  function normalizeSeedanceModelText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .toLowerCase()
      .replace(/\bdreamina\b/g, ' ')
      .replace(/[^a-z0-9.]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function extractSeedanceModelKeys(value) {
    const text = normalizeSeedanceModelText(value);
    if (!text) return [];
    const keys = [];
    const modelPattern = /\bseedance\s*2\.0\s*(fast)?\s*(vip)?(?=$|\s|\d)/g;
    let match = null;
    while ((match = modelPattern.exec(text)) !== null) {
      keys.push(`seedance2.0${match[1] ? 'fast' : ''}${match[2] ? 'vip' : ''}`);
    }
    return keys;
  }

  function seedanceModelTextMatches(optionText, targetText) {
    const targetKeys = extractSeedanceModelKeys(targetText);
    if (!targetKeys.length) return true;
    const optionKeys = extractSeedanceModelKeys(optionText);
    return targetKeys.some((targetKey) => optionKeys.includes(targetKey));
  }

  function isExplicitSeedanceFailureText(text) {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    if (!value) return false;
    if (/^(regenerate|generate|retry|try again|more info|edit prompt)$/i.test(value)) {
      return false;
    }
    return /something went wrong|refresh and try again|unusual activity|try again later|community guidelines|prompt may contain content|prompt may contain|may contain inappropriate content|audio may contain inappropriate content|video may contain inappropriate content|image may contain inappropriate content|change it and try again|敏感|违规|违禁|不合规|审核未通过|生成失败|无法生成|不能生成|failed to generate|generation failed|couldn'?t generate|could not generate|unable to generate|policy|violat(?:e|es|ion)|sensitive|blocked|moderation/i.test(value);
  }

  function normalizeSeedanceFailureText(text) {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    if (!value) return '';
    if (/unusual activity|try again later/i.test(value)) {
      return "Couldn't generate due to unusual activity in your account. Try again later.";
    }
    if (/community guidelines|prompt may contain|change it and try again/i.test(value)) {
      return 'The prompt may contain content that violates our Community Guidelines. Change it and try again.';
    }
    if (/something went wrong|refresh and try again/i.test(value)) {
      return 'Something went wrong. Refresh and try again.';
    }
    return value;
  }

  function extractVisibleSeedanceErrorText(root = document) {
    const errorSelectors = [
      '[class*="error"]',
      '[class*="fail"]',
      '[class*="toast"]',
      '[class*="message"]',
      '[role="alert"]',
      '[class*="notice"]',
    ];
    const candidates = [];
    for (const selector of errorSelectors) {
      for (const el of root.querySelectorAll(selector)) {
        if (el.closest('#seedance-drawer-container')) continue;
        if (!isVisibleElement(el)) continue;
        const text = String(el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length < 3 || text.length > 500) continue;
        if (isExplicitSeedanceFailureText(text)) {
          candidates.push(text);
        }
      }
    }
    const bodyText = String(document.body?.innerText || '').replace(/\u00a0/g, ' ');
    const knownMessages = [
      "Couldn't generate due to unusual activity in your account. Try again later.",
      'The prompt may contain content that violates our Community Guidelines. Change it and try again.',
      'Community Guidelines',
      'prompt may contain content',
      'Change it and try again',
      'Something went wrong. Refresh and try again.',
      'Something went wrong',
      'Refresh and try again',
      'unusual activity',
      'Try again later',
      '敏感',
      '违规',
      '生成失败',
      'failed to generate',
      'could not generate',
    ];
    for (const message of knownMessages) {
      if (bodyText.toLowerCase().includes(message.toLowerCase())) {
        if (message === 'unusual activity' || message === 'Try again later') {
          return "Couldn't generate due to unusual activity in your account. Try again later.";
        }
        if (/community guidelines|prompt may contain content|change it and try again/i.test(message)) {
          return 'The prompt may contain content that violates our Community Guidelines. Change it and try again.';
        }
        return message;
      }
    }
    return normalizeSeedanceFailureText(candidates[0] || '');
  }

  function extractSeedanceFailureText(failEl, record = null) {
    const raw = [
      String(failEl?.textContent || ''),
      String(record?.textContent || ''),
    ].join('\n').replace(/\s+/g, ' ').trim();
    const lines = raw
      .split(/(?<=[.!?。！？])\s+|\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const explicitLine = lines.find(isExplicitSeedanceFailureText);
    return normalizeSeedanceFailureText(explicitLine || (isExplicitSeedanceFailureText(raw) ? raw.slice(0, 240) : ''));
  }

  function isSeedanceRecordGenerating(record) {
    if (!record) return false;
    const text = String(record.textContent || '').replace(/\s+/g, ' ').trim();
    if (/造梦中|生成中|处理中|排队中|dreaming|fast queue|loading|generating|processing|queued|rendering|\d{1,3}\s*%/i.test(text)) {
      return true;
    }
    const generatingEl = record.querySelector(
      '[class*="progress"], [class*="loading"], [class*="generating"], [class*="spinner"], [role="progressbar"]'
    );
    return !!(generatingEl && isVisibleElement(generatingEl));
  }

  function extractSeedanceResultInfoFromRecord(record, taskLabel = '海外版任务') {
    if (!record) {
      const pageError = extractVisibleSeedanceErrorText(document);
      if (pageError) {
        return { found: true, status: 'failed', message: pageError };
      }
      return { found: false, status: 'not_found', message: '未找到新的生成记录' };
    }
    const info = extractVideoInfo(record, taskLabel, false);
    if (info.status === 'completed' && info.isImage) {
      return { found: true, status: 'generating', message: '海外版视频结果还没有最终视频' };
    }
    return info;
  }

  function getSeedanceRecordVideoUrl(record) {
    const videoEl = record?.querySelector?.('video');
    const videoSrc = String(videoEl?.src || videoEl?.querySelector?.('source')?.src || '').trim();
    if (!videoSrc) return '';
    if (/record-loading-animation/i.test(videoSrc)) return '';
    return videoSrc;
  }

  function getSeedanceExtensionVersion() {
    try {
      return String(chrome.runtime.getManifest?.().version || '').trim();
    } catch (err) {
      return '';
    }
  }

  function buildSeedanceResultProbe(
    records,
    changedRecords,
    expectedPromptMarker = '',
    expectedDuration = '',
    expectedModel = ''
  ) {
    const allRecords = Array.isArray(records) ? records : [];
    const changed = Array.isArray(changedRecords) ? changedRecords : [];
    const expectedMarker = normalizeSeedancePromptMarker(expectedPromptMarker);
    const markerMatchedRecords = expectedMarker
      ? allRecords.filter(({ el }) => recordMatchesExpectedPromptMarker(el, expectedMarker))
      : [];
    const pageMarkers = Array.from(new Set(
      allRecords.flatMap(({ el }) => extractSeedancePromptMarkers(el?.textContent || ''))
    )).slice(0, 20);
    const changedSamples = changed.slice(0, 8).map(({ el }) => {
      const info = extractSeedanceResultInfoFromRecord(el, '海外版任务');
      const videoUrl = getSeedanceRecordVideoUrl(el);
      return {
        markers: extractSeedancePromptMarkers(el?.textContent || '').slice(-3),
        status: info.status || '',
        generating: isSeedanceRecordGenerating(el),
        hasVideo: Boolean(videoUrl || (info.status === 'completed' && info.videoUrl && !info.isImage)),
        hasImage: Boolean(info.isImage),
        text: String(el?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      };
    });
    return {
      extensionVersion: getSeedanceExtensionVersion(),
      expectedPromptMarker: expectedMarker,
      expectedDuration: normalizeSeedanceExpectedDuration(expectedDuration),
      expectedModel: String(expectedModel || '').trim(),
      recordCount: allRecords.length,
      changedCount: changed.length,
      markerMatchedCount: markerMatchedRecords.length,
      pageHasExpectedMarker: expectedMarker ? markerMatchedRecords.length > 0 : false,
      pageMarkers,
      videoCandidateCount: changedSamples.filter((item) => item.hasVideo).length,
      completedCandidateCount: changedSamples.filter((item) => item.status === 'completed' && item.hasVideo).length,
      generatingCandidateCount: changedSamples.filter((item) => item.generating).length,
      changedSamples,
    };
  }

  function findCompletedSeedanceResultFromRecords(records) {
    const candidates = Array.isArray(records) ? records : [];
    for (const { el } of candidates) {
      const info = extractSeedanceResultInfoFromRecord(el, '海外版任务');
      if (info.status === 'completed' && info.videoUrl) {
        return info;
      }
    }
    return null;
  }

  function findFailedSeedanceResultFromRecords(records) {
    const candidates = Array.isArray(records) ? records : [];
    for (const { el } of candidates) {
      const info = extractSeedanceResultInfoFromRecord(el, '海外版任务');
      if (info.status === 'failed' && info.message) {
        return info;
      }
    }
    return null;
  }

  async function findLatestSeedanceResultAfterSubmit(
    resultAnchor = null,
    expectedPrompt = '',
    expectedModel = '',
    expectedDuration = '',
    expectedPromptMarker = ''
  ) {
    const anchorCount = Number(resultAnchor?.recordCount);
    const records = collectSeedanceGenerationRecords();
    const anchorSignatures = new Set(resultAnchor?.recordSignatures || []);
    const anchorToken = String(resultAnchor?.anchorToken || '').trim();
    const hasExpectedPromptMarker = normalizeSeedancePromptMarker(expectedPromptMarker).length > 0;
    const hasExpectedPrompt = normalizeSeedancePromptText(expectedPrompt).length > 0;
    const changedRecords = records.filter(({ el }) => {
      const signature = buildSeedanceRecordSignature(el);
      const previousSignature = String(el.getAttribute(SEEDANCE_RECORD_SIGNATURE_ATTR) || '').trim();
      if (hasExpectedPromptMarker && !recordMatchesExpectedPromptMarker(el, expectedPromptMarker)) {
        return false;
      }
      if (!hasExpectedPromptMarker && hasExpectedPrompt && !recordMatchesExpectedPrompt(el, expectedPrompt)) {
        return false;
      }
      if (expectedDuration && !recordMatchesExpectedDuration(el, expectedDuration)) {
        return false;
      }
      if (expectedModel && !seedanceModelTextMatches(el.textContent || '', expectedModel)) {
        return false;
      }
      if (
        anchorToken &&
        el.getAttribute(SEEDANCE_RECORD_ANCHOR_ATTR) === anchorToken
      ) {
        const promptMatches = hasExpectedPromptMarker
          ? recordMatchesExpectedPromptMarker(el, expectedPromptMarker)
          : recordMatchesExpectedPrompt(el, expectedPrompt);
        return promptMatches && signature !== previousSignature;
      }
      return !anchorSignatures.has(signature);
    });
    const resultProbe = buildSeedanceResultProbe(
      records,
      changedRecords,
      expectedPromptMarker,
      expectedDuration,
      expectedModel
    );
    const completedResult = findCompletedSeedanceResultFromRecords(changedRecords);
    if (completedResult) {
      completedResult.hasNewRecord = Number.isFinite(anchorCount) ? records.length > anchorCount : true;
      completedResult.resultProbe = resultProbe;
      return completedResult;
    }
    const hasGeneratingCandidate = changedRecords.some(({ el }) => isSeedanceRecordGenerating(el));
    const failedResult = findFailedSeedanceResultFromRecords(changedRecords);
    if (failedResult && !hasGeneratingCandidate) {
      failedResult.hasNewRecord = Number.isFinite(anchorCount) ? records.length > anchorCount : true;
      failedResult.resultProbe = resultProbe;
      return failedResult;
    }
    const pageError = extractVisibleSeedanceErrorText(document);
    const anchorPageError = normalizeSeedanceFailureText(resultAnchor?.visibleErrorText || '');
    if (pageError && !hasExpectedPromptMarker && !hasGeneratingCandidate && pageError !== anchorPageError) {
      return { found: true, status: 'failed', message: pageError, resultProbe };
    }
    if (changedRecords.length > 1) {
      return {
        found: false,
        status: 'generating',
        message: '海外版网页正在生成中',
        pageHasGenerating: true,
        resultProbe,
      };
    }
    const latestRecord = changedRecords[0]?.el || null;
    if (!latestRecord) {
      const progressTipsEls = document.querySelectorAll('[class*="progress-tips-"], [class*="loading"], [class*="generating"], [class*="spinner"]');
      const pageHasGenerating = Array.from(progressTipsEls).some(el =>
        !el.closest('#seedance-drawer-container') && isVisibleElement(el)
      );
      return {
        found: false,
        status: pageHasGenerating ? 'generating' : 'not_found',
        message: pageHasGenerating ? '海外版网页正在生成中' : '本次任务结果还没出现',
        pageHasGenerating,
        resultProbe,
      };
    }
    const info = extractSeedanceResultInfoFromRecord(latestRecord, '海外版任务');
    info.hasNewRecord = Number.isFinite(anchorCount) ? records.length > anchorCount : true;
    info.resultProbe = resultProbe;
    return info;
  }

  // ============================================================
  // 根据任务ID查找页面上的视频结果
  // ============================================================

  /**
   * 在页面上查找包含 taskCode 的所有 video-record 元素
   * 返回 { normalRecords: [], hdRecords: [] }
   */
  function findRecordsByTaskCode(taskCode) {
    const normalRecords = [];
    const hdRecords = [];

    // 主选择器: video-record 和 ai-generated-record
    const allRecords = document.querySelectorAll('[class*="video-record-"], [class*="ai-generated-record"]');
    for (const record of allRecords) {
      if (record.closest('#seedance-drawer-container')) continue;
      const text = record.textContent || '';
      if (!text.includes(taskCode)) continue;
      // 是否有 hd-label (提升分辨率完成) 或 record-header 包含"提升分辨率"(正在提升中)
      const hdLabel = record.querySelector('[class*="hd-label"]');
      const headerEl = record.querySelector('[class*="record-header"]');
      const isHD = !!hdLabel || (headerEl && headerEl.textContent.includes('提升分辨率'));
      if (isHD) {
        hdRecords.push(record);
      } else {
        normalRecords.push(record);
      }
    }

    // 如果没找到，尝试更宽泛的搜索
    if (normalRecords.length === 0 && hdRecords.length === 0) {
      const scrollContainers = document.querySelectorAll('.scrollbar-container, [class*="scroll-container"], [class*="record-list"]');
      for (const container of scrollContainers) {
        if (container.closest('#seedance-drawer-container')) continue;
        if (container.textContent?.includes(taskCode)) {
          const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
            acceptNode: (node) => {
              if (node.textContent?.includes(taskCode) && node.querySelector('video, [class*="video"]')) {
                return NodeFilter.FILTER_ACCEPT;
              }
              return NodeFilter.FILTER_SKIP;
            }
          });
          let node;
          while (node = walker.nextNode()) {
            const hdLabel2 = node.querySelector('[class*="hd-label"]');
            const headerEl2 = node.querySelector('[class*="record-header"]');
            const isHD = !!hdLabel2 || (headerEl2 && headerEl2.textContent.includes('提升分辨率'));
            if (isHD) hdRecords.push(node);
            else normalRecords.push(node);
          }
          if (normalRecords.length > 0 || hdRecords.length > 0) break;
        }
      }
    }

    return { normalRecords, hdRecords };
  }

  /**
   * 从 record 元素中提取视频信息
   */
  function extractVideoInfo(record, taskCode, isHD) {
    // 二次确认: 如果 record-header 包含"提升分辨率"，则标记为 HD (正在提升分辨率中)
    if (!isHD) {
      const headerEl = record.querySelector('[class*="record-header"]');
      if (headerEl && headerEl.textContent.includes('提升分辨率')) {
        isHD = true;
      }
    }

    // 先检查明确失败，避免失败卡片里残留封面/预览媒体时误判成功。
    const failEl = record.querySelector('[class*="fail"], [class*="error"]');
    if (failEl && failEl.offsetParent !== null) {
      const failureText = extractSeedanceFailureText(failEl, record);
      if (failureText) {
        return { found: true, status: 'failed', isHD, message: failureText };
      }
    }
    const recordFailureText = extractSeedanceFailureText(null, record);
    if (recordFailureText) {
      return { found: true, status: 'failed', isHD, message: recordFailureText };
    }

    if (isSeedanceRecordGenerating(record)) {
      return { found: true, status: 'generating', isHD, message: `任务 ${taskCode} 正在${isHD ? '提升分辨率' : '生成'}中...` };
    }

    // ★ 优先检查是否在生成中 (必须在 video 检查之前，避免误判为 completed)
    const progressTips = record.querySelector('[class*="progress-tips-"]');
    if (progressTips && progressTips.textContent.includes('造梦中')) {
      return { found: true, status: 'generating', isHD, message: `任务 ${taskCode} 正在${isHD ? '提升分辨率' : '生成'}中（造梦中）...` };
    }
    // 兜底: video-record-content 的 textContent 包含 "造梦中"
    const vrc = record.querySelector('[class*="video-record-content-"]');
    if (vrc && vrc.textContent.includes('造梦中')) {
      return { found: true, status: 'generating', isHD, message: `任务 ${taskCode} 正在${isHD ? '提升分辨率' : '生成'}中（造梦中）...` };
    }
    // 兜底: record 整体 textContent 包含 "造梦中"
    if (record.textContent.includes('造梦中')) {
      return { found: true, status: 'generating', isHD, message: `任务 ${taskCode} 正在${isHD ? '提升分辨率' : '生成'}中（造梦中）...` };
    }
    // 兜底: 其他 loading/progress 指示器
    const loadingEl = record.querySelector('[class*="loading"], [class*="generating"], [class*="spinner"]');
    if (loadingEl && loadingEl.offsetParent !== null) {
      return { found: true, status: 'generating', isHD, message: `任务 ${taskCode} 正在${isHD ? '提升分辨率' : '生成'}中...` };
    }

    // 确认非生成中后，检查视频
    const videoEl = record.querySelector('video');
    if (videoEl) {
      const videoSrc = videoEl.src || videoEl.querySelector('source')?.src || '';
      if (videoSrc) {
        return {
          found: true,
          status: 'completed',
          videoUrl: videoSrc,
          isHD,
          message: `找到任务 ${taskCode} 的${isHD ? '高清' : ''}视频`,
        };
      }
    }

    // 图片
    const imgEl = record.querySelector('img:not([class*="reference"]):not([class*="skeleton"]):not([class*="origin-record"])');
    if (imgEl && imgEl.src && !imgEl.src.includes('data:')) {
      return { found: true, status: 'completed', videoUrl: imgEl.src, isImage: true, isHD, message: `任务 ${taskCode} 生成的是图片` };
    }

    return { found: true, status: 'unknown', isHD, message: `找到任务 ${taskCode} 的记录但无法确定状态` };
  }

  async function findVideoByTaskCode(taskCode) {
    if (!taskCode || taskCode.trim().length === 0) {
      throw new Error('请输入任务ID');
    }
    taskCode = taskCode.trim();
    console.log(`[Seedance批量] 🔍 查找视频: ${taskCode}`);

    const { normalRecords, hdRecords } = findRecordsByTaskCode(taskCode);

    if (normalRecords.length === 0 && hdRecords.length === 0) {
      console.warn(`[Seedance批量] 未找到任务 ${taskCode} 的记录`);
      // 检查页面是否有正在生成的任务: progress-badge + progress-tips 包含 "造梦中"
      const progressTipsEls = document.querySelectorAll('[class*="progress-tips-"]');
      const pageHasGenerating = Array.from(progressTipsEls).some(el =>
        !el.closest('#seedance-drawer-container') && el.textContent.includes('造梦中')
      );
      return {
        found: false,
        status: 'not_found',
        message: `未在页面上找到任务 ${taskCode} 的记录。请确认任务ID正确，且该记录在页面可见区域内。`,
        pageHasGenerating,
        hasHDVersion: false,
        hasNormalVersion: false,
      };
    }

    const hasHDVersion = hdRecords.length > 0;
    const hasNormalVersion = normalRecords.length > 0;

    // 优先返回 HD 版本
    if (hasHDVersion) {
      const info = extractVideoInfo(hdRecords[0], taskCode, true);
      info.hasHDVersion = true;
      info.hasNormalVersion = hasNormalVersion;
      console.log(`[Seedance批量] ✅ 找到HD视频: ${info.videoUrl?.substring(0, 80) || info.status}`);
      return info;
    }

    // 返回普通版本
    const info = extractVideoInfo(normalRecords[0], taskCode, false);
    info.hasHDVersion = false;
    info.hasNormalVersion = true;
    console.log(`[Seedance批量] 找到普通视频: ${info.videoUrl?.substring(0, 80) || info.status}`);
    return info;
  }

  // ============================================================
  // 触发原生下载 (通过 MAIN world 点击视频上的下载按钮)
  // ============================================================
  async function triggerNativeDownload(taskCode, preferHD = true) {
    taskCode = taskCode.trim();
    console.log(`[Seedance批量] ⬇️ 触发原生下载: ${taskCode}, preferHD=${preferHD}`);

    const { normalRecords, hdRecords } = findRecordsByTaskCode(taskCode);
    const records = preferHD && hdRecords.length > 0 ? hdRecords : normalRecords;
    if (records.length === 0) {
      return { downloaded: false, message: '未找到视频记录' };
    }

    const record = records[0];

    // 为 record 生成一个临时选择器, 供 MAIN world 定位
    const tempId = 'seedance-dl-' + Date.now();
    record.setAttribute('data-seedance-dl', tempId);
    const selector = `[data-seedance-dl="${tempId}"]`;

    try {
      const eventName = 'seedance-download-result-' + Date.now();
      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          window.removeEventListener('message', handler);
          resolve({ downloaded: false, message: '下载操作超时 (10秒)' });
        }, 10000);

        function handler(e) {
          if (!e.data || e.data.type !== eventName) return;
          window.removeEventListener('message', handler);
          clearTimeout(timeout);
          const detail = e.data.detail;
          if (detail && detail.success) {
            console.log(`[Seedance批量] ✅ MAIN world 下载成功: ${detail.method}`);
            resolve({ downloaded: true, message: `已触发下载 (${detail.method})` });
          } else if (detail && detail.fallbackUrl) {
            console.log(`[Seedance批量] ⚠️ MAIN world 未找到下载按钮, fallback URL: ${detail.fallbackUrl.substring(0, 80)}`);
            resolve({ downloaded: false, fallbackUrl: detail.fallbackUrl, message: detail.error || '未找到下载按钮' });
          } else {
            console.error(`[Seedance批量] ❌ MAIN world 下载失败: ${detail?.error}`);
            resolve({ downloaded: false, message: detail?.error || '下载失败' });
          }
        }

        window.addEventListener('message', handler);
        window.postMessage({
          type: 'seedance-click-download',
          selector: selector,
          eventName: eventName
        }, '*');
      });

      return result;
    } finally {
      record.removeAttribute('data-seedance-dl');
    }
  }

  // ============================================================
  // 触发提升分辨率 (通过 MAIN world 操作)
  // ============================================================
  async function triggerUpscale(taskCode) {
    taskCode = taskCode.trim();
    console.log(`[Seedance批量] 🔺 触发提升分辨率: ${taskCode}`);

    const { normalRecords, hdRecords } = findRecordsByTaskCode(taskCode);

    // 如果已经有 HD 版本
    if (hdRecords.length > 0) {
      return { triggered: false, alreadyHD: true, message: '该视频已有高清版本' };
    }

    if (normalRecords.length === 0) {
      return { triggered: false, message: '未找到视频记录' };
    }

    const record = normalRecords[0];
    const tempId = 'seedance-up-' + Date.now();
    record.setAttribute('data-seedance-up', tempId);
    const selector = `[data-seedance-up="${tempId}"]`;

    try {
      const eventName = 'seedance-upscale-result-' + Date.now();
      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          window.removeEventListener('message', handler);
          resolve({ triggered: false, message: '提升分辨率操作超时 (15秒)' });
        }, 15000);

        function handler(e) {
          if (!e.data || e.data.type !== eventName) return;
          window.removeEventListener('message', handler);
          clearTimeout(timeout);
          const detail = e.data.detail;
          if (detail && detail.success) {
            console.log(`[Seedance批量] ✅ 提升分辨率已触发: ${detail.message}`);
            resolve({ triggered: true, message: detail.message || '已触发提升分辨率' });
          } else {
            console.error(`[Seedance批量] ❌ 提升分辨率失败: ${detail?.error}`);
            resolve({ triggered: false, message: detail?.error || '提升分辨率失败' });
          }
        }

        window.addEventListener('message', handler);
        window.postMessage({
          type: 'seedance-click-upscale',
          selector: selector,
          eventName: eventName
        }, '*');
      });

      return result;
    } finally {
      record.removeAttribute('data-seedance-up');
    }
  }

  // ============================================================
  // 在页面上下文中下载视频文件 (fetch + blob + <a download>)
  // ============================================================
  async function downloadVideoFile(url, filename) {
    console.log(`[Seedance批量] ⬇️ 下载视频文件: ${filename}, URL: ${url.substring(0, 80)}...`);
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      console.log(`[Seedance批量] ✅ 下载完成: ${filename}, size=${blob.size}`);
      return { downloaded: true, message: `下载完成: ${filename}`, size: blob.size };
    } catch (err) {
      console.error(`[Seedance批量] ❌ 下载失败: ${err.message}`);
      return { downloaded: false, message: `下载失败: ${err.message}` };
    }
  }

  // ============================================================
  // 捕获视频并上传到服务器
  // ============================================================
  async function captureAndUploadVideo(taskCode, serverUrl, qualityFilter = '') {
    taskCode = taskCode.trim();
    if (!taskCode) throw new Error('请输入任务号');
    if (!serverUrl) throw new Error('请配置服务器地址');

    console.log(`[Seedance批量] 📤 捕获并上传视频: ${taskCode} → ${serverUrl} (filter: ${qualityFilter || 'all'})`);

    const { normalRecords, hdRecords } = findRecordsByTaskCode(taskCode);
    if (normalRecords.length === 0 && hdRecords.length === 0) {
      return { uploaded: 0, message: '未找到视频记录' };
    }

    const results = [];

    // 上传 HD 版本 (如果不指定 qualityFilter 或指定 'hd')
    if ((!qualityFilter || qualityFilter === 'hd') && hdRecords.length > 0) {
      const info = extractVideoInfo(hdRecords[0], taskCode, true);
      if (info.videoUrl && info.status === 'completed') {
        try {
          const result = await fetchAndUploadToServer(info.videoUrl, taskCode, 'hd', serverUrl);
          results.push(result);
        } catch (err) {
          console.error(`[Seedance批量] ❌ HD版本上传失败:`, err.message);
          results.push({ success: false, quality: 'hd', error: err.message });
        }
      }
    }

    // 上传普通版本 (如果不指定 qualityFilter 或指定 'standard')
    if ((!qualityFilter || qualityFilter === 'standard') && normalRecords.length > 0) {
      const info = extractVideoInfo(normalRecords[0], taskCode, false);
      if (info.videoUrl && info.status === 'completed') {
        try {
          const result = await fetchAndUploadToServer(info.videoUrl, taskCode, 'standard', serverUrl);
          results.push(result);
        } catch (err) {
          console.error(`[Seedance批量] ❌ 标准版本上传失败:`, err.message);
          results.push({ success: false, quality: 'standard', error: err.message });
        }
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[Seedance批量] 📤 上传完成: ${successCount}/${results.length} 成功`);
    return {
      uploaded: successCount,
      total: results.length,
      results,
      message: successCount > 0
        ? `已上传 ${successCount} 个视频到服务器`
        : '上传失败: ' + (results[0]?.error || '未知错误'),
    };
  }

  async function captureAndUploadLatestSeedanceResult(taskCode, serverUrl, qualityFilter = '', videoUrl = '', promptMarker = '') {
    taskCode = String(taskCode || '').trim();
    if (!taskCode) throw new Error('请输入任务号');
    if (!serverUrl) throw new Error('请配置服务器地址');

    const targetUrl = String(videoUrl || '').trim();
    const marker = normalizeSeedancePromptMarker(promptMarker);
    const resultInfo = targetUrl ? { status: 'completed', videoUrl: targetUrl } : await findLatestSeedanceResultAfterSubmit(null, '', '', '', marker);
    if (resultInfo.status === 'failed') {
      return { uploaded: 0, total: 0, message: resultInfo.message || '生成失败' };
    }
    if (!resultInfo.videoUrl) {
      return { uploaded: 0, total: 0, message: resultInfo.message || '未找到视频记录' };
    }

    const quality = qualityFilter || 'standard';
    const results = [];
    try {
      const uploaded = await fetchAndUploadToServer(resultInfo.videoUrl, taskCode, quality, serverUrl, marker);
      results.push(uploaded);
    } catch (err) {
      console.error(`[Seedance批量] ❌ 最新结果上传失败:`, err.message);
      results.push({ success: false, quality, error: err.message });
    }
    const successCount = results.filter(r => r.success).length;
    return {
      uploaded: successCount,
      total: results.length,
      results,
      message: successCount > 0
        ? `已上传 ${successCount} 个视频到服务器`
        : '上传失败: ' + (results[0]?.error || '未知错误'),
    };
  }

  async function fetchAndUploadToServer(videoUrl, taskCode, quality, serverUrl, promptMarker = '') {
    console.log(`[Seedance批量] ⬇️ 抓取视频: ${quality}, URL: ${videoUrl.substring(0, 80)}...`);

    const resp = await fetch(videoUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();

    // 获取 MIME 类型
    const mimeType = blob.type || 'video/mp4';
    const ext = mimeType.includes('mp4') ? 'mp4' : (mimeType.includes('webm') ? 'webm' : 'mp4');
    const filename = `${taskCode}_${quality}_${Date.now()}.${ext}`;

    console.log(`[Seedance批量] 📤 上传文件: ${filename}, size=${blob.size}, type=${mimeType}`);

    // 使用 FormData 上传 (二进制, 不用 base64)
    const formData = new FormData();
    formData.append('file', blob, filename);
    formData.append('taskCode', taskCode);
    formData.append('quality', quality);
    formData.append('mimeType', mimeType);
    formData.append('originalUrl', videoUrl);
    if (promptMarker) {
      formData.append('promptMarker', promptMarker);
    }

    const uploadResp = await fetch(`${serverUrl}/api/files/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!uploadResp.ok) throw new Error(`上传失败 HTTP ${uploadResp.status}`);
    const result = await uploadResp.json();

    if (!result.success) throw new Error(result.error || '服务器返回失败');

    console.log(`[Seedance批量] ✅ 上传成功: ${filename}`);
    return { success: true, quality, filename, size: blob.size, fileId: result.fileId };
  }

  // ============================================================
  // 清除已上传的参考图 (仅在参考上传区域内查找删除按钮)
  // ============================================================
  async function clearReferenceImage() {
    // 与原版一致: 全局查找删除/移除/关闭按钮 (不做 hover, 避免触发 tooltip)
    const selectors = [
      '[class*="delete"]',
      '[class*="Delete"]',
      '[class*="remove"]',
      '[class*="Remove"]',
      '[class*="preview"] [class*="close"]',
      '[class*="preview"] [class*="delete"]',
    ];

    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetParent !== null && !btn.closest('#seedance-drawer-container')) {
        simulateClick(btn);
        console.log(`[Seedance批量] 已清除参考图 (${sel})`);
        await sleep(500);
        return true;
      }
    }

    // hover swap 按钮后清除 (原版也有此逻辑)
    const swapBtn = document.querySelector('[class*="swap-button"]');
    if (swapBtn && swapBtn.offsetParent !== null) {
      swapBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      swapBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await sleep(400);

      for (const sel of selectors) {
        const btn = document.querySelector(sel);
        if (btn && btn.offsetParent !== null && !btn.closest('#seedance-drawer-container')) {
          simulateClick(btn);
          console.log('[Seedance批量] 已清除参考图 (swap hover后)');
          // 清除 hover 状态, 防止残留 tooltip
          swapBtn.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
          await sleep(500);
          return true;
        }
      }

      // 没找到按钮也要清除 hover 状态
      swapBtn.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    }

    // 文本匹配
    const removeBtn = findByText('span, div, button', '删除')
      || findByText('span, div, button', '移除');
    if (removeBtn && !removeBtn.closest('#seedance-drawer-container')) {
      simulateClick(removeBtn);
      console.log('[Seedance批量] 已清除参考图 (文本)');
      await sleep(500);
      return true;
    }

    console.log('[Seedance批量] 未找到清除按钮');
    return false;
  }

  // ============================================================
  // 清除所有已上传的参考图（循环调用直到没有可删除的为止）
  // ============================================================
  async function clearAllReferenceImages() {
    console.log('[Seedance批量] 开始清除所有已上传的参考图...');
    let cleared = 0;
    const maxAttempts = 20; // 防止死循环
    for (let i = 0; i < maxAttempts; i++) {
      const found = await clearReferenceImage();
      if (!found) break;
      cleared++;
      await sleep(300);
    }
    console.log(`[Seedance批量] 共清除 ${cleared} 张参考图`);
    return cleared;
  }

  // ============================================================
  // 设置画面比例 (独立函数，可在不同流程中复用)
  // ============================================================
  async function setAspectRatio(targetRatio) {
    const toolbar = findToolbar();
    if (!toolbar) {
      console.warn('[Seedance批量] setAspectRatio: 未找到工具栏');
      return false;
    }

    const ratioBtn = toolbar.querySelector('button[class*="toolbar-button"]');
    if (!ratioBtn) {
      console.warn('[Seedance批量] setAspectRatio: 未找到比例按钮');
      return false;
    }

    const currentRatio = ratioBtn.textContent.trim();
    if (currentRatio === targetRatio) {
      console.log(`[Seedance批量] 比例: 已是 "${targetRatio}"`);
      return true;
    }

    console.log(`[Seedance批量] 比例: "${currentRatio}" → "${targetRatio}"`);
    simulateClick(ratioBtn);
    await sleep(500);

    // 查找比例选项 (span.label-* 在弹出面板中)
    let ratioSet = false;
    const ratioLabels = document.querySelectorAll('[class*="label-"]');
    for (const label of ratioLabels) {
      if (label.textContent.trim() === targetRatio && label.offsetParent !== null) {
        // 点击父元素（比例选项容器）
        const clickTarget = label.closest('[class*="ratio-option"]') || label.parentElement || label;
        simulateClick(clickTarget);
        ratioSet = true;
        break;
      }
    }

    if (!ratioSet) {
      // 备用: 找任何包含比例文本的可点击元素
      const allEls = document.querySelectorAll('div, span, button');
      for (const el of allEls) {
        if (el.textContent.trim() === targetRatio && el.offsetParent !== null) {
          const rect = el.getBoundingClientRect();
          // 只点击比例弹出面板中的元素 (位置在工具栏下方)
          if (rect.y > 350 && rect.height < 50) {
            simulateClick(el);
            ratioSet = true;
            break;
          }
        }
      }
    }

    if (ratioSet) {
      console.log(`[Seedance批量] 比例: 已选择 "${targetRatio}"`);
    } else {
      console.warn(`[Seedance批量] 比例: 未找到选项 "${targetRatio}"`);
      document.body.click(); // 关闭弹出
    }
    await sleep(400);
    return ratioSet;
  }

  // ============================================================
  // 应用预设参数
  // ============================================================
  async function applyPresetParams(preset) {
    const results = {};

    // Step 0: 确保处于视频生成模式
    try {
      await ensureVideoGenerationMode();
      results.navigation = true;
    } catch (e) {
      console.error('[Seedance批量] 导航失败:', e.message);
      return { error: e.message };
    }

    await sleep(500);

    const toolbar = findToolbar();
    if (!toolbar) {
      return { warning: '切换后未找到工具栏' };
    }

    // 获取工具栏中的4个 select:
    // [0] = 创作类型 (视频生成), [1] = 模型, [2] = 参考模式, [3] = 时长
    const selects = toolbar.querySelectorAll('.lv-select');
    console.log(`[Seedance批量] 工具栏中找到 ${selects.length} 个选择器`);
    function normalizeSelectText(text) {
      return String(text || '').replace(/\s+/g, ' ').trim();
    }

    function normalizeSeedanceModelOptionKey(text) {
      const normalized = normalizeSelectText(text).toLowerCase().replace(/^dreamina\s+/, '');
      if (!normalized.includes('seedance')) return '';
      return normalized.replace(/[^a-z0-9.]+/g, '');
    }

    function optionTextMatches(optionText, targetText) {
      const option = normalizeSelectText(optionText);
      const target = normalizeSelectText(targetText);
      if (!target) return false;
      const optionModelKey = normalizeSeedanceModelOptionKey(option);
      const targetModelKey = normalizeSeedanceModelOptionKey(target);
      if (optionModelKey || targetModelKey) {
        const sameSpeedTier = optionModelKey.includes('fast') === targetModelKey.includes('fast');
        return Boolean(
          optionModelKey &&
          targetModelKey &&
          sameSpeedTier &&
          (optionModelKey === targetModelKey || optionModelKey.startsWith(targetModelKey))
        );
      }
      const optionLower = option.toLowerCase();
      const targetLower = target.toLowerCase();
      return optionLower === targetLower || optionLower.startsWith(targetLower);
    }

    async function selectOption(selectEl, targetText, label) {
      if (!selectEl) {
        console.warn(`[Seedance批量] ${label}: 选择器不存在`);
        return false;
      }

      const currentText = normalizeSelectText(selectEl.textContent);
      if (optionTextMatches(currentText, targetText)) {
        console.log(`[Seedance批量] ${label}: 已是 "${targetText}"`);
        return true;
      }

      console.log(`[Seedance批量] ${label}: "${currentText}" -> "${targetText}"`);
      simulateClick(selectEl);
      await sleep(500);

      const options = document.querySelectorAll('.lv-select-option');
      for (const opt of options) {
        const optText = normalizeSelectText(opt.textContent);
        if (optionTextMatches(optText, targetText)) {
          simulateClick(opt);
          await sleep(300);
          console.log(`[Seedance批量] ${label}: 已选择 "${targetText}"`);
          return true;
        }
      }

      const allEls = document.querySelectorAll('[class*="select-option-label"]');
      for (const el of allEls) {
        const elText = normalizeSelectText(el.textContent);
        if (optionTextMatches(elText, targetText) && el.offsetParent !== null) {
          simulateClick(el);
          await sleep(300);
          console.log(`[Seedance批量] ${label}: 备用方式选择 "${targetText}"`);
          return true;
        }
      }

      document.body.click();
      await sleep(200);
      console.warn(`[Seedance批量] ${label}: 未找到选项 "${targetText}"`);
      return false;
    }

    // Step 1: 设置模型 (select index 1)
    if (preset.model && selects.length > 1) {
      results.model = await selectOption(selects[1], preset.model, '模型');
      await sleep(400);
    }

    // Step 2: 设置参考模式 (select index 2)
    if (preset.referenceMode && selects.length > 2) {
      results.referenceMode = await selectOption(selects[2], preset.referenceMode, '参考模式');
      await sleep(400);
    }

    // Step 3: 设置画面比例 (toolbar button, not a select)
    if (preset.aspectRatio) {
      const ratioBtn = toolbar.querySelector('button[class*="toolbar-button"]');
      if (ratioBtn) {
        const currentRatio = ratioBtn.textContent.trim();
        if (currentRatio === preset.aspectRatio) {
          console.log(`[Seedance批量] 比例: 已是 "${preset.aspectRatio}"`);
          results.aspectRatio = true;
        } else {
          console.log(`[Seedance批量] 比例: "${currentRatio}" → "${preset.aspectRatio}"`);
          simulateClick(ratioBtn);
          await sleep(500);

          // 查找比例选项 (span.label-* 在弹出面板中)
          let ratioSet = false;
          const ratioLabels = document.querySelectorAll('[class*="label-"]');
          for (const label of ratioLabels) {
            if (label.textContent.trim() === preset.aspectRatio && label.offsetParent !== null) {
              // 点击父元素（比例选项容器）
              const clickTarget = label.closest('[class*="ratio-option"]') || label.parentElement || label;
              simulateClick(clickTarget);
              ratioSet = true;
              break;
            }
          }

          if (!ratioSet) {
            // 备用: 找任何包含比例文本的可点击元素
            const allEls = document.querySelectorAll('div, span, button');
            for (const el of allEls) {
              if (el.textContent.trim() === preset.aspectRatio && el.offsetParent !== null) {
                const rect = el.getBoundingClientRect();
                // 只点击比例弹出面板中的元素 (位置在工具栏下方)
                if (rect.y > 350 && rect.height < 50) {
                  simulateClick(el);
                  ratioSet = true;
                  break;
                }
              }
            }
          }

          results.aspectRatio = ratioSet;
          if (ratioSet) {
            console.log(`[Seedance批量] 比例: 已选择 "${preset.aspectRatio}"`);
          } else {
            console.warn(`[Seedance批量] 比例: 未找到选项 "${preset.aspectRatio}"`);
            document.body.click(); // 关闭弹出
          }
          await sleep(400);
        }
      } else {
        console.warn('[Seedance批量] 未找到比例按钮');
        results.aspectRatio = false;
      }
    }
    // Step 4: set video duration (select index 3)
    if (preset.duration && selects.length > 3) {
      results.duration = await selectOption(selects[3], preset.duration, 'duration');
      await sleep(400);
    }

    console.log('[Seedance批量] 预设参数已应用:', results);
    return results;
  }

  // ============================================================
  // 主处理: 单个生成任务
  // ============================================================
  async function handleGenerateTask(msg) {
    const { fileData, prompt, index, total } = msg;

    isProcessing = true;
    currentTaskIndex = index;

    try {
      console.log(`[Seedance批量] 处理任务 ${index + 1}/${total}: ${fileData.name}`);
      console.log(`[Seedance批量] 收到提示词: "${prompt || '(无)'}"`);

      // Step 0: 确保在视频生成模式（仅第一个任务时检查）
      if (index === 0) {
        await ensureVideoGenerationMode();
        await sleep(500);
      }

      // Step 1: 上传参考图
      await sleep(500);
      await uploadReferenceImage(fileData);

      // Step 2: 设置提示词 (最后设置，在点击生成之前)
      if (prompt) {
        console.log(`[Seedance批量] [Step 2] 开始设置提示词: "${prompt.substring(0, 40)}"`);
        await setPrompt(prompt);
        // 验证提示词是否设置成功
        const editor = findPromptEditor();
        if (editor) {
          const p = editor.querySelector('p');
          const currentText = (p ? p.textContent : editor.textContent) || '';
          console.log(`[Seedance批量] [Step 2] 设置后编辑器 <p> 内容: "${currentText.substring(0, 50)}"`);
          if (currentText.includes(prompt.substring(0, Math.min(10, prompt.length)))) {
            console.log(`[Seedance批量] [Step 2] ✅ 提示词已确认一致`);
          } else {
            console.warn(`[Seedance批量] [Step 2] ⚠️ 提示词不一致! 期望: "${prompt.substring(0, 30)}" 实际: "${currentText.substring(0, 30)}"`);
          }
        } else {
          console.warn(`[Seedance批量] [Step 2] ⚠️ 设置后找不到编辑器`);
        }
      } else {
        console.log(`[Seedance批量] [Step 2] 无提示词，跳过`);
      }

      // Step 3: 点击生成 (提示词已在上一步设置完毕)
      await sleep(500);
      await clickGenerate();

      // Step 4: 等待任务提交
      await sleep(1000);

      // Step 5: 如果不是最后一个任务，清除参考图
      if (index < total - 1) {
        await clearReferenceImage();
      }

      console.log(`[Seedance批量] 任务 ${index + 1} 完成`);
    } finally {
      isProcessing = false;
      currentTaskIndex = -1;
    }
  }

  // ============================================================
  // 侧边抽屉 UI 注入
  // ============================================================
  let drawerOpen = false;
  let drawerContainer = null;
  let drawerToggleBtn = null;

  function createDrawer() {
    if (drawerContainer) return;

    // 创建抽屉容器 (fixed 定位在右侧)
    drawerContainer = document.createElement('div');
    drawerContainer.id = 'seedance-drawer-container';
    drawerContainer.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: 360px;
      height: 100vh;
      z-index: 2147483647;
      transform: translateX(100%);
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: -4px 0 20px rgba(0,0,0,0.4);
      pointer-events: auto;
    `;

    // 创建 iframe 加载 panel.html
    const iframe = document.createElement('iframe');
    iframe.id = 'seedance-drawer-iframe';
    iframe.src = chrome.runtime.getURL('panel.html');
    iframe.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      background: #1a1a2e;
    `;
    drawerContainer.appendChild(iframe);
    document.body.appendChild(drawerContainer);

    // 创建悬浮切换按钮
    drawerToggleBtn = document.createElement('div');
    drawerToggleBtn.id = 'seedance-drawer-toggle';
    drawerToggleBtn.innerHTML = '🎬';
    drawerToggleBtn.title = 'Seedance 批量生成助手';
    drawerToggleBtn.style.cssText = `
      position: fixed;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 36px;
      height: 72px;
      background: linear-gradient(135deg, #e94560, #c23152);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 2147483646;
      border-radius: 8px 0 0 8px;
      font-size: 18px;
      box-shadow: -2px 0 10px rgba(233, 69, 96, 0.3);
      transition: all 0.3s;
      user-select: none;
      pointer-events: auto;
    `;
    drawerToggleBtn.addEventListener('mouseenter', () => {
      if (!drawerOpen) {
        drawerToggleBtn.style.width = '42px';
        drawerToggleBtn.style.boxShadow = '-3px 0 15px rgba(233, 69, 96, 0.5)';
      }
    });
    drawerToggleBtn.addEventListener('mouseleave', () => {
      if (!drawerOpen) {
        drawerToggleBtn.style.width = '36px';
        drawerToggleBtn.style.boxShadow = '-2px 0 10px rgba(233, 69, 96, 0.3)';
      }
    });
    drawerToggleBtn.addEventListener('click', toggleDrawer);
    document.body.appendChild(drawerToggleBtn);

    // 监听来自 iframe (panel.js) 的消息
    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'SEEDANCE_DRAWER_TOGGLE') {
        if (e.data.open === false) {
          closeDrawer();
        } else {
          toggleDrawer();
        }
      }
    });
  }

  function toggleDrawer() {
    if (drawerOpen) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }

  function openDrawer() {
    if (!drawerContainer) createDrawer();
    drawerOpen = true;
    drawerContainer.style.transform = 'translateX(0)';
    drawerToggleBtn.style.right = '360px';
    drawerToggleBtn.innerHTML = '✕';
    drawerToggleBtn.style.background = 'linear-gradient(135deg, #0f3460, #16213e)';
    drawerToggleBtn.style.boxShadow = '-2px 0 10px rgba(0,0,0,0.3)';
    drawerToggleBtn.style.width = '36px';
  }

  function closeDrawer() {
    if (!drawerContainer) return;
    drawerOpen = false;
    drawerContainer.style.transform = 'translateX(100%)';
    drawerToggleBtn.style.right = '0';
    drawerToggleBtn.innerHTML = '🎬';
    drawerToggleBtn.style.background = 'linear-gradient(135deg, #e94560, #c23152)';
    drawerToggleBtn.style.boxShadow = '-2px 0 10px rgba(233, 69, 96, 0.3)';
  }

  // 监听来自 background.js 的抽屉切换命令
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'toggleDrawer') {
      if (!drawerContainer) createDrawer();
      toggleDrawer();
      sendResponse({ success: true, open: drawerOpen });
      return false;
    }
  });

  // ============================================================
  // 初始化
  // ============================================================
  createDrawer();
  console.log('[Seedance批量助手] Content script loaded');
  startSeedancePageStatusHeartbeat();

  function collectSeedancePageStatusForWorkbench() {
    const status = getPageInfo();
    return {
      ...status,
      title: document.title || '',
      loggedIn: Boolean(status.loggedIn),
    };
  }

  function startSeedancePageStatusHeartbeat() {
    const report = () => {
      try {
        chrome.runtime.sendMessage({
          action: 'seedancePageStatus',
          status: collectSeedancePageStatusForWorkbench(),
        });
      } catch (err) {
        // Best-effort heartbeat only.
      }
    };
    setTimeout(report, 1200);
    setInterval(report, 5000);
  }
})();
