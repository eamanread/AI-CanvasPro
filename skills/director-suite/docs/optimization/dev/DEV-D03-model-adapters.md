# D3 · 多模型适配矩阵 + 模型无关抽象 开发方案

> 编号 D3 ｜ 优先级 P1 ｜ 状态 Dev v0.1 ｜ 前置:本方向 PRD（`../D03-model-adapters.md`）+ `00-ENGINEERING-SUBSTRATE.md`
>
> 本文档回答 **how-to-build**：把 D3 的 FR-01~FR-05 接到共享底座（harness/audits/fixtures/baselines/registry/lexicon）上。
> PRD 已答 what/why，本文不重抄；凡机制（报告/leak_scan/snapshot/reverse_test/run_eval/registry）一律**复用底座，不重造**。
> D3 是底座 §0-⑤"模型注册表前移"的承载方向——`model_registry.json` 是全套件唯一模型事实源，必须在 Sprint1 早期落地，其余方向引用它。

---

## 1. 目标与范围

落地 PRD 的 **D3-FR-01~05**：建立模型无关能力契约（`capability-contract.md`，7 中性字段）、四类 adapter 矩阵（video/image/voice/music）、单一事实源 `model_registry.json` + 结构化 fallback chain，并把 `continuity-quality.md` 等散落硬编码模型常量改为引用。

**作为"底座插件"的边界（纪律）：**

- D3 **不造任何验证机制**。报告结构走 `harness/audit_report.py::Report`；引擎隐身门走 `harness/leak_scan.py`；可移植性门走 `harness/portability_scan.py`；黄金基线冻结/diff 走 `harness/snapshot.py`；反向注入走 `harness/reverse_test.py::assert_gate_is_real`；GO/NO-GO 编排走 `harness/run_eval.py::register`；模型读取走 `harness/registry.py`。
- D3 **只交付**：① 1 个审计插件 `audits/audit_model_adapters.py`；② 一对 clean/poison fixture（外加 voice 路由、image 路由两组小 fixture）；③ 黄金基线（中性字段卡 + seedance/kling3 双译产物 + registry 快照）；④ 知识/契约 md 文件（capability-contract + 各 adapter + image `_routing`）；⑤ `model_registry.json`（D3 是它的 owner）；⑥ `lexicon.BY_DIRECTION["D3"]` 禁词项；⑦ 任务拆解。
- D3 **不接真机 API、不写调用代码**。adapter 是"该喂什么 prompt / 选哪个模型"的提示词语法规范，真机路由是宿主/ViMax provider 的事。
- D3 **不改镜头卡对人字段主结构**，只在末端"成片提示词转换"段切换 adapter，并把硬编码模型名替换为 registry 引用。

> 一句话：D3 是底座 §0-⑤ 的承载点——把 `model_registry.json` 做成全套件唯一模型定义点，并补出 adapter 矩阵 + 中性契约，让"换模型 = 改 registry 1 行 + 已存在该 adapter"成真。

---

## 2. 交付物清单

精确文件路径（仓库根 = `skills/director-suite/`）。类型∈{知识md/契约md/audits插件py/fixtures/baselines/样例md/registry项}。

| 路径 | 类型 | 说明 |
|---|---|---|
| `_shared/_model/capability-contract.md` | 契约md | **核心**。7 中性字段（dialogue/sfx/bgm/title_card/reference/duration_window/keyframe）取值域 + 各 adapter 支持矩阵规范。FR-01 |
| `_shared/_model/model-registry.md` | 知识md | registry 的**人读文档面**：默认模型/画幅/分辨率/时长窗/fallback 语义说明。机器面是 JSON（见下行） |
| `_shared/scripts/model_registry.json` | registry项 | **底座 §2.7 指定路径**。全套件唯一模型事实源。D3 是 owner，`registry.py` 读它 |
| `_shared/_model/video/seedance-2.0.md` | 契约md | **迁移**自 `_shared/seedance-2.0.md` + 补七字段支持矩阵。FR-02 |
| `_shared/_model/video/kling3.md` | 契约md | 新增 video adapter（语法映射 + 支持矩阵 + 负面约束）。FR-02 |
| `_shared/_model/video/veo.md` | 契约md | 新增 video adapter。FR-02 |
| `_shared/_model/video/sora.md` | 契约md | stub（顶部标 `status: stub`，仅支持矩阵骨架）。FR-02 |
| `_shared/_model/video/jimeng.md` | 契约md | stub（即梦）。FR-02 |
| `_shared/_model/image/_routing.md` | 知识md | 图像分级选型决策表（任务×一致性→首选+兜底+量化理由）。FR-03 |
| `_shared/_model/image/nano-banana-pro.md` | 契约md | image adapter（LOGO/文字/多图融合）。FR-03 |
| `_shared/_model/image/nano-banana-2.md` | 契约md | image adapter（快/省/草图）。FR-03 |
| `_shared/_model/image/gpt-image-2.md` | 契约md | image adapter（指令遵从）。FR-03 |
| `_shared/_model/image/seedream-4.5.md` | 契约md | image adapter（写实人像/多视图一致性）。FR-03 |
| `_shared/_model/voice/doubao-zh.md` | 契约md | 中文音色 adapter + `[Voice_*]`→引擎路由。FR-04 |
| `_shared/_model/voice/elevenlabs-en.md` | 契约md | 英文音色 adapter。FR-04 |
| `_shared/_model/music/suno5.md` | 契约md | BGM adapter + 合规禁项（禁名人名/艺人名/版权曲名）+ dB 阶梯。FR-04 |
| `_shared/scripts/audits/audit_model_adapters.py` | audits插件py | **唯一审计插件**。`@register("model_adapters")`，`run(target)->Report`。结构静态核验 + 等价性 + 隐身门 |
| `_shared/scripts/fixtures/D3_model_adapters.clean.json` | fixtures | clean 正例（合法中性字段卡 + 合法双译产物 + registry 快照），期望 GO |
| `_shared/scripts/fixtures/D3_model_adapters.poison.json` | fixtures | poison 反例（投毒后），期望 FAIL（详见 §6） |
| `_shared/scripts/fixtures/D3_voice_routing.clean.json` | fixtures | voice 路由正例（LinChen/ZhaoShanhe/WangKai→doubao） |
| `_shared/scripts/fixtures/D3_voice_routing.poison.json` | fixtures | voice 路由反例（zh 误路由到 elevenlabs） |
| `_shared/scripts/fixtures/D3_image_routing.clean.json` | fixtures | image 路由正例（多视图→seedream-4.5；LOGO→nano-banana-pro） |
| `_shared/scripts/fixtures/D3_image_routing.poison.json` | fixtures | image 路由反例（多视图误选 nano-banana-2） |
| `_shared/baselines/jadepavilion/neutral_shot_group.json` | baselines | 黄金基线：翡翠楼某镜头组的中性字段卡（FR-02 等价性双译的输入源） |
| `_shared/baselines/jadepavilion/seedance_render.golden.md` | baselines | 黄金基线：该组经 seedance adapter 的成片 prompt（NFR-04 向后兼容 diff 锚） |
| `_shared/baselines/jadepavilion/kling3_render.golden.md` | baselines | 黄金基线：该组经 kling3 adapter 的成片 prompt（等价性回归锚） |
| `_shared/baselines/model_registry.golden.json` | baselines | 黄金基线：registry 快照（"换模型=1 行 diff"的 before 锚） |
| `_shared/_model/_examples/cross-model-equiv.md` | 样例md | 同一镜头组 seedance vs kling3 双译并排对照（DoD-3 人读证据） |
| `_shared/scripts/harness/lexicon.py`（改） | registry项 | 往 `BY_DIRECTION` 加 `"D3"` 键（禁词，见 §3②） |
| **改动（去硬编码 + 路由指向）** | | |
| `_shared/continuity-quality.md`（改） | 知识md | L86-88/L130-131 模型常量改"见 model-registry" |
| `_shared/seedance-2.0.md`（改） | 知识md | 改薄重定向占位（指向 `_model/video/seedance-2.0.md`），保旧引用兼容 |
| `keyframe/output-contract.md`（改） | 契约md | §7 移除散落模型名（GPT-Image-2/Nano Banana Pro），改"经 image adapter 转换，模型见 `_routing`" |
| `character-board/output-contract.md`（改） | 契约md | 同上 |
| `color-palette/output-contract.md`（改） | 契约md | 同上 |
| `production-bible/character-roster.md`（改） | 契约md | L121/L132 `zh→doubao` 引向 voice adapter |
| 各成员 `SKILL.md` 路由表（改） | 知识md | 新增"定模型→读 `_model/<类>/<model>.md`"≤1 行（NFR-05） |

---

## 3. 与共享底座的接线

### ① 复用 harness 哪些构件

| 底座构件 | D3 怎么用 |
|---|---|
| `audit_report.py::Report/Finding/Verdict` | `audit_model_adapters.py` 的唯一输出形态。每条 `Finding.check` 引回 PRD，如 `"D3-FR-01"`、`"D3-NFR-01"`。`FAIL` 必带 `fix`，收尾调 `rep.assert_fail_has_fix()` |
| `leak_scan.py` + `lexicon.py` | **引擎隐身门（NFR-01 一票否决）**。对每个 adapter 产出的"可粘贴施工单"段调 `leak_scan(render_text, extra_terms=lexicon.BY_DIRECTION["D3"])`，命中=NO-GO |
| `portability_scan.py` | 对 `_model/` 全部 md 跑可移植性扫描（adapter 文件不得含 `vimax.`/`grsai.`/`localhost:8777`/货币）。复用底座，不另写 |
| `snapshot.py::freeze/diff_against_golden` | 冻结 `neutral_shot_group.json` / `seedance_render.golden.md` / `kling3_render.golden.md` / `model_registry.golden.json`。回归 diff（NFR-04 向后兼容、等价性回归）走它 |
| `reverse_test.py::assert_gate_is_real` | 对 `audit_model_adapters.run`、`voice_routing` 子门、`image_routing` 子门各跑一次 clean/poison 双证 |
| `run_eval.py::register` | `@register("model_adapters")` 自动进全套件 GO/NO-GO；horizontal leak_scan 由 run_eval 在每个 case 上跑，D3 adapter 产出会被横切扫 |
| `registry.py::reg()/video_default()` | adapter 与 `_routing` 决策、continuity 去硬编码后的"默认模型"全部 `registry.reg()` 读，**禁硬编码模型名**（插件契约第 4 条） |

### ② 往 `lexicon.BY_DIRECTION` 加哪些禁词

D3 的"过程产物词"绝不可漏进 adapter 的可粘贴施工单。往 `lexicon.py` 的 `BY_DIRECTION` 加 `"D3"` 键：

```python
BY_DIRECTION = {
    # …既有 D5/D8/D4…
    "D3": [
        # —— 中性 capability 字段名（只许活在 contract/adapter 的"对内"段，禁进施工单）——
        "capability", "capability-contract", "duration_window", "title_card",
        "hard_negative", "shot_group_unit", "fallback", "fallback chain",
        # —— 选型理由 / 分级 / 兜底（对内，禁进成片）——
        "选型理由", "分级选型", "首选", "兜底", "降级到", "same_tool_degrade",
        "no_silent_cross_tool", "model-registry", "model_registry",
        # —— 一致性审计阈值（电商证据，对内秤，禁进成片）——
        "±5%", "±15°", "Δ0.05", "RGB≥245", "轮廓 ±", "HSL ±", "LOGO Δ",
        # —— 适配层自指（"我为什么选这个模型"类痕迹）——
        "adapter", "支持矩阵", "中性字段",
    ],
}
```

> 注意：`Seedance`/`Kling`/`Veo` 等**模型名本身不进禁词**——施工单里出现目标模型方言是合法的；被禁的是"选型/降级/审计/中性字段名"这类**过程痕迹**。

### ③ 是否引用 model_registry

**是，且 D3 是它的 owner。** 底座 §0-⑤ 明确"D3 的 `model_registry.json` 作为共享构件在 Sprint1 早期落地"。D3 负责：① 建 `_shared/scripts/model_registry.json`（底座 §2.7 指定路径与骨架）；② 把 PRD §5-③ 的 fallback schema 填进去；③ 把 `continuity-quality.md` 硬编码模型名改为 `registry.video_default()` 等引用。其余方向（D5/D7/D9/D11）一律读它，不重定义。

### ④ 新增 `audits/audit_<x>.py` 的 register 名

- 文件：`_shared/scripts/audits/audit_model_adapters.py`
- 注册名：`@register("model_adapters")`
- 入口：`def run(target) -> Report`（`target` 见 §4.5 的 `target` schema）

---

## 4. 实现分解

### 4.1 `capability-contract.md` 的中性字段 schema（FR-01）

7 中性字段，**全文零模型私有 token**（grep `<<<` / `{语言` / `【` / Suno 段落标签均 0 命中——NFR-02）。md 正文以"字段表 + 中性写法 + 哪些 adapter 必须实现"呈现；机器侧 fixture 用以下 YAML/JSON 结构落地：

```yaml
# neutral_shot_group —— 镜头组 = 一个生成单元（沿用 seedance §0）
shot_group_unit:
  group_id: G3                              # 引镜头卡组号
  duration_window: { min: 4, max: 15, recommended: [10, 15], unit: s }
  dialogue:                                 # 对白：text + lang + voice_id（不写 {语言:}）
    - { speaker: "[Element_LinChen]", text: "这一次，没有退路。", lang: zh, voice_id: "[Voice_LinChen]" }
  sfx:    ["金属管坠地，低频撞击"]            # 音效（不写 <>）
  bgm:    { desc: "单钢琴，极简，留白", none: false }   # none=true → 渲染层加 no music
  title_card: ["三年后"]                     # 字卡（不写 【】）
  reference:                                # 参考绑定（不写 <<<image_n>>>）
    - { id: ref_1, kind: image, bind: "[Element_LinChen]", role: 主角 }
    - { id: ref_2, kind: image, bind: "[Scene_JadeTower]", role: 场景 }
  keyframe:
    start_frame: "<prev_group.end_frame>"   # 中性占位
    end_frame:   null
    reference_video: null                   # 默认不加（沿用 continuity 门槛）
  hard_negative: [no_subtitles, no_text_overlay, no_watermark]  # 中性枚举
```

**7 字段取值域规范（contract md 必含表）：**

| 中性字段 | 取值域 / 结构 | 哪些 adapter 必须实现 |
|---|---|---|
| `dialogue` | list of `{speaker, text, lang∈{zh,en,…}, voice_id}` | 全 video + 全 voice |
| `sfx` | list of str（中性自然语言描述） | 全 video |
| `bgm` | `{desc:str, none:bool}` | 全 video + music |
| `title_card` | list of str | 全 video |
| `reference` | list of `{id, kind∈{image,video,audio}, bind:asset_id, role}` | 全 video + 全 image |
| `duration_window` | `{min,max,recommended:[lo,hi],unit:s}` | 全 video |
| `keyframe` | `{start_frame, end_frame, reference_video}`（值为中性占位/null） | 全 video |

### 4.2 adapter 支持矩阵规范（每个 adapter 必含 · FR-02）

每个 adapter md 必含一张"七字段支持矩阵"表（✅/⚠️降级/❌不支持 + 该模型语法映射 + 降级写法）。以 seedance 为锚（迁移自现有 `seedance-2.0.md`）：

| 中性字段 | seedance-2.0 | 该模型语法映射 | 降级写法（不支持时） |
|---|---|---|---|
| dialogue | ✅ | `{lang:text}` | — |
| sfx | ✅ | `<text>` | — |
| bgm | ✅ | `(text)` / none→`no music` | — |
| title_card | ✅ | `【text】` | — |
| reference | ✅ | `<<<image_n>>>=bind` | — |
| duration_window | ✅ 4–15s | 节拍语序（禁壁钟） | 超窗拆组 |
| keyframe | ⚠️ | start_frame/reference_video | 仅末帧续首帧 |

kling3 / veo 各填一张（语法 token 不同、语义等价）。例如 kling3 的 dialogue 映射不用 `{}` 而用模型自己的对白字段、reference 不用 `<<<image_n>>>` 而用其参考槽语法——**差异只在方言 token**，叙事内容逐句对齐。

**每个 adapter md 的物理分段（隐身铁律落地）：**

```
## A. 对内：支持矩阵 + 语法映射 + 选型理由   ← 含 capability 字段名/阈值，被 leak_scan 禁词覆盖
## B. 可粘贴施工单（成片）                    ← 只含目标模型方言，leak_scan 扫这段必须命中=0
```

`audit_model_adapters` 提取 §B 段（用约定锚 `<!-- RENDER:START -->`…`<!-- RENDER:END -->`）喂 leak_scan，§A 段不扫。

### 4.3 `model_registry.json`（FR-05 · 底座 §2.7 owner）

填充底座骨架，补 PRD §5-③ 的 fallback schema：

```jsonc
{
  "video": {
    "default": "seedance-2.0",
    "adapters": {
      "seedance-2.0": { "duration_window": [4,15], "keyframe": "tail_to_head", "ref_syntax": "<<<image_n>>>" },
      "kling-3":      { "duration_window": [5,10], "keyframe": "start_end",    "ref_syntax": "ref_slot" },
      "veo":          { "duration_window": [4,8],  "keyframe": "start_only",   "ref_syntax": "image_ref" },
      "sora":         { "status": "stub" },
      "jimeng":       { "status": "stub" }
    },
    "fallback": [
      { "from": "seedance-2.0", "to": "seedance-2.0-fast", "trigger": "same_tool_degrade" },
      { "from": "imagestovideo", "to": "vidu-q3",          "trigger": "same_tool_degrade" }
    ]
  },
  "image": {
    "default": "nano-banana-pro",
    "tier": { "material": "seedream-4.5", "draft": "nano-banana-2", "instruction": "gpt-image-2" },
    "fallback": [
      { "from": "gpt-image-2", "to": "nano-banana-pro", "trigger": "same_tool_degrade" }
    ]
  },
  "voice": { "route": { "zh": "doubao", "en": "elevenlabs" }, "default_lang": "zh" },
  "music": { "default": "suno-5", "ban_named_artist": true },
  "policy": "no_silent_cross_tool"
}
```

`registry.py` 已提供 `reg()` / `video_default()`；D3 补两个便捷读取器（同文件，薄函数）：

```python
def image_for_task(task_type: str) -> str:    # 供 _routing 决策机器侧引用
    return reg()["image"]["tier"].get(_task_to_tier(task_type), reg()["image"]["default"])
def voice_for_lang(lang: str) -> str:
    return reg()["voice"]["route"].get(lang, reg()["voice"]["route"][reg()["voice"]["default_lang"]])
def fallback_for(kind: str, model: str):
    return [f for f in reg()[kind].get("fallback", []) if f["from"] == model]
```

### 4.4 image `_routing.md` 决策算法（FR-03，对内·不进成片）

```
输入: task_type ∈ {character_board, keyframe, color_palette, ecommerce_white_bg}
      has_logo_or_text: bool
      need_multiview_consistency: bool
路由:
  if need_multiview_consistency or task_type == character_board:
      → seedream-4.5      (兜底 nano-banana-pro)   # 多视图/写实人像一致性最强
  elif has_logo_or_text or task_type == ecommerce_white_bg:
      → nano-banana-pro   (兜底 gpt-image-2)        # LOGO/文字/多图融合/白底
  elif task_type == keyframe:
      → gpt-image-2       (兜底 nano-banana-pro)    # 指令遵从+动作落点
  elif task_type == color_palette:
      → nano-banana-2     (兜底 gpt-image-2)        # 快/省/概念
理由字段(对内·不进成片): 附量化一致性依据
  轮廓 ±5% / HSL 色相 ±15° / LOGO Δ0.05 / 白底 RGB≥245
```

`_routing.md` 决策表每行：`任务 | 一致性要求 | 首选 | 兜底 | 量化理由(对内)`。机器侧由 `registry.image_for_task` + `_routing` 的 `task_to_tier` 映射消费，fixture 校验"任务→首选模型"无歧义。

### 4.5 `audit_model_adapters.py` 骨架（唯一审计插件）

`target` schema（fixture 反序列化成此形态）：

```jsonc
{
  "id": "D3_jadepavilion_G3",
  "neutral": { /* §4.1 的 shot_group_unit */ },
  "renders": {                      // 各 adapter 产出的可粘贴施工单（§B 段提取）
    "seedance-2.0": "…成片方言…",
    "kling-3":      "…成片方言…"
  },
  "voice_routing": [                // FR-04：voice_id + 期望引擎
    { "voice_id": "[Voice_LinChen]", "lang": "zh", "expect_engine": "doubao" }
  ],
  "image_routing": [                // FR-03：任务 + 期望首选
    { "task_type": "character_board", "need_multiview_consistency": true, "expect_model": "seedream-4.5" }
  ],
  "registry_snapshot": { /* 当前 model_registry.json 内容，用于"默认模型单一定义点"核验 */ }
}
```

插件核心逻辑（伪代码 → 可照写）：

```python
# _shared/scripts/audits/audit_model_adapters.py
import re
from harness.audit_report import Report, Finding, Verdict
from harness.run_eval import register
from harness.leak_scan import leak_scan
from harness import lexicon, registry

PRIVATE_TOKENS = {            # 模型私有 token，禁出现在 capability-contract / neutral
    "seedance": [r"<<<", r"\{[^}]*:", r"【", r"no music", r"no subtitles"],
}
NEUTRAL_FIELDS = ["dialogue","sfx","bgm","title_card","reference","duration_window","keyframe"]

@register("model_adapters")
def run(target) -> Report:
    rep = Report(audit="model_adapters", target=target["id"])

    # ① FR-01 覆盖率：neutral 7 字段齐全（缺一即 FAIL）
    for f in NEUTRAL_FIELDS:
        if f not in target["neutral"]:
            rep.findings.append(Finding("D3-FR-01", Verdict.FAIL,
                f"中性字段缺失: {f}", measured=f, threshold="7字段全",
                fix=f"补 capability-contract 字段 {f}"))

    # ② NFR-02 可移植性：neutral 不得含任意模型私有 token
    neutral_text = _dump(target["neutral"])
    for pats in PRIVATE_TOKENS.values():
        for p in pats:
            if re.search(p, neutral_text):
                rep.findings.append(Finding("D3-NFR-02", Verdict.FAIL,
                    f"中性字段被模型私有 token 污染: /{p}/", measured=p,
                    fix="私有概念移回对应 adapter，contract 保持模型无关"))

    # ③ NFR-01 引擎隐身（一票否决）：每个 render 段调底座 leak_scan
    for model, render in target["renders"].items():
        sub = leak_scan(render, extra_terms=lexicon.BY_DIRECTION["D3"])
        for fnd in sub.findings:              # 把 leak 命中并入本报告（保留 check=LEAK）
            rep.findings.append(Finding("D3-NFR-01", Verdict.FAIL,
                f"[{model}] 成片泄漏过程词: {fnd.detail}",
                fix=fnd.fix))

    # ④ FR-02 跨模型等价性：两 render 叙事单元数一致（句/节拍切分对齐）
    if "seedance-2.0" in target["renders"] and "kling-3" in target["renders"]:
        ns = _beat_count(target["renders"]["seedance-2.0"])
        nk = _beat_count(target["renders"]["kling-3"])
        if ns != nk:
            rep.findings.append(Finding("D3-FR-02", Verdict.FAIL,
                "seedance/kling3 叙事节拍数不等，疑似漏译/增译",
                measured=nk, threshold=ns,
                fix="逐句对齐两 adapter 的叙事单元，差异只许在方言 token"))

    # ⑤ FR-04 voice 路由：voice_id 按 lang 解析到期望引擎
    for v in target.get("voice_routing", []):
        got = registry.voice_for_lang(v["lang"])
        if got != v["expect_engine"]:
            rep.findings.append(Finding("D3-FR-04", Verdict.FAIL,
                f"{v['voice_id']} ({v['lang']}) 路由到 {got}，期望 {v['expect_engine']}",
                measured=got, threshold=v["expect_engine"],
                fix="修 voice adapter 语言路由表 / registry voice.route"))

    # ⑥ FR-03 image 路由：任务→首选模型无歧义
    for im in target.get("image_routing", []):
        got = _route_image(im)            # 调 _routing 决策（registry.image_for_task + 规则）
        if got != im["expect_model"]:
            rep.findings.append(Finding("D3-FR-03", Verdict.FAIL,
                f"任务 {im['task_type']} 选到 {got}，期望 {im['expect_model']}",
                measured=got, threshold=im["expect_model"],
                fix="修 _routing.md 决策表 / registry image.tier"))

    # ⑦ FR-05 默认模型单一定义点：registry_snapshot 与磁盘 registry 一致
    if target.get("registry_snapshot", {}).get("video", {}).get("default") \
            != registry.reg()["video"]["default"]:
        rep.findings.append(Finding("D3-FR-05", Verdict.WARN,
            "registry 快照与磁盘默认视频模型不一致（可能基线待 re-freeze）",
            fix="确认改动有意 → re-freeze model_registry.golden.json"))

    rep.assert_fail_has_fix()
    return rep

def _beat_count(text: str) -> int:
    # 叙事节拍 ≈ 切镜过渡词 + 句末标点切分；两 adapter 用同一计数口径
    return len(re.findall(r"[。！？]|切到|硬切|当|随后|最后", text))
```

> `_route_image` 直接复用 §4.4 决策（与 `_routing.md` 同源），避免两处逻辑漂移。

---

## 5. 任务拆解（Tickets）

| Ticket ID | 描述 | 产物 | 工时(人天) | 前置 |
|---|---|---|---|---|
| **D3-T01** | 写 `capability-contract.md`：7 中性字段取值域 + 支持矩阵规范 + "哪些 adapter 必须实现" | `_model/capability-contract.md` | 1.5 | 底座 §2.1/§2.2 已落地 |
| **D3-T02** | 建 `model_registry.json`（填底座骨架 + fallback schema）+ `model-registry.md` 人读面 + `registry.py` 补 `image_for_task/voice_for_lang/fallback_for` | `scripts/model_registry.json`、`_model/model-registry.md`、`registry.py`(改) | 1.0 | — |
| **D3-T03** | 迁移 seedance：`_shared/seedance-2.0.md`→`_model/video/seedance-2.0.md`，补七字段支持矩阵，加 `<!-- RENDER -->` 锚分段；旧文件改薄重定向 | `_model/video/seedance-2.0.md`、`_shared/seedance-2.0.md`(改) | 0.75 | T01 |
| **D3-T04** | 写 `kling3.md` + `veo.md`（支持矩阵+逐字段映射+负面约束+duration_window+keyframe机制） | `_model/video/kling3.md`、`veo.md` | 1.5 | T01,T03 |
| **D3-T05** | 写 `sora.md` / `jimeng.md` stub（顶部 `status:stub` + 支持矩阵骨架） | `_model/video/sora.md`、`jimeng.md` | 0.25 | T01 |
| **D3-T06** | 写 4 个 image adapter + `_routing.md` 决策表（含量化理由） | `_model/image/*.md`（5 文件） | 1.5 | T01,T02 |
| **D3-T07** | 写 voice（doubao-zh/elevenlabs-en）+ music（suno5，禁项清单≥5类+dB阶梯） | `_model/voice/*.md`、`_model/music/suno5.md` | 1.0 | T01,T02 |
| **D3-T08** | 写 `audit_model_adapters.py`（§4.5 全逻辑）+ `@register` | `scripts/audits/audit_model_adapters.py` | 1.5 | T01-T07 |
| **D3-T09** | 往 `lexicon.BY_DIRECTION["D3"]` 加禁词（§3②） | `lexicon.py`(改) | 0.25 | 底座 |
| **D3-T10** | 造黄金基线：抽翡翠楼某组→`neutral_shot_group.json`；双译产出 seedance/kling3 golden；registry golden | `baselines/jadepavilion/*.json/.md`、`baselines/model_registry.golden.json` | 1.0 | T03,T04,T08 |
| **D3-T11** | 造 fixture：D3_model_adapters clean/poison + voice_routing clean/poison + image_routing clean/poison（投毒数据见 §6） | `scripts/fixtures/D3_*.json`（6 文件） | 1.0 | T08,T10 |
| **D3-T12** | 写 `reverse_test` 调用 + 接入 `run_eval`：`assert_gate_is_real(run, clean, poison)` ×3 子门 | 测试代码（接底座 reverse_test） | 0.5 | T11 |
| **D3-T13** | 去硬编码：改 `continuity-quality.md`(L86-88/L130-131)、各 output-contract §7、`character-roster.md`(L121/132)、各 SKILL 路由表 | 8+ 文件(改) | 1.0 | T02 |
| **D3-T14** | 写跨模型等价对照样例 `_examples/cross-model-equiv.md`（DoD-3 人读证据） | `_model/_examples/cross-model-equiv.md` | 0.5 | T04,T10 |
| **D3-T15** | "换模型 1 行 diff" 验证 + 真机抽检 1 例对接（与用户协作，付费按钮用户点） | diff 证据 + 真机审计记录 | 0.5 | T02,T06,T10 |

**合计 ≈ 13.25 人天 ≈ 2.65 人周**（PRD 估 3–4 人周，含校准/返工余量）。

---

## 6. 测试方案

全部调用底座，不重造。`assert_gate_is_real` / `run_eval` / `snapshot` 口径与全套件一致。

### ① 正例（clean 基线，期望 GO）

用 `_shared/scripts/fixtures/D3_model_adapters.clean.json`：内容 = `baselines/jadepavilion/neutral_shot_group.json`（合法 7 字段）+ `renders`（seedance/kling3 双译，叙事节拍数相等、施工单段零过程词）+ 合法 `voice_routing`（三 voice→doubao）+ 合法 `image_routing`（character_board→seedream-4.5）+ 当前 registry 快照。

期望：`audit_model_adapters.run(clean)` → 0 个 FAIL → `decision == "GO"`、`exit_code == 0`。

### ② 反向注入（poison fixture，期望 FAIL + 期望测回值）

`D3_model_adapters.poison.json` = clean 复制后施加**四处独立投毒**（每处单独验，互不掩盖）：

| 投毒点 | 具体投毒 | 命中 check | 期望测回 |
|---|---|---|---|
| **P1 隐身泄漏（一票否决）** | 把 seedance render 施工单段尾部塞入一句 `（选型理由：多图融合更强，降级到 nano-banana-pro，色相 ±15°）` | `D3-NFR-01` | leak_scan 命中 `选型理由`/`降级到`/`±15°`/`兜底`，FAIL，`exit_code==1` |
| **P2 中性契约被污染** | 把 neutral 的 `dialogue[0].text` 从 `"这一次，没有退路。"` 改成 seedance 私有写法 `"{普通话:这一次，没有退路。}"` | `D3-NFR-02` | 正则 `/\{[^}]*:/` 命中，FAIL，测回污染 token `{普通话:` |
| **P3 跨模型不等价** | 把 kling3 render 删掉一个叙事节拍（少 1 句），制造 seedance 7 拍 vs kling3 6 拍 | `D3-FR-02` | `_beat_count` 测回 measured=6, threshold=7，节拍数不等 FAIL |
| **P4 voice 误路由** | 把 `voice_routing[0]` 的 `lang` 保持 `zh` 但期望被改后的 registry 把 `voice.route.zh` 投毒为 `elevenlabs` | `D3-FR-04` | `voice_for_lang("zh")` 测回 `elevenlabs`，与 `expect_engine=doubao` 不符 FAIL |

**独立子门 poison（voice / image 单独反例，证子门会红）：**

- `D3_voice_routing.poison.json`：把 `[Voice_LinChen]`(zh) 的 `expect_engine` 校验链接到被投毒 registry（`zh→elevenlabs`）→ FAIL，测回引擎 `elevenlabs ≠ doubao`。
- `D3_image_routing.poison.json`：把多视图任务 `{task_type:character_board, need_multiview_consistency:true}` 的决策投毒（registry `image.tier.material` 改 `nano-banana-2`）→ 路由测回 `nano-banana-2 ≠ seedream-4.5` FAIL。这一条直接对应 PRD 验证方案"多视图一致性任务误选 nano-banana-2 → 审计必 ⚠️"。

### ③ `assert_gate_is_real` 调用示例

```python
# tests/test_d3_gates.py
from harness.reverse_test import assert_gate_is_real
from harness import snapshot
from audits.audit_model_adapters import run as audit_run
import json

def _load(p): return json.load(open(p, encoding="utf-8"))

def test_model_adapters_gate_is_real():
    assert_gate_is_real(
        audit_run,
        clean_sample=_load("_shared/scripts/fixtures/D3_model_adapters.clean.json"),
        poison_sample=_load("_shared/scripts/fixtures/D3_model_adapters.poison.json"),
        name="D3-model-adapters")

def test_voice_routing_gate_is_real():
    assert_gate_is_real(audit_run,
        _load("_shared/scripts/fixtures/D3_voice_routing.clean.json"),
        _load("_shared/scripts/fixtures/D3_voice_routing.poison.json"),
        name="D3-voice-routing")

def test_image_routing_gate_is_real():
    assert_gate_is_real(audit_run,
        _load("_shared/scripts/fixtures/D3_image_routing.clean.json"),
        _load("_shared/scripts/fixtures/D3_image_routing.poison.json"),
        name="D3-image-routing")
```

`assert_gate_is_real` 内部断言：clean→`exit_code==0`（不误杀），poison→`exit_code==1`（不橡皮图章）。任一不满足 → 测试红。

### ④ 回归（冻结哪份黄金基线 · 改什么后重跑应如何）

冻结 4 份黄金基线（`snapshot.freeze`）：

1. `neutral_shot_group.json`、2. `seedance_render.golden.md`、3. `kling3_render.golden.md`、4. `model_registry.golden.json`。

| 改动场景 | 重跑预期 |
|---|---|
| **改 seedance adapter 语法映射**（NFR-04 向后兼容） | `diff_against_golden(new_seedance_render, seedance_render.golden.md)` 应**无实质漂移**（语义 diff=0，仅许文件路径引用变化）；有漂移→WARN→人审是否劣化 |
| **改默认视频模型 seedance→kling-3**（DoD-8 换模型 1 行） | 只改 `model_registry.json` 1 行（`video.default`）；`git diff --stat` 应显示**仅 registry 1 文件 1 行**变更，0 处镜头卡/契约文件被动；`diff_against_golden(new_registry, model_registry.golden.json)` 报 WARN（有意改进→re-freeze） |
| **新增 stub adapter（如再加一个模型）**（NFR-02） | 除 registry 外 0 处文件需改，`git diff` 证明 |

### ⑤ 真机那一层（付费按钮由用户点 · DoD-11）

取 1 个真实镜头组，按 image `_routing` 选定模型（如 character_board→seedream-4.5）出 **1 张图**，跑电商一致性审计 4 项（轮廓 ±5% / HSL ±15° / LOGO Δ0.05 / 白底 RGB≥245）应无 ⚠️。这是唯一"真的有效"的终极证据——选型规则若错（多视图误选 nano-banana-2），审计 4 项必触 ⚠️。**付费生成按钮由用户亲自点**，本方向只产规范与审计对接，不调 API。

---

## 7. 里程碑与退出门

| 里程碑 | 产物 | 退出门（脚本必绿 / DoD 必过） |
|---|---|---|
| **M1 抽象层（MVP 切线）** | `capability-contract.md` + `model_registry.json` + `model-registry.md` + seedance 迁移并补支持矩阵（T01-T03,T09） | `audit_model_adapters` 对 seedance-only clean 跑 GO；`portability_scan(_model/*)`=0；**换模型 1 行 diff 可演示**（DoD-1/6/7/10 主体）。**M1 完成即可单独证"可移植性"——这是最小可验证里程碑** |
| **M2 video 矩阵** | kling3 + veo + sora/jimeng stub（T04,T05） | 3 个 video adapter 七字段支持矩阵齐备；seedance/kling3 双译 `_beat_count` 相等（DoD-2/3）；`cross-model-equiv.md` 人读对齐 |
| **M3 image 矩阵 + 分级** | 4 image adapter + `_routing.md`（T06） | `image_routing` clean 全部命中期望模型；选型理由含量化依据（NFR-03）（DoD-4） |
| **M4 voice + music** | doubao/elevenlabs/suno5（T07） | 三 demo voice→doubao 无歧义；suno5 禁项≥5 类（DoD-5） |
| **M5 收口（隐身门 + 反例 + 去硬编码 + 真机）** | audit 插件 + 6 fixtures + reverse_test + 去硬编码改写 + 真机 1 例（T08,T10-T15） | **`assert_gate_is_real` ×3 子门全过**；`run_eval` 含 model_adapters 跑绿；`continuity-quality.md` grep 模型名=0（或仅"见 registry"）；leak_scan 对所有 render 命中=0（DoD-8/9/11，NFR-01~05） |

**MVP 切线 = M1**：底座 §0-② 步行骨架精神——先打通"中性字段→seedance 译→GO，换模型=1 行 diff"这条最薄竖切，证明整条秤能转，再并行铺 M2-M4，M5 收口。M2/M3/M4 可并行（都只依赖 M1 的 contract+registry）。

---

## 8. 风险与回滚

| 风险 | 影响 | 缓解 / 回滚 |
|---|---|---|
| **kling3/veo/sora 私有语法写不准** | adapter 产出 prompt 喂模型无效 | 先交 seedance（已验证）+kling3+veo，sora/jimeng 标 `status:stub`；每 adapter 顶部标"语法版本/校准来源"，待真机校准。回滚：stub 不参与等价性门，不阻断 M1/M5 |
| **中性契约被模型私有概念污染（可移植性破功）** | 退回单模耦合 | `audit_model_adapters` 的 NFR-02 门（`/\{[^}]*:/`、`<<<`、`【`）+ poison P2 反例把关；私有概念只许活 adapter。回滚：契约改动须过 portability_scan，红则 revert |
| **引擎隐身泄漏（选型/审计/降级混进成片）** | 违反铁律一票否决 | adapter 模板物理分段（§A 对内 / §B 施工单），audit 只对 §B 跑 leak_scan + `BY_DIRECTION["D3"]` 词；poison P1 反例证门会红。回滚：泄漏即 NO-GO，阻断合入 |
| **`continuity-quality.md` 去硬编码引回归** | 连续性语义被改坏 | 只把"模型名"替为"见 registry"，不动连续性逻辑文字；冻结改前快照，`diff_against_golden` 报 WARN 则人审。回滚：保留旧 `seedance-2.0.md` 薄重定向，旧引用不断 |
| **图像分级选型与真实模型能力错配** | 选错模型→审计 ⚠️ | DoD-11 真机抽检兜底；选型理由必挂量化依据（NFR-03），可证伪；image_routing poison 直接复刻"多视图误选"场景 |
| **music 合规漏网（名人名/版权曲）** | 版权雷 | suno5 硬禁清单≥5 类 + 合规替代写法，进 `hard_negative` 中性枚举跨 adapter 强制 |

**宿主能力缺失的降级路径：** 真机出片 + 一致性审计（DoD-11）依赖宿主/ViMax provider 提供生成通道与像素审计脚本。**若宿主不可用**：D3 仍可在 M5 前用"结构静态核验 + 等价性 diff + 隐身 grep + 换模型 1 行 diff"四项确定性证据完成 MVP（M1-M4 全部不依赖真机）；DoD-11 降级为"待宿主就绪后补 1 例真机抽检"，不阻断 adapter 矩阵与 registry 交付。这与 PRD 落地可靠性自评 4/5 的扣分项（e2e 依赖外部协作）一致——本方向主体是文档/规范工程，真机仅为终极佐证而非交付前置。

---

*本开发方案接到 `00-ENGINEERING-SUBSTRATE.md` 定义的底座上：报告/隐身/可移植性/快照/反例/编排/registry/lexicon 全部复用，D3 只交付"审计插件 + clean/poison fixture + 黄金基线 + 知识/契约文件 + registry owner + 任务拆解"。D3 是底座 §0-⑤「模型注册表前移」的承载点，须在 Sprint1 早期落地 `model_registry.json`，供 D5/D7/D9/D11 引用。*
