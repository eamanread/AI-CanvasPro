# 百万爆款羊毛毡动画Skill

## Skill 描述

动画羊毛毡风格视频创作Skill，输入视频旁白即可生成高质量羊毛毡动画，使用Seedance 2.0

## Skill JSON

```json
{
  "author": {
    "avatar": "https://cdn-ap.flova.tv/avatars/avatar_6c373067d5054bd79ff08667a2e0f875_9ad7c3e2e62f4203855f21ab3fa7960b.jpg?auth_key=1781442011-0-0-3e6d8fb19048608bfcf0a20e5c14d5e0",
    "name": "Ai创意研习社",
    "user_id": null
  },
  "cover_standard_url": {
    "compressed": "https://cdn-ap.flova.tv/skill_covers/skill_cover_47e0ea42511a44c597898472e41738b0_compressed.webp?auth_key=1781433456-0-0-8316a53aef4c9e3436ce0b344275e724",
    "large": "https://cdn-ap.flova.tv/skill_covers/skill_cover_47e0ea42511a44c597898472e41738b0_large.webp?auth_key=1781433456-0-0-93aba73a3f9966d2129de95d459067f9",
    "medium": "https://cdn-ap.flova.tv/skill_covers/skill_cover_47e0ea42511a44c597898472e41738b0_medium.webp?auth_key=1781433456-0-0-c9da2eb80960fdcd7926ae2c314545fd",
    "small": "https://cdn-ap.flova.tv/skill_covers/skill_cover_47e0ea42511a44c597898472e41738b0_small.webp?auth_key=1781433456-0-0-f17cdcbb29915501dd7d510c94a74757"
  },
  "created_at": "2026-05-15T10:37:36.346241+00:00",
  "description": "AI 创意研习社动画羊毛毡同款创作 Skill，输入视频旁白即可生成高质量羊毛毡动画（竖屏）",
  "enabled": 1,
  "extra_data": null,
  "group_id": "4c6614730bfa491ca1df355466dad570",
  "is_draft": 0,
  "is_public": 1,
  "locale": "zh",
  "project_id": null,
  "skill_content": [
    {
      "config": {},
      "content": "**推进顺序：** 文案接收 → 规格确认 → 故事板设计 → 角色/场景元素图生成 → 逐镜头视频生成 → BGM 生成 → 最终合成导出\n\n**步骤依赖关系：**\n\n- Final video spec.md 规格确认 依赖 用户提供的文案内容，生成比例固定为 9:16，风格基准使用内置羊毛毡标准（无需用户上传参考视频）→ planner \n- 生成故事板 依赖 Final video spec.md 规格的内置风格基准 + 用户上传的文案脚本（若有） →  storyboard_designer \n- 元素图生成 依赖 故事板（确定本次角色/场景定义） →  media_generator \n- 分镜视频生成 参考上步骤元素图 →  media_generator \n- BGM生成（可选）依赖 所有视频片段确认完成 + 用户确认需要 →  media_generator \n- 旁白/画外音（可选）依赖 故事板audio layer中旁白（画外音）文案 + 用户确认需要 →  media_generator \n- 最终合成 依赖 所有视频片段 + 已确认的可选音频（BGM / 旁白） →  video_assembler \n\n**文案接收：** 用户发来文案后，直接读取文案内容（纯文字脚本/旁白），无需上传任何参考视频，由 **text_editor** 将项目规格写入 Final_Video_Spec.md（标题、比例 9:16、预计时长、主题情绪等）。\n\n**与用户的交互节奏（暂停点）：**\n\n1. 规格写完后 → 确认时长/本次主题/旁白语言\n2. 故事板完成后 → 展示分镜结构，核对旁白对应关系\n3. 角色/场景元素图生成完 → 确认毛毡风格一致性\n4. **每生成一个镜头视频（镜头1、镜头2……）** → 确认毛毡质感/角色一致性/SFX/节奏\n5. 所有视频片段确认后 → 询问是否需要 BGM，是否需要旁白配音；用户确认各项后再分别生成，每项生成后单独确认\n6. 最终合成后 → 引导导出\n\n***必须逐节点暂停，每个阶段用户确认后再推进。***",
      "section": "planner"
    },
    {
      "config": {},
      "content": "**结构组成：**\n\n- **key_elements**（本次视频的角色/场景/道具定义）\n\n  - 每个元素包含：文字描述（外貌/材质/色彩）+ 后续绑定生成的参考图 asset_id\n  - 角色描述需包含：体型特征、服装颜色、毛毡造型风格（见下方风格分级）\n  - 场景/道具描述需包含：主色调、道具构成、光线类型；场景与道具以真实世界比例呈现（如正常大小的餐厅、街道、房间），整体视觉感是「现实世界用羊毛毡材质复刻」，而非微缩模型或玩偶舞台\n\n**角色造型风格分级（由设计师根据内容语境判断选用，不一刀切）：**\n\n- **写实感可爱（默认，适用于主要角色）**：比例接近正常人体（头身比约 1:3 到 1:4），面部圆润温暖，但四肢、身体有正常比例感；用毛毡手工感来传递温度，而不是靠 Q 版夸张来制造可爱。\n- **适度 Q 版（适用于次要角色、单镜头出现的普通路人）**：头身比约 1:2，体型圆润，面部略夸张，保持辨识度。\n- **高度 Q 版（适用于人群场景、象征性群像、情绪示意画面）**：高度概括化，头大体小，面部极简化；当一个画面需要同时呈现多人或象征\"人群\"时可使用，便于场景不显拥挤。\n\n**核心原则：** 场景、道具、建筑、食物等非人物元素，统一以真实世界比例呈现、整体用羊毛毡材质覆盖（如饺子就是饺子的形状，不做卡通化变形；餐厅就是正常大小的餐厅，不是微缩模型）；视觉感是「把现实世界用羊毛毡材料重新建造一遍」，而非制作玩偶舞台。角色的造型风格需与当前镜头的叙事内容和情感基调匹配，不强制全片统一同一风格。\n\n- **shot_list**（按叙事顺序排列的镜头列表）\n\n  - 每个镜头以「镜头1、镜头2、镜头3……」依次命名\n  - 每个镜头包含：时长、画面主体动作描述、场景氛围、运镜方式\n  - **画面与旁白强关联**：每个镜头的画面主体动作、构图焦点必须直接呼应该镜头计划的旁白内容——旁白说\"饺子出锅\"，画面就是饺子出锅的动作；旁白描述情绪，画面主体用表情/姿态传达同一情绪。禁止出现旁白与画面内容\"各说各话\"的情况（如旁白讲转折，画面还在展示上一个场景的静态氛围）。\n\n- **audio_layers**（跨镜头音频，通常只放 BGM）\n\n  - 视频内音效（SFX）由 Seedance 自动烘焙，不在 audio_layers 中单独定义\n\n**分镜拆分原则（shot 划分）：**\n\n- **标准时长：每个镜头控制在 10–15 秒**，这是后期配音剪辑的基本单元；不允许出现文本量过少（画面空洞）或文本量过多（配音塞不进去）的镜头。\n- **拆分依据三个维度，综合判断，不机械等分：**\n  1. **故事节奏**：情绪转折、场景切换、戏剧节点处自然断开，保持每个镜头内叙事弧完整。\n  2. **信息密度**：每个镜头承载一段完整的叙事内容（可以包含多个连续动作和情绪变化），不在同一个镜头内堆叠多个独立的、互不关联的信息点。\n  3. **文案量**：按正常阅读语速（约 5–6 字/秒）估算该镜头的旁白文案字数是否能在 10–15 秒内自然朗读完；文案字数过多则拆分，过少则合并相邻信息点。\n- **节奏意识优先于机械切分**：拆分边界由叙事张力和情绪节奏决定——高密度冲突/转折点可给更长时长和更近景别；轻盈氛围铺垫可快速推进；以视觉讲故事的逻辑做决策，不做均匀等分。\n\n**镜头内部画面拆分（shot 内分段）：**\n\n- 每个镜头（10–15 秒）内部需按文案节奏做**时间分段描述**，明确写出每段的时间区间、画面内容、运镜方式，而不是用一句话描述整个镜头。\n- **格式示例：**\n  - 0–4s：奶奶站在灶台前，双手轻轻揉搓面团，缓慢推镜至腰部景别；\n  - 4–10s：切近双手特写，面粉扬起，镜头微微下压；\n  - 10–14s：缓缓推向奶奶面部，捕捉专注而温柔的神情，静帧收势。\n- **分段依据**：每段对应一个动作节拍或情绪节拍，与旁白文案内容强关联；段与段之间可以是画内切（不同景别/角度的连续叙事）或情绪递进。\n- **密度要求**：整个镜头的内部分段不少于 2 段、不多于 4 段；避免一个分段撑满全程（信息单薄），也避免分段过碎（超出模型有效控制范围）。\n\n**羊毛毡风格的镜头设计要点：**\n\n- 构图简洁，主体突出，背景层次不超过 2-3 层\n- 镜头运动应自然流畅，可设计缓慢推进、平移、轻微跟随等运动，避免生硬跳切\n- 人物动作以柔和、连贯为基准，可有一定幅度的自然动作（如伸手、转身、走动），但保持毛毡玩偶的柔软质感；不追求\"微动\"卡顿效果\n- 关键叙事节点使用聚光灯构图，强化戏剧感\n- 场景切换时可用\"画面风格骤变\"代替转场（如从暖调餐厅切换到冷调数字空间）",
      "section": "storyboard_designer"
    },
    {
      "config": {},
      "content": "**元素图（key_elements）：**\n\n- 模型：Nano Banana Pro（TextToImage / ImageToImage）\n- 参考输入：用户本次提供的角色/场景参考图（如有）；未提供则完全依据故事板文字描述 + 内置羊毛毡风格基准生成\n- 输出设置：**16:9白底三视图**（正面+侧面+3/4背面，左到右排列），2K 分辨率，每个元素一张\n- 若用户已上传元素图，直接绑定，不重复生成\n\n**视频片段（每个 shot）：**\n\n- 模型：Seedance 2.0\n- 路径：MultiModalToVideo（优先）\n- 参考输入：本次生成的元素图（角色正面图 + 场景全景图组合）\n- 生成策略：**每次只生成一个镜头（镜头1、镜头2……依次推进），生成后暂停确认，再推进下一个**\n- 分辨率：720p（默认）\n- 时长：与故事板该 shot 设定时长对齐（范围 4s–15s）\n\n**BGM（可选）：**\n\n- 所有视频片段确认完成后，**询问用户是否需要 BGM**；用户确认需要后再生成\n- 模型：Suno 5 / Mureka 8（text_to_instrumental）\n- 时长：与视频总时长对齐\n\n**旁白（可选）：**\n\n- 所有视频片段确认完成后，**询问用户是否需要旁白配音**；用户确认需要后再生成\n- 模型：ElevenLabs v3 / Doubao（text to narration）\n- 脚本来源：故事板中各 shot 标注的【旁白文案参考】，逐段生成后绑定到对应 shot\n\n**音效（SFX）：**\n\n- 由 Seedance 2.0 在视频生成时自动烘焙，无需单独生成，不列入 audio_layers\n\n**注意：** 若生成路径涉及多个参考图，优先选取角色正面帧 + 场景全景帧作为输入组合。",
      "section": "media_generator"
    },
    {
      "config": {},
      "content": "## 羊毛毡风格提示词写法规范\n\n### 核心风格锚定词（每条提示词必须包含）\n\n所有图像与视频提示词开头必须固定注入以下风格基准描述，确保跨镜头、跨元素的风格一致性：\n\n> wool felt animation style, real-world scene and characters rendered entirely in wool felt material, visible fiber texture covering all surfaces, soft rounded forms with no sharp edges, smooth and fluid motion, natural movement, warm muted color palette — full-size felt world at realistic scale, NOT miniature, NOT diorama, NOT puppet, NOT toy figurine; characters have clearly defined facial features (eyes, nose, mouth fully visible and readable)\n\n### 元素图提示词（TextToImage / ImageToImage）\n\n**结构顺序：** 风格锚定词 → 主体描述 → 材质细节 → 色彩 → 构图/背景\n\n**写法要点：**\n\n- **主体描述：** 用\"felt \\[物体名\\]\"开头，根据故事板中该元素的风格分级选择对应描述词：\n  - 写实感可爱（主要角色）：natural proportions, clearly defined facial features (eyes, nose, mouth fully visible), soft round face, realistic body ratio，禁用 chibi、super deformed、big head small body，禁用 doll-like、puppet、toy figurine\n  - 适度Q版（次要角色）：slightly stylized proportions, rounded features, clear facial expression\n  - 高度Q版（人群/象征性群像）：chibi style, simplified but readable facial features, large head small body\n  - 场景/道具/食物：full-size felt world, true-to-shape felt \\[物体名\\]，不做卡通变形，还原实物造型，禁用 miniature scale、diorama、puppet stage；字体/文字类内容不适合羊毛毡风，提示词中避免要求渲染文字\n- **材质细节：** 必须出现以下至少两项：visible wool fibers, slightly uneven handmade surface, soft fabric sheen, felted texture\n- **色彩：** 使用暖哑色描述，如 warm terracotta, dusty rose, muted sage green, creamy off-white；避免高饱和纯色词（如 bright red, neon）\n- **构图：** 三视图元素图固定格式：three-view character sheet, front view / side view / three-quarter back view, left to right, white background, clean studio lighting\n- **光线：** 统一用 soft diffused lighting, no harsh shadows, warm ambient glow\n\n**示例（角色）：**\n\n> wool felt animation style, real-world character rendered in wool felt material, visible fiber texture on all surfaces, soft rounded forms with no sharp edges, smooth and fluid motion, natural movement, warm muted color palette — felt elderly woman, natural body proportions, chubby round face with clearly defined eyes, nose and mouth, wearing dusty rose apron over cream knitted sweater, short white hair, rosy cheeks, holding a felted dumpling tray, visible wool fibers, slightly uneven handmade surface, soft fabric sheen — three-view character sheet, front view / side view / three-quarter back view, left to right, white background, soft diffused lighting, no harsh shadows, NOT a puppet, NOT a doll, NOT a toy figurine, NOT miniature scale\n\n### 视频提示词（MultiModalToVideo / Seedance 2.0）\n\n**结构顺序：** 参考图绑定 → 风格锚定词 → 场景氛围 → **分段动作脚本（时间区间顺序排列）** → 音效提示\n\n**写法要点：**\n\n- **参考图绑定：** 每个角色图用占位符 &lt;&lt;&lt;image_1&gt;&gt;&gt;, &lt;&lt;&lt;image_2&gt;&gt;&gt; 等顺序绑定，在提示词首行注明对应关系，如：&lt;&lt;&lt;image_1&gt;&gt;&gt; is the felt character \\[角色名\\], &lt;&lt;&lt;image_2&gt;&gt;&gt; is the felt scene background\n- **分段动作脚本（核心）：** 对应故事板该镜头的内部分段，按时间顺序逐段写出动作、运镜、情绪变化，格式为 \\[0–4s\\] ..., \\[4–10s\\] ..., \\[10–14s\\] ...。每段描述需包含：主体动作 + 运镜方式。时间区间与故事板分段严格对齐，不得合并成一句笼统描述，也不得超出总时长。\n- **动作描述：** 羊毛毡角色动作应流畅自然，可使用有一定幅度的连贯动作词汇：walks smoothly, gently reaches out, turns around softly, nods with a warm smile, slowly leans forward；保持柔和节奏感，避免僵硬卡顿词如 jerky, stiff, stuttering motion；亦避免过度剧烈的动作如 swings arms wildly, jumps frantically\n- **运镜：** 鼓励自然流畅的镜头运动，如 smooth slow push in, gentle tracking shot, soft pan following the character, natural dolly movement；禁止 handheld shake, fast zoom, rapid cuts, jerky camera\n- **场景氛围：** 补充 warm soft light filling the scene, shallow depth of field, full-size felt world, immersive real-world scale（禁用 miniature scale diorama feel / puppet stage 等词）\n- **音效（SFX）：** 用 Seedance 的 &lt;...&gt; 标注自然音效，如 &lt;soft fabric rustling&gt;, &lt;gentle tap on wooden counter&gt;, &lt;quiet ambient kitchen hum&gt;；若该镜头有独立旁白音轨，**不在视频提示词中写台词内容**，只标注 &lt;no dialogue, narration on separate track&gt;\n- **固定反向约束（每条视频提示词末尾追加）：** no subtitles, no text overlay, no sharp edges, no realistic human skin, no CG glossy material, no puppet, no doll figurine, no miniature diorama, no toy stage\n\n**示例（视频镜头）：**\n\n> &lt;&lt;&lt;image_1&gt;&gt;&gt; is the felt elderly woman character, &lt;&lt;&lt;image_2&gt;&gt;&gt; is the felt dumpling restaurant scene background — wool felt animation style, real-world scene rendered entirely in wool felt material, smooth and fluid motion, natural movement, warm muted color palette — cozy full-size felt dumpling restaurant interior at realistic scale, warm amber light, steamy atmosphere —\\\n> \\[0–4s\\] the felt elderly woman stands at the counter, both hands gently lifting a tray of dumplings, camera holds at medium shot with a subtle slow push in;\\\n> \\[4–10s\\] she sets the tray down softly, slowly raises her head, eyes crinkling with a warm smile, camera continues pushing toward her face;\\\n> \\[10–14s\\] close-up on her expression, slight head tilt, soft ambient steam drifts across frame, camera locks off on her face as the shot settles —\\\n> &lt;soft clinking of ceramic plate&gt;, &lt;gentle kitchen ambient hum&gt; — no subtitles, no text overlay, no sharp edges, no realistic human skin, no CG glossy material, no puppet, no doll figurine, no miniature diorama, no toy stage\n\n### BGM / 旁白提示词\n\n- **BGM（text_to_instrumental）：** 描述情绪 + 乐器 + 节奏，如：warm and heartwarming instrumental, soft piano and light acoustic guitar, gentle slow tempo, cozy nostalgic mood, suitable for a handcraft animation short\n- **旁白（text to narration）：** 指定语速（slow and warm）和情感基调（gentle, sincere, slightly nostalgic）；脚本内容直接来源于故事板各 shot 的【旁白文案参考】，**原文不改动**",
      "section": "write_the_prompt"
    }
  ],
  "skill_description": "动画羊毛毡风格视频创作Skill，输入视频旁白即可生成高质量羊毛毡动画，使用Seedance 2.0",
  "skill_id": "9cc5247917724cfa9d0d3ff597ce98d8",
  "skill_name": "百万爆款羊毛毡动画Skill",
  "source": 2,
  "source_skill_id": null,
  "updated_at": "2026-05-15T10:42:29.981927+00:00",
  "user_id": null,
  "version": 2,
  "visible_to_all": false
}
```
