// popup.js - 批量生成控制面板
(function () {
  const MAX_FILES = 30;
  let selectedFiles = [];

  // ============================================================
  // DOM 引用
  // ============================================================
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('fileInput');
  const fileList = document.getElementById('fileList');
  const statusBar = document.getElementById('statusBar');
  const fileCount = document.getElementById('fileCount');
  const btnClear = document.getElementById('btnClear');
  const btnGenerate = document.getElementById('btnGenerate');
  const btnPreset = document.getElementById('btnPreset');
  const btnCheckPage = document.getElementById('btnCheckPage');
  const progressEl = document.getElementById('progress');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const logEl = document.getElementById('log');
  const promptInput = document.getElementById('promptInput');
  const connStatus = document.getElementById('connStatus');
  const taskDelayInput = document.getElementById('taskDelay');

  // 预设编辑器
  const presetEditToggle = document.getElementById('presetEditToggle');
  const presetDisplay = document.getElementById('presetDisplay');
  const presetEditor = document.getElementById('presetEditor');
  const presetSave = document.getElementById('presetSave');
  const presetCancel = document.getElementById('presetCancel');
  const cfgModel = document.getElementById('cfgModel');
  const cfgRefMode = document.getElementById('cfgRefMode');
  const cfgRatio = document.getElementById('cfgRatio');
  const cfgDuration = document.getElementById('cfgDuration');

  // 预设标签
  const tagModel = document.getElementById('tagModel');
  const tagRefMode = document.getElementById('tagRefMode');
  const tagRatio = document.getElementById('tagRatio');
  const tagDuration = document.getElementById('tagDuration');

  // ============================================================
  // 默认预设
  // ============================================================
  const DEFAULT_PRESET = {
    model: 'Seedance 2.0',
    referenceMode: '首尾帧',
    aspectRatio: '16:9',
    duration: '5s',
  };

  let currentPreset = { ...DEFAULT_PRESET };

  // ============================================================
  // 初始化 - 从 storage 加载设置
  // ============================================================
  async function loadSettings() {
    try {
      const data = await chrome.storage.local.get(['preset', 'prompt', 'taskDelay']);
      if (data.preset) {
        currentPreset = { ...DEFAULT_PRESET, ...data.preset };
      }
      if (data.prompt) {
        promptInput.value = data.prompt;
      }
      if (data.taskDelay) {
        taskDelayInput.value = data.taskDelay;
      }
      updatePresetDisplay();
    } catch (e) {
      console.warn('加载设置失败:', e);
    }
  }

  async function saveSettings() {
    try {
      await chrome.storage.local.set({
        preset: currentPreset,
        prompt: promptInput.value,
        taskDelay: parseInt(taskDelayInput.value) || 2,
      });
    } catch (e) {
      console.warn('保存设置失败:', e);
    }
  }

  function updatePresetDisplay() {
    tagModel.textContent = `🤖 ${currentPreset.model}`;
    tagRefMode.textContent = `⚡ ${currentPreset.referenceMode}`;
    tagRatio.textContent = `📐 ${currentPreset.aspectRatio}`;
    tagDuration.textContent = `⏱️ ${currentPreset.duration}`;

    cfgModel.value = currentPreset.model;
    cfgRefMode.value = currentPreset.referenceMode;
    cfgRatio.value = currentPreset.aspectRatio;
    cfgDuration.value = currentPreset.duration;
  }

  // ============================================================
  // 预设编辑器
  // ============================================================
  presetEditToggle.addEventListener('click', () => {
    presetDisplay.style.display = 'none';
    presetEditor.style.display = 'block';
    presetEditToggle.style.display = 'none';
  });

  presetCancel.addEventListener('click', () => {
    presetDisplay.style.display = 'grid';
    presetEditor.style.display = 'none';
    presetEditToggle.style.display = 'inline';
    updatePresetDisplay();
  });

  presetSave.addEventListener('click', () => {
    currentPreset = {
      model: cfgModel.value,
      referenceMode: cfgRefMode.value,
      aspectRatio: cfgRatio.value,
      duration: cfgDuration.value,
    };
    presetDisplay.style.display = 'grid';
    presetEditor.style.display = 'none';
    presetEditToggle.style.display = 'inline';
    updatePresetDisplay();
    saveSettings();
  });

  // 自动保存 prompt 和 delay
  promptInput.addEventListener('blur', saveSettings);
  taskDelayInput.addEventListener('change', saveSettings);

  // ============================================================
  // 连接检查
  // ============================================================
  async function checkConnection() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url?.includes('jimeng.jianying.com')) {
        showConnStatus('请打开即梦AI页面', false);
        return false;
      }

      const response = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
      if (response && response.ready) {
        showConnStatus('✅ 已连接即梦AI页面', true);
        return true;
      }
    } catch (e) {
      showConnStatus('❌ 未连接 - 请打开即梦AI生成页面并刷新', false);
    }
    return false;
  }

  function showConnStatus(msg, connected) {
    connStatus.textContent = msg;
    connStatus.className = 'conn-status ' + (connected ? 'connected' : 'disconnected');
  }

  btnCheckPage.addEventListener('click', async () => {
    btnCheckPage.textContent = '⏳';
    btnCheckPage.disabled = true;
    await checkConnection();
    btnCheckPage.textContent = '🔗';
    btnCheckPage.disabled = false;
  });

  // Popup 打开时自动检查连接
  checkConnection();

  // ============================================================
  // 文件上传区域
  // ============================================================
  uploadArea.addEventListener('click', () => fileInput.click());

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#e94560';
  });
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = '#0f3460';
  });
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#0f3460';
    handleFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
    fileInput.value = '';
  });

  function handleFiles(files) {
    const imageFiles = Array.from(files).filter(f =>
      ['image/jpeg', 'image/png', 'image/webp'].includes(f.type)
    );
    const remaining = MAX_FILES - selectedFiles.length;
    const toAdd = imageFiles.slice(0, remaining);
    selectedFiles = selectedFiles.concat(toAdd);
    updateUI();
  }

  function updateUI() {
    const count = selectedFiles.length;

    statusBar.style.display = count > 0 ? 'flex' : 'none';
    fileCount.textContent = `${count} / ${MAX_FILES} 张`;

    fileList.innerHTML = '';
    selectedFiles.forEach((file, idx) => {
      const item = document.createElement('div');
      item.className = 'file-item';
      item.innerHTML = `
        <span class="name">${idx + 1}. ${file.name}</span>
        <span class="remove" data-idx="${idx}">✕</span>
      `;
      fileList.appendChild(item);
    });

    fileList.querySelectorAll('.remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.idx);
        selectedFiles.splice(idx, 1);
        updateUI();
      });
    });

    btnGenerate.disabled = count === 0;
    btnGenerate.textContent = `🚀 开始批量生成（${count} 个任务）`;
  }

  // ============================================================
  // 清空
  // ============================================================
  btnClear.addEventListener('click', () => {
    selectedFiles = [];
    updateUI();
  });

  // ============================================================
  // 应用预设参数
  // ============================================================
  btnPreset.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url?.includes('jimeng.jianying.com')) {
      alert('请先打开即梦AI生成页面');
      return;
    }

    btnPreset.textContent = '⏳ 应用中...';
    btnPreset.disabled = true;

    try {
      // 通过 content script 的 applyPreset action 来应用
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'applyPreset',
        preset: currentPreset,
      });

      if (response && response.success) {
        btnPreset.textContent = '✅ 预设已应用';
      } else {
        // Fallback: 使用 scripting API 直接注入
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: applyPresetInPage,
          args: [currentPreset],
        });
        btnPreset.textContent = '✅ 预设已应用';
      }

      setTimeout(() => {
        btnPreset.textContent = '🔧 应用预设参数';
        btnPreset.disabled = false;
      }, 2000);
    } catch (err) {
      btnPreset.textContent = '❌ 应用失败';
      console.error(err);
      setTimeout(() => {
        btnPreset.textContent = '🔧 应用预设参数';
        btnPreset.disabled = false;
      }, 2000);
    }
  });

  // ============================================================
  // 文件转 base64
  // ============================================================
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ============================================================
  // 开始批量生成
  // ============================================================
  btnGenerate.addEventListener('click', async () => {
    if (selectedFiles.length === 0) return;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url?.includes('jimeng.jianying.com')) {
      alert('请先打开即梦AI生成页面');
      return;
    }

    // 先检查连接
    try {
      const pingResp = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
      if (!pingResp || !pingResp.ready) {
        alert('内容脚本未就绪，请刷新即梦AI页面后重试');
        return;
      }
    } catch (e) {
      alert('无法连接到即梦AI页面，请确认页面已打开并刷新');
      return;
    }

    btnGenerate.disabled = true;
    progressEl.classList.add('active');
    logEl.classList.add('active');
    logEl.innerHTML = '';

    const total = selectedFiles.length;
    const prompt = promptInput.value.trim();
    const taskDelay = (parseInt(taskDelayInput.value) || 2) * 1000;

    addLog(`开始批量生成 ${total} 个任务...`);
    addLog(`提示词: ${prompt || '(无)'}`);
    addLog(`任务间隔: ${taskDelay / 1000}s`);

    // 读取所有图片为 base64
    const filesData = [];
    for (let i = 0; i < total; i++) {
      progressText.textContent = `读取图片 ${i + 1}/${total}...`;
      progressFill.style.width = `${((i + 1) / total) * 30}%`;
      try {
        const base64 = await fileToBase64(selectedFiles[i]);
        filesData.push({
          name: selectedFiles[i].name,
          data: base64,
          type: selectedFiles[i].type,
        });
      } catch (err) {
        addLog(`读取失败: ${selectedFiles[i].name}`, 'error');
      }
    }

    // 逐个发送生成任务
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < filesData.length; i++) {
      const file = filesData[i];
      progressText.textContent = `生成任务 ${i + 1}/${filesData.length}...`;
      progressFill.style.width = `${30 + ((i + 1) / filesData.length) * 70}%`;

      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'generateTask',
          fileData: file,
          prompt: prompt,
          index: i,
          total: filesData.length,
        });

        if (response && response.success) {
          addLog(`✅ 任务 ${i + 1}: ${file.name}`, 'success');
          successCount++;
        } else {
          const errMsg = response?.error || '未知错误';
          addLog(`❌ 任务 ${i + 1} 失败: ${errMsg}`, 'error');
          failCount++;
        }

        // 任务间隔
        if (i < filesData.length - 1) {
          addLog(`⏳ 等待 ${taskDelay / 1000}s...`);
          await sleep(taskDelay);
        }
      } catch (err) {
        addLog(`❌ 任务 ${i + 1} 失败: ${err.message}`, 'error');
        failCount++;
      }
    }

    progressText.textContent = `完成! 成功 ${successCount}, 失败 ${failCount}, 共 ${filesData.length} 个任务`;
    progressFill.style.width = '100%';
    addLog(`批量完成! 成功: ${successCount}, 失败: ${failCount}`, 'success');

    setTimeout(() => {
      btnGenerate.disabled = false;
    }, 3000);

    saveSettings();
  });

  // ============================================================
  // 辅助函数
  // ============================================================
  function addLog(msg, type = '') {
    const p = document.createElement('p');
    p.className = type;
    p.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logEl.appendChild(p);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================
  // 直接注入页面执行预设参数 (备用方案)
  // ============================================================
  function applyPresetInPage(preset) {
    function sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    function simulateClick(el) {
      if (!el) return;
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }

    function findToolbar() {
      const toolbars = document.querySelectorAll('[class*="toolbar-settings-content"]');
      for (const tb of toolbars) {
        if (tb.offsetParent !== null && !tb.className.includes('collapsed')) return tb;
      }
      for (const tb of toolbars) {
        if (tb.offsetParent !== null) return tb;
      }
      return null;
    }

    async function selectOption(selectEl, targetText) {
      if (!selectEl) return false;
      if (selectEl.textContent.trim() === targetText) return true;
      simulateClick(selectEl);
      await sleep(500);
      const options = document.querySelectorAll('.lv-select-option');
      for (const opt of options) {
        if (opt.textContent.trim() === targetText || opt.textContent.trim().startsWith(targetText)) {
          simulateClick(opt);
          await sleep(300);
          return true;
        }
      }
      document.body.click();
      return false;
    }

    return (async () => {
      // Step 0: 确保在视频生成模式
      let toolbar = findToolbar();
      if (toolbar) {
        const selects = toolbar.querySelectorAll('.lv-select');
        const currentType = selects[0]?.textContent.trim();
        if (currentType !== '视频生成') {
          simulateClick(selects[0]);
          await sleep(500);
          const options = document.querySelectorAll('.lv-select-option');
          for (const opt of options) {
            if (opt.textContent.trim() === '视频生成' || opt.textContent.trim().startsWith('视频生成')) {
              simulateClick(opt);
              break;
            }
          }
          await sleep(2000);
        }
      }

      toolbar = findToolbar();
      if (!toolbar) {
        console.warn('[预设] 未找到工具栏');
        return;
      }

      const selects = toolbar.querySelectorAll('.lv-select');
      // [0]=类型, [1]=模型, [2]=参考模式, [3]=时长

      if (preset.model && selects[1]) {
        await selectOption(selects[1], preset.model);
        await sleep(400);
      }

      if (preset.referenceMode && selects[2]) {
        await selectOption(selects[2], preset.referenceMode);
        await sleep(400);
      }

      if (preset.aspectRatio) {
        const ratioBtn = toolbar.querySelector('button[class*="toolbar-button"]');
        if (ratioBtn && !ratioBtn.textContent.includes(preset.aspectRatio)) {
          simulateClick(ratioBtn);
          await sleep(500);
          const labels = document.querySelectorAll('[class*="label-"]');
          for (const label of labels) {
            if (label.textContent.trim() === preset.aspectRatio && label.offsetParent !== null) {
              const clickTarget = label.closest('[class*="ratio-option"]') || label.parentElement || label;
              simulateClick(clickTarget);
              break;
            }
          }
          await sleep(400);
        }
      }

      if (preset.duration && selects[3]) {
        await selectOption(selects[3], preset.duration);
        await sleep(400);
      }

      console.log('[预设] 参数应用完毕');
    })();
  }

  // ============================================================
  // 启动
  // ============================================================
  loadSettings();
})();
