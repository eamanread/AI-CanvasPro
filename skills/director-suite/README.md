# 导演套件 · Director Suite（专业导演分镜 skill 家族）

把"20 年导演的默会手感"做成一台**内部推理引擎**：先读懂剧本的情感与氛围，再用一套**接地于 44 个真实影视 skill + 14 张默会大表**的可量化电影专业知识，把"感觉"翻译成 场面/景别/运镜/光影/色彩/表演/声音，最后按**固定镜头卡契约**输出可直接喂给 **Seedance 2.0** 等文生视频模型的"哇塞提示词"——而引擎本身永远隐身。

> 设计答卷见 [`DESIGN.md`](DESIGN.md)：三层架构、6 步管线、质量 rubric、worked example。

---

## 三层架构（Soul / Bone / Skin）

| 层 | 角色 | 文件 |
|---|---|---|
| ① 灵魂 · 默会内核 | 理解情感氛围、做强选择、自检（**只在内部跑，绝不输出**） | `_shared/tacit-core.md` |
| ② 骨 · 导演知识库 | 把"感觉"翻成专业参数（情绪×视听 映射 + 五大维度知识 + 参数 + 风格库） | `_shared/mapping-tables.md`、`dimensions.md`、`pro-params.md`、`style-refs.md`、`continuity-quality.md` |
| ③ 皮 · 输出契约 | 锁字段格式、保哇塞、防劣化 + 模型适配 | `<成员>/output-contract.md`、`_shared/seedance-2.0.md` |

**铁律**：先定"感觉"再定"做法"；单一主情绪锚（多锚=废稿）；引擎隐身（输出零哲学术语）。

---

## 家族成员

**🎯 全案一次生成（推荐入口，制片圣经驱动）** — 设计蓝图见 [`DESIGN-production-bible.md`](DESIGN-production-bible.md)

| 成员 | 目录 | 做什么 |
|---|---|---|
| 全案一次生成 | [`production-bible/`](production-bible/) | 剧本 → **角色表 + 场景表 + 道具表 + 分镜表** 四张互锁表一次产出；三表先把"谁/在哪/用什么"钉成 asset_id 硬锚，分镜逐项引用 → 跨镜一致从结构上保证 |

**📚 制片圣经（文字台账 · 上游锚，被分镜以 asset_id 引用）**

| 表 | 文件 | 锁什么 |
|---|---|---|
| 📇 角色表 | [`production-bible/character-roster.md`](production-bible/character-roster.md) | 身份/外貌/服化/体型/音色 + 着墨等级 + 情感弧光（`[Element_*]`/`[Voice_*]`，L1/L2） |
| 🗺 场景表 | [`production-bible/scene-roster.md`](production-bible/scene-roster.md) | 空间几何/地标/光位/色温母色/情绪功能（`[Element_*_Tag]`，L1/L2） |
| 🔪 道具表 | [`production-bible/props-roster.md`](production-bible/props-roster.md) | 外观/独特标记/**状态变化轴**/叙事功能（`[Prop_*]`，L1/L2） |

**🎞 单产物成员（要单独一样东西时走这里）**

| 成员 | 目录 | 做什么 |
|---|---|---|
| 🎬 导演分镜（核心） | [`storyboard/`](storyboard/) | 剧本/片段 → 分镜镜头卡 + Seedance 成片提示词 |
| 🧍 角色设定板 | [`character-board/`](character-board/) | 把角色表条目 → 多视图角色视觉设定板图（视觉生成） |
| 🎨 场景色卡/色板 | [`color-palette/`](color-palette/) | 情绪/场景 → 主辅点缀色板 + 色温光比影调 |
| 🖼 关键帧 | [`keyframe/`](keyframe/) | 镜头卡 → 首帧/尾帧/动作落点高精度静帧（继承角色+色卡） |

**两层分工**：制片圣经 = **文字台账**（谁/哪/什么 + 锁定值 + asset_id）；角色设定板/色卡/关键帧 = **视觉生成**（把台账条目画成图）。全案先出文字圣经 + 分镜，视觉资产按需下游生成。`asset_id` 全套约定见 [`_shared/asset-id-convention.md`](_shared/asset-id-convention.md)。

---

## 目录结构

```
director-suite/
├── README.md / DESIGN.md / DESIGN-production-bible.md
├── _shared/                  # 家族共享知识(8件)
│   ├── tacit-core.md         # 默会推理内核(灵魂)
│   ├── mapping-tables.md     # 情绪×视听 主映射表(查表核心)
│   ├── dimensions.md         # 五大维度导演知识库(接地自44 skill)
│   ├── pro-params.md         # 参数词表(焦段/光圈/色温光比/帧率画幅/胶片)
│   ├── style-refs.md         # 风格语汇 + 283条名家参考 + 哇塞招式库
│   ├── continuity-quality.md # 连续性/质量/反向锚定
│   ├── asset-id-convention.md# 资产ID与一致性约定([Element_]/[Prop_]/[Voice_]·L1L2·交叉引用)
│   └── seedance-2.0.md       # Seedance 2.0 模型适配层
├── production-bible/ SKILL.md(全案总控) + character-roster.md + scene-roster.md + props-roster.md
├── storyboard/   SKILL.md + output-contract.md + examples/
├── character-board/  SKILL.md + output-contract.md
├── color-palette/    SKILL.md + output-contract.md
├── keyframe/         SKILL.md + output-contract.md
└── _megaprompts/     各成员“单文件 mega-prompt”导出版(即拿即用)
```

---

## 两种用法

**A. 作为 Agent Skill（推荐，可维护、DRY 共享知识）**
把整个 `director-suite/` 放进你的 skills 目录（如全局 `C:\Users\Administrator\.claude\skills\` 或项目 `.claude/skills/`），各成员 `SKILL.md` 的 frontmatter 会被自动索引。对 Claude 说"把这段剧本做成分镜"即可触发，它按 6 步管线工作、按需读 `_shared/`。

**B. 作为单文件 mega-prompt（即拿即用）**
打开 `_megaprompts/<成员>.megaprompt.md`，整段复制，粘贴到 Seedance 2.0 / 任意对话框作为系统提示词，再贴上你的剧本即可。自包含、无需安装。

---

## 关键设定（本版）

- **目标模型**：Seedance 2.0 为主（`{语言:台词}`/`<音效>`/`(BGM)`/`【标题】`、单镜 4–15s、首尾帧、参考音色、多机位镜内切换、禁壁钟式时间切分）。换 Kling/即梦/Veo/Sora 可另建 `_shared/<model>.md` 适配层。
- **输出语言**：中文为主 + 关键提示词附英文（人看中文、模型吃英文）。
- **知识来源**：默会方法论蒸馏自 `2026提示词.docx` 的 14 张默会大表；导演专业知识接地抽取自 44/48 个影视 skill（4 个因网络中断未纳入，同类已覆盖）。

---

## 维护

- 知识库是数据，提示词是语法，三层解耦：要升级"哇塞度"改 `_shared/style-refs.md` 与映射表；要换模型加适配层；要加成员复制一个成员目录。
- 想进一步打磨/产品化/发布，可走 `luban`（鲁班 Skill 打磨工坊）。
