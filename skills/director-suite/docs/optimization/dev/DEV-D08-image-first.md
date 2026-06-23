# D8 · 图像优先入口 + 视觉基因解构（image-genome）开发方案

> 编号 D8 ｜ 优先级 P2 ｜ 状态 Dev v0.1 ｜ 前置：[D08-image-first.md（本方向 PRD）](../D08-image-first.md) + [00-ENGINEERING-SUBSTRATE.md（共享工程底座）](./00-ENGINEERING-SUBSTRATE.md)
>
> PRD 答 *what/why*；本文件答 *how-to-build*——把 D8 接到共享底座上，**不重造任何验证脚手架**。
> 我只交付：审计插件 `audit_image_genome.py` + 一对 clean/poison fixture + 黄金基线 + 知识/契约文件（新成员 `image-genome/`）+ 任务拆解。

---

## 1. 目标与范围

实现 PRD 的 **D8-FR-01~05 + NFR-01~05**：新增 **Skin 层输入侧成员 `image-genome/`** 与一份 **Bone 层知识 `_shared/visual-genome.md`**，提供"上传 1 张美学图 → 读图能力探针 → 四维视觉基因解构（`Subject_Structure`/`Color_Palette_Ratio`/`Lighting_Environment`/`Texture_Simulation`）→ 解构产物当读本喂 `tacit-core.md` 情绪优先六维管线 → 驱动情绪曲线初锚 → 喂现有 `storyboard/output-contract.md` v2.0 成片"的可执行流程，把入口从"只吃文字"扩成"文字 ∪ 图 ∪ 文字+图"（指回 PRD §3 G1~G5）。

**本方向作为"底座插件"的边界（纪律铁律）：**

- **复用不重造**：报告结构 / GO-NO-GO / `leak_scan` / `snapshot` / `reverse_test` / `run_eval` / `registry` 全部用 `00-ENGINEERING-SUBSTRATE.md` 定义的共享 harness。我**只**写业务判据（`audits/audit_image_genome.py`）、一对 fixture、一份黄金基线、三个成员 Markdown 文件、若干处注册改动。
- **零业务知识下沉到底座**：四维基因 schema、视觉→情绪反推表、"基因→六维"去向表、合规反向锚定规则**全部**写在 `image-genome/` 成员 + `_shared/visual-genome.md` 里；只往 `lexicon.BY_DIRECTION["D8"]` 注册禁词、往 `_shared/scripts/audits/` 放一个插件。
- **Soul 一行不改**（PRD §5②的结构性保证）：图的"理解"仍走 `tacit-core.md` 寓居读本 / 情绪优先六维；D8 只在它**前面**加一道"读图→四维解构"的预处理，把图翻成"结构化视觉读本"再喂进既有引擎。这是不破引擎隐身（NFR-01）的根本设计。
- **下游契约零改**（PRD N5）：成片仍走现有 `storyboard/output-contract.md` v2.0 + `seedance-2.0.md`，一行不改即过其 §7 全部自检；D8 只产"解构基因 + 情绪初锚"。
- **MVP 切线**：文本审计闸（四维 schema 结构闸 + 配比/HSL 量化闸 + 去向表无悬空 + leak_scan 解构层零泄漏 + 反向锚定）是可验证核心，优先于真机对图 A/B（M4，付费由用户亲点）。

非本方向（PRD Non-Goals 对应）：不破引擎隐身、解构 ≠ 生成指令（N1/N2）；不破可移植性（多模态读图依赖一律通过 FR-01 探针**门控**，skill 文件零宿主 API，NFR-02/N3）；不搬运题材/IP/品牌（N4）；不新增视频模型适配层、不改下游契约（N5）；不做版权法律判定（仅工程级反向锚定，N6）。

---

## 2. 交付物清单（精确文件路径表）

路径以仓库根 `skills/director-suite/` 为基准；底座路径见 SUBSTRATE §1。

| 路径 | 类型 | 说明 |
|---|---|---|
| `_shared/visual-genome.md` | 知识md（Bone） | 视觉基因解构协议：读图能力探针三档判定 / 四维字段范式与量化阈值 / **视觉→情绪强度初锚反推表** / **"基因→情绪优先六维"去向映射表** / 合规反向锚定（无 IP/品牌/可读文字/题材搬运）/ NFR-05 口径统一（视觉四维=输入侧解构，情绪六维=内部推理，不同名不混用） |
| `image-genome/SKILL.md` | 知识md（Skin·入口/编排） | 成员入口：图像优先 6 步管线（探针→四维解构→解构当读本→情绪曲线初锚→喂分镜契约→剥离过程产物）；frontmatter 可被索引、可触发（≥5 触发词） |
| `image-genome/output-contract.md` | 契约md（Skin） | **中间产物**契约：四维视觉基因卡字段 schema（人读）+ "基因→六维"去向表 + 解构层不漏成片自检门（最终成片仍复用 `../storyboard/output-contract.md`，本契约只管"中间基因卡"） |
| `image-genome/schema/visual_genome.schema.json` | 契约（JSON Schema） | 机器可消费的 `visual_genome` JSON Schema（审计脚本 `jsonschema` 校验用，draft 2020-12） |
| `image-genome/examples/fewshot-图像优先-demo.md` | 样例md | 一张脱敏原创美学图 I0 → 四维基因 → 情绪初锚 → 成片镜头卡 的 few-shot（兼黄金基线人读版） |
| `_megaprompts/image-genome.megaprompt.md` | 样例md（可移植双态） | mega-prompt 单文件版（NFR-02），内联四维范式与反推表，自包含、不依赖 Skill 安装 |
| `_shared/scripts/audits/audit_image_genome.py` | audits插件py | 实现 `run(target)->Report` 并 `@register("image_genome")`；五组判据见 §4（schema/配比+HSL/去向无悬空/解构层零泄漏/反向锚定） |
| `_shared/scripts/fixtures/D08_image_genome.clean.json` | fixtures（正例） | 合法 `visual_genome` + 情绪初锚 + 去向表 + 换主体成片（应 PASS / GO） |
| `_shared/scripts/fixtures/D08_image_genome.poison.json` | fixtures（反例） | 投毒样本（应 FAIL / NO-GO）；含 6 个独立投毒变体，具体见 §6 |
| `_shared/baselines/cases/genome_I0/` | baselines | 黄金基线 I0（1 张原创无版权美学图的人工四维 ground-truth 标注 + 冻结基因卡 + 情绪初锚 + 换两段剧情的成片），纳入 `run_eval` 与 `snapshot` 回归 |
| `_shared/scripts/lexicon.py` → `BY_DIRECTION["D8"]` | registry项（改动） | 把底座已预置的 `["视觉基因","Color_Palette","Subject_Structure"]` 补全为解构层禁词全集（见 §3②） |
| `_shared/scripts/audits/audit_image_genome.py` 顶部 `@register` | registry项 | 自动进 `run_eval` 的 GO/NO-GO 编排 |

**最小侵入改动（非新建，仅追加节 / 注册）：**

| 路径 | 改动 |
|---|---|
| `README.md` | 「🎞 单产物成员」表新增一行 `🖼️ 图像优先入口 → image-genome/`；「目录结构」树新增 `image-genome/` 与 `_shared/visual-genome.md` 节点 |
| `storyboard/SKILL.md` | Step 0 寓居读本一行追加：「读本对象 = 文字片段 ∪ 美学参考图（若有图先走 image-genome 解构当读本）」+ 交叉引用注脚 → 详见 image-genome 成员（只扩输入说明，不改情绪先行/引擎隐身三铁律） |
| `_shared/style-refs.md` | 第 132 行「群像主视觉(空间四层+色卡锁定)」追加交叉引用注脚「→ 反向解构产物见 image-genome 成员」（只加引用，不改既有内容） |

> **只读消费、不改**：`tacit-core.md`（情绪优先六维引擎，一行不改）、`mapping-tables.md`（情绪×视听强制项）、`dimensions.md`（景别配比/构图）、`pro-params.md`（色温光比/颗粒）、`storyboard/output-contract.md`（成片契约，零改即过 §7）、`continuity-quality.md`（反向锚定/合规版权类 §170-178）、`seedance-2.0.md`（模型适配）。

---

## 3. 与共享底座的接线

### ① 复用 harness 哪些构件

| 底座构件（SUBSTRATE §2） | D8 怎么用 |
|---|---|
| `audit_report.py`（§2.1） | 审计插件输出唯一形态 `Report/Finding/Verdict`；`Finding.check` 引回 PRD 的 `D8-FR-0x`/`D8-NFR-0x`/`DoD#n`；调 `assert_fail_has_fix()` 保证每条 FAIL 带可执行修复动作；判定区零时间戳 |
| `leak_scan.py` + `lexicon.py`（§2.2） | **直接复用，不重写**。对最终镜头卡 + Seedance 成片 grep 引擎/过程/执行词 + D8 解构层禁词；D8 把四维字段名/HSL/`#HEX`/探针档位/分析术语加进 `lexicon.BY_DIRECTION["D8"]`（FR-05/NFR-01 引擎隐身硬门，DoD#7） |
| `snapshot.py`（§2.4） | `freeze` 把 I0 四维基因卡冻成黄金基线；改 `visual-genome.md` 后重解构 I0 用 `diff_against_golden` 测"主色 HSL / 空间四层 / 光位是否无故漂移"（回归 L2，PRD §7 回归 diff） |
| `reverse_test.py`（§2.5） | `assert_gate_is_real(audit_image_genome.run, clean, poison)` 证明本方向的闸不是橡皮图章（完善⑥：闸 + 反例才算 Done） |
| `run_eval.py`（§2.6） | `audit_image_genome` 经 `@register("image_genome")` 自动进 5 基线 × 全审计的 GO/NO-GO 编排；`genome_I0` 进 `cases/` |
| `registry.py` / `model_registry.json`（§2.7） | **只读不改**。D8 成片走 Seedance，模型名一律 `registry.video_default()`，禁在 skill/contract 里硬编码；真机对图核验（可选）用图像通道时走 `registry.reg()["image"]["default"]` |

> D8 **不新增** harness 机制文件，只新增 1 个 `audits/audit_image_genome.py` 插件。底座的 `portability_scan.py`（§2.3）横切扫 `image-genome/SKILL.md` 与 `visual-genome.md`（不得出现 `vimax.`/`grsai.`/`.exe`/`localhost:8777`/货币），由合入门 §5 的 `portability_all` 统一覆盖，本方向无需额外脚本。

### ② 往 `lexicon.BY_DIRECTION` 加哪些禁词

`lexicon.py` 现状 `BY_DIRECTION` 已**预置** `"D8": ["视觉基因","Color_Palette","Subject_Structure"]`（SUBSTRATE §2.2）。本方向**补全**为"解构层专属、绝不可漏进成片"的全集（FR-05/NFR-01 grep 禁词表的来源）：

```python
# lexicon.py 改后（覆盖原占位）
BY_DIRECTION["D8"] = [
    # —— 四维字段名（schema 内部字段，禁出现在成片）——
    "visual_genome", "Subject_Structure", "Color_Palette_Ratio", "Color_Palette",
    "Lighting_Environment", "Texture_Simulation", "spatial_layers", "source_probe",
    "shadow_drift", "emotion_anchor", "genome_as_reference",
    # —— 色彩量化标记（HSL/HEX 是基因卡本体，但绝不可进成片）——
    "HSL", "HSV", "hue Δ", "色相Δ", "色相偏移",
    # —— 中文解构术语（分析标注，落卡须翻成创作语言）——
    "视觉基因", "视觉基因解构", "基因卡", "解构", "反推", "母色", "占视觉权力",
    # —— 光型/构图分析标注（落卡只留色温K/光比/景别，不留分析名）——
    "伦勃朗光", "三角构图标注", "偏轴对称", "明暗分布",
    # —— 探针档位（过程产物，禁入成片）——
    "探针", "读图能力探针", "档位", "mode: A", "mode: B", "mode: C", "降级到",
]
# 注：纯 #RRGGBB 由审计插件用正则 r"#[0-9A-Fa-f]{6}" 单独硬扫（见 §4.2），
#     不进 lexicon 字符串列表（leak_scan 用 re.escape 逐词匹配，无法表达正则类）。
```

> 这些词是 image-genome 基因卡的**本体**（基因卡里必须有 HSL/四维标签——NFR-01 明确"解构卡里允许出现 HSL/四维标签/光型术语，这是本产物的本体"）；但 `leak_scan` 扫的是**成片**（镜头卡 + Seedance 提示词）——成片里出现任意一条 = NO-GO（FR-05 / DoD#7）。引擎术语（Polanyi/默会/格式塔/寓居/方法论/支柱）由底座 `ENGINE_TERMS` 已覆盖，D8 无需重列。

### ③ 是否引用 model_registry

**引用，只读**。下游成片提示词的视频模型名一律经 `registry.video_default()` 取（当前解析为 `seedance-2.0`）；M4 可选真机对图核验若用图像通道，走 `registry.reg()["image"]["default"]`（默认 nano-banana-pro，与 keyframe 同档）。本方向**不新增/不修改** `model_registry.json`（那是 D3 的单一事实来源）。`image-genome/output-contract.md` 与 megaprompt 文案提到"喂给视频模型"时用中性措辞，不写死模型名常量（避免 D3 前移后返工 + 满足 `portability_scan` 不命中宿主 API）。

### ④ 新增 `audits/audit_image_genome.py` 的 register 名

```python
@register("image_genome")          # run_eval 的 AUDIT_REGISTRY key = "image_genome"
def run(target) -> Report: ...
```

register 名 = `"image_genome"`（与 audit 名 / `Report.audit` 字段一致，下划线风格对齐 `audit_consistency`/`audit_camera_path`）。

---

## 4. 实现分解（可照着写的真实骨架）

### 4.0 数据契约：`ImageGenomeTarget`（插件输入）

`run_eval` / `reverse_test` 喂给插件的 `target` 形态。fixture JSON 与基线 case 都按此结构：

```jsonc
// ImageGenomeTarget schema（fixtures 与 baselines 共用）
{
  "id": "genome_I0-甲",                        // 基线标识（I0 配剧情甲）
  "visual_genome": { ... },                   // 待审的四维基因卡（FR-02 产物，结构见 §4.1）
  "emotion_bridge": {                         // FR-03/FR-04 解构→情绪桥产物
    "anchor_candidate": 4,                    // 图反推的首镜情绪强度初锚 ∈ [0,5]
    "anchor_basis": "色温=3200K暖/光比=1:6高/明暗=暗调",  // 初锚依据（须可回溯到基因卡）
    "routing": [                              // "基因→六维"去向表（四维全有去处，无悬空）
      { "dim": "Subject_Structure",    "to_six": "场面调度",       "to_card": "构图字段" },
      { "dim": "Color_Palette_Ratio",  "to_six": "色彩=情绪的温度", "to_card": "色彩影调锁定+主光色温" },
      { "dim": "Lighting_Environment", "to_six": "光影=情绪的明暗", "to_card": "光影分层" },
      { "dim": "Texture_Simulation",   "to_six": "质感母调",       "to_card": "视觉基调锁定+颗粒" }
    ],
    "reconcile_note": "图为暗调高对比(初锚4)，剧情甲=温情重逢→以剧情/情绪为准下调至2，留痕"  // FR-03 冲突裁决
  },
  "ground_truth": {                           // 仅基线/fixture 携带，NFR-04 派生一致性核对源
    "dominant_hsl": [210, 0.45, 0.30],        // I0 实测主色 HSL（人工标注 ground truth）
    "secondary_hsl": [30, 0.50, 0.55],
    "accent_hsl": [45, 0.80, 0.70],
    "spatial_layers": ["前景栏杆","中景人物","中后景灯笼","深景夜空"],
    "key_position": "侧逆",
    "proper_nouns": ["可口可乐","星巴克"],     // 反向锚定黑名单（若 I0 含品牌则登记；clean I0 应为空）
    "readable_text": []                       // 图中可读真实文字黑名单
  },
  "final_text": "<该基因驱动产出的 storyboard 镜头卡 + Seedance 成片提示词>"  // leak_scan 扫描对象
}
```

### 4.1 `visual_genome` JSON Schema（`image-genome/schema/visual_genome.schema.json`）

机器可消费契约（审计 a 项 `jsonschema` 校验用）。结构照搬 PRD §5.3(A) 四维基因卡，补全机器可校验的 enum/pattern/range；字段值须命中套件已有词表（空间四层/构图法/光位/颗粒，FR-02③"未命中=0"）：

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "visual_genome",
  "type": "object",
  "required": ["source_probe", "Subject_Structure", "Color_Palette_Ratio",
               "Lighting_Environment", "Texture_Simulation"],
  "additionalProperties": false,
  "properties": {
    "source_probe": {                          // FR-01 读图能力探针（过程产物，NFR-01 禁入成片）
      "type": "object",
      "required": ["mode", "can_read_pixels", "can_read_composition", "can_read_lighting"],
      "properties": {
        "mode": { "enum": ["A", "B", "C"] },   // A全自动 / B半自动色块 / C口述兜底
        "can_read_pixels":      { "type": "boolean" },
        "can_read_composition": { "type": "boolean" },
        "can_read_lighting":    { "type": "boolean" }
      }
    },
    "Subject_Structure": {                      // 维1 主体结构（复用 style-refs §141 空间四层 + §144 构图法）
      "type": "object",
      "required": ["spatial_layers", "composition", "subject_orientation"],
      "properties": {
        "spatial_layers": {
          "type": "object",
          "required": ["foreground", "midground", "mid_background", "background"],
          "properties": {
            "foreground":    { "type": "string", "minLength": 1 },
            "midground":     { "type": "string", "minLength": 1 },
            "mid_background": { "type": "string", "minLength": 1 },
            "background":    { "type": "string", "minLength": 1 }
          }
        },
        "composition":         { "enum": ["对称","偏轴对称","三角","横向带状","纵深"] },  // ∈ style-refs §144
        "subject_orientation": { "type": "string", "minLength": 1 }   // 主体朝向/视线/遮挡
      }
    },
    "Color_Palette_Ratio": {                    // 维2 色彩配比（对齐 output-contract §78 色彩影调锁定）
      "type": "object",
      "required": ["dominant", "secondary", "accent", "color_temp_k", "contrast_ratio",
                   "saturation", "shadow_drift"],
      "properties": {
        "dominant":  { "$ref": "#/$defs/colorBand" },   // 主色 ≈60%
        "secondary": { "$ref": "#/$defs/colorBand" },   // 辅色 ≈30%
        "accent":    { "$ref": "#/$defs/colorBand" },   // 点缀 ≈10%
        "color_temp_k":   { "type": "integer", "minimum": 1500, "maximum": 12000 },
        "contrast_ratio": { "type": "string", "pattern": "^1:\\d+$" },   // 光比估值 如 "1:4"
        "saturation":     { "enum": ["低","中","高"] },
        "shadow_drift":   { "type": "string", "minLength": 1 }   // 暗部色相走向 如 "暗部轻微蓝移"
      }
    },
    "Lighting_Environment": {                   // 维3 光线环境（对齐 pro-params 色温光比 + output-contract §128 分层）
      "type": "object",
      "required": ["key_position", "key_direction", "quality", "tonality", "approx_temp_k"],
      "properties": {
        "key_position":  { "enum": ["顺光","侧光","逆光","顶光","侧逆"] },   // 光位词表
        "key_direction": { "type": "string", "minLength": 1 },             // 主光方向
        "quality":       { "enum": ["硬光","柔光"] },
        "tonality":      { "enum": ["明调","暗调","中间调"] },              // 明暗分布
        "approx_temp_k": { "type": "integer", "minimum": 1500, "maximum": 12000 }
      }
    },
    "Texture_Simulation": {                     // 维4 质感模拟（对齐 output-contract §126 颗粒 + continuity §246 film grain）
      "type": "object",
      "required": ["texture", "grain_strength", "lens_feel"],
      "properties": {
        "texture":        { "type": "string", "minLength": 1 },  // 胶片颗粒/数字干净/油画感/材质标签
        "grain_strength": { "enum": ["无","轻微35mm","中等"] },   // ∈ pro-params 颗粒词表 §126
        "lens_feel":      { "type": "string", "minLength": 1 }
      }
    }
  },
  "$defs": {
    "colorBand": {
      "type": "object",
      "required": ["hex", "ratio"],
      "properties": {
        "hex":   { "type": "string", "pattern": "^#[0-9A-Fa-f]{6}$" },
        "ratio": { "type": "number", "minimum": 0, "maximum": 1 }
      }
    }
  }
}
```

> **禁出成片字段**：本卡禁出现 台词 / 切镜方式 / Seedance 标记（成片字段，NFR-01）——schema 用 `additionalProperties:false` 拒未知字段，审计插件再二次硬扫 `台词/切镜方式/Seedance`（见 §4.2 (c)）。

### 4.2 审计插件 `audits/audit_image_genome.py`（骨架 + 核心逻辑）

五组判据，对应 PRD §7「审计脚本」的 (a)~(e)。`target` 约定为一个 dict（§4.0），含 `id`/`visual_genome`/`emotion_bridge`/`ground_truth`/`final_text`。

```python
# _shared/scripts/audits/audit_image_genome.py
import json, re, colorsys
from jsonschema import Draft202012Validator
from harness.audit_report import Report, Finding, Verdict
from harness.run_eval import register
from harness.leak_scan import leak_scan
from harness import lexicon

_SCHEMA = json.load(open("image-genome/schema/visual_genome.schema.json", encoding="utf-8"))
_VALIDATOR = Draft202012Validator(_SCHEMA)

SIX_DIMS = {"场面调度", "色彩=情绪的温度", "光影=情绪的明暗", "质感母调"}  # tacit-core §36-41 的去向锚
GENOME_DIMS = {"Subject_Structure", "Color_Palette_Ratio",
               "Lighting_Environment", "Texture_Simulation"}
FORBIDDEN_IN_CARD = ["台词", "切镜方式", "Seedance", "硬切", "叠化"]  # 成片字段，基因卡内禁出现
HEX_RE = re.compile(r"#[0-9A-Fa-f]{6}")

def _hex_to_hsl(hexs: str):
    r = int(hexs[1:3], 16) / 255; g = int(hexs[3:5], 16) / 255; b = int(hexs[5:7], 16) / 255
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return (h * 360, s, l)                       # (hue 0-360, sat 0-1, light 0-1)

def _hue_delta(h1, h2):
    d = abs(h1 - h2) % 360
    return min(d, 360 - d)                       # 环形最短色相距离

@register("image_genome")
def run(target) -> Report:
    rep = Report(audit="image_genome", target=target["id"])
    g = target["visual_genome"]; gt = target.get("ground_truth", {})
    bridge = target.get("emotion_bridge", {})

    # (a) D8-FR-02①③④：四维基因卡 schema 校验（四维齐全 + 字段命中词表 + 拒未知字段）
    for e in sorted(_VALIDATOR.iter_errors(g), key=lambda e: list(e.path)):
        rep.findings.append(Finding(
            check="D8-FR-02", verdict=Verdict.FAIL,
            detail=f"visual_genome schema 违例: {list(e.path)} {e.message}",
            fix="按 image-genome/schema/visual_genome.schema.json 修正字段（四维须齐全、值须命中套件词表）"))

    # (b) D8-FR-02②：色彩三色配比之和 = 100%（±5%）
    cpr = g.get("Color_Palette_Ratio", {})
    bands = [cpr.get("dominant", {}), cpr.get("secondary", {}), cpr.get("accent", {})]
    ratio_sum = sum(b.get("ratio", 0) for b in bands)
    if abs(ratio_sum - 1.0) > 0.05:
        rep.findings.append(Finding("D8-FR-02", Verdict.FAIL,
            f"6:3:1 配比之和 {ratio_sum:.2f} 偏离 1.00 超 ±0.05",
            measured=round(ratio_sum, 3), threshold="1.00±0.05",
            fix="调整 dominant/secondary/accent 的 ratio 使之和=100%（容差±5%）"))

    # (c) NFR-01：基因卡内禁含成片字段
    card_text = json.dumps(g, ensure_ascii=False)
    for w in FORBIDDEN_IN_CARD:
        if w in card_text:
            rep.findings.append(Finding("D8-NFR-01", Verdict.FAIL,
                f"基因卡含成片字段 {w!r}（属成片层，泄漏）",
                fix=f"从基因卡删除 {w!r}；基因卡是过程产物，不含台词/切镜/Seedance 成片字段"))

    # (d) NFR-04：派生一致性——自动模式(A)主色 HSL 色相 Δ ≤15°（仅 A 档强校，B/C 放宽见 §8）
    if g.get("source_probe", {}).get("mode") == "A" and gt:
        for band_name, gt_key in [("dominant", "dominant_hsl"), ("secondary", "secondary_hsl"),
                                  ("accent", "accent_hsl")]:
            hexs = cpr.get(band_name, {}).get("hex")
            gt_hsl = gt.get(gt_key)
            if hexs and gt_hsl:
                meas_h = _hex_to_hsl(hexs)[0]; delta = _hue_delta(meas_h, gt_hsl[0])
                if delta > 15:
                    rep.findings.append(Finding("D8-NFR-04", Verdict.FAIL,
                        f"{band_name} 取色 HSL 色相 Δ {delta:.1f}° > 15°（与图实际取色不符）",
                        measured=round(delta, 1), threshold="≤15°",
                        fix=f"A 档须忠实取图色：把 {band_name}.hex 修正到色相 Δ≤15°，禁为基因好看编造"))

    # (e) D8-FR-03：四维全部映射到情绪优先六维（去向表无悬空）
    routed = {r.get("dim") for r in bridge.get("routing", [])}
    missing = GENOME_DIMS - routed
    if missing:
        rep.findings.append(Finding("D8-FR-03", Verdict.FAIL,
            f"基因→六维去向表悬空: 缺去向的维 {sorted(missing)}",
            measured=sorted(routed), threshold=sorted(GENOME_DIMS),
            fix="为每个悬空维补一条 routing（dim→to_six→to_card），四维须全有去处"))
    for r in bridge.get("routing", []):
        if r.get("to_six") not in SIX_DIMS:
            rep.findings.append(Finding("D8-FR-03", Verdict.FAIL,
                f"去向 to_six {r.get('to_six')!r} 不在情绪优先六维锚集",
                fix=f"把 to_six 改为 tacit-core 六维之一: {sorted(SIX_DIMS)}"))

    # (f) D8-FR-04：图反推情绪初锚 ∈ [0,5] 且写明依据
    anchor = bridge.get("anchor_candidate")
    if not (isinstance(anchor, int) and 0 <= anchor <= 5):
        rep.findings.append(Finding("D8-FR-04", Verdict.FAIL,
            f"图情绪初锚 {anchor!r} 不在 [0,5] 整数区间",
            measured=anchor, threshold="[0,5]∈ℤ",
            fix="把 anchor_candidate 设为 0–5 整数，并填 anchor_basis（色温/光比/明暗依据）"))
    elif not bridge.get("anchor_basis"):
        rep.findings.append(Finding("D8-FR-04", Verdict.FAIL,
            "情绪初锚缺依据 anchor_basis（须可回溯到色温/光比/明暗）",
            fix="填 anchor_basis，写明初锚来自 color_temp_k/contrast_ratio/tonality"))

    # (g) D8-FR-05/NFR-01：成片层引擎隐身 + 解构层零泄漏（复用底座 leak_scan + D8 禁词）
    leak = leak_scan(target["final_text"], extra_terms=lexicon.BY_DIRECTION["D8"])
    rep.findings.extend(leak.findings)
    # 纯 #RRGGBB 正则硬扫（lexicon 字符串列表表达不了正则类）
    for m in HEX_RE.findall(target["final_text"]):
        rep.findings.append(Finding("D8-FR-05", Verdict.FAIL,
            f"成片残留 HEX 色值 {m}（解构层产物，禁入成片）",
            fix="从成片删除 HEX；色彩只可以创作语言+色温K呈现，HSL/HEX 留在内部基因卡"))

    # (h) N4/DoD#9：反向锚定——成片不得含参考图 IP/品牌/可读真实文字
    for noun in gt.get("proper_nouns", []) + gt.get("readable_text", []):
        if noun and re.search(re.escape(noun), target["final_text"]):
            rep.findings.append(Finding("D8-N4", Verdict.FAIL,
                f"成片命中参考图 IP/品牌/可读文字 {noun!r}（题材搬运/版权破口）",
                fix=f"剥离 {noun!r}；解构只取美学手感，不搬参考图具体主体/品牌/文字"))

    rep.assert_fail_has_fix()
    return rep
```

> 依赖：`jsonschema`（纯 PyPI 库）+ 标准库 `colorsys`（HSL 换算，无需 Pillow/numpy，因 fixture 已带 ground-truth HSL，插件不直接读像素）。`jsonschema` 偏离底座"标准库 + 仅像素 Pillow/numpy"原则——见 §8 风险，提供"内置最小校验器降级"回滚路径。

### 4.3 核心算法（图当读本、不当指令，伪代码权威版——在 `image-genome/SKILL.md` 描述 + megaprompt 内联）

照搬 PRD §5.3(D)，补全各步与 §4 审计闸的对应关系：

```
def image_first_storyboard(ref_image, script_text):
    probe  = image_capability_probe()                  # FR-01 先 de-risk，定 A/B/C 档
    genome = deconstruct_four_dims(ref_image, probe)   # FR-02 四维解构（≤2 次读图调用，NFR-03）
    assert four_dims_complete(genome)                  # 四维齐全 schema 门（审计 a）
    if probe.mode == "A":
        assert hsl_hue_delta(genome.colors, ref_image) <= 15   # NFR-04 派生一致性（审计 d）

    # —— 图当读本喂引擎，绝不直连成片 —— FR-03
    indwell = tacit_indwell(genome, script_text)        # 复用 tacit-core 第0步寓居（图当场景住进去）
    anchor  = emotion_anchor_from_visual(genome)        # 由色温/光比/明暗反推情绪初锚（visual-genome C表）
    anchor  = reconcile(anchor, script_text)            # 图×文字冲突 → 以情绪/剧情为准 + 留痕（审计 f/reconcile_note）
    routing = route_to_six_dims(genome)                 # 四维→情绪六维去向表（审计 e，无悬空）
    curve   = emotion_curve(anchor, script_text)        # FR-04 图给起点，文字驱动全曲线

    board = storyboard_six_dims(curve, genome_as_reference=genome)  # 六维设计，基因仅作参照（非指令）
    enforce_mapping_tables(board)                       # 图不豁免强制映射（景别-情绪/运镜）

    # —— 剥离全部解构过程产物 —— FR-05 / NFR-01
    strip_genome_fields(board)                          # 删四维标签/HEX/HSL/分析术语/探针档位
    assert grep_no_genome_leak(board)                   # FR-05 grep 命中=0（审计 g）
    assert no_ip_brand_carry(board)                     # N4 反向锚定（审计 h）
    assert passes(board, "storyboard/output-contract.md §7")  # 零改下游契约即过自检
    return board                                        # = 标准 v2.0 镜头卡 + 每组一段 Seedance
```

### 4.4 视觉→情绪强度初锚反推表（`visual-genome.md` 核心，FR-04，机器可解析）

照搬 PRD §5.3(C)，给每行加机器可解析键供 megaprompt 与人内化共用；**只给首镜视觉初锚，全片曲线仍由文字剧情驱动**（FR-04 验收②）：

| 视觉信号（基因卡读出什么） | → 情绪强度初锚（0–5） | 依据 |
|---|---|---|
| 暖色高调 + 低光比(≤1:2) + 柔光 | 0–1（中性/轻微） | 安稳、明亮、低冲突 |
| 中间调 + 中光比(≈1:4) + 侧光 | 2–3（平稳叙事/情绪上升） | 戏剧反差适中 |
| 高对比暗调 + 硬光 + 冷色 | 3–4（情绪上升/强情绪） | 压迫、威胁、内心收紧 |
| 极端明暗 + 单点高光 + 极浅景深 | 4–5（强情绪/极致） | 决定性瞬间、聚焦内心 |

> 落卡前初锚仍须过 `mapping-tables.md` 强制项（图不豁免景别-情绪强制映射）。冲突裁决：图×文字情绪相左 → 以情绪/剧情为准，写 `reconcile_note` 留痕（审计 f）。

---

## 5. 任务拆解（Tickets）

| Ticket ID | 描述 | 产物 | 工时(人天) | 前置 |
|---|---|---|---|---|
| **D8-T01** | 宿主多模态读图能力探针 spike：拿 I0 实测能否取准主色 HEX/判光位/辨空间四层，定 A 档实际可达性；写 FR-01 探针逻辑草案 | de-risk 结论（A/B/C 实际可达档）+ 探针逻辑 | 2.5 | 底座 Sprint0 已立（`harness/` 单测过） |
| **D8-T02** | 落 `_shared/visual-genome.md`：探针三档判定 + 四维字段范式与量化阈值 + 视觉→情绪反推表 + "基因→六维"去向表 + 合规反向锚定 + NFR-05 口径统一 | `visual-genome.md` | 3.0 | D8-T01 |
| **D8-T03** | 落四维基因卡两态契约：`image-genome/output-contract.md`（人读 + 去向表 + 自检门）+ `schema/visual_genome.schema.json`（机器读） | 中间产物契约 + JSON Schema | 1.5 | D8-T02 |
| **D8-T04** | 落 `image-genome/SKILL.md`：6 步管线 + 图当读本算法 + 三档探针编排 + 引擎隐身落卡规则；frontmatter 可触发（≥5 触发词：图像优先/视觉基因/一图成片/参考图解构/image genome） | 成员入口 | 3.0 | D8-T02, D8-T03 |
| **D8-T05** | 注册改动：`README.md` 成员表/目录树加 `🖼️ 图像优先入口 → image-genome/`；`storyboard/SKILL.md` Step 0 读本对象追加 + 注脚；`style-refs.md:132` 加交叉引用注脚 | 3 改文件 diff | 0.5 | D8-T04 |
| **D8-T06** | 造黄金基线 I0：取 1 张原创无版权美学图（明确主辅点缀三色/可辨空间四层/明确光位/明显质感）+ 人工四维 ground-truth 标注（三色 HSL/空间四层/光位/质感/proper_nouns 黑名单） | `baselines/cases/genome_I0/`（标注 + 图引用） | 2.0 | D8-T03 |
| **D8-T07** | 写审计插件 `audits/audit_image_genome.py`（五判据 a~h）+ `@register("image_genome")` + `assert_fail_has_fix` | 审计插件 | 2.0 | D8-T03, D8-T06 |
| **D8-T08** | 把 `lexicon.BY_DIRECTION["D8"]` 占位补全为禁词全集；接 `leak_scan` extra_terms + HEX 正则硬扫 | `lexicon.py` diff | 0.5 | D8-T07 |
| **D8-T09** | 造 fixtures 一对：`D08_image_genome.clean.json`（应 PASS）+ `D08_image_genome.poison.json`（6 投毒变体见 §6，应 FAIL）；写 `assert_gate_is_real` 测试 | fixtures + 反向测试 | 1.5 | D8-T07 |
| **D8-T10** | 跑 I0 三档（A/B/C）产基因卡 + 情绪初锚 + 去向表 + 成片；冻结基因卡为黄金基线 `snapshot.freeze`；生成 `examples/fewshot-图像优先-demo.md`（脱敏 few-shot 兼人读基线） | 黄金基线 + few-shot | 2.0 | D8-T04, D8-T06, D8-T07 |
| **D8-T11** | 接 `run_eval`：`genome_I0` 进 `cases/`，跑 5 基线 × 全审计 GO/NO-GO；接合入门 `make verify` 四项绿 | run_eval/CI 绿证据 | 1.0 | D8-T09, D8-T10 |
| **D8-T12** | T1 专项用例「同图换剧情」：I0 × 剧情甲(温情重逢)/乙(诀别对峙) → 两条情绪曲线 + 两套镜头卡；断言首镜视觉初锚同、全曲线与落卡异 | T1 用例 + 断言 | 1.0 | D8-T10 |
| **D8-T13** | 负例 NB0（伪装宿主无读图）+ NB1（含品牌 Logo+可读文字的图）跑通：NB0 显式落 B/C 不静默假解构；NB1 基因/成片剥离品牌/文字 | 两负例用例 + 断言 | 1.0 | D8-T04, D8-T07 |
| **D8-T14** | 可移植双态：`_megaprompts/image-genome.megaprompt.md` 单文件版；C 档喂"图的文字描述 + 剧情"能产合法基因卡 + 成片卡（不依赖 Skill） | megaprompt | 1.5 | D8-T04 |
| **D8-T15** | 真机对图 A/B（M4，付费由用户亲点）：I0 + 一段剧情，A=纯文字口述图走前向 storyboard / B=D8 图像优先链，**用户亲点** 1 组 Seedance；≥3 评审量成片色温/光比/明暗气质贴近 I0 命中率，B>A | 真机比对结论 | 1.0 | D8-T10 |
| **D8-T16** | `portability_scan` 扫 `image-genome/SKILL.md`+`visual-genome.md`+megaprompt 零命中；README/目录结构收尾核对 | 可移植扫描绿 + README diff | 0.5 | D8-T04, D8-T14 |

> 合计约 26.0 人天 ≈ 5.2 人周（含探针 spike + 真机 + 双态）。**MVP 主链**（T01–T13,T16）≈ 4.5 人周，对齐 PRD §10「约 2.5–3.0 人周（不含宿主多模态改造）」——本拆解把探针 spike、真机、双态、负例显式计入，故略高于 PRD 粗估。

---

## 6. 测试方案

### ① 正例（clean 基线：期望 GO）

- 用 `_shared/scripts/fixtures/D08_image_genome.clean.json`：一份**合法** `visual_genome`（schema 全过、四维齐、配比和=100%、A 档主色 HSL Δ≤15°、字段命中词表）+ 合法 `emotion_bridge`（四维全有去向、初锚 ∈[0,5] 带依据）+ 一份成片 `final_text`（镜头卡 + 每组一段 Seedance，零解构词、零 HEX、零 IP/品牌）。
- 期望：`audit_image_genome.run(clean).decision == "GO"`，`exit_code == 0`，无 FAIL Finding。
- 同时 `genome_I0`（`baselines/cases/genome_I0/`）进 `run_eval` 5 基线集，整体 GO。

### ② 反向注入（poison fixture：具体投毒 + 期望测回值）

`D08_image_genome.poison.json` 从 clean 复制，**埋 6 处独立投毒**，每处对应一条精确 FAIL：

| 变体 | 投毒动作（具体到字段值） | 命中闸 | 期望测回 |
|---|---|---|---|
| **P1 主色色相偏移**（回归 diff 核心） | 把 `Color_Palette_Ratio.dominant.hex` 从 `#3A5A78`（≈H210 钢蓝，ground_truth `dominant_hsl[0]=210`）改成 `#783A5A`（≈H330 品红），制造色相偏移 ≈120°；探针 `mode:"A"` | D8-NFR-04 | `measured≈120°（容差±3°）, threshold="≤15°"`；判 **FAIL**。（PRD 硬要求口径：基线 H210→改 H330，期望脚本测回偏移≈120°±3°判 FAIL） |
| **P2 配比失衡** | 把三色 `ratio` 从 `0.6/0.3/0.1` 改成 `0.6/0.3/0.3`（和=1.20） | D8-FR-02 | `measured=1.20, threshold="1.00±0.05"`，超 +0.15；判 **FAIL** |
| **P3 四维缺维 / 字段越表** | 删掉 `Texture_Simulation` 整块（缺一维）；或把 `composition` 从 `三角` 改成表外值 `散点`（越 enum） | D8-FR-02 | schema 报 `required` 缺 `Texture_Simulation` / `composition` 不在 enum；判 **FAIL** |
| **P4 去向悬空** | 删 `emotion_bridge.routing` 里 `Color_Palette_Ratio` 那条（四维少一去向） | D8-FR-03 | `measured` 缺 `Color_Palette_Ratio`，`missing={"Color_Palette_Ratio"}`；判 **FAIL** |
| **P5 解构层泄漏成片**（引擎隐身破口） | 在 `final_text` 成片提示词里塞 `"Texture_Simulation: 35mm grain, 主色 HSL(210,45,30) #3A5A78，伦勃朗光，探针 mode: A"` | D8-FR-05 / leak_scan | `leak_scan` 命中 `Texture_Simulation`/`HSL`/`伦勃朗光`/`探针`/`mode: A` 多词逐词 FAIL；HEX 正则再报残留 `#3A5A78`；判 **FAIL**（PRD §7 反例：把"Texture_Simulation: 35mm grain"原标签拼进 Seedance → 审计必报不合格） |
| **P6 IP/品牌搬运** | `ground_truth.proper_nouns=["可口可乐"]`，在 `final_text` 塞入 `"背景霓虹招牌写着可口可乐"` | D8-N4 | `detail` 命中参考图品牌 `可口可乐`；判 **FAIL** |

- 期望总判：`audit_image_genome.run(poison).decision == "NO-GO"`，`exit_code == 1`，FAIL Finding ≥ 6 条。

**回归专项 poison（PRD §7 回归 diff，对接 snapshot）**：复制 I0 黄金基因卡，把 `Color_Palette_Ratio.dominant.hex` 从 `H210` 改成 `H240`（蓝紫），或把 `Subject_Structure.composition` 从 `三角` 改成 `纵深`。期望 `snapshot.diff_against_golden` 报 `REGRESSION` WARN（产物相对黄金基线漂移），触发人审：**主色 HSL / 空间四层 / 光位不得无故漂移**。

### ③ `assert_gate_is_real` 调用示例

```python
# tests/test_image_genome_gate.py
import json
from harness.reverse_test import assert_gate_is_real
from audits.audit_image_genome import run as genome_gate

def _load(p): return json.load(open(p, encoding="utf-8"))

def test_image_genome_gate_is_real():
    clean  = _load("_shared/scripts/fixtures/D08_image_genome.clean.json")
    poison = _load("_shared/scripts/fixtures/D08_image_genome.poison.json")
    # 整体证明：clean 放行 / poison 报红
    assert_gate_is_real(genome_gate, clean, poison, name="D8-image_genome")
    # 逐变体证明每个闸独立会变红（poison 文件可携 variants 子对象）
    for v in ["P1", "P2", "P3", "P4", "P5", "P6"]:
        assert_gate_is_real(genome_gate, clean, poison["variants"][v],
                            name=f"D8-image_genome/{v}")
    #  ↑ 内部断言：clean.exit_code==0（不误杀）且 poison[v].exit_code==1（投毒必被抓）
```

### ④ 回归：冻结哪份黄金基线，改什么后重跑

- **冻结**：`snapshot.freeze(I0_genome, "_shared/baselines/cases/genome_I0/genome.golden.json")`（归一化排序后字节级），同时冻结 `emotion_bridge.golden.json`（初锚 + 去向表）。
- **触发重跑**：任何动 `_shared/visual-genome.md`（改四维范式/反推表/去向表/阈值）或 `audit_image_genome.py` 的 PR。
- **重跑动作**：用新 `visual-genome.md` 重解构 I0 → `diff_against_golden(new_genome, golden)`。
  - 若 diff 为**有意改进**（如新增一类质感识别使取色更准）→ 人审后 `re-freeze` 基线，留 PR 记录。
  - 若 diff 是**无故漂移**（主色 HSL / 空间四层 / 光位变了但没改进理由）→ 回滚（WARN→人审定性，参 §2.4 fix 文案）。
- **改 HSL Δ 阈值 / 配比容差**（如宿主弱放宽 A 档阈值）→ 同步改 `visual-genome.md` + 审计插件常量 + clean fixture 边界 + re-freeze 基线，四处一致才过。
- **合入门**：`make verify` 四项（`run_eval` / `reverse_test --all` / `leak_scan_all` / `portability_all`）全绿才允许合入（SUBSTRATE §5）。

### ⑤ "图只给起点不锁全程"专项用例（T1，FR-04 核心证据）

- 同一张 I0 分别配 (剧情甲=温情重逢 / 剧情乙=诀别对峙) 两段文字，跑出两条情绪曲线 + 两套镜头卡。
- 断言：**首镜视觉初锚相同**（`anchor_candidate` 由图唯一决定，两案一致）、**全曲线与落卡不同**（剧情甲整体偏暖低强度、剧情乙偏冷高强度）→ 证明"图驱动起点、文字驱动全程"真成立（这是本方向价值的硬证据，非"提升质量"空话）。
- 可量化：T1 用例产两份 `final_text`，断言 `首锚甲 == 首锚乙` 且 `镜头卡甲 != 镜头卡乙`（情绪曲线序列哈希不同）。

### ⑥ 真机层（M4，付费按钮由用户亲点）

- 取 I0 + 一段剧情，跑 D8 全链出 1 组 Seedance 成片。
- 由**用户亲点**生成（计费门，遵 CLAUDE.md「付费按钮用户亲点」，我只产卡不点）。
- 人评 A/B（DoD 真机佐证）：A=纯文字口述图走前向 storyboard、B=D8 图像优先解构链，量"成片画面的色温/光比/明暗气质是否更贴近原参考图 I0"的命中率（≥3 名评审），B 应显著高于 A。
- 成本闸（NFR-03）：自动模式解构 1 张图宿主读图调用 ≤2 次；真机出图为可选末步、不逐镜出图。

**为何这样能证明"真的有效"**（指回 PRD §7）：P1/P2 是数值化对账（色相 Δ≈120°±3°、配比和 100%±5%）非空话；T1「同图换剧情曲线必变、首锚不变」可量化重跑地证明"图只给起点"；P5+反例用 grep 硬扫证明解构层没漏进成片层；clean 过 `storyboard/output-contract §7` 证明 D8 复用而非旁路下游质量门。

---

## 7. 里程碑与退出门

| 里程碑 | 产物 | 退出门（脚本必绿 / DoD 必过） |
|---|---|---|
| **M0 · de-risk**（T01） | 宿主读图能力探针 spike 结论：A 档实际可达性（能否取准主色 HEX/判光位/辨空间四层） | de-risk 结论书面给出"A 档可达 / 须落 B/C + HSL 阈值放宽建议"；不写"假设宿主能读图"的空头开发（SUBSTRATE 完善③） |
| **M1 · 解构知识（Bone）**（T02） | `_shared/visual-genome.md`（探针三档 + 四维范式与阈值 + 反推表 + 去向表 + 合规锚定 + 口径统一） | `portability_scan` 扫 `visual-genome.md` 零命中；NFR-05 口径检（视觉四维≠情绪六维不混用）人审过 |
| **M2 · 成员落地（Skin）+ 契约**（T03,T04,T05） | `image-genome/SKILL.md` 6 步管线 + `output-contract.md` + `visual_genome.schema.json` + README/storyboard/style-refs 注册 | `visual_genome.schema.json` 可被 `jsonschema` 加载校验；成员触发词 ≥5；`portability_scan` 对成员目录=0；DoD#1（可触发可跑） |
| **M3 · 闸 + 反例 + 基线 + 回归**（T06–T12）★MVP 切线 | `audit_image_genome.py` + clean/poison fixtures（6 变体）+ I0 黄金基线 + few-shot + run_eval 接入 + T1 用例 | **`assert_gate_is_real` 双过**（clean GO / poison 6 变体 NO-GO）；`make verify` 四项绿；T1 首锚同/曲线异断言过（DoD#3/#4/#5/#6/#7/#8） |
| **M4 · 负例 + 双态 + 真机**（T13,T14,T15,T16） | NB0/NB1 用例 + megaprompt 双态 + 真机对图 A/B + 可移植扫描 | NB0 显式落 B/C **不静默假解构**（DoD#2）；NB1 基因/成片剥离品牌/文字（DoD#9）；megaprompt C 档独立可跑（DoD#10）；真机 B>A |

**MVP 切线 = M3 完成**：此时文本审计闸（四维 schema + 配比/HSL 量化 + 去向无悬空 + 解构层零泄漏 + 反向锚定 + T1 同图换剧情）全绿、可冷启动重跑回归，即为可交付可验证核心。**M4（mega-prompt 双态 NFR-02 + 真机对图 A/B + 负例完整化）可作第二批**——不阻塞主链 GO/NO-GO（PRD §10 已明示 M4 可后置）。**关键路径** M0→M1→M2→M3；M4 可与 M3 末段并行。

---

## 8. 风险与回滚

| 风险 | 影响 | 缓解 / 回滚 / 降级路径 |
|---|---|---|
| **宿主多模态读图能力弱/不稳**（核心风险，PRD 自评 4/5 扣 1 分根因） | A 档名存实亡，取色/判光位/辨空间层次失准 | M0 探针 spike 先 de-risk；不可用 → 当场落 **B 档**（用户提供主色块缩略 + 口述构图）/ **C 档**（口述兜底，退化为带"视觉锚优先"写法的前向 storyboard），三档都产 schema 合法基因卡。**降级是设计内既定路径，非失败**（FR-01 显式告知档位，对齐 continuity-quality:188「缺参考必须停下，不得虚构」）；HSL Δ≤15° 仅 A 档强校，B/C 档审计跳过该项并放宽（§4.2 (d) 已按 mode 门控） |
| **解构标签/HEX/分析术语漏进成片**（引擎隐身破口，第一红线之防线） | 破铁律①，成片出现 `Subject_Structure`/`#RRGGBB`/"伦勃朗光" | FR-05 硬隔离 `strip_genome_fields` 落卡剥离 + `leak_scan` `BY_DIRECTION["D8"]` 硬门 + HEX 正则二次硬扫 + poison P5 反例；任一命中 `make verify` 红、阻断合入 |
| **解构标签被当生成指令直连成片**（第一红线本身） | 绕过情绪先行、画面僵硬照搬参考图 | N2/FR-03 强制经情绪优先六维管线；算法 `genome_as_reference`（仅参照非指令）；去向表保证四维经六维"翻译"再落卡；落卡仍过 `mapping-tables` 强制项（图不豁免） |
| **图把情绪曲线锁死**（图喧宾夺主） | 不同剧情被同一张图绑成同一曲线 | FR-04 验收②"换剧情曲线必变" + T1 专项用例（首锚同/曲线异硬断言）；反推表只给**首镜初锚**，全程由文字驱动 |
| **IP/品牌/题材搬运**（版权 + 原创破口） | 侵权、与 tacit-core 题材原创检冲突 | N4 + 负例 NB1 + 审计 (h) `proper_nouns`/`readable_text` 黑名单正则 + visual-genome 合规反向锚定（复用 continuity-quality:170-178）；基因只取手感不取内容 |
| **图×文字情绪冲突无裁决** | 产出情绪稀释/多锚废稿 | FR-03"以情绪/剧情为准 + 留痕"（`reconcile_note`）；守 tacit-core 单一主锚铁律 |
| **四维与情绪优先六维口径混淆** | 文档混乱、误把四维当六维 | NFR-05 明确"视觉四维=输入侧解构，情绪六维=内部推理"，不同名不混用；`visual-genome.md` 开篇收敛口径 |
| **`jsonschema` 引入破"底座零额外依赖"原则** | 偏离 SUBSTRATE §1（标准库 + 仅像素 Pillow/numpy） | 回滚：审计 (a) 改用**内置最小校验器**（纯标准库手写：遍历 required/enum/pattern/range + colorBand `$ref` 内联展开），覆盖本 schema 子集，去掉 `jsonschema` 依赖；schema.json 仍作人读契约保留 |
| **反复回读图爆 token/成本** | 解构昂贵 | NFR-03 自动模式 ≤2 次读图调用（一次读色值/构图、一次读光位/质感）；B/C 档零额外模型调用；真机对图核验为可选末步、用户亲点 |
| **底座 harness 尚未落地**（D8 依赖 `harness/` 已存在；当前 `_shared/scripts/` 为空，仅 substrate 文档存在） | 插件无处可挂 | **前置依赖** = SUBSTRATE §6 步行骨架（Sprint0）已立（`audit_report`/`leak_scan`/`lexicon`/`run_eval`/`snapshot`/`reverse_test` 单测过）；若未立，D8 阻塞在 T01 前，不并行抢跑。降级路径：先以独立 `verify_genome.py`（同断言、不 import harness）跑通文本闸，待 harness 就绪再改为 `@register` 接入（断言逻辑不变，仅换 Report 来源） |

**总回滚策略**：D8 是纯增量插件 + 新成员目录，不改任何既有契约语义（PRD N5）。任一环失败，删 `image-genome/` 目录 + 撤 4 处注册（README/storyboard/style-refs/lexicon）+ 删 `audit_image_genome.py` + `visual-genome.md` 即完全回滚，对其余 12 方向与既有成员**零影响**。

---

*本方案以"插件 + 一对 fixture + 黄金基线 + 知识/契约 md"的形态接入共享底座，零重造机制：报告/leak_scan/snapshot/reverse_test/run_eval/registry 全部复用 `00-ENGINEERING-SUBSTRATE.md` 定义的构件。测试方案的 `assert_gate_is_real`/`run_eval`/`snapshot` 调用与全套件口径一致；Soul（`tacit-core.md` 情绪优先六维引擎）一行不改，输入从"只吃文字"扩成"文字 ∪ 图"，引擎隐身铁律扩展为"解构层不漏进成片层"。*
