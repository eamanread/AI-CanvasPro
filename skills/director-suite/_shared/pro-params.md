# 专业参数词表（焦段 / 光圈 / 镜头 / 色温光比 / 帧率画幅 / 胶片）

> 写镜头卡“镜头(相机)”“光影”字段时的可复用参数库。参数优先于形容词。

---

This is a knowledge-base writing task, not a code task — I have the raw extracted material and need to produce one Markdown section. No tools needed; I'll synthesize directly.

## 专业参数词表（焦段 / 光圈 / 镜头 / 色温光比 / 帧率画幅 / 胶片）

> 本节是分镜提示词的"光学与影像规格"层。原始 48 个题材 skill 绝大多数是 **AIGC 提示词工程**（文生图/图生视频），普遍以自然语言镜头词替代物理摄影硬参数；而真实拍摄/电影级质感需要把这些"占位词"反推为可执行的精确参数。下面把两套体系合并、纠偏，并补全行业必备但原文缺省的内容。**用法铁律：能给数值就给数值，给不出数值时用受控术语占位，绝不空写"电影感"。**

---

### 一、焦段（Focal Length / Lens）

焦段决定**透视压缩**与**人物关系**，是分镜里最被滥用却最该精确的一项。AIGC 模型对"35mm wide lens / 85mm portrait / telephoto compression"等词响应良好，应显式写出并与功能挂钩。

| 焦段 | 英文 | 透视/景深特征 | 叙事功能 | 典型用途 |
|---|---|---|---|---|
| 14–24mm 超广角 | ultra-wide / 16mm wide | 强透视畸变、空间撑开、边缘拉伸 | 压迫感、孤立、世界观大场 | 群像 master wide、环境交代、动作全景 |
| 28–35mm 广角 | 35mm wide lens | 轻畸变、深景深、人物与环境并重 | **叙事/环境关系**（最常用） | 文戏中景、一镜到底、纪实跟拍 |
| 40–50mm 标准 | 50mm normal | 接近人眼、透视中性 | 客观、平实、纪实 | 对话双人、标准中景 |
| 85mm 中长焦 | 85mm portrait | 浅景深、面部不变形、背景奶化 | **特写/情绪**、主体抽离背景 | 人物特写 CU/MCU、情绪收尾 |
| 100–135mm 长焦 | telephoto | 强压缩、虚化强、空间扁平 | **过肩压缩**、偷窥感、紧张 | 过肩 OTS、刺击格挡、转播长焦 |
| 微距 macro | macro / extreme close macro | 极浅景深、毫米级细节 | 材质/质感、商品神性 | 产品微距、工业流光、水珠 |
| 移轴 tilt-shift | tilt-shift / miniature | 焦平面倾斜、玩具化 | 微缩世界、上帝视角 | 微缩短片 1:12 scale |
| 变形宽银幕 | anamorphic | 横向压缩、水平蓝色眩光、椭圆散景 | 史诗电影质感 | PANAVISION look、IMAX 大片感 |

补全要点（原文缺省）：
- **镜头呼吸 lens breathing**：变焦/对焦时画面边缘微缩放，写入可增纪实/真实感（室内探索、手持）。
- **焦点迁移 focus pull / rack focus**：随主体切换对焦面，刺击格挡、对话切换视点必备。
- **光学缺陷做真实感（对抗 AI 光泽）**：色差 chromatic aberration、眩光 lens flare、高光扩散 bloom/halation、边缘锐度衰减 edge softness、暗角 vignette。

---

### 二、光圈与景深（Aperture / Depth of Field）

**纠偏：** 几乎所有原文只给"shallow DOF / shallow depth of field"白话，未给 T/f 数值。电影镜头用 **T 值**（透光量校准），照相镜头用 **f 值**。提示词里两者都可写，T 值更显"电影级"。

| 光圈档 | 电影 T 值 / 照相 f 值 | 景深 | 适用 |
|---|---|---|---|
| 大光圈 | T1.3–T2 / f1.4–f2 | 极浅，焦外奶油散景 | 特写、情绪、夜戏、背景剥离 |
| 中大光圈 | T2.8 / f2.8 | 浅，主体清背景柔 | 人物中景、对话 |
| 中光圈 | T4 / f4 | 适中，双人都清 | 双人对手戏、标准叙事 |
| 中小光圈 | T5.6–T8 / f5.6–f8 | 深，环境清晰 | 群像、风景、纪实全景 |
| 小光圈 | T11–T16 / f11–f16 | 极深，全画面锐 | 大景、星芒、阳光直射 |

可落提示词术语：`shallow depth of field`、`creamy bokeh`、`circular out-of-focus highlights`（焦外圆形奶油散景）、`deep focus`（深焦，画面前后皆清）、`bokeh balls`、`subsurface scattering`（次表面散射，皮肤/玉/蜡的通透）。

景深决策规则：**主体唯一 + 情绪 → 大光圈浅景深**；**关系并存 + 群像 → 小光圈深焦**；**商品质感 → 微距 + 浅景深 + 焦点停留 1.5–2s**。

---

### 三、色温与光比（Color Temperature / Lighting Ratio）

这是原文**最系统的一处**（电影布光大师、日系青春偶像 MV、时装展示），其余多数缺省。色温用开尔文 K，光比用"主光:暗部"或"几分之几"。

色温对照（合并自多源）：

| 光质 | 色温 K | 视觉/情绪 |
|---|---|---|
| 烛光/暗琥珀底光 | 2500–3200K | 暗琥珀、病态、压抑、诡异（底光打恐怖） |
| 钨丝/逆光暖琥珀 | 2800–3500K | 温暖、怀旧、室内、黄昏逆光 |
| 暖白/室内灯 | 2700–3200K | 时装暖档、居家温馨 |
| 丁达尔暖金 | 3200–4000K | 神性、晨昏体积光 |
| 侧光中性偏暖 | 3500–5000K | 自然、肤色佳、人像 |
| 教室斜阳 | 约 5000K | 青春、暖黄日系 |
| 标准日光/中性 | 5000–5600K | 客观、写实、商品中性档 |
| 阴天/冷顶光 | 5500–6500K | 冷白、清冷、忧郁、压抑顶光 |
| 冷蓝/月光阴影 | 6500K+ | 夜、科技、孤独、月色 |

光比（原文几乎全缺，按行业标准补全）：

| 光比（主:暗） | 影调 | 情绪 | 术语 |
|---|---|---|---|
| 1:1–2:1 | 平光高调 high-key | 明快、广告、喜剧、甜 | even fill, soft highlights |
| 3:1–4:1 | 标准 | 自然、对话、纪实 | balanced contrast |
| 8:1 | 高反差 | 戏剧、张力、悬疑 | strong chiaroscuro contrast |
| 16:1 及以上 | 低调 low-key | 黑色电影、恐怖、压迫 | low-key, deep shadows, negative fill |

可落术语：`zero warm fill`（零暖光填充，冷调单一主色）、`negative fill`（负补光，加深暗部）、`chiaroscuro`（明暗对照）、`golden hour backlight`（黄金时刻逆光，高级氛围光）、`hard light 45° single key`（45°单点硬光，冷峻工业）、`warm rim light 30°`（暖金边缘光）。

**色温/光比一致性铁律**：同场景跨镜头**色温跳变 ≤ 200K**、光源入射角必须一致（原文工业片明确给出，应作为通则）。

---

### 四、帧率与画幅（Frame Rate / Aspect Ratio）

**纠偏：** 多数 AIGC skill 未写帧率（模型默认隐含 24/30fps）；"画幅"应与平台和叙事绑定，而非套用同一构图。原文工业片给 30fps、纪录片给 24fps，应显式写出。

帧率（fps）：

| 帧率 | 用途 | 术语 |
|---|---|---|
| 24fps | 电影标准、叙事剧情、纪录片 | cinematic 24fps, film cadence |
| 25fps | PAL 电视/部分平台 | — |
| 30fps | 工业/商品/直播/口播、流畅写实 | 30fps smooth |
| 48/60fps | 高速运动、慢动作素材源 | high frame rate for slow-mo |
| 120fps+ | 极慢动作（后期降速 250%–300%） | super slow motion |

慢动作纠偏：**慢镜头靠高帧率拍摄后降速**，原文"原速 2–3 倍降速""250% 慢放"是后期速率；不要二次叠加降速。AIGC 链常见做法是 24fps 基准 + 帧插值至 60fps。

画幅与平台（合并矩阵）：

| 画幅 | 场景/平台 | 构图差异 |
|---|---|---|
| 16:9 | 横屏主画幅、B站/官网/发布会/大屏/全球 Campaign | 横向带状、三层纵深、左右调度 |
| 9:16 | 竖屏短视频（抖音/小红书/视频号/Reels/TikTok） | 主体居中、纵向上下各留 ~15% 安全边距、竖版裁切保留中心宽约 56% |
| 4:3 | B站封面/朋友圈、复古/亲密 | 方正、压迫/亲密感 |
| 1:1 | 电商主图 hero、社媒方图 | 居中、产品占 60–70% |
| 4:5 | 电商详情、社媒竖图 | 上下留白 |
| 3:4 | 竖版主封面（小红书/抖音）、海报裂变 | 人物上 2/3 占画幅 |
| 2.35:1 | 宽银幕电影、强压迫/史诗 | 极横向、anamorphic |
| 角色三视图/并排参考 | 横版 16:9 / 2K | 正侧背或头肩+全身横排 |

**画幅铁律**：同一内容必须**分别给 9:16 与 16:9 的构图指导**（竖版主体居中、横版三层纵深），不可一套构图通用。竖版同类镜头时长可缩短 20–30%。

---

### 五、胶片质感与 Stock（Film Stock / Texture）

**纠偏：** 多数 skill 仅写 `film grain` 占位，少数（城市记忆、日系 MV）给了真实 stock，应优先引用具名 stock 锁定色彩科学。

具名胶片/感光体系（可直接写入提示词）：

| Stock / 体系 | 色彩特征 | 适用 |
|---|---|---|
| Kodak Vision3 | 宽容度高、肤色暖准 | 电影级叙事、城市记忆 |
| Fuji Eterna | 低饱和、柔高光、青绿阴影 | 文艺、冷静纪实 |
| ARRI Alexa Natural | 数字电影标准、中性宽容度 | 现代电影写实底 |
| Kodak Gold 200 | 暖调、轻微过曝、高光溢出 | 暖阳户外、青春、日系 |
| Fuji Pro 400H | 冷柔、细腻颗粒、自然肤色 | 室内荧光、阴天、日系冷调 |
| 银盐正片质感 | 高密度、厚重肤色 | 时装、奢品 |

质感叠加词（中英）：`fine 35mm film grain`（精细 35mm 颗粒）、`subtle photochemical grain`（微妙光化学颗粒）、`light analog noise`（轻微模拟噪点）、`halation`（高光晕染/漏光）、`light leak`（漏光，混合基调允许）、`muted palette / low saturation`（低饱和）、`soft highlights, detailed shadows`（柔高光、暗部留细节）、`real skin tone`（真实肤色）。

**对抗 AI 光泽的"有机不完美"组合**（写实真人默认编入，振幅要小且连续）：`very subtle handheld micro-shake`（极轻微手持微震）+ `slight natural camera drift`（轻微镜头漂移）+ `minimal breathing movement`（最小呼吸感）+ `subtle film grain`。**静态镜头则省略所有手持语言。**

---

### 六、情绪/氛围 → 参数选择 决策表

| 目标氛围 | 焦段 | 光圈/景深 | 色温 | 光比 | 帧率 | 画幅 | 胶片/质感 |
|---|---|---|---|---|---|---|---|
| 温暖怀旧/青春 | 35–50mm | 中大 T2.8 浅 | 3000–5000K 暖 | 3:1 柔 | 24fps | 16:9 | Kodak Gold 200 + halation |
| 悬疑/张力/黑色 | 85mm/长焦 | 大 T1.4 极浅 | 偏冷 5500K+/混 | 8:1–16:1 low-key | 24fps | 2.35:1 | Vision3 + negative fill |
| 史诗/世界观大场 | 超广角/anamorphic | 中小深焦 | 黄金时刻 3500K | 4:1 + 逆光 | 24fps | 16:9/2.35:1 | Alexa Natural + 颗粒 |
| 冷静文艺/孤独 | 35mm | 中浅 | 冷柔 6000K | 低反差 muted | 24fps | 4:3/16:9 | Fuji Eterna 低饱和 |
| 高奢商品/质感 | 微距/85mm | 浅 + 焦点停留 | 中性 5000K/暖金 | 高反差 chiaroscuro | 30fps | 1:1/9:16 | 银盐正片 + 高光扩散 |
| 工业冷峻 | 微距/广角 | 中 | 主光冷 + 边缘暖金 | 硬光 45° 高反差 | 30fps | 16:9/9:16 | 干净 + 流光 |
| 武戏/动作 | 35mm 全景 + 长焦交汇 | 浅景深随焦点 | 视场景 | 高反差 | 24fps（慢动作源 60–120fps） | 16:9 | 颗粒 + 动态模糊 |
| 竖屏短剧/POV | 35–50mm | 中浅 | 暖床头灯/逆光 | 3:1 | 24fps | 9:16 | film grain + 暖调 |
| 纪录/纪实 | 28–35mm | 深焦 | 自然白平衡 | 自然 3:1 | 24fps | 16:9 | 自然颗粒 + 真实肤色 |

决策口诀：**主体越唯一、情绪越浓 → 焦段越长、光圈越大、光比越高、色温越偏离中性**；**关系越多、越纪实 → 焦段越广、景深越深、光比越平、色温越中性**。

---

### 七、常见错误与禁止项

- **只写"电影感/cinematic"不落参数**：模型理解模糊。必须落到焦段+光圈+色温+光比至少其一的具体词。
- **空写 `film grain` 当万能贴**：颗粒只是表层；缺色彩科学（stock/色温）和光比，质感仍假。优先引具名 stock。
- **混淆 T 值与 f 值随意写**：电影镜头写 T 值，照相镜头写 f 值；别写出 "T16 大光圈" 这类自相矛盾。
- **同场景跨镜头参数漂移**：色温跳变 >200K、光圈/景深忽深忽浅、光源入射角变向 → 穿帮。同场必须锁定。
- **慢动作二次降速叠加**：高帧率拍摄已是慢源，再叠"原速 2–3 倍"会过慢、卡顿。
- **一套构图通用两种画幅**：9:16 与 16:9 必须分别给构图；竖版没留安全边距 → 主体被裁。
- **静态镜头误加手持微震**：static / fixed shot 必须省略 handheld / camera drift 语言，否则画面违和抖动。
- **大光圈用于群像关系戏**：浅景深虚掉副主体 → 丢人物关系；群像应深焦。
- **超广角拍正脸特写**：边缘畸变使五官变形；特写应 85mm+。
- **色温与情绪反向**：恐怖戏打高色温平光、甜宠戏打冷蓝低调 → 情绪错位。
- **AIGC 写实片忘了"有机不完美"**：缺微震/颗粒/呼吸感 → AI 塑料光泽；但振幅过大又显廉价手抖，须"小而连续"。
- **变形宽银幕滥用蓝眩光**：anamorphic flare 是点缀，过量则做作。

---

### 八、可直接复用的提示词参数块模板

写实电影叙事（中英混排，按"摄像机→主体→空间→音频"语序从属）：
```
35mm wide lens, T2.8 shallow depth of field, focus on subject with soft background bokeh,
warm key light 3200K from camera-left, cool fill 5600K, 4:1 lighting ratio,
golden hour backlight, 24fps cinematic cadence, 16:9,
Kodak Vision3 color science, fine 35mm film grain, subtle halation,
very subtle handheld micro-shake, real skin tone, highlights not blown, shadows retain detail
```

高奢商品微距：
```
macro lens 5–8cm working distance, T4 with focus hold 1.5–2s,
neutral 5000K key top-right 60° + warm gold rim light 30°, strong chiaroscuro contrast,
30fps, 1:1, silver-halide positive film texture, specular highlight bloom,
albedo/roughness/metalness material accuracy, super slow motion source 120fps for 250% slow-mo
```

竖屏情绪短剧/POV：
```
50mm portrait feel, shallow depth of field, warm bedside lamp 2800K backlight,
3:1 ratio, 24fps, 9:16 (subject centered, 15% top/bottom safe margin),
subtle film grain, muted warm cinematic tones, slight natural camera drift
```

> 落地提醒：AIGC 视频模型（Seedance 2.0 / Kling 3.0 / Veo 等）对**自然语言镜头词响应优于精确数值**，但精确数值能显著提升一致性与"电影级"判定。**策略 = 数值打底（锁一致性）+ 自然语言镜头词包裹（驱动模型）**；给不出数值的字段，用本节受控术语占位，绝不留"电影感"这类空词。
