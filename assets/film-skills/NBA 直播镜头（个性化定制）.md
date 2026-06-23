# NBA 直播镜头（个性化定制）

## Skill 描述

上传一张个人参考照片并提供一个直播名称，即可一键生成 15 秒真实的 NBA 电视直播风格的场边摄像机镜头。

## Skill JSON

```json
{
  "author": {
    "avatar": "https://cdn-ap.flova.tv/avatars/avatar_1234567890_b6a22c6f264d4437befa9f4174644feb.png?auth_key=1781159649-0-0-6efb9673c91358e54c4374996dcdf7fe",
    "name": "Flova",
    "user_id": null
  },
  "cover_standard_url": {
    "compressed": "https://cdn-ap.flova.tv/skill_covers/skill_cover_1a8ec827500e49cca4bf3b61c6bb8ad1_compressed.webp?auth_key=1781160265-0-0-8c13054b3bb3222cc1715b5f81aad715",
    "large": "https://cdn-ap.flova.tv/skill_covers/skill_cover_1a8ec827500e49cca4bf3b61c6bb8ad1_large.webp?auth_key=1781160265-0-0-74b1227e46eb5476b8c940bba39e2bb2",
    "medium": "https://cdn-ap.flova.tv/skill_covers/skill_cover_1a8ec827500e49cca4bf3b61c6bb8ad1_medium.webp?auth_key=1781160265-0-0-83c793e2e05bf92ff7bd15ed4d332a08",
    "small": "https://cdn-ap.flova.tv/skill_covers/skill_cover_1a8ec827500e49cca4bf3b61c6bb8ad1_small.webp?auth_key=1781160265-0-0-e5b413a93969e1f0e1caf86ffa207a07"
  },
  "created_at": "2026-05-12T03:44:50.229048+00:00",
  "description": "上传一张个人参考照片并提供一个直播名称，即可一键生成 15 秒真实的 NBA 电视直播风格的场边摄像机镜头。",
  "enabled": 1,
  "extra_data": null,
  "group_id": "0ea3fd66ef2c473692a8adf3c0704019",
  "is_draft": 0,
  "is_public": 1,
  "locale": "zh",
  "project_id": null,
  "skill_content": [
    {
      "config": {},
      "content": "**预检查（必须完成，否则请勿进行任何制作步骤）：**\n\n开始前，确认用户已提供以下两项内容：\n\n1. **个人参考照片**：用于保留面部特征的自拍或清晰头像。\n2. **直播名称**：将显示在直播名牌上的文字（例如：“Chris First - AI Creator”）。\n\n如果缺少任何一项，请立即告知用户并等待他们提供缺失信息。请勿跳过或使用默认值。\n\n**流程规划：**\n\n1. 根据用户上传的参考照片，生成一张真实的 NBA 直播静态截图 → **媒体生成** (GPT Image 2)\n   - 完成后暂停，展示截图，并等待用户确认角色相似度。\n2. 使用步骤 1 中的截图作为 start_frame，并使用用户原始参考照片作为 reference_image，生成 15 秒直播视频 → **媒体生成** (Seedance 2.0)\n3. 展示最终视频并提供确认或重新生成的选项。\n\n**依赖关系：** 2 → 1；（必须在继续前确认）。\n\n**暂停节点：** 步骤 1 完成后必须暂停。只有在用户对角色相似度满意后，才能进行视频生成。",
      "section": "planner"
    },
    {
      "config": {},
      "content": "**步骤 1 — 生成直播静态截图**\n- 工具：**ImageToImage**；模型：**GPT Image 2**；分辨率：**2K**。\n- 参考图像：用户上传的个人参考照片（绑定至角色元素）。\n- 生成后，注册 asset_id 并将图像绑定至镜头 1 的 start_frame 插槽。\n- 只有在用户确认对截图中的角色相似度满意后，方可进行步骤 2。\n\n**步骤 2 — 生成 15 秒场边直播视频**\n- 工具：**MultiModalToVideo**；模型：**Seedance 2.0**；分辨率：**720p**；时长：**15s**。\n- 参考输入：\n  1. **start_frame**：步骤 1 生成的直播截图（视觉起始帧参考）。\n  2. **reference_image**：用户上传的原始参考照片（身份保留参考）。",
      "section": "media_generator"
    },
    {
      "config": {},
      "content": "**全局规则：** 所有生成 prompt 以英文撰写；将用户提供的播报称谓直接替换模板中所有 \\[NAME\\] 占位符，不得使用默认值或虚构称谓。\n\n### 图像 Prompt（ImageToImage：GPT Image 2）\n\n参考图输入：<<<image_1>>> 绑定为用户本人参考图。\n\n> <<<image_1>>> — A screenshot from a live NBA game TV broadcast on ESPN. The camera cuts to the audience — the reference image person, sitting and smiling naturally, unaware they're on camera. The subject is sitting in courtside seats at the 76ers home arena in Philadelphia. **Hardlock: do not alter their facial structure; strictly preserve their likeness from the reference image.** Full ESPN broadcast overlay: static scorebug at the bottom showing Knicks vs 76ers Eastern Conference Semifinals Game 3, Knicks lead the series 2-0; ESPN network logo watermark; 16:9 aspect ratio. Above the scorebug, a clean broadcast name graphic reads: **\"\\[NAME\\]\"**, styled like a real broadcast identifier. The image looks exactly like a real TV screenshot — broadcast color grading, slight compression artifacts, interlacing grain. All on-screen graphics are completely static, no animation.\n\n### 视频 Prompt（MultiModalToVideo + Seedance 2.0）\n\n参考图输入：<<<image_1>>> 绑定步骤 1 生成的转播截图（start_frame）；<<<image_2>>> 绑定用户原始参考图（identity reference）。\n\n> <<<image_1>>> <<<image_2>>> — It's a realistic live NBA broadcast shot of the subject sitting courtside at a Knicks vs 76ers Eastern Conference Semifinals Game 3 in Philadelphia at the 76ers home arena. The shot feels like a real TV cutaway during the game when the broadcast camera finds a notable guest in the crowd. Preserve the subject's identity and likeness from the reference images throughout the entire clip.\n>\n> The subject is seated courtside, smiling naturally and not over-performing for the camera. Not locked into eye contact with the lens — he occasionally glances toward the court, then toward the camera, then back toward the court.\n>\n> One continuous take. No cuts. No angle changes.\n>\n> Action sequence: He smiles casually in his seat as the camera lands on him, looking around naturally, not paying attention to the camera. He then gives a relaxed, natural wave toward the camera — crowd cheers. He looks up at the Jumbotron above him, then back to camera. He cheers briefly with visible excitement reacting to the playoff atmosphere, then turns to talk to his friend to the left and laughs — we don't hear him speak. He finishes by clapping naturally while smiling. All movement is subtle, believable, and human. No exaggerated acting. No direct talking to camera.\n>\n> Broadcast style: real live sports broadcast look, telephoto broadcast camera feel, natural arena lighting, slight broadcast compression, slight interlacing / TV grain, authentic crowd movement in background, realistic courtside framing. Subject remains seated courtside for the full 15 seconds.\n>\n> On-screen graphics: static bottom scorebug showing Knicks vs 76ers Eastern Conference Semifinals playoff layout — completely unchanged for the entire 15 seconds, no animation, no score updates, Knicks lead series 2-0. Above the scorebug, broadcast name graphic reads: **\"\\[NAME\\]\"** — styled like a real broadcast identifier, present for the full duration.\n>\n> {Two male NBA broadcast commentators, casual and warm tone: \"\\[NAME\\] is here tonight in Philadelphia, taking in this massive playoff matchup. You can see he's enjoying himself here courtside for Game 3. Great atmosphere in the building, and \\[NAME\\] getting a lot of love from the crowd.\"} <natural arena crowd noise and ambient arena sound throughout>\n>\n> no music, no subtitles, no scene cuts, no angle changes, no scorebug animation or updates, no exaggerated gestures, no constant direct eye contact with camera, no talking to camera",
      "section": "write_the_prompt"
    }
  ],
  "skill_description": "上传一张个人参考照片并提供一个直播名称，即可一键生成 15 秒真实的 NBA 电视直播风格的场边摄像机镜头。",
  "skill_id": "58fd54890b8547a2a9e13b64b0c0373b",
  "skill_name": "NBA 直播镜头（个性化定制）",
  "source": 3,
  "source_skill_id": null,
  "updated_at": "2026-05-12T03:56:08.240967+00:00",
  "user_id": null,
  "version": 2,
  "visible_to_all": false
}
```
