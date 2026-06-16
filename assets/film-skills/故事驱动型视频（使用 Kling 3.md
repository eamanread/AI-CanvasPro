# 故事驱动型视频（使用 Kling 3.0 Omni）

## Skill 描述

适用于所有故事驱动型视频。使用 Nano Banana + Kling 3.0 Omni。在关键阶段暂停以供用户确认；实现人机协作的单镜头（one-shot）工作流。

## Skill JSON

```json
{
  "author": {
    "avatar": "https://cdn-ap.flova.tv/avatars/avatar_1234567890_b6a22c6f264d4437befa9f4174644feb.png?auth_key=1781159649-0-0-6efb9673c91358e54c4374996dcdf7fe",
    "name": "Flova",
    "user_id": null
  },
  "cover_standard_url": {
    "compressed": "https://cdn-ap.flova.tv/skill_covers/skill_cover_a8d12660f54942728cf3023b56175533_compressed.webp?auth_key=1781159944-0-0-3f7d261b62d3a83fdfb4f1744eef0d7c",
    "large": "https://cdn-ap.flova.tv/skill_covers/skill_cover_a8d12660f54942728cf3023b56175533_large.webp?auth_key=1781159944-0-0-f5d9fbe1c035b588078d9a380f319889",
    "medium": "https://cdn-ap.flova.tv/skill_covers/skill_cover_a8d12660f54942728cf3023b56175533_medium.webp?auth_key=1781159944-0-0-e84bf7791eba441f2aa19c26487302be",
    "small": "https://cdn-ap.flova.tv/skill_covers/skill_cover_a8d12660f54942728cf3023b56175533_small.webp?auth_key=1781159944-0-0-426506037cb48529e547cc7c5227ad9d"
  },
  "created_at": "2026-04-08T07:49:23.632815+00:00",
  "description": "专为具有完整故事线的视频而设计。主要亮点：由 Kling 3.0 Omni 提供一致性支持，在生成视频之前，为每个镜头生成一张关键帧图像，让你在开始生成前就能精确控制每个镜头的视觉效果。 - 分步人机协作 — 在每个关键阶段进行确认，全程保持掌控。",
  "enabled": 1,
  "extra_data": null,
  "group_id": "e5036d82aac149618052b3c69264be64",
  "is_draft": 0,
  "is_public": 1,
  "locale": "zh",
  "project_id": null,
  "skill_content": [
    {
      "config": {},
      "content": "**完整视频的阶段逻辑与依赖关系：**\n1. 编写 `Final_Video_Spec.md`（标题、类型、比例、时长、视觉风格、语言、模型偏好） → **text_editor**。\n2. 生成故事板（关键元素、镜头列表、音频层） → **storyboard_designer**。\n3. 为所有元素生成图像 → **media_generator**。\n4. 每个镜头生成一张关键帧图像；参考元素图像（第3步），对于后续镜头，参考之前类似的近似关键帧以保持连贯性 → **media_generator**。\n5. 为每个镜头生成最终视频；参考元素图像 + 该镜头的关键帧（第3、4步） → **media_generator**。\n6. 基于故事板生成所有音频层 → **media_generator**。\n7. 所有资源准备就绪后进行最终组装；然后引导用户导出 → **video_assembler**。\n\n**依赖关系：** 2→1； 3→2； 4→3； 5→3,4； 6→2； 7→3,4,5,6。\n\n**注意 — 用户提供或预先存在的媒体（主要影响第3-6步）：** 在进行生成以填补空白之前，通过 **media_generator** 将其绑定并分配到适当的故事板位置；避免重复生成用户已提供的内容。\n\n**何时暂停：** 不要一次性运行所有步骤。在上述每个关键阶段（例如：规范之后、故事板之后、元素图像之后、关键帧之后、镜头视频之后、音频之后）停止，与用户确认，然后再进行下一步。使用卡片或 reply_to_user 在继续之前邀请用户审查。",
      "section": "planner"
    },
    {
      "config": {},
      "content": "**如何设计关键元素**\n- 务必包含**关键主体**（角色、物体等）、**关键地点/场景**和**关键道具**（如有）。\n- **角色：** 如果一个角色在项目中具有多种状态或外观（例如不同的服装、年龄），请在描述中清晰地说明（例如：外观 1：…；外观 2：…）。包括角色的**声音/音色**，以便后续音频能够匹配。\n- **关键地点/场景：** 描述场景中重要物体（尤其是道具或发生主要动作/表演的区域）的**位置和朝向**。\n- **用户提供的素材：** 如果用户提供了参考媒体并将其指定为关键元素，则描述**必须与**该素材相匹配；不要与所展示或听到的内容相矛盾。\n\n**如何设计镜头**\n- **优先考虑带内部剪辑的长镜头**（例如每个镜头 10-15 秒）。在镜头*内部*设计剪切，而不是将其拆分为许多短镜头；剪辑频率应遵循故事节奏。每个镜头不要超过 15 秒（当前模型最大时长限制）。\n- **每个镜头的描述必须包括：**\n  - **场景：** 参考地点/布景（使用场景元素 ID，例如 `[Element_Office_Noir]`）。\n  - **故事内容：** 角色和关键物体的动作与动态；对话和表演。写出**确切台词**（口语对话或内心独白 / OS）。通过其元素 ID 引用角色。\n  - **镜头语言：** 景别（例如广角、中景、特写）、拍摄角度（例如低机位、高机位）、镜头运动（例如静止、平移、推拉）。\n- **当镜头有内部剪辑时：** 在场景/设置之后，按剪辑顺序排列故事内容和镜头语言。使用明确的时间和剪辑标记，例如：*“第一部分 (0–4s)：[场景]，[角色] 做 X 动作，特写。然后切至 (4–8s)：… 然后切至 (8–12s)：…”*\n\n**如何设计独立音频**\n- **背景音乐：** 至少设计一个全局背景音轨。如果视频较长（例如 3 分钟或以上）并且有明显的幕间或转折点，你可以规划一个以上的音乐片段（每个片段都有自己的 `audio_id` 和范围）。\n- **旁白：** 如果使用画外音或旁白来解释或推动故事发展，请在此处进行设计（类型设为 `narration`）。定义声音特征、语调和确切脚本；使用 `layout_instruction` 将其作用范围限定在相关的镜头上。",
      "section": "storyboard_designer"
    },
    {
      "config": {},
      "content": "**元素图像生成**\n- 使用 **TextToImage**。对于处于不同外观或年龄的同一角色，推荐使用 **ImageToImage**；后续的外观应参考之前生成的形象以保持一致性。\n- 推荐模型：**Nano Banana 2(Gemini 3.1 Flash Image)**，分辨率 **2K**。角色元素建议优先使用**三视图**（正面/侧面/背面）以支持跨镜头的连贯性。\n\n**关键帧图像生成（每个镜头）**\n- 使用 **ImageToImage**。推荐模型：**Nano Banana 2(Gemini 3.1 Flash Image)**，分辨率 **2K**。参考图像必须包括 (1) 该镜头对应的**相关元素图像**，以及 (2) 对于每个镜头，参考**同一场景中较早镜头**中最相似的关键帧（当批量生成时，批次中较晚的镜头参考较早的镜头）作为额外参考，以加强连贯性——例如角色在场景中的站位、他们如何面对彼此以及表情：这些是元素参考所无法定义的细节。\n\n**最终镜头视频生成**\n- 使用模型：**Kling 3.0 Omni**，分辨率 **1080p**。同时参考**元素图像**和该镜头的**关键帧图像**。",
      "section": "media_generator"
    },
    {
      "content": "**优先级最高、适用于所有prompt编写情况：当用户使用中文输入或是加载中文语言环境时，提示词prompt需要用中文书写。但是prompt中有关旁白/对话的内容要严格遵循Final_Video_Spec中的Output Language。**\n\n**图像生成的提示词 (TextToImage, ImageToImage)**\n**所有图像提示词的通用原则**\n- 提示词不仅仅是描述“图像里有什么”，更像是真实的电影导演和调色师在向团队下达指令。\n- 使用连贯的自然语言描述场景内容（主体 + 行为 + 环境等），并使用短语描述视觉美学（风格、颜色、光影、构图）。拒绝文学修饰：不要向 AI 解释角色的动机或内心状态（例如“好像他不在乎这张照片一样”）。不要描述画面外或不可见的元素。只描述物理上可见的内容。\n- 对于所有图像提示词（任何角色）：你必须在全球范围内将“电影级提示词的 6 大核心规则”应用于所有目标风格，以确保电影级质量。将提示词写成流畅、自然的英语描述，将这 6 条规则交织在一起。不要将其输出为带标签的部分：\n  - 专业风格术语：将专业的艺术或电影术语与风格术语结合使用以提高准确性。（例如，引入作者和特定的电影视觉锚点，使用 `Neo-Noir style, David Fincher Style, inspired by Se7en` 作为风格锚点，而不是泛泛地说明 `Neo-Noir` 风格）。\n  - 构图与镜头：明确说明电影构图（例如 `Over-the-shoulder shot`（过肩镜头）、`Dutch angle`（荷兰角））和景别（例如 `Close-up`（特写）、`Medium shot`（中景））。\n  - 光影：详细说明主光，并强烈强调“负光”以增强对比度和戏剧性（例如 `Strong chiaroscuro contrast`（强烈的明暗对比）、`dramatic interplay of light and shadow`（光影的戏剧性交织）或 `deep facial shadows emphasizing facial structure`（深邃的面部阴影突出脸部结构））。\n  - 调色：使用高端好莱坞调色来设定克制的色调（例如 `deep teal-cyan shadows dominating 90%, zero warm fill`（深青色阴影占据 90%，无暖光填充）或 `muted watercolor wash`（柔和的水彩晕染））。除非用户明确要求，否则永远不要使用红蓝霓虹冲突（例如禁止 `crimson bleed`，霓虹洋红 vs 青色）。将画面限制在一种主导色调中，约占画面 90%（例如深青色）——保持极度克制。\n  - 视觉渲染：描述内容的整体视觉质量和纹理（例如 `fine rendering quality`（细腻的渲染质量）、`rich and intricate details`（丰富而错综的细节）、`soft-focus effect with subtle Gaussian blur`（带轻微高斯模糊的柔焦效果））。\n  - 情绪与潜台词：描述角色的“潜台词”和微表情，将动作定格在戏剧性的瞬间（例如 `oppressive suffocation`（压抑的窒息感）、`no mercy`（无情）、`predatory stillness`（掠食者的静止））。拒绝生硬的摆拍。对于无生命物体，描述其状态（例如 `Destined aura`（宿命感）、`piercing gaze`（锐利的凝视）、`cold and detached atmosphere`（冷漠疏离的氛围））。\n  - 条件元素（仅在相关时包含）：\n    - 准确的画面文字：当相关时，如果场景中出现文字（例如屏幕上的文字），请将其自然地融入。你必须用引号包裹场景中要渲染的确切文字内容以示强调。例如：'A neon sign in the background reads \"DANGER\".'（背景中的霓虹灯牌写着“危险”。）\n\n**当目标角色是 `key_element`（关键元素）时**\n提供清晰、详细的视觉定义，使其在各镜头间保持一致。提示词结构围绕：\n- 主体与身份：明确说明元素是什么——角色、道具、场景或生物。对于角色，包括定义的身份特征（年龄、体格、种族（如指定）、显著特征、声音）。\n- 特征细节：详细描述元素的关键视觉特征。优先考虑必须在各镜头间保持一致的特征：\n  - 角色：面部特征（眼型、下颌线、发型/颜色）、妆容和造型（如相关）、服装和配饰（材质、合身度、颜色、状况）。\n  - 道具/物体：形状、材质、颜色、尺寸、状况（全新/风化/损坏）、独特的标记。\n  - 情绪/情感基调：描述定义场景的情感基调（例如紧张、忧郁、希望、宁静、不安、温暖、压抑、恐惧、怀旧、孤独、亲密）。\n\n**如果目标角色是 `start_frame`（起始帧）或 `end_frame`（结束帧）**\n你必须分析镜头的 `Description`（描述），仅提取并描述最开始（对于 `start_frame`）或最末尾（对于 `end_frame`）的静态场景。在脑海中模拟镜头将如何演变（主体运动 + 镜头移动 + 环境变化）。以此决定第一帧或最后一帧静止图像中必须出现什么，以便视频以连贯的动作开始/结束，而不是卡在动作中间。\n  - 起始帧（预期）：展示意图和运动前的线索（重心转移、视线方向、肢体预加载、未触发的效果）、变化前的基准环境以及相机的初始位置/取景。\n  - 结束帧（决断）：展示动作的直接结果（接触/撞击/结束姿势）、变化后的环境以及准备好进行下一次剪辑的相机最终位置。\n  - 检查清单（针对起始/结束帧提示词）：主体意图 → 运动方向 → 环境状态（前后） → 相机设置 → 道具/状态连贯性锚点。\n  - 迷你示例：起始帧，`The runner crouches at the starting line, hips low, front foot loaded, eyes forward; stadium lights steady; camera is low 3/4 front.`（赛跑者在起跑线蹲下，臀部低垂，前脚用力，目视前方；体育场灯光稳定；摄像机处于低机位 3/4 正面。）；结束帧，`The runner has just pushed off; rear foot leaving the ground, arms opening; first stripe of track slightly motion-blurred; camera begins a subtle push-in.`（赛跑者刚刚蹬地出发；后脚离开地面，双臂张开；跑道第一条纹路有轻微的运动模糊；摄像机开始缓慢推入。）\n\n**视频生成的提示词**\n对于基于关键帧的视频生成，提示词的主要目的是描述“变化”和“动态”。你应该避免重复描述起始/结束帧中已有的静态细节，而是专注于让场景鲜活起来。高质量的视频提示词必须描述场景在以下维度上的动态演变：\n- 基本提示词结构：Prompt = 主体 + 运动，背景 + 运动，相机 + 运动等。使用简单、直接的措辞和短句结构；模型会根据你的描述及其对图像的理解进行扩展。\n- 角色/物体动态：描述主体自身的动作，包括表情变化、动作以及任何相对于相机的自主朝向改变（例如 `a character turning from a profile view to face the camera directly`（一个角色从侧面转向正对镜头））。如果主体保持静止，你必须明确描述其静态姿势或状态（例如 `the character stands perfectly still, staring forward`（角色保持静止，目视前方））。\n  - 运动限定词：描述运动时，务必指定程度副词（例如 quickly（迅速地）、violently（剧烈地）、large amplitude（大幅度）、high frequency（高频））。\n  - 多个连续动作：模型对时间性的、多节拍的动作以及具有不同动作的多个主体反应强烈。你可以写：主体1 + 动作1 + 动作2，或者主体1 + 动作1，主体2 + 动作2 等。按顺序排列动作；模型将根据帧进行扩展和解读。\n- 镜头移动：摄像机运动（摄影）提示词：用自然语言描述所需的摄像机变化。支持的选项包括 orbit（环绕）、aerial（航拍）、zoom（变焦）、pan（平移）、track/follow（跟踪）、handheld（手持）和镜头剪辑。镜头语言是许多基于帧的视频模型的强项。当提示词包含镜头移动时，基本参数应为“非固定摄像机”（非固定镜头）。如果摄像机是静止的，你必须注明 'static camera'（静态摄像机）或 'fixed shot'（固定镜头）。\n- 手持微动与胶片质感（照片级真实感/真人视频默认设置）：除非故事板或规范明确要求锁定监视视角、运动控制精度、原始 CGI 或产品宣传片渲染、或非照片级真实感风格化动画，否则请编入**轻微的**有机不完美感，以对抗过分平滑的“AI 光泽”。**摄像机：** 例如 `very subtle handheld micro-shake`（非常轻微的手持微震）、`slight natural camera drift`（轻微自然的镜头漂移）、`minimal breathing movement`（最小幅度的呼吸感）——保持振幅小且连续，而不是晃动镜头。如果镜头是**静态摄像机/固定镜头**，则省略手持语言。**画面：** 例如 `fine 35mm film grain`（精细的 35mm 胶片颗粒）、`subtle photochemical grain`（微妙的光化学颗粒）、`light analog noise`（轻微的模拟噪点）——克制；除非风格指南有要求，否则避免大块的数字噪点、严重的静电或 VHS 伪影。\n- 对话：包含角色说的确切台词。如果镜头中没有对话，你必须明确说明 'no dialogue'（无对话）。\n- 音效 (SFX)：指定对动作至关重要的同步声音。例如，`the sound of a loud thunderclap`（一声响亮的雷鸣声）、`a phone ringing`（电话铃响）。如果不需要特定的音效，说明 'no sound effects'（无音效）。\n\n- 对于单个镜头内高度复杂或多阶段动作的特殊说明：你必须按顺序描述序列。你可以使用逻辑进程（用 First/Then/Finally 结构化提示词），或具体时间戳（使用 0-3 seconds/3-6 seconds/6-9 seconds），或“cut to”标记来表达过渡（shot A..., cut to shot B..., cut to shot C...）。\n  - 示例：`Shot1: <<<image_1>>> his hands carefully open a dusty wooden box, with the sound of a soft creak. <<<image_1>>> His expression is focused and curious. The camera is a fixed shot, and the background attic is static. Shot2: cut to a bright blue light emanates from the artifact inside, casting an ethereal glow on his face and creating long, shifting shadows in the room. <<<image_1>>> His expression changes from focused to shocked awe as the camera begins a slow zoom in on his face. Shot3: cut to <<<image_1>>> he looks up with determination, the blue light reflecting in his eyes, as he slightly turns his head to the left to look past the camera. (no dialogue, no music, no subtitles)`（镜头1：<<<image_1>>> 他的双手小心翼翼地打开一个积满灰尘的木箱，伴随着轻微的吱呀声。<<<image_1>>> 他的表情专注而好奇。摄像机是固定镜头，背景阁楼是静止的。镜头2：切至一道明亮的蓝光从里面的文物中发出，在他脸上投下空灵的光芒，并在房间里投射出长长的、不断移动的阴影。<<<image_1>>> 他的表情从专注转变为震惊和敬畏，摄像机开始缓慢推向他的脸。镜头3：切至 <<<image_1>>> 他坚定地抬起头，蓝光在他的眼中反射，他微微向左转头看向镜头外。（无对话，无音乐，无字幕））\n- 关于 `ImageToVideoByAudio` 的特殊说明：当使用音频驱动（口型同步/表演）模型时，提示词必须遵循上述维度，同时还要遵守以下独特结构：\n  - 你必须明确描述由音频驱动的角色状态（例如：说话、唱歌、边哭边说、说唱）。\n  - 最佳实践模板：摄像机运动 + 说话者的情绪 + 说话状态 + 具体身体动作 + （可选）背景事件。\n  - 示例：`The camera follows as a man turns to face the lens and walks forward while singing with an intoxicated, soulful expression. He first touches his collar with both hands, then spreads his arms wide and tilts his head back, appearing completely immersed. Light and shadow in the background pulse with the rhythm.`（摄像机跟随一名男子，他转身面对镜头并向前走，同时唱着歌，表情陶醉而深情。他先用双手触摸领口，然后双臂张开，头向后仰，显得完全沉浸其中。背景中的光影随节奏脉动。）\n\n**注意：** 你必须始终在提示词中包含以下负面约束，以确保后期制作的输出干净：\n- 如果故事板指示该镜头有单独的旁白音轨，请不要在视频提示词中写入旁白文字，以避免音频冲突。\n- 为防止模型添加不需要的背景配乐，你应该几乎总是包含 'no music'（无音乐）。\n- 字幕是在后期剪辑过程中添加的，所以你必须始终包含 'no subtitles'（无字幕）。",
      "section": "write_the_prompt"
    },
    {
      "config": {},
      "content": "按故事板和时间线顺序组装所有镜头、旁白音轨和背景音乐（BGM）；当剪辑准备好后，引导用户进行导出。",
      "section": "video_assembler"
    }
  ],
  "skill_description": "适用于所有故事驱动型视频。使用 Nano Banana + Kling 3.0 Omni。在关键阶段暂停以供用户确认；实现人机协作的单镜头（one-shot）工作流。",
  "skill_id": "2208fc71ec134d5eb5e07371ccea17bd",
  "skill_name": "故事驱动型视频（使用 Kling 3.0 Omni）",
  "source": 3,
  "source_skill_id": null,
  "updated_at": "2026-04-28T03:28:42.057582+00:00",
  "user_id": null,
  "version": 7,
  "visible_to_all": false
}
```
