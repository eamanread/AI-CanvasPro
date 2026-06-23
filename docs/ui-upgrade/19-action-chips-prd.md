# 幻映 · 面板「启动 Provider 注册表 → 活体契约卡」· 产品需求文档（PRD · Phase D）

> 状态:待评审(review #2,通用化重构后)。本 PRD 通过后 → 落地开发文档(20-…-dev-doc) → 评审 → 开发 → 再接 B5(429 探针)/Phase C。
> 日期:2026-06-14。分支:feature/codex-work-20260609。

## 0. 一句话与决策记录

把"记不住的命令前缀"(`导演:/成片:/定妆:/继续/取消/《拍法》`)变成**看得见、可点击的卡片操作**:任意创作 brief 在面板里直接长出启动 chip,点击先看「将生成 N 节点 + 成本」契约预览再确认,之后是一张随 story→cast→暂停→storyboard **长大的活体契约卡**。

**关键架构决定(用户拍板 1):这套是 _通用框架_,不是 ViMax 专属。** 通用核心(chip 渲染 / 契约预览 / 活体卡状态机 / 确定性触发 / 受信落地)是 **provider 无关**的;每个"会落画布的源"(ViMax、QMAI 导演、未来项目)注册一个 **LaunchProvider** 插进来。**本期只注册 ViMax(provider #1)**,但框架与接口按通用做——和你早先认可的「落画布不要人手一套」是同一条原则(通用词汇 + 薄 per-source 插件)。详见 §3.1、§16。

用户已拍板(本 PRD 的硬前提):
1. **通用框架 + ViMax 为首个 provider**(本期只注册 ViMax;接口/注册表通用;不给 QMAI/未来源写 provider)。
2. **可发现性强**(激进触发):任意非平凡、非命令消息都挂启动 chip。
3. **契约预览前置**:点启动 chip 先弹「将生成 N 节点 + 成本 + 落点」预览,再 `[确认]` 才执行。
4. **v1+v2+v3 一期上线**:启动 chip + 活体卡 + 契约预览 + 节点旁转向 + 换拍法内联选择器,一次交付。
5. **流程**:本 PRD → review → 开发文档 → review → 开发 → B5/Phase C。

## 1. 背景与目标

### 1.1 痛点(真机实测)
小白用户在面板直接打自然语言「雨夜便利店,陌生人递来一把伞,简短告别」(无 `导演:` 前缀)→ 落进通用对话,被当成"建个文本节点 + 扩写",**没进 ViMax 导演链**。前缀是**隐形的默会知识**,新用户无从知晓;系统替用户猜了个最弱的意图,且猜错。

### 1.2 目标
- **G1 可发现性**:用户无需记忆任何命令前缀即可进入导演/成片/定妆链。
- **G2 默会知识显形**:把系统已知的(品类、要生成几个节点、成本、暂停点、可用拍法)摊成卡上的可视 affordance。
- **G3 成本前置可见**:出图花费在**执行前**以契约预览呈现,降低"撞 $4000"焦虑。
- **G4 零架构回退**:不破坏画布即真相、成本主权、B3 steer 暂停;chip 只是已有确定性命令的薄壳。

### 1.3 非目标(本期不做)
- 不做"AI 猜意图自动执行"——chip 永远是显式选择(见 §8 红线)。
- **不给 ViMax 之外的源真写 provider**(QMAI 导演 / 未来项目):本期只建**通用框架 + 注册表 + 接口**并注册 ViMax 一个;别的源的 provider 是它们各自的活。
- 不做逐镜流式 storyboard streaming(B3 遗留项,另行排期)。
- 不改 brain/orchestrator/claw 的后端能力(无 Python 改动;后端复用 B1–B3 已建)。**注意:前端不是薄层**——核心是卡 schema/状态机/provider 框架扩展(§6.4、§3.1)。
- 不做移动端专门适配(桌面 680px 面板为主;chip 行溢出走换行/「更多」)。

## 2. 现状基线(代码事实,复用而非重建)

| 已有能力 | 位置 | 本期如何复用 |
|---|---|---|
| 执行契约卡「将生成 N 节点·需确认」 | `assistantInteractionCards.js` createInteractionCard;`appAssistantPanel.js` updateLatestInteractionCard | 升级成"活体卡":加 `options[]` chip + `paused` 卡态 + 步骤进度 |
| ViMax 命令解析/分发 | `vimaxCommandParser.js` parseVimaxCommand;`applyVimaxNativePlanCommand`(B3) | chip 点击 = 合成 `导演:<brief>` 喂回原 dispatch,不新开路径 |
| 成本闸 | `parseVimaxRenderConfirm` / `parseVimaxPortraitsConfirm` + 预算签字(P2-M11) | 成片/定妆 chip 仍走这两道闸,chip 不绕过 |
| B3 steer 暂停/继续 | orchestrator paused + `/native/resume`;面板 `pendingVimaxNativeResume` + 继续/取消 | 「继续」既是卡上 chip 也可打字;暂停态驱动卡 UI |
| 受信落地 | `landTrustedVimaxActions`(B3a)+ claw `vimax-director` 血统 | chip 路径产物仍走受信 executeActions + claw |
| 创作意图打分 | `rankDirectorKnowledge`(已在面板上下文打分) | 作为触发的**确定性**信号(非 LLM 每条猜) |
| 品类预设卡 | `slashMenu.js` preset 渲染(社交媒体/剧情短片/营销视频/智能漫剧/爆款实验室) | 顶部品类卡复用同一套启动词汇 |

## 3. 核心概念与心智模型

**心智模型**:面板不是命令行,是**一张随导演流程长大的契约**。
三个时刻:
1. **入口(启动 chip)**:无前缀创作 brief → 回复下方挂确定性启动 chip(`导演/成片/定妆/换拍法`)。
2. **契约预览**:点启动 chip → 展开「将生成 N 节点 + 成本 + 落点 + 是否可逆」预览 → `[确认开始]`。
3. **活体卡 + 转向**:确认后,契约卡原地演进 `故事✓ → 角色表✓ → 暂停⏸ → 分镜`;暂停时卡上 `[继续][取消]` chip,同一「继续」affordance 也贴在画布角色节点旁(画布原生)。

参考视觉:见本 PRD 配套 mockup(意图启动 + 活体卡 + 暂停 + 成本脚注一图)。

### 3.1 启动 Provider 框架(通用核心 vs per-provider 插件)

整套能力分两层,**镜像「落画布」的通用词汇 + 薄 mapper 模式**:

**通用核心(provider 无关,本期主要工作量,§6.4)**:启动 chip 行渲染、契约预览卡、活体卡 schema + 状态机、确定性触发外壳、受信落地管道、暂停态/继续/取消 UI。这些**不认识 ViMax**,只认 `LaunchProvider` 接口。

**LaunchProvider 接口(每个会落画布的源实现一份,薄)**:
```
LaunchProvider = {
  id,                                   // "vimax" | "qmai" | ...
  match(message, ctx) -> bool,          // 确定性:这条消息是否挂我的 chip(R1,纯前端不调 LLM)
  chips: [{ id, label, icon, costTier, tooltip }],   // 我的启动 chip
  deriveContract(chipId, brief, ctx) -> ContractPreview,  // 我的契约预览(纯,不调 LLM,§6.3)
  synthesizeCommand(chipId, brief, opts) -> string,       // chip → 已有命令 1:1(R2)
  resumeAffordance?(node) -> bool,      // (可选)我是否在某节点旁挂转向 affordance
  // 注意:NO lineageTag field — 血统由注册表按 id 静态映射,见下(R5 防伪造)
}
```
- **血统映射(R5,不可伪造)**:provider **只声明 `id`**;受信血统由**注册表内的静态白名单** `PROVIDER_LINEAGE = {"vimax":"vimax-director"}` 决定,`landTrustedActions(actions, providerId, executionId)` 内部查这张表得血统,**provider 拿不到、也传不进血统字符串**。注册时 id 不在表内 / 命中保留名单 → 拒绝注册。
- **deriveContract 适配**:接口签名 `deriveContract(chipId, brief, ctx)`;ViMax 内部把 `chipId(director/film/portraits)` 映射到 `deriveVimaxContractPreview(mode,...)`(§16.2 给 chipId→mode 适配)。

- **注册表**:`registerLaunchProvider(provider)`;面板触发时**聚合所有 match() 命中的 provider 的 chip**(本期注册表里只有 ViMax,行为等同 ViMax 专属版,但缝在那)。
- **ViMax = provider #1**:导演/成片/定妆/换拍法 chip、`deriveVimaxContractPreview`、`导演:/成片:/定妆:` 合成、`vimax-director` 血统、cast 节点旁「继续」—— 全部填进 ViMax provider(§16),**不散落在面板里**。
- **红线 = provider 契约**:§8 的 R1–R6 升级成"任何 provider 想进注册表,必须满足的不变式"。
- **拍法类 skills(49 套)不是 provider**:它们是**知识层**(被 ViMax 大脑消费),由 ViMax provider 的 `换拍法 chip` 在其内部覆盖;只有"会自己产计划落画布的源/项目"才是 LaunchProvider。

## 4. 设计语言

- 复用现有面板/Warp 暗色卡片语言;chip = 圆角(`--border-radius-md`)、0.5px 边框药丸,主推路径(导演)2px info 边框强调,其余中性边框。
- 成本标:免费=success 绿小字,需出图=warning 琥珀小字。
- 图标走系统现有图标体系(导演=movie、成片=photo、定妆=user、拍法=books、继续=arrow-right、暂停=player-pause);**不用 emoji**。
- 句式小写化、两档字重;字号 ≥12px。

### 4.1 无障碍与国际化(review#1 补)
- **a11y**:每枚 chip 带 `aria-label`(如「启动导演规划流程」「启动成片渲染」「全部角色定妆」「更换拍法」);chip 行可 Tab 遍历(顺序 导演→成片→定妆→换拍法),Enter/Space 激活;节点旁「继续」徽章有清晰 focus ring + tooltip;契约预览 [确认开始]/[取消]、暂停 [继续]/[取消] 均可键盘操作。
- **i18n**:本期文案中文;但所有用户可见文案(chip 标签、成本标、契约预览标题、暂停提示、收工条)**集中到一处字符串表**(具体文件名 dev-doc 定),为后续多语言留口,避免散落难回收。

## 5. 信息架构与交互流程

> **范围标注(review#2)**:§5–§7 的所有具体词汇(导演/成片/定妆/换拍法、故事+角色表+分镜、雨夜便利店流程、5 张 mockup)都是 **ViMax(provider #1)的具体填充**,不是通用层。**通用规则**是:provider `match` 命中 → 渲染其 `chips` → 点击 → `deriveContract` 预览 → 确认 → `synthesizeCommand` 执行 → 受信落地 → 活体卡演进(§3.1/§6.4/§16)。换个 provider(如 QMAI 导演),chip 标签/阶段名/成本档/契约结构都不同,但走同一通用骨架。dev-doc 实现时:凡 §5–§7 出现 ViMax 词汇,归 `vimaxLaunchProvider`;通用层只认接口(AC8 grep 守)。

### 5.1 时刻一:启动 chip(入口)
- **触发**(确定性,§6.1):一条用户消息**不含** ViMax/导演命令前缀、**非画布操作类**(移动/删除/排队等)、且 `rankDirectorKnowledge` 判定为"像创作 brief"或满足"非平凡文本"基线 → 在**该条助手回复下方**渲染启动 chip 行。
- **chip 集**:`导演(免费)`、`成片(需确认)`、`定妆·全部可见角色(需确认)`、`换拍法 ▾`;下一行小字提示「同一套词汇,顶部品类卡也走这里」。
  - **定妆 chip 的角色目标**(review#1 钉):chip 合成 `定妆:`(**空 body**)= 对**画布当前可见角色表**全量定妆(复用"空 body=全可见"语义);**不**弹角色选择器(本期);故 label 标「定妆·全部可见角色」。画布尚无角色表 → chip 灰显 + 提示「先用导演生成角色表」。
- **品类卡映射**(review#1 补全,5 张全列;卡在 UI 已存在,渲染处由 dev-doc 定位):

  | 品类卡 | 等价启动 | 预填 brief 模板 |
  |---|---|---|
  | 社交媒体 | 导演 | 「为社媒短视频:<补一句>」 |
  | 剧情短片 | 导演 | 「拍一条剧情短片:<补一句>」 |
  | 营销视频 | 导演(出图走成片闸) | 「商品营销片,突出卖点:<补一句>」 |
  | 智能漫剧 | 导演 | 「连载漫剧分镜:<补一句>」 |
  | 爆款实验室 | **保持原行为**(上传→一键复刻,不接启动 chip) | — |

  规则:前 4 张点击 = 预填模板 + 自动挂对应启动 chip;爆款实验室维持现状(§13 外)。
- **可发现性强**:默认显示;仅在"明显不是 brief"时不显示(见 §6.1 排除规则)。经典前缀**仍可用**;用户打了 `导演:` 前缀则**不**再挂 chip(前缀优先级更高)。
- **并发/暂停保护**(review#1 钉,配合 §6.1):当 `pendingVimaxNativeResume` 处于暂停态时,新消息**不挂启动 chip**(冻结),仅认 [继续]/[取消];若用户此时**显式打 `导演:` 新前缀**,则**先自动取消旧暂停流**(显式前缀优先,单一 pending 源),再起新计划——避免两个暂停流抢一个 `pendingVimaxNativeResume`。

### 5.2 时刻二:契约预览(点启动 chip 后)
点任一启动 chip → **不立即执行**,先把启动 chip 行就地替换/展开为**契约预览卡**:
- 标题:`导演计划 · <brief 摘要>`(成片/定妆同理)。
- 主体:`将生成 N 个节点`(N 来自模式:导演=故事+角色表+分镜≈3;定妆=角色数×1;成片=镜数)+ 节点清单(类型 + 血统标注)。
- 成本行:`规划免费` 或 `成片约 M 张图(需预算签字)`/`定妆约 K 张图`。
- 流程行:`[故事] → [角色表] → 暂停 → 继续 → [分镜]`(导演链显式画出暂停点)。
- 可逆性:标注哪些节点纯结构(可删)、哪些会触发出图(需确认)。
- 动作:`[确认开始]` `[取消]`。换拍法:`[换拍法 ▾]` 内联选择器(§5.5)。

### 5.3 时刻三:活体契约卡(确认后演进)
`[确认开始]` → 合成命令喂回 B3 链 → 同一张卡**原地演进**(不新开卡):
- 卡态机:`需确认 → 运行中 → 暂停(等改角色) → 运行中 → 完成`(或 `失败`/`已取消`)。
- 步骤进度:`故事卡 ✓已落` / `角色表 ✓已落·可编辑` / `分镜表 ⏸暂停中—等你确认角色`。
- **暂停态**:卡上内联 `[继续] [取消]` chip(替代打字「继续/取消」);同时画布角色表节点旁出现「继续」affordance(画布原生,§5.4)。
- 成本脚注常驻:`规划免费 · 成片/定妆才出图,需二次确认 + 预算签字`。
- 完成态:卡变回执,列出落了哪些节点 + 若 `成片` 暂存则提示「在画布改好提示词后点/回复『成片确认』」。

### 5.4 节点旁转向(画布原生,graft)— **本期最高风险项**
暂停时,在画布「角色表」节点(`vimaxRole:"cast"`)上渲染一枚徽章「↱ 继续分镜」(hover:「编辑完角色后点此继续」)。点击 = **完全复用卡上 [继续] 的 handler**(读 `castNode.data.content` → `castContentToCharacters` → `applyVimaxNativeResumeCommand`,单一 `pendingVimaxNativeResume` 源)。编辑权限:暂停期角色节点可双击编辑(CommentNoteNode 既有能力),点徽章前先 commit 节点编辑;解析为空 → 徽章右侧红色感叹号 + 复用 §FR-12 的提示,**不 resume**。

> **风险与回退(review#1)**:`CommentNoteNode` 是混淆产物,**没有现成的"节点旁注入浮层"公共钩子**。它内部有 `.node-floating-toolbar` + `bindCommentNoteToolbarEvents`,这是唯一可疑的扩展面;若往通用 comment 工具栏插 vimax 专属「继续」过于侵入,则此项有变成"新画布子系统"的风险。**决策**:**面板卡上的 [继续] 是主路径(必做);节点旁徽章是便利 graft**——dev-doc 评估钩子成本,若干净则同期做,若侵入则降级为 v3 快速跟进(不阻塞主交付)。两入口共用同一 handler + 单一 pending,绝不双发。

### 5.5 换拍法内联选择器
`[换拍法 ▾]` 展开**拍法库列表**(来自服务端 roster / 缓存),用户**点选** 1–N 个拍法(确定性《拍法》点名,复用 M16),选中项注入到合成命令的 `《拍法》` 引用;**不**让 AI 替换拍法。

### 5.6 完整流程示例(雨夜便利店)
1. 打「雨夜便利店,陌生人递来一把伞,简短告别」(无前缀)。
2. 回复下挂 `[导演][成片][定妆][换拍法▾]` + 品类提示。
3. 点 `[导演]` → 弹契约预览:`将生成 3 节点 · 故事+角色表+分镜 · 规划免费 · 暂停点在角色后`。
4. 点 `[确认开始]` → 卡演进:故事✓ → 角色表✓ → ⏸暂停「改好角色表后继续」。
5. 画布改角色表(或不改)→ 点卡上/节点旁 `[继续]`。
6. 卡:运行中 → 分镜✓ → 完成回执(若先点的是 `[成片]`,则此处暂存 pendingRender + 提示成片确认)。

## 6. 数据模型与状态

### 6.1 触发规则(确定性,纯前端可判)
`shouldOfferLaunchChips(message, ctx) -> bool`:
- 返回 false(不挂)当:消息匹配任一已知命令前缀(`导演/成片/定妆` + `:` / 全角:)、或匹配 `继续/取消/成片确认/定妆确认/重摇…`、或被 `parseCanvasOpCommand` 等判为画布操作类、或 `pendingVimaxNativeResume` 处于暂停态(此时只认继续/取消)、或消息过短(< 阈值,如 4 字且无创作名词)。
- 否则返回 true(可发现性强:默认挂)。`rankDirectorKnowledge` 的分数用于**排序/高亮**(分高则 `导演` chip 置顶/2px 强调),不作为"挂不挂"的硬门(避免漏挂)。

### 6.2 启动 chip schema
```
LaunchChip = {
  id,                 // "director" | "film" | "portraits" | "skills"
  label,              // 导演 / 成片 / 定妆 / 换拍法
  icon,               // movie / photo / user-circle / books
  costTier,           // "free" | "confirm"
  command,            // 合成命令模板:"导演:" | "成片:" | "定妆:"(skills 走选择器)
  tooltip,            // "故事编排,暂停确认" 等
}
```

### 6.3 契约预览 schema(复用并扩展契约卡)
```
ContractPreview = {
  mode,               // director | film | portraits
  briefSummary,
  nodes: [{ type, role, lineage, reversible }],   // 将落的节点清单
  nodeCount,
  cost: { tier, drawCount?, note },               // 规划免费 / 出图 M 张需签字
  flow: ["story","cast","PAUSE","storyboard"],    // 显式流程,含暂停
  skillRefs: [],                                  // 换拍法选中项
}
```
新增字段 `characterTargets`(定妆用,默认空=全部可见角色,§5.1)。

**确定性推导函数(review#1 钉)**:`deriveVimaxContractPreview(mode, brief, ctx) -> ContractPreview`,**纯前端、不调 LLM(R1)**:
- `导演`:`nodes=[story, cast, storyboard]`,`nodeCount=3`(分镜含若干镜,规划前未知),`cost.tier="free"`,`flow=["story","cast","PAUSE","storyboard"]`。
- `成片`:同导演链 + 渲染闸;`cost.tier="confirm"`,`cost.drawCount` = 镜数(规划前**未知**→显「约 N(以规划为准)」,`cost.estimated=true`)。
- `定妆`:`nodeCount` = `characterTargets.length`(空=画布当前可见角色数);`cost.tier="confirm"`,`drawCount=角色数×3`(三视,复用 `portrait_capacity`)。
- 成本档只有 `free|confirm` 两档,**不做真实计价引擎**(本期边界,§13)。

**成片镜数"约 N → 真值"更新路径(review#1 钉,补 §5.3)**:`pollVimaxNative` 在 `status.result`(规划完成)拿到真实镜数 → 调 `updateInteractionCardStatus(cardId, {contract:{...,drawCount:真值,estimated:false}})` → 活体卡成本行把「约 N」替换为「N」并加一枚 `已更新` 小徽章(**显式、不静默**),让用户在出图确认前看到真实张数。

### 6.4 活体卡态机(扩展 createInteractionCard)— 本期**核心构建工作**

> 诚实校正(review#1):本期"几乎零后端"成立(无 Python 改动),但**前端不是薄层** —— 真正的核心工作是把 `assistantInteractionCards.js / createInteractionCard` 的卡 schema + 状态机 + 渲染分支扩起来。现状卡只有字段 `{id,type,status,title,summary,expanded,requiresConfirmation,agentMode,analysis,operation,items,executionDetails,actions,result,error}`,status 只有 `needs_confirmation|pending`。**且 B3 暂停目前是 push 一条纯文本消息,根本没有卡**(`appAssistantPanel.js:~3659` 推 `vimax_plan` 文本)。Phase D 必须把暂停态变成一张真正的交互卡。

**完整扩展后的卡 schema**(review#2 钉,消除 §6.2/§6.4 歧义):
```
Card = { id, type, status, title, summary, expanded, requiresConfirmation, agentMode,
         analysis, operation, items, executionDetails, actions, result, error,  // 现有
         options: LaunchChip[],          // 新增
         contract: ContractPreview|null, // 新增
         steps: [{stage,status}],        // 新增
         pausedReason: string }          // 新增
```
- `options[]`:当前态要渲染的 chip,是 provider `chips`(§6.2 LaunchChip)的**临时拷贝** —— **`needs_action`/`preview`/`paused` 态才有,不写入 `state.messages` 持久层**;重渲染按 §6.1 重判/由 provider 重给。
- `contract` / `steps[]`:**会随消息持久化**(活体卡复显成本/流程/进度的依据)。`steps[]` = `[{stage:"story"|"cast"|"storyboard", status:"pending"|"landed"|"running"}]`,由 B3 `on_step`/轮询驱动。
- `pausedReason`:`"wait-cast-edit" | "wait-film-confirm" | "wait-portraits-confirm"`,决定暂停态展示哪句提示 + 哪组 chip。
- 一句话:**chip 对象本身从不持久化(只有点击 handler + 最终 `contract`/`steps` 落在卡上)。**

**status 态机**(在现有枚举上新增 `needs_action / preview / paused`):
```
needs_action → preview → needs_confirmation → running → paused → completed | failed | cancelled
   (挂chip)     (契约预览)   (多节点确认)        (执行中)    (B3暂停)
```
- 渲染分支:`assistantInteractionCards` 渲染 + `appAssistantPanel` 的卡渲染需各加 `needs_action`(chip 行)、`preview`(契约预览体)、`paused`(步骤进度 + [继续][取消] + pausedReason 文案)三个分支。未识别状态保持现有行为(向后兼容)。
- 驱动:卡态由 `pollVimaxNative` 的 `status.status` + `on_step` **直接驱动**(非轮询滞后);B3 暂停时由 push-文本改为 push/patch 一张 `status:"paused"` 的交互卡。

**chip 生命周期**(review#1 补全):
- **临时态,不持久化**:chip(`needs_action`/`preview` 态的 `options`)仅活在**当前助手回复行**,不写入 `state.messages` 持久层;重渲染时按 §6.1 规则重判是否挂。已落地的卡(`running`+)其步骤/contract 持久化随消息。
- **新回复替换旧 chip 行**:新助手回复挂自己的 chip 行;上一条未操作的启动 chip 行不再重复渲染(避免面板堆叠"5 排旧 chip")。
- **暂停期冻结**:`pendingVimaxNativeResume` set 时,§6.1 不再为新消息挂启动 chip(冻结);仅认 [继续]/[取消]。见 §6.1 并发保护。
- **并发**:全局单一 `pendingVimaxNativeResume`(一次一个暂停流)。处理见 §6.1。

### 6.5 与命令链的映射(零新后端)
| chip / 动作 | 合成 → 现有处理 |
|---|---|
| 导演 [确认] | `导演:<brief>《拍法…》` → parseVimaxCommand → applyVimaxNativePlanCommand(B3,带 steer 暂停) |
| 成片 [确认] | `成片:<brief>` → 同上 wantsFilm;成片出图仍走 `成片确认` + 预算 |
| 定妆 [确认] | `定妆:<角色>` → applyVimaxPortraitsCommand;出图走 `定妆确认` |
| 继续 / 取消(卡 chip 或节点旁) | 等价 `继续`/`取消` → applyVimaxNativeResumeCommand(B3) |
| 换拍法选择 | 注入 `《拍法名》` 到合成 brief |

## 7. 详细功能点(FR)

- **FR-1 触发渲染**:满足 §6.1 的助手回复下渲染启动 chip 行 + 品类提示;不满足则不渲染。
- **FR-2 chip 集与排序**:渲染 导演/成片/定妆/换拍法;`rankDirectorKnowledge` 高分时 导演 置顶 + 2px 强调。
- **FR-3 成本标**:每 chip 标 免费/需确认;契约预览与脚注一致。
- **FR-4 契约预览前置**:点 导演/成片/定妆 chip **不执行**,先展开 ContractPreview(§6.3);仅 `[确认开始]` 才合成命令执行。
- **FR-5 节点/成本推导**:ContractPreview 的 N、成本、流程由前端确定性推导;成片镜数未知显「约 N」。
- **FR-6 确认执行**:`[确认开始]` 合成命令喂回现有 dispatch;此后复用契约卡 + B3 全流程。
- **FR-7 活体卡演进**:同一张卡按 §6.4 态机演进,显示步骤进度;不新开重复卡。
- **FR-8 暂停转向**:`paused` 时卡上 `[继续][取消]` + 画布 cast 节点旁「继续」affordance;两者等价。
- **FR-9 换拍法选择器**:内联列拍法库,点选注入《》;不 AI 替换。
- **FR-10 取消**:任一阶段 `[取消]` 清理 pending、卡转 `cancelled`、不残留;暂停态取消调 `/native/resume` 的对端 cancel。
- **FR-11 向后兼容**:经典前缀命令照常工作;打了前缀则不挂 chip(前缀优先)。
- **FR-12 错误/边缘**:
  - brief 过短/空 → chip 旁内联提示「再补一句创意」,不发命令;
  - 契约预览中改了主意 → `[取消]` 回到 chip 行;
  - 角色表解析为空 → 沿用 B3 的"不静默回退 + 提示重试";
  - native 未配置(`vimaxNativeStatus.configured=false`)→ chip 退化为走外置道(或灰显成片/定妆并提示);
  - 服务断连 → chip 不可点 + 复用现有断连提示条。
- **FR-13 受信落地**:所有 chip 路径产物经 `landTrustedVimaxActions` + claw `vimax-director` 血统(B0/V5 不变式),无未受信旁路。

## 8. Provider 契约不变式(红线 · 硬需求)

> 这 6 条是**任何 LaunchProvider 想进注册表都必须满足的契约**(不只 ViMax)。违反任一条即"设计错误",非"差一点";开发文档与代码须逐条可对照测试。框架在注册时应可校验/在 review 时人工核对。

- **R1 触发是规则,不是 LLM 猜意图**:`provider.match()` 纯前端确定性;`rankDirectorKnowledge`(或 provider 自带打分)仅排序不决定有无。
- **R2 chip = 已有命令 1:1 合成**:`synthesizeCommand` 产已有命令,走现有 dispatch + claw,**不新开执行路径**(ViMax:parseVimaxCommand)。
- **R3 成本闸不可塌**:任何 `costTier:"confirm"` 的 chip,出图/花费仍要走该 provider 既有的确认 + 预算闸(ViMax:成片确认/定妆确认 + 签字);契约预览只看不花钱;chip 不一键直达花费。
- **R4 暂停不可跳**:provider 若声明了暂停点(ViMax 的角色后暂停),继续必须是显式动作(chip 或文字),框架不替它跳。
- **R5 画布即真相 + 血统不可伪造**(review#2 加固):chip 产物一律经受信 `executeActions→claw`;**provider 不得直接建节点**;huanying 唯一画布权威。**关键:血统标(lineageTag)不是 provider 运行时传入的参数,而是注册表按 `provider.id` 静态映射出来的**(`{"vimax":"vimax-director", "qmai":"qmai-director", ...}`,白名单),信任决策仍**面板/注册表控制**(沿用 executionId∈受信集的门),**绝不信 provider 运行时给的字符串**——否则一个流氓 provider 调 `landTrustedActions(...,"vimax-director")` 就骗过 claw(正是 B0/V5 铁律禁止的:信任只给面板控制的代码路径,不给数据)。注册时 `provider.id` 的映射不存在 / lineageTag 落在保留名单(`admin/system/panel/claw`)→ 拒绝注册。
- **R6 知识选择确定性**:换拍法/换知识类 chip 一律"点选已有",不让 AI 重选(ViMax:《拍法》点名)。

## 9. 成本与安全

- 规划(导演/分镜)只调文本模型,近免费、零出图;契约预览把这点写在脸上。
- 出图(成片/定妆)双闸:多节点确认 + 出图确认 + 预算签字三者不合并。
- 经纪人硬封顶(P2-M9)仍是最后保险。

## 10. 可观测(轻)

- 埋点:chip 曝光数、各 chip 点击率、契约预览→确认转化率、暂停→继续/取消比、解析失败重试率。
- 目的:验证"可发现性强"是否带来误触/打扰;若误触高,再回调 §6.1 阈值(本期默认激进)。

## 11. 风险登记册

| # | 风险 | 缓解 |
|---|---|---|
| RK1 | 激进触发 → 普通聊天也挂 chip,打扰 | chip 行轻量、可忽略;§6.1 排除明显非 brief;埋点监控误触率,留阈值回调位 |
| RK2 | 契约预览的成本/镜数前端推导不准(成片镜数规划前未知) | 显「约 N(以规划为准)」,真值到手在活体卡更新;不拿不准的数字当承诺 |
| RK3 | 卡态与 orchestrator 不同步(暂停了卡没翻) | 卡态直接挂 B3 的 onStep/pending,不靠轮询滞后 |
| RK4 | chip 把用户无声带进计费道 | 卡标题「将生成 N 节点」+ 成本行 + 🎬 lane 徽标显式区分;出图仍二次确认 |
| RK5 | 节点旁「继续」与卡上「继续」双入口状态打架 | 单一 pending 源(`pendingVimaxNativeResume`),两入口同一 handler |

## 12. 验收标准

- AC1:无前缀打创作 brief → 出现启动 chip(可发现性强);打了前缀 → 不出 chip,走原命令。
- AC2:点 导演/成片/定妆 → 先出契约预览(N + 成本 + 流程),`[确认]` 才执行。
- AC3:导演确认后卡演进 故事✓→角色表✓→⏸暂停;改 cast→继续→分镜✓→完成。
- AC4:成片/定妆出图前必过出图确认 + 预算签字(chip 不绕过)。
- AC5:画布 cast 节点旁「继续」与卡上「继续」等价、互不重复执行。
- AC6:经典前缀全链路回归不变(B2/B3 既有测试全绿)。
- AC7:R1–R6 红线各有对应测试/校验点。

## 13. 不在范围(本期)
逐镜流式 storyboard streaming;移动端专属布局;AI 自动选模式/拍法;成本的真实计价引擎(本期用确定性档位估算)。

## 14. 构建顺序(给 dev-doc:虽一期上线,内部须线性)
v1+v2+v3 同期发布,但有依赖,dev-doc 必须按序拆:
1. **卡 schema + 状态机扩展**(§6.4):`createInteractionCard` 加 options/contract/steps/pausedReason + 新 status 分支 —— 一切的地基。
2. **B3 暂停改为交互卡**:把现状 push 纯文本改为 push/patch `status:"paused"` 卡(带步骤进度 + [继续][取消] + pausedReason)。
3. **契约推导 + 预览**:`deriveVimaxContractPreview`(§6.3)+ `needs_action`/`preview` 渲染分支。
4. **启动 chip 触发 + 渲染**(§5.1、§6.1)+ 品类卡接线。
5. **成片镜数"约 N→真值"更新**(§6.3 末)。
6. **节点旁「继续」徽章**(§5.4,最高风险;钩子干净则同期,否则降级 v3 快跟)。
工期由 dev-doc 估;第 1、6 步为风险点。

## 15. Review #1 收口(16 finding → 处置,已折入)

> 评审workflow `wf_bf717880`(3 维度 26 agent,逐条对抗验证)。全部为 PRD 收紧,无翻盘三决策。

| # | finding | 级别 | 处置(折入处) |
|---|---|---|---|
| 1 | chip 多轮生命周期未定义 | major | §6.4「chip 生命周期」:临时态不持久化/新回复替换旧 chip 行/暂停冻结/单 pending |
| 2 | 定妆 chip 角色目标 | major | §5.1:空 `定妆:`=全可见角色,label「定妆·全部可见角色」,无角色则灰显 |
| 3 | 品类卡映射不全 | major | §5.1:5 张全列映射表(爆款维持原行为);卡 UI 已存在,渲染处 dev-doc 定位 |
| 4/10 | 成片镜数"约N→真值"更新流程缺失 | major | §6.3 末:`pollVimaxNative`→`updateInteractionCardStatus(contract)`+「已更新」徽章,显式不静默 |
| 5 | 并发计划/暂停冲突 | major | §5.1「并发/暂停保护」+§6.4:暂停冻结 chip;显式前缀先取消旧暂停;单 pending 源 |
| 6/12 | 节点旁「继续」落地/钩子缺失 | major | §5.4 重写:徽章规格 + 共用 handler;**标为最高风险**,面板 [继续] 为主路径,徽章可降级 v3 |
| 7 | 契约推导函数未定义 | major | §6.3:`deriveVimaxContractPreview`(纯前端、不调 LLM,R1) |
| 8 | paused/pausedReason 未接 UI(B3 当前只 push 文本) | major | §6.4:B3 暂停改为 push/patch `status:"paused"` 交互卡 + pausedReason |
| 9/11/13 | 卡 schema/status 枚举无新字段 | major | §6.4:扩 options/contract/steps/pausedReason + needs_action/preview/paused 分支(列为本期核心构建) |
| 14 | v1+v2+v3 内部须线性 | major | 新 §14 构建顺序 |
| 15 | 成片/定妆 chip 流程深度不对等 | minor | §6.3 推导分模式给全;§5.2 契约预览三模式同构(成片走出图闸/定妆全可见) |
| 16 | a11y/键盘/i18n 未定 | minor | 新 §4.1 |

**状态**:review #1 已收口。

## 16. Provider 注册表 + ViMax(provider #1)+ 本期范围(通用化重构)

> 用户决定:这套做成通用框架(§0 决策1、§3.1)。本节钉死"通用 vs ViMax 专属"的边界,给 dev-doc 划线。

### 16.1 通用层(本期实现,provider 无关)
- `launchProviderRegistry`:`registerLaunchProvider(p)` / `listMatchingProviders(message, ctx)`。
- 通用渲染:启动 chip 行(聚合命中 provider 的 chip)、契约预览卡、活体卡 schema+状态机(§6.4)、暂停态/继续/取消 UI。**渲染钩子已确认存在**(review#2):`appAssistantPanel.refreshMessageCards → renderInteractionCard`,本期只在其上加 `needs_action/preview/paused` 三个 status 渲染分支,**不是新子系统**。确定性触发外壳(§6.1 排除规则属通用;"像不像 brief"的打分由 **provider 自带 `match`** 决定——`rankDirectorKnowledge` 是 ViMax 特定的,归 ViMax provider,不放通用层)。
- 通用受信落地:`landTrustedActions(actions, providerId, executionId)`(把 B3a 的 `landTrustedVimaxActions` 泛化)。**血统由内部 `PROVIDER_LINEAGE[providerId]` 静态映射,不收 lineageTag 字符串参数**(R5 防伪造,§8)。
- **注册校验**(`registerLaunchProvider` 必拒,fail-fast):`id` 唯一且 ∈ `PROVIDER_LINEAGE` 白名单且不在保留名单(admin/system/panel/claw);`match`/`synthesizeCommand`/`deriveContract` 是函数;`chips` 非空且每个 `costTier∈{free,confirm}`。违反即抛,不静默降级。

### 16.2 ViMax provider(本期唯一注册)
把现有 ViMax 专属逻辑填进 provider 槽,**从面板里收拢**:
- `id:"vimax"`(注册表静态映射 → 血统 `vimax-director`;provider 自己不持有血统串)。
- `match`:§6.1 规则(非命令前缀 + 非画布操作 + 非平凡 brief;暂停态冻结);其"像不像 brief"打分用 `rankDirectorKnowledge`(ViMax 自带,不外泄到通用层)。
- `chips`:导演(free)/成片(confirm)/定妆·全部可见角色(confirm)/换拍法(picker)。
- `deriveContract(chipId, brief, ctx)`:内部 `chipId→mode` 适配(`director→导演计划 / film→成片 / portraits→定妆`)后调 `deriveVimaxContractPreview(mode,...)`(§6.3)。
- `synthesizeCommand`:`导演:/成片:/定妆:` + `《拍法》`(§6.5 映射表),喂 `parseVimaxCommand`。
- `resumeAffordance(node)`:`node.data.vimaxRole==="cast"`(§5.4,最高风险,可降级)。

### 16.4 多 provider 协调(v2+ 原则,现在钉死防回扣)
即便本期只 ViMax,注册表须按这些规则建,免得第 2 个 provider 来时迁移已存 id:
- **executionId 全局命名空间**:`<providerId>-<时间戳>-<label>`,注册表保证唯一;受信门按 `providerId` 段判血统,**不同 provider 的 id 不可能碰撞**(堵 review#2 的 `vimax-native-xyz-story` vs `qmai-…` 撞门)。
- **多命中排序**:多个 provider `match()` 同时命中 → chip 按**注册顺序**排(provider 可选给 confidence 覆盖)。
- **单 pending 锁**:同一条消息只接受第一个被点的启动流;`pendingVimaxNativeResume`(将泛化为 `pendingResume{providerId,jobId}`)全局唯一,暂停期冻结其余(§5.1)。
- **测试 AC8b**:注册两个 mock provider 命中同一 brief → 只第一个执行,executionId 带各自 providerId 前缀,血统不串。

### 16.3 本期范围线(YAGNI 边界)
- ✅ 做:16.1 全部 + 16.2 ViMax provider。
- ❌ 不做:QMAI / 未来源的 provider 实现(它们各自的活)。但**注册表 + 接口 + 红线契约要稳**,使"未来加一个源 = 注册一个 provider",不回扣通用层。
- 验收追加:**AC8** 通用层不含任何 `vimax`/`导演` 硬编码(grep 校验);ViMax 相关全在 `vimaxLaunchProvider`(或等名)模块内。

## 17. Review #2 收口(通用化后,默会知识 review,10 finding → 处置)

> 评审 workflow `wf_c800a229`(3 维度 22 agent,grounded in 真实系统)。结论:**通用化可行**(渲染钩子 `refreshMessageCards→renderInteractionCard` 真实存在,非新子系统),且**没翻三决策**。全部折入。

| # | finding | 级别 | 处置 |
|---|---|---|---|
| 1 | 渲染钩子存在但需扩 status 枚举 | major | §16.1 注明钩子已确认 + §6.4 加 needs_action/preview/paused 分支 |
| 2 | §6.2 chip vs §6.4 options[] 语义模糊 | major | §6.4 给完整卡 schema:options=临时拷贝不持久化,contract/steps 持久化,chip 对象从不存 |
| 3 | **R5 血统可伪造**(provider 传 lineageTag) | major | §8 R5 + §3.1 + §16.1:血统由注册表按 `provider.id` **静态映射**,`landTrustedActions(actions, providerId, executionId)`,不收血统串参数;保留名单拒注册 |
| 4 | 多 provider 冲突规则缺 | major | 新 §16.4:executionId `<providerId>-<ts>-<label>` 命名空间 + 注册序排序 + 单 pending 锁 + AC8b |
| 5 | 节点旁徽章 obfuscation 风险 | minor | §5.4 已预缓解(主路径面板 [继续],徽章可降级 v3);保持 |
| 6 | §3.1 通用 vs §5–7 ViMax 硬编码 | minor | 新 §5 范围标注:§5–7 全是 ViMax provider#1 填充,通用骨架另述 |
| 7 | deriveContract(chipId) vs deriveVimaxContractPreview(mode) 签名 | minor | §16.2:ViMax 内部 chipId→mode 适配,接口统一 chipId |
| 8 | mockup 全 ViMax 无标注 | minor | §5 范围标注覆盖 |
| 9 | resumeAffordance 可选/可缓延不明 | minor | §3.1 标 `?` 可选 + §5.4 明确主路径必做、徽章 v1 非阻塞 |
| 10 | 注册校验项未列全 | minor | §16.1 注册校验清单(id 唯一+白名单+保留名单/match-fn/chips 非空/costTier∈{free,confirm}/抛错不降级) |

**状态**:review #1 + review #2(通用化)均已收口,**待你(用户)过目**;OK 后出落地开发文档(20-…-dev-doc)→ dev-doc review → 开发 → B5/Phase C。
