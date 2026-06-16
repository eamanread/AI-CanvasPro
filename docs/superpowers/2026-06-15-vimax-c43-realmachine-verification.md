# Phase C — C4.3 Real-Machine Verification Log (2026-06-15)

**Gate:** 🔴 PAID real-machine verification of the native render/portraits path. The
one seam never proven with real money: native orchestrator → broker → grsai → ledger.
User explicitly authorized the spend ("按顺序执行：C4.3 真机出图(付费,门控)").

**Environment:** server on 127.0.0.1:8779 with `HY_VIMAX_NATIVE=1`,
`/api/v2/vimax/native/status` → `configured:true`. grsai creds from `user/config.json`.
Fresh flowId `c43-1` (no existing artifact touched). Spend scoped via
`shotIdxs`/`characterIdxs` so the plan's shot count cannot inflate cost.

## Steps + results

1. **Native plan (FREE, chat only)** — idea "雨夜，一个人在便利店门口等公交", req "1个场景，尽量精简镜头".
   story 35s → characters 55s → scene done 220s. Result: `vimax-shotplan/v1`, **4 shots, 1 visible character**, `persistError: None`. working_dir laid down at `user/vimax_runs/c43-1/`.

2. **Native render shot 0 (PAID)** — signed ticket `vtk-e0d791c5…` cap 2.
   - Real keyframe produced: `https://file2.aitohumanize.com/file/87d1092f…png`.
   - **`attempts=2, acceptable=false`** — the VLM judge ran on the REAL frame, rejected it, reshot once (consuming the retryBudget), kept the last frame. The judge reshoot loop fired in real life.
   - Ledger `vtk-e0d791c5…`: **`spent=2.0 draws=2`** (cap 2). Exact at cap (1 base + 1 reshoot).

3. **Native portraits char 0 (PAID)** — signed ticket `vtk-4e3a6ee1…` cap 3.
   - Real 3-view portrait: char 0, **3 views (front/side/back) all with urls**, no error. Side/back referenced the saved front.png (reference chain held).
   - Ledger `vtk-4e3a6ee1…`: **`spent=3.0 draws=3`** (cap 3). Exact at cap.

4. **Golden parity (FREE)** — `render_compare.compare_portraits_profiles(external, native)` on the
   real native `c43-1/result.json` vs the real external `flow-live-1/result.json`:
   both `{charCount:1, producedCharCount:1, viewsPerChar:[3], allViewsHaveUrl:true, errorCount:0}`
   → **`equivalent: true`, GATE: PASS**.

## Verdict

- Native render/portraits draw real grsai images correctly end-to-end (in-process brain, no venv).
- **Cost sovereignty exact:** every ticket `spent == draws ≤ cap`; total spend exactly **5 draws** (2 render + 3 portraits) = the pre-approved estimate. No uncapped/unbilled/un-Bearered draw.
- Real native output is **contract-equivalent** to a real external run (structural golden gate PASS).
- The judge reshoot loop, the portrait reference chain, and the broker cap/ledger accounting all behave correctly under real load.

**C4.3 closed.** The native path is now trusted at the real-machine level → unblocks C5.2
(retire the external venv render/portraits runtime).
