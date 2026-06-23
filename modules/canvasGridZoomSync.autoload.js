// 画布点阵缩放跟随：把渲染器维护的 --zoom-inv(倒数)镜像为 --hy-zoom(正向)
// 供 #v2-wrap 背景点阵 background-size 跟随画布缩放。纯镜像, 不触碰渲染逻辑。
(function () {
  const wrap = document.getElementById("v2-wrap");
  const canvas = document.getElementById("v2-canvas");
  if (!wrap || !canvas) return;
  let last = 0;
  function sync() {
    let inv = NaN;
    for (const el of [canvas, wrap, document.documentElement, document.body]) {
      if (!el) continue;
      const v = parseFloat(getComputedStyle(el).getPropertyValue("--zoom-inv"));
      if (v && isFinite(v) && v > 0) { inv = v; break; }
    }
    const zoom = inv && isFinite(inv) ? 1 / inv : 1;
    if (Math.abs(zoom - last) > 0.001) {
      last = zoom;
      wrap.style.setProperty("--hy-zoom", String(Math.max(0.1, Math.min(zoom, 8))));
    }
  }
  new MutationObserver(sync).observe(canvas, { attributes: true, attributeFilter: ["style"] });
  wrap.addEventListener("wheel", () => requestAnimationFrame(sync), { passive: true });
  sync();
})();
