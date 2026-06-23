# D1 · 大脑↔宿主 执行编排契约 开发方案

> 编号 D1 ｜ 优先级 P1 ｜ 状态 Dev v0.1 ｜ 前置:本方向PRD([D01-execution-contract.md](../D01-execution-contract.md)) + [00-ENGINEERING-SUBSTRATE.md](./00-ENGINEERING-SUBSTRATE.md)

---

## 1. 目标与范围

把 PRD 的 7 条 FR（三类节点 schema / 执行 DAG / 暂停门 / 失败策略 / 模型与审计阈值 / 引擎隐身物理隔离 / 时间线锚）落成**可机验的工程产物**：一份 `execution-contract.md`（schema 单一权威）+ 配套 `execution-contract.schema.json` + 翡翠楼基线契约实例 + 接到共享底座上的**审计插件** `audit_execution.py`。

本方向作为 **底座插件（Skin·宿主适配层）** 的边界，遵 `00-ENGINEERING-SUBSTRATE.md §3` 的"接上底座 5 件套"：
- **我只写业务判据**（契约结构合不合法、DAG 是否成环、final_prompt 是否泄漏执行词、shot 粒度是否退化），**不重造机制**——`Report`/`Verdict`/`GO-NO-GO`/退出码/`leak_scan`/`snapshot`/`reverse_test`/`run_eval`/`register` 全部 import 自 `_shared/scripts/harness/`。
- **不写编排"手"**（N1）：media_generator/video_assembler/调度器留宿主，契约是纯数据。
- **不改 `output-contract.md` v2.0 字段**（NFR-06）：本方向是它的下游消费者。
- **真机消费（M4）由用户在 ViMax 亲点付费按钮**，本 agent 只交付契约接口 + 离线门。

> tracer-bullet 纪律（底座完善⑦）：先只为翡翠楼基线 emit 契约，打通"1 个 shot + 1 个暂停门真停下"，再补满 7 FR。

---

## 2. 交付物清单

> 路径均相对仓库根 `skills/director-suite/`。类型遵底座约定。

| 路径 | 类型 | 说明 |
|---|---|---|
| `production-bible/execution-contract.md` | 契约md | **核心产物**:schema spec + 字段表 + 镜头卡→契约映射算法 + 自检规则。PRD §5① 要求的新文件,挂 Skin·宿主适配层,与 `seedance-2.0.md` 并列。 |
| `production-bible/execution-contract.schema.json` | 契约md(JSON Schema) | FR-01 的 `ajv`/`jsonschema` 校验对象。Draft-07,带 `contract_version`,定义 5 个顶层数组 + 各节点字段约束 + 枚举。 |
| `production-bible/examples/翡翠楼-execution-contract.json` | baselines | 用 `production-bible/examples/翡翠楼-全案demo.md` 跑出的契约实例(21 key_element / 3 shot / N audio_layer / 5 gate / DAG)。**回归黄金基线**。 |
| `_shared/baselines/jadepavilion/execution-contract.golden.json` | baselines | `snapshot.freeze()` 归一化冻结副本,供 `snapshot.diff_against_golden` 字节级回归。 |
| `_shared/scripts/audits/audit_execution.py` | audits插件py | `@register("execution")` + `run(target)->Report`。实现 DoD#2-9 的全部结构断言。**本方向唯一新增脚本。** |
| `_shared/scripts/fixtures/D1_execution.clean.json` | fixtures | 正例(= 基线实例的精简单组切片),`assert_gate_is_real` 期望 PASS/exit0。 |
| `_shared/scripts/fixtures/D1_execution.poison.json` | fixtures | 反例(投毒,见 §6),期望 FAIL/exit1。 |
| `_shared/scripts/lexicon.py`(改) | registry项 | 往 `BY_DIRECTION` 加 `"D1"` 键:执行/过程禁词(喂 leak_scan)。**追加,不重写底座。** |
| `storyboard/SKILL.md`(改·追加) | 样例md | 6 步管线后追加 **Step 7「导出执行契约(可选·宿主驱动时启用)」**,路由到 `execution-contract.md`,声明产物≠成片。 |
| `production-bible/SKILL.md`(改·追加) | 样例md | 全案产出尾部加"可选导出 execution-contract"段,指向新文件。 |
| `README.md`(改·追加) | 样例md | 三层架构表 Skin 行(第 15 行)增加 `production-bible/execution-contract.md`(宿主适配层),与 `seedance-2.0.md`(模型适配层)并列。 |
| `_shared/continuity-quality.md`(改·追加指针) | 知识md | §7 失败协议 / §8 暂停门 各加一行"→ 结构化字段见 `production-bible/execution-contract.md`"双向锚。 |

> **不改动**(NFR-06 + PRD §5 不改清单):`output-contract.md`、`tacit-core.md`、`mapping-tables.md`、`dimensions.md`、`pro-params.md`、`style-refs.md`、`asset-id-convention.md`、`seedance-2.0.md`。

---

## 3. 与共享底座的接线

### ① 复用 harness 哪些构件

| 底座构件 | 本方向怎么用 |
|---|---|
| `audit_report.py`(`Report`/`Finding`/`Verdict`/`decision`/`exit_code`/`assert_fail_has_fix`) | `audit_execution.run()` 全程产 `Report`,每条断言 append 一个 `Finding(check="D1-FR-0X",...)`;FAIL 必带 `fix`(由 `assert_fail_has_fix()` 强制)。**零自造报告结构。** |
| `leak_scan.py` + `lexicon.py` | FR-06 引擎隐身门**直接复用** `leak_scan(final_text, extra_terms=lexicon.BY_DIRECTION["D1"])`;扫描对象 = 契约里**所有** `shots[].final_prompt` 拼接串。命中即 NO-GO。不另写泄漏扫描。 |
| `snapshot.py`(`freeze`/`diff_against_golden`) | 把基线契约实例 `freeze` 成 `execution-contract.golden.json`;任何改 schema/映射的 PR 重 emit 后 `diff_against_golden` → 漂移则人审 re-freeze 或回滚(回归 L2)。 |
| `reverse_test.py`(`assert_gate_is_real`) | M2 验收:`assert_gate_is_real(audit_execution.run, clean, poison, name="D1")`,证明 audit 对干净契约放行、对投毒契约报红(非橡皮图章)。 |
| `run_eval.py`(`register`/`run_eval`) | `audit_execution` 加 `@register("execution")`,自动进 `run_eval` 的 5 基线 × 全审计 GO/NO-GO,纳入 Makefile `verify` 合入门。 |
| `registry.py` + `model_registry.json`(D3) | **是,引用**(见③)。 |
| `portability_scan.py` | DoD#9(契约 0 处宿主 API)**复用底座** `portability_scan` 扫契约 JSON 文本;不自写正则。 |

### ② 往 `lexicon.BY_DIRECTION` 加哪些禁词（喂 leak_scan）

`final_prompt` 是唯一进视频模型的叶子串,**绝不可含执行/过程词**。本方向往 `lexicon.py` 追加:

```python
BY_DIRECTION["D1"] = [
    # 执行编排过程词(FR-06 词表)
    "pause_gate", "gate_id", "mandatory", "dependency", "dependencies",
    "DAG", "拓扑", "topo", "retry", "retry_within_tool",
    "degrade", "degrade_chain", "escalate", "stop_and_ask",
    "failure_policy", "consistency_audit", "silhouette_tol", "hue_tol",
    "asset_ready", "start_frame_from", "reference_video_from",
    "contract_version", "final_video_spec", "est_duration",
    # 与底座 EXEC_TERMS 已含的(DAG/retry/degrade/node_id)互补,不重复
]
```

> 注:底座 `EXEC_TERMS` 已含 `pause_gate/DAG/retry/degrade/node_id`;`PROCESS_TERMS` 已含 `自检/审计/Σ`。本方向只补 D1 特有的契约字段名(`gate_id/escalate/consistency_audit/...`),避免重复。`leak_scan` 内部去重由 `re.escape` + 集合天然处理。

### ③ 是否引用 model_registry

**是,引用,不硬编码模型名。** 两处:
- `final_video_spec.video_model` 的合法枚举 = `registry.reg()["video"]["adapters"]` 的 keys;
- key_element/shot 的 `failure_policy.degrade_chain` **同族校验** = 查 `registry.reg()["video"]["fallback"]`(视频族)与 `image.tier`(图像族),判定降级链成员是否同族。

`audit_execution.py` 顶部 `from harness import registry`,所有"这模型属哪族""默认模型是谁"一律走 `registry.reg()`,满足底座完善⑤(模型注册表前移)。若 D3 的 `model_registry.json` 尚未落地,降级为内置最小 `FALLBACK_FAMILIES` 常量并标 `# TODO: D3 registry`(见 §8 降级路径)。

### ④ 新增 `audits/audit_execution.py` 的 register 名

```python
@register("execution")
def run(target) -> Report: ...
```

register 名 = `"execution"`(与 D5 `"consistency"`、D9 `"storyboard"` 并列),自动进 `AUDIT_REGISTRY`,被 `run_eval` 横切每个基线 case。

---

## 4. 实现分解

### 4.1 `execution-contract.schema.json`（JSON Schema · Draft-07）

顶层 5 数组 + `final_video_spec`,核心字段约束如下(照此可直接落地):

```jsonc
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["contract_version", "final_video_spec",
               "key_elements", "shots", "audio_layers",
               "pause_gates", "dependencies"],
  "additionalProperties": false,
  "properties": {
    "contract_version": { "const": "1.0" },

    "final_video_spec": {
      "type": "object",
      "required": ["title","aspect_ratio","fps","resolution_target","video_model","style_core"],
      "properties": {
        "title":            { "type": "string", "minLength": 1 },
        "aspect_ratio":     { "enum": ["16:9","9:16"] },
        "fps":              { "enum": [24,30] },
        "resolution_target":{ "enum": ["720p","1080p","2K","4K"] },
        "video_model":      { "type": "string" },      // ajv 不校族;由 audit 查 registry
        "style_core":       { "type": "string", "minLength": 1 }
      }
    },

    "key_elements": {
      "type": "array", "minItems": 1,
      "items": {
        "type": "object",
        "required": ["asset_id","type","category","consistency_level",
                     "consistency_audit","failure_policy"],
        "properties": {
          "asset_id":         { "type": "string", "pattern": "^\\[(Element|Prop|Voice)_[A-Za-z0-9_]+\\]$" },
          "type":             { "enum": ["character","scene","prop","voice"] },
          "category":         { "enum": ["normal","faceswap","digital_human","pov"] },
          "consistency_level":{ "enum": ["L1","L2"] },
          "looks":            { "type": "array", "items": {
                                  "type":"object",
                                  "required":["look_id","desc"],
                                  "properties":{"look_id":{"type":"string"},"desc":{"type":"string"}} } },
          "ref_images":       { "type": "array", "items": { "type": "string" } },
          "model":            { "type": ["string","null"] },     // FR-05 声明位,可空
          "consistency_audit":{
            "type": "object",
            "properties": {
              "silhouette_tol":   { "type": ["number","null"] },
              "hue_tol":          { "type": ["number","null"] },
              "logo_delta":       { "type": ["number","null"] },
              "white_bg_rgb_min": { "type": ["number","null"] }
            }
          },
          "failure_policy": { "$ref": "#/$defs/failure_policy" }
        }
      }
    },

    "shots": {
      "type": "array", "minItems": 1,
      "items": {
        "type": "object",
        "required": ["shot_id","scene","refs","timeline","cut_to_next",
                     "audio_layers","failure_policy","final_prompt"],
        "properties": {
          "shot_id":  { "type": "string", "pattern": "^G\\d+$" },
          "scene":    { "type": "string" },
          "refs":     { "type": "array", "items": {
                          "type":"string",
                          "pattern":"^\\[(Element|Prop)_[A-Za-z0-9_]+\\](@s\\d+)?$" } },
          "continuity_lock": { "type": "object" },
          "frame_link": {
            "type": "object",
            "properties": {
              "start_frame_from":     { "type": ["string","null"] },
              "reference_video_from": { "type": ["string","null"] }
            }
          },
          "timeline": {
            "type": "object",
            "required": ["order","est_duration"],
            "properties": {
              "order":        { "type": "integer", "minimum": 1 },
              "est_duration": { "type": "array", "minItems": 2, "maxItems": 2,
                                "items": { "type": "number", "minimum": 4, "maximum": 15 } }
            }
          },
          "cut_to_next": { "enum": ["硬切","直切","叠化","匹配剪辑","动作匹配",
                                    "视线匹配","J-cut","L-cut","淡入","淡出",
                                    "黑场","甩切","定格"] },   // output-contract.md §4.6
          "audio_layers":  { "type": "array", "items": { "type": "string" } },
          "failure_policy":{ "$ref": "#/$defs/failure_policy" },
          "final_prompt":  { "type": "string", "minLength": 1 }  // FR-06 唯一进模型的叶子串
        }
      }
    },

    "audio_layers": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["layer_id","kind","mix_db"],
        "properties": {
          "layer_id": { "type": "string" },
          "shot_id":  { "type": ["string","null"] },     // bgm 可跨 shot → null
          "kind":     { "enum": ["dialog","sfx","bgm"] },
          "voice_ref":{ "type": ["string","null"], "pattern": "^\\[Voice_[A-Za-z0-9_]+\\]$|^$" },
          "model":    { "type": ["string","null"] },
          "mix_db":   { "type": "number" }               // 人声 0,bgm 约 -10(低 8-12dB)
        }
      }
    },

    "pause_gates": {
      "type": "array", "minItems": 5,
      "items": {
        "type": "object",
        "required": ["gate_id","after","trigger","release","mandatory"],
        "properties": {
          "gate_id":   { "enum": ["intent_spec","storyboard_review",
                                  "element_render","keyframe_confirm","final_cut"] },
          "after":     { "type": "string" },
          "trigger":   { "type": "string" },
          "release":   { "enum": ["user_confirm_spec","user_approve_board",
                                  "user_confirm_likeness","user_approve_keyframe",
                                  "user_approve_cut"] },         // 机读枚举,非自由文本
          "mandatory": { "type": ["boolean","string"], "enum": [true,false,"auto"] }
        }
      }
    },

    "dependencies": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["from","to","kind"],
        "properties": {
          "from": { "type": "string" },
          "to":   { "type": "string" },
          "kind": { "enum": ["asset_ready","start_frame","reference_video",
                             "clip_ready","timeline_ready"] }
        }
      }
    }
  },

  "$defs": {
    "failure_policy": {
      "type": "object",
      "required": ["retry_within_tool","degrade_chain","escalate"],
      "properties": {
        "retry_within_tool": { "type": "integer", "minimum": 0, "maximum": 5 },
        "degrade_chain":     { "type": "array", "items": { "type": "string" } },
        "escalate":          { "enum": ["stop_and_ask","fallback_chain"] }
      }
    }
  }
}
```

> schema 只管"结构与枚举"。**跨字段语义**(category 命中→mandatory 必 true、degrade_chain 必同族、final_prompt 0 执行词、shot 数==组数)ajv 表达不了,全部下沉到 `audit_execution.py`(§4.3)。

### 4.2 映射算法（写进 `execution-contract.md` · 镜头卡 → 契约）

```
INPUT : production-bible 四表(角色/场景/道具/分镜) + 各组 Seedance prompt
OUTPUT: execution-contract.json

map_contract(four_tables, storyboard):
  0. 前置门:跑 asset-id-convention.md §5 引用闭合回检;不闭合 → 拒绝出契约(§8 风险)
  1. key_elements:
     for asset_id in dedup(扫四表所有 [Element_*]/[Prop_*]/[Voice_*]):
        type = {Element_→character|scene, Prop_→prop, Voice_→voice}[前缀+上下文字段]
        category = 表里"换脸/数字人/POV"标记 → {faceswap,digital_human,pov} else "normal"
        consistency_level = 表里 L1/L2(默认 L1,asset-id-convention §2 铁律:无标即 L1)
        looks = 该 asset 的多 Look 枚举([X]/[X_Suit]/[X_Wounded])
        consistency_audit = type 决定模板:
            character/scene → {silhouette_tol:0.05, hue_tol:15, logo_delta:null, white_bg_rgb_min:null}
            prop(LOGO/白底) → {..., logo_delta:0.05, white_bg_rgb_min:245}
        failure_policy = default_fp(type, category)   # 见下
  2. shots(NFR-05 组级,非镜级!):
     for grp in storyboard.镜头组:                     # 翡翠楼基线 = 3 组
        shot_id = "G"+grp.index
        refs[] = grp.连续性锁定里引用的全部 [Element_*]/[Prop_*](@sN 保留)
        continuity_lock = {main_light_dir, color_temp_K, carry_over}(上提自组头)
        frame_link = {start_frame_from: 上组.final_shot if 强连续 else null,
                      reference_video_from: null}      # 门槛原则:默认 null(continuity §4)
        timeline = {order: grp.index, est_duration: [组时长下界, 上界]}  # 区间,∈[4,15]
        cut_to_next = grp 末镜.切镜方式                  # output-contract §4.6 枚举
        final_prompt = grp 已生成的 Seedance prompt     # 直接搬,它已过 §7 引擎隐身自检
        failure_policy = default_fp("shot", null)
  3. audio_layers:
     for grp, for 每条 台词/音效/BGM:
        dialog → {kind:dialog, voice_ref:[Voice_*], model: registry.voice(lang), mix_db:0}
        sfx    → {kind:sfx, shot_id, mix_db: 由 dBFS 估}
        bgm    → {kind:bgm, shot_id:null, model: registry.music_default(), mix_db:-10}
  4. dependencies(DAG 边):
     for shot, for ke in shot.refs:  edge(ke → shot, "asset_ready")
     for 强连续相邻组 (a→b): edge(a → b, "start_frame")  # frame_link 非空才连
     for shot:                edge(shot → "assemble", "clip_ready")
     edge("assemble" → "export", "timeline_ready")
  5. pause_gates: 落 5 个固定门(见 §4.4);
     若 ∃ key_element.category ∈ {faceswap,digital_human,pov}:
        element_render 门 mandatory = true
     else: element_render 门 mandatory = "auto"(运行期由 similarity<0.9 触发)
  6. 自检(内部跑,绝不写进任何 final_prompt/成片):
     调 audit_execution.run(contract) 必须 GO,否则不 emit
```

`default_fp` 关键逻辑(FR-04 同族铁律):

```python
def default_fp(node_kind, category):
    if node_kind == "shot":
        fam = registry.reg()["video"]                 # seedance 族
        chain = [fam["default"]] + [f["to"] for f in fam["fallback"]]   # 2.0 → 2.0-fast
        esc = "stop_and_ask"
    else:  # key_element
        fam = registry.reg()["image"]
        chain = [fam["default"], fam["tier"]["draft"]]  # nano-banana-pro → nano-banana-2
        esc = "stop_and_ask" if category in {"faceswap","digital_human"} else "fallback_chain"
    return {"retry_within_tool": 1 if node_kind=="shot" else 2,
            "degrade_chain": chain, "escalate": esc}
```

### 4.3 `audit_execution.py`（审计插件 · 业务判据全在这）

函数签名 + 核心断言逻辑(照此落地;每条断言 = 一个 `Finding(check="D1-FR-0X")`):

```python
# _shared/scripts/audits/audit_execution.py
import re, json
from collections import defaultdict, deque
from harness.audit_report import Report, Finding, Verdict
from harness.run_eval import register
from harness.leak_scan import leak_scan
from harness import lexicon, registry

EXEC_WORDS = lexicon.EXEC_TERMS + lexicon.PROCESS_TERMS + lexicon.BY_DIRECTION["D1"]
ABS_TIMECODE = re.compile(r"\d+:\d{2}|\d+\s*[–-]\s*\d+\s*s\b")  # 绝对时码/壁钟轴
HOST_API     = re.compile(r"vimax\.|render\(|\.exe\b|grsai\.|localhost:8777")

def _is_dag(deps):                       # Kahn 拓扑,有环→False
    g = defaultdict(list); indeg = defaultdict(int); nodes = set()
    for e in deps:
        g[e["from"]].append(e["to"]); indeg[e["to"]] += 1
        nodes |= {e["from"], e["to"]}
    q = deque(n for n in nodes if indeg[n] == 0); seen = 0
    while q:
        n = q.popleft(); seen += 1
        for m in g[n]:
            indeg[m] -= 1
            if indeg[m] == 0: q.append(m)
    return seen == len(nodes)

def _same_family(chain):                 # FR-04:降级链成员同族
    v = registry.reg()["video"]; img = registry.reg()["image"]
    vfam = {v["default"]} | {f["to"] for f in v["fallback"]}
    ifam = {img["default"], img["tier"]["material"], img["tier"]["draft"]}
    s = set(chain)
    return s <= vfam or s <= ifam        # 全在视频族 或 全在图像族

@register("execution")
def run(target) -> Report:
    c = target.contract if hasattr(target, "contract") else json.loads(target.read_text())
    rep = Report(audit="execution", target=getattr(target, "id", "<contract>"))
    F = rep.findings.append

    kes   = c["key_elements"]; shots = c["shots"]
    deps  = c["dependencies"]; gates = {g["gate_id"]: g for g in c["pause_gates"]}

    # ── FR-01 / NFR-05  节点数对账 ───────────────────────────────
    asset_ids = {k["asset_id"] for k in kes}
    if len(asset_ids) != len(kes):
        F(Finding("D1-FR-01", Verdict.FAIL, "key_element asset_id 重复",
                  measured=len(kes), threshold=len(asset_ids),
                  fix="去重:每个 asset_id 恰一个 key_element 节点"))
    n_groups = target.n_shot_groups          # 基线 manifest 提供期望组数(翡翠楼=3)
    if len(shots) != n_groups:
        F(Finding("D1-FR-01", Verdict.FAIL,
                  f"shot 数 {len(shots)} != 镜头组数 {n_groups}(疑镜级退化)",
                  measured=len(shots), threshold=n_groups,
                  fix="shot 必须组级(生成单元),禁把组内分切各拆一个 shot"))

    # ── FR-02  DAG 合法 + 入边闭合 ───────────────────────────────
    if not _is_dag(deps):
        F(Finding("D1-FR-02", Verdict.FAIL, "dependencies 存在环",
                  fix="移除回边,执行图必须有向无环"))
    in_edges = defaultdict(set)
    for e in deps: in_edges[e["to"]].add(e["from"])
    for s in shots:
        need = {r.split("@")[0] for r in s["refs"]}          # 去状态后缀
        miss = need - in_edges[s["shot_id"]]
        if miss:
            F(Finding("D1-FR-02", Verdict.FAIL,
                      f"{s['shot_id']} 缺 asset_ready 入边: {miss}",
                      fix="为 shot 引用的每个 key_element 补 asset_ready 依赖边"))
    if in_edges["assemble"] != {s["shot_id"] for s in shots}:
        F(Finding("D1-FR-02", Verdict.FAIL, "assemble 入边 != 全 shot",
                  fix="assemble 必须依赖全部 shot"))
    if in_edges["export"] != {"assemble"}:
        F(Finding("D1-FR-02", Verdict.FAIL, "export 入边 != {assemble}",
                  fix="export 必须且只依赖 assemble"))

    # ── FR-03  暂停门齐全 + 强制门 ───────────────────────────────
    for gid in ("intent_spec","storyboard_review","element_render",
                "keyframe_confirm","final_cut"):
        if gid not in gates:
            F(Finding("D1-FR-03", Verdict.FAIL, f"缺暂停门 {gid}",
                      fix=f"补 pause_gate {gid}"))
    sensitive = any(k["category"] in ("faceswap","digital_human","pov") for k in kes)
    er = gates.get("element_render", {})
    if sensitive and er.get("mandatory") is not True:
        F(Finding("D1-FR-03", Verdict.FAIL,
                  "存在 faceswap/digital_human/pov,element_render 门未强制",
                  measured=er.get("mandatory"), threshold=True,
                  fix="敏感类出图门 mandatory 置 true,宿主不可跳过"))

    # ── FR-04  失败策略 同族 + 敏感强制 stop_and_ask ─────────────
    for node in kes + shots:
        fp = node.get("failure_policy")
        if not fp:
            F(Finding("D1-FR-04", Verdict.FAIL, f"{node.get('asset_id',node.get('shot_id'))} 缺 failure_policy",
                      fix="补 failure_policy")); continue
        if not _same_family(fp["degrade_chain"]):
            F(Finding("D1-FR-04", Verdict.FAIL,
                      f"degrade_chain 跨族: {fp['degrade_chain']}",
                      fix="降级链只允许同模型族;跨族改 escalate:stop_and_ask"))
    for k in kes:
        if k["category"] in ("faceswap","digital_human") and \
           k["failure_policy"]["escalate"] != "stop_and_ask":
            F(Finding("D1-FR-04", Verdict.FAIL,
                      f"{k['asset_id']} 敏感类 escalate 非 stop_and_ask",
                      measured=k["failure_policy"]["escalate"], threshold="stop_and_ask",
                      fix="faceswap/digital_human 必须 stop_and_ask"))

    # ── FR-05  审计阈值数值化 ───────────────────────────────────
    for k in kes:
        ca = k.get("consistency_audit", {})
        if k["type"] in ("character","scene"):
            for key in ("silhouette_tol","hue_tol"):
                if not isinstance(ca.get(key), (int,float)):
                    F(Finding("D1-FR-05", Verdict.FAIL,
                              f"{k['asset_id']} {key} 非数值",
                              fix=f"{key} 必须是 number(角色/场景类必填)"))

    # ── FR-06  引擎隐身:final_prompt 0 执行词(复用底座 leak_scan)─
    joined = "\n".join(s["final_prompt"] for s in shots)
    leak = leak_scan(joined, extra_terms=lexicon.BY_DIRECTION["D1"])
    for f in leak.findings:                          # 把底座的命中并入本报告
        F(Finding("D1-FR-06", Verdict.FAIL, f.detail, fix=f.fix))

    # ── FR-07  时长制:0 绝对时码 + order 连续 + est∈[4,15] ────────
    full_text = json.dumps(c, ensure_ascii=False)
    if ABS_TIMECODE.search(full_text):
        F(Finding("D1-FR-07", Verdict.FAIL,
                  f"契约含绝对时码: {ABS_TIMECODE.search(full_text).group()!r}",
                  fix="删绝对时码,改时长制(est_duration 区间)"))
    orders = sorted(s["timeline"]["order"] for s in shots)
    if orders != list(range(1, len(shots)+1)):
        F(Finding("D1-FR-07", Verdict.FAIL, f"timeline.order 跳号: {orders}",
                  fix="order 必须连续整数 1..N"))
    for s in shots:
        lo, hi = s["timeline"]["est_duration"]
        if not (4 <= lo <= hi <= 15):
            F(Finding("D1-FR-07", Verdict.FAIL,
                      f"{s['shot_id']} est_duration {[lo,hi]} 越界[4,15]",
                      fix="est_duration 落在生成单元 [4,15]s"))

    # ── NFR-02  可移植性:0 宿主 API ─────────────────────────────
    if HOST_API.search(full_text):
        F(Finding("D1-NFR-02", Verdict.FAIL,
                  f"契约含宿主 API: {HOST_API.search(full_text).group()!r}",
                  fix="移除宿主调用,契约须纯数据"))

    rep.assert_fail_has_fix()
    return rep
```

> `target` 适配:基线 case 对象需带 `.contract`(dict)、`.id`、`.n_shot_groups`(期望组数,来自 baseline manifest)。底座 `run_eval.load_cases` 装载时填这三个属性;脚本对裸 `Path` 也兜底(`json.loads(target.read_text())`)。

### 4.4 五个 `pause_gate` 固定结构（FR-03）

```jsonc
[
 {"gate_id":"intent_spec",      "after":"contract_load",       "trigger":"always",
  "release":"user_confirm_spec",     "mandatory":true},
 {"gate_id":"storyboard_review","after":"shots_drafted",       "trigger":"always",
  "release":"user_approve_board",    "mandatory":true},
 {"gate_id":"element_render",   "after":"key_elements.render",  "trigger":"category in {faceswap,digital_human,pov} OR similarity<0.9",
  "release":"user_confirm_likeness", "mandatory":"auto"},   // 命中敏感类→映射时翻 true
 {"gate_id":"keyframe_confirm", "after":"keyframes.render",     "trigger":"always",
  "release":"user_approve_keyframe", "mandatory":false},
 {"gate_id":"final_cut",        "after":"assemble",             "trigger":"always",
  "release":"user_approve_cut",      "mandatory":true}
]
```

---

## 5. 任务拆解（Tickets）

| Ticket | 描述 | 产物 | 工时(人天) | 前置 |
|---|---|---|---|---|
| **D1-T01** | 写 `execution-contract.schema.json`(Draft-07,§4.1 全字段+枚举+$defs);`ajv compile` 通过 | schema 文件 | 1.0 | 底座 §2 已落地(audit_report/leak_scan/lexicon) |
| **D1-T02** | 写 `execution-contract.md` spec(顶层结构表+字段表+§4.2 映射算法+自检规则+引擎隐身红线) | 契约md | 1.5 | T01 |
| **D1-T03** | 按映射算法手工/半自动从 `翡翠楼-全案demo.md` emit `翡翠楼-execution-contract.json`(21 ke / 3 shot / N audio / 5 gate / DAG);`ajv validate` 0 error | 基线实例 | 1.5 | T01,T02 |
| **D1-T04** | 往 `lexicon.py` 加 `BY_DIRECTION["D1"]` 禁词(§3②);单测确认 leak_scan 拾取 | lexicon diff | 0.3 | 底座 lexicon.py |
| **D1-T05** | 写 `audit_execution.py`(§4.3 全断言 + `@register("execution")` + `_is_dag`/`_same_family`);引 `registry`(D3 缺则内置 FALLBACK 常量,§8) | audits插件 | 2.0 | T01,T04;弱依赖 D3 |
| **D1-T06** | 造 `D1_execution.clean.json`(基线单组切片) + `D1_execution.poison.json`(§6 三投毒变体);写 `assert_gate_is_real` 测试 | fixtures + 测试 | 1.0 | T05 |
| **D1-T07** | `snapshot.freeze` 基线实例 → `_shared/baselines/jadepavilion/execution-contract.golden.json`;接 `snapshot.diff_against_golden` 回归 | golden + 回归用例 | 0.3 | T03 |
| **D1-T08** | 接 `run_eval`(确认 `execution` 进 AUDIT_REGISTRY,5 基线横切)+ 接 Makefile `verify` 目标 | CI 绿 | 0.4 | T05,T07 |
| **D1-T09** | 套件接缝追加:`storyboard/SKILL.md` Step 7、`production-bible/SKILL.md` 导出段、`README.md` Skin 行、`continuity-quality.md` §7/§8 指针;`git diff` 确认 `output-contract.md` 0 改动 | 4 处 diff | 0.5 | T02 |
| **D1-T10** | **tracer bullet**:把 schema+基线交 ViMax 侧对齐 parser;只跑 1 shot + element_render 门真停下 | 联调纪要 | 0.5 | T03;宿主侧并联 |
| **D1-T11** | 真机 A-B(用户亲点付费):契约驱动 plan+render+portraits 跑到 export,验门实停、无二次解析 | 真机证据 | 0.5 | T10(宿主 parser 就绪) |

> T01-T09 = 套件侧自闭环(全离线可验);T10-T11 = 跨宿主含付费真机(扣分项)。**MVP 切线 = T01→T05 + tracer T10**(先证宿主能消费),再回补 T06-T09。

---

## 6. 测试方案

### ① 正例（clean 基线 → 期望 GO）

- **基线 B0** = `production-bible/examples/翡翠楼-全案demo.md` → emit 出的 `翡翠楼-execution-contract.json`。
- 已核实结构:**21 个 asset_id**(去重)→ 21 key_element;**3 个镜头组**(镜头组2 / 镜头组3 / 摊牌二选一)→ 3 shot;demo 中"换脸"全部出现在**反向锚定禁词列表**里(非 category 标记)→ 基线无敏感类 → `element_render.mandatory == "auto"`(未翻 true)。
- 期望:`ajv validate` 0 error;`audit_execution.run(B0)` → **GO / exit 0**,全部 FR-0X 断言 PASS。
- `clean.json` fixture = B0 的"摊牌二选一"单组切片(1 shot + 其 refs 的 key_element + 5 gate + 最小 DAG),独立可 PASS。

### ② 反向注入（poison fixture → 期望 FAIL + 期望测回值）

`D1_execution.poison.json` 含三处独立投毒(每处对应一条 FR 守门),期望 audit **NO-GO / exit 1**,且 `Finding.detail` 测回具体值:

| 投毒变体 | 具体改动(从 clean 基线) | 命中守门 | 期望测回 |
|---|---|---|---|
| **P1·粒度退化(NFR-05/FR-01)** | 把"摊牌二选一"这 1 个镜头组的 4 个**镜内分切**误拆成 4 个独立 `shot`(G3a..G3d),令 `shots` 数 4 ≠ 期望组数 1 | `D1-FR-01` | `measured=4, threshold=1`,detail="shot 数 4 != 镜头组数 1(疑镜级退化)" |
| **P2·引擎泄漏(FR-06/铁律)** | 往某 `final_prompt` 尾部塞 `"（自检确认：Σ镜时长=12s，pause_gate 已过，DAG 无环）"` | `D1-FR-06`(经底座 leak_scan) | 命中 `自检`/`Σ`/`pause_gate`/`DAG` ≥1 词 → FAIL,detail 列出命中词 |
| **P3·跨族降级(FR-04)** | 把某 shot 的 `degrade_chain` 从 `["seedance-2.0","seedance-2.0-fast"]` 改成 `["seedance-2.0","kling-3"]`(跨视频族;且把某 key_element chain 混入 `"suno-5"` 音乐模型) | `D1-FR-04` | `_same_family` 返 False → FAIL,detail="degrade_chain 跨族: ['seedance-2.0','kling-3']" |

> 另备两个**单点 poison**(放 fixtures 注释,供单测点验,不入主 poison 文件以保 P1-P3 独立):
> - **P4·绝对时码(FR-07)**:把某 `final_prompt` 写入 `"0–3s 缓推，3–6s 硬切"` → `ABS_TIMECODE` 命中 → FAIL。
> - **P5·敏感门未强制(FR-03)**:把某 key_element `category` 改 `"faceswap"` 但 `element_render.mandatory` 保持 `"auto"` → FAIL,`measured="auto", threshold=true`;**同时**验证正确做法(mandatory→true + escalate→stop_and_ask)应 PASS。这复刻 PRD 的用例 U1。

### ③ `assert_gate_is_real` 调用示例

```python
# tests/test_d1_gate.py
from harness.reverse_test import assert_gate_is_real
from harness.audits.audit_execution import run as audit_exec
import json

clean  = load_case("fixtures/D1_execution.clean.json")
poison = load_case("fixtures/D1_execution.poison.json")

def test_d1_gate_is_real():
    assert assert_gate_is_real(audit_exec, clean, poison, name="D1")
    # 干净放行(exit0,非假阳性) + 投毒报红(exit1,非橡皮图章) 双过
```

### ④ 回归（冻结黄金基线 + 改后重跑）

- **冻结**:`snapshot.freeze(翡翠楼-execution-contract.json, "_shared/baselines/jadepavilion/execution-contract.golden.json")`(T07)。
- **改 schema/映射后重跑**:任何动 `schema.json` 或 `execution-contract.md` 映射算法的 PR → 重 emit 基线实例 → `snapshot.diff_against_golden(current, golden)`:
  - 若 diff = ∅ → 静默通过;
  - 若 diff ≠ ∅ → 报 `REGRESSION/WARN` + md5 短哈希对照 → **人审**:有意改进则 `re-freeze` 黄金基线并在 PR 说明;否则回滚(底座回归 L2 语义)。
- **CI 门**(Makefile `verify`):`run_eval`(execution 进 5 基线横切)+ `reverse_test --all`(D1 clean/poison)+ `leak_scan_all`(全 final_prompt 命中=0)+ `portability_all`(契约 0 宿主 API),四项任一 exit≠0 → CI 红阻断合入。

### ⑤ 真机层（付费按钮由用户点）

- **A-B 对照**(PRD 验证 c):A 组 = 人手动复制 prompt 旧流程;B 组 = 契约驱动宿主 plan+render+portraits。判定 B 组在**无人工二次解析**下跑到 `export`,且在 `element_render` 门**确实停下**等用户确认相似度(非一键到底)。
- 铁律:**生成付费按钮由用户在 ViMax 亲点**(grsai 计费),本 agent 只交付契约 + 离线门,不点付费按钮、不动用户机器。
- tracer(T10)先只验"1 shot + 1 门真停",full 7-FR 真机延到 parser 对齐后。

---

## 7. 里程碑与退出门

| 里程碑 | 产物 | 退出门(脚本必绿 / DoD 必过) |
|---|---|---|
| **M1 · Schema 定稿** | `execution-contract.md` + `execution-contract.schema.json`(T01-T02) | `ajv compile` schema 自洽;字段表/映射算法/自检规则齐全;`git diff` 证 `output-contract.md` 0 改动(DoD#10/NFR-06) |
| **M2 · 基线实例 + 审计插件**(**MVP 切线**) | `翡翠楼-execution-contract.json` + `audit_execution.py` + clean/poison fixtures(T03-T06) | `ajv validate` 基线 0 error(DoD#1);`audit_execution.run(B0)` → GO/exit0;`assert_gate_is_real(D1)` 双过(干净放行+投毒报红);节点数对账 21 ke/3 shot(DoD#2);DAG 无环(DoD#3);leak_scan final_prompt 命中=0(DoD#7·铁律门) |
| **M3 · 接底座 + 套件接缝** | `lexicon` D1 词 + `run_eval` 注册 + golden 冻结 + 4 处套件追加(T04,T07-T09) | `make verify` 红/绿可复现;`execution` 进 `run_eval` 5 基线横切全绿;`snapshot.diff_against_golden` 基线零漂移;`portability_scan` 契约 0 宿主 API(DoD#9) |
| **M4 · 宿主联调 + 真机 A-B** | tracer 联调纪要 + 真机 export 证据(T10-T11) | B 组无二次解析跑到 export;`element_render` 门**实停**等用户确认(FR-03 最终判据);宿主 parser 对齐 schema(`contract_version` 校验通过) |

> **MVP 切线 = M2 末**(基线契约 + 审计插件 + clean/poison 双过 + 铁律门绿)。此时套件侧已可证"契约合法、守门非橡皮图章、引擎不泄漏",可独立交付给宿主侧联调。M1-M3 全离线自闭环;M4 跨宿主含付费,是落地最后一道(扣分项所在)。

---

## 8. 风险与回滚

| 风险 | 等级 | 缓解 / 回滚 / 降级 |
|---|---|---|
| **引擎泄漏**:执行字段漏进 `final_prompt`→进成片(违铁律) | 高 | FR-06 物理隔离(`final_prompt` 是唯一进模型叶子串)+ 复用底座 `leak_scan` 单独成门 + P2 反向注入常驻 CI。**回滚**:命中即 CI 红阻断合入,emit 端把执行字段强制移出 final_prompt 兄弟域。 |
| **shot 粒度退化成镜级**:碎/贵/低于 4s 下限 | 中 | NFR-05 + DoD#2 等式断言(shots==组数)+ P1 反向用例;映射算法第 2 步硬绑组级。**回滚**:断言报错则 emit 端按组重切。 |
| **D3 model_registry 尚未落地** | 中 | **降级路径**:`audit_execution.py` 内置最小 `FALLBACK_FAMILIES={"video":{"seedance-2.0","seedance-2.0-fast"},"image":{"nano-banana-pro","nano-banana-2","seedream-4.5"}}` 常量代 `registry.reg()`,标 `# TODO: 待 D3 落地后切 registry`。D3 上线后删常量改 import,`_same_family` 逻辑不变。 |
| **宿主 parser 不对齐 schema**:集成一次性失败 | 中 | 契约先行:先交 `schema.json` + 基线实例 + audit 给宿主联调(T10 tracer),再真机;`contract_version` 便于演进。**回滚**:对齐失败则冻结 schema v1.0,宿主侧加 adapter 层吸收差异,不改契约结构。 |
| **可移植性被侵蚀**:有人往契约塞宿主 API | 中 | NFR-02 + DoD#9 复用底座 `portability_scan`(`vimax\.|render\(|\.exe` 0 命中);schema `additionalProperties:false` 不给"调用"字段留位。 |
| **四表质量不足→契约残缺**(asset_id 不闭合) | 中 | 映射算法第 0 步前置门:跑 `asset-id-convention.md §5` 引用闭合回检,不闭合则**拒绝出契约**(不带病 emit)。 |
| **真机受计费/人工门限制无法全自动** | 低 | 接受:A-B 真机由用户亲点(铁律);套件侧 ①②④ 离线门先把绝大多数缺陷拦在出片前。 |
| **宿主能力缺失(无可阻塞暂停门 parser)** | 低 | **降级路径**:契约仍合法交付,宿主若不支持真阻塞门,则退化为"门点产出告警 + 不自动放行",由操作员手动 gate;契约结构与离线门不受影响,可移植性保住(NFR-02)。 |

---

**开发方案** Dev v0.1 ｜ D1 ｜ P1 ｜ 接 `00-ENGINEERING-SUBSTRATE.md` ｜ 核心新增 `production-bible/execution-contract.md`(宿主适配层) + `audits/audit_execution.py`(register 名 `execution`) ｜ MVP 切线 = M2(基线契约 + 审计插件 + clean/poison 双过 + 铁律门绿)
