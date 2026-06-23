# D7 · 静态全案 / 电商成员（static-board）开发方案

> 编号 D7 ｜ 优先级 P2 ｜ 状态 Dev v0.1 ｜ 前置:[D07-static-batch.md（本方向 PRD）](../D07-static-batch.md) + [00-ENGINEERING-SUBSTRATE.md（共享底座）](./00-ENGINEERING-SUBSTRATE.md)
>
> PRD 答 *what/why*；本文件答 *how-to-build*——把 D7 接到共享底座上，**不重造任何验证脚手架**。
> 我只交付:审计插件 `audit_static_board.py` + 一对 clean/poison fixture + 黄金基线（脱敏原创商品全案）+ 知识/契约文件（新成员 `static-board/`）+ 任务拆解。
> 真机一致性的"客观秤"**复用 D5 的 `audit_consistency` 执行器**（轮廓/HSL/LOGO/白底），D7 自身只做"文本全案结构闸 + 隐身/反视频双闸"。

---

## 1. 目标与范围

实现 PRD 的 D7-FR-01..06 / NFR-01..05:新增**与 `production-bible/` 平级的"全案级"Skin 成员 `static-board/`**，输入 = 商品信息（品名/卖点清单/基线视觉条件/可选参考图），输出 = **一套电商静态图全案**——① 产品基线档案（全案唯一锚，过程产物）；② 主图序列 **Hero01–03**（全景→中景→近景）；③ 详情页 **Detail01–08**（8 屏卖点叙事）；④ 每图携带焦点坐标 `(X,Y)` + `Z/F` 扫读路径 + 9:1 色彩克制（全是对内动线，绝不入成图）。终态是**静态图，绝不进视频**。

**本方向作为"底座插件"的边界（纪律铁律）:**

- **复用不重造**:报告结构 / GO-NO-GO / `leak_scan` / `snapshot` / `reverse_test` / `run_eval` / `registry` 全部用 `00-ENGINEERING-SUBSTRATE.md` 定义的共享 harness。我**只**写业务判据（`audits/audit_static_board.py`）、一对 fixture、一份黄金基线、四个成员 Markdown 文件、四处注册/交叉引用改动。
- **复用 D5 的秤、不自造像素审计**:轮廓 IoU / HSL 色相差 / LOGO Δ / 白底 RGB 的**真机像素测量**复用 D5 `audit_consistency`（`judge_xy/head_body_ratio/white_ratio/locate_logo`，见 D05-consistency-audit §5.3）；D7 只把 4 项阈值（`0.05/15/0.05/245`，与 D01/D03 逐字一致）从产品基线**喂给**这套秤，不重写测量逻辑。**弱依赖、不阻塞**：D5 未就绪时真机层降级人眼核验，文本闸不受影响（§8 R6）。
- **零业务知识下沉到底座**:产品基线 schema、Hero 景别序列、Detail 8 屏叙事、卖点→视觉转化表、焦点扫读契约**全部**写在 `static-board/` 成员私有文件里；只往 `lexicon.BY_DIRECTION["D7"]` 注册禁词、往 `_shared/scripts/audits/` 放一个插件。
- **不碰 Soul**:不改 `tacit-core.md`；"卖点潜台词→视觉证据"的理解仍走默会引擎，D7 只把它的输出语境从"表演情绪"扩到"卖点信念→视觉证据"（PRD §5.2）。引擎隐身铁律继承并**扩展**为"审计/动线层不漏成图"（NFR-01）+ "视频字段不混入静态全案"（NG4 反向铁律）。
- **不抢现有成员的活**:不替代 `keyframe`（视频首尾帧）/`storyboard`/`production-bible`（视频全案）/`color-palette`（仍是可调用色卡子产物）。SKILL frontmatter 显式路由分流防误触发（PRD R1）。
- **MVP 切线**:文本审计闸（结构闸 + 基线 diff + 反向注入 + leak_scan + 反视频闸）是可验证核心，优先于真机出图（M4，付费由用户亲点）。

---

## 2. 交付物清单（精确文件路径表）

| 路径 | 类型 | 说明 |
|---|---|---|
| `skills/director-suite/static-board/SKILL.md` | 知识md | 成员触发 frontmatter（≥6 触发词 + 路由分流声明）+ 6 步管线（基线锁→Hero 序列→卖点转化→Detail→动线→双闸自检），对齐 `production-bible/SKILL.md` 编排形态（FR-06） |
| `skills/director-suite/static-board/output-contract.md` | 契约md | 字段契约 + FR-01 产品基线 schema（含复用 D01/D03 的 4 阈值）+ FR-02 Hero 序列 + FR-03 Detail 8 屏 + FR-04 卖点→视觉转化表 + FR-05 焦点+9:1 动线 + 自检门（含 NG1/NG4 双闸） |
| `skills/director-suite/_megaprompts/static-board.megaprompt.md` | 样例md | 自包含导出版，内联 FR-01~05 全部表（不靠相对 import），可独立粘贴运行（FR-06④） |
| `skills/director-suite/static-board/examples/fewshot-电商静态全案-demo.md` | 样例md | 黄金基线源:1 件脱敏原创商品（无真实品牌·6 卖点·含防水/轻量/材质）→ 基线 + 3 Hero + 8 Detail 全案 few-shot（验证回归基线 B0） |
| `skills/director-suite/_shared/scripts/audits/audit_static_board.py` | audits插件py | 实现 `run(target)->Report` 并 `@register("static_board")`；断言 FR-01 基线齐全+阈值==D01/D03 / FR-02 恰 3 Hero 景别递进 / FR-03 恰 8 Detail 屏序+引用闭合 / FR-04 卖点三段齐 / FR-05 克制比+坐标域+路径枚举 / NFR-01 成图零泄漏 / NG4 反视频字段 |
| `skills/director-suite/_shared/scripts/fixtures/D7_static_board.clean.json` | fixtures | clean 正例:脱敏商品全案（基线 + 3 Hero + 8 Detail + 11 张成图提示词），期望 `audit→GO, exit0` |
| `skills/director-suite/_shared/scripts/fixtures/D7_static_board.poison.json` | fixtures | poison 反例:见 §6②（6 个独立投毒变体，每个期望特定 `FAIL` + 特定测回值） |
| `skills/director-suite/_shared/baselines/static_board/demo_album.golden.json` | baselines | 黄金基线 B0:`fewshot` demo 全案归一化产物（基线 + 11 图卡 + `_summary`），`snapshot.freeze` 冻结，回归 diff 锚 |
| `skills/director-suite/_shared/scripts/lexicon.py`（改） | registry项 | 往 `BY_DIRECTION` 新增 `"D7"` 键:基线/动线/审计/卖点潜台词过程词 + 视频字段反向词（§3②） |
| `skills/director-suite/README.md`（改） | registry项 | 「家族成员」新增分组 `🛒 静态全案（电商）→ static-board/`（定位:与 production-bible 平级的"全案级·静态终态"成员）；「目录结构」树新增 `static-board/` 节点 |
| `skills/director-suite/_shared/dimensions.md`（改·598 行） | registry项 | 「工业四风/极简纯白/暗金奢华」行追加交叉引用注脚「→ 电商静态全案实例化见 static-board 成员」（只加引用，不改既有内容） |
| `skills/director-suite/_shared/continuity-quality.md`（改·四·1） | registry项 | 「工业/产品 TVC」「高奢/大牌 TVC」行追加注脚「→ 静态电商全案的禁词复用见 static-board」（只加引用） |

> **只读复用、不改**:`asset-id-convention.md`（`[Element_<Product>]` 焊点 + ImageToImage 复用）、`color-palette/output-contract.md`（母色统辖 / 9:1 克制）、`docs/optimization/D01-execution-contract.md`（`consistency_audit` 阈值字段）、`docs/optimization/D03-model-adapters.md`（image 分级选型 + 一致性门）、`docs/optimization/D05-consistency-audit.md` + `audits/audit_consistency.py`（真机像素秤，D7 真机层复用其测量函数）。

---

## 3. 与共享底座的接线

### ① 复用 harness 哪些构件

| 底座构件 | D7 怎么用 |
|---|---|
| `harness/audit_report.py`（§2.1） | `audit_static_board.run()` 返回 `Report`，逐项 `append Finding(check="D7-FR-0X", ...)`；收尾 `rep.assert_fail_has_fix()`；`decision/exit_code` 走统一 GO/NO-GO 语义。判定区零时间戳。 |
| `harness/leak_scan.py` + `lexicon.py`（§2.2） | NFR-01 铁律闸:对**11 张成图提示词拼成的 `final_text`** 跑 `leak_scan(final_text, extra_terms=lexicon.BY_DIRECTION["D7"])`，命中基线/动线/潜台词/审计/视频术语即 FAIL。 |
| `harness/portability_scan.py`（§2.3） | NFR-02:对 `static-board/` 三态 Markdown 跑 `portability_scan`，断言无 `vimax./render(/.exe/grsai./localhost:8777` 宿主痕迹、无 `¥$/积分/元/次` 货币耦合。 |
| `harness/snapshot.py`（§2.4） | `freeze(album_norm, "baselines/static_board/demo_album.golden.json")` 冻结 demo 全案；改契约/megaprompt 后 `diff_against_golden()` 回归（§6④）。 |
| `harness/reverse_test.py`（§2.5） | `assert_gate_is_real(audit_static_board.run, clean_sample, poison_sample[变体], name="D7-static-board/<变体>")`——证明闸对 clean 放行、对 poison 报红。 |
| `harness/run_eval.py`（§2.6） | `@register("static_board")` 让插件自动进 `run_eval` 的 5 基线 × 全审计 GO/NO-GO 编排；纳入 `make verify` 合入门。 |
| `registry.py` / `model_registry.json`（§2.7） | **引用**:成图提示词模型行走 `registry.reg()["image"]["default"]`（nano-banana-pro，LOGO/白底强项）；材质特写图位走 `tier["material"]`(seedream-4.5)，草稿走 `tier["draft"]`(nano-banana-2)。不硬编码（§3③）。 |
| D5 `audits/audit_consistency.py`（跨方向复用，非底座） | **真机层复用**:把产品基线的 4 阈值 + Hero02 基准图 + 候选图喂 `audit_consistency.audit(baseline, candidate, tol)`，得 Drift Report（轮廓/HSL/LOGO/白底）。D7 不重写像素测量（§4.4）。 |

### ② 往 `lexicon.BY_DIRECTION` 加哪些禁词

PRD 底座 `BY_DIRECTION` 当前无 `"D7"` 键，本方向**新增**。两类：**(a) 过程产物词**（基线/动线/审计/潜台词，NFR-01）+ **(b) 视频字段反向词**（NG4 反向铁律，静态全案专属，其它视频方向无）：

```python
# lexicon.py 改后
BY_DIRECTION = {
    ...,
    "D7": [
        # (a) 过程产物·绝不漏进成图（NFR-01）
        "silhouette_tol", "hue_tol", "logo_delta", "white_bg_rgb_min",
        "±5%", "±15°", "基线", "baseline", "product_baseline", "审计阈值",
        "潜台词", "subtext", "买家信念",
        "(X,Y)", "焦点坐标", "Z形", "F形", "扫读路径", "扫读", "主色克制",
        "选型理由", "降级",
        # (b) 视频字段·NG4 反向铁律(静态全案不得混入)
        "运镜", "Push In", "Pull Out", "切镜", "切镜方式", "时长：", "时长:",
        "Seedance", "start_frame", "end_frame", "首帧", "尾帧", "运动模糊", "fps",
    ],
}
```
> **关键区分**:`ENGINE_TERMS/PROCESS_TERMS` 底座已含 `Polanyi/默会/支柱/方法论/审计/tolerance` 等通用词，D7 不重复（`leak_scan` 内部 `re.escape`+集合自然去重）；`"D7"` 只补**电商静态全案专属**的两类:基线/动线过程词 + 视频字段反向词。其中 `(X,Y)`/`Z形`/`F形`/`silhouette_tol` 是 static-board 卡内**对内字段的本体**（卡里必须有），但 `leak_scan` 扫的是**成图提示词**——成图里出现任意一条 = NO-GO（DoD-6/DoD-7）。

### ③ 是否引用 model_registry

**是。** 成图提示词的模型标记行不写死，走 `registry.reg()`:
- 默认（电商白底/LOGO/多图融合）→ `registry.reg()["image"]["default"]`（nano-banana-pro）；
- 材质/工艺特写（Hero03/Detail05）→ `registry.reg()["image"]["tier"]["material"]`（seedream-4.5）；
- 草稿位 → `tier["draft"]`（nano-banana-2）。

`audit_static_board` 校验 FR-06 时断言每图 `model_line ∈ registry 已注册 image 模型`，而非硬编码字符串（避免 D3 前移后返工）。registry 若缺 `image` 段，降级 WARN 不阻塞（与 D4 同口径）。

### ④ 新增 `audits/audit_static_board.py` 的 register 名

```python
@register("static_board")        # run_eval AUDIT_REGISTRY 的 key
def run(target) -> Report: ...
```
register 名 = `"static_board"`（与 audit 名 / `Report.audit` 字段一致，下划线风格对齐 `audit_consistency`/`audit_camera_path`）。

---

## 4. 实现分解（可照着写的真实骨架）

### 4.0 数据契约:`StaticBoardTarget`（插件输入）

`run_eval` / `reverse_test` 喂给插件的 `target` 形态。fixture JSON 与基线 case 都按此结构:

```jsonc
// StaticBoardTarget schema（fixtures 与 baselines 共用）
{
  "id": "demo-earbuds-01",                       // 全案标识(脱敏原创商品)
  "product_baseline": {                          // FR-01 全案唯一锚(过程产物·不入成图)
    "asset_id": "[Element_Earbuds]",             // 沿用 asset-id-convention 焊点
    "silhouette": { "desc": "圆角豆形单耳塞", "key_ratio": "高:宽=1.4:1" },
    "material": "哑光阳极氧化铝 + 漫反射",
    "logo": { "present": true, "position": "腔体外侧居中", "scale": "0.12", "color": "#1A1A1A" },
    "main_color_hex": "#2E5BFF",
    "white_bg": "pure white, RGB >= 245",
    "_audit_thresholds": {                       // 复用 D01/D03·下划线前缀=禁出成图(NFR-01)
      "silhouette_tol": 0.05, "hue_tol": 15, "logo_delta": 0.05, "white_bg_rgb_min": 245
    }
  },
  "heros": [                                      // FR-02 恰 3 张·景别严格递进
    { "图位": "Hero01", "景别": "全景", "引用基线": "[Element_Earbuds]",
      "焦点": [0.5, 0.42], "扫读": "Z形", "主色克制": { "主色域": 0.90, "点缀": 0.10 },
      "承载卖点": null,
      "prompt": "wide environmental product shot ... pure white seamless studio ... NB-pro",
      "negative": "no text overlay, no watermark, no readable price/copy, no unauthorized logo, no distorted product silhouette, no color shift beyond palette, this is a product image NOT a render mockup",
      "model_line": "nano-banana-pro" },
    { "图位": "Hero02", "景别": "中景", ... "扫读": "Z形",
      "prompt": "... pure white background, RGB >= 245 ..." },   // FR-02④白底必现
    { "图位": "Hero03", "景别": "近景", ... "model_line": "seedream-4.5" }  // 材质特写走 material tier
  ],
  "details": [                                    // FR-03 恰 8 屏·屏序 01-08 连续
    { "图位": "Detail01", "屏序": 1, "引用基线": "[Element_Earbuds]",
      "承载卖点": "场景钩子",                       // 01=主视觉,可为场景型
      "卖点转化": { "功能词": "...", "_潜台词": "...", "视觉证据": "..." },  // FR-04 三段
      "焦点": [0.5, 0.5], "扫读": "F形", "主色克制": { "主色域": 0.88, "点缀": 0.12 },
      "prompt": "...", "negative": "...", "model_line": "nano-banana-pro" },
    { "图位": "Detail02", "屏序": 2, "承载卖点": "防水 IPX8",
      "卖点转化": { "功能词": "防水 IPX8", "_潜台词": "下雨/泼溅都不怕",
                   "视觉证据": "水珠在机身表面聚成珠状滚落、接缝无渗水、内部干燥可见" }, ... },
    ... // Detail03..08
  ],
  "final_text": "<11 张成图 prompt + negative 拼接>"   // leak_scan / 反视频闸 扫描对象
}
```

> **判定确定性**:`final_text` = 仅 11 张图的 `prompt`+`negative` 拼接（成图层），**不含** `product_baseline`/`卖点转化._潜台词`/`焦点`/`扫读` 等过程字段——这些过程字段允许出现在卡的结构区（被人看见），但 leak_scan 的扫描对象严格限定为成图层（substrate §4 "成片边界"）。

### 4.1 `static-board/output-contract.md` — 五表 schema + 自检门

**(A) 产品基线档案 schema（FR-01·全案唯一锚·过程产物，照搬 PRD §5.3(A)）**

照搬 PRD `product_baseline` YAML（`asset_id/silhouette/material/logo/main_color_hex/white_bg/_audit_thresholds`），并写明机器可解析不变式，供 `audit_static_board` 加载校验:

```python
# 内联进 output-contract.md 代码块 + audit 插件从同结构校验
BASELINE_REQUIRED = ["asset_id", "silhouette", "material", "logo", "main_color_hex",
                     "white_bg", "_audit_thresholds"]
AUDIT_THRESHOLDS_CANON = {                # 必须逐字 == D01/D03(FR-01②)
    "silhouette_tol": 0.05, "hue_tol": 15, "logo_delta": 0.05, "white_bg_rgb_min": 245
}
# 不变式: baseline._audit_thresholds == AUDIT_THRESHOLDS_CANON (逐键逐值相等)
#         baseline.asset_id 匹配 r"^\[Element_.+\]$" (asset-id-convention 焊点)
#         logo.present==True 时 position/scale/color 必填; ==False 时其余可缺
```

**(B) 主图序列 Hero01–03 schema（FR-02·景别序列·照搬 PRD §5.3(B) 单图卡）**

固定 3 张，景别 `["全景","中景","近景"]` 严格递进（枚举 + 顺序锁）。每张卡字段:`图位/景别/引用基线/焦点/扫读/主色克制/承载卖点(可空)/prompt/negative/model_line`。写明:`Hero02` 的 `prompt` 必含白底表述 `pure white background, RGB >= 245`（或等效 `seamless white studio background`）（FR-02④）。

```python
HERO_SIZES = ["全景", "中景", "近景"]      # 严格递进·无重复(FR-02①)
HERO_COUNT = 3
WHITE_BG_PHRASES = ["RGB >= 245", "RGB ≥ 245", "seamless white studio", "pure white background"]
```

**(C) 详情页 Detail01–08 schema（FR-03·卖点叙事·照搬 PRD §5.3 + §4.1 默认槽位）**

固定 8 屏，屏序 `01..08` 连续无缺。默认叙事槽位（PRD FR-03）:`01 主视觉/场景钩子 → 02 卖点A → 03 卖点B → 04 卖点C → 05 材质/工艺细节 → 06 使用场景/对比 → 07 规格可视化 → 08 信任背书/收束`。卖点不足 8 条→合并/补场景图；超 8 条→取最高优先级 8 条并在**过程层**留痕（不入成图）。每屏卡:`图位/屏序/引用基线/承载卖点/卖点转化(三段)/焦点/扫读(默认F形)/主色克制/prompt/negative/model_line`。

```python
DETAIL_COUNT = 8
DETAIL_SLOTS = ["主视觉/场景钩子","卖点A","卖点B","卖点C","材质/工艺细节",
                "使用场景/对比","规格可视化","信任背书/收束"]   # 默认,可按卖点数微调,总数锁8
```

**(D) 卖点潜台词→视觉转化表（FR-04·三段式·照搬 PRD §5.3(C)）**

照搬 PRD 五行示例表（防水/轻量/长续航/高端材质/大容量），固定三段式 `功能词 → _潜台词(过程,禁入成图) → 视觉证据(具象名词+物理动作,进成图)`。写明"视觉证据"具象性铁律（沿用 keyframe §0「摄影机看得见的物理可见之物」，禁抽象审美词单独成句）。供 `audit_static_board` 的具象性启发式校验加载:

```python
# FR-04 视觉证据具象性启发式(脚本兜底,人审为准)
ABSTRACT_AESTHETIC = ["高端感","质感","高级","奢华感","科技感","时尚","精致","品质感","氛围感"]
# 规则: 每条"视觉证据"段必须含 >=1 个具象物理动词/名词(滚落/聚成/悬于/撑满/漫反射/特写...)
#       且不得"只含"抽象审美词(ABSTRACT_AESTHETIC 命中 且 无具象物理词 → FAIL)
```

**(E) 焦点扫读 + 9:1 色彩克制契约（FR-05·照搬 PRD §5.3 焦点行）**

每图标注:`焦点 (X,Y)∈[0,1]²`（左上=(0,0)，右下=(1,1)）+ `扫读 ∈ {Z形,F形}`（Z=首屏/主图，F=详情页通读）+ `主色克制 {主色域%, 点缀%}`（合格区间:主色域 ≥0.85、点缀 ≤0.15）。写明:成图提示词把焦点翻成视觉手法（"焦点处最高对比/浅景深锁定/留白引导"），**坐标/路径名/克制比本身绝不入成图**。

```python
SCAN_PATHS = {"Z形", "F形"}
FOCUS_DOMAIN = (0.0, 1.0)                  # (X,Y) 每分量 ∈ [0,1]
COLOR_DISCIPLINE = {"main_min": 0.85, "accent_max": 0.15}   # 主色域>=85% 点缀<=15%
```

**(F) 自检门（output-contract 收尾·人/脚本双轨）**:逐条列 DoD-1~DoD-7 自检清单 + NG1/NG4 双闸提示，与 `audit_static_board.py` 一一对应（脚本是权威，contract 是人读版）。

### 4.2 `static-board/SKILL.md` — 6 步管线 + 路由分流 frontmatter

frontmatter `description` 含 ≥6 触发词 + 显式路由分流（FR-06②，防误触发 R1）:

```yaml
---
name: static-board
description: >
  电商静态图全案 / 详情页全案 / 主图序列生成成员。输入商品信息(品名/卖点/基线视觉条件/参考图),
  输出一套静态商品图全案:产品基线 + 主图序列 Hero(远中近) + 详情页 Detail 8 屏卖点叙事图,
  携焦点动线与跨图一致性,终态是静态图、不进视频。触发词:电商/详情页/主图/产品视觉全案/
  静态全案/static board/卖点图/商品图全案。
  路由分流:只要"单张商品图"→改走 character-board/color-palette;要"视频/运镜/成片"→改走
  storyboard/production-bible;只有"成套电商静态全案"才走 static-board。
---
```

6 步管线（对齐 `production-bible/SKILL.md` 编排形态，但终态静态）:

```
Step1 锁产品基线档案(FR-01)  ── 商品不可变视觉条件冻结 + 挂 4 阈值(复用 D01/D03) → 过程产物
Step2 主图序列 Hero01-03(FR-02)  ── 全景→中景→近景,均 @引用基线 asset_id
Step3 卖点潜台词→视觉证据(FR-04)  ── 每卖点 功能词→_潜台词(过程)→视觉证据(进成图)
Step4 详情页 Detail01-08(FR-03)  ── 8 屏叙事,每屏 1 主卖点,@引用基线
Step5 焦点(X,Y)+Z/F 扫读 + 9:1 色彩克制(FR-05)  ── 对内动线,翻成对比/景深/留白入成图
Step6 双闸自检  ── NG1 隐身闸(坐标/阈值/潜台词不漏成图) + NG4 反视频闸(无运镜/时长/Seedance)
                  + 引用闭合(11 图 asset_id 全等基线) → emit 全案
```

### 4.3 `audits/audit_static_board.py` — 审计插件骨架

```python
# _shared/scripts/audits/audit_static_board.py
import re
from harness.audit_report import Report, Finding, Verdict
from harness.run_eval import register
from harness.leak_scan import leak_scan
from harness import lexicon, registry

AUDIT_THRESHOLDS_CANON = {"silhouette_tol": 0.05, "hue_tol": 15,
                          "logo_delta": 0.05, "white_bg_rgb_min": 245}
BASELINE_REQUIRED = ["asset_id","silhouette","material","logo","main_color_hex",
                     "white_bg","_audit_thresholds"]
HERO_SIZES = ["全景","中景","近景"]
DETAIL_COUNT = 8
SCAN_PATHS = {"Z形","F形"}
WHITE_BG_PHRASES = ["RGB >= 245","RGB ≥ 245","seamless white studio","pure white background"]
ASSET_ID_RE = re.compile(r"^\[Element_.+\]$")
ABSTRACT_AESTHETIC = ["高端感","质感","高级","奢华感","科技感","时尚","精致","品质感","氛围感"]
CONCRETE_PHYS = ["滚落","聚成","悬于","撑满","漫反射","特写","滴","压","形变","排布",
                 "高光","折射","纹理","贴合","拉伸","对比","羽毛","单指"]
# NG4 反视频字段(静态全案绝不可含,即便在卡结构区也判废)
VIDEO_FIELDS = ["运镜","Push In","Pull Out","切镜","时长：","时长:","Seedance",
                "start_frame","end_frame","首帧","尾帧","运动模糊","fps"]

@register("static_board")
def run(target) -> Report:
    rep = Report(audit="static_board", target=target["id"])
    base = target["product_baseline"]
    heros = target["heros"]; details = target["details"]
    bid = base.get("asset_id")

    # ---- FR-01: 基线字段齐全 + 4 阈值逐字 == D01/D03 + asset_id 焊点 ----
    for k in BASELINE_REQUIRED:
        if k not in base or base[k] in (None, "", {}):
            rep.findings.append(Finding("D7-FR-01", Verdict.FAIL,
                f"产品基线缺字段: {k}", fix=f"补全 product_baseline.{k}"))
    th = base.get("_audit_thresholds", {})
    if th != AUDIT_THRESHOLDS_CANON:
        rep.findings.append(Finding("D7-FR-01", Verdict.FAIL,
            f"审计阈值与 D01/D03 不一致: 实得 {th}",
            measured=th, threshold=AUDIT_THRESHOLDS_CANON,
            fix="把 _audit_thresholds 改回 silhouette_tol=0.05/hue_tol=15/logo_delta=0.05/white_bg_rgb_min=245"))
    if not (bid and ASSET_ID_RE.match(bid)):
        rep.findings.append(Finding("D7-FR-01", Verdict.FAIL,
            f"基线 asset_id 不符 [Element_*] 焊点: {bid!r}",
            fix="asset_id 改为 [Element_<Product>] 形式(asset-id-convention)"))

    # ---- FR-02: 恰 3 Hero + 景别严格递进 + 引用闭合 + 焦点/路径 + Hero02 白底 ----
    if len(heros) != 3:
        rep.findings.append(Finding("D7-FR-02", Verdict.FAIL,
            f"Hero 张数 {len(heros)} != 3", measured=len(heros), threshold=3,
            fix="主图序列固定 3 张(全景/中景/近景)"))
    if [h.get("景别") for h in heros] != HERO_SIZES:
        rep.findings.append(Finding("D7-FR-02", Verdict.FAIL,
            f"Hero 景别非严格递进: 实得 {[h.get('景别') for h in heros]}",
            measured=[h.get("景别") for h in heros], threshold=HERO_SIZES,
            fix="Hero01/02/03 景别须为 全景→中景→近景 严格递进、无重复"))
    h2 = next((h for h in heros if h.get("景别")=="中景"), None)
    if h2 and not any(p in h2.get("prompt","") for p in WHITE_BG_PHRASES):
        rep.findings.append(Finding("D7-FR-02", Verdict.FAIL,
            "Hero02(中景主体图)成图提示词缺白底表述(RGB>=245/seamless white studio)",
            fix="在 Hero02 prompt 补 'pure white background, RGB >= 245' 或等效白底串"))

    # ---- FR-03: 恰 8 Detail + 屏序连续 + 每屏 1 主卖点 + 引用闭合 ----
    if len(details) != DETAIL_COUNT:
        rep.findings.append(Finding("D7-FR-03", Verdict.FAIL,
            f"Detail 屏数 {len(details)} != 8", measured=len(details), threshold=8,
            fix="详情页固定 8 屏(不足补场景/材质,超出取 top8 并过程留痕)"))
    seq = sorted(d.get("屏序") for d in details if isinstance(d.get("屏序"), int))
    if seq != list(range(1, len(details)+1)):
        rep.findings.append(Finding("D7-FR-03", Verdict.FAIL,
            f"Detail 屏序不连续: {seq}", measured=seq, threshold=list(range(1,9)),
            fix="屏序必须 01..08 连续无缺无重"))
    for d in details:
        if not d.get("承载卖点"):
            rep.findings.append(Finding("D7-FR-03", Verdict.FAIL,
                f"Detail{d.get('屏序')} 主卖点为空",
                fix="每屏恰承载 1 条主卖点(主视觉屏可用场景型卖点占位)"))

    # ---- FR-02/03 引用闭合: 11 图 asset_id 全等基线(NFR-03) ----
    for c in heros + details:
        if c.get("引用基线") != bid:
            rep.findings.append(Finding("D7-FR-03", Verdict.FAIL,
                f"{c.get('图位')} 引用基线 {c.get('引用基线')!r} != 基线 {bid!r}(引用未闭合)",
                measured=c.get("引用基线"), threshold=bid,
                fix="所有图的引用基线必须全等产品基线 asset_id(跨图一致铁律)"))

    # ---- FR-04: 卖点三段齐全 + 视觉证据具象性 ----
    for d in details:
        conv = d.get("卖点转化", {})
        for seg in ["功能词", "_潜台词", "视觉证据"]:
            if not conv.get(seg):
                rep.findings.append(Finding("D7-FR-04", Verdict.FAIL,
                    f"Detail{d.get('屏序')} 卖点转化缺段: {seg}",
                    fix=f"补全卖点三段(功能词→_潜台词→视觉证据)的 {seg} 段"))
        evid = conv.get("视觉证据", "")
        if evid:
            has_concrete = any(w in evid for w in CONCRETE_PHYS)
            only_abstract = any(w in evid for w in ABSTRACT_AESTHETIC) and not has_concrete
            if only_abstract or not has_concrete:
                rep.findings.append(Finding("D7-FR-04", Verdict.WARN,
                    f"Detail{d.get('屏序')} 视觉证据疑似抽象审美词、缺具象物理证据: {evid[:24]!r}",
                    fix="视觉证据须为具象名词+物理动作(如'水珠滚落'),禁'高端感'类抽象词单独成立"))

    # ---- FR-05: 焦点域 + 路径枚举 + 主色克制比 ----
    for c in heros + details:
        f = c.get("焦点")
        if not (isinstance(f, list) and len(f)==2 and all(0.0 <= v <= 1.0 for v in f)):
            rep.findings.append(Finding("D7-FR-05", Verdict.FAIL,
                f"{c.get('图位')} 焦点坐标越界/缺失: {f}", measured=f, threshold="[0,1]^2",
                fix="焦点 (X,Y) 每分量须 ∈ [0,1]"))
        if c.get("扫读") not in SCAN_PATHS:
            rep.findings.append(Finding("D7-FR-05", Verdict.FAIL,
                f"{c.get('图位')} 扫读路径非法: {c.get('扫读')!r}",
                measured=c.get("扫读"), threshold=sorted(SCAN_PATHS),
                fix="扫读路径须 ∈ {Z形, F形}"))
        cd = c.get("主色克制", {})
        if not (cd.get("主色域",0) >= 0.85 and cd.get("点缀",1) <= 0.15):
            rep.findings.append(Finding("D7-FR-05", Verdict.WARN,
                f"{c.get('图位')} 色彩克制超出 9:1 区间: {cd}",
                measured=cd, threshold={"主色域>=":0.85,"点缀<=":0.15},
                fix="主色域调至 >=85%、点缀 <=15%(9:1 克制)"))

    # ---- FR-06: 模型行走 registry,不硬编码 ----
    known = set(_all_image_models())
    for c in heros + details:
        ml = c.get("model_line")
        if ml and ml not in known:
            rep.findings.append(Finding("D7-FR-06", Verdict.WARN,
                f"{c.get('图位')} 模型行 {ml!r} 不在 model_registry image 段",
                fix="模型行改为 registry.reg()['image'] 注册模型,勿硬编码"))

    # ---- NG4 反视频字段闸(静态全案不得混入视频字段,卡内+成图全扫) ----
    blob = target.get("final_text","") + " " + _flatten(heros) + " " + _flatten(details)
    for v in VIDEO_FIELDS:
        if v in blob:
            rep.findings.append(Finding("D7-NG4", Verdict.FAIL,
                f"静态全案混入视频字段: {v!r}(NG4 反向铁律)",
                fix=f"删除视频字段 {v!r};静态全案绝不含运镜/时长/Seedance/首尾帧"))

    # ---- NFR-01 隐身铁律: 成图提示词零泄漏(复用 leak_scan + BY_DIRECTION["D7"]) ----
    leak = leak_scan(target["final_text"], extra_terms=lexicon.BY_DIRECTION["D7"])
    rep.findings.extend(leak.findings)     # leak 的 FAIL 直接并入

    rep.assert_fail_has_fix()              # 底座铁律:每条 FAIL 必带 fix
    return rep

def _all_image_models():
    try:
        img = registry.reg().get("image", {})
        return [img.get("default")] + list((img.get("tier") or {}).values())
    except Exception:
        return []

def _flatten(cards):
    parts = []
    for c in cards:
        for k in ("prompt","negative","承载卖点"):
            if c.get(k): parts.append(str(c[k]))
    return " ".join(parts)
```

### 4.4 真机一致性:复用 D5 `audit_consistency`（不自造像素秤）

文本闸全绿后的真机层（M4，可选，付费用户亲点）。D7 **不写像素测量**，把基线阈值 + 候选图喂 D5 执行器:

```python
# M4 真机层胶水(非交付核心,真机验证用)
from audits.audit_consistency import audit as pixel_audit   # D5 执行器(复用,不重写)

def static_board_real_machine_check(baseline_card, generated_imgs):
    """baseline_card = product_baseline; generated_imgs = {Hero02:基准图, Detail0x:候选图...}"""
    tol = baseline_card["_audit_thresholds"]      # {silhouette_tol/hue_tol/logo_delta/white_bg_rgb_min}
    anchor = generated_imgs["Hero02"]             # NFR-04: ImageToImage 以 Hero02 为锚串联
    reports = []
    for pos, img in generated_imgs.items():
        # 复用 D5 像素秤: 轮廓 IoU / HSL 色相差 / LOGO Δ / 白底 RGB,全部 D5 已实现
        reports.append(pixel_audit(baseline=baseline_card, candidate=img, tol=tol))
    # 4 项任一 FAIL → 该图 NO-GO; 基线锁失效则秤必触 ⚠️(DoD-9/11)
    return reports
```

> **接线澄清**:D7 与 D5 是**跨方向插件复用**（非底座机制），D5 的 `audit_consistency` 提供"轮廓/HSL/LOGO/白底"四项客观测量，D7 提供"产品基线 + 4 阈值"作为该秤的输入。D5 未落地时此层降级人眼核验（§8 R6），**文本闸（4.3）不受影响**——这正是 PRD §8"弱依赖、不阻塞"的工程落点。

### 4.5 黄金基线 builder（喂 snapshot.freeze）

```python
# 由 M3 一次性脚本/插件子命令产出黄金基线 B0
def build_demo_album(fewshot_path) -> dict:
    album = parse_static_board_demo(fewshot_path)   # 解析 fewshot 的基线 + 11 图卡
    norm = {
        "id": album["id"],
        "baseline_keys": sorted(album["product_baseline"].keys()),
        "thresholds": album["product_baseline"]["_audit_thresholds"],
        "hero_sizes": [h["景别"] for h in album["heros"]],
        "detail_seq": sorted(d["屏序"] for d in album["details"]),
        "ref_closure": all(c["引用基线"] == album["product_baseline"]["asset_id"]
                           for c in album["heros"] + album["details"]),
        "leak_hits": leak_scan(album["final_text"],
                               extra_terms=lexicon.BY_DIRECTION["D7"]).findings.__len__(),
        "_summary": {"hero_n": len(album["heros"]), "detail_n": len(album["details"])},
    }
    return norm   # freeze 后期望: hero_n==3, detail_n==8, ref_closure==True, leak_hits==0
```

---

## 5. 任务拆解（Tickets）

| Ticket | 描述 | 产物 | 工时(人天) | 前置 |
|---|---|---|---|---|
| D7-T01 | 写 `static-board/output-contract.md` §A/§B:FR-01 产品基线 schema（含复用 D01/D03 的 4 阈值 + `BASELINE_REQUIRED`/`AUDIT_THRESHOLDS_CANON` 代码块）+ FR-02 Hero 序列 schema（景别枚举 + 白底必现规则） | 契约 §A/§B | 1.0 | — |
| D7-T02 | 续写 `output-contract.md` §C/§D/§E/§F:FR-03 Detail 8 屏 schema（默认槽位 + 屏序锁）、FR-04 卖点→视觉转化表（五行示例 + 具象性铁律）、FR-05 焦点+9:1 动线、自检门（DoD-1~7 人读版 + NG1/NG4 双闸） | 契约 §C/§D/§E/§F | 1.0 | D7-T01 |
| D7-T03 | 写 `static-board/SKILL.md`:frontmatter（≥6 触发词 + 路由分流声明）+ 6 步管线（基线锁→Hero→卖点转化→Detail→动线→双闸自检，对齐 production-bible 形态） | SKILL.md | 1.0 | D7-T02 |
| D7-T04 | 写 `_megaprompts/static-board.megaprompt.md`:内联 FR-01~05 全部表（不靠相对 import），自包含可独立粘贴运行 | megaprompt | 0.5 | D7-T02 |
| D7-T05 | 注册改动:`README.md` 成员表新增 `🛒 静态全案(电商)→ static-board/` + 目录树节点；`dimensions.md:598` + `continuity-quality.md` 四·1 加交叉引用注脚；`lexicon.py` 新增 `BY_DIRECTION["D7"]`（过程词 + 视频反向词） | 3 改文件 + lexicon | 0.3 | D7-T03,D7-T04 |
| D7-T06 | 写 `audits/audit_static_board.py`:FR-01~06 全断言 + NG4 反视频闸 + 接 leak_scan（NFR-01）+ `@register("static_board")` + `assert_fail_has_fix`；`_all_image_models`/`_flatten` 辅助 | 审计插件 | 2.0 | D7-T01,D7-T02,底座 harness 就绪 |
| D7-T07 | 写黄金基线源 `examples/fewshot-电商静态全案-demo.md`:脱敏原创商品（6 卖点含防水/轻量/材质）→ 基线 + 3 Hero + 8 Detail 全案 few-shot（人工标注 ground truth） | few-shot 全案 | 1.0 | D7-T02 |
| D7-T08 | 造 fixture:`D7_static_board.clean.json`（从 fewshot 派生·期望 GO）+ `.poison.json`（§6② 6 变体·各期望特定 FAIL+测回值） | 一对 fixtures | 1.0 | D7-T06,D7-T07 |
| D7-T09 | 黄金基线:`build_demo_album` 跑 fewshot → `snapshot.freeze` 成 `demo_album.golden.json`，断言 `hero_n==3/detail_n==8/ref_closure==True/leak_hits==0` | 黄金基线 B0 | 0.5 | D7-T06,D7-T07 |
| D7-T10 | 测试接线:`reverse_test.assert_gate_is_real(audit_static_board.run, clean, poison[变体])`（6 变体）；接 `run_eval`；纳入 `make verify` 四项门；`portability_scan` 跑成员目录=0 | 测试接线 | 0.5 | D7-T08,D7-T09 |
| D7-T11 | 真机出图（M4，付费由用户亲点）:1 件商品 ImageToImage 以 Hero02 为锚出全案（或抽 Hero02+2 Detail）→ 复用 D5 `audit_consistency` 测 4 项 + ≥3 人 A/B 人评 + 回填调参结论 | 真机证据 | 0.4 | D7-T10,（弱依赖）D5 就绪 |

**合计 ≈ 9.2 人天 ≈ 1.8 人周**（M1–M3 文本闸 8.8 人天为关键路径；M4 真机 0.4 人天弱依赖 D5、可后置/并行）。

---

## 6. 测试方案

### ① 正例（clean 基线，期望 GO）

- **fixture**:`D7_static_board.clean.json`——从 `examples/fewshot-电商静态全案-demo.md`（1 件脱敏原创耳塞，6 卖点）派生的合规全案:产品基线（asset_id `[Element_Earbuds]`、4 阈值 `0.05/15/0.05/245`、材质/LOGO/主色齐全）+ 3 Hero（全景→中景→近景，Hero02 含 `pure white background, RGB >= 245`）+ 8 Detail（屏序 01–08，每屏 1 卖点，三段齐，引用基线全闭合）+ 11 张干净成图 `final_text`。
- 期望:`audit_static_board.run(clean) → decision=GO, exit_code=0`（FR-01~06 全过、NG4 无视频字段、NFR-01 成图零泄漏）。

### ② 反向注入（poison fixture，每变体期望特定 FAIL + 特定测回值）

`D7_static_board.poison.json` 含 6 个独立投毒变体，**每个只动一处**，精确验证对应闸:

| 变体 | 投毒动作（具体到字段值） | 命中闸 | 期望测回 |
|---|---|---|---|
| **P1 阈值篡改** | 把 `product_baseline._audit_thresholds.hue_tol` 从 `15` 改成 `30`（其余三阈值不动） | D7-FR-01 | `measured` 中 `hue_tol==30`、`threshold.hue_tol==15`；`th != AUDIT_THRESHOLDS_CANON`；判 **FAIL** |
| **P2 景别非递进** | 把 `Hero03.景别` 从 `近景` 改成 `中景`（与 Hero02 撞景别，序列变 `全景/中景/中景`） | D7-FR-02 | `measured=["全景","中景","中景"]`、`threshold=["全景","中景","近景"]`；判 **FAIL** |
| **P3 屏序断裂** | 删掉 `Detail05`（8 屏变 7，屏序剩 `1,2,3,4,6,7,8`） | D7-FR-03 | `measured=7 != 8`（张数闸）+ `seq=[1,2,3,4,6,7,8] != range(1,8)`（屏序闸）；判 **FAIL** |
| **P4 引用脱锚** | 把 `Detail02.引用基线` 从 `[Element_Earbuds]` 改成 `[Element_Watch]`（与基线不符） | D7-FR-03 引用闭合 / NFR-03 | `measured="[Element_Watch]"`、`threshold="[Element_Earbuds]"`；判 **FAIL** |
| **P5 过程词漏成图** | 在 `Detail02.prompt`（成图层）塞入 `焦点坐标 (0.5,0.3) Z形扫读, 主色克制 90%, baseline 水珠滚落` | NFR-01 / leak_scan | `detail` 命中 `"(X,Y)"/"焦点坐标"/"Z形"/"主色克制"/"baseline"/"基线"` 等 `BY_DIRECTION["D7"]` 禁词；判 **FAIL** |
| **P6 视频字段混入** | 在 `Hero01.prompt` 塞入 `运镜：Push In，时长：5s，Seedance start_frame` | D7-NG4 反视频闸 | `detail` 命中 `"运镜"/"Push In"/"时长："/"Seedance"/"start_frame"`；判 **FAIL** |

> 另:**抽象退化投毒 P7**（可选，验 FR-04）——把某 Detail 的 `视觉证据` 从"水珠在机身表面聚成珠状滚落"改成"满满的高端感与科技感"，期望 `only_abstract==True`（命中 `ABSTRACT_AESTHETIC` 且无 `CONCRETE_PHYS`）→ `D7-FR-04 WARN`（注:此为 WARN 非 FAIL，不阻 GO，但回归 diff 应捕获，由人审定性）。

### ③ `assert_gate_is_real` 调用示例

```python
# tests/test_static_board.py
import json
from harness.reverse_test import assert_gate_is_real
from audits import audit_static_board

clean  = json.load(open("_shared/scripts/fixtures/D7_static_board.clean.json", encoding="utf-8"))
poison = json.load(open("_shared/scripts/fixtures/D7_static_board.poison.json", encoding="utf-8"))

def test_static_board_gate_is_real():
    # 每个 FAIL 级变体单独证明闸会变红
    for variant in ["P1","P2","P3","P4","P5","P6"]:
        assert_gate_is_real(audit_static_board.run, clean, poison[variant],
                            name=f"D7-static-board/{variant}")
    # 等价于: clean.exit_code==0 放行 ; poison[variant].exit_code==1 报红;否则 AssertionError
```

### ④ 回归（冻结黄金基线 + 改什么后重跑）

- **冻结**:`demo_album.golden.json` = fewshot demo 全案的归一化产物（`hero_n==3/detail_n==8/ref_closure==True/leak_hits==0` + 基线键集 + 4 阈值 + 景别序列 + 屏序）。
- **改 `output-contract.md` / `megaprompt` 后重跑**:`build_demo_album()` → `diff_against_golden()`。
  - 若新增字段/调整槽位顺序使归一化产物变化 → `snapshot` 报 `WARN 漂移` → 人审 diff，确认是**有意改进**则 `freeze` re-freeze 基线；否则回滚。
  - 若 `leak_hits` 从 0 变 >0（隐身回归劣化）或 `ref_closure` 从 True 变 False（引用脱锚）→ 视为 FAIL，必须修复后才允许合入。
- **改 4 审计阈值**（若 D01/D03 上游改阈值）→ 同步改 `output-contract.md` 的 `AUDIT_THRESHOLDS_CANON` + `audit_static_board.py` 常量 + clean fixture + re-freeze 基线，四处一致才过（防 D01/D03 漂移后 D7 静默失配）。

### ⑤ 真机层（M4，付费按钮由用户亲点）

- 取 1 件脱敏原创商品，按 D03 分级选型（白底/LOGO → nano-banana-pro，材质特写 → seedream-4.5）真机 **ImageToImage 以 Hero02 为锚串联**出全案（或抽 Hero02 + 2 张 Detail，控成本）。
- **复用 D5 `audit_consistency`** 测 4 项（轮廓 IoU±5% / HSL 色相差±15° / LOGO Δ0.05 / 白底 RGB≥245），逐项核验**无 ⚠️**（DoD-9/11）。基线锁失效则秤必触 ⚠️。
- **A/B 人评（软指标）**:把"static-board 全案"vs"用户拿 keyframe/storyboard 硬凑的静态图"双盲给 ≥3 人评"哪套更像可上架的电商全案 / 视线引导更顺"，static-board 胜出率作软指标（非阻塞门）。
- **成本闸（NFR-04）**:文本全案 0 真机调用完成；真机以 1 张 Hero02 锚定其余（ImageToImage 链），非 11 张独立 TextToImage。

---

## 7. 里程碑与退出门

| Milestone | 产物 | 退出门（脚本必须绿 / DoD 必须过） |
|---|---|---|
| **M1 契约与五表**（≈0.8 周；T01–T02） | `static-board/output-contract.md`（FR-01 基线 schema + FR-02 Hero + FR-03 Detail + FR-04 卖点转化 + FR-05 动线 + 自检门 + NG1/NG4 双闸） | 契约草案可评审；`AUDIT_THRESHOLDS_CANON` 手验 == D01/D03（`0.05/15/0.05/245`）；**DoD-1 半程** |
| **M2 成员与导出**（≈0.5 周；T03–T05） | `SKILL.md`（6 步 + 路由分流）+ `megaprompt`（自包含）+ README/dimensions/continuity/lexicon 注册 | **DoD-8** 4 文件存在 + 注册齐；`portability_scan` 对成员目录=0；触发词 ≥6 + 含路由分流声明 |
| **M3 审计脚本与基线**（≈0.7 周；T06–T10）★MVP 切线 | `audit_static_board.py` + clean/poison（6 变体）fixtures + `demo_album.golden.json` + 测试接线 | `make verify` 四项绿:① `run_eval`(含 static_board)GO ② `reverse_test --all`（P1–P6 clean 放行/poison 报红）③ `leak_scan_all`=0 ④ `portability_all`=0；基线 `leak_hits==0 & ref_closure==True`；**DoD-1~8 全过** |
| **M4 真机与 A/B**（≈0.4 周，付费用户点；T11） | 1 件商品真机 ImageToImage 全案 + 复用 D5 秤测 4 项 + ≥3 人 A/B 人评 + 调参结论 | **DoD-9/11** 一致性审计 4 项无 ⚠️；视线引导 ≥3 评审一致；真机出图以 Hero02 为锚（非 11 独立）；A/B 胜出率 B>A |

**MVP 切线 = M3 完成**:此时文本审计闸（结构 + 基线 + 反例 6 变体 + leak_scan + 反视频闸）全绿、可冷启动重跑回归，即为可交付可验证核心（覆盖 FR-01~06 + 核心 NFR）。M4 真机量化审计弱依赖 D5、是增益证据，不阻塞 MVP。**关键路径** M1→M2→M3；M4 可与 M3 末段并行。

---

## 8. 风险与回滚

| 风险 | 影响 | 缓解 / 回滚 / 降级 |
|---|---|---|
| **R1 与 keyframe/character-board/color-palette 职责混淆**（都"画图"，误触发） | 概念重叠、误触发 | SKILL frontmatter 显式路由分流（单张商品图→character-board/color-palette；视频→storyboard/production-bible；**成套电商静态全案**才走 static-board）+ README 定位"全案级·静态终态"。**回滚**:删 frontmatter 即停触发，对其余成员零影响 |
| **R2 过程产物漏进成图**（坐标/阈值/潜台词/选型，破隐身铁律） | 成图出现 `(X,Y)`/`±5%`/`baseline`/卖点文案 | NFR-01 硬闸（leak_scan + `BY_DIRECTION["D7"]` 过程词全集）+ poison P5 反例；schema 用 `_` 前缀标记禁出字段（`_潜台词`/`_audit_thresholds`）；卡内动线/阈值全标"过程产物"。CI 拦截不可绕过 |
| **R3 视频字段混入静态全案**（NG4 反向破口） | 静态全案出现运镜/时长/Seedance | NG4 反视频闸（`VIDEO_FIELDS` 卡内+成图全扫）+ poison P6 反例；`audit_static_board` 的 `D7-NG4` Finding 硬 FAIL。这是与 D4/D9 视频方向**相反**的专属闸 |
| **R4 跨图商品不一致**（11 图像 11 个商品） | 全案不可上架 | NFR-03 引用闭合断言（11 图 asset_id 全等基线，poison P4 验）+ ImageToImage 以 Hero02 为锚串联 + 真机复用 D5 秤 4 项门 |
| **R5 卖点转化退化成抽象审美词**（"高端感"不可成像） | 详情页空洞、无视觉证据 | FR-04 三段式 + `ABSTRACT_AESTHETIC`/`CONCRETE_PHYS` 启发式（poison P7 验）。**注**:此为 WARN 非 FAIL（脚本难穷举抽象词，人审为准），回归 diff 捕获后人审定性 |
| **R6 D5 像素秤未就绪 / 真机审计弱**（测不准轮廓/HSL/LOGO） | 一致性真机门名存实亡 | **弱依赖、不阻塞**（PRD §8）:D7 文本闸（4.3）完全自洽、不 import D5；真机层（4.4）才复用 D5 `audit_consistency`，D5 未就绪时**降级人眼核验**，契约/文本闸不变。MVP（M3）不依赖 D5 |
| **R7 底座 harness 尚未落地**（当前 `_shared/scripts/` 为空，仅 substrate 文档存在） | 插件无处接 | **前置依赖**:Sprint0 步行骨架（substrate §6）须先建 `harness/audit_report.py + leak_scan.py + lexicon.py + run_eval.py + reverse_test.py + snapshot.py + portability_scan.py`。**降级路径**:Sprint0 未就绪时先以独立 `verify_static_board.py`（同断言、不 import harness）跑通文本闸，待 harness 就绪改为 `@register` 接入（断言逻辑不变，仅换 Report 来源） |
| **R8 LOGO/文字渲染失真**（图像模型画 LOGO 糊/偏） | LOGO Δ 超阈 | D03 分级选型把 LOGO/白底图位路由到 nano-banana-pro（强项，走 registry 不硬编码）；LOGO 走基线 ImageToImage 复刻、不 TextToImage 重画（NFR-03/R7 同源策略） |
| **R9 8 屏槽位对卖点数不匹配**（卖点 3 条或 20 条） | 详情页结构散 | FR-03 固定 8 屏:不足补场景/材质图，超出取 top8 并过程留痕；屏序连续校验（poison P3）兜底 |

**总回滚策略**:D7 是纯增量插件 + 新成员目录，不改任何既有契约语义（只追加注册/交叉引用注脚）。任一环失败，删 `static-board/` 目录 + 撤 4 处注册（README/dimensions/continuity/lexicon）+ 删 `audit_static_board.py` 与一对 fixture/基线即完全回滚，对其余 12 方向与既有成员**零影响**。
