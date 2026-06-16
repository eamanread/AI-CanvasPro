"""Tests for the ViMax config + 拍法库 provider (C5.2: the external venv runner
bridge was retired - this covers the surviving credential resolution + skills
roster/usage that the broker + native orchestrator depend on)."""
import json
import os
import tempfile
import unittest

from services.vimax_bridge_service import VimaxBridgeService


def _svc(user_dir):
    return VimaxBridgeService(user_dir_getter=lambda: user_dir)


SKILL_MD = """# 商品宣传短片

## Skill 描述

把商品拍成有质感的广告短片。

## Skill JSON

```json
{"skill_name":"商品宣传短片","skill_description":"把商品拍成有质感的广告短片。","author":{"avatar":"https://x/a.png?auth_key=SECRET"},"skill_content":[{"section":"planner","content":"P"}]}
```
"""


def _user_with_skill():
    user = tempfile.mkdtemp()
    os.makedirs(os.path.join(user, "skills"), exist_ok=True)
    with open(os.path.join(user, "skills", "商品宣传短片.md"), "w", encoding="utf-8") as f:
        f.write(SKILL_MD)
    return user


class CredentialsTest(unittest.TestCase):
    def test_default_credentials_reads_grsai_from_config(self):
        user = tempfile.mkdtemp()
        cfg = {"modelRegistry": {"text": [
            {"baseUrl": "https://grsai.dakka.com.cn/v1/chat/completions", "apiKey": "k-123", "modelId": "gemini-3.1-pro"}]}}
        with open(os.path.join(user, "config.json"), "w", encoding="utf-8") as f:
            json.dump(cfg, f)
        creds = _svc(user)._default_credentials()
        self.assertEqual(creds["apiKey"], "k-123")
        self.assertEqual(creds["baseUrl"], "https://grsai.dakka.com.cn/v1")
        self.assertEqual(creds["chatModel"], "gemini-3.1-pro")

    def test_default_credentials_empty_when_unconfigured(self):
        self.assertEqual(_svc(tempfile.mkdtemp())._default_credentials(), {})

    def test_default_skills_dir(self):
        user = os.path.join("x", "y")
        self.assertEqual(_svc(user)._default_skills_dir(), os.path.join(user, "skills"))


class SkillsAndUsageTest(unittest.TestCase):
    def test_skills_lists_roster_with_clean_summary(self):
        out = _svc(_user_with_skill()).skills()
        self.assertTrue(out["success"])
        self.assertEqual(len(out["skills"]), 1)
        s = out["skills"][0]
        self.assertEqual(s["name"], "商品宣传短片")
        self.assertIn("广告短片", s["summary"])
        self.assertNotIn("auth_key", s["summary"], "summary never leaks json metadata")

    def test_skills_empty_when_dir_missing(self):
        out = _svc(tempfile.mkdtemp()).skills()
        self.assertTrue(out["success"])
        self.assertEqual(out["skills"], [])

    def test_record_skill_usage_increments_and_persists(self):
        svc = _svc(_user_with_skill())
        svc._record_skill_usage(["商品宣传短片"], 1000.0)
        svc._record_skill_usage(["商品宣传短片", "电影布光大师"], 2000.0)
        usage = svc._read_usage()
        self.assertEqual(usage["商品宣传短片"]["uses"], 2)
        self.assertEqual(usage["商品宣传短片"]["lastUsed"], 2000.0)
        self.assertEqual(usage["电影布光大师"]["uses"], 1)
        out = svc.skills()
        self.assertEqual(out["skills"][0]["uses"], 2)


if __name__ == "__main__":
    unittest.main()
