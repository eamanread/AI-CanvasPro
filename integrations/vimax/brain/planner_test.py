"""Pure tests for the native brain (Phase A). No network - a fake chat client
captures messages / returns canned replies. The real LLM calls are
integration-verified live (golden对账 in A3)."""
import os
import tempfile
import unittest

from brain import planner
from brain.chat_client import extract_json


class FakeClient:
    def __init__(self, reply):
        self.reply = reply
        self.calls = []

    def chat(self, messages, **kw):
        self.calls.append(messages)
        return self.reply


class QueueClient:
    """Returns canned replies in order - one per chat() call."""
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []

    def chat(self, messages, **kw):
        self.calls.append(messages)
        return self.replies.pop(0) if self.replies else "{}"


class KeyedClient:
    """Thread-safe, CONTENT-keyed fake (not order-dependent) - required for the
    parallel-decompose test since ThreadPoolExecutor calls chat() out of order.
    Picks a reply by matching a substring in the prompt."""
    def __init__(self, default="{}", rules=None):
        import threading
        self.default = default
        self.rules = rules or []  # list of (substr, reply)
        self.n = 0
        self._lock = threading.Lock()

    def chat(self, messages, **kw):
        text = " ".join(str(m.get("content", "")) for m in messages)
        with self._lock:
            self.n += 1
        for sub, reply in self.rules:
            if sub in text:
                return reply
        return self.default


class ExtractJsonTest(unittest.TestCase):
    def test_clean_object(self):
        self.assertEqual(extract_json('{"a": 1}'), {"a": 1})

    def test_fenced(self):
        self.assertEqual(extract_json('```json\n{"a": [1,2]}\n```'), {"a": [1, 2]})

    def test_prose_wrapped(self):
        self.assertEqual(extract_json('Sure! {"x": "y"} hope that helps'), {"x": "y"})

    def test_garbage_is_none(self):
        self.assertIsNone(extract_json("no json here"))
        self.assertIsNone(extract_json(""))
        self.assertIsNone(extract_json(None))

    def test_trailing_prose_with_braces_does_not_over_capture(self):
        # The dangerous case: valid JSON followed by prose containing a brace.
        # raw_decode must stop at the end of the first value, not swallow {0..n}.
        out = extract_json('{"characters": [{"idx": 0}]}  Note: idx maps {0..n}.')
        self.assertEqual(out, {"characters": [{"idx": 0}]})

    def test_two_blocks_returns_first(self):
        self.assertEqual(extract_json('{"a": 1} {"b": 2}'), {"a": 1})


class NormalizeCharacterTest(unittest.TestCase):
    def test_snake_to_camel_mirror(self):
        out = planner.normalize_character(
            {"idx": 2, "identifier_in_scene": "向导", "is_visible": True,
             "static_features": "硬汉", "dynamic_features": "登山装"}, 0)
        self.assertEqual(out, {"idx": 2, "identifierInScene": "向导", "isVisible": True,
                               "staticFeatures": "硬汉", "dynamicFeatures": "登山装"})

    def test_idx_fallback_and_bool_coercion_and_camel_input(self):
        out = planner.normalize_character(
            {"identifierInScene": "X", "isVisible": "no", "staticFeatures": "a"}, 5)
        self.assertEqual(out["idx"], 5, "missing idx -> fallback position")
        self.assertFalse(out["isVisible"], "string 'no' coerced to False")
        self.assertEqual(out["dynamicFeatures"], "", "missing field -> empty string")

    def test_non_dict_is_safe(self):
        out = planner.normalize_character("garbage", 3)
        self.assertEqual(out["idx"], 3)
        self.assertEqual(out["identifierInScene"], "")

    def test_paraphrased_keys_tolerated(self):
        # LLM reworded the keys; safety-net aliases must still capture them.
        out = planner.normalize_character(
            {"name": "Barista", "visible": True, "appearance": "tall", "outfit": "apron"}, 0)
        self.assertEqual(out["identifierInScene"], "Barista")
        self.assertEqual(out["staticFeatures"], "tall")
        self.assertEqual(out["dynamicFeatures"], "apron")


class PlannerFlowTest(unittest.TestCase):
    def test_develop_story_builds_system_plus_human_with_idea(self):
        client = FakeClient("  A story.  ")
        story = planner.develop_story(client, "雨夜告别", "3镜短片")
        self.assertEqual(story, "A story.", "trimmed plain-text story")
        msgs = client.calls[0]
        self.assertEqual(msgs[0]["role"], "system")
        self.assertIn("雨夜告别", msgs[1]["content"])
        self.assertIn("3镜短片", msgs[1]["content"])

    def test_write_script_parses_scene_list(self):
        client = FakeClient('{"script": ["scene 1 text", "scene 2 text", "  "]}')
        scenes = planner.write_script(client, "story", "")
        self.assertEqual(scenes, ["scene 1 text", "scene 2 text"], "blank scene dropped")

    def test_extract_characters_normalizes_list(self):
        client = FakeClient('{"characters": [{"identifier_in_scene":"A","is_visible":true,"static_features":"s","dynamic_features":"d"}]}')
        chars = planner.extract_characters(client, "script")
        self.assertEqual(len(chars), 1)
        self.assertEqual(chars[0]["idx"], 0)
        self.assertEqual(chars[0]["identifierInScene"], "A")

    def test_write_script_tolerates_non_json(self):
        self.assertEqual(planner.write_script(FakeClient("the model rambled"), "s", ""), [])

    def test_extract_characters_tolerates_non_json(self):
        self.assertEqual(planner.extract_characters(FakeClient("oops"), "s"), [])


class StoryboardChainTest(unittest.TestCase):
    CHARS = [
        {"idx": 0, "identifierInScene": "Alice", "isVisible": True,
         "staticFeatures": "short hair", "dynamicFeatures": "green dress"},
        {"idx": 1, "identifierInScene": "Bob", "isVisible": False,
         "staticFeatures": "tall", "dynamicFeatures": "blue shirt"},
    ]

    def test_character_block_for_storyboard_reproduces_str(self):
        block = planner._character_block_for_storyboard(self.CHARS)
        self.assertIn("Character 0: Alice[visible]", block)
        self.assertIn("static features: short hair", block)
        self.assertIn("Character 1: Bob[not visible]", block)

    def test_character_block_for_decompose(self):
        block = planner._character_block_for_decompose(self.CHARS)
        self.assertIn("Alice: (static) short hair; (dynamic) green dress", block)

    def test_filter_char_idxs_drops_out_of_range_and_bools(self):
        self.assertEqual(planner.filter_char_idxs([0, 1, 2, -1, True], 2), [0, 1])
        self.assertEqual(planner.filter_char_idxs(None, 2), [])

    def test_design_storyboard_parses_briefs(self):
        client = FakeClient('{"storyboard": [{"idx":0,"is_last":false,"cam_idx":0,"visual_desc":"<Alice> stands","audio_desc":"silence"},{"idx":1,"is_last":true,"cam_idx":1,"visual_desc":"<Bob> turns"}]}')
        briefs = planner.design_storyboard(client, "scene", self.CHARS, "")
        self.assertEqual(len(briefs), 2)
        self.assertEqual(briefs[0]["visual_desc"], "<Alice> stands")
        self.assertTrue(briefs[1]["is_last"])
        self.assertEqual(briefs[1]["cam_idx"], 1)

    def test_decompose_merges_brief_and_filters_idxs(self):
        client = FakeClient('{"ff_desc":"wide shot","ff_vis_char_idxs":[0,9],"lf_desc":"close","lf_vis_char_idxs":[0],"motion_desc":"dolly in","variation_type":"medium","variation_reason":"new char"}')
        brief = {"idx": 3, "is_last": False, "cam_idx": 2, "visual_desc": "V", "audio_desc": "A"}
        sd = planner.decompose_visual_description(client, brief, self.CHARS)
        # brief fields carried through
        self.assertEqual(sd["idx"], 3)
        self.assertEqual(sd["cam_idx"], 2)
        self.assertEqual(sd["audio_desc"], "A")
        # decomposition fields + out-of-range idx 9 filtered (only 2 chars)
        self.assertEqual(sd["ff_desc"], "wide shot")
        self.assertEqual(sd["ff_vis_char_idxs"], [0])
        self.assertEqual(sd["variation_type"], "medium")

    def test_decompose_bad_variation_falls_back_small(self):
        client = FakeClient('{"ff_desc":"x","variation_type":"weird"}')
        sd = planner.decompose_visual_description(client, {"idx": 0, "visual_desc": "v"}, self.CHARS)
        self.assertEqual(sd["variation_type"], "small")

    def test_plan_shotplan_assembles_valid_contract(self):
        # Sequenced replies: develop_story (text), extract_characters,
        # write_script (1 scene), then per-scene: design_storyboard, decompose x1.
        client = QueueClient([
            "A full story about Alice.",  # develop_story (plain text)
            '{"characters":[{"identifier_in_scene":"Alice","is_visible":true,"static_features":"short hair","dynamic_features":"green dress"}]}',
            '{"script":["INT. ROOM - DAY. Alice waits."]}',
            '{"storyboard":[{"idx":0,"is_last":true,"cam_idx":0,"visual_desc":"<Alice> waits","audio_desc":"quiet"}]}',
            '{"ff_desc":"Alice mid-frame","ff_vis_char_idxs":[0],"lf_desc":"Alice closer","lf_vis_char_idxs":[0],"motion_desc":"dolly in","variation_type":"small","variation_reason":"minor"}',
        ])
        plan = planner.plan_shotplan(client, "雨夜告别", "1镜", flow_id="flow-x", skill_refs=["广告短片"])
        self.assertEqual(plan["schemaVersion"], "vimax-shotplan/v1")
        self.assertEqual(plan["flowId"], "flow-x")
        self.assertEqual(len(plan["scenes"]), 1)
        self.assertEqual(len(plan["characters"]), 1)
        self.assertEqual(plan["characters"][0]["identifierInScene"], "Alice")
        self.assertEqual(len(plan["shots"]), 1)
        shot = plan["shots"][0]
        self.assertEqual(shot["idx"], 0)
        self.assertEqual(shot["sceneIdx"], 0)
        self.assertEqual(shot["ffDesc"], "Alice mid-frame")
        self.assertEqual(plan["skillRefs"], ["广告短片"])

    def test_skills_craft_is_injected_into_the_prompt_skills_parity(self):
        # MINOR-1 fix: with skills_dir + a 《》ref, the craft preamble must be
        # prepended to user_requirement (same as run_plan), and the resolved
        # skill name lands in shotplan.skillRefs.
        replies = [
            "story",
            '{"characters":[{"identifier_in_scene":"A","is_visible":true,"static_features":"s","dynamic_features":"d"}]}',
            '{"script":["scene one"]}',
            '{"storyboard":[{"idx":0,"is_last":true,"cam_idx":0,"visual_desc":"v","audio_desc":"a"}]}',
            '{"ff_desc":"f","ff_vis_char_idxs":[0],"lf_desc":"l","lf_vis_char_idxs":[0],"motion_desc":"m","variation_type":"small","variation_reason":"r"}',
        ]
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "ad.md"), "w", encoding="utf-8") as f:
                f.write('# 测试广告拍法\n\n```json\n'
                        '{"skill_name":"测试广告拍法","skill_description":"广告短片",'
                        '"skill_content":[{"section":"planner","content":"突出产品卖点"}]}\n```\n')
            client = QueueClient(list(replies))
            plan = planner.plan_shotplan(
                client, "卖点视频", "广告", flow_id="f", skill_refs=["测试广告拍法"], skills_dir=d)
        # craft preamble reached the first LLM call (develop_story)
        first_human = client.calls[0][1]["content"]
        self.assertIn("参考以下影视拍法", first_human)
        self.assertIn("突出产品卖点", first_human)
        # resolved skill name recorded in the contract
        self.assertEqual(plan["skillRefs"], ["测试广告拍法"])


class B1ParallelAndStepTest(unittest.TestCase):
    CHARS = [{"idx": 0, "identifierInScene": "A", "isVisible": True, "staticFeatures": "s", "dynamicFeatures": "d"}]

    def test_plan_scene_parallel_preserves_shot_order(self):
        # design_storyboard returns 3 briefs idx 0,1,2; decompose runs in
        # parallel (workers=3) but the output order must match brief order so
        # assemble_shotplan's positional idx stays correct.
        storyboard = '{"storyboard":[{"idx":0,"cam_idx":0,"visual_desc":"shot ZERO","is_last":false},{"idx":1,"cam_idx":0,"visual_desc":"shot ONE","is_last":false},{"idx":2,"cam_idx":1,"visual_desc":"shot TWO","is_last":true}]}'
        client = KeyedClient(rules=[
            ("shot ZERO", '{"ff_desc":"ff0","ff_vis_char_idxs":[0],"lf_desc":"l","lf_vis_char_idxs":[0],"motion_desc":"m","variation_type":"small","variation_reason":"r"}'),
            ("shot ONE", '{"ff_desc":"ff1","ff_vis_char_idxs":[0],"lf_desc":"l","lf_vis_char_idxs":[0],"motion_desc":"m","variation_type":"small","variation_reason":"r"}'),
            ("shot TWO", '{"ff_desc":"ff2","ff_vis_char_idxs":[0],"lf_desc":"l","lf_vis_char_idxs":[0],"motion_desc":"m","variation_type":"small","variation_reason":"r"}'),
            ("storyboard artist", storyboard), ("画面", storyboard), ("分镜", storyboard),
        ], default=storyboard)
        # design_storyboard is the FIRST chat call; route it by the system prompt
        client.rules.insert(0, ("storyboard", storyboard))
        shots = planner.plan_scene(client, "scene", self.CHARS, "", max_workers=3)
        self.assertEqual([s["ff_desc"] for s in shots], ["ff0", "ff1", "ff2"], "order preserved despite parallel")

    def test_plan_shotplan_emits_steps_in_order(self):
        client = QueueClient([
            "a story",
            '{"characters":[{"identifier_in_scene":"A","is_visible":true,"static_features":"s","dynamic_features":"d"}]}',
            '{"script":["scene one"]}',
            '{"storyboard":[{"idx":0,"is_last":true,"cam_idx":0,"visual_desc":"v","audio_desc":"a"}]}',
            '{"ff_desc":"f","ff_vis_char_idxs":[0],"lf_desc":"l","lf_vis_char_idxs":[0],"motion_desc":"m","variation_type":"small","variation_reason":"r"}',
        ])
        steps = []
        plan = planner.plan_shotplan(client, "idea", "", flow_id="f", on_step=lambda stage, payload: steps.append((stage, payload)))
        self.assertEqual([s[0] for s in steps], ["story", "characters", "scene"])
        self.assertEqual(steps[0][1]["story"], "a story")
        self.assertEqual(steps[1][1]["characters"][0]["identifierInScene"], "A")
        self.assertEqual(steps[2][1]["sceneIdx"], 0)
        self.assertEqual(len(steps[2][1]["shots"]), 1)
        self.assertEqual(plan["schemaVersion"], "vimax-shotplan/v1")


class ChatClientRetryTest(unittest.TestCase):
    def test_retryable_status_classification(self):
        from brain.chat_client import _is_retryable_status
        for code in (429, 500, 502, 503, 504):
            self.assertTrue(_is_retryable_status(code), code)
        for code in (400, 401, 403, 404, 200):
            self.assertFalse(_is_retryable_status(code), code)

    def test_chat_default_timeout_is_90(self):  # B5: 180->90 fast failover
        from brain.chat_client import GrsaiChatClient
        self.assertEqual(GrsaiChatClient(api_key="k").timeout, 90)
        self.assertEqual(GrsaiChatClient(api_key="k", timeout=120).timeout, 120, "still overridable")

    def test_chat_retries_429_then_succeeds(self):
        import urllib.error
        from brain.chat_client import GrsaiChatClient
        slept = []
        c = GrsaiChatClient(api_key="k", max_retries=2, sleep=lambda s: slept.append(s))
        attempts = {"n": 0}

        def fake_urlopen(req, timeout=None):
            attempts["n"] += 1
            if attempts["n"] == 1:
                raise urllib.error.HTTPError(req.full_url, 429, "rate", {}, None)
            class R:
                def __enter__(self): return self
                def __exit__(self, *a): return False
                def read(self): return b'{"choices":[{"message":{"content":"ok"}}]}'
            return R()

        import urllib.request as ur
        orig = ur.urlopen
        ur.urlopen = fake_urlopen
        try:
            out = c.chat([{"role": "user", "content": "hi"}])
        finally:
            ur.urlopen = orig
        self.assertEqual(out, "ok")
        self.assertEqual(attempts["n"], 2, "retried once after the 429")
        self.assertEqual(len(slept), 1, "backed off once")

    def test_read_timeout_is_retried(self):
        # B-review C1: a urlopen read timeout raises socket.timeout (== TimeoutError
        # in py3.10+), which is NOT a urllib.error.URLError - must still be retried.
        from brain.chat_client import GrsaiChatClient
        slept = []
        c = GrsaiChatClient(api_key="k", max_retries=2, sleep=lambda s: slept.append(s))
        attempts = {"n": 0}

        def fake_urlopen(req, timeout=None):
            attempts["n"] += 1
            if attempts["n"] == 1:
                raise TimeoutError("read timed out")
            class R:
                def __enter__(self): return self
                def __exit__(self, *a): return False
                def read(self): return b'{"choices":[{"message":{"content":"ok"}}]}'
            return R()

        import urllib.request as ur
        orig = ur.urlopen
        ur.urlopen = fake_urlopen
        try:
            out = c.chat([{"role": "user", "content": "hi"}])
        finally:
            ur.urlopen = orig
        self.assertEqual(out, "ok")
        self.assertEqual(attempts["n"], 2, "timeout retried (was uncaught before C1)")
        self.assertEqual(len(slept), 1)

    def test_chat_does_not_retry_400(self):
        import urllib.error
        from brain.chat_client import GrsaiChatClient
        c = GrsaiChatClient(api_key="k", max_retries=2, sleep=lambda s: None)
        attempts = {"n": 0}

        def fake_urlopen(req, timeout=None):
            attempts["n"] += 1
            raise urllib.error.HTTPError(req.full_url, 400, "bad", {}, None)

        import urllib.request as ur
        orig = ur.urlopen
        ur.urlopen = fake_urlopen
        try:
            with self.assertRaises(ValueError):
                c.chat([{"role": "user", "content": "hi"}])
        finally:
            ur.urlopen = orig
        self.assertEqual(attempts["n"], 1, "4xx-other fails at once, no retry")


class TwoPhaseSplitTest(unittest.TestCase):
    """B3b: plan_story_and_characters + plan_from_characters compose to the same
    shotplan as plan_shotplan; the (edited) cast is phase2's single source (M4)."""

    REPLIES = [
        "A full story about Alice.",
        '{"characters":[{"identifier_in_scene":"Alice","is_visible":true,"static_features":"short hair","dynamic_features":"green dress"}]}',
        '{"script":["INT. ROOM - DAY. Alice waits."]}',
        '{"storyboard":[{"idx":0,"is_last":true,"cam_idx":0,"visual_desc":"<Alice> waits","audio_desc":"quiet"}]}',
        '{"ff_desc":"Alice mid-frame","ff_vis_char_idxs":[0],"lf_desc":"l","lf_vis_char_idxs":[0],"motion_desc":"m","variation_type":"small","variation_reason":"r"}',
    ]

    def test_phase_split_matches_monolith(self):
        whole = planner.plan_shotplan(QueueClient(self.REPLIES), "雨夜", flow_id="f")
        c = QueueClient(self.REPLIES)
        p1 = planner.plan_story_and_characters(c, idea="雨夜", flow_id="f")
        sp = planner.plan_from_characters(
            c, story=p1["story"], characters=p1["characters"],
            effective_requirement=p1["effective_requirement"], resolved_refs=p1["resolved_refs"], flow_id="f")
        self.assertEqual(sp["schemaVersion"], whole["schemaVersion"])
        self.assertEqual(len(sp["shots"]), len(whole["shots"]))
        self.assertEqual([s["sceneIdx"] for s in sp["shots"]], [s["sceneIdx"] for s in whole["shots"]])
        self.assertEqual([s["ffDesc"] for s in sp["shots"]], [s["ffDesc"] for s in whole["shots"]])

    def test_edited_cast_is_phase2_single_source_M4(self):
        c = QueueClient(self.REPLIES)
        p1 = planner.plan_story_and_characters(c, idea="x", flow_id="f")
        edited = [dict(ch, staticFeatures="EDITED-" + str(i)) for i, ch in enumerate(p1["characters"])]
        sp = planner.plan_from_characters(c, story=p1["story"], characters=edited,
                                          effective_requirement="", resolved_refs=[], flow_id="f")
        self.assertEqual(sp["characters"][0]["staticFeatures"], "EDITED-0",
                         "shotplan.characters carries the edited cast (so 定妆 uses it)")

    def test_on_step_emitted_per_phase(self):
        seen = []
        c = QueueClient(self.REPLIES)
        p1 = planner.plan_story_and_characters(c, idea="x", flow_id="f", on_step=lambda s, d: seen.append(s))
        planner.plan_from_characters(c, story=p1["story"], characters=p1["characters"],
                                     effective_requirement="", resolved_refs=[], flow_id="f",
                                     on_step=lambda s, d: seen.append(s))
        self.assertEqual(seen[:2], ["story", "characters"], "phase1 emits story+characters")
        self.assertIn("scene", seen, "phase2 emits scene")


if __name__ == "__main__":
    unittest.main()
