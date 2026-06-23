# D12 · 作者论保真 + 题材禁用触发词库（Auteur Fidelity & Genre Trigger-Word Ban List）

> 编号 D12 ｜ 缺口类 D（覆盖与品味）｜ 优先级 P2 ｜ 状态 Draft v0.1 ｜ 落地可靠性自评 3/5

---

## 1. 问题陈述 Problem

**现状（引 director-suite 具体文件）：**

director-suite 已经攒齐了"作者论锚定"的**意识与原料**，但既没把强风格压到**保真满档**，也没把"哪些词会带偏题材气质"沉成**可消费的禁用/改用词表**。具体落点：

- **`_shared/style-refs.md §五「名家与片名参考库」（line 98–113）**：只有一张 7 行的"气质 → 名家/影片锚"对照表（黑色/犯罪→`David Fincher, inspired by Se7en`；对称冷幽默→`Wes Anderson symmetry, pastel palette` 等）。它给了"借谁的眼睛"，但**每个锚只有一句风格名 + 一个泛色板词**，没有把该作者**真正辨识度所在的物理可见特征**（韦斯·安德森：正交平移机位 / 中心对称 / Futura 字体 / 1:1.85 平面化构图 / 糖粉玫红薰衣草紫色板）压成**强制锚组**。结果是"写了 `Wes Anderson` 但出来不像韦斯"——锚是**口号级**，不是**保真级**。
- **`_shared/style-refs.md §五「取锚原则」(line 112)**：明文"锚是基准不是抄袭——借其光质/色相/构图秩序/节奏惯例"。方向正确，但这句**只给了原则、没给清单**：到底哪几样"借了就像、不借就不像"，从未逐作者落成"作者锚（必带）"。
- **`_shared/style-refs.md §十「常见错误 / 禁止项」（line 168–183）**：这是当前**唯一**的"禁用"载体，但它是**题材无关的通用反面清单**（❌ 泛风格名代替作者锚、❌ 空洞修辞、❌ 多色相冲突…）。它**不回答**"在**这个具体题材**里，哪个词会把气质带偏、该换成哪个词"——即方向简报所说"题材禁用触发词只有雏形"的实证：有"别犯的通用错"，**没有"按题材的词级黑名单 + 改用词"**。
- **`_shared/style-refs.md 附录A（line 189）**：283 条名家/影片/镜头/色彩参考的**去重大表**，里面已经**点名**了韦斯·安德森《布达佩斯大饭店》(糖粉玫红·薰衣草紫·奶油白)、《法兰西特派》、邵氏电影(Shaw Brothers)80年代港片武侠美学、日系平成胶片(Kodak Gold 200 暖 / Fuji Pro 400H 冷柔)。**原料齐全**，但它是**线性堆叠的词库**，**没有结构化成"作者→{作者锚必带, 禁用触发词→改用词}"的可消费条目**——可被检索、可被注入、可被审计的结构缺失。
- **`_shared/style-refs.md 附录B「哇塞招式库」（line 194–237）**：按来源 skill 分组列了 HappyHorse 东亚文艺片（声画分离/情绪前置后置/只拍手不拍脸/光束浮尘…）、GTA6、AI 短剧、邵氏、韦斯·安德森的**正面招式**。这是**最接近保真锚**的现成原料，但它**只列"该做什么招"，不列"该作者/该题材里哪些词会反招（带偏）+ 换成什么"**——保真是单向的（正面招式），缺**负向闸（禁用触发词）**这条腿。

**痛点（为何是问题）：**

1. **强风格"写了不像" → 作者论保真没压满**：当前 `Wes Anderson` 锚只到"对称 + pastel"。模型对一个**口号级**锚的复现度，远低于对一个**6–8 项物理特征锚组**（正交机位 / 中心对称 / 平面化 1:1.85 / Futura 标牌 / 糖粉玫红薰衣草紫 / 章节卡 / 微缩平移）的复现度。锚越具体越保真——这正是 §五「取锚原则」想要、却没落到清单的东西。
2. **禁用触发词缺位 → 气质被"中性好词"悄悄带偏**：很多词在**通用语境**是褒义（"cinematic"/"高级感"/"唯美柔光"/"electric neon"），但在**特定题材**会反噬气质——东亚文艺片里写 "cinematic dramatic lighting" 会把"克制自然光"带成"商业三点光"；邵氏武侠里写 "realistic motion blur / drone shot" 会把"硬切定格 + 实拍棚味"带成"现代航拍数字感"。§十只有通用反面清单，**抓不到这种题材专属的"好词陷阱"**，更没给"换成哪个词"。
3. **原料在库、结构缺失 → 不可检索 / 不可注入 / 不可审计**：附录A/B 已经**点名**了韦斯、邵氏、日系、HappyHorse 的特征与招式，但它们躺在**线性长表**里，agent 写某题材时**无法一键取到"这个作者/题材的{必带锚 + 禁用词→改用词}"**，也无法在出稿后**审"有没有踩禁用词、有没有漏作者锚"**。能力在场，**形态不可用**。
4. **品味类难数值验 → 没有回归参照就会反复退化**：作者保真属"像不像"的品味判断，天然难给硬阈值。若不建立"**基线对图 + 人评 A-B**"的可重复判据，每次升级（改映射表 / 调色板 / 换图像模型）都**无法证明"韦斯还像韦斯、邵氏还像邵氏"**，强风格会在迭代中悄悄滑回"泛风格泥浆"。这正是缺口类 **D（覆盖与品味）** 的两难：要覆盖足够多强风格、又要在难数值验的前提下守住"像"。

---

## 2. 证据与接地 Evidence

**哪些源 skill 有此能力（点名）：**

- **HappyHorse 东亚文艺片（附录B 已收·保真锚母范式）**：附录B 明列其招式——"声画分离 / 情绪前置·后置（拍爆发前一秒或之后）/ 只拍手不拍脸（`close-up of aged hands…no face visible`）/ 符号物件状态序列 / 光束浮尘 `dust particles floating in the light beam` / 暖调向轻微过曝渐隐 / 呼吸结构剪辑 / 允许不完美 `imperfect composition, film grain, lived-in` / 背后视角 / 本地人日常视角而非旅游宣传片视角"。这一组就是"东亚文艺片"**作者锚（必带）**的现成清单；其反面（"旅游宣传片视角""商业修图精致感"）天然就是**禁用触发词**的种子。
- **韦斯·安德森（附录A 已点名·强风格保真母范式）**：附录A 列 `韦斯·安德森《布达佩斯大饭店》(糖粉玫红·薰衣草紫·奶油白)、《法兰西特派》(黑白基底+饱和色块)、《犬之岛》(褪色哑光+暖琥珀)、《天才一族》(芥末黄·焦糖棕·橄榄绿)、《月升王国》(秋叶橙·苔藓绿·沙黄)、Futura字体(全局几何无衬线)、Art Deco字体、35mm film`。这是把"`Wes Anderson` 口号"升级为"**逐影片色板 + 字体 + 画幅**保真锚组"的直接原料。
- **邵氏武侠（附录A 已点名）**：`邵氏电影(Shaw Brothers)80年代港片武侠美学、古筝/琵琶(港式武侠配乐器色)、35毫米胶片`——同理可压成"邵氏锚组（硬切定格 / 棚拍布景 / 浓墨重彩色 / 古筝琵琶 / 35mm 棚味）"，其反面（航拍 / 数字慢镜 / 自然外景）即禁用触发词。
- **日系平成青春（附录A + §六 已点名）**：`Kodak Gold 200(暖调胶片)、Fuji Pro 400H(冷柔调胶片)、AKB48 平成黄金年代、平成胶片+纪录片偷拍青春`（§六 line 126 亦有"逆光过曝 + 发丝 catching sunlight + 光束浮尘 + analog warmth"）——压成日系锚组，反面（数字锐利 / HDR / 现代调色）即禁用触发词。
- **电商全案 skill（量化审计母范式·结构借鉴）**：方向简报点名其"量化一致性审计（轮廓±5% / HSL 色相±15° / LOGO Δ0.05 / 白底 RGB≥245）"。本案**不照搬其数值**（作者保真难数值验），但**借其"结构化条目 + 可对图核验报告"形态**：把保真做成"作者锚命中率 + 禁用词命中数"的**轻量审计表**，而非纯文字自报。
- **§五「取锚原则」自身（line 112）**：套件**已经认定**"锚是基准、要借光质/色相/构图秩序/节奏惯例"——本案就是把这条原则**从一句话落成逐作者清单**，是套件既有意图的兑现，不是外来发明。

**director-suite 盲点落在哪个文件/成员：**

- **盲点根源**：`_shared/style-refs.md` 把"作者锚"停在 §五 的**口号级一行**，把"禁用"停在 §十 的**题材无关通用清单**，把"逐作者/逐题材特征"散落在**附录A/B 的线性长表**里——**三处都缺"作者→{作者锚必带 + 禁用触发词→改用词}"的结构化、可检索、可注入、可审计条目**。
- **盲点表现**：写 `Wes Anderson` 出来不够像（口号锚）；写东亚文艺片误用 "cinematic dramatic lighting" 带偏气质（无题材禁用词闸）；想取"邵氏到底要钉哪几样"时只能在 283 条长表里人肉捞（不可检索）。
- **结论**：需在 **Bone 层**对 `style-refs.md` 做**结构化扩档**——新增 `_shared/style-refs-auteur.md`（逐作者保真锚组 + 逐题材禁用触发词→改用词表），并新增一支**轻量保真审计脚本** `_shared/scripts/audit_style_fidelity.py`（**词级**确定性检查："禁用触发词是否出现 / 作者锚必带项是否齐"——这部分可确定性 grep；"像不像"的画面级判断走 D09 基线对图 + 人评 A-B，不臆造数值）。铁律继承 `style-refs.md §十` 与 `storyboard/output-contract.md §7.8`：**禁用词表 / 作者锚清单 / 审计报告只内部跑，绝不进成片**。

---

## 3. 目标与非目标 Goals / Non-Goals

**Goals：**

- **G1（作者锚压满）**：把强风格（韦斯·安德森 / 邵氏武侠 / 日系平成青春 / HappyHorse 东亚文艺片 …）从"口号锚"升级为"**作者锚组（必带 6–8 项物理可见特征）**"，逐作者落成结构化条目，写入 `_shared/style-refs-auteur.md`。
- **G2（题材禁用触发词→改用词成表）**：为每个强题材建一张"**禁用触发词 → 改用词**"映射表（带"为何带偏"一句因果），把"在这个题材里会反噬气质的好词"显式黑名单化、并给出替换。
- **G3（可检索·可注入）**：条目结构统一（`auteur_key / 作者锚必带 / 禁用触发词→改用词 / 取锚原则边界`），agent 写某题材时可**一键取到该作者/题材的锚组 + 禁用词表**并注入提示词。
- **G4（可审计·轻量回归）**：配套 `audit_style_fidelity.py` 做**词级确定性审计**——扫一份成片提示词，报"**禁用触发词命中清单**"与"**作者锚必带项缺漏清单**"，输出结构化报告（JSON+MD）。可冷启动重跑，作为强风格升级的**回归门**（对 D09 基线提示词集重跑，禁用词命中 = 0 且作者锚缺漏 = 0 即放行词级）。
- **G5（接 D09 基线对图 + 人评 A-B 验"像不像"）**：词级闸之上，画面级"保真度"靠 **D09 的基线对图**（同一作者基线提示词出图 → 与作者参考画面比）+ **人评 A-B**（压满锚组 vs 口号锚，盲评哪个更像该作者）。把"像不像"从空话变成**可重复的对图 + 盲评判据**。

**Non-Goals（明确边界）：**

- **NG1（不破引擎隐身·铁律）**：作者锚清单、禁用触发词表、保真审计报告**全部是过程产物**，**绝不可漏进成片**——不进镜头卡、不进 Seedance 提示词、不作为"保真✓/锚组全齐"脚注附在任何成片表尾。本铁律直接继承 `style-refs.md §十` 与 `storyboard/output-contract.md §7.8`（"自检不外显·属过程不属成片"），把它从"通用反面清单"扩展到"**作者锚组 + 题材禁用词级审计**"。**注意**：作者锚里**会被注入成片的正向词**（如 `Wes Anderson symmetry, Futura signage, pastel powder-pink palette`）属于**合法风格术语**、本就该进提示词——隐身禁的是"审计/禁用词表/命中清单**这类过程元数据**"，不是风格锚词本身。
- **NG2（不破可移植性）**：`_shared/style-refs-auteur.md` 是**纯 Markdown 知识**，零宿主绑定；脚本 `audit_style_fidelity.py` 仅依赖 **Python 标准库**（纯文本词级匹配，**不读图、不调模型、不绑宿主 App / `127.0.0.1:8777`**），且**脚本不可得时套件仍可工作**——审计可降级为"模型按表自查提示词词面"的人审/模型审模式（脚本是确定性词级加固，非硬依赖）。
- **NG3（不是一致性审计·与 D05 正交）**：本案审"**像不像该作者气质**"（品味/覆盖），**不审**"跨镜漂没漂"（一致性，D05 已覆盖）；D05 审数值漂移、D12 审风格保真，二者并行不冲突、不重叠。
- **NG4（不替代人评·品味难数值验的诚实边界）**：脚本只能确定性判"**词面**"（禁用词出没出、锚词齐不齐）；"**画面像不像该作者**"无法靠词级脚本判定，**必须**走 D09 基线对图 + 人评 A-B。脚本不臆造"保真度 = 87 分"这类伪数值——画面级判定输出 `NEEDS_HUMAN/NEEDS_D09`。
- **NG5（不改既有锚原则与 ID 体系）**：只**结构化扩档** §五「取锚原则」、**消费**附录A/B 原料，不推翻"锚是基准不是抄袭"的边界，不新增/不改 `asset-id-convention.md` 的 `[Element_*]/[Prop_*]` 命名规范。
- **NG6（不做风格的"穷举封版"）**：首版**只压满方向简报点名的 4 个强风格**（韦斯 / 邵氏 / 日系平成 / HappyHorse 东亚文艺），其余作者/题材按"条目 schema 增量补"——本案交付**结构 + 4 个样板条目 + 增补规程**，不承诺一次穷举 283 条全部作者。

---

## 4. 需求 Requirements

### 4.1 功能需求 FR

**D12-FR-01 作者保真锚组 schema 与逐作者条目（Auteur Fidelity Anchor）**
- 描述：在 `_shared/style-refs-auteur.md` 定义作者条目 schema：每个 `auteur_key`（如 `wes_anderson` / `shaw_brothers_wuxia` / `jp_heisei_youth` / `happyhorse_east_asian_arthouse`）绑定一份条目，含 5 个字段：① **作者锚必带（must_anchor）**——6–8 项**物理可见**特征（构图秩序 / 机位 / 色板 hex / 字体 / 画幅 / 光质 / 节奏惯例），每项给可注入的英文术语；② **取锚边界（anchor_boundary）**——承 §五「取锚原则」一句话写清"借什么、不抄什么"；③ **禁用触发词（banned_triggers）**——见 FR-02；④ **源出处（source）**——指向附录A/B 的原料行（可溯源）；⑤ **题材绑定（genre_tags）**——该作者锚常用于哪些 §六 速查表题材。must_anchor 的英文术语**本就是合法风格词、可进提示词**（NG1）。
- 可量化验收：①schema 5 字段齐全，must_anchor **每条作者 ≥6 项物理特征**（口号词如裸 `cinematic` 不计入）；②对**方向简报点名的 4 个强风格**（韦斯 / 邵氏 / 日系平成 / HappyHorse）各产出**填满 5 字段**的条目，无空字段；③韦斯条目的色板必须落到**具体 hex 或具名色**（糖粉玫红 / 薰衣草紫 / 奶油白，承附录A），不得只写 `pastel`；④每条目 source 字段可在 `style-refs.md` 附录A/B grep 到对应原料行（可溯源，命中 ≥1）。

**D12-FR-02 题材禁用触发词 → 改用词表（Banned-Trigger → Replacement）**
- 描述：在 `_shared/style-refs-auteur.md` 为每个强题材建一张三列表 `{禁用触发词 banned, 改用词 replacement, 为何带偏 reason（一句因果）}`。禁用词覆盖两类：(a) **通用褒义但题材反噬**（东亚文艺：`cinematic dramatic lighting / glossy commercial polish / vibrant saturated` → `natural available light / lived-in imperfect / muted desaturated`，因"商业三点光/高饱和会破克制自然光气质"）；(b) **跨题材串味**（邵氏武侠：`drone shot / realistic motion blur / digital slow-mo` → `static staged wide / hard-cut freeze / 35mm stage backdrop`，因"航拍/数字慢镜把 80 年代棚拍武侠带成现代数字感"）。每条禁用词必须配**非空改用词**与**一句因果**。
- 可量化验收：①4 个强题材各 ≥1 张禁用词表，**每题材 ≥5 条禁用词**；②每条三列齐全（banned / replacement / reason 缺一不合格）；③禁用词与改用词**不得同义重复**（如 banned=`neon`、replacement=`neon light` 视为无效）；④禁用词表与 §十「通用禁止项」**不冲突**（§十 是题材无关、本表是题材专属，二者互补；冲突项 = 0）。

**D12-FR-03 保真审计脚本 `audit_style_fidelity.py`（词级确定性·可重跑回归门）**
- 描述：实现 `_shared/scripts/audit_style_fidelity.py`：输入 `--auteur <auteur_key> --prompt <提示词文件...> [--rules <style-refs-auteur导出的json>]`，对每份提示词做**词级确定性匹配**：(a) 扫 `banned_triggers` → 输出**命中清单**（哪条禁用词、在哪行、建议改用词）；(b) 扫 `must_anchor` → 输出**缺漏清单**（哪几项作者锚没出现）。画面级"像不像"**不判**，输出 `NEEDS_D09` 行（指向 D09 基线对图）、不臆造分数。脚本以**非零退出码**表达 NO-GO（`exit 0`=词级通过、`exit 1`=有禁用词命中或作者锚缺漏），供回归门消费。词匹配大小写不敏感、支持中英别名（如 `推轨/dolly`）。
- 可量化验收：①对"压满韦斯锚组 + 无禁用词"的样例提示词 → 禁用命中 = 0、作者锚缺漏 = 0、`exit 0`；②对"故意写入 `drone shot`"的邵氏提示词 → 禁用命中清单含 `drone shot` 且附改用词、`exit 1`；③对"只写裸 `Wes Anderson` 无任何 must_anchor 项"的提示词 → 作者锚缺漏清单列出全部缺项、`exit 1`；④脚本仅依赖 Python 标准库（`--help` 可独立运行，无第三方包）；⑤同输入重跑两次，JSON 报告逐字节一致（时间戳排除后，确定性·便于回归 diff）。

**D12-FR-04 D09 基线对图 + 人评 A-B 验证规程（品味级·画面保真）**
- 描述：在 `_shared/style-refs-auteur.md` 定义"画面保真"验证规程（词级闸之上的品味闸）：对每个强风格建一组 **D09 基线提示词集**（每作者 ≥3 条覆盖典型镜头：建立镜 / 中近景 / 名场面气质），跑 D09 真机出图，与**该作者参考画面**（附录A 点名的影片）做**对图核验**（人眼/模型评"色板/构图秩序/光质是否落在作者特征带内"）；并做 **A-B 盲评**：同一镜头，"压满锚组（FR-01 must_anchor 全注入）" vs "口号锚（裸 `Wes Anderson`）"两版出图，≥3 名评审盲评"哪版更像该作者"。
- 可量化验收：①4 个强风格各有 ≥3 条 D09 基线提示词，落盘 `_shared/scripts/examples/auteur_baselines/`；②A-B 盲评**压满锚组版胜出率 ≥ 2/3 评审**（即"压满确实更像"，否则该作者锚组需回炉补特征）；③对图核验给出"作者特征带命中表"（色板 / 构图 / 光质 / 字体逐项 ✓/✗ 人评），命中 ≥ 4/6 项判**像**；④验证规程明确"画面级判定**不**产出伪数值分，只产出**人评 ✓/✗ + 命中项数 + A-B 胜负**"。

**D12-FR-05 审计接入出稿后闸 + 引擎隐身闸（知识层挂载）**
- 描述：在 `_shared/style-refs-auteur.md` 写明保真审计在管线中的**挂载位**：写完提示词后（进 Seedance/出图前）→ 跑 `audit_style_fidelity.py` 词级审计 → **有禁用词命中或作者锚缺漏 → 回改提示词，不放行**；画面级保真走 D09 对图（异步，付费步由用户亲点）。并明确**引擎隐身闸**——禁用触发词表 / 作者锚清单 / 审计命中报告**只存在于过程目录**（如 `.audit/`），**严禁**作为字段、脚注进入镜头卡 / Seedance 提示词 / 任何成片表；但 must_anchor 的**正向风格词**照常合法进提示词（NG1 边界）。在 `style-refs.md §五 footer` 与 `storyboard/output-contract.md §7.8` 各加一条交叉引用指针（指向本审计、不改既有语义）。
- 可量化验收：①`style-refs-auteur.md` 含"挂载位 = 写完提示词后、出图前"明确语句；②含"禁用词命中 / 作者锚缺漏 → 不放行"硬规则；③对一份含审计报告的运行产物，grep 成片镜头卡 / Seedance 提示词中 `禁用触发词|banned_trigger|作者锚缺漏|must_anchor缺|保真✓|fidelity_report` 命中 **= 0**（**正向风格词如 `Wes Anderson symmetry` 不在此黑名单内、不算泄漏**）；④`style-refs.md §五`、`storyboard/output-contract.md §7.8` 各新增 1 条交叉引用注脚（只加引用，原条款文字不变）。

### 4.2 非功能需求 NFR

**D12-NFR-01 引擎隐身 + 审计过程产物不漏进成片（铁律）**
- 审计全链路（禁用触发词表 / 作者锚清单 / 命中报告 / 脚本日志）均为过程产物，**绝不进成片**；引擎术语（Polanyi/默会/格式塔/寓居/方法论/支柱编号）在审计产物里也零出现。**关键区分**：must_anchor 的正向风格术语（导演名 / 影片名 / 色板 / 字体 / 画幅 / 光质词）是**合法成片词**、本就该进提示词；隐身禁的是"禁用词表本身 / 命中清单 / 缺漏报告 / 保真✓脚注"。验收：对成片镜头卡 + Seedance 提示词 grep 审计元数据字段与引擎术语，命中均 = 0（DoD-4）。

**D12-NFR-02 可移植性**
- 知识层纯 Markdown、零宿主绑定；脚本仅 Python 标准库（**不读图、不调模型**，纯词级文本匹配），不绑宿主 App / 不出现 `127.0.0.1:8777` 痕迹；**脚本缺失时审计可降级为模型按表自查提示词词面的人审/模型审模式**（套件不因没装脚本而瘫）。验收：`_shared/` 内审计知识无运行时强依赖；脚本头注明"可选确定性词级加固，缺失则走模型审分支"。

**D12-NFR-03 确定性与可重跑（词级回归门核心）**
- 词级审计：同一 (auteur_key, 提示词, 规则) 输入，脚本输出报告**逐字节可复现**（无随机、时间戳仅存报告头元数据、不参与判定）。验收：连续 2 次运行 JSON 报告 diff = 0（FR-03⑤）。**注意**：画面级 D09 出图天然有模型随机性，**不**纳入"逐字节复现"要求——其回归判据是"A-B 胜出率 + 特征带命中项数"的统计稳定，不是字节级一致。

**D12-NFR-04 性能/成本**
- 词级审计（脚本路径）应为**亚秒级本地计算、0 次付费模型调用**；画面级 D09 对图属真机出图（付费步、由用户亲点），本工具不新增**默认**付费调用——A-B/对图是**按需触发的验证步**，不是每条提示词都跑。验收：脚本审 1 份提示词 < 1s；脚本路径付费调用数 = 0；D09 对图仅在显式验证/回炉时触发。

**D12-NFR-05 覆盖增量·不制造口径矛盾**
- 首版只压满 4 个强风格，其余按 schema 增量补；新增条目**不与** §五口号锚、§十通用禁止项、附录A/B 原料**打架**（结构化条目是**对原料的升格**，引用同一出处，不另立矛盾口径）。验收：4 条目 source 字段均可在附录A/B grep 到；与 §十 冲突项 = 0；§五原 7 行口号表保留为"快速索引"、新条目为其"展开档"（互补不互删）。

---

## 5. 设计 Design

### 5.1 新增/改动文件精确路径清单

**新增（4 个）：**
```
skills/director-suite/_shared/style-refs-auteur.md                          # 逐作者保真锚组 + 逐题材禁用触发词→改用词表 + D09验证规程 + 挂载位（Bone）
skills/director-suite/_shared/scripts/audit_style_fidelity.py               # 词级确定性审计脚本（标准库，扫禁用词命中+作者锚缺漏，输出JSON+MD，exit码=GO/NO-GO）
skills/director-suite/_shared/scripts/examples/auteur_wes_anderson.json     # FR-01 样例作者条目（导出供脚本消费 + 对图核验）
skills/director-suite/docs/optimization/D12-style-fidelity.md               # 本 PRD（已落盘）
```

**改动（3 个，均为追加/注册，不改既有语义）：**
```
skills/director-suite/_shared/style-refs.md
  - §五「名家与片名参考库」footer 追加交叉引用：「→ 逐作者保真锚组与题材禁用触发词表见 _shared/style-refs-auteur.md」（§五原 7 行口号表不动，升为"快速索引"）
  - §十「常见错误/禁止项」末追加一句：题材专属禁用触发词（带改用词）见 style-refs-auteur.md（§十通用清单不动）
skills/director-suite/storyboard/output-contract.md
  - §7.8「自检不外显」追加一句：保真审计产物（禁用词表/作者锚缺漏报告）同属过程，绝不进成片；但正向风格锚词照常合法进提示词（原铁律文字不动，补边界澄清）
skills/director-suite/README.md
  - 「三层架构 ② 骨」一行的文件清单追加 style-refs-auteur.md；目录结构树 _shared/ 下新增该文件与 scripts/ 节点
```

**只读消费、不改：** `_shared/style-refs.md` 附录A/B（作者特征 / 招式的上游原料来源）、`_shared/tacit-core.md`（引擎隐身铁律来源，零改动）、D09 关键帧/对图能力（被审画面的产出与对图方）。

### 5.2 挂进 Soul / Bone / Skin 哪层

- **Bone（骨 · 主要落点）**：`_shared/style-refs-auteur.md` = 对既有 `style-refs.md` 的**结构化扩档**（逐作者锚组 + 逐题材禁用词表），与 `style-refs.md`/`mapping-tables.md` 同级、被全成员共享消费。脚本 `audit_style_fidelity.py` 是 Bone 数据的**确定性词级执行器**（数据为本、脚本为加固）。
- **Skin（皮 · 挂载点，零新增成员）**：保真审计**在写完提示词后由各视觉/视频成员（character-board/keyframe/storyboard）调用**，不新建独立成员目录——保真是横切关注点（cross-cutting），挂在既有成员的"出稿后自检"步。
- **Soul（灵魂 · 零改动）**：不触碰 `tacit-core.md`。作者保真是 Soul「求真的向度·向真而求」与「试探性投入·敢下强选择」的**外化**——把"对作者气质负责"从默会判断，落成 Bone 层可检索的锚组 + 可审计的禁用词闸；但闸的读数（命中/缺漏）永不外显进成片，正向锚词则合法进提示词。

### 5.3 关键 schema / 契约字段 / 算法

**(A) 作者保真条目 schema（FR-01，写入 style-refs-auteur.md，JSON 形态供脚本消费）**
```jsonc
{
  "auteur_key": "wes_anderson",
  "display": "韦斯·安德森 Wes Anderson",
  "must_anchor": [
    "perfectly centered symmetrical composition",        // 构图秩序
    "frontal flat staging, planimetric framing",         // 平面化正交
    "snap pan / orthogonal whip-pan transitions",        // 机位运动惯例
    "powder-pink #F4C2C2 / lavender #B57EDC / cream #FFF8E7 pastel palette",  // 具体色板(承附录A)
    "Futura geometric sans-serif signage & title cards",  // 字体
    "1:1.85 academy-ish flat ratio, 35mm film grain",     // 画幅/胶片
    "miniature dollhouse-section set, chapter-card structure"  // 节奏惯例
  ],
  "anchor_boundary": "借中心对称/正交机位/糖粉色板/Futura标牌；不复刻具体影片场景与角色",
  "banned_triggers": [                                     // 见 (B)，此处内联键以便脚本一次读取
    { "banned": "handheld shaky cam",     "replacement": "locked-off tripod / dolly track", "reason": "手持破对称稳定的强迫症机位" },
    { "banned": "realistic naturalistic lighting", "replacement": "even flat front fill, storybook glow", "reason": "自然光破童话布景的均匀平光" },
    { "banned": "muted desaturated",      "replacement": "saturated pastel color blocks",   "reason": "去饱和破糖粉色块辨识度" }
  ],
  "source": ["style-refs.md#附录A:韦斯·安德森《布达佩斯大饭店》", "style-refs.md#附录B:韦斯·安德森"],
  "genre_tags": ["对称构图/古怪冷幽默", "国风纯意境(对称分支)"]
}
```

**(B) 题材禁用触发词 → 改用词表（FR-02，写入 style-refs-auteur.md）**

| auteur/题材 | 禁用触发词 banned | 改用词 replacement | 为何带偏 reason |
|---|---|---|---|
| HappyHorse 东亚文艺 | `cinematic dramatic lighting` | `natural available light, soft window light` | 三点戏剧光破"克制自然光"气质 |
| HappyHorse 东亚文艺 | `glossy commercial polish` | `lived-in, imperfect, film grain` | 商业精修破"允许不完美"的真实感 |
| HappyHorse 东亚文艺 | `vibrant saturated colors` | `muted desaturated, warm faded` | 高饱和破东亚文艺的哑调克制 |
| HappyHorse 东亚文艺 | `travel-brochure scenic view` | `local everyday mundane perspective` | 旅游宣传片视角破"本地人日常"视角 |
| HappyHorse 东亚文艺 | `dynamic fast cutting` | `lingering long take, breathing rhythm` | 快切破"呼吸结构"的留白 |
| 邵氏武侠 Shaw Brothers | `drone shot / aerial` | `static staged wide, low-angle ground` | 航拍把 80 年代棚拍带成现代数字感 |
| 邵氏武侠 Shaw Brothers | `realistic motion blur / digital slow-mo` | `hard-cut freeze, snap-zoom punch-in` | 数字慢镜破港片硬切定格的凌厉 |
| 邵氏武侠 Shaw Brothers | `naturalistic outdoor location` | `35mm painted stage backdrop, studio set` | 自然外景破邵氏棚拍布景的浓墨重彩 |
| 邵氏武侠 Shaw Brothers | `desaturated muted` | `bold saturated red/gold, theatrical` | 去饱和破港式武侠浓彩戏曲感 |
| 邵氏武侠 Shaw Brothers | `orchestral score` | `guzheng / pipa string color` | 交响破古筝琵琶的港式武侠器色 |
| 日系平成青春 | `HDR, ultra-sharp digital` | `Kodak Gold 200 warm / Fuji Pro 400H grain` | 数字锐利破平成胶片柔颗粒 |
| 日系平成青春 | `studio three-point lighting` | `backlit overexposure, hair catching sunlight` | 棚光破逆光过曝的青春光晕 |
| 日系平成青春 | `clean stabilized` | `handheld documentary drift, freeze-frame` | 干净稳定破"纪录片偷拍青春"质感 |
| 日系平成青春 | `cold blue grade` | `analog warmth, golden hour rim` | 冷蓝破平成暖调 analog warmth |
| 日系平成青春 | `cinematic anamorphic` | `4:3 / academy nostalgic ratio` | 宽变形破平成怀旧画幅记忆 |

> 改用词原则：禁用词与改用词**必须语义对立或迁移**（非同义改写）；reason 必须落到"破了哪一项作者锚"，可追到 (A) 的 must_anchor。

**(C) 保真审计报告结构（FR-03，逐项行 + 尾结论）**
```jsonc
{
  "header": { "auteur": "shaw_brothers_wuxia", "prompt_file": "S1_shot3.txt",
              "rules_version": "1.0", "audited_at": "2026-06-22T..." },  // 时间戳仅元数据，不参与判定
  "banned_hits": [
    { "banned":"drone shot", "line":2, "replacement":"static staged wide, low-angle ground",
      "reason":"航拍把80年代棚拍带成现代数字感", "verdict":"FAIL" }
  ],
  "anchor_missing": [
    { "must_anchor":"35mm painted stage backdrop", "verdict":"MISS" }
  ],
  "image_fidelity": [
    { "item":"色板/构图/光质 是否落作者特征带", "verdict":"NEEDS_D09",
      "note":"画面级保真不靠词级脚本判，转 D09 基线对图 + 人评A-B" }
  ],
  "footer": { "banned_count":1, "missing_count":1, "decision":"NO-GO",  // 命中或缺漏>0 → NO-GO
              "fixes":[ { "item":"drone shot", "action":"删 drone shot，改 static staged wide + 35mm stage backdrop" },
                        { "item":"35mm painted stage backdrop", "action":"补该作者锚到提示词" } ] }
}
```

**(D) 审计算法（FR-03 伪代码，强调确定性词级 + 不臆造画面分）**
```python
def audit_style(auteur_rules, prompt_text):
    rows_banned, rows_missing = [], []
    text = normalize(prompt_text)                       # 小写化 + 中英别名归一(推轨→dolly)
    # 1) 禁用触发词命中（确定性子串/词边界匹配）
    for rule in auteur_rules.banned_triggers:
        for alias in expand_aliases(rule.banned):       # 含中英别名
            if alias in text:
                rows_banned.append(hit(rule, line_of(alias, prompt_text)))  # 带行号+改用词+因果
    # 2) 作者锚必带缺漏（must_anchor 每项是否在提示词出现）
    for anchor in auteur_rules.must_anchor:
        if not any(a in text for a in expand_aliases(anchor)):
            rows_missing.append(miss(anchor))
    # 3) 画面级"像不像"——词级脚本不判，明确转 D09
    image_row = row("image_fidelity", verdict="NEEDS_D09")
    decision = "NO-GO" if (rows_banned or rows_missing) else "GO"   # 命中或缺漏 → NO-GO
    return Report(rows_banned, rows_missing, image_row, decision,
                  fixes=suggest_fixes(rows_banned, rows_missing))    # exit 1 if NO-GO else 0
# 注：纯词级文本运算、确定性、无随机、不读图、不调模型；画面级一律 NEEDS_D09，绝不臆造保真分
```

### 5.4 数据流（ASCII）

```
style-refs.md 附录A/B(韦斯色板/邵氏棚味/日系胶片/HappyHorse招式)      §五 取锚原则(借基准不抄袭)
            │ (只读·原料来源)                                              │ (只读·边界来源)
            ▼                                                              ▼
   ┌──────────────── style-refs-auteur (Bone) ─────────────────┐
   │ FR-01 作者锚组 schema(must_anchor ≥6项物理特征)            │── 导出 ──► auteur_*.json
   │ FR-02 禁用触发词→改用词表(banned/replacement/reason)       │            │
   └────────────────────────────────────────────────────────────┘            ▼
                                                              ┌── audit_style_fidelity.py ──┐
   写完的提示词(进Seedance/出图前) ───────────────────────────►│ 词级确定性匹配:             │
                                                              │  禁用词命中 + 作者锚缺漏    │
                                                              │  画面级 → NEEDS_D09(不判)   │
                                                              └────────────┬────────────────┘
                                                                           ▼
                                          FR-03 保真报告(JSON+MD: 命中/缺漏 + GO/NO-GO + 改用词)
                                                                           │
                          ┌────────────────────────────────────────────────┤
                          ▼ GO(词级过)                                      ▼ NO-GO(命中/缺漏)
            画面级保真验证(异步):                                  回改提示词(删禁用词/补作者锚) ─┐
            FR-04 D09 基线对图 + 人评A-B(付费步·用户亲点)                                          │
                          │                                       ✗ 引擎隐身闸(NFR-01)            │
                          ▼ A-B压满锚组胜出≥2/3                    审计报告/禁用词表/缺漏清单       │
                  作者锚组确认"够像"                ┄┄ 绝不进 ┄┄►  镜头卡/Seedance 成片            │
                  (否则回炉补 must_anchor)          (审计层≠成片层;只存 .audit/ 过程目录)          │
                                                   ✓ 但正向风格锚词(Wes symmetry/Futura)合法进提示词 ◄┘
```

---

## 6. 验收标准 Acceptance Criteria (DoD)

- **DoD-1（FR-01）**：`_shared/style-refs-auteur.md` 含作者条目 schema（5 字段）；**4 个强风格**（韦斯/邵氏/日系平成/HappyHorse）各一份**填满 5 字段、无空字段**的条目，且 must_anchor **每条 ≥6 项物理特征**；韦斯色板落到具体色（糖粉玫红/薰衣草紫/奶油白），非裸 `pastel`。
- **DoD-2（FR-02）**：4 个强题材各 ≥1 张禁用词表、**每题材 ≥5 条**；每条 `banned/replacement/reason` 三列齐全；禁用词与改用词**非同义重复**；与 §十通用禁止项冲突项 = 0。
- **DoD-3（FR-03 词级闸）**：脚本对任一提示词产出保真报告，`banned_hits` 每行含 {禁用词, 行号, 改用词, 因果, 判定}、`anchor_missing` 列出缺项；**命中或缺漏 > 0 → 尾结论必为 NO-GO**；每 FAIL/MISS 行有非空修复动作。
- **DoD-4（NFR-01 铁律）**：对含审计报告的运行产物，grep 成片镜头卡 + Seedance 提示词中 `禁用触发词|banned_trigger|作者锚缺漏|must_anchor缺|保真✓|fidelity_report|NEEDS_D09` 命中 **= 0**；grep 引擎术语（Polanyi/默会/格式塔/支柱/方法论）命中 **= 0**；**正向风格锚词（如 `Wes Anderson symmetry, Futura signage`）允许出现、不算泄漏**（边界正确性一并核验）。
- **DoD-5（FR-03 真阴性·自审）**：脚本对"压满锚组 + 无禁用词"提示词 → 禁用命中 = 0、作者锚缺漏 = 0、`exit 0`。
- **DoD-6（FR-03 真阳性）**：对"含 `drone shot`"邵氏提示词 → 命中清单含 `drone shot` 且附改用词、`exit 1`；对"裸 `Wes Anderson` 无 must_anchor"提示词 → 缺漏清单列全部缺项、`exit 1`。
- **DoD-7（NFR-03 确定性）**：同输入连续 2 次运行，JSON 报告 diff = 0（时间戳排除后逐字节一致）。
- **DoD-8（FR-04 品味闸）**：4 强风格各 ≥3 条 D09 基线提示词落盘；A-B 盲评**压满锚组版胜出率 ≥ 2/3 评审**；对图核验给出"作者特征带命中表"（≥4/6 项判像）；画面级判定**只产人评 ✓/✗ + 命中项数 + A-B 胜负，无伪数值分**。
- **DoD-9（FR-05 挂载/闸）**：`style-refs-auteur.md` 含"写完提示词后→出图前→命中/缺漏 NO-GO 不放行"明确链路；`style-refs.md §五`、`storyboard/output-contract.md §7.8` 各已加交叉引用，且原条款文字未改。
- **DoD-10（NFR-02 可移植）**：脚本仅 Python 标准库（无第三方包、不读图、不调模型）；`style-refs-auteur.md` 含"脚本缺失则降级模型审"分支；产物无宿主 App 痕迹。
- **DoD-11（覆盖溯源）**：4 条目 source 字段均可在 `style-refs.md` 附录A/B grep 到对应原料行（命中 ≥1/条目）；§五原 7 行口号表保留为快速索引（未删）。

## 7. 验证方案 Verification Plan

**验证手段：**

1. **词级审计脚本自验（确定性闸·最高可信）**：用**人为构造的提示词样本**做真值——(a)"压满韦斯锚组 + 零禁用词"样本（应全过 `exit 0`）；(b) 对其**注入单个已知禁用词**（`handheld shaky cam`）→ 脚本必须**精确命中该词、报行号、附改用词**、`exit 1`；(c)"裸 `Wes Anderson` 无任何 must_anchor"样本 → 脚本必须**列全缺漏项**、`exit 1`。因为禁用词/缺漏项是**人为注入的已知真值**，脚本"抓没抓到、抓得对不对"可被逐项核对——这是词级"真的有效"的硬证据，非主观感受。
2. **词级回归 diff（基线·可重跑）**：以 4 强风格的 D09 基线提示词集 + 对应作者条目为**固定基线**。套件任何升级（改映射表 / 调色板 / 补作者条目 / 换图像模型对应词）后，对同一组基线提示词重跑词级审计，断言"**禁用词命中 = 0 且作者锚缺漏 = 0**"——即缺口类 D 在**可数值化的词级维度**上的回归门。
3. **D09 基线对图 + A-B 盲评（品味级·画面保真·诚实承认难数值验）**：取 4 强风格，跑 D09 真机出图（付费步、由用户亲点）：(a) **对图核验**——与附录A 点名的作者参考画面比，逐项（色板/构图秩序/光质/字体/画幅/节奏）人评 ✓/✗，命中 ≥4/6 判"像"；(b) **A-B 盲评**——同镜头"压满锚组版 vs 口号锚版"两张图，≥3 名评审盲选"哪版更像该作者"，压满版胜出 ≥2/3 才算"作者锚组确实压满了保真"。**这是品味类唯一诚实的判据**：不假装能给"保真度 87 分"，而是用"盲评胜出率 + 特征带命中项数"把"像不像"变成可重复的对照实验。
4. **引擎隐身专项 grep（铁律闸·含边界正确性）**：对成片镜头卡 + Seedance 提示词跑 NFR-01 grep——(a) 审计元数据字段（禁用词表/命中清单/缺漏报告/保真✓）与引擎术语命中必须为 0；(b) **反例**：故意把一行"禁用触发词命中报告"塞进镜头卡 → 隐身 grep 必须报命中（证明闸是真闸）；(c) **边界反例**：把正向风格锚词 `Wes Anderson symmetry, Futura signage` 写进提示词 → grep **不得**误报为泄漏（证明闸不误伤合法风格词）。

**测试用例 / 基线：**
- 基线 B0：`wes_anderson` 作者条目（must_anchor 7 项 + 3 条禁用词 + 源溯源附录A/B）。
- 用例 T1（真阴性/自审）：prompt = 压满韦斯锚组、无禁用词 → 命中 0、缺漏 0、GO、exit 0。
- 用例 T2（禁用词真阳性）：邵氏 prompt 含 `drone shot` → 命中清单含 `drone shot` + 改用词、NO-GO、exit 1。
- 用例 T3（作者锚缺漏真阳性）：prompt 仅裸 `Wes Anderson` → 缺漏列全部 must_anchor、NO-GO、exit 1。
- 用例 T4（别名命中）：邵氏 prompt 写中文"航拍" → 命中（别名归一到 `drone shot`）。
- 用例 T5（A-B 盲评）：韦斯同镜头压满锚组版 vs 口号版出图 → ≥3 评审盲选，压满版胜出 ≥2/3。
- 反例 T6（隐身闸）：把一行保真命中报告注入镜头卡 → DoD-4 grep 必报命中（闸有效）。
- 边界 T7（不误伤）：`Wes Anderson symmetry, Futura signage` 写进提示词 → DoD-4 grep **不**报泄漏（合法风格词放行）。

**为何这样能证明"真的有效"：**
- 词级维度用**已知注入的禁用词/缺漏项**当真值，把"审计准不准"变成"抓到的命中/缺漏 = 注入的真值"——可逐项核对，词级闸彻底摆脱"看着提升了"的空话；确定性脚本 + JSON 逐字节可复现 → "对基线重跑禁用词命中 = 0"是**可重复执行的硬词级回归门**。
- 画面级维度**诚实承认难数值验**，不造伪分；改用 **A-B 盲评胜出率（≥2/3）+ 特征带命中项数（≥4/6）** 这种**可重复的对照判据**——"压满锚组确实比口号锚更像该作者"是**可被盲评统计证伪/证实**的，比"提升了高级感"实在得多。
- 反例 T6 证明隐身闸能真拦截泄漏；边界 T7 证明闸**不误伤合法风格锚词**（NG1 边界落地正确）——两个反例一起把"隐身闸既不漏也不误伤"钉死。

**落地可靠性理由（3/5）：**
- 给 3/5（非更高）的诚实原因：**画面级"像不像"本质难数值验**——A-B 盲评依赖人评、有主观波动，无法像 D05 那样给"色相偏 30°"的硬真值；强风格的模型复现度还受图像模型自身能力波动影响，A-B 胜出率可能因模型升级而漂移。
- 给 3/5（非更低）的支撑：①**原料已在库且被点名**（附录A/B 已列韦斯逐影片色板、邵氏棚味、日系胶片、HappyHorse 招式），本案是"结构化升格 + 压满"而非从零发明；②**词级闸是确定性、可重跑、有硬真值的**——禁用词命中/作者锚缺漏这半边是 5/5 级的硬回归门，把品味问题切出了一块"可数值验的词级地基"；③脚本零第三方依赖（纯标准库、不读图不调模型）、缺失可降级模型审，不引入新脆弱点。综合"词级硬 + 画面级软"，给 3/5。

## 8. 依赖与顺序 Dependencies

- **依赖 `style-refs.md` 附录A/B 稳定**（只读）：作者锚组的物理特征 / 招式原料来源（韦斯逐影片色板、邵氏棚味、日系胶片、HappyHorse 招式）。前置：已就绪（附录A 283 条 + 附录B 招式库已在库）。
- **依赖 §五「取锚原则」与 §十「禁止项」**（只读 + 追加交叉引用）：锚边界来源 + 通用禁止项互补基底。前置：已就绪。
- **依赖 D09（基线对图能力）**：画面级保真验证（FR-04 对图 + A-B 盲评）**强依赖 D09 的基线出图与对图**——这是本案"验像不像"唯一通道，D09 未就绪则画面级闸无法运行（词级闸不受影响、可独立先行）。**顺序：D09 → D12 画面级验证**；D12 词级闸可与 D09 并行。
- **依赖 `storyboard/output-contract.md §7.8`**（追加交叉引用）：引擎隐身闸的挂载基底。前置：已就绪。
- **宿主能力（可选）**：画面级 D09 出图依赖宿主图像模型通道（与既有成员同、付费步用户亲点）；词级脚本仅依赖本地 Python 标准库，**不依赖宿主**。
- **与其它 D 关系**：与 **D05（数值一致性审计）正交且互补**（D05 审"漂没漂"、D12 审"像不像该作者"，可共用 `.audit/` 过程目录与"出稿后→闸→NO-GO 回修"范式，但判据维度不同、不重叠）；可复用 D05 的 Drift Report 报告范式与隐身闸范式（弱依赖、非阻塞）。本案是 **P2 覆盖+品味**方向，建议在 D05（P0 一致性地基）与 D09（基线对图能力）之后落地。

## 9. 风险与缓解 Risks & Mitigations

| 风险 | 影响 | 缓解 |
|---|---|---|
| R1 画面级"像不像"主观波动大（A-B 盲评不稳） | 保真度判定不可靠 | 词级闸先兜住可数值化的一半（禁用词/锚缺漏硬判）；画面级用 ≥3 评审盲评 + ≥2/3 胜出阈 + ≥4/6 特征带命中，减小单评审偏差；A-B 用同镜头同模型只换锚组，控变量 |
| R2 审计元数据被误当成片字段/脚注泄漏（破隐身铁律） | 破成片、破铁律 | NFR-01 硬闸 + DoD-4 grep + 反例 T6；报告只存 `.audit/`；FR-05 在 §五 与 §7.8 加"绝不进成片"指针 |
| R3 隐身闸**误伤合法风格锚词**（把 `Wes Anderson symmetry` 当泄漏拦掉） | 风格词进不了提示词、保真反降 | NG1 显式区分"正向锚词合法进提示词 vs 审计元数据禁进"；边界反例 T7 专测"不误伤"；grep 黑名单只列审计元数据词，不列风格术语 |
| R4 禁用触发词过严/过松（题材不同标准不同） | 噪声告警或漏判带偏 | FR-02 禁用词表是**数据可调**；reason 必须追到具体 must_anchor（防拍脑袋拉黑）；用 A-B 盲评校准"这个词到底带不带偏"（带偏才入表） |
| R5 别名/同义词漏匹配（中文"航拍" vs `drone shot` 漏判） | 词级闸漏报 | FR-03 词匹配支持中英别名归一表；别名表随作者条目维护、可增量补；漏匹配用例（T4）回归校准 |
| R6 首版只压 4 风格、覆盖不足 | 其余强风格仍是口号锚 | NG6 明确首版 4 风格 + schema + 增补规程；条目 schema 统一 → 增补是"填表"非"重设计"；按真实项目高频题材优先补 |
| R7 图像模型升级导致 A-B 胜出率漂移（旧锚组在新模型上不灵） | 保真随模型退化 | D09 基线对图集 + A-B 胜出率纳入"模型升级回归项"；胜出率跌破 2/3 触发该作者锚组回炉补 must_anchor |
| R8 "强风格写了就像"的乐观自报复发（不跑 A-B 直接声称保真） | 假保真 | 无 D09 对图 + A-B 证据不得声称"作者保真已压满"；DoD-8 把"压满"绑定到可盲评的胜出率，而非文字自报 |

## 10. 工作量与里程碑 Effort & Milestones

**粗估总量：约 2.5–3.0 人周。**

- **M1 知识契约 + 4 风格条目（约 1.0 周）**：写 `_shared/style-refs-auteur.md`——FR-01 作者锚组 schema、FR-02 禁用触发词→改用词表、FR-03 报告结构、FR-05 挂载位与隐身闸；产出**韦斯/邵氏/日系平成/HappyHorse 4 个填满条目** + `auteur_wes_anderson.json` 导出样例。产出物：可评审的契约 + 4 样板条目。
- **M2 词级审计脚本（约 0.7 周）**：实现 `audit_style_fidelity.py`（禁用词命中 + 作者锚缺漏 + 中英别名归一 + 画面级 NEEDS_D09 分流 + JSON/MD 双输出 + exit 码）；产出物：可重跑词级脚本。
- **M3 词级测试与回归基线（约 0.4 周）**：构造合成提示词用例 T1–T4、T6、T7（含已知注入真值），接 DoD-5/6/7；建 4 风格词级回归基线，断言"禁用命中 = 0、锚缺漏 = 0"。产出物：可重跑词级回归门 + 真值校准。
- **M4 D09 基线对图 + A-B 盲评（约 0.5 周，付费步由用户亲点）**：4 风格各 ≥3 条 D09 基线提示词落盘，跑真机出图，做对图核验 + A-B 盲评（压满锚组 vs 口号锚），接 DoD-8。产出物：A-B 胜出率报告 + 特征带命中表 + 锚组回炉清单（如有）。
- **M5 接入与隐身闸（约 0.3 周）**：§五 / §7.8 加交叉引用指针 + 出稿后闸挂载；跑 DoD-4 + 反例 T6 + 边界 T7 隐身专项；README 注册。产出物：闭环挂载 + 铁律证据（含"不误伤"边界证据）。

**关键路径**：M1 → M2 → M3（M5 可与 M3 并行）。M4（画面级 A-B）**依赖 D09 就绪**，可在 M3 后异步进行；M2+M3 的"词级脚本 + 合成真值校准"是本案"可验证"的硬核交付，优先于 M4 真机品味验。

---

**契约版本**：D12 PRD Draft v0.1 ｜ 缺口类 D（覆盖与品味）｜ 优先级 P2 ｜ 落地可靠性 3/5 ｜ 新增 Bone 层共享知识 `_shared/style-refs-auteur.md`（逐作者保真锚组 + 逐题材禁用触发词→改用词表 + D09 验证规程）+ 词级确定性审计脚本 `_shared/scripts/audit_style_fidelity.py`；审计在写完提示词后由各成员调用、接出稿后闸；画面级"像不像"走 D09 基线对图 + 人评 A-B（诚实承认品味难数值验，词级闸硬·画面级闸软）；引擎隐身铁律扩展为"**禁用词表/作者锚缺漏报告/命中清单 绝不漏成片，正向风格锚词合法进提示词**"（继承 `style-refs.md §十` 与 `storyboard/output-contract.md §7.8`）。
