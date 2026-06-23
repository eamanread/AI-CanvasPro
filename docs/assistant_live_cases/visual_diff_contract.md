# Assistant Visual Diff Contract

Date: 2026-06-05

Purpose: compare saved assistant R5 screenshot artifacts against a blessed PNG baseline without starting, stopping, restarting, status-checking, probing, or browser-testing the user-managed `8777` service.

## Scope

Visual diff is an artifact check. It reads PNG files that already exist on disk and writes a compact `visual-diff.json` report. It must not launch Huanying, probe localhost, call a model provider, install dependencies, or mutate canvas state.

## Tool Contract

`tools/assistant_visual_diff.mjs` exports:

| Export | Purpose |
| --- | --- |
| `comparePngFiles` | Decode two 8-bit RGB/RGBA PNG files and compare pixels. |
| `compareVisualArtifactDirectories` | Pair screenshot PNG artifacts by file name and compare each matching file. |

`comparePngFiles` returns a per-image result with `passesTarget`, `dimensionMismatch`, `totalPixels`, `mismatchPixels`, `mismatchRatio`, and observed `maxChannelDelta`.

`compareVisualArtifactDirectories` returns an aggregate report with `passesTarget`, `comparisons`, `failedComparisons`, `missingActuals`, and `missingBaselines`.

## CLI Usage

```powershell
D:\Aic\node.exe tools\assistant_visual_diff.mjs --baseline docs\assistant_live_cases\visual-baselines\r5 --actual output\regression\assistant-live\latest\screenshots --out output\regression\assistant-live\latest\visual-diff.json
```

Optional tolerances:

```powershell
D:\Aic\node.exe tools\assistant_visual_diff.mjs --baseline <baseline-dir> --actual <actual-dir> --max-mismatch-ratio 0.01 --max-channel-delta 2
```

The command exits non-zero when dimensions differ, expected screenshots are missing, unexpected screenshots are present, or the aggregate `mismatchRatio` exceeds the configured tolerance.

## R5 Integration

`tools/assistant_panel_live_screenshot_check.mjs` accepts `--visual-diff`, `--visual-baseline`, and `--visual-max-mismatch-ratio` for user-authorized R5 runs. When enabled, the runner compares the saved screenshots directory against the baseline directory and writes `visual-diff.json` into the same artifact bundle as `scorecard.json` and `summary.md`.

The runner still follows the live-service boundary: this option only runs after the user has explicitly authorized a browser/R5 run. Offline regression only checks parser/tool behavior and never opens `8777`.

## CI Gate

CI should treat `visual-diff.json.passesTarget=false` as a UI/canvas regression candidate and run or extend:

- `tools/assistant_visual_diff.test.mjs`
- `tools/assistant_panel_live_screenshot_check.test.mjs`
- `modules/app/appAssistantPanel.test.js`

Visual diff complements the scorecard trend. The scorecard explains product and safety failures; visual diff catches layout drift, clipped panels, missing receipts, and unexpected screenshot changes.
