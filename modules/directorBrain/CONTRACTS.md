# Director Brain 契约脊柱(Contracts Spine)

本文档是 QMAI Director Brain(L2,带外平面)与 Huanying 画布执行体系(L3-L6)之间**全部跨界契约**的唯一权威清单。架构图上的"层"是盒子,这里登记的是"箭头"——每条箭头一个 schema、一个方向、一组 golden 契约测试。

```
 对话平面 (L0/L1)            导演平面 (L2, QMAI 带外)         执行平面 (L3-L6, Huanying)
 ┌──────────────┐  intent   ┌──────────────────┐  export   ┌──────────────────────┐
 │ 聊天/澄清卡   │ ───────▶ │ QMAI Director     │ ───────▶ │ directorBrain 编译守门 │
 │ (PI clarify) │           │ Brain (Tauri)     │           │ → 真实执行器 → 画布    │
 └──────────────┘           └──────────────────┘           └──────────────────────┘
        ▲                            ▲                                │
        │      gate-verdict/v1       │      canvas-dailies/v1         │
        └──────────── 统一判决回显 ───┴───────── 画布结果回流 ──────────┘
```

## 契约登记表

| Schema | 方向 | 生产者 | 消费者 | Golden 测试 |
|---|---|---|---|---|
| `director-intent/v1` | L1 → L2(耳朵) | `directorIntent.js#buildDirectorIntent` | QMAI `director-intent-import.ts` | QMAI `director-intent.live.spec.ts`(真实生产者产物) |
| `qmai-director-export/v1` | L2 → L3(单一信封,**首选**) | QMAI `director-export.ts#buildDirectorExportEnvelope` | `directorMemoryExportLoader.js#normalizeDirectorExportEnvelope` | `directorExportGolden.test.js` ← `__fixtures__/qmai-director-export.golden.json`(由 QMAI 真实导出代码生成) |
| `qmai-director-memory/v1` | L2 → L3(兼容) | QMAI 导出 | loader 形态 1 | 单测 |
| 目录布局(小说导出/小说 live/导演项目) | L2 → L3(兼容回退) | QMAI 磁盘 | loader 形态 2/3/4 | 单测 + `*.real.test.js` |
| `qmai-director-action-package/v0` | L2 → L3 | QMAI Action Package 导出 | `directorCanvasActions.js#mapActionPackageToCanvasActions` | 单测(fail-closed) |
| `gate-verdict/v1` | L3 → L0(统一判决) | `directorContinuityGate.js` | 执行抽屉/回放工作台 | 单测 |
| `canvas-dailies/v1` | L6 → L2(眼睛) | `directorCanvasDailies.js#buildCanvasDailiesExport` | QMAI `canvas-dailies-import.ts` | QMAI spec ← `__fixtures__/canvas-dailies.golden.json`(由真实执行器画布生成) |
| `canvas-spatial/v1` | L6 → L1/L4(空间感知) | `modules/assistant/canvasSpatialProjection.js#projectCanvasSpatial`(graphStore 纯函数投影) | PI 上下文(环境一行常驻 / 全量按关键词透镜)、放置解析器 | `canvasSpatialProjection.test.js`(真实执行器画布 golden + 幂等/零像素泄漏性质) |

**Golden 规矩:跨仓 fixture 必须由对侧的真实生产代码生成,禁止手写。** 任何一侧改契约,先重新生成 golden,对侧测试红了才许改代码。

**对称验证规矩:消费端必须与生产端逐件对称验证。** 信封消费端(loader)对 project.id 安全性、exportedAt、knowledgeCards、storyboard/prompts/continuityReport 全部 fail-closed(`directorExportGolden.test.js` 的对称验证用例钉住);canvas-dailies 消费端(QMAI)校验全部五个 stats 字段并与节点实数重算对账,节点 ID 必须是安全 ID;分镜映射器对幽灵 shotId fail-closed,空画布不可导出日报。判决对象在计划边界二次脱敏。

## 不变量(措辞即架构)

1. **生成权唯一属于 L5(Orchestrator)。** L2 的 `allowRealSend=false` 和 L3 的"零生成排队"不是临时禁令,而是这条不变量在各层的投影:导演平面只判断,编译层只铺 prep 节点,真实生成永远由 L5 的确认门与视频授权触发。未来开放真实生成时,改的是 L5 的授权策略,任何其它层都不需要"违反"什么。
2. **无判决即未验证(unverified ≠ pass)。** 缺失连续性报告时,闸门默认拦住全部生成动作并要求用户确认;override 必须携带可审计理由。
3. **真实记忆优先(RED-LINE-1)。** loader 只读,源路径与敏感键深度脱敏,永不进入 LLM 上下文或画布数据。
4. **画布即真相(RED-LINE-2)。** 任何"接入"必须以真实 `executeAssistantActions` + graphStore 落点为验收,不接受 mock 执行器证明。
5. **连续性是闸门,不是提示(RED-LINE-3)。** block 报告拦生成、留 prep 供检查;warn 放行但要求确认。
6. **意图可引导判断,不可伪造出处。** `director-intent/v1` 只折叠进 userGoal;引用 ID(配方/知识/记忆/资产)永远由代码从项目证据生成。
7. **flowId 贯穿。** 由 L1 铸造,经 intent → QMAI 信封 → 画布节点(`qmaiShotId`/`qmaiPromptId`)→ gate-verdict → canvas-dailies 回流,回放工作台凭它串起整条因果链。
8. **空间真相唯一。** `canvas-spatial/v1` 永远从 graphStore 现场投影(纯函数、幂等、无副本);像素坐标**双向**永不经过 LLM(不进上下文、不出 action,解析器忽略一切 LLM 像素输入)。
9. **放置必有血统,失败永不叠放。** 每次代码放置写 `data.placementReason`;解析失败降级 staging 区并写回 warnings,画布任何时刻重叠数为 0;`data.pinned` 节点对 agent 与 tidy 不可移动(用户主权)。

## 命名约定(消除"skills"三义)

| 术语 | 指代 | 所在 |
|---|---|---|
| **配方 (recipe)** | QMAI 导演配方(49 影视技能导入产物,`director-recipe/v1`) | QMAI L2 |
| **画布技能 (canvas skill)** | Huanying canvasSkillsRuntime 可执行技能 | Huanying L5/L6 |
| **技能校验 (matchedSkills validation)** | L5 服务端强校验 | Huanying L5 |

代码、文档、UI 文案一律按此表;"skills"裸用视为命名违规。

## 模块清单(modules/directorBrain)

- `directorContextSchema.js` — director-context/v1 校验 + 深度脱敏(`sanitizeDirectorContext`)
- `directorMemoryExportLoader.js` — 五形态只读加载(信封首选,目录布局兼容)
- `directorIntent.js` — L1 意图生产者(显式选道 + flowId)
- `directorCanvasActions.js` — 知识卡/分镜/Action Package → 画布动作映射
- `directorContinuityGate.js` — 连续性闸门 + gate-verdict/v1
- `directorCanvasDailies.js` — 画布生产面 → canvas-dailies/v1 导出
- `directorBrainService.js` — pi-agent 大脑入口(loader → 映射 → 闸门 → 信封动作)

零 LLM、零网络:本目录所有模块禁止直接调用任何模型或网络端点;LLM 判断只发生在 L2(QMAI)。
