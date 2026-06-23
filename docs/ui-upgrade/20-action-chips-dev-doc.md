# 幻映 · 启动 Provider 注册表 + 活体契约卡 · 落地开发文档（Phase D · dev-doc）

> 配套 PRD:`19-action-chips-prd.md`(review #1 + #2 已收口)。状态:待 dev-doc review(#3)。
> 执行:建议 subagent-driven 或 executing-plans,逐任务 TDD(失败测试→实现→过→提交)。
> 仓:`D:\Aic\huanying-source-windows-20260430-122116`,分支 `feature/codex-work-20260609`。无 build 步骤(服务器直服源 ES 模块,改完刷新即生效)。
> 测试:JS 用 `node --test <path>`;Python(claw)用 `python -m unittest <mod>`。提交尾 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

## A. 设计锚点(全部基于真实代码,review#2 grounded)

| 锚点 | 真实位置 | dev 动作 |
|---|---|---|
| 卡工厂 + status 枚举 | `modules/assistant/assistantInteractionCards.js` `createInteractionCard`(~166),status 仅 `needs_confirmation|pending`(~173) | 扩字段 + 加 `needs_action/preview/paused` |
| 卡渲染钩子(已确认真实,review#3 校正行号) | `modules/app/appAssistantPanel.js` `renderInteractionCard`(~5692)由 `refreshMessageCards`(~5876)逐 message 调 | 加 3 个 status 渲染分支(chip 行 / 契约预览 / 暂停) |
| 受信落地 + 信任门(两层,review#3 澄清) | 直接路径 `executeAssistantActions(payload.source)` 把 source 透传给 `schemaValidator`(~209)按字段 `trustedSources` 门控;另有 6027 provider 路径从集合成员重算 source(~6290) | 泛化 `landTrustedActions`;血统按 providerId 静态映射,见 §F-D2 |
| B3 命令链 | `vimaxCommandParser.js` `parseVimaxCommand`;`applyVimaxNativePlanCommand`/`applyVimaxNativeResumeCommand`;`pendingVimaxNativeResume`;`landTrustedVimaxActions`(B3a,~3565 直传 `source:"vimax-director"`);B3 暂停推**纯文本**在 ~3659/3663 | ViMax provider 复用,不新开;暂停文本→卡见 §F-D4 |
| story/cast 映射 | `modules/assistant/vimaxStoryCastCanvasActions.js`(B3a) | provider 复用 |
| 品类卡(review#3 校正) | `appAssistantPanel.js` `ASSISTANT_SKILLS`(~5444),中文标签是 `\uXXXX` 转义(`grep 社交媒体` 命中 0;用 `grep -n "social_media\|story_short\|marketing_video"`) | §5.1 映射接线 |
| claw 信任 | `services/claw_action_schema.py` + canvas-skills `schemaValidator.js`(~209 按字段 trustedSources 门控) | 不改(信任仍服务端 + 面板控制) |

> **重要(review#3)**:§C 的 D1/D2/D4/D5/D6 任务以下面 **§F 修订**为准(§F 与正文冲突处,§F 优先)。

## B. 文件结构

**新增(通用层,provider 无关 —— AC8:不得含 `vimax`/`导演` 硬编码)**
- `modules/assistant/launchProviderRegistry.js` — 注册表 + `PROVIDER_LINEAGE` 白名单 + `registerLaunchProvider` 校验 + `listMatchingProviders`。
- `modules/assistant/launchProviderRegistry.test.js`
- `modules/assistant/launchContract.js` — `ContractPreview` 类型约定 + 通用纯工具(无 provider 知识)。
- `modules/assistant/launchStrings.js` — i18n 集中字符串(§4.1)。

**新增(ViMax provider —— 所有 ViMax 词汇收拢于此)**
- `modules/assistant/vimaxLaunchProvider.js` — `id:"vimax"`,match/chips/deriveContract/synthesizeCommand/resumeAffordance。
- `modules/assistant/vimaxLaunchProvider.test.js`

**修改**
- `modules/assistant/assistantInteractionCards.js` — 卡 schema + status 枚举 + `updateInteractionCardStatus` 可 patch 新字段。
- `modules/app/appAssistantPanel.js` — `landTrustedActions` 泛化;`refreshMessageCards`/`renderInteractionCard` 加 3 分支;chip 点击 → 契约预览 → 确认 → `synthesizeCommand` 喂 dispatch;B3 暂停改 push 交互卡;成片镜数更新;注册 ViMax provider。
- `vimaxStoryCastCanvasActions.js` — 无改(provider 复用)。
- `services/claw_action_schema_test.py` — 若新增非 ViMax 通用断言(可选)。

## C. 任务序列(按 PRD §14:地基→暂停卡→契约→chip→镜数→徽章)

### D1 — 卡 schema + status 枚举扩展(地基)
**Files:** `assistantInteractionCards.js` + 同名 test(若有)/新建 `assistantInteractionCards.b3d.test.js`
- [ ] 测试(失败):`createInteractionCard({status:"needs_action"})` 保留 `needs_action`;默认初始化 `options:[]`、`contract:null`、`steps:[]`、`pausedReason:""`;`updateInteractionCardStatus(card,{options,contract,steps,pausedReason})` 能 patch 这四个字段。
- [ ] 实现:在 `createInteractionCard` 返回对象加四字段(默认空);放开 status 接受 `needs_action|preview|paused`(白名单数组里加);`updateInteractionCardStatus` 允许 patch 新字段。
- [ ] 过 + 提交 `feat(ui): D1 card schema + needs_action/preview/paused status`。

### D2 — `landTrustedActions` 泛化 + 血统白名单(安全核心,R5)
**Files:** `launchProviderRegistry.js`(放 `PROVIDER_LINEAGE`)+ `appAssistantPanel.js` + registry test
- [ ] 测试(失败):`landTrustedActions(actions, "vimax", execId)` → executeActions 收到 `source:"vimax-director"`;`landTrustedActions(actions, "unknownProvider", execId)` → **拒绝/不落**(无映射不落);`landTrustedActions(actions, "admin", execId)` → 拒(保留名单)。
- [ ] 实现:
```js
// launchProviderRegistry.js
export const PROVIDER_LINEAGE = Object.freeze({ vimax: "vimax-director" /*, qmai: "qmai-director" */ });
const RESERVED = new Set(["admin", "system", "panel", "claw"]);
export function lineageForProvider(providerId) {
  const tag = PROVIDER_LINEAGE[String(providerId || "")];
  return (tag && !RESERVED.has(tag)) ? tag : null;   // null => 不可信,不落
}
```
```js
// appAssistantPanel.js — 泛化 B3a 的 landTrustedVimaxActions
async function landTrustedActions(actions, providerId, executionId) {
  const lineage = lineageForProvider(providerId);
  if (!lineage) { state.lastReceipt = "未注册的来源,拒绝落地"; return false; }
  if (!Array.isArray(actions) || !actions.length || typeof api?.validateActions !== "function") return false;
  if (!(state.vimaxExecutionIds instanceof Set)) state.vimaxExecutionIds = new Set();
  state.vimaxExecutionIds.add(String(executionId));   // 面板控制的受信集(信任仍面板侧)
  const v = await api.validateActions({ actions, context: state.lastContext, executionId });
  if (!(v && (v.success||v.valid) && Array.isArray(v.actions))) return false;
  await executeActions({ actions: v.actions, executionId, source: lineage, graphStore,
    templateStore, canvasSkillsRuntime, agentMode: state.agentMode });
  return true;
}
```
> 血统**只来自 `lineageForProvider(providerId)`,绝不收 provider 运行时字符串**(R5)。B3a 的 `landTrustedVimaxActions` 改为 `landTrustedActions(a,"vimax",id)` 的薄封装或直接替换调用点。
- [ ] 过 + 提交 `feat(ui): D2 landTrustedActions + provider-lineage whitelist (R5)`。

### D3 — 注册表 + 校验 + ViMax provider 骨架
**Files:** `launchProviderRegistry.js` + `vimaxLaunchProvider.js` + tests
- [ ] 测试(失败):`registerLaunchProvider` 拒绝:重复 id / id 不在 PROVIDER_LINEAGE / 缺 match|synthesizeCommand|deriveContract / chips 空 / 某 chip.costTier∉{free,confirm}。`listMatchingProviders(msg,ctx)` 返回 match()=true 的 provider(注册序)。ViMax provider:`match("雨夜便利店…")=true`、`match("导演:…")=false`(前缀优先)、`match("继续")=false`(暂停态由面板冻结)。
- [ ] 实现:registry(register+validate+list)+ `vimaxLaunchProvider` 的 `id/match/chips`(导演 free/成片 confirm/定妆 confirm/换拍法 picker)。match 复用 PRD §6.1 排除规则 + `rankDirectorKnowledge`(ViMax 自带,不进通用层)。
- [ ] 过 + 提交 `feat(ui): D3 launch provider registry + validation + ViMax provider skeleton`。

### D4 — B3 暂停改为交互卡(挂 [继续]/[取消] + pausedReason)
**Files:** `appAssistantPanel.js`(`applyVimaxNativePlanCommand` 暂停分支 + `renderInteractionCard` paused 分支)+ `appAssistantPanel.vimaxNative.test.js`
- [ ] 测试(失败):native plan 到 `status:"paused"` → 推一张 `status:"paused"` 交互卡(`pausedReason:"wait-cast-edit"`,`options` 含 [继续][取消]),不再是纯文本;点卡上 [继续] = 调 `applyVimaxNativeResumeCommand`。
- [ ] 实现:把现状 push 文本(~3659)改为 `record/refresh` 一张 paused 卡;`renderInteractionCard` 加 `paused` 分支(步骤进度 + pausedReason 文案 + [继续][取消] chip → handler 复用 B3b 的 resume/cancel)。
- [ ] 过 + 提交 `feat(ui): D4 B3 pause becomes a paused interaction card`。

### D5 — 契约推导 + 预览态(deriveContract + needs_action/preview 渲染)
**Files:** `vimaxLaunchProvider.js`(deriveContract)+ `launchContract.js` + `appAssistantPanel.js`(渲染 + chip 点击→preview→确认)+ tests
- [ ] 测试(失败):`vimaxProvider.deriveContract("director", brief)` → `{mode:"director", nodeCount:3, cost:{tier:"free"}, flow:["story","cast","PAUSE","storyboard"]}`;`"film"`→`cost.tier:"confirm", estimated:true`;`"portraits"`→nodeCount=可见角色数, drawCount=×3。点 chip → 卡进 `preview` 态显契约;点 [确认开始] → `synthesizeCommand` 合成 `导演:<brief>` 喂 dispatch(走 `applyVimaxNativePlanCommand`)。
- [ ] 实现:`deriveVimaxContractPreview`(纯,不调 LLM,R1)+ chipId→mode 适配;`renderInteractionCard` 的 `needs_action`(chip 行)/`preview`(契约体 + [确认开始]/[取消])分支;[确认] → `landTrustedActions` 不在这步(这步只合成命令喂 B3,B3 内部已走受信);[取消] → 回 `needs_action`。
- [ ] 过 + 提交 `feat(ui): D5 contract derivation + preview state + confirm->synthesize`。

### D6 — 启动 chip 触发 + 渲染 + 品类卡接线
**Files:** `appAssistantPanel.js`(在 `refreshMessageCards`/回复渲染挂 chip 行,经 `listMatchingProviders`)+ 品类卡映射 + tests
- [ ] 测试(失败):无前缀 brief 的助手回复 → 卡 `needs_action` 带 ViMax chip;`导演:` 前缀 → 不挂(R/前缀优先);`pendingVimaxNativeResume` set → 不挂(冻结);打了 `继续` → 走 resume 不挂。品类卡(前4)点击 → 预填模板 + 自动 needs_action。
- [ ] 实现:在回复渲染处调 `listMatchingProviders(message,ctx)`,聚合 chips → 卡 `options` + status `needs_action`;§6.1 排除规则(通用)+ provider.match;品类卡(定位渲染处,dev 时 grep `社交媒体`)接 §5.1 映射表。
- [ ] 过 + 提交 `feat(ui): D6 launch chip trigger + render + category cards`。

### D7 — 成片镜数 约N→真值 更新
**Files:** `appAssistantPanel.js`(`pollVimaxNative` 拿 `status.result` 真实镜数 → `updateInteractionCardStatus(contract)`)+ test
- [ ] 测试(失败):成片流规划完成 → 卡 `contract.drawCount` 从估值变真值、`estimated:false`、成本行加「已更新」。
- [ ] 实现 + 过 + 提交 `feat(ui): D7 film shot-count 约N->real update on living card`。

### D8 —(最高风险,可降级 v3)节点旁「继续」徽章
**Files:** `vimaxLaunchProvider.js`(resumeAffordance)+ canvas 注入钩子评估 + test
- [ ] **先评估**:读 `components/CommentNoteNode.js` 的 `.node-floating-toolbar`/`bindCommentNoteToolbarEvents`,判断注入成本。**若 >~半天或侵入通用 comment 工具栏 → 降级 v3,本任务只留面板 [继续](已在 D4),记 BLOCKED 卡**。
- [ ] 若干净:cast 节点(`vimaxRole:"cast"`)旁徽章「↱继续分镜」→ 共用 D4 的 resume handler(单 pending)。
- [ ] 过 + 提交 / 或 提交「降级 v3」说明。

### D9 — 回归 + AC8 grep 门 + i18n 收口
- [ ] 全量:`node --test modules/app/appAssistantPanel.*.test.js modules/assistant/*.test.js` 全绿。
- [ ] **AC8 grep 门**:`grep -nE "vimax|导演|成片|定妆" modules/assistant/launchProviderRegistry.js modules/assistant/launchContract.js` → **必须 0 命中**(通用层无 ViMax 硬编码)。
- [ ] i18n:用户文案集中到 `launchStrings.js`。
- [ ] 提交 `chore(ui): D9 Phase D regression + AC8 generic-layer purity + i18n`。

## D. 测试矩阵(AC / R → 测试)

| 验收/红线 | 测试 |
|---|---|
| AC1 无前缀挂 chip / 有前缀不挂 | D6 |
| AC2 chip→契约预览→确认才执行 | D5 |
| AC3 导演确认→故事✓→角色表✓→暂停→继续→分镜✓ | D4+D5+vimaxNative |
| AC4 成片/定妆出图前过确认+预算 | 复用 vimaxRender/Portraits 既有测试(不回退) |
| AC5 卡[继续] 与 节点徽章 等价、单 pending | D4(+D8 若做) |
| AC6 经典前缀全链路不变 | 既有 B2/B3 测试全绿 |
| AC8 通用层无 ViMax 硬编码 | D9 grep |
| AC8b 多 provider:只第一个执行、id 带前缀、血统不串 | D3(mock 2 provider) |
| R1 触发确定性 | D3/D6(match 纯函数测试) |
| R2 chip=命令 1:1 | D5(synthesizeCommand 产 `导演:` 并经 parseVimaxCommand) |
| R3 成本闸不塌 | AC4 + 契约预览只读不花钱测试 |
| R4 暂停不跳 | D4 |
| R5 血统不可伪造 | D2(未注册/保留名拒落) |
| R6 换拍法确定性 | vimaxProvider 换拍法 = 点选已有,测不调 LLM |

## E. 风险与回退
- D1/D2 是地基(schema+信任),先做、独立可测、可回退。
- D8 最高风险,**默认可降级 v3**,不阻塞 D1–D7 交付。
- 每任务独立提交;任一卡住 → 停下报告(executing-plans 纪律),不硬冲。

## F. Review #3 收口(14 finding → 修订,本节对 §C 有优先权)

> 评审 workflow `wz2bwcrw7`(3 维度 23 agent,grounded)。3 critical + 多 major,都是**真·dev-doc 缺陷**(会误导执行 agent),非"代码没写"。逐条修订:

### §F-D1(修订 D1)— 卡 schema + status(无白名单可"加",需新建)
真相:`createInteractionCard`(~166)的 status 是 `requiresConfirmation ? "needs_confirmation" : "pending"`(~173),**没有 status 白名单数组**;`updateInteractionCardStatus`(~196)是浅合并(已能 patch 任意字段)。修订实现:
1. `createInteractionCard(opts)` 接受**可选 `opts.status`**(给了就用,否则维持现有 `requiresConfirmation` 计算);并**初始化四新字段** `options:[]`、`contract:null`、`steps:[]`、`pausedReason:""`。
2. 新建 `export const INTERACTION_CARD_STATUSES = new Set(["pending","needs_confirmation","needs_action","preview","running","paused","completed","failed","cancelled"])`;`createInteractionCard` + `updateInteractionCardStatus` 对传入 status 校验,非法 → 抛(防 `need_action` 这类拼写静默落地)。
3. 测试:四字段默认存在;`status:"needs_action"` 保留;非法 status 抛;`updateInteractionCardStatus` 能 patch 四字段。

### §F-D2(修订 D2)— 信任两层模型 + per-execId 血统映射(安全核心)
真相(澄清三处 finding):
- **两条 executeActions 路径**:(a) 直接调 `executeAssistantActions({...,source})` —— source **被使用**(透传 canvas-skills `schemaValidator` ~209,按字段 `trustedSources` 白名单门控写入);B3a 的 `landTrustedVimaxActions`(~3565)走这条,直传 `source:"vimax-director"`。(b) 6027 provider 路径 —— 从 `state.vimaxExecutionIds`/`directorExecutionIds` **集合成员重算** source(~6290),供 orchestrator/确认抽屉用。
- claw 的 `validate_actions` **不收 source**;真正的字段级血统强制在 canvas-skills `schemaValidator`(~209)。
修订实现(堵多 provider 串血统 + 防伪造):
1. 通用信任存储改为 **`state.trustedExecutions = Map<executionId, lineageTag>`**(单一真相),**不再往 `vimaxExecutionIds` 塞非 vimax 的 id**。
2. `landTrustedActions(actions, providerId, executionId)`:`lineage = lineageForProvider(providerId)`;`lineage==null` → 拒(未注册/保留名);否则 `state.trustedExecutions.set(executionId, lineage)` + 直接 `executeAssistantActions({...,source:lineage})`。
3. **6027 provider 信任门**(~6290)改为:`const lineage = state.trustedExecutions.get(executionId) ?? (vimaxExecutionIds.has(id)?"vimax-director":directorExecutionIds.has(id)?"qmai-director":"")`(新 Map 优先,旧集合兜底=向后兼容)。
4. **providerId 只来自注册表里 match 命中的 `provider.id`,永不来自用户消息/解析**(调用点契约,D5/D6 测试须断言)。
5. 测试补 **AC8b**:`landTrustedActions(a,"qmai",id)` → source `qmai-director` 且 `trustedExecutions` 命中 qmai-director(不串 vimax-director);`"unknownProvider"`/`"admin"` → 拒。

### §F-D4(修订 D4)— B3 暂停文本 → 交互卡(指明改造点)
真相:`applyVimaxNativePlanCommand` 在 `status:"paused"` 时 push **纯文本**(~3659/3663 `{role:"assistant",content,kind:"vimax_plan"}`),无卡。依赖 D1。修订:在该处改为 `record/refresh` 一张 `status:"paused"` 交互卡(`pausedReason:"wait-cast-edit"`,`options=[继续,取消]`,`steps` 反映 story✓/cast✓);`pendingVimaxNativeResume` 仍是单一暂停源;**既有打字版 `继续/取消`(B3b)与卡上 chip 共用同一 handler**(`applyVimaxNativeResumeCommand`),两入口不重复执行。测试:暂停→出 paused 卡(非文本)+ 卡 [继续] 调 resume。

### §F-D5(修订 D5)— 渲染分支 + chip 点击链 + 不双落
真相:`renderInteractionCard`(~5692)只有 `needs_confirmation`/澄清分支;无 `needs_action`/`preview`;无 chip 标记;无 synthesize 调用。修订**精确化**:
1. `renderInteractionCard` 加两分支:`needs_action`(渲染 `card.options` 为 chip 行)、`preview`(渲染 `card.contract` 的 N/成本/流程 + [确认开始]/[取消])。
2. **chip 点击链**(具体):chip 按钮 `data-chip-id` + 点击 handler → `provider.deriveContract(chipId, brief)` 写 `card.contract` + `updateInteractionCardStatus(card,{status:"preview"})` → re-render。
3. **[确认开始]** → `cmd = provider.synthesizeCommand(chipId, brief, {skillRefs})` → `state.sendMessage(cmd, {onUpdate})`(回灌现有 dispatch → `parseVimaxCommand` → `applyVimaxNativePlanCommand`)。
4. **不双落(关键)**:落地仍由 `applyVimaxNativePlanCommand`(B3,内部 B3a 轮询中落 story/cast、done 落 storyboard)负责;**chip/preview 卡只是入口,确认后把命令交给 B3,不自己再 `landTrustedActions`**。chip 的 needs_action/preview 卡在确认后转交 B3 流(同一对话,B3 推自己的 paused/进度卡);dev 时确保不出现"chip 卡 + B3 卡"两张重复——确认后 chip 卡收起(status→running 或移除),由 B3 卡接管。测试:确认后 `applyVimaxNativePlanCommand` 被调一次;story/cast 不被落两遍。

### §F-D6(修订 D6)— 品类卡定位 + chip 行注入位置(伪码)
1. 品类卡在 `ASSISTANT_SKILLS`(~5444,标签 `\uXXXX` 转义),用 `grep -n "social_media\|story_short\|marketing_video\|comic_drama\|viral_lab"` 定位;按 §5.1 表接(前4→预填 brief+挂 needs_action;爆款维持原行为)。
2. **chip 行注入位置**(具体):在 `refreshMessageCards`(~5876)渲染某条 assistant 回复后,若该回复无命令前缀且 `listMatchingProviders(message,ctx)` 非空 → 构造一张 `status:"needs_action"`、`options=聚合 chips` 的卡 push 进 `message.cards` 再 `renderInteractionCard`。注意:`pendingVimaxNativeResume` set 时跳过(冻结);避免对同一 message 重复注入(`message.cards` 已有 needs_action 卡则不再加)。

### §F 杂项(minor,已并入上文)
- D2 `source` 透传去向 = canvas-skills `schemaValidator` 字段门控(§F-D2 已述);claw 不收 source。
- `updateInteractionCardStatus` 浅合并放行任意键 → §F-D1 加 status 校验(字段值不强校验,接受)。

### Review #3 finding → 处置
| # | finding | 级别 | 处置 |
|---|---|---|---|
| 1 | createInteractionCard 不初始化新字段/status | critical | §F-D1 |
| 2 | D2 多 provider 串血统 | critical | §F-D2(Map<execId,lineage> + 6027 门优先查 Map) |
| 3 | D5 chip→preview→confirm→synthesize 未接 | critical | §F-D5 |
| 4 | refreshMessageCards 行号错(5812→5876) | major | §A 校正 |
| 5 | D2 缺多 provider 测试 | major | §F-D2 AC8b |
| 6 | D4 暂停仍纯文本 | major | §F-D4 |
| 7/8 | D1 status 无白名单/未校验 | major | §F-D1 INTERACTION_CARD_STATUSES |
| 9 | D6 品类卡 grep 不中 | major | §A/§F-D6(ASSISTANT_SKILLS ~5444) |
| 10 | providerId 信任来源未定 | major | §F-D2-4(只来自 provider.id) |
| 13 | D6 chip 行注入位置未定 | major | §F-D6 伪码 |
| 11/12/14 | source 两层模型/claw 不收 source | minor | §A/§F-D2 澄清 |

**状态**:dev-doc review #3 收口。Phase D 文档(PRD review#1+#2 + dev-doc review#3)齐备;按你定流程,**下一步 B5(429 探针)/Phase C**(Phase D 编码为之后单独决策)。
