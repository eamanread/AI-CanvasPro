# 导演大脑通血管开发文档(切片 V0–V8)

日期:2026-06-12
状态:已评审(r2)——初稿经 6 路分区审查(对照真实代码逐锚点核验,12 blocker/33 major+minor 全部吸收;审查同时挖出 3 个现网既有 bug,见 V0 与 V2 前置)
范围:幻映(本仓库)+ QMAI(`D:\Backup\Documents\导演wiki\QMAI`,分支 `codex/director-os-phase0a`)

---

## 0. 背景:四点愿景与断点

用户愿景:①文档→互联知识卡库;②PI 提问经导演大脑思考、PI 编排成节点;③连续性由大脑把控;④影视知识对用户产生最大价值。审计兑现度 ①15% ②10% ③25% ④15%。本文档定义修复前 9 个切片(V0 为审查中新发现的现网 bug 修复)。

### 0.1 证据锚点速查(全部经审查员二次核验)

| # | 事实 | 锚点 |
|---|---|---|
| E1 | 执行器遵守 autoStart:false 戳(顶层与 data 两形都认) | `modules/assistant/assistantCanvasSkillExecutor.js:123` |
| E2 | 导演 prep 节点写了 prompt 却没盖戳 | `modules/directorBrain/directorCanvasActions.js:102-109`(storyboard)、`:162-168`(action-package) |
| E3 | 闸门只拦 3 种生成动作类型,管不住 create 副作用 | `modules/directorBrain/directorContinuityGate.js:3-7` |
| E4 | runner 无视真卡、伪造 6 条记忆切片 | `tools/director_plan_runner.mjs:16,28-35,120` |
| E5 | loader 已完整保留信封真卡 | `modules/directorBrain/directorMemoryExportLoader.js:214-233` |
| E6 | mapper 渲染缺 whenToUse 分支 | `modules/directorBrain/directorCanvasActions.js:15-21` |
| E7 | PI 知识管道现成(llmWiki):白名单 8 键 [title,fileId,projectId,snippet,citation,citationDisplay,source,score] | `modules/assistant/assistantContextBuilder.js:53-62`(搜索结果)、`:63-80`(hint)、LIMITS `:12-14`、knowledgeFrom `:405-413`、净化 `:334-372` |
| E8 | 服务端 knowledge.clear() 只回填 llmWiki;条目级过滤 _sanitize_knowledge_items 同 8 键、仅标量、240 字截断;**仅挂 /context/preview 路由,chat 主链路不经它** | `services/canvas_agent_context_service.py:17-26,47-53,292-302,330-352`;chat 链路 `services/pi_bridge_service.py:238-252` 仅 deepcopy |
| E9 | PI 系统提示已教消费 llmWiki 且禁伪造引文(actions 模式专属,非 sharedRules) | `integrations/pi_canvas_agent/src/huanyingTools.js:265`(镜像 `huanyingTools.ts:285`;sharedRules 在 `:224-229`) |
| E10 | 真实 store 顶层平铺:adapter addNode `{...data, ...node}` 后 delete data | `modules/app/appAssistantPanel.autoload.js:99-102`(契约测试 `autoload.test.js:417-470`) |
| E11 | dailies 只读 node.data.*(真机实锤导出只剩骨架) | `modules/directorBrain/directorCanvasDailies.js:34-48` |
| E12 | dailies 无图像字段;QMAI 消费端同样无;**真实成片是 `/output/gen_*.png` 站内相对路径,不是 http(s) 绝对 URL** | `directorCanvasDailies.js:35-48`、QMAI `canvas-dailies-import.ts:3-16`;相对路径证据 `media_file_route_service_test.py:86` 等 |
| E13 | 眼睛只在动作落地时拍一次;失败被 .catch(()=>{}) 静默吞;**且 dailies POST 今天就被网关 404(见 E25)** | `modules/app/appAssistantPanel.js:4900-4911` |
| E14 | bridge 顶层回退先例 `node.data \|\| node` | `modules/assistant/canvasSkills/generationTaskBridge.js:61-63,119-123` |
| E15 | schema 校验器拒 unknown(`:192-196`)与 PLANNED/agentWritable=false(`:198-202`);validateNodeParameters 现签名 {nodeType, action, modelRegistry}(`:168`) | `modules/assistant/canvasSkills/schemas/schemaValidator.js`、`imageNode.schema.js:20-32` |
| E16 | 被剥的只有 ai-image/ai-text/ai-video 跳;storyboard-script 走 legacy 路径血统完好 | `assistantCanvasSkillRegistry.js:3`、`assistantActionExecutor.js:1297-1308` |
| E17 | plan 端零 LLM(秒级编译);思考在 refresh(300s 预算,`:39-41`);bridge 读 stdout 末行 JSON(`:87`) | `tools/director_plan_runner.mjs`、`services/director_bridge_service.py` |
| E18 | directorRefresh 前端 API 零调用方;plan 无新鲜度校验 | `api/canvasAgentApi.js:259-261` |
| E19 | headless 弃用管线现成 onProgress 钩子;真实阶段名 tacit-card/storyboard/prompts/continuity | QMAI `scripts/director-headless.ts:202-224`、`director-llm-pipeline.ts:137`(调用点 `:172,:179,:189,:195`) |
| E20 | 文档投喂入口不存在(extract/ingest 唯一调用方是 spec;knowledge-view 纯只读) | QMAI `knowledge-ingest.ts:28`、`knowledge-llm-extract.ts:57` |
| E21 | wiki 互联引擎现成零 novel 耦合;**但 searchWiki 只索引磁盘 wiki/*.md,不能喂内存对象;页级向量 API 是 embedPage/searchByEmbedding** | QMAI `embedding.ts:345,467,530`、`search.ts:225,259-268,294-297,322`、`dedup.ts:100-104,211`、`novel/search-adapter.ts:1` |
| E22 | 大脑选卡 slice(0,3) 目录序盲切(**同步纯函数内**);适配器丢字段;**调用方 view-state :184-186 也丢** | QMAI `director-room-view-state.ts:102,119,184-186`、`director-llm-adapter.ts:19,78-81` |
| E23 | whenToUse 唯一检索键被两侧丢弃(幻映整仓 grep 零命中) | QMAI `knowledge-card.ts:28-29,119` |
| E24 | trace-card 零生产调用;卡片只进不改 | QMAI `trace-card.ts:10,165`、`review-memory.ts:105` |
| E25 | **现网 bug:HTTP 网关白名单缺 director/dailies 与 director/refresh,POST 在 dispatcher 层即 404**(route service 测试直调 handle_post 绕过网关,绿测掩盖) | `services/http_route_dispatcher.py:12-17(_CANVAS_AGENT_GET_PATHS),18-27(_CANVAS_AGENT_POST_PATHS),298-301,391-394` |
| E26 | **现网 bug:QMAI 真实导出的信封 knowledgeCards 恒为空数组**(契约层整卡 spread 没问题,但唯一生产导出方 headless 未传卡且 cardContext 写死 []) | QMAI `director-export.ts:68`、`scripts/director-headless.ts:206,234-244` |
| E27 | **metadata.source 可被 LLM 伪造**:claw 的 _safe_metadata 内联白名单含 "source",PI 路径动作的 metadata.source 存活;受信判定禁止读它 | `services/claw_action_schema.py:574-608`(:600) |
| E28 | 导演动作已带信封 metadata.source="qmai_director_brain"(riskLevel/requiresConfirmation 同披) | `modules/directorBrain/directorBrainService.js:58`、`modules/assistant/assistantActionContract.js:106-122` |
| E29 | claw 动作级字段(autoStart/placement)走 _sanitize_action 顶层元组(autoStart 在 `:681`);**data 内键走 _safe_metadata 白名单,data.autoStart 不在其中** | `services/claw_action_schema.py:672-780,574-608` |
| E30 | 真实异步生成不经 bridge 终态:编排模块 fire-and-forget(`Promise.resolve(run...).catch(()=>{})`)后由节点编排直接写 store(jobStatus/asyncTaskStatus="success"),patchTerminalNode 在真实生成链上几乎不触发 | `components/aigenImage/taskOrchestrationModule.js:86-107,139`、`components/aigenText/taskOrchestrationModule.js:113`、`generationTaskBridge.js:126-129,189-196` |
| E31 | panel 已有观察终态的活体机制:graphStore.subscribe → refreshSyncedOperationCards,且 mapCanvasGenerationState 取数即 `node.data \|\| node` 双形状 | `appAssistantPanel.js:2453-2476,2537,3288-3293,3459` |
| E32 | python http 服务是多线程(每请求一线程);job 表加锁先例 smart_clip | `server.py:133(ReusableThreadingTCPServer),208-209`、`http_route_dispatcher.py:244-252` |

### 0.2 铁律(全切片适用)

1. **fail-closed 且降级可见**:无判决即未验证;降级必须到达用户(注意:导演路径 panel 不消费 response.warnings,降级要写进 reply 或补 state.lastWarnings,见 V2)。
2. **LLM/网络与像素边界**:`modules/directorBrain` 零 LLM、零网络(CONTRACTS.md:65 原文);像素**坐标**双向不经 LLM(不变量 8);loader 源路径与敏感键永不进 LLM 上下文或画布数据(RED-LINE-1)。视觉判官只能放 L2,不在本批。
3. **画布即真相**:任何"读节点字段"必须兼容真实 store 顶层平铺形状(E10),禁止只读 `node.data.*`。
4. **血统与受信由代码判定**:受信来源是调用点代码传参,**绝不读 action.metadata.source**(E27:LLM 可伪造);引用 ID 不经 LLM 转述。
5. **用户主权**:生成永远经用户可见的确认/队列;知识以可删除的画布一等公民出现,不弹窗。
6. **flowId 贯穿**(CONTRACTS.md 不变量 7)。
7. **每切片先 RED 测试**;绿色切片先提交;契约变更双侧 golden,顺序照 CONTRACTS.md:29:先重生成 golden 令对侧变红,才许改对侧代码。
8. **契约动作同步登记 CONTRACTS.md**(唯一权威清单,:16-29):V4 完成时把登记表 canvas-dailies 行升 v2 并更新 golden 指针;V3 完成时新增一行 `director-knowledge-projection/v1 | L2 磁盘 → L1(PI 上下文) | runner mode=knowledge | contextBuilder llmWiki 合并 | 投影契约测试`。
9. **真机验收环境约定**:导演链路(plan/dailies/refresh)一律在 **8777** 验收;涉及 python 改动的切片(V0/V3/V5/V8)验收前**必须重启 8777**;如用 8779 需先配 `HY_QMAI_PROJECT_DIR` 与 `HY_QMAI_HEADLESS_CMD`。

### 0.3 切片依赖图

```
V0(网关白名单,现网bug) ──→ V3 / V4 / V8 的端点全部依赖它
V1(堵旁路) 独立
V5(血统受信写入) ──软依赖→ V4(promptId 对账断言推迟到 V5 后;V4 的重导触发可先行)
V2(真卡入链) ←前置← E26 修复(QMAI headless 传真卡,归入 V2 范围)
V2 ──→ V3(投影读同一信封)
V6(导入 UI) ──→ V7(卡片互联) ──→ V3 的打分器后续可升级复用 V7 检索
V8(思考/编译分层) 依赖 V0
```

建议施工顺序:V0 → V1 → V5 → V2 → V4 → V3(幻映侧)‖ V6 → V7 → V8(QMAI 侧可并行)。

---

## 切片 V0:网关白名单修复(现网 bug,半小时)

### 目标
审查实锤(E25):`/director/dailies` 与 `/director/refresh` 的 POST 今天就在 `services/http_route_dispatcher.py` 的白名单层被 404,根本到不了 route service——panel 的 fire-and-forget `.catch(()=>{})` 把失败吞掉,这是 E13"眼睛失败静默"的第二层原因。route service 自己的测试直调 `handle_post` 绕过网关,绿测掩盖了缺口。

### 改动点
1. `services/http_route_dispatcher.py` `_CANVAS_AGENT_POST_PATHS`(:18-27)补登 `/api/v2/canvas-agent/director/dailies` 与 `/api/v2/canvas-agent/director/refresh`。
2. dispatcher 测试照 `http_route_dispatcher_test.py:504`(director/plan 先例)补两条用例。

### 测试与验收
RED:用真实 HTTP(经 dispatcher,而非直调 route service)POST 两端点,断言非 404。python 改动,**8777 重启**后用真机抓 `/director/dailies` 返回 200。

---

## 切片 V1:堵 auto-start 旁路(半天)

### 目标
闸门 block/unverified 时,任何路径都不得产生真实生成调用(E1-E3 实锤:带 prompt 的导演 create 落地后被执行器自动开火,真机验证)。

### 改动点

**(a) 导演 prep 节点无条件双盖戳**(`modules/directorBrain/directorCanvasActions.js`)
- `mapStoryboardToCanvasActions`(:102-109)与 `mapActionPackageToCanvasActions`(:162-168)的含 prompt 节点 data 加 `autoStart: false`,**同时在动作顶层盖 `autoStart: false`**——执行器两形都认(E1);顶层形已在 claw 顶层白名单(E29 `:681`),而 `data.autoStart` 不在 `_safe_metadata` 白名单,双盖可防未来任何经服务端动作清洗的路径剥掉 data 戳。
- 依据:同文件 :47-49 注释自述 "creation only — generation must go through the user-confirmed queue"。

**(b) 闸门判决随动作下行**(`modules/directorBrain/directorBrainService.js`)
- 落点:`:50`(gated)与 `:58`(envelope)之间。注意 **gate 返回值不含 shouldHoldGeneration**(它是 directorContinuityGate.js:53 的函数内局部变量),调用方按同式重导判定:
```js
const holdGeneration = (gated.status === "block" || gated.status === "unverified") && !gated.overrideUsed;
```
(与 gate 内部判定同式,两处注释互链防漂移。)holdGeneration 为 true 时对 `gated.allowed` 中所有 create_node 动作追加顶层与 data 的 `autoStart = false`(与 (a) 幂等)。
- 机制选择:复用 E1 现成戳,不引入 `metadata.gateStatus` 新字段(会被 schemaValidator 当 unknown 拒写并产生噪音告警,E15)。

### 测试计划(RED 先行)
1. `directorCanvasActions.test.js`:两路径产出的每个含 prompt 的 create 断言顶层与 data 均 `autoStart === false`。
2. `directorPlanRunner.test.js` 新用例:block 与 unverified 报告下,plan 产物喂真实执行器,断言 `startedGenerationNodeIds.length === 0 && queuedGenerationNodeIds.length === 0`。harness 拼装:plan→真实 executeAssistantActions 照 `directorBrainService.test.js:108` 先例;canvasSkillsRuntime fixture 照 `canvasSkills/runtime.test.js:33-85` 先例(该 fixture 已被证实能在 create+prompt 时观测到自动开火,RED 阶段应先红)。
3. 真机(8777):重放 unverified 导演计划,`preview_network` 断言零生成请求。

### 风险与回滚
低(加字段,幂等)。回滚 = revert。

---

## 切片 V2:runner 停止丢真卡 + QMAI 导出真卡(1 天,双侧)

### 目标
信封真卡进入 plan 编译链(E4/E5);dock 卡渲染补 whenToUse(E6/E23)。**前置实锤(E26):QMAI 真实导出的信封 knowledgeCards 恒为空数组——不修导出端,幻映侧主路径空转。**

### 改动点

**(a) QMAI 导出端传真卡**(E26 修复,本切片前置)
`scripts/director-headless.ts`:用 node `fs` 读 `<project>/director/knowledge/cards/*.json`(loadDirectorKnowledgeLibrary 依赖 @/commands/fs 的 Tauri 实现,node 脚本不能复用,自行读盘),经 `validateKnowledgeCard` 过滤后传入 `buildDirectorExportEnvelope`(:234-244 现状未传)与 cardContext(:206 现状写死 [])。

**(b) runner 优先真卡**(`tools/director_plan_runner.mjs`)
- 在 `:112`(`const memory = await loadDirectorMemoryExport(...)`)之后插入:
```js
const knowledgeCards = Array.isArray(memory.knowledgeCards) && memory.knowledgeCards.length > 0
  ? memory.knowledgeCards.slice(0, KNOWLEDGE_CARD_LIMIT)
  : knowledgeCardsFromMemory(memory);
const knowledgeDegraded = !(Array.isArray(memory.knowledgeCards) && memory.knowledgeCards.length > 0);
```
- `:120` 的对象属性改简写 `knowledgeCards,`(注意 :120 在 buildDirectorBrainCanvasPlan 调用的对象字面量内,不能原位塞声明)。
- 降级可见(铁律 1):响应组装处(:161 前)warnings 数组(现 `:174` 由 `planResult.blocked.map(...)` 一次性生成)改为可累加,`knowledgeDegraded` 时 push 降级行;**同时把降级行拼进 reply(:154-159)**——导演路径 panel(applyDirectorPlanCommand,appAssistantPanel.js:3142-3194)不消费 response.warnings,只渲染 reply;或在 applyDirectorPlanCommand 补 `state.lastWarnings = response.warnings`,二选一并写测试钉住可见性。

**(c) dock 卡渲染**(`modules/directorBrain/directorCanvasActions.js:15-21` contentLines 增两行)
```js
card.whenToUse?.length ? `适用: ${card.whenToUse.join("、")}` : "",
card.whenNotToUse?.length ? `避免: ${card.whenNotToUse.join("、")}` : "",
```
(`directorBrainService.js:36` 只消费传参 knowledgeCards,上游修好即通,无需改。)

### 测试计划
1. RED:runner 测试——信封含 2 张全字段真卡 + 6 条记忆,断言 dock 卡内容含 `principle` 与 `适用:` 行、不含伪造摘录;reply 不含降级行。
2. 目录布局兜底:无 memory.knowledgeCards 时维持现行为,reply 与 warnings 含降级行。
3. QMAI headless spec:导出信封 knowledgeCards 非空且通过 validateKnowledgeCard。
4. 渲染目检:dock 卡是 **comment 节点走通用 create_node 路径,尺寸固定 320x220**(assistantActionExecutor.js:8/:1267-1268 与 nodeLifecycleAdapter.js:63 两路径默认一致,不随内容自适应),contentLines 增两行后目检 8779 dock-left 不溢出。

---

## 切片 V3:导演卡投影进 PI 日常上下文(2 天)

### 目标
49 张卡从"导演:前缀专属"变成"每次 PI 生成都在场"。复用现成 llmWiki 管道(E7-E9),零新管道。依赖 V0(网关)与 V2(a)(信封有真卡)。

### 架构决策
- 新端点 `GET /api/v2/canvas-agent/director/knowledge`;runner 走 **stdin payload 的 `mode:"knowledge"` 字段**(照 :93-94 dailies 分支与 route 层 payload 注入先例 canvas_agent_route_service.py:254-255;runner 无 argv 解析,**不要发明 CLI 旗标**)。
- python 缓存:`HY_QMAI_PROJECT_DIR` 指向 .json 信封文件时用其 mtime 失效;指向目录时退化纯 TTL(60s)——Windows 目录 mtime 不随嵌套文件内容变(响应带 cachedAt 便于排查)。
- **投影形状(经双侧净化器核定)**:
```json
{
  "title": "<card.title>",
  "snippet": "<card.promptImplication>",
  "citation": "<card.source?.shortQuote || ''>",
  "citationKind": "qmai",
  "cardId": "<card.id>",
  "craftDomain": "<card.craftDomain>",
  "whenToUse": "<card.whenToUse.join('、')>"
}
```
  - `title/snippet/citation` 复用既有白名单键,免登记;
  - **需双侧登记 4 个新键**:`citationKind/cardId/craftDomain/whenToUse`——JS `KNOWLEDGE_SEARCH_RESULT_FIELDS`(assistantContextBuilder.js:53-62)与 python `KNOWLEDGE_SEARCH_FIELDS`(canvas_agent_context_service.py:17-26,**python 改动,8777 重启**);
  - **whenToUse 必须在投影端 join 成字符串**:两侧净化器均标量-only(JS sanitizeKnowledgeEntry :348-372 / python _text_preference :47-53,数组直接归空),且标量截 240 字;ranker 解析时按 '、' split;
  - python 条目级过滤已核定**确实存在**(_sanitize_knowledge_items :330-352),但**只挂 /context/preview 路由**(route service :291-299);chat 主链路(pi_bridge_service.py:238-252 仅 deepcopy)由 JS builder 白名单决定——双侧登记,JS 是功能正确性,python 是 preview 一致性与契约对齐。

### 改动点
1. `tools/director_plan_runner.mjs`:buildDirectorPlanResponse 增 `mode === "knowledge"` 分支,输出 `{schemaVersion:"director-knowledge-projection/v1", cards, exportedAt}`。
2. `services/director_bridge_service.py`:`knowledge()` 照 plan()(:43-65)子进程模型,payload `{"mode":"knowledge"}` + 缓存;`services/canvas_agent_route_service.py` 注册 GET;**`services/http_route_dispatcher.py` `_CANVAS_AGENT_GET_PATHS`(:12-17)登记该路径**(E25,不登必 404)。
3. `api/canvasAgentApi.js`:`directorKnowledge()` 照 **status()(:236-238)的 GET 形状**(directorDailies :256-258 是 postJson,不可照抄)。
4. 注入与合并(经审查修正的落点):panel fetch+缓存+打分(`modules/assistant/directorKnowledgeRanker.js` 纯函数,按用户消息 × whenToUse/craftDomain 字符串打分取 top3);sendMessage 的 buildContext 调用(appAssistantPanel.js:3830-3831)增传 `knowledge: { llmWiki: mergedLlmWiki }`,经 autoload 包装器(appAssistantPanel.autoload.js:332-340)spread 进 builder 输入,命中 knowledgeFrom 的 `input.knowledge?.llmWiki` 首位。**注意该取值链是 || 整体短路而非深合并**:mergedLlmWiki 必须由面板自己构造:
```js
const existing = workspaceStore?.getState?.()?.knowledge?.llmWiki || {};
const mergedLlmWiki = { ...existing, searchResults: [...top3Cards, ...(existing.searchResults || [])] };
```
(当前仓库无生产代码写 workspaceState.knowledge——llmWiki 输入侧休眠、仅测试在喂,导演卡实际将是唯一来源,但合并仍按上式写以兼容未来 producer。合并后仍受 LIMITS 12 条截断,导演卡排前即保活。)
5. 提示词规则:`huanyingTools.js` **actions 模式规则数组**(:256-280)在 :265 LLM Wiki 规则后加一条(引用卡片 promptImplication 时随附 cardId、禁改写引文);**同步镜像 `huanyingTools.ts:285`**(两文件成对维护);不动 sharedRules(:224-229),避免污染 replyOnly/doctor/auto_layout 模式。

### 端点失败语义
`HY_QMAI_PROJECT_DIR` 缺失/无信封 → 200 + `{cards:[], warning}`;panel 收空数组跳过合并(fail-open:知识注入是增强,不是闸门)。

### 已知副作用(排查指引)
searchResults 注入导演卡会激活 claw 的 llmWiki 来源作用域校验(claw_action_schema.py:913-926,作用域空时跳过、非空强制):投影含 `title` 键可让引用导演卡的 knowledge_card 创建匹配作用域;若真机出现 "LLM Wiki source metadata is outside current context" 警告,排查方向在此。

### 测试计划
1. RED:ranker 单测("雨夜告别的构图"命中 cinematography/whenToUse 含"构图"的卡)。**共享算法测试向量**:新增 `director-knowledge-ranker.vectors.json`(查询×卡库→期望排序),由幻映 ranker 真实代码生成、复制进 QMAI(V7 的 selectRelevantCards 回退打分共同消费,照 golden 规矩防两侧漂移)。
2. 投影契约测试:投影条目经 JS `sanitizeLlmWikiContext` 与 python `_sanitize_knowledge_items` 双侧字段无损(照 canvasSpatialContract.test.js 跨语言先例)。
3. python 单测:缓存命中/失效;无项目目录失败语义;dispatcher GET 白名单用例。
4. 集成:`buildAssistantCanvasContext` 输出含导演卡且总数 ≤12,且 workspaceState 既有 llmWiki 不被顶掉(喂假 workspaceState 断言合并)。
5. 真机(8777,重启后):日常消息(无导演前缀)请求体 context 含 `citationKind:"qmai"` 条目。

### 风险与回滚
中(动 PI 上下文主路径)。feature flag `directorKnowledgeInContext` 一键关。token 预算:top3 ≈ 300-450 token,受 12 条限额保护。

---

## 切片 V4:眼睛复明 canvas-dailies/v2(2-3 天,双侧)

### 目标
治三重眼盲(E10-E13、E30):读错地方、没有图、拍错时机。依赖 V0(dailies POST 现被 404);与 V5 软依赖(重导触发可先行,promptId 对账断言推迟到 V5 后)。

### 契约变更:canvas-dailies/v2
- 节点增加 `outputs: [{kind:"image"|"video", url, thumbnailUrl?}]`(可空);`schemaVersion` 升 v2;新增可选 `phase:"post-actions"|"post-generation"`。
- **部署顺序钉死**(QMAI validateCanvasDailies 对 schemaVersion 严格等值,canvas-dailies-import.ts:61-63,fail-closed):先合 QMAI 侧(接受 {v1,v2},v1 时 outputs 视空、phase 可缺省),双侧 golden 过绿后,幻映再切版本号。
- 铁律 8:CONTRACTS.md 登记表 canvas-dailies 行升 v2。

### 改动点

**(a) 字段读取归一**(`modules/directorBrain/directorCanvasDailies.js`)
- `pick(node, key) = node.data?.[key] !== undefined ? node.data[key] : node?.[key]`,全部 data.X 改 pick(E10/E14)。
- generationStatus 归一:**把完整数据对象传入** `normalizeCanvasGenerationStatus(node?.data && typeof node.data === "object" ? node.data : node)`(`canvasSkills/generationStateMapper.js:44`;它从 jobStatus/asyncTaskStatus/taskStatus 等多键综合判定 `:26-38`——真实 image 成功补丁只写 jobStatus/asyncTaskStatus,**不写 generationStatus**,传单值会把已完成节点导成 running)。

**(b) outputs 提取(经审查修正——真实成片是站内相对路径,E12)**
- 取数链(pick 归一后顶层读):image 取 `imageUrl || thumbUrl || sourceUrl` 并遍历 `images[]` 导出多图;video 取 `videoUrl` 并遍历 `videos[].videoUrl`;thumbnailUrl 映射自 thumbUrl(参照 panel firstResultUrl 候选链 appAssistantPanel.js:2478-2512,**去掉 localPath/path 两个敏感候选**)。
- URL 放行三规则:① http(s):// 原样放行;② **以 / 开头的站内相对路径(真实成片 `/output/gen_*.png` 形态)拼 assetBaseUrl 转绝对 URL 放行**——buildCanvasDailiesExport 新增可选入参 assetBaseUrl,panel 调用处(:4905)传 `windowRef.location.origin`;③ file://、盘符路径及其余形态过滤(盘符串即使漏网也被 sanitizeDirectorContext 的 redactSensitiveText 兜底,但 `file:///D:/...` 正斜杠形式不被现有正则命中——白名单是必要的第二道闸,与 RED-LINE-1 一致,不触碰像素坐标红线)。
- **outputs 子键命名避开 \*path\***(thumbnailUrl 不得叫 thumbLocalPath):敏感键正则(sensitiveDataRules.js:7)整键剥除含 path 的键。

**(c) 双时机导出(经审查修正——bridge 终态钩子在真实异步链上不触发,E30)**
- 现有"动作落地即导出"保留,补 `phase:"post-actions"`。
- post-generation 触发**改用 panel 现成活体机制(E31)**:executeActions 包装层检出 isDirectorBatch 后记录本批生成节点 id(generationNodeIdsFromResult,:2453-2460);借 `graphStore.subscribe`(:3288-3293,执行结果落地后已激活)在 store 变更时用 `mapCanvasGenerationState`(:2462-2476,取数天然双形状)判定该批是否全部终态(completed/failed/cancelled/retryable),**首次全终态时 debounce 5s 重导** `phase:"post-generation"`,超时上限 10min 防永挂。
- bridge 的 onTerminal 构造参数**可选保留为辅助信号**(同步完成场景),注入链:autoload createCanvasSkillsRuntime(:213)→ runtime.js → createGenerationTaskBridge(:89,单 options 对象);bridge 先于 panel controller 创建(autoload :323 vs :348),回调需后期绑定(薄回调读共享可变引用,panel init 时绑真逻辑);默认 no-op 不破 13 处既有测试构造。**不得作为唯一触发源**。
- `:4910` 的 `.catch(()=>{})` 改为把失败写进执行抽屉 warning(铁律 1),仍不阻塞。

### 测试计划
1. RED:平铺形状用例——`{id, type:"ai-image", prompt:"x", imageUrl:"/output/gen_x.png", jobStatus:"success", data:null}` 断言导出含 prompt、generationStatus="completed"(归一)、outputs[0].url 为绝对 URL(assetBaseUrl 拼接);file:// 与盘符用例断言被滤。
2. 订阅路径单测:本批终态判定、去抖、10min 上限。
3. 双侧 golden(铁律 7/8,机制落地):新增 `tools/generate_canvas_dailies_golden.mjs`,复用 `directorCanvasDailies.test.js:32` 的 landGoldenPlanOnCanvas(真实执行器 + qmai-director-export.golden.json),模拟终态(顶层写 imageUrl)后产出 v2 fixture,写入 QMAI `src/lib/director/__fixtures__/canvas-dailies.golden.json`(QMAI 仓路径作脚本参数);顺序:先重生成 golden 令 QMAI import spec 红,再改 QMAI 接受 v2;v1 兼容用例用旧 golden 副本钉住。
4. 真机(8777,V0 已修):真实生成完成后抓 `/director/dailies` 请求体,断言 outputs.url 与 prompt 在场(promptId 对账断言待 V5)。

---

## 切片 V5:血统受信写入策略 trustedSources(1-2 天)

### 目标
导演血统字段(qmaiPromptId/continuityAnchors/negativePrompt 等)在 ai-image/ai-text/ai-video 创建跳活下来(E15/E16),且只有导演来源可写(铁律 4)。

### 命名与契约定位(经审查修正)
本切片**不是新的线上 schema**(无 schemaVersion 出境)——它是对既有 `qmai-director-export/v1 → 节点 → canvas-dailies` 链路的字段级写入策略。CONTRACTS.md 不动登记表行,在不变量 7 下追加一句登记该策略与字段清单(铁律 8)。

### 机制设计:调用点代码传参,绝不读 metadata.source
- **反例先行(E27/E28)**:导演动作虽已带 `metadata.source:"qmai_director_brain"` 信封(directorBrainService.js:58),但 claw 的 `_safe_metadata` 内联白名单含 `"source"`(claw_action_schema.py:600)——**PI 路径的 LLM 动作可携带伪造的 metadata.source 存活**。受信判定因此禁止读动作上的任何字段。
- 受信通道 = 执行入口的 options 参数,由代码在调用点决定:
  - `applyDirectorPlanCommand` 的 executeActions 调用(及导演确认/队列恢复路径,appAssistantPanel.js:4924-4933 的 director 分支)传 `source: "qmai-director"`;
  - PI chat 路径不传(undefined);
  - 注意 :4902 的 `qmai-` 前缀判定(isDirectorBatch)只用于 dailies 上行,**不得用于受信判定**(LLM 同样能编 qmai- 前缀 id)。
- 传递链:panel 调用点 → `canvasSkillsRuntime.executeActions({actions, agentMode, videoAuthorized, source})` 与 legacy `executeAssistantActions(graphStore, actions, {..., source})` → executor 的 createDraft/updateDraft → `mapAssistantNodeParameters({..., source})` → `validateNodeParameters({nodeType, action, modelRegistry, source})`(现签名 :168,加可选参默认 undefined 零行为变化)。
- schema 字段属性 `trustedSources: ["qmai-director"]`:字段带该属性时仅 source 匹配才接受,否则维持现状拒绝语义(unknown/PLANNED 不变)。

### 改动点
1. `canvasSkills/schemas/field.js`:createField 支持 trustedSources。
2. `schemaValidator.js`:`:192-196`(unknown)与 `:198-202`(PLANNED)拒绝分支前插受信判定。
3. 字段登记(`imageNode.schema.js`/`videoNode.schema.js`/`textNode.schema.js` 按需):`qmaiPromptId/qmaiShotId/continuityAnchors/dramaticBeat/shotContinuity` 新建 field(trustedSources + agentWritable:false);`negativePrompt` 维持 PLANNED + agentWritable:false,追加 trustedSources(生成端消费在第三周,本切片只保证落地与日报可见——明示边界)。
4. source 透传:`assistantCanvasSkillExecutor.js`、`assistantActionExecutor.js`(:1188-1197 现签名兼容)、`canvasSkills/runtime.js`、panel 两个调用点。
5. **python 侧改动位置(经审查修正)**:血统字段在 create_node 的 **data 内**,登记进 `claw_action_schema.py` 的 **`_safe_metadata` data 键白名单**(:574-608 的 WORKFLOW_METADATA_FIELDS 或内联集合)——**不是** `_sanitize_action` 顶层元组(:672-780,placement 先例只适用动作级字段)。python 改动,8777 重启。
6. 顺手修信封噪音:executor 的 META_FIELDS(schemaValidator.js:18-38)补 `metadata/riskLevel/requiresConfirmation` 三个信封键——导演动作经 envelopeAssistantActions 披挂它们(E28),现状每个导演 create 产生 3 条 unknown 噪音告警(与 placement/name/title 同性质,4eade745 先例)。

### 测试计划
1. RED golden:导演动作(带全部血统字段)经真实 skills 路径 + `source:"qmai-director"` 落地 → 节点(顶层平铺)含全部血统键 + negativePrompt。
2. 对抗用例:同动作 source=undefined → 血统字段全拒、警告在场;**伪造用例:动作自带 metadata.source="qmai_director_brain" 且 source=undefined → 仍全拒**(钉死 E27 反例)。
3. 跨语言契约测试照 canvasSpatialContract.test.js 先例,**钉 `_safe_metadata` 的 data 白名单**(不是顶层元组)。
4. 真机(8777,重启后):导演批次落地,探针读节点顶层 qmaiPromptId/continuityAnchors/negativePrompt 在场;dailies(V4)对上 promptId。

---

## 切片 V6:QMAI 知识导入区 UI(2-3 天,QMAI 侧)

### 目标
打通"投喂文档→知识卡"产品断头(E20;PRD 762-765 已规划)。

### 范围
v1 支持 `.md/.txt`。PDF 文本抽取后端**已现成**(pdfium:src-tauri/Cargo.toml:29,`preprocessFile` → Tauri preprocess_file,fs.rs:94,147)——为控制切片体积移出 v1,后续把读入从 readFile 换 preprocessFile 即接通(成本约一行分支)。

### 改动点(全部 QMAI)
1. `src/lib/director/director-knowledge-ingest-view-state.ts`(新,纯函数 view-state,照 director-knowledge-view-state.ts 模式):状态机 `idle → reading → extracting → preview → ingesting → done|error`;preview 态持有 `{draft, accepted}[]`。
2. `director-knowledge-view.tsx` 顶部导入区:
   - 文件选择:**动态 import('@tauri-apps/plugin-dialog') 的 `open({multiple:true, filters:[{name:'文档', extensions:['md','txt']}]})`**(照 source-sidebar.tsx:169-202 先例;依赖已装 package.json:30/Cargo.toml:27),非 Tauri 环境以 isTauri() 守卫并提示仅桌面端;选中路径用 `@/commands/fs` 的 readFile 读文本(fs.ts:12-17,**它没有对话框能力,只按路径读**);
   - 抽卡:`extractKnowledgeCardsWithLlm(source, deps)`(knowledge-llm-extract.ts:57;**source={fileName, text, pageHint?},deps.chat 为 DirectorLlmChat 函数,不是 LlmConfig**)。chat 由 `createStreamChatDirectorChat(useWikiStore.getState().llmConfig)` 构造(director-llm-adapter.ts:196),调用前 `hasUsableLlm` 守卫(先例 director-room-view.tsx:190-205);
   - 预览:逐卡 接受/拒绝(展示 principle/whenToUse/引文);引文防伪边界保持(extract 已强制 shortQuote 为原文子串 ≤280 字,UI 不提供引文编辑);
   - 入库:`ingestKnowledgeCards(projectPath, drafts)`(knowledge-ingest.ts:28;projectPath 取 `useWikiStore((s)=>s.project)?.path`,先例 director-knowledge-view.tsx:82-96)。
3. i18n:`src/locales/zh.json`/`en.json` 新键。
4. 入库后触发 V7 入库钩子(或留 TODO 钩子位)。

### 测试计划
1. RED:view-state spec——**extract 从不抛错**(LLM/解析失败内部捕获,返回 `{cards, failures, failure}`,knowledge-llm-extract.ts:62-76):`result.failure` 非空 → error 态带原因;`result.failures` 非空 → preview 态附逐卡失败列表;部分拒绝 → 只入选中卡。
2. 手工验收:真 LLM 配置下投喂一篇影视笔记 md,出卡入库,列表可见。

---

## 切片 V7:卡片互联——骑现成引擎(2-3 天,QMAI 侧)

### 目标
"LLM-wiki 式互联"落地:卡片语义边 + 语义检索 + 入库冲突检测(E21-E23),替换大脑 slice(0,3) 盲切(E22)。

### 架构决策(经审查修正)
**不经 searchWiki**——它只在调用时实地遍历磁盘 `<project>/wiki/**.md`(search.ts:259-268),无"喂内存对象"入口,且 vector-only 物化目录白名单写死(search.ts:322)。直接骑 embedding.ts 页级 API:

1. `src/lib/director/knowledge-wiki-adapter.ts`(新):
   - `indexKnowledgeCards(projectPath, cards, cfg)`:逐卡 `embedPage(projectPath, pageId, title, content, cfg)`(embedding.ts:345-351);pageId 用 `kcard-<id>` 前缀防与 wiki 页 slug 撞名;content = principle+productionRule+promptImplication+whenToUse 拼文本;
   - `searchKnowledgeCards(projectPath, query, limit)`:`searchByEmbedding(projectPath, query, cfg, topK)`(embedding.ts:467-472,返回 PageSearchResult{id,score})过滤 kcard- 前缀按 score 排序;
   - cfg 取 `useWikiStore.getState().embeddingConfig`,以 `cfg.enabled && cfg.model` 为开关(先例 search.ts:294-297),关/失败回退字符串打分(view-state 黄条"语义检索未启用",降级可见);
   - 卡删除时 `removePageEmbedding`(embedding.ts:530);**embedAllPages 只遍历 wiki/*.md 不会替卡重建索引(embedding.ts:398-427),adapter 自带重建入口**。
2. 互联字段:`knowledge-card.ts` 增**可选** `relatedCardIds?: string[]`(validateKnowledgeCard 对未知字段宽容、逐字段校验无键白名单,knowledge-card.ts:79-137,旧卡缺省合法);入库钩子用 embedding 相似度 top3(阈值过滤)回填双向边;view 渲染关联链接;export 整卡 spread 自动携带(director-export.ts:68),幻映 loader 不拒(:214-219 只验 id/title)。**命名地雷**:卡片新字段名须避开幻映 sanitizer 敏感键模式(api/key/path/token/secret 等子串,sensitiveDataRules.js:6-7),否则过桥被静默剥;relatedCardIds/conflictsWith 已核安全。
3. 冲突检测(经审查修正——**dedup.ts 只判"同物异名",不判矛盾**,其 DETECTOR_SYSTEM_PROMPT 写死判重语义 dedup.ts:171-198):新建 `detectConflictingCards`(放 adapter 或新 knowledge-conflict.ts),复用 `DedupLlmCall` 类型(dedup.ts:100-104)与生产接线先例 `buildDedupLlmCall(llmConfig)`(dedup-runner.ts:29),自写冲突检测 prompt(新卡 + 同 craftDomain 旧卡的 principle/productionRule → 互斥对 JSON),解析照 parseDetectorResponse 容错模式(dedup.ts:250 起)。疑似矛盾 → 标 `conflictsWith` + UI 黄条,**人裁决不自动删卡**(铁律 5)。dedup.ts 本体可另作可选"入库判重"(卡投影成 EntitySummary{slug:id, type:'knowledge-card', title, description:principle, tags:[craftDomain]})。
4. 大脑选卡(经审查修正——**slice(0,3) 在同步纯函数内**,director-room-view-state.ts:102):字符串打分路径保持同步、原位替换 :119;语义检索路径在上游(director-room-view.tsx 加载 projectData 处,异步环境现成)预先算 relevantCardIds 注入 DirectorRoomProjectData,view-state 优先消费注入、缺省回退同步打分——避免把同步纯函数改 async 波及全部调用方与 spec。回退打分算法与幻映 V3 ranker 共享测试向量(V3 测试 1)。
5. 字段收齐(经审查修正——**丢字段有两处**):`director-llm-adapter.ts:19` 类型收齐 {id, principle, productionRule?, whenToUse, promptImplication},prompt 拼装段(**:78-81**)渲染;**同时改调用方 director-room-view-state.ts:184-186 的映射**(字段实际被剥的位置),把 whenToUse/promptImplication 带入。

### 测试计划
1. RED:adapter spec(kcard- 前缀索引/检索命中/开关回退);selectRelevantCards spec("雨夜构图"命中 cinematography 卡而非目录序第一张),消费共享测试向量。
2. 互联回填 spec:3 张相近卡,relatedCardIds 双向且不含自身。
3. 冲突 spec:互斥 productionRule 卡 → conflictsWith + 不自动删。
4. 兼容:无 relatedCardIds 旧卡过 validateKnowledgeCard;含新字段的信封过幻映 loader(golden)。

---

## 切片 V8:思考/编译产品分层(1 周内,双侧)

### 目标
refresh 后台化 + 前端触发入口(E18 零调用方)+ 新鲜度标记 + 思考过程可见(E19)。依赖 V0。

### 改动点

**(a) refresh 后台化**(`services/director_bridge_service.py` + 路由)
- `refresh()` 改 `subprocess.Popen` + 实例属性 job 表 `{jobId: {status, startedAt, progress[], result?}}`。
- **job 表必须配 `threading.Lock`,查重与新建在同一锁临界区**(服务是 ThreadingTCPServer 多线程,server.py:133,每请求一线程;照抄 smart_clip 先例:server.py:208-209 `_smart_clip_jobs` + `_smart_clip_lock`、http_route_dispatcher.py:244 加锁读)。多线程同时保证 status 轮询不被运行中子进程阻塞。
- 路由:POST `/director/refresh` 立即返回 `{jobId}`(重复 POST 返回现有 running jobId,防并发烧钱);新增 GET `/director/refresh/status?jobId=`(route service 层 GET+query 先例:_handle_metrics_get :431-443 / _conversation_query 用 urlsplit+parse_qs);**dispatcher 白名单登记该 GET 路径**(E25;refresh POST 已在 V0 补登)。
- Popen 实现要点(经审查补全):spawn 后**立即写 payload 并关 stdin**(headless 对 stdin 只等 1.5s,director-headless.ts:147-155);**起两个守护读线程分别排空 stdout 与 stderr**——stdout 留存全文、结束取末行 JSON(沿用 :87 语义;vite-node 在 stdout 有 banner 噪音,director_bridge_service_test.py:71 实锤),stderr 逐行尝试解析 ndjson 进 job.progress、非 JSON 行(vite-node 告警)跳过;只读单管道会因另一管道缓冲填满死锁;超时由看门狗 kill(Popen 无内建 timeout,300s 预算沿用 :39-41)。

**(b) headless 进度下行**(QMAI `scripts/director-headless.ts`)
- 给 `runDirectorLlmPipeline` 传 onProgress(钩子现成 pipeline.ts:137)。**真实回调形状是单个阶段字符串**,四阶段:`tacit-card`(导演判断卡)→ `storyboard`(分镜)→ `prompts`(提示词编译)→ `continuity`(连续性门)(调用点 :172/:179/:189/:195,无消息体无百分比);headless 把每个 phase 映射为一行 ndjson 写 **stderr**(stdout 维持"末行单 JSON 结果"契约);"读记忆/装资产"进度不经 onProgress,由 headless main() 在调管线前自行写 stderr 行(:173-207)。

**(c) 新鲜度**(runner + 面板)
- plan 响应增 `artifactsGeneratedAt` = 三工件中**从磁盘读到的**文件 fs.stat mtime 最大值;工件来自 payload 内联(:113-117 的 `storyboard || readOptionalJson(...)` 形态,测试常用)或磁盘全缺时字段省略。已核实新增顶层键不破 directorPlanRunner.test.js(全逐键断言)与面板消费(recordAssistantExecutionFromResponse :3197 只读已知键)。
- 面板 director_plan 消息渲染"基于 N 分钟前的导演判断",>30min 加陈旧徽标。

**(d) 前端入口**(panel + `api/canvasAgentApi.js:259`)
- 导演消息卡/抽屉加"刷新导演判断"按钮 → `api.directorRefresh()`(现 POST 形状即可用)→ 轮询 status(2s 间隔,5min 超时)。**面板现无 HTTP 轮询助手,需新写 async sleep-loop**(风格参照 waitWithScheduler :439 可注入 scheduler;循环写法参照 generationTaskBridge.js:94-152;服务端整体先例是 smart_clip)。进度行渲染 job.progress 尾行。
- 完成 → drawer 卡"导演判断已更新,点击重排" → 重发上次 `导演:` plan(面板已持有 state.lastUserMessage/lastDirectorFlowId,:3143,:3164-3166)。

### 测试计划
1. RED python 单测:job 表生命周期、锁临界区并发去重、status 端点形状、dispatcher GET 白名单。
2. **存量迁移**:director_bridge_service_test.py:66-95 两个同步 refresh 用例改写为异步 job 语义(POST 得 jobId → status 终态);canvas_agent_route_service_test.py:927-952 改断言 {jobId} 形状。实现上 refresh 新增独立注入点(如 `process_spawner=subprocess.Popen`),`command_runner` 保持只服务 plan(),互不打架。
3. runner:artifactsGeneratedAt 磁盘/内联/缺失三态。
4. headless spec(QMAI):四阶段 ndjson 进 stderr、stdout 末行 JSON 不变(契约钉死)。
5. 真机(**8777,重启后**;需 HY_QMAI_HEADLESS_CMD):点刷新,进度行更新,完成重排,plan 显示新鲜度。

---

## 全局验收(V0-V8 完成后)

1. 全量回归:幻映 node --test(assistant+app+directorBrain)、python unittest、QMAI vitest 全绿。
2. 真机端到端(**8777,重启加载全部 python 改动**):投喂 md → 出卡 → 互联可见(V6/V7);PI 日常消息含 qmai 卡(V3);`导演:` unverified 计划零生成(V1)、节点带血统(V5);真实生成完成 → dailies v2 含 prompt+outputs+promptId(V4);刷新导演判断 → 进度可见 → 重排带新鲜度(V8)。
3. 审计基线复测——重跑 4 个真机探针并断言反转:
   - ① 旁路探针(V1):8777 重放 unverified 导演计划,preview_network 断言零生成请求(原审计:create 落地即自动开火);
   - ② 眼睛探针(V4):真实生成完成后抓 /director/dailies 请求体,断言节点含 prompt、qmaiPromptId 与 outputs[].url(原审计:导出只剩 id/type/name 骨架);
   - ③ 血统探针(V5):导演批次落地后经 graphStore 读 ai-image 节点顶层,断言 qmaiPromptId/continuityAnchors/negativePrompt 在场(原审计:skills 跳全部剥除);
   - ④ 投影探针(V3):无导演前缀日常消息,断言请求体 context.knowledge.llmWiki.searchResults 含 citationKind:"qmai" 条目(原审计:导演卡仅存在于导演前缀路径)。

## 明确不做(本批边界)

返工回路 director-rework-package/v1、视觉判官 anchor-verdict/v1、景别→aspectRatio 映射、negativePrompt 生成端消费、trace 归因与卡片演化(第三周,依赖 V4/V5);PDF 解析(V6 裁剪,后端已现成);PI 意图分类路由改造(维持前缀 + V3 注入渐进)。

## 附:评审修订记录(r1→r2)

6 路分区审查(V1+V5 因连续断线由主会话亲核),45 条发现全部吸收,要点:
- **新增 V0**:审查发现现网 dailies/refresh POST 被网关 404(E25)——不是文档错误,是必须先修的产品 bug。
- **V2 范围扩大**:审查发现 QMAI 真实导出信封知识卡恒为空(E26),导出端修复纳入 V2。
- **V3 重写**:投影形状(title 复用/4 新键双侧登记/whenToUse join 字符串)、合并落点(短路语义)、runner 模式机制(stdin 非 argv)、网关白名单、来源作用域副作用。
- **V4 重写**:成片是 `/output/` 相对路径(assetBaseUrl 方案)、bridge 终态钩子在真实异步链不触发(改 graphStore.subscribe)、generationStatus 多键归一、部署顺序钉死、golden 重生成脚本机制。
- **V5 改名+机制修正**:非线上契约;metadata.source 可伪造(E27)故受信只走调用点传参;python 改 _safe_metadata 非顶层元组;顺手修信封字段噪音告警。
- **V7 重写**:searchWiki 无内存喂入口(改 embedPage/searchByEmbedding);dedup 只判重不判矛盾(新建冲突检测);同步纯函数不能原位异步化(上游预计算)。
- **V8 补全**:onProgress 真实四阶段、threading.Lock、双管道排空防死锁、存量测试迁移、无既有轮询模式。
- **横切**:铁律新增 8(契约登记)/9(验收环境);验收探针具体化;V5→V4 软依赖澄清;ranker 共享测试向量。
