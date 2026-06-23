# D11 · 成本 / 积分感知规划层（Cost-Aware Planning Layer）开发方案

> 编号 D11 ｜ 优先级 P2 ｜ 状态 Dev v0.1 ｜ 前置:[D11-cost-aware.md（本方向 PRD）](../D11-cost-aware.md) + [00-ENGINEERING-SUBSTRATE.md（共享底座）](./00-ENGINEERING-SUBSTRATE.md)
>
> PRD 答 *what/why*；本文件答 *how-to-build*——把 D11 接到共享底座上，**不重造任何验证脚手架**。
> 我只交付:审计插件 `audit_cost.py` + 一对 clean/poison fixture（外加 NG4 禁降档、货币写死两组小 fixture）+ 黄金基线 `cost-plan-demo` + 知识/契约文件（Bone 层 `_shared/cost.md`）+ `lexicon.BY_DIRECTION["D11"]` 禁词 + 任务拆解。
> D11 是 PRD 自评 **落地可靠性 3/5** 的方向——扣分点全在"真省钱必须真机跑 ledger 账单才证实"，故本方案把**结构静态闸（M1-M3）**与**真机账单对账（M4）**明确切开：MVP 切线在 M3 的"成本规划产物形态正确 + 三条铁律闸是真闸 + 黄金基线可回归"，M4 真机账单对账后置/迭代。

---

## 1. 目标与范围

落地 PRD 的 **D11-FR-01~06 / NFR-01~05**:新建一份 **Bone 层成本规划单一事实源 `_shared/cost.md`**——开篇定义无量纲相对成本度量 `gen_cost`（基准 1.0× = 一次标准镜头组生成），用一张**成本决策表**收口散落在 `continuity-quality.md` / `storyboard` / `seedance-2.0` / `pro-params` 四处的 5 条省钱纪律，叠加**主动降级决策表**（NG4 禁降档硬约束）、**两套默认档**（质量优先 / 预算优先）、**预算估算 + 真机后对账算法**；并实现其**确定性执行器** `audit_cost.py`（对成本规划摘要做结构静态核验 + 三条铁律闸：成本词不漏成片 / 高潮镜禁降档 / 不写死货币）。成本规划是**后置于创作决策的预算视角**（灵魂①情绪→景别/运镜链一行不改），出稿后、真机前由 storyboard / production-bible 管线调用，产**对内过程产物**供用户点付费前看预算。

**本方向作为"底座插件"的边界（纪律铁律）:**

- **复用不重造**:报告结构 / GO-NO-GO / 退出码 / `leak_scan` / `portability_scan` / `snapshot` / `reverse_test` / `run_eval` / `registry` 全部用 `00-ENGINEERING-SUBSTRATE.md` 定义的共享 harness。我**只**写业务判据（`audits/audit_cost.py` 的成本规划结构核验与三闸）、一对 + 两组 fixture、一份黄金基线、一份 Bone 知识 `cost.md`、若干处注册/交叉引用改动。
- **零业务知识下沉到底座**:`gen_cost` 系数表、5 策略决策表、主动降级决策表、两套默认档、预算估算/对账算法**全部**写在 `_shared/cost.md`（Bone 知识）与插件私有逻辑里；只往 `lexicon.BY_DIRECTION["D11"]` 注册禁词、往 `_shared/scripts/audits/` 放一个插件。
- **不碰 Soul**（结构性保证不破隐身）:`tacit-core.md` 零接触——成本规划是纯骨②规格层叠加的薄壳，不回流污染创作决策（PRD §5.2 关键句）。引擎隐身铁律继承 `storyboard/output-contract.md §7.8` + `production-bible/SKILL.md 铁律③`，扩展为"**成本规划层绝不漏进成片**"（NFR-01）。
- **复用而非新造降级链**（NFR-04 / NG5）:降级目标全部 `registry.reg()` 读 D3 `model_registry.json` 的 `video.fallback`（`seedance-2.0→seedance-2.0-fast`）与 `image.tier.draft`（NB2 快省档）；首尾帧成本档 / 视频参考门槛 / 720p→超分 / 质量下界全部**交叉引用** `continuity-quality.md` 既有小节，不整段复制（megaprompt 导出版除外）。D11 **只新增**成本度量 + 决策框架 + 预算估算/对账这层薄壳。
- **不替宿主计费 / 不点付费按钮**（NG3）:D11 只产**规划与估算**（纯文本，0 真机调用），不实现扣费、不调生成 API。`gen_cost` 是无量纲相对系数，**不写死任何真实货币/积分单价**（NFR-02），真实换算交宿主/ViMax ledger。
- **MVP 切线**:`audit_cost.py` 的**结构闸 + 三条铁律闸（leak_scan / 禁降档 / 货币扫描）+ 合成 poison 真值校准 + 黄金基线回归**是可验证核心，优先于 M4 真机账单对账（付费由用户亲点 + 依赖宿主 ledger）。

> 一句话:D11 是缺口类 **A有脑无手（省钱手感没被结构化）叠加 B（成本知识无 SoT·单向只会救火不会主动省）** 的 P2 薄壳——给套件装上"成本意识"那块脑子（度量 + 决策表 + 预算估算/对账），机制全复用底座，降级链/质量下界全复用 D3/continuity，自己只写"成本"这层规格知识与一个结构审计插件。

---

## 2. 交付物清单（精确文件路径表）

仓库根 = `skills/director-suite/`。类型∈{知识md/契约md/audits插件py/fixtures/baselines/样例md/registry项}。

| 路径 | 类型 | 说明 |
|---|---|---|
| `_shared/cost.md` | 知识md | **Bone 层主交付**:FR-01 `gen_cost` 度量定义（基准 1.0×）+ 5 策略成本决策表（五列+交叉引用）+ FR-03 主动降级决策表（≥4 类镜头属性 + NG4 禁降档行）+ FR-05 两套默认档（质量优先/预算优先）+ FR-04 预算估算/对账算法 + 自检门（NG1/NG4 双闸 + 估算诚实区间） |
| `_shared/scripts/audits/audit_cost.py` | audits插件py | **唯一审计插件**。`@register("cost")`，`run(target)->Report`。成本规划摘要结构静态核验（三项齐全/fill_ratio/碎切统计/超预算建议段）+ 三条铁律闸（leak_scan 成本词 / 禁降档 / 货币扫描）+ 降级目标 ∈ registry 既有链校验 |
| `_shared/scripts/examples/cost_plan_demo.json` | 样例md(JSON) | FR-04 成本规划摘要的机读样例:6 镜头组 + 3 角色 + 8 关键帧脱敏原创短片，含 1 高潮镜 + 1 换脸/数字人镜 + 4 铺陈/叙事镜；每组人工标注 `fill_ratio` / `is_strong_continuity` / `shot_class` / `consistency_need` 作 ground truth |
| `_shared/cost.md`（§样例段）/ `_shared/examples/cost-plan-demo.md` | 样例md | FR-04 人读面成本规划摘要 demo:质量优先档 vs 预算优先档两档对比（预计次数区间 + Σgen_cost + 触发策略清单），作回归基线 B0 的人读证据 |
| `_shared/scripts/fixtures/D11_cost.clean.json` | fixtures | clean 正例:质量优先档（无预算上限），只触发零损失策略（打满/默认不加参考/ImageToImage），高潮/换脸镜全标准档，成片提示词段零成本词。期望 `audit→GO, exit0`（T1） |
| `_shared/scripts/fixtures/D11_cost.poison.json` | fixtures | poison 反例:clean 复制后施加 4 处独立投毒（成本词漏成片 / 高潮镜降 Fast / fill_ratio<0.67 无理由 / 碎切 3 个 2s 镜各自生成）。期望 `FAIL` 且测回特定值（§6②） |
| `_shared/scripts/fixtures/D11_downgrade.clean.json` | fixtures | NG4 禁降档子门正例:铺陈组降 Fast（合法），高潮/换脸/POV/强连续全标准档。期望 GO |
| `_shared/scripts/fixtures/D11_downgrade.poison.json` | fixtures | NG4 禁降档子门反例:把高潮镜 `tier` 投毒为 `fast`、换脸镜省掉刚需 reference_video。期望 FAIL，测回禁降档镜被降档 |
| `_shared/scripts/fixtures/D11_currency.poison.json` | fixtures | 货币写死子门反例:cost.md 文本片段塞入 `每次生成 5 元 / 2 积分`。期望 FAIL（验 NFR-02 宿主无关） |
| `_shared/baselines/jadepavilion/cost_plan.golden.json` | baselines | 黄金基线 B0:对 `cost_plan_demo.json` 跑成本规划（质量优先档）的成本规划摘要冻结（`fill_ratio`/Σgen_cost/触发策略清单 全 GO），`snapshot.freeze` 冻结为回归参照 |
| `_shared/scripts/lexicon.py`（改） | registry项 | 往 `BY_DIRECTION["D11"]` 追加本方向禁词全集（§3②）。底座 `COST_TERMS` 已预置部分，本方向补全为成本审计专属差集 |
| `_shared/cost.md`（megaprompt 内联） | 知识md | `_megaprompts/` 相关导出版内联 cost 核心表（5 策略表 + 两套默认档 + 禁降档行），自包含可独立运行（FR-06e） |
| `_shared/continuity-quality.md`（改） | 契约md(追加) | §一.3 首尾帧表 / §一.4 视频参考门槛 / §二.2 720p→超分 / §二.7 同工具降级 四处末追加交叉引用注脚（→成本统一口径见 cost.md）。**原条款文字不动** |
| `storyboard/output-contract.md`（改） | 契约md(追加) | §5「双时长观」末追加注脚（→生成单元打满作为省次数主策略见 cost.md FR-02）。原文字不动 |
| `_shared/seedance-2.0.md`（改） | 契约md(追加) | §0「生成单元=镜头组」末追加注脚（→打满窗口省次数的成本口径见 cost.md）。原文字不动 |
| `storyboard/SKILL.md`（改） | 知识md(追加) | 6 步管线路由表新增一行「出稿后→读 cost.md 做成本规划+预算估算（对内）」，正文增量 ≤5 行（渐进式披露） |
| `production-bible/SKILL.md`（改） | 知识md(追加) | 6 步 SOP / 路由表新增一行「Step 6 输出前→读 cost.md 出成本规划摘要（对内，付费前给预算）」，正文增量 ≤5 行 |
| `README.md`（改） | registry项 | 三层架构「② 骨」一行文件清单追加 `cost.md`（定位:成本规划规格 SoT，性质近 continuity-quality）；目录树 `_shared/` 下新增该文件节点 |

> **只读复用、不改语义**:`docs/optimization/D03-model-adapters.md` 与 `_shared/scripts/model_registry.json`（D3 owner，`video.fallback`/`image.tier.draft` 降级链）、`docs/optimization/D01-execution-contract.md`（`pause_gate` 暂停门）、`_shared/asset-id-convention.md`（ImageToImage 复用的 asset_id 锚）、`_shared/pro-params.md` 四（帧率/画幅/分辨率规格，超分链规格依据）、`continuity-quality.md` 二（质量下界，省钱不得击穿）。
>
> **弱依赖降级备注**:若 D3 `model_registry.json` 未落地，`audit_cost.py` 的"降级目标 ∈ 既有链"校验降级为硬引 `continuity-quality.md` 二·7 散落降级链白名单（`seedance-2.0-fast` / `vidu-q3` / `nano-banana-2`），不阻塞（PRD §8 弱依赖）。

---

## 3. 与共享底座的接线

### ① 复用 harness 哪些构件

| 底座构件 | D11 怎么用 |
|---|---|
| `harness/audit_report.py`（§2.1） | `audit_cost.run()` 返回 `Report`;每个被测项 `append Finding(check="D11-FR-04", verdict=…, detail="组 G3 fill_ratio 0.40 < 0.67 且无叙事理由", measured=0.40, threshold=0.67, fix=…)`;收尾 `rep.assert_fail_has_fix()`;`decision`（有 FAIL→NO-GO）/`exit_code`（0/1）走统一语义。**判定区零时间戳**——估算时间戳只入摘要 header 元数据、不进 `Report.findings`。 |
| `harness/leak_scan.py` + `lexicon.py`（§2.2） | **NFR-01 铁律闸（一票否决）**:对**成片**（镜头卡 + Seedance 提示词 + 四表）跑 `leak_scan(final_text, extra_terms=lexicon.BY_DIRECTION["D11"])`，命中成本/降级/引擎术语即 FAIL。底座 `COST_TERMS` 已含 `gen_cost/预算/省积分/降级到Fast/1.0×`——D11 核心泄漏词**底座已覆盖**，本方向只补差集（`Σgen_cost`/`cost_summary`/`相对代价`/`fill_ratio`/`碎切` 等）。 |
| `harness/portability_scan.py`（§2.3） | **NFR-02 货币扫描闸**:对 `cost.md` 全文跑 `portability_scan`——底座 `CURRENCY=[r"[¥$]\s?\d", r"\d+\s?积分", r"\d+\s?元/次"]` 与 `HOST_API` 正好命中"写死货币/积分单价 + 宿主 API"。复用底座，**不另写货币扫描**；货币写死 poison（§6 NB3）依赖它报红。 |
| `harness/snapshot.py`（§2.4） | `freeze(cost_plan_summary, "baselines/jadepavilion/cost_plan.golden.json")` 冻结 B0 黄金基线;套件升级后 `diff_against_golden(current, golden_path)` 回归——断言"对 demo 重跑 fill_ratio/Σgen_cost/触发策略清单无实质漂移"。 |
| `harness/reverse_test.py`（§2.5） | `assert_gate_is_real(audit_cost_gate, clean_sample, poison_sample, name="D11-cost")`——证明闸对 clean（质量优先档）放行 exit0、对 poison（成本词漏成片/高潮镜降 Fast）报红 exit1。NG4 禁降档子门、货币子门各跑一次。**无反例的闸视为未完成**（完善⑥）。 |
| `harness/run_eval.py`（§2.6） | `@register("cost")` 让插件自动进 `run_eval` 的 5 基线 × 全审计 GO/NO-GO 编排;纳入 `make verify` 合入门。`run_eval` 在每个 case 上横切跑 leak_scan，D11 成本摘要若漏进成片会被横切扫到。任何动 `_shared/` 的 PR 不过四项 GO 不许合（完善④）。 |
| `registry.py` / `model_registry.json`（§2.7） | **引用（NFR-04 / 完善⑤）**:`audit_cost.py` 校验"降级目标 ∈ 既有链"时走 `registry.reg()["video"]["fallback"]` / `["image"]["tier"]`，**禁硬编码降级链**;降级建议文案涉模型名走 `registry.video_default()` 等。D11 不新增 registry 项、不改 registry 默认值（只读）。 |

### ② 往 `lexicon.BY_DIRECTION` 加哪些禁词

底座 `COST_TERMS = ["gen_cost","预算","省积分","降级到Fast","1.0×"]` 已预置成本核心泄漏词。本方向往 `BY_DIRECTION` 补全「成本规划专属、绝不可漏进成片」的差集:

```python
# lexicon.py 改后
BY_DIRECTION = {
    # …既有 D5/D8/D4/D3…
    "D11": [
        # —— 度量 / 总分 / 摘要字段（对内过程产物，禁进镜头卡/成片）——
        "gen_cost", "Σgen_cost", "Σgen", "相对代价", "代价总分", "cost_summary",
        "成本规划", "成本规划摘要", "成本决策表", "1.0×", "0.6×", "base_shot_group",
        # —— 打满 / 碎切 / 复用（FR-02 对内统计词）——
        "fill_ratio", "窗口利用率", "碎切", "碎切违规", "重画次数", "复用基准图",
        # —— 降级 / 档位 / 省钱动机（对内决策理由，禁进成片，NG1）——
        "降级到 Fast", "降 Fast 档", "降档", "省钱", "省积分", "省成本", "省次数",
        "禁降档", "质量优先档", "预算优先档", "末帧续首帧", "视频续接",
        # —— 预算门 / 对账（对内，禁进成片）——
        "预算", "预算上限", "超预算", "建议降级", "对账", "ledger 实际", "校准系数",
    ],
}
```

> 注意:`Seedance 2.0 Fast` / `nano-banana-2` 等**模型名本身不进禁词**——成片施工单里出现目标模型方言是合法的（D3 已约定）;被禁的是"为省钱降档/打满/碎切/预算/对账"这类**过程动机痕迹**。反例 NB1（把 `gen_cost=0.6×`/`降级到 Fast` 塞进成片）依赖此集让 `leak_scan` 报红，证明隐身闸是真闸。

### ③ 是否引用 model_registry

**引用，且为只读消费方（NFR-04 / NG5 复用门的承载）**:D11 不是 registry 的 owner（D3 是），只读它的 `video.fallback` / `image.tier` 来校验"D11 的降级目标全部 ∈ D3 既有链，无新造链"。具体:
- `audit_cost.py` 内 `_allowed_downgrade_targets()` = `registry.reg()["video"]["fallback"]` 的 `to` 字段集合 ∪ `registry.reg()["image"]["tier"]` 的 value 集合（`seedance-2.0-fast` / `vidu-q3` / `nano-banana-2` / …）。
- 成本规划摘要里任何 `downgrade_to` 字段若不在该集合 → FAIL（check=`D11-NFR-04`），fix="降级目标必须复用 D3 model_registry fallback，禁新造链"。
- **弱依赖降级**:registry 不可得 → 退到硬编码白名单常量 `_FALLBACK_WHITELIST_FALLBACK`（取 `continuity-quality.md 二·7` 散落链），插件头注明该分支，不阻塞（PRD §8）。

### ④ 新增 `audits/audit_cost.py` 的 register 名

- 文件:`_shared/scripts/audits/audit_cost.py`
- 注册名:`@register("cost")`
- 入口:`def run(target) -> Report`（`target` 见 §4.4 的 `target` schema）

### ⑤ 接上底座的 5 件 Done 清单（对照 00-SUBSTRATE §3）

```
1. audits/audit_cost.py 实现 run(target)->Report 并 @register("cost")              ✔ T05/T06
2. 往 lexicon.BY_DIRECTION["D11"] 注册禁词集（§3②）                                ✔ T07
3. fixtures/ 放一对 clean + poison（外加禁降档/货币子门），测试里 assert_gate_is_real ✔ T08/T09
4. 涉降级链/模型选择一律 registry.reg()，禁硬编码降级链（仅弱依赖降级白名单兜底）     ✔ T06
5. baselines/ 放黄金基线 cost_plan.golden.json，纳入 run_eval 与 snapshot 回归        ✔ T10
```

---

## 4. 实现分解（可照着写的真实骨架）

### 4.1 `_shared/cost.md`（Bone 知识）— 五件套结构

#### (A) `gen_cost` 相对成本度量（FR-01 · 无量纲系数 · 过程产物，绝不入成片）

写入 cost.md 开篇。基准:一次「标准镜头组生成」= **1.0×**（定义 = 一个 10–15s 镜头组 / 720p / 视频标准档 / 无 reference_video）。机器侧 fixture / 脚本用以下 YAML/JSON 结构落地（系数给区间，NFR-05 不假装精确）:

```yaml
# gen_cost_units —— 相对系数（宿主无关，NG2:不写死货币/积分单价）
gen_cost_units:
  base_shot_group:        1.0        # 标准镜头组一次生成（基准）
  fast_tier_shot_group:   [0.5, 0.7] # 降 Fast 档（复用 D3 seedance-2.0-fast，省约 30-50%·相对值，真机校准）
  add_reference_video:    [0.3, 0.6] # 加一条 reference_video 的增量（拖慢耗积分，continuity 一·4）
  keyframe_text2img:      [0.25, 0.35] # 一张关键帧 TextToImage（独立重画）
  keyframe_img2img_reuse: [0.1, 0.2]  # 以基准图 ImageToImage 复用（约半价，省漂移又省钱）
  endframe_carry:         [0.0, 0.05] # 方案一·末帧续首帧（截帧≈免费，continuity 一·3「省积分」）
  video_carry:            [0.5, 1.0]  # 方案二·视频续接（极耗积分，continuity 一·3「极耗积分」）
  super_res_upscale:      [0.05, 0.15] # 720p→MediaKit 超分（后期廉价补规格，远低于直生高分）
# 注:系数为相对量级、给区间不假装精确（NFR-05），真机后用 ledger 对账校准
# 机读副本落 _shared/scripts/examples/gen_cost_units.json（脚本默认载入，与本表逐项一致）
```

#### (B) 成本决策表（FR-01 · 5 策略五列 · 全交叉引用，写入 cost.md）

每条策略五列齐全（缺列即不合格，脚本 schema 校验），每条显式 `→ 见 <文件>:<小节>` 交叉引用源条款:

| 策略 | 省什么 | 相对代价变化 | 质量代价 | 触发条件（何时用·何时禁用） |
|---|---|---|---|---|
| ① 生成单元打满 | 省生成次数 | 碎切 N 镜各生成 → 合 1 组:`N×0.x → 1.0×` | **零**（反而更连贯） | 恒用;组时长吃满 10–15s。禁:把 2–3s 镜各自生成。→ 见 `storyboard/output-contract.md §1/§5`、`seedance-2.0.md §0` |
| ② 同工具降级 Fast | 省单次代价 | `1.0× → [0.5,0.7]×` | 中（细节/动态略降） | 仅铺陈/空镜/中性交代镜;**禁**高潮/换脸/数字人/POV/强连续（NG4）。链 → 见 D3 `model_registry.json video.fallback` / `continuity-quality.md 二·7` |
| ③ 720p→超分 | 省直生高分代价 | 直生 1080p+ → `720p(1.0×)+超分([0.05,0.15]×)` | **零~极低**（不整片超分） | 恒用;视频默认 720p 生成、MediaKit 后期补规格。禁:对成片整体超分/插帧。→ 见 `continuity-quality.md 二·2`、`pro-params.md 四` |
| ④ 视频参考门槛 | 省 `reference_video` 增量 | 默认不加 → 省 `[0.3,0.6]×/镜` | **零~负**（强连续才有正收益） | 默认不加;仅"极强连续"镜加。**禁**:为"连贯"给每镜都加。→ 见 `continuity-quality.md 一·4` |
| ⑤ 首尾帧成本档 | 省续接代价 | 末帧续首帧`[0,0.05]×` vs 视频续接`[0.5,1.0]×` | 末帧档有"刹车顿挫" | 常规/积分敏感→末帧续首帧;**仅**强连续/一镜到底→视频续接。→ 见 `continuity-quality.md 一·3` |

#### (C) 主动降级决策表（FR-03 · 镜头属性 × 预算 → 档位 · NG4 硬约束，写入 cost.md）

区别于 D3/continuity 的"失败救火降级"——这是"为省成本主动选最省方案"。覆盖 ≥4 类镜头属性，每行给"推荐档位 + 视频参考 + 首尾帧方案 + 可省理由（对内）":

```
镜头属性          一致性刚需   预算宽松默认        预算紧张可降到            禁降档(NG4)
铺陈/空镜/交代    低           标准档+无视频参考    Fast档+末帧续首帧        —
叙事/对话         中           标准档+按需视频参考  标准档(不降Fast)         —(可省视频参考)
高潮/决定性瞬间   高           标准档+必要首尾帧    不可降                   ✗ 禁Fast/禁省刚需参考
换脸/数字人/POV   极高         标准档+身份双保险    不可降                   ✗ 禁Fast/禁省双保险
强连续/一镜到底   极高         标准档+视频续接      不可降视频续接           ✗ 禁省reference_video
```

> 降级目标全部 ∈ D3 `model_registry.json` fallback / `continuity-quality.md 一·3` 首尾帧方案，**无新造链**（脚本断言 `downgrade_to ∈ _allowed_downgrade_targets()`）。"可降/禁降"是对内决策理由，**不进成片**（NG1）。`shot_class ∈ {establishing, narrative, climax, faceswap_avatar_pov, strong_continuity}`，`禁降档行` 由 `_NO_DOWNGRADE_CLASSES = {"climax","faceswap_avatar_pov","strong_continuity"}` 在脚本里硬编码守门。

#### (D) 两套默认档（FR-05 · 成本-质量双向决策，写入 cost.md）

```
质量优先档（默认 · 用户未给 budget_cap）—— 只启用「零质量损失」策略:
  ✔ 生成单元打满（FR-02）           —— 质量+成本双赢
  ✔ 视频参考默认不加（continuity 一·4）—— 质量+成本双赢（强连续除外）
  ✔ ImageToImage 复用（continuity 一·1）—— 避免重画漂移，质量+成本双赢
  ✗ 不主动降 Fast、不牺牲首尾帧流畅度

预算优先档（用户给 budget_cap 且 Σgen_cost 超限）—— 在质量优先档上叠加「有质量代价但在下界内」策略:
  ＋ 铺陈/空镜组降 Fast 档（标"质量代价:细节略降，仅作用于非刚需镜"）
  ＋ 非强连续镜走末帧续首帧（非视频续接）
  ＋ 关键帧合并（能用一张兼用首尾就不出两张）

两档共同 NG4 硬约束:高潮/换脸/数字人/POV/强连续镜，任何档都豁免降级（不降 Fast、不省刚需 reference_video/首尾帧）。
```

#### (E) 预算估算 + 对账算法（FR-04 · 对内过程产物，写入 cost.md 作契约 + 脚本实现）

```python
def cost_plan(storyboard, quality_floor, budget_cap=None):
    Σ = 0.0; triggered = []; rows = []
    for grp in storyboard.shot_groups:
        c = G("base_shot_group")                         # 1.0× 起步
        grp.fill_ratio = round(grp.duration / 15, 2)     # FR-02 窗口利用率
        if grp.fill_ratio < 0.67 and not grp.has_reason: # 吃不满且无理由
            rows.append(red(grp, "窗口未打满 fill_ratio<0.67 无叙事理由"))
        if is_fragmented(grp):                           # FR-02 碎切:组内 2-3s 镜各自生成
            rows.append(red(grp, "碎切违规:组内短镜各自送生成"))
        # 默认档:质量优先（FR-05）——只取零质量损失策略
        if not grp.is_strong_continuity:                 # FR-04 视频参考门槛
            triggered += ["默认不加reference_video"]      # 省 add_reference_video
        else:
            c += mid(G("add_reference_video"))            # 强连续=质量刚需，不省（NG4）
        c += sum(kf_cost(kf) for kf in grp.keyframes)    # 关键帧:img2img 复用优先（FR-02）
        # 预算优先档（仅当给 budget_cap 且累计超限）
        if budget_cap and Σ > budget_cap and is_downgradable(grp):  # FR-03 禁降档镜豁免
            assert grp.shot_class not in NO_DOWNGRADE_CLASSES        # NG4 兜底断言
            c = apply_fast_tier(c)                                   # 走 registry fallback
            triggered += [f"{grp.id} 铺陈组降Fast→{registry_fallback('video','seedance-2.0')}"]
        Σ += c
    n_lo, n_hi = estimate_gen_count_range(storyboard, Σ) # NFR-05 给区间不假装精确
    summary = CostSummary(round(Σ,2), (n_lo, n_hi), triggered, rows)  # ← 对内过程产物
    if budget_cap and Σ > budget_cap:                    # FR-04 预算门（复用 D1 pause_gate）
        summary.over_budget = True
        summary.suggest = suggest_downgrades(storyboard, budget_cap)  # 建议，不自动执行（NG3）
    return summary   # 呈现给用户（付费前看预算）;真机后 reconcile(summary, ledger) 校准系数

def reconcile(summary, ledger):                          # FR-04 真机后对账
    diff = ledger.actual_gen_count - mid(summary.range)
    return CalibrationNote(diff, direction=sign(diff))   # 对内，用于校准 gen_cost 系数
```

#### (F) 自检门 + 引擎隐身闸（写入 cost.md）

```
挂载位 = 出稿后（镜头卡 + Seedance 提示词已生成）、暂停门前、真机付费前。
管线:出稿 → 读 cost.md 跑 cost_plan → 成本规划摘要（对内）→ continuity §二.8 / D1 pause_gate 读结论
      → 用户点付费前看预算 ; 超预算 → 建议降级 X 组（不自动执行/不自动付费 NG3）→ 用户决定放行。
引擎隐身闸（硬规则）:成本规划三件套（gen_cost 度量 / 决策表 / 成本规划摘要）与脚本输出只存于过程目录（.cost/），
      严禁作为字段/脚注/参考帧进入镜头卡 / Seedance 提示词 / 任何成片表。
NG4 硬约束闸:任何降级动作前断言 shot_class ∉ {climax, faceswap_avatar_pov, strong_continuity}。
估算诚实（NFR-05）:预计次数以「N_lo–N_hi」区间或「N ± 容差」给出，禁"精确 N 次"虚假精确。
降级路径（NFR-02）:宿主无 ledger → 摘要只给"预计次数区间 N、不给货币、不对账"，契约不变，套件不瘫。
```

### 4.2 `audits/audit_cost.py`（确定性执行器）— 函数签名 + 核心逻辑

底座 harness 零图像依赖;本插件**纯标准库**（无 Pillow/numpy——成本审计是文本/数值结构核验，非像素测量）。

```python
# _shared/scripts/audits/audit_cost.py  （依赖:仅 Python 标准库）
import json, re, sys
from harness.audit_report import Report, Finding, Verdict
from harness.run_eval import register
from harness.leak_scan import leak_scan
from harness.portability_scan import portability_scan
from harness import lexicon, registry

# —— NG4 禁降档镜类（硬编码守门，对内） ——
NO_DOWNGRADE_CLASSES = {"climax", "faceswap_avatar_pov", "strong_continuity"}
FILL_FLOOR = 0.67                                   # FR-02 窗口利用率下沿（≥10s/15s）
REQUIRED_SUMMARY_KEYS = {"est_count_range", "total_gen_cost", "triggered_strategies"}

def _allowed_downgrade_targets() -> set:
    """降级目标白名单 = D3 registry 既有链（NFR-04 复用门）。registry 不可得→弱依赖白名单兜底。"""
    try:
        reg = registry.reg()
        vids = {f["to"] for f in reg["video"].get("fallback", [])}
        imgs = set(reg["image"].get("tier", {}).values())
        return vids | imgs
    except Exception:
        return {"seedance-2.0-fast", "vidu-q3", "nano-banana-2"}  # continuity 二·7 散落链兜底

@register("cost")                                   # 自动进 run_eval 的 GO/NO-GO
def run(target) -> Report:
    rep = Report(audit="cost", target=target["id"])
    summary = target["cost_summary"]                # 成本规划摘要（对内过程产物）
    groups  = target["shot_groups"]                 # 含 shot_class/fill_ratio/downgrade_to 等
    final   = target["final_text"]                  # 成片:镜头卡 + Seedance 提示词 + 四表

    # ① FR-04 摘要三项齐全（缺一即 FAIL）
    missing = REQUIRED_SUMMARY_KEYS - set(summary)
    for k in missing:
        rep.findings.append(Finding("D11-FR-04", Verdict.FAIL,
            f"成本规划摘要缺字段: {k}", measured=sorted(set(summary)), threshold=sorted(REQUIRED_SUMMARY_KEYS),
            fix=f"补成本规划摘要字段 {k}"))

    # ② NFR-05 估算诚实:est_count_range 必须是区间/带容差，禁单一精确值
    rng = summary.get("est_count_range")
    if not (isinstance(rng, (list, tuple)) and len(rng) == 2 and rng[0] < rng[1]):
        rep.findings.append(Finding("D11-NFR-05", Verdict.FAIL,
            "预计次数非区间（虚假精确）", measured=rng, threshold="[lo, hi] 且 lo<hi",
            fix="预计次数改为区间或 ±容差，不假装精确到次（沿用 §1「≈」诚实口径）"))

    # ③ FR-02 每组 fill_ratio + 碎切违规统计
    frag_count = 0
    for g in groups:
        if "fill_ratio" not in g:
            rep.findings.append(Finding("D11-FR-02", Verdict.FAIL,
                f"组 {g['id']} 缺 fill_ratio", fix="成本规划摘要每组须携带 fill_ratio"))
            continue
        if g["fill_ratio"] < FILL_FLOOR and not g.get("fill_reason"):
            rep.findings.append(Finding("D11-FR-02", Verdict.FAIL,
                f"组 {g['id']} fill_ratio {g['fill_ratio']} < {FILL_FLOOR} 且无叙事理由",
                measured=g["fill_ratio"], threshold=FILL_FLOOR,
                fix="吃满 10–15s 窗口或补叙事理由（如极短转场组）"))
        if g.get("is_fragmented"):                  # 组内 2-3s 镜各自送生成
            frag_count += 1
    if frag_count > 0:                              # 正常稿应=0
        rep.findings.append(Finding("D11-FR-02", Verdict.FAIL,
            f"碎切违规数 {frag_count}（组内短镜各自生成，违反 seedance §0）",
            measured=frag_count, threshold=0,
            fix="把碎切镜合回镜头组一条 prompt 串联（生成单元打满）"))

    # ④ NG4/NFR-03 禁降档闸:高潮/换脸/POV/强连续镜不得被降档/省刚需参考
    for g in groups:
        if g["shot_class"] in NO_DOWNGRADE_CLASSES:
            if g.get("tier") == "fast":
                rep.findings.append(Finding("D11-NFR-03", Verdict.FAIL,
                    f"禁降档镜 {g['id']}({g['shot_class']}) 被降到 Fast 档",
                    measured="fast", threshold="standard(禁降)",
                    fix=f"{g['shot_class']} 是质量刚需镜，任何预算档都豁免降级（NG4）"))
            if g["shot_class"] == "strong_continuity" and g.get("reference_video") is None \
                    and not g.get("ref_intentionally_omitted_ok"):
                rep.findings.append(Finding("D11-NFR-03", Verdict.FAIL,
                    f"强连续镜 {g['id']} 省掉刚需 reference_video",
                    fix="强连续镜的 reference_video 是质量刚需，不在可省区（NG4）"))

    # ⑤ NFR-04 复用门:降级目标全部 ∈ D3 既有链（无新造链）
    allowed = _allowed_downgrade_targets()
    for g in groups:
        dt = g.get("downgrade_to")
        if dt and dt not in allowed:
            rep.findings.append(Finding("D11-NFR-04", Verdict.FAIL,
                f"组 {g['id']} 降级目标 {dt!r} 不在 D3 既有链 {sorted(allowed)}",
                measured=dt, threshold=sorted(allowed),
                fix="降级目标必须复用 D3 model_registry fallback / continuity 二·7，禁新造链"))

    # ⑥ FR-04 预算门:over_budget 时必须有"建议降级组"段（不自动执行）
    if summary.get("over_budget") and not summary.get("suggest"):
        rep.findings.append(Finding("D11-FR-04", Verdict.FAIL,
            "超预算但缺建议降级段", fix="超预算须给「建议降级组+降级后估算」，且不自动执行/不自动付费（NG3）"))

    # ⑦ NFR-01 引擎隐身（一票否决）:成片不得含成本/降级/引擎词
    sub = leak_scan(final, extra_terms=lexicon.BY_DIRECTION["D11"])
    for fnd in sub.findings:
        rep.findings.append(Finding("D11-NFR-01", Verdict.FAIL,
            f"成片泄漏成本/过程词: {fnd.detail}", fix=fnd.fix))

    rep.assert_fail_has_fix()                        # 铁律:每 FAIL 必带 fix（底座断言）
    return rep

# —— 货币扫描子门:对 cost.md 文本跑底座 portability_scan（NFR-02） ——
def audit_currency(cost_md_text: str) -> Report:
    return portability_scan(cost_md_text)            # 复用底座，不另写货币正则

def _cli():
    import argparse
    ap = argparse.ArgumentParser(description="确定性成本规划审计（结构闸 + 三铁律闸）")
    ap.add_argument("--target", required=True); ap.add_argument("--json-out")
    a = ap.parse_args()
    rep = run(json.load(open(a.target, encoding="utf-8")))
    if a.json_out: open(a.json_out, "w", encoding="utf-8").write(rep.to_json())  # sort_keys，无时间戳
    print(rep.to_json()); sys.exit(rep.exit_code)    # exit 0=GO / 1=NO-GO

if __name__ == "__main__":
    _cli()
```

**关键算法要点（可照着落地）:**
- **NG4 禁降档双保险**:`NO_DOWNGRADE_CLASSES` 既在 cost_plan 的 `apply_fast_tier` 前 `assert` 兜底，又在 audit ④ 项独立核验摘要——投毒（高潮镜降 Fast）即便绕过算法也会被审计抓（反例 NB2 依赖此）。
- **降级目标白名单从 registry 动态取**:`_allowed_downgrade_targets()` 读 D3 registry，**禁硬编码降级链**;registry 不可得才退弱依赖白名单——满足 NFR-04 复用门 + PRD §8 弱依赖。
- **货币扫描复用底座 `portability_scan`**:不另写货币正则（DRY），`CURRENCY` 正好命中 `5 元/次`/`2 积分`/`¥5`（反例 NB3 依赖此）。
- **确定性铁律**:全程无随机种子、无时间戳进判定区;`Report.to_json()` 用 `sort_keys`——同输入两次运行 JSON 逐字节一致。
- **退出码语义**:`exit 0=GO / 1=NO-GO`，直接喂 `make verify` 与 `reverse_test`。

### 4.3 成本规划摘要 + target schema（FR-04 · fixture 反序列化成此形态）

```jsonc
{
  "id": "D11_demo_qualityfirst",
  "cost_summary": {                         // ← 对内过程产物（FR-04 三项 + 可选超预算段）
    "est_count_range": [28, 34],            // NFR-05 区间，禁单值
    "total_gen_cost": 12.6,                 // Σgen_cost
    "triggered_strategies": ["默认不加reference_video", "G2 铺陈组降Fast→seedance-2.0-fast", "ImageToImage复用@LinChen基准图"],
    "over_budget": false,                   // FR-04 预算门
    "suggest": null                         // 超预算时给"建议降级组+降级后估算"
  },
  "shot_groups": [
    { "id": "G1", "shot_class": "establishing", "fill_ratio": 0.80, "is_fragmented": false,
      "tier": "standard", "is_strong_continuity": false, "downgrade_to": null },
    { "id": "G4", "shot_class": "climax", "fill_ratio": 0.93, "is_fragmented": false,
      "tier": "standard", "reference_video": "ref_prev", "downgrade_to": null },   // 禁降档镜:standard
    { "id": "G5", "shot_class": "faceswap_avatar_pov", "fill_ratio": 0.87,
      "tier": "standard", "downgrade_to": null }                                   // 禁降档镜:standard
  ],
  "final_text": "……镜头卡 + 每组 Seedance 成片提示词 + 四表（零成本痕迹）……"
}
```

### 4.4 `gen_fixtures.py`（成本规划合成投毒器）— 真值精确可控（可选）

成本审计是文本/JSON 结构核验，poison 直接对 clean JSON 做单变量字段篡改即可（无需图像生成器），用一个轻量派生函数集落地，让 fixture 可冷启动重建:

```python
# fixtures/gen_cost_fixtures.py — 从 clean.json 程序化派生 poison（单变量字段篡改，真值精确）
import json, copy
def leak_into_final(t):          # NB1:把成本词塞进成片末尾
    t = copy.deepcopy(t); t["final_text"] += "\n（gen_cost=0.6× 降级到 Fast 省积分，预计 30 次）"; return t
def downgrade_climax(t):         # NB2:把高潮镜降 Fast
    t = copy.deepcopy(t)
    for g in t["shot_groups"]:
        if g["shot_class"] == "climax": g["tier"] = "fast"
    return t
def break_fill_ratio(t, gid="G2"):  # FR-02:fill_ratio→0.40 且抹掉理由
    t = copy.deepcopy(t)
    for g in t["shot_groups"]:
        if g["id"] == gid: g["fill_ratio"] = 0.40; g.pop("fill_reason", None)
    return t
def fragment_group(t, gid="G3"):    # FR-02:碎切违规置位
    t = copy.deepcopy(t)
    for g in t["shot_groups"]:
        if g["id"] == gid: g["is_fragmented"] = True
    return t
def write_currency(cost_md_text):   # NB3:cost.md 写死货币
    return cost_md_text + "\n> 注:每次生成约 5 元 / 2 积分。\n"
```

---

## 5. 任务拆解（Tickets）

| Ticket | 描述 | 产物 | 工时(人天) | 前置 |
|---|---|---|---|---|
| **D11-T01** | 写 `cost.md` §A `gen_cost` 度量（基准 1.0× + 8 系数区间）+ 机读副本 `gen_cost_units.json`;grep 与 continuity「省积分/极耗积分」定性档对齐 | `cost.md §A` + `examples/gen_cost_units.json` | 0.75 | 底座 §2.1/§2.2 已落地 |
| **D11-T02** | 写 §B 5 策略成本决策表（五列 + 5 条交叉引用指向源条款，逐条 grep 核对锚点存在） | `cost.md §B` | 0.5 | T01 |
| **D11-T03** | 写 §C 主动降级决策表（≥4 类镜头属性 + NG4 禁降档行）+ §D 两套默认档（质量优先/预算优先 + NG4 豁免声明） | `cost.md §C/§D` | 0.5 | T01,T02 |
| **D11-T04** | 写 §E 预算估算/对账算法（cost_plan/reconcile 伪代码契约）+ §F 自检门（NG1/NG4 双闸 + 估算诚实区间 + 无 ledger 降级分支） | `cost.md §E/§F` | 0.5 | T03 |
| **D11-T05** | 实现 `audit_cost.py` 上半:REQUIRED_SUMMARY_KEYS 核验 + fill_ratio/碎切统计 + `_allowed_downgrade_targets()`（读 registry，弱依赖兜底） | `audit_cost.py` 上半 | 0.75 | T01-T04, D3 registry（弱依赖） |
| **D11-T06** | 实现 `run()@register("cost")` 全 7 项核验（含 NG4 禁降档闸 + NFR-04 复用门 + NFR-01 leak_scan + NFR-05 区间）+ `audit_currency` 货币子门 + `_cli` + `assert_fail_has_fix` | `audit_cost.py` 全 | 1.0 | T05 |
| **D11-T07** | `lexicon.py` 注册 `BY_DIRECTION["D11"]` 全集（§3②）;NFR-01 leak_scan 专项测试 | `lexicon.py`(改) + leak 测试 | 0.25 | T06 |
| **D11-T08** | 造黄金基线源:`cost_plan_demo.json`（6 组+3 角色+8 关键帧，含 1 高潮+1 换脸+4 铺陈/叙事，人工标 ground truth）+ 人读 demo `cost-plan-demo.md`（两档对比） | `examples/cost_plan_demo.json` + `examples/cost-plan-demo.md` | 1.0 | T04 |
| **D11-T09** | 造 fixture:`D11_cost.clean/poison.json`（4 投毒）+ `D11_downgrade.clean/poison.json` + `D11_currency.poison.json` + `gen_cost_fixtures.py` 派生器;写 `assert_gate_is_real` ×3 子门测试 | `fixtures/D11_*.json`(5) + 派生器 + 测试 | 1.0 | T06,T08 |
| **D11-T10** | 对 demo 跑成本规划→冻结 `cost_plan.golden.json`（snapshot.freeze）;写回归"重跑 fill_ratio/Σgen_cost/触发策略无漂移"断言 | `baselines/jadepavilion/cost_plan.golden.json` + 回归测试 | 0.5 | T06,T08 |
| **D11-T11** | 四处源条款追加交叉引用注脚:continuity 一·3/一·4/二·2/二·7、output-contract §5、seedance §0（原文字不动，grep 验证注脚存在） | 3× .md(改) | 0.5 | T02 |
| **D11-T12** | storyboard/production-bible SKILL 路由表各加"成本规划"一行（正文 ≤5 行 diff）;README 骨②行+目录树注册 cost.md;megaprompt 内联 cost 核心表 | 2× SKILL(改) + README(改) + megaprompt(改) | 0.5 | T04 |
| **D11-T13** | `@register` 接 run_eval;接 Makefile `verify`;`reverse_test --all` 纳入三子门;portability_scan(cost.md)=0 接通 | run_eval/Makefile 接通 | 0.25 | T06,T09,T10 |
| **D11-T14** | (M4,付费由用户亲点)1 个脱敏原创短片真机出片→规划次数 vs ledger 实际对账 + gen_cost 系数校准 + A/B 盲评（软指标） | 对账报告 + 系数校准结论 | 0.5 | T13 + 宿主 ledger |

> 合计约 **9.5 人天 ≈ 1.9 人周**（不含 T14 真机 0.5d 的用户排期等待），与 PRD §10 估的 1.5–2.0 人周吻合（底座复用省下脚手架工量）。关键路径 T01→T02→T03→T04→T05→T06→T09→T10，T11/T12 可与 T09 并行。

---

## 6. 测试方案

全部调用底座，不重造。`assert_gate_is_real` / `run_eval` / `snapshot` / `portability_scan` 口径与全套件一致。

### ① 正例（clean 基线:用哪份，期望 GO）

- 用 `D11_cost.clean.json`:内容 = `cost_plan_demo.json` 跑**质量优先档**（无 budget_cap）的成本规划摘要——只触发零损失策略（打满/默认不加参考/ImageToImage 复用），高潮镜（G4）/换脸镜（G5）全 `tier:standard`，每组 `fill_ratio ≥ 0.67`，`is_fragmented:false`，`downgrade_to` 全在白名单或 null，`final_text` 段零成本词。
- 期望:`audit_cost.run(clean)` → 0 个 FAIL → `decision=GO`、`exit_code=0`。对应 **DoD-1/2/4/5**。
- 回归用:此摘要即 `cost_plan.golden.json` 的内容，`snapshot.freeze` 冻结为 B0。

### ② 反向注入（poison fixture:具体投毒什么数据，期望 FAIL + 期望测回值）

`D11_cost.poison.json` = clean 复制后施加**四处独立投毒**（每处单独验，互不掩盖），真值精确可逐项核对:

| 投毒点 | 具体投毒（精确） | 命中 check | 期望测回值（硬核对） |
|---|---|---|---|
| **NB1 隐身泄漏（一票否决）** | 把 `final_text` 尾部塞入 `（gen_cost=0.6× 降级到 Fast 省积分，预计 30 次）` | `D11-NFR-01` | leak_scan 命中 `gen_cost`/`降级到 Fast`/`省积分`/`预计`，FAIL，`exit_code==1` |
| **NB2 禁降档镜降 Fast** | 把高潮镜 G4 的 `tier` 从 `standard` 改成 `fast` | `D11-NFR-03` | 测回 `measured="fast", threshold="standard(禁降)"`，FAIL，NO-GO |
| **NB3 窗口未打满无理由** | 把铺陈组 G2 的 `fill_ratio` 从 `0.80` 改成 `0.40` 且删 `fill_reason` | `D11-FR-02` | 测回 `measured=0.40 < threshold=0.67`，FAIL |
| **NB4 碎切违规** | 把 G3 的 `is_fragmented` 置 `true`（模拟组内 3 个 2s 镜各自送生成） | `D11-FR-02` | 测回 `碎切违规数 measured=1 > threshold=0`，FAIL |

**独立子门 poison（证子门会红）:**

- `D11_downgrade.poison.json`:把高潮镜 `tier=fast` + 换脸镜 `reference_video=null`（且无 `ref_intentionally_omitted_ok`）→ 两条 `D11-NFR-03` FAIL，测回两个禁降档镜被违规降级。直接对应 PRD 验证方案"对高潮镜降 Fast → 必报不合格"。
- `D11_currency.poison.json`:cost.md 文本片段塞入 `每次生成约 5 元 / 2 积分` → `audit_currency`（底座 `portability_scan`）命中 `CURRENCY` 正则 `\d+\s?元/次`、`\d+\s?积分`，FAIL。直接对应 PRD 验证方案"写死货币 → 货币扫描必报不合格"。
- 另:把某组 `downgrade_to` 投毒为 `"my-custom-fast"`（不在 D3 链）→ `D11-NFR-04` FAIL，测回 `downgrade_to ∉ _allowed_downgrade_targets()`（验复用门 R5）。

> 真值由字段篡改注入（`gen_cost_fixtures.py` 派生），故"测回的判定 ≈ 注入的违规"可逐项核对——这是"真的有效"的硬证据，非主观感受。对应 **DoD-6**。

### ③ `assert_gate_is_real` 调用示例

```python
# tests/test_d11_cost.py
from harness.reverse_test import assert_gate_is_real
from audits.audit_cost import run as audit_run, audit_currency
import json
def _load(p): return json.load(open(p, encoding="utf-8"))

def test_cost_gate_is_real():
    assert_gate_is_real(audit_run,
        clean_sample=_load("_shared/scripts/fixtures/D11_cost.clean.json"),
        poison_sample=_load("_shared/scripts/fixtures/D11_cost.poison.json"),
        name="D11-cost")                       # 默认 poison = NB1 隐身泄漏变体

def test_downgrade_gate_is_real():             # NG4 禁降档子门
    assert_gate_is_real(audit_run,
        _load("_shared/scripts/fixtures/D11_downgrade.clean.json"),
        _load("_shared/scripts/fixtures/D11_downgrade.poison.json"),
        name="D11-no-downgrade")

def test_currency_gate_is_real():              # NFR-02 货币子门（对 cost.md 文本）
    clean_md  = open("_shared/cost.md", encoding="utf-8").read()
    poison_md = clean_md + "\n> 注:每次生成约 5 元 / 2 积分。\n"
    assert audit_currency(clean_md).exit_code == 0      # 干净 cost.md 放行
    assert audit_currency(poison_md).exit_code == 1     # 写死货币报红

def test_climax_no_downgrade_value():          # 真值核对:测回禁降档镜被降
    rep = audit_run(_load("_shared/scripts/fixtures/D11_cost.poison.json"))
    f = next(x for x in rep.findings if x.check == "D11-NFR-03")
    assert f.verdict.value == "FAIL" and f.measured == "fast"
```

`assert_gate_is_real` 内部断言:clean→`exit_code==0`（不误杀），poison→`exit_code==1`（不橡皮图章）。任一不满足 → 测试红。

### ④ 回归:冻结哪份黄金基线，改什么后重跑应如何

- **冻结**:`cost_plan.golden.json` = `cost_plan_demo.json` 跑质量优先档的成本规划摘要（全 GO、含 6 组 fill_ratio / Σgen_cost / 触发策略清单）。`snapshot.freeze(summary, golden_path)`。
- **改后重跑**:套件任何升级（调 `gen_cost` 系数 / 改决策表 / 动 fill_ratio 下沿 / D3 换默认降级链）后，对**同一份 demo** 重跑 `cost_plan`，`diff_against_golden(current, golden_path)`:
  - **改 `gen_cost` 系数**（如 fast_tier 从 [0.5,0.7] 调到 [0.4,0.6]）→ Σgen_cost 漂移 → WARN → 人审:有意校准（真机对账后）则 `re-freeze`，否则回滚。
  - **改 fill_ratio 下沿**（0.67→0.70）→ 某组从 PASS 变 FAIL → 结构变化须有理由，否则回归。
  - **D3 换默认降级链**（registry `seedance-2.0-fast`→其它）→ `_allowed_downgrade_targets()` 集合变 → demo 触发策略清单的降级目标字符串变 → diff WARN，确认 D3 改动有意则 re-freeze。
- **铁律 grep（DoD-6）**:对成片镜头卡 + Seedance 提示词跑 `leak_scan(final_text, extra_terms=BY_DIRECTION["D11"])`，成本词（`gen_cost|Σgen_cost|相对代价|预算|省积分|省钱|降级到 Fast|cost_summary|fill_ratio`）+ 引擎术语（`Polanyi|默会|支柱|方法论`）命中 **= 0**;反例 NB1 → 必报命中（证明闸是真闸）。

### ⑤ 真机那一层怎么验（付费按钮由用户点 · DoD-12）

- M4/T14:取 1 个脱敏原创短片，**先**跑成本规划得"预计次数 N±容差 + Σgen_cost"，**再**由用户亲点付费真机出片（宿主 ledger 记实际生成次数），最后对账。**两条核心断言**:
  - (a) 规划次数 N 区间**命中** ledger 实际（或给出系数校准量）——`reconcile(summary, ledger)` 的 `diff` 落在 ±容差内，否则产 `CalibrationNote` 校准 `gen_cost`。
  - (b) 启用省钱策略（打满/默认不加参考/铺陈降 Fast）后实际次数**显著低于**"不省钱基线估算"——这是"真省钱"的客观证据，账单不会撒谎。
- A/B 盲评（软指标，非阻塞门）:对非刚需镜双盲给 ≥3 人评"是否看得出降档"，盲评无显著差异 → 证明省钱没破质量下界。对应 **DoD-12**。**付费生成按钮由用户亲自点**，本方向只产规划与对账对接，不调 API。

**为何这样能证明"真的有效":** 结构闸（脚本）+ 基线 diff 证明"成本规划产物形态正确、5 策略收口、降级目标复用既有链、过程产物不泄漏";反例 NB1/NB2/NB3（成本词漏成片/高潮镜禁降档/货币写死）证明三条铁律闸是**真闸**（能拦截），非摆设;真机账单对账把"省没省钱"落到**客观秤**（ledger 实际次数）——这才是"真省钱"的最终证据（PRD §7 自评扣分主因即此层无法纯文本自证）。

---

## 7. 里程碑与退出门

| Milestone | 产物 | 退出门（哪些脚本必须绿 / 哪些 DoD 必须过） |
|---|---|---|
| **M1 · 成本 SoT 与决策表（~0.7 周）** | `cost.md`（§A `gen_cost` 度量 + §B 5 策略表 + §C 主动降级表/NG4 禁降档行 + §D 两套默认档 + §E 预算估算/对账算法 + §F 自检门）+ `gen_cost_units.json` | **DoD-1**（gen_cost 基准 + 5 策略五列 + 交叉引用）、**DoD-3**（降级表 ≥4 类属性 + NG4 禁降档行 + 降级目标 ∈ 既有链）、**DoD-5**（两套默认档成文 + NG4 豁免声明）、**DoD-7**（cost.md grep 货币=0，只相对系数）绿。**M1 完成即可单独评审成本 SoT 草案** |
| **M2 · 审计脚本与禁词（~0.4 周）** | `audit_cost.py` 全（7 项核验 + 货币子门 + exit 码）+ `lexicon.BY_DIRECTION["D11"]` 注册 | **DoD-2**（fill_ratio + 碎切统计）、**DoD-4**（摘要三项 + 超预算建议段 + 对账段）、**DoD-9**（降级目标交叉引用 registry、未整段复制）、**DoD-10**（NFR-05 区间）绿;`audit_cost --help` 纯标准库独立跑 |
| **M3 · 测试/回归/接入（MVP 切线，~0.4 周）** | clean/poison + 禁降档/货币子门 fixtures + `gen_cost_fixtures.py` + `cost_plan.golden.json` + reverse_test/run_eval/Makefile 接通 + 四处交叉引用 + SKILL/README/megaprompt 注册 | **DoD-6**（NB1 隐身/NB2 禁降档/NB3 货币三反例测回准）、**DoD-8**（禁降档清单 + 对高潮镜降 Fast 反例报红）、**DoD-11**（路由表 ≤5 行 diff + 四处注脚 + README + megaprompt 内联）绿;**`assert_gate_is_real` ×3 子门全过**;`run_eval` 含 cost 跑绿;`make verify` 四项 GO |
| **M4 · 真机账单对账（~0.4 周，付费由用户亲点·可后置）** | 1 个脱敏原创短片真机出片 + 规划次数 vs ledger 实际对账 + gen_cost 系数校准 + A/B 盲评 | **DoD-12**（规划次数命中 ledger 或给校准量;省钱策略生效=实际<不省钱基线;盲评看不出降档） |

> **MVP 切线 = M1+M2+M3**:成本 SoT + 成本规划步 + 预算估算（对内）+ 三条铁律闸 + 可重跑回归门是"可验证"核心（FR-01~06 + 核心 NFR），优先于 M4 真机。关键路径 M1→M2→M3，M3 的审计脚本（含三条铁律闸）是"可验证结构性质"的核心交付，优先于 M4。**退出门即合入门**:任何动 `_shared/` 的 PR 必过 `make verify` 四项（run_eval / reverse_test / leak_scan / portability）全 GO 才许合（完善④，不可绕过）。**M4 真机账单对账作第二批迭代**——因依赖付费 + ledger，且 `gen_cost` 系数校准本就需多轮真机才稳（PRD 落地可靠性 3/5 的扣分主因）。

---

## 8. 风险与回滚

| 风险 | 影响 | 缓解 / 回滚 / 降级 |
|---|---|---|
| **R1 `gen_cost` 系数不准 / 与真实账单偏差大**（落地可靠性偏低主因） | 预算估算失真、用户被误导 | 系数明给区间不假装精确（NFR-05，脚本强制 `est_count_range` 为区间）;真机后 ledger 对账校准（FR-04 `reconcile`）;首版只承诺"量级正确 + 相对排序正确"，不承诺绝对精确。**回滚**:系数是数据（`gen_cost_units.json` 可调，无需改码），偏差大则 re-freeze 基线 |
| **R2 成本痕迹漏进成片**（引擎隐身破口:gen_cost/预算/降级理由） | 破铁律一票否决 | NFR-01 硬闸 + DoD-6 leak_scan + 反例 NB1;成本摘要全标"对内过程产物"、物理分段隔离（只存 `.cost/`）。**反例 NB1 是真闸的证明**——闸失效会被 reverse_test 抓。回滚:泄漏即 NO-GO，阻断合入 |
| **R3 为省钱击穿质量下界**（高潮/换脸镜被降 Fast） | 一致性塌方、废稿 | NFR-03 + NG4 禁降档清单（`NO_DOWNGRADE_CLASSES`）+ DoD-8 反例 NB2;降级前 `assert` 兜底 + audit ④ 独立核验**双保险**;`assert_quality_floor` 复用 continuity 二。回滚:禁降档镜被降即 FAIL，revert |
| **R4 写死货币/积分价导致过时**（宿主计费规则漂移） | 可移植性破功、估算误导 | NFR-02 货币扫描门（复用底座 `portability_scan`）+ 反例 NB3;`gen_cost` 只用无量纲相对系数;真实换算交宿主 ledger。回滚:cost.md 改动须过 portability_scan，红则 revert |
| **R5 与 D3/continuity 降级链重复定义**（双写漂移） | 改一处漏一处 | NFR-04 复用门:`_allowed_downgrade_targets()` 从 D3 registry 动态取，脚本断言"降级目标 ∈ 既有链"，禁硬编码;首尾帧/视频参考/超分全交叉引用 continuity，不整段复制。回滚:新造链即 FAIL |
| **R6 自动降级越权**（替用户做了省钱决策/自动付费） | 违反"付费用户亲点"、用户失控 | NG3:D11 只产"建议降级方案"（`summary.suggest`），不自动执行降级、不自动付费;预算门只提示、放行由用户（复用 D1 `pause_gate`），超预算缺建议段即 FAIL |
| **R7 成本规划步拖慢出稿 / 上下文膨胀** | 加载成本上升、管线变重 | FR-06 渐进式披露:cost.md 按需 Read，管线正文增量 ≤5 行;规划纯文本 0 真机调用、`audit_cost.py` 纯标准库轻量 |
| **R8 质量下界判定主观**（"看不出降档"因人而异） | A/B 评不稳、省钱边界模糊 | A/B 盲评作软指标非阻塞门;硬性下界（≤15s/音画≤1帧/画幅）由 continuity 二脚本卡死，主观区只在"非刚需镜"动手 |

**宿主能力缺失的降级路径（NFR-02 / PRD §8）:** 真机出片 + ledger 对账（DoD-12）依赖宿主/ViMax provider 的生成通道 + ledger 计费。**若宿主无 ledger**:成本规划摘要降级为"只给预计次数区间 N、不给货币、不对账"，契约不变、套件不瘫——文本成本规划（M1-M3 全部）**不依赖任何宿主能力**（纯估算）。**若 D3 registry 未落地**:`_allowed_downgrade_targets()` 退弱依赖白名单（`continuity-quality.md 二·7` 散落链），不阻塞 M1-M3 交付。这与 PRD 落地可靠性自评 3/5 一致——本方向主体是文档/规范 + 结构审计工程（M1-M3 全确定性自证），真机账单对账（M4）仅为"真省钱"终极佐证而非交付前置，且需多轮真机校准系数才稳。

---

> **契约版本**:DEV-D11 v0.1 ｜ 缺口类 A有脑无手/B单向单模单模型（混合，以 A 为主）｜ 优先级 P2 ｜ 落地可靠性 3/5 ｜ register 名 `cost` ｜ 接 00-ENGINEERING-SUBSTRATE.md 全套 harness（audit_report / leak_scan+lexicon / portability_scan / snapshot / reverse_test / run_eval / registry）。新增 `_shared/cost.md`（成本规划 SoT·骨②/规格层;收口 5 条散落省钱纪律 + 引入 `gen_cost` 相对度量 + 预算估算/对账 + 成本-质量双向决策两套默认档）;**复用 D3 `model_registry.json` 降级链/模型分级（只读）+ D1 `pause_gate` 暂停门 + continuity 首尾帧/视频参考/超分/质量下界（交叉引用，不整段复制）**;引擎隐身铁律扩展为"成本规划层绝不漏进成片"（NFR-01 一票否决），NG4 新增"省钱不击穿质量下界·高潮/换脸/数字人/POV/强连续禁降档"硬约束（脚本 `NO_DOWNGRADE_CLASSES` 双保险守门）。MVP 切线 = M1+M2+M3（成本 SoT + 审计脚本 + 三条铁律闸 + 黄金基线回归，全确定性自证）;M4 真机账单对账后置/迭代（依赖付费 + ledger，落地可靠性 3/5 扣分主因即此层不能纯文本自证）。
