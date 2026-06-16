"""Unit tests for the pure skills index (P1-M3 / S1). No ViMax / network
deps - exercises roster building, section extraction, bigram scoring and
top-k selection. The real 49-file pass is env-gated (HY_VIMAX_SKILLS_DIR)
mirroring the QMAI影视skills test precedent."""
import os
import tempfile
import unittest
from pathlib import Path

import skills_index as si

THREE_PART = """# 商品宣传短片

## Skill 描述

把商品拍成有质感的广告短片。

## Skill JSON

```json
{
  "skill_name": "商品宣传短片",
  "skill_description": "把商品拍成有质感的广告短片，强调质感与卖点。",
  "author": {"avatar": "https://cdn.example.com/x.png?auth_key=SECRET"},
  "cover_standard_url": "https://cdn.example.com/cover.png?auth_key=SECRET",
  "skill_content": [
    {"section": "planner", "content": "PLANNER: 规划三个场景，突出产品卖点。"},
    {"section": "storyboard_designer", "content": "STORYBOARD: 特写产品质感，运镜稳重。"},
    {"section": "media_generator", "content": "MEDIA: nano-banana 出图。"}
  ]
}
```
"""

PROSE_ONLY = """# 整体场景群像卡片元提示词

这是一段没有 Skill JSON 的纯散文方法论，描述群像构图的元提示词写法。
"""


def _write(d, name, text):
    p = Path(d) / name
    p.write_text(text, encoding="utf-8")
    return p


class CanonicalNameTest(unittest.TestCase):
    def test_h1_is_canonical_name(self):
        self.assertEqual(si.canonical_name(THREE_PART), "商品宣传短片")

    def test_prose_h1(self):
        self.assertEqual(si.canonical_name(PROSE_ONLY), "整体场景群像卡片元提示词")


class SectionExtractionTest(unittest.TestCase):
    def test_core_sections_only_planner_and_storyboard(self):
        skill = si.parse_skill(THREE_PART)
        self.assertEqual(skill["name"], "商品宣传短片")
        self.assertIn("PLANNER:", skill["core"])
        self.assertIn("STORYBOARD:", skill["core"])
        self.assertNotIn("MEDIA:", skill["core"], "only planner+storyboard_designer are core")

    def test_metadata_never_leaks(self):
        skill = si.parse_skill(THREE_PART)
        self.assertNotIn("auth_key", skill["core"])
        self.assertNotIn("cover_standard_url", skill["core"])
        self.assertNotIn("SECRET", skill["core"])

    def test_prose_file_core_is_body_minus_h1(self):
        skill = si.parse_skill(PROSE_ONLY)
        self.assertNotIn("# 整体场景群像", skill["core"])
        self.assertIn("纯散文方法论", skill["core"])

    def test_section_char_cap(self):
        big = THREE_PART.replace("PLANNER: 规划三个场景，突出产品卖点。", "X" * 9000)
        skill = si.parse_skill(big, section_cap=4000)
        self.assertLessEqual(len(skill["core"]), 4000 + 4000 + 50, "each core section capped ~4k")


class ScoringSelectionTest(unittest.TestCase):
    def _roster(self):
        return [
            {"name": "商品宣传短片", "description": "把商品拍成有质感的广告短片，强调卖点。", "core": "c1"},
            {"name": "旅拍大师", "description": "唯美旅行风景视频，自然光与航拍。", "core": "c2"},
            {"name": "美食特写", "description": "食物的诱人特写镜头，蒸汽与油光。", "core": "c3"},
        ]

    def test_query_picks_relevant_skill_first(self):
        out = si.select_skills("帮我把这款登山杖做成广告短片，突出卖点", self._roster(), k=2)
        self.assertEqual(out[0]["name"], "商品宣传短片")

    def test_top_k_limit(self):
        out = si.select_skills("广告", self._roster(), k=2)
        self.assertLessEqual(len(out), 2)

    def test_min_score_drops_irrelevant(self):
        out = si.select_skills("量子物理讲座录屏", self._roster(), k=3, min_score=0.05)
        self.assertEqual(out, [], "nothing relevant -> empty (宁缺毋滥)")

    def test_injection_respects_total_budget(self):
        roster = [{"name": f"s{i}", "description": "d", "core": "Y" * 8000} for i in range(5)]
        selected = [dict(r, _score=1.0) for r in roster[:3]]
        text = si.build_injection(selected, total_budget=10000)
        self.assertLessEqual(len(text), 10000)


class ResolveNamedRefsTest(unittest.TestCase):
    """P3-M16 / S2: 《》点名命中 + 歧义澄清."""

    def _roster(self, *names):
        return [{"name": n, "description": "", "core": ""} for n in names]

    def test_exact_name_is_a_definitive_hit(self):
        roster = self._roster("广告短片", "剧情短片", "美食特写")
        out = si.resolve_named_skill_refs(["广告短片"], roster)
        self.assertEqual([s["name"] for s in out["resolved"]], ["广告短片"])
        self.assertEqual(out["ambiguous"], [])
        self.assertEqual(out["unmatched"], [])

    def test_exact_match_beats_substring_ambiguity(self):
        # "广告短片" is a substring of "广告短片创作", but the exact name wins
        # and is NOT flagged ambiguous.
        roster = self._roster("广告短片", "广告短片创作指南")
        out = si.resolve_named_skill_refs(["广告短片"], roster)
        self.assertEqual([s["name"] for s in out["resolved"]], ["广告短片"])
        self.assertEqual(out["ambiguous"], [])

    def test_unique_substring_resolves(self):
        roster = self._roster("广告短片创作", "美食特写")
        out = si.resolve_named_skill_refs(["广告"], roster)
        self.assertEqual([s["name"] for s in out["resolved"]], ["广告短片创作"])

    def test_ambiguous_ref_is_flagged_not_picked(self):
        roster = self._roster("广告短片", "剧情短片")
        out = si.resolve_named_skill_refs(["短片"], roster)
        self.assertEqual(out["resolved"], [])
        self.assertEqual(len(out["ambiguous"]), 1)
        self.assertEqual(out["ambiguous"][0]["ref"], "短片")
        self.assertEqual(sorted(out["ambiguous"][0]["candidates"]), ["剧情短片", "广告短片"])

    def test_unmatched_ref_reported(self):
        roster = self._roster("广告短片")
        out = si.resolve_named_skill_refs(["根本不存在的拍法"], roster)
        self.assertEqual(out["resolved"], [])
        self.assertEqual(out["unmatched"], ["根本不存在的拍法"])

    def test_short_roster_name_not_spuriously_resolved_inside_unrelated_ref(self):
        # 特写 (2 chars) appears inside 《产品特写广告》 but must NOT silently
        # force-resolve - the user asked for something else. Reverse-substring
        # is gated on name length, so this is unmatched, not a wrong hit.
        roster = self._roster("特写", "广告短片")
        out = si.resolve_named_skill_refs(["产品特写广告"], roster)
        self.assertNotIn("特写", [s["name"] for s in out["resolved"]])
        # an EXACT 《特写》 still resolves definitively
        exact = si.resolve_named_skill_refs(["特写"], roster)
        self.assertEqual([s["name"] for s in exact["resolved"]], ["特写"])

    def test_dedup_and_whitespace_case_normalized(self):
        roster = self._roster("广告短片", "美食特写")
        # two refs hitting the same skill (exact + substring) -> resolved once;
        # whitespace in the ref is normalized.
        out = si.resolve_named_skill_refs(["  广告短片 ", "广告"], roster)
        self.assertEqual([s["name"] for s in out["resolved"]], ["广告短片"])
        # case-insensitive (en)
        out2 = si.resolve_named_skill_refs(["mv"], self._roster("MV 音乐短片", "广告短片"))
        self.assertEqual([s["name"] for s in out2["resolved"]], ["MV 音乐短片"])


@unittest.skipUnless(os.environ.get("HY_VIMAX_SKILLS_DIR"), "set HY_VIMAX_SKILLS_DIR to run the real 49-file pass")
class RealSkillsTest(unittest.TestCase):
    def test_roster_loads_all_49(self):
        roster = si.load_roster(os.environ["HY_VIMAX_SKILLS_DIR"])
        self.assertEqual(len(roster), 49, "all 49 skills loaded")
        for s in roster:
            self.assertTrue(s["name"], f"skill {s['path']} has no canonical name")
            self.assertTrue(s["core"].strip(), f"skill {s['name']} has empty core")
            self.assertNotIn("auth_key", s["core"], f"{s['name']} leaked metadata")


if __name__ == "__main__":
    unittest.main()
