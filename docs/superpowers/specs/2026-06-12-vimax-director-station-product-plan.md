# 幻映·导演台 α′ 完整产品方案(ViMax 单脑版)

日期:2026-06-12(r2:2026-06-13)
状态:已评审(r2)——初稿经 5 路分区审查(对照幻映+ViMax 两仓真实代码逐锚点核验,10 blocker / 31 major / 15 minor 全部吸收)
范围:幻映(本仓库)+ ViMax(`D:\Aic\ViMax`,vendored 钉 commit `df8b206`)
前置实证:四轮代码审计 + γ 验证(2026-06-12,ViMax 在 grsai 通道真实跑通:规划/定妆/参考图一致性成立,产物在 `D:\Aic\ViMax\.working_dir\gamma\run{1,2}`)

---

## 0. 裁决与原则

### 0.1 架构裁决(α′)

**两个运行时,一个导演大脑**:

```
幻映(浏览器画布 + PI sidecar + python 服务)  ←桥→  ViMax(外置 HY_VIMAX_HOME,唯一导演大脑)
```

- **PI** = 嘴和手:对话→画布动作(现状不动),不再承担"导演思考"叙事。
- **ViMax** = 导演职能:编剧/分镜/机位/定妆/渲染编排;49 套 skills 直接注入它的提示词。**注意:VLM 判官不是 ViMax 现成能力**——`agents/best_image_selector.py` 在其渲染链路零调用(仅定义),判官选帧/自动重摇是 P3 新开发(挂接在 runner 帧产出后:judge→不合格则删 frame png+selector_output 重入渲染,计入重试额度)。
- **记忆 v1 = 项目文件夹**(非应用):`characters.json / style.md / lessons.md`,桥读入 ViMax 输入。
- **QMAI 整体休眠**:运行时调用全部下线(flag 控制,机制见 §2.4),代码与测试保留不删;它继续作为用户的独立小说应用存在,与本产品打包无关。

### 0.2 铁律(α′ r2)

1. **画布即真相**:ViMax 的一切产物(分镜/定妆/关键帧/成片)必须落画布节点,可删、可改、可溯源。
2. **成本主权**:一切图像/视频生成必须持票经经纪人(计费+封顶)。成片=预算单签字;**定妆=定妆快签**(角色数×3 视×单价一行内联确认,小额票);plan 纯 LLM 免签但花费经终态信封自报入账。无票寸步难行。
3. **血统由代码判定**:vimax 血统(vimaxFlowId/vimaxShotIdx/vimaxCamIdx/skillRefs)由桥与映射器代码写入(trustedSources 机制,V5 已建),LLM 不能自报。
4. **prep 永不自燃**:所有规划落地的生成类节点双盖 `autoStart:false`(V1 已建)。
5. **包体不膨胀**:本版本进包新增 = 幻映侧源码(KB 级)+ skills(经 private-defaults 机制 ~1.2MB+封面 ~1.25MB,见 §2.2)+ 装机脚本;ViMax+venv 外置 `HY_VIMAX_HOME`;QMAI 不在包内。
6. **休眠不删**:QMAI 桥/intent/dailies/knowledge-projection 代码与测试保留并继续过 CI;入口由 `HY_DIRECTOR_LEGACY_QMAI`(默认 0)控制,机制与完整入口清单见 §2.4;CONTRACTS.md 标注 "dormant since α′"。
7. **每切片 RED 先行,绿后提交;跨进程契约 golden 由真实 ViMax 产物生成**(γ 的 report.json 即先例,禁手写 fixture)。
8. **Windows 工程实情**(γ 实测):桥 spawn ViMax 必须 `env={**os.environ,'PYTHONUTF8':'1'}`(V8 的 Popen 原本无 env 注入,须新增),且 runner 顶部 `sys.stdout/stderr.reconfigure(encoding='utf-8')`——**quiet=True 只对 plan 段有效**,ViMax 渲染段约 30 处裸 emoji print 不受 quiet 控制,UTF-8 强制是唯一硬保障;grsai 高峰 gpt-5.5 过载→模型降级链(`gemini-3.1-pro` 兜底);单图 50–75s→进度面是刚需。

### 0.3 证据锚点速查(r2 修订)

| # | 事实 | 锚点 |
|---|---|---|
| G1 | plan/渲染天然分离,docstring 自述"为用户审查而暂停" | ViMax `script2video_pipeline.py:85-90` |
| G2 | 外部角色注入:`plan_text_artifacts(characters=...)`(:76-84,**不收注册表**);定妆注册表注入:`Script2VideoPipeline.__call__(characters=..., character_portraits_registry=...)`(:149-157;idea2video:235-242 是调用现场) | ViMax 源码 |
| G3 | 双刃断点续跑:plan 四阶段"文件存在即加载"(characters.json:580-584/storyboard.json:702-706/shots/\<idx\>/shot_description.json:750-753/camera_tree.json:555-560,pydantic model_validate 重建,事件表同建)→ **render-only=同 working_dir 直接调 __call__,零重算**;但渲染段同样跳过(first_frame.png:291/*_selector_output.json:358,510/video.mp4:455/final_video.mp4:260)→ **编辑/重拍必须删派生产物,否则 no-op** | ViMax 源码 + γ 实跑 |
| G4 | grsai 适配器实跑通过;`urls` 参考图字段有效;**path→url 注册表是进程内存**(:21-46),查不到仅 warning 后静默丢参考图(:67-73);fmt="pil" 的机位图永远无 URL(camera_image_generator.py:199,207) | ViMax `tools/image_generator_grsai.py` |
| G5 | γ 实测:定妆前/侧一致性成立;分镜提示词专业级;跨镜服装逐字一致 | `.working_dir/gamma/run{1,2}/report.json` |
| G6 | γ 实测:单轮全程(故事/角色/定妆前+侧 **2 图**/剧本/3 镜规划)428.3–801.2s(report.json elapsed_sec;**4 图为两轮合计**);"单图 50-75s"为当时控制台观察、未持久化——P1 起 runner 把每次 draw 耗时写进产物,P2 起经纪人 ledger 落账,使其成为可复验口径 | γ 产物 |
| G7 | ViMax 渲染按列表位置索引镜头(shot_descriptions[idx],:301/322/402-440),camera_tree 规划期固化 → **物理删镜不可行** | ViMax 源码 |
| G8 | 渲染段必调 video_generator(:471-475);多机位场景关键帧阶段即调 transition video(:321-326)→ "只渲图"需受限配置 | ViMax 源码 |
| H1 | V8 桥可复用件:job 表+锁(:59-61,128-139)/process_spawner 注入(:59)/双管道排水(:174-201)/stderr ndjson 滤非 JSON(:181-197)/stdout 末行(:222-224)/看门狗(:204-218)/重启 job 失踪按失败(:243-249)。**三处必改**:无 env 注入、单实例全局去重、300s 超时 | `services/director_bridge_service.py` |
| H2 | dispatcher 白名单是前缀守卫:`/api/v2/vimax/` 是**新前缀**,需新增守卫块+GET/POST frozenset+route_service_getter+server.py 装配,缺一即 V0 式 404 | `services/http_route_dispatcher.py:12-31,302-319,395-416` |
| H3 | 确认闸在执行记录层:recordAssistantExecutionFromResponse→countGenerationActions→generationConfirmationRequired(:3344-3356);入库需满足 execution 契约形状(hasAssistantExecutionContract:2614-2616);抽屉确认(:5374-5380,:6702-6718)→orchestrator.run | `modules/app/appAssistantPanel.js` |
| H4 | autoStart 双形遵守(:120-128)+ trustedSources 机制(schemas/field.js:22,39 + schemaValidator.js:203-214;source 是执行选项,由调用点代码设置) | V1/V5 成果 |
| H5 | 真实 store 把 node.data 平铺到顶层(node.data 常为空)——一切节点读取必须 pick() 双形态 | `directorCanvasDailies.js:9-16` 注释钉死 |
| H6 | grsai 配置单一来源 `user/config.json`(providers.grsai + modelRegistry.text gemini-3.1-pro 实测稳);**video 注册表为空配置**(seedance-2.0 unconfigured,apiKey/baseUrl 空) | `user/config.json:107-124,159` |
| H7 | "导演:"解析点唯一(:696-703)但**消费点有二**(canSendMessage:3798、sendMessage:3923);执行体 applyDirectorPlanCommand(:3255-3316)为 QMAI 专属形状 | `appAssistantPanel.js` |
| H8 | 打包事实:`打包EXE.bat` → `tools/build_windows_onefile.py`(PyInstaller onefile);private-defaults 机制(:59-76)首启解包到用户数据区;USER_DIR 源码模式=仓库 user/,打包模式=%LOCALAPPDATA%\AI-CanvasPro\user(runtime_paths.py;server.py:443-450 统一重绑) | 打包链 |
| H9 | 现有代理全是**整包**模式(proxy/image server.py:2331-2466 探测后 join 回写;proxy/completions 把 SSE 坍缩成终态 JSON);仓库无上游 SSE 逐帧转发先例;线程模型 ThreadingTCPServer 每连接一线程 | `server.py` |
| S1' | 49 个 skills 实测:48 个三段式(H1 标题/Skill 描述/```json 块,48/48 可 json.loads),1 个纯散文;**规范名=md 首行 H1**(48 个与 JSON skill_name 逐字全等);**9/49 文件名被截断**,文件名不可作拍法名;_index.json 缺条目且路径失效;skill_description 48/48 非空 ≤117 字;section 直方图 planner 48/48、storyboard_designer 46/48;18/48 核心段 >4K 需截;每 md 配同名 .webp 封面 | `D:\Backup\Downloads\影视skills` 实测 |

---

## 1. 产品形态与交互

### 1.1 三个档位(命令路由,不是页面)

| 档位 | 触发 | 干什么 | 花钱 |
|---|---|---|---|
| **手作档** | 普通对话 | PI 建节点/连线/排版/改参(现状) | 逐节点确认 |
| **导演档** | `导演: <诉求>` | ViMax **只规划**:分镜 prep 节点落画布 | 仅 LLM(分钱级),免签 |
| **成片档** | `成片: <诉求>` 或导演档产物上"去成片" | 规划 → 画布审查 → 预算单签字 → 渲染 → 成片落节点 | 预算单封顶 |

路由实作(H7):`导演:` 的解析点唯一,但消费点有二(canSendMessage:3798、sendMessage:3923),且现执行体 applyDirectorPlanCommand 为 QMAI 专属(intent 下行/staleness/血统登记)。F6 实作 = 新增 `parseVimaxCommand`(导演:/成片:/定妆: 三前缀)与 `applyVimaxPlanCommand`,在两个消费点按 flag 分流;三前缀同步加入 canSendMessage 豁免(模型未配置时仍可发起,与 :3798 现行为对齐)。

### 1.2 核心交互流(成片档)

1. **发起**:`成片: 用《商品宣传短片》的拍法,推这支登山杖,60秒` —— 面板解析拍法《》(匹配规则见 §4.1 S2)与数值约束,连同原话发桥。
2. **思考可见**(1–3 分钟,P1 实测回填该预期):ViMax progress 回调 → stderr ndjson → job 表 → 面板轮询(复用 V8 的 2s 轮询/超时上限模式,appAssistantPanel.js:3222-3239)。展示形态 P1 沿用 V8 的 receipt 文本行("编剧→角色→分镜…"逐阶段刷新);抽屉阶段条为 F6 新增 UI(标注:新组件,非现成)。**vimax plan 必须走异步 job 模式**,不得复用 DirectorBridgeService.plan 的同步 subprocess.run(默认 60s 超时扛不住)。
3. **落画布审查**:每镜一个 storyboard-script 卡(ffDesc/lfDesc(有则)/motionDesc/audioDesc/机位)+ 每镜一个 ai-image prep 节点(`autoStart:false` 双盖,血统 vimaxFlowId/vimaxShotIdx/vimaxCamIdx/skillRefs);空间系统自动排 lane。**此刻零渲染费。**
4. **导演改戏**:画布上直接改 prep 节点提示词(写回支持,含 lfDesc)、pin 住满意的。**v1 不做物理删镜**(G7:渲染按列表位置索引且 camera_tree 规划期固化):不想要的镜在签字页清单**取消勾选**——不进 ticket.shotIdxs、不渲染、不计费,runner 按 shotIdxs 过滤渲染与拼接;真删镜 = 重新规划(新 flowId/working_dir)。
5. **签预算单**(执行抽屉签字页):①"我听到的约束"逐条回显原话引文(代码保证原文子串);②**逐镜帧数明细**:estimateByShot[{shotIdx, frames(1|2 按 variationType), transitions(按 camera_tree), clips}] × 单帧实测价 × (1+重试额度) = capTotal;③**角色定妆行项**:working_dir 无 character_portraits_registry.json 时,render 首跑会自动补定妆(G8 连带,script2video:183-203),N 角色×3 视×单价必须计入封顶;④所选拍法规范名。签字 → 铸 `render-ticket/v1`。
6. **跑批**(可中止):写回+失效(见 §3.2)→ ViMax 渲染;关键帧经 job 表 outputs[] 渐进落画布;成本对封顶滚动;硬失败/超限停为"待重拍"节点(经纪人 200+failed 语义,§2.3),**永不静默吞镜也永不炸穿管线**。中止 = `/api/v2/vimax/jobs/cancel`(kill 子进程+ticket 即时作废防残留扣费+working_dir 保留为断点)。
7. **审片与重拍**:成片节点+逐镜子节点。标"重拍"→ 重拍失效协议:render 带 `invalidateShotIdxs`,渲染前定向删除 shots/\<idx\>/ 下 first_frame.png、last_frame.png、*_selector_output.json、video.mp4、transition_video_*.mp4、new_camera_*.png,并删 working_dir/final_video.mp4(G3 双刃:含提示词缓存 selector_output,不删即 no-op、成片是旧片)。
8. **收工条**:本次花费(ledger 实账)/过镜比/所用拍法。

### 1.3 定妆流(P3)

`定妆: 男主,硬汉登山向导` → **定妆快签**(角色数×3 视×单价,一行内联确认,铸小额票)→ ViMax 角色提取+定妆(前/侧/背三视一套,侧/背以前视为参考链;γ 实证前/侧,**背视为 P3 首测项**)→ 三视作为**一组**卡落画布(`data.assetRole='character'`,同组血统;assetRole 需在 imageNode.schema.js 注册,否则被 schemaValidator 拒写)→ 用户"采用这套"或"重摇整套"(**非三选一**:渲染端按视图字典整套消费,script2video:501-505)→ 进 characters.json + 注册表(URL 持久化,§3.3)→ 后续成片自动带它。

---

## 2. 架构与打包

### 2.1 运行时拓扑

```
浏览器(画布+面板) ── HTTP ──> 幻映 python 服务(server.py)
                                  ├─ vimax_bridge_service(新):Popen 调 HY_VIMAX_HOME/.venv/Scripts/python.exe
                                  │    └→ integrations/vimax/huanying_runner.py(幻映仓库内,随包升级)
                                  │         ├─ plan:plan_text_artifacts → stdout 末行 shotplan JSON
                                  │         ├─ portraits:定妆三视 → 注册表(URL 持久化)
                                  │         ├─ render:同 working_dir 调 __call__(G3 零重算续跑)
                                  │         └─ 图/视频调用 → 本机经纪人两端点(§2.3)→ grsai/选型渠道
                                  └─ vimax 经纪人路由:验票/计费/封顶/整包代理
```

- **runner 收编进幻映仓库**(`integrations/vimax/huanying_runner.py`,随包分发随幻映升级——留在 VIMAX_HOME 会脱离版本管理,契约演进即断裂);桥以 `HY_VIMAX_HOME/.venv/Scripts/python.exe <幻映绝对路径>/huanying_runner.py` 调用,cwd=HY_VIMAX_HOME,runner 头部 `sys.path.insert(0, HY_VIMAX_HOME)` 解决 ViMax 包导入。由此 **ViMax 树零侵入文件**(γ 的 image_generator_grsai.py 同步迁入 integrations/vimax/)。
- working_dir = `<USER_DIR>/vimax_runs/<flowId>/`。**<USER_DIR> 经 user_dir_getter 注入**(照 server.py 既有依赖注入;源码模式=仓库 user/,打包模式=%LOCALAPPDATA%\AI-CanvasPro\user,H8),全文 vimax_tickets/vimax_ledger.json/skills/usage.json 同理,禁止硬编码相对路径。
- **凭据注入**:桥从 user/config.json 读 grsai(providers + modelRegistry.text),随 **stdin JSON 的 credentials 字段**传 runner——不进 argv(进程列表可见)不进 env(继承面扩大);桥单测断言 argv/env 无 key;γ 时代的硬编码 key 不得带入 runner。

### 2.2 打包策略(铁律 5 落实,经 H8 核实)

| 资产 | 机制 | 进包? |
|---|---|---|
| 幻映新增源码(桥/经纪人/映射器/签字页/runner) | 仓库源码 | ✅ KB 级 |
| 49 套 skills(md ~1.2MB + webp 封面 ~1.25MB) | 构建期加入 `build_windows_onefile.py` 的 `PRIVATE_DEFAULT_DIR_PATHS`(`user/skills`),经**现成 private-defaults 机制**进包、首启解包到 `<USER_DIR>/skills/`(用户改过的不覆盖,apply_private_defaults 既有语义) | ✅ ~2.5MB |
| ViMax + venv(~GB) | 外置 `HY_VIMAX_HOME`;**装机脚本 `tools/install_vimax.ps1`(进包,KB 级)**:git clone 钉 df8b206 → uv sync(仓内 pyproject.toml+uv.lock)→ 写配置 → 调 status 自检 | ❌ 外置 |
| QMAI | 独立应用 | ❌ 从未进包 |

- 环境变量定名 **`HY_VIMAX_HOME`**(HY_ 前缀惯例);健康检查与桥**按请求读**(仿 HY_QMAI_PROJECT_DIR 模式,免重启改配);**无默认值**——未设置 → `/api/v2/vimax/status` 返回 not-configured → 成片/导演档入口隐藏+引导跑 install_vimax.ps1;开发机路径只写 `.claude/launch.json`。
- 健康检查项:`%HY_VIMAX_HOME%/.venv/Scripts/python.exe` 可执行、runner 存在、skills 目录 md 计数。

### 2.3 渲染经纪人(成本主权的物理形态)

- **整包代理,不是 SSE 透传**(H9:仓库无逐帧转发先例,且适配器本来只消费终态):经纪人服务端消费上游 grsai SSE(50-75s 占一请求线程,ThreadingTCPServer 无上限,heartbeat_stream 有更长先例),取终态、落账实际耗时与 URL,向 runner 回**单条 grsai 形状 JSON** `{"status":"succeeded","results":[{"url":...}]}`——适配器的 iter_lines+json.loads 循环原样可解,逐帧 progress 丢弃。
- **携票**:适配器 api_key 字段改传 ticketId(进 Authorization: Bearer 头,经纪人以 Bearer 验票,适配器零代码改动)。
- **拒绝语义(关键)**:超限/票务拒绝**回 HTTP 200 + grsai 终态形状** `{"status":"failed","failure_reason":"HY_TICKET_CAP_EXCEEDED: <明细>"}`(或 HY_TICKET_INVALID/HY_RETRY_EXHAUSTED)——适配器现有逻辑把它转成 ValueError;runner 在**镜头粒度** try/except 捕获、置"待重拍"并向 stderr ndjson 发 `{type:'shot-blocked', shotIdx, reason}`。理由:ViMax 帧生成路径无重试保护,HTTP 4xx 裸异常会炸穿 asyncio.gather 令整个 render 崩溃;定妆路径 tenacity 会对 4xx 盲重试 3 次,经纪人对同票超限请求幂等快速拒绝。HTTP 4xx 仅用于报文畸形。
- **记账**:进程级 threading.Lock 串行化"读-校验封顶-累加-写"全程(并发 draw 来自 asyncio.gather,封顶校验必须在锁内),落盘 tmp+os.replace(仿 local_subscription_client.py:182-188 模式,~10 行自带实现),`<USER_DIR>/vimax_ledger.json`。
- **参考图链持久化**(G4 教训升级):runner 把 path→url 映射持久化到 `working_dir/image_url_registry.json`(每次 save 即落盘),任何模式启动时整表回灌 `_register`(γ portrait_urls.json 即原型);经纪人**另设本地图上传端点**(base64 转存为可引用 URL),兜底 fmt="pil" 的机位派生图(new_camera_*.png 无公网 URL,否则多机位一致性静默失效)。
- plan 模式纯 LLM 不经经纪人,花费由 runner 终态信封自报(tokens/elapsedSec),桥写入 ledger 的 plan 条目。

### 2.4 QMAI 休眠细则(铁律 6)

**flag 下发机制**:`HY_DIRECTOR_LEGACY_QMAI` 由 python 服务读 env(照 sam3_service.py:40 先例),经 `GET /api/v2/canvas-agent/status` payload 新增 `legacyQmai: bool` 下发(该 GET 已在 dispatcher 白名单);面板 install 时一次性拉取(沿 autoload 的 configLoader 模式)存 `state.legacyQmaiEnabled`,测试可直接构造两种形态。禁止走 /api/config(POST 会把 env 注入值回写 user/config.json)。

**完整入口清单**(flag=0 时,面板侧):
a) sendMessage 瀑布的 directorRefresh 分支(:3920)与 canSendMessage 豁免(:3798)跳过;
b) `导演:` 改走 ViMax 通道(F6);
c) directorKnowledge 投影 fetch/注入(:47-69、:3961)跳过;
d) dailies 上行两触发点(post-actions :5139-5143、post-generation watch :5023-5070)不挂载;
e) prepareQueuedExecution 的 director recompile 分支(:5152-5171)关闭——队列遗留 QMAI 任务出队落"通道已休眠"错误,不静默打 QMAI;
f) staleness 行仅 legacy 通道渲染。
dispatcher 中 QMAI 端点保留不删。

### 2.5 视频生成器选型(P2 前置裁决,G8/H6)

grsai 未验证有视频端点,user/config.json video 注册表为空配置。P2 必须三选一并实测:①yunwu 渠道(ViMax 现成 veo_yunwu/omni_yunwu 适配器,签名带 **kwargs 兼容 progress;现有 yunwu key 未激活需充值);②openrouter 适配器;③若实测 grsai 有视频端点,新写 video_generator_grsai.py(放 integrations/vimax/)。**veo_google/doubao_seedance 适配器签名无 **kwargs、与管线 progress 透传不兼容,不在候选内。** 经纪人对应增 `/api/v2/vimax/video` 计费端点(按秒计价,与 draw 分开估价)。**选型未落地前 P2 验收降级**:关键帧全部落画布+视频段单镜实测;此时 render 必须以受限配置跑(variation 全 small + 跳过 transition/clip——camera_tree 子机位会在关键帧阶段调视频生成,script2video:321)。

---

## 3. 数据流

### 3.1 规划流

```
面板解析(《拍法》/数值约束 → plain JSON args)
→ bridge.plan(flowId, {idea|script, userRequirement, style, skillRefs, charactersFile?, credentials})
→ runner plan:skills 检索注入(§4)→ plan_text_artifacts(quiet=True)→ stdout 末行 vimax-shotplan/v1
→ 面板 mapVimaxShotplanToCanvasActions(纯函数,模板=mapStoryboardToCanvasActions:53-135:
    产出声明式 actions+placement 提示+末尾 tidy_canvas;guard/placement 由执行层负责,映射器零 import)
    storyboard-script 卡复用现有键(shotIndex←idx、shotPrompt←ffDesc、shotVideoPrompt←motionDesc、
    cameraMove←camIdx 文案、durationSeconds)+ 展示并可编辑 lfDesc(有则)
    + 新血统键 vimaxFlowId/vimaxShotIdx/vimaxCamIdx/skillRefs;ai-image prep 双盖 autoStart:false
→ 包装成 execution 契约形状({plan:{steps}, actionsByStep, execution:{title}})喂
    recordAssistantExecutionFromResponse(:3318)——确认闸在这一层(H3),executeAssistantActions 只是
    orchestrator 的最终执行器
```

### 3.2 渲染流

```
签字 → render-ticket/v1 落 <USER_DIR>/vimax_tickets/<flowId>.json
→ 写回收集:面板复用 pick() 双形态读取(H5,真实 store 平铺、只读 data.* 真机收集到空集!)
    遍历 graphStore.nodes 过滤 vimaxFlowId===flowId,收集 {vimaxShotIdx, 文本字段, 取消勾选标记}
→ bridge.writeback(flowId, edits):runner 把每镜 edits 确定性合并进
    working_dir/shots/<shotIdx>/shot_description.json(逐镜文件,ViMax 真实布局 :747-762;
    读旧 JSON→覆写字段→model_validate→原子写回;storyboard.json/camera_tree.json 不在写回范围)
    对每个被编辑/重拍的镜执行失效协议(§1.2 步骤 7 的派生产物删除)
→ bridge.render(flowId, ticketId, shotIdxs, invalidateShotIdxs):runner 调 __call__(G3 续跑)
    渲染段结果不走 stdout 末行(被 ~30 处裸 print 污染)——写 working_dir/result.json,桥读文件;
    plan 模式维持 stdout 末行(plan 段 quiet 干净,γ 已验)
→ 关键帧 URL 进 job 表 outputs[] 全量累积数组(V8 的 progress[-10:] 截断只适合观感型进度,
    必达产物走 outputs 全量取或带游标轮询)→ 面板渐进落子节点
→ 终态:成片节点(videoUrl)+ ledger 结算 → 收工条
```

### 3.3 资产流(P3)

```
定妆快签 → portraits 模式 → 三视一套 + 注册表逐视图持久化 {path, url, description}(URL 必存)
→ runner 任何模式启动时读注册表逐条 _register(path,url) 预热(γ run_gamma.py:94-98 先例)
→ 后续 plan 注入 characters 参数;render 注入 characters + character_portraits_registry
    (G2:plan_text_artifacts 不收注册表,定妆图只在渲染段被消费)
RED 用例:冷启动 render 引用既有定妆,断言 draw payload.urls 非空(防跨进程静默断链)
```

---

## 4. 49 套 skills 的用户使用方案

**定位**:skills = 拍法库,与规划器同进程零中介。`<USER_DIR>/skills/*.md`(49 文件+49 webp 封面,经 private-defaults 进包)。**拍法规范名 = md 首行 H1**(S1':48 个与 Skill JSON 的 skill_name 逐字全等;9/49 文件名被"."截断不可作名;_index.json 缺条目且路径失效,不读)。skills 端点启动时扫描建名册;skillRefs/预算单/列表一律显示规范名全名(如《一图成片:顶级执行导演 Skill》,不缩写)。

### 4.1 四个触达点

**S1 自动注入(默认开,可溯源)**
切分规则(S1' 实测可执行):①取 md 首个 ```json 围栏块 json.loads(48/48 可解析);②core = skill_content 中 section∈{planner, storyboard_designer} 的 content 按原序空行拼接(2 个无 storyboard_designer 则仅 planner);③纯散文 1 个取去 H1 后正文;④解析失败防御:剔除 json 块取剩余正文(**绝不把 author/cover/auth_key 元数据送进提示词**);⑤单 skill 4K 字符换行边界截(18/48 需要);⑥按得分降序注入至总预算 10K。
检索(无分词环境):索引单元 = 规范名 + skill_description(48/48 非空 ≤117 字;**不索引全文**,避免 22K 长文天然多命中);打分 = 字符 bigram Dice 重合度 + 规范名作为查询子串命中 +3.0 + 高信号词(广告/MV/纪录/POV/国风/美食/宠物/口播…)双向命中 +1.0;ASCII 统一小写;top-3 且设最低分阈值,低于阈值零注入宁缺毋滥。
归因:命中拍法名进 shotplan.skillRefs → 节点血统 + 抽屉回执("本次参考拍法:《电影布光大师》《一图成片:顶级执行导演 Skill》")。

**S2 显式拍法**
`成片: 用《商品宣传短片》的拍法 …` —— 正则 `/《([^《》]{1,40})》/` 取首个书名号。三级匹配(对规范名名册):①规范化精确等(去空白/ASCII 小写/全角｜（）：转半角);②唯一子串命中,**命中多个不默挑、回澄清列表**(实测《故事驱动型视频》命中 3 个);③bigram Dice top-1 且 ≥0.5,否则报"未找到拍法"。命中后注入该 skill 的 **skill_content 全部段落按原序拼接**(planner/storyboard_designer/media_generator/write_the_prompt/video_assembler)——**不是 md 原文**(原文 1/3 是作者/封面元数据);置 userRequirement 头部、风格段入 style;预算单显示规范名。点名时 S1 降级为补充(top-1)。

**S3 拍法库面板**
`GET /api/v2/vimax/skills` 返回 `[{name, summary, coverUrl}]`:summary 取 skill_description 字段(48/48 ≤117 字天然免截;纯散文取首个非标题段截 120)——**禁止 md 原文裸截**(必把 auth_key URL 垃圾带进列表);封面用同名 webp;无 tags 字段不做 tags。面板轻量列表+搜索,点选预组装 `成片: 用《X》的拍法 `(注:面板现无 modal 先例,复用抽屉 backdrop 模式或新建轻量层)。

**S4 节点归因与使用计数**
节点带 `data.skillRefs`;**plan 完成即累加** {uses, lastUsed}(P1 即有数据,热度排序可工作),render 完成另记 renders(P2 起)。**唯一写者 = 桥**:job 终态回调内持服务级 threading.Lock 做读→累加→_atomic_write_json(server.py:1766 现成),落 `<USER_DIR>/skills/usage.json`;runner 与前端不写(跨进程无锁可依);损坏按空表重建。

### 4.2 那个解析失败的文件
《整体场景群像卡片元提示词.md》纯散文无 Skill JSON——S1 切分规则③直接取正文,49/49 全量可用(规范名=其 H1=文件名)。

---

## 5. 功能清单

| # | 功能 | 落点 |
|---|---|---|
| F1 | 桥(plan/portraits/render/writeback,V8 复用+**三处适配**:①Popen 加 `env={**os.environ,'PYTHONUTF8':'1'}`;②job 去重键 `(mode,flowId)`——同键 join 防双花、异键并存,render 同 flow 严格单实例,v1 渲染全局串行(同刻一个,新请求 409+排队),plan 并发 ≤2;③看门狗分档:plan/portraits ≤900s,render 心跳超时(每收 ndjson 重置,空窗 ≥300s 判死,墙钟 60min)。job 表存 process 句柄供 cancel;outputs[] 全量产物数组;凭据 stdin 注入;服务重启→面板提示"working_dir 已保留可续跑"+孤儿 pid 一键清理) | `services/vimax_bridge_service.py`(新) |
| F2 | runner(三模式;stdin JSON 含 credentials;plan 结果 stdout 末行,**render 结果写 working_dir/result.json**;skills 检索注入;失效协议;注册表预热;sys.path.insert 导入 ViMax) | `integrations/vimax/huanying_runner.py`(新,进包) |
| F3 | 路由+白名单:GET `/api/v2/vimax/{status,skills,jobs?jobId=}`;POST `/api/v2/vimax/{plan,portraits,render,writeback,draw,video,jobs/cancel}`。接线四件套:dispatcher 新前缀守卫块+GET/POST frozenset+route_service_getter+server.py 装配(H2,缺一即 V0 式 404) | `services/` + `http_route_dispatcher.py` |
| F4 | 经纪人:验票(Bearer=ticketId)/锁内记账封顶/整包代理/200+failed 拒绝语义/本地图上传端点 | F3 路由内 + `<USER_DIR>/vimax_ledger.json` |
| F5 | shotplan→画布映射器(纯函数,模板 mapStoryboardToCanvasActions;键复用+vimax 血统;lfDesc 展示) | `modules/assistant/vimaxCanvasActions.js`(新) |
| F6 | 面板:parseVimaxCommand 三前缀+applyVimaxPlanCommand(两消费点分流+canSendMessage 豁免)、execution 契约包装、进度渲染(P1 receipt 行,阶段条新 UI)、预算单签字页、写回收集(pick 双形态)、收工条 | `modules/app/appAssistantPanel.js` |
| F7 | api 客户端 vimax* 方法 | `api/canvasAgentApi.js` |
| F8 | **新增** vimax 血统字段(不动 qmai 数组——directorLineageContract.test.js 钉死):imageNode/videoNode schema 各加 vimaxFlowId/vimaxShotIdx/vimaxCamIdx/skillRefs(array)/assetRole(P3),INTERNAL+agentWritable:false+trustedSources:["vimax-director"];claw WORKFLOW_METADATA_FIELDS 同步;新增 vimaxLineageContract 跨语言契约测试;面板照 V5 directorExecutionIds 模式新建 vimaxExecutionIds 集合判定 source | `schemas/` + `claw_action_schema.py` + 面板 |
| F9 | 拍法库面板(规范名+summary+webp 封面) | 面板 + F3 skills 端点 |
| F10 | QMAI 休眠 flag(env→status payload→面板 state;六入口清单 §2.4) | `canvas_agent_route_service.py` + 面板 |
| F11 | 视频通道(§2.5 选型 + 经纪人 /vimax/video) | `integrations/vimax/` + F3 |
| F12 | 装机脚本 install_vimax.ps1(clone 钉 commit+uv sync+自检) | `tools/`(进包) |

---

## 6. 契约(两条新的)

| 契约 | 形状要点 | golden |
|---|---|---|
| **vimax-shotplan/v1** | `{schemaVersion, flowId, story?, scenes:[{idx, script}], characters:[{idx, identifierInScene, isVisible, staticFeatures, dynamicFeatures}](CharacterInScene camelCase 镜像,P3 注册表按 identifierInScene 键控), shots:[{idx, sceneIdx, camIdx, visualDesc, ffDesc, lfDesc?, motionDesc, audioDesc, variationType}], skillRefs:[...], elapsedSec, drawTimings:[...]}`。**lfDesc 仅 variationType∈{medium,large}**(渲染生成末帧消费);visualDesc 用于过渡视频——两者都必须可在画布编辑,否则首末帧脱节用户不可救 | 真实 runner 产物(γ report.json 升级),禁手写 |
| **render-ticket/v1** | `{ticketId, flowId, shotIdxs:[...], estimateByShot:[{shotIdx, frames(1|2), transitions, clips}], portraitsOf?:[角色名], retryBudget, capTotal(=求和×(1+retryBudget)+定妆行项), signedAt, expiresAt}` | 幻映内部契约测试 |

休眠契约(不删不动):director-intent/v1、qmai-director-export/v1、canvas-dailies/v2、gate-verdict/v1、director-knowledge-projection/v1。

---

## 7. 分期(每期独立可用,含成本声明)

| 期 | 内容 | 工期 | 验收 |
|---|---|---|---|
| **P1 规划落画布** | F1(plan)/F2(plan)/F3(status,skills,jobs,plan)/F5/F6(路由+receipt 进度)/F7/F8/F10/F12 + S1/S3/S4(plan 计数) | 2 周 | `导演: 雨夜告别 3 镜` → prep 节点带血统与 skillRefs;QMAI 通道休眠且 p1Ui 两条 QMAI 路由测试迁移为 flag-on 形态+新增 flag-off RED;**HY_VIMAX_HOME 由 install_vimax.ps1 产出**(不接受手工 venv);成本:仅 LLM 分钱级,实测纯规划耗时回填"1-3 分钟"预期 |
| **P2 签字与渲染** | F4/F6(签字页+写回+收工条)/F2(render+writeback+失效)/F11 选型/render-ticket | 2 周 | 成片档端到端:改 prep(含 lfDesc)→勾选镜头→签 capTotal→关键帧渐进落节点→**视频未就绪则降级验收**(关键帧成片+受限配置,§2.5);中断重启不重复扣钱;超限停为待重拍且管线不崩;成本:固定 1 场 3 镜、重试额度 0、封顶以 ledger 首批实测回填 |
| **P3 定妆与拍法** | 定妆流(快签+三视一套+assetRole 注册+注册表 URL 持久化)/S2/F9/VLM 判官(**新开发** 0.5-1 周) | 1.5-2 周 | 三视落画布且前/侧达 γ 标准、背视首测留档;《》点名命中与歧义澄清;冷启动 render 参考图 RED 通过;成本:1 角色 3 图 |
| **P4(可选)** | 项目记忆强化/重拍回路精装/QMAI 复活评估/skills 注入 A/B 报告 | 1-2 周 | A/B:同剧本注入 vs 不注入分镜专业度对比 |

总计 5.5–6 周(P4 不计)。

## 8. 测试与验收策略

- python 桥:job 生命周期/(mode,flowId) 去重/PYTHONUTF8 env 断言/凭据不进 argv-env/写回合并确定性+失效集合计算/心跳看门狗;经纪人:验票/**并发 draw 封顶竞态**(两线程逼近封顶只放行一个)/200+failed 语义/本地图上传。
- node:映射器 RED(shotplan fixture→血统/双盖/lane/lfDesc 展示);面板解析(《》三级匹配+歧义澄清);写回收集**双形态(平铺/嵌套)用例**;vimax trustedSources 对抗用例(伪造 source 拒写);p1Ui QMAI 路由测试迁移(flag-on 断言不变)+flag-off RED(`导演:` 打到 vimaxPlan、不携 director-intent/v1)。
- golden:vimax-shotplan/v1 由真实 runner 产出;skills 名册/切分规则用真实 49 文件做 env-gated 测试(QMAI 影视 skills 先例)。
- e2e(8779 + HY_VIMAX_HOME):P1/P2/P3 各一条真机脚本。
- 回归红线(准确口径):模块级测试零改动全绿;p1Ui 两条迁移后全绿;**迁移后整体全绿,非零改动全绿**。

## 9. 风险与对冲

| 风险 | 对冲 |
|---|---|
| ViMax 上游漂移 | vendored 钉 commit;**ViMax 树零侵入**(runner/适配器全在幻映仓);升级=显式换钉+重跑 golden |
| 渲染管线裸异常炸穿(无重试保护) | 经纪人 200+failed 语义 + runner 镜头粒度捕获(§2.3);bridge 单测钉死 |
| 跨进程参考图断链(静默吞一致性) | image_url_registry.json 持久化+预热+冷启动 RED(§3.3) |
| 视频通道未定 | §2.5 三选一前置裁决 + P2 降级验收条款 |
| 成本失控 | 经纪人+票据 P2 先行;portraits 也持票(定妆快签);P1 仅 LLM |
| grsai 不稳 | 降级链+tenacity+经纪人幂等拒绝;健康检查 fail-fast |
| QMAI 休眠回归 | flag 化+测试迁移口径(§8);CONTRACTS.md 标注 dormant |
| 孤儿进程(本机已有先例) | job 表记 pid;status 报告无主进程+一键清理;cancel=kill+ticket 作废 |
