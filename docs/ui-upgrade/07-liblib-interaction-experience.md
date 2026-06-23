# LibTV（liblib.tv）画布产品 · 交互体验文档

日期：2026-06-12
定位：与 [06-liblib-feature-inventory.md](06-liblib-feature-inventory.md)（功能"是什么"）互补，本文档回答"用起来什么感觉、为什么这么设计、规格是多少"。
采证基础与可信度：同 06 文档。**计时声明**：本站浮层开/关动画全部由 JS（rAF/Framer Motion）驱动而非 CSS transition，后台 tab 的 rAF 被 Chrome 冻结，因此所有"动画时长"观测不可信，本文仅引用 CSS 声明的过渡值（可信）与"近即时/JS 驱动"的定性结论；需要精确时长的项已列入待前台复测清单。

---

## 1. 交互设计哲学（从证据归纳）

1. **内容即界面**：节点卡上几乎没有 chrome——图片节点就是一张圆角图，文本节点就是一块 Markdown。所有操作件（标题、桩、工具条、参数卡）都悬浮在节点外部，选中才出现。
2. **中性灰白的控制语言**：选中环 #a8a8a8、resize 线 #a8a8a8、选中连线 #e0e4e8——全部无彩。彩色只承担两种职责：品牌青（#09CAF5/#5DDCFF）用于信息强调（快捷键分类标题、NEW 徽章、保存按钮），蓝色流光（rgba(100,180,255,*)）用于数据流动表意。
3. **渐进披露（hover-reveal）无处不在**：菜单项描述 hover 才淡入（200ms）、画布行的 ⋯ 按钮 hover 才浮现、连接桩选中才显形、项目名 hover 才显示可编辑下划线。默认界面极静，信息按需出现。
4. **单一主入口强调**：全界面唯一的白底按钮是工具坞的"+"（--canvas-primary-btn rgba(255,255,255,.9)）——视觉权重的最大值只给一处。
5. **成本前置透明**：每个提交钮旁直接标 `⚡6`/`⚡14` 积分消耗，余额常驻顶栏——把商业化做进交互而非藏在弹窗后。
6. **浮层即用即走**：绝大多数浮层点外部即关、hover 离开即收；只有两个例外刻意做成"强制停留"（会话过期模态、AI 水印规则确认——后者无 X、Esc 与遮罩点击均不可关）。
7. **快捷键当作一等公民**：右键菜单内联快捷键提示、官方四列速查面板、aria-label 里都带键位（`整理画布，Alt+Shift+F`）。

## 2. 选中与焦点模型

- **单击节点 → 同帧完成三件事**：壳 outline 0→2px #a8a8a9（**瞬时、无过渡**——选中要的是确定感，不是优雅）；±25px 位移显形左右 "+" 桩（opacity 过渡）；对应工具条/参数卡挂载（JS 驱动入场 transform+opacity，CSS 声明 0.15s cubic-bezier(0,0,0.2,1)）。
- **反选**：单击空白，全部选中 UI 同步消失，无残留动画。
- **选中工具条的位置策略分两种**：普通节点/组 → 浮于该节点上方；图片节点 → **画布顶部居中**（图像工具多，固定位置便于连续操作）。
- **组选中**：4 边 1px #a8a8a8 线 + 4 角 8×8 方形手柄（手柄按 1/zoom 反向缩放保持屏幕恒定大小）。
- **连线选中**：点击 20px 隐形命中带 → 线 2px→3px、#86909c→#e0e4e8（stroke .2s 过渡）+ 蓝色流光彗尾沿路径流动（JS 驱动渐变坐标）；反选流光 defs 即刻移除。
- 节点 tabindex 化（edge role=group tabindex=0），存在键盘焦点基础设施（遍历顺序未实测）。

## 3. 浮层开闭模型（开闭方式矩阵）

| 浮层 | 打开 | 关闭 | 备注 |
|---|---|---|---|
| 工具坞各面板 | 点击 toggle | 再点同钮 / 点外部 / X | 工具坞内弹层互斥（开 B 自动关 A） |
| 顶栏 Logo 菜单/画布切换器 | 点击 | 点外部（Esc 合成无效） | 顶栏 Popover 间可同开（与工具坞作用域不同） |
| 分享面板 / 头像面板 | **hover 触发** | 移出自动收 | Mantine HoverCard |
| 添加节点菜单项描述 | hover 行 | 移出 | 200ms opacity |
| 图片工具条下拉（九宫格/高清/宫格切分） | **hover 触发**（onMouseEnter） | 移出 | 按钮带 aria-haspopup=menu |
| 模型选择器 | 点击 | 点外部 | 短存活 |
| 右键菜单 | contextmenu | 点外部 / 他处再右键 | 自定义 div 非 role=menu |
| ant 模态（充值/会员超市） | 点击 | X（ant-zoom 缩放出入场） | 遮罩 rgba(0,0,0,.45) |
| 大图查看器 | 工具条「预览」 | 仅右上 X | 黑 80% 遮罩，无缩放/翻页控件 |
| AI 水印规则 | 点击 | **仅「保存设置」**（无 X、Esc/遮罩无效） | 强制阅读型 |
| 会话过期 | 被动触发 | **仅「刷新页面」** | 画布冻结只读 |

层级令牌（实测启用）：`--z-chrome:100 → --z-sticky:200 → --z-dropdown:300 → --z-panel:400 → --z-modal:500 → --z-overlay:600 → --z-toast:700 → --z-critical:800 → --z-notify:9999`。

## 4. 动效语言

- **二元分工**：状态着色（hover/active 的 bg/border/color）走 CSS transition——全站统一 `0.15s cubic-bezier(0.4, 0, 0.2, 1)`；浮层出入场走 JS（rAF）驱动（transition-duration 计算值为 0s）。
- 可信的 CSS 声明值：
  - 颜色类过渡：150ms cubic-bezier(.4,0,.2,1)（按钮 hover、行高亮、网格吸附钮激活）
  - 菜单项描述淡入：200ms opacity；工具流卡片 hover：图 scale 1→1.05（200ms）+ 遮罩 150ms
  - 连线：stroke .2s + stroke-width .2s
  - 浮动标题：transform .15s + opacity .15s cubic-bezier(0, 0, 0.2, 1)
  - 右键菜单项 hover：background 120ms
  - 模式切换滑块：transform 200ms
- **选中 outline 无过渡**（瞬时）——与"反馈要快"的工具属性一致。
- 入场形态（JS 侧观测到的中间帧）：scale ~0.2/0.55→1 + opacity 0→1（快捷键面板）；ant 模态 ant-zoom（observed scale≈0.79 中间帧）。
- 没有任何装饰性常驻动画（无呼吸灯、无循环光效）；唯一的持续动画是选中连线的数据流光——动效只用于表意。

## 5. 反馈与状态传达

- 禁用态：opacity 0.3 + cursor default（右键菜单）；提交钮空输入 disabled。
- 状态徽标：「输入已更新」浮于节点标题行（上游变更提示）；分辨率徽标常驻标题行右侧。
- 会员/商业状态：模型名旁 💛 会员标；积分 `⚡N` 前置；促销角标悬浮于顶栏胶囊上方（奶金底 #FAD6A4、圆角 6/6/6/0 带"指向"直角）。
- 加载：页面级「项目加载中...」（带 × 可跳过等待）；视口外节点用 `node-skeleton` 灰骨架 + 20×20 桩占位，进入视口实载。
- toast 基础设施：Mantine Notifications 六方位容器常驻（440px），z-toast 700（有数据态未观测到）。

## 6. 输入模型

- **滚轮 = 平移**（垂直/水平 1:1 像素），**Ctrl+滚轮 = 缩放**（以光标为锚，系数 2^(−deltaY×0.002)，无档位吸附，10%–800%）——Figma 式 panOnScroll，明确偏向触控板/双指用户。
- Space+左键 = 平移；中键 = 平移；自定义 SVG 光标（20×20 深色箭头白描边带投影，Figma 风格）。
- 双击 = 进入内容编辑（文本节点 Tiptap 富文本 + 12 钮格式条）；单击建议项（「尝试：」）= 快速起步。
- 右键 = 类型化上下文菜单（六种作用域各不相同，见 06 §7）。
- 键盘语义完整（Tab 建节点 / Ctrl+Enter 生成 / Ctrl+L 连线 / Alt 拖复制 / Ctrl+Alt 拖副本 / 成组解组 / Alt+Shift+F 整理）——拖拽修饰键组合是其交互深度的主要载体（本轮禁拖拽未实测行为）。

## 7. 性能工程观察

- React Flow `onlyRenderVisibleElements`：节点与连线都按视口虚拟化（47 节点画布 DOM 内仅 6–48 个；高缩放下连线渲染数可为 0）。
- 视口外骨架占位（`node-skeleton`/`node-skeleton-img` + `skeleton-handle-indicator`）。
- wheel 事件同步处理成本实测：avg 0.51ms / p50 0.3ms / p95 1.9ms / max 8.5ms（12 节点在视口）——事件层无卡顿征兆；真实帧率需前台复测。
- 图片走 OSS 派生尺寸（缩略 w_140 webp、风格卡 528×708 fill）。

## 8. 设计令牌实测全表（节选，完整 199 项见 `tmp/liblib-deep/_help_tokens2.json`）

```
画布      --canvas-bg:#141414  --canvas-bg-dot:#474747  --canvas-edge:#86909c
          --canvas-edge-hover:#c0c8d0  --canvas-edge-selected:#e0e4e8
          --canvas-node-border:#363636  --canvas-node-border-selected:#a8a8a8
          --canvas-group-bg/border:#ffffff1a  --canvas-handle-bg:#1e1e1ee6
          --canvas-handle-icon:#ffffffb3  --canvas-selection-bg:#ffffff0f
控件      --canvas-controls-bg:#262626  --canvas-controls-border:#363636
          --canvas-controls-text:#fff  --canvas-controls-text-muted:#919191
          --canvas-controls-hover:#ffffff1a  --canvas-controls-active:#ffffff26
          --canvas-primary-btn-bg:#ffffffe6  --canvas-primary-btn-icon:#141414
          --canvas-controls-focus:#0690ae
小地图    --canvas-minimap-bg:#1f1f1fe6  --canvas-minimap-mask:#ffffff0a
          --canvas-minimap-node:#525252
阴影      --canvas-shadow-dropdown: 0 4px 10px #00000040, 0 2px 4px #0000004d
          --canvas-shadow-menu: 0 8px 32px #00000026, 0 2px 8px #0000001a
          --canvas-shadow-panel: 0 2px 5px #00000026
顶栏      --topnav-btn-bg:#171717  --topnav-btn-border:#363636  --topnav-btn-hover-bg:#363636
文字      --fg-default:#f7f7f7  --fg-secondary:#a8a8a8  --fg-muted:#919191
          --fg-subtle:#86909c  --fg-disabled:#525252  --fg-brand:#5ddcff
品牌      --color-primary:#09caf5  --color-brand-300:#5ddcff  --color-danger:#ff6a6f
表面      --bg-page:#141414  --bg-surface:#171717  --bg-surface-elevated:#363636
          --bg-overlay:#000000b2
圆角      sm:4 md:6 lg:8 xl:12 2xl:16 full:9999
z 序      chrome:100 sticky:200 dropdown:300 panel:400 modal:500 overlay:600
          toast:700 critical:800 notify:9999
```

⚠ **死令牌警示**：:root 共 1049 个自定义属性，其中部分与实测不符（`--canvas-node-bg:#191e26`、`--color-modal-background:#2a2d3d`、`--color-background-popover:#1c1d29` 均未启用，实测为 #262626/#1c1c1c 系）。像素对标一律以 getComputedStyle 实测为准，不可盲抄令牌表。

## 9. 值得借鉴的微交互清单

1. 菜单项两行结构：标题常显 + 描述 hover 淡入——信息密度与整洁的两全
2. 键帽（kbd）组件化：28px 高、1px #363636 边、8px 圆角，图标键帽（鼠标滚轮/捏合手势高亮青色部位）
3. 帮助菜单的二维码"侧展"：容器 104→262px 加宽，二维码与菜单并排而非另开弹窗
4. 促销角标的"指向性圆角"（6/6/6/0，左下直角指向所属胶囊）
5. 充值滑杆 + 实时价格联动（600～499,950 积分自定义档）
6. 图层面板行的双动作：整行=定位（平移+缩放归 100%+选中），行尾 ⋯=管理（重命名/复制）
7. 「时间降序」点击翻转式排序（省一层下拉）
8. 批量操作的"顶栏替换"模式（已选 N 项 / 删除 / 下载 / 使用 / 取消选择）
9. 选中连线的数据流光（方向表意：数据从上游流向下游）
10. 强制阅读模态的克制使用（全站仅 AI 水印规则一处）

## 10. 对幻映对标方案（05 文档）的增量修订

本轮深挖对 [05-liblib-alignment-plan.md](05-liblib-alignment-plan.md) 的影响：

1. **令牌基准升级**：05 方案的四级灰推断与实测一致（#141414/#171717/#262626/#363636 ✓），新增可直接引用的精确令牌：选中环 `#a8a8a8`（outline 2px offset −1px **瞬时**——05 方案①写的 1px 需更正为 2px/瞬时）、连线三态 `#86909c/#c0c8d0/#e0e4e8`、文字五级 `#f7f7f7/#a8a8a8/#919191/#86909c/#525252`、focus `#0690ae`。
2. **阴影体系修正**：liblib 并非"几乎无阴影"——浮层有两档系统阴影（dropdown `0 4px 10px #00000040,0 2px 4px #0000004d`、menu `0 8px 32px #00000026,0 2px 8px #0000001a`），05 方案①的去阴影化应改为"换成这两档"。
3. **新增对标面**：左下控件簇容器实测 bg rgba(20,20,20,.7) 有底色（05 方案写 transparent 需修正）；图层/资产左侧抽屉（幻映资产面板可对标其 280px 停靠形态）；选中工具条阴影 `rgba(0,0,0,.12) 0 4px 10px, rgba(0,0,0,.2) 0 2px 4px`。
4. **动效策略确认**：状态色 150ms cubic-bezier(.4,0,.2,1) 与幻映 [S2] 已落地的 120–160ms ease-standard 同量级，无需返工；新增"选中瞬时无过渡"原则（幻映当前选中环走 transition，对标需去掉）。
5. **快捷键预设（05 阶段⑤）输入**：官方键位表已完整采得（06 §8），预设文件可直接按表编写。

## 附录：待前台复测清单（需要真实指针/前台 tab）

hover 全族实拍（连接桩显形、连线 hover 色、dock tooltip、菜单描述终态）；各浮层动效精确时长与真实帧率；Space 抓手光标；缩放菜单逐项；真实双击图片是否开查看器；真实 Esc 行为；以及 06 附录 B 的"创作主循环"全链路（建议沙箱项目+少量积分预算专项补测）。
