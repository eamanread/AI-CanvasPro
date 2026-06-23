# 幻映 (huanying) — 项目协作约定

## ★ 自验证:用 Chrome 扩展自己验收，不要让用户手动确认

本机已接 **Claude-in-Chrome 扩展**，运行中的 App 在标签「幻映工作台」= `http://127.0.0.1:8777/`。
**UI / 行为改动一律自己验收**，不要丢给用户手动检查：

- `mcp__Claude_in_Chrome__javascript_tool` → 读 DOM / computed style / 量 rect / 读 store / 触发交互。
- `mcp__Claude_in_Chrome__read_console_messages`（带 `pattern`）→ 看真实报错（注意时间戳，旧报错会误导）。
- `mcp__Claude_in_Chrome__read_page` / 截图工具 → 给用户看证据（视觉改动收尾时截一张）。
- 选中节点（无公开 setter 之外的）：`appStore.setSelectedNodes([nodeId])`。
- 验完若改了 UI，截图给用户；不要只说“应该好了”。

## ★ 自验证铁律（血泪，违反就得出错误结论）

1. **拿真单例 store 必须用 bare import**：`import('/src/core/stores/appStore.js')`（**不带 `?v=`**）。
   带 `?v=` 缓存击穿会新建一份**幻影模块**——幻影 store + （若顺手 import autoload）幻影 chrome/poll 互相通信、自己生成 dock，
   你以为“验证通过”其实页面真实实例**根本没跑**。同理别用 `?v=` 去 import autoload 验证“能否加载”。
2. **只读真实 DOM**：量 dock/面板要量 `getBoundingClientRect()`（别只看 `display`）。曾出现 `display:block` 但 rect `0×0` → 用户什么都看不到。
3. **CSS 改动热替换**：改 `<link href>` 加 `?v=Date.now()` 即可，不整页刷新、保住选中态。**JS 改动**才需 `location.reload()`。

## ★ 环境陷阱

- **只用 `127.0.0.1:8777`，别用 `localhost:8777`**：server 只绑 IPv4 127.0.0.1，`localhost` 先解析到 `::1` → 卡“等待初始化”。
- **server 可能是冻结的 .exe（烘焙快照，读不到源码改动）而非 python dev（直读源码）**：
  `Get-NetTCPConnection -LocalPort 8777 -State Listen` → 查 OwningProcess 的进程名。
  `python*` = dev，我的磁盘改动**会**被服务；`*.exe` = frozen，改动**不**生效（需用户重启 dev 或重新打包）。
- **不要动用户机器**：不关 exe、不跑 bat、不重启 server。用户自己跑项目；我只负责改代码 + 用扩展自验。
- **付费按钮不许我点**：导演台「生成站位」会真调 gemini-3.1（grsai，计费），由用户亲自点。

## ★ 导演台节点输入框 dock（需求③）经验

底部停靠输入框**必须复用 App 原生停靠态类** `.text-prompt-panel.viewport-fixed-prompt.is-visible`
（见 `modules/panoramaDirectorChrome.autoload.js` `buildScriptDockContent`）。
基类 `.text-prompt-panel` 默认 `position:absolute; opacity:0; transform:scale(--zoom-inv)`——
裸用会：脱流→父容器塌成 `0×0`、`opacity:0`→透明、被画布缩放放大。别再自搓定位/`!important` 去硬掰。
外壳 `.hy-dc-scriptdock` 只做「`display` 门控 + `z-index:6200` 抬到全屏3D编辑器(6000)之上」，
**禁止给它加 `transform/filter`**（会成为 fixed 子面板的包含块，毁掉相对视口定位）。
