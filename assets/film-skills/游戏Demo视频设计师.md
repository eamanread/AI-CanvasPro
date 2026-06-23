# 游戏Demo视频设计师

## Skill 描述

以三段式结构（引导流/剧情流/战斗流，各 15 秒）为骨架，涵盖角色原画设计、游戏 UI 关键帧生成与分段视频合成，最终拼接输出完整游戏实机演示视频。

## Skill JSON

```json
{
  "author": {
    "avatar": "https://cdn-ap.flova.tv/avatars/avatar_de36e466123c4d7ab2e3087339ef2648_9034693c6e5545c4a8294d2a3e2eb94a.png?auth_key=1781160265-0-0-3f73237fc17f7694768493675db4fa28",
    "name": "境在丨米叔",
    "user_id": null
  },
  "cover_standard_url": {
    "compressed": "https://cdn-ap.flova.tv/skill_covers/skill_cover_6f23ea7ea74d42d78f20d5f9040a77f5_compressed.webp?auth_key=1781160265-0-0-2704ad40236e203fb9cb8bbdd224a64b",
    "large": "https://cdn-ap.flova.tv/skill_covers/skill_cover_6f23ea7ea74d42d78f20d5f9040a77f5_large.webp?auth_key=1781160265-0-0-cfe82e62cb594209d040c3e9bb39b521",
    "medium": "https://cdn-ap.flova.tv/skill_covers/skill_cover_6f23ea7ea74d42d78f20d5f9040a77f5_medium.webp?auth_key=1781160265-0-0-0eeb159943028b758646153fe25ea9c7",
    "small": "https://cdn-ap.flova.tv/skill_covers/skill_cover_6f23ea7ea74d42d78f20d5f9040a77f5_small.webp?auth_key=1781160265-0-0-5569646e01fd03e65af97053c2960eb1"
  },
  "created_at": "2026-05-11T10:00:09.772003+00:00",
  "description": "适用于制作游戏宣传 Demo 视频；以三段式结构（引导流/剧情流/战斗流，各 15 秒）为骨架，涵盖角色原画设计、游戏 UI 关键帧生成与分段视频合成，最终拼接输出完整游戏实机演示视频。",
  "enabled": 1,
  "extra_data": null,
  "group_id": "44a7306b3c6741e39aaacb96110a9232",
  "is_draft": 0,
  "is_public": 1,
  "locale": "zh",
  "project_id": null,
  "skill_content": [
    {
      "config": {},
      "content": "1、根据用户的需求来设定初步故事背景确定游戏的风格。撰写 Final_Video_Spec.md（标题、类型、画幅比、时长、视觉风格、语言）→ text_editor\n**背景与风格定调：** 接收用户输入的主题关键词，自动设定故事背景并确立全局游戏风格（如：写实、奇幻、赛博等）。\n\n2、生成故事板（关键元素、镜头列表、音轨层）→ storyboard_designer。\n**三段式剧本拆解：** 将演示内容自动划分为三段式（各 15 秒）结构化脚本：\n- Video A (15s)：系统交互与觉醒（包含登录/选人界面交互、场景切换、首场实机体验）。\n- Video B (15s)：叙事交互与追踪（包含 NPC 对话展示、世界观铺垫、目标点遭遇）。\n- Video C (15s)：核心战斗与结算（包含 8 倍速激战、大招演示、Boss 击败及 Victory UI 弹出）。\n\n3. 元素设计：\n- 高精角色资产生成：使用 GPT 生成主角/Boss 形象设计原画、随后使用 Nanobanan 转换成 3D 真实感人物形象卡/角色四视图（白底的左侧面部特写，右侧全身像的正面、背面、侧面）设计。\n- 一致性视觉生成：使用 GPTImage 2 生成全链路一致的游戏 UI 界面和游戏场景关键帧（包含：开始界面/选人界面/加载界面/泥土屋炕上视角/第三人称观察场景/进入 Boss 战）。\n\n4、视频分段生成：使用 Seedance 2.0 生成游戏的游玩 Demo 视频。详细编写每一个场景呈现的内容、模拟鼠标点击后高亮的 UI 界面反馈、以及高强度的 Boss 战斗动作。\n\n5、视频组装与输出：将三段 15s 视频进行逻辑拼接，统一输出高画质游戏 Demo 演示视频。\n\n**视频输出规范：** 设定最终渲染标准（分辨率、帧率、动作平滑度）。\n**资产规划：** GPT 角色设计 -> Nanobanan 3D 转换 -> GPTImage 环境生成 -> Seedance 视频生成的全链路。\n**何时暂停：** 不要一次性跑完所有步骤。在上述每一关键阶段后停下（如规格定稿后、故事板完成后、元素完成后、镜头视频生成后、音频生成后），与用户确认后再进入下一步。可用卡片或 reply_to_user 邀请用户审阅后再继续。",
      "section": "planner"
    },
    {
      "config": {},
      "content": "**3D 资产分析：** 利用 Nanobanan 深度分析 3D 形象卡的材质（如金属反射、皮肤质感、服饰纹理），为后续视频生成提供光影描述参数。\n**UI 像素锚定：** 分析 GPTImage 生成的带 HUD 截图，记录血条、技能栏、对话框的精确像素位置，将其设为“视频生成禁止形变区”。\n**色彩与光影控制：** 提取全局色彩倾向（LUT），确保三段视频从开始到结束色调、亮度保持高度一致，防止偏色。",
      "section": "multimodal_analyze_tool"
    },
    {
      "config": {},
      "content": "**Shot A (15s) \\[引导流\\]：**\n- 0-3s：封面图。模拟呼吸灯光效，执行 \\[Start\\] 按钮交互。\n- 3-10s：选人/技能展示。模拟鼠标悬停高亮，展示角色 3D 待机 Pose 或招牌动作。\n- 10-15s：第一人称 POV。场景切入，展示从特定视点（如苏醒/转场）过渡到广阔环境的 HDR 效果。\n\n**Shot B (15s) \\[剧情流\\]：**\n- 15-25s：NPC 交互。呼出对话 UI，文字逐字显示，背景保持环境动画。\n- 25-30s：场景追踪。镜头跟随角色快速移动至特定视觉地标，制造遭遇感。\n\n**Shot C (15s) \\[战斗流\\]：**\n- 30-40s：实机战斗。执行快节奏对抗。UI 血条与技能槽实时动态变化。\n- 40-45s：战斗结算。Boss 击败动作，弹出获胜 UI 及奖励结算特效。",
      "section": "storyboard_designer"
    },
    {
      "config": {},
      "content": "**角色设计 (Core Logic)：**\n- GPT 原画生成：调用 GPT 生成角色大师级 2D 设计图。\n- 角色四视图生成：使用 **ImageToImage**（推荐模型：**Nano Banana Pro(Gemini 3 Pro Image)**，分辨率 2K）基于 GPT 原画，生成白底背景的四视图。布局规则：左侧为面部特写图（用于捕捉面部细节、皮肤质感、妆容），右侧依次排列全身正面图、全身背面图、全身侧面图（用于捕捉形体比例与装备层级）。所有视图须保持角色造型、配色、材质与原画严格一致。\n- 随后使用 Nanobanan 转换成 3D 真实感人物形象卡/角色四视图，3D 转换：将四视图输入 Nanobanan 转换为 3D 真实感形象卡。\n\n**关键帧图片生成**：使用 GPTImage 2 生成全链路一致的游戏 UI 界面和游戏场景关键帧（包含：开始界面/选人界面/加载界面/泥土屋炕上视角/第三人称观察场景/进入 Boss 战）。\n- 生成 Video A 所需的 5 张关联图（封面、选人页、技能页、场景起手点）。\n- 生成 Video B/C 所需的关键图（对话 UI 图、行进场景、带 HUD 的战斗首尾帧、结算图）。\n\n**视频分段合成：** 使用 Seedance 2.0 生成游戏的游玩 Demo 视频。详细编写每一个场景呈现的内容、模拟鼠标点击后高亮的 UI 界面反馈、以及高强度的 Boss 战斗动作。",
      "section": "media_generator"
    },
    {
      "config": {},
      "content": "**交互段落指令：** 使用 Image_A1 至 A5 为节点。模拟真实的键鼠交互反馈（点击、高亮、光效）。保持 3D 模型在各界面的视觉一致性。\n**叙事对话指令：** 保持对话 UI 界面绝对清晰、不颤抖、不模糊。文字显示与角色状态同步。\n**动作战斗指令：** 使用战斗对峙图为首帧，获胜结算图为尾帧。\n**核心指令：** 强制锁定 UI 界面，禁止血条和技能图标产生任何位移、伪影或形变。 动作描述包含高频位移、粒子特效、震屏打击感。",
      "section": "write_the_prompt"
    },
    {
      "config": {},
      "content": "**全段合片：** 将三段视频缝合，同步匹配对应的音效（UI 音、环境音、打击音），输出完整的游戏实机演示 Demo。\n**音频：** 保持video layer和audio layer（背景音乐）均开启",
      "section": "video_assembler"
    }
  ],
  "skill_description": "以三段式结构（引导流/剧情流/战斗流，各 15 秒）为骨架，涵盖角色原画设计、游戏 UI 关键帧生成与分段视频合成，最终拼接输出完整游戏实机演示视频。",
  "skill_id": "62402b2ed71d43f6b6d5cfa86dabaade",
  "skill_name": "游戏Demo视频设计师",
  "source": 2,
  "source_skill_id": null,
  "updated_at": "2026-05-11T13:03:38.926728+00:00",
  "user_id": null,
  "version": 9,
  "visible_to_all": false
}
```
