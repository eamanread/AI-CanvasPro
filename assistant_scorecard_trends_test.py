import json
import tempfile
import unittest
from pathlib import Path

from tools.score_assistant_live_run import (
    load_scorecard_trend,
    summarize_scorecard_trend,
)


def _dimension_scores(schema_score=5, canvas_score=5, safety_score=5, generation_score=5, structure_score=5):
    return {
        "structureCompleteness": {"score": structure_score, "reason": "structure"},
        "schemaLegality": {"score": schema_score, "reason": "schema"},
        "safetyBoundary": {"score": safety_score, "reason": "safety"},
        "canvasReadability": {"score": canvas_score, "reason": "canvas"},
        "generationPermissionCorrectness": {"score": generation_score, "reason": "generation"},
    }


def _action_score(run_id, total, passes_target, *, schema_score=5, canvas_score=5):
    return {
        "runId": run_id,
        "total": total,
        "max": 25,
        "passesTarget": passes_target,
        "dimensions": _dimension_scores(schema_score=schema_score, canvas_score=canvas_score),
        "warnings": [],
    }


class AssistantScorecardTrendTests(unittest.TestCase):
    def test_summarizes_mixed_action_and_r5_scorecards(self):
        trend = summarize_scorecard_trend(
            [
                _action_score("run-1", 23, True),
                _action_score("run-2", 15, False, schema_score=1, canvas_score=0),
                {
                    "runId": "run-3",
                    "passesTarget": True,
                    "r5Journey": {
                        "total": 110,
                        "max": 110,
                        "passesTarget": True,
                        "failedStep": "",
                        "likelyOwner": "",
                        "suggestedRegression": "",
                    },
                },
            ]
        )

        self.assertEqual(trend["count"], 3)
        self.assertEqual(trend["passCount"], 2)
        self.assertEqual(trend["failureCount"], 1)
        self.assertAlmostEqual(trend["averageNormalizedScore"], 84.0)
        self.assertTrue(trend["latest"]["passesTarget"])
        self.assertEqual(trend["latest"]["kind"], "r5Journey")
        self.assertEqual(trend["ownerFailureCounts"]["schema"], 1)
        self.assertIn("canvas_agent_action_schema_test.py", trend["suggestedRegressions"])

    def test_flags_latest_drop_as_ci_regression(self):
        trend = summarize_scorecard_trend(
            [
                _action_score("baseline", 25, True),
                _action_score("candidate", 15, False, schema_score=1, canvas_score=0),
            ],
            max_drop_percent=10,
        )

        self.assertFalse(trend["passesTarget"])
        self.assertTrue(trend["regressedFromPrevious"])
        self.assertEqual(trend["latest"]["likelyOwner"], "schema")
        self.assertEqual(
            trend["latest"]["suggestedRegression"],
            "canvas_agent_action_schema_test.py",
        )
        self.assertLessEqual(trend["deltaFromPrevious"], -40.0)
        self.assertTrue(any("dropped" in warning for warning in trend["warnings"]))

    def test_loads_scorecard_json_files_from_artifact_directories(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            first_dir = root / "run-1"
            second_dir = root / "run-2"
            first_dir.mkdir()
            second_dir.mkdir()
            (first_dir / "scorecard.json").write_text(
                json.dumps(_action_score("run-1", 23, True)),
                encoding="utf-8",
            )
            (second_dir / "scorecard.json").write_text(
                json.dumps(_action_score("run-2", 24, True)),
                encoding="utf-8",
            )

            trend = load_scorecard_trend([root])

        self.assertEqual(trend["count"], 2)
        self.assertEqual(trend["latest"]["runId"], "run-2")
        self.assertTrue(trend["passesTarget"])


if __name__ == "__main__":
    unittest.main()
