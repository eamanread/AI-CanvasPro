# ViMax 大脑抽取 · 原生编排迁移评估

> 2026-06-14。前提:P1/P2/P3 已全部完成并真机验证(外置运行时形态)。本评估回答一个战略问题:**该不该把 ViMax 从"外置运行时"降级为"被抽取的提示词大脑 + huanying 原生编排"?** 结论先行:**该,但分阶段 + 带金标对账,不推倒重来。**

---

## 0. 一句话判断

真正贵的不是"跑 ViMax",是**两个运行时之间的阻抗**(独立进程 / 独立模型 / 独立状态 / 独立节点 schema)。我们一路解决的难题——子进程桥、GBK 崩、经纪人 draw 代理、分镜表对不上、模型 failed 状态锁死面板——**全是阻抗税的症状,不是核心价值**。核心价值(提示词 + 分解 schema)很小、很便携。外置运行时已完成它的使命(**最快验证 + 拿到物证**);现在该让它"毕业"。

---

## 1. 抽什么:大脑 = 提示词 + 分解 schema

我们的 plan / 定妆 / 关键帧链**实际用到**的 ViMax 部件(其余 novel/event/global-info/video 路径没用):

| ViMax 文件 | 行数 | 角色 | 我们用它做 |
|---|---|---|---|
| `agents/screenwriter.py` | 167 | 编剧 | develop_story + write_script |
| `agents/character_extractor.py` | 89 | 角色提取 | extract_characters(static/dynamic features) |
| `agents/storyboard_artist.py` | 275 | 分镜 | design_storyboard |
| `agents/script_planner.py` | 433 | 镜头分解 + 机位 | decompose_visual_descriptions + camera_tree(**精华**,prompt-density 最高) |
| `agents/character_portraits_generator.py` | 91 | 定妆 | 前/侧/背三视模板 |
| `agents/reference_image_selector.py` | 236 | 一致性 | 渲染时选参考图 + 组 prompt |
| `interfaces/*.py`(character/shot_description/scene/camera) | ~385 | 结构契约 | pydantic 输出 schema |

**合计 ≈ 1700 行**调好的提示词 + pydantic 结构。这就是要搬进 huanying 的全部 IP。(`best_image_selector` 没用——M17 已自写 `keyframe_judge.py`。)

ViMax 的 `pipelines/script2video_pipeline.py`(802 行)是**编排胶水**(文件状态机 + render backend + 视频),**不搬**——我们只需复刻它 `plan_text_artifacts` 那段顺序(story→chars→script→storyboard→decompose→camera),约 150–300 行原生时序逻辑。

---

## 2. 砍什么:阻抗税(全部可删)

| 现在背着的 | 为什么是税 | 原生化后 |
|---|---|---|
| `D:\Aic\ViMax` + `.venv` + langchain/pydantic 依赖 | 独立 Python 运行时 | 删;打包体积回落 |
| `vimax_bridge_service.py`(Popen/stdin/stderr ndjson/看门狗/PYTHONUTF8) | 进程边界 | 删 |
| `vimax_broker_service.py` 的 **draw 代理**(签票→验票→代理 grsai→退款) | 只因"模型不在同一运行时"才需把 grsai 计费穿过去 | 删代理;**保留预算封顶概念**,改用 huanying 原生成本 |
| 文件状态机(characters.json/shotplan.json/result.json/registry) | 跨进程传状态 | 删;状态在画布节点 + 内存 |
| `install_vimax.ps1` / pin / vendor / GBK emoji 处理 | 装机与字符集 | 删 |
| 分镜表阻抗(rows[] vs 每镜卡,见上一轮 Q2) | 两套 schema | 消失:原生直接写 storyboard-script 的 rows |
| **模型 failed 锁死面板**(刚遇到) | 两运行时争用同一 grsai | 大幅缓解:统一运行时、统一并发治理 |

---

## 3. 留什么:已验证资产全可复用(所以不是推倒)

- **契约 `vimax-shotplan/v1`** —— 原生编排器照样产出它,下游不变。
- **画布映射器**(`vimaxCanvasActions.js` / `vimaxPortraitsCanvasActions.js`)—— 照用(顺手修分镜表 rows 对齐)。
- **成本主权**(render-ticket 的"封顶+确认"语义)—— 保留,只把"经纪人 draw 代理"换成 huanying 原生成本钩子。
- **《》点名 skills**(`skills_index.py` resolve_named_skill_refs)—— 纯逻辑,直接搬。
- **VLM 判官**(`keyframe_judge.py`)—— 当初就写成"只注入 chat model"的可移植形态,原生编排零改动复用。
- **定妆三视 / 写回 / 失效协议** —— 逻辑搬,去掉文件态。

换的是**引擎**(产出方:外置进程 → huanying 内原生编排器),不是整车。

---

## 4. 原生编排长什么样(这才是你要的"可视化 + 可 steer")

外置版:思考全在子进程黑盒,画布只在最后一次性吐卡。
原生版:**每个导演步骤产出即落画布,用户可中途介入**——

```
用户贴剧本 / 想法
  → [编剧]  story 落一张可编辑卡        ← 可在此改设定再继续
  → [角色]  角色卡(+可触发定妆三视)    ← 可先定妆锁人设再往下
  → [分镜]  直接写进「分镜脚本」rows     ← 原生表格逐行编辑
  → [机位]  注释到行
  → [成片]  逐镜关键帧 + 判官重摇        ← 已有(M11/M17)
每步 = 一次 huanying 原生模型调用 + 一批 create_node 动作 = 思考可见、可改、可回退
```

这直接兑现你最初的愿景("PI 提问经导演大脑思考再编排""连续性由大脑把控""思考可见"),也顺手把分镜表阻抗(Q2)消灭。

---

## 5. 风险与工作量

**工作量**:抽 ~1700 行 prompt/schema + 复刻 ~150–300 行原生时序 + 重测。粗估 **1–2 周**(比从零的 P 阶段小,因为契约/映射/成本/判官/skills 都复用)。

**风险**:
1. **提示词调校漂移**——ViMax 的 prompt(尤其 script_planner 的拆分规则)是为其管线调的,搬过来驱动 huanying 的模型可能行为微变。**缓解:金标对账**(同输入跑外置 vs 原生,diff shotplan,达标才切)。
2. **失去源码零侵入**——不能自动蹭 ViMax 上游。但 ViMax 对这些 prompt 的改动不频繁,需要时手动合并即可。
3. **多模态/视觉依赖**——判官 + 定妆要视觉模型;已实测 grsai gemini-3.1-pro 有视觉,风险已排。

**不该现在做的**:视频端到端(通道未定,P2.5)、novel2movie 全路径(没用)。

---

## 6. 分阶段迁移计划(增量,带验证门)

- **阶段 A · 抽脑 + 金标对账**(低风险,不动运行时):把上表 7 个部件的 prompt/schema 抽进 huanying 树(如 `integrations/vimax/brain/` 或原生模块),写一个适配器用 huanying 的模型跑通"story→…→shotplan",**与外置版同输入对账**——证明能复现 ViMax 的产出。**门:shotplan 金标 diff 达标**。
- **阶段 B · 原生编排器(并行)**:写逐步编排器,每步 emit create_node(story/角色/分镜 rows/机位),挂进 PI-agent;与外置版 **A/B 并存**,可切换。**门:画布产出对齐 + 可视化可 steer 走通**。
- **阶段 C · 切换退役**:成片/定妆改走原生编排器;退役 venv/桥/经纪人 draw 代理/文件态/装机;分镜表原生 rows;成本走原生钩子。**门:全链真机 + 打包体积下降 + 回归绿**。

每阶段照旧:TDD + 逐模块对抗 review + 真机。可中途叫停(A 完成即已大幅去风险且有金标基线)。

---

## 7. 建议

**走,但从阶段 A 起步**——它最低风险、可独立交付、且立刻产出一条"金标基线"(同输入外置 vs 原生的 diff),让后续每一步都有客观验证门。阶段 A 跑通后,再决定 B/C 的节奏。

外置运行时这一版**不浪费**:它是验证价值的最快路径(已拿到分镜+定妆+关键帧物证),也是阶段 A/B 的金标对账基准。
