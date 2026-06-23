# D2 · 拉片复刻反向成员（reverse-board）开发方案

> 编号 D2 ｜ 优先级 P1 ｜ 状态 Dev v0.1 ｜ 前置：[D02-reverse-board.md](../D02-reverse-board.md)（本方向 PRD） + [00-ENGINEERING-SUBSTRATE.md](./00-ENGINEERING-SUBSTRATE.md)（共享工程底座）

---

## 1. 目标与范围

把 PRD 的 **D2-FR-01~05 + NFR-01~05** 落成"接在共享底座上的薄插件"，交付"参考视频 → 完整镜头拆解 → 抽 `clip_skeleton`/`key_element` → 换主体 → 标准 v2.0 镜头卡 + 每组一段 Seedance"的可执行成员。**本方向作为底座插件，边界是**：① 只写**分析侧**新增面（新成员 `reverse-board/` + 一份 Bone 知识 `reverse-analysis.md` + 中间产物契约 `clip_skeleton` schema），下游成片**零改** `storyboard/output-contract.md` v2.0；② 一切验证机制（`audit_report`/`leak_scan`/`snapshot`/`reverse_test`/`run_eval`/`registry`）**复用底座**，本方向只交付一个审计插件 `audits/audit_reverse_board.py`、一对 clean/poison fixture、一份黄金基线、知识/契约 md、与任务拆解；③ **Soul 一行不改**（拉片的"理解"仍走 `tacit-core.md` 寓居/情绪优先六维，D2 只把它的输入从"文字剧本"扩成"视频→骨架→当作结构化剧本"），这是不破引擎隐身（NFR-01）的结构性保证。

非本方向（PRD Non-Goals 对应）：不新增视频模型适配层（走现有 `seedance-2.0.md`，D3 管模型注册表）；不做版权法律判定（只做工程级"题材原创 + 无品牌/Logo/可读台词搬运"的反向锚定）；不破可移植性（多模态依赖一律通过 FR-01 探针**门控**，skill 文件零宿主 API）。

---

## 2. 交付物清单

精确文件路径表（路径以仓库根 `skills/director-suite/` 为基准；底座路径见 SUBSTRATE §1）：

| 路径 | 类型 | 说明 |
|---|---|---|
| `_shared/reverse-analysis.md` | 知识md（Bone） | 拉片分析协议：能力探针三档判定/帧采样策略/**运镜反推表**（与 `output-contract.md` §2.2 互逆）/切点识别/时间码→时长换算/合规反向锚定（无题材搬运）/口径统一（情感优先六维，NFR-05） |
| `_shared/reverse-learnings.md` | 知识md（Bone·暂存） | 拉片归纳新招式暂存区（人审确认前不进 `style-refs.md` 主库）；含固定追加格式 + 脱敏要求 |
| `reverse-board/SKILL.md` | 知识md（Skin·入口/编排） | 成员入口：拉片复刻 6 步管线（探针→拆解→抽骨架→换主体→喂契约→回灌）；frontmatter 可被索引、可触发 |
| `reverse-board/output-contract.md` | 契约md（Skin） | **中间产物**契约：`clip_skeleton` + `key_element` 字段 schema（最终成片仍复用 `../storyboard/output-contract.md`，本契约只管"中间骨架"） |
| `reverse-board/schema/clip_skeleton.schema.json` | 契约（JSON Schema） | 机器可消费的 `clip_skeleton` JSON Schema（审计脚本 `jsonschema` 校验用） |
| `reverse-board/examples/fewshot-拉片复刻-demo.md` | 样例md | 一条原创参考片骨架 → 换主体 → 成片 的脱敏 few-shot（兼黄金基线人读版） |
| `_megaprompts/reverse-board.megaprompt.md` | 知识md（可移植双态） | mega-prompt 单文件版（NFR-02），自包含、不依赖 Skill 安装 |
| `_shared/scripts/audits/audit_reverse_board.py` | audits插件py | 实现 `run(target)->Report` 并 `@register("reverse_board")`；四组判据见 §4 |
| `_shared/scripts/fixtures/D02_reverse.clean.json` | fixtures（正例） | 合法 `clip_skeleton` + 换主体成片（应 PASS / GO） |
| `_shared/scripts/fixtures/D02_reverse.poison.json` | fixtures（反例） | 投毒样本（应 FAIL / NO-GO）；具体投毒见 §6 |
| `_shared/baselines/cases/reverse_B0/` | baselines | 黄金基线 B0（原创 ≤15s 参考片的人工 ground-truth 标注 + 冻结骨架 + 换主体成片），纳入 `run_eval` 与 `snapshot` 回归 |
| `_shared/scripts/lexicon.py` → `BY_DIRECTION["D2"]` | registry项（改动） | 往集中式禁词表注册 D2 专属禁词（见 §3②） |
| `_shared/scripts/audits/audit_reverse_board.py` 顶部 `@register` | registry项 | 自动进 `run_eval` 的 GO/NO-GO 编排 |

**最小侵入改动（非新建，仅追加节）**：

| 路径 | 改动 |
|---|---|
| `_shared/asset-id-convention.md` | 新增「6. 剪辑骨架对象（clip_skeleton）约定」：骨架是镜头序列模板（非 asset），用占位 `<<SUBJECT>>`/`<<PROP>>`/`<<LOCATION>>` 解耦主体，说明如何对接 `[Element_*]` 焊点 |
| `README.md` | 「单产物成员」表 +1 行 reverse-board；「目录结构」补 `reverse-analysis.md`/`reverse-learnings.md` 两份 |
| `_shared/style-refs.md` | 文末加「招式回灌入口」：拉片归纳条目从 `reverse-learnings.md` 经人审合入此处的格式 |

---

## 3. 与共享底座的接线

### ① 复用 harness 哪些构件

| 底座构件（SUBSTRATE §2） | D2 怎么用 |
|---|---|
| `audit_report.py`（§2.1） | 审计插件输出唯一形态 `Report/Finding/Verdict`；`Finding.check` 引回 PRD 的 `D2-FR-0x`/`D2-NFR-0x`/`DoD#n`；调 `assert_fail_has_fix()` 保证每条 FAIL 带可执行修复动作 |
| `leak_scan.py` + `lexicon.py`（§2.2） | **直接复用，不重写**。对换主体成片 grep 引擎/过程/执行词；D2 把骨架占位符/时间码/探针档位等过程产物词加进 `lexicon.BY_DIRECTION["D2"]`（DoD#6 引擎隐身硬门） |
| `snapshot.py`（§2.4） | `freeze` 把 B0 拆解骨架冻成黄金基线；改 `reverse-analysis.md` 后重拆 B0 用 `diff_against_golden` 测"切点序列/运镜序列是否无故漂移"（回归 L2，PRD §7 回归 diff） |
| `reverse_test.py`（§2.5） | `assert_gate_is_real(audit_reverse_board.run, clean, poison)` 证明本方向的闸不是橡皮图章（完善⑥：闸 + 反例才算 Done） |
| `run_eval.py`（§2.6） | `audit_reverse_board` 经 `@register("reverse_board")` 自动进 5 基线 × 全审计的 GO/NO-GO 编排；`reverse_B0` 进 `cases/` |
| `registry.py` / `model_registry.json`（§2.7） | **只读不改**。D2 成片走 Seedance，模型名一律 `registry.video_default()`，**禁在 skill/contract 里硬编码** `seedance-2.0`（满足"涉模型选择必走 registry"+ `portability_scan` 不命中宿主 API） |

> D2 **不新增** harness 机制文件，只新增 1 个 `audits/audit_reverse_board.py` 插件。底座的 `portability_scan.py`（§2.3）横切扫 `reverse-board/SKILL.md` 与 `reverse-analysis.md`（不得出现 `vimax.`/`grsai.`/`.exe`/货币），由合入门 §5 的 `portability_all` 统一覆盖，本方向无需额外脚本。

### ② 往 `lexicon.BY_DIRECTION` 加哪些禁词

`lexicon.py` 现状只有 `BY_DIRECTION = {"D5":..., "D8":..., "D4":...}`。**新增 `"D2"` 键**，注册"拉片过程产物绝不可入成片"的禁词（DoD#6 grep 禁词表的来源）：

```python
# lexicon.py 追加
BY_DIRECTION["D2"] = [
    # —— 骨架/过程结构词（schema 内部字段名，禁出现在成片）——
    "clip_skeleton", "source_probe", "key_element", "key_elements",
    "invariants_locked", "shot_groups", "rel_duration",
    # —— 占位符（换主体后必须被真实主体替换，残留即泄漏）——
    "<<", ">>", "SUBJECT", "PROP_KEY", "LOCATION",
    # —— 探针/拉片过程术语 ——
    "探针", "能力探针", "拉片", "复刻", "档位", "降级到", "mode: A", "mode: B", "mode: C",
    # —— 绝对时间码（NFR-01：落卡须换算成「时长：Xs」）——
    "时间码", "timecode", "00:0", "00:1",
]
```

> 注：`00:0`/`00:1` 覆盖一条 ≤15s 片所有秒位（00:00–00:15 → `00:0x`/`00:1x`），命中即证明绝对时间码漏进成片。`<<`/`>>` 是占位符泄漏的最强信号。

### ③ 是否引用 model_registry

**引用，只读**。下游成片提示词的视频模型名一律经 `registry.video_default()` 取（当前解析为 `seedance-2.0`）。本方向**不新增/不修改** `model_registry.json`（那是 D3 的单一事实来源）。`reverse-board/output-contract.md` 与 megaprompt 文案中提到"喂给视频模型"时用中性措辞，不写死模型名常量。

### ④ 新增 `audits/audit_reverse_board.py` 的 register 名

```python
@register("reverse_board")          # run_eval 的 AUDIT_REGISTRY key = "reverse_board"
def run(target) -> Report: ...
```

---

## 4. 实现分解

### 4.1 `clip_skeleton` JSON Schema（`reverse-board/schema/clip_skeleton.schema.json`）

机器可消费契约（审计 a 项 `jsonschema` 校验用）。下划线 `_` 前缀字段 = **禁出成片**的过程产物（与 leak_scan 配合）：

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "clip_skeleton",
  "type": "object",
  "required": ["source_probe", "key_elements", "shot_groups", "invariants_locked"],
  "additionalProperties": false,
  "properties": {
    "source_probe": {                       // 能力探针结果（过程产物，NFR-01 禁入成片）
      "type": "object",
      "required": ["mode", "can_read_frames", "can_detect_cuts", "can_detect_motion", "sample_fps"],
      "properties": {
        "mode": { "enum": ["A", "B", "C"] }, // A全自动 / B半自动关键帧 / C口述兜底
        "can_read_frames":  { "type": "boolean" },
        "can_detect_cuts":  { "type": "boolean" },
        "can_detect_motion":{ "type": "boolean" },
        "sample_fps":       { "type": "number", "minimum": 0, "maximum": 4 }  // NFR-03 默认 1.0
      }
    },
    "key_elements": {                        // 可换主体槽位（FR-03）
      "type": "array", "minItems": 1,
      "items": {
        "type": "object",
        "required": ["slot", "role"],
        "properties": {
          "slot":  { "type": "string", "pattern": "^<<[A-Z_]+>>$" },  // 必占位，零专有名词
          "role":  { "enum": ["protagonist", "antagonist", "contiguity_prop", "location"] },
          "_original_hint": { "type": "string" }    // 内部参考，禁入成片
        }
      }
    },
    "shot_groups": {                         // 节拍分段，每段 ≤15s（FR-02）
      "type": "array", "minItems": 1,
      "items": {
        "type": "object",
        "required": ["group_id", "duration_s", "beat", "shots"],
        "properties": {
          "group_id":   { "type": "string", "pattern": "^G\\d+$" },
          "duration_s": { "type": "number", "minimum": 4, "maximum": 15 }, // 组 ∈ [4,15]
          "beat":       { "type": "string" },
          "_abs_timecode": { "type": "string" },     // 过程产物，落卡换成「时长：Xs」
          "shots": {
            "type": "array", "minItems": 1,
            "items": {
              "type": "object",
              "required": ["shot_id", "rel_duration_s", "shot_size", "camera_move",
                           "cut_to_next", "emotion_intensity", "subject_ref"],
              "properties": {
                "shot_id":        { "type": "string", "pattern": "^G\\d+-S\\d+$" },
                "rel_duration_s": { "type": "number", "minimum": 0.3, "maximum": 15 },
                "shot_size":      { "enum": ["大远景","远景","全景","中全景","中景",
                                             "中近景","近景","特写","大特写"] },
                "camera_move": {                       // 三件套（output-contract L65）
                  "type": "object",
                  "required": ["type", "intent", "physical"],
                  "properties": {
                    "type":     { "enum": ["Push In","Pull Out","Lead","Follow","Orbit",
                                           "Handheld","Steadicam","Crane Up","Crane Down","Static"] },
                    "intent":   { "type": "string" },  // 一句叙事意图
                    "physical": { "type": "string" }   // 起止位移/速度感
                  }
                },
                "cut_to_next":  { "enum": ["硬切","叠化","匹配剪辑","动作匹配","视线匹配",
                                           "J-cut","L-cut","淡入","淡出","黑场","甩切","定格"] },
                "emotion_intensity": { "type": "integer", "minimum": 0, "maximum": 5 },
                "subject_ref":  { "type": "string", "pattern": "^<<[A-Z_]+>>$" } // 只引槽位
              }
            }
          }
        }
      }
    },
    "invariants_locked": {                  // 换主体时必须保留的"骨架不变量"
      "type": "array",
      "items": { "enum": ["cut_rhythm","camera_move_sequence","emotion_curve"] }
    }
  }
}
```

### 4.2 审计插件 `audits/audit_reverse_board.py`（骨架 + 核心逻辑）

四组判据，对应 PRD §7「审计脚本」的 (a)(b)(c)(d)。`target` 约定为一个轻量对象/dict，含 `.id`、`.skeleton`（dict）、`.final_text`（换主体成片全文：镜头卡 + Seedance）。

```python
# audits/audit_reverse_board.py
import json, re
from jsonschema import Draft202012Validator
from harness.audit_report import Report, Finding, Verdict
from harness.run_eval import register
from harness.leak_scan import leak_scan
from harness import lexicon

_SCHEMA = json.load(open("reverse-board/schema/clip_skeleton.schema.json", encoding="utf-8"))
_VALIDATOR = Draft202012Validator(_SCHEMA)

# 参考片专有名词黑名单由 target 携带（B0 的 ground-truth 标注里登记），如片名/角色名/品牌
def _proper_nouns(target) -> list:
    return target.proper_nouns          # e.g. ["拿铁","星巴克","小美"]

def _walk_shots(skel):
    for g in skel.get("shot_groups", []):
        for s in g.get("shots", []):
            yield g, s

@register("reverse_board")
def run(target) -> Report:
    rep = Report(audit="reverse_board", target=target.id)
    skel = target.skeleton

    # (a) D2-FR-03：clip_skeleton schema 校验
    errs = sorted(_VALIDATOR.iter_errors(skel), key=lambda e: e.path)
    for e in errs:
        rep.findings.append(Finding(
            check="D2-FR-03", verdict=Verdict.FAIL,
            detail=f"clip_skeleton schema 违例: {list(e.path)} {e.message}",
            fix="按 reverse-board/schema/clip_skeleton.schema.json 修正字段"))

    # (b) D2-FR-02：Σ镜时长 ≈ 组时长(±1s) 且 组 ∈ [4,15]
    for g in skel.get("shot_groups", []):
        gd = g.get("duration_s", 0)
        ssum = sum(s.get("rel_duration_s", 0) for s in g.get("shots", []))
        if not (4 <= gd <= 15):
            rep.findings.append(Finding("D2-FR-02", Verdict.FAIL,
                f"组 {g.get('group_id')} 时长 {gd}s 越界[4,15]",
                measured=gd, threshold="[4,15]",
                fix="拆/并镜头组使组时长落在 Seedance 生成单元 4–15s"))
        if abs(ssum - gd) > 1.0:
            rep.findings.append(Finding("D2-FR-02", Verdict.FAIL,
                f"组 {g.get('group_id')} Σ镜时长 {ssum}s 偏离组时长 {gd}s 超 ±1s",
                measured=ssum, threshold=f"{gd}±1",
                fix="调整镜内分切使 Σ镜时长≈组时长（复用 output-contract §5 双时长校验）"))

    # (c) D2-FR-03 验收门：骨架零主体专有名词（槽位须 <<...>> 占位）
    nouns = _proper_nouns(target)
    skel_text = json.dumps(skel, ensure_ascii=False)
    for n in nouns:
        if n and re.search(re.escape(n), skel_text):
            rep.findings.append(Finding("D2-FR-03", Verdict.FAIL,
                f"骨架命中参考片专有名词 {n!r}（应为 <<SUBJECT>> 占位）",
                fix=f"把 {n!r} 替换为占位槽位，骨架须与主体解耦"))
    for g, s in _walk_shots(skel):
        if not re.fullmatch(r"<<[A-Z_]+>>", s.get("subject_ref", "")):
            rep.findings.append(Finding("D2-FR-03", Verdict.FAIL,
                f"{s.get('shot_id')} subject_ref 非占位: {s.get('subject_ref')!r}",
                fix="subject_ref 只能引 <<SLOT>> 槽位，不得写具体主体"))

    # (d) DoD#6：换主体成片引擎隐身 grep（复用底座 leak_scan + D2 禁词）
    leak = leak_scan(target.final_text, extra_terms=lexicon.BY_DIRECTION["D2"])
    rep.findings.extend(leak.findings)

    # 残留过程字段二次硬扫（_abs_timecode/source_probe 等不得出现在成片）
    for bad in ("_abs_timecode", "_original_hint", "00:0", "00:1"):
        if bad in target.final_text:
            rep.findings.append(Finding("D2-NFR-01", Verdict.FAIL,
                f"成片残留过程产物: {bad!r}",
                fix="落卡前调 strip_internal_fields，绝对时间码换算为「时长：Xs」"))

    rep.assert_fail_has_fix()
    return rep
```

> 依赖：`jsonschema`（纯 PyPI 库；底座说"只依赖标准库 + 仅像素审计 Pillow/numpy"，本方向额外引入 `jsonschema`——见 §8 风险，提供"内置最小校验器降级"回滚路径以保持底座零额外依赖原则）。

### 4.3 换主体保骨架核心算法（在 `reverse-board/SKILL.md` 描述 + megaprompt 内联，伪代码权威版）

```
def reverse_replicate(ref_video, new_subject):
    probe = capability_probe()                  # FR-01：先 de-risk，定 A/B/C 档
    skel  = decompose(ref_video, probe)         # FR-02：≤15s/组拆解，逐镜测量六维
    skel  = extract_skeleton(skel)              # FR-03：抽 key_element + 占位 <<SUBJECT>>
    assert no_proper_nouns(skel.shots)          # FR-03 验收门（审计 (c) 的人内化版）

    board = fill_subject(skel, new_subject)      # FR-04：占位槽 → 新主体
    board = re_run_emotion_mapping(board)         # 情绪先行：重校 mapping-tables 强制项
                                                  #   情绪冲突时以情绪为准微调骨架并留痕
    for g in board.shot_groups:                   # NFR-01：时间码→时长、剥过程产物
        g.duration_field = f"时长：{g.duration_s}s"   # 落卡，丢弃 _abs_timecode
        strip_internal_fields(g)                  # 删 source_probe/_abs_timecode/占位标注
    assert passes(board, "storyboard/output-contract.md §7")  # FR-04 验收门（下游 9 条自检）
    return board                                  # = 标准 v2.0 镜头卡 + 每组一段 Seedance
```

### 4.4 运镜反推表结构（`reverse-analysis.md` 核心 · 与 `output-contract.md` §2.2 互逆）

每行三列，保证拆解词汇与前向契约**同表可逆**（DoD#5"运镜术语 ∈ output-contract §2.2 十类"）：

| 视觉特征（拆解时看到什么） | → 运镜术语（§2.2 十类之一） | 情绪功能（反查 mapping-tables §2） |
|---|---|---|
| 主体在画框内逐渐变大、背景收窄 | Push In | 聚焦/内心收紧/压迫升级 |
| 主体逐渐变小、环境展开 | Pull Out | 抽离/孤独/收尾余韵 |
| 机位在主体前方后退引导 | Lead | 引导/前进感/目标明确 |
| 机位跟在主体身后 | Follow | 跟随/悬念/未知前路 |
| 主体居中、背景圆周位移 | Orbit | 关系交织/时间凝滞/仪式 |
| 画面抖动、微晃、非平滑 | Handheld | 不安/真实/临场紧张 |
| 平滑穿行、无抖动连续位移 | Steadicam | 沉浸跟随/命运感 |
| 视点整体上升俯瞰 | Crane Up | 释放/宏大/抽离 |
| 视点整体下降逼近 | Crane Down | 聚焦/压低介入 |
| 机位无位移、构图不变 | Static | 客观/凝视/张力蓄积 |

> 切点识别协议（`reverse-analysis.md` 同文件）：A 档由宿主返回切点时间戳 → 映射 `cut_to_next` 12 类；B 档由关键帧序列 + 用户粗时间码人工标；C 档由用户口述节拍。情绪强度反推：每镜主导情绪 → 查 `mapping-tables.md` §1 反查 0–5 级。时间码→时长换算：`duration_s = round(end_tc - start_tc)`，落卡只留 `时长：{duration_s}s`，**丢弃绝对时间码**（NFR-01）。

---

## 5. 任务拆解（Tickets）

| Ticket ID | 描述 | 产物 | 工时(人天) | 前置 |
|---|---|---|---|---|
| **D2-T01** | 宿主多模态能力探针 spike：拿 B0 实测能否读帧/判切点/辨运镜方向，定 A 档可达性 | de-risk 结论（A/B/C 实际可达档）+ 探针逻辑草案 | 2.5 | 底座 Sprint0 已立（`harness/` 单测过） |
| **D2-T02** | 落 `_shared/reverse-analysis.md`：探针三档判定 + 帧采样策略(1fps/帧上限) + 运镜反推表 + 切点识别 + 时间码→时长换算 + 合规反向锚定 + NFR-05 口径统一 | `reverse-analysis.md` | 3.0 | D2-T01 |
| **D2-T03** | 落 `clip_skeleton` 两态契约：`reverse-board/output-contract.md`（人读）+ `schema/clip_skeleton.schema.json`（机器读） | 中间产物契约 + JSON Schema | 1.5 | D2-T02 |
| **D2-T04** | `asset-id-convention.md` 新增「6. 剪辑骨架对象约定」（骨架非 asset，占位解耦，对接 `[Element_*]` 焊点） | 约定节 diff | 0.5 | D2-T03 |
| **D2-T05** | 落 `reverse-board/SKILL.md`：6 步管线 + 换主体保骨架算法 + 三档探针编排 + 引擎隐身落卡规则；frontmatter 可触发 | 成员入口 | 3.0 | D2-T02, D2-T03 |
| **D2-T06** | 造黄金基线 B0：录/取 1 条原创 ≤15s 参考片（≥3 切点/≥2 运镜/1 情绪跃迁）+ 人工 ground-truth 标注（切点/运镜/情绪曲线/专有名词黑名单） | `baselines/cases/reverse_B0/`（标注 + 原片引用） | 2.0 | D2-T03 |
| **D2-T07** | 写审计插件 `audits/audit_reverse_board.py`（四判据 a/b/c/d）+ `@register("reverse_board")` | 审计插件 | 2.0 | D2-T03, D2-T06 |
| **D2-T08** | 往 `lexicon.BY_DIRECTION["D2"]` 注册禁词；接 `leak_scan` extra_terms | `lexicon.py` diff | 0.5 | D2-T07 |
| **D2-T09** | 造 fixtures 一对：`D02_reverse.clean.json`（应 PASS）+ `D02_reverse.poison.json`（投毒见 §6，应 FAIL）；写 `assert_gate_is_real` 测试 | fixtures + 反向测试 | 1.5 | D2-T07 |
| **D2-T10** | 跑 B0 三档（A/B/C）产骨架 + 换主体成片；冻结骨架为黄金基线 `snapshot.freeze`；生成 `examples/fewshot-拉片复刻-demo.md`（脱敏 few-shot 兼人读基线） | 黄金基线 + few-shot | 2.0 | D2-T05, D2-T06, D2-T07 |
| **D2-T11** | 接 `run_eval`：`reverse_B0` 进 `cases/`，跑 5 基线 × 全审计 GO/NO-GO；接合入门 `make verify` 四项绿 | run_eval/CI 绿证据 | 1.0 | D2-T09, D2-T10 |
| **D2-T12** | 负例 NB0（伪装宿主无多模态）+ NB1（参考片含品牌Logo+台词）跑通：NB0 显式落 B/C 不静默假拆；NB1 骨架剥离品牌/台词 | 两负例用例 + 断言 | 1.0 | D2-T05, D2-T07 |
| **D2-T13** | 真机出片：B0 跑 A 档 → 换主体（如咖啡广告→茶饮）→ 出成片卡；**用户亲点** 1 组 Seedance（计费门）；人眼比对节奏/运镜复刻 + 主体真换 | 真机比对结论 | 1.0 | D2-T10 |
| **D2-T14** | 学习闭环：`reverse-learnings.md` 暂存区 + `style-refs.md` 回灌入口节；人审 diff 通道（禁自动写主库） | 暂存区 + 回灌格式 | 1.0 | D2-T05 |
| **D2-T15** | 可移植双态：`_megaprompts/reverse-board.megaprompt.md` 单文件版；C 档喂参考片描述能产合法骨架 + 成片卡（不依赖 Skill） | megaprompt | 1.5 | D2-T05 |
| **D2-T16** | README 挂表 + 目录结构补两份 `_shared` 文件；`portability_scan` 扫 SKILL/reverse-analysis 零命中 | README diff + 可移植扫描绿 | 0.5 | D2-T05, D2-T02 |

> 合计约 26.5 人天 ≈ 5.3 人周（含探针 spike + 真机 + 学习闭环 + 双态）。MVP 主链（T01–T03,T05–T13,T16）≈ 4 人周。

---

## 6. 测试方案

### ① 正例（clean 基线：期望 GO）

- 用 `_shared/scripts/fixtures/D02_reverse.clean.json`：一份**合法** `clip_skeleton`（schema 全过、每组 ∈[4,15] 且 Σ镜≈组±1s、所有 `subject_ref` 为 `<<...>>`、骨架文本零专有名词）+ 一份换主体成片 `final_text`（镜头卡 + 每组一段 Seedance，零过程词）。
- 期望：`audit_reverse_board.run(clean).decision == "GO"`，`exit_code == 0`，无 FAIL Finding。
- 同时 `reverse_B0`（`baselines/cases/reverse_B0/`）进 `run_eval` 5 基线集，整体 GO。

### ② 反向注入（poison fixture：具体投毒 + 期望测回值）

`D02_reverse.poison.json` 从 clean 复制，**同时埋 4 处独立投毒**，每处对应一条 FAIL：

1. **组时长越界（FR-02 b）**：把 `shot_groups[0].duration_s` 从 `12` 改成 `17`（>15）。期望审计报 `D2-FR-02`，`measured=17, threshold="[4,15]"`，FAIL。
2. **双时长破裂（FR-02 b）**：把 `shot_groups[1].shots[0].rel_duration_s` 从 `4` 改成 `9`，使该组 `Σ镜时长` 比 `duration_s` 偏 `+5s`（>±1）。期望报 `D2-FR-02`，`measured=Σ, threshold="{gd}±1"`，FAIL，**测回偏差 ≈ +5s（容差 ±1s）**。
3. **主体泄漏 / 占位破裂（FR-03 c）**：把某 `shots[k].subject_ref` 从 `<<SUBJECT_MAIN>>` 改成具体专有名词 `"拿铁"`（且 `"拿铁"` 在 B0 的 `proper_nouns` 黑名单内）。期望报 **两条** `D2-FR-03`：一条命中专有名词、一条 `subject_ref 非占位`，FAIL。
4. **引擎/过程泄漏（DoD#6 / NFR-01）**：在 `final_text` 里塞一段 `"镜头组1 _abs_timecode: 00:03 拉片探针 mode: A，clip_skeleton 保留 <<SUBJECT_MAIN>>"`。期望 `leak_scan` 命中 `BY_DIRECTION["D2"]` 多词（`_abs_timecode`/`00:0`/`拉片`/`探针`/`mode: A`/`clip_skeleton`/`<<`/`SUBJECT`），逐词 FAIL；二次硬扫再报 `D2-NFR-01` 残留 `_abs_timecode`/`00:0`。

- 期望总判：`audit_reverse_board.run(poison).decision == "NO-GO"`，`exit_code == 1`，FAIL Finding ≥ 5 条。

**回归专项 poison（PRD §7 回归 diff）**：复制 B0 黄金骨架，把 `shot_groups[0].shots[1].camera_move.type` 从 `"Push In"` 改成 `"Pull Out"`（运镜序列篡改），或把 `cut_to_next` 从 `"硬切"` 改成 `"叠化"`（切点序列篡改）。期望 `snapshot.diff_against_golden` 报 `REGRESSION` WARN（产物相对黄金基线漂移），触发人审：**切点序列/运镜序列不得无故漂移**。

### ③ `assert_gate_is_real` 调用示例

```python
# tests/test_reverse_board_gate.py
import json
from harness.reverse_test import assert_gate_is_real
from audits.audit_reverse_board import run as reverse_gate

def _load(p): return json.load(open(p, encoding="utf-8"))

def test_reverse_board_gate_is_real():
    clean  = _wrap(_load("_shared/scripts/fixtures/D02_reverse.clean.json"))
    poison = _wrap(_load("_shared/scripts/fixtures/D02_reverse.poison.json"))
    assert_gate_is_real(reverse_gate, clean, poison, name="D2-reverse_board")
    #  ↑ 内部断言：clean.exit_code==0（不误杀）且 poison.exit_code==1（投毒必被抓）
```

> `_wrap` 把 fixture dict 套成 target 对象（`.id/.skeleton/.final_text/.proper_nouns`）。

### ④ 回归：冻结哪份黄金基线，改什么后重跑

- 冻结：`snapshot.freeze(B0_skeleton, "_shared/baselines/cases/reverse_B0/skeleton.golden.json")`（归一化排序后字节级）。
- 触发重跑：任何动 `_shared/reverse-analysis.md`（改运镜反推表/切点识别/采样策略）或 `audit_reverse_board.py` 的 PR。
- 重跑动作：用新 `reverse-analysis.md` 重拆 B0 → `diff_against_golden(new_skeleton, golden)`。
  - 若 diff 为**有意改进**（如新增一类运镜识别使切点更准）→ 人审后 `re-freeze` 基线，留 PR 记录。
  - 若 diff 是**无故漂移**（切点序列/运镜序列变了但没改进理由）→ 回滚（WARN→人审定性，参 §2.4 fix 文案）。
- 合入门：`make verify` 四项（`run_eval` / `reverse_test --all` / `leak_scan_all` / `portability_all`）全绿才允许合入（SUBSTRATE §5）。

### ⑤ 真机层（付费按钮由用户点）

- B0 跑 A 档全自动拆解 → 抽骨架 → 换主体（"原片是咖啡广告，换成茶饮"）→ 出成片卡。
- 由**用户亲点**生成 1 组 Seedance（计费门，遵 CLAUDE.md「付费按钮用户亲点」，我只产卡不点）。
- 人眼比对两条硬指标（DoD#3/#5 的真机佐证）：**剪辑节奏/运镜曲线是否复刻**（逐镜切镜方式一致率 ≥90%、运镜术语逐镜可逆）+ **主体是否真换**（成片里 grep 不到原片专有名词，茶饮主体已落实）。
- 软指标（非阻塞）：A-B 双盲人评"D2 换主体产物 vs 纯前向 storyboard 产物"哪个更像参考片节奏感，胜出率佐证价值。

---

## 7. 里程碑与退出门

| 里程碑 | 产物 | 退出门（脚本必绿 / DoD 必过） |
|---|---|---|
| **M0 · de-risk**（T01） | 宿主多模态探针 spike 结论：A 档实际可达性 | de-risk 结论书面给出"A 档可达 / 须落 B/C"；不写"假设宿主能读视频"的空头开发（SUBSTRATE 完善③） |
| **M1 · 拆解知识 + 契约**（T02–T04） | `reverse-analysis.md` + `clip_skeleton.schema.json` + `output-contract.md` + asset-id 约定节 | `clip_skeleton.schema.json` 可被 `jsonschema` 加载校验；`portability_scan` 扫 `reverse-analysis.md` 零命中（DoD 可移植性） |
| **M2 · 成员落地 + 闸**（T05,T07,T08） | `reverse-board/SKILL.md` 6 步管线 + `audit_reverse_board.py` + 禁词注册 | 审计插件 `@register` 进 `run_eval`；`assert_fail_has_fix()` 不抛 |
| **M3 · 反例 + 基线 + 回归**（T06,T09,T10,T11） | fixtures 一对 + B0 黄金基线 + few-shot + run_eval 接入 | **`assert_gate_is_real` 双过**（clean GO / poison NO-GO）；`run_eval` 打印 GO；`make verify` 四项绿（DoD#3/#4/#6/#7） |
| **M4 · 负例 + 真机**（T12,T13） | NB0/NB1 用例 + 真机比对结论 | NB0 显式落 B/C **不静默假拆**（DoD#2）；NB1 骨架剥离品牌/台词；真机切镜一致率 ≥90% 且成片零原片专有名词（DoD#5） |
| **M5 · 闭环 + 双态**（T14,T15,T16） | `reverse-learnings.md` + megaprompt + README 挂表 | 学习闭环走人审 diff（禁自动写主库，DoD#8）；megaprompt C 档独立可跑（DoD#9） |

**MVP 切线**：M0+M1+M2+M3+M4 = "参考视频→换主体→成片"主链（FR-01~04 + 核心 NFR + 两条铁律闸 + 真机佐证）。**M5（学习闭环 FR-05 + mega-prompt 双态 NFR-02）可作第二批**——它们不阻塞主链 GO/NO-GO，PRD §10 已明示可后置。

---

## 8. 风险与回滚

| 风险 | 影响 | 回滚 / 降级路径 |
|---|---|---|
| **宿主多模态能力弱/不稳**（核心风险，PRD 自评 3/5 的根因） | A 档名存实亡，复刻精度差 | M0 探针 spike 先 de-risk；不可用 → 当场落 B 档（关键帧+用户粗时间码）/ C 档（口述兜底），三档都产 schema 合法骨架。**降级是设计内既定路径，非失败**（FR-01 显式告知档位） |
| **绝对时间码/过程产物漏进成片**（引擎隐身破口） | 破铁律①，成片出现 `00:0`/`<<SUBJECT>>`/`clip_skeleton` | schema 用 `_` 前缀标禁出字段 + `strip_internal_fields` 落卡剥离 + `leak_scan` `BY_DIRECTION["D2"]` 硬门 + 审计 (d) 二次硬扫；任一命中 `make verify` 红、阻断合入 |
| **题材/品牌/台词搬运**（版权+原创破口） | 侵权、与 `tacit-core` 题材原创检冲突 | FR-03 占位解耦 + 负例 NB1 + 审计 (c) 专有名词黑名单正则；骨架命中即 FAIL |
| **换主体后情绪曲线与原骨架打架** | 守骨架却破"情绪先行" | 算法 `re_run_emotion_mapping` 重跑 `mapping-tables` 强制项，**以情绪为准微调骨架并留痕**；一致率 ≥90% 已为冲突留合法偏差（DoD#5） |
| **学习闭环污染主库** | 自动回灌把噪声写进 `style-refs` | FR-05 强制 `reverse-learnings.md` 暂存 + 人审 diff，**禁自动写主库**（DoD#8） |
| **`jsonschema` 引入破"底座零额外依赖"原则** | 偏离 SUBSTRATE §1（标准库 + 仅像素 Pillow/numpy） | 回滚：审计 (a) 改用**内置最小校验器**（纯标准库手写：遍历 required/enum/pattern/range，覆盖本 schema 子集），去掉 `jsonschema` 依赖；schema.json 仍作人读契约保留 |
| **逐帧分析爆 token/成本** | 长片拆解昂贵 | NFR-03 默认 1fps 采样 + 帧数上限；超长片要求用户先切到 ≤15s 段；B/C 档零额外模型调用 |
| **底座 harness 尚未落地**（D2 依赖 `harness/` 已存在） | 插件无处可挂 | D2 前置 = SUBSTRATE §6 步行骨架（Sprint0）已立（`audit_report`/`leak_scan`/`lexicon`/`run_eval`/`snapshot`/`reverse_test` 单测过）；若未立，D2 阻塞在 T01 前，不并行抢跑 |

---

*本方案以"插件 + 一对 fixture + 黄金基线 + 知识/契约 md"的形态接入共享底座，零重造机制：报告/leak_scan/snapshot/reverse_test/run_eval/registry 全部复用 `00-ENGINEERING-SUBSTRATE.md` 定义的构件。测试方案的 `assert_gate_is_real`/`run_eval`/`snapshot` 调用与全套件口径一致。*
