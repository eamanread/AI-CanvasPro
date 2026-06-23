// 「我的画布」独立确认/命名弹窗（T6）。仿 .save-dialog 视觉但【独立 DOM】，不劫持 #saveDialogOverlay
// （后者按钮已被 CanvasProjectDropdownManager 绑定）。根类 .hy-mycanvas-dialog 已登记进
// unifiedSidebarDrawer 的点外关闭排除选择器，否则点弹窗会顺手关掉抽屉。

function buildOverlay() {
  let ov = document.getElementById("hy-mycanvas-dialog");
  if (ov) return ov;
  ov = document.createElement("div");
  ov.id = "hy-mycanvas-dialog";
  ov.className = "hy-mycanvas-dialog";
  document.body.appendChild(ov);
  return ov;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function openDialog({ title, message, withInput, defaultValue, confirmText, cancelText, danger }) {
  return new Promise((resolve) => {
    const ov = buildOverlay();
    const card = el("div", "hy-mcd-card");
    card.appendChild(el("div", "hy-mcd-title", title || ""));
    if (message) card.appendChild(el("div", "hy-mcd-msg", message));
    let input = null;
    if (withInput) {
      input = el("input", "hy-mcd-input");
      input.type = "text";
      input.value = defaultValue == null ? "" : String(defaultValue);
      card.appendChild(input);
    }
    const actions = el("div", "hy-mcd-actions");
    const cancel = el("button", "hy-mcd-btn hy-mcd-cancel", cancelText || "取消");
    cancel.type = "button";
    const ok = el("button", "hy-mcd-btn hy-mcd-confirm" + (danger ? " is-danger" : ""), confirmText || "确定");
    ok.type = "button";
    actions.appendChild(cancel);
    actions.appendChild(ok);
    card.appendChild(actions);
    ov.replaceChildren(card);
    ov.classList.add("open");

    let done = false;
    function cleanup(val) {
      if (done) return;
      done = true;
      ov.classList.remove("open");
      ov.replaceChildren();
      document.removeEventListener("keydown", onKey, true);
      resolve(val);
    }
    const onConfirm = () => cleanup(withInput ? (input ? input.value : "") : true);
    const onCancel = () => cleanup(withInput ? null : false);
    function onKey(e) {
      if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); onCancel(); }
      else if (e.key === "Enter" && (!withInput || document.activeElement === input)) { e.stopPropagation(); e.preventDefault(); onConfirm(); }
    }
    ok.addEventListener("click", onConfirm);
    cancel.addEventListener("click", onCancel);
    ov.addEventListener("pointerdown", (e) => { if (e.target === ov) onCancel(); }); // 点遮罩=取消
    document.addEventListener("keydown", onKey, true);
    setTimeout(() => { if (input) { input.focus(); input.select(); } else ok.focus(); }, 0);
  });
}

// 确认弹窗 → Promise<boolean>
export function confirmDialog(opts = {}) {
  return openDialog({ ...opts, withInput: false });
}

// 命名弹窗 → Promise<string|null>（取消=null）
export function namePrompt(opts = {}) {
  return openDialog({ title: opts.title, message: "", withInput: true, defaultValue: opts.defaultValue, confirmText: opts.confirmText || "保存", cancelText: opts.cancelText });
}
