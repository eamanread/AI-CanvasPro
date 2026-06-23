# D13 · 产品化 + 文档口径统一 开发方案

> 编号 D13 ｜ 优先级 P2 ｜ 状态 Dev v0.1 ｜ 前置:[D13-productization.md（本方向 PRD）](../D13-productization.md) + [00-ENGINEERING-SUBSTRATE.md（共享底座）](./00-ENGINEERING-SUBSTRATE.md)
>
> PRD 答 *what/why*；本文件答 *how-to-build*——把 D13 接到共享底座上，**不重造任何验证脚手架**。
> D13 是缺口类 **C（无秤无回归）** 的 P2 横切**产品化地基**：它不新增任何创作能力，而是给已成型的「灵魂/骨/皮」内核装上"产品化的秤"——口径收敛、版本对版、推荐入口真机基线、两种封装双向同步门、luban 出师、安装包。
> 我**只**交付:5 个**审计/打包插件**（`audit_terminology / audit_versions / audit_bible_interlock / audit_megaprompt_sync` + `build_skill_pack / verify_install`）+ 每闸一对 clean/poison fixture + 一份全案真机黄金基线 + 知识/契约文件（`glossary.md` / `VERSIONS.md`）+ 第 5 个 megaprompt + 任务拆解。机制（Report / leak_scan / snapshot / reverse_test / run_eval / registry）全部复用底座。

---

## 1. 目标与范围

实现 PRD 的 **D13-FR-01..05 / NFR-01..05**：把 director-suite 这套**对外发布的公共 Skill 资产**的外壳口径从"散的"收敛为"单一真相 + 可回归的秤"。具体五件事：

1. **FR-01 术语收敛**：新增 `_shared/glossary.md`（三概念区分表），全仓把"六维/8维/八大支柱"混用收敛到 canonical 称谓；落 `audit_terminology.py` 守门。
2. **FR-02 文件树+版本台账**：DESIGN 文件树补 `asset-id-convention.md` 并与 README 逐行对齐；新增 `VERSIONS.md` 对版矩阵；落 `audit_versions.py`。
3. **FR-03 推荐入口真机基线**：用一个真实剧本把 production-bible 全案四表互锁端到端跑通一次，落 `examples/<案名>-真机基线/`；落 `audit_bible_interlock.py`（四不变量）。
4. **FR-04 双向同步门**：补 production-bible 第 5 个 megaprompt；为 5 个 megaprompt 加 `<!-- sync-source -->` 锚；落 `audit_megaprompt_sync.py`。
5. **FR-05 出师+打包**：`verify_install.py` 聚合四审计；`build_skill_pack.py` 出 zip + INSTALL.md；跑 luban 三把尺出 `luban-report.md` + 出师证书结果卡。

**本方向作为"底座插件"的边界（纪律铁律）:**

- **复用不重造**：报告结构 / GO-NO-GO / 退出码 / `leak_scan` / `snapshot` / `reverse_test` / `run_eval` / `registry` 全部用 `00-ENGINEERING-SUBSTRATE.md` 定义的共享 harness。D13 的四个 `audit_*` 都返回统一 `Report`、以退出码表达 GO/NO-GO、`@register` 进 `run_eval`。
- **不碰 Soul（NFR-01 铁律）**：D13 **一行不改** `tacit-core.md` 的推理逻辑。术语收敛只改"对外称谓与文档措辞"（`DESIGN.md`/`README.md`/各 `megaprompt`），不改任何决策算子。`tacit-core.md` 仅做"称谓是否已 canonical"的**只读核对**（预期零改）。
- **零语义改（N3）**：不新增映射表、不改 v2.0 字段结构、不做契约语义升级。FR-02 只做"对版与台账"，props 若要升 v1.1 是**独立工作**（归各自方向）。
- **审计产物物理隔离（NFR-01）**：任何审计脚本 / 真机基线 / 出师过程产物**绝不可漏进成片提示词**。只存于 `docs/`、`tools/`、`examples/<案名>-真机基线/.audit/`，与成片层物理隔离。
- **可移植不破（NFR-02）**：所有 `tools/*.py` **仅依赖 Python 标准库 + 纯文本扫描**（区别于 D5/D8 的 Pillow/numpy 像素审计——D13 是**纯文本域**审计，零图像依赖），以"skill 根目录"为相对基准，换机即用。
- **MVP 切线**：FR-01/FR-02（口径地基）+ FR-04（同步门）是纯文本扫描 + 守门，技术风险最低、影响面最广，是可验证核心，优先于 FR-03 真机基线（需人工选案 + 端到端跑通）。

> **与底座 §1 目录的一处差异说明**：底座目录把脚本放在 `_shared/scripts/`（D5/D8 像素审计沿用）。PRD §5 的 D13 路径表把脚本放在 `skills/director-suite/tools/`（与本仓既有 `tools/build_windows_onefile.py` 打包先例同址）。**本方案以 PRD 路径表为准**（`tools/`），但 `harness/` 的 import 仍走底座的 `_shared/scripts/harness/`——`tools/*.py` 顶部用相对路径把 `_shared/scripts/` 加进 `sys.path` 即可（见 §4.0）。此差异不影响"机制复用底座"的纪律。

---

## 2. 交付物清单（精确文件路径表）

| 路径 | 类型 | 说明 |
|---|---|---|
| `skills/director-suite/_shared/glossary.md` | 知识md | **FR-01 主交付**：三概念区分表（情感优先六维管线 / 八维导演知识库 / 八大支柱）× {canonical 名 / 层 / 实体文件 / 一句话区分 / 禁用别名} 五列；作为 `audit_terminology.py` 的白名单/禁词源 |
| `skills/director-suite/VERSIONS.md` | 契约md | **FR-02 主交付**：版本对版矩阵（唯一台账），列全部契约文件的 {文件 / 当前版本 / 配套依赖 / 最后变更}；作为 `audit_versions.py` 的对账源 |
| `skills/director-suite/_megaprompts/production-bible.megaprompt.md` | 样例md | **FR-04**：第 5 个 megaprompt，把全案四表互锁链路自包含化（单文件用户用法 B 拿到"推荐入口"） |
| `skills/director-suite/tools/audit_terminology.py` | audits插件py | **FR-01**：`run(target)->Report` 并 `@register("terminology")`；扫全仓 `.md`，校"维度概念"称谓在 glossary 白名单内、未命中禁用别名 |
| `skills/director-suite/tools/audit_versions.py` | audits插件py | **FR-02**：`@register("versions")`；校每个文件头版本 == VERSIONS.md 记录 + 配套声明闭合 + DESIGN/README 树条目集合相等 |
| `skills/director-suite/tools/audit_bible_interlock.py` | audits插件py | **FR-03**：`@register("bible_interlock")`；对四表跑四不变量（引用闭合 / 覆盖完整 / 状态轴单调 / L1 锚一致） |
| `skills/director-suite/tools/audit_megaprompt_sync.py` | audits插件py | **FR-04**：`@register("megaprompt_sync")`；解析 megaprompt 内 `sync-source` 锚的 `facts:`，与源 section 实测值比对 |
| `skills/director-suite/tools/verify_install.py` | audits插件py | **FR-05**：一键聚合 FR-01~04 四审计 + 两条铁律门（leak_scan/portability），全绿才 exit0；装机即跑烟测门 |
| `skills/director-suite/tools/build_skill_pack.py` | audits插件py | **FR-05**：产出 `dist/director-suite-vX.Y.Z.zip`（含 `VERSION` 戳）+ `INSTALL.md`；版本号读 VERSIONS.md |
| `skills/director-suite/production-bible/examples/<案名>-真机基线/character-roster.out.md` | baselines | **FR-03** 真机角色表（四表之一） |
| `skills/director-suite/production-bible/examples/<案名>-真机基线/scene-roster.out.md` | baselines | **FR-03** 真机场景表 |
| `skills/director-suite/production-bible/examples/<案名>-真机基线/props-roster.out.md` | baselines | **FR-03** 真机道具表（须含 ≥1 个有 `@sN` 状态轴的叙事道具） |
| `skills/director-suite/production-bible/examples/<案名>-真机基线/storyboard.out.md` | baselines | **FR-03** 真机分镜表（须含 ≥2 个跨镜复用 asset） |
| `skills/director-suite/production-bible/examples/<案名>-真机基线/manifest.md` | baselines | **FR-03**：输入剧本指纹（md5/行数）+ 产出清单 + **选案理由**（为何四不变量都被真正触发） |
| `skills/director-suite/production-bible/examples/<案名>-真机基线/.audit/interlock.golden.json` | baselines | **FR-03** 互锁审计黄金基线（snapshot.freeze 冻结，全 PASS/GO，回归锚；**隔离区**） |
| `skills/director-suite/_shared/scripts/fixtures/D13_terminology.clean.md` | fixtures | FR-01 clean 正例：全用 canonical 称谓的小样本 `.md`，期望 GO |
| `skills/director-suite/_shared/scripts/fixtures/D13_terminology.poison.md` | fixtures | FR-01 poison：把"情感优先六维管线"误写成"五维管线" + DESIGN 风「48个影视skill」与 README「44」并存，期望 FAIL |
| `skills/director-suite/_shared/scripts/fixtures/D13_versions.clean/` | fixtures | FR-02 clean：版本头与 VERSIONS 一致的最小契约集，期望 GO |
| `skills/director-suite/_shared/scripts/fixtures/D13_versions.poison/` | fixtures | FR-02 poison：props 头改 v1.1 但台账仍 v1.0，期望 FAIL（测回失配文件） |
| `skills/director-suite/_shared/scripts/fixtures/D13_interlock.clean/` | fixtures | FR-03 clean：四表自洽小样本（引用闭合/覆盖全/单调/锚一致），期望 GO |
| `skills/director-suite/_shared/scripts/fixtures/D13_interlock.poison/` | fixtures | FR-03 poison：3 变体（删一个 prop 定义 / 道具状态轴逆序 / 同 asset L1 锚漂移），期望 FAIL |
| `skills/director-suite/_shared/scripts/fixtures/D13_megaprompt_sync.clean.md` | fixtures | FR-04 clean：megaprompt facts 与源一致，期望 GO |
| `skills/director-suite/_shared/scripts/fixtures/D13_megaprompt_sync.poison.md` | fixtures | FR-04 poison：源 `style-refs 283`，megaprompt 内联 `count=284`，期望 FAIL（测回 283 vs 284） |
| `skills/director-suite/docs/luban-report.md` | 样例md | **FR-05**：luban 五动作三把尺《Skill 打磨报告》 |
| `skills/director-suite/docs/cert-card.md` | 样例md | **FR-05**：出师证书结果卡（套件名/版本/逐条引 AC-1~7 脚本输出的通过项） |
| `skills/director-suite/INSTALL.md` | 样例md | **FR-05**：安装说明（装机即跑 verify_install 的烟测清单） |
| `skills/director-suite/_shared/scripts/lexicon.py`(改) | registry项 | 往 `BY_DIRECTION["D13"]` 追加本方向禁词（§3②） |
| `skills/director-suite/_shared/scripts/harness/run_eval.py`(消费) | registry项 | 四个 `audit_*` 经 `@register` 自动进 `AUDIT_REGISTRY`；不改底座代码 |

**改动（仅文档措辞 / 文件树，零语义改动）:**

| 路径 | 改动 |
|---|---|
| `skills/director-suite/DESIGN.md` | FR-02 文件树（132–159）`_shared/` 由 7 件→8 件补 `asset-id-convention.md`、`_megaprompts/` 由 4→5 补 production-bible；FR-01 把 `:139`「八维导演知识库（接地自48个影视skill）」措辞挂 glossary（统一称谓 + 计数核平为 44） |
| `skills/director-suite/README.md` | FR-01 `:58`「8维导演知识库(接地自44 skill)」措辞挂 glossary；`:88`「44/48」与 coverage-ledger（D10）核平、与源核平 |
| `skills/director-suite/_shared/dimensions.md` | FR-01 `:1`「共 5 大维度」——此为**第三个"维度数"**指代 Bone 知识库，须收敛为 glossary canonical「八维导演知识库」（或显式标注"5 大维度=Bone 分类的另一粒度"，二选一并落 glossary） |
| `skills/director-suite/_megaprompts/*.megaprompt.md` | FR-04 每个内联块补 `<!-- sync-source: ... -->` 锚；FR-01 把 storyboard megaprompt 的「情绪优先六维」与 tacit-core「情感/氛围优先六维」核平为 glossary canonical |
| `skills/director-suite/_shared/tacit-core.md` | FR-01 仅称谓只读核对（确认 §一=「八大支柱」、§二=「情感优先六维」，**预期零改**） |

> **只读消费、不改语义**：`_shared/{mapping-tables,pro-params,style-refs,continuity-quality,asset-id-convention,seedance-2.0}.md`、`production-bible/{character,scene,props}-roster.md` 的字段语义零改动，仅被 `glossary.md` / `VERSIONS.md` 引用。

---

## 3. 与共享底座的接线

### ① 复用 harness 哪些构件

| 底座构件 | D13 怎么用 |
|---|---|
| `harness/audit_report.py`(§2.1) | 四个 `audit_*` 全部返回 `Report`；每个违规 `append Finding(check="D13-FR-01", verdict=FAIL, detail="README 用『五维』指代内部管线，非 canonical『情感优先六维』", measured="五维", threshold="情感优先六维", fix="改为『情感优先六维』")`；收尾 `rep.assert_fail_has_fix()`；`decision`/`exit_code` 走统一语义。**判定区零时间戳**——审计运行时间只入报告 header 元数据、不进 `findings`。 |
| `harness/leak_scan.py` + `lexicon.py`(§2.2) | NFR-01 铁律闸：对 **FR-03 真机基线的四表（成片）** 跑 `leak_scan(final_text, extra_terms=lexicon.BY_DIRECTION["D13"])`，命中方法论/审计/支柱编号即 FAIL。`verify_install.py` 把它横切到所有 `*.out.md`。`ENGINE_TERMS` 已含 `方法论/支柱/默会/格式塔`——D13 的核心泄漏词**底座已覆盖**，只补差集（§3②）。 |
| `harness/snapshot.py`(§2.4) | `freeze(interlock_report, ".audit/interlock.golden.json")` 冻结 FR-03 真机基线的互锁审计（全 PASS/GO）；任一上游表改动后 `diff_against_golden(current, golden_path)` 回归——断言"互锁仍闭合、无新增 FAIL"。这是"推荐入口"过去唯一缺的回归锚。 |
| `harness/reverse_test.py`(§2.5) | 每闸 `assert_gate_is_real(gate_fn, clean, poison, name="D13-xxx")`——证明四个闸对 clean 放行、对 poison 报红。**无反例的闸视为未完成**（完善⑥）。T1~T4 四组反证（§6②）。 |
| `harness/run_eval.py`(§2.6) | 四个 `audit_*` 各 `@register` 自动进 `AUDIT_REGISTRY`；`verify_install.py` 调 `run_eval` 风格的聚合（FR-01/02/04 横切全仓，FR-03 横切真机基线）。任何动 `_shared/` 的 PR 不过四项不许合（完善④）。 |
| `registry.py` / `model_registry.json`(§2.7) | **不引用**（弱）。D13 是纯文档/打包域，不选模型、不调模型（NFR-04 零付费）。唯一相关：`audit_versions.py` 若发现 contract 里硬编码了模型名，可建议改引 registry——但这是 D3 的领域，D13 只标注不强制。 |

### ② 往 `lexicon.BY_DIRECTION` 加哪些禁词

PRD 底座未预置 `"D13"`。本方向**新增**「产品化过程层专属、绝不可漏进成片」的禁词集——D13 的过程产物（术语审计、版本台账、互锁报告、出师证书）一旦被误拼进 megaprompt 或四表即 NFR-01 违反：

```python
# lexicon.py 改后
BY_DIRECTION = {
    ...,
    "D13": [
        "glossary", "术语审计", "audit_terminology", "禁用别名",
        "VERSIONS.md", "对版矩阵", "版本台账", "audit_versions", "配套闭合",
        "互锁审计", "audit_bible_interlock", "引用闭合", "状态轴单调", "锚一致",
        "sync-source", "audit_megaprompt_sync", "漂移",
        "luban", "鲁班", "三把尺", "出师证书", "结构尺", "实测尺", "活体尺",
        "verify_install", "build_skill_pack", "装机烟测", "GO/NO-GO",
    ],
}
```

> 注意区分：**glossary 里定义的 canonical 创作称谓**（如"景别""运镜""色彩"）是**成片合法词**，不入禁词；禁的是**产品化过程词**（"术语审计""对版矩阵""出师证书"）。T-LEAK 反证（在真机基线分镜表注入一行"互锁审计✓"）依赖此集让 `leak_scan` 报红。

### ③ 是否引用 model_registry

**不引用**。D13 全程纯文档扫描 + 打包，不选模型、不调模型（NFR-04）。FR-03 真机基线的**文字四表**也不触发计费；视觉生成（角色设定板/关键帧出图）标注为**人工门**、不在 D13 自动路径内（由用户亲点）。

### ④ 新增 `tools/audit_*.py` 的 register 名

| 文件 | register 名 | 进 run_eval 后横切对象 |
|---|---|---|
| `audit_terminology.py` | `@register("terminology")` | 全仓 `.md`（口径） |
| `audit_versions.py` | `@register("versions")` | 全部契约文件头 + DESIGN/README 树 |
| `audit_bible_interlock.py` | `@register("bible_interlock")` | `examples/<案名>-真机基线/` 四表 |
| `audit_megaprompt_sync.py` | `@register("megaprompt_sync")` | 5 个 megaprompt 的 sync-source 锚 |

### ⑤ 接上底座的 5 件 Done 清单（对照 00-SUBSTRATE §3）

```
1. tools/audit_{terminology,versions,bible_interlock,megaprompt_sync}.py 实现 run(target)->Report 并 @register  ✔ T05/T07/T11/T09
2. 往 lexicon.BY_DIRECTION["D13"] 注册禁词集（§3②）                                                              ✔ T15
3. fixtures/ 每闸放一对 clean + poison，测试里 assert_gate_is_real（四闸 × 一对）                                 ✔ T06/T08/T10/T12
4. 不涉模型选择 → 不引 registry（NFR-04 零付费），显式声明                                                        ✔ N/A
5. baselines/ 放真机互锁黄金基线 interlock.golden.json，纳入 run_eval 与 snapshot 回归                            ✔ T13
```

---

## 4. 实现分解（可照着写的真实骨架）

### 4.0 `tools/*.py` 公共头（把底座 harness 加进 sys.path）

```python
# 每个 tools/audit_*.py 顶部统一引导（NFR-02：相对 skill 根，零绝对路径）
import sys, os
_SKILL_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # …/director-suite
sys.path.insert(0, os.path.join(_SKILL_ROOT, "_shared", "scripts"))         # 底座 harness 入径
from harness.audit_report import Report, Finding, Verdict
from harness.run_eval import register
```

### 4.1 `_shared/glossary.md`（FR-01 单一术语真相）

三概念**显式区分**——它们指三件不同的东西，过去从未在一处被并列区分（这正是混用根源）。核心表（五列）：

```markdown
# 术语单一真相表（glossary · director-suite 对外口径权威）

> 全仓任何文档/megaprompt 提及下列概念时，**必须用 canonical 名**；禁用别名出现即口径违规。
> 本表是 `tools/audit_terminology.py` 的白名单 + 禁词源（机器可校验）。

| 概念（canonical 名） | 所属层 | 实体文件 | 是什么（一句话区分） | 禁用别名 |
|---|---|---|---|---|
| 情感优先六维管线 | Soul | tacit-core.md §二 | 内部推理的 6 个分声部（场面/景别/运镜/光影/色彩/表演×声音×节奏），先定感觉再定做法的**推理管线** | 五维 / 5维 / 五维管线 / 六大维度 / 情绪优先六维(混写,统一为"情感优先六维") |
| 八维导演知识库 | Bone | dimensions.md | Bone 层专业知识的 **8 类分门别类**（≠推理管线，是查表知识库） | 5维 / 五维 / 六维 / 5 大维度(若指 Bone 库) |
| 八大支柱 | Soul | tacit-core.md §一 | 默会决策的 **8 个操作化算子**（辅助觉知/寓居/…，≠维度，是决策算子） | 八维 / 八大维度 |
```

> **数据接地（实测，§证据）**：当前混用的三处真实命中——
> - `tacit-core.md §二` = canonical「情感/氛围优先六维」；`storyboard.megaprompt.md:21` 写成「情绪优先六维」（同物异名，须核平）。
> - `DESIGN.md:139`「八维导演知识库（接地自48个影视skill）」 vs `README.md:58`「8维导演知识库(接地自44 skill)」——**称谓一致但计数 48 vs 44 打架**；`dimensions.md:1`「共 5 大维度」——**同一 Bone 库第三个数（5）**。glossary 把三者钉死为「八维导演知识库」，计数核平为 44（README:88 已注"4 个因网络中断未纳入"）。
> - `tacit-core.md §一` = canonical「八大支柱」；与「八维」是**两件不同的事**，glossary 显式区分。

`audit_terminology.py` 的判据：对全仓 `.md`，凡命中任一禁用别名 → FAIL；凡某概念的实体文件区域用了非 canonical 称谓 → FAIL。`D02-NFR-05`/`D08-NFR-05` 所指"5维/8维混用"计数在脚本输出里应**归零**（AC-1）。

### 4.2 `audit_terminology.py`（FR-01）— 函数签名 + 核心逻辑

```python
# tools/audit_terminology.py
import re, glob, os
from collections import namedtuple
# … 4.0 公共头 …

# 从 glossary.md 解析白名单/禁词（单一真相，不在脚本里硬编码概念）
Concept = namedtuple("Concept", "canonical layer entity_file banned_aliases")

def load_glossary(path) -> list[Concept]:
    """解析 glossary.md 的五列表 → [Concept]。禁用别名按 '/' 切分、去空白。"""
    rows = []
    for line in open(path, encoding="utf-8"):
        if line.startswith("|") and "Soul" in line or "Bone" in line and line.startswith("|"):
            cols = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cols) == 5 and cols[0] not in ("概念（canonical 名）",):
                aliases = [a.strip() for a in re.split(r"[/、]", cols[4]) if a.strip() and a.strip() != "—"]
                rows.append(Concept(cols[0], cols[1], cols[2], aliases))
    return rows

def scan_file(text, concepts) -> list[tuple]:
    """返回 [(alias_hit, lineno, line)]。命中任一禁用别名即违规。"""
    hits = []
    for i, line in enumerate(text.splitlines(), 1):
        if line.lstrip().startswith(("|", ">", "<!--")) and "禁用别名" in line:
            continue                                  # 跳过 glossary 自身的别名声明行
        for c in concepts:
            for alias in c.banned_aliases:
                # 词边界匹配，避免 "5维" 命中 "15维度" 之类
                if re.search(rf"(?<![0-9]){re.escape(alias)}", line):
                    hits.append((alias, i, line.strip(), c.canonical))
    return hits

def run(target=None) -> Report:
    root = target.skill_root if target and hasattr(target, "skill_root") else _SKILL_ROOT
    concepts = load_glossary(os.path.join(root, "_shared", "glossary.md"))
    rep = Report(audit="terminology", target=os.path.basename(root))
    md_files = [f for f in glob.glob(os.path.join(root, "**", "*.md"), recursive=True)
                if "/docs/" not in f.replace("\\", "/")          # 排除 PRD/dev 文档（自指豁免，见下）
                and "/examples/" not in f.replace("\\", "/")      # 排除真机基线/few-shot（成片层另由 leak_scan 管）
                and "glossary.md" not in f]
    for fp in md_files:
        for alias, ln, line, canon in scan_file(open(fp, encoding="utf-8").read(), concepts):
            rep.findings.append(Finding(
                check="D13-FR-01", verdict=Verdict.FAIL,
                detail=f"{os.path.relpath(fp, root)}:{ln} 用禁用别名 {alias!r} 指代 {canon!r}",
                measured=alias, threshold=canon,
                fix=f"把 {alias!r} 改为 canonical {canon!r}（见 _shared/glossary.md）"))
    rep.assert_fail_has_fix()
    return rep

@register("terminology")
def _registered(target): return run(target)
```

> **自指豁免（关键）**：`docs/optimization/**`（PRD/dev 文档，包含本文件、D02/D08 NFR 描述、D13 自身）**必须排除**——它们**要讨论**"5维/8维混用"这件事，正文里必然出现这些别名（如本段）。审计只扫**对外门面**（README/DESIGN/_shared/各成员 SKILL/megaprompt），不扫"讨论问题的内部文档"。这一排除规则写进 `audit_terminology.py` 与 glossary 注脚，避免脚本对自己的需求描述误报。

### 4.3 `VERSIONS.md` + `audit_versions.py`（FR-02）

**(A) `VERSIONS.md` 对版矩阵**（初始快照已实测核对，与 PRD §5(B) 一致）：

```markdown
# 版本对版矩阵（VERSIONS · 全套件契约版本唯一台账）

> 本表是所有契约版本的**唯一真相**。任何契约文件头声明的版本号必须与本表一致；
> 任何"配套依赖"声明必须闭合（A 声明配套 B v2.0，则 B 实际须为 v2.0）。
> 机器校验：`tools/audit_versions.py`。

| 契约文件 | 当前版本 | 配套依赖 | 最后变更 |
|---|---|---|---|
| storyboard/output-contract.md | v2.0 | —（基准） | 时长制重构 |
| character-board/output-contract.md | v1.0 | storyboard v2.0 | 初版 |
| color-palette/output-contract.md | v1.0 | storyboard v2.0 | 初版 |
| keyframe/output-contract.md | v1.0 | storyboard v2.0 | 初版 |
| production-bible/character-roster.md | v1.0 | storyboard v2.0 | 初版 |
| production-bible/scene-roster.md | v1.1 | storyboard v2.0 | +§0先绑定/§3.5四视图 |
| production-bible/props-roster.md | v1.0 | storyboard v2.0 | 初版 |
| _shared/asset-id-convention.md | —（无版本号·焊点） | 被四表交叉引用 | — |
```

**(B) `audit_versions.py` 核心逻辑**：

```python
# tools/audit_versions.py  — 三件校验：版本头==台账 / 配套闭合 / DESIGN树==README树
import re, os
# … 4.0 公共头 …

VER_RE = re.compile(r"契约\s*(v\d+\.\d+)")          # 文件头 "…输出字段契约 v2.0"
DEP_RE = re.compile(r"配套.*?(v\d+\.\d+)|服务.*?时长制\s*(v\d+\.\d+)")

def parse_versions_md(path) -> dict:
    """VERSIONS.md → {relpath: (version, dep_decl)}。'—' 版本记 None。"""
    table = {}
    for line in open(path, encoding="utf-8"):
        if line.startswith("|") and "/" in line and "契约文件" not in line:
            cols = [c.strip() for c in line.strip().strip("|").split("|")]
            ver = None if cols[1].startswith("—") else cols[1]
            table[cols[0]] = (ver, cols[2])
    return table

def head_version(filepath) -> str | None:
    head = "".join(open(filepath, encoding="utf-8").readlines()[:6])
    m = VER_RE.search(head)
    return m.group(1) if m else None

def tree_entries(design_or_readme_text) -> set:
    """从 ``` 代码块文件树里抽取叶子文件名集合（去注释/缩进/连接符）。"""
    names = set()
    for line in design_or_readme_text.splitlines():
        m = re.search(r"([A-Za-z0-9_\-]+\.md)\b", line)
        if m and ("├" in line or "│" in line or "└" in line):
            names.add(m.group(1))
    return names

def run(target=None) -> Report:
    root = _SKILL_ROOT
    rep = Report(audit="versions", target="VERSIONS.md")
    table = parse_versions_md(os.path.join(root, "VERSIONS.md"))
    # ① 文件头版本 == 台账
    for rel, (ver, dep) in table.items():
        if ver is None:  # 焊点无版本号，跳过
            continue
        actual = head_version(os.path.join(root, rel))
        if actual != ver:
            rep.findings.append(Finding("D13-FR-02", Verdict.FAIL,
                f"{rel} 文件头版本 {actual} ≠ 台账 {ver}",
                measured=actual, threshold=ver,
                fix=f"对齐 {rel} 头部与 VERSIONS.md（语义升级走独立方向，仅同步台账不改字段）"))
    # ② 配套闭合：声明配套 storyboard v2.0 → storyboard 实际须 v2.0
    base_ver = head_version(os.path.join(root, "storyboard", "output-contract.md"))
    for rel, (ver, dep) in table.items():
        if dep and "v2.0" in dep and base_ver != "v2.0":
            rep.findings.append(Finding("D13-FR-02", Verdict.FAIL,
                f"{rel} 声明配套 storyboard v2.0，但基准实为 {base_ver}",
                measured=base_ver, threshold="v2.0", fix="修正配套声明或基准版本"))
    # ③ DESIGN 树 == README 树（条目集合相等）
    d_tree = tree_entries(open(os.path.join(root,"DESIGN.md"),encoding="utf-8").read())
    r_tree = tree_entries(open(os.path.join(root,"README.md"),encoding="utf-8").read())
    only_d, only_r = d_tree - r_tree, r_tree - d_tree
    if only_d or only_r:
        rep.findings.append(Finding("D13-FR-02", Verdict.FAIL,
            f"DESIGN/README 文件树不一致：仅DESIGN有 {only_d}；仅README有 {only_r}",
            measured=sorted(only_d|only_r), threshold="集合相等",
            fix="补齐缺失条目（如 asset-id-convention.md、production-bible.megaprompt.md），两树逐行对齐"))
    rep.assert_fail_has_fix()
    return rep

@register("versions")
def _registered(target): return run(target)
```

> **当前实测会先报 2 条 FAIL**（这正是 D13 要修的现状，修完转 GO）：① DESIGN 树缺 `asset-id-convention.md`（仅 README 有）→ ③ 命中；② DESIGN 树缺 `production-bible.megaprompt.md` 等 → ③ 命中。FR-02 改动落地后两条归零。

### 4.4 `audit_bible_interlock.py`（FR-03）— 四不变量

```python
# tools/audit_bible_interlock.py  — 四互锁不变量（全 PASS 才基线成立）
import re, os
# … 4.0 公共头 …

ID_RE = re.compile(r"\[(Element|Prop|Voice)_[A-Za-z0-9_]+\]")
STATE_RE = re.compile(r"@s(\d+)")                    # 道具状态轴节点 @s1 @s2 …

def collect_ids(text) -> set:
    return set(m.group(0) for m in ID_RE.finditer(text))

def collect_defs(roster_texts) -> dict:
    """roster 中每个 asset 的定义 + L1 硬锚字段快照（用于④锚一致）。"""
    defs = {}
    for t in roster_texts:
        for aid in collect_ids(t):
            defs.setdefault(aid, _extract_L1_fields(t, aid))   # {field: value}
    return defs

def key_assets(roster_texts) -> set:
    """标注"叙事关键"的 asset（roster 字段含『叙事关键』/『key』）。"""
    ...

def states_in_timeline(storyboard_text, prop_id) -> list[int]:
    """道具在分镜时间轴上出现的 @sN 序列（按镜组顺序）。"""
    seq = []
    for shot_block in _iter_shot_blocks(storyboard_text):       # 按镜组切分,保序
        if prop_id in shot_block:
            seq += [int(n) for n in STATE_RE.findall(shot_block)]
    return seq

def run(target) -> Report:
    base_dir = target.baseline_dir   # examples/<案名>-真机基线/
    sb   = open(os.path.join(base_dir,"storyboard.out.md"), encoding="utf-8").read()
    char = open(os.path.join(base_dir,"character-roster.out.md"), encoding="utf-8").read()
    scene= open(os.path.join(base_dir,"scene-roster.out.md"), encoding="utf-8").read()
    props= open(os.path.join(base_dir,"props-roster.out.md"), encoding="utf-8").read()
    rep = Report(audit="bible_interlock", target=os.path.basename(base_dir))

    refs = collect_ids(sb)
    defs = collect_defs([char, scene, props])
    # ① 引用闭合：分镜引用的每个 ID 都能在 roster 找到定义
    dangling = refs - set(defs)
    if dangling:
        rep.findings.append(Finding("D13-FR-03", Verdict.FAIL,
            f"悬空引用 {sorted(dangling)}（分镜引用但 roster 无定义）",
            measured=len(dangling), threshold=0,
            fix="在对应 roster 补定义，或修正分镜里的 asset_id 拼写"))
    # ② 覆盖完整：每个"叙事关键"asset 至少被分镜引用一次
    unused = key_assets([char, scene, props]) - refs
    if unused:
        rep.findings.append(Finding("D13-FR-03", Verdict.FAIL,
            f"未被使用的关键 asset {sorted(unused)}",
            measured=len(unused), threshold=0,
            fix="在分镜引用该 asset，或显式标注 cut（roster 标 [CUT]）"))
    # ③ 道具状态轴单调：@sN 在时间轴上单调不减
    for pid in collect_ids(props):
        seq = states_in_timeline(sb, pid)
        if seq != sorted(seq):
            rep.findings.append(Finding("D13-FR-03", Verdict.FAIL,
                f"{pid} 状态轴非单调：时间轴序列 {seq}",
                measured=seq, threshold="单调不减",
                fix=f"修正 {pid} 在分镜里的 @sN 顺序，或在 props-roster 重排状态节点定义"))
    # ④ 跨镜锚一致：同 asset_id 多镜引用时 L1 硬锚字段零变化
    for aid in refs & set(defs):
        seen = _L1_values_per_shot(sb, aid)            # [{field:val}, …] 每镜一份
        for field in defs[aid]:
            vals = {s.get(field) for s in seen if field in s}
            if len(vals) > 1:
                rep.findings.append(Finding("D13-FR-03", Verdict.FAIL,
                    f"{aid} 的 L1 锚 {field!r} 跨镜漂移：{vals}",
                    measured=sorted(vals), threshold="单值",
                    fix=f"统一 {aid}.{field} 引用上游 roster 硬锚（asset-id-convention L1 不可变）"))
    rep.assert_fail_has_fix()
    return rep

@register("bible_interlock")
def _registered(target): return run(target)
```

> **NFR-01 隔离**：互锁审计产物（`interlock.golden.json` / 报告）只落 `examples/<案名>-真机基线/.audit/`；`verify_install.py` 对四张 `*.out.md` 跑 `leak_scan` 确保审计术语零泄漏（AC-6）。

### 4.5 `audit_megaprompt_sync.py`（FR-04）— sync-source 锚比对

**(A) megaprompt 内联锚格式**（写进 5 个 megaprompt 的内联块头）：

```html
<!-- sync-source: _shared/style-refs.md#名家参考库 | facts: count=283, rules=6 -->
<!-- sync-source: README.md#知识来源 | facts: grounding=44/48 -->
<!-- sync-source: _shared/glossary.md#情感优先六维管线 | facts: dims=6 -->
```

**(B) 脚本逻辑**：

```python
# tools/audit_megaprompt_sync.py
import re, os, glob
# … 4.0 公共头 …

ANCHOR_RE = re.compile(r"<!--\s*sync-source:\s*([^|]+?)\s*\|\s*facts:\s*([^>]+?)\s*-->")

def parse_facts(s) -> dict:
    return dict(kv.split("=", 1) for kv in re.split(r"[,，]\s*", s.strip()) if "=" in kv)

def measure_source(root, src_ref, fact_key) -> str:
    """src_ref='_shared/style-refs.md#名家参考库'；实测该 section 的事实值。
       count: 数该 section 条目数 / 正则抓显式数字；grounding: 抓 'NN/MM'；dims: 抓维度数。"""
    path, _, section = src_ref.partition("#")
    text = open(os.path.join(root, path), encoding="utf-8").read()
    if fact_key == "count":
        m = re.search(r"(\d+)\s*条", text)         # style-refs:60 "283条"
        return m.group(1) if m else "?"
    if fact_key == "grounding":
        m = re.search(r"(\d+/\d+)\s*个影视\s*skill", text)  # README:88 "44/48 个影视 skill"
        return m.group(1) if m else "?"
    ...

def run(target=None) -> Report:
    root = _SKILL_ROOT
    rep = Report(audit="megaprompt_sync", target="_megaprompts/*")
    megas = glob.glob(os.path.join(root, "_megaprompts", "*.megaprompt.md"))
    # ②先校数量 == 5
    if len(megas) != 5:
        rep.findings.append(Finding("D13-FR-04", Verdict.FAIL,
            f"_megaprompts 文件数 {len(megas)} ≠ 5（缺 production-bible.megaprompt.md?）",
            measured=len(megas), threshold=5,
            fix="补 production-bible.megaprompt.md（第 5 个，把全案链路自包含化）"))
    for mp in megas:
        text = open(mp, encoding="utf-8").read()
        for src_ref, facts_raw in ANCHOR_RE.findall(text):
            for k, inlined in parse_facts(facts_raw).items():
                src_val = measure_source(root, src_ref, k)
                if str(src_val) != str(inlined):
                    rep.findings.append(Finding("D13-FR-04", Verdict.FAIL,
                        f"{os.path.basename(mp)} 内联 {k}={inlined} 漂移，源 {src_ref} 实测 {src_val}",
                        measured=inlined, threshold=src_val,
                        fix=f"把 {os.path.basename(mp)} 的 {k} 同步为 {src_val}"))
    rep.assert_fail_has_fix()
    return rep

@register("megaprompt_sync")
def _registered(target): return run(target)
```

### 4.6 `verify_install.py` + `build_skill_pack.py`（FR-05）

```python
# tools/verify_install.py — 一键聚合 FR-01~04 + 两条铁律门；全绿才 exit0（装机烟测门）
import os, sys, glob
# … 4.0 公共头 …
from harness.leak_scan import leak_scan
from harness.portability_scan import portability_scan
from harness import lexicon
from tools.audit_terminology import run as audit_term
from tools.audit_versions import run as audit_ver
from tools.audit_megaprompt_sync import run as audit_sync
from tools.audit_bible_interlock import run as audit_interlock

def _target(**kw):           # 轻量 target 壳
    return type("T", (), kw)()

def main() -> int:
    root = _SKILL_ROOT
    reports = [audit_term(_target(skill_root=root)),     # FR-01
               audit_ver(_target(skill_root=root)),      # FR-02
               audit_sync(_target(skill_root=root))]     # FR-04
    # FR-03：对每个真机基线目录跑互锁 + 对四表跑 leak_scan（NFR-01）
    for base in glob.glob(os.path.join(root, "production-bible", "examples", "*-真机基线")):
        reports.append(audit_interlock(_target(baseline_dir=base)))
        for out in glob.glob(os.path.join(base, "*.out.md")):
            reports.append(leak_scan(open(out, encoding="utf-8").read(),
                                     extra_terms=lexicon.BY_DIRECTION["D13"]))
    # NFR-02：对成员 SKILL/megaprompt 跑可移植性扫描
    for f in glob.glob(os.path.join(root, "**", "*.md"), recursive=True):
        if "/docs/" not in f.replace("\\","/"):
            reports.append(portability_scan(open(f, encoding="utf-8").read()))
    decision = "NO-GO" if any(r.exit_code for r in reports) else "GO"
    for r in reports:
        if r.exit_code: print(r.to_json())
    print(f"=== verify_install: {decision} ({sum(r.exit_code for r in reports)} 个非绿报告) ===")
    return 0 if decision == "GO" else 1

if __name__ == "__main__":
    raise SystemExit(main())
```

```python
# tools/build_skill_pack.py — 出 dist/director-suite-vX.Y.Z.zip + VERSION 戳 + INSTALL.md
import os, zipfile, re, hashlib
# … 4.0 公共头 …

def suite_version(root) -> str:
    """套件版本 = storyboard 基准契约版本（v2.0）作主版，叠产品化补丁号。
       从 VERSIONS.md 末行/专用 'suite:' 行读，单一来源。"""
    txt = open(os.path.join(root, "VERSIONS.md"), encoding="utf-8").read()
    m = re.search(r"suite:\s*(v\d+\.\d+\.\d+)", txt)
    return m.group(1) if m else "v0.1.0"

EXCLUDE = ("/docs/", "/dist/", "/.audit/", "__pycache__", ".pyc")

def main() -> int:
    root = _SKILL_ROOT
    # 先跑 verify_install——不绿不打包（FR-05：无脚本绿则不签发）
    from tools.verify_install import main as verify
    if verify() != 0:
        print("verify_install 非绿，拒绝打包"); return 1
    ver = suite_version(root)
    open(os.path.join(root, "VERSION"), "w", encoding="utf-8").write(ver + "\n")
    out = os.path.join(root, "dist", f"director-suite-{ver}.zip")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for dirpath, _, files in os.walk(root):
            if any(x in dirpath.replace("\\","/") for x in EXCLUDE): continue
            for fn in files:
                fp = os.path.join(dirpath, fn)
                if any(x in fp.replace("\\","/") for x in EXCLUDE): continue
                z.write(fp, os.path.relpath(fp, os.path.dirname(root)))
    print(f"打包完成: {out}  (VERSION={ver})")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
```

> **版本戳一致性（AC-5③）**：zip 内 `VERSION` 文件内容由 `suite_version()` 单一来源（VERSIONS.md 的 `suite:` 行）产生，`audit_versions.py` 可加一条断言 `VERSION == suite_version(VERSIONS.md)`，杜绝双写漂移。

---

## 5. 任务拆解（Tickets）

| Ticket | 描述 | 产物 | 工时(人天) | 前置 |
|---|---|---|---|---|
| D13-T01 | 写 `glossary.md` 三概念五列表；实测核对三处混用（48/44/5、情绪/情感六维）并定 canonical | `_shared/glossary.md` | 0.5 | — |
| D13-T02 | 收敛门面措辞：DESIGN:139 / README:58,88 / dimensions:1 / storyboard.megaprompt:21 改挂 glossary（仅称谓/计数，零语义） | 4× .md(改) | 0.5 | T01 |
| D13-T03 | DESIGN 文件树补 `asset-id-convention.md`（7→8）+ `production-bible.megaprompt.md`（4→5），与 README 逐行对齐 | `DESIGN.md`(改) | 0.25 | — |
| D13-T04 | 写 `VERSIONS.md` 对版矩阵（8 行，实测版本号填充）+ `suite:` 行 | `VERSIONS.md` | 0.25 | — |
| D13-T05 | 实现 `audit_terminology.py`：load_glossary/scan_file/run/@register；docs 自指豁免；词边界正则 | `tools/audit_terminology.py` | 1.0 | T01 |
| D13-T06 | 造 `D13_terminology.{clean,poison}.md`（poison=误写"五维管线"+48/44并存）；写 assert_gate_is_real | 2× fixtures + 测试 | 0.5 | T05 |
| D13-T07 | 实现 `audit_versions.py`：三件校验（头==台账/配套闭合/DESIGN==README 树）；@register | `tools/audit_versions.py` | 1.0 | T03,T04 |
| D13-T08 | 造 `D13_versions.{clean,poison}/`（poison=props 头 v1.1 vs 台账 v1.0）；assert_gate_is_real | 2× fixtures + 测试 | 0.5 | T07 |
| D13-T09 | 补 `production-bible.megaprompt.md`（第 5 个）；为 5 个 megaprompt 加 sync-source 锚 | 1 新 + 5 改 megaprompt | 1.0 | T01,T03 |
| D13-T10 | 实现 `audit_megaprompt_sync.py`：ANCHOR_RE/measure_source/数量==5/@register | `tools/audit_megaprompt_sync.py` | 1.0 | T09 |
| D13-T11 | 造 `D13_megaprompt_sync.{clean,poison}.md`（poison=count 283→284 不同步）；assert_gate_is_real（T3 反证） | 2× fixtures + 测试 | 0.5 | T10 |
| D13-T12 | **选真实剧本**（含 ≥1 状态轴道具 + ≥2 跨镜复用 asset）；跑 production-bible 全案四表，落 `examples/<案名>-真机基线/` + manifest（选案理由/剧本指纹） | 4× .out.md + manifest.md | 1.5 | T04 |
| D13-T13 | 实现 `audit_bible_interlock.py`：四不变量；对真机基线 run→GO 后 snapshot.freeze 出 `interlock.golden.json`；@register | `tools/audit_bible_interlock.py` + golden | 1.5 | T12 |
| D13-T14 | 造 `D13_interlock.{clean,poison}/`（poison 三变体：删 prop 定义/状态轴逆序/L1 锚漂移）；assert_gate_is_real（T4 反证） | 2× fixtures + 测试 | 0.75 | T13 |
| D13-T15 | `lexicon.py` 注册 `BY_DIRECTION["D13"]`；NFR-01 leak_scan 专项 + 反证（真机分镜表注入"互锁审计✓"必报命中） | `lexicon.py`(改) + leak 测试 | 0.5 | T12 |
| D13-T16 | 实现 `verify_install.py`：聚合 FR-01~04 + leak_scan + portability_scan；exit0/1 | `tools/verify_install.py` | 0.75 | T05,T07,T10,T13 |
| D13-T17 | 实现 `build_skill_pack.py`：verify 不绿不打包 → zip + VERSION 戳 + 排除规则；写 `INSTALL.md`（装机烟测清单） | `tools/build_skill_pack.py` + `INSTALL.md` | 0.75 | T16 |
| D13-T18 | 跑 luban 五动作三把尺（结构尺=审计绿/实测尺=反证/活体尺=真机基线）；出 `luban-report.md` + `cert-card.md`（逐条引 AC-1~7 脚本输出） | `docs/luban-report.md` + `docs/cert-card.md` | 0.75 | T17 |
| D13-T19 | 装机烟测：zip 解压到全新空目录 → `verify_install.py` 全绿（验 NFR-02 可移植 + AC-5/AC-7） | 烟测记录 | 0.25 | T17 |

> 合计约 **15.75 人天 ≈ 3.15 人周**（PRD §10 粗估 2.0 人周——差额主因：本方案把"反证 fixture 对+测试"逐闸显式拆出（完善⑥），以及 T12 真机选案/端到端含人工兜底）。关键路径 **T01→T05→T07→T09→T10→(T12→T13)→T16→T17→T18**。T12/T13（真机基线）可与 T05~T11（口径/同步门）并行。

---

## 6. 测试方案

### ① 正例（clean 基线：用哪份，期望 GO）

| 闸 | clean 基线 | 期望 |
|---|---|---|
| FR-01 术语 | `D13_terminology.clean.md`（全 canonical 称谓）；以及**修完后的全仓门面** | `audit_terminology→GO, exit0`，0 违规 |
| FR-02 版本 | `D13_versions.clean/`（头==台账）；以及**修完后的真仓 VERSIONS+DESIGN+README** | `audit_versions→GO`，无失配、两树集合相等 |
| FR-03 互锁 | `examples/<案名>-真机基线/` 四表（T12 真机产物） | `audit_bible_interlock→GO`，四不变量全 PASS；该报告 `snapshot.freeze` 为 `interlock.golden.json` |
| FR-04 同步 | `D13_megaprompt_sync.clean.md`（facts 与源一致）；以及真仓 5 个 megaprompt | `audit_megaprompt_sync→GO`，0 漂移、文件数==5 |

### ② 反向注入（poison fixture：具体投毒什么，期望 FAIL，期望测回值）

| 用例 | 投毒动作（精确，接地实测数据） | 期望判定 | 期望测回值（硬核对） |
|---|---|---|---|
| **T1 术语** | `D13_terminology.poison.md` 把内部推理管线写成「**五维管线**」（canonical 应「情感优先六维」）；并令「**48 个影视skill**」与「**44**」在同文件并存 | `audit_terminology` **FAIL** | 测回 `measured="五维"`、`threshold="情感优先六维"`；违规计数 ≥1；`decision=NO-GO, exit1` |
| **T2 版本** | `D13_versions.poison/` 把 `props-roster.md` 头从 **v1.0→v1.1**，但 `VERSIONS.md` 仍记 v1.0 | `audit_versions` **FAIL** | 测回 `measured="v1.1"`、`threshold="v1.0"`、`detail` 指明 `props-roster.md`；NO-GO |
| **T3 同步** | `D13_megaprompt_sync.poison.md` 源 `style-refs.md` 写 **283条**，megaprompt 内联锚写 **count=284** | `audit_megaprompt_sync` **FAIL** | 测回 `measured="284"`、`threshold="283"`；NO-GO |
| **T4 互锁** | 在真机基线分镜表故意**删一个 prop 定义**（如 `[Prop_玉佩_01]` 从 props-roster 移除但分镜仍引用） | `audit_bible_interlock` **FAIL**（①引用闭合） | 测回 `measured=1`(悬空数)、`threshold=0`、`detail` 列出 `[Prop_玉佩_01]`；NO-GO |
| **T4b 互锁·状态轴** | 把某道具在分镜里 `@s2` 排到 `@s3` 之后（时间轴逆序） | `audit_bible_interlock` **FAIL**（③状态轴单调） | 测回序列 `[1,3,2]`、`threshold="单调不减"`；NO-GO |
| **T4c 互锁·锚漂移** | 同一 `[Element_*]` 在两镜的 L1 锚字段（如发色 `#1A1A1A`）一处改 `#2A2A2A` | `audit_bible_interlock` **FAIL**（④锚一致） | 测回 `{'#1A1A1A','#2A2A2A'}`、`threshold="单值"`；NO-GO |
| **T-LEAK 隔离** | 真机基线分镜表里注入一行「**互锁审计✓ GO**」 | `leak_scan` **FAIL** | 命中 `互锁审计`（属 `BY_DIRECTION["D13"]`）；`exit1`，证明隐身闸是真闸 |

> 真值由 poison fixture 显式注入（如 283→284 是精确字符串改动），故"测回值 == 注入值"可逐项核对——这是"门会真的拦截"的硬证据（完善⑥），非主观感受。

### ③ `assert_gate_is_real` 调用示例

```python
# tests/test_d13.py
from harness.reverse_test import assert_gate_is_real
from tools.audit_terminology import run as audit_term
from tools.audit_versions import run as audit_ver
from tools.audit_megaprompt_sync import run as audit_sync
from tools.audit_bible_interlock import run as audit_interlock

def _target(**kw): return type("T", (), kw)()

def test_d13_terminology_gate_is_real():
    clean  = _target(skill_root="_shared/scripts/fixtures/D13_terminology.clean")   # 指向 clean 小仓
    poison = _target(skill_root="_shared/scripts/fixtures/D13_terminology.poison")
    assert_gate_is_real(audit_term, clean, poison, name="D13-terminology")

def test_d13_versions_gate_is_real():
    assert_gate_is_real(audit_ver,
        _target(skill_root=".../D13_versions.clean"),
        _target(skill_root=".../D13_versions.poison"), name="D13-versions")

def test_d13_sync_drift_value():               # T3 真值核对：测回 283 vs 注入 284
    rep = audit_sync(_target(skill_root=".../D13_megaprompt_sync.poison"))
    drift = next(f for f in rep.findings if f.check=="D13-FR-04")
    assert drift.verdict.value=="FAIL" and drift.measured=="284" and drift.threshold=="283"

def test_d13_interlock_gate_is_real():         # T4 删 prop 定义 → 悬空引用报红
    assert_gate_is_real(audit_interlock,
        _target(baseline_dir=".../D13_interlock.clean"),
        _target(baseline_dir=".../D13_interlock.poison"), name="D13-interlock")
```

### ④ 回归：冻结哪份黄金基线，改什么后重跑应如何

- **冻结**：`examples/<案名>-真机基线/.audit/interlock.golden.json` = T12 真机四表跑 `audit_bible_interlock` 的全 PASS/GO 报告，`snapshot.freeze(interlock_report, golden_path)`。这是"推荐入口"过去**唯一缺的回归锚**。
- **改后重跑（核心回归场景）**：当**任一上游表被改**（如 props-roster 升 v1.1、scene-roster 加场景、分镜增镜组）后，对**同一真机基线目录**重跑 `audit_bible_interlock`，`diff_against_golden(current, golden_path)`：
  - **断言"互锁仍闭合、无新增 FAIL"**——缺口类 C 的"对基线 X 重跑、Y 项无 ⚠️"。改了上游若导致悬空/非单调/锚漂移 → 报红，**改之前就被抓**（而非发布后用户发现）。
  - JSON 逐字节比对（判定区零时间戳）：diff=0 → 绿；有意改进（如新增一个合法 asset）→ `WARN` 人审后 `re-freeze`；意外漂移 → 回滚。
- **口径回归（FR-01/02/04）**：`audit_terminology` / `audit_versions` / `audit_megaprompt_sync` 本身即回归——每次改门面文档后重跑，**diff 由人眼判断降级为脚本判定**（迁移自电商全案"量化审计"范式：术语命中数=0 / 版本失配数=0 / 漂移数=0）。
- **铁律 grep（AC-6）**：对真机基线四张 `*.out.md` 跑 `leak_scan(final_text, extra_terms=BY_DIRECTION["D13"])`，产品化过程词（`术语审计|对版矩阵|互锁审计|出师证书|sync-source`）+ 引擎术语（`方法论|支柱|默会|格式塔`）命中 **= 0**；反证 T-LEAK（注入一行"互锁审计✓"）→ 必报命中。

### ⑤ 真机那一层怎么验（付费由用户点）

- **FR-03 文字四表（D13 自动路径，零付费）**：T12 选真实剧本，跑 production-bible 全案**文字**四表（角色/场景/道具/分镜），这一步**不调计费模型**，由跑 skill 完成，落基线。`audit_bible_interlock` 四不变量布尔校验是主要验证手段。
- **视觉资产（人工门，付费由用户亲点）**：若要给真机基线补角色设定板/关键帧出图（验证四表能驱动出图），属 character-board/keyframe 出图步——**计费、由用户亲点**，**不在 D13 自动路径内**（N4）。manifest.md 把"需付费步骤"显式标注为人工门。
- **luban 活体尺（FR-05）**：出师的"活体对账"= 拉 T12 真机产物逐项对账（四不变量布尔 + 引擎隐身检），而非"看着像对"。这是 luban"绿色 CI 会撒谎、要拉真实产物对账"的直接落地，写进 `luban-report.md`。

---

## 7. 里程碑与退出门

| Milestone | 产物 | 退出门（哪些脚本必须绿 / 哪些 DoD 必须过） |
|---|---|---|
| **M0 步行骨架（~0.3 周）** | `glossary.md` 最小版（仅"六维 vs 八维"两概念）+ `audit_terminology.py` 最小版 + 1 poison（"五维管线"） | 对修后门面 `run→GO,exit0`；poison `audit→FAIL,exit1,测回"五维"`；`assert_gate_is_real` 双过；`@register`→`run_eval` 打印 GO/NO-GO。**证明"文档域的秤"能转**——这是 D13 版的 00-SUBSTRATE §6 步行骨架。 |
| **M1 口径地基（FR-01+FR-02，~0.6 周）** | `glossary.md` 全 + `VERSIONS.md` + 门面措辞/文件树收敛 + `audit_terminology.py` + `audit_versions.py` + 两对 fixture | **AC-1**（术语 0 违规、`D02/D08-NFR-05` 混用归零）、**AC-2**（DESIGN 树==README 树、版本台账无 ⚠️、记录数==8）全绿；T1/T2 反证报红 |
| **M2 同步门（FR-04，~0.4 周，可与 M3 并行）** | `production-bible.megaprompt.md`（第 5 个）+ 5 megaprompt 加 sync-source 锚 + `audit_megaprompt_sync.py` + T3 反证 | **AC-4**（`_megaprompts`=5、0 漂移、283→284 必报红）绿 |
| **M3 真机基线（FR-03，~0.8 周）** | T12 真机四表 + manifest + `audit_bible_interlock.py` + `interlock.golden.json` + T4/T4b/T4c 反证 + lexicon 注册 | **AC-3**（四不变量全过、分镜表过引擎隐身检 0 泄漏）、**AC-6**（四 `*.out.md` leak_scan=0、T-LEAK 报红）绿 |
| **M4 出师与打包（FR-05，~0.5 周，聚合门）** | `verify_install.py`（聚合四审计）+ `build_skill_pack.py`（zip+VERSION）+ `INSTALL.md` + luban `luban-report.md` + `cert-card.md` + 装机烟测 | **AC-5**（解压空目录 verify 全绿、zip VERSION==VERSIONS）、**AC-7**（仅标准库、全套审计 <10s、换空目录可跑）绿 |

> **MVP 切线 = M0+M1+M2**：术语收敛 + 版本台账 + 同步门是纯文本扫描，技术风险最低、影响面最广，是"可验证产品化外壳"的核心，优先于 M3 真机基线（需人工选案/端到端）。**关键路径** M0→M1→M4；M2 与 M3 可并行，M4 是聚合门（前四里程碑的审计脚本是它的输入）。**退出门即合入门**：任何动 `_shared/`/契约/megaprompt 的 PR 必过 `verify_install.py` 全绿才许合（完善④，不可绕过）。

---

## 8. 风险与回滚

| 风险 | 影响 | 缓解 / 回滚 / 降级 |
|---|---|---|
| **R1 术语收敛改坏 Soul 措辞**（为统一称谓误改 tacit-core 推理逻辑） | 破引擎、破隐身 | NFR-01 铁律：`tacit-core.md` 仅**只读核对**、预期零改；`audit_terminology` 只校"对外称谓"不碰算子；改动经引擎隐身检（tacit-core §四.6）兜底。**回滚**：术语改动均是孤立措辞替换，逐文件 revert 无连带。 |
| **R2 audit_terminology 对自指文档误报**（docs/ 里讨论"5维/8维"本身命中别名） | 假阳性、脚本不可用 | §4.2 **docs 自指豁免**：脚本 glob 排除 `docs/optimization/**` 与 `examples/`，只扫对外门面；glossary 注脚写明该边界。**回滚**：若豁免规则漏排，加路径到 EXCLUDE 即可，不改判据。 |
| **R3 审计产物漏进成片**（`.audit/` 或台账被误拼进 megaprompt/四表） | 破隐身铁律 | NFR-01 物理隔离（产物只落 `docs/`/`tools/`/`.audit/`）+ AC-6 对四 `*.out.md` leak_scan + T-LEAK 反证；sync-source 锚仅是 HTML 注释，复制成片时不入正文。**反证 T-LEAK 是真闸证明**。 |
| **R4 真机基线选案不具代表性**（选太简单剧本，四不变量"假过"） | 回归锚虚弱 | T12 选案**硬约束**：≥1 个有 `@sN` 状态轴的叙事道具（触发③）+ ≥2 个跨镜复用 asset（触发④）+ 至少一处"叙事关键但易漏引"asset（触发②）；manifest 记录选案理由，逐条对应四不变量被触发。 |
| **R5 megaprompt 同步门维护成本**（每改 `_shared/` 要手动同步 5 个单文件） | 维护负担 | sync-source `facts:` 只校"关键事实"（版本/计数/称谓）而非全文，同步面小；脚本报红即定位到**具体 megaprompt + 具体 fact**，不必全文 diff；可后续把"同步源→megaprompt 内联值"做成半自动回填脚本（D13 不强求，留增量）。 |
| **R6 版本矩阵与文件头双写漂移**（VERSIONS 与文件头各填各的） | 台账失真 | `audit_versions` 把"文件头==台账"做硬校验，双写不一致即 NO-GO，从机制上禁漂；`VERSION` 戳由 `suite_version(VERSIONS.md)` 单一来源，杜绝 zip 与台账漂移。 |
| **R7 luban 出师流于形式**（拿证书没真验） | 假发布 | `cert-card.md` 的"通过项"必须**逐条引用 AC-1~7 的脚本输出**（如"AC-3 互锁四不变量：见 interlock.golden.json 全 PASS"）；`build_skill_pack.py` 内置"verify 不绿不打包"，无脚本绿则证书不签发。 |
| **R8 宿主无 Python**（最坏降级） | 审计脚本跑不起 | **NFR-02 降级路径**：glossary/VERSIONS/megaprompt 是**纯 Markdown**，口径单一真相**永远可用**（人工对照亦可）；审计脚本是**可选确定性加固**——缺 Python 时口径靠 glossary 人审、版本靠 VERSIONS 人对、互锁靠 manifest 人查。**产品化护栏仍在**，只丢"自动布尔门"。脚本仅依赖标准库（无 Pillow/numpy），降级面比 D5/D8 更小。 |

**宿主能力缺失的降级总线（NFR-02）**：D13 是**纯文本域**方向，对宿主能力依赖最低——`tools/*.py` 仅需 Python 标准库（连 Pillow/numpy 都不要），换到任意空 skills 目录即可跑（AC-7/T19 验证）。最坏情况（无 Python）退到"glossary/VERSIONS/manifest 三份纯 .md 由人/模型对照"的人审模式，**单一真相 + 版本台账 + 选案理由**仍在，只丢逐字节可复现的自动回归门。

---

> **契约版本**：DEV-D13 v0.1 ｜ 缺口类 C（无秤无回归）｜ 优先级 P2 ｜ register 名 `terminology`/`versions`/`bible_interlock`/`megaprompt_sync` ｜ 接 00-ENGINEERING-SUBSTRATE.md 全套 harness（audit_report / leak_scan+lexicon / snapshot / reverse_test / run_eval；**不引 registry**——纯文档域零付费）。**D13 是其它方向的产品化地基**：`VERSIONS.md` + 四审计门一旦建立，后续任何方向新增成员/升级契约都应进矩阵、过审计门，建议优先于大规模新增成员落地，否则新增物又会绕过秤。承接执行 `D02-NFR-05`/`D08-NFR-05` 悬空的"情感优先六维口径统一"——把"PRD 里的话"变成"glossary 里的事实 + 可回归的术语审计"。不新增创作能力、不动 Soul（引擎隐身/可移植双不破）。
