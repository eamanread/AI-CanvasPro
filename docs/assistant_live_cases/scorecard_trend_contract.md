# CI Scorecard Trend Contract

Date: 2026-06-05

Purpose: make saved live/browser/offline scorecards trendable in CI without starting, stopping, restarting, status-checking, or probing the user-managed `8777` service.

## Input

Trend mode reads one or more saved scorecard files:

- a direct JSON scorecard path;
- an artifact directory containing `scorecard.json`;
- a parent directory containing multiple live artifact bundle directories.

Example:

```powershell
python tools/score_assistant_live_run.py --trend output/regression/assistant-live
```

## Output Shape

The trend JSON must include:

| Field | Meaning |
| --- | --- |
| `count` | Number of scorecards loaded |
| `passCount` | Scorecards with `passesTarget=true` |
| `failureCount` | Scorecards with `passesTarget=false` |
| `averageNormalizedScore` | Average 0-100 score across 25-point action batches and 110-point R5 journeys |
| `latest` | Latest run summary with `runId`, `kind`, `score`, `passesTarget`, owner, and suggested regression |
| `previous` | Previous run summary when present |
| `deltaFromPrevious` | Latest normalized score minus previous normalized score |
| `regressedFromPrevious` | True when latest score drops beyond the threshold |
| `ownerFailureCounts` | Failure counts grouped by likely owner |
| `suggestedRegressions` | Regression files that should be run or extended |
| `warnings` | Human-readable CI failure reasons |
| `scorecardFiles` | Loaded scorecard paths |

## Gate Rules

- The trend passes only when `count > 0`, the latest scorecard passes its own target, and `regressedFromPrevious=false`.
- Default regression threshold is 15 normalized percentage points.
- CI may use `--max-drop-percent` to tighten or relax the threshold.
- Schema, safety, and generation hard failures take owner precedence over downstream canvas readability symptoms.

## Owner Mapping

| Owner | Suggested regression |
| --- | --- |
| `schema` | `canvas_agent_action_schema_test.py` |
| `safety` | `canvas_agent_action_schema_test.py` |
| `generation` | `modules/assistant/assistantActionExecutor.test.js` |
| `canvas` | `tools/assistant_panel_live_screenshot_check.test.mjs` |
| `structure` | `docs/assistant_live_cases/story_to_video_cases.md` |
| `ui` / R5 owners | Owner-provided `suggestedRegression` from the R5 scorecard |

## CI Use

CI can run the trend command after producing live artifact bundles or fixture-backed R5 artifacts. The command exits non-zero when the latest score fails target or the trend regresses, making score deterioration visible even when an individual fixture still writes an artifact bundle.
