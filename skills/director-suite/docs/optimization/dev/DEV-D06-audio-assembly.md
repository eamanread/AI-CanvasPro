# D6 · 音频层 + 时间线合成契约（Audio Layers + Assembly Contract）开发方案

> 编号 D6 ｜ 优先级 P2 ｜ 状态 Dev v0.1 ｜ 前置:[D06-audio-assembly.md（本方向 PRD）](../D06-audio-assembly.md) + [00-ENGINEERING-SUBSTRATE.md（共享底座）](./00-ENGINEERING-SUBSTRATE.md)
>
> PRD 答 *what/why*；本文件答 *how-to-build*——把 D6 接到共享底座上，**不重造任何验证脚手架**。
> 我只交付:一件 Bone 层装配契约 `_shared/assembly.md` + storyboard §8 `audio_layer` 段 + 审计插件 `audit_audio_assembly.py` + 一对 clean/poison fixture + 黄金基线 + 注册改动 + 任务拆解。

---

## 1. 目标与范围

实现 PRD 的 D6-FR-01..04 / NFR-01..05:新增 **Bone 层装配契约 `_shared/assembly.md`**（套件第 9 件共享知识）+ **扩 `storyboard/output-contract.md` §8 `audio_layer` 段**，把套件**已存在但散落**的声音知识（角色表 §4 `[Voice_*]` 音色身份 / 分镜 §4.5 音效数字化 / `mapping-tables.md` §8 情绪→声音表 / `continuity-quality.md` 三·1 `no music`·三·3 首尾帧·五·1 180°）**只读汇轨**成一份整片 `audio_layers` 工件——narration/bgm/sfx 三类时间线轨道 + 量化混音 dB 阶梯 + 视频内嵌轨 mute 规则 + 装配前链式校验——供下游合成器 / `video_assembler` 一次合成导出。

**本方向作为"底座插件"的边界（纪律铁律）:**

- **复用不重造**:报告结构 / GO-NO-GO / `leak_scan` / `snapshot` / `reverse_test` / `run_eval` / `registry` 全部用 `00-ENGINEERING-SUBSTRATE.md` 定义的共享 harness。我**只**写业务判据（`audits/audit_audio_assembly.py`）、一对 fixture、一份黄金基线、两件知识/契约 Markdown、四处注册改动。
- **零业务知识下沉到底座**:三轨 schema、混音 dB 阶梯表、mute 规则、装配链定义**全部**写在 `_shared/assembly.md`（Bone）与 storyboard §8（Skin）里；只往 `lexicon.BY_DIRECTION["D6"]` 注册禁词、往 `_shared/scripts/audits/` 放一个插件。
- **引用而非硬编码模型**:音频模型分工（`bgm→suno-5` / `voice.zh→doubao` / `voice.en→elevenlabs`）走 `registry.reg()["music"]`/`["voice"]`，`audio_model_profile` 行不写死（PRD NFR-02 + 底座完善⑤）。
- **不碰 Soul**:不改 `tacit-core.md`;引擎隐身铁律继承并扩展为"**装配层不漏成片**"（NFR-01）。
- **只读 storyboard / 角色表 / mapping / continuity,不回写**（PRD NG3/NG4）:既有字段语义零改动，新增 §8 为追加。
- **MVP 切线**:文本审计闸（结构闸 + 基线 diff + 反向注入 + leak_scan）是可验证核心,优先于真机整片合成（M4,付费由用户亲点）。

---

## 2. 交付物清单（精确文件路径表）

| 路径 | 类型 | 说明 |
|---|---|---|
| `skills/director-suite/_shared/assembly.md` | 契约md（Bone） | 装配级单一事实源:三轨 schema + 混音 dB 阶梯表（FR-02 写死三数值）+ 视频内嵌轨 mute 规则（FR-03）+ 装配前链式校验三链（FR-04）+ `audio_model_profile` 走 registry。**首行标"装配施工单·非成片"**（NFR-01） |
| `skills/director-suite/storyboard/output-contract.md`（改） | 契约md（Skin） | 新增 §8「`audio_layer` 段 / `audio_layers` 工件」:三轨 schema + `range`(组/镜号) + `source_ref` + `mix` 字段;§7 自检追加第 10 条「装配自检（引 `_shared/assembly.md`）」;附样例追加全片 `audio_layers` 工件 |
| `skills/director-suite/_shared/asset-id-convention.md`（改） | registry项（契约md） | §1 命名表追加一行音频轨 `[Audio_<Type>_<NN>]`;§4 交叉引用追加 `audio_layer.source_ref` 引 `[Voice_*]`/§4.5镜号/§8情绪档写法 |
| `skills/director-suite/_shared/mapping-tables.md`（改） | registry项（契约md） | §8 表后追加交叉引用注脚「→ 轨道化 / dB 阶梯 / 合成见 `_shared/assembly.md`」（只加指针,不改表） |
| `skills/director-suite/README.md`（改） | registry项 | `_shared/` 目录树注释 `(8件)→(9件)` + 新增 `assembly.md` 节点;「② 骨」行补 `assembly.md`;「关键设定」补一行「音频装配契约见 `_shared/assembly.md`」 |
| `skills/director-suite/_shared/scripts/audits/audit_audio_assembly.py` | audits插件py | 实现 `run(target)->Report` 并 `@register("audio_assembly")`;断言 FR-01 五字段+三型+`[Voice_*]`/range 命中 / FR-02 dB 阶梯区间 / FR-03 每组一 policy+mute 默认+lipsync 冲突 / FR-04 三链 / NFR-01 成片零泄漏 / NFR-05 留白 |
| `skills/director-suite/_shared/scripts/fixtures/D6_audio_assembly.clean.json` | fixtures | clean 正例:翡翠楼真实数据派生的合规 `audio_layers` 工件 + 合规成片 `final_text`,期望 `audit→GO, exit0` |
| `skills/director-suite/_shared/scripts/fixtures/D6_audio_assembly.poison.json` | fixtures | poison 反例:见 §6②（6 个独立投毒变体,每个期望 `FAIL` 且测回特定值） |
| `skills/director-suite/_shared/baselines/jadepavilion/audio_layers.golden.json` | baselines | 黄金基线:对 `fewshot-翡翠楼夜宴-v2全片.md` 全片汇轨产出的 `audio_layers` 工件（3 narration + 全 sfx 镜 + 按情绪弧 bgm 分段）,归一化冻结 |
| `skills/director-suite/_shared/scripts/lexicon.py`（改） | registry项 | 新增 `BY_DIRECTION["D6"]` 本方向禁词（§3②） |

> **只读消费、不改:** `production-bible/character-roster.md` §4（音色身份事实源）、`_shared/continuity-quality.md` 三·1/三·3/五·1（mute 原则 / 首尾帧 / 180° 知识源）。
> **依赖底座（前置就绪）:** `harness/{audit_report,leak_scan,snapshot,reverse_test,run_eval,registry,lexicon}.py` + `model_registry.json`（由 Sprint0 步行骨架建,见 §8 R7 降级）。

---

## 3. 与共享底座的接线

### ① 复用 harness 哪些构件

| 底座构件 | D6 怎么用 |
|---|---|
| `harness/audit_report.py`（§2.1） | `audit_audio_assembly.run()` 返回 `Report`,逐项 `append Finding(check="D6-FR-0X", ...)`;收尾 `rep.assert_fail_has_fix()`;`decision/exit_code` 走统一 GO/NO-GO 语义。判定区零时间戳。 |
| `harness/leak_scan.py` + `lexicon.py`（§2.2） | NFR-01 铁律闸:对每组 **Seedance 成片提示词**（`target["final_text"]`）跑 `leak_scan(final_text, extra_terms=lexicon.BY_DIRECTION["D6"])`,命中轨道元数据/dB/mute/装配术语/引擎术语即 FAIL。 |
| `harness/snapshot.py`（§2.4） | `freeze(audio_layers, "baselines/jadepavilion/audio_layers.golden.json")` 冻结全片汇轨工件;改契约后 `diff_against_golden()` 回归。 |
| `harness/reverse_test.py`（§2.5） | `assert_gate_is_real(audit_audio_assembly.run, clean_sample, poison_sample, name="D6-audio-assembly/PN")`——证明闸对 clean 放行、对 poison 报红。 |
| `harness/run_eval.py`（§2.6） | `@register("audio_assembly")` 让插件自动进 `run_eval` 的 5 基线 × 全审计 GO/NO-GO 编排;纳入 `make verify` 合入门。 |
| `registry.py` / `model_registry.json`（§2.7） | **引用**:`audio_model_profile` 的 bgm 走 `registry.reg()["music"]["default"]`(suno-5)、narration zh→`["voice"]["zh"]`(doubao)/en→`["voice"]["en"]`(elevenlabs),不硬编码;换模型改 registry 1 处。`audit` 校验 `audio_model_profile` 行可被 registry 解析。 |

### ② 往 `lexicon.BY_DIRECTION` 加哪些禁词

底座 PRD 尚未为 D6 预置条目,本方向**新增**「装配层专属、绝不可漏进成片」的全集:

```python
# lexicon.py 改后
BY_DIRECTION = {
    ...,
    "D6": [
        "audio_id", "[Audio_", "audio_layer", "audio_layers",  # 轨道工件本体（成片不许出现）
        "range:", "source_ref", "embedded_track_policy",        # 轨道字段
        "dBFS", "duck_under_voice", "climax_boost", "crossfade", "sidechain",  # 混音元数据
        "mute_bgm", "mute_narration", "keep_lipsync", "keep_ambient",          # mute 表
        "装配报告", "装配施工单", "过渡镜登记", "时间线闭合", "首尾帧链",        # 装配链术语
        "audio_model_profile",                                  # 模型分工标记行
    ],
}
```
> 这些词是 `audio_layers` 工件 / 装配报告的**本体**（工件里必须有）,但 `leak_scan` 扫的是**成片**（镜头卡 + Seedance 成片提示词 + 四表）——成片里出现任意一条 = NO-GO（NFR-01 / DoD-5）。
> **唯一豁免**:既有 §4.4 台词 / §4.5 音效的**创作语言**及 Seedance 标记 `(BGM)`/`<音效>`/`{语言:台词}` 仍可进成片（PRD NFR-01 末句）——这些不在禁词表里,故不误杀。

### ③ 是否引用 model_registry

**是。** PRD NFR-02 要求音频模型分工只作"可替换推荐档"。`audio_model_profile` 行不写死,走 `registry.reg()`:
- `bgm` → `registry.reg()["music"]["default"]`（默认 `suno-5`,且 `ban_named_artist:true` 由 registry 强制,避免点名歌手版权）;
- `narration` zh → `registry.reg()["voice"]["zh"]`（`doubao`）/ en → `["voice"]["en"]`（`elevenlabs`）。

`audit_audio_assembly` 校验 FR-NFR02 时断言 `audio_model_profile` 行的模型名**可被 registry 解析**,而非硬编码字符串（避免 D3 前移后返工）。换模型仅改 registry 1 处,工件与契约零改。

### ④ 新增 `audits/audit_audio_assembly.py` 的 register 名

```python
@register("audio_assembly")     # run_eval AUDIT_REGISTRY 的 key
def run(target) -> Report: ...
```
register 名 = `"audio_assembly"`(与 audit 名 / `Report.audit` 字段一致,下划线风格对齐 `audit_consistency`/`audit_camera_path`)。

---

## 4. 实现分解（可照着写的真实骨架）

### 4.0 数据契约:`AudioAssemblyTarget`（插件输入）

`run_eval` / `reverse_test` 喂给插件的 `target` 形态。fixture JSON 与基线 case 都按此结构:

```jsonc
// AudioAssemblyTarget schema（fixtures 与 baselines 共用）
{
  "id": "jadepavilion-fullfilm",             // 整片标识（D6 是整片级,非单组级）
  "audio_layers": [                          // 待审的整片 audio_layers 工件（FR-01 产物）
    { "audio_id": "[Audio_Narration_01]", "type": "narration",
      "range": "G1-G12", "source_ref": "[Voice_LinChen]",
      "mix": { "base_dbfs": 0, "duck_under_voice_db": 0, "climax_boost_db": 0,
               "crossfade_s": 0.5, "sidechain": "none" } },
    { "audio_id": "[Audio_Bgm_03]", "type": "bgm",
      "range": "G9-G10", "source_ref": "§8:爆发/高潮(全奏tutti) + audio_model_profile.bgm",
      "mix": { "base_dbfs": "对话基准+4", "duck_under_voice_db": 10, "climax_boost_db": 4,
               "crossfade_s": 0.5, "sidechain": "voice" } },
    { "audio_id": "[Audio_Sfx_02]", "type": "sfx",
      "range": "镜2-2", "source_ref": "§4.5@镜2-2(烟头摁灭)",
      "mix": { "base_dbfs": -10, "duck_under_voice_db": 0, "climax_boost_db": 0,
               "crossfade_s": 0.5, "sidechain": "none" } }
    // …全片其余轨
  ],
  "embedded_track_policies": [               // 镜头组级,每组一条（FR-03）
    { "group": "G1", "mute_bgm": true, "mute_narration": true,
      "keep_lipsync": false, "keep_ambient": true },
    // …每组一条,共 12 条
  ],
  "audio_model_profile": {                   // 模型分工标记行（FR-NFR02,走 registry）
    "bgm": "suno-5", "narration_zh": "doubao", "narration_en": "elevenlabs",
    "note": "可替换:换模型仅改本行/registry" },
  "assembly_chain": {                        // 装配前链式校验输入（FR-04）
    "group_endframe_anchors": [              // 相邻组首尾帧锚点（三·3）
      { "group": "G3", "end_anchor": "林辰望向门廊", "next_group": "G4",
        "start_anchor": "林辰望向门廊", "declared_motive": "" } ],
    "axis_jumps": [                          // 检出的跳轴处（五·1）
      { "between": "G7-G8", "has_transition_shot": true, "transition_shot_id": "8-0过渡" } ]
  },
  "source": {                                // 源事实（NFR-03 派生一致性核对源）
    "voiced_characters": ["[Voice_LinChen]","[Voice_ZhaoShanhe]","[Voice_WangKai]"],
    "groups": [ { "id": "G1", "组时长": 11, "情绪强度": 2,
                  "shots": [ { "id": "镜1-1", "时长": 4, "音效": "室内空调嗡鸣 -26dBFS…" },
                             { "id": "镜1-2", "时长": 3, "音效": "烟头摁灭 -10dBFS…" } ],
                  "dialogue_chars": ["[Voice_WangKai]","[Voice_LinChen]"] },
                // …G2-G12,含 情绪强度（G8=4,G9=5,G10=5 为高潮组）
              ] },
  "final_text": "<全片 12 组 Seedance 成片提示词 + 镜头卡 + 四表>"   // leak_scan 扫描对象
}
```

> **range 解析口径**:`range` 接受三种写法,`audit` 用同一解析器归一化为「组号集合」:
> `G3-G5`（组区间）、`G9-G10`（含单组）、`镜2-1~2-4`（镜号区间,归约到其所属组 G2）。
> narration/bgm 轨用组区间,sfx 轨可精确到镜号。

### 4.1 `_shared/assembly.md` — Bone 层装配契约（FR-02/03/04 权威源）

**首行铁律**(NFR-01):
```
> 本文件产出的 audio_layers 工件、混音 dB 阶梯、mute 表、装配链校验报告均为「装配施工单·过程产物」,
> 绝不写进 Seedance 成片提示词、绝不渲染为画面文字/字幕。唯一进成片的声音内容仍限 §4.4 台词/§4.5 音效创作语言。
```

**(A) 三轨 schema（FR-01,与 storyboard §8 同构,Bone 给定义、Skin 给落地样例）**:照搬 PRD §5.3(B),`{audio_id, type, range, source_ref, mix}` 五字段;`type∈{narration,bgm,sfx}`;`audio_id` 前缀 `[Audio_<Type>_<NN>]`。

**(B) 混音 dB 阶梯表（FR-02,机器可解析的权威阈值,审计从此处加载）**:照搬 PRD §5.3(C) 四行表,但**额外**给每个阈值一个机器可解析的归一化键供 `audit` 与 megaprompt 共用:

```python
# 内联进 assembly.md 的代码块 + audit 插件从同结构加载（写死为契约默认,可显式覆盖须写动机）
MIX_LADDER = {
  # 三个核心数值（来自 AI 短剧混音 dB 阶梯,写死为契约默认）
  "duck_under_voice_db":  (8, 12),    # bgm 对话段压人声区间 [8,12]，默认 10（FR-02①②）
  "climax_boost_db":      (3, 5),     # 高潮段（情绪≥4 组）抬升区间 [3,5]，默认 4（FR-02③）
  "crossfade_s":          0.5,        # 段间/进出 crossfade，容差 0（硬切=0 须写动机）（FR-02④）
  "voice_base_dbfs":      0,          # narration/对话人声基准线（0 dBFS 参考）
}
# 段落类型 → mix 取值规则（NFR-05 留白:恐怖/爆发/悲伤段允许 mute / 低密度）
SEGMENT_RULE = {
  "对话段":  lambda: dict(duck=10, boost=0, base="对话基准-10", sidechain="voice"),
  "高潮段":  lambda: dict(duck=10, boost=4, base="对话基准+4", sidechain="voice"),  # 情绪≥4
  "留白段":  lambda: dict(duck=0,  boost=0, base="mute",        sidechain="none"),  # 恐怖/爆发静默
  "悲伤段":  lambda: dict(duck=0,  boost=0, base="≤对话基准·低密度", sidechain="none"),
}
# NFR-05 不变式:恐怖/爆发/悲伤情绪组的 bgm 段 base ∈ {mute, ≤对话基准},不得 base>对话基准（不抢戏）
```

**(C) 视频内嵌轨静音规则（FR-03,写入 assembly.md）**:照搬 PRD §5.3(D):
```
默认（每镜头组一条 embedded_track_policy）：
  mute_bgm        = true   # 模型脑补 BGM 一律静音（独立 bgm 轨接管）
  mute_narration  = true   # 模型脑补旁白/对话一律静音（独立 narration 轨接管）
  keep_lipsync    = 视情   # 独立 narration 未覆盖该镜且模型口型音达标 → 保留
  keep_ambient    = 视情   # 独立 sfx 未覆盖该镜且模型环境声达标 → 保留
双重保险：提示词层 continuity-quality 三·1 末尾 `no music`（抑制生成）+ 装配层 mute（兜底）
冲突门：keep_lipsync=true 的镜,独立 narration 轨 range 不得覆盖同一镜（FR-03③,防口型音叠旁白）
```

**(D) 装配前必过链（FR-04,写入 assembly.md,收口散落原则）**:
```
(a) 首尾帧链（复用 continuity-quality 三·3）：相邻组承接处 上组末帧锚点 == 下组首帧锚点,
    避开淡出黑帧;不等且未声明动因 = 断点。
(b) 180° 轴线链（复用五·1）：跨镜跨组不跳轴,必须跳轴处显式登记一条"过渡镜";漏登记 = 破口。
(c) 音画时间线闭合（复用 storyboard §5 ±1s 口径）：每条 audio_layer 的 range 必落在实际组/镜区间内（无悬空轨）;
    narration 轨总时长 ≈ 其覆盖镜组 Σ时长（容差 ±1s）。
校验结果产出为「内部装配报告」,绝不进成片（NFR-01）。
```

### 4.2 `storyboard/output-contract.md` §8 — Skin 层 `audio_layer` 段

照搬 PRD §5.3(B) 单轨 schema 写成契约字段表 + 派生汇轨步骤 + 全片 `audio_layers` 样例（与 §177 现有镜头组样例对应）。§7 自检追加:
```
10. 装配自检（引 _shared/assembly.md）：若产出 audio_layers 工件,逐条过 §8 schema +
    assembly.md 的 dB 阶梯/mute/装配链;工件与装配报告只在内部跑,绝不写进成片镜头卡（同 §7-8 隐身铁律）。
```

### 4.3 `audits/audit_audio_assembly.py` — 审计插件骨架

```python
# _shared/scripts/audits/audit_audio_assembly.py
import re
from harness.audit_report import Report, Finding, Verdict
from harness.run_eval import register
from harness.leak_scan import leak_scan
from harness import lexicon, registry

TYPES = {"narration", "bgm", "sfx"}
MIX_FIELDS = {"base_dbfs", "duck_under_voice_db", "climax_boost_db", "crossfade_s", "sidechain"}
LAYER_FIELDS = {"audio_id", "type", "range", "source_ref", "mix"}
POLICY_FIELDS = {"mute_bgm", "mute_narration", "keep_lipsync", "keep_ambient"}
DUCK_RANGE = (8, 12); BOOST_RANGE = (3, 5); CROSSFADE = 0.5
CLIMAX_EMO = 4          # 情绪强度 ≥4 视为高潮组（FR-02③）
NEGSPACE_EMO_TAGS = {"恐怖", "爆发", "悲伤"}   # NFR-05 留白情绪组

def _parse_range(rng: str) -> set:
    """'G3-G5' / 'G9-G10' / '镜2-1~2-4' → {归一化组号}。镜号归约到所属组。"""
    rng = rng.replace("镜", "").replace("～", "~")
    grp = re.findall(r"G?(\d+)", rng)
    if "G" in rng or rng.strip().startswith("G"):
        nums = [int(x) for x in re.findall(r"G(\d+)", rng)]
    else:                                   # 镜号 '2-1~2-4' → 取第一段组号 G2
        nums = [int(x.split("-")[0]) for x in re.split(r"~", rng)]
    if not nums: return set()
    return set(range(min(nums), max(nums) + 1))

@register("audio_assembly")
def run(target) -> Report:
    rep = Report(audit="audio_assembly", target=target["id"])
    layers = target["audio_layers"]; src = target["source"]
    valid_groups = {int(re.search(r"\d+", g["id"]).group()) for g in src["groups"]}
    voiced = set(src["voiced_characters"])
    emo = {int(re.search(r"\d+", g["id"]).group()): g["情绪强度"] for g in src["groups"]}

    # ---- FR-01①: 五字段齐全 + type 三值 ----
    for L in layers:
        miss = LAYER_FIELDS - set(L)
        if miss:
            rep.findings.append(Finding("D6-FR-01", Verdict.FAIL,
                f"轨 {L.get('audio_id','?')} 缺字段 {miss}", measured=sorted(set(L)),
                threshold=sorted(LAYER_FIELDS), fix=f"补全轨 {miss} 字段"))
        if L.get("type") not in TYPES:
            rep.findings.append(Finding("D6-FR-01", Verdict.FAIL,
                f"轨 {L.get('audio_id')} type 越界: {L.get('type')!r}",
                measured=L.get("type"), threshold=sorted(TYPES),
                fix="type 仅取 {narration,bgm,sfx} 三值"))
        if set(L.get("mix", {})) != MIX_FIELDS:
            rep.findings.append(Finding("D6-FR-01", Verdict.FAIL,
                f"轨 {L.get('audio_id')} mix 字段不全: {set(L.get('mix',{}))}",
                fix=f"mix 固定 5 字段 {MIX_FIELDS}"))

    # ---- FR-01③: narration source_ref 命中 [Voice_*] ----
    for L in layers:
        if L.get("type") == "narration" and L.get("source_ref") not in voiced:
            rep.findings.append(Finding("D6-FR-01", Verdict.FAIL,
                f"narration 轨 {L['audio_id']} source_ref {L.get('source_ref')!r} 未命中角色表 [Voice_*]",
                measured=L.get("source_ref"), threshold=sorted(voiced),
                fix="narration source_ref 改回角色表已注册 [Voice_*]"))

    # ---- FR-01④: range 落在实际组/镜区间内（无悬空轨,与 FR-04(c) 同闸）----
    for L in layers:
        rng = _parse_range(L.get("range", ""))
        if not rng or not rng <= valid_groups:
            rep.findings.append(Finding("D6-FR-04", Verdict.FAIL,
                f"轨 {L['audio_id']} range {L.get('range')!r} 越界/悬空: {rng - valid_groups}",
                measured=sorted(rng), threshold=sorted(valid_groups),
                fix="range 改到 storyboard 实际存在的组/镜区间内"))

    # ---- FR-01⑤: narration ≥ 有台词角色数 ; sfx 覆盖所有 §4.5 音效镜（漏轨=0）----
    n_narr = sum(1 for L in layers if L.get("type") == "narration")
    if n_narr < len(voiced):
        rep.findings.append(Finding("D6-FR-01", Verdict.FAIL,
            f"narration 轨数 {n_narr} < 有台词角色数 {len(voiced)}",
            measured=n_narr, threshold=len(voiced),
            fix="为每个有台词 [Voice_*] 补 narration 轨"))
    sfx_shots = {s["id"] for g in src["groups"] for s in g["shots"] if s.get("音效")}
    covered = set()
    for L in layers:
        if L.get("type") == "sfx":
            m = re.search(r"镜?[\d-]+", L.get("source_ref", ""))
            if m: covered.add("镜" + m.group().lstrip("镜"))
    miss_sfx = sfx_shots - covered
    if miss_sfx:
        rep.findings.append(Finding("D6-FR-01", Verdict.FAIL,
            f"sfx 漏轨: {len(miss_sfx)} 个写了 §4.5 音效的镜未汇轨 {sorted(miss_sfx)}",
            measured=len(covered), threshold=len(sfx_shots),
            fix="为每个写了 §4.5 音效的镜补 sfx 轨"))

    # ---- FR-02: 混音 dB 阶梯区间 ----
    for L in layers:
        if L.get("type") != "bgm": continue
        mix = L.get("mix", {})
        duck = mix.get("duck_under_voice_db")
        if not (isinstance(duck, (int, float)) and DUCK_RANGE[0] <= duck <= DUCK_RANGE[1]):
            rep.findings.append(Finding("D6-FR-02", Verdict.FAIL,
                f"bgm 轨 {L['audio_id']} duck_under_voice_db={duck} ∉ [8,12]",
                measured=duck, threshold=DUCK_RANGE,
                fix="duck_under_voice_db 改入 [8,12]（默认 10）"))
        # 高潮组覆盖的 bgm 段 climax_boost ∈ [3,5]
        rng = _parse_range(L.get("range", ""))
        is_climax = any(emo.get(g, 0) >= CLIMAX_EMO for g in rng)
        boost = mix.get("climax_boost_db")
        if is_climax and not (isinstance(boost, (int, float)) and BOOST_RANGE[0] <= boost <= BOOST_RANGE[1]):
            rep.findings.append(Finding("D6-FR-02", Verdict.FAIL,
                f"高潮组 bgm 轨 {L['audio_id']} climax_boost_db={boost} ∉ [3,5]",
                measured=boost, threshold=BOOST_RANGE,
                fix="高潮段（情绪≥4 组）climax_boost_db 改入 [3,5]（默认 4）"))
        # crossfade == 0.5（硬切=0 须写动机,动机检由 detail 提示,数值由 fixture 标 motive 字段）
        cf = mix.get("crossfade_s")
        if cf != CROSSFADE and not (cf == 0 and L.get("crossfade_motive")):
            rep.findings.append(Finding("D6-FR-02", Verdict.FAIL,
                f"bgm 轨 {L['audio_id']} crossfade_s={cf} ≠ 0.5（且非带动机硬切）",
                measured=cf, threshold=CROSSFADE,
                fix="相邻 bgm 边界 crossfade_s 改为 0.5;硬切须 crossfade_s:0 + 写动机"))
        if mix.get("sidechain") != "voice":
            rep.findings.append(Finding("D6-FR-02", Verdict.WARN,
                f"bgm 轨 {L['audio_id']} 缺 sidechain:voice 自动 ducking 声明",
                fix="对话段 bgm 标 sidechain: voice"))

    # ---- FR-NFR05: 留白 —— 恐怖/爆发/悲伤组 bgm 不抢戏 ----
    for L in layers:
        if L.get("type") != "bgm": continue
        rng = _parse_range(L.get("range", ""))
        neg = any(any(t in (next((g.get("情绪标签","") for g in src["groups"]
                  if int(re.search(r'\d+', g['id']).group()) == gid), "")) for t in NEGSPACE_EMO_TAGS)
                  for gid in rng)
        base = str(L.get("mix", {}).get("base_dbfs", ""))
        if neg and base.startswith("对话基准+"):
            rep.findings.append(Finding("D6-NFR-05", Verdict.FAIL,
                f"留白情绪组 bgm 轨 {L['audio_id']} base={base} 抢戏（应 mute/≤对话基准）",
                fix="恐怖/爆发/悲伤组 bgm base 改为 mute 或 ≤对话基准·低密度（§8 留白）"))

    # ---- FR-03: 每组一条 policy + mute 默认 true + lipsync 冲突 ----
    policies = {p["group"]: p for p in target["embedded_track_policies"]}
    for g in src["groups"]:
        gid = g["id"]
        if gid not in policies:
            rep.findings.append(Finding("D6-FR-03", Verdict.FAIL,
                f"镜头组 {gid} 缺 embedded_track_policy",
                fix=f"为 {gid} 补一条 embedded_track_policy"))
            continue
        p = policies[gid]
        for k in ("mute_bgm", "mute_narration"):
            if p.get(k) is False and not p.get(k + "_motive"):
                rep.findings.append(Finding("D6-FR-03", Verdict.FAIL,
                    f"{gid} {k}=false 无动机", fix=f"置 {k}=false 须同行写动机,否则恢复 true"))
        # keep_lipsync=true 镜不得被独立 narration 覆盖
        if p.get("keep_lipsync"):
            gnum = int(re.search(r"\d+", gid).group())
            narr_cover = any(gnum in _parse_range(L["range"])
                             for L in layers if L.get("type") == "narration")
            if narr_cover:
                rep.findings.append(Finding("D6-FR-03", Verdict.FAIL,
                    f"{gid} keep_lipsync=true 但独立 narration 轨覆盖同组（口型音叠旁白冲突）",
                    fix="keep_lipsync 改 false 或撤该组 narration 覆盖"))

    # ---- FR-04(a)(b): 首尾帧链 + 180° 链 ----
    for e in target["assembly_chain"]["group_endframe_anchors"]:
        if e["end_anchor"] != e["start_anchor"] and not e["declared_motive"]:
            rep.findings.append(Finding("D6-FR-04", Verdict.FAIL,
                f"{e['group']}→{e['next_group']} 首尾帧断点: 末帧'{e['end_anchor']}' ≠ 首帧'{e['start_anchor']}'",
                fix="上组末帧锚点 == 下组首帧锚点,或显式写承接动因（复用三·3）"))
    for j in target["assembly_chain"]["axis_jumps"]:
        if not j["has_transition_shot"]:
            rep.findings.append(Finding("D6-FR-04", Verdict.FAIL,
                f"跳轴处 {j['between']} 未登记过渡镜（180° 破口）",
                fix="跳轴处显式登记一条过渡镜（复用五·1）"))

    # ---- FR-04(c): narration 轨时长闭合 ≤ ±1s ----
    grp_dur = {int(re.search(r"\d+", g["id"]).group()): g["组时长"] for g in src["groups"]}
    for L in layers:
        if L.get("type") != "narration": continue
        if "duration" in L:               # 工件可选声明轨时长
            covered = sum(grp_dur.get(g, 0) for g in _parse_range(L["range"]))
            if abs(L["duration"] - covered) > 1:
                rep.findings.append(Finding("D6-FR-04", Verdict.FAIL,
                    f"narration 轨 {L['audio_id']} 时长 {L['duration']}s 与覆盖组 Σ {covered}s 偏差 >1s",
                    measured=L["duration"], threshold=covered,
                    fix="narration 轨时长改至覆盖镜组 Σ时长 ±1s 内（复用 §5 口径）"))

    # ---- NFR-NFR02: audio_model_profile 走 registry,不硬编码 ----
    prof = target.get("audio_model_profile", {})
    music = registry.reg()["music"]["default"]; voice = registry.reg()["voice"]
    if prof.get("bgm") != music:
        rep.findings.append(Finding("D6-NFR-02", Verdict.WARN,
            f"audio_model_profile.bgm={prof.get('bgm')!r} 与 registry music.default 不一致",
            fix="bgm 模型走 registry.reg()['music']['default'],勿硬编码"))

    # ---- NFR-01 铁律: 成片提示词零泄漏（复用 leak_scan）----
    leak = leak_scan(target["final_text"], extra_terms=lexicon.BY_DIRECTION["D6"])
    rep.findings.extend(leak.findings)     # leak 的 FAIL 直接并入本报告

    rep.assert_fail_has_fix()              # 底座铁律:每条 FAIL 必带 fix
    return rep
```

### 4.4 汇轨基线 builder（喂 snapshot.freeze）

```python
# 由 M3 一次性脚本/插件子命令产出黄金基线（只读派生,不创作 —— PRD §5.3(E) 算法）
def build_audio_layers(fewshot_path) -> dict:
    roster = parse_roster(fewshot_path)         # 角色表 §4 [Voice_*]
    groups = parse_storyboard(fewshot_path)     # 12 组,逐镜 §4.5 音效 + 情绪强度
    layers, nn = [], {"Narration": 0, "Bgm": 0, "Sfx": 0}
    def newid(t): nn[t] += 1; return f"[Audio_{t}_{nn[t]:02d}]"

    for ch in roster.voiced_characters:                      # narration 轨
        rng = shots_with_dialogue(groups, ch)                # 该角色台词覆盖镜区间
        layers.append(dict(audio_id=newid("Narration"), type="narration", range=rng,
                           source_ref=ch.voice_id, mix=voice_base()))
    for g in groups:
        for shot in g.shots:
            if shot.音效:                                    # 引 §4.5,不重写参数
                layers.append(dict(audio_id=newid("Sfx"), type="sfx", range=f"镜{shot.no}",
                                   source_ref=f"§4.5@镜{shot.no}", mix=sfx_mix()))
    for seg in bgm_segments(groups):                         # bgm 按情绪弧转折切段
        layers.append(dict(audio_id=newid("Bgm"), type="bgm", range=seg.range,
                           source_ref=f"§8:{mapping8[seg.emotion]} + audio_model_profile.bgm",
                           mix=bgm_mix(seg)))                 # 套 MIX_LADDER（§4.1B）
    art = {"audio_layers": layers,
           "_summary": {"narration": nn["Narration"], "bgm": nn["Bgm"], "sfx": nn["Sfx"],
                        "voiced": len(roster.voiced_characters),
                        "sfx_shots": sum(1 for g in groups for s in g.shots if s.音效)}}
    return art   # freeze 后期望 _summary.narration>=voiced 且 sfx==sfx_shots（漏轨=0）

def bgm_mix(seg):
    duck = 10                                                # ∈[8,12]
    boost = 4 if seg.emotion >= 4 else 0                     # 高潮 ∈[3,5]
    if seg.emotion_tag in {"恐怖", "爆发", "悲伤"}:
        base, sidechain = "mute", "none"                     # NFR-05 留白
    else:
        base, sidechain = f"对话基准+{boost}" if boost else "对话基准-10", "voice"
    return dict(base_dbfs=base, duck_under_voice_db=duck, climax_boost_db=boost,
                crossfade_s=0.5, sidechain=sidechain)
```

---

## 5. 任务拆解（Tickets）

| Ticket | 描述 | 产物 | 工时(人天) | 前置 |
|---|---|---|---|---|
| D6-T01 | 写 `_shared/assembly.md`:首行隐身铁律 + (A) 三轨 schema + (B) 混音 dB 阶梯表（`MIX_LADDER` 代码块 + `SEGMENT_RULE` + NFR-05 留白不变式） | 契约 §A/§B | 1.0 | — |
| D6-T02 | 续写 `assembly.md`:(C) 视频内嵌轨 mute 规则 + (D) 装配前必过链三链（首尾帧/180°/时间线闭合,收口 continuity 三·3·五·1·storyboard §5）+ `audio_model_profile` 走 registry 说明 | 契约 §C/§D | 0.8 | D6-T01 |
| D6-T03 | 扩 `storyboard/output-contract.md` §8:`audio_layer` schema 字段表 + range/source_ref/mix + 派生汇轨步骤 + §7 自检追加第 10 条；附全片 `audio_layers` 样例 | storyboard §8 | 1.0 | D6-T02 |
| D6-T04 | 注册改动:`asset-id-convention.md` §1 加 `[Audio_<Type>_<NN>]` 行 + §4 source_ref 写法;`mapping-tables.md` §8 加交叉引用注脚;`README.md` `(8件)→(9件)`+目录树+② 骨行+关键设定行;`lexicon.py` 加 `BY_DIRECTION["D6"]` | 4 改文件 + lexicon | 0.5 | D6-T03 |
| D6-T05 | 写 `audits/audit_audio_assembly.py`:FR-01/02/03/04 全断言 + NFR-05 留白 + `_parse_range` + 接 leak_scan（NFR-01）+ `@register("audio_assembly")` + `assert_fail_has_fix` | 审计插件 | 2.5 | D6-T01,D6-T02,底座 harness 就绪 |
| D6-T06 | 汇轨 builder:`build_audio_layers` 跑 `fewshot-翡翠楼夜宴-v2全片.md` → `snapshot.freeze` 成 `audio_layers.golden.json`,断言 `_summary.narration>=voiced` 且 `sfx==sfx_shots`(漏轨=0) | 黄金基线 | 1.0 | D6-T05 |
| D6-T07 | 造 fixture:`D6_audio_assembly.clean.json`（翡翠楼合规整片工件,期望 GO）+ `.poison.json`（§6② 6 变体,各期望特定 FAIL + 测回值） | 一对 fixtures | 1.2 | D6-T05,D6-T06 |
| D6-T08 | 接 `reverse_test.assert_gate_is_real(audit_audio_assembly.run, clean, poison[Pn])`;接 `run_eval`;纳入 `make verify` 四项门;写 `tests/test_audio_assembly.py` | 测试接线 | 0.5 | D6-T07 |
| D6-T09 | 真机整片合成（M4,付费由用户亲点）:1 片**整片**合成 + DoD-10 A/B 人评(对话 ducking/高潮抬升/0.5s crossfade/无双重音频四项),回填 dB 阶梯校准结论 | 真机证据 | 0.5 | D6-T08 |

**合计 ≈ 9.0 人天 ≈ 1.8 人周**（M1–M3 文本闸 8.5 人天为关键路径;M4 真机 0.5 人天可与 M3 末段并行,粗估对齐 PRD §10 的 2.0–2.5 人周上限）。

---

## 6. 测试方案

### ① 正例（clean 基线,期望 GO）

- **fixture**:`D6_audio_assembly.clean.json`——取 `fewshot-翡翠楼夜宴-v2全片.md` 真实全片派生的合规 `audio_layers` 工件:
  - 3 条 narration 轨（`[Voice_LinChen]` 覆盖 G1-G12 / `[Voice_ZhaoShanhe]` 覆盖 G4-G12 / `[Voice_WangKai]` 覆盖 G1）;
  - 全 sfx 镜汇轨（含 镜2-2 烟头摁灭 / 镜1-1 空调嗡鸣 / G6 酒杯轻碰 / G12 窗外夜风）;
  - bgm 按情绪弧分段:G1-G7 对话段（`duck=10, boost=0, sidechain=voice`）、G8-G10 高潮段（情绪 4/5/5,`boost=4`）、G10 声画分离留白可标 `base=mute`;
  - 12 条 `embedded_track_policy`（`mute_bgm/mute_narration=true`）;`audio_model_profile.bgm=suno-5`;首尾帧/180° 链全闭合。
- 期望:`audit_audio_assembly.run(clean) → decision=GO, exit_code=0`。

### ② 反向注入（poison fixture,每变体期望特定 FAIL + 特定测回值）

`D6_audio_assembly.poison.json` 含 6 个独立投毒变体,**每个只动一处**,精确验证对应闸:

| 变体 | 投毒动作（具体到字段值） | 命中闸 | 期望测回 |
|---|---|---|---|
| **P1 ducking 越界** | 把某 bgm 轨 `mix.duck_under_voice_db` 从 `10` 改成 `6`（< 区间下限 8） | D6-FR-02 | `measured=6, threshold=(8,12)`;判 **FAIL** |
| **P2 高潮漏抬升** | 把覆盖 G9（情绪 5）的 bgm 轨 `mix.climax_boost_db` 从 `4` 改成 `0`（高潮段未抬升） | D6-FR-02 | `measured=0, threshold=(3,5)`,detail 含 "高潮组";判 **FAIL** |
| **P3 type 越界** | 把一条轨 `type` 从 `bgm` 改成 `ambient`（不在三值内） | D6-FR-01 | `measured="ambient", threshold=["bgm","narration","sfx"]`;判 **FAIL** |
| **P4 悬空轨** | 把某 narration 轨 `range` 从 `G1-G12` 改成 `G13-G14`（全片只有 G1-G12） | D6-FR-04 | `measured` 含越界组,detail 含 "悬空" `{13,14}`;判 **FAIL** |
| **P5 lipsync 冲突** | 给 G1 的 `embedded_track_policy` 置 `keep_lipsync=true`,同时保留 `[Voice_WangKai]` narration 轨覆盖 G1 | D6-FR-03 | detail 含 "口型音叠旁白冲突";判 **FAIL** |
| **P6 成片泄漏** | 在 `final_text` 某组 Seedance 成片提示词里塞入 `[Audio_Bgm_03] duck_under_voice_db:-10dBFS, crossfade 0.5s` | NFR-01 / leak_scan | detail 命中禁词 `"[Audio_"/"duck_under_voice"/"dBFS"/"crossfade"`;判 **FAIL** |

> 另:**留白违反投毒 P7**（可选,验 NFR-05）——把覆盖 G9（爆发情绪）的 bgm 轨 `base_dbfs` 从 `mute` 改成 `对话基准+4`,期望 `D6-NFR-05 FAIL, detail 含 "抢戏"`。

### ③ `assert_gate_is_real` 调用示例

```python
# tests/test_audio_assembly.py
import json
from harness.reverse_test import assert_gate_is_real
from audits import audit_audio_assembly

clean  = json.load(open("_shared/scripts/fixtures/D6_audio_assembly.clean.json", encoding="utf-8"))
poison = json.load(open("_shared/scripts/fixtures/D6_audio_assembly.poison.json", encoding="utf-8"))

def test_audio_assembly_gate_is_real():
    for variant in ["P1","P2","P3","P4","P5","P6"]:
        assert_gate_is_real(audit_audio_assembly.run, clean, poison[variant],
                            name=f"D6-audio-assembly/{variant}")
    # 等价于:clean.exit_code==0 放行 ; poison[variant].exit_code==1 报红;否则 AssertionError
```

### ④ 回归（冻结黄金基线 + 改什么后重跑）

- **冻结**:`audio_layers.golden.json` = `fewshot` 全片汇轨工件（`_summary.narration>=voiced` 且 `sfx==sfx_shots`,漏轨=0）。
- **改 dB 阶梯 / 汇轨规则后重跑**:`build_audio_layers()` → `diff_against_golden()`。
  - 若调 `MIX_LADDER` 默认值（如 duck 默认 10→11）→ 工件 mix 字段变化 → `snapshot` 报 `WARN 漂移` → 人审 diff,确认是**有意改进**则 `freeze` re-freeze 基线;否则回滚。
  - 若 `_summary.sfx` 从全覆盖变 <`sfx_shots`（回归劣化:漏轨）→ 视为 FAIL,必须修复 `build_audio_layers` 后才允许合入。
- **改三核心数值 / 区间**（如行业证据更新人声下压区间 [8,12]→[6,12]）→ 同步改 `assembly.md` 阶梯表 + `audit` 的 `DUCK_RANGE` + clean fixture + re-freeze 基线,四处一致才过。

### ⑤ 真机层（M4,付费按钮由用户亲点）

- 取翡翠楼做**整片一次**合成（NFR-04:`合成调用次数==1`,非逐镜出声）:narration/bgm/sfx 三轨按工件 mix 叠加 + 内嵌轨 mute。
- DoD-10 A/B 人评:A = 仅按散落 §4.5 音效手拼、B = 按 `audio_layers` 工件 + dB 阶梯合成,≥3 名评审核对四项「对话段 BGM 被压约 10dB / 高潮抬升 / 段间 0.5s crossfade / 无双重音频」与工件一致;量"对话清晰度（人声不被 BGM 糊）+ 无双重音频"评分,B 应显著高于 A。
- 成本闸（NFR-04）:工件 + 装配报告 0 次真机即完成;触发真机时合成调用 == 1（整片）。

### 为何这样能证明"真的有效"

结构闸（脚本）+ 基线 diff 把"工件忠实派生、三轨齐全、dB 阶梯合规、装配链闭合、不泄漏成片"全部落成**可量化、可重跑的硬断言**（数值阈值 / 存在性 / 命中数=0），非主观"音质提升"。反例 P1–P7 证明六道闸（dB 区间 / type 三值 / 悬空轨 / lipsync 冲突 / 隐身 grep / 留白）是**真闸**能拦截。A/B 合成核验把"音频装配确有增益"落到可测指标。

---

## 7. 里程碑与退出门

| Milestone | 产物 | 退出门（脚本必须绿 / DoD 必须过） |
|---|---|---|
| **M1 装配契约 assembly.md**（≈0.7 周;T01–T02） | `_shared/assembly.md`（三轨 schema + dB 阶梯表 + mute 规则 + 装配链三链 + registry 接线） | 契约草案可评审;`MIX_LADDER` 三核心数值逐字命中（下压 [8,12]、高潮 [3,5]、crossfade 0.5）手验;`portability_scan` 对 assembly.md=0;**DoD-2/4/6 半程** |
| **M2 storyboard §8 + ID 注册**（≈0.4 周;T03–T04） | storyboard §8 `audio_layer` 段 + 全片样例 + `[Audio_*]` 注册 + README/mapping/lexicon | **DoD-9** 注册齐（`asset-id-convention.md` §1 有 `[Audio_*]` 行 / `mapping-tables.md` §8 有交叉引用 / README `_shared` 9 件）;`portability_scan`=0 |
| **M3 审计脚本与基线**（≈0.7 周;T05–T08）★MVP 切线 | `audit_audio_assembly.py` + clean/poison fixtures + `audio_layers.golden.json` + 测试接线 | `make verify` 四项绿:① `run_eval`(含 audio_assembly)GO ② `reverse_test --all`（P1–P6 clean 放行/poison 报红）③ `leak_scan_all`=0 ④ `portability_all`=0;基线漏轨=0;**DoD-1/2/3/4/5/7/8 全过** |
| **M4 真机与 A/B**（≈0.3 周,付费用户点;T09） | 1 片整片合成 + DoD-10 A/B 人评 + dB 阶梯校准结论 | **DoD-10** 四项一致 ≥3 评审通过;合成调用==1（整片,非逐镜） |

**MVP 切线 = M3 完成**:此时文本审计闸（结构 + 基线 + 反例 + leak_scan）全绿、可冷启动重跑回归,即为可交付可验证核心。M4 真机是增益证据,不阻塞 MVP。**关键路径** M1→M2→M3;M4 可与 M3 末段并行。

---

## 8. 风险与回滚

| 风险 | 影响 | 缓解 / 回滚 / 降级 |
|---|---|---|
| **R1 轨道元数据（audio_id/dB/mute）被误写进 Seedance 成片提示词**（引擎泄漏,破隐身铁律） | 破成片 | NFR-01 硬闸（leak_scan + `BY_DIRECTION["D6"]` 全词表）+ poison P6 反例 + `assembly.md` 首行"装配施工单·非成片" + 唯一豁免限 §4.4 台词/§4.5 音效创作语言及 `(BGM)` 标记。CI 拦截,不可绕过 |
| **R2 内嵌轨未 mute → 双重音频**（两层 BGM / 旁白叠口型音） | 合成废片 | FR-03 双重保险（提示词层 `no music` 抑制 + 装配层 mute 兜底）+ keep_lipsync 冲突门（poison P5）;DoD-3 核验 |
| **R3 dB 阶梯在不同合成器 ducking 实现下听感不一** | 混音不一致 | 阶梯写 `sidechain=voice` 语义（而非绑定某器实现）;真机 A/B 人评兜底校准;三数值留区间 [8,12]/[3,5] 容差 |
| **R4 BGM 分段切点判定歧义**（按情绪弧哪里切段） | 段界不稳 | 段界**复用 storyboard 情绪强度组边界**（情绪弧转折=组边界,翡翠楼 G7/G8/G9 转折清晰）,不另立切段自由度;高潮段=情绪≥4 组,规则化裁决 |
| **R5 恐怖/悲伤段被机械铺满 BGM 违反 §8 留白** | 抢戏、失原则 | NFR-05 显式允许 `mute`/低密度段（`SEGMENT_RULE` 留白档）;审计 `NFR-05` 断言这些情绪组 bgm base ≤ 对话基准（poison P7）|
| **R6 `[Audio_*]` 与 `[Voice_*]` 概念混淆** | ID 体系乱 | `asset-id-convention.md` §1 明确:`[Voice_*]`=音色身份（角色表锁）、`[Audio_Narration_*]`=轨实例（引 Voice + range）;一对多复用写清（FR-01 narration source_ref 命中校验兜底） |
| **R7 底座 harness 尚未落地**（当前 `_shared/scripts/` 为空,仅 substrate 文档存在） | 插件无处接 | **前置依赖**:Sprint0 步行骨架（substrate §6）须先建 `harness/{audit_report,leak_scan,lexicon,run_eval,reverse_test,snapshot,registry}.py` + `model_registry.json`。**降级路径**:Sprint0 未就绪时,T05 先以独立 `verify_audio_assembly.py`（同断言、不 import harness、内联最小 Report）跑通文本闸,待 harness 就绪再改为 `@register` 接入（断言逻辑不变,仅换 Report 来源）|
| **R8 真机整片合成付费且慢** | 成本/速度 | NFR-04:工件 + 报告纯文本免真机;真机仅整片一次（非逐镜）;由用户亲点 |
| **R9 宿主无合成器/`video_assembler` 通道** | 真机层无法跑 | 工件 + 装配报告产出**不**依赖宿主（纯 Markdown 派生,DoD-1~9 全可文本验）;真机合成（DoD-10）为可选末步,缺则降级为"工件交付即 Done",合成由团队在任意合成软件按工件手工执行（合成器无关,NFR-02）|

**总回滚策略**:D6 是纯增量（新增 1 件 Bone 契约 + storyboard §8 追加段 + 1 插件 + 一对 fixture + 一份基线），不改任何既有契约语义（PRD NG3/NG4）。任一环失败,删 `_shared/assembly.md` + 撤 storyboard §8 段 + 撤 4 处注册（asset-id/mapping/README/lexicon）+ 删 `audit_audio_assembly.py` + fixtures/baseline 即完全回滚,对其余 12 方向与既有成员**零影响**。
