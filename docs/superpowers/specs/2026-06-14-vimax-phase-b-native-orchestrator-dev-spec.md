# Phase B 开发文档 v2 · 原生编排器(逐步落画布,可视化可 steer)

> 2026-06-14。前置:Phase A 完成(`integrations/vimax/brain/` 抽脑 venv-free,金标对账门 PASS,commit 6797346f)。
> **v2 = 经 4 路对抗式 review(架构/契约/UX/风险)+ 代码实证修订。** review 结论:架构内核成立(进程内 thread-over-job 模型真实可复用,`assemble_shotplan`/`_select_craft` 复用使最终 shotplan 字节级一致,A3 已钉),但 v1 把三处"接缝"误标为"零改动/扩展/顺手",必须显式化:on-disk `working_dir` 桥、storyboard-script 表状态接线 + 真实列键 + 单一编辑面、渐进落地的信任/并行契约。本 v2 已全部吸收,**可据此落地**。

---

## 0. 目标与非目标(已按 review 修正)

**目标**
1. 原生编排器在 huanying **服务端进程内**(Python,无子进程/venv/langchain)跑 Phase A 脑链,**逐阶段流式**推产出。**逐镜 decompose 必须并行**(外置已 `asyncio.gather`,原生不并行 = A3 实测 369s vs 235s 的退化根因)。
2. 面板**逐步落画布**:story 卡 → 角色卡 → 分镜(进 storyboard-script 真实表)→(机位仅作血统,不入表)。
3. **可 steer**:阶段边界可编辑续跑(拆为 B3a/b/c,**排在 A/B 门之后**,因净新增代码最多+角色身份风险)。
4. 与外置 runner **A/B 并存**:`done.result` 是字节级相同的 `vimax-shotplan/v1`。
5. **新增(原 v1 漏)**:把原生 shotplan 落成 ViMax 兼容的 on-disk `working_dir`,否则成片/定妆跑不通(见 §3/C3)。

**非目标(留 C / 后续)**:退役 venv/桥/经纪人代理;视频(P2.5);novel2movie。

**继承铁律**:画布即真相;成本主权(确认前零花费——**B 全程仅 LLM chat,无 draw,实证 `ImageGeneratorGrsai` 只在 render/portraits 构造**);血统受信(`trustedSources:["vimax-director"]`,source 由 exec id 判定);prep 双盖 `autoStart:false`;**抽元生成提示词不许精简**(A 已逐字搬,B 不改写)。

---

## 0.5 SPIKE-0(开 B2 前的强制前置,GATES B2 排序)

review 实证:v1 的 B2 列键是**虚构的**。开 B2 前必须先钉死三件事 + 写契约测试:

1. **storyboard-script 真实列键(已勘探+实证)**:`STORYBOARD_SCRIPT_COLUMNS` 的 key 是**中文标签**:`镜号/时长/景别/场景/画面描述/角色/角色描述/角色动作/情绪/角色图/参考/图片提示词/视频提示词/对白/音效`(grep 实证均存在)。**正确映射**:`ffDesc→图片提示词`、`motionDesc→视频提示词`、`visualDesc→画面描述`、`audioDesc→对白/音效`(audio_desc 把 `[Speaker]`+`[Sound Effect]` 混在一起,需拆分规则:`[Speaker]`→对白、`[Sound Effect]`→音效)、`idx→镜号`。**`camIdx` 无对应列**(`景别`=景别 wide/close ≠ 机位/运镜;运镜文本在 `motion_desc` 里)→ camIdx **不入表**,仅留 prep/血统 `vimaxCamIdx`。删掉 v1 §1 的"机位注释"step。
2. **story/角色卡节点类型**:无通用 note 类型;`ai-text` 是生成节点(带 regen 入口 + 成本主权观感,不宜放静态长文)。**用 knowledge-card 路径**(comment/source-text + `workflowKind:'knowledge_card'`)——专为静态展示,不自燃,已有 dock/tidy 处理。story + 定妆前角色 bio 都用它,显式 `action.size`(2000 字故事需可滚动尺寸)。角色卡血统沿用 `assetRole='character'`(M14)。
3. **step payload 键大小写**:brain 出 **snake**(`ff_desc/motion_desc/cam_idx`),`assemble_shotplan` 仅在末端转 camel。step 事件按 **snake** 发;B2 mapper 要么 B1 在 step 事件里逐 shot camel 归一,要么 mapper 双读(`_get(sd,'ff_desc','ffDesc')` 已有先例)。**定:step 发 snake,B2 mapper 双读**。
- **契约测试**:`import STORYBOARD_SCRIPT_COLUMNS` 断言上述 key 存在(键名回归即红);story 节点类型断言可 inert 创建。

---

## 1. 架构(修订)

```
面板 (JS)                          huanying server (Python 进程内)
  导演:/成片: ─ HY_VIMAX_NATIVE on ─▶ POST /api/v2/vimax/native/plan
                                      │ NativeOrchestratorService (B1)
                                      │  worker线程跑 brain(注 sys.path,无副作用导入)
                                      │  ThreadPool 并行 decompose(默认1,B5探后放开)
  applyVimaxNativePlanCommand        │  每阶段 emit {type:step,stage,payload(snake)}
  (净新增 poll 循环,逐 step 落节点)◀┤  done 时落 ViMax working_dir + 返回 shotplan
  exec id 前置注册,每 step 同 id     │
  阶段边界 暂停/续跑(B3,门后)       └─ cooperative cancel(stage/future 边界查 flag)
```

**修订要点(全部来自 review 实证)**:
- **进程内导入有副作用,必须处理**(C4):`import huanying_runner` 会(a)在模块顶层跑 `sys.stdout/stderr.reconfigure(utf-8)` → 进程级污染 server 的 GBK 控制台;(b)`from huanying_runner import` + 它的 `import skills_index` 只在 `integrations/vimax` 在 sys.path 时可解析,**从 repo 根 ImportError**(A3 golden 仅因 cwd=integrations/vimax 而蒙混过关)。**修**:B1 先注入 `sys.path`(抄 `vimax_bridge_service.py:124-132`),并**消除 reconfigure 副作用**——把 `assemble_shotplan`/`_select_craft` 抽进一个**无副作用模块**(如 `integrations/vimax/shotplan_assembly.py`),brain 与 server 都 import 它,不再 import 跑脚本的 `huanying_runner`。加"从 repo 根 cwd 导入"测试防回归。
- **job 模型可复用但 `_run_job` 要重写**(m2):`_jobs`+`_lock`+2s 轮询形态复用;但 `_run_job` 深耦合子进程(stdin/drain/wait/result.json),要重写为线程跑 brain。**cancel 语义降级**:线程不可 kill → **协作式取消**(per-job flag,在 stage 与 decompose future 边界查;不启新 future,在飞的 chat 跑完,最坏 = chat timeout 180s)。文档明示"原生 cancel 是 best-effort/stage-bounded"。
- **流式 step 是净新增 plumbing,非"扩展"**(m1):存储侧 OK(`drain` 把非 output 事件整 dict 入 `progress[]`,`job_status` 返回 `progress[since:]`);但现面板 poll 只读 `progress[].phase` 当字符串、完成时一次性映射 shotplan。**B2 要写新 poll 循环** `applyVimaxNativePlanCommand`,逐 step 派发给 mapper;step 走分页 `progress[]` 则每轮按 `progressTotal` 推 `since` 并容忍重投。
- **成本主权**:B 仅 chat;draw 只在 render/portraits(实证 `ImageGeneratorGrsai` 不在 brain 构造)→ B 不可能触发出图花费。

---

## 2. 模块分解(修订:并行入 B1;working_dir 桥入 B-scope;B3 拆分后置)

### B1 · NativeOrchestratorService + 并行 brain + working_dir 桥
- **新** `services/vimax_native_orchestrator.py`:`plan(payload)`→起 worker 线程跑脑链,返 `{jobId}`;`job_status` 复用 bridge 形态;**协作式 cancel**。
- **sys.path 注入 + 无副作用装配模块**(C4):新 `integrations/vimax/shotplan_assembly.py` 持 `assemble_shotplan`+`_select_craft`(从 huanying_runner 抽出,无 stdout reconfigure);brain.planner 改 import 它;huanying_runner 仍可 re-export 兼容外置。
- **并行 decompose 进 B1(非 B5)**(M1):`brain/planner.py` 加 `plan_scene` 的 `ThreadPoolExecutor` 并行;**默认 max_workers=1**(退化串行,可单测;>1 等 B5 真机 429 探针定上限)。**保序**:并行 future 完成乱序,但 `assemble_shotplan` 按迭代序赋 `global_idx`→收集后按 shot idx 重排再装配(防 idx/localIdx 错乱)。
- **chat_client 加 429 退避**(m3):`brain/chat_client.py` 加有界重试(并行前置风险,不能拖到 B5)。
- **working_dir 桥(原 v1 漏,C3 blocker)**:plan 完成落 ViMax 兼容磁盘布局——`working_dir/shotplan.json` + 每场 `scene_{sceneIdx}/shots/{localIdx}/shot_description.json`(snake 形,从 decompose dict 落,**在 camel 化之前**)+ `characters.json`(render/portraits 读)。否则 `run_render` 硬失败("shotplan.json missing"),且 `merge_shot_edits` 文件缺失时**静默 continue 丢掉用户编辑**。
- **路由**(m4):`/api/v2/vimax/native/plan` **原样**加入 `_VIMAX_POST_PATHS`(精确全路径匹配)+ `VimaxRouteService.handle_post` 加分支 + dispatcher 白名单测试用例。
- **测试**:job 生命周期/协作 cancel/凭据缺失;**从 repo 根 cwd 导入不 ImportError**;并行 decompose 用**线程安全、按 visual_desc 键选 reply 的 fake**(不能用顺序相关的 QueueClient)+ 断言保序;working_dir 落盘布局断言。
- **真机**:`/native/plan`→job done→合法 shotplan(对账 A3 基线)+ **working_dir 落盘存在**。

### B2 · 步骤→画布增量映射(真实列键 + 表状态接线 + 单一编辑面)
- **新** `modules/assistant/vimaxNativeStepMapper.js`:`mapStoryStep`(knowledge-card,显式 size)/`mapCharactersStep`(角色 bio knowledge-card,`assetRole='character'`)/`mapSceneStep`。
- **分镜进真实表**(C1+C2):`mapSceneStep` 产出**一个 storyboard-script 节点**,但 data 必须是 `node.storyboardScript = createDefaultStoryboardScriptState({rows})`(`src/core/storyboardScriptFactory.js`)——因为 `nodeTypeDefaults` 对 storyboard-script 只 `{...data}` 透传,直接写 `data.rows` **渲染成空表**。需教 create 路径(nodeTypeDefaults 或专用 handler)对 `nodeType==='storyboard-script'` 跑 state builder。rows 用真实中文键(SPIKE-0)。
- **单一编辑面**(C5):render 只读 prep 的 `prompt`→ffDesc。所以 rows 的 `图片提示词` **渲染为只读**(prep 仍是权威编辑面 + 渲染靶,M11 零改);或新写"rows→prep 同步"收集器。**定:rows 只读展示,prep 权威**。契约测试:编辑 prep→collectVimaxEdits→render 收到编辑值。
- **渐进落地的信任**(C6):**exec id 前置注册**(第一个 step 落地前注册进 `state.vimaxExecutionIds`),每个 per-step `create_node` 关联同一 exec id,走 executeActions 受信路径,否则血统字段被当不可信剥除。**storyboard-script 入血统契约**:schema 字段 + claw `_safe_metadata` 白名单 + `vimaxLineageContract.test.js` 节点类型列表(否则其 vimax 盖戳无保护/无测)。
- **tidy 不抖动**(m6):per-step tidy 用 `scope:'cluster:<sceneNodeId>'`(非 `'all'`),或只在 done 时 tidy 一次;storyboard-script 实际 1024×576 跨多格(格 416×316),需给它多格占位或画布上保留小卡、rows 放侧栏。抖动测试:落 scene0→snapshot→落 scene1→断言 scene0 位置不变。
- **net-new poll**(m1):`applyVimaxNativePlanCommand` 读 typed step 事件派发 mapper。
- **测试**:每 mapStep golden round-trip(**喂真实 snake brain 输出**,断言 `图片提示词/视频提示词` 单元非空——即真渲染,非仅 data 带字段);血统字段在白名单;真机 8779 浏览器看逐步出现 + **分镜表非空渲染**(preview snapshot,空表则红)。

### B4 · A/B 对账门(canvas 结构比较器,先于 B3 当首个可发布切片)
- **新 JS 比较器**(M5,A3 只比 shotplan JSON,看不到画布):同一 shotplan 跑**旧 mapper(外置 shotplan→vimaxCanvasActions)vs 新 B2 mapper(native step→rows)**,断言动作结构等价(节点数/rows 键覆盖/每镜 prep 在/血统⊆白名单)。shotplan 级等价**继承 A3,不重打**。
- 开关 `HY_VIMAX_NATIVE`(默认 0,复用 M7 status 下行)。
- **门**:native 画布产出与外置结构等价 + **native 导演:→改 prep→确认成片 渲染的是编辑后 prompt**(证 working_dir 桥+merge_shot_edits 找到文件)+ 全回归绿。
- **首个可发布 A/B 切片 = B1+B2+working_dir 桥**(steer 后置)。

### B3 · 可 steer(拆 a/b/c,排在 B4 门之后)
- **B3a**:把进程内编排器**分段为可暂停 stage** + job 表加 suspend/resume token(纯,fake client 可测)。
- **B3b**:**新编辑收集器**(M3:M11 `collectVimaxEdits` 只读 prep prompt,**不收角色/rows**)——`collectVimaxCharacterEdits`(读角色卡 `vimaxCharIdx`→staticFeatures/dynamicFeatures/isVisible)+(若 rows 可编辑)rows 收集器。新字段入血统契约。
- **B3c**:resume 线协议 + "用的是编辑后值"断言。
- **角色身份不变量**(M4):角色 idx = enumerate 位置,render 按位置解析 `characters[cidx]`,`filter_char_idxs` 只查范围不查身份。**铁律**:角色集编辑必须**失效并重算**下游 storyboard+decompose(镜头不可跨角色编辑续用);或以 `identifierInScene` 为稳定身份、render 前按 identifier 重映射 idx。测试:删 character[0]→resume→存活镜头的 `ff_vis_char_idxs` 仍解析到**同一 identifier**(非同一整数)。
- **检查点粒度**(m7):默认**一个**强制 gate(角色后、decompose 循环前——最便宜重做点 + 身份陷阱点)+ 其余被动流式可见;分镜后 gate 设为 opt-in。

### B5 · 并行真机探针 + 性能回填
- 真机探 grsai chat 并发上限(429 退避已在 B1),据此放开 `max_workers`;回填原生耗时(目标 ≤ 外置基线,**并行后**重新基线,非对 369s 串行)。

---

## 3. 契约与数据流(修订)

- **最终 `done.result` 字节级一致**(review 确认 SOLID):`plan_shotplan` 直调 `assemble_shotplan` + `_select_craft`,产出即 F5 mapper 消费的 `vimax-shotplan/v1`,A3 已钉。保留 `done.result→mapVimaxShotplanToCanvasActions` 作 A/B 回退。
- **但"下游零改动"仅对 `done.result` 成立**:render/portraits 是**子进程读 on-disk `working_dir`**(shotplan.json + 每镜 shot_description.json),原生必须落盘(B1 working_dir 桥),否则成片/定妆跑不通——**这是 B blocker,非 C 非目标**。§0 已修。
- **新增流式 step 契约**:仅 plan 阶段增量可视化;snake 键;net-new poll。
- **A/B 开关**复用 M7 status 下行。

---

## 4. 测试与验收

每模块 TDD(RED 先)+ 逐模块对抗 review + 真机。新增硬测:repo-根-cwd 导入;working_dir 落盘布局;分镜表真渲染非空;并行保序;native 改 prep→确认成片用编辑值;B4 canvas 结构比较;steer resume 用编辑后身份。回归 P1–P3 全绿。

---

## 5. 开放问题(经 review 多数已决)

1. ✅ story/角色卡 = **knowledge-card**(comment/source-text + workflowKind),显式 size。
2. ✅ 列键 = **真实中文键**(SPIKE-0,已实证),契约测试钉。
3. ✅ rows vs prep = **rows 只读展示、prep 权威编辑+渲染靶**(M11 零改)。
4. ✅ 检查点 = **一个强制 gate(角色后)** + 被动流式可见;分镜后 opt-in。
5. ⏳ 并行 max_workers 上限 = B5 真机 429 探针定;B1 默认 1。

---

## 6. 风险与缓解(修订)

| 风险 | 缓解 |
|---|---|
| 进程内导入污染 stdout / repo根 ImportError | 抽无副作用装配模块 + sys.path 注入 + repo根导入测试(C4) |
| 分镜写 data.rows 渲染空表 | create 路径跑 createDefaultStoryboardScriptState;真渲染断言(C2) |
| 列键虚构 | SPIKE-0 钉真实中文键 + 契约测试(C1) |
| rows/prep 双编辑面漂移 | rows 只读、prep 权威(C5) |
| 渐进落地剥血统 | exec id 前置 + storyboard-script 入血统契约(C6) |
| 原生比外置慢 | 并行 decompose 入 B1 + 保序(M1) |
| native plan 后成片跑不通/静默丢编辑 | working_dir 桥(C3)+ "改 prep→确认成片用编辑值"真机门 |
| step 键 snake/camel 错配 | step 发 snake + mapper 双读 + 真 snake 输入 round-trip 测(M2) |
| 并行 429 | chat_client 有界退避(B1)+ max_workers 默认 1 直到 B5 探针 |
| tidy 抖动 | per-step cluster-scoped tidy + 抖动测试(m6) |
| 线程不可 kill | 协作式 cancel,stage/future 边界查 flag(m2) |
| steer 角色身份位置漂移 | 角色编辑失效重算下游 / identifier 稳定身份(M4) |

---

## 7. 排期(修订:SPIKE 前置;working_dir 入 B1;B1+B2 首切片;steer 后置)

**SPIKE-0**(列键+节点类型+键大小写,GATES B2)→ **B1**(编排+并行+working_dir 桥+sys.path/stdout 修+路由)→ **B2**(真实键 step 映射+表状态+单编辑面+信任)→ **B4**(A/B canvas 对账门=**首个可发布切片**)→ **B3a/b/c**(steer,门后)→ **B5**(并行探针+性能)。每步 TDD+对抗 review+真机;B4 过门后才考虑 Phase C。
