# huanying 落画布契约(任何项目接画布的唯一规矩)

> 2026-06-14。固化"谁落画布 / 怎么落 / 什么绝不允许"。**任何想往画布落节点的来源(ViMax、未来项目、skills)都必须照这份契约走。** 背景:B0 审计证明落地链极脆(claw 漏一条规则 → 整批静默崩),所以这条边界不是风格,是安全机制。

---

## 0. 一句话

**huanying 是它画布的唯一主权方。** 外部来源**不创建节点**,只产出"要做什么"的计划/动作;huanying 的**唯一引擎**(claw 闸 + executor + 成本 + 血统)决定怎么安全地落。智能在上游(产计划),确定性在下游(翻译+落地)。

---

## 1. 两条契约(别混)

```
领域契约(每来源自己的形状)      通用落画布契约(huanying 唯一拥有)
  vimax-shotplan/v1               动作词汇 + claw 闸 + executor
  (一份分镜清单)                  (create_node / connect_nodes / …)
        │ 薄确定性 mapper(翻译)         ▲
        └──────────────────────────────┘
```

- **领域契约**:来源自己定(ViMax 的分镜清单、未来项目的 X 计划)。huanying 不关心。
- **通用落画布契约**:`create_node / connect_nodes / tidy_canvas / layout_nodes / focus_nodes / create_group / duplicate_nodes / set_viewport / queue_generation_task …`,被 `claw_action_schema.py` 校验。**这是唯一进画布的门。**

---

## 2. 唯一链路(任何来源都走这条)

```
来源产出领域计划
   │  ① 薄确定性 mapper:领域计划 → 通用动作(纯函数,可 golden 测试)
   ▼
通用动作(create_node…)
   │  ② claw 校验:nodeType ∈ SAFE_NODE_TYPES;元数据按 WORKFLOW_METADATA_FIELDS 白名单;布局 ∈ SAFE_LAYOUTS
   ▼
   │  ③ executor 创建节点(成本主权 + 血统受信 + prep 不自燃)
   ▼
画布节点(画布即真相)
```

| 闸 | 在哪 | 作用 |
|---|---|---|
| claw `SAFE_NODE_TYPES` | `services/claw_action_schema.py` | 只放行已知节点类型(含 `storyboard-script`,B0-C1 补) |
| claw 元数据白名单 | `WORKFLOW_METADATA_FIELDS` | 只保留受信字段(含 `vimaxFlowId/storyboardScript/…`),其余剥掉 |
| 成本主权 | 渲染经纪人(票据/cap/ledger) | 出图前签预算、封顶、可数、失败退款 |
| 血统受信 | schema `trustedSources` + exec id | source 由 exec id 判定,不读 action 内容 |
| 不自燃 | prep 双盖 `autoStart:false` | 落画布等审,不自动出图/花钱 |

---

## 3. 新来源(项目/skill)怎么接(就这一种姿势)

```
① 产出你的领域计划(随便什么形状)
② 写一个【薄确定性 mapper】:领域计划 → 通用动作词汇   ← 唯一要新写的,~100 行纯函数 + golden 测试
   (若你本就以"节点动作"思考,直接发通用动作,连 mapper 都不要)
③ 把动作交给 huanying:claw 校验 → executor 落节点      ← 共享,不重写
```

- mapper 嫌烦?**用 LLM 在开发期 codegen 出这个确定性 mapper**(人审+测试),运行时仍跑确定性代码。
- 现成范例:`modules/assistant/vimaxCanvasActions.js`(ViMax 的薄 mapper)。

---

## 4. 绝不允许(每条都有血的教训)

| ❌ 禁止 | 为什么 |
|---|---|
| 外部来源**直接创建节点**(绕过 claw/executor) | N 份各自绕闸 = N × B0 灾难(钱+画布失控);主权倒挂 |
| 把 huanying 节点类型/内部**嵌进各项目** | 紧耦合:huanying 节点一改,所有项目崩;节点逻辑复制 N 份漂移 |
| 让 **LLM 本体当 mapper**(运行时把结构化计划"翻译"成动作) | 结构→结构是机械活;LLM = 不确定/漏镜/血统盖错/花钱/黑盒,且 bug 不可复现修不了 |
| 把执行层(节点/资产/工作流)**做成 LLM 路由的 skill** | 在最安全攸关层(钱+画布真相)注入 LLM 不确定性 |
| 来源**自己决定落不落画布** | 落画布权 = huanying 独占(画布即真相) |

---

## 5. 智能 vs 确定性的分界(贯穿全契约)

```
   模糊输入 ──[LLM:理解/规划]──► 结构化计划 ──[确定性:翻译/落地/守安全]──► 画布节点
   剧本                          分镜清单                                  分镜卡/prep
   ▲ 智能只在这(产计划)                              ▲ 这一段全程确定性 + 硬闸门
```

**口诀**:智能产计划,代码落计划;来源出清单,huanying 落画布;稳定的缝是"动作契约",不是"节点"。

---

## 6. 现状对照(2026-06-14)

| 契约要素 | 状态 |
|---|---|
| 通用动作词汇 + claw 闸 + executor | ✅ 现役(B0 修复后真通,e2e 验证) |
| ViMax 薄 mapper(`vimaxCanvasActions.js`) | ✅ 现役(B0-C2/C3 建可渲染分镜表行) |
| 成本主权 / 血统受信 / 不自燃 | ✅ 现役 |
| 多来源(其他项目/skill 产清单) | ⏳ 目标(今天只有 ViMax 一个生产者;链路已现成可复用) |
| 原生编排器逐步落画布(可视化可 steer) | ⏳ Phase B 建设中 |
