# 幻映 PI 助手 · 完整产品设计文档 v3（活体卡 + 单活流 + render重构 + 影视拍法库)

> 状态:**v3 = 接地真实代码、对抗评审收口后的"一次性改造"设计**(取代 v2;v2 因 13 个 blocker 被推翻)。SoT,按此派工。
> 日期:2026-06-15。分支:feature/codex-work-20260609。
> 目标:一次性完成改造(完整 A 方案),不留半成品。每个架构断言都标了 `file:line` 真实锚点。
> 评审血泪:v2 "信抽象、没接地" → 13 blocker(render 非卡 / 状态机不止8态 / 五处并行真相源 / 拍法格式错 / 成本闸认错文件)。v3 逐条接地修正。

---

## 0.5 ★v3 对抗评审收口(11 blocker → 4 类修正,**本块对正文有优先权**)

> v3 评审(39 raw → 26 confirmed → **11 blocker**,REVISE-AGAIN)抓到的全是**战术级**错(API 名/状态名/store 装不下),非架构级——是收敛信号。下表对正文有优先权;正文里与本块冲突处以本块为准。剩余战术细节标「实现核实」,由切片0/1 的测试现形,不再纸面 review。

| 修正 | v3 正文(错) | 收口(对) | 接地锚点 |
|---|---|---|---|
| **C1 render 不进 executionStore** | §4.3「接 executionStore.createExecution/updateExecutionStatus 后台作业」 | **render 卡走 `message.cards[]`(FlowCard 本就有 type/execId/background);cancel 由 panel 闭包持有**(像现有 `vimaxRenderInFlight`+`vimaxNativeCancel`)。executionStore 装不下:① 无 `updateExecutionStatus`(真名 `updateStatus`);② `createExecution` 白名单清洗 `sanitizeExecution` 静默丢 kind/flowId/cancel(函数更存不进 `sanitizeJson`);③ status enum 无 `running`(normalize→draft) | `assistantExecutionStore.js:756 updateStatus` / `:229-261 sanitizeExecution` / `:66 sanitizeJson` / enum `:3-14` |
| **C2 状态名拼写** | 全文 `needs_confirm` | **`needs_confirmation`**(真值)。派 `needs_confirm` → `assertCardStatus` 抛;`RENDERERS[needs_confirm]`→undefined→空卡/崩 | `INTERACTION_CARD_STATUSES`(D1 卡 schema,15 态超集) |
| **C3 RENDERERS 漏态 + 澄清卡** | §3.3「11 个渲染器」纯 status 分发 | **RENDERERS 覆盖全 14 态**(补 `pending`/`needs_clarification`/`archived`,否则落 renderUnknown 空卡);**澄清卡保留 type 分发**(按钮纯靠 status 会丢) | `INTERACTION_CARD_STATUSES` 全集 |
| **C4 cancel 按流类型分派** | ⏹ 一律 `stopStreaming()` | decompose 期 activeStream 为 null → stopStreaming 是**死按钮**。cancel 路由:`stream→stopStreaming` / `decompose→vimaxNativeCancel(decomposeJob)` / `render→vimaxNativeCancel(renderJob)`。修 §4.5↔§5.1 自相矛盾(⏹ 取不取消后台 render) | `vimaxNativeCancel`(B3) |

**外加 warning(非 blocker,实现时留意):**
- §4.2 lane 抽取耦合比「{pending,api,graphStore}」深:还碰 `state.messages/lastReceipt/status/conversationStore/notifyUpdate`——抽 `vimaxRenderJob` 要把这些当注入依赖,别假装纯函数。
- fire-and-forget 后 `vimaxRenderInFlight` 的 finally 清理点丢失(原靠 lane `finally` 4211 清)——job 完成/失败/取消三路都要清。
- **strong-confirm 没退役**:`requiresStrongConfirmation` 仍是活闸(§3.5「已折叠」表述与代码不符,实现时核实)。
- 终态冻结对 `completed` 是行为变更(今天完成卡会随节点态翻回 failed/重跑)——冻结是有意取舍,实现时确认要不要。
- 拍法源(70 vs 49 数量打架)不在本仓,§7「已是该格式」无法在仓内核实;director-suite 嵌套结构与 `load_roster` 扁平 glob 不兼容、且与已存在的 49 拍法 skills 同目录碰撞——切片7 要处理。

**落地策略(本轮决定):文档已收敛到架构正确,剩余战术错由代码接棒验证。先落地切片0(脱 streaming),不再纸面 review。**

---

## 0. 决策记录(全部接地核实)

| # | 决策 | 取值(已核实) | 锚点 |
|---|---|---|---|
| D1 | 成本确认规则 | **plan: 出图/视频确认;act: 仅视频确认** —— 且**已存在**,直接复用 | `assistantGenerationConfirmation.js:51 generationConfirmationRequired(counts,mode)` |
| D1b | 预算/封顶 | **不在本设计范围**(按用户指示),render 内核抽取时作正交关注点另议 | — |
| D2 | 单活流 | **前台决策流锁输入(发送键⏹)** vs **后台作业不锁** | §2 |
| D3 | 反上帝卡 | 状态表 + reducer + **status→渲染器映射(11 个)** | §3.3/§3.4 |
| D4 | render 重构(核心) | **render→产活体卡 + 脱 state.streaming + 接 vimaxNativeCancel**(拆,不重写内核) | §4 |
| D5 | 真相源 | **诚实:5 处并行真相源,本期减 UI 表面 + NODE_SYNC 对账,不假装统一底层** | §3.1 |
| D6 | 拍法库接入 | **扁平 *.md 进 brain 的 skills_dir**(对齐 `load_roster` glob),70 个 flova 文件已是该格式 | `skills_index.py load_roster` |
| D7 | 拍法驱动 | **知识注入**(复用已实现的 `_select_craft`,不复刻 flova 管线) | `shotplan_assembly.py:102` |
| D8 | 删除 | 执行抽屉 / 绿色横条(receipt/preview)/ 两张澄清卡 / 死控件 | §6 |

---

## 1. 目标与非目标

**目标**
- G1 **一表面**:一次操作 = 一张活体卡(含 render);删抽屉 + 绿横条 + 两澄清卡。
- G2 **不锁死**:前台/后台分离 + 发送键即停止 + 看门狗,任何时候有逃生口。
- G3 **render 是卡**:成片/定妆从"streaming 锁 40min 的无卡 await 单体"重构成"可后台、可取消、有进度的活体卡"。
- G4 **成本可见**:plan 出图/act 视频前弹确认(复用现成规则)。
- G5 **拍法库**:爆款位置→影视拍法库;选拍法塑形导演分镜,体现在活体卡。

**非目标(诚实)**
- 不做预算/封顶设计(D1b)。
- 不重写 render 内核正确性逻辑(落帧/补拍/帧跳过;只拆接口)。
- **不假装"单一真相源"**:底层仍 5 处状态(D5),本期只减 UI 表面 + 加对账。
- 不接新视频模型(成片产关键帧图,非视频片);不复刻 flova 管线。

---

## 2. 核心模型:单活流(前台决策 vs 后台作业)

```
            ┌──────────────── 派生,不另存 ────────────────┐
foregroundFlow(锁输入·发送键⏹) ⟺  pi 流式输出中(秒级)
                              ∨  卡 status∈{preview,needs_confirm,paused}(等你拍板)
                              ∨  导演规划 decompose 进行中(你正等故事/角色表,很快 paused)
backgroundJob(不锁输入·卡显进度·独立[取消]) ⟺  executionStore 里 kind==="vimax_render"/"vimax_portraits"
                              且 status∈{running,generating,preparing,retryable}
不占任何流:needs_action(建议)/ completed/failed/cancelled / 普通问答
```
```js
// 纯派生 getter(不是存储字段,避免第 6 个并行真相):
get foregroundFlow(){
  if (state.streaming) return { kind:"stream", cancel:()=>stopStreaming() };
  const c = findActiveDecisionCard();          // status∈{preview,needs_confirm,paused} 或 前台 decompose
  return c ? { kind:"card", cardId:c.id, cancel:()=>dispatch(c.id,{type:"CANCEL"}) } : null;
}
// 后台作业是 executionStore 里的 active 执行,独立查,不进 foregroundFlow:
get backgroundJobs(){ return executionStore.snapshot().executions.filter(e=>isRenderKind(e.kind)&&isActiveStatus(e.status)); }
```
> ★ render 不再写 `state.streaming`(§4.4),所以 getter 的 streaming 分支只代表前台秒级流;render 40min 锁死消失。
> ★ 单例不排队:同类后台作业单实例(沿用现有 `state.vimaxRenderInFlight` 再入守卫,`appAssistantPanel.js:4035`);后台不阻塞前台对话。

---

## 3. 数据层

### 3.1 真相源现实(D5 · 诚实,不假装统一)
```
现状 5 处并行状态(grep 实证):
  ① executionStore        跨会话后台执行(projectId 水合 + 云端同步)  assistantExecutionStore.js
  ② message.cards[]        会话内交互卡(conversationId)              appAssistantPanel.js
  ③ graphStore            画布节点真实生成态(generating/completed…)  src/core/stores/graphStore.js
  ④ state.streaming       前台流式标志                                appAssistantPanel.js
  ⑤ state.pendingVimax*   render/portraits/resume 暂存                appAssistantPanel.js
本期做什么(诚实):
  • 减 UI 表面:抽屉/横条/澄清卡 → 全部用活体卡渲染(③④⑤的可视化收敛到卡)
  • 加对账:NODE_SYNC 把 ③ graphStore 的节点态 dispatch 进卡(§3.4)
  • 不做:不把 ①②③ 合并成一个 store(代价过大、收益有限)——文档不写"单一真相源"
活体卡的渲染数据 = executionStore.snapshot()(后台作业) + message.cards[](会话卡),按当前 conversationId/projectId 过滤(防串会话,评审 W5)。
```

### 3.2 卡 schema(`flow_card` · **保留 type 字段**,root 2 修正)
```js
FlowCard = {
  id,
  type,                     // ★ 必留:"canvas_actions"|"launch"|"vimax_render"|"vimax_portraits"
                            //   refreshSyncedOperationCards 靠 type 认领节点同步(丢了它→所有卡被跳过)
  status,                   // §3.3 全集(11 态)
  background: false,        // ★ render/portraits 卡为 true → 不进 foregroundFlow
  execId,                   // 后台卡:关联的 executionStore 执行 id(单一来源)
  // 展示载荷(持久)
  title, summary, steps:[{stage,status}], contract, detail:{nodeIds,receipts,traces,warnings,error},
  // 流程载荷(瞬态)
  options:[Chip], pausedReason, providerId, brief, skillRefs, filmSkillId,
}
```

### 3.3 状态全集 + 状态表(**11 个渲染器**,root 2 修正)
> 沿用 `INTERACTION_CARD_STATUSES` 权威集(写入过 `assertCardStatus`)。活体卡渲染必须覆盖 `canvasCardStatusForNodeIds`(`appAssistantPanel.js:2808-2814`)产出的全部节点态,否则 `RENDERERS[status]` 取 undefined 崩。

| status | 来源 | 占流 | 渲染器 |
|---|---|---|---|
| `needs_action` | 启动 chips | ✗建议 | renderChips |
| `preview` | 拍法/契约预览 | ✓前台 | renderContract |
| `needs_confirm` | 出图确认(D1) | ✓前台 | renderConfirm |
| `running` | 流程进行 | 视 background | renderProgress |
| `generating` | **节点同步** | 视 background | renderProgress(同 running) |
| `preparing` | **节点同步** | 视 background | renderProgress |
| `retryable` | **节点同步** | ✗(待用户重试) | renderError(可重试) |
| `paused` | B3 暂停 | ✓前台 | renderPaused |
| `completed` | 完成 | ✗ | renderReceipt |
| `failed` | 失败 | ✗ | renderError |
| `cancelled` | 取消 | ✗ | renderCancelled |
```js
const RENDERERS = { needs_action:renderChips, preview:renderContract, needs_confirm:renderConfirm,
  running:renderProgress, generating:renderProgress, preparing:renderProgress, retryable:renderError,
  paused:renderPaused, completed:renderReceipt, failed:renderError, cancelled:renderCancelled };
const renderFlowCard = (card,h)=> (RENDERERS[card.status]||renderUnknown)(card,h);  // 兜底防崩
```

### 3.4 Reducer + 事件(含 NODE_SYNC 对账 + 定序)
```
事件:OFFER PICK PICK_SKILL CONFIRM STEP NODE_SYNC PAUSE RESUME DONE FAIL CANCEL RETRY SUPERSEDE
迁移图见 §11。NODE_SYNC 把 graphStore 节点态写进卡:
  refreshSyncedOperationCards 订阅 graphStore(appAssistantPanel.js:2877)→ 对每张带 nodeIds 的卡
  dispatch NODE_SYNC{status: canvasCardStatusForNodeIds(nodeIds)}
★定序(评审 W2):用户事件(CANCEL/CONFIRM)是终态意图,优先;NODE_SYNC 不得覆盖 cancelled/completed/failed。
  reducer: if (TERMINAL.has(card.status)) return card; // 终态冻结,节点同步不复活已取消
★type 修正(root 2):refreshSyncedOperationCards 现只认 card.type==="canvas_actions"(2862),
  本期泛化为"任何带 operation.nodeIds 的 flow_card",否则坍缩后所有卡被节点同步静默跳过。
```

### 3.5 成本确认 = 复用现成(D1,root 3 修正)
```js
// 不自造 needsConfirm,不动 analyze。直接用已是 live 闸的:
generationConfirmationRequired(counts, agentMode)  // assistantGenerationConfirmation.js:51
//   act → video>0 ;  plan → image>0||video>0       ← 正是 D1 的规则,一字不差
```
> 命中 → 卡进 `needs_confirm`,显"将出图 N 镜 [确认][取消]",确认才执行。视频授权(`videoGenerationAuthorized`)折进这一次确认(strong-confirm 2026-06-12 已退役)。**预算/封顶不在本设计(D1b)。**

---

## 4. render 重构(D4 · A 方案核心 · 拆不重写)

### 4.1 当前架构(4 结构事实,`runVimaxRenderLane` 4009-4213 实读)
```
sendMessage → await applyVimaxNativeRenderCommand(4217) → await runVimaxRenderLane(4009)
  ① 再入守卫 state.vimaxRenderInFlight(4035,finally清)        ← 已有单飞,保留
  ② state.streaming=true(4064)……40min poll……=false(4152)   ← 唯一的锁
  ③ while(now<deadline=+40min){ poll; landKeyframe→graphStore.updateNodeData(4112); lastReceipt进度 } ← 零cancel
  ④ push 纯文本回执 kind:"vimax_render"(4196)                 ← 不是卡
4 事实:streaming当锁 / await单体 / 零活体卡 / 零取消钩子。但落帧/补拍/帧跳过逻辑是好代码,只拆接口。
```

### 4.2 抽取 `vimaxRenderJob.js`(UI 无关·可测·不重写内核)
```js
// modules/assistant/vimaxRenderJob.js  —— 把 4009-4213 的 submit/poll/landKeyframe/盘点 原样搬入
createVimaxRenderJob({ pending, api, graphStore }) → {
  start(),                                  // submit → 轮询 → landKeyframe(画布) → 盘点
  cancel(),                                 // 置 cancelled
  on('step'|'done'|'fail', cb),
}
// 内核改一行:轮询循环里 if (this.cancelled){ api.vimaxNativeCancel(jobId); break }   ← 接 cancel(root1)
// 落帧/补拍/帧跳过/盘点:一行不改。先单测锁"行为逐字一致"再接卡(防回归)。
// 预算/封顶(4070签字)作正交关注点:本设计不含(D1b),保留或剥离另议。
```

### 4.3 接 `executionStore` 后台作业(顺手解 root 4,不造新状态)
```js
const job  = createVimaxRenderJob({ pending, api, graphStore });
const exec = executionStore.createExecution({ kind:"vimax_render", flowId, status:"running", cancel:()=>job.cancel() });
job.on("step", s => executionStore.updateExecutionStatus(exec.id, "running", { progress:s }));  // 白送云端同步
job.on("done", d => executionStore.updateExecutionStatus(exec.id, "completed", d));
job.on("fail", e => executionStore.updateExecutionStatus(exec.id, "failed", e));
// render 进入和别的 execution 同一后台生命周期;不新增第 6 个状态源。
```

### 4.4 脱 streaming + 派发 fire-and-forget(解 40min 锁,root1)
```js
// 旧:return await runVimaxRenderLane(...)        ← await 单体 + state.streaming=true = 锁40min
// 新:
job.start();                                       // fire-and-forget,不 await
return { reply:"已开始成片渲染,进度见卡片。" };     // dispatch 立即返回 → 输入不锁
// vimaxRenderJob 内部全程不碰 state.streaming;sendButton.disabled(8337)只看 foregroundFlow,不看后台 render
```

### 4.5 cancel 钩子(接 `vimaxNativeCancel`,解"取消不了",root1)
```
render 卡 [取消] / 发送键⏹(当 foregroundFlow 为空但有后台作业时,⏹ 作用于后台细条的取消)
  → exec.cancel() → job.cancel() → 轮询循环 break + api.vimaxNativeCancel(jobId)
  → exec status:cancelled → 卡 cancelled
(api.vimaxNativeCancel 已存在,现仅接在暂停规划取消 3911;本期接到 render jobId)
```

### 4.6 render 傻卡(3 态,**不卷进 god-card**)
```
running/generating「成片中 3/8 · ⏱0:42 · [取消]」 → completed「8 镜出图 [展开详情]」
                                                  ↘ failed/retryable「失败 N 镜 [重发补拍]」
background:true → 不进 foregroundFlow → 输入不锁;§6.1 后台细条渲染它。
render 卡只用 running/generating/completed/failed/cancelled 5 态,不需要 needs_action/preview。
```

---

## 5. 交互层

### 5.1 发送键三态(= foregroundFlow 开关)
```
foregroundFlow==null && 有字 && canSend → ▲就绪   点击=send()
foregroundFlow==null && (空||!canSend)  → ▲禁用
foregroundFlow!=null                    → ⏹进行中  点击=foregroundFlow.cancel()
(后台作业不改发送键;它在自己的后台细条上有独立[取消])
```
### 5.2 单流闸(无队列):foregroundFlow 存在 → 锁输入;被动 chips/后台作业不锁。
### 5.3 取消语义
| 场景 | ⏹/[取消] |
|---|---|
| pi 流式 | stopStreaming()(卡 cancelled,静默) |
| 卡 preview/needs_confirm | CANCEL → 回 chat,不执行 |
| 卡 paused | CANCEL → vimaxNativeCancel(规划) |
| **后台 render**(细条[取消]) | exec.cancel()→job.cancel()→vimaxNativeCancel(jobId) |
### 5.4 流式看门狗(治 120s 伪流式卡死)
```
前台流起 → watchdog:收帧重置;>20s 无帧 → 卡"还在跑…[继续等待][停止]";
底层永不 resolve → ⏹ 始终 cancel → 复位 → 解锁(不再"卡死只能刷新")。
后端根治(§8):去 list() 憋帧 + 阶段/心跳帧 + 超时可配。
```

---

## 6. UI 层

### 6.1 吸附区(**1 前台卡 + N 后台细条**,评审 W1 收口)
```
┌─ PI 助手 ─────────────────────────────────────┐
│ header  [＋新会话]              [🕘历史][⚙]    │ ← 抽屉历史挪头部
│  消息流(完成卡沉这里当历史)                     │
│   助手 好的  🎬继续创作[导演][成片][定妆][拍法]  │ ← needs_action(不占流)
│ ╔═══ 吸附:前台主卡(sticky)═══════════════╗   │
│ ║ 导演规划·已暂停  ✓故事✓角色 ⏸分镜         ║   │ ← 前台决策卡(paused)
│ ║ [继续]                        [取消]      ║   │
│ ╟─── 后台作业细条(1~N,各自单例)──────────╢   │
│ ║ 成片中 3/8 ⏱0:42                  [取消] ║   │ ← 后台render细条(不锁输入)
│ ╚═══════════════════════════════════════════╝   │
├───────────────────────────────────────────────┤
│ 附件;[＋][输入…(前台流时锁)];[✣模型][@][Plan][🎬拍法库]   [▲/⏹] │
└───────────────────────────────────────────────┘
说明:前台主卡 ≤1;后台细条按 executionStore active 后台作业渲染(成片/定妆各单例,可并存→堆叠细条)。
后台失败/完成也在细条提示(防"不锁输入→失败被错过")。
```
### 6.2 卡视觉演化:见 §11 状态图。删:executionDrawer/receipt/preview/死控件/2澄清卡。

---

## 7. 影视拍法库(D6/D7 · root 5 修正)

### 7.1 定位:70 个 flova 配方 + director-suite = **拍法知识库**,注入幻映导演分镜(`_select_craft`→`build_injection`),**不复刻 flova 管线**。注入塑形分镜/镜头语言/视觉;**成片产关键帧图,非视频片**(诚实标注,别让用户以为选 Seedance skill 出 Seedance 视频)。

### 7.2 接入(**对齐 `load_roster` 真实格式**,root 5 修正)
```
真实读取:skills_index.load_roster(skills_dir) = Path(skills_dir).glob("*.md") → parse_skill(text)
         即:skills_dir 下【扁平 *.md】,每个含可解析的 Skill(70 个 flova .md 已是此格式!)
∴ §7.2 = 把 70 个 *.md【扁平拷进 brain 的 skills_dir】(不是 v2 错写的 skills/film-skills/<id>/knowledge.md 嵌套)
  scripts/import-film-skills.py:源文件夹 *.md → 校验 parse_skill 能读出 name → 拷进 <skills_dir>
  选择器列表 = load_roster(skills_dir) 同源读取(选择器和注入读同一份,零分叉)
```
### 7.3 选择器(替换爆款位置):可搜索+分片型;每项标题/描述/适用 +「出图✓·视频→映射(诚实)」。
### 7.4 选中→预览→二选一(D7):preview 态拍法卡(概要+成本)→ [立即开拍(当前brief起导演流)] / [设为当前拍法(下条沿用)]。
### 7.5 注入(复用已实现):合成 `导演:<brief>《拍法:剧情短片Seedance》` → `_select_craft` 按《》名解析(`shotplan_assembly.py:118`)→ `build_injection` 注入分镜 prompt(`planner.py:244`)。**机制现成有测试(`planner_test.py:195-209`),本期=填 skills_dir + 选择器。**

---

## 8. 后端流与超时治理(核心卡顿,UI 救不了)
```
病:canvas_agent_route_service.py:192 list(...chat_stream()) 憋帧 + pi_bridge_service.py 120s 子进程
   → 120s 收不到字节 → "转圈→突然超时"(pi_timeout 'Pi canvas agent timed out.')
治:① 真流式(去 list 憋帧,边产边吐)② pi_bridge 120s 内吐阶段/心跳帧 ③ 超时可配 + 卡显已耗时
   前端先行:§5.4 看门狗 + 发送键接 stopStreaming(止血)
⚠️ 诚实:没有后端 ①②,核心卡顿不解;UI 坍缩只是让超时换地方显示。
```

---

## 9. 落地路线(切片化,A 类可独立先发)+ 测试不变量
```
切片0 止痛(0.5天·最高ROI·零依赖):render 脱 state.streaming(独立后台标志)+ 8337/getter 只看前台流
       → 成片锁面板40min 当天消失(不需卡/cancel/reducer)
切片1 render→job(1-2天):抽 vimaxRenderJob.js + 单测锁行为一致 + 接 cancel 钩子(vimaxNativeCancel)
切片2 render→execution(1天):接 executionStore.createExecution/updateExecutionStatus(复用+云端同步)
切片3 render傻卡(1-2天):后台细条渲染 render execution;dispatch fire-and-forget
切片4 确认规则(0.5天):needs_confirm 卡接 generationConfirmationRequired(零新代码)
切片5 状态表/reducer(2-3天):RENDERERS 补全11态+保留type+NODE_SYNC定序;泛化 refreshSyncedOperationCards
切片6 吸附+坍缩(数天):活跃卡吸附;删 drawer/receipt/preview/死控件/2澄清卡(★测试爆炸半径大:p1Ui/test/context 多处断言)
切片7 拍法库(1-2天):import-film-skills 扁平进 skills_dir + 选择器
切片8 后端真流式(另排期):去 list 憋帧 + 阶段/心跳帧
```
**测试不变量**:
```
• 成本闸:plan出图/act视频前必 needs_confirm(复用 generationConfirmationRequired,不另造)
• render 取消:⏹/[取消] → vimaxNativeCancel(jobId);终态冻结不被 NODE_SYNC 复活
• 单飞:render 单实例(vimaxRenderInFlight 守卫保留)
• 渲染不崩:RENDERERS 覆盖11态 + renderUnknown 兜底;flow_card 保留 type 给节点同步
• 不串会话:卡渲染按 conversationId/projectId 过滤 snapshot
• 内核冻结:vimaxRenderJob 抽取前后行为逐字一致(单测锁)
• p1Ui.test.js 必跑(全 mount,render 副作用最易咬)
```

---

## 10. 边界 / 风险 / 诚实声明
```
1. "单一真相源"是过度宣称:底层仍 5 处(§3.1),本期只减 UI 表面 + NODE_SYNC 对账。文档不撒这个谎。
2. render 内核不重写(落帧/补拍/帧跳过是带血正确性);只拆接口。抽取必先单测锁行为。
3. 后端真流式(切片8)不做,核心卡顿不解——切片0~5 是 UI/交互改善 + 止血,不是治本。
4. 拍法注入塑形分镜手法,成片产关键帧图≠视频片;选择器须诚实标注,勿误导。
5. 预算/封顶按 D1b 不在本设计;若代码现存 broker 封顶,作正交保留,另行决策。
6. 切片6(删抽屉)测试爆炸半径大,工期以数天计,勿与切片0"半天止痛"混同。
7. NODE_SYNC vs 用户终态:终态(cancelled/completed/failed)冻结,节点同步不得覆盖。
```

---

## 11. 附:核心结构速查
```
状态全集渲染(11): needs_action preview needs_confirm running generating preparing retryable paused completed failed cancelled
foregroundFlow ⟺ streaming ∨ card.status∈{preview,needs_confirm,paused} ∨ 前台decompose   (派生,不存)
backgroundJob  ⟺ executionStore 里 render/portraits kind 的 active 执行(不进 foregroundFlow)
发送键: foregroundFlow ? ⏹(cancel) : (有字&&canSend ? ▲send : 禁用)
成本确认: generationConfirmationRequired(counts,mode)  [act:video>0 | plan:image>0||video>0]  (复用,不造)
render: vimaxRenderJob(抽取不重写) → executionStore.createExecution(复用) → 傻卡(3态) → 脱streaming/接vimaxNativeCancel
拍法: 70个*.md 扁平进 skills_dir(对齐 load_roster glob)→ _select_craft 按《》注入分镜prompt(已实现)
reducer 终态冻结: if (TERMINAL.has(status)) return card  // NODE_SYNC 不复活已取消/完成/失败
```

— 完(v3,接地真实代码,对抗评审收口) —
