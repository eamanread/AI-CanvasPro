# 执行编排契约（Execution Contract）· D1

> 把四表/分镜**编译**成宿主（幻映/ViMax）可直接消费的机器契约。\
> 大脑产契约，宿主驱动 生成→合成→导出。**"手"在宿主，不焊进 skill**（铁律②）。\
> 真机消费（跑通 1 shot + 暂停门真停）由宿主侧 parser + 用户验（付费按钮用户亲点）；\
> 本契约的**结构正确性**由 `audits/audit_execution.py` 纯结构审计保证（无需宿主）。

## 契约结构（JSON）

```jsonc
{
  "contract_version": "1.0",
  "final_video_spec": { "title": "...", "aspect": "16:9", "style": "...", "language": "zh" },
  "key_elements": [        // 来自四表 asset_id，去重
    { "id": "[Element_LinChen]", "category": "character" },   // character|scene|prop|faceswap|digital_human|pov
    { "id": "[Element_PrivateRoom_BanquetWarm]", "category": "scene" }
  ],
  "shots": [               // = 镜头组(生成单元)，非镜头！防成本退化
    { "id": "G5", "order": 1, "est_duration": 12,
      "refs": ["[Element_ZhaoShanhe]", "[Element_PrivateRoom_BanquetWarm]"],
      "final_prompt": "<该组 Seedance 成片提示词，引擎隐身，无绝对时码>",
      "start_frame_from": null, "reference_video_from": null }
  ],
  "audio_layers": [ { "audio_id": "[Audio_BGM_Banquet]", "type": "bgm", "range": "G5-G6" } ],
  "dependencies": [        // 调度 DAG（无环）
    { "from": "G5", "to": "assemble" }, { "from": "assemble", "to": "export" }
  ],
  "pause_gates": [         // 强制暂停门
    { "gate_id": "storyboard_review", "mandatory": true, "escalate": "stop_and_ask" }
  ],
  "degrade_chain": ["seedance-2.0", "seedance-2.0-fast"]   // 同族（引 registry）
}
```

## 不变量（审计逐项校验）

| FR | 不变量 | 失败即 |
|---|---|---|
| D1-FR-01 | **引用闭合**：每个 shot.refs ∈ key_elements（禁即兴造 ID） | 穿帮 |
| D1-FR-07 | **时长制**：每 shot est_duration ∈ [4,15]；order 连续 1..N；final_prompt 无绝对时码 | 成本/裂缝 |
| D1-FR-01 | **节点对账**：shots = 镜头组数（非镜头数，防把镜内分切误拆成生成单元 → 碎、贵、不连贯） | 成本退化 |
| D1-FR-03 | **暂停门**：含 faceswap/digital_human/pov → 必有 mandatory 的 `element_render` 门（出图后停等确认相似度） | 换脸翻车 |
| D1-FR-04 | **降级同族**：degrade_chain 全在 registry video.adapters（禁跨族静默替代） | 串味 |
| D1-FR-06 | **引擎隐身**：每个 final_prompt 零过程/引擎词（leak_scan） | 引擎泄漏 |
| D1-NFR | **可移植**：契约 JSON 不含宿主 API 字面量（宿主命名空间 / 渲染调用 / 冻结 exe 包，统称宿主 API） | 焊死宿主 |
| — | **DAG**：dependencies 无环 | 调度死锁 |

## 与宿主的边界

- 契约只**声明** schema 与暂停门点位；宿主 parser 读 JSON→建调度 DAG→`pause_gate` 真阻塞→按 `failure_policy` 重试/降级/上报。
- 付费生成由用户在 ViMax 亲点；`element_render` 门 `escalate=stop_and_ask` 处必停。
