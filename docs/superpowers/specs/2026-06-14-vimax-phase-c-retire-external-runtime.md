# ViMax Phase C — 成片/定妆 走原生、退外置运行时 — Design

Date: 2026-06-14
Status: 待评审(design review)。本 spec 过 → plan → build → **真机出图验证前单独跟用户确认花钱**。
Branch: feature/codex-work-20260609。配套:B 阶段(plan 已原生)+ `2026-06-14-vimax-brain-extraction-migration-assessment.md`。

## 1. Goal / Non-goals

**Goal**:把 **成片(render)/ 定妆(portraits)** 从"外置 ViMax venv 子进程"切到**进程内原生**(复用 B 阶段 `NativeOrchestratorService` + 抽好的 brain),从而退掉 venv / `vimax_bridge_service` 的 render/portraits 子进程派生 / langchain / 外置 `agents` 包依赖。**最终 plan+render+portraits 全原生,外置仅作回退**。

**Non-goals(本期不做)**:
- **不碰成本主权链**:`vimaxSign`/经纪人 `draw`/cap/refund/ledger/ticket **一字不改**(见 §6,money-critical)。
- 不改结果契约:`vimax-render-result/v1`、`vimax-portraits-result/v1` 不变 → 面板落地/写回 UI 零改。
- 不引入视频(仍关键帧降级,§2.5 既定)。
- **不在本期删外置代码**:外置 render/portraits 路径保留作回退,直到切换稳定(退役在 C5,且留回退开关)。
- **不精简元生成提示词**(铁律):抽 ReferenceImageSelector / CharacterPortraitsGenerator **逐字搬**(像 A1/A2 抽 planning prompts),不"简化成模板"。

## 2. 现状基线(代码事实,来自 understand map wf_a43beb71)

成片/定妆 当前都经**外置子进程**跑 `integrations/vimax/huanying_runner.py`:
- `vimax_bridge_service.py:271-286` Popen 派生 **venv python**(`_venv_python` ~68-70,`HY_VIMAX_HOME/.venv`),`PYTHONUTF8=1`,凭据走 stdin;`:204-218` render/portraits 入口要 ticketId;`:242` working_dir=`vimax_runs/{flowId}`。
- `run_render`(huanying_runner.py:234):读 `shotplan.json` → 逐镜 `ReferenceImageSelector`(选参考图+组提示词)→ `ImageGeneratorGrsai(api_key=ticketId, base_url=brokerUrl)` 出首帧 → 跨镜上一帧续连续性 → `keyframe_judge.generate_with_judge` 重摇控制环 → `merge_shot_edits`/`invalidate_shots` 写回失效 → `result.json`。
- `run_portraits`(:515):`portrait_character_dicts` → `CharacterPortraitsGenerator`(前→侧/背引用前视)经 broker 出三视 → `fanout_portrait_registry`(扇出 flow 根+各 scene 目录)→ `invalidate_portraits` 重摇 → `result.json`。
- **venv-only 依赖(必须抽/换)**:`langchain.chat_models.init_chat_model`(`_build_chat` ~141-148)、`agents.ReferenceImageSelector`(~245)、`agents.CharacterPortraitsGenerator`(~527)、`interfaces.CharacterInScene`(pydantic,~246/326/560);`Script2VideoPipeline` 是 plan 模式(已原生,render 不需)。
- **已可移植(原样复用)**:huanying_runner 纯助手 `merge_shot_edits/invalidate_shots/portrait_character_dicts/portrait_capacity/fanout_portrait_registry/invalidate_portraits`(纯 JSON/文件,无 ViMax import);**整个 `vimax_broker_service.py`**(stdlib);`shotplan_assembly`/`skills_index`;working_dir 桥(B1.3b 已原生持久化)。
- **⚠️ 需端口、不是零改(§13-1/2 校正,原 spec 误标"原样复用")**:
  - `keyframe_judge.py`:现调 `await chat_model.ainvoke(langchain HumanMessage/SystemMessage 多模态)`(judge 需**视觉**)。C1 须**端口**为 `GrsaiChatClient.chat(messages)`(同步)+ 把消息建成 **OpenAI 多模态格式** `content:[{type:"text"},{type:"image_url",image_url:{url:"data:..."}}]` + 用 `extract_json` 解析(替 PydanticOutputParser)。**GrsaiChatClient 无需新增方法**——它把 messages 整个 json-dump 给 grsai `/chat/completions`,content 传数组即原生多模态;grsai vision 真机已证(memory)。在 worker 线程里同步跑,async 退掉。
  - `agents.ReferenceImageSelector`(render 选参考图+组提示词):同理抽为 GrsaiChatClient.chat + OpenAI 多模态 + extract_json,**不用 langchain chain/`|`/ainvoke/PydanticOutputParser**。
  - `image_generator_grsai.py`:`_submit_and_poll` 内 `import requests`(venv-only!)→ C1 改 **stdlib `urllib`**(SSE 消费,镜像经纪人 `_default_grsai_draw` 的 urllib 写法);仍打 `/api/v2/vimax/draw` 带 ticket Bearer(成本链不变)。

## 3. 决策与不变式

- **R-cost(最高铁律)**:成本主权链零改。native render/portraits 仍 `ImageGeneratorGrsai(api_key=ticketId, base_url=brokerUrl)` 打 `/api/v2/vimax/draw`;经纪人 `draw` 的 cap/reserve/refund/ledger(`user/vimax_ledger.json` 唯一写者锁内 tmp+replace)、ticket 全不动;面板 `vimaxSign` 不动。**native 永不碰 ledger**——**机制=架构隔离(§13-3):native orchestrator + brain 模块绝不 `import vimax_broker_service`**;唯一写 ledger/ticket 的是经纪人自己。C1 加**静态导入隔离测试**(断言 `services/vimax_native_orchestrator.py` + `integrations/vimax/brain/*` 的 import 闭包不含 `vimax_broker_service`/不写 `vimax_ledger`/`vimax_tickets`),不靠模糊 grep。
- **R-verbatim**:抽 ReferenceImageSelector/CharacterPortraitsGenerator 的提示词**逐字**(Field 描述/示例齐全),不精简。
- **R-parity**:原生输出须与外置**语义可比**(同 idea/cast 结构等价的关键帧/三视);A3 式金标对账 + M12 式真机(花钱,门控)。
- **R-AB(§13-4 校正:全局开关,非 per-flowId)**:用**全局** `HY_VIMAX_NATIVE` + 面板 `shouldUseNativeVimax`(B2 已有,会话级缓存)决定走 native 还是外置——**这就是现状机制,不另造 per-flowId 基建**。**在途 job 天然安全**:job 活在**启动它的 orchestrator**(native job 在 native orchestrator worker、外置 job 在 bridge 子进程),开关翻转**不迁移在途 job**(无跨路径 resume)。外置路径保留作回退。
- **R-dedup**:native render/portraits 须像 bridge 一样按 `(mode, flowId)` 去重(单实例/flow),且 render 与 portraits 不并行写同一 `result.json`/working_dir。
- **零花费默认**:抽取/原生编排/对账设计阶段全免费;**唯一花钱点 = 真机出图验证(C4),开跑前单独跟用户确认**。

## 4. 架构

`NativeOrchestratorService`(B 阶段进程内 job + worker 线程 + 流式 step)新增 `run_render()` / `run_portraits()`,复用 B 的大脑栈,**砍掉 venv/langchain/外置 agents**:

```
确认成片/定妆(面板,vimaxSign 不变)→ ticketId
  └─ api.vimaxRender/Portraits → (native flag on) → /api/v2/vimax/native/render|portraits
       └─ orchestrator.run_render/run_portraits (worker 线程,进程内)
            ├─ chat = brain.chat_client.GrsaiChatClient(creds, timeout)   # 替 langchain _build_chat
            ├─ image = image_generator_grsai.ImageGeneratorGrsai(api_key=ticketId, base_url=brokerUrl)  # 不变,打 /draw
            ├─ ref/portrait 提示词 = brain/reference_selector.py、brain/portraits.py(逐字抽)
            ├─ 选帧/重摇 = keyframe_judge(注入 chat,既有可移植)
            ├─ cast/shot = working_dir 的 snake JSON(B1.3b 已落)→ dict(替 CharacterInScene pydantic)
            └─ 写回 merge_shot_edits/invalidate_*/fanout_registry(既有纯助手)→ result.json(同格式)
  └─ 经纪人 draw/cap/refund/ledger:完全不变(native 只是 /draw 的另一个调用方)
```

## 5. 组件(精确到文件)

- **抽取(新,brain 子目录,stdlib,逐字提示词)**:
  - `integrations/vimax/brain/reference_selector.py` — 港 `agents.ReferenceImageSelector.select_reference_images_and_generate_prompt`(选参考图+组 text_prompt 的提示词逐字 + 逻辑),签名 `(chat, available_pairs, frame_desc) -> {reference_image_path_and_text_pairs, text_prompt}`。
  - `integrations/vimax/brain/portraits.py` — 港 `agents.CharacterPortraitsGenerator`(前/侧/背三视的提示词逐字 + 引用链:前视无参考、侧/背引用前视),签名以 dict character + style + image_gen。
  - cast/shot 用 dict(不引 pydantic CharacterInScene);需要校验则纯函数。
- **orchestrator(`services/vimax_native_orchestrator.py`)**:加 `run_render(payload)` / `run_portraits(payload)`(worker 线程,流式 step;cancel/TTL/并发同 B;`(mode,flowId)` 去重)。chat 用 GrsaiChatClient(B5 的 timeout/env);image 用 image_generator_grsai 指向 brokerUrl + ticketId。
- **路由/api**:`/api/v2/vimax/native/render`、`/api/v2/vimax/native/portraits`(route_service 委托 + dispatcher 白名单 + `api.vimaxNativeRender/Portraits`)。
- **面板**:`applyVimaxRenderCommand`/`applyVimaxPortraitsRenderCommand` 在 native 配置时把 `api.vimaxRender/Portraits` 切到 native 端点(同 B2 的 `shouldUseNativeVimax` 探针/选路);**确认+预算闸+落地+写回 UI 全不变**(结果契约一致)。
- **不动**:`vimax_broker_service.py`(整个经纪人/成本链)、huanying_runner 纯助手(可整理迁入 brain 但行为不变)、working_dir 桥。(注:`image_generator_grsai.py`/`keyframe_judge.py` 非零改——见 §2 需端口项:requests→urllib、langchain→GrsaiChatClient。)

## 6. 成本主权(money-critical,单列)

- 花钱点 = 经纪人 `draw`(每成功 draw 记一次 spent;失败退款;cap 封顶硬挡)。native 只是换了"谁调 /draw"(进程内 worker 而非 venv 子进程),**调用形态、ticket、cap、ledger 全同**。
- `vimaxSign` 在面板,native 不改:成片 cap=镜数+重摇额度;定妆 cap=角色×3。
- **native 永不写 ledger/ticket**;只读 ticketId 当 Bearer 传给 /draw。经纪人仍是唯一写者(锁内 tmp+replace)。
- **真机验证(C4)花钱**:开跑前**必须单独跟用户确认**(预算、镜数/角色数、预计 draw 次数);默认 dry/不出图直到确认。
- **计费语义澄清(review#4/#5,代码本就正确,spec 写清)**:
  - **重摇**:判官拒一帧 → 重摇 = **一次完整 draw,照计费不退款**(经纪人只对 grsai/上游失败退款,不知道判官裁决)。`generate_with_judge` 的 `retries_remaining` 全局计数耗尽即停,**总 draw = 镜数 + 实际重摇数 ≤ 镜数 + retryBudget**(构造上不超封顶;keyframe_judge_test 已钉)。
  - **定妆三视**:`portrait_capacity = 3 × 角色数` 是按**每视一次成功**算;某视 tenacity 重试(stop_after_attempt 3)若**失败**,经纪人**退款**(失败 draw 不计),所以 cap 仍 sound;成功才计。
  - §10 加契约测试:`generate_single_image` 被调 N 次 → ledger draws=N,`spent ≤ capTotal`(含判官拒/重试场景)。

## 7. A/B 对账 + 验证

- **金标对账门(免费,A3 式)**:`brain/golden_render_compare.py`(纯)—— 同 shotplan 经外置 run_render 与 native run_render 各出一次(真机,门控),比**结构**(出帧数=镜数、registry 引用、result 契约、写回失效行为),自由图像内容不比(模型方差)。或更轻:先比 native run_render 的**动作/调用序**与外置一致(mock image_gen,免费)。
- **M12 式真机(花钱,门控)**:小预算(1-2 镜 / 1 角色)native 真出图,核对 ledger spent=draw 数(精确不超封顶)+ 图落节点 + registry。**开跑前确认**。

## 8. 退役(C5,留回退)

切换稳定后:`vimax_bridge_service` 的 render/portraits 子进程路径、`_venv_python`、langchain `_build_chat`、外置 `agents` 依赖可退;`HY_VIMAX_HOME` 对 render/portraits 不再必需。**保留外置路径作紧急回退**(返回 not-configured 直到切换日;按 flowId 选路,在途不跨路径)。plan 已原生(B),三者全原生后 venv 整体可退。

## 9. 风险

- **图像/判官语义漂移**:抽的 ref/portrait 提示词必须逐字,否则原生出图与外置不同 → 破用户预期+基线。缓解:逐字 + 对账 + M12 双跑。
- **在途切换**:render 跑到一半切码路径 → 按 flowId 选路、不跨路径 resume。
- **ledger 竞争**:native 误写 ledger → 竞争。缓解:经纪人唯一写者,native 绝不碰。
- **result.json 冲突**:render/portraits 并行同 flowId → 覆盖。缓解:native 按 (mode,flowId) 去重(同 bridge)。
- **registry 一致性**:render 在 portraits 写完前读到半 registry。缓解:既有 tmp+replace 原子写 + 顺序(同 flow 不并行)。
- **grsai 凭据**:native 用同一 `user/config.json` 凭据源(同 plan)。
- **grsai 并发慢**(B5 探针):render 逐镜出图本就串行经 broker;native 不引入新并发,沿用 B5 的 timeout/退避。

## 10. 测试

- 抽取保真:reference_selector/portraits 提示词逐字(对外置源 diff)+ 输出 shape 测试(注入假 chat/image)。
- orchestrator run_render/run_portraits:假 image_gen(不真出图)走全链,断言:读 working_dir、调 image_gen 次数=镜数/角色×3、写 result.json 同契约、写回/失效正确、`(mode,flowId)` 去重、cancel/TTL。
- **成本闸不变契约测试**:native render 仍构造 `ImageGeneratorGrsai(api_key=ticketId, base_url=brokerUrl)`、绝不 import/调用 ledger;grep 守 native 不写 `vimax_ledger`/`vimax_tickets`。
- 金标对账门(结构,免费,mock image_gen)。
- 真机(花钱,门控,C4)。

## 11. 分期(给 plan)

- **C1 抽取**:`brain/reference_selector.py` + `brain/portraits.py`(逐字提示词)+ cast/shot dict 化 + **§2 需端口项**(`brain/keyframe_judge.py` langchain→GrsaiChatClient+extract_json、`brain/image_gen.py` requests→urllib)+ **import-isolation 静态测试**(grep/AST 守 brain 不 import `vimax_broker_service`/`vimax_ledger`/`langchain`/`requests`);纯测试。免费。
- **C2 原生 run_render + 路由**:orchestrator.run_render + /native/render + api + 面板选路;假 image_gen 测试。免费。
- **C3 原生 run_portraits + 路由**:同上 portraits。免费。
- **C4 A/B 对账 + 真机**:金标对账门(免费)+ **真机出图验证(花钱,先跟用户确认)**。
- **C5 退役**:退 venv/桥子进程/langchain/外置 agents/HY_VIMAX_HOME(render/portraits);留回退开关。

## 12. 验收

- AC1 native render 出关键帧、写回/失效、result 契约 = 外置(结构对账过)。
- AC2 native portraits 出三视 + registry 扇出 = 外置。
- AC3 **成本链零改**:sign/draw/cap/refund/ledger 不变;native 不写 ledger(grep+契约测试)。
- AC4 A/B 按 flowId 选路;外置回退可用。
- AC5 真机:ledger spent=draw 数,不超封顶(C4,门控)。
- AC6 plan+render+portraits 全原生后 venv 可退(C5)。

## 13. Review 收口(默会知识自审,5 findings)

1. **[严重·extraction-completeness] keyframe_judge / ReferenceImageSelector 非"原样复用"** —
   原 spec §2 把它们列入"原样复用",但二者实际依赖 `langchain` `ainvoke` + 多模态(图入 prompt)+ PydanticOutputParser。**修**:§2 移入"⚠️需端口"——判官改 `GrsaiChatClient.chat` + OpenAI content 数组(`[{type:"text"},{type:"image_url",image_url:{url:"data:..."}}]`)+ `extract_json`;选图器同。C1 纳入端口工作。
2. **[严重·extraction] image_generator_grsai 用 `requests`** — brain 须 venv-free 纯 stdlib。**修**:§2 标 requests→urllib;C1 端口;import-isolation 静态测试守 brain 不 import requests/langchain。
3. **[严重·R-cost] ledger 隔离只靠约定不够** — 原 spec 只说"native 不写 ledger"。**修**:§3/§10/AC3 加架构隔离——native/brain **永不 import `vimax_broker_service`**,只持 ticketId 当 Bearer;C1 加静态 import-isolation 测试(非仅运行时 grep)。
4. **[次·R-AB] A/B 选路粒度** — 原 spec 暗示 per-flowId,实际是全局 `HY_VIMAX_NATIVE` + `shouldUseNativeVimax`。**修**:§3 R-AB 改为全局开关;in-flight job 由 orchestrator 自持(切换不影响在跑任务)。
5. **[次·计费语义,代码本正确] 重摇/定妆退款** — 判官拒帧的重摇是一次照计费的完整 draw(经纪人不知裁决,不退);定妆某视失败 draw 由经纪人退款,故 `3×角色` cap 仍 sound。**修**:§6 写清两条计费语义 + §10 加 `spent ≤ capTotal` 契约测试(含判官拒/重试场景)。
