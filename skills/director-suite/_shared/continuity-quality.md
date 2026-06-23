# 连续性 · 质量 · 反向锚定（连续性锁定 / 质量标准 / 禁止项）

> 写镜头卡“连续性锁定”“质量和禁止”字段与 Step5 自检时查阅。

---

Below is the knowledge-base section.

## 连续性·质量·反向锚定（连续性锁定 / 质量标准 / 禁止项）

> 本节解决三件事：**让镜头之间不穿帮**（连续性锁定）、**让每个镜头都达到可交付的工业下限**（质量标准）、**用否定词把模型逼离失败区**（反向锚定/禁止项）。三者互锁：连续性靠资产与状态约束维持，质量靠规格与自检守住，禁止项是前两者的负向兜底。

---

### 一、连续性锁定（Continuity Lock）

#### 1. 身份一致性：资产体系是地基

跨镜头一致性的唯一可靠手段不是"描述得更详细"，而是**把每个可复用对象注册为带 ID 的资产并全程绑定**。

- **角色/道具/场景各自独立 element_id / asset_id**：一物一 ID，全程复用，禁随机重生（regeneration 会引入身份漂移 identity drift）。
- **代号唯一**：角色代号全程统一，禁同人异名（no same character, different names）。
- **多状态显式枚举**：同一角色的不同造型/年龄/服装，必须在描述里逐条写明（`Look 1 … ; Look 2 …` / `外观1…；外观2…`），并各自分配 asset_id 分别生成；切勿让模型自行推断"换了身衣服"。
- **三视图 / 多视图锁形**：角色优先用横向 16:9 **三视图（正/侧/背 front / side / back）**或四视图，供视频模型读取身份与服装；服装、配饰、发型、体型在各视角必须完全一致。
- **多状态参考用 ImageToImage**：同角色后续造型以"先生成的首图"为参考（ImageToImage），不要凭空 TextToImage 重画，避免脸飘。
- **视频阶段双图喂脸**：为每个角色提供 `<<<image_1>>>` 头部特写（确认脸型/肤色/眼睛/发际线）+ `<<<image_2>>>` 全身照（确认服装/发型/妆容/鞋/轮廓），并用 `<<<image_n>>>` / `<<<video_n>>>` 标签在提示词里点名。
- **身份双保险（写实/真人换脸场景）**：`start_frame` 用上一步截图、`reference_image` 用用户原图，**同时喂入**贯穿全片；铁律 `do not alter facial structure; strictly preserve likeness`。

#### 2. 状态连续性：显式维护"上一镜末态 = 本镜初态"

连续性不是默认得到的，必须**每镜显式声明承接状态**。

- **空间锚点卡**（每 shot 开头声明，不得省略）：固定参照物 + 人物位置/朝向 + 光影基调（main light direction / horizon height / key background object）。
- **承接性描述（Starting-from 句式）**：自 Shot 2 起，开场状态（站位/视线/手势/光线/初始景别角度）严格等于前镜结尾——`Starting from <<<image_1>>>…` 或 `Continuing from the end of <<<video_1>>>…`。
- **道具/服装状态带"状况"字段**：新 / 风化 / 损坏（new / weathered / damaged）+ 独特标记；重复符号物件单独注册并写明各阶段状态变化（同一杯茶：冒热气 → 无热气 → 被收走）。
- **因果姿态承接**：击打 → 倒地等因果镜头，后镜首帧从"受力姿态/倒地姿态"写起，不得无理由重置（no posture reset）。
- **服装变化须给动因**：若服装/发型变化，必须写明叙事动因（"衔接处已换家居服"），否则视为穿帮。

#### 3. 帧级衔接：首尾帧承接（One-Shot / 长镜头灵魂技术）

| 方案 | 做法 | 优点 | 代价 | 适用 |
|---|---|---|---|---|
| **方案一·末帧续首帧** | 提取上镜最后一帧作下镜 `start_frame` | 快、省积分 | 衔接处有"刹车顿挫感" | 常规串行、积分敏感 |
| **方案二·视频续接** | 上镜 `final_shot` 视频作 `reference_video` | 最流畅连贯 | 慢、极耗积分 | 强连续/一镜到底 |
| **双帧重制** | 不满意镜头用原首帧作起点 + 下镜首帧作 `end_frame` | 两端都无缝 | — | 返工补镜 |

- **末帧质量铁律**：提取的末帧须清晰、无渲染破损/花屏，**避开结尾淡出造成的全黑/变暗帧**。
- **若偏离则回修**：上镜末帧≠本镜首帧时，须重生上镜或调本镜锚点，**不得跳过**。

#### 4. 视频参考的"门槛"原则（关键纠偏）

> **不要为了"连贯"就给每镜都加视频参考。** 视频参考会拖慢、耗积分，且强相关时才有正收益。

- **默认不加** `reference_video`；仅当本镜与前镜**极强连续**（同一拍跨剪 / 同一运镜轨道延续 / 同一角色线索紧密衔接）才追加其中一条。
- **递进收紧**：板/镜数越多，启用门槛越高（如 ≤4 镜常规判断，≥5 镜仅"强连续"镜启用）；element 参考图权重始终与首镜一致，不因"前几镜已稳"而降低。
- **音频条件贯穿**：音色/旁白一致性靠 `key_element_audio` / `voice_reference` 全程作音频条件，而非靠视频参考。

#### 5. 镜头语法的连续性（剪辑层）

- **180° 轴线规则**：不跳轴（no axis jump / respect the 180-degree line），必须跳轴时插过渡镜。
- **运动方向一致**：跟拍/环绕的镜头运动方向必须与角色运动方向一致，严禁冲突。
- **色温/调色连续**：跨镜头色温跳变 ≤ 200K，无突兀色彩/风格跳变（no style shift between cuts）。
- **视线/重心动量守恒**（多宫格/眼动引导）：前镜尾帧重心 = 后镜首帧重心，相邻格视线引导坐标偏差 ≤ 20%。
- **音画跨镜衔接**：可用画外音效（如玻璃碎裂声）触发下一镜反应与转场，实现声音桥接。

#### 6. 一致性检查优先级（装配前必做）

按"最易被观众察觉、最伤叙事"排序排查：

> **角色位置跳切 ＞ 场景视觉锚点漂移**（地平线高度 / 主光源方向 / 关键背景物）**＞ 角色外观漂移**（服装色系 / 发型 / 标志配件）。

- **系统性问题门**：连续 3 镜出现同类问题（如外观持续飘移）→ 判定为系统性问题，**暂停整批，从首镜重生**，不要逐镜打补丁。

---

### 二、质量标准（Quality Bar）

#### 1. 全局规格锚点（单一事实来源）

以 **`Final_Video_Spec.md`** 为全局参数唯一锚点，锁定并被下游严格引用：片名 / 画幅 / 时长 / 分辨率 / 帧率 / 风格色调 / 旁白 / 字幕 / BGM 基调 / 视频模型；**后续不得擅自切换模型或画幅**。

#### 2. 分辨率 / 帧率 / 画幅基准

| 项 | 基准 | 说明 |
|---|---|---|
| 图像元素 | 2K（简报明确才用 1K/4K） | Nano Banana 2 / Pro、GPT Image 2 |
| 视频生成 | **720p 生成 → MediaKit 超分至 1080p/2K/4K** | 生成基准对齐"最高规格后再下采"思路；OmniHuman/Kling/1080p 类按模型上限 |
| 帧率 | 24fps（叙事/电影感）或 30fps（产品/工业）统一 | 慢动作单镜帧插值至 60fps，**不要对成片整体超分/插帧** |
| 画幅 | 16:9（横屏默认）/ 9:16（竖屏，无黑边无拉伸） | 单元格宽高比必须与视频输出比一致；**禁黑边、禁拉伸** |

#### 3. 单镜与场次约束

- **单 shot ≤ 15s**（视频模型单次生成上限的安全值）；超过必须拆镜并显式设计承接动作。
- **出场 ≤ 3 人**、**不跨物理空间**、内切 2–6 镜（短剧类经验值）。
- **拆镜只做技术性编辑**：拆镜 ≤15s、补镜头语言字段；**绝不改情节/台词**（脚本忠实度 = 最高优先级）。
- **不逐秒硬切**：不写逐秒计时/精确时钟（模型无法可靠执行），按"动作顺序发生"描述，句末切分而非时间切分。

#### 4. 物理真实性铁律（写实题材）

- 人体动力学正确、水花/反光/惯性符合真实物理（鱼竿弯、鱼线紧绷）；全程**无卡顿、无穿模、无跳帧**。
- 曝光控制：**高光不过曝、暗部保留细节、明暗过渡自然**。
- 写实默认加**轻微有机不完美**避免"过度顺滑塑料感"：极轻手持微颤、自然轻微漂移、微弱呼吸感（幅度小、连续、非剧烈晃镜）；可加细 35mm / 化学胶片颗粒、轻模拟噪点。**固定机位不得写手持用语**；避免粗大数字噪点 / 雪花 / VHS（除非风格要求）。

#### 5. 音画与时长精度

| 指标 | 阈值 |
|---|---|
| 口型 / 音画同步 | ≤ 1 帧（33ms @30fps） |
| 拼接点跳动 | ± 0.5s 内无跳动 / 重影 / 错位 |
| 单镜时长误差 | ≤ 0.1s |
| 总时长偏差 | ≤ ±1s |
| 字幕对齐 | ≤ 1 帧 |

#### 6. 交付前自检清单（Pre-delivery Checklist）

- [ ] 镜头无遗漏、逻辑一致、接镜顺畅
- [ ] 时长合规（单镜 ≤15s、总时长达标）
- [ ] 空间一致 / 角色一致 / 道具状态连贯
- [ ] 音效 / 台词位置正确，音画同步达标
- [ ] 画面内无第二个完整人物（除非剧情需要）→ 否则打回
- [ ] 服装突变 / 人物瞬移等物理不连贯 → 打回
- [ ] 视频层无残留字幕 / 水印 / 文字 → 裁切或重生
- [ ] 衔接处音频无硬切噪声 → 补交叉淡化
- [ ] 逐镜三维星评（人物相似度 / 背景融合度 / 色调匹配度，1–5 星，≤3 星须注明并建议重试）

#### 7. 失败处理协议（Failure Protocol）

> **同工具内降级优先，禁止静默跨工具替代。**

- 失败先在同一生成工具内重试或降级（如 `Seedance 2.0 → Seedance 2.0 Fast`、`ImagesToVideo` 内换模型如 Vidu Q3）。
- **不得静默切换工具类型**；同模型全失败 → **停止并报告**，由用户决定（部分模型如 Seedance/GPT Image 2 失败须问用户，或按预设兜底链如 GPT Image 2 → Nano Banana Pro）。
- **自检评级分流**：【错误】（穿帮/肢体崩坏/严重不符剧情）→ 后台自动重生，不给用户看；【可用】→ 进入用户确认。

#### 8. 强制暂停门（Pause Checkpoints）

> 禁一键跑到底。在关键阶段强制暂停等用户确认，**不一次跑完流水线**。

典型门位：意图/规格确认 → 故事板审核 → 元素/角色图渲染后（确认相似度）→ 全景图/关键帧确认 → 剪辑后成片检查。换脸/数字人/POV 类**出图后必须暂停等用户确认相似度再做视频**。

---

### 三、反向锚定 / 禁止项（Negative Anchoring & Hard Bans）

> 反向锚定 = 用否定词主动把模型推离失败区。分四类：**后期纯净类**（保证后期可控）、**失真规避类**（防崩坏/塑料感）、**合规版权类**（防侵权违规）、**风格漂移类**（防触发词跑偏）。

#### 1. 后期纯净类（几乎每条视频提示词末尾必加）

```
no subtitles, no music, no text overlay, no watermark, no logo
```

- **`no music`**：防模型自动配 BGM（BGM 后期另混）。
- **`no subtitles`**：字幕后期烧录，生成层不要。
- **有独立旁白音轨时**：视频提示词里**不写旁白文本**，防与对话/音轨双重音频冲突。
- **设定图/元素图负向**：`no text, no labels, no watermark`（保持画面整洁，画内文字只在剧情需要时用引号包裹确切文本，如 `reads "DANGER"`）。

#### 2. 失真规避类（防崩坏 / 防塑料感）

```
no distorted face, no mutated hands, no broken fingers, no missing/extra limbs,
no body deformation, no identity drift, no face change, no extra character,
no second person in frame, no floating objects, no physically impossible actions
```

- **换脸/换主角类追加**：`no added camera movement, no new lighting, no style filter`（保运镜继承）。
- **美颜过度禁词**：`perfect skin, beautiful, glamorous`（会触发修图审美、失真实）；数字人禁"网红脸"厚重美颜。
- **破坏性词汇替换**（高奢 TVC / 舞蹈 MV / 微缩世界）：禁 `破裂/分割/破碎/裂缝/切割/爆破/碎片`，改用 `滑开/展开/抬起/翻转/漂浮/聚拢/旋转/折射/高光滑移/焦点迁移`——破坏性词会触发崩帧/碎裂崩坏。
- **黑场/渐变禁词**（舞蹈循环类）：`no black screen, no fade to black/in/out`（避免循环断点）。

#### 3. 合规 / 版权类（硬禁）

```
no official logos, no real brands, no readable UI text, no car plates,
no unauthorized logo, no product label unless approved, no gore, no blood
```

- 绝对禁止：商业游戏名 / 版权标志 / 品牌 Logo / 可读真实品牌 / 车牌 / 官方台词。
- 题材专属：受保护群体歧视、动物虐待 / 危险受伤 / 恐怖血腥（如萌宠类 `no animal abuse, no dangerous injury, no blood, no horror`）。

#### 4. 风格漂移类（情绪/题材触发词规避）

不同题材有"会跑偏"的词，需主动屏蔽（见下方映射表）。通用高频：**红蓝霓虹对撞**（`crimson bleed`、霓虹洋红 vs 青）除非明确要求；**MV 式快切 / 卡点 / 无人机炫技 / 旋转镜头 / 装饰性慢动作**（文艺/纪实题材）。

#### 5. 流程类禁令（Process Bans）

- 禁并发批量生成（必须逐镜串行 + 每镜强制暂停确认）——一镜到底/换脸类。
- 禁静默补全剧本未描述的角色外貌/场景细节（须问用户）；禁静默修改原稿。
- 缺参考照 / 缺直播名称 / `[NAME]` 占位符未替换 → **必须停下等待**，不得用默认值或虚构称谓。
- 组装层禁任何转场特效，只用 **Hard Cut**（一镜到底/广告短片）；禁翻页/旋转/变焦花哨转场、禁慢镜二次加速插帧（工业片）。

---

### 四、情绪 / 题材 → 本维度选择（决策映射）

#### 1. 题材 → 禁用触发词（按"会把模型带偏的方向"）

| 题材 / 基调 | 必禁触发词（含义：会触发什么崩坏） | 改用 |
|---|---|---|
| 东亚文艺 / 情绪留白 | `dramatic/intense/explosive`（剧烈动作）、`fast/rapid/dynamic/energetic`（快速运动崩坏）、`cinematic action/thriller`（漂移商业类型）、`perfect skin/glamorous`（修图失真）、`neon/cyberpunk`（色彩偏离）、`drone/aerial`（高空不稳） | 留白 / 转喻 / 声画分离 / 空镜 / 本地人日常视角 |
| 纪实 / 城市记忆 | 炫技运镜、旋转镜头、装饰性航拍、无叙事慢动作、多切镜、快速推拉、MV 快切、音乐卡点、特效转场、TikTok 节奏；精致广告感、过度美颜、强逆光 | 中远景 + 固定/缓慢机位、画内声、本地视角 |
| 国风纯意境 | 人物互动/对视/牵手/奔赴、恋爱向/CP 向、大幅肢体动作、表情特写、冗余特效 | 风格统一色调统一、自然衔接、留白意境 |
| 工业 / 产品 TVC | `shaky camera, cheap glow, neon clutter, lens flare, motion blur on product edges`；审美空话（高级/梦幻/精致/电影感单独成立） | 稳定机位、落到可见物理细节、强制包装镜+Logo 时长 |
| 高奢 / 大牌 TVC | 破坏性词（破裂/爆破/碎片）、身份漂移、屏幕乱码、未授权 Logo | 滑开/展开/聚拢/高光滑移/焦点迁移 |
| 舞蹈 / 插画 MV | 破坏性词、黑场渐隐、写实化插画、变速破坏舞蹈 | 滑开/翻转/漂浮，动作桥/光影桥/节拍延续 |
| POV / 亲密互动 | 第二个人、男方全身/正脸、第三人称镜、手掌虚挡镜头、凑近哈气 | 男方仅露局部手臂/衣袖/侧腰轮廓 + `no full male body` |
| 萌宠拟人 | 身份漂移、变人类、第二只动物、虐待/受伤/血腥/恐怖、职业不匹配 | 锁定 `[Cat_Main]` 毛色花纹脸型、职业场景匹配 |

#### 2. 情绪基调 → 连续性策略强度

| 基调 | 连续性策略 | 反向锚定重点 |
|---|---|---|
| 静、慢、留白（文艺/意境） | 多空镜、长镜、固定机位；几乎不用视频参考；符号物件跨镜状态变化 | 重禁"剧烈/快速/戏剧化"触发词 |
| 强连续叙事（一镜到底/POV/换脸） | 首尾帧承接 + 强连续才上视频参考；双图喂脸 + 身份双保险 | 重禁"换运镜/换光/加滤镜/第二人" |
| 动作 / 武戏 | 因果姿态承接、力学连续、跟拍方向一致；按 1.5s 微节拍承接 | 禁姿态无理由重置、禁镜头与运动方向冲突 |
| 产品 / 工业 | 色温≤200K、强制包装镜、稳定机位、超分到 1080p+ | 重禁"晃镜/廉价光晕/边缘运动模糊/审美空话" |
| 多人对话 / 访谈 | 三视图 + 同场景前一最相似关键帧双参考锁站位朝向 | 后期纯净三件套 + 不双写旁白 |

---

### 五、常见错误 / 禁止项速查（Anti-patterns）

| ❌ 常见错误 | ✅ 正确做法 |
|---|---|
| 靠"写得更详细"维持身份一致 | 注册 asset_id + 三视图 + ImageToImage 复用 |
| 同角色换装让模型自行推断 | 显式 `Look 1 / Look 2` 分别建 asset_id |
| 每镜都加 `reference_video` 求"连贯" | 默认不加，仅"强连续"镜才加，板数越多门槛越高 |
| 提取末帧时取到淡出黑帧 | 避开结尾淡出，取清晰无破损帧 |
| 逐秒硬切 / 写精确时钟时码 | 按动作顺序、句末切分，单镜 ≤15s |
| 失败就静默换一个工具 | 同工具内降级；跨工具/全失败须停下问用户 |
| 一键跑完整条流水线 | 关键阶段强制暂停门，出图后确认相似度 |
| 忘加后期纯净否定词 | 末尾恒附 `no music, no subtitles, no text overlay, no watermark` |
| 有独立旁白轨还把旁白写进视频 prompt | 旁白不写进视频 prompt，防双重音频 |
| 文艺片用 `dynamic/dramatic/cinematic action` | 改留白/空镜/声画分离，按映射表换词 |
| 用破坏性词（爆破/碎裂）做高奢转场 | 换 `滑开/聚拢/高光滑移/焦点迁移` |
| 静默补全剧本未写的外貌/场景 | 停下问用户，禁静默改稿 |
| 逐镜打补丁修反复出现的漂移 | 连续 3 镜同类问题判系统性，从首镜整批重生 |

---

### 六、可直接落到提示词的术语速查（中英对照）

**连续性 Continuity**
`asset_id / element_id`、`reference_image`、`reference_video`、`start_frame`、`end_frame`、`final_shot`、`key_element` / `key_element_audio`、`voice_reference`、三视图 `front / side / back view`、`<<<image_n>>>` / `<<<video_n>>>`、承接句 `Starting from <<<image_1>>>… / Continuing from the end of <<<video_1>>>…`、保脸 `do not alter facial structure; strictly preserve likeness`、轴线 `respect the 180-degree line / no axis jump`、`same character, same location, same time of day`、状况字段 `new / weathered / damaged`。

**质量 Quality**
`Final_Video_Spec.md`、`720p → super_resolution / MediaKit 1080p/2K/4K`、`24fps / 30fps`、`frame interpolation to 60fps`、`16:9 / 9:16`、`no black bars, no stretching`、`single shot ≤ 15s`、`ImageToImage / TextToImage / ImagesToVideo`、音画 `lip-sync ≤ 1 frame (33ms)`、`organic imperfection / subtle handheld / breathing motion`、`35mm film grain`。

**反向锚定 Negative**
后期纯净：`no subtitles, no music, no text overlay, no watermark, no logo`；失真：`no distorted face, no mutated hands, no broken fingers, no missing/extra limbs, no body deformation, no identity drift, no extra character`；运镜继承：`no added camera movement, no new lighting, no style filter`；合规：`no official logos, no real brands, no readable UI text, no car plates, no unauthorized logo, no product label unless approved, no gore, no blood`；风格：`no crimson bleed, no neon magenta vs cyan, no fade to black/in/out, no black screen, no shaky camera, no cheap glow, no lens flare`；POV：`no full male body, no male face, no second person in frame, no third-person shot`。
