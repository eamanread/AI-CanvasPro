# D5 · 量化一致性审计工具（Quantified Consistency Audit）开发方案

> 编号 D5 ｜ 优先级 P0 ｜ 状态 Dev v0.1 ｜ 前置:[D05-consistency-audit.md（本方向 PRD）](../D05-consistency-audit.md) + [00-ENGINEERING-SUBSTRATE.md（共享底座）](./00-ENGINEERING-SUBSTRATE.md)
>
> PRD 答 *what/why*；本文件答 *how-to-build*——把 D5 接到共享底座上，**不重造任何验证脚手架**。
> 我只交付:审计插件 `audit_consistency.py` + 一对 clean/poison fixture + 黄金基线 + 知识/契约文件（Bone 层 `_shared/consistency-audit.md`）+ 任务拆解。
> D5 是缺口类 **C（无秤无回归）** 的 P0 横切护栏:一致性是地基,建议优先于覆盖类方向落地。它也正是 00-SUBSTRATE §6 步行骨架(Sprint 0)的承载方向——**底座那条最薄端到端竖切就是 D5**(冻翡翠楼基线→出 Drift Report→注入 +30°色相→NO-GO)。

---

## 1. 目标与范围

实现 PRD 的 **D5-FR-01..05 / NFR-01..05**:新增一份 **Bone 层共享知识 `_shared/consistency-audit.md`**(基线档案 schema + 容差阈值表 + Drift Report 结构 + 挂载位/隐身闸),并实现其**确定性执行器** `_shared/scripts/audits/audit_consistency.py`(Pillow+numpy 像素级测量,输出统一 `Report`,以退出码表达 GO/NO-GO)。审计是**横切关注点**:出图后(角色设定板/关键帧/场景图渲染后)由各视觉成员调用,把 `continuity-quality.md` 的定性自检落成可重跑的数值秤,接 `§二.8` 强制暂停门——NO-GO 不放行。

**本方向作为"底座插件"的边界(纪律铁律):**

- **复用不重造**:报告结构 / GO-NO-GO / 退出码 / `leak_scan` / `snapshot` / `reverse_test` / `run_eval` / `registry` 全部用 `00-ENGINEERING-SUBSTRATE.md` 定义的共享 harness。我**只**写业务判据(`audits/audit_consistency.py` 的像素测量与判定)、一对 fixture、一份黄金基线、一份 Bone 知识 + 一份样例基线档案、若干处注册/交叉引用改动。
- **零业务知识下沉到底座**:基线档案 schema、6 类特征、容差阈值表、Drift Report 行结构、L2 豁免规则**全部**写在 `_shared/consistency-audit.md`(Bone 知识)与插件私有逻辑里;只往 `lexicon.BY_DIRECTION["D5"]` 注册禁词、往 `_shared/scripts/audits/` 放一个插件。
- **不碰 Soul**:不改 `tacit-core.md`;引擎隐身铁律继承 `asset-id-convention.md §5 footer` + `storyboard/output-contract.md §7.8`,扩展为"**数值审计层不漏成片**"(NFR-01)。
- **只读消费、不改语义**:`production-bible/*-roster.md`(特征上游来源)、`asset-id-convention.md`(L1/L2 与 `@sN` 状态轴)、`continuity-quality.md §一.5`(色温≤200K) 既有字段语义零改动,只追加交叉引用注脚。
- **不评美学**(PRD NG3):本工具只审"对基线漂没漂、漂多少"(一致性),不评"画得美不美"(品味,D-series 另案)。难量化项(脸部身份/材质质感)输出 `NEEDS_HUMAN`,不臆造数值(NG4)。
- **MVP 切线**:`audit_consistency.py` 的**确定性闸**(HSL/轮廓/明度/LOGO/白底 5 项 + 合成扰动真值校准 + 反向注入 + leak_scan)是可验证核心,优先于 M5 真机出图(付费由用户亲点)。

---

## 2. 交付物清单(精确文件路径表)

| 路径 | 类型 | 说明 |
|---|---|---|
| `skills/director-suite/_shared/consistency-audit.md` | 知识md | **Bone 层主交付**:FR-01 基线档案 schema(6 类特征,每类四列)+ FR-02 容差阈值表(8 行)+ FR-03 Drift Report 结构 + FR-05 挂载位/隐身闸 + NFR-02 脚本缺失降级模型审分支 |
| `skills/director-suite/_shared/scripts/audits/audit_consistency.py` | audits插件py | 实现 `run(target)->Report` 并 `@register("consistency")`;CLI `--baseline/--candidate/--tolerance`;HSL/轮廓/明度/LOGO/白底 5 项确定性测量 + `NEEDS_HUMAN` 分流;`exit 0=GO / 1=NO-GO` |
| `skills/director-suite/_shared/scripts/examples/baseline_LinChen.json` | 样例md(JSON) | FR-01 样例基线档案:`[Element_LinChen]` 6 类填满、无 LOGO 处显式 `null`(对图核验主对象,数据接地翡翠楼 demo §角色) |
| `skills/director-suite/_shared/scripts/examples/baseline_TangSuit.json` | 样例md(JSON) | FR-01 第二样例:`[Prop_TangSuit_01]` 藏青真丝缎(含材质反射率 + 母色相约束),验证物件分支(DoD-1) |
| `skills/director-suite/_shared/scripts/examples/tolerance_default.json` | 样例md(JSON) | FR-02 阈值表的机读副本(脚本默认载入;`--tolerance` 缺省即用它);6 核心数值与 .md 表逐字一致 |
| `skills/director-suite/_shared/scripts/fixtures/D5_consistency.clean.json` | fixtures | clean 正例:candidate 指向基线图本身(自审自身),期望 `audit→GO, exit0`,所有偏移 < 阈值 1/10(T1) |
| `skills/director-suite/_shared/scripts/fixtures/D5_consistency.poison.json` | fixtures | poison 反例:4 个独立投毒变体(色相+30°/明度−15%/头身比 8.2/LOGO Δ0.1),各期望 `FAIL` 且测回特定值(T2-T4,§6②) |
| `skills/director-suite/_shared/scripts/fixtures/gen_fixtures.py` | fixtures | **合成图生成器**:从基线 PNG 程序化派生 clean + 4 个 poison 图(已知幅度单变量扰动),让 fixture 可冷启动重建、真值精确可控(支撑 §6 验证的"已知真值") |
| `skills/director-suite/_shared/baselines/jadepavilion/consistency_audit.golden.json` | baselines | 黄金基线:对翡翠楼 `[Element_LinChen]`/`[Prop_TangSuit_01]` 自审自身的 Drift Report(全 PASS,GO)冻结为回归参照(snapshot.freeze) |
| `skills/director-suite/_shared/scripts/lexicon.py`(改) | registry项 | 往 `BY_DIRECTION["D5"]` 追加本方向禁词全集(§3②);PRD 底座已预置 `["审计✓"]`,本方向补全 |
| `skills/director-suite/_shared/continuity-quality.md`(改) | 契约md(追加) | §一.6 末追加交叉引用注脚(→数值审计见 consistency-audit.md);§二.8 末追加一句(出图后审计 NO-GO→不放行)。**原条款文字不动** |
| `skills/director-suite/_shared/asset-id-convention.md`(改) | 契约md(追加) | §5「一致性回检清单」追加交叉引用注脚(符号层之外的数值层审计见 consistency-audit.md)。原 5 条不变 |
| `skills/director-suite/storyboard/output-contract.md`(改) | 契约md(追加) | §7.8「自检不外显」追加一句(数值审计产物同属过程,绝不进成片)。原铁律文字不动 |
| `skills/director-suite/README.md`(改) | registry项 | 「② 骨」一行文件清单追加 `consistency-audit.md`;目录树 `_shared/` 下新增该文件与 `scripts/` 节点 |

> **只读消费、不改语义**:`production-bible/{character,scene,props}-roster.md`、`production-bible/examples/翡翠楼-全案demo.md`、`character-board/`、`keyframe/`、`color-palette/`。
> **ID 口径备注**:PRD 与 demo §道具用 `[Prop_TangSuit_01]`(本案 canonical);props-roster.md 同物登记为 `[Prop_Tangzhuang_ZhaoShanhe_01]`(#1C2A3A、真丝织锦缎、缎面柔反光、内衬米白 #E8E4DA)——样例基线档案 `asset_id` 取 PRD canonical `[Prop_TangSuit_01]`,`source_id_alias` 字段记 props-roster 实名,避免 ID 漂移歧义。

---

## 3. 与共享底座的接线

### ① 复用 harness 哪些构件

| 底座构件 | D5 怎么用 |
|---|---|
| `harness/audit_report.py`(§2.1) | `audit_consistency.run()` 返回 `Report`;每个被测项 `append Finding(check="D5-FR-02", verdict=…, detail="色相偏移 30.2°>阈值 15°", measured=30.2, threshold=15, fix=…)`;收尾 `rep.assert_fail_has_fix()`;`decision`(有 FAIL→NO-GO)/`exit_code`(0/1) 走统一语义。**判定区零时间戳**——审计时间戳只入 Drift Report 的 header 元数据区、不进 `Report.findings`(NFR-03)。 |
| `harness/leak_scan.py` + `lexicon.py`(§2.2) | NFR-01 铁律闸:对**成片**(镜头卡 + Seedance 提示词 + 四表)跑 `leak_scan(final_text, extra_terms=lexicon.BY_DIRECTION["D5"])`,命中审计/引擎术语即 FAIL。`PROCESS_TERMS` 已含 `审计/Drift/偏移量/基线档案/tolerance/PASS/FAIL/回归`——D5 的核心泄漏词**底座已覆盖**,本方向只补差集。 |
| `harness/snapshot.py`(§2.4) | `freeze(self_audit_report, "baselines/jadepavilion/consistency_audit.golden.json")` 冻结自审报告;套件升级后 `diff_against_golden(current, golden_path)` 回归——断言"对基线重跑无新增 FAIL"(缺口类 C 的可重复硬门)。 |
| `harness/reverse_test.py`(§2.5) | `assert_gate_is_real(audit_consistency_gate, clean_sample, poison_sample, name="D5-consistency")`——证明闸对 clean(自审自身)放行 exit0、对 poison(色相+30°)报红 exit1。**无反例的闸视为未完成**(完善⑥)。 |
| `harness/run_eval.py`(§2.6) | `@register("consistency")` 让插件自动进 `run_eval` 的 5 基线 × 全审计 GO/NO-GO 编排;纳入 `make verify` 合入门。任何动 `_shared/` 的 PR 不过四项 GO 不许合(完善④)。 |
| `registry.py` / `model_registry.json`(§2.7) | **引用**:Drift Report 的修复动作若涉重生模型,走 `registry.reg()["image"]["default"]`(nano-banana-pro);不硬编码模型名(完善⑤)。审计本身不调模型(NFR-04 零付费),仅 fix 文案引用默认图像模型。 |

### ② 往 `lexicon.BY_DIRECTION` 加哪些禁词

PRD 底座已预置 `"D5": ["审计✓"]`,且 `PROCESS_TERMS` 已含通用审计词。本方向**补全**为「审计层专属、绝不可漏进成片」的差集:

```python
# lexicon.py 改后
BY_DIRECTION = {
    ...,
    "D5": [
        "审计✓", "审计通过", "Drift Report", "drift_report",
        "baseline_profile", "基线档案", "基线值", "实测值",
        "head_body_ratio", "hsl_primary", "material_reflectance",
        "logo_norm_xy", "NEEDS_HUMAN", "EXEMPT", "GO/NO-GO",
        "NO-GO", "tolerance.json", "profile_version", ".audit/",
        "偏移量", "容差阈值",   # 即使 PROCESS_TERMS 已含,显式列入防词表重构时漏网
    ],
}
```

> 这些词命中成片即 NFR-01 违反。反例 T6(把一行 Drift Report 注入镜头卡)依赖此集让 `leak_scan` 报红,证明隐身闸是真闸。

### ③ 是否引用 model_registry

**弱引用**:审计脚本本身不选模型、不调模型(NFR-04 零付费调用)。仅 Drift Report `footer.fixes[*].action` 的修复文案在建议"重生该镜"时,模型名走 `registry.reg()["image"]["default"]`(默认 nano-banana-pro)与 `["tier"]["material"]`(seedream-4.5),不硬编码。换模型改 registry 一处即可。

### ④ 新增 `audits/audit_consistency.py` 的 register 名

`@register("consistency")`——与 00-SUBSTRATE §3 插件契约示例及 §1 目录树 `audits/audit_consistency.py D5` 一致。`run_eval` 的 `AUDIT_REGISTRY` 以此名挂载,5 基线横切每题。

### ⑤ 接上底座的 5 件 Done 清单(对照 00-SUBSTRATE §3)

```
1. audits/audit_consistency.py 实现 run(target)->Report 并 @register("consistency")  ✔ T05/T06
2. 往 lexicon.BY_DIRECTION["D5"] 注册禁词集(§3②)                                      ✔ T10
3. fixtures/ 放一对 clean + poison,测试里 assert_gate_is_real                          ✔ T07/T08
4. 涉模型选择处一律 registry.reg(),禁硬编码模型名(仅 fix 文案)                          ✔ T06
5. baselines/ 放黄金基线 consistency_audit.golden.json,纳入 run_eval 与 snapshot 回归    ✔ T09
```

---

## 4. 实现分解(可照着写的真实骨架)

### 4.1 `_shared/consistency-audit.md`(Bone 知识)— 三件套结构

#### (A) asset 基线档案 schema(FR-01,写入 .md,JSON 形态)

每个被审 `[Element_*]/[Prop_*]`(及 `@sN` 状态节点)绑一份基线档案,从已确认基准图/三视图/设定板提取 6 类可量化特征。**6 类特征每类四列**:`{字段名 | 取值范围/单位 | 提取方法 | L1/L2 归属}`,脚本与人审同按此填。

```jsonc
// baseline_LinChen.json — 数据接地 翡翠楼 demo §角色 [Element_LinChen]
{
  "asset_id": "[Element_LinChen]",
  "source_id_alias": null,                                // 仅 [Prop_TangSuit_01] 需(对齐 props-roster 实名)
  "profile_version": "1.0",
  "source_image": "character-board/LinChen_3view.png",    // 已确认基准图;仅审计引用,绝不入成片
  "level": "L1",                                          // L1=硬锚优先审;L2 项另挂状态轴
  "features": {
    "proportion":  { "field": "head_body_ratio", "value": 7.5, "unit": "head",
                     "method": "三视图量取头/全身像素比", "level": "L1" },
    "hsl_primary": {                                       // H 由 demo HEX 换算(RGB→HSL)
      "hair":  { "h": 0,   "s": 0,  "l": 10, "src_hex": "#1A1A1A", "method": "主体掩膜区直方图众数色", "level": "L1" },
      "iris":  { "h": 24,  "s": 32, "l": 18, "src_hex": "#3A2A1E", "method": "瞳孔区直方图众数色",     "level": "L1" }
    },
    "material_reflectance": { "field": "skin_specular", "value": 18, "scale": "0-100",
                              "method": "高光像素强度归一化", "level": "L2" },
    "logo_norm_xy": null,                                  // 角色无 LOGO → 显式 null(FR-01③,不得留空)
    "orientation": { "front": [0,0], "side": [1,0], "unit": "单位向量",
                     "method": "鼻尖/视线向量单位化", "level": "L1" },
    "base_color_constraint": { "type": "non_white", "dominant_hue_band": [200,230],
                               "coverage": 0.90, "method": "≥90% 主导色相区间统计", "level": "L1" }
  },
  "marks": [ { "name": "左眉尾下方小痣", "norm_xy": [0.43, 0.38], "method": "记号点归一化坐标", "level": "L1" } ]
}
```

`baseline_TangSuit.json` 关键差异:`asset_id="[Prop_TangSuit_01]"`、`source_id_alias="[Prop_Tangzhuang_ZhaoShanhe_01]"`、`hsl_primary.main = #1C2A3A→{h:212,s:42,l:18}`、`material_reflectance.value=35`(真丝缎面柔反光,非镜面)、`logo_norm_xy=null`(场景/道具图不渲文字水印 LOGO,见 asset-id-convention §3)、`base_color_constraint.dominant_hue_band=[205,220]`。

#### (B) 容差阈值表(FR-02,写入 .md;机读副本 `tolerance_default.json`)

| 被测项 | 默认阈值 | L1(硬阈,超即 FAIL) | L2 行为 | 题材修饰示例 |
|---|---|---|---|---|
| 轮廓比例 head_body / 长宽比 | ±5% | ±5% | 已声明 Look 变化豁免 | 写实更严 ±3% |
| HSL 色相 H | ±15° | ±15° | 状态轴色温弧光段豁免 | 国风纯意境 ±10° |
| 明度 L | ±10% | ±10% | 暖→冷弧光段按声明豁免 | — |
| 饱和 S | ±15% | ±15% | 同上 | — |
| 材质反射率(0–100) | ±10 | ±10 | 新→旧/损坏态按状态轴豁免 | — |
| LOGO 归一化坐标 Δ(欧氏) | 0.05 | 0.05 | 不适用(LOGO 多为 L1) | 包装镜 0.03 |
| 跨镜色温 K | ≤200K | ≤200K | 弧光段按声明 | 承 continuity-quality §一.5 |
| 白底占比 RGB≥245 | ≥(基线占比 −5%) | 同 | — | 承电商母范式 |

> **L2 豁免规则**:仅当该变化点已在 `asset-id-convention.md` 状态轴/`@sN` 节点或场景表色温弧光**显式声明**时,本次偏移记 `EXEMPT`(不计 FAIL);未声明的突变照常 FAIL(防"借 L2 之名静默漂移")。6 核心数值(轮廓±5% / 色相±15° / 明度±10% / LOGO Δ0.05 / 色温≤200K / 白底≥245)与 `continuity-quality.md` 既有数值**逐字一致、可 grep、冲突项=0**。

`tolerance_default.json`(机读副本,脚本默认载入):
```jsonc
{ "proportion_pct": 5, "hue_deg": 15, "lightness_pct": 10, "saturation_pct": 15,
  "reflectance_abs": 10, "logo_delta": 0.05, "color_temp_k": 200, "white_ratio_drop_pct": 5 }
```

#### (C) Drift Report 结构(FR-03)— 行级偏移 + 尾结论

写入 .md 作契约;脚本产出 JSON(机读/回归 diff)+ Markdown(人读)双格式。每被测项一行 **7 字段齐全**(缺一不合格):

```jsonc
{
  "header": { "group": "S1-镜组1", "assets": ["[Element_LinChen]"],
              "baseline_version": "1.0", "audited_at": "2026-06-22T..." },  // 时间戳仅元数据,不参与判定
  "rows": [
    { "asset_id":"[Element_LinChen]", "item":"hsl_primary.hair.h",
      "baseline":0, "measured":2, "drift":2, "tolerance":15, "verdict":"PASS" },
    { "asset_id":"[Element_LinChen]", "item":"proportion.head_body_ratio",
      "baseline":7.5, "measured":8.2, "drift_pct":9.3, "tolerance_pct":5, "verdict":"FAIL" },
    { "asset_id":"[Element_LinChen]", "item":"face_identity",
      "verdict":"NEEDS_HUMAN", "note":"脸部身份相似度脚本不判,转人审/模型审" }
  ],
  "footer": { "fail_count":1, "warn_count":0, "decision":"NO-GO",       // FAIL>0 → 必 NO-GO(FR-03②)
              "fixes":[ { "item":"proportion.head_body_ratio",
                          "action":"重生该镜并锁三视图头身比 7.5;ImageToImage 参考基准图(模型走 registry.image.default)" } ] }
}
```

> Drift Report 的 `rows[*]` 一一映射到 `Report.findings`(底座统一形态),`footer.decision` 由 `Report.decision` 派生(有 FAIL 必 NO-GO);时间戳只入 `header.audited_at`,**不入 `Report.findings`**——满足底座"判定区零时间戳"与 NFR-03 逐字节可复现。

#### (D) 挂载位 + 引擎隐身闸(FR-05,写入 .md)

```
挂载位 = 出图后(角色设定板/关键帧/场景图渲染后)、暂停门前。
管线: 出图 → 跑 audit_consistency → Drift Report(GO/NO-GO) → continuity-quality §二.8 暂停门读结论
      → GO 放行进下游(视频/成片) ; NO-GO 必须回修/重生该镜,不放行。
引擎隐身闸(硬规则): 审计三件套(基线档案/阈值/Drift Report)与脚本输出只存于过程目录(.audit/),
      严禁作为字段/脚注/参考帧进入镜头卡 / Seedance 提示词 / 任何成片表。
降级路径(NFR-02): 脚本不可得 → 审计降级为"按本 schema 由模型读图填表"的人审/模型审模式,套件不瘫。
```

### 4.2 `audits/audit_consistency.py`(确定性执行器)— 函数签名 + 核心逻辑

```python
# _shared/scripts/audits/audit_consistency.py
# 依赖: 标准库 + Pillow + numpy(仅本插件;底座 harness 零图像依赖)
import argparse, json, math, sys
from dataclasses import dataclass
from PIL import Image
import numpy as np
from harness.audit_report import Report, Finding, Verdict
from harness.run_eval import register

# ---------- 确定性测量原语(无随机种子、无时间戳) ----------
def _load_rgb(path: str) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.uint8)

def dominant_hsl(img: np.ndarray, region_mask: np.ndarray | None = None) -> tuple[float,float,float]:
    """主体掩膜区直方图众数色 → HSL。抗噪:取众数而非均值(R1 缓解)。"""
    px = img[region_mask] if region_mask is not None else img.reshape(-1, 3)
    # 量化到 16 级/通道求众数 → 反算 → RGB→HSL(确定性,无随机)
    q = (px // 16).astype(np.int32)
    key = q[:,0]*256 + q[:,1]*16 + q[:,2]
    mode = np.bincount(key).argmax()
    r,g,b = ((mode//256)%16)*16+8, ((mode//16)%16)*16+8, (mode%16)*16+8
    return _rgb_to_hsl(r, g, b)                       # H∈[0,360), S/L∈[0,100]

def head_body_ratio(img: np.ndarray) -> float:
    """前景掩膜量"头高:全身高"像素比 → 头身比。不稳→上游调用判 NEEDS_HUMAN。"""
    mask = _foreground_mask(img)                       # 简单阈值/最大连通域(MVP);复杂背景降级
    ys = np.where(mask.any(axis=1))[0]
    body_h = ys.max() - ys.min() + 1
    head_h = _head_band_height(mask, ys)               # 顶部连续宽度突变点估头底
    return body_h / max(head_h, 1)

def locate_logo(img: np.ndarray, template: np.ndarray) -> tuple[float,float] | None:
    """归一化互相关模板匹配 → bbox 中心归一化 (x,y)∈[0,1];找不到→None(LOGO 丢失)。"""
    ...

def white_ratio(img: np.ndarray, thr: int = 245) -> float:
    return float((img >= thr).all(axis=2).mean())

# ---------- 判定原语(环形角差 / 百分比 / 欧氏 / ≥阈) ----------
def _ang_diff(a: float, b: float) -> float:           # 环形:H 的 359° vs 1° = 2°,非 358°
    d = abs(a - b) % 360
    return min(d, 360 - d)

def judge(check, item, base, meas, tol, kind, level="L1", exempt=False):
    if exempt:
        return Finding(check, Verdict.PASS, f"{item}: 已声明变化,记 EXEMPT", measured=meas, threshold=tol)
    if   kind == "deg": drift = _ang_diff(base, meas)
    elif kind == "pct": drift = abs(meas - base) / max(abs(base), 1e-9) * 100
    elif kind == "abs": drift = abs(meas - base)
    elif kind == "ge":  drift = max(0.0, base - meas)   # 低于基线占比的差额
    v = Verdict.FAIL if drift > tol else (Verdict.WARN if drift > tol*0.8 else Verdict.PASS)
    fix = "" if v != Verdict.FAIL else _suggest_fix(item, base, meas, drift)
    return Finding(check, v, f"{item} 偏移 {drift:.1f} vs 阈值 {tol}", measured=round(drift,2), threshold=tol, fix=fix)

# ---------- 主审计(确定性、不臆造) ----------
def audit(baseline: dict, candidate_path: str, tol: dict, status_axis: dict | None = None) -> Report:
    rep = Report(audit="consistency", target=baseline["asset_id"])
    img = _load_rgb(candidate_path)
    f = baseline["features"]
    # 1) HSL 主色(逐部位:hair/iris/main)
    for part, base_hsl in f["hsl_primary"].items():
        m_h, m_s, m_l = dominant_hsl(img, _region_mask(img, part))
        exempt_h = _is_declared_change(status_axis, baseline["asset_id"], f"hsl.{part}.h")
        rep.findings.append(judge("D5-FR-02", f"hsl.{part}.h", base_hsl["h"], m_h, tol["hue_deg"],       "deg", base_hsl.get("level","L1"), exempt_h))
        rep.findings.append(judge("D5-FR-02", f"hsl.{part}.l", base_hsl["l"], m_l, tol["lightness_pct"], "pct", base_hsl.get("level","L1")))
    # 2) 轮廓比例
    try:
        r = head_body_ratio(img)
        rep.findings.append(judge("D5-FR-02", "proportion.head_body_ratio", f["proportion"]["value"], r, tol["proportion_pct"], "pct"))
    except _UnstableMeasure:
        rep.findings.append(Finding("D5-FR-04", Verdict.WARN, "轮廓分割不稳→转人审", fix="", measured="NEEDS_HUMAN"))  # R1:不臆造
    # 3) LOGO 归一化坐标
    if f["logo_norm_xy"] is not None:
        xy = locate_logo(img, _logo_template(baseline))
        if xy is None:
            rep.findings.append(Finding("D5-FR-02", Verdict.FAIL, "LOGO 丢失/未定位", measured=None, threshold=tol["logo_delta"], fix="重生并锁 LOGO 位"))
        else:
            d = math.dist(f["logo_norm_xy"], xy)
            rep.findings.append(judge("D5-FR-02", "logo_norm_xy", 0.0, d, tol["logo_delta"], "abs"))
    # 4) 白底占比
    bcc = f["base_color_constraint"]
    if bcc["type"] == "white":
        rep.findings.append(judge("D5-FR-02", "white_ratio", bcc["coverage"], white_ratio(img), tol["white_ratio_drop_pct"]/100, "ge"))
    # 5) 难量化项不臆造,转人审(NG4)
    rep.findings.append(Finding("D5-FR-04", Verdict.PASS, "face_identity → NEEDS_HUMAN(脚本不判)", measured="NEEDS_HUMAN"))
    rep.assert_fail_has_fix()                          # 铁律:每 FAIL 必带 fix(底座断言)
    return rep

@register("consistency")                               # 自动进 run_eval 的 GO/NO-GO
def run(target) -> Report:
    """run_eval 入口:target 携带 baseline_path/candidate_path/tolerance_path/status_axis。"""
    base = json.load(open(target.baseline_path, encoding="utf-8"))
    tol  = json.load(open(getattr(target, "tolerance_path", None) or _DEFAULT_TOL, encoding="utf-8"))
    return audit(base, target.candidate_path, tol, getattr(target, "status_axis", None))

def _cli():
    ap = argparse.ArgumentParser(description="确定性一致性审计(可选加固,缺失则走模型审分支)")
    ap.add_argument("--baseline", required=True); ap.add_argument("--candidate", required=True, nargs="+")
    ap.add_argument("--tolerance", default=_DEFAULT_TOL); ap.add_argument("--md-out"); ap.add_argument("--json-out")
    a = ap.parse_args()
    base = json.load(open(a.baseline, encoding="utf-8")); tol = json.load(open(a.tolerance, encoding="utf-8"))
    rep = audit(base, a.candidate[0], tol)
    if a.json_out: open(a.json_out,"w",encoding="utf-8").write(rep.to_json())   # sort_keys,无时间戳(NFR-03)
    if a.md_out:   open(a.md_out,"w",encoding="utf-8").write(_to_markdown(rep))
    print(rep.to_json()); sys.exit(rep.exit_code)      # exit 0=GO / 1=NO-GO(CI/回归门消费)

if __name__ == "__main__":
    _cli()
```

**关键算法要点(可照着落地):**
- **色相用环形角差** `_ang_diff`(359° vs 1° = 2°),避免线性减法把 358° 误判超阈——这是色相审计正确性的命门。
- **主色取直方图众数**(非均值),16 级量化抗噪(R1);复杂背景下分割不稳的轮廓项**降级 NEEDS_HUMAN 而非臆造**(R1/NG4)。
- **确定性铁律**:全程无随机种子、无时间戳进判定区;`Report.to_json()` 用 `sort_keys`——同输入两次运行 JSON 逐字节一致(NFR-03/DoD-7)。
- **退出码语义**:`exit 0=GO / 1=NO-GO`,直接喂 `make verify` 与 `reverse_test`。

### 4.3 `gen_fixtures.py`(合成图生成器)— 真值精确可控

```python
# fixtures/gen_fixtures.py — 从基线 PNG 程序化派生 clean + 4 poison(已知幅度单变量扰动)
from PIL import Image
import numpy as np, colorsys
def shift_hue(img, deg):          # +30° 色相:HSV 空间 H 加偏移再回 RGB(精确已知真值)
    hsv = np.asarray(img.convert("HSV"), dtype=np.int32)
    hsv[...,0] = (hsv[...,0] + int(deg/360*255)) % 256
    return Image.fromarray(hsv.astype("uint8"), "HSV").convert("RGB")
def shift_lightness(img, pct):    # −15% 明度
    a = np.asarray(img, dtype=np.float32) * (1 + pct/100); return Image.fromarray(np.clip(a,0,255).astype("uint8"))
def stretch_body(img, ratio_to=8.2):  # 头身比 7.5→8.2:纵向非等比拉伸躯干区
    ...
def move_logo(img, dx=0.1, dy=0.0):   # LOGO 平移 Δ0.1(归一化)
    ...
# 输出: clean.png(==基线), poison_hue30.png, poison_light-15.png, poison_body82.png, poison_logo01.png
```

---

## 5. 任务拆解(Tickets)

| Ticket | 描述 | 产物 | 工时(人天) | 前置 |
|---|---|---|---|---|
| D5-T01 | 写 `consistency-audit.md` §FR-01 基线档案 schema(6 类特征,每类四列) | .md §1 | 1.0 | — |
| D5-T02 | 写 §FR-02 容差阈值表(8 行)+ `tolerance_default.json` 机读副本;grep 6 核心数值与 continuity-quality 一致、冲突=0 | .md §2 + tolerance_default.json | 0.5 | T01 |
| D5-T03 | 写 §FR-03 Drift Report 结构(7 字段行 + 尾结论)+ §FR-05 挂载位/隐身闸/降级分支 | .md §3§4 | 0.5 | T01 |
| D5-T04 | 产出样例 `baseline_LinChen.json` + `baseline_TangSuit.json`(6 类填满、无 LOGO 处显式 null、HEX→HSL 换算,接地翡翠楼 demo) | 2× examples/*.json | 0.75 | T01 |
| D5-T05 | 实现测量原语:`dominant_hsl`/`head_body_ratio`/`locate_logo`/`white_ratio` + `_ang_diff`/`judge`(确定性,无随机) | audit_consistency.py 上半 | 1.5 | T01 |
| D5-T06 | 实现 `audit()`/`run()@register`/`_cli`:5 项测量 + NEEDS_HUMAN 分流 + JSON/MD 双输出 + exit 码 + assert_fail_has_fix;fix 文案引 registry | audit_consistency.py 全 | 1.5 | T05 |
| D5-T07 | 写 `gen_fixtures.py` 生成 clean + 4 poison 图(色相+30°/明度−15°/头身 8.2/LOGO Δ0.1) | gen_fixtures.py + 5 PNG | 0.75 | T06 |
| D5-T08 | 造 `D5_consistency.clean.json` + `.poison.json`(4 变体);写 `assert_gate_is_real` 测试 | 2× fixtures/*.json + 测试 | 0.5 | T07 |
| D5-T09 | 自审自身→冻结 `consistency_audit.golden.json`(snapshot.freeze);写回归"无新增 FAIL"断言 | baselines/.../*.golden.json + 回归测试 | 0.5 | T06,T04 |
| D5-T10 | `lexicon.py` 注册 `BY_DIRECTION["D5"]` 全集;NFR-01 leak_scan 专项 + 反例 T6(注入一行 Drift→必报命中) | lexicon.py(改) + leak 测试 | 0.5 | T03 |
| D5-T11 | 三处契约追加交叉引用:continuity-quality §一.6/§二.8、asset-id-convention §5、output-contract §7.8(原文字不动) | 3× .md(改) | 0.5 | T03 |
| D5-T12 | `@register` 接 run_eval;接 Makefile `verify`;README 注册(② 骨 + 目录树) | run_eval 接通 + README(改) | 0.5 | T06,T09 |
| D5-T13 | (M5,付费由用户亲点)真机 1–2 角色关键帧跑审计;人评脚本判定与肉眼一致(DoD-10);阈值边界调参 | 对图核验报告 + 调参结论 | 0.75 | T12 |

> 合计约 **10.5 人天 ≈ 2.1 人周**(不含 T13 真机 0.75d 的用户排期等待)。关键路径 T01→T05→T06→T07→T08,与 PRD §10 的 2.5–3.0 人周吻合(底座复用省下脚手架工量)。

---

## 6. 测试方案

### ① 正例(clean 基线:用哪份,期望 GO)

- 用 `D5_consistency.clean.json`:candidate 指向**基线图自身**(自审自身,T1)。
- 期望:`audit→` 全 PASS、`decision=GO`、`exit 0`、Drift Report 所有偏移量 **< 阈值的 1/10**(轮廓/HSL/明度偏移近 0)。对应 **DoD-5**。
- 回归用:此自审报告即 `consistency_audit.golden.json` 的内容,`snapshot.freeze` 冻结。

### ② 反向注入(poison fixture:具体投毒什么数据,期望 FAIL,期望测回值)

`gen_fixtures.py` 从基线 PNG 派生 4 个**已知幅度单变量扰动**图,真值精确可核对:

| 变体 | 投毒动作(精确) | 期望判定 | 期望测回值(硬核对) |
|---|---|---|---|
| **T2 色相** | 把发色 `hsl.hair.h` 从 **H0(#1A1A1A)整体 +30°** | `hsl.hair.h` **FAIL**(30 > 15) | 测回 `drift≈30°(±3°)`、`decision=NO-GO`、`exit 1` |
| **T3 明度** | 全图明度 **L −15%** | `hsl.*.l` **FAIL**(15 > 10) | 测回 `drift_pct≈15(±2)`、NO-GO |
| **T4 轮廓** | 躯干纵向拉伸使 **head_body 7.5→8.2** | `proportion` **FAIL** | 测回 `drift_pct≈9.3(±1)`(>5%)、NO-GO |
| **T5 LOGO** | (用带 LOGO 的 `[Prop_*]` 基线)LOGO **平移 Δ0.1** | `logo_norm_xy` **FAIL**(0.1 > 0.05) | 测回 `drift≈0.10(±0.01)`、NO-GO |

> 真值由 `gen_fixtures.py` 注入,故"测回的偏移量 ≈ 注入的偏移量"可逐项数值核对——这是"真的有效"的硬证据,非主观感受。对应 **DoD-6**。
> **L2 豁免反测(T5-EXEMPT)**:服装 Look 变化**已在状态轴声明** → 该项记 `EXEMPT` 不 FAIL;**同等变化未声明** → 照常 FAIL。证明豁免不是漏判口子(R3)。

### ③ `assert_gate_is_real` 调用示例

```python
# tests/test_d5_consistency.py
from harness.reverse_test import assert_gate_is_real
from audits.audit_consistency import run
import json

def _gate(sample):                       # sample = fixture dict → 包成 target → run
    return run(_as_target(sample))

def test_d5_gate_is_real():
    clean  = json.load(open("_shared/scripts/fixtures/D5_consistency.clean.json"))
    poison = json.load(open("_shared/scripts/fixtures/D5_consistency.poison.json"))  # 默认 hue+30° 变体
    assert_gate_is_real(_gate, clean, poison, name="D5-consistency")
    # 干净样本 exit0 放行、投毒样本 exit1 报红;否则断言抛错(橡皮图章/假阳性即失败)

def test_d5_hue_drift_value():           # 真值核对:测回 ≈ 注入
    rep = run(_as_target(json.load(open(".../D5_consistency.poison.json"))))
    hue = next(f for f in rep.findings if f.check=="D5-FR-02" and "hsl.hair.h" in f.detail)
    assert hue.verdict.value == "FAIL" and abs(hue.measured - 30) <= 3
```

### ④ 回归:冻结哪份黄金基线,改什么后重跑应如何

- **冻结**:`consistency_audit.golden.json` = 翡翠楼 `[Element_LinChen]`/`[Prop_TangSuit_01]` 自审自身的 Drift Report(全 PASS、GO)。`snapshot.freeze(self_audit_report, golden_path)`。
- **改后重跑**:套件任何升级(改 `mapping-tables.md`/换图像模型/调 `style-refs.md`/动测量原语)后,对**同一组已确认基准图**重跑 `audit()`,`diff_against_golden(current, golden_path)`:
  - **断言"无新增 FAIL"**——缺口类 C 的"对基线 X 重跑、Y 项无 ⚠️"。
  - JSON 逐字节比对(时间戳已排除在判定区外):diff=0 → 绿;有漂移 → `WARN`,人审是有意改进(则 `re-freeze`)还是回归(则回滚)。对应 **DoD-7**。
- **铁律 grep(DoD-4)**:对成片镜头卡 + Seedance 提示词跑 `leak_scan(final_text, extra_terms=BY_DIRECTION["D5"])`,审计字段(`基线档案|偏移量|Drift|审计✓|tolerance|PASS|FAIL`)与引擎术语(`Polanyi|默会|格式塔|支柱|方法论`)命中 **= 0**;反例 T6(注入一行 Drift Report)→ 必报命中(证明闸是真闸)。

### ⑤ 真机那一层怎么验(付费按钮由用户点)

- M5/T13:取 1–2 个角色,**真机出关键帧**(付费步,由用户亲点 character-board/keyframe 出图),跑 `audit_consistency.py` 得 Drift Report。
- 人评(≥3 名评审一致):脚本判的 FAIL/PASS 与肉眼漂移方向**一致**;且脚本能抓人眼易忽略的细漂(如色相 12° 仍 PASS、18° 报 FAIL 的边界感知)。对应 **DoD-10**;边界体感反哺 FR-02 题材修饰列调参。

---

## 7. 里程碑与退出门

| Milestone | 产物 | 退出门(哪些脚本必须绿 / 哪些 DoD 必须过) |
|---|---|---|
| **M0 步行骨架(Sprint 0,~0.5 周)** | `consistency-audit.md` 最小版(色相+轮廓两项)+ `audit_consistency.py` 最小版 + 1 poison(色相+30°) | 对翡翠楼基线 `run→GO,exit0`;poison `audit→FAIL,exit1,测回 30°±3°`;`assert_gate_is_real` 双过;`@register`→`run_eval` 打印 GO/NO-GO;接 `make verify`。**这就是 00-SUBSTRATE §6 的步行骨架,D5 是其承载方向。** |
| **M1 知识契约(~0.8 周)** | `consistency-audit.md` 全(FR-01/02/03/05)+ `baseline_LinChen.json` + `baseline_TangSuit.json` + `tolerance_default.json` | **DoD-1**(6 类填满、无 LOGO 显式 null)、**DoD-2**(6 核心数值可 grep、冲突=0)绿 |
| **M2 审计脚本(~1.0 周)** | `audit_consistency.py` 全(5 项测量 + NEEDS_HUMAN + JSON/MD + exit 码) | **DoD-5**(自审全 PASS,偏移 <阈值 1/10)、**DoD-9**(仅 Pillow+numpy、`--help` 独立跑)绿 |
| **M3 测试与回归基线(~0.6 周)** | `gen_fixtures.py` + clean/poison fixtures + `consistency_audit.golden.json` + 回归断言 | **DoD-6**(色相+30°/LOGO Δ0.1/头身 8.2 三真阳性测回准)、**DoD-7**(2 次运行 JSON diff=0)绿;`reverse_test --all` 过 |
| **M4 接入与隐身闸(~0.3 周,可与 M3 并行)** | lexicon 注册 + 三处契约交叉引用 + README 注册 + run_eval/Makefile 接通 | **DoD-3**(7 字段 + FAIL→NO-GO + fix 非空 + 无成片字段)、**DoD-4**(leak grep=0 + 反例 T6 报命中)、**DoD-8**(挂载链路 + 三处交叉引用、原文字未改)绿 |
| **M5 真机对图核验(~0.3 周,付费由用户亲点)** | 1–2 角色真机关键帧 Drift Report + 阈值边界调参结论 | **DoD-10**(≥3 评审脚本判定与肉眼一致) |

> **MVP 切线 = M0+M1+M2+M3**:确定性脚本 + 合成扰动真值校准 + 回归基线是"可验证"核心,优先于 M5 真机。关键路径 M0→M1→M2→M3,M4 与 M3 并行,M5 殿后。**退出门即合入门**:任何动 `_shared/` 的 PR 必过 `make verify` 四项(run_eval / reverse_test / leak_scan / portability)全 GO 才许合(完善④,不可绕过)。

---

## 8. 风险与回滚

| 风险 | 影响 | 缓解 / 回滚 / 降级 |
|---|---|---|
| **R1 复杂背景下分割/主色提取不稳**(量错头身比/主色) | 误判 FAIL/PASS | 测量限定主体掩膜区;主色取直方图众数(抗噪);不稳项**降级 `NEEDS_HUMAN` 而非臆造数值**;合成扰动用例校准算法精度。**回滚**:若某测量项假阳性高,降级该项为 `NEEDS_HUMAN`(脚本仍跑其余项,不全废)。 |
| **R2 审计产物被误当成片字段/参考帧泄漏**(破隐身铁律) | 破成片、破铁律 | NFR-01 硬闸 + DoD-4 grep + 反例 T6;产物只存 `.audit/`;FR-05 在三处契约加"绝不进成片"指针。**反例 T6 是真闸的证明**——闸失效会被 reverse_test 抓。 |
| **R3 L2 合法变化被误判为漂移**(豁免漏判) | 误报 FAIL、白回修 | L2 豁免严格绑定"状态轴/色温弧光**已显式声明**";未声明才 FAIL;报告标 `EXEMPT` 留痕可追;T5-EXEMPT 反测守门。 |
| **R4 脸部身份/材质质感等难量化项无法脚本判** | 审计有盲区 | 明确分流 `NEEDS_HUMAN`,人审/模型审分支并行写入同报告;**不假装"全脚本可判"**(NG4)。 |
| **R5 阈值过严/过松**(题材不同标准不同) | 噪声告警或漏报 | FR-02 题材修饰列 + L1/L2 分档;阈值是**数据**(`tolerance_default.json` 可调,无需改码);真机 A/B 校准边界(12° PASS / 18° FAIL 体感)。 |
| **R6 宿主/环境缺 Pillow/numpy** | 脚本跑不起来 | **NFR-02 降级路径**:脚本是确定性**加固**非硬依赖,缺失则走"按 schema 由模型读图填表"的人审/模型审模式,`consistency-audit.md` 写明该分支,套件不瘫。Bone 知识纯 Markdown 零宿主绑定,与脚本可用性解耦。 |
| **R7 "自动审计全绿"旧文字自报习惯复发** | 假安全感回潮 | demo/contract 把"全绿"措辞改为引 Drift Report 的 GO/NO-GO(带数);**无 Drift Report 不得声称"审计通过"**;leak_scan 把 `审计✓` 列禁词,误贴成片即报红。 |

**宿主能力缺失的降级总线(NFR-02)**:Bone 知识(`consistency-audit.md`)永远可用(纯 .md);脚本(`audit_consistency.py`)是**可选确定性加固**——脚本头注明"缺失则走模型审分支"。最坏情况(无 Python)套件退到"模型按 schema 读图填 Drift Report"的人审/模型审模式,**审计护栏仍在**,只是丢掉"逐字节可复现"的确定性回归门(回归降级为人审 diff)。

---

> **契约版本**:DEV-D5 v0.1 ｜ 缺口类 C（无秤无回归）｜ 优先级 P0 ｜ register 名 `consistency` ｜ 接 00-ENGINEERING-SUBSTRATE.md 全套 harness（audit_report / leak_scan+lexicon / snapshot / reverse_test / run_eval / registry）。**D5 即 Sprint 0 步行骨架的承载方向**：先打通"冻翡翠楼基线→出 Drift Report→注入 +30° 色相→NO-GO"这条最薄端到端竖切,证明整条秤能转,再补满 5 项测量。引擎隐身铁律继承 `asset-id-convention §5 footer` + `output-contract §7.8`,扩展为"**数值审计层不漏成片**"。
