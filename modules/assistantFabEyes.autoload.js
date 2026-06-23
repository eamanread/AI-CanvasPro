// 需求: 画布右下角 PI agent 入口(启动器)做一个好看的 JS 动画 —— 两只眼睛像助手一样望来望去。
// 启动器结构(appAssistantPanel.createFabFace): .hy-canvas-agent-launcher / .fab-btn.hy-canvas-agent-fab-bound
//   > .hy-canvas-agent-fab-face > [.hy-canvas-agent-fab-eyes > i + i] + .hy-canvas-agent-fab-label("RH")。
// 本模块: 把两只 <i> 变成「眼白」, 各注入一个「瞳孔」<b>; rAF 驱动 望来望去 + 眨眼 + 跟随光标;
//   并把入口中性化(去绿光, 贴齐项目中性灰设计), 隐藏 RH 文案露出纯眼睛脸。大小沿用现有 48px。
// 样式注入为 head 最后一个 <style> 以覆盖运行时注入的 assistant 内联样式(hy-canvas-agent-assistant-style)。
// 回退: 删本文件 + index.html 一行 script。
(function () {
  var MAX_X = 2.4; // 瞳孔水平活动范围(px)
  var MAX_Y = 3.2; // 瞳孔垂直活动范围(px)
  var FOLLOW_RADIUS = 240; // 光标进入此半径时眼睛跟随

  var CSS =
    ".hy-canvas-agent-launcher.hy-fab-eyes-on,.fab-btn.hy-canvas-agent-fab-bound.hy-fab-eyes-on{" +
    "background:radial-gradient(circle at 50% 36%,#34373c 0%,#26272b 52%,#16171a 100%)!important;" +
    "box-shadow:0 6px 20px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,255,255,.07)!important;" +
    "color:#f5f5f5!important;animation:hyFabEyesBreath 4.4s ease-in-out infinite!important;overflow:hidden}" +
    "@keyframes hyFabEyesBreath{0%,100%{box-shadow:0 6px 20px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,255,255,.07)}" +
    "50%{box-shadow:0 7px 22px rgba(0,0,0,.55),inset 0 0 0 1px rgba(255,255,255,.11),0 0 16px rgba(255,255,255,.05)}}" +
    ".hy-fab-eyes-on .hy-canvas-agent-fab-face::before{" +
    "background:radial-gradient(circle at 50% 42%,rgba(255,255,255,.10),rgba(255,255,255,.02) 60%,transparent 76%)!important;filter:none!important}" +
    ".hy-fab-eyes-on .hy-canvas-agent-fab-label{display:none!important}" +
    ".hy-fab-eyes-on .hy-canvas-agent-fab-eyes{position:absolute!important;left:50%!important;top:50%!important;" +
    "transform:translate(-50%,-50%)!important;gap:7px!important;align-items:center!important}" +
    ".hy-fab-eyes-on .hy-canvas-agent-fab-eyes i{position:relative!important;width:11px!important;height:13px!important;" +
    "border-radius:999px!important;background:#eef0f2!important;display:block!important;overflow:hidden;" +
    "box-shadow:inset 0 -1px 1px rgba(0,0,0,.12)!important;transform-origin:center!important;" +
    "animation:hyFabBlink 5.4s ease-in-out infinite!important}" +
    // 眨眼用纯 CSS scaleY 动画(GPU, 永不卡死; 隐藏标签暂停后可干净恢复), 与瞳孔(JS)解耦。
    "@keyframes hyFabBlink{0%,91%,100%{transform:scaleY(1)}94%,96%{transform:scaleY(.12)}}" +
    ".hy-fab-eyes-on .hy-canvas-agent-fab-eyes i .hy-fab-pupil{position:absolute;left:50%;top:50%;width:6px;height:6px;" +
    "border-radius:999px;background:#1b1c1f;transform:translate(-50%,-50%);will-change:transform}";

  var styleEl = null;
  var state = { cx: 0, cy: 0, tx: 0, ty: 0, mouse: null, nextGaze: 0 };
  var raf = 0;
  var started = false;

  function now() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }

  function ensureStyle() {
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "hy-fab-eyes-style";
      styleEl.textContent = CSS;
    }
    // 选择器均比 assistant 内联样式高一级特异性 + !important, 无需排序, 仅保证在 head 内即可。
    if (styleEl.parentNode !== document.head) {
      document.head.appendChild(styleEl);
    }
  }

  function getLauncher() {
    return document.querySelector(".hy-canvas-agent-launcher, .fab-btn.hy-canvas-agent-fab-bound");
  }

  function ensureStructure() {
    var launcher = getLauncher();
    var eyes = launcher && launcher.querySelector(".hy-canvas-agent-fab-eyes");
    if (!launcher || !eyes) return null;
    launcher.classList.add("hy-fab-eyes-on");
    var list = eyes.querySelectorAll("i");
    if (list.length < 2) return null;
    for (var i = 0; i < list.length; i += 1) {
      if (!list[i].querySelector(".hy-fab-pupil")) {
        var pupil = document.createElement("b");
        pupil.className = "hy-fab-pupil";
        list[i].appendChild(pupil);
      }
    }
    return { launcher: launcher, pupils: eyes.querySelectorAll(".hy-fab-pupil") };
  }

  function pickRandomGaze(t) {
    if (Math.random() < 0.3) {
      state.tx = 0;
      state.ty = 0; // 偶尔回正中
    } else {
      var ang = Math.random() * Math.PI * 2;
      var rr = 0.55 + Math.random() * 0.45;
      state.tx = Math.cos(ang) * MAX_X * rr;
      state.ty = Math.sin(ang) * MAX_Y * rr;
    }
    state.nextGaze = t + 900 + Math.random() * 1900;
  }

  function step() {
    raf = 0;
    ensureStyle();
    var node = ensureStructure();
    if (node) {
      var t = now();
      var following = false;
      if (state.mouse) {
        var r = node.launcher.getBoundingClientRect();
        var dx = state.mouse.x - (r.left + r.width / 2);
        var dy = state.mouse.y - (r.top + r.height / 2);
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < FOLLOW_RADIUS) {
          following = true;
          var ang = Math.atan2(dy, dx);
          var k = Math.min(1, dist / 100);
          state.tx = Math.cos(ang) * MAX_X * k;
          state.ty = Math.sin(ang) * MAX_Y * k;
          state.nextGaze = t + 500; // 光标离开后稍候再随机
        }
      }
      if (!following && t >= state.nextGaze) pickRandomGaze(t);
      // 眨眼由 CSS @keyframes hyFabBlink 驱动, 与 rAF 解耦, 此处只更新瞳孔注视。
      state.cx += (state.tx - state.cx) * 0.16;
      state.cy += (state.ty - state.cy) * 0.16;
      var tf =
        "translate(calc(-50% + " + state.cx.toFixed(2) + "px), calc(-50% + " + state.cy.toFixed(2) + "px))";
      for (var i = 0; i < node.pupils.length; i += 1) node.pupils[i].style.transform = tf;
    }
    if (!document.hidden) raf = requestAnimationFrame(step);
  }

  function start() {
    if (started) return;
    started = true;
    document.addEventListener("mousemove", function (e) {
      state.mouse = { x: e.clientX, y: e.clientY };
    });
    document.addEventListener("mouseleave", function () {
      state.mouse = null;
    });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && !raf) raf = requestAnimationFrame(step);
    });
    raf = requestAnimationFrame(step);
  }

  // 样式立即注入(不依赖 rAF; 后台标签 rAF 会冻结)。
  ensureStyle();
  // 低频维护(setInterval 后台仍运行): 保样式在位 + 补结构(防 re-render) + 启动器出现后启动动画。
  setInterval(function () {
    ensureStyle();
    if (ensureStructure() && !started) start();
  }, 800);
})();
