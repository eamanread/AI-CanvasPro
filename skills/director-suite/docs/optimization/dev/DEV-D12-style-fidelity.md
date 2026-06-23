# D12 · 作者论保真 + 题材禁用触发词库 开发方案

> 编号 D12 ｜ 优先级 P2 ｜ 状态 Dev v0.1 ｜ 前置:[D12-style-fidelity.md（本方向 PRD）](../D12-style-fidelity.md) + [00-ENGINEERING-SUBSTRATE.md（共享底座）](./00-ENGINEERING-SUBSTRATE.md)
>
> PRD 答 *what/why*；本文件答 *how-to-build*——把 D12 接到共享底座上，**不重造任何验证脚手架**。
> 我只交付:审计插件 `audit_style_fidelity.py` + 一对 clean/poison fixture + 黄金基线 + 知识/契约文件（Bone 层 `_shared/style-refs-auteur.md`）+ 任务拆解。
> D12 是缺口类 **D（覆盖与品味）** 的 P2 横切护栏:作者保真"像不像"天然难数值验,本方向的工程姿态是**把可数值化的"词级"切出来做成确定性硬闸（禁用触发词命中 + 作者锚缺漏）**,把不可数值化的"画面级"诚实交给 D09 基线对图 + 人评 A-B。词级闸是底座插件,画面级闸是异步品味验。

---

## 1. 目标与范围

实现 PRD 的 **D12-FR-01..05 / NFR-01..05**:新增一份 **Bone 层共享知识 `_shared/style-refs-auteur.md`**（逐作者保真锚组 schema + 逐题材禁用触发词→改用词表 + D09 验证规程 + 挂载位/隐身闸），并实现其**确定性词级执行器** `_shared/scripts/audits/audit_style_fidelity.py`（纯标准库、不读图、不调模型，扫 `banned_triggers` 命中 + `must_anchor` 缺漏，输出统一 `Report`，以退出码表达 GO/NO-GO）。保真审计是**横切关注点**:**写完提示词后、进 Seedance/出图前**由各视觉/视频成员（character-board/keyframe/storyboard）调用——把 `style-refs.md §五「取锚原则」` 的口号级一行落成逐作者清单,把 §十 题材无关的通用反面清单扩成题材专属的"好词陷阱"黑名单。指回 PRD 的 **FR-01..05**。

**本方向作为"底座插件"的边界(纪律铁律):**

- **复用不重造**:报告结构 / GO-NO-GO / 退出码 / `leak_scan` / `snapshot` / `reverse_test` / `run_eval` / `registry` 全部用 `00-ENGINEERING-SUBSTRATE.md` 定义的共享 harness。我**只**写业务判据（`audits/audit_style_fidelity.py` 的词级匹配与判定）、一对 fixture、一份黄金基线、一份 Bone 知识 + 4 个样板作者条目 + 1 个导出 JSON 样例、若干处注册/交叉引用改动。
- **零业务知识下沉到底座**:作者锚组 schema、禁用触发词→改用词表、中英别名归一表、画面级 `NEEDS_D09` 分流规则**全部**写在 `_shared/style-refs-auteur.md`（Bone 知识）与插件私有逻辑里;只往 `lexicon.BY_DIRECTION["D12"]` 注册禁词、往 `_shared/scripts/audits/` 放一个插件。
- **不碰 Soul**:不改 `tacit-core.md`;引擎隐身铁律继承 `style-refs.md §十` + `storyboard/output-contract.md §7.8`（实为 §7 第 8 条「自检不外显」），扩展为"**禁用词表/作者锚缺漏报告/命中清单 绝不漏成片**"（NFR-01）。
- **只读消费、不改语义**:`style-refs.md` 附录A（line 187–189，韦斯逐影片色板/邵氏棚味/日系胶片）、附录B（line 194–237，哇塞招式库含 HappyHorse 东亚文艺 line 198/209、邵氏 line 236、韦斯 line 237）、§五「取锚原则」（line 112）、§六分题材速查表（line 116–134）既有字段语义零改动,只追加交叉引用注脚。
- **关键边界区分（NG1，本方向特有、易踩）**:`must_anchor` 的**正向风格术语**（`Wes Anderson symmetry, Futura signage, powder-pink palette` 等）是**合法成片词、本就该进提示词**;隐身禁的是"**禁用词表本身 / 命中清单 / 缺漏报告 / 保真✓脚注**这类过程元数据"。`leak_scan` 黑名单只列审计元数据词,**绝不**把正向风格锚词列入——否则会误伤合法风格词、保真反降（R3）。
- **诚实承认品味难数值验**(PRD NG4):脚本只判"**词面**"（禁用词出没出、锚词齐不齐）;"**画面像不像该作者**"无法靠词级脚本判定,输出 `NEEDS_D09` 行、**不臆造"保真度=87分"伪数值**,转 D09 基线对图 + 人评 A-B。
- **MVP 切线**:`audit_style_fidelity.py` 的**词级确定性闸**（禁用词命中 + 作者锚缺漏 + 中英别名归一 + 合成提示词真值校准 + 反向注入 + leak_scan）是可验证核心,优先于 M4 真机出图 A-B（付费由用户亲点、依赖 D09 就绪）。

---

## 2. 交付物清单(精确文件路径表)

| 路径 | 类型 | 说明 |
|---|---|---|
| `skills/director-suite/_shared/style-refs-auteur.md` | 知识md | **Bone 层主交付**:FR-01 作者锚组 schema（5 字段）+ 4 个填满作者条目（wes_anderson / shaw_brothers_wuxia / jp_heisei_youth / happyhorse_east_asian_arthouse）+ FR-02 逐题材禁用触发词→改用词表（4 题材各 ≥5 条）+ FR-03 报告结构 + FR-04 D09 验证规程 + FR-05 挂载位/隐身闸 + NFR-02 脚本缺失降级模型审分支 + 中英别名归一表 + 增补规程 |
| `skills/director-suite/_shared/scripts/audits/audit_style_fidelity.py` | audits插件py | 实现 `run(target)->Report` 并 `@register("style_fidelity")`;CLI `--auteur/--prompt/--rules/--json-out/--md-out`;词级 `banned_triggers` 命中 + `must_anchor` 缺漏两项确定性匹配 + `NEEDS_D09` 分流;`exit 0=GO / 1=NO-GO`;仅标准库、不读图、不调模型 |
| `skills/director-suite/_shared/scripts/examples/auteur_wes_anderson.json` | 样例md(JSON) | FR-01 样板作者条目（导出供脚本消费 + 对图核验主对象）:`wes_anderson` 7 项 must_anchor + 3 条 banned_triggers + source 溯源附录A/B（对图核验主对象,数据接地附录A 韦斯逐影片色板） |
| `skills/director-suite/_shared/scripts/examples/auteur_shaw_brothers_wuxia.json` | 样例md(JSON) | FR-01 第二样例:`shaw_brothers_wuxia` 6 项 must_anchor + 5 条 banned_triggers（含 `drone shot`/航拍 中英别名），验证 poison 投毒主对象（DoD-6） |
| `skills/director-suite/_shared/scripts/examples/aliases.json` | 样例md(JSON) | FR-03 中英别名归一表机读副本（脚本默认载入;`推轨↔dolly`/`航拍↔drone shot`/`慢镜↔slow-mo`…），与 .md 别名表逐字一致 |
| `skills/director-suite/_shared/scripts/examples/auteur_baselines/` | baselines | FR-04 D09 基线提示词集:4 风格各 ≥3 条覆盖典型镜头（建立镜/中近景/名场面气质），落盘供画面级对图 + A-B 盲评 + 词级回归基线 |
| `skills/director-suite/_shared/scripts/fixtures/D12_style_fidelity.clean.json` | fixtures | clean 正例:"压满韦斯锚组 + 零禁用词"提示词,期望 `audit→GO, exit0`,禁用命中=0 且作者锚缺漏=0（T1） |
| `skills/director-suite/_shared/scripts/fixtures/D12_style_fidelity.poison.json` | fixtures | poison 反例:3 个独立投毒变体（邵氏注入 `drone shot`/裸 `Wes Anderson` 无 must_anchor/中文"航拍"别名），各期望 `FAIL` 且测回特定命中（T2-T4，§6②） |
| `skills/director-suite/_shared/baselines/auteur/style_fidelity.golden.json` | baselines | 黄金基线:对 4 风格 D09 基线提示词集自审（压满锚组、无禁用词 → 全 GO）冻结为回归参照（snapshot.freeze） |
| `skills/director-suite/_shared/scripts/lexicon.py`(改) | registry项 | 往 `BY_DIRECTION` 新增 `"D12"` 键（PRD 底座未预置）,注册本方向审计元数据禁词全集（§3②）。**正向风格锚词不入此集** |
| `skills/director-suite/_shared/style-refs.md`(改) | 契约md(追加) | §五 footer 追加交叉引用注脚（→逐作者保真锚组与题材禁用触发词表见 style-refs-auteur.md，§五原 7 行口号表升为"快速索引"不动）;§十 末追加一句（题材专属禁用触发词带改用词见 style-refs-auteur.md，§十通用清单不动）。**原条款文字不动** |
| `skills/director-suite/storyboard/output-contract.md`(改) | 契约md(追加) | §7 第 8 条「自检不外显」追加一句（保真审计产物=禁用词表/作者锚缺漏报告同属过程绝不进成片;但正向风格锚词照常合法进提示词）。原铁律文字不动,补边界澄清 |
| `skills/director-suite/README.md`(改) | registry项 | 「② 骨」一行（line 14）文件清单追加 `style-refs-auteur.md`;目录树 `_shared/`（line 55–60，"8件"→"9件"）下新增该文件与 `scripts/` 节点 |

> **只读消费、不改语义**:`_shared/style-refs.md` 附录A/B + §五 + §六（作者特征/招式/题材气质的上游原料来源）、`_shared/tacit-core.md`（引擎隐身铁律来源,零改动）、D09 基线/对图能力（被审画面的产出与对图方）。
> **register 名备注**:本方向 register 名取 `style_fidelity`（与 D5 `consistency` 区分;二者正交——D5 审"漂没漂"、D12 审"像不像该作者",可共用 `.audit/` 过程目录与"出稿后→闸→NO-GO 回修"范式,判据维度不同、不重叠，NG3）。

---

## 3. 与共享底座的接线

### ① 复用 harness 哪些构件

| 底座构件 | D12 怎么用 |
|---|---|
| `harness/audit_report.py`(§2.1) | `audit_style_fidelity.run()` 返回 `Report`;每条禁用命中 `append Finding(check="D12-FR-03", verdict=FAIL, detail="禁用触发词 'drone shot' 命中(line 2)", measured="drone shot", threshold="banned", fix="删 drone shot，改 static staged wide + 35mm stage backdrop")`;每项作者锚缺漏 `append Finding(check="D12-FR-03", verdict=FAIL, detail="作者锚缺漏: 35mm painted stage backdrop", fix="补该作者锚到提示词")`;画面级 `append Finding(check="D12-FR-04", verdict=PASS, detail="色板/构图/光质 → NEEDS_D09(词级脚本不判)", measured="NEEDS_D09")`;收尾 `rep.assert_fail_has_fix()`;`decision`(有 FAIL→NO-GO)/`exit_code`(0/1) 走统一语义。**判定区零时间戳**——审计时间戳只入报告 header 元数据、不进 `Report.findings`（NFR-03）。 |
| `harness/leak_scan.py` + `lexicon.py`(§2.2) | NFR-01 铁律闸:对**成片**（镜头卡 + Seedance 提示词 + 四表）跑 `leak_scan(final_text, extra_terms=lexicon.BY_DIRECTION["D12"])`,命中审计/引擎术语即 FAIL。`PROCESS_TERMS` 已含 `审计/PASS/FAIL/回归`——D12 的核心泄漏词部分被底座覆盖,本方向补"禁用触发词/banned_trigger/作者锚缺漏/must_anchor缺/保真✓/fidelity_report/NEEDS_D09"差集。**关键:`leak_scan` 黑名单只列审计元数据词,绝不列 `Wes Anderson`/`Futura`/`powder-pink` 等正向风格锚词**（边界反例 T7 守门,证明闸不误伤合法风格词）。 |
| `harness/snapshot.py`(§2.4) | `freeze(self_audit_report, "baselines/auteur/style_fidelity.golden.json")` 冻结 4 风格 D09 基线集自审报告（全 GO）;套件升级后 `diff_against_golden(current, golden_path)` 回归——断言"对基线集重跑 禁用命中=0 且作者锚缺漏=0"（缺口类 D 在**可数值化的词级维度**上的回归门）。 |
| `harness/reverse_test.py`(§2.5) | `assert_gate_is_real(style_fidelity_gate, clean_sample, poison_sample, name="D12-style_fidelity")`——证明闸对 clean（压满韦斯锚组、无禁用词）放行 exit0、对 poison（邵氏含 `drone shot`）报红 exit1。**无反例的闸视为未完成**（完善⑥）。 |
| `harness/run_eval.py`(§2.6) | `@register("style_fidelity")` 让插件自动进 `run_eval` 的基线 × 全审计 GO/NO-GO 编排;纳入 `make verify` 合入门。任何动 `_shared/` 的 PR 不过四项 GO 不许合（完善④）。**注意**:run_eval 的 5 题基线（文戏/武戏/POV/商业/拟人）需携带 `auteur_key`，本方向只对**声明了作者锚的镜组/题材**审计;未绑作者的镜组 `style_fidelity` 返回空 `findings`（GO，不强加作者锚）。 |
| `registry.py` / `model_registry.json`(§2.7) | **弱引用**:词级审计本身不选模型、不调模型（NFR-04 零付费）。仅 D09 画面级验证规程（FR-04，写在 .md）说明出图走 `registry.reg()["image"]["default"]`（默认 nano-banana-pro），不硬编码模型名;A-B 盲评两版用**同一图像模型**只换锚组（控变量，R1）。审计脚本路径 0 付费调用。 |

### ② 往 `lexicon.BY_DIRECTION` 加哪些禁词

PRD 底座**未预置** `"D12"` 键（`BY_DIRECTION` 仅有 D5/D8/D4）。本方向**新增**为「审计元数据层专属、绝不可漏进成片」的全集:

```python
# lexicon.py 改后
BY_DIRECTION = {
    ...,
    "D12": [
        # —— 审计元数据词（命中成片即泄漏）——
        "禁用触发词", "banned_trigger", "banned_triggers",
        "作者锚缺漏", "must_anchor缺", "must_anchor 缺", "anchor_missing",
        "保真✓", "保真度", "fidelity_report", "style_fidelity",
        "banned_hits", "NEEDS_D09", "改用词→", "替换词建议",
        ".audit/", "auteur_rules", "rules_version",
        # 注：以下是“过程报告里才出现”的判定词，进成片即泄漏
        "禁用命中", "锚缺漏", "GO/NO-GO",
    ],
    # ❌ 绝不列入：Wes Anderson / Futura / powder-pink / 邵氏 / Shaw Brothers
    #    Kodak Gold 200 / 古筝 / pipa …（这些是 must_anchor 正向风格锚词，合法进提示词）
}
```

> 这些词命中成片即 NFR-01 违反。反例 T6（把一行保真命中报告注入镜头卡）依赖此集让 `leak_scan` 报红,证明隐身闸是真闸;边界反例 T7（把 `Wes Anderson symmetry, Futura signage` 写进提示词）依赖此集**不含**风格锚词,证明闸不误伤（DoD-4）。

### ③ 是否引用 model_registry

**弱引用**:词级审计脚本本身不选模型、不调模型（NFR-04 零付费调用）。仅 FR-04 D09 画面级验证规程（写在 `style-refs-auteur.md`）在说明"跑真机出图做对图 + A-B"时,模型走 `registry.reg()["image"]["default"]`（默认 nano-banana-pro）,不硬编码模型名。A-B 盲评两版（压满锚组 vs 口号锚）用**同一图像模型**只换锚组以控变量。换模型改 registry 一处即可。

### ④ 新增 `audits/audit_style_fidelity.py` 的 register 名

`@register("style_fidelity")`——`run_eval` 的 `AUDIT_REGISTRY` 以此名挂载,与 D5 `consistency` 并列横切每题。命名避免与 D5 混淆（D5=一致性、D12=作者保真，正交且互补）。

### ⑤ 接上底座的 5 件 Done 清单(对照 00-SUBSTRATE §3)

```
1. audits/audit_style_fidelity.py 实现 run(target)->Report 并 @register("style_fidelity")  ✔ T05/T06
2. 往 lexicon.BY_DIRECTION["D12"] 注册审计元数据禁词集（不含风格锚词，§3②）              ✔ T10
3. fixtures/ 放一对 clean + poison，测试里 assert_gate_is_real                              ✔ T07/T08
4. 涉模型选择处一律 registry.reg()（仅 FR-04 D09 验证规程文案），禁硬编码模型名             ✔ T03
5. baselines/ 放黄金基线 style_fidelity.golden.json，纳入 run_eval 与 snapshot 回归          ✔ T09
```

---

## 4. 实现分解(可照着写的真实骨架)

### 4.1 `_shared/style-refs-auteur.md`(Bone 知识)— 五件套结构

#### (A) 作者保真条目 schema(FR-01，写入 .md，JSON 形态供脚本消费)

每个 `auteur_key` 绑一份条目,从 `style-refs.md` 附录A/B 既有原料**升格**为结构化条目。**5 字段齐全**（缺一不合格）:`{must_anchor | anchor_boundary | banned_triggers | source | genre_tags}`。`must_anchor` **每条作者 ≥6 项物理可见特征**（构图秩序/机位/色板hex/字体/画幅/光质/节奏惯例，口号词如裸 `cinematic` 不计入）;**正向英文术语本就是合法风格词、可进提示词**（NG1）。

```jsonc
// examples/auteur_wes_anderson.json — 数据接地 style-refs.md 附录A(line 189) + 附录B(line 237)
{
  "auteur_key": "wes_anderson",
  "display": "韦斯·安德森 Wes Anderson",
  "schema_version": "1.0",
  "must_anchor": [                                                   // ≥6 项物理可见特征
    { "anchor": "perfectly centered symmetrical composition",       "facet": "构图秩序", "aliases": ["中心对称构图", "symmetrical framing"] },
    { "anchor": "frontal flat planimetric staging",                 "facet": "平面化正交", "aliases": ["正交平移机位", "planimetric"] },
    { "anchor": "snap pan / orthogonal whip-pan transitions",       "facet": "机位运动惯例", "aliases": ["平移转场", "whip pan"] },
    { "anchor": "powder-pink #F4C2C2 / lavender #B57EDC / cream #FFF8E7 pastel palette", "facet": "具体色板", "aliases": ["糖粉玫红", "薰衣草紫", "奶油白"] },  // 承附录A，非裸 pastel
    { "anchor": "Futura geometric sans-serif signage & title cards", "facet": "字体", "aliases": ["Futura 标牌", "几何无衬线标题卡"] },
    { "anchor": "1:1.85 academy-ish flat ratio, 35mm film grain",    "facet": "画幅/胶片", "aliases": ["35mm 胶片", "学院画幅"] },
    { "anchor": "miniature dollhouse-section set, chapter-card structure", "facet": "节奏惯例", "aliases": ["微缩剖面布景", "章节卡"] }
  ],
  "anchor_boundary": "借中心对称/正交机位/糖粉色板/Futura标牌/章节卡；不复刻具体影片场景与角色（承 §五「取锚原则」）",
  "banned_triggers": [                                               // 见 (B)，内联以便脚本一次读取
    { "banned": "handheld shaky cam",            "aliases": ["手持晃动", "shaky"],          "replacement": "locked-off tripod / dolly track", "reason": "手持破对称稳定的强迫症机位（破 must_anchor#1 对称构图）" },
    { "banned": "realistic naturalistic lighting","aliases": ["自然写实光", "natural realistic"], "replacement": "even flat front fill, storybook glow", "reason": "自然光破童话布景的均匀平光" },
    { "banned": "muted desaturated",             "aliases": ["去饱和", "低饱和哑调"],        "replacement": "saturated pastel color blocks",   "reason": "去饱和破糖粉色块辨识度（破 must_anchor#4 色板）" }
  ],
  "source": ["style-refs.md#附录A(line189):韦斯·安德森《布达佩斯大饭店》糖粉玫红·薰衣草紫·奶油白·Futura", "style-refs.md#附录B(line237):韦斯·安德森招式"],
  "genre_tags": ["对称构图/古怪冷幽默", "国风纯意境(对称分支)"]    // 指回 §六速查表 line 127 / §五 line 105
}
```

> `auteur_shaw_brothers_wuxia.json` 关键差异:`must_anchor` 6 项=`{ static staged wide low-angle / hard-cut freeze snap-zoom / 35mm painted stage backdrop / bold saturated red-gold theatrical / guzheng-pipa string color / 80s Hong Kong wuxia studio aesthetic }`;`banned_triggers` 5 条（含 `drone shot` 别名 `["航拍","aerial"]`）;`source=["style-refs.md#附录A(line189):邵氏电影(Shaw Brothers)80年代港片武侠美学·古筝/琵琶·35毫米胶片"]`;`genre_tags=["武戏分镜"]`（§六 line 133）。`jp_heisei_youth`/`happyhorse_east_asian_arthouse` 同 schema 填满（详见 .md 正文 4 条目）。

#### (B) 题材禁用触发词 → 改用词表(FR-02，写入 style-refs-auteur.md)

每个强题材一张三列表 `{禁用触发词 banned, 改用词 replacement, 为何带偏 reason}`,**每题材 ≥5 条**;禁用词覆盖两类:(a) **通用褒义但题材反噬**;(b) **跨题材串味**。每条配**非空改用词**与**一句因果**;改用词与禁用词**必须语义对立或迁移**（非同义改写,如 banned=`neon`/replacement=`neon light` 视为无效）;reason 必须追到该题材某项 must_anchor。

| auteur/题材 | 禁用触发词 banned | 改用词 replacement | 为何带偏 reason |
|---|---|---|---|
| happyhorse_east_asian_arthouse | `cinematic dramatic lighting` | `natural available light, soft window light` | 三点戏剧光破"克制自然光"气质 |
| happyhorse_east_asian_arthouse | `glossy commercial polish` | `lived-in, imperfect, film grain` | 商业精修破"允许不完美"的真实感 |
| happyhorse_east_asian_arthouse | `vibrant saturated colors` | `muted desaturated, warm faded` | 高饱和破东亚文艺的哑调克制 |
| happyhorse_east_asian_arthouse | `travel-brochure scenic view` | `local everyday mundane perspective` | 旅游宣传片视角破"本地人日常"视角 |
| happyhorse_east_asian_arthouse | `dynamic fast cutting` | `lingering long take, breathing rhythm` | 快切破"呼吸结构"的留白 |
| shaw_brothers_wuxia | `drone shot / aerial` | `static staged wide, low-angle ground` | 航拍把 80 年代棚拍带成现代数字感 |
| shaw_brothers_wuxia | `realistic motion blur / digital slow-mo` | `hard-cut freeze, snap-zoom punch-in` | 数字慢镜破港片硬切定格的凌厉 |
| shaw_brothers_wuxia | `naturalistic outdoor location` | `35mm painted stage backdrop, studio set` | 自然外景破邵氏棚拍布景的浓墨重彩 |
| shaw_brothers_wuxia | `desaturated muted` | `bold saturated red/gold, theatrical` | 去饱和破港式武侠浓彩戏曲感 |
| shaw_brothers_wuxia | `orchestral score` | `guzheng / pipa string color` | 交响破古筝琵琶的港式武侠器色 |
| jp_heisei_youth | `HDR, ultra-sharp digital` | `Kodak Gold 200 warm / Fuji Pro 400H grain` | 数字锐利破平成胶片柔颗粒 |
| jp_heisei_youth | `studio three-point lighting` | `backlit overexposure, hair catching sunlight` | 棚光破逆光过曝的青春光晕 |
| jp_heisei_youth | `clean stabilized` | `handheld documentary drift, freeze-frame` | 干净稳定破"纪录片偷拍青春"质感 |
| jp_heisei_youth | `cold blue grade` | `analog warmth, golden hour rim` | 冷蓝破平成暖调 analog warmth |
| jp_heisei_youth | `cinematic anamorphic` | `4:3 / academy nostalgic ratio` | 宽变形破平成怀旧画幅记忆 |

> 改用词原则:禁用词与改用词**必须语义对立或迁移**;reason 必须落到"破了哪一项作者锚",可追到 (A) 的 must_anchor。与 §十「通用禁止项」**互补不冲突**（§十题材无关、本表题材专属，冲突项=0，NFR-05）。

#### (C) 中英别名归一表(FR-03，写入 .md;机读副本 `aliases.json`)

词级匹配大小写不敏感、支持中英别名（防"航拍" vs `drone shot` 漏判，R5）。归一表是**数据可增量补**:

```jsonc
// examples/aliases.json — 脚本默认载入；与 .md 别名表逐字一致
{
  "drone shot":   ["航拍", "aerial", "aerial shot", "无人机镜头"],
  "slow-mo":      ["慢镜", "慢动作", "slow motion", "digital slow-mo"],
  "dolly":        ["推轨", "轨道镜头", "dolly track"],
  "desaturated":  ["去饱和", "低饱和", "muted desaturated"],
  "handheld":     ["手持", "shaky cam"]
  // …随作者条目维护、可增量补；别名归一只对“词面”，不改语义
}
```

#### (D) 保真审计报告结构(FR-03)— 逐项行 + 尾结论

写入 .md 作契约;脚本产出 JSON（机读/回归 diff）+ Markdown（人读）双格式。每条命中/缺漏一行;**画面级一律 `NEEDS_D09`，不臆造分数**:

```jsonc
{
  "header": { "auteur": "shaw_brothers_wuxia", "prompt_file": "S1_shot3.txt",
              "rules_version": "1.0", "audited_at": "2026-06-22T..." },  // 时间戳仅元数据，不参与判定
  "banned_hits": [
    { "banned":"drone shot", "line":2, "matched_alias":"航拍",
      "replacement":"static staged wide, low-angle ground",
      "reason":"航拍把80年代棚拍带成现代数字感", "verdict":"FAIL" }
  ],
  "anchor_missing": [
    { "must_anchor":"35mm painted stage backdrop", "facet":"画幅/棚味", "verdict":"MISS" }
  ],
  "image_fidelity": [
    { "item":"色板/构图/光质 是否落作者特征带", "verdict":"NEEDS_D09",
      "note":"画面级保真不靠词级脚本判，转 D09 基线对图 + 人评A-B" }
  ],
  "footer": { "banned_count":1, "missing_count":1, "decision":"NO-GO",   // 命中或缺漏>0 → NO-GO
              "fixes":[ { "item":"drone shot", "action":"删 drone shot，改 static staged wide + low-angle ground" },
                        { "item":"35mm painted stage backdrop", "action":"补该作者锚到提示词" } ] }
}
```

> 报告 `banned_hits[*]` + `anchor_missing[*]` 一一映射到 `Report.findings`（底座统一形态）,`footer.decision` 由 `Report.decision` 派生（有 FAIL 必 NO-GO）;时间戳只入 `header.audited_at`,**不入 `Report.findings`**——满足底座"判定区零时间戳"与 NFR-03 逐字节可复现。

#### (E) D09 验证规程 + 挂载位 + 引擎隐身闸(FR-04 + FR-05，写入 .md)

```
—— FR-04 画面级保真验证规程（词级闸之上的品味闸，付费步由用户亲点）——
对每个强风格建一组 D09 基线提示词集（每作者 ≥3 条:建立镜/中近景/名场面气质，落盘 examples/auteur_baselines/）。
跑 D09 真机出图（模型走 registry.image.default）→
  (a) 对图核验:与附录A 点名影片参考画面比，逐项（色板/构图秩序/光质/字体/画幅/节奏）人评 ✓/✗，命中 ≥4/6 判“像”；
  (b) A-B 盲评:同镜头“压满锚组（must_anchor 全注入）” vs “口号锚（裸 Wes Anderson）”两版出图，
       ≥3 名评审盲选“哪版更像该作者”，压满版胜出 ≥2/3 才算“作者锚组确实压满了保真”。
  画面级判定只产出“人评 ✓/✗ + 命中项数 + A-B 胜负”，无伪数值分。胜出率跌破 2/3 → 该作者锚组回炉补 must_anchor。

—— FR-05 挂载位 + 引擎隐身闸 ——
挂载位 = 写完提示词后、进 Seedance/出图前。
管线: 写完提示词 → 跑 audit_style_fidelity（词级）→ 保真报告(GO/NO-GO)
      → 有禁用词命中 或 作者锚缺漏 → 回改提示词（删禁用词/补作者锚），不放行
      → 词级 GO → 画面级保真走 D09 对图（异步、付费步用户亲点）。
引擎隐身闸（硬规则）: 禁用触发词表 / 作者锚清单 / 命中报告 / 缺漏报告 只存于过程目录（.audit/），
      严禁作为字段/脚注进入镜头卡 / Seedance 提示词 / 任何成片表。
      ✓ 但 must_anchor 的正向风格锚词（Wes Anderson symmetry / Futura signage / powder-pink palette）
        照常合法进提示词（NG1 边界，leak_scan 黑名单不含这些词）。
降级路径(NFR-02): 脚本不可得 → 审计降级为“模型按本表自查提示词词面”的人审/模型审模式，套件不瘫。
```

### 4.2 `audits/audit_style_fidelity.py`(确定性词级执行器)— 函数签名 + 核心逻辑

```python
# _shared/scripts/audits/audit_style_fidelity.py
# 依赖: 仅 Python 标准库（不读图、不调模型、不绑宿主 App / 127.0.0.1:8777）
import argparse, json, re, sys, os
from harness.audit_report import Report, Finding, Verdict
from harness.run_eval import register

_DEFAULT_ALIASES = os.path.join(os.path.dirname(__file__), "..", "examples", "aliases.json")

# ---------- 词级归一原语（确定性、无随机、无时间戳） ----------
def normalize(text: str) -> str:
    """小写化 + 折叠多空白（不改词序、不分词，纯词面归一）。"""
    return re.sub(r"\s+", " ", text.lower())

def expand_aliases(term: str, alias_table: dict) -> list[str]:
    """term 自身 + 其别名（中英），全部小写归一。用于命中/缺漏的多写法匹配。"""
    al = alias_table.get(term, [])
    return [normalize(t) for t in ([term] + list(al))]

def _contains(needle_norm: str, hay_norm: str) -> bool:
    """词面包含匹配:英文短语用词边界、中文别名用子串（中文无空格分词）。确定性。"""
    if re.search(r"[一-鿿]", needle_norm):      # 含中文 → 子串匹配
        return needle_norm in hay_norm
    # 英文 → 词边界，避免 'aerial' 误命中 'aerialist' 等
    return re.search(r"(?<!\w)" + re.escape(needle_norm) + r"(?!\w)", hay_norm) is not None

def _line_of(needle_norm: str, raw_text: str) -> int:
    for i, ln in enumerate(raw_text.splitlines(), 1):
        if _contains(needle_norm, normalize(ln)):
            return i
    return 0

# ---------- 主审计（确定性词级，不臆造画面分） ----------
def audit(rules: dict, prompt_text: str, alias_table: dict) -> Report:
    rep = Report(audit="style_fidelity", target=rules["auteur_key"])
    text = normalize(prompt_text)

    # 1) 禁用触发词命中（确定性词边界/子串匹配 + 别名归一）
    for rule in rules["banned_triggers"]:
        hit_alias = None
        for alias in expand_aliases(rule["banned"], {rule["banned"]: rule.get("aliases", [])}):
            if _contains(alias, text):
                hit_alias = alias; break
        if hit_alias:
            rep.findings.append(Finding(
                check="D12-FR-03", verdict=Verdict.FAIL,
                detail=f"禁用触发词 {rule['banned']!r} 命中(line {_line_of(hit_alias, prompt_text)}) via {hit_alias!r}: {rule['reason']}",
                measured=rule["banned"], threshold="banned",
                fix=f"删 {rule['banned']!r}，改用 {rule['replacement']!r}"))

    # 2) 作者锚必带缺漏（must_anchor 每项是否在提示词出现；任一别名命中即算到位）
    for a in rules["must_anchor"]:
        anchor = a["anchor"] if isinstance(a, dict) else a
        aliases = a.get("aliases", []) if isinstance(a, dict) else []
        present = any(_contains(x, text) for x in expand_aliases(anchor, {anchor: aliases}))
        if not present:
            rep.findings.append(Finding(
                check="D12-FR-03", verdict=Verdict.FAIL,
                detail=f"作者锚缺漏: {anchor!r}",
                measured="MISS", threshold="must_anchor",
                fix=f"补作者锚 {anchor!r} 到提示词"))

    # 3) 画面级“像不像”——词级脚本不判，明确转 D09（不臆造分数，NG4）
    rep.findings.append(Finding(
        check="D12-FR-04", verdict=Verdict.PASS,
        detail="色板/构图/光质 是否落作者特征带 → NEEDS_D09（词级脚本不判，转 D09 基线对图+人评A-B）",
        measured="NEEDS_D09"))

    rep.assert_fail_has_fix()                           # 铁律:每 FAIL 必带 fix（底座断言）
    return rep                                          # decision: 有 FAIL→NO-GO；exit 1 if NO-GO else 0

@register("style_fidelity")                             # 自动进 run_eval 的 GO/NO-GO
def run(target) -> Report:
    """run_eval 入口:target 携带 auteur_key/rules_path/prompt_text(或 prompt_path)/alias_path。
       未绑作者(auteur_key is None)→返回空 findings 的 GO（不强加作者锚）。"""
    if getattr(target, "auteur_key", None) in (None, ""):
        return Report(audit="style_fidelity", target="<no-auteur>")     # 空 findings → GO
    rules = json.load(open(target.rules_path, encoding="utf-8"))
    aliases = json.load(open(getattr(target, "alias_path", None) or _DEFAULT_ALIASES, encoding="utf-8"))
    text = getattr(target, "prompt_text", None) or open(target.prompt_path, encoding="utf-8").read()
    return audit(rules, text, aliases)

def _cli():
    ap = argparse.ArgumentParser(description="确定性词级作者保真审计（可选加固，缺失则走模型审分支）")
    ap.add_argument("--auteur", required=True, help="auteur_key（用于校验 rules 一致）")
    ap.add_argument("--rules", required=True, help="作者条目导出 JSON（examples/auteur_*.json）")
    ap.add_argument("--prompt", required=True, nargs="+", help="一份或多份提示词文件")
    ap.add_argument("--aliases", default=_DEFAULT_ALIASES)
    ap.add_argument("--json-out"); ap.add_argument("--md-out")
    a = ap.parse_args()
    rules = json.load(open(a.rules, encoding="utf-8"))
    assert rules["auteur_key"] == a.auteur, f"--auteur {a.auteur} 与 rules {rules['auteur_key']} 不符"
    aliases = json.load(open(a.aliases, encoding="utf-8"))
    rep = audit(rules, open(a.prompt[0], encoding="utf-8").read(), aliases)
    if a.json_out: open(a.json_out, "w", encoding="utf-8").write(rep.to_json())   # sort_keys，无时间戳(NFR-03)
    if a.md_out:   open(a.md_out, "w", encoding="utf-8").write(_to_markdown(rep))
    print(rep.to_json()); sys.exit(rep.exit_code)       # exit 0=GO / 1=NO-GO（CI/回归门消费）

if __name__ == "__main__":
    _cli()
```

**关键算法要点(可照着落地):**
- **中英别名分流匹配**:英文用**词边界**正则（防 `aerial` 误命中 `aerialist`）,中文别名用**子串**（中文无空格无法词边界）——这是词级匹配正确性的命门，也是 R5 漏匹配的缓解。
- **画面级一律 `NEEDS_D09`，绝不臆造保真分**（NG4）:词级脚本只判词面,"像不像"明确转 D09——这是品味类诚实工程姿态的代码落点。
- **未绑作者的镜组放行**:`run()` 对 `auteur_key is None` 返回空 `findings` 的 GO——不对没声明作者锚的镜组强加要求,避免 run_eval 5 题里非作者题被误判 NO-GO。
- **确定性铁律**:全程无随机、无时间戳进判定区;`Report.to_json()` 用 `sort_keys`——同输入两次运行 JSON 逐字节一致（NFR-03/DoD-7）。
- **退出码语义**:`exit 0=GO / 1=NO-GO`,直接喂 `make verify` 与 `reverse_test`。
- **纯标准库**:`import` 仅 `argparse/json/re/sys/os`——**不读图、不调模型、不出现宿主 App / 127.0.0.1:8777 痕迹**（NFR-02/DoD-10）;脚本缺失则降级模型审（.md 写明分支）。

### 4.3 D09 基线提示词集 `examples/auteur_baselines/`(FR-04，画面级 + 词级回归双用)

```
examples/auteur_baselines/
├── wes_anderson/                 # 韦斯 ≥3 条
│   ├── establishing.txt          # 建立镜:对称中心构图 + 微缩剖面布景 + 章节卡 + 糖粉色板 + Futura 标牌 + 35mm
│   ├── medium_closeup.txt        # 中近景:正交平移机位 + 均匀平光 + 薰衣草紫/奶油白
│   └── signature_moment.txt      # 名场面气质:snap pan 转场 + 饱和色块
├── shaw_brothers_wuxia/          # 邵氏 ≥3 条（含一条故意省略 35mm stage backdrop 留作缺漏校准）
├── jp_heisei_youth/              # 日系平成 ≥3 条
└── happyhorse_east_asian_arthouse/  # HappyHorse 东亚文艺 ≥3 条
```

> 每条 .txt = 一份"压满该作者 must_anchor、零禁用词"的成片提示词。**双用**:① 画面级跑 D09 出图做对图 + A-B（FR-04）;② 词级冻结为 `style_fidelity.golden.json` 回归基线（断言禁用命中=0 且作者锚缺漏=0）。

---

## 5. 任务拆解(Tickets)

| Ticket | 描述 | 产物 | 工时(人天) | 前置 |
|---|---|---|---|---|
| D12-T01 | 写 `style-refs-auteur.md` §FR-01 作者锚组 schema（5 字段，must_anchor ≥6 项物理特征、含 facet/aliases）| .md §A | 0.75 | — |
| D12-T02 | 写 §FR-02 逐题材禁用触发词→改用词表（4 题材各 ≥5 条三列）+ §FR-03 中英别名归一表 + `aliases.json` 机读副本;grep 与 §十冲突=0、改用词非同义 | .md §B§C + aliases.json | 0.75 | T01 |
| D12-T03 | 写 §FR-03 报告结构 + §FR-04 D09 验证规程 + §FR-05 挂载位/隐身闸/降级分支;FR-04 文案模型走 registry | .md §D§E | 0.5 | T01 |
| D12-T04 | 产出 4 个填满作者条目 + 导出 `auteur_wes_anderson.json` + `auteur_shaw_brothers_wuxia.json`（含 source 溯源附录A/B、HEX 色板、aliases）| .md 4 条目 + 2× examples/*.json | 1.0 | T01,T02 |
| D12-T05 | 实现词级原语:`normalize`/`expand_aliases`/`_contains`（中英分流匹配）/`_line_of`（确定性，无随机）| audit_style_fidelity.py 上半 | 1.0 | T01 |
| D12-T06 | 实现 `audit()`/`run()@register`/`_cli`:禁用命中 + 作者锚缺漏 + NEEDS_D09 分流 + 未绑作者放行 + JSON/MD 双输出 + exit 码 + assert_fail_has_fix | audit_style_fidelity.py 全 | 1.0 | T05 |
| D12-T07 | 写 4 风格 D09 基线提示词集（每作者 ≥3 条，邵氏留一条缺漏校准）落 `examples/auteur_baselines/` | 12+ × .txt | 0.5 | T04 |
| D12-T08 | 造 `D12_style_fidelity.clean.json` + `.poison.json`（3 变体:邵氏 drone shot / 裸 Wes Anderson / 中文航拍别名）;写 `assert_gate_is_real` 测试 | 2× fixtures/*.json + 测试 | 0.5 | T06,T07 |
| D12-T09 | 对 4 风格基线集自审→冻结 `style_fidelity.golden.json`（snapshot.freeze）;写回归"禁用命中=0 且锚缺漏=0"断言 | baselines/auteur/*.golden.json + 回归测试 | 0.5 | T06,T07 |
| D12-T10 | `lexicon.py` 新增 `BY_DIRECTION["D12"]` 审计元数据禁词集（不含风格锚词）;NFR-01 leak_scan 专项 + 反例 T6（注入命中报告→必报命中）+ 边界 T7（风格锚词→不报泄漏）| lexicon.py(改) + leak 测试 | 0.5 | T03 |
| D12-T11 | 三处契约追加交叉引用:style-refs.md §五 footer / §十 末、output-contract §7 第8条（原文字不动，补边界澄清）| 2× .md(改) | 0.5 | T03 |
| D12-T12 | `@register` 接 run_eval（未绑作者题放行）;接 Makefile `verify`;README 注册（② 骨 line14 + 目录树 "8件"→"9件"）| run_eval 接通 + README(改) | 0.5 | T06,T09 |
| D12-T13 | (M4，付费由用户亲点、依赖 D09 就绪)4 风格各 ≥3 条 D09 真机出图;对图核验特征带命中表 + A-B 盲评胜出率;锚组回炉清单（如有）| A-B 胜出率报告 + 特征带命中表 | 0.75 | T07,T12 |

> 合计约 **9.25 人天 ≈ 1.85 人周**（不含 T13 真机 0.75d 的用户排期 + D09 就绪等待）。关键路径 T01→T05→T06→T08→T09,与 PRD §10 的 2.5–3.0 人周吻合（底座复用省下脚手架工量）。

---

## 6. 测试方案

### ① 正例(clean 基线:用哪份，期望 GO)

- 用 `D12_style_fidelity.clean.json`:prompt = `examples/auteur_baselines/wes_anderson/establishing.txt`（**压满韦斯 7 项 must_anchor、零禁用词**），rules 指向 `auteur_wes_anderson.json`（T1）。
- 期望:`audit→` 禁用命中=0、作者锚缺漏=0、`image_fidelity` 行 = `NEEDS_D09`（不计 FAIL）、`decision=GO`、`exit 0`。对应 **DoD-5**。
- 回归用:此自审报告（连同 4 风格基线集自审）即 `style_fidelity.golden.json` 的内容,`snapshot.freeze` 冻结。

### ② 反向注入(poison fixture:具体投毒什么数据，期望 FAIL，期望测回值)

`D12_style_fidelity.poison.json` 含 3 个**已知真值**投毒变体,命中/缺漏可逐项核对:

| 变体 | 投毒动作(精确) | 期望判定 | 期望测回值(硬核对) |
|---|---|---|---|
| **T2 禁用词真阳性** | 邵氏基线提示词（auteur=`shaw_brothers_wuxia`）**注入一行 `drone shot`** | `banned_hits` 含 `drone shot` **FAIL** | `banned_count≥1`、命中行 `measured="drone shot"`、`fix` 含改用词 `static staged wide`、`decision=NO-GO`、`exit 1` |
| **T3 作者锚缺漏真阳性** | 提示词**仅裸 `Wes Anderson` 无任何 must_anchor 项**（auteur=`wes_anderson`）| `anchor_missing` 列**全部 7 项 must_anchor** | `missing_count=7`、缺漏清单逐项列出（含 `Futura signage`/`powder-pink palette`…）、NO-GO、`exit 1` |
| **T4 别名命中** | 邵氏提示词写中文 **"航拍"**（不写英文 `drone shot`）| `banned_hits` 命中（别名归一）| 命中行 `matched_alias="航拍"`、映射回 `banned="drone shot"`、NO-GO、`exit 1` |

> 真值由 fixture 显式注入（哪条禁用词、缺哪几项锚是已知的）,故"脚本测回的命中/缺漏 ≈ 注入的真值"可逐项核对——这是"真的有效"的硬证据,非主观感受。对应 **DoD-6**。
> **边界不误伤反测（T7，§6④边界反例的输入侧）**:把正向风格锚词 `Wes Anderson symmetry, Futura signage` 写进提示词 → 审计**不**报 banned（这些是 must_anchor 命中、是好事），仅 leak_scan 维度证明不算泄漏。

### ③ `assert_gate_is_real` 调用示例

```python
# tests/test_d12_style_fidelity.py
from harness.reverse_test import assert_gate_is_real
from audits.audit_style_fidelity import run
import json

def _gate(sample):                       # sample = fixture dict → 包成 target → run
    return run(_as_target(sample))

def test_d12_gate_is_real():
    clean  = json.load(open("_shared/scripts/fixtures/D12_style_fidelity.clean.json"))
    poison = json.load(open("_shared/scripts/fixtures/D12_style_fidelity.poison.json"))  # 默认 drone shot 变体
    assert_gate_is_real(_gate, clean, poison, name="D12-style_fidelity")
    # 干净样本 exit0 放行、投毒样本 exit1 报红;否则断言抛错（橡皮图章/假阳性即失败）

def test_d12_banned_hit_value():         # 真值核对:测回 ≈ 注入
    rep = run(_as_target(json.load(open(".../D12_style_fidelity.poison.json"))))  # drone shot 变体
    hit = next(f for f in rep.findings if f.check=="D12-FR-03" and "drone shot" in str(f.measured))
    assert hit.verdict.value == "FAIL" and "static staged wide" in hit.fix

def test_d12_alias_hit():                # 别名命中:中文“航拍”→ banned drone shot
    rep = run(_as_target(_poison_variant("alias_hangpai")))
    assert any("drone shot" in str(f.measured) for f in rep.findings if f.verdict.value=="FAIL")
```

### ④ 回归:冻结哪份黄金基线，改什么后重跑应如何

- **冻结**:`style_fidelity.golden.json` = 4 风格 D09 基线提示词集（各 ≥3 条）自审报告（压满锚组、无禁用词 → 全 GO）。`snapshot.freeze(self_audit_report, golden_path)`。
- **改后重跑**:套件任何升级（改 `mapping-tables.md`/调 `style-refs.md` 色板/补/改作者条目 must_anchor/换图像模型对应词/增减 banned_triggers）后,对**同一组基线提示词集**重跑 `audit()`,`diff_against_golden(current, golden_path)`:
  - **断言"禁用命中=0 且作者锚缺漏=0"**——缺口类 D 在**可数值化的词级维度**上的回归门。
  - JSON 逐字节比对（时间戳已排除在判定区外）:diff=0 → 绿;有漂移（如改 must_anchor 后某基线提示词不再覆盖新锚）→ `WARN`,人审是有意改进（则 `re-freeze` 并同步补该基线提示词）还是回归（则回滚）。对应 **DoD-7**。
- **铁律 grep(DoD-4)**:对成片镜头卡 + Seedance 提示词跑 `leak_scan(final_text, extra_terms=BY_DIRECTION["D12"])`:
  - (a) 审计元数据字段（`禁用触发词|banned_trigger|作者锚缺漏|must_anchor缺|保真✓|fidelity_report|NEEDS_D09`）与引擎术语（`Polanyi|默会|格式塔|支柱|方法论`）命中 **= 0**;
  - (b) **反例 T6**:故意把一行"禁用触发词命中报告"塞进镜头卡 → 隐身 grep **必报命中**（证明闸是真闸）;
  - (c) **边界反例 T7**:把正向风格锚词 `Wes Anderson symmetry, Futura signage` 写进提示词 → grep **不得**误报泄漏（证明闸不误伤合法风格词,NG1 边界落地正确）。

### ⑤ 真机那一层怎么验(付费按钮由用户点)

- M4/T13（**依赖 D09 就绪**）:取 4 风格各 ≥3 条 D09 基线提示词,**真机出图**（付费步,由用户亲点 character-board/keyframe 出图,模型走 `registry.image.default`）:
  - **(a) 对图核验**:与附录A 点名影片参考画面比,逐项（色板/构图秩序/光质/字体/画幅/节奏）人评 ✓/✗,命中 **≥4/6 判"像"**;
  - **(b) A-B 盲评**:同镜头"压满锚组版（must_anchor 全注入）vs 口号锚版（裸 `Wes Anderson`）"两图,**≥3 名评审盲选"哪版更像该作者"**,压满版胜出 **≥2/3** 才算"作者锚组确实压满了保真";否则该作者锚组**回炉补 must_anchor**。对应 **DoD-8**。
  - 画面级判定**只产人评 ✓/✗ + 命中项数 + A-B 胜负，无伪数值分**（诚实边界，NG4）。胜出率纳入"模型升级回归项"——跌破 2/3 触发回炉（R7）。

---

## 7. 里程碑与退出门

| Milestone | 产物 | 退出门(哪些脚本必须绿 / 哪些 DoD 必须过) |
|---|---|---|
| **M0 步行骨架(~0.4 周)** | `style-refs-auteur.md` 最小版（韦斯 1 条目 + 邵氏 banned 1 条）+ `audit_style_fidelity.py` 最小版（禁用命中 + 锚缺漏两项）+ 1 poison（邵氏 drone shot）| 对韦斯 clean 基线 `run→GO,exit0`;poison `audit→FAIL,exit1,命中 drone shot 测回准`;`assert_gate_is_real` 双过;`@register`→`run_eval` 打印 GO/NO-GO;接 `make verify`。**这是 D12 在 00-SUBSTRATE §6 范式下的最薄端到端竖切。** |
| **M1 知识契约 + 4 风格条目(~1.0 周)** | `style-refs-auteur.md` 全（FR-01/02/03/04/05）+ 4 填满条目 + `auteur_wes_anderson.json` + `auteur_shaw_brothers_wuxia.json` + `aliases.json` | **DoD-1**（5 字段齐、must_anchor ≥6、韦斯色板落具体色）、**DoD-2**（4 题材各 ≥5 条、三列齐、非同义、与§十冲突=0）、**DoD-11**（4 条目 source 可 grep 到附录A/B、§五口号表保留）绿 |
| **M2 词级审计脚本(~0.7 周)** | `audit_style_fidelity.py` 全（禁用命中 + 锚缺漏 + 别名归一 + NEEDS_D09 + 未绑作者放行 + JSON/MD + exit 码）| **DoD-3**（命中/缺漏行齐、FAIL→NO-GO、fix 非空）、**DoD-5**（压满锚组自审 GO exit0）、**DoD-10**（仅标准库、`--help` 独立跑、不读图不调模型、无宿主痕迹）绿 |
| **M3 词级测试与回归基线(~0.4 周)** | D09 基线提示词集 + clean/poison fixtures + `style_fidelity.golden.json` + 回归断言 | **DoD-6**（drone shot 真阳性 + 裸 Wes Anderson 缺漏列全 + 中文航拍别名命中）、**DoD-7**（2 次运行 JSON diff=0）绿;`reverse_test --all` 过 |
| **M4 D09 基线对图 + A-B 盲评(~0.5 周，付费由用户亲点、依赖 D09 就绪)** | 4 风格真机出图 + 对图特征带命中表 + A-B 胜出率报告 + 锚组回炉清单 | **DoD-8**（各 ≥3 条基线、A-B 压满版胜出 ≥2/3、特征带命中 ≥4/6、无伪数值分） |
| **M5 接入与隐身闸(~0.3 周，可与 M3 并行)** | lexicon 注册 + 三处契约交叉引用 + README 注册 + run_eval/Makefile 接通 | **DoD-4**（leak grep=0 + 反例 T6 报命中 + 边界 T7 不误伤）、**DoD-9**（挂载链路 + 两处交叉引用、原文字未改）绿 |

> **MVP 切线 = M0+M1+M2+M3+M5**:确定性词级脚本 + 合成提示词真值校准 + 词级回归基线 + 隐身闸是"可验证"硬核,**优先于 M4 真机品味验**（M4 依赖 D09 就绪 + 付费,异步殿后）。关键路径 M0→M1→M2→M3,M5 与 M3 并行,M4 依赖 D09 异步进行。**退出门即合入门**:任何动 `_shared/` 的 PR 必过 `make verify` 四项（run_eval / reverse_test / leak_scan / portability）全 GO 才许合（完善④，不可绕过）。

---

## 8. 风险与回滚

| 风险 | 影响 | 缓解 / 回滚 / 降级 |
|---|---|---|
| **R1 画面级"像不像"主观波动大**（A-B 盲评不稳） | 保真度判定不可靠 | 词级闸先兜住可数值化的一半（禁用词/锚缺漏硬判，5/5 级硬回归门）;画面级用 ≥3 评审盲评 + ≥2/3 胜出阈 + ≥4/6 特征带命中减小单评审偏差;A-B 用同镜头同模型只换锚组**控变量**。**回滚**:某作者 A-B 胜出跌破 2/3 → 该锚组回炉补 must_anchor，不全废其余条目。 |
| **R2 审计元数据被误当成片字段/脚注泄漏**（破隐身铁律） | 破成片、破铁律 | NFR-01 硬闸 + DoD-4 grep + 反例 T6;报告只存 `.audit/`;FR-05 在 §五/§十/§7.8 加"绝不进成片"指针。**反例 T6 是真闸的证明**——闸失效会被 reverse_test 抓。 |
| **R3 隐身闸误伤合法风格锚词**（把 `Wes Anderson symmetry` 当泄漏拦掉） | 风格词进不了提示词、保真反降 | NG1 显式区分"正向锚词合法进提示词 vs 审计元数据禁进";`leak_scan` 黑名单**只列审计元数据词、绝不列风格术语**;边界反例 T7 专测"不误伤"。**回滚**:若发现某词被误拦，从 `BY_DIRECTION["D12"]` 删除该词（数据可调，无需改码）。 |
| **R4 禁用触发词过严/过松**（题材不同标准不同） | 噪声告警或漏判带偏 | FR-02 禁用词表是**数据可调**（改 `auteur_*.json` 一处）;reason 必须追到具体 must_anchor（防拍脑袋拉黑）;用 A-B 盲评校准"这个词到底带不带偏"（带偏才入表，R4↔R1 闭环）。 |
| **R5 中英别名漏匹配**（"航拍" vs `drone shot` 漏判） | 词级闸漏报 | FR-03 别名归一表（`aliases.json`，中英双写）;英文词边界 + 中文子串分流匹配;别名表随作者条目维护、可增量补;漏匹配用例 T4 回归校准。**回滚**:发现漏词→补 `aliases.json` 一行（数据可增量，无需改码）。 |
| **R6 宿主缺 Python / 脚本不可得** | 脚本跑不起来 | **NFR-02 降级路径**:脚本仅标准库（无第三方、不读图、不调模型），缺失则走"模型按本表自查提示词词面"的人审/模型审模式,`style-refs-auteur.md` 写明该分支,套件不瘫。Bone 知识纯 Markdown 零宿主绑定,与脚本可用性解耦。 |
| **R7 图像模型升级致 A-B 胜出率漂移**（旧锚组在新模型上不灵） | 保真随模型退化 | D09 基线对图集 + A-B 胜出率纳入"模型升级回归项";胜出率跌破 2/3 触发该作者锚组回炉补 must_anchor;D09 出图天然有随机性,**不**纳入"逐字节复现"（NFR-03 边界）——其回归判据是"胜出率 + 特征带命中"的统计稳定。 |
| **R8 "强风格写了就像"乐观自报复发**（不跑 A-B 直接声称保真） | 假保真 | 无 D09 对图 + A-B 证据不得声称"作者保真已压满";DoD-8 把"压满"绑定到可盲评的胜出率,而非文字自报;leak_scan 把 `保真✓` 列禁词,误贴成片即报红。 |
| **R9 首版只压 4 风格、覆盖不足** | 其余强风格仍是口号锚 | NG6 明确首版 4 风格 + schema + 增补规程;条目 schema 统一 → 增补是"填表"非"重设计";按真实项目高频题材优先补（增补规程写在 .md 末）。 |

**宿主能力缺失的降级总线(NFR-02)**:Bone 知识（`style-refs-auteur.md`）永远可用（纯 .md）;脚本（`audit_style_fidelity.py`）是**可选确定性词级加固**——脚本头注明"缺失则走模型审分支"。最坏情况（无 Python）套件退到"模型按本表自查提示词词面"的人审/模型审模式,**禁用词闸 + 作者锚清单护栏仍在**,只丢掉"逐字节可复现"的确定性词级回归门（回归降级为人审 diff）。画面级"像不像"本就独立于脚本、走 D09 + 人评，不受脚本可用性影响。

---

> **契约版本**:DEV-D12 v0.1 ｜ 缺口类 D（覆盖与品味）｜ 优先级 P2 ｜ register 名 `style_fidelity` ｜ 接 00-ENGINEERING-SUBSTRATE.md 全套 harness（audit_report / leak_scan+lexicon / snapshot / reverse_test / run_eval / registry）。**工程姿态:把可数值化的"词级"（禁用触发词命中 + 作者锚缺漏）切成确定性硬闸做底座插件,把不可数值化的"画面级"（像不像该作者）诚实交给 D09 基线对图 + 人评 A-B、输出 `NEEDS_D09` 不臆造伪分。** 引擎隐身铁律继承 `style-refs.md §十` + `output-contract §7.8`,扩展为"**禁用词表/作者锚缺漏报告/命中清单 绝不漏成片,正向风格锚词合法进提示词**"——边界反例 T7 守门，证明闸既不漏（T6）也不误伤（T7）。
