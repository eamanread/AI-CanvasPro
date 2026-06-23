import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from brain.keyframe_judge import (
    parse_judge_verdict, should_reshoot, judge_capacity, generate_with_judge,
)


class HelpersTest(unittest.TestCase):
    def test_parse_fenced_and_string_bools(self):
        self.assertEqual(parse_judge_verdict('```json\n{"acceptable": false, "issues": "wrong face"}\n```'),
                         {"acceptable": False, "issues": "wrong face"})
        self.assertTrue(parse_judge_verdict('garbage')["acceptable"])  # fail-open
        self.assertTrue(parse_judge_verdict('')["acceptable"])

    def test_should_reshoot_gates(self):
        self.assertTrue(should_reshoot(False, 1, 2, 3))
        self.assertFalse(should_reshoot(True, 1, 2, 3))     # acceptable
        self.assertFalse(should_reshoot(False, 2, 2, 3))    # per-shot exhausted
        self.assertFalse(should_reshoot(False, 1, 2, 0))    # global exhausted

    def test_judge_capacity(self):
        self.assertEqual(judge_capacity(3, 2), 5)
        self.assertEqual(judge_capacity(0, 2), 0)


class BudgetSovereigntyTest(unittest.TestCase):
    def test_global_budget_caps_total_draws_across_shots(self):
        draws = {"n": 0}

        def make_shot():
            def generate(issues):
                draws["n"] += 1
                return f"url{draws['n']}"

            def judge(_result):
                return {"acceptable": False, "issues": "x"}  # always reject
            return generate, judge

        retries = 2  # GLOBAL budget across 3 shots
        for _ in range(3):
            gen, jdg = make_shot()
            out = generate_with_judge(generate=gen, judge=jdg, max_attempts=2,
                                      retries_remaining=retries)
            retries = out["retries_remaining"]
        # 3 base draws + 2 reshoots (global budget), never 6.
        self.assertEqual(draws["n"], 5)
        self.assertEqual(retries, 0)

    def test_accept_first_try_untouched_budget(self):
        out = generate_with_judge(generate=lambda issues: "u",
                                  judge=lambda r: {"acceptable": True}, max_attempts=2,
                                  retries_remaining=3)
        self.assertEqual(out["attempts"], 1)
        self.assertEqual(out["retries_remaining"], 3)

    def test_judge_none_single_draw(self):
        out = generate_with_judge(generate=lambda issues: "u", judge=None,
                                  max_attempts=2, retries_remaining=3)
        self.assertEqual(out["attempts"], 1)


if __name__ == "__main__":
    unittest.main()
