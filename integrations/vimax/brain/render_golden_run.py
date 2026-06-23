"""C4.2 golden reconcile harness for native render/portraits RESULTS. Runs the
native runner with a MOCK image_gen (deterministic fake urls - NO network, NO
broker, NO spend) against a seeded working_dir, optionally loads a real external
result.json, and prints a structural-equivalence verdict (render_compare). This
is the FREE structural gate: it proves the native result.json is contract-
equivalent to an external run WITHOUT drawing. The PAID real-machine pass (C4.3)
reuses --external-result to compare a real native run against a real external one.

Usage (system python, from integrations/vimax):
    python -m brain.render_golden_run --working-dir <dir> --mode render|portraits [--external-result <path>]
"""
import argparse
import json
import os
import sys

from brain import render_compare as rc
from brain import render_runner


class _MockChat:
    """Selector chat stub - returns an empty-selection prompt (judge off when
    retry_budget==0, so only the selector is asked). No network."""
    def chat(self, messages, **kw):
        return '{"ref_image_indices": [], "text_prompt": "a shot"}'


class _MockOut:
    def __init__(self, url):
        self.data = url

    def save(self, path):
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "wb") as handle:
            handle.write(b"\x89PNG mock")


class _MockImg:
    """Deterministic fake image generator - a stable fake url per draw. No
    network, no broker, no spend (this is what makes C4.2 free)."""
    def __init__(self):
        self.n = 0

    def generate_single_image(self, prompt, reference_image_paths=None, **kw):
        self.n += 1
        return _MockOut(f"https://mock.local/draw/{self.n}.png")


def _load(path):
    if not path or not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Native render/portraits golden reconcile (free, mock image_gen)")
    ap.add_argument("--working-dir", required=True)
    ap.add_argument("--mode", choices=("render", "portraits"), default="render")
    ap.add_argument("--external-result", default="")
    ap.add_argument("--retry-budget", type=int, default=0)
    args = ap.parse_args(argv)

    img = _MockImg()
    if args.mode == "render":
        native = render_runner.run_render(
            working_dir=args.working_dir, flow_id="golden-native",
            chat_client=_MockChat(), image_gen=img, retry_budget=args.retry_budget)
        nprof = rc.render_result_profile(native)
        ext = _load(args.external_result)
        eprof = rc.render_result_profile(ext) if ext else None
        verdict = rc.compare_render_profiles(eprof, nprof) if eprof else None
        self_verdict = rc.compare_render_profiles(nprof, nprof)
    else:
        native = render_runner.run_portraits(
            working_dir=args.working_dir, flow_id="golden-native", image_gen=img)
        nprof = rc.portraits_result_profile(native)
        ext = _load(args.external_result)
        eprof = rc.portraits_result_profile(ext) if ext else None
        verdict = rc.compare_portraits_profiles(eprof, nprof) if eprof else None
        self_verdict = rc.compare_portraits_profiles(nprof, nprof)

    print("=== C4.2 render golden对账 (mock image_gen, no spend) ===")
    print(f"mode={args.mode} draws={img.n}")
    print("--- native profile ---", json.dumps(nprof, ensure_ascii=False))
    # Native must satisfy its OWN hard invariants even with no external artifact.
    print("--- native self-invariants ---", json.dumps(self_verdict, ensure_ascii=False))
    if verdict is not None:
        print("--- external profile ---", json.dumps(eprof, ensure_ascii=False))
        print("--- verdict (external vs native) ---", json.dumps(verdict, ensure_ascii=False))
        gate = bool(verdict["equivalent"])
    else:
        print("(no --external-result given; gating on native self-invariants only)")
        gate = bool(self_verdict["equivalent"])
    print("GATE:", "PASS" if gate else "REVIEW (see hardFailures/notes)")
    return 0 if gate else 1


if __name__ == "__main__":
    sys.exit(main())
