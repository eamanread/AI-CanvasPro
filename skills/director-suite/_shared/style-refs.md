# 类型风格与导演语汇（镜头语言 / 视觉锚点 / 名家参考 / “哇塞”招式库）

> 定“风格核心/视觉基调”与追求高级感时查阅。

---

## 类型风格与导演语汇（镜头语言 / 视觉锚点 / 名家参考）

> 本节回答三个问题：**这场戏是什么"片种气质"（类型风格）**、**用什么镜头去说（镜头语言）**、**画面里钉死哪几样东西保证一致与可信（视觉锚点）**、以及**借谁的眼睛说（名家参考）**。四者不是平行清单，而是一条因果链：先定气质 → 反推镜头与光色 → 落锚点保一致 → 用名家锚校准审美基准。

---

### 一、核心方法论：导演/调色师口吻，而非画面清单

这是绝大多数题材 skill 的共识铁律，应作为本维度第一性原则：

- **写提示词 = 电影导演 + 调色师向团队下指令**，不是描述"画面里有什么"的清单。用**连贯自然语言**写内容（主体 + 行为 + 环境），用**简短词组**写视觉美学（风格 / 颜色 / 光影 / 构图）。
- **只描述摄影机看得见的物理可见之物**。不解释角色动机内心（禁"仿佛他不在乎这张照片"），不描述画外 / 不可见元素，不写心理旁白。
- **拒绝文学化修饰**——空洞修辞（"电影感 / 梦幻 / 精致 / 高级感"）必须落地为具体物理事实（如"裙摆延迟 0.3 秒落定""高光在丝绸表面滑过"）。
- **语言策略**：中文交互环境下提示词正文用中文；但**镜头术语、音效标签、模型名、参数、负向约束词保留英文**；旁白/对白严守成片规格的输出语言。

---

### 二、"电影级提示词 6 大核心规则"（剧情/广告/叙事类通用骨架）

约 15 个剧情与广告类 skill 共享同一套规则，应写成**一段流畅自然英文**编织进去，**禁止输出为带标签的分段章节**：

| # | 规则 | 落地要点（中/英） |
|---|---|---|
| 1 | 专业风格术语 + 作者论锚定 | 用**具体导演 + 影片**做锚，而非泛风格名。写 `Neo-Noir style, David Fincher style, inspired by Se7en`，不写泛泛的 `neo-noir` |
| 2 | 构图与镜头 | 显式声明景别 + 机位：`over-the-shoulder (OTS)` / `Dutch angle` 荷兰角 / `close-up` / `medium shot` |
| 3 | 光影 | 主光 + **负向补光(negative fill)** + 强明暗对比 `chiaroscuro` + 深面部阴影 |
| 4 | 调色 | 院线级**克制单一主导色相**（约 90%），禁霓虹色相冲突 |
| 5 | 视觉渲染质量 | `fine rendering quality` 精细渲染、`rich and intricate details` 丰富错综细节、`soft-focus with subtle Gaussian blur` 轻微高斯柔焦 |
| 6 | 氛围与潜台词 | 微表情 + **戏剧瞬间定格**（freeze a dramatic beat） |

**铁律补充**：动则写运动、不动写 `static` / `fixed`；视频提示词层级顺序恒为 **摄影机 → 主体 → 空间 → 音频**；图内文字用引号包确切文案（`a neon sign reads "DANGER"`）。

---

### 三、镜头语言工具箱（景别 / 机位 / 运镜 参数化）

每个镜头三件套必填：**景别 + 机位角度 + 镜头运动**。

**景别（Shot size）**

| 中文 | 英文 | 取景线 / 用途 |
|---|---|---|
| 大远景/建立镜头 | extreme wide / establishing shot | 交代空间关系、身法站位、移动路线 |
| 全景 | wide / full shot | 动作完整可读、群像调度 |
| 中景 | medium shot | 腰/腿部以上，叙事主体 |
| 中近景 | medium close-up | 力量交汇点、关系互动 |
| 特写 | close-up (CU) | 表情、微表情 |
| 大特写/微距 | extreme close-up / ECU macro | 匠心细节、质感、呼吸变焦 |

**机位（Camera position）**：高度=低/中/高/俯/仰；方位=正/斜/侧；俯仰角可参数化（如 `slight high angle ~15°` / `low angle`）。

**运镜（Camera move）**及功能挂钩：

| 运镜 | 英文 | 功能 / 情绪 |
|---|---|---|
| 固定 | static / fixed | 凝视、稳定、客观 |
| 推 | push-in / dolly in | 情绪升温、聚焦、压迫 |
| 拉 | pull-back / dolly out | 揭示环境、抽离、留白 |
| 平移 | pan / tilt | 空间巡视、关系连接 |
| 跟拍 | tracking / follow | 跟随主体（**方向须与角色运动一致**） |
| 环绕 | orbit / arc | 强调主体、关系张力 |
| 升降 | crane / jib (up/down) | 史诗感、视角转换 |
| 手持微抖 | handheld micro-shake | 纪实、临场、不安 |
| 变焦/移焦 | zoom / rack focus | 焦点转移、主次切换 |
| 镜头呼吸 | lens breathing | 微妙生命感、有机质感 |

**光学**（立体写实类必反推）：焦段 + 功能挂钩——`35mm` 叙事/环境关系、`50mm` 自然视角、`85mm` 特写、长焦 `telephoto` 过肩压缩 + 浅景深透视；进阶可反推视角宽窄、镜头畸变、球面镜头、景深范围、焦点平面、压缩透视、边缘锐度衰减、传感器成像倾向、快门冻结、运动模糊、色差 chromatic aberration、眩光 lens flare、高光扩散 specular bloom。

**画幅差异化构图铁律**：必须同时给出 **9:16 竖屏** 与 **16:9 横屏** 两种画幅下的构图差异指导，而非套用同一构图。

---

### 四、视觉锚点（一致性的物理钉子）

视觉锚点 = 跨镜头/跨剪辑保证一致性的可见物，分三类：

**1. 资产参考图锚点（身份/风格锁定）**
- **三视图 / 四视图设定图**：正视 / 侧视 / 背视 + 四分之三背视（`front view / side view / three-quarter back view, white background, clean studio lighting`），锁角色五官/服装/比例。
- **半身特写**作面部一致性主参考；**首帧图**作视频生成的视觉锚点（景别/光线/主体姿态须严格一致）。
- **元素 ID 系统**：关键主体 + 关键地点场景 + 关键道具，三者跨镜锚定。
- 占位符规范：人物 `<<<image_1>>>`、背景 `<<<image_2>>>`；引用后紧跟继承声明（`inherit the exact form, proportions, surface finish, and logo placement`）。

**2. 母题锚点（关键词词表）**——把"风格"钉成具体可见物，开头注入做风格基准。
- 反向定义真实感：用瑕疵证明真实——`film grain` 胶片颗粒、`high ISO noise` 高ISO噪点、`compression / interlacing` 压缩/隔行扫描伪影、`light leak` 漏光、`lens flare` 眩光、`motion blur` 动态模糊；"not a clean commercial 不要干净的广告感"。

**3. 物件叙事锚点（时间感/连续性）**
- 关键物件**至少出现两次且第二次状态已变**（位置变/损坏/被拿走）。
- 静态图也要"刚刚发生过"：用姿态、地面痕迹、风、尘、光残留表现 `frozen moment / aftermath` 余波；动作写"中间凝固的一帧"而非长动作。

---

### 五、名家与片名参考库（按气质取锚）

作者论锚定 = 点名**导演署名风格 + 具体影片**做审美背书，比泛风格名精确得多。常用对照：

| 想要的气质 | 可用名家/影片锚（英文） |
|---|---|
| 黑色/犯罪/高对比 | `David Fincher style, inspired by Se7en` / `film noir` |
| 对称构图/古怪冷幽默 | `Wes Anderson symmetry, pastel palette` |
| 慢电影/东亚文艺 | `Hou Hsiao-hsien` / `Wong Kar-wai` / `Edward Yang`（observational, contemplative）|
| 决定性瞬间/纪实 | `Henri Cartier-Bresson decisive moment` |
| 自然光写实 | `Roger Deakins naturalistic cinematography` |
| 史诗胶片质感 | `IMAX 70mm film grain, PANAVISION anamorphic` |
| 高奢 TVC/广告 | 好莱坞克制单色 + Hero Moment 节拍 |

> **取锚原则**：锚是"基准"不是"抄袭"——借其光质、色相、构图秩序、节奏惯例，而非复制具体画面。

---

### 六、分题材气质速查表（情绪/类型 → 镜头语言选择）

| 题材气质 | 风格锚定词 | 主导景别/运镜 | 视觉锚点 | 光色倾向 |
|---|---|---|---|---|
| 东亚文艺片/慢电影 | slow cinematic, observational, emotionally restrained, contemplative | 空镜+长镜头+lingering shot，少切 | 冷茶/电饭煲蒸汽/光束浮尘/旧拖鞋 | 柔自然光+muted colors+暖肤+雾感 |
| 纪实观察/生活流 | documentary, observational, lived-in | 决定性瞬间+手持+空气感 | 首帧锚+物件复现变化 | 自然光+dusty air/morning mist |
| 黑色/剧情短片 | Neo-Noir, Fincher, inspired by Se7en | OTS+Dutch angle+CU | 单色调+chiaroscuro | 强明暗+负补光+深阴影 |
| 高奢/运动/汽车 TVC | 立体写实+品牌世界观 | 焦距反推+Hero Moment+3s反馈/7s高潮 | 代言人三视图+产品三视图 | 克制单主色+高光控制 |
| GTA/开放世界游戏 | 热带度假广告×真实犯罪纪录片×荒诞短视频, UE5 render, leaked gameplay feel | 5视角分类+第三人称 | 棕榈/湿沥青/粉青霓虹/积水倒影 | 粉青霓虹+潮湿夜 |
| 体育转播伪纪实 | real live sports broadcast look | 长焦转播+cutaway偷拍 | ESPN比分条/隔行扫描TV颗粒 | TV压缩质感 |
| 日系青春偶像 MV | 平成胶片+纪录片偷拍青春 | 低角仰拍+freeze frame+handheld drift+rack focus | 逆光过曝+发丝catching sunlight+光束浮尘 | 逆光高光溢出+analog warmth |
| 国风纯意境 | 国风写实/插画, 纯意境无剧情 | 远景奠基→中近景→光影转场→全景收尾 | 月夜/庭院/云海/白衣侧影/粒子 | 柔和高级+月色光影 |
| 一镜到底 POV/室内 | oneer/single continuous take, 写实摄影 | 第一人称POV+镜头呼吸+手持拟真 | 胶片颗粒+自然白平衡+分镜手稿标注 | 低饱和暖调 |
| 微缩世界 | tilt-shift miniature, non-realistic non-anime | 微距移轴+浅景深 | 前景/远景虚化+中间清晰三层+1:12比例 | 自然光+creamy bokeh |
| 羊毛毡动画 | wool felt animation, fiber texture | 视觉讲故事+流畅运动 | 可见纤维/圆润无锐边/暖哑色 | warm muted palette |
| 动作预演分镜 | stick-figure storyboard, 手绘粗粝 | 英文技术标注(PUSH IN/WIDE/POV) | 火柴人+轨迹虚线 | 无（线描） |
| 群像主视觉 | master wide shot, film still | wide+略俯15°+单张定帧 | 空间四层(前/中/中后/深)+色卡锁定 | golden hour斜射金光+冷蓝阴影补色 |
| 武戏分镜 | 动作命题先行 | wide交代身法+CU抓力量点+low angle压迫 | 动作母题+力学连续 | 高对比 |

---

### 七、群像与多人调度（空间四层法）

群像主视觉 = 一张静态电影剧照同时解决人物关系/空间层次/气氛/光色/一致性，**不是把角色摆满**。

- **空间强制四层**：前景 foreground（视觉压迫/权力锚点，常占某 1/3）→ 中景 midground（叙事核心/沉默中心）→ 中后景 mid-background（副主体/旁观者/道具）→ 深景 background（世界观/地平线/大气雾化）。
- **主次秩序**：深景角色尺寸更小；明确谁压住谁、谁占视觉权力、谁被环境吞没；用"互相看见/互相忽视/彼此压迫/共同沉默"落实关系。
- **每角色必写**：位置、大小比例、朝向、视线方向、身体朝向、姿态、动作状态、遮挡关系。
- **构图法**：对称 / 偏轴对称 off-axis symmetry / 三角构图 / 横向带状 / 纵深构图；视觉锚点（图中心）与叙事锚点（故事中心）可不同。
- **空间清晰度 + 电影空气感**：先定前中后景清楚位置，再用 `atmospheric haze` / `depth` / `partial occlusion` 增真实空间感。

---

### 八、武戏与动作调度（题材无关导演知识）

- **动作命题先行**：开拍前判定核心戏剧问题（实力差距/试探/情绪爆发/逃生/追击/压制/反杀/决斗/群战），据此设计可反复出现的**动作母题**（如"鞋底刺耳摩擦 vs 软底无声落地"），拒绝套通用模板（互砍/格挡/飞踢/落地）。
- **时间轴结构**：默认 ≤15 秒；常用 15 秒 = 10 组 × 1.5 秒；超 15 秒拆多卡并显式设计承接动作。每组保留完整微节奏：**蓄力 → 出招 → 碰撞 → 反应 → 收势**。
- **攻防因果与力学连续**：写清攻击方向/接招方式/力量传导/脚步移动/重心；每个动作回应上一个、造成下一个的身体或空间结果；严禁"上一秒被压制下一秒无理由重置姿态"。
- **节奏靠半拍**：加速 / 停顿 / 爆发对比，非匀速。
- **镜头铁律**：跟拍/环绕方向须与角色运动方向一致；wide 保动作可读、CU 抓力量点、low angle 制压迫；浅景深随焦点主体切换。

---

### 九、表演与时间轴（让镜头语言落到可执行）

- **情绪显性化**：抽象情绪翻译成逐身体部位的生理反应——不写"他很愤怒"，写"喉结滚动 / 拳头攥紧又松开 / 眉头紧锁"；受惊写"后撤半步 / 重心下沉 / 双手抬至下巴前呈防御姿态"。
- **节拍分秒**：视频是时间的艺术，以 10 秒为单位拆主节拍（如"建立压力 → 冲突前压 → 辩解克制 → 裁决落定"四拍精确到秒）。
- **首尾衔接 / 动量守恒**：前镜尾帧视觉重心与后镜首帧动量守恒（eye-tracing 视线轴对齐），消除切镜跳跃感；可用动作匹配剪辑或声音衔接（如画外玻璃碎裂声触发下一镜反应）。
- **节拍语法**：短视频常用 3s 视觉钩子 / 7s 高潮；TVC 用 3s 反馈 / 7s 高潮。

---

### 十、常见错误 / 禁止项

- ❌ 把提示词写成"画面里有什么"的清单，而非导演下指令；堆砌标签段落而非编织自然语言。
- ❌ 用泛风格名（`neo-noir`）代替作者+影片锚（`Fincher, Se7en`）。
- ❌ 空洞修辞当质感——"电影感/梦幻/精致/高级感"未落地为物理可见事实。
- ❌ 解释角色内心动机、描述画外/不可见元素、写心理旁白。
- ❌ 调色多色相冲突、霓虹乱撞；丢掉单一主导色相的克制。
- ❌ 镜头运动方向与角色运动方向冲突；运镜抢戏让动作读不清（太远不刺激/太近看不清）。
- ❌ 群像"把人摆满"沦为合影；只讲场景丢人物关系；只讲风格丢剧情意义。
- ❌ 武戏动作堆叠无因果；上一秒被压制下一秒无理由重置；套通用模板无动作命题。
- ❌ 9:16 与 16:9 套用同一构图，不做画幅差异化。
- ❌ 跨镜头一致性失守：服装整洁度/道具位置/光线入射角/色卡/角色身份前后不一。
- ❌ 把姿态参考图误用为身份参考图；参考图功能混用导致拼贴感。
- ❌ 该写运动不写运动（漏 `static`/`fixed` 或漏运镜）；该锁画幅比例不锁。
- ❌ 群像深景角色不缩小，破坏纵深透视。


---

## 附录A · 名家 / 影片 / 镜头 / 色彩 参考库（抽取自 44 个影视 skill，去重）

PANAVISION (镜头/变形宽银幕观感锚点)、IMAX 70mm (画幅/胶片颗粒film grain质感锚点)、Seedance 2.0 (核心视频生成模型, MultiModalToVideo, 720p)、GPT Image 2 (角色三视图/场景四视图/运镜轨迹图生成, 2K)、Suno 5 (BGM/text_to_instrumental)、ElevenLabs v3 (旁白/text to narration)、开放世界犯罪/街头题材开放世界城市展示(GTA6公开素材启发，仅借视觉语法不复刻)、Unreal Engine 5 (UE5渲染质感)、Nano Banana Pro (角色3D渲染图生成模型 TextToImage/ImageToImage)、Seedance 2.0 (Shot视频生成模型 MultiModalToVideo，长达15s自然转场)、X社区/X-style (gameplay车戏、手机围观直播、CCTV监控荒诞事件三类疯传镜头配方)、synthwave合成器波 / modern rap现代说唱 / southern radio rock南部电台摇滚 (BGM风格参考)、CCTV监控视角 / 警方bodycam视角 (视角参考)、是枝裕和《步履不停》——日光低对比柔和色调、王家卫《花样年华》——暖黄深绿情绪色块、李沧东《燃烧》——黄昏金色与暗部蓝灰、侯孝贤《最好的时光》——胶片感自然偏暖、Happy Horse(视频生成主模型)、Vidu Q3(视频备用模型)、Nano Banana Pro / Gemini 3 Pro Image(图像生成模型)、Mureka 8(器乐BGM模型)、ElevenLabs v3(旁白配音模型)、ESPN(转播叠层/台标/色彩管理风格参考)、NBA季后赛转播(东部半决赛G3 Knicks vs 76ers, 费城76人主场, 系列赛2-0)、GPT Image 2(ImageToImage 出图模型)、Seedance 2.0(MultiModalToVideo 视频模型)、Jumbotron(场馆大屏, 作为视线锚点道具)、David Fincher (导演/作者论风格锚)、Se7en《七宗罪》(影片视觉锚点)、Neo-Noir 新黑色电影(类型风格锚)、Seedance 2.0 (视频生成模型, MultiModalToVideo)、Nano Banana 2 / Gemini 3.1 Flash Image (图像生成模型)、Seedance 2.0、Seedance 2.0 Fast、Nano Banana 2 (Gemini 3.1 Flash Image)、MultiModalToVideo、ImageToImage、TextToImage、Seedance 2.0(默认视频模型,720p画质优)、Seedance 2.0 Fast(快速视频模型)、Nano Banana Pro / Gemini 3 Pro Image(设定图文生/图生,2K)、GPT Image 2(封面图生图,2K)、MultiModalToVideo(视频生成路径,最长15s)、黄金时刻逆光 Golden hour backlight、丁达尔效应 Tyndall effect、镜头呼吸效应 Lens breathing、焦点转移 Rack focus、胶片颗粒感 Film grain、镜头光晕 Lens flare、业余Vlog感 Amateur Vlog aesthetic、First-person boyfriend POV / Subjective camera 主观机位、David Fincher（导演风格锚点）、Se7en《七宗罪》（影片视觉参照）、Neo-Noir 新黑色电影（类型锚点）、Nano Banana 2 / Gemini 3.1 Flash Image（图像模型）、Seedance 2.0 / Seedance 2.0 Fast（视频模型）、MiniMax Speech 2.8 HD（中文音色模型）、ElevenLabs v3（英文音色模型）、David Fincher(导演,风格锚点)、Se7en《七宗罪》(影片,Neo-Noir视觉参考)、Neo-Noir(黑色电影风格)、Nano Banana 2 = Gemini 3.1 Flash Image(图像生成模型,2K)、Seedance 2.0(视频生成模型,720p)、GPT Image 2(分镜/角色/场景图生成模型)、Nano Banana Pro / Gemini 3 Pro Image(图像兜底模型)、Seedance 2.0(MultiModalToVideo 视频生成模型,全能参考功能)、David Fincher (导演)、Se7en 七宗罪 (影片视觉锚点)、Neo-Noir 新黑色 (类型风格)、Midjourney V7 (元素图/风格基准)、Nano Banana Pro / Gemini 3 Pro Image (关键帧精修)、Seedance 2.0 (镜头视频生成, 720p)、David Fincher(导演,风格锚示例)、Se7en《七宗罪》(影片,inspired by视觉锚点示例)、Neo-Noir(新黑色电影,风格术语)、Nano Banana 2 / Gemini 3.1 Flash Image(出图模型)、Seedance 2.0(视频生成模型)、贾樟柯 (Jia Zhangke)、是枝裕和 (Hirokazu Kore-eda)、Magnum Photos、Leica Documentary、Kodak Vision3 (film stock)、Fuji Eterna (film stock)、ARRI Alexa Natural (色彩科学)、David Fincher(大卫·芬奇)风格、《七宗罪》Se7en(视觉风格锚点)、Neo-Noir(新黑色电影风格)、Dutch tilt(荷兰式倾斜镜头)、Nano Banana 2 / Gemini 3.1 Flash Image、Nano Banana Pro / Gemini 3 Pro Image、OmniHuman 1.5、Kling 3.0、GPT Image 2 (多宫格关键帧生成模型)、作者电影/参考片 (auteur film / reference film 作为风格锚点, 具体片名由用户简报提供)、Office Noir (示例元素地点 [Element_Office_Noir], 黑色电影氛围参考)、CCTV纪录片解说腔(磁性男声配音参考)、Seedance 2.0(MultiModalToVideo视频模型)、GPT Image 2(TextToImage分镜参考图模型)、MiniMax Speech 2.8 HD(VO首选)、ElevenLabs v3(VO备选)、Mureka 8(BGM乐器模型)、MediaKit(超分导出)、《天工开物》(片名/古代工艺文献意象)、国画矿物颜料:赭石/松石绿/朱砂/黛蓝、中国古典器乐:古琴/埙/编钟、Suno 5(器乐/音频)、Mureka 8(器乐/音频)、电影分镜手稿(storyboard)字体/标注美学、Seedance 2.0 (视频生成模型)、GPT Image 2 (图片资产模型)、Suno 5 / lyrics_to_song (音乐生成)、MultiModalToVideo (生成管线)、苹果式简洁构图(Apple-style minimal composition)、Nano Banana Pro / Gemini 3 Pro Image(元素图)、Suno 5 / Mureka 8(BGM)、MiniMax Speech 2.8 HD(旁白)、MediaKit(超分辨率)、XLR接口、OLED发光字符屏、编码器旋钮/拉丝铜圈、PCB主板/金手指连接、色值#4FC3F7/#E0F7FA/#00B0FF/#CE93D8/#FFD54F、Seedance 2.0 (默认视频模型/720p/1080p)、Seedance 2.0 Fast (快速预览)、GPT Image 2 (角色三视图/舞台/道具资产图,ImageToImage/TextToImage)、OmniHuman1.5 (音频驱动全身舞蹈ImageToVideoByAudio,半身/口型问题需回退)、Suno 5 (自动BGM text_to_instrumental)、Mureka 8 (自动BGM备选)、MultiModalToVideo (首选视频生成工具)、lyrics_to_song (无歌词舞蹈BGM生成)、舞美参考: 霓虹舞台/动漫演唱会舞台/赛博空间/城市天台/镜面练舞室/梦幻光幕/像素风舞台/国风灯阵/未来感虚拟舞台、颜料色彩参考(平面反推): 墨分五色/赭石/藤黄/石青/石绿/朱砂/花青/胭脂/群青、插画风格参考: 二次元/厚涂/赛璐璐/国风插画/游戏立绘/Q版/角色设定图、GPT Image 2(图像,默认推荐)、Nano Banana Pro / Nano Banana 2 (Gemini 3 Pro Image / 3.1 Flash Image)、Seedream 4.5、Midjourney V7、Seedance 2.0 / Seedance 2.0 Fast(视频)、Kling 3.0 Omni、Google Veo3.1 Fast(FirstFrameToVideo降级)、ElevenLabs v3(配音)、tilt-shift移轴摄影/diorama微缩模型摄影(视觉流派参考)、Se7en《七宗罪》（影片视觉锚点）、Seedance 2.0（视频生成模型）、Nano Banana 2 / Gemini 3.1 Flash Image（元素图像模型）、Muted watercolor wash（调色参考风格）、David Fincher（大卫·芬奇 导演风格锚点）、《Se7en（七宗罪）》（影片视觉锚点）、Neo-Noir（新黑色电影 类型风格）、Kling 3.0 Omni（视频生成/一致性模型，1080p）、Nano Banana 2 / Gemini 3.1 Flash Image（图像生成模型，2K）、35mm film grain（35mm 胶片颗粒 质感参考）、《Se7en》(《七宗罪》,视觉风格锚点)、Neo-Noir（新黑色电影 风格)、Nano Banana 2 / Gemini 3.1 Flash Image（图像生成模型,2K）、Seedance 2.0（视频生成模型,720p）、Nano Banana、Nano Banana Pro (Gemini 3 Pro Image)、Flova (skill 作者)、GPT Image 2 (图片生成模型)、Seedance 2.0 VIP (视频生成模型/MultiModalToVideo)、运镜术语: Push-in / Pull-out / Orbit / Tracking / Whip-pan、构图法: 黄金分割 / 对角线平衡 / 中轴对称 / 动态斜线 / 速度线、PBR材质模型(反照率/粗糙度/金属度/菲涅尔/次表面散射SSS)、渲染技术: 路径追踪 / 光线追踪 / 全局光照GI / 环境遮挡AO / 体积散射、镜头光学概念: 镜头呼吸效应 / 球面镜头 / 压缩透视 / 色差 / 眩光、视频模型:Seedance 2.0 / Seedance 2.0 Fast、图像模型:GPT Image 2 (三视图/海报)、音乐模型:Suno 5 (备选 Mureka 8)、配音引擎:ElevenLabs v3 (备选 Doubao)、ElevenLabs 女声音色:Sage(默认)/Xiaoxi/Anna Su/Tiffy/Nina、ElevenLabs 男声音色:Yu(默认)/Chen/Adam Li/Guan Tang Bao/Jin/Vincent/Jason Chen、Doubao 音色:Girl(女默认)/Elegant Gentleman(男默认)、目的地参考:大理/冰岛/巴黎、平台:Flova / AIDIR创作社区、作者:黄鑫波、AKB48(平成时代黄金年代2009-2014群像基准)、《Heavy Rotation》(BGM编曲气质参考)、《Ponytail to Shushu》(BGM编曲气质参考)、《恋するフォーチュンクッキー》(BGM编曲气质参考)、Kodak Gold 200(暖调胶片色彩参考)、Fuji Pro 400H(冷柔调胶片色彩参考)、Nano Banana Pro/Gemini 3 Pro Image(角色一致性图像模型)、Midjourney V7(风格探索图像模型)、Seedance 2.0(主视频生成模型)、Kling 3.0 Omni/Kling 3.0 Audio(备用/竖版视频模型)、Wan2.6(原生竖版视频模型)、Google Veo3.1 Fast(同步音效对白视频模型)、Suno 5/Mureka 8(BGM生成模型)、Jimeng SR/MediaKit(超分辨率模型)、Shibuya-kei(Mureka 8可用流派标签影响)、Nano Banana Pro (Gemini 3 Pro Image) — 出图模型(刀版/服饰卡/空场景/六宫格, 2K)、Seedance 2.0 — 视频生成模型(720p/15s, 标签规范<>Foley {}对白 ()音乐 【】字幕)、Suno 5 — BGM/text_to_instrumental主模型(禁艺术家名)、Mureka 8 — BGM备选模型(命中艺术家名时切换)、Chiaroscuro — 明暗对照法(秀场戏剧侧光锚点)、Nu-Jazz / Lo-fi Hip-hop — 休闲街头BGM参考、Chamber Jazz / 交响弦乐 — 礼服晚装BGM参考、Industrial Techno / Dark Ambient — 机能概念装BGM参考、golden hour rim light / diffused overcast fill — 自然光镜头语言参考、银盐胶片色调(silver-halide film tone) — 全片统一视觉锚点、GPT(角色2D原画生成)、Nano Banana Pro / Gemini 3 Pro Image(四视图ImageToImage,2K)、Nanobanan(3D真实感形象卡转换+材质分析)、GPTImage 2(UI界面与场景关键帧生成)、Seedance 2.0(分段视频生成)、作者:境在丨米叔、Seedance2.0、doubao、elevenlabs、Tyndall effect (light ray / volumetric dust)、Chiaroscuro lighting、阿娴AI(skill作者)、Seedance 2.0(主视频生成模型MultiModalToVideo)、Kling 3.0 Omni(备选视频模型refer_type:feature)、Vidu Q3(兜底ImagesToVideo静态转动画)、GPT Image 2(图像生成模型2K)、MiniMax Speech 2.8 HD(旁白VO模型)、Suno 5(背景音乐instrumental)、Mureka 8(背景音乐instrumental)、丁达尔/Tyndall(体积光命名参考)、Seedance 2.0(视频生成,MultiModalToVideo,自动烘焙SFX)、Nano Banana Pro(元素图TextToImage/ImageToImage)、Suno 5 / Mureka 8(BGM text_to_instrumental)、ElevenLabs v3 / Doubao(旁白 text to narration)、Ai创意研习社(作者/同款风格出处)、GPT Image 2.0(图片资产模型)、Seedance 2.0 / MultiModalToVideo多参考段落导演(视频模型)、Suno 5(配乐模型)、ElevenLabs v3(配音模型)、豆包 Doubao(配音模型)、前门上方小凸镜 convex mirror above the front door、右侧外后视镜 right-side exterior rearview mirror、《舌尖上的中国》(视听风格全方位参考锚点)、Nano Banana 2(文生图/图生图模型)、Seedance 2.0(文生视频模型)、GPT Image 2 (角色参考图模型, ImageToImage, 2K)、Seedance 2.0 (分镜视频模型, MultiModalToVideo, 720p)、MiniMax Speech 2.8 HD (内心独白VO语音合成, 中文首选)、《Se7en》(七宗罪，inspired by Se7en 视觉锚点)、Neo-Noir 新黑色电影风格、Midjourney V7（含 --sref 风格代码体系）、Seedance 2.0（720p 视频模型）、Nano Banana（key_frame 关键帧生成）、Flova（作者/平台）、David Fincher（导演,作者锚点）、Neo-Noir 新黑色（类型风格锚点）、Seedance 2.0（视频模型）、豆包 Doubao（中文配音模型）、ElevenLabs（英文/全球配音模型）、邵氏电影(Shaw Brothers)80年代港片武侠美学、Seedance 2.0(视频主路径,备选Seedance 2.0 Fast)、Nano Banana Pro / Gemini 3 Pro Image(图像生成与图生图,2K)、Suno 5(BGM,备选Mureka 8)、古筝/琵琶(港式武侠配乐器色)、35毫米胶片(35mm film stock视觉锚点)、韦斯·安德森(Wes Anderson)、《布达佩斯大饭店》(糖粉玫红·薰衣草紫·奶油白)、《法兰西特派》(黑白基底+饱和色块)、《犬之岛》(褪色哑光+暖琥珀)、《天才一族》(芥末黄·焦糖棕·橄榄绿)、《月升王国》(秋叶橙·苔藓绿·沙黄)、Futura字体(全局几何无衬线)、Art Deco字体(酒店/宫廷)、35mm film(画幅/胶片质感锚点)、ElevenLabs v3(旁白)、Nano Banana Pro/Gemini 3 Pro Image · Nano Banana 2/Gemini 3.1 Flash Image(图像2K)、Seedance 2.0 / 2.0 Fast(视频720p)、Kling 3.0 Omni(视频,<<<image 1>>>参考图绑定)、KBO 韩国职业棒球联赛 (Korea Baseball Organization)、MBC Sports+ (转播网络/台标水印)、Jamsil Baseball Stadium 蚕室棒球场, 首尔、LG Twins (主队, 看台色块)、Doosan Bears 두산 (客队, 看台色块)、GPT Image 2 (图像模型)、Seedance 2.0 (视频模型)、NBA 转播 (源文档planner中作截图风格类比参照)、Se7en《七宗罪》（视觉锚点片例）、Neo-Noir 新黑色电影（风格类型）、Nano Banana 2 / Gemini 3.1 Flash Image（元素图模型）、Nano Banana Pro / Gemini 3 Pro Image（关键帧模型）、Seedance 2.0（叙事视频模型）、OmniHuman 1.5（音频驱动口型同步模型）


---

## 附录B · “哇塞”招式库（让画面高级/电影感的具体招式，按来源 skill 分组）

【AI 短剧一站式生成 (AI Short-Drama One-Stop Generation)】固定核心风格头：PANAVISION cinematic + anamorphic widescreen + IMAX 70mm film grain + 24fps + natural DOF + three-point dramatic lighting + cinematic color grading 一串锚定高级电影质感; 优先8-15s长镜头单次生成内含2-6个内切镜+丰富运镜，胜过碎切短镜，出连贯调度的电影呼吸感; 空间锚点卡机制：固定参照物+人物位置朝向+光影基调锁死跨镜连续性，杜绝角色/构图漂移; 设定图作视觉施工图：角色三视图+场景四视图作每镜reference_image，锁角色/场景/画风一致性; 运镜轨迹示意图作分镜表格图施工蓝图：彩色虚线箭头编码运镜(推进红/拉远蓝/环绕绿/升降紫/跟随橙/固定青)+相机图标轨迹; 用slow/quick/lingering速度形容词代替绝对秒数，绕开模型对时间戳不敏感的弱点; 首尾帧无缝衔接：上镜末帧=本镜首帧，做出一镜到底/无剪切推进的高级流畅感; 三点戏剧布光+色温氛围词+cinematic color grading 塑造戏剧光影与统一色调; 跳轴时插正面/过肩过渡镜守住180°轴线，专业接镜不出戏; BGM低人声8-12dB垫乐、高潮+3-5dB、crossfade 0.5s混音，做电影级声音层次
【GTA 6 风格演示（玩转我的人生）】湿黑沥青反射粉青霓虹与警灯wet asphalt reflecting pink neon and police lights——招牌高级感锚点; 后保险杠极低位机位拍车辆甩尾fishtail+粉霓虹拖尾stretching behind——速度奇观; 类gameplay第三人称带轻微延迟与真实抖动slight delay and realistic shake——制造'真实机模泄露'的X疯传感; 车辆碰撞高保真物理：crumpling metal皱褶金属+shattered headlight glass碎大灯玻璃+tire smoke+metal deformation金属形变; 直升机探照灯beam切穿晨雾searchlight cutting through haze——湿地戏的体积光奇观; 路人竖屏手机围观直播+人挡镜头people blocking the lens——荒诞真实的旁观视角; 湿皮肤/金属反光/汗水细节wet skin texture+sweat——1080p高级质感炫技; stabilized tracking shot稳定穿越夜店人群+潮湿夜反射; 港口火花sparks+警用广播碎片+横向快速跟拍lateral tracking——gritty犯罪片冷感; 积水路口倒映高楼棕榈霓虹红绿灯puddles reflecting high-rises palm trees neon traffic lights——开放世界纵深炫技; 碰撞瞬间音量+6dB加低音震动——音画冲击同步招式; 末10s BGM低通抽空只留呼吸与警笛残音——声音留白制造末路张力
【HappyHorse 东亚文艺片——情绪氛围驱动】声画分离:情绪爆发时画面给空镜/物件,情绪完全交给配乐与音效承载——把崩溃藏在静止的画面里; 情绪前置/后置:不拍爆发本身,拍'爆发前一秒'(眼眶湿润未落泪、手指攥紧未捶桌)或'爆发之后'(空椅子、摔碎杯子、雨中无人街道); 转喻叙事:用环境突变替代人物情绪——突然熄灭的灯、被风吹落的纸、关上的门; 只拍手不拍脸:close-up of aged hands placing food into lunch box, steam rising, no face visible only hands and food——用动作细节承载亲密; 符号物件的状态序列:同一杯茶/两把椅子/窗台植物/行李箱跨镜头演化,让物件替人物说话; 光束中浮动的尘埃(dust particles floating in the light beam)+完全静止,把空旷走廊拍出时间凝固感; 暖调向轻微过曝渐隐(soft warm tones fading toward gentle overexposure)做结尾释放,光从窗口涌入、窗帘随风轻动; 呼吸结构剪辑:全片节奏模拟人的呼吸频率(吸气→屏息→呼气),情绪高点时延长留白而非加速; 允许不完美:imperfect composition、不均匀肤色、film grain颗粒、lived-in environment——刻意去掉商业修图的精致感换取真实; 背后视角(seen from behind standing at an open window):不给正脸,留观众想象空间; 微弱手持的呼吸晃动(breathing motion)模拟'用眼睛注视某人时呼吸带来的自然晃动'; 本地人日常视角而非旅游宣传片视角:拍'生活在那里的人每天看到的亚洲'(湿热空气、梅雨、便利店深夜白光、骑楼)
【NBA 直播镜头（个性化定制）】用真实转播'瑕疵'反向制造真实感：隔行扫描颗粒+轻压缩伪影+broadcast color grading，让AI画面伪装成电视截图; ESPN三件套静态叠层(比分条+台标+播报名牌)且15秒零动画零更新——静止本身就是'这是真直播'的可信信号; 一镜到底+视线往复(球场→镜头→球场)替代运镜来维持画面活力，比切镜更显真实; 双图喂入锁定身份(截图作start_frame + 原图作reference)实现强相似度个性化; '听不见他说话'(we don't hear him speak)的留白处理，让交谈大笑显得自然不假; 解说词把[NAME]织入真实季后赛语境(费城G3/系列赛2-0)，让虚构嘉宾被赛事现实包裹
【【一镜到底】广告短片 (One-Shot / Long-Take Ad Short)】作者论锚定: 不泛说风格,直接点名 'Neo-Noir style, David Fincher Style, inspired by Se7en' 当视觉锚,瞬间拉高电影质感; 负补光哲学: 主光强+'zero warm fill'零暖填充,用阴影做戏而非补亮,出强chiaroscuro明暗对比; 90%单主色调极度克制调色: 'deep teal-cyan shadows dominating 90%' 一色统画面,远离AI花哨配色的廉价感; 禁红蓝霓虹冲突: 主动反向锚定最俗的赛博霓虹洋红vs青,改走高端克制好莱坞调色; 首尾帧/首尾双帧承接伪装一镜到底: 提取上一镜末帧或前镜视频做承接,组装全程Hard Cut零转场特效,拼出近乎完美One-Shot长镜; 镜头内部剪辑而非切碎: 10–15s长镜内部做调度与多节拍,节奏服从叙事而非堆短镜; 摄像机→主体→空间→音频四层定序写prompt: 强制结构化运动描述,模型可控性大增; 动作量化: 部位+幅度+速度+强度三件套(snaps head left / pushes hard off the ground),让动作有戏剧重量; 微表情潜台词定格: predatory stillness / oppressive suffocation / piercing gaze 把瞬间钉在戏剧高点; 可选电影感润色: 轻微手持微抖动+微妙胶片颗粒,且严格从属四层顺序不喧宾夺主; 角色参考图左头像右全身并排布局: 一图同时锁身份与服装轮廓,跨镜一致性更稳; 默认负面约束三连: 'no music'+'no subtitles'+画面不生成无关文字,产出后期干净可控
【一键变身视频主角】逐帧运镜继承(最高优先级)——替换主体却让镜头运动与原大片一模一样,保住专业机位的高级感; 色调动态匹配:自动测原片色温/亮度/对比度/饱和度并把新元素无缝贴回,杜绝换脸常见的色彩出戏; 边缘融合质检:全片排查抠图残留/光晕/锯齿,达到无痕替换; 音画口型≤1帧对齐,保住对白真实感; 拼接点±0.5s跳帧检测+跨镜色调断层检测,保证整片如一镜到底般连贯; 三维星评(相似度/融合度/色调)逐镜自检,把不及格镜头挡在成片之外
【你的女友已上线 | 沉浸式POV互动视频】半身特写分区作面部一致性主参考——单独注册asset_id锁面部,解决AIGC人物跨片段崩脸; 四图三视图设定图(半身特写+正/侧/背全身水平合排,纯白背景)一次生成稳定主体多角度资产; 长视频首帧锁定:提取上段末帧作start_frame实现姿态/服装/环境无缝衔接; 音频氛围延续:上段末尾音频作reference_audio保声音氛围连续,避免段间忽高忽低; 微表情量化书写(嘴角右侧上勾约3毫米/歪头5-10°/睫毛微颤一下)逼出精准表演而非笼统形容; 镜头极度贴近至轻微失焦模拟亲吻(嘴唇将触未触)——用失焦做亲密暗示规避露骨; 动势匹配/物理遮挡转场替代黑场叠化,保沉浸连贯; 起承转合15s微结构(起察觉镜头→承互动契机→转手入画轻触→合亲密顶点留余韵)给单镜情绪曲线; AI失误高发区主动规避:摸脸/贴耳低语每段限次,逼出多元互动避免单调; 镜头物理禁区清单(禁手挡镜头/禁对镜头哈气)规避遮挡手部特写与模糊失焦; POV单主体约束+男方仅露局部手臂/衣袖/侧腰轮廓,保第一视角纯净不穿帮; 封面双参考(半身特写分区锁脸+高光截帧承氛围)+大面积干净负空间供文字排布
【剧情短片视频（Seedance2.0音色连贯参考）】点名导演+影片做风格锚点(David Fincher Style, inspired by Se7en)而非泛说类型,精度与高级感骤升; 单一主色调统治90%画面+zero warm fill的极度克制好莱坞调色,杜绝廉价霓虹冲突; 负补光(negative fill)制造强chiaroscuro明暗对比与深面部阴影,雕出面部结构与戏剧性; 长镜头内部剪辑(10-15s单镜内设Shot1/Shot2/Shot3硬切)替代碎短镜,保留连贯电影呼吸感; 把动作定格在戏剧性瞬间+写微表情潜台词(predatory stillness),拒绝摆拍生硬; 为无生命物体也写情绪状态(Destined aura/cold and detached atmosphere)赋予画面灵魂; Seedance摄像机→主体→空间→音频四层固定顺序写提示词,机位运动领衔; 音色锚点跨镜头复用,全片同一角色声线零漂移; 可选轻微手持微抖+微妙胶片颗粒,从属四层顺序不喧宾夺主,增真人电影质感; soft-focus with subtle Gaussian blur柔焦+fine rendering quality精细渲染提升画面纹理高级度; 音频包装符精确区分音乐(...)/音效<...>/对话{...}/标题【...】,后期可控
【剧本驱动型视频（需上传剧本）】视觉锚点用'作者+影片'命名(David Fincher Style, inspired by Se7en)而非泛风格名,精度立升; 负补光/零暖光填充(negative fill, zero warm fill)制造强明暗对比与戏剧脸部阴影; 单一主色调约束画面90%区域+极度克制,杜绝AI俗气的红蓝霓虹冲突; 把动作定格在戏剧性瞬间并写潜台词/微表情(predatory stillness/no mercy),拒绝摆拍感; 关键帧三态(起始/结束/高亮)单独成图,让最具感染力的一帧能独立存在; 长镜头内部剪辑(10-15s内Shot1/Shot2/Shot3)而非碎切,节奏随故事呼吸; 精细渲染+丰富细节+轻微高斯模糊柔焦提升质感; 电影级真人简报可加轻微手持微抖+微妙胶片颗粒,从属于摄像机→主体→空间→音频四层; 角色16:9三视图(半身特写+正/侧/背)喂模型锁身份服装,保跨镜一致
【动作预演分镜视频 (Action Previs Storyboard-to-Video)】分镜图自解释7层信息密度(运动矢量+拖尾+冲击放射线+深度标记+角色标签+镜头信息栏+帧间过渡),让AI直接从图读动作编排而非靠文字; 减法原则: 分镜图已编码的内容提示词一律省略只留1–2词,避免文字权重压制视觉参考导致偏离分镜意图; 运动栈分层书写: 镜头运动→角色动作→空间调度→音效逐层顺序,运动信息结构化不混写; 冷暖对撞调色: 去饱青灰打底+橙色点缀,经典动作片高级感配色; 速度质感专用词替代fast/slow(explosive/snapping/fluid/heavy/weightless/sluggish),给AI精确动势控制; 推进至ECU锁定拳头冲击点的经典动作高潮镜头语言; 多角色按因果链词(in response/recoils from/driven back by)而非and并列,锁定主从关系不糊; 多角色三视图独立占image槽位[ref:image_2]绑定到对应角色描述句,外观提取权重相互独立防混淆; 节拍密度→时长→速度词→剪辑节奏一条龙自动联动(爆发板vs过渡板); 硬切默认保动作冲击,连续板才用≤4帧极短叠化
【叙事驱动的美学视频】点名导演/影片做视觉锚点而非泛泛风格词(David Fincher Style, inspired by Se7en)——精准风格背书; 负向补光 negative lighting + 强明暗对比 chiaroscuro 雕出面部结构与戏剧性; 单一主色调占满90%帧面积、zero warm fill 的极度克制好莱坞调色; 潜台词+微表情把动作定格在戏剧性节拍,拒绝僵硬摆拍; 身体部位级动作分解+幅度/速度/力度修饰(snaps head left, pushes hard off the ground)做出真实表演动态; --sref 风格代码锁定全片外观一致性的事实来源工作流; MJ 画板=外观真理 + Nano 轻量合成不重绘 + Seedance 命名参考图读脸 的三段一致性链路; Seedance 镜头→主体→空间→音频 四层有序写法 + Shot1/2/3 + cut to 串复杂多节拍; shot 内蓝光打脸投长影 + 缓慢推近特写 表现觉醒情绪的教科书节拍; 确切台词与图内文字加引号渲染('DANGER')+ 多语言对白前标语言
【商品宣传短片】负补光(negative fill/zero warm fill):强调阴影不补光,凭强明暗对比与深面部阴影立刻拉出戏剧体积感; 单一主色调约束在约90%画面区域(如90%深青色阴影):好莱坞式极度克制调色,避开AI常见的脏乱撞色; 明令禁红蓝霓虹冲突(禁crimson bleed/霓虹洋红vs青色),反套路提升高级感; 用具体作者+影片做风格锚(Neo-Noir style, David Fincher Style, inspired by Se7en)而非泛说类型,精准复刻质感; 主角镜头(产品在环境中POV)与辅助功能/纯环境镜头交叉剪辑,卖'场景与方式'而非'桌上的包装'; 关键帧三定格法(起始/结束/高亮帧)锁住运动起止与最强戏剧瞬间,让首帧/末帧/爆点各自独立成画; 镜头间交替运镜(推入↔拉出↔环绕↔弧形)制造'驱动力'剪辑而非平淡平移; 可选电影真人质感润色:轻微手持微抖动+微妙胶片颗粒,从属四层语序不喧宾夺主; 双图标记法(头部head shot+全身full-body各打<<<image_n>>>标签)让Seedance准确读脸保跨镜一致; Seedance四层语序(摄像机→主体→空间→音频)结构化运动prompt,避免模型理解混乱
【国风纯意境短片】以远景月色/云海开篇一次性奠定高级氛围基调; 月色+光影+粒子做淡入淡出转场,替代生硬剪切; 人物仅以白衣侧影点缀,衣袂微动/发丝轻扬的极小动效制造呼吸感与电影留白; 全片色调/风格统一无跳变,塑造连贯高级的统一影调; 全景定格+画面柔化收尾,把情绪沉淀在氛围而非角色; 提示词加'启用画面收敛模式,纯意境无剧情'强化AI收敛、防跑偏; 画面元素克制、去冗余特效,以减法换高级感
【城市记忆叙事短片（使用HappyHorse 1.0）】三层景深堆叠社会信息载体(前景褪色广告玻璃门+中景柜台+背景候车室冷白灯与走动乘客),让空间自己叙事; 用门框/玻璃反射/栏杆/车窗/柜台做框中框,把人物分隔并困进环境里; 人物偏置画面边缘+大面积负空间(墙面/空椅子),用留白制造存在的孤独感; 空气感是高级感来源:弥漫灰尘 dusty air、清晨水汽 morning mist、热浪 heat haze、潮湿感; 捕捉决定性瞬间(布列松式)+动作完成后仍多看一眼,长镜头观察感; 胶片质感堆叠:Kodak Vision3/Fuji Eterna/ARRI Alexa Natural + low saturation + slight grain + 暗部杂色保留 + real skin tone; 刻意'脏'画面:不清理杂物灰尘旧瓷砖塑料凳电线广告纸,真实压过精致; 极慢推进(extremely slow push-in)/极慢横移,微弱手持呼吸感代替炫技运镜; 关键物件复现且状态已变(位置变/损坏/被拿走),让物件成为时间的证人; 画内声压过配乐:倒车提示音/售票广播/麻将声/广场舞音响层叠出真实城市声场,BGM仅0.1x; 镜头时长疏密(2-3s/6-10s/11-15s混搭)本身作为叙事节奏信号,慢=时间凝结快=运动; 色温混光:灰蓝天光混日光灯偏绿、钠灯橙混霓虹粉紫,营造年代与城市边缘质感
【多人对话访谈 (Multi-person Dialogue / Interview)】点名导演+影片做视觉锚点(David Fincher风格、以《七宗罪》Se7en为锚)而非泛说Neo-Noir,显著提升电影质感与准确度; 负光(negative fill)思维:不只打主光,刻意用负光加深阴影、强调面部结构,制造明暗对比戏剧性; 90%单主色调克制调色:全片限定一种主色占画面约九成(深青蓝),零暖色补光,反而显高级——而非堆红蓝霓虹; 柔焦渲染层:精细渲染+错综细节+微妙高斯模糊的柔焦,营造高端胶片质感; 潜台词定格法:把表演定在戏剧性微表情瞬间(掠夺性静止/压抑窒息),拒绝摆拍,让静帧有戏; 跨镜头关键帧链式参考:后续关键帧参考同场景最相似前帧,锁站位/朝向/表情连贯,解决AI多镜头人物漂移; 音频驱动黄金模板:摄像机运动+发言者情绪+说话状态+具体肢体动作+背景事件,口型同步且表演到位; 导演口吻下指令而非描述:把prompt当成对剧组下达的拍摄指令,只写物理可见、拒文学化心理旁白
【多宫格生视频 (Image2 + Seedance 2.0)】联系表/多镜头拼版思维：一镜头=一张图=一次调用，N张关键静帧排一画布，模型一次读懂整条节拍路线; 用「打印剪辑索引1…N」而非空间位置承载时间顺序，解放拼版布局又锁死叙事时序——抗重构漂移的关键招; 单元格宽高比强制对齐 Seedance 最终输出几何，显著减少参考到视频的重构漂移; `live action` 小写开头作为风格偏置开关，把静帧从插画/AI光泽拽向真实影像; 运动描述固定语法「摄影机→主体→空间→音频」让 AI 镜头语言有序不乱; 长镜头吃满预算+塞满内部节拍，用一个连贯镜头替代碎切，提升叙事连贯与电影感; 克制调色单主色~90%+主动反对霓虹洋红/青色冲突，一句话避开 AI 视频烂大街配色; Seedance 包装符体系 (...)音乐 <...>音效 {...}对话 【...】标题，把多模态音画指令结构化
【天工开物：传统工艺纪录短片】eye-tracing动量守恒:前镜尾帧视觉重心精准对齐后镜首帧,15s内6镜高频推进仍极度流畅、消除跳切感; 古籍木刻版画线描 × 超写实材质微距双质感交融(古意+毛孔级真实); 国画矿物四色(赭石/松石绿/朱砂/黛蓝)≥90%占比作色彩基因锁,逐帧审计+末帧收敛; 把晦涩古典词转高密度可执行视觉物理(火舌舔坩埚/蒸汽柱垂直升腾/水花慢速辐射炸裂/冰裂纹生成); ECU macro呼吸变焦+浅景深放大匠心手部细节; 水火交炽极限戏剧瞬间用运动模糊+高反差爆白雾/火星迸溅; L-Cut/J-Cut音画错位0.5s+高潮格前0.5s停顿,纪录片级声画呼吸; 微粒胶片颗粒+哑光粗糙表面+水渍火光痕迹堆叠真实质感; 单张2×3六格矩阵图一次性驱动6节点合成15s组级视频(矩阵图驱动法); 轨道退行延伸至黑暗+哲理旁白的电影级留白收尾
【室内设计沉浸式探索视频】全程锁定成人步行视角160cm并禁止高度漂移，骗过大脑产生真实'人在走'的身体临场感; 以单张多宫格分镜图作为视觉母版一次性喂给Seedance，把多格视角与时间区间融合成一条无剪流畅一镜; 格内时间区间标注(0–2s/3–10s/11–15s)对齐运动节拍，让AI运镜踩准情绪鼓点; Handheld Pan的轻微物理震动+Walk-in的垂直位移，用镜头抖动模拟人体呼吸与踏步的拟真; 竖屏纵向三段构图(上漫射光/中主体/下地板纹理)把竖幅劣势变成纵深递进优势; 光线由门槛偏暗到终点最丰富的'渐亮'设计，用照度曲线讲完一段情绪弧光; Gaze Hold极缓收敛+结尾降速淡出，避免硬结尾、留出情绪沉淀的呼吸感; 胶片颗粒+自然白平衡+低饱和暖调，并显式负向屏蔽commercial rendering look以去AI/CGI塑料感
【小猫打工的一天】可截图传播的封面级名场面定格收尾(瘫倒/得意/老板凝视/反差萌),严禁黑白屏淡出空镜; 梗用画面动作演而非字幕解释(爪拍键盘→屏幕弹报错→三杯咖啡→猫眼放空)制造高级叙事; 每7s一个高潮的密集节拍语法+每2-3s视觉重点维持竖屏高信息密度; 反差切剪辑(装认真开会→桌下玩毛线;严肃看报告→把听诊器当玩具)制造笑点; 职业语义化布光(程序员蓝光照脸黑眼圈/夜班冷白荧光/主播补光灯打满)一眼定职业与情绪; 前景道具堆叠造势(满桌色卡、文件堆成山、三杯咖啡)用层次表达职场压力; 身份锚点优先调度:服装道具永不遮挡猫脸识别区,保证拟人化下仍是'这只猫'; 微表情递进表演(表情逐渐失去灵魂)作为情绪曲线可视化
【工业产品商业宣传片】金属棱线边缘勾光:单点45°硬光专打棱线,枪灰拉丝/镜面/烤漆质感被光雕出来,纯黑背景吃掉杂散; 信号流光五beat叙事:把抽象功能(1进8出/光电隔离/增益)变成可看的流光行进-节点爆闪-分叉-消散,爆闪亮度3倍+粒子环; 爆炸悬浮拆解:模块沿结构轴向ease-in-out分层悬浮、主板居中静止做锚点、均匀间距,低角度45°环绕巡览逐模块焦点切换; 背光RGB透射质感单独成beat:让指示灯/屏幕通透发光的高级细节占一个完整节拍; 主板微距'地形'探索:蓝色科技粒子沿PCB走线穿梭+信号放大节点高亮爆闪,密度随信号强度节奏变化; 音画强拍咬合:爆闪/模块到位/类别切换全部落在BGM每小节1、3强拍±0.1s,配-0.3s电流脉冲与金属咔哒帧对齐; 视觉呼吸留白:高潮beat前后0.5s禁旁白、长档主板段5-8s纯特效静默,让画面自己说话; 慢动作手部操作(250%):干净利落无晃动的旋钮旋转/按键背光变化+屏幕数值实时联动,营造精密操控感; 暗金镜面地面反射+30°暖金边缘光打出低调奢华质感标杆调性
【平面插画自动编舞跳舞MV】三层镜头(全身/中近/特写/表情)按强拍节拍强制交替轮切,杜绝单调全景,制造MV级动感密度; 转场必由音乐节点触发并绑定具体身体动作作视觉载体:手臂扫镜在手臂离开画面瞬间切、脚步落点在触地瞬间切、转身在最高速瞬间切; 头发甩动切镜/裙摆飘带扫镜软遮挡转场,新镜头保留secondary motion延迟摆动,实现无缝换景; 几何重合切镜:前后镜头道具圆形/手势孔洞/光圈/反光面同位对齐重合≥20%后切,产生设计感视觉符号转场; drop第一拍单帧灯光hit白闪(≤2帧)+手臂全遮挡扫镜,锁定最强视觉冲击节点,禁柔和过渡; Secondary Motion物理细节:裙摆转身延迟0.3s摆动、发丝侧步甩弧、飘带落地向上弹射、地面光圈随脚尖踩拍由暗变亮扩散——质感落地到物理而非空洞形容; 每7s一个动作/情绪高潮+高潮pose freeze light短暂定格光,把节拍变成可感知的视觉爆点; Break长镜头停留单一肢体特写(手腕/脚尖/眼神)节拍静止完全定格,用静衬动制造呼吸感; re-drop角色低姿势猛然起身+crane back快速推远+灯光全亮爆发的'憋足-释放'编排; 最后1-2s清晰ending pose定格,天然适合循环播放与封面,首尾接口完美匹配实现长片无缝拼接
【微缩世界创意短片】移轴三层景深:前景失焦道具边缘+中间主体锐利+远景虚化,瞬间制造微缩世界电影感; 焦外奶油感圆形散景(creamy circular bokeh)作为统一高级质感签名; 尺寸对比锚定:众多人偶合力操作巨大道具(与人偶等高的咖啡杯/信封),用尺度落差放大微缩奇观; 窗边柔光形成轻微丁达尔效应,空气感与体积光提升高级感; 黄昏金色夕阳斜射+水面金色反光的暖电影感光影; 夜景tiny fairy lights bokeh点点光斑+candlelight glow营造梦幻; 材质写实细节:布料纤维可见/木质纹理清晰/玻璃反光真实,对抗塑料假感; 1:12真实模型工艺质感+非写实非动漫的实拍微缩定位; 角色16:9拼接参考图(大头照+三视图)锁定跨镜一致性带来精致感; 运镜极度克制(缓慢推拉/锁定)让温柔情绪沉淀而非炫技
【故事驱动型视频-视频提示词复用故事板（使用Seedance 2.0）】负空间光(negative space light)制造强反差与戏剧性——主光之外用阴影雕骨; 90% 画面锁定单一主导色相(如深青绿)的极度克制调色，逼出高端院线观感; 高光帧冻结法：把一镜情绪/视觉顶点单独冻成可作海报的静帧(撞击顶点/信息击中面部); 长镜头+镜内分切替代碎切，剪切频率跟叙事节拍，单 take 内 cut-to 跳景别; 写实默认注入轻微有机不完美(极轻手持微颤+呼吸感+35mm 颗粒)反 AI 过度顺滑; predatory stillness 等被指令化的微表情潜台词卡戏剧节拍，杜绝摆拍; 作者性视觉锚点(David Fincher Style, inspired by Se7en)替代泛类型词以拉高准确度; 三视图(正/侧/背)+ ImageToImage 链锁定跨镜角色一致性
【故事驱动型视频（使用 Kling 3.0 Omni）】引入导演署名风格+具体影片作视觉锚点(David Fincher Style, inspired by Se7en)而非泛泛风格词,瞬间拉高电影感; 单一主导色调约占画面90%、zero warm fill的极度克制调色,高端好莱坞质感; 强调'负光'与深邃面部阴影突出脸部结构,用光影戏剧性交织而非平光; 优先10-15s长镜头+镜头内部剪辑(用时间戳/cut to标记),保留连贯调度而非碎切; 起始帧藏运动前线索(重心转移/视线/肢体预加载)、结束帧给动作直接结果,让AI视频从连贯动作进出而非卡帧; 写实真人默认编入克制的35mm胶片颗粒+手持微震/镜头漂移/呼吸感,打掉过分平滑的AI光泽; 把提示词当导演+调色师下指令(主体+运动,背景+运动,相机+运动),并用程度副词精确量化运动; 用微表情/潜台词把动作定格在戏剧性瞬间(predatory stillness/piercing gaze),无生命物体也赋予状态情绪; 场景中需出现的确切文字用引号包裹自然融入('reads "DANGER"')
【故事驱动型视频（使用Seedance 2.0）】双锚定风格法:不写泛泛'Neo-Noir',改写'Neo-Noir style, David Fincher Style, inspired by Se7en'——用作者+影片把风格钉死; 负补光(zero warm fill):刻意去掉暖部补光制造强对比与戏剧窒息感,是廉价感与电影感的分水岭; 单色调90%克制:deep teal-cyan shadows dominating 90% 全画面只服从一种主色,极度克制反而高级; 明确禁红蓝霓虹冲突(no crimson bleed / no neon magenta vs cyan)——主动反向锚定避开AI俗套配色; 潜台词+微表情定格:predatory stillness / oppressive suffocation 把表演冻结在戏剧性瞬间而非摆拍; 长镜头内部剪辑(10-15s)替代碎切:在镜内 cut to new angle,剪辑服从叙事节奏; Seedance四层顺序锁定:摄像机→主体→空间→音频,机位先行再写谁做什么; 包装符精确控音:(...)音乐 <...>音效 {...}对话 【...】标题字幕,跨语言对话前标注语言; 动作'部位+程度'写法:snaps head left / pushes hard off the ground 给具体部位加幅度速度强度; always no music + no subtitles 负面约束保后期干净可控; 柔焦+轻微高斯模糊+微妙胶片颗粒+手持微抖动叠加真人电影质感(但从属于四层顺序); 角色参考图头像+全身水平并排,一图锁身份与造型双重一致性
【数字人商品口播 (Digital Avatar Product Voiceover / Talking-Head Commerce VO)】脸与产品(SKU)同处前景的双焦点构图——既能口型对齐又让产品始终可读; 单场景/单关键帧/单光位的强一致性带来'真人连续口播'的可信电影感; 在静图层面交替 two-shot/OTS/single 取景,在零多机位约束下偷出镜头变化; 背景光影随音乐节奏律动,让静态合成图'活'起来; 音频驱动模板(机位+情绪+说话状态+身体动作+背景事件)产出富表现力的口播表演; 按完整句子而非时间切分镜头,保住语义与表演的呼吸完整性; 提示词以'导演+调色师下指令'心法书写,只写物理可见、拒文学修辞,提升出图可控性
【新品视觉TVC广告宣传 (高奢时尚/运动/汽车/3C 大牌调性情绪 TVC 全球广告宣传片)】每3s一个视觉反馈点+每7s一个高潮的密集节拍骨架,让15s无尿点动效不间断; 无缝物理转场六法:动势匹配/物理遮挡/几何重合/光影延续/声音桥/节拍延续——杜绝廉价叠化黑场; 质感落到可见物理细节:金属漆面长条环境反射、缎面随转身窄幅高光、3C倒角冷白轮廓光、轮毂旋转连续弧形高光、皮革边缘油蜡光泽; 眼部高光随转头微小位移——让人物眼神有生命的微动; 首2s品牌视觉钩子+12-15s品牌/产品Hero Moment双锚点结构; 声音桥+音乐节拍延续作跨片段连续性胶水,品牌Hero瞬间音乐抬升; 四重商业表达每15s全覆盖(代言人气质/品牌世界观/产品欲望/品牌记忆)确保每段信息满载; PBR物理材质参数化反推(粗糙度/金属度/菲涅尔/次表面散射)逼近真实质感; 比例尺操控制造巨物感/微缩感(产品与手部比、汽车与道路比); 全球广告KV式主体占位+品牌留白构图,直接出可定格成海报的画面; 片段首尾重复动作余势/转场音/光影状态保证分段生成后无缝连续; 用滑开/展开/折射/高光滑移替代破坏性词汇,保持高奢克制不暴力
【旅拍大师 V2.0｜唯美旅拍视频生成 Skill】大景小人构图:人物极小、环境极大,瞬间出电影空间感与壮阔尺度; 逆光回眸:招牌唯美高光镜,逆光勾边+情绪特写; 转圈飞裙:裙摆飞扬的环绕运镜制造动态唯美; 张臂奔跑跟拍 + 禁止向左奔跑统一运动方向以保连贯流畅; 花海穿梭推进:前景遮挡穿越营造沉浸纵深; 黄金时刻/核心光影时刻统一全段光色,锁定高级电影影调; 6:3:1 色彩比例 + 单一主色调统一全片视觉; 胶片质感+不过度磨皮/不塑料感,保留真实肤质材质=高级真实感; 海报留大面积干净负空间=电影海报式高级排版; 提取上一段尾帧作参考帧实现场景与人物的无缝连贯; 音频 Ducking(旁白发声音乐压6-8dB)实现专业混音呼吸感; 高潮段15-25镜密集快切制造情绪爆点
【日系青春偶像MV】全员迎相机逆光奔跑+高光溢出,面孔接近时才逐渐清晰(经典AKB青春奔跑图); 走廊冲刺推开天台铁门瞬间阳光猛涌入软过曝,以光线变化做天然转场; 黄金时刻低角侧光给人物轮廓打暖橙勾边形成强逆光剪影,发丝被光晕环绕; 百叶窗切割光条+光束中可见灰尘颗粒(classroom dust particles)营造时间凝固感; 副歌中心成员手势超前其他人半拍——'她先感受到那个节拍'的群像层次; 笑容定格做freeze frame作全片最后一帧+soft fade to warm white/film burn out收尾; 线香花火橙红细碎火星缓落,低头注视的安静短暂日本夏夜仪式感; 练习室整面落地镜翻倍灯光成双光源+镜中倒影排成队列产生无限延伸感; 河堤逆光全员并排剪影,风将众人头发吹向同一方向,镜头不动只等光线变化; 允许漏光/眩光/软焦/胶片时间码——用'不完美'的模拟质感对抗CG锐利感; 书包随奔跑步频上下颠动作为青春感视觉节奏; 竖版利用纵深劣势变优势:走廊透视线/河堤延伸/电车轨道消失点横向压缩后纵深更强
【时装展示短片（Fashion Showcase Short / 服装电商展示视频）】统一银盐/电影胶片正片色调贯穿全片, 把电商展示拉到时尚大片质感; 面料肌理macro级特写(thread-level weave/针脚/亮片散射光晕)+服饰肌理增强词, 让材质成为主角的高级招式; 四层光影强制配方(主光源+阴影硬度比例+具体高光落点+环境反射填充色)逐镜书写, 出片即有打光师质感; 高光落点写到具体位置(高光沿肩线滑落过渡至手背), 而非笼统'打亮'; 环境色反射渗入面料(玻璃幕墙蓝光漫射至服装背面/暖墙补左颊), 营造真实空间光交互; 升格/甩镜动态定格捕捉裙摆与外套受力飘动, 把面料物理变成视觉高潮; 三分法主体偏置三分之一+大面积负空间留白, 留出呼吸感与电影构图; Foley用J-Cut提前入画(高跟鞋落地/面料摩擦), 强化动作预感的电影声音设计; 黄金时段侧逆光穿透织物weave让面料半透发光; 混合色温叙事(暖钨丝地面反弹+冷天空光顶补)制造都市真实光感; 动态物理预判分材质(真丝漂浮vs毛呢迟滞)驱动镜头动态与摆幅设计; 六宫格分镜先出图人工确认, 锁构图节奏景别再一次性生成15s成片
【游戏Demo视频设计师】HUD像素级锁死成'禁止形变区',血条技能栏全程零位移零伪影,达到实机录屏的可信度; 封面呼吸灯光效+Start按钮交互,把静态封面变成可'操作'的活界面; 第一人称POV苏醒转场+HDR,从暗到广阔环境一镜拉开空间感; 8倍速激战蒙太奇浓缩高强度对抗,大招+震屏打击感堆爽点; Victory UI弹出+奖励结算特效给出完整闭环的胜利反馈; 全链路LUT统一色调,三段45s零偏色,做出一条片的整体感; 角色四视图(左面部特写+右三视图)→3D真实感形象卡,保证跨界面造型/材质零漂移; 鼠标悬停高亮等真实键鼠交互反馈,模拟玩家亲手操作的临场感
【独立素材生成（支持转视频）】长镜头+镜头内部剪辑(internal cut)取代碎切，用明确时间标记(0-4s/4-8s/8-12s)在单镜内推进叙事，画面更连贯电影感; 角色三视图(正/侧/背)+ImageToImage引用首图，锁定跨镜角色一致性，避免AI换脸跳变; 元素ID锚定系统([Element_xxx])把布景/角色/道具固化为可复用视觉锚点，保证空间与造型连续; 音频分层+镜头嵌入音频静音的反冲突手法，让BGM/SFX/旁白干净不打架; 围绕既有资产构建叙事弧线(叙事跟随资产)而非另起炉灶，专为已有素材桥接连续性缺口
【电商产品视觉全案生成 (E-commerce Product Visual Full-Case Generation)】Volumetric dust particles floating in a Tyndall light ray for cinematic atmosphere; Quantified chiaroscuro: top-right key 60° + shadow softness 85% + soft negative fill carving a subtle contrast edge; Frozen water-droplet storytelling: foreground droplet razor-sharp with convex meniscus + internal caustic light, trailing droplets motion-blurred to imply velocity; 9:1 color-restraint algorithm — 90% dominant tone, accent color reserved solely for the core selling point; Grazing 30° side light with a +15% warm fill card to reveal weave depth without flattening texture; Floating matte-ceramic platform staging for a weightless premium presentation; Focus-coordinate choreography across the thumbnail strip so the eye glides 1/3→center→2/3; No-spill specular discipline: highlights stay accurate to material with zero blown-out spill beyond the product boundary; Selling-point-to-visual-subtext conversion (e.g. micron-waterproof → droplet at perfect surface-tension angle on matte metal edge)
【电影布光大师 (Cinematic Lighting Master)】逆光rim light勾勒silhouette+肩发线halo光晕bloom,背景与主体高亮度反差; 丁达尔god-rays穿透尘雾,光锥把主体从深暗环境中切割隔离出来; 推镜中side light随机位前推在颧骨上逐渐锐利、远侧脸阴影加深(光随运动变化); 移镜穿过列柱时volumetric光束在主体身上间歇strobe扫过(光的运动节奏); 拉镜中暖逆光随机位后撤包裹主体、肩与发线rim light反而增强、背景退入深暗; split lighting 3:1半脸全亮半脸沉入deep shadow刻画facial contour与texture; 背景多层不同速度滑动制造natural parallax纵深; 双角色冷暖色温分立做暖善vs冷对立的情绪暗示; 跟拍逃跑顶光逐盏strobe投下sharp downward shadow制造紧迫; 镜头内多运镜:wide establishing推入孤独身影→抬头切tight CU锁定→拉回揭示沉默人群,全程一致暖逆光rim light
【百万爆款羊毛毡动画Skill】把整个现实世界用羊毛毡材质1:1重建(full-size felt world at realistic scale),而非微缩玩偶舞台——这是与廉价diorama感拉开档次的核心招; 全程可见羊毛纤维纹理+略不平的手作表面+柔布光泽,传递真实手工温度而非塑料CG光泽; 关键叙事节点上聚光灯构图(spotlight)强化电影戏剧感; 缓推至角色面部捕捉眼角带笑的微表情后静帧收势,把情绪定格成名场面; 用'画面风格骤变(暖调↔冷调)'代替传统转场,完成场景与情绪的双重切换; 画面与旁白逐句强绑定(旁白说什么画面就演什么),杜绝各说各话的廉价感; 镜头内时间分段脚本(0-4s/4-10s/10-14s各配动作+运镜),让单镜内部有完整叙事节拍而非一句话带过; 浅景深+暖光充满画面+蒸汽/环境氛围,营造沉浸式真实尺度的治愈空间
【第一人称 POV 沉浸式短片（通用）】视线驱动而非导演语言:用主角眼线运动(起点→触发→转向→手部→落点)替代'画面停住/特写推进',制造真实主观沉浸; 主角永不正脸:只给手/鞋/衣袖/工牌/胸前物件边缘/玻璃手机黑屏局部反光,反光里只留模糊剪影silhouette无清晰脸; 声音先行牵引视线:the gaze is pulled by the sound of——重大事件必须有视觉锚点,声音补画面但不替代关键画面; 静默作为全片最有力情绪点:环境声降至极低作呼吸点,优先于配乐和对白; 把抽象高级感转成物理证据:温暖=热气模糊视线+暖光漫射+接触温度;压迫=低机位贴表面+封闭边界+声压低+手部犹豫; 局部入画手法:手从左/右伸进画面、被窗框拖走、前门上方小凸镜/右侧外后视镜/玻璃反光等POV可见入口; 纪实污脏质感堆叠:worn fabric/cracked plastic/steam from hot food/wet mud/paper ash/dim fluorescent,反over-polished glamour; 后期文字贴图的不完美美学:手写质感+反光/模糊/折痕/磨损墨迹融入画面不出戏,模型一律不生成可读文字; 结尾停在视线落点或手部动作停顿上,不以全身展示收尾,保留主观余韵; 全片节奏前快后慢+Segment间黑场表达时间跨度,杜绝慢动作煽情与sentimental montage
【舌尖美食-美学短片】逆光打热气(Backlighting for steam)让蒸汽在镜前发光形成空气感; 肉类次表面散射(Subsurface scattering)做出通透有机的高级质感而非塑料感; 高亮油脂+酥脆纹理+高光湿润感堆出极致食欲质感; 动势匹配转场(勺子旋转动势接盘子摆动)与烟雾物理遮挡切场,做出无缝高级感不靠叠化; 大摇臂从微距拉到盛宴全景的一镜连贯运动; 慢动作下的物理形变(爆浆/热气喷薄/调料入锅迸发)作为视觉高潮; 明暗比6:3:1压暗环境、强光打食材主体的电影级光比布局
【萌宠打工Vlog】双色温对撞作为情绪引擎:夜路暖黄路灯3200K主调+侧面冷蓝6000K边缘光,冬日室内暖2800K与窗外冷蓝6000K在鼻梁形成可见分界线; 色温骤变跳切叙事:进便利店室外强曝6500K→室内冷白5500K骤降+眯眼适应;推公司门室内冷白5000K→室外暖黄3500K骤升模拟'逃出生天'轻微过曝; 情绪静止缓冲:关键情绪点动作结束后保留约2s静止凝视,不强制剪短,赋予留白与代入感; 反向规避'电影感':刻意禁用专业术语和稳定器,以手机前置直出质感+生活化抖动换取真实感,这是反精致的高级; 手持微抖参数化:走路每步上下起伏1-2cm、慢摇起止各0.5s微停、第三人称晃动为自拍的1.5-2倍——用可量化的不稳定营造真实; VO音色做旧:慵懒猫咪内心音用收音机/电话窄频+轻微失真偷录感+音量低于环境音,而非干净播音腔,强化私密呢喃感; 黑屏快切做段落标点:黑场<0.2s配合动作链(关闹钟→黑屏→开灯)作为节奏呼吸点; 湿地面镜面光学:雨天积水形成拉长光源倒影+柔边光晕+雨珠打镜头前景虚化,把天气变成光的素材; 汗水高光与镜墙多重反射:健身房高对比强冷白+镜面叠加反射+面部汗水高光点,把生理疲惫视觉化; 前景遮挡的纪实感:第三人称跟拍偶有路人/门框/包袋边缘虚化入镜,营造'朋友随手拍/隐形跟拍'真实质感; 双视角混拍节奏控制:POV自拍(强代入)与第三人称跟拍(展示全身/空间)交替,切换不超每2镜一次,情绪留白优先自拍
【视觉美学视频（基于美学的艺术短片创作 / MJ V7 + Seedance 2.0 一次性成片流水线）】负光优先思维：与其堆主光，不如强调阴影与对比(chiaroscuro/deep facial shadows)雕出骨骼结构与戏剧性; 单一主导色 90% + 零暖补光 的极致克制调色，远比红蓝霓虹对撞更显高级电影感; 作者+影片署名当风格锚点(David Fincher Style, inspired by Se7en)，精度远高于泛词 Neo-Noir; 把表演定格在最戏剧性的'潜台词'瞬间并写微表情，拒绝摆拍僵硬姿态——连无生命物都赋予'状态/凝视'; 提示词当成对剧组下达的导演+调色师指令来写，而非'画面里有什么'的清单; Seedance 四层顺序(镜头→主体→空间→音频)结构化运镜与表演，单镜复杂动作用 cut to 串镜头; 用包装符让模型分清声部：(音乐) <音效> {对白} 【字幕标题】，并以 'no music/no subtitles' 把后期主权留给剪辑; key_frame 反直觉招：对 Nano Banana 故意不写电影化长文，用'插槽标签+故事板对齐'防参考图被重绘
【视频拉片复刻 (Video Shot-Breakdown Replication)】作者+影片双锚:风格钉用 'David Fincher Style, inspired by Se7en' 而非泛泛 Neo-Noir,瞬间拉高电影质感; 负向补光 negative lighting:主动制造深阴影与高反差(zero warm fill)替代均匀打光; 单一主色90%克制法:全画面锁一种主色调极致克制,反霓虹冲突; 潜台词冻结:把动作钉在戏剧性节拍 + 微表情(predatory stillness/no mercy/oppressive suffocation),拒摆拍; 长镜头内部剪辑:10–15s 一镜内 Shot1/Shot2/Shot3 cut to 推进,保留源片剪辑点与节奏而非碎切; 关键帧三态法:开始帧(肢体预加载/重心/视线)→高亮帧(情感峰值冻结)→结束帧(为下一剪辑预备机位)精确控制运动起止; Seedance 摄像机→主体→空间→音频固定语序 + 音频包装符()<>{}【】区隔音乐/音效/对话/字幕; 可选润色:电影级真人实拍加轻微手持微抖 + 细微胶片颗粒,但须从属四层语序; 屏幕内文字用引号锁确切文本(reads "DANGER")保证渲染准确
【邵氏风格喜剧短片】低角度仰拍贴地向上+硬光轮廓+侧逆光,三件套立刻拍出邵氏英雄气概; 暗部颗粒密集/亮部稀疏的不均匀胶片颗粒,模拟感光度不足真旧胶片(非全屏均匀噪点); 推拉摇移时边缘轻微动态模糊拖影,模拟摄影机快门速度不足的胶片运动感; 极轻微镜头抖动(幅度极小非手持晃动)还原老胶片粗糙质感而非数字片细腻; 红黄色系单独做轻微色彩衰减,模拟老胶片长期保存的选择性褪色; 动作写起势→运动→收势完整弧线(指尖颤动才握剑柄),消灭AI机械瞬移感; 萌宠双层表演:武侠弓步同时尾巴本能竖起,反差即笑点即高级感; 市井锚点埋彩蛋(竹林里卖包子),严肃江湖中一处生活细节制造荒诞; 关键场景必加雾效/烟气/蒸汽(餐馆烟气/竹林晨雾/破庙月光)堆叠空间层次与电影氛围; 慢镜高潮+面部特写+叠化收束,让关键一击有重量感; 残阳定格/刀剑入鞘/背影远去的港片仪式感收尾; 情绪不写抽象词全转可见身体信号(眼皮肌肉呼吸手部),表演有层次
【韦斯·安德森风格短片】对称背景+中央单角色=绝对仪式感:让一个人成为整个世界的轴心(角色登场/身份宣告/关键决策时祭出); 结构对称但内容左右不镜像——用视觉重量平衡,既保留安德森对称又躲开呆板镜像感(硬禁mirror-image furniture); snap zoom(M-01/M-02)机械加速变焦:突兀快推揭示道具、快拉对称建筑从两侧展开,标志性安德森冲击力; 娃娃屋/建筑剖面(G类):一镜剖切多层结构、每格不同活动同时上演,但加6条写实约束(人物占格高1/3+材质老化+格子不规律+格内景深+逐格独立光+剖面逻辑)使其'not a miniature model'; 框景(frame-within-frame):门洞/窗框/画框二次框住主体,框与主体比例即叙事(框越大主体越小=制度压迫越强),并设4种动态语法(框内外各自表演/慢推/快推揭示/物件即框); 画幅本身当叙事立场:同一故事用11:8讲辉煌、用12:5讲衰败,改画幅=改立场; 颜色当时间轴:同空间色相偏移+饱和度递减表达时间流逝,无需字幕说明; T-10道具特写把道具升为co-protagonist:overhead planimetric占满画面,纸张折痕/墨色不均/故意拼写错误造'真实历史遗物'物质感; POV(M-10)+正面确认镜头的'主观→确认'衔接:骑车POV后无缝切骑车人正面脸部对视,既主观又锁回平面正面; 镜头组合句式化:建立→揭示→反应/动作→道具→证明,把单镜词汇组成叙事句子,镜头间关系也被设计; deadpan全链统一:干冷旁白+雷声无雨/钟声等突兀戏剧音效+情绪太重反而不说的表演,形成安德森式冷峻幽默; 标题卡底材来自叙事世界本身(酒店模压门板/法律蜡封文件/工厂粉笔黑板),且底材颜色=该章灵魂色预告; M-11慢镜全片仅≤2次把情绪'对象化'——稀缺性本身制造高级感; 全链反CGI:35mm film grain+physical set+handcrafted做旧瑕疵,用一长串负向提示词剿灭数字光滑感/塑料感/浅景深虚化
【韩国棒球赛转播现场（个人专属定制）— KBO sideline broadcast cutaway (personal cameo)】伪真实转播'找人'机制: 用长焦转播机在人群中'抓到名人嘉宾'的切镜逻辑制造高可信度临场感; 缺陷即真实: 主动叠加广播色彩分级+轻压缩伪影+隔行扫描TV颗粒, 用画质'瑕疵'反向锚定真实电视信号; 无声说话: 主体转头对旁人说话但听不见, 复刻真实转播中嘉宾被抓拍'不知在镜头里'的疏离感; 一镜到底+全程UI静止: 杜绝AI易露馅的切换/比分跳动, 用'什么都不变'换取真实感; 活体人群: 背景人群自然欢呼起伏 + 挥手时周围同步反应, 把单人镜头嵌进真实赛场生态; UI三角锚定: 计分条压底+台标压左上+姓名条居中, 用真实转播图形布局把虚构画面坐实; 双图身份硬锁+暂停确认门: start_frame截图与原参考图双绑定并设人物还原暂停节点, 保面部相似度
【音乐MV（需上传音乐）】用电影大师+具体片例做风格锚点(David Fincher Style, inspired by Se7en)而非泛泛风格词,精度即高级感; 单一主色调占画面90%+zero warm fill的极度克制调色,好莱坞高端质感来自约束而非堆叠; 负向补光negative lighting+强明暗对照+深面部阴影强调骨骼结构,制造立体戏剧性; 把动作冻结在戏剧节拍上的微表情/潜台词(predatory stillness/oppressive suffocation),拒僵硬摆拍; 高光帧策略:定格冲击力顶峰/恍然大悟瞬间,使该静帧独立成章成最具感染力画面; 起始帧的肢体预加载(重心转移/视线方向)让动作有蓄势的电影感; OmniHuman音频驱动口型同步配歌词创造富表现力演唱表演,精准对口型; 背景光影随音乐节奏脉动(Light and shadow pulse with the rhythm)把MV的音画绑死; 音频驱动模板:摄像机运动+说话者情绪+说话状态+具体身体动作+背景事件,层层堆出表演真实感; soft-focus轻微高斯模糊+rich intricate details的渲染质感对比; 材质特写描述(worn leather with creases/thick knit wool)增加可信纹理; 歌词±1s缓冲+保持歌词完整单元的剪辑,避免帧级硬切破坏口型与节奏

