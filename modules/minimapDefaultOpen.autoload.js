// 需求: 小地图默认开启。
// 机制实证: btnMinimap 点击 → minimapWrapper.classList.toggle('open') + btnMinimap '.active';
//   小地图开关无 localStorage 持久化键, 每次加载默认态由代码定。
//   本模块在启动时确保为「开」——幂等: 仅当未 open 时点一次(走应用自身开关, 保持 btn active 态同步)。
// 回退: 删本文件 + index.html 一行 script。
(function () {
  var acted = false;
  function elements() {
    var mm = document.getElementById("minimapWrapper") || document.querySelector(".minimap-wrapper");
    var btn = document.getElementById("btnMinimap");
    return (mm && btn) ? { mm: mm, btn: btn } : null;
  }
  function ensureOpen() {
    if (acted) return;
    var e = elements();
    if (!e) return;
    acted = true;
    // 留一帧给应用自身的初始化(避免在 app 尚未置默认态时误判)
    setTimeout(function () {
      if (!e.mm.classList.contains("open")) e.btn.click();
    }, 400);
  }
  if (elements()) { ensureOpen(); return; }
  var tries = 0;
  var t = setInterval(function () {
    if (elements()) { ensureOpen(); clearInterval(t); }
    else if (tries++ > 80) clearInterval(t);
  }, 150);
})();
