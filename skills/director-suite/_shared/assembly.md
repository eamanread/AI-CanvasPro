# 音频层 + 时间线合成契约（Assembly）· D6

> 给宿主合成器/后期的音频与装配规范。审计见 `audits/audit_audio_assembly.py`。\
> 铁律：音轨元数据/装配报告/混音参数**只在过程跑，绝不进成片镜头卡**（引擎隐身）。

## audio_layers（音频层工件）

每条音轨五字段：

```
audio_id : [Audio_<名>_<NN>]
type     : narration | bgm | sfx     （三型，越界=废）
range    : 覆盖的组/镜区间，如 G5-G6
source_ref : narration 必引角色表 [Voice_*]；bgm→music 模型；sfx→音效源
layout   : sync | underscore | spot  （对齐方式）
```

## 混音 dB 阶梯（mix_ladder）

| 参数 | 值 | 含义 |
|---|---|---|
| `duck_under_voice_db` | 8–12 | 对话段 BGM 低于人声 8–12dB（sidechain ducking） |
| `climax_boost_db` | 3–5 | 情绪高潮段 BGM 抬升 3–5dB |
| `crossfade_s` | 0.5 | 相邻 BGM 边界交叉淡化 0.5s（硬切例外须动机） |

## 内嵌轨静音（每镜头组一条 embedded_track_policy）

- `mute_bgm` 默认 **true**（BGM 走 audio_layer 后期混，不用生成内嵌轨）。
- `mute_narration` 默认 true（有独立旁白轨时）；`keep_lipsync=true` 镜与独立 narration 轨区间不冲突。
- 对应镜的成片提示词仍含 `no music`（提示词层 + 装配层双保险）。

## 装配前必过链

首尾帧承接断点=0 · 跳轴 100% 有过渡镜 · 时间线无悬空轨 · narration 时长偏差 ≤±1s。

## 留白不变式（NFR）

恐怖/爆发/悲伤段 BGM 允许 mute/低密度，**不铺满**（静默常比音效更响）。
