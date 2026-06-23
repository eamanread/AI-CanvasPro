# HappyHorse 东亚文艺片——情绪氛围驱动

## Skill 描述

适用于东亚文艺片风格的短片创作；以情绪为核心而非剧情驱动叙事，使用 Happy Horse 生成所有镜头视频，强调克制表演、长镜头节奏与声画分离策略。

## Skill JSON

```json
{
  "author": {
    "avatar": "https://lh3.googleusercontent.com/a/ACg8ocL_ao08gbMZYCH23V4p1PC2jRZ37gmU4iZ9a94MqX2UF0RKnw=s96-c",
    "name": "Sangasong",
    "user_id": null
  },
  "cover_standard_url": {
    "compressed": "https://cdn-ap.flova.tv/skill_covers/skill_cover_cd85a7e5c3234e27aa2717be21ce957f_compressed.webp?auth_key=1781345985-0-0-803a928114ac454833abdd5568365c6d",
    "large": "https://cdn-ap.flova.tv/skill_covers/skill_cover_cd85a7e5c3234e27aa2717be21ce957f_large.webp?auth_key=1781345985-0-0-a5a9871adf699aec90570fdf68533af4",
    "medium": "https://cdn-ap.flova.tv/skill_covers/skill_cover_cd85a7e5c3234e27aa2717be21ce957f_medium.webp?auth_key=1781345985-0-0-8359360cbb0e1955dd4e60f0a6f5615d",
    "small": "https://cdn-ap.flova.tv/skill_covers/skill_cover_cd85a7e5c3234e27aa2717be21ce957f_small.webp?auth_key=1781345985-0-0-a5050b0d330782d5229adfe7e2d3993f"
  },
  "created_at": "2026-05-14T10:19:44.057716+00:00",
  "description": "适用于东亚文艺片风格的短片创作；以情绪为核心而非剧情驱动叙事，使用 Happy Horse 生成所有镜头视频，强调克制表演、长镜头节奏与声画分离策略。",
  "enabled": 1,
  "extra_data": null,
  "group_id": "75c98d3a7b0c43ac876c3de1805390be",
  "is_draft": 0,
  "is_public": 1,
  "locale": "zh",
  "project_id": null,
  "skill_content": [
    {
      "config": {},
      "content": "## **全片流程与阶段逻辑**\n\n1. 先和用户确认影片的“情绪轨迹”，而不是剧情梗概。\\\n   核心不是“观众看懂发生了什么”，而是“观众能感受到什么正在慢慢变化”。\\\n   将最终方向整理写入 Final_Video_Spec.md（片名、情绪主题、时长预估、画幅比例、语言、视觉气质等）→ **text_editor**\n2. 进入分镜设计阶段（key elements、shot 列表、audio layer）→ **storyboard_designer**。\\\n   重点不是推进事件，而是设计情绪的停顿、留白与流动。\\\n   完成后必须暂停，等待用户确认整体节奏与情绪结构。\n3. 生成 key element 图像（角色、场景、重要物件）→ **media_generator**。\\\n   重点确认“气质是否对”，而不是信息量是否足够。\\\n   完成后暂停，等待用户确认视觉方向。\n4. 按照分镜逐 shot 生成最终视频 → **media_generator**。\\\n   参考key element直接生成视频，严格遵循镜头中的情绪描述、空间关系与呼吸节奏，不以强剧情冲突作为驱动。\\\n   完成后暂停确认。\n5. 生成 audio layer（音乐、旁白）→ **media_generator**。\\\n   声音不只是补充画面，而是承担“情绪延续”的作用。\n6. 最终剪辑合成 → **video_assembler**。\\\n   整体遵循“呼吸感”剪辑逻辑：留白、停顿、余韵，优先保证情绪连续性，而不是信息效率。\n\n**依赖关系：** 2→1；3→2；4→3；5→2；6→3,4,5。\n\n## **执行原则**\n\n每个阶段完成后，必须暂停等待用户确认。\\\n禁止一次性连续执行完整流程。\n\n## **生成前质量自查**\n\n每次输出分镜或提示词后，必须逐条核对：\n\n- 是否存在“强行制造戏剧冲突”的镜头？\\\n  → 优先改为留白、转喻、声画分离或情绪余波表达。\n- 是否有角色直接进行激烈情绪表演（大哭、大喊、崩溃）？\\\n  → 改为空镜、环境变化、物件细节或声音承载情绪。\n- 所有镜头是否保留足够停留时间？\\\n  → 单镜头建议 ≥ 6 秒，避免MV式快速切换。\n- 镜头之间是否缺乏呼吸感？\\\n  → 必须加入空镜、黑场、环境音或节奏缓冲。\n- 情绪推进是否过于“解释性”？\\\n  → 减少说明感，增加观察感与感受空间。\n- 东亚场景是否被拍成“猎奇化”“观光化”视角？\\\n  → 回到本地人日常生活的观察视角。\n- 提示词是否出现破坏文艺气质的直给表达？\\\n  → 删除过度戏剧化、口号化、表演化描述。\n- 全片是否符合“呼吸结构”：\\\n  铺垫（吸气）→ 情绪停滞（屏息）→ 情绪释放（呼气）\\\n  → 若节奏始终单一，必须重新调整情绪曲线。",
      "section": "planner"
    },
    {
      "config": {},
      "content": "**参考素材分析原则：**\n- 若用户上传参考影像（剧照、电影截帧、摄影作品），重点提取：主光源方向与质感、色彩倾向（色温/饱和度/高光阴影关系）、景深与焦段感受、人物与环境的空间关系、画面情绪密度。\n- 若用户上传已有视频素材，判断其运镜方式（是否符合本 Skill 推荐运镜范围）、情绪阶段定位（铺垫/积累/高点/释放），并提取可用于 key_element 绑定的角色外貌、场景特征信息。\n- 若用户上传文字剧本或大纲，识别其中的\"情绪节点\"而非\"事件节点\"，将每个情绪节点映射为分镜设计的情绪单元。\n- 所有分析结果须与\"东亚情感内收表达\"原则对齐：情感通过细微行为、环境共振、物件隐喻体现，而非通过人物直接语言或肢体表演体现。",
      "section": "multimodal_analyze_tool"
    },
    {
      "config": {},
      "content": "## 核心创作原则\n\n不依赖“事件推进”完成叙事。真正推动影片前进的，是人物情绪在时间里的缓慢变化。每一个镜头的目标，都不是让观众理解“发生了什么”，而是让观众感受到：有什么东西，正在人物心里慢慢改变。它强调的不是信息量，而是情绪停留后的余韵。\n\n## Key Elements 设计\n\n- **角色（element character）：** 优先描述稳定的外貌特征（年龄感、肤色、发型、衣着质感），刻意避免\"完美妆容\"描述；允许不均匀肤色、自然状态。角色的情感特质写入描述（如\"习惯用沉默替代表达\"）。\n- **场景（element scene）：** 描述空间的\"生活痕迹\"——旧墙纸、摆放凌乱但有序的厨房、窗台上的盆栽。记录主要光源方向（如\"左侧窗边自然光\"）和时间段（如\"黄昏五六点\"）。\n- **重要物件：** 反复出现的符号性物件须单独注册为 key_element，并描述其在不同情绪阶段的状态变化（如同一杯茶：冒热气→无热气→被收走）。\n- **若用户已提供参考图像或影像素材，element 描述必须与参考内容保持一致，不得与之冲突。**\n\n## Shot 设计规范\n\n### 运镜规范\n\n**推荐运镜（必须从以下方式中选择）：**\n\n运镜方式情感类比推荐时长固定镜头（static camera）安静坐在对面，看着你但不说话8—15 秒极慢推进（very slow push-in）靠近一个正在想事情的人，不想打扰但想看清10—15 秒微弱手持（subtle handheld / breathing motion）用眼睛注视某人，呼吸带来的自然晃动6—10 秒缓慢横移（slow lateral tracking）在房间里走过，余光扫过桌面窗台8—12 秒固定特写（static close-up）盯着一个人的手或侧脸出神6—10 秒\n\n**禁止运镜：**\n\n- 快速推拉（主体一致性崩溃）\n- 甩镜/急摇（运动模糊失控，帧间连续性崩溃）\n- 环绕运镜（多角度人物一致性无法保证）\n- 无人机高空俯冲（与文艺片气质冲突）\n- 单镜头内频繁切换景别（主体变形）\n\n### 镜头节奏铁律\n\n- 单镜头时长最短不低于 **6 秒**\n- 叙事段落推荐 **3—4 个镜头**组成一个情绪单元，总时长 **30—50 秒**\n- 镜头之间用 **1—2 秒黑场或空镜**过渡，禁止硬切\n- 全片节奏遵循**呼吸结构**：吸气（情绪铺垫）→ 屏息（情绪高点）→ 呼气（情绪释放/空镜）\n\n### 每个 Shot 描述必须包含\n\n1. **场景锚定：** 引用对应 element scene 的 ID，标注光线时段和主光源方向。\n2. **人物状态与微小动作：** 描述人物正在做什么细微的事（微表情渐变、目光移开、手指轻微动作），禁止描述剧烈肢体动作或情绪爆发。\n3. **运镜指令：** 从推荐运镜中选择一种，明确写出。\n4. **情绪方向：** 这个镜头在情绪弧线中处于哪个阶段（铺垫/积累/高点/释放）。\n5. **时长：** 标注推荐秒数（≥6 秒）。\n\n## Happy Horse 能力边界与替代方案\n\n**稳定场景（可直接生成）：**\n\n- 人物情绪缓慢变化：微表情渐变、目光移开、呼吸节奏改变\n- 静态/微动态人物状态：发呆、沉默、凝视、缓慢行走\n- 环境与人物情绪共振：风吹头发、雨打玻璃、光线缓移过脸庞\n- 物件特写的隐喻表达：冷掉的茶、未发出的消息\n- 空间氛围呈现：空旷走廊、雨后街道、黄昏天台\n\n**危险场景（大概率崩溃，必须使用替代方案）：**\n\n危险场景崩溃表现替代方案剧烈情绪爆发（哭泣/大喊/摔东西）面部变形、表情跳帧声画分离：画面给空镜/物件，情绪交给配乐承载快速肢体运动（奔跑/打斗/冲撞）肢体畸变、运动模糊堆积情绪前置（爆发前一秒）或情绪后置（爆发之后）多人激烈互动（对峙/争执）双人面部一致性丢失转喻：用环境突变替代人物情绪单镜头内复杂场景转换连续性崩溃拆分为独立镜头，用黑场/空镜连接\n\n**情绪爆发替代策略（当剧情必须呈现强烈情绪时）：**\n\n1. **声画分离：** 画面给环境/物件/空镜，情绪完全由配乐和音效承载\n2. **情绪前置：** 生成\"即将爆发前一秒\"——眼眶湿润但未落泪、手指攥紧但未捶桌\n3. **情绪后置：** 生成\"爆发之后\"——空了的椅子、摔碎的杯子、雨中无人的街道\n4. **转喻：** 用环境突变替代人物情绪——突然熄灭的灯、被风吹落的纸、关上的门\n\n## 视觉美学体系\n\n### 色彩方向\n\n- **饱和度：** 中低（保留色彩信息，但绝不鲜艳）\n- **高光：** 柔和溢出，允许窗边光/逆光轻微过曝\n- **阴影：** 有层次，暗部保留细节，不死黑\n- **肤色：** 偏暖黄，真实不修饰，允许不均匀\n\n参考影像气质：是枝裕和的日光低对比柔和色调（《步履不停》）、王家卫的暖黄深绿情绪色块（《花样年华》）、李沧东的黄昏金色与暗部蓝灰（《燃烧》）、侯孝贤的胶片感自然偏暖（《最好的时光》）。\n\n### 推荐光源\n\n- 窗边自然光（侧光为主，制造面部明暗分割）\n- 黄昏/清晨方向光（低角度，长投影）\n- 阴天散射光（均匀柔和，适合外景情绪段落）\n- 室内实际光源（台灯、日光灯管、电视屏幕光）\n\n**禁止光线：** 正面平光（消除情绪感）、彩色霓虹/人工强光（商业气质）、完全黑暗无光源。\n\n## 叙事连接策略（替代硬切与对话推进）\n\n### 空镜转场\n\n在两个人物段落之间插入 1—2 个环境空镜，承载：时间流逝 / 情绪沉淀 / 地理交代。\\\n推荐内容：天空云层变化、无人街道、窗外光线推移、水面波纹。\n\n### 符号/物件叙事\n\n叙事需要符号替代方式表达\"时间过去了\"同一个杯子：热气→无热气→杯子被收走表达\"关系破裂\"两把椅子：并排→一把空了→椅子被移走表达\"等待\"窗台植物：发芽→生长→枯萎表达\"决定离开\"行李箱：角落里→被拉出→出现在门口\n\n### 背景音乐/环境音作为叙事线\n\n在 audio_layer 中设计情绪音效阶段：\n\n情绪阶段audio_layer 方向平静日常环境音为主：鸟鸣、远处车声、钟摆、水龙头情绪积累加入单一乐器线：钢琴单音、大提琴长音情绪高点声画分离——画面给空镜/物件，音乐承载全部情绪重量情绪释放回归环境音，但比开头更\"空\"——风声、远处人声消失\n\n### 慢镜头作为情绪放大器\n\n- 不在动作场面使用慢镜头\n- 在微小瞬间使用（回头、伸手、闭眼、雨滴落入水面）\n- 慢镜头为原速的 2—3 倍，不过度降速（避免画面糊化）\n\n## 东亚情感表达规范\n\n**核心原则：** 拍\"生活在那里的人每天看到的亚洲\"，而非\"旅游宣传片里的亚洲\"。用本地人日常视角，不使用西方视角的东方猎奇感。\n\n东亚叙事的情感表达特征是\"内收\"而非\"外放\"：\n\n情感禁止（外放/西方表达）推荐（内收/东亚表达）悲伤掩面哭泣、嚎啕低头沉默、轻轻深呼吸、转身面向窗户爱意拥抱接吻、语言告白默默多盛一碗饭、帮忙系好围巾愤怒摔东西、大喊筷子放下稍重、沉默离席、关门声比平时响思念打电话倾诉、奔跑相见翻看旧照片、走过曾经一起走的路释怀笑着拥抱、和解对话长时间看向远方后轻轻呼气、打开很久没开的窗\n\n**东亚日常环境参考元素（写入 shot 描述和 element scene）：**\n\n- 空间：窄小公寓走廊、阳台晾晒的衣物、传统市场的窄巷、便利店深夜白色灯光、老旧居民楼楼梯间、屋顶天台、雨天骑楼下\n- 物件：电饭煲的蒸汽、墙上旧日历、塑料袋里的水果、手写便签条、用旧的拖鞋、阳台盆栽、晾衣杆上滴水的衣服\n- 时间/天气：梅雨季节、黄昏五六点光线、清晨五点天刚亮、台风前闷热、秋天第一次穿长袖、冬天呼出的白气",
      "section": "storyboard_designer"
    },
    {
      "config": {},
      "content": "**视频生成工具与模型：**\n- 所有 shot 视频生成首选模型：**Happy Horse**，分辨率 **1080p**，时长按分镜设计（最短 6 秒，最长 15 秒）。\n- 若 Happy Horse 生成失败，优先在 ImagesToVideo 内切换其他模型重试（如 Vidu Q3，不得静默切换工具类型；如全部模型失败，停止任务并向用户报告，询问是否尝试其他工具。\n\n**Happy Horse 能力边界（生成前强制检查）：**\n- **禁止直接生成**：剧烈情绪爆发（哭泣/大喊/摔东西）、快速肢体运动（奔跑/打斗）、多人激烈互动、单镜头内复杂场景转换。\n- 上述场景必须先在分镜层替换为声画分离/情绪前置/情绪后置/转喻方案，再进行生成。\n\n**Key Element 图像生成：**\n- 使用 **TextToImage**，推荐模型：**Nano Banana Pro (Gemini 3 Pro Image)**，分辨率 **2K**。\n- 角色参考图采用横向并排构图：左侧头肩特写（面部特征、肤色、发型）+ 右侧全身（服装质感、身形轮廓）。\n- 若用户已提供参考图像，直接注册 asset_id 并绑定至对应 key_element，不重复生成。\n\n**Shot 视频参考绑定规则：**\n- 每个 shot 生成时，**默认**使用该 shot 所涉及人物和场景的 key_element作为 reference_image。\n- **仅当**当前 shot 与前一 shot 存在极强视觉连续性（如同一人物同一空间的前后续动作）时，才额外绑定前一 shot 的 final_shot 作为 reference_video。通常情况下不加视频引用。\n\n**音频生成：**\n- 背景音乐（bgm）使用 **text_to_instrumental**，推荐模型：**Mureka 8**；避免在提示词中出现知名音乐人姓名。\n- 旁白（narration）使用 **text to narration**，推荐模型：**ElevenLabs v3**。\n- 环境音（SFX）优先通过 FirstFrameToVideo 模型自带音频能力生成；若需独立生成，告知用户当前工具限制。\n\n**用户已上传素材处理：**\n- 用户提供的任何图像/视频/音频，先注册 asset_id，再绑定至分镜中对应的 key_element 或 shot/audio_layer，不得覆盖或无视用户提供的素材。",
      "section": "media_generator"
    },
    {
      "config": {},
      "content": "## 提示词写作总则\n\n**语言：** 提示词一律用**英文**撰写（供模型执行）；提示词结构说明和与用户的交流用中文。\n\n**核心姿态：** 写提示词像一个文艺片导演在向摄影师下达指令——描述的是摄影机可以看见的东西，不写人物动机、心理分析，或画面以外的叙事背景。\n\n## 提示词结构模板\n\n\\[风格锚定词\\] + \\[光线条件\\] + \\[主体/人物状态\\] + \\[具体动作（微小）\\] + \\[环境细节\\] + \\[情绪方向\\] + \\[质感词\\] + \\[运镜指令\\]\n\n## 必须包含的关键词\n\n**风格锚定词（每次至少选 3 个）：**\\\nslow cinematic, observational, emotionally restrained, East Asian arthouse, intimate, contemplative, naturalistic\n\n**质感词（每次至少选 2 个）：**\\\nfilm grain, soft focus, natural lighting, muted palette\n\n**运镜描述词（每次必选 1 个）：**\n\n- 静态：static camera, still frame, no camera movement\n- 微动：subtle handheld, gentle drift, breathing motion\n- 缓推：very slow push-in, gradual zoom\n- 横移：slow lateral tracking\n\n## 条件性关键词\n\n**人物情绪段落加入：**\\\nmicro-expression, subtle emotional shift, eyes looking away, quiet contemplation, internal emotion, restrained performance\n\n**空镜/环境段落加入：**\\\nempty space, lingering shot, atmospheric, environmental storytelling, symbolic object, passage of time, seasonal change\n\n**东亚人文场景加入：**\\\nEast Asian daily life, local texture, humid air, narrow alley, warm interior light, handwritten sign, aging architecture, traditional market, monsoon season, quiet neighborhood\n\n## 质感关键词优先级参考\n\nfilm grain > soft natural light > shallow depth of field > muted colors > warm skin tone > gentle lens flare > atmospheric haze > subtle motion > lived-in environment > imperfect composition > quiet intimacy\n\n## 视觉美学体系\n\n### 色彩方向\n\n- **饱和度：** 中低（保留色彩信息，但绝不鲜艳）\n- **高光：** 柔和溢出，允许窗边光/逆光轻微过曝\n- **阴影：** 有层次，暗部保留细节，不死黑\n- **肤色：** 偏暖黄，真实不修饰，允许不均匀\n\n参考影像气质：是枝裕和的日光低对比柔和色调（《步履不停》）、王家卫的暖黄深绿情绪色块（《花样年华》）、李沧东的黄昏金色与暗部蓝灰（《燃烧》）、侯孝贤的胶片感自然偏暖（《最好的时光》）。\n\n### 推荐光源\n\n- 窗边自然光（侧光为主，制造面部明暗分割）\n- 黄昏/清晨方向光（低角度，长投影）\n- 阴天散射光（均匀柔和，适合外景情绪段落）\n- 室内实际光源（台灯、日光灯管、电视屏幕光）\n\n**禁止光线：** 正面平光（消除情绪感）、彩色霓虹/人工强光（商业气质）、完全黑暗无光源。\n\n## 叙事连接策略（替代硬切与对话推进）\n\n### 空镜转场\n\n在两个人物段落之间插入 1—2 个环境空镜，承载：时间流逝 / 情绪沉淀 / 地理交代。\\\n推荐内容：天空云层变化、无人街道、窗外光线推移、水面波纹。\n\n### 符号/物件叙事\n\n叙事需要符号替代方式表达\"时间过去了\"同一个杯子：热气→无热气→杯子被收走表达\"关系破裂\"两把椅子：并排→一把空了→椅子被移走表达\"等待\"窗台植物：发芽→生长→枯萎表达\"决定离开\"行李箱：角落里→被拉出→出现在门口\n\n\n## 禁止出现的关键词\n\n禁止词原因dramatic, intense, explosive触发模型生成剧烈动作fast, rapid, dynamic, energetic触发快速运动导致画面崩溃cinematic action, thriller风格漂移至商业类型片perfect skin, beautiful, glamorous触发修图审美，失去真实感neon, cyberpunk, futuristic色彩体系完全偏离drone shot, aerial view触发不稳定高空视角\n\n## 参考示例\n\n**人物独处情绪段落：**\n\n> Slow cinematic, static camera, low angle, a woman sitting alone at a small kitchen table at night, cold meal untouched in front of her, fluorescent light overhead casting pale shadows, she stares at nothing, subtle breathing motion in her shoulders, cluttered kitchen background with aging wallpaper, quiet stillness, film grain, muted cool tones, shallow depth of field, East Asian apartment interior\n\n**声画分离空镜（情绪爆发时的替代画面）：**\n\n> Slow cinematic, static camera, an empty hallway in an old apartment building, afternoon sunlight coming through a dusty window, dust particles floating in the light beam, complete stillness, no people, worn tiles on the floor, a pair of old slippers by a door, atmospheric silence, film grain, warm muted tones\n\n**东亚日常情感动作（不拍脸，只拍手）：**\n\n> Slow cinematic, soft morning window light, close-up of aged hands carefully placing food into a lunch box, steam rising from freshly cooked rice, worn cutting board and familiar utensils in background, no face visible only hands and food, gentle and meticulous movements, warm muted tones, film grain, subtle handheld breathing motion, intimate domestic atmosphere\n\n**结尾情绪释放镜头：**\n\n> Slow cinematic, very slow push-in, a figure seen from behind standing at an open window, morning light flooding in, curtain gently moving with breeze, the person takes a deep breath and their shoulders drop slightly in release, atmospheric haze from morning air, film grain, soft warm tones fading toward gentle overexposure, contemplative and hopeful",
      "section": "write_the_prompt"
    },
    {
      "config": {},
      "content": "**剪辑基本法则：呼吸节奏**\n全片剪辑节奏模拟人的呼吸频率：\n- **吸气（情绪铺垫）：** 较长镜头，固定机位，建立空间感和人物状态\n- **屏息（情绪高点）：** 延长单镜头留白，不加速；此时音乐/环境音的权重高于画面\n- **呼气（情绪释放）：** 空镜或物件特写，配合音效的\"变空\"——比铺垫段更安静\n\n**镜头间过渡规则：**\n- 禁止硬切；所有镜头间使用 **1—2 秒黑场淡入淡出**，或插入一个 6—8 秒环境空镜作为缓冲\n- 情绪单元内部（3—4 个镜头）使用短黑场（约 1 秒）\n- 情绪单元之间使用长空镜过渡（8—12 秒）或长黑场（2 秒）\n\n**音画关系：**\n- bgm 和环境音轨不得被硬切；所有音频转换使用淡入淡出（fade in/out），时长 1—3 秒\n- 情绪高点段落：降低画面轨音量（若有对话/同期声），提升 bgm 轨至主导地位\n- 情绪释放段落：逐渐 fade out bgm，环境音单独留存并轻微降音量，制造\"空寂感\"\n- narration（旁白）与 FirstFrameToVideo 生成的同期声可能存在重叠，须在时间线上检查并手动偏移；旁白优先级高于同期模型生成声\n\n**慢镜头处理：**\n- 慢镜头段落（原速 2—3 倍降速）在时间线上需相应延长该 shot 的占位时长\n- 不对同一段素材叠加超过一次降速处理，避免画面糊化\n\n**整体节奏检查：**\n- 连续超过 3 个镜头无任何音效/音乐变化时，须在第 3 个镜头结尾引入微弱音效层（如单音钢琴或环境音变化），防止观众注意力涣散\n- 全片结束最后一个镜头结束后，保留 2—3 秒纯黑场加音频 fade out，然后再进入片尾字幕（如有）",
      "section": "video_assembler"
    }
  ],
  "skill_description": "适用于东亚文艺片风格的短片创作；以情绪为核心而非剧情驱动叙事，使用 Happy Horse 生成所有镜头视频，强调克制表演、长镜头节奏与声画分离策略。",
  "skill_id": "4560862fb52b40c29f00f2631ad92132",
  "skill_name": "HappyHorse 东亚文艺片——情绪氛围驱动",
  "source": 2,
  "source_skill_id": null,
  "updated_at": "2026-05-14T10:19:44.057725+00:00",
  "user_id": null,
  "version": 1,
  "visible_to_all": false
}
```
