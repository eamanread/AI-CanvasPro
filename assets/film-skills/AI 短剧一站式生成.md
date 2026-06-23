# AI 短剧一站式生成

## Skill 描述

适用于将剧本文本工业化拆解为短剧视频的全流程制作场景。支持从剧本分析、角色/场景元素设定、分镜设计、视频生成到时间线合成的完整链路；以 Seedance 2.0 为核心视频生成模型，配合 GPT Image 2 生成角色与场景设定图。

## Skill JSON

```json
{
  "author": {
    "avatar": "https://lh3.googleusercontent.com/a/ACg8ocJuy3HqMEZJz8Me6uuzW2cEx6yDNRlYyRWKNGHy3VUkRf9E4uc=s96-c",
    "name": "Aplus影像",
    "user_id": null
  },
  "cover_standard_url": {
    "compressed": "https://cdn-ap.flova.tv/skill_covers/skill_cover_f12fa8db7fde4f9b87193e0107cf91a8_compressed.webp?auth_key=1781961568-0-0-1d5fe541b4926c474d2e4e00e92eb2a6",
    "large": "https://cdn-ap.flova.tv/skill_covers/skill_cover_f12fa8db7fde4f9b87193e0107cf91a8_large.webp?auth_key=1781961569-0-0-ebcee4cc249eee460ec8ba66ba3b9846",
    "medium": "https://cdn-ap.flova.tv/skill_covers/skill_cover_f12fa8db7fde4f9b87193e0107cf91a8_medium.webp?auth_key=1781961569-0-0-d1dbd9a6b76beac1de2563ac4d5cb8b8",
    "small": "https://cdn-ap.flova.tv/skill_covers/skill_cover_f12fa8db7fde4f9b87193e0107cf91a8_small.webp?auth_key=1781961569-0-0-34b08323f1e62ec191759fb2fd2fe86a"
  },
  "created_at": "2026-05-21T13:19:28.812323+00:00",
  "description": "适用于将剧本文本工业化拆解为短剧视频的全流程制作场景。支持从剧本分析、角色/场景元素设定、分镜设计、视频生成到时间线合成的完整链路；以 Seedance 2.0 为核心视频生成模型，配合 GPT Image 2 生成角色与场景设定图。",
  "enabled": 1,
  "extra_data": null,
  "group_id": "e016d58700c24806a0a43ace69c68048",
  "is_draft": 0,
  "is_public": 1,
  "locale": "zh",
  "project_id": null,
  "skill_content": [
    {
      "config": {},
      "content": "**启动协议**\n\n用户触发本 Skill 时，按顺序确认以下信息后再推进：\n\n1. 当前所处阶段（从零开始，还是已有部分产出？）\n2. 已有素材（请用户上传或粘贴现有剧本 / 分镜 / 设定图）\n3. 输出语言偏好（分镜脚本通常中文；提示词通常英文，但中文同样可行）\n\n**全流程阶段与依赖关系**\n\n1. 读取并分析用户上传的剧本文件，提取角色、场景、关键道具，识别剧本类型 → **resource_prepare_and_analyze**\n2. 将全局制作参数写入 Final_Video_Spec.md（画幅比例、目标时长、影像风格基调、输出语言）→ **text_editor**\n3. 设计 Storyboard：登记所有 key_element（角色、场景、关键道具），将剧本拆解为有序 shot 列表，规划 audio_layer（BGM、旁白）→ **storyboard_designer**\n4. 生成所有 key_element 设定图（角色三视图、场景四视图）→ **media_generator**\n5. 生成每批次运镜轨迹示意图（分镜表格图），供视频生成阶段作视觉锚点参考 → **media_generator**\n6. 逐 shot 生成视频，每镜引用对应 key_element 图像；仅在与上一镜连续性极强时额外引用上一镜视频作为 reference_video → **media_generator**\n7. 生成所有 audio_layer 音频资产（台词、BGM、旁白）→ **media_generator**\n8. 按 Storyboard 顺序组装时间线，完成音画同步与剪辑输出 → **video_assembler**\n\n**依赖关系：** 3→1,2；4→3；5→3；6→4,5；7→3；8→4,5,6,7\n\n**关键暂停点：** 每个阶段完成后必须暂停，等待用户确认再继续。绝不一口气输出全部步骤——这会让纠错成本爆炸。重点暂停节点：\n\n- 剧本分析完毕、Storyboard 草稿确认后（进入生成前）\n- 所有 key_element 设定图确认后（进入视频生成前）\n- 所有分镜视频生成完毕后（进入组装前）\n\n**剧本兼容性：** 若用户上传的是散文体小说而非分镜脚本，在分析阶段识别并告知用户，引导其先完成短剧改编再继续；不得擅自补全剧本中未描述的角色外貌或场景细节，应主动询问。\n\n**信息缺失处理：** 剧本中未写明的角色长相、场景细节、影像风格，一律主动询问用户，不得静默假设或擅自补充。",
      "section": "planner"
    },
    {
      "config": {},
      "content": "**剧本文件接收与分类**\n\n接受以下输入形式：.txt、.docx 文件上传，或用户直接粘贴的文本内容。\n\n通读剧本后，首先判断其类型并输出分类结论，供 Planner 据此决定后续路径：\n\n- **A 类 — 成熟分镜剧本：** 已按场景/镜头明确划分，包含景别、运镜、台词等要素 → 可直接进入 Storyboard 设计阶段。\n- **B 类 — 散文体小说 / 纯对话文本：** 无镜头结构，仅有叙事或人物对话 → 须告知用户，建议先完成短剧化改编（将叙事转化为分镜脚本）再继续；不得自行补全剧本中未描述的角色外貌或场景细节，须向用户确认。\n- **C 类 — 半结构化剧本：** 有基本场景描述或简单镜头标注，但缺少完整分镜语法（景别/机位/运镜不全）→ 可直接进入 Storyboard 设计阶段，由 storyboard_designer 在拆解 shot 时补全缺失的分镜要素。\n\n**提取结构化信息**\n\n无论哪类剧本，在分析阶段均需提取并输出以下结构化信息，供后续阶段使用：\n\n- **角色清单：** 姓名、出场场景、外貌/服装描述（仅提取剧本中已明确描述的内容，缺失项标注\"待用户补充\"）\n- **场景清单：** 场景名称、空间特征描述、出现的镜头范围\n- **关键道具：** 对剧情或视觉有重要作用的道具\n- **剧情结构：** 幕次划分（开篇/发展/转折/高潮/结尾）及各幕大致镜头数量估算",
      "section": "multimodal_analyze_tool"
    },
    {
      "config": {},
      "content": "**设计 key_element**\n\n- 登记所有**主要角色**（element character）、**关键场景**（element scene）、关键道具（prop element）作为 key_element。\n- 角色描述须包含：年龄/性别/外貌/发型/服装/标志性细节；若角色在剧情中有多套造型或不同时间线形象，在描述中分别列出（如\"造型A：…；造型B：…\"）。\n- 场景描述须包含：空间结构、固定参照物（不可移动的视觉地标）、材质/光源/色温/氛围词。这些描述是后续每个 shot 空间连续性的锚点。\n- 角色的声音特征（音色/语气/情绪基调）单独登记为 key_element_audio，与角色元素绑定，用于视频生成时的音频条件。\n\n**拆解 shot 列表**\n\n- 每个 shot = Seedance 2.0 一次生成任务，时长 ≤ 15s（硬性上限，超出必须拆分）。\n- **批次拆分规则**（每个 shot 视为一个批次单元）：\n  - 单 shot 时长 ≤ 15s\n  - 单 shot 内切镜数量建议 2—6 个\n  - 单 shot 出场人物 ≤ 3 人，超出须拆分\n  - 单 shot 保持空间一致性，跨物理空间必须切新 shot\n- **优先设计较长镜头**（建议 8—15s），充分利用 Seedance 2.0 在单次生成中支持内切镜和丰富运镜的能力；避免将一个连续场景拆成过多短镜头。\n- 每个 shot 描述必须包含：\n  - **场景**：引用对应 element scene ID\n  - **人物动作与对白**：以时间顺序描述人物行为、面部表情、台词（写出具体台词文本）\n  - **分镜语法三件套**：景别（大特写/特写/近景胸像/中景/中全景/全景/大全景）+ 机位（平视/俯拍/仰拍/过肩/正侧面等）+ 运镜（固定/推进/拉远/横摇/跟随/环绕/升降等），三者缺一不可\n- 同一物理空间的连续场景尽量归入同一或相邻 shot；跨场景需明确标注空间切换。\n- 人物在相邻 shot 之间的位置/朝向/手持物必须连贯，Storyboard 中需显式维护这一状态。\n\n**全局空间锚点卡（每 shot 开头声明）**\n\n每个 shot 描述的开头须附一张空间锚点卡，格式如下：\n\n【空间锚点 / 场景名】\n固定参照物：（不可移动的视觉地标，如\"破旧防盗门位于画面中心\"）\n人物当前状态：\n· 角色A：\\[位置 + 朝向\\]\n· 角色B：\\[位置 + 朝向\\]\n光影基调：（光源类型 + 色温 + 氛围词）\n\n空间锚点卡是跨镜保持空间一致性的关键锚点，确保相邻 shot 之间人物位置、光影连贯，不得省略。\n\n**Storyboard 完稿前自检清单**\n\n交付 Storyboard 前逐项核查并向用户报告结果：\n\n- \\[ \\] **遗漏检查**：原剧本中所有关键动作、台词、转折是否都有对应 shot？\n- \\[ \\] **逻辑一致性**：人物在前后 shot 的位置/朝向/手持物是否连贯？\n- \\[ \\] **接镜顺畅度**：前一 shot 出画方向与后一 shot 入画方向是否符合轴线规则（不跳轴）？\n- \\[ \\] **时长合规**：每个 shot 合计是否 ≤ 15s？每个内切镜是否在景别建议时长内？\n- \\[ \\] **空间一致性**：同一 shot 内是否未跨场景？光影基调是否与前 shot 衔接（除非剧情需要硬切）？\n- \\[ \\] **角色一致性**：角色代号是否全程统一，无同人异名？\n- \\[ \\] **音效/台词位置**：是否紧贴对应动作，无错位？\n\n如有问题，先与用户确认是否修改，再继续下一步，不得静默修改原稿。\n\n**设计 audio_layer**\n\n- **BGM**：全剧至少规划一条背景音乐轨。若剧情有明显情绪转折点（如 3 分钟以上长片），可分段设计多条 BGM（各有独立 audio_layer ID 和覆盖镜头范围）。\n- **旁白**：如有画外音/旁白，以 narration 类型登记，注明音色特征、语气、具体台词文本及覆盖的镜头范围。\n- 视频生成阶段视频本身**不内嵌 BGM**（在 audio_layer 独立生成后于组装阶段混音）；台词/音效可在视频生成时内嵌。",
      "section": "storyboard_designer"
    },
    {
      "config": {},
      "content": "**key_element 设定图生成**\n\n- 使用 **TextToImage** 生成所有角色和场景设定图，推荐模型：**GPT Image 2**，分辨率 **2K**。\n- **角色三视图**：单张图中并排三个全身视角（正面/侧面90°/背面），服装/配饰/发型/体型在三个视角中保持完全一致，中性灰背景，柔和均匀的影棚光。\n- **场景四视图**：单张图中 2×2 宫格排列四个角度（建立全景/主入口中景/关键道具特写/反向视角），光源/色调/陈设在四格之间保持一致，画面中无人物。\n- 设定图生成后必须暂停，由用户确认视觉风格与剧本一致后，再绑定到对应 key_element 并进入视频生成阶段。\n\n**分镜表格图（运镜轨迹示意图）生成**\n\n- 在视频生成阶段开始前，为每个 shot 生成一张运镜轨迹示意图作为视觉施工图纸。\n- 使用 **ImageToImage**，推荐模型：**GPT Image 2**，分辨率 **2K**；同时上传该 shot 涉及的角色三视图和场景四视图作为 reference_image，确保画风/角色/场景一致。\n- 分镜表格图需包含四大要素：运镜轨迹箭头（推进/拉远/环绕/升降/跟随/固定各用不同颜色区分）、每切镜的中文动作说明、景别与时长标注、机位示意（相机图标+虚线轨迹）。\n- 具体提示词写法见 **Write the Prompt** 分区。\n\n**分镜视频生成**\n\n- 使用 **MultiModalToVideo**，推荐模型：**Seedance 2.0**，分辨率 **720p**。\n- 每个 shot 的参考输入默认包含：该镜涉及的所有角色 key_element 图像 + 对应场景 key_element 图像。\n- 仅当本镜与上一镜的连续性极强（如同一动作的延续、无剪切的场景推进）时，额外添加上一镜的 final_shot 视频作为 reference_video；**通常不加视频参考**，避免模型过度继承上一镜构图而削弱本镜的运镜设计。\n- 每个 shot 视频生成时，将对应角色的 key_element_audio 作为音频条件，保持角色音色跨镜一致。\n\n**音频生成**\n\n- BGM（music 类型）：使用 **text_to_instrumental**，推荐模型：**Suno 5**（注意：提示词中不得出现知名音乐人名字）。\n- 旁白（narration 类型）：使用 **text to narration**，推荐模型：**ElevenLabs v3**。",
      "section": "media_generator"
    },
    {
      "config": {},
      "content": "**内切镜时长估算（视频提示词撰写前）**\n\n若 Storyboard shot 未标注各内切镜时长，按以下经验值估算，确保单 shot 合计 ≤ 15s：\n\n镜头类型建议时长大特写 / 手部脚部特写1.5–2.5s面部特写（含台词）2–4s近景胸像（含台词）2.5–4s中景 / 中全景3–5s全景 / 大全景建立镜3–5s运镜推进 / 拉远 / 环绕基础景别时长 +1s\n\n超过 15s 必须拆分为独立 shot。\n\n**角色三视图提示词（TextToImage / GPT Image 2）**\n\nA character turnaround sheet of \\[角色描述，含年龄/性别/外貌/服装/标志性细节\\].\nShow three full-body views in one image, evenly spaced left-to-right:\nFront view (facing camera) | Side view (90° profile, facing right) | Back view (facing away).\nIdentical clothing, accessories, hairstyle, and body proportions across all three views.\nPlain neutral gray background (#888888), soft even studio lighting, no shadows on background.\nPhotorealistic, cinematic film still aesthetic, PANAVISION lens look, 8K detail.\nNo text, no labels, no watermark.\n\n**场景四视图提示词（TextToImage / GPT Image 2）**\n\nA location reference sheet of \\[场景描述，含空间结构/材质/光源/色温/标志物\\].\nShow four angles of the same location in one composite image (2×2 grid):\nTop-left: Wide establishing shot |\nTop-right: Medium shot from main entry point |\nBottom-left: Detail shot of key prop or feature |\nBottom-right: Reverse angle from opposite side.\nIdentical lighting, color palette, and props across all four panels.\nNo people in frame. Photorealistic, \\[光影基调描述\\], PANAVISION cinematic, IMAX 70mm film grain.\nNo text, no labels, no watermark.\n\n**分镜表格图（运镜轨迹示意图）提示词（ImageToImage / GPT Image 2）**\n\nA professional storyboard sheet titled \"\\[Shot ID\\] 运镜轨迹示意图\" in Chinese,\nclean white background, top-to-bottom vertical layout.\n\n\\[Header\\]: bold Chinese title \"镜头运动轨迹示意图\"; subtitle: \"\\[本 shot 剧情一句话概括\\]\";\nlegend box — colored dashed arrows: 推进=red, 拉远=blue, 环绕=green, 升降=purple, 跟随=orange, 固定=cyan.\n\n\\[Main content — one row per internal cut\\]:\nLeft (10%): numbered circle + Chinese shot description (景别 + 动作摘要, 2–3 lines)\nCenter (70%): wide cinematic frame showing the scene; camera icon 📷 marks start position,\ndashed arrow shows movement path\nRight (20%): Chinese shot type label + one-sentence purpose note\n\n\\[Footer\\]: pacing summary in rounded box: \"整体节奏：\\[情绪词1\\]→\\[情绪词2\\]→\\[情绪词3\\]\"\n\nStyle: all text Simplified Chinese, clean sans-serif; frame thumbnails photorealistic,\nmatching attached reference images exactly; vertical 3:4 layout.\n\nReference images attached:\\\n\n- Image 1: Character sheet for @\\[角色代号\\] — replicate exactly\\\n- Image 2: Location sheet for @\\[场景代号\\] — replicate exactly\n\n**单 shot 视频提示词（MultiModalToVideo / Seedance 2.0）**\n\n每个 shot 输出一段提示词，结构如下：\n\n\\[影像风格\\]: PANAVISION cinematic, anamorphic widescreen, IMAX 70mm film grain,\n24fps, natural depth of field, three-point dramatic lighting, cinematic color grading.\n\n\\[场景\\]: <<<image\\_场景>>> — \\[当前光影基调描述\\]\n\n\\[角色\\]: <<<image\\_角色>>> — \\[当前服装/状态，与设定图一致\\]\n\n\\[镜头\\]: \\[景别\\] + \\[机位角度\\] + \\[运镜方式\\]\n示例: Medium waist shot, fixed camera, eye-level\n\n\\[动作\\]: \\[人物动作分解，按叙事顺序推进，主要动作→次要动作；\n避免写绝对秒数，用 slow / quick / lingering 描述节奏\\]\n\n\\[音效\\]: <\\[音效描述，紧贴对应动作\\]>\n\n\\[台词\\]: {\\[角色\\]说: \"\\[台词原文\\]\"} (with \\[情绪词\\] tone)\n\n\\[禁止\\]: No subtitles, no background music, no text overlay, no watermark.\n\n\\[时长\\]: Approximately \\[X\\]s\n\n**固定尾部规则：**\n\n- 所有视频提示词末尾必须包含 No subtitles, no background music, no text overlay——BGM 在 audio_layer 独立生成，后期混音；台词/音效可内嵌。\n- 使用 Seedance 2.0 内嵌格式：音乐 (...)、音效 <...>、台词 {...}（非项目语言需在括号前标明语言）、片内字幕 【...】；台词括号内只写原文，不加情绪标注。\n- 不依赖绝对时间戳（如 \"0–3s\"）描述动作节奏，改用速度形容词。",
      "section": "write_the_prompt"
    },
    {
      "config": {},
      "content": "**首尾帧衔接策略**\n\n- 第一个 shot：以对应场景 key_element 四视图中的建立全景角度作为 start_frame。\n- 后续每个 shot：以上一个 shot 视频的最后一帧作为本 shot 的 start_frame，确保人物位置/朝向/手持物与 Storyboard 空间锚点卡中该 shot 的初始状态完全吻合。如有偏差，须重新生成上一 shot 或调整本 shot 空间锚点描述，不得跳过检查直接拼接。\n\n**剪辑节奏与过渡**\n\n- 按 Storyboard shot 顺序顺序组装；对话密集段落保持紧凑剪辑，情绪特写给足呼吸时间。\n- 同一物理空间内的相邻 shot 优先使用无缝硬切；跨空间切换可使用淡入淡出（0.3s 以内），避免过度使用转场特效。\n- 注意 180° 轴线规则：若两个相邻 shot 之间出现跳轴，在中间插入一个正面或过肩过渡 shot，而非强行拼接。\n\n**音频混音层级**\n\n- BGM（audio_layer）音量低于人声 8–12 dB，作为底层垫乐；情绪高潮段可适当提升 3–5 dB。\n- 台词/音效已内嵌在视频轨中，组装时不额外叠加同类音频，避免重复。\n- 旁白（narration audio_layer）音量与台词层平齐，需在时间线上与对应 shot 对齐。\n- BGM 与旁白/台词交叉淡化处理（crossfade 0.5s），防止硬切产生音量跳变。\n\n**常见生成失败与组装修复**\n\n现象原因修复方向角色外貌跨 shot 漂移提示词角色描述不够具体在 Write the Prompt 中强化设定图特征词，重新生成该 shot跳轴相邻 shot 机位跨过 180° 轴线插入正面或过肩过渡 shot镜头时长偏差模型对绝对秒数不敏感改用 slow / quick / lingering 节奏词，组装时用时间线裁剪微调字幕乱入视频提示词未明确禁止强化 no subtitles, no text overlay，重新生成首尾帧不衔接上一 shot 末帧人物已偏离空间锚点将本 shot 第一个内切镜设计为过渡镜，引导画面回到锚点\n\n**导出基准**\n\n- 视频轨分辨率对齐生成时的最高规格（默认 720p）；如需提升，经 super_resolution（MediaKit）上采样后再导出。\n- 帧率 24fps；如需流畅慢动作片段，对目标 shot 单独执行帧插值（fps 提升至 60）后再并入时间线。",
      "section": "video_assembler"
    }
  ],
  "skill_description": "适用于将剧本文本工业化拆解为短剧视频的全流程制作场景。支持从剧本分析、角色/场景元素设定、分镜设计、视频生成到时间线合成的完整链路；以 Seedance 2.0 为核心视频生成模型，配合 GPT Image 2 生成角色与场景设定图。",
  "skill_id": "84090b0f142a4cd7b6e32dd9c9995fb5",
  "skill_name": "AI 短剧一站式生成",
  "source": 2,
  "source_skill_id": null,
  "updated_at": "2026-05-21T13:19:28.812329+00:00",
  "user_id": null,
  "version": 1,
  "visible_to_all": false
}
```
