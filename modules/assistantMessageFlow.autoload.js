// 需求: PI agent 消息流 —— 新消息(及流式打字机增长)时自动定位到最新; 用户上滚查看历史时不打扰。
// 机制: MutationObserver 监听 .hy-canvas-agent-messages(childList 新消息 + characterData 打字机增长),
//   当用户处于"贴底"状态时把滚动容器 .hy-canvas-agent-body 滚到底; 发送自己的消息(.is-user)强制贴底。
//   (流式打字机/入场动画在 appAssistantPanel.js renderMessages; theme-upgrade.css [S16]。)
// 回退: 删本文件 + index.html 一行 script。
(function () {
  var PIN_THRESHOLD = 64; // 距底 <= 此值视为"贴底"

  function nearBottom(el) {
    return el.scrollHeight - el.scrollTop - el.clientHeight <= PIN_THRESHOLD;
  }
  function toBottom(el) {
    el.scrollTop = el.scrollHeight;
  }

  function bind() {
    var body = document.querySelector(".hy-canvas-agent-body");
    var messages = document.querySelector(".hy-canvas-agent-messages");
    if (!body || !messages || messages.__hyFlowBound) {
      return;
    }
    messages.__hyFlowBound = true;
    var pinned = true;

    body.addEventListener(
      "scroll",
      function () {
        pinned = nearBottom(body);
      },
      { passive: true }
    );

    var observer = new MutationObserver(function (mutations) {
      // 自己发的消息(.is-user)总是强制贴底
      var userSent = mutations.some(function (m) {
        return Array.prototype.some.call(m.addedNodes || [], function (node) {
          return node && node.classList && node.classList.contains("is-user");
        });
      });
      if (userSent) {
        pinned = true;
      }
      if (pinned) {
        toBottom(body);
      }
    });
    observer.observe(messages, { childList: true, subtree: true, characterData: true });

    // 初次绑定/打开时定位到底部
    toBottom(body);
  }

  bind();
  // 面板惰性挂载 / 重建兜底
  setInterval(bind, 700);
})();
