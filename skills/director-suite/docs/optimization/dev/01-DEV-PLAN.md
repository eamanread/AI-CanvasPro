# director-suite 优化落地 · 主开发计划（Master Dev Plan）

> **本文件是把 13 份 PRD 变成"可派工的工程计划"的总装文档。** 它不重复各方向细节（在 `DEV-DNN-*.md`），\
> 只负责连接组织：冲刺序列、关键路径、de-risk 探针、CI 合入门、总量排期、团队配置、build-card 索引。\
> 状态：Dev v0.1 ｜ 文档族：[需求总规格](../00-MASTER-SPEC.md) → [13×PRD](../) → **[工程底座](00-ENGINEERING-SUBSTRATE.md) → 本文件 → 13×DEV-DNN**

---

## 0. 文档地图（这套文档怎么串）

```
00-MASTER-SPEC.md        需求总规格(SoT)：what/why + 需求追溯矩阵          ← 决策/排期看这
  └ DNN-*.md (×13)       每方向 PRD：FR/NFR + 设计 + DoD + 验证方案         ← 验收口径看这
00-ENGINEERING-SUBSTRATE.md  工程底座：6 共享构件 + 7 条完善 + 步行骨架     ← 架构/复用看这 ★
01-DEV-PLAN.md (本文件)   主开发计划：冲刺/关键路径/探针/CI/排期            ← 派工/进度看这 ★
  └ DEV-DNN-*.md (×13)    每方向开发方案：交付物 + 任务拆解 + 测试 + 里程碑   ← 工程师照着干
```

---

## 1. 工程方法论：对 PRD 的再切分（一句话回顾）

PRD 按"方向"切；开发计划**按风险与复用重切**（完整 7 条见[底座 §0](00-ENGINEERING-SUBSTRATE.md)）：

```
底座先于竖井 · 步行骨架先于铺面 · 探针先于承诺 · 先立秤再改菜 ·
模型注册表前移 · 反向注入测试是一等交付物 · 子弹追踪先于全量
```
→ 直接后果：**S0 先建底座 + 打通一条端到端竖切**，**P0(D5/D9)建秤做成 CI 门**，**D2/D8/D1 的宿主能力先打探针**，**13 方向都退化成"插件 + 一对 fixture + 一份基线"**。

---

## 2. 共享底座一览（13 方向全部接它，不重造）

| 构件 | 作用 | 谁用 |
|---|---|---|
| `audit_report.py` | 统一 Report/Finding/Verdict + GO-NO-GO + 退出码（判定区零时间戳） | 全部 13 |
| `leak_scan.py`+`lexicon.py` | 铁律① 引擎隐身一票否决；禁词集中、各方向往 `BY_DIRECTION` 加 | 全部 13 |
| `portability_scan.py` | 铁律② 无宿主 API / 无货币单位 | 全部（D1/D11 重点） |
| `snapshot.py` | 黄金基线冻结 + 字节级回归 diff（L2） | 全部 13 |
| `reverse_test.py` | `assert_gate_is_real`：证明闸对 poison 会变红 | 全部 13 |
| `run_eval.py` | 全基线×全审计 → GO/NO-GO 编排（= D9 脊柱 = 合入门） | D9 拥有，全部注册进 |
| `model_registry.json`+`registry.py` | 模型单一事实来源（D3 前移） | D3 拥有，D5/D7/D9/D11/D1 引用 |

> 落地纪律：底座纯机制零业务；业务判据在各方向 `audits/audit_*.py` 插件 + `_shared/*.md` 知识文件。

---

## 3. 冲刺序列（Sprint Plan · 按依赖与风险排序）

```
╔═══ S0 · 底座 + 步行骨架（~1 人周，1 名 lead，串行不可并）═══════════════╗
║ 交付：harness/ 六构件 + 翡翠楼四表冻结基线 + audit_consistency 最小版    ║
║ 退出门(G0)：make verify 红/绿可复现；audit_consistency 对基线→GO，       ║
║            注 +30° 色相→NO-GO；assert_gate_is_real 双过；run_eval 打印   ║
║ ★这一步立住，后续每个方向只是"再挂一个插件"。                            ║
╚════════════════════════════════════╤═══════════════════════════════════╝
                                     ▼
╔═══ S1 · 建秤 P0（~5.5 人周，可 2 人并）★合入门上线 ═════════════════════╗
║ D5 量化一致性审计  2.5–3.0pw   D9 评测回归套件 2.6pw（复用 D5 的 Drift）  ║
║ 退出门(G1)：run_eval 对 5 题基线 0 劣化出 GO/NO-GO；打乱 mapping→必 NO-GO ║
║            ；reverse_test --all 过；CI 四项门接通（此后任何 PR 受其约束） ║
╠══ S1 并行：de-risk 探针（各 ~0.5pw，越早越好）════════════════════════════╣
║ SPIKE-A 宿主多模态读视频(→D2)  SPIKE-B 宿主读图(→D8)  SPIKE-C 宿主 parser(→D1)║
╚════════════════════════════════════╤═══════════════════════════════════╝
                                     ▼
╔═══ S2 · 杠杆 P1（~9.8 人周 MVP，可 3 人并；D3 略先）════════════════════╗
║ D3 模型抽象 3.5pw（先：D5/D9/D7/D11 都引 registry）                       ║
║ D1 执行契约 2.25pw（套件侧；宿主 parser 并联，凭 SPIKE-C）                 ║
║ D2 拉片反向 4.0pw MVP（凭 SPIKE-A；不可用则降 C 档纯文本）                 ║
║ 退出门(G2)：契约实例 ViMax 可消费跑 1 shot+暂停门真停；换模型=git diff 1 行 ║
╚════════════════════════════════════╤═══════════════════════════════════╝
                                     ▼
╔═══ S3 · 扩展 P2（~10.2 人周，需求驱动并行）═══════════════════════════════╗
║ D6 音频合成 1.8pw(后 D1) · D7 静态全案 1.8pw(后 D1+D3) · D8 图像入口 4.5pw  ║
║   (凭 SPIKE-B) · D4 运镜示意图 1.9pw(独立) · D11 成本层 1.9pw(后 D3+D1)     ║
╚════════════════════════════════════╤═══════════════════════════════════╝
                                     ▼
╔═══ S4 · 品味·长尾·收口 P2/P3（~7.4 人周）════════════════════════════════╗
║ D12 作者保真 1.85pw(后 D9+D5) · D10 覆盖补全 2.4pw(后 D9+D5+D2)            ║
║ D13 产品化 3.15pw(后 D2+D8 — 口径统一/版本台账/真机基线/luban 出师/装机)   ║
╚══════════════════════════════════════════════════════════════════════════╝
```

---

## 4. De-risk 探针（S1 并行先打，避免 P1 写空头）

| 探针 | 验什么 | 通过判据 | 不通过的降级 |
|---|---|---|---|
| **SPIKE-A**（→D2 拉片） | 宿主多模态能否读视频：取时间码/判切点/辨运镜方向 | 对 1 条 ≤15s 原创片，自动切点 vs 人工标注偏差≤1、运镜方向判对 | 降 **C 档**：用户口述参考片→产骨架（不假拆视频） |
| **SPIKE-B**（→D8 图像入口） | 宿主能否读图：取准主色 HEX/判光位/辨空间四层 | 主色 HSL 色相 Δ≤15°、光位方向判对 | 降 **C 档**：用户文字描述图→四维基因卡 |
| **SPIKE-C**（→D1 执行契约） | 宿主 parser 能否消费契约 JSON 建调度 DAG、暂停门真阻塞 | 1 个 shot 跑到 export、element_render 门实停等确认 | 契约只产出+人工驱动；ViMax 侧排期补 parser |

> 每个探针 ~0.5pw，结论须**书面**。探针红 = 对应方向当期只交付"文本契约 + 审计闸"，真机集成顺延，不阻塞建秤与其余方向。

---

## 5. Build-Card 索引（13 方向一表速查）

| ID | 方向 | 优先级 | 交付物 | 新插件(register名) | Tickets | 工时 | MVP 退出门（摘） | DEV 文档 |
|---|---|:--:|:--:|---|:--:|:--:|---|---|
| D5 | 量化一致性审计 | **P0** | 11 | `consistency` | 11 | ~2.75pw | 注+30°色相→FAIL测回30°±3°；JSON逐字节可复现 | [DEV-D05](DEV-D05-consistency-audit.md) |
| D9 | 评测回归套件 | **P0** | 23 | `storyboard`+detectors | 16 | 2.6pw | 5题0劣化GO；打乱映射必NO-GO+嫌疑指针 | [DEV-D09](DEV-D09-eval-regression.md) |
| D3 | 多模型适配矩阵 | **P1** | 19 | `model_adapters` | ~9 | ~3.5pw | 能力契约覆盖100%；换模型=git diff 1行 | [DEV-D03](DEV-D03-model-adapters.md) |
| D1 | 执行编排契约 | **P1** | 12 | `execution` | 11 | ~2.25pw | 契约ajv 0错；shots==组数；leak_scan=0；真机1shot+暂停门停 | [DEV-D01](DEV-D01-execution-contract.md) |
| D2 | 拉片反向成员 | **P1** | 11 | `reverse_board` | 16 | ~4.0pw* | 三档真降级；切镜一致≥90%；零原片专名 | [DEV-D02](DEV-D02-reverse-board.md) |
| D6 | 音频合成契约 | P2 | — | `audio_assembly` | ~7 | 1.8pw | duck∈[8,12]/boost∈[3,5]/cf==0.5；内嵌轨静音 | [DEV-D06](DEV-D06-audio-assembly.md) |
| D7 | 静态全案成员 | P2 | — | `static_board` | — | 1.8pw | 3Hero景别递进+8Detail；11图同asset_id；4项审计无⚠️ | [DEV-D07](DEV-D07-static-batch.md) |
| D8 | 图像优先入口 | P2 | 10 | `image_genome` | 16 | ~4.5pw* | 四维卡schema合法；同图两情绪首锚同曲线异 | [DEV-D08](DEV-D08-image-first.md) |
| D4 | 运镜轨迹示意图 | P2 | — | `camera_path` | ~7 | 1.9pw | 10运镜唯一三元组；标注条数==源镜头数 | [DEV-D04](DEV-D04-camera-path-sheet.md) |
| D11 | 成本感知层 | P2 | 19 | `cost` | 14 | 1.9pw | fill_ratio<0.67标红；禁降档；货币命中=0 | [DEV-D11](DEV-D11-cost-aware.md) |
| D12 | 作者论保真 | P2 | 13 | `style_fidelity` | 13 | 1.85pw | 注drone→FAIL+改用词；裸Wes缺漏列全；A-B胜≥2/3 | [DEV-D12](DEV-D12-style-fidelity.md) |
| D10 | 覆盖补全 | P2/P3 | 16 | `coverage` | 16 | 2.4pw | ledger9行落点精确；POV摊平路径数==可达终局 | [DEV-D10](DEV-D10-coverage.md) |
| D13 | 产品化+口径统一 | P2 | 25 | 4×audit_*+verify_install | 19 | 3.15pw | 术语0违规；四互锁不变量全过；装机烟测绿 | [DEV-D13](DEV-D13-productization.md) |

`*` D2/D8 工时含 de-risk 探针 + 真机 + 双态；其"文本闸 MVP"≈4/4.5pw。交付物"—"= DEV 文档内有清单，未计入本表速查。

---

## 6. 总量、关键路径与排期

```
套件侧总工作量 ≈ 34 人周（MVP 口径；不含 ① 宿主 execution-contract parser
                          ② 宿主多模态/读图改造 ③ 真机付费出片的用户排期等待）

关键路径（最长依赖链）：
  S0 底座(1) ─► D5(2.75) ─► D9(2.6) ─► [D3(3.5) ∥ D1(2.25)] ─► D2(4.0)
              ─► D13 产品化收口(3.15)
  关键路径长 ≈ 17 人周

团队配置建议（并行后日历周）：
  1 名 lead（底座/D5/D9/D3 架构）+ 2–3 名实现 eng + 兼职 QA/真机验证
  + 宿主侧 1 名 eng（D1 parser / 多模态，独立排期，与套件并联）
  ⇒ 日历 ≈ 11–13 周完成 P0–P2 主体；P3 长尾按需滚动
```

**派工建议（按 risk-burndown）**：
1. lead 独占 S0 + D5（立住秤的脊柱）。
2. 秤一上线，eng-A 接 D9，eng-B 起 D3，并行三条 de-risk 探针。
3. G1 后：eng-A→D1（凭 SPIKE-C）、eng-B→D2（凭 SPIKE-A）、lead→D3 收尾 + registry 前移给所有人引用。
4. S3 扩展按"独立优先"：D4（零依赖）可任何空档插入；D6/D7/D11 等 D1/D3 就绪。
5. D13 压轴：它要等多数成员落地才能做"口径统一 + 版本台账 + 装机烟测"。

---

## 7. CI 合入门（不可绕过的秤 · 来自底座 §5）

```makefile
verify:                                    # 任何动 _shared/ 或新增成员的 PR 必跑
	python -m harness.run_eval             # ① 5 基线 × 全审计 → GO/NO-GO
	python -m harness.reverse_test --all   # ② 每闸 clean/poison 反例必过（防橡皮图章）
	python -m tests.leak_scan_all          # ③ 全成片 leak_scan 命中=0（铁律①）
	python -m tests.portability_all        # ④ 可移植性扫描=0（铁律②）
# 四项任一 exit!=0 → CI 红 → 阻断合入
```
> 这是把"先立秤再改菜"从口号变成机制的唯一手段：**S1 结束时此门必须真实生效**，之后所有方向的 PR 都过它。

---

## 8. DoD → 代码 可追溯（每条验收都落到一个断言）

```
PRD 的 DoD-N  ──►  DEV 的 audits/audit_<dir>.py 里一个 check（check 字段==FR/DoD ID）
                   ──►  fixtures/ 里一对 clean/poison 证明该 check 真会变红
                   ──►  run_eval 聚合 → CI 门
例：D5-FR-02(6 阈值) → audit_consistency.check="D5-FR-02" → D05.poison(hue+30°) → reverse_test 断言
```
> 验收口径全套件一致：**没有对应 poison fixture 的 DoD，视为"未验证"，不算 Done。**

---

## 9. 风险登记 + 回滚

| # | 风险 | 缓解 / 回滚 |
|---|---|---|
| R1 | 宿主多模态/读图/parser 不可用 | SPIKE-A/B/C 先验；红则当期只交付文本契约+审计闸，真机集成顺延 |
| R2 | 底座设计返工拖累全员 | S0 步行骨架先用最小版（D5 两项）打通，证明可转再扩；底座 API 冻结后再铺方向 |
| R3 | 引擎泄漏/橡皮图章 | 每闸强制 clean+poison + `assert_gate_is_real`；CI ③门一票否决 |
| R4 | registry 后置导致硬编码返工 | D3 registry 在 S2 早期前移；其余方向一律 `registry.reg()`，禁写模型名 |
| R5 | D2/D8 工时超估 | 二者按 MVP 文本闸切线先交付（≈4/4.5pw），真机/双态/学习闭环作第二批 |
| R6 | 改 _shared/ 跨方向回归 | D9 回归门为所有方向合入前置；snapshot 黄金基线漂移即人审 |
| R7 | 成本"省钱"/品味"高级感"无法硬验 | D11 落宿主 ledger 账单对账；D12 落 A-B 盲评胜率，不编伪数值分 |

---

## 10. 阶段验收（Program Gates 汇总）

```
G0(S0)  make verify 可复现红绿；audit_consistency 端到端通（步行骨架立住）
G1(S1)  CI 四门生效；5 题基线 0 劣化 GO；打乱映射必 NO-GO；3 探针结论书面
G2(S2)  契约 ViMax 消费跑通 1 shot+暂停门真停；换模型 git diff 1 行；拉片三档真降级
G3(S3)  D4/D6/D7/D8/D11 各自 make verify 绿 + 真机抽验（付费用户亲点）
G4(S4)  D13 装机烟测全绿；术语口径统一；production-bible 全案真机基线；luban 出师证书
```

---

## 附录 · 13 份开发方案索引

| ID | DEV 文档 | PRD |
|---|---|---|
| D1 | [DEV-D01-execution-contract.md](DEV-D01-execution-contract.md) | [D01](../D01-execution-contract.md) |
| D2 | [DEV-D02-reverse-board.md](DEV-D02-reverse-board.md) | [D02](../D02-reverse-board.md) |
| D3 | [DEV-D03-model-adapters.md](DEV-D03-model-adapters.md) | [D03](../D03-model-adapters.md) |
| D4 | [DEV-D04-camera-path-sheet.md](DEV-D04-camera-path-sheet.md) | [D04](../D04-camera-path-sheet.md) |
| D5 | [DEV-D05-consistency-audit.md](DEV-D05-consistency-audit.md) | [D05](../D05-consistency-audit.md) |
| D6 | [DEV-D06-audio-assembly.md](DEV-D06-audio-assembly.md) | [D06](../D06-audio-assembly.md) |
| D7 | [DEV-D07-static-batch.md](DEV-D07-static-batch.md) | [D07](../D07-static-batch.md) |
| D8 | [DEV-D08-image-first.md](DEV-D08-image-first.md) | [D08](../D08-image-first.md) |
| D9 | [DEV-D09-eval-regression.md](DEV-D09-eval-regression.md) | [D09](../D09-eval-regression.md) |
| D10 | [DEV-D10-coverage.md](DEV-D10-coverage.md) | [D10](../D10-coverage.md) |
| D11 | [DEV-D11-cost-aware.md](DEV-D11-cost-aware.md) | [D11](../D11-cost-aware.md) |
| D12 | [DEV-D12-style-fidelity.md](DEV-D12-style-fidelity.md) | [D12](../D12-style-fidelity.md) |
| D13 | [DEV-D13-productization.md](DEV-D13-productization.md) | [D13](../D13-productization.md) |

---

*本计划的工程信条：**先建秤、再改菜；底座一次、插件十三；每闸可变红、每改可回归。** 把"很厉害的人"的判断固化成 CI 门，而不是依赖个人自觉。*
