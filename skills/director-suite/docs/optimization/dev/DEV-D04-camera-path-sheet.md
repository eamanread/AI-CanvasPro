# D4 · 运镜轨迹示意图生成器（Camera-Path Schematic）开发方案

> 编号 D4 ｜ 优先级 P2 ｜ 状态 Dev v0.1 ｜ 前置:[D04-camera-path-sheet.md（本方向 PRD）](../D04-camera-path-sheet.md) + [00-ENGINEERING-SUBSTRATE.md（共享底座）](./00-ENGINEERING-SUBSTRATE.md)
>
> PRD 答 *what/why*；本文件答 *how-to-build*——把 D4 接到共享底座上，**不重造任何验证脚手架**。
> 我只交付:审计插件 `audit_camera_path.py` + 一对 clean/poison fixture + 黄金基线 + 知识/契约文件（成员 `camera-path/`）+ 任务拆解。

---

## 1. 目标与范围

实现 PRD 的 D4-FR-01..04 / NFR-01..05:新增 **Skin 层下游视觉成员 `camera-path/`**,只读消费 `storyboard/output-contract.md` §2.2 的 10 种运镜手法与 §4 的镜头字段（`运镜/景别/时长/切镜方式`），把每个镜头组派生成一张「运镜轨迹示意图卡 + ImageToImage 套打提示词」,供客户/团队在真机出片前一眼读懂运镜与节奏。

**本方向作为"底座插件"的边界（纪律铁律）:**

- **复用不重造**:报告结构 / GO-NO-GO / leak_scan / snapshot / reverse_test / run_eval / registry 全部用 `00-ENGINEERING-SUBSTRATE.md` 定义的共享 harness。我**只**写业务判据（`audits/audit_camera_path.py`）、一对 fixture、一份黄金基线、四个成员 Markdown 文件、两处注册改动。
- **零业务知识下沉到底座**:运镜→视觉编码映射表、4 区块 schema、套打提示词模板等**全部**写在 `camera-path/` 成员私有文件里;只往 `lexicon.BY_DIRECTION["D4"]` 注册禁词、往 `_shared/scripts/audits/` 放一个插件。
- **不碰 Soul**:不改 `tacit-core.md`;引擎隐身铁律继承并扩展为"示意层不漏成片"(NFR-01)。
- **只读 storyboard,不回写**(PRD NG4):storyboard 契约任何既有字段语义零改动。
- **MVP 切线**:文本审计闸（结构闸 + 基线 diff + 反向注入 + leak_scan）是可验证核心,优先于真机出图（M4,付费由用户亲点）。

---

## 2. 交付物清单（精确文件路径表）

| 路径 | 类型 | 说明 |
|---|---|---|
| `skills/director-suite/camera-path/SKILL.md` | 知识md | 成员触发 frontmatter（≥5 触发词）+ 6 步管线,对齐 keyframe SKILL 形态（FR-04） |
| `skills/director-suite/camera-path/output-contract.md` | 契约md | 字段契约 + FR-01 运镜→视觉编码映射表（10 手法×三元组）+ 4 区块 schema + 套打提示词模板 + 自检门（FR-01/02/03） |
| `skills/director-suite/_megaprompts/camera-path.megaprompt.md` | 样例md | 自包含导出版,内联 FR-01 映射表（不靠相对 import），可独立粘贴运行（FR-04④） |
| `skills/director-suite/_shared/scripts/audits/audit_camera_path.py` | audits插件py | 实现 `run(target)->Report` 并 `@register("camera_path")`;断言 FR-01 三元组唯一性 / FR-02 4 区块+标注条数+时长容差 / FR-03 必现句+双写 / NFR-01 成片零泄漏 |
| `skills/director-suite/_shared/scripts/fixtures/D4_camera_path.clean.json` | fixtures | clean 正例:1 镜头组示意图卡 + 对应成片提示词,期望 `audit→GO, exit0` |
| `skills/director-suite/_shared/scripts/fixtures/D4_camera_path.poison.json` | fixtures | poison 反例:见 §6②（4 个独立投毒变体,每个期望 `FAIL` 且测回特定值） |
| `skills/director-suite/_shared/baselines/jadepavilion/camera_path_hits.golden.json` | baselines | 黄金基线:对 `fewshot-翡翠楼夜宴-v2全片.md` 全片 50 个 `运镜` 值跑映射表的"命中表"（手法→三元组归一化结果,未命中=0） |
| `skills/director-suite/_shared/scripts/lexicon.py`（改） | registry项 | 往 `BY_DIRECTION["D4"]` 追加本方向禁词（§3②）;PRD 已预置 `["schematic","机位图标"]`,本方向补全 |
| `skills/director-suite/README.md`（改） | registry项 | 「单产物成员」表新增 `🎥 运镜轨迹示意图 → camera-path/`;目录树新增 `camera-path/` 节点 |
| `skills/director-suite/_shared/style-refs.md`（改） | registry项 | 第 131 行「动作预演分镜」追加交叉引用注脚「→ 实例化产物见 camera-path 成员」（只加引用,不改既有内容） |

> **只读消费、不改**:`storyboard/output-contract.md`、`_shared/mapping-tables.md`、`_shared/continuity-quality.md`。

---

## 3. 与共享底座的接线

### ① 复用 harness 哪些构件

| 底座构件 | D4 怎么用 |
|---|---|
| `harness/audit_report.py`（§2.1） | `audit_camera_path.run()` 返回 `Report`,逐项 `append Finding(check="D4-FR-0X", ...)`;收尾 `rep.assert_fail_has_fix()`;`decision/exit_code` 走统一 GO/NO-GO 语义。判定区零时间戳。 |
| `harness/leak_scan.py` + `lexicon.py`（§2.2） | NFR-01 铁律闸:对镜头组的 **storyboard/keyframe 成片提示词** 跑 `leak_scan(final_text, extra_terms=lexicon.BY_DIRECTION["D4"])`,命中示意图术语/引擎术语即 FAIL。 |
| `harness/snapshot.py`（§2.4） | `freeze(hits_table, "baselines/jadepavilion/camera_path_hits.golden.json")` 冻结命中表;改成员后 `diff_against_golden()` 回归。 |
| `harness/reverse_test.py`（§2.5） | `assert_gate_is_real(audit_camera_path.run, clean_sample, poison_sample, name="D4-camera-path")`——证明闸对 clean 放行、对 poison 报红。 |
| `harness/run_eval.py`（§2.6） | `@register("camera_path")` 让插件自动进 `run_eval` 的 5 基线 × 全审计 GO/NO-GO 编排;纳入 `make verify` 合入门。 |
| `registry.py` / `model_registry.json`（§2.7） | **引用**:套打提示词的图像模型默认走 `registry.reg()["image"]["default"]`(nano-banana-pro),不硬编码;换模型改 registry 1 处。 |

### ② 往 `lexicon.BY_DIRECTION` 加哪些禁词

PRD 底座已预置 `"D4": ["schematic","机位图标"]`。本方向**补全**为「示意层专属、绝不可漏进成片」的全集:

```python
# lexicon.py 改后
BY_DIRECTION = {
    ...,
    "D4": [
        "schematic", "机位图标", "轨迹", "运镜轨迹示意图",
        "PUSH IN", "PULL OUT", "ORBIT",          # 示意图英文技术标注（成片不许出现）
        "火柴人", "stick-figure", "dashed", "虚线轨迹",
        "箭头", "图例", "节奏总结框", "top-down", "俯视底图",
        "NOT a final frame",                     # 示意图负向串（漏进成片即铁律违反）
    ],
}
```
> 这些词是 camera-path 产物的**本体**（示意图里必须有）,但 `leak_scan` 扫的是**成片**（镜头卡 + Seedance 提示词 + keyframe 成片）——成片里出现任意一条 = NO-GO（NFR-01 / DoD-4）。

### ③ 是否引用 model_registry

**是。** 套打提示词的模型标记行不写死,走 `registry.reg()["image"]["default"]`(默认 nano-banana-pro,与 keyframe 同档 GPT-Image-2 可由 registry tier 切换)。`audit_camera_path` 校验 FR-04 时断言提示词模型行**可被 registry 解析**,而非硬编码字符串(避免 D3 前移后返工)。

### ④ 新增 `audits/audit_camera_path.py` 的 register 名

```python
@register("camera_path")        # run_eval AUDIT_REGISTRY 的 key
def run(target) -> Report: ...
```
register 名 = `"camera_path"`(与 audit 名 / Report.audit 字段一致,下划线风格对齐 `audit_consistency`)。

---

## 4. 实现分解（可照着写的真实骨架）

### 4.0 数据契约:`CameraPathTarget`（插件输入）

`run_eval` / `reverse_test` 喂给插件的 `target` 形态。fixture JSON 与基线 case 都按此结构:

```jsonc
// CameraPathTarget schema（fixtures 与 baselines 共用）
{
  "id": "jadepavilion-G07",                  // 镜头组标识
  "schematic_card": {                        // 待审的示意图卡（FR-02 产物）
    "anchor": { "mode": "ImageToImage", "reference": "<<<image_1>>>",
                "inherit": ["空间布局","主体站位","朝向"], "exclude": ["光影","色彩"] },
    "trajectory": [                          // 条数 == 镜头数
      { "shot": "7-1", "景别": "中近景", "手法": "缓推",
        "english": "Push In", "color": "#E5484D", "shape": "直线渐粗",
        "icon": "三角向内", "位移": "12cm", "速度": "匀速", "时长": 5 }
    ],
    "legend": [ { "类别": "推进", "color": "#E5484D", "shape": "直线", "中文名": "推进" }, ... ],
    "callouts": [ "中近景·缓推·5s", ... ],    // 条数 == 镜头数
    "rhythm": { "镜数": 5, "总时长": 24, "切点密度": 0.21,
                "主导情绪强度": 4, "节奏": "文戏" },
    "prompt": "...ImageToImage... this is a schematic NOT a final frame...",  // FR-03 套打串
    "model_line": "nano-banana-pro"          // 走 registry,FR-04
  },
  "source_group": {                          // 源 storyboard 镜头组（NFR-03 派生一致性核对源）
    "组时长": 24,
    "shots": [ { "id": "7-1", "景别": "中近景", "运镜原文": "缓推（Push In）——...；位移约 12cm，匀速 5s",
                 "时长": 5, "切镜方式": "硬切" }, ... ],
    "情绪强度": 4, "节奏": "文戏"
  },
  "final_text": "<该组 storyboard 镜头卡 + Seedance 成片提示词 + keyframe 成片>"  // leak_scan 扫描对象
}
```

### 4.1 `camera-path/output-contract.md` — FR-01 映射表 + 4 区块 schema

**(A) 运镜→视觉编码映射表（FR-01,机器可解析的权威表,审计插件从此处加载）**

照搬 PRD §5.3(A) 11 行表,但**额外**给每行加一个机器可解析的归一化键,供 `audit_camera_path` 与 megaprompt 共用:

```python
# 内联进 output-contract.md 的代码块 + audit 插件从同结构加载
CAMERA_CODE_TABLE = {
  # 归一化手法key : (category, color_hex, shape, icon_modifier)
  "推":   ("推进", "#E5484D", "直线渐粗",   "三角向内"),
  "拉":   ("拉远", "#3B82F6", "直线渐细",   "三角向外"),
  "环绕": ("环绕", "#22C55E", "弧线/螺旋",  "三角沿弧"),
  "升降": ("升降", "#A855F7", "垂直双向",   "三角带↕"),    # 纯垂直无远近
  "跟前": ("跟随", "#F59E0B", "平行跟线·前","三角前置"),
  "跟后": ("跟随", "#F59E0B", "平行跟线·后","三角后置"),
  "手持": ("跟随", "#F59E0B", "跟线+锯齿",  "三角带波纹"),
  "斯坦尼康": ("跟随","#F59E0B","跟线+smooth","三角带流线"),
  "固定": ("固定", "#06B6D4", "定点叉号✕",  "三角钉死"),
  "升降下": ("推进","#E5484D","垂直向下",   "三角下移"),    # 带推意图的升降变体
  "升降上": ("拉远","#3B82F6","垂直向上",   "三角上移"),    # 带拉意图的升降变体
}
# FR-01 不变式:len({v[:1] for v in 10 canonical 手法})==10 个唯一三元组（升降下/上为 red/blue 变体,
# purple 专留"纯升降"通道——由镜头卡物理描述位移方向裁决:向心→推进色 / 离心→拉远色 / 纯垂直无远近→purple）
```

**(B) 运镜原文归一化器（关键算法,解决 fewshot 真实脏数据）**

> 实测 `fewshot` 的 50 条 `运镜` 不是干净的 10 词,而是 `缓推（Push In）` / `极缓微拉（Pull Out）` / `缓跟起（Lead / Crane-up 微随）` / `缓拉＋微升（Pull Out + Crane Up）` / `微移（轻微横移 Truck）` 这类**修饰前缀 + 复合 + 英文别名**。归一化器必须把它们映射回 `CAMERA_CODE_TABLE` 的 key,否则 FR-01③「未命中=0」做不到。

```python
MODIFIER_PREFIX = ["极缓","缓","微","急","轻微","极","慢中速","中速"]   # 速度/幅度修饰,剥离
CN_BASE = {"推":"推","拉":"拉","环绕":"环绕","跟前":"跟前","跟后":"跟后","跟":"跟前",
           "手持":"手持","斯坦尼康":"斯坦尼康","固定":"固定","凝视":"固定","升降上":"升降上",
           "升降下":"升降下","升降":"升降","横摇":"环绕","摇":"环绕"}  # 中文基词→key
EN_BASE = {"Push In":"推","Pull Out":"拉","Orbit":"环绕","Lead":"跟前","Follow":"跟后",
           "Handheld":"手持","Steadicam":"斯坦尼康","Static":"固定","Locked":"固定",
           "Crane Up":"升降上","Crane Down":"升降下","Pan":"环绕","Truck":"跟前",
           "dolly":"推","Slight Lateral Drift":"跟前","Move":"跟前"}

def normalize_move(raw: str) -> tuple[str, list[str]]:
    """运镜原文 → (主key, 复合次key列表)。复合（'缓拉＋微升'）取首手法为主、其余记为 compound。"""
    head = raw.split("——")[0].split(";")[0].split("；")[0]      # 取手法段,丢叙事意图/物理描述
    parts = re.split(r"[＋+/]", head)                           # 复合分隔:＋ + /
    keys = []
    for seg in parts:
        en = re.search(r"[（(]([A-Za-z][^）)]*)", seg)          # 括号内英文别名优先
        k = None
        if en:
            for name, key in EN_BASE.items():
                if name.lower() in en.group(1).lower(): k = key; break
        if not k:                                               # 退化到中文基词:先剥修饰前缀
            cn = seg
            for m in MODIFIER_PREFIX: cn = cn.replace(m, "")
            for base, key in CN_BASE.items():
                if base in cn: k = key; break
        if k: keys.append(k)
    if not keys:
        return (None, [])                                       # 未命中→FR-01 报错
    return (keys[0], keys[1:])                                  # 主key + 复合次key
```

**(C) 4 区块 schema（FR-02）**:照搬 PRD §5.3(B) 的卡 schema（`=== 标题 === / 【用途】非成片帧 / [底图锚定] / [轨迹层] / [图例] / [逐切标注] / [节奏总结框] / [风格锁定+负向]`）,并写明:`[轨迹层]` 条数 == 镜头数;`[逐切标注]` 条数 == 镜头数;`[节奏框]` 总时长 == Σ镜时长(±1s);卡内**禁** `台词/HEX 色卡/音效`。

**(D) 套打提示词模板（FR-03）**,固定串:
```
固定风格: technical storyboard schematic, top-down camera blocking diagram, clean vector look,
          火柴人/摄影机三角图标, dashed motion trajectories, labeled in 中文
固定负向: no photorealistic film still, no cinematic lighting,
          this is a schematic NOT a final frame   ← 原句必现（FR-03②）
路径声明: 有底图→ImageToImage <<<image_1>>> ; 无底图→TextToImage 平面示意（二选一必现,FR-03①）
6 色双写: push-in = red #E5484D arrow / pull-out = blue #3B82F6 arrow / orbit = green #22C55E ...
          （英文+HEX 双写,逐条可 grep,FR-03③）
模型行: {registry.reg()["image"]["default"]}    ← 走 registry,不硬编码
```

### 4.2 `audits/audit_camera_path.py` — 审计插件骨架

```python
# _shared/scripts/audits/audit_camera_path.py
import re
from harness.audit_report import Report, Finding, Verdict
from harness.run_eval import register
from harness.leak_scan import leak_scan
from harness import lexicon, registry

CAMERA_CODE_TABLE = {...}        # §4.1(A);或 import 自 camera_path 契约的解析器
SCHEMATIC_BLOCKS = ["anchor","trajectory","legend","callouts","rhythm","prompt"]
SIX_COLORS = {"#E5484D","#3B82F6","#22C55E","#A855F7","#F59E0B","#06B6D4"}
FORBIDDEN_IN_CARD = ["台词","音效"]           # 成片字段,卡内禁出现
HEX_IN_CARD = re.compile(r"#[0-9A-Fa-f]{6}")  # 卡的"色卡"泄漏（轨迹色除外,见下）

@register("camera_path")
def run(target) -> Report:
    rep = Report(audit="camera_path", target=target["id"])
    card = target["schematic_card"]; src = target["source_group"]

    # ---- FR-01: 三元组唯一性 + 全片命中 ----
    canonical = {k for k in CAMERA_CODE_TABLE if k not in ("升降下","升降上")}  # 10 canonical
    triples = {CAMERA_CODE_TABLE[k] for k in CAMERA_CODE_TABLE}
    if len({CAMERA_CODE_TABLE[k] for k in canonical}) != 10:
        rep.findings.append(Finding("D4-FR-01", Verdict.FAIL,
            f"10 手法三元组不唯一: 实得 {len(...)}", measured=len(...), threshold=10,
            fix="修复 CAMERA_CODE_TABLE 使 10 canonical 手法各有唯一(色,形,图标)三元组"))
    for shot in src["shots"]:
        key, _compound = normalize_move(shot["运镜原文"])
        if key is None:
            rep.findings.append(Finding("D4-FR-01", Verdict.FAIL,
                f"运镜未命中映射表: {shot['运镜原文'][:24]!r}", measured=shot["id"],
                fix="为该运镜手法在 CAMERA_CODE_TABLE/normalize_move 补归一化规则"))

    # ---- FR-01②: 6 基色 HEX 逐字一致 ----
    legend_colors = {row["color"] for row in card["legend"]}
    if legend_colors != SIX_COLORS:
        rep.findings.append(Finding("D4-FR-01", Verdict.FAIL,
            f"图例 6 基色 HEX 与契约不一致: 多/缺 {legend_colors ^ SIX_COLORS}",
            measured=sorted(legend_colors), threshold=sorted(SIX_COLORS),
            fix="把 legend 的 color 改回契约 6 基色 HEX 原值"))

    # ---- FR-02: 4 区块齐全 ----
    for b in SCHEMATIC_BLOCKS:
        if b not in card or not card[b]:
            rep.findings.append(Finding("D4-FR-02", Verdict.FAIL,
                f"示意图卡缺区块: {b}", fix=f"补全卡的 {b} 区块"))
    # ---- FR-02②: 逐切标注/轨迹条数 == 镜头数 ----
    n_shots = len(src["shots"])
    for blk, label in [("trajectory","轨迹层"), ("callouts","逐切标注")]:
        if len(card.get(blk, [])) != n_shots:
            rep.findings.append(Finding("D4-FR-02", Verdict.FAIL,
                f"{label}条数 {len(card.get(blk,[]))} ≠ 镜头数 {n_shots}",
                measured=len(card.get(blk,[])), threshold=n_shots,
                fix=f"使 {label}条数与源镜头数一致"))
    # ---- FR-02③: 节奏框总时长 == Σ镜时长(±1s),复用 storyboard §5 口径 ----
    sigma = sum(s["时长"] for s in src["shots"])
    declared = card["rhythm"]["总时长"]
    if abs(declared - sigma) > 1:
        rep.findings.append(Finding("D4-FR-02", Verdict.FAIL,
            f"节奏框总时长 {declared}s 与 Σ镜时长 {sigma}s 偏差 {abs(declared-sigma)}s > 1s",
            measured=declared, threshold=sigma,
            fix="把节奏框总时长改为 Σ镜时长（容差 ±1s）"))
    # ---- FR-02④: 卡内无成片字段（台词/HEX 色卡/音效）----
    card_text = _flatten(card, drop_keys={"color"})   # 轨迹色合法,排除后再扫 HEX
    for w in FORBIDDEN_IN_CARD:
        if w in card_text:
            rep.findings.append(Finding("D4-FR-02", Verdict.FAIL,
                f"示意图卡含成片字段: {w!r}（属成片层,泄漏）",
                fix=f"从示意图卡删除 {w!r}；示意图是过程产物,不含成片字段"))
    if HEX_IN_CARD.search(card_text):
        rep.findings.append(Finding("D4-FR-02", Verdict.FAIL,
            "示意图卡含非轨迹色 HEX 色卡（成片字段泄漏）",
            fix="删除色卡 HEX；轨迹编码色仅可出现在 legend/trajectory.color 字段"))

    # ---- FR-03: 套打提示词必现句 + 双写 ----
    p = card["prompt"]
    if "ImageToImage" not in p and "TextToImage" not in p:
        rep.findings.append(Finding("D4-FR-03", Verdict.FAIL,
            "套打提示词缺 ImageToImage/TextToImage 路径声明",
            fix="补 ImageToImage（有底图）或 TextToImage 平面示意（无底图）声明"))
    if "this is a schematic NOT a final frame" not in p:
        rep.findings.append(Finding("D4-FR-03", Verdict.FAIL,
            "套打提示词缺负向原句 'this is a schematic NOT a final frame'",
            fix="在负向串补入该原句,防被误用为成片帧"))
    for hexc, en in [("#E5484D","push"),("#3B82F6","pull"),("#22C55E","orbit"),
                     ("#A855F7","crane"),("#F59E0B","follow"),("#06B6D4","static")]:
        if hexc not in p:
            rep.findings.append(Finding("D4-FR-03", Verdict.FAIL,
                f"套打提示词缺 6 色双写: {en}={hexc}",
                fix=f"在提示词补 {en}=...{hexc} arrow 双写"))

    # ---- FR-04: 模型行走 registry,不硬编码 ----
    if card.get("model_line") not in registry._all_image_models():
        rep.findings.append(Finding("D4-FR-04", Verdict.WARN,
            f"模型行 {card.get('model_line')!r} 不在 model_registry 内",
            fix="模型行改为 registry.reg()['image'] 中的注册模型,勿硬编码"))

    # ---- NFR-01 铁律: 成片提示词零泄漏（复用 leak_scan）----
    leak = leak_scan(target["final_text"], extra_terms=lexicon.BY_DIRECTION["D4"])
    rep.findings.extend(leak.findings)     # leak 的 FAIL 直接并入本报告

    rep.assert_fail_has_fix()              # 底座铁律:每条 FAIL 必带 fix
    return rep
```

### 4.3 命中基线 builder（喂 snapshot.freeze）

```python
# 由 M3 一次性脚本/插件子命令产出黄金基线
def build_hits_table(fewshot_path) -> dict:
    groups = parse_storyboard(fewshot_path)      # 复用 storyboard 解析（或轻量正则抽 运镜：行）
    hits = {}
    for g in groups:
        for shot in g.shots:
            key, compound = normalize_move(shot.运镜原文)
            hits[shot.id] = {"raw": shot.运镜原文[:32], "key": key,
                             "triple": CAMERA_CODE_TABLE.get(key), "compound": compound}
    hits["_summary"] = {"total": len(hits)-? , "miss": sum(1 for v in hits.values() if v.get("key") is None)}
    return hits   # freeze 后期望 _summary.miss == 0
```

---

## 5. 任务拆解（Tickets）

| Ticket | 描述 | 产物 | 工时(人天) | 前置 |
|---|---|---|---|---|
| D4-T01 | 写 `camera-path/output-contract.md`:FR-01 映射表（11 行 + `CAMERA_CODE_TABLE` 代码块 + `normalize_move` 归一化规则 + 升降裁决规则） | 契约 §A/§B | 1.5 | — |
| D4-T02 | 续写 `output-contract.md`:FR-02 4 区块 schema、FR-03 套打提示词模板（固定风格/负向/双写/registry 模型行）、自检门 | 契约 §C/§D | 1.0 | D4-T01 |
| D4-T03 | 写 `camera-path/SKILL.md`:frontmatter（≥5 触发词:运镜轨迹/示意图/分镜示意/camera path/运镜图）+ 6 步管线（对齐 keyframe 形态,只读 storyboard） | SKILL.md | 1.0 | D4-T02 |
| D4-T04 | 写 `_megaprompts/camera-path.megaprompt.md`:内联 FR-01 表（不靠相对 import）,自包含可独立运行 | megaprompt | 0.5 | D4-T02 |
| D4-T05 | 注册改动:`README.md` 成员表/目录树加 `🎥 运镜轨迹示意图 → camera-path/`;`style-refs.md:131` 加交叉引用注脚;`lexicon.py` 补全 `BY_DIRECTION["D4"]` | 2 改文件 + lexicon | 0.3 | D4-T03,D4-T04 |
| D4-T06 | 写 `audits/audit_camera_path.py`:FR-01/02/03/04 全断言 + 接 leak_scan（NFR-01）+ `@register("camera_path")` + `assert_fail_has_fix` | 审计插件 | 2.0 | D4-T01,D4-T02,底座 harness 就绪 |
| D4-T07 | 造 fixture:`D4_camera_path.clean.json`（合规组,期望 GO）+ `.poison.json`（§6② 4 变体,各期望特定 FAIL） | 一对 fixtures | 1.0 | D4-T06 |
| D4-T08 | 命中基线:`build_hits_table` 跑 `fewshot-翡翠楼夜宴-v2全片.md` 50 条运镜 → `snapshot.freeze` 成 `camera_path_hits.golden.json`,断言 `_summary.miss==0` | 黄金基线 | 1.0 | D4-T06 |
| D4-T09 | 接 `reverse_test.assert_gate_is_real(audit_camera_path.run, clean, poison)`;接 `run_eval`;纳入 `make verify` 四项门 | 测试接线 | 0.5 | D4-T07,D4-T08 |
| D4-T10 | 真机出图（M4,付费由用户亲点）:1–2 组 ImageToImage 出示意图 + DoD-8 人评 A/B,回填调参结论 | 真机证据 | 0.7 | D4-T09 |

**合计 ≈ 9.5 人天 ≈ 1.9 人周**（M1–M3 文本闸 8.8 人天为关键路径;M4 真机 0.7 人天可与 M3 部分并行）。

---

## 6. 测试方案

### ① 正例（clean 基线,期望 GO）

- **fixture**:`D4_camera_path.clean.json`——取 `fewshot-翡翠楼夜宴-v2全片.md` 真实镜头组 **G07**（含 推/拉/环绕/固定 多手法、5 镜、Σ时长闭合）派生的合规示意图卡 + 合规成片 `final_text`。
- 期望:`audit_camera_path.run(clean) → decision=GO, exit_code=0`（FR-01 全命中、4 区块齐、条数=镜数、时长闭合、套打必现句+双写齐、成片零泄漏）。

### ② 反向注入（poison fixture,每变体期望特定 FAIL + 特定测回值）

`D4_camera_path.poison.json` 含 4 个独立投毒变体,**每个只动一处**,精确验证对应闸:

| 变体 | 投毒动作（具体到字段值） | 命中闸 | 期望测回 |
|---|---|---|---|
| **P1 颜色篡改** | 把 legend 里"环绕"色从 `#22C55E` 改成 `#3B82F6`（与"拉远"撞色） | D4-FR-01② | `measured` 含 `#3B82F6` 重复、缺 `#22C55E`;`legend_colors ^ SIX_COLORS == {"#22C55E"}`;判 **FAIL** |
| **P2 条数失配** | `callouts` 删掉 1 条（从 5 条改 4 条,镜头仍 5）| D4-FR-02② | `measured=4, threshold=5`,偏差 1 条;判 **FAIL** |
| **P3 时长漂移** | 节奏框 `总时长` 从 `24` 改成 `30`（Σ镜时长仍 24） | D4-FR-02③ | `measured=30, threshold=24, 偏差 6s > 1s`;判 **FAIL** |
| **P4 成片泄漏** | 在 `final_text` 成片提示词里塞入示意图术语 `top-down camera blocking schematic, dashed 轨迹箭头` | NFR-01 / leak_scan | `detail` 命中 `"schematic"/"轨迹"/"箭头"/"top-down"` 等禁词;判 **FAIL** |

> 另:**未命中投毒 P5**（可选,验 FR-01③）——把某 shot 的 `运镜原文` 改成表里没有的 `甩镜（Whip Pan 急速）`,期望 `normalize_move` 返回 `None` → `D4-FR-01 FAIL, measured=shot.id`。

### ③ `assert_gate_is_real` 调用示例

```python
# tests/test_camera_path.py
import json
from harness.reverse_test import assert_gate_is_real
from audits import audit_camera_path

clean  = json.load(open("_shared/scripts/fixtures/D4_camera_path.clean.json", encoding="utf-8"))
poison = json.load(open("_shared/scripts/fixtures/D4_camera_path.poison.json", encoding="utf-8"))

def test_camera_path_gate_is_real():
    # 单变体证明闸会变红
    for variant in ["P1","P2","P3","P4"]:
        assert_gate_is_real(audit_camera_path.run, clean, poison[variant],
                            name=f"D4-camera-path/{variant}")
    # 等价于:clean.exit_code==0 放行 ; poison[variant].exit_code==1 报红;否则 AssertionError
```

### ④ 回归（冻结黄金基线 + 改什么后重跑）

- **冻结**:`camera_path_hits.golden.json` = `fewshot` 全片 50 条运镜的归一化命中表（`_summary.miss==0`）。
- **改 `CAMERA_CODE_TABLE` / `normalize_move` 后重跑**:`build_hits_table()` → `diff_against_golden()`。
  - 若新增映射规则使更多脏数据命中（如新支持 `甩镜`）→ 命中表变化 → `snapshot` 报 `WARN 漂移` → 人审 diff,确认是**有意改进**则 `freeze` re-freeze 基线;否则回滚。
  - 若 `_summary.miss` 从 0 变 >0（回归劣化）→ 视为 FAIL,必须修复 `normalize_move` 后才允许合入。
- **改 6 基色 HEX**(如品牌换色)→ 同步改 `output-contract.md` 映射表 + `SIX_COLORS` + clean fixture + re-freeze 基线,四处一致才过。

### ⑤ 真机层（M4,付费按钮由用户亲点）

- 取 1–2 组（含环绕 Orbit 的 G09、含纯固定的 G11）走 ImageToImage（底图=场景平面/机位俯视）真机出 1 张/组示意图。
- DoD-8 人评:≥3 名评审核对"箭头颜色/轨迹方向/逐切标注/节奏框"与镜头卡语义一致;A/B 量"团队 60s 内能否正确复述运镜与节奏"的命中率,B（卡+示意图）应显著高于 A（纯文字卡）。
- 成本闸（NFR-04）:出图张数 == 镜头组数（非镜头数）,不逐镜出图。

---

## 7. 里程碑与退出门

| Milestone | 产物 | 退出门（脚本必须绿 / DoD 必须过） |
|---|---|---|
| **M1 契约与映射表**（≈0.8 周;T01–T02） | `camera-path/output-contract.md`（FR-01 映射表 + `normalize_move` + 4 区块 schema + 套打模板） | 契约草案可评审;`CAMERA_CODE_TABLE` 通过 `len(unique 10 triples)==10` 手验;**DoD-1 半程** |
| **M2 成员与导出**（≈0.5 周;T03–T05） | `SKILL.md` + `megaprompt` + README/style-refs/lexicon 注册 | **DoD-5** 4 文件存在 + 注册齐;`portability_scan` 对成员目录=0;触发词 ≥5 |
| **M3 审计脚本与基线**（≈0.7 周;T06–T09）★MVP 切线 | `audit_camera_path.py` + clean/poison fixtures + `camera_path_hits.golden.json` + 测试接线 | `make verify` 四项绿:① `run_eval`(含 camera_path)GO ② `reverse_test --all`（P1–P4 clean 放行/poison 报红）③ `leak_scan_all`=0 ④ `portability_all`=0;基线 `_summary.miss==0`;**DoD-1/2/3/4 全过** |
| **M4 真机与 A/B**（≈0.4 周,付费用户点;T10） | 1–2 组真机示意图 + DoD-8 人评 + 调参结论 | **DoD-8** 出图 ≥3 评审一致通过;A/B 命中率 B>A;出图张数==组数 |

**MVP 切线 = M3 完成**:此时文本审计闸（结构 + 基线 + 反例 + leak_scan）全绿、可冷启动重跑回归,即为可交付可验证核心。M4 真机是增益证据,不阻塞 MVP。**关键路径** M1→M2→M3;M4 可与 M3 末段并行。

---

## 8. 风险与回滚

| 风险 | 影响 | 缓解 / 回滚 / 降级 |
|---|---|---|
| **R1 运镜原文脏数据归一化漏命中**（实测 fewshot 有 `缓拉＋微升`/`横摇 Pan`/`Truck`/`dolly` 等非 canonical 写法） | FR-01③ miss>0,基线红 | `normalize_move` 已设修饰前缀剥离 + 英文别名表 + 复合分隔;新脏样本→补 `EN_BASE`/`CN_BASE` 一行即可,不改架构。**回滚**:基线 diff 报漂移则人审,劣化即回滚该规则 |
| **R2 示意图被误当成片参考帧喂 Seedance**（引擎泄漏,破隐身铁律） | 破成片 | NFR-01 硬闸（leak_scan + `BY_DIRECTION["D4"]`）+ poison P4 反例 + 卡头【用途】首行"非成片帧" + 负向串 `NOT a final frame`。CI 拦截,不可绕过 |
| **R3 升降镜归"推拉色"还是 purple 判定歧义** | 颜色不一致 | §4.1(A) 裁决规则（向心→红 / 离心→蓝 / 纯垂直→purple,由物理描述位移方向定）写进契约 + 归一化器;歧义样本进基线锁定预期 |
| **R4 红/绿箭头对色盲不可读** | 可读性差（NFR-05） | 图例三要素强制（颜色+形状+中文名）;红=直箭、绿=弧/螺旋,审计断言 legend 每行三字段齐 |
| **R5 底座 harness 尚未落地**（当前 `_shared/scripts/` 为空,仅 substrate 文档存在） | 插件无处接 | **前置依赖**:Sprint0 步行骨架（substrate §6）须先建 `harness/audit_report.py + leak_scan.py + lexicon.py + run_eval.py + reverse_test.py + snapshot.py`。D4 插件 import 这些;若 Sprint0 未就绪,T06 前置阻塞——降级路径:先以独立 `verify_camera_path.py`（同断言、不 import harness）跑通文本闸,待 harness 就绪再改为 `@register` 接入（断言逻辑不变,仅换 Report 来源） |
| **R6 图像模型渲染中文标注/精确箭头失真**（真机层不确定性） | 示意图不可读 | 文本逐切标注作权威源（图糊以文字卡为准）+ ImageToImage 底图打底 + 负向锁 schematic 观感;**降级**:宿主无 ImageToImage/读图能力时,FR-03 走 `TextToImage 平面示意` 路径（契约已二选一支持）,文本卡不依赖宿主 |
| **R7 逐镜真机出图碎贵** | 成本失控（NFR-04） | 1 组 1 图硬约束;审计断言真机层"出图张数==组数";文本卡 0 次真机即完成 |

**总回滚策略**:D4 是纯增量插件 + 新成员目录,不改任何既有契约语义（PRD NG4）。任一环失败,删 `camera-path/` 目录 + 撤 3 处注册（README/style-refs/lexicon）+ 删 `audit_camera_path.py` 即完全回滚,对其余 12 方向与既有成员**零影响**。
