## 场景色卡 / 色板输出字段契约 v1.0

> 本契约定义"场景色卡"成员的输出字段、布局、锁定项、一致性规则与负面约束。所有字段均为**强约束**，未标注"可选"的字段必须填写。核心原则与本套件一致：**情绪先行 → 由单一情绪母色统辖 → 引擎隐身 → 固定格式输出**。色卡的最终成图是**纯平面色块参考卡**，不是场景画面。

---

### 0. 总则与底层约束

- **情绪母色统辖**：整盘颜色由**一个**情绪母色生长。先写母色（情绪一句话 + 冷暖/明度区间/饱和上限/影调档），再写任何 HEX。无母色的 HEX 列表视为废稿。
- **参数优先于形容词**：色温写 `K`、光比写 `主:辅`、饱和写档位（极低/低/中低/中/中高/高）、影调写 `高/中/低 key`、颜色写有效 `#RRGGBB`。禁止只写"高级灰""沙漠黄"等空话而无 HEX 与用途。
- **每色三件套**：`中文功能色名 + 英文色名 + #HEX`，后接**用途**（用在哪个主体/环境/光影/材质/阵营/特效）+**共享/新增标记**。缺任一即不合格。
- **连续性锁定**：跨段共享色 HEX 必须可追溯；有上一场色卡时不得擅改其核心 HEX，状态变化须在"连续性锁定"字段显式声明（新增变体色并说明用途）。
- **色数纪律**：默认总色 **10–16** 色；超过须有叙事理由。色板顺序有逻辑（共享色/基础色在前 → 本场新增色在后，或主色→辅色→点缀色→光影→材质→识别→特效）。

---

### 1. 字段清单 + 填写规范 / 允许值 / 常见错误

> 字段顺序严格固定。每张色卡内字段全部出现，缺项视为不合格。

| # | 字段 | 填写规范 | 允许值 / 格式 | 常见错误 |
|---|---|---|---|---|
| 1 | **色卡标题** | 项目/集数/段落/场景名 + "色卡" | `=== [项目·EP·段·场景] 场景色卡 ===` | 缺场景定位 |
| 2 | **用途** | 服务哪一场/镜头/视觉目标 | 场景功能 + 主体 + 环境 + 是否承接上一场 + 是否做后续锚点 | 只写"配色参考"空话 |
| 3 | **情绪母色** | 主情绪一句 + 氛围母色 | `主情绪：XX；母色：冷暖/明度区间/饱和上限/影调档` | 并列多主情绪；无母色直接列 HEX |
| 4 | **全局色温** | 整盘色温倾向 | `K` 区间，如 `3200–4000K 暖钨`（遵 mapping-tables §3） | 缺 K；与情绪打架 |
| 5 | **光比 / 对比** | 主:辅 + 对比档 | `光比 8:1 / 高对比`（遵 §3） | 亲密戏给 16:1；缺数值 |
| 6 | **饱和度** | 全局饱和档 + 局部例外 | `极低/低/中低/中/中高/高`（遵 §4） | 悲伤给高饱和糖果色 |
| 7 | **影调** | 高/中/低 key 视觉 | `低调暗部 / 中间调 / 高调亮部`（遵 §4） | 与饱和/色温冲突 |
| 8 | **色板设计** | 总色数 = 结构拆解 | 有上一场：`[总]色复合色板=[共享]色跨段共享+[新增]色本段新增`；无上一场：`[总]色基础色板=[基础]色基础+[关键]色本场新增` | 总数与逐色清单对不上 |
| 9 | **色板分层** | 按职能分组列出 | 主色 / 辅色 / 点缀色 / 光影色(主光·辅光·轮廓·阴影·高光) / 材质色 / 角色或阵营识别色 / 特效发光色 / 跨段共享色（按需保留实际存在层） | 把环境/材质/光源/情绪色混为一谈 |
| 10 | **逐色清单** | 每色三件套+用途+标记 | `中文色名 / English Name / #RRGGBB（用途；共享 or 新增 or 基础）` | 缺 HEX、缺用途、HEX 非法 |
| 11 | **连续性锁定** | 逐项列需保持/变化色 | `共享识别色/光影色/材质色 各自状态；本场新增项` | 写"同上"不列具体 |
| 12 | **视觉参考预案** | 据剧本给气质锚（2–4个） | 主体参考/环境参考/材质参考/整体调色参考（名家+影片，见 style-refs） | 照抄示例项目/影片 |
| 13 | **色卡参考图 prompt** | 生成纯平面色块卡 | 见 §2 模板（中文说明+英文 prompt+负面约束） | prompt 会生成场景图/插画 |
| 14 | **质量与禁止（负面约束）** | 正向规格 + 反向锚定 | 见 §3，二者必填 | 只写正向；反向笼统 |

---

### 2. 色卡参考图 prompt 固定模板（生成纯平面白底色块卡）

```
A clean color palette swatch reference card design. 16:9 horizontal layout. White background.
[Subject] A horizontal arrangement of [N] evenly-sized rectangular color swatches in a single row.
Each swatch is a clean rectangular block of pure flat color, sharp clean edges, no gradient, no
texture, no noise, no shadows. Below each swatch a small HEX label in clean monospace black text.
[Color Specifications] The [N] swatches from left to right are:
1. [English Color Name] #[HEX] ([specific usage + shared/new/base])
2. ...
[Composition] Swatches roughly equal width/height, thin equal spacing, palette occupies central 80%
of canvas, white margins all sides. Title top-center: "[PROJECT / SCENE] COLOR REFERENCE" small clean
black sans-serif.
[Lighting] Flat even neutral lighting, no shadows on swatches, no highlights, perfectly even color.
[Style] Professional graphic-design palette reference card, color-theory chart aesthetic, like a
Pantone color guide / design reference sheet, clean minimal.
[Quality] Hyperrealistic clean digital design rendering, sharp clean edges, perfectly even flat
color blocks, 8k ultra clean.
[Constraints] 见 §3 反向锚定。
```

---

### 3. 负面约束（反向锚定）书写规范

- **正向规格**：`纯平面色块、白底、HEX 标签、色块数量与清单一致、色彩还原精确、16:9 横版、8k 干净渲染`。
- **反向锚定（必填，逗号分隔）**：
  - 形态越界：`NOT painterly, NOT artistic, NOT illustrated, NOT decorative, NOT photographic scene, NOT physical objects, NOT 3D rendering`
  - 色块瑕疵：`NOT gradient, NOT texture, NOT noise, NOT shadows on swatches, NOT colorful background`
  - 多余元素：`NOT design elements other than swatches and labels`
  - 叙事一致性：`NOT random colors, NOT colors unrelated to the script, NOT changing inherited shared HEX unless required, NOT cyberpunk neon colors unless the script requires, NOT bright saturated futuristic colors unless required`

---

### 4. 一致性规则（锁定项）

1. **母色锁**：所有主/辅/点缀色的色相与明度落在母色定义的冷暖与明度区间内；越界须作为"暗流点缀"显式说明。
2. **共享色锁**：上一场已建立的核心 HEX 不得擅改；仅当时间/空间/光源/状态明显变化时新增**变体色**并标注用途，原 HEX 保留。
3. **职能锁**：每色归属唯一职能层（环境≠材质≠光源≠情绪≠识别），不得一色多职导致后续管线混乱。
4. **影调-饱和-色温三自洽**：三者共同朝主情绪用力（参 mapping-tables §3/§4 的❗禁止：悲伤禁高调透亮+高饱和糖果色、恐怖禁统一柔和粉彩、连续段落色板/影调禁无动机突变）。
5. **可复用锁**：标记哪些色后续分镜/角色/道具/调色可继承（阵营色、光影色、主辅阴高），哪些仅属本场。

---

### 5. 完整样例（校验用 · 内容须替换为用户当前场景，HEX 仅示意）

```
=== 「孤港·EP1·段2·废码头夜审」场景色卡 ===
【用途】对峙场景（审问/逼供功能）；前景主体=审讯者与被缚者两人，背景=锈蚀集装箱与油污水面；
本场为系列首张色卡（无上一场承接）；本盘将作为后续该地点分镜/角色/道具调色锚点。
【情绪母色】主情绪：压抑的逼问（暗流＝一丝不甘）；母色：冷青为体、明度压低、饱和上限"中低"、低 key 暗部主导。
【全局色温】6500–7500K 冷蓝为主 + 局部 3200K 钨黄点光（遵 §3 冷峻/悬疑）。
【光比/对比】主:辅 ≈ 8:1，高对比，暗部蓝移。
【饱和度】整体中低；仅"审讯灯钨黄"与"血痕暗红"两点局部中高，做叙事抓手。
【影调】低调暗部主导，亮部仅打在面部与水面反光。
【色板设计】12 色场景基础色板 = 8 色场景基础色 + 4 色本场关键色。
【色板分层】
  主色：冷青暗夜
  辅色（环境）：锈钢灰、油污墨绿、湿水泥灰
  点缀色（叙事焦点）：审讯钨黄、血痕暗红
  光影色：冷蓝主光、钨黄辅光、青白轮廓、墨蓝阴影
  材质色：锈蚀橙痕
【逐色清单】
  1. 冷青暗夜 / Cold Cyan Night #1B2A33（主色·母色化身，全局影调底；基础）
  2. 锈钢灰 / Rusted Steel Gray #4A5258（集装箱与栏杆主材；基础）
  3. 油污墨绿 / Oil-Slick Deep Green #1E2A24（水面与积污；基础）
  4. 湿水泥灰 / Wet Concrete Gray #5A5E60（地面与墙体；基础）
  5. 冷蓝主光 / Cold Blue Key #6E93A8（窗外/月色主光色；基础光影）
  6. 钨黄辅光 / Tungsten Amber Fill #C8923C（审讯灯补暗，点缀；基础光影）
  7. 青白轮廓 / Cyan-White Rim #AEC6CF（人物肩颈勾边分离背景；基础光影）
  8. 墨蓝阴影 / Ink-Blue Shadow #10171D（暗部锚点；基础）
  9. 审讯钨黄 / Interrogation Amber #E0A94B（审讯灯光斑/叙事焦点；本场新增）
  10. 血痕暗红 / Dried Blood Crimson #5A201A（被缚者面部血痕/创伤红；本场新增）
  11. 锈蚀橙痕 / Corrosion Orange Stain #8A4A22（金属锈蚀材质年代感；本场新增）
  12. 审讯者深褐皮 / Interrogator Dark Leather #2A1F18（审讯者皮衣识别色；本场新增）
【连续性锁定】主色#1B2A33/锈钢灰#4A5258/油污墨绿#1E2A24/审讯钨黄#E0A94B 为本地点跨镜锚点，
后续同场景分镜须沿用；血痕暗红#5A201A 仅在被缚者出镜时出现；天气=阴湿无雨，光源=单审讯灯+窗外冷光。
【视觉参考预案】整体调色：Roger Deakins 冷峻自然光 + Fincher《Se7en》低调暗部；
材质：锈蚀金属与油污水面写实质感；光：冷蓝主光 + 单点钨黄审讯灯 chiaroscuro。
【色卡参考图 prompt】
A clean color palette swatch reference card design. 16:9 horizontal layout. White background.
A horizontal arrangement of 12 evenly-sized rectangular color swatches in a single row, each a pure
flat color block, sharp clean edges, no gradient, no texture, no noise, no shadows; below each swatch
a small HEX label in clean monospace black text.
The 12 swatches from left to right are:
1. Cold Cyan Night #1B2A33 (main mood color, base)  2. Rusted Steel Gray #4A5258 (container metal, base)
3. Oil-Slick Deep Green #1E2A24 (water surface, base)  4. Wet Concrete Gray #5A5E60 (ground, base)
5. Cold Blue Key #6E93A8 (key light, base)  6. Tungsten Amber Fill #C8923C (fill light, base)
7. Cyan-White Rim #AEC6CF (rim light, base)  8. Ink-Blue Shadow #10171D (shadow anchor, base)
9. Interrogation Amber #E0A94B (interrogation lamp accent, new)  10. Dried Blood Crimson #5A201A (wound red, new)
11. Corrosion Orange Stain #8A4A22 (metal corrosion material, new)  12. Interrogator Dark Leather #2A1F18 (villain ID, new)
Swatches equal width/height, thin equal spacing, central 80% of canvas, white margins. Title top-center:
"GUGANG EP1 SEG2 - DOCK INTERROGATION COLOR REFERENCE" small clean black sans-serif. Flat even neutral
lighting, no shadows on swatches, perfectly even color. Professional graphic-design palette reference card,
color-theory chart aesthetic, like a Pantone color guide. Hyperrealistic clean 8k flat rendering.
Constraints: NOT painterly, NOT artistic, NOT illustrated, NOT decorative, NOT photographic scene,
NOT physical objects, NOT 3D rendering, NOT gradient, NOT texture, NOT noise, NOT shadows on swatches,
NOT colorful background, NOT design elements other than swatches and labels, NOT random colors,
NOT colors unrelated to the script, NOT cyberpunk neon colors, NOT bright saturated futuristic colors.
【质量与禁止】正向：纯平面色块，白底，HEX 标签，12 色与清单一致，色彩还原精确，16:9，8k 干净。
反向：见上 Constraints。
【色卡锚定句（如用于视频）】图片N 作为整段画面色卡锚定，所有色彩严格按色卡 12 色执行，不可偏离色板。
```

---

**契约版本**：v1.0 ｜ 与本套件 storyboard `output-contract.md` 同源；色卡成图恒为纯平面参考卡，逐色必带有效 HEX 与用途，由单一情绪母色统辖。
