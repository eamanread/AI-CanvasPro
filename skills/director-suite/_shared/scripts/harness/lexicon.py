"""集中式禁词表（成片绝不可出现的过程/引擎/执行/成本词）。

铁律①引擎隐身的词源。各方向往 BY_DIRECTION 注册自己的差集，不各写一份。
"""

# 引擎术语（Polanyi 默会方法论等，绝不进成片）
ENGINE_TERMS = ["Polanyi", "默会", "格式塔", "寓居", "方法论", "支柱编号", "tacit"]

# 过程/审计产物词
PROCESS_TERMS = ["自检确认", "审计✓", "Drift", "偏移量", "基线档案", "tolerance",
                 "回归门", "Σ镜时长", "引擎隐身✓"]

# 执行/编排词
EXEC_TERMS = ["pause_gate", "DAG", "degrade_chain", "leak_scan", "node_id"]

# 成本词
COST_TERMS = ["gen_cost", "省积分", "降级到Fast", "1.0×"]

# 各方向注册的差集（key=方向ID）
BY_DIRECTION = {
    "D5": ["审计报告", "PASS", "FAIL"],
    "D9": ["expected_features", "red_line", "红线", "hit_rate", "命中率", "detector",
           "pass_rule", "NO-GO", "评测✓"],
    "D3": ["capability_keys", "duration_window", "fallback", "降级链", "适配矩阵", "capabilities"],
    "D1": ["contract_version", "key_elements", "est_duration", "element_render", "stop_and_ask", "failure_policy"],
    "D2": ["clip_skeleton", "source_probe", "拉片", "复刻", "时间码", "source_proper_nouns"],
    "D4": ["schematic", "箭头", "机位图标", "PUSH IN", "轨迹示意图"],
    "D6": ["audio_id", "duck_under_voice_db", "crossfade", "embedded_track_policy", "mute_bgm", "装配报告"],
    "D8": ["视觉基因", "解构", "Color_Palette", "HSL", "基因卡"],
    "D11": ["gen_cost", "Σgen_cost", "fill_ratio", "降级到Fast", "省成本", "省钱"],
    "D12": ["banned_trigger", "保真✓", "anchor_missing", "作者锚缺漏", "禁用触发词"],
    "D10": ["frame_", "node_id", "变身进度", "分支", "branch", "跳转", "可达终局"],
    # D8/D4/... 落地各自方向时在此追加（见各 DEV 文档 lexicon_terms）
}


def all_terms(extra_terms=None) -> list:
    terms = ENGINE_TERMS + PROCESS_TERMS + EXEC_TERMS + COST_TERMS
    if extra_terms:
        terms = terms + list(extra_terms)
    return terms
