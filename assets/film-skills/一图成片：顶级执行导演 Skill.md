# 一图成片：顶级执行导演 Skill

## Skill 描述

本 Skill 是专为追求院线级视觉冲击力、极致美学表现力和情绪节奏控场而设计的闭环工作流。它深度融合了“视觉基因解构”、“高密度分镜成表”与“视听高潮提示词引擎”，旨在将用户上传的静态美学素材转化为目不暇接、调动情绪的专业短片。

## Skill JSON

```json
{
  "author": {
    "avatar": "https://cdn-ap.flova.tv/avatars/avatar_5b1c639b26ca4bbd93ce4eb0c755fa85_ff7401b7262c4fbb99ee4ea100db7b7e.jpg?auth_key=1781160265-0-0-94a15275a351e5daa52c92f252941832",
    "name": "渊静",
    "user_id": null
  },
  "cover_standard_url": {
    "compressed": "https://cdn-ap.flova.tv/skill_covers/skill_cover_f895090ae2dd41e5929137ac8fdc178e_compressed.webp?auth_key=1781160265-0-0-55ec20679ea02ac58628db51df19c42e",
    "large": "https://cdn-ap.flova.tv/skill_covers/skill_cover_f895090ae2dd41e5929137ac8fdc178e_large.webp?auth_key=1781160265-0-0-081b1dd6c963b9c99ef32f2eba3fe241",
    "medium": "https://cdn-ap.flova.tv/skill_covers/skill_cover_f895090ae2dd41e5929137ac8fdc178e_medium.webp?auth_key=1781160265-0-0-f633098330fdcc4af19c61719c144df4",
    "small": "https://cdn-ap.flova.tv/skill_covers/skill_cover_f895090ae2dd41e5929137ac8fdc178e_small.webp?auth_key=1781160265-0-0-fa6a477eceb658f3874efb246b86407e"
  },
  "created_at": "2026-04-29T07:26:10.765567+00:00",
  "description": "本 Skill 是专为追求院线级视觉冲击力、极致美学表现力和情绪节奏控场而设计的闭环工作流。它深度融合了“视觉基因解构”、“高密度分镜成表”与“视听高潮提示词引擎”，旨在将用户上传的静态美学素材转化为目不暇接、调动情绪的专业短片。",
  "enabled": 1,
  "extra_data": null,
  "group_id": "e158b99d989d49c7872957d4c73c308e",
  "is_draft": 0,
  "is_public": 1,
  "locale": "zh",
  "project_id": null,
  "skill_content": [
    {
      "config": {},
      "content": "**前置检查：** 必须存在用户上传图片，否则立即终止并提示用户上传参考图。\n\n**阶段序列（严格顺序执行，禁止跨越）：**\n1. **视觉基因解构**：分析上传图片，提取美学信号，输出结构化解构结果，供后续阶段使用。- multimodal_analyze_tool；并注册一个资产 - media_generator。\n2. **创意方向确认**：基于解构结果提供 3 个一句话剧情方向（如 CG 动画、TVC、趣味动画），编写 Final_Video_Spec.md（标题、类型、宽高比、时长、视觉风格、语言）, 等待用户选定方向后进入下一阶段。-planner\n3. **分镜规划** — **强制暂停点**：全局分镜成表 (Global Storyboard Table)：根据方案，每 15s 一个表的分镜脚本。每 3s 一个视觉重点，每 7s 一个高潮的 15s 动作流。 → planner。 \\* 强制暂停点：必须先输出详细的表格分镜（每表 1000 字，含 7-12 个镜头），并将分镜内容输入到reply_to_user的json中与用户确认分镜表信息是否满意，暂停并等待用户确认。\n4. 编写 Final_Video_Spec.md：标题、类型、比例、时长、视觉风格、模型偏好。→ text_editor。\n5. **分镜注册**：分镜注册故事板 (Storyboard Registration)：用户确认分镜满意后，严禁删减或更改分镜表格式与内容。将每个 15s 分镜表完整内容注册为一个故事板镜头（Shot）。- storyboard_designer\n   - 资产分配：将上传的原始资产分配给每个故事板，严禁注册/生成新资产或中间图。\n6. 素材绑定与提示词构建 (Prompt Engineering)：严格按【万能公式】生成视频提示词。锁定原图为唯一参考。→ write_the_prompt。\n7. **视频生成**：按 shot 顺序直接执行生成。- media_generator\n8. **时间线合成**：所有 shot 生成完毕后推送至时间线；开启视频轨音量；不生成独立音频素材。- video_assembler\n\n**依赖关系：** 2→1；3→2；4→3（需用户确认）；5→4；6→5。",
      "section": "planner"
    },
    {
      "config": {},
      "content": "**视觉基因解构规范：**\n1. **光影解构**：识别光源类型（Chiaroscuro 强对比 / 漫射柔光），提取主光方向、阴影密度与高光质感。\n2. **色彩解构**：提取主色、辅色、点缀色并标注 6:3:1 比例分配；记录色温倾向与饱和度特征。\n3. **材质与几何解构**：分析材质质感（金属、哑光丝绸、流体等）及画面主要几何走势与构图张力。\n4. **动态潜力分析**：评估物体间的物理遮挡关系、透视深度层次及潜在动势方向，为分镜设计提供运动参考。\n5. **输出格式**：结构化输出，包含 Subject_Structure、Color_Palette_Ratio、Lighting_Environment、Texture_Simulation 四个维度。\n6. **使用边界**：解构结果仅用于指导分镜设计和视频提示词撰写，禁止用作生成新图的视觉指令。",
      "section": "multimodal_analyze_tool"
    },
    {
      "config": {},
      "content": "\\*\\*分镜设计规范：\\*\\*不需要额外规划元素，以用户上传的图为全局生成参考。分镜中的对话、旁白、动作结果和场景顺序必须与生成的分镜表一致。仅允许技术性编辑:拆分镜头(≤15s)或添加镜头语言字段。不要虚构情节或改写台词。\n\n编剧与分镜师指令：\n1. 必须先和用户确认分镜表格：在注册 Storyboard 之前，必须输出高密度分镜表并获得许可。\n2. 分镜表设计规范（1000字/表）：\n   - 时长规划：每 15s 为一个独立表，表内包含 7 到 12 个专业分镜。\n   - 视听语言：精准使用术语（Dutch Angle, Push-in, Tracking, Whip-pan）。包含：镜头、景别、视角、运镜、内容、物理动效、音效、音乐。\n   - 情绪曲线：严格执行 3s 重点/7s 高潮。长镜头置于表中间。\n   - 连贯动效：动效连贯一气呵成。严禁黑场、白场、叠化、渐显渐隐。\n3. 分镜注册：用户确认后，将 15s 表内的所有镜头合并描述为一个 Shot 任务。确保不丢失任何分镜细节，且不触发新资产生成请求。\n   1. 内容规划：注册故事版的时候不要丢失之前生成的分镜表信息，把每个分镜表详细的内容都注册一为个故事板，不要删减分镜表不要更改分镜表格式。",
      "section": "storyboard_designer"
    },
    {
      "config": {},
      "content": "1. Seedance 2.0 全能参考：视频生成强制调用此模型，分辨率 720p。\n2. 资产锁定：仅参考用户上传的原图。\n3. 动效遵循：严格执行 3s 重点与 7s 高潮逻辑，确保画面动效不间断、不间歇。",
      "section": "media_generator"
    },
    {
      "config": {},
      "content": "优先级最高：所有 Prompt 必须用中文书写（配合英文工具名称+参数）。\n\n### 一、图片提示词生成（仅用于内部描述参考）\n严格按照 7 模块顺序拼接：核心主体、风格色彩、解构式抽象细节（纯中文）、英文物理与材质（含 negative space folds, visual rhythm breaks）、6:3:1 色彩分配、场景光影、引擎参数。\n\n### 二、视频提示词生成（Seedance 2.0 动力学）\n1. 单任务多镜头融合：将 15s 分镜表内的 7-12 个分镜描述合并为一个长视频 Prompt。\n2. 结构：摄像机 → 主体/表演 → 空间 → 视听。\n3. 转场逻辑：明确标注如 “\\[镜头1：极写\\]...\\[动势匹配转场\\]\\[镜头2：中景\\]...”。\n4. 视听标记：(...) 音乐氛围，<...> 精准音效（对应 3s/7s 点），{...} 台词。\n5. 负向约束：no subtitles, no text, no logo, no fading to black。",
      "section": "write_the_prompt"
    },
    {
      "config": {},
      "content": "1. **实时合成**：生成后立即推送到时间线。\n2. **音轨管理**：**开启视频轨音量（Video track volume: ON）**。严禁生成独立的音频素材。\n3. **无缝质检**：确保 15s 片段间物理动势完美衔接，全片视听节奏高度统一。",
      "section": "video_assembler"
    }
  ],
  "skill_description": "本 Skill 是专为追求院线级视觉冲击力、极致美学表现力和情绪节奏控场而设计的闭环工作流。它深度融合了“视觉基因解构”、“高密度分镜成表”与“视听高潮提示词引擎”，旨在将用户上传的静态美学素材转化为目不暇接、调动情绪的专业短片。",
  "skill_id": "6d5006c5366e40858926b441d35b2d84",
  "skill_name": "一图成片：顶级执行导演 Skill",
  "source": 2,
  "source_skill_id": null,
  "updated_at": "2026-05-11T13:08:49.259188+00:00",
  "user_id": null,
  "version": 5,
  "visible_to_all": false
}
```
