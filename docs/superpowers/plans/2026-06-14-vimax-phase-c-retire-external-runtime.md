# ViMax Phase C — Retire External Runtime (Native render + portraits) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move 成片(render)/定妆(portraits) image generation from the external venv subprocess (`huanying_runner.py` + langchain + ViMax `agents`) into the in-process native orchestrator, so the venv runtime can be retired — with the cost-sovereignty chain unchanged.

**Architecture:** Port ViMax's render/portraits prompts + logic into `integrations/vimax/brain/` as **stdlib-only, synchronous** Python (no langchain / tenacity / pydantic / requests / cv2 / PIL). The native `NativeOrchestratorService` gains `run_render(payload)` / `run_portraits(payload)` worker methods that mirror its existing plan-job machinery (jobs dict, worker thread, streamed `step` events, cooperative cancel, `(mode,flowId)` dedup). Image calls go through `ImageGeneratorGrsai(api_key=ticketId, base_url=brokerUrl)` → `POST /api/v2/vimax/draw` exactly as today (the broker/cost chain is byte-for-byte untouched). The panel routes render/portraits to native when `shouldUseNativeVimax()` is true, polling the **native** job table. A/B parity is gated by a free structural golden-compare; real-machine (paid) verification is gated behind explicit user money-confirmation.

**Tech Stack:** Python 3 stdlib (urllib, json, base64, threading, ast), the existing `brain.chat_client.GrsaiChatClient` (sync, OpenAI-compatible, multimodal passthrough) + `brain.chat_client.extract_json`, vanilla-JS ES-module panel, `unittest`.

**Invariants this plan must hold (from the spec §3):**
- **R-cost**: native render/portraits still build `ImageGeneratorGrsai(api_key=ticketId, base_url=brokerUrl)` → `/api/v2/vimax/draw`; broker `sign/draw/cap/refund/ledger` and panel `vimaxSign` unchanged. **native/brain NEVER `import vimax_broker_service`** (enforced by a static import-isolation test, C1.5).
- **R-verbatim**: every ported prompt is copied **byte-for-byte** from the ViMax/huanying source (line ranges given per task); no "simplified" rewrites.
- **R-parity**: native `result.json` is structurally equivalent to the external runner's (same `schemaVersion`, field set, counts) — gated by C4 golden-compare.
- **R-AB**: routing is the **global** `HY_VIMAX_NATIVE` flag + `shouldUseNativeVimax()` (already exists); in-flight jobs are owned by whichever orchestrator started them.
- **R-dedup**: native render/portraits dedup by `(mode, flowId)` and never write the same `working_dir`/`result.json` concurrently.
- **Zero-spend default**: C1–C3 + the C4 golden gate are FREE (fake image_gen / structural only). The ONLY paid step is C4 real-machine verification — **gated on an explicit user money-confirm**.

### Sync & verbatim contract (read before C1 — resolves the async/await question)

This is the single most important porting rule; every C1/C2/C3 task depends on it.

1. **The brain is synchronous top-to-bottom.** `brain.chat_client.GrsaiChatClient.chat(messages)` is **sync** (it blocks on `urllib`), and `brain.image_gen.ImageGeneratorGrsai.generate_single_image(...)` is **sync** (C1.1 drops the source's `asyncio.to_thread`). Therefore every ported function — `reference_selector.select_*`, `portraits.generate_*`, `keyframe_judge.judge` / `generate_with_judge`, and `render_runner.run_render` / `run_portraits` — is a **plain `def`** that calls these directly with **no `await`** and **no `asyncio.run`**. The orchestrator runs them in a worker **thread** (mirroring `_run`/`_run_phase2`), so blocking is fine.
2. **The source is async; the port is a deliberate async→sync re-port.** The ViMax/huanying sources use `async def` + `await selector/image_gen/judge/generate_with_judge` (e.g. `huanying_runner.py:346,361,367,376`; `keyframe_judge.py:99,116,119,144,162`). An implementer must **not** naively keep those calls — the ported callees are sync, so the awaits are removed entirely and the `async def`s become `def`. This is intentional, not an oversight.
3. **R-verbatim applies to PROMPT STRINGS only.** Every ported **prompt constant** (`SYSTEM_PROMPT`, the selector/portrait templates, the human template) is copied **byte-for-byte** from the named source line range. The **surrounding Python** (control flow, message construction, parsing) is a *faithful but deliberately rewritten* port: async→sync, langchain→`client.chat`+`extract_json`, pydantic→`dict`, tenacity→(dropped / bounded inline retry). Do not claim byte-for-byte for the non-prompt code.
4. **Explicitly sanctioned deviations from source (all justified in-task):**
   - `reference_selector.select_pairs_by_indices` — **tolerant skip** of out-of-range indices (source *raises* `ValueError`). Justified: the LLM emits the indices; a single bad index must not crash a multi-shot render. The bounded parse-retry already re-asks on malformed output.
   - `portraits._features` — an f-string over the dict that reproduces source line 49's exact output string `(static) {static}; (dynamic) {dynamic}` (source uses `+`-concat over a pydantic object; the **output is identical**).
   - `keyframe_judge.generate_with_judge` / `KeyframeJudge.judge` — **sync** callbacks/signatures (source is async). The budget-loop **semantics are unchanged** (re-pinned by the new sync test in C1.4).
   - `brain.image_gen.ImageOutput` — a **minimal url-only** class (source's cv2/PIL/`download_image` are venv-side and unused by the render path).
   - Dropped `@retry`/tenacity — justified per task (broker retries draws; the judge reshoot loop covers render; a portrait failure refunds + surfaces as an error record).

---

## File Structure

**New (C1 — brain, stdlib, verbatim prompts):**
- `integrations/vimax/brain/image_gen.py` — minimal stdlib `ImageOutput` (url-download + path→url registry) + `ImageGeneratorGrsai` with `_submit_and_poll` on **urllib** (mirrors broker SSE), `_extract_url` unchanged. **Sync** `generate_single_image`.
- `integrations/vimax/brain/image_gen_test.py` — ports the `_extract_url` test cases (whole-JSON + SSE) + a fake-urlopen submit test.
- `integrations/vimax/brain/reference_selector.py` — port of ViMax `ReferenceImageSelector` (verbatim prompts), **sync** `select_reference_images_and_generate_prompt(client, pairs, frame_description)`.
- `integrations/vimax/brain/reference_selector_test.py` — fake-chat shape test.
- `integrations/vimax/brain/portraits.py` — port of ViMax `CharacterPortraitsGenerator` (verbatim 3-view prompts + front/side/back reference chain), **sync**.
- `integrations/vimax/brain/portraits_test.py` — fake-image_gen reference-chain test.
- `integrations/vimax/brain/keyframe_judge.py` — port of huanying `keyframe_judge.py` from langchain→`GrsaiChatClient` (vision), **sync** `judge` + **sync** `generate_with_judge` + pure helpers verbatim.
- `integrations/vimax/brain/keyframe_judge_test.py` — sync re-pin of the budget-sovereignty / accept-first / judge=None behavior.
- `integrations/vimax/brain/import_isolation_test.py` — static AST guard: brain/* + native orchestrator import-closure excludes forbidden modules.
- `integrations/vimax/brain/render_runner.py` — the ported `run_render`/`run_portraits` **orchestration bodies** (pure-ish: take injected chat/image_gen + working_dir), reusing the existing pure helpers (`merge_shot_edits`, `invalidate_shots`, `portrait_character_dicts`, `portrait_capacity`, `fanout_portrait_registry`, `invalidate_portraits`, `_safe_path_component`, `_read_json`).
- `integrations/vimax/brain/render_runner_test.py` — fake image_gen + fake chat full-loop tests asserting result.json shape + draw counts.
- `integrations/vimax/brain/render_compare.py` (C4) — structural profiles for `vimax-render-result/v1` + `vimax-portraits-result/v1` + `compare_*_profiles` (mirrors `golden_compare.py`).
- `integrations/vimax/brain/render_compare_test.py` (C4).

**Modified (C2/C3 — wiring):**
- `services/vimax_native_orchestrator.py` — add `mode` to job dict + `(mode,flowId)` dedup; `run_render(payload)` / `run_portraits(payload)` public methods + `_run_render` / `_run_portraits` workers; reuse `_build_client`/`_emit`/`_finish`/`_is_cancelled`/`_reap_locked`. Add `broker_url_getter`.
- `services/vimax_route_service.py` — `POST /api/v2/vimax/native/render` + `/native/portraits` (503-guarded delegation).
- `services/http_route_dispatcher.py` — add the two native paths to `_VIMAX_POST_PATHS`.
- `api/canvasAgentApi.js` — `vimaxNativeRender(payload)` + `vimaxNativePortraits(payload)`.
- `modules/app/appAssistantPanel.js` — `applyVimaxNativeRenderCommand` + `applyVimaxNativePortraitsRenderCommand` (mirror external but native submit + native poll); dispatch branches at the render/portraits confirm sites.
- `server.py` — pass `broker_url_getter` into `NativeOrchestratorService`.

**Retired (C5):**
- External render/portraits path in `huanying_runner.py` (`run_render`/`run_portraits`/`main` render+portraits branches), `image_generator_grsai.py`, the old async `keyframe_judge.py`, and the venv `agents`/langchain dependency for render+portraits — behind a rollback flag.

---

## C1 — Extraction (brain, venv-free, verbatim prompts) — FREE

> All C1 tasks are pure/unit-tested with fakes. No network, no spend. brain stays stdlib-only.

### Task C1.1: Port `ImageGeneratorGrsai` to stdlib urllib (`brain/image_gen.py`)

**Files:**
- Create: `integrations/vimax/brain/image_gen.py`
- Create: `integrations/vimax/brain/image_gen_test.py`
- Reference (verbatim source): `integrations/vimax/image_generator_grsai.py` (whole file, 1-155)
- Reference (urllib SSE pattern to mirror): `services/vimax_broker_service.py:165-201` (`_default_grsai_draw`)

- [ ] **Step 1: Write the failing test** — `brain/image_gen_test.py`

```python
import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))  # integrations/vimax
from brain.image_gen import ImageGeneratorGrsai, ImageOutput


class ExtractUrlTest(unittest.TestCase):
    def setUp(self):
        self.gen = ImageGeneratorGrsai(api_key="t", base_url="http://x/api/v2/vimax/draw")

    def test_broker_single_json_indented(self):
        body = '{\n  "status": "succeeded",\n  "results": [{"url": "https://b/1.png"}]\n}'
        self.assertEqual(self.gen._extract_url(body), "https://b/1.png")

    def test_broker_failed_envelope_raises_with_reason(self):
        body = '{"status": "failed", "failure_reason": "HY_TICKET_CAP_EXCEEDED: over cap"}'
        with self.assertRaises(ValueError) as ctx:
            self.gen._extract_url(body)
        self.assertIn("HY_TICKET_CAP_EXCEEDED", str(ctx.exception))

    def test_direct_grsai_sse_stream(self):
        body = ('data: {"status":"running"}\n'
                'data: {"status":"running"}\n'
                'data: {"status":"succeeded","results":[{"url":"https://b/2.png"}]}\n')
        self.assertEqual(self.gen._extract_url(body), "https://b/2.png")

    def test_no_url_raises(self):
        with self.assertRaises(ValueError):
            self.gen._extract_url('data: {"status":"running"}\n')


class SubmitUrllibTest(unittest.TestCase):
    def test_submit_posts_via_urllib_and_buffers_stream(self):
        gen = ImageGeneratorGrsai(api_key="tkt", base_url="http://h/api/v2/vimax/draw")
        captured = {}

        class FakeResp:
            def __enter__(self): return self
            def __exit__(self, *a): return False
            def __iter__(self):
                yield b'data: {"status":"running"}\n'
                yield b'data: {"status":"succeeded","results":[{"url":"https://b/3.png"}]}\n'

        def fake_urlopen(request, timeout=None):
            captured["url"] = request.full_url
            captured["method"] = request.get_method()
            captured["auth"] = request.headers.get("Authorization")
            captured["body"] = request.data
            return FakeResp()

        import brain.image_gen as ig
        orig = ig.urllib.request.urlopen
        ig.urllib.request.urlopen = fake_urlopen
        try:
            url = gen._submit_and_poll({"model": "nano-banana-2", "prompt": "p", "cost": 1})
        finally:
            ig.urllib.request.urlopen = orig
        self.assertEqual(url, "https://b/3.png")
        self.assertEqual(captured["method"], "POST")
        self.assertEqual(captured["auth"], "Bearer tkt")
        # "cost" key is filtered out of the body (broker parity).
        self.assertNotIn(b"cost", captured["body"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run (**from `integrations/vimax/`** — the proven invocation; `brain` must be top-level on the path, matching `planner_test`/`golden_compare_test`): `cd integrations/vimax; python -m unittest brain.image_gen_test -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'brain.image_gen'`

> **Test-invocation convention (applies to every brain test below):** run with CWD = `integrations/vimax/` so `from brain.X import ...` resolves (there is intentionally no `integrations/__init__.py`; the existing brain tests rely on this). The test files also `sys.path.insert(0, "..")` so they additionally work when run as a direct file. Do **not** use `python -m unittest integrations.vimax.brain.X` from repo root — it fails (no `integrations` package). The `services.*` orchestrator/route tests, by contrast, run from repo root (the server imports `services.*` that way).

- [ ] **Step 3: Write `brain/image_gen.py`**

Port from `image_generator_grsai.py`. Changes vs source: (a) drop `from interfaces.image_output import ImageOutput` and the cv2/PIL monkeypatch — define a **minimal stdlib `ImageOutput`** supporting only `fmt="url"` (the only format the render path produces); (b) `_submit_and_poll` uses **urllib** (buffer the stream, then call the unchanged `_extract_url`), filtering the `"cost"` key (broker parity); (c) `generate_single_image` is **sync** (drop `asyncio.to_thread`); (d) keep `_extract_url`/`_from_obj` **verbatim** (lines 104-154) — the tests pin both whole-JSON and SSE.

```python
"""Stdlib-only grsai (dakka) nano-banana image generator (Phase C).

Ported from integrations/vimax/image_generator_grsai.py: requests -> urllib
(mirrors services/vimax_broker_service.py _default_grsai_draw), asyncio dropped
(sync; the native orchestrator runs it in a worker thread), and the venv
ImageOutput (cv2/PIL/download_image) replaced by a minimal url-only ImageOutput.
The cost path is unchanged: POST {base_url} with the ticketId as Bearer; the
broker proxies /api/v2/vimax/draw and enforces cap/ledger.
"""
import json
import os
import threading
import urllib.request

_PATH_URL = {}
_LOCK = threading.Lock()


def _register(path, url):
    with _LOCK:
        _PATH_URL[os.path.abspath(path)] = url


def _lookup(path):
    with _LOCK:
        return _PATH_URL.get(os.path.abspath(path))


class ImageOutput:
    """Minimal url-only image handle. The render path always gets fmt='url'
    (grsai/broker return a public url); save() downloads it via urllib and
    registers path->url so later reference lookups resolve a public url
    (mirrors the venv ImageOutput.save monkeypatch)."""

    def __init__(self, fmt="url", ext="png", data=""):
        self.fmt = fmt
        self.ext = ext
        self.data = data

    def save(self, path):
        if self.fmt != "url" or not isinstance(self.data, str):
            raise ValueError(f"brain ImageOutput only supports fmt='url', got {self.fmt!r}")
        with urllib.request.urlopen(self.data, timeout=360) as resp:
            blob = resp.read()
        tmp = str(path) + ".tmp"
        with open(tmp, "wb") as handle:
            handle.write(blob)
        os.replace(tmp, path)
        _register(path, self.data)


class ImageGeneratorGrsai:
    def __init__(self, api_key, model="nano-banana-2",
                 base_url="https://grsai.dakka.com.cn/v1/draw/nano-banana"):
        self.api_key = api_key
        self.model = model
        self.base_url = base_url

    def generate_single_image(self, prompt, reference_image_paths=None, aspect_ratio="16:9", **kwargs):
        urls = []
        for p in reference_image_paths or []:
            if isinstance(p, str) and (p.startswith("http://") or p.startswith("https://")):
                urls.append(p)
                continue
            u = _lookup(p)
            if u:
                urls.append(u)
        payload = {"model": self.model, "prompt": prompt, "aspectRatio": aspect_ratio}
        if urls:
            payload["urls"] = urls
        url = self._submit_and_poll(payload)
        out = ImageOutput(fmt="url", ext="png", data=url)
        out.gen_prompt = prompt
        out.gen_refs = urls
        return out

    def _submit_and_poll(self, payload):
        body = json.dumps({k: v for k, v in payload.items() if k != "cost"}).encode("utf-8")
        request = urllib.request.Request(
            self.base_url, data=body, method="POST",
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
        )
        text = ""
        with urllib.request.urlopen(request, timeout=360) as resp:
            for raw in resp:
                text += raw.decode("utf-8", "ignore")
        return self._extract_url(text)

    @staticmethod
    def _extract_url(body):
        # VERBATIM from image_generator_grsai.py:104-154 (do not alter — tests
        # pin both the broker whole-JSON envelope and direct grsai SSE shapes).
        text = body or ""

        def _from_obj(obj):
            if not isinstance(obj, dict):
                return None
            if obj.get("status") == "failed":
                raise ValueError(f"grsai draw failed: {obj.get('failure_reason') or obj.get('error')}")
            if obj.get("status") == "succeeded":
                results = obj.get("results") or []
                if results:
                    return results[0].get("url")
            return None

        try:
            url = _from_obj(json.loads(text))
            if url:
                return url
        except ValueError as err:
            if "grsai draw failed" in str(err):
                raise
        except Exception:
            pass

        final_url = None
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            if line.startswith("data:"):
                line = line[5:].strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except Exception:
                continue
            url = _from_obj(obj)
            if url:
                final_url = url
        if not final_url:
            raise ValueError("grsai draw: no url in final response")
        return final_url
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest brain.image_gen_test -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add integrations/vimax/brain/image_gen.py integrations/vimax/brain/image_gen_test.py
git commit -m "feat(vimax): C1.1 - brain/image_gen.py (requests->urllib, stdlib ImageOutput)"
```

---

### Task C1.2: Port `ReferenceImageSelector` (`brain/reference_selector.py`, verbatim prompts)

**Files:**
- Create: `integrations/vimax/brain/reference_selector.py`
- Create: `integrations/vimax/brain/reference_selector_test.py`
- Reference (verbatim source): `D:/Aic/vimax/agents/reference_image_selector.py` — prompts at **12-57** (text-only system), **60-108** (multimodal system), **111-116** (human), output model **121-135**, `select_pairs_by_indices` **228-236**.

**Port rules:** Copy the three prompt strings **byte-for-byte** from the source line ranges. Drop langchain (`SystemMessage`/`HumanMessage`/`PydanticOutputParser`/`chain | parser`/`ainvoke`), tenacity (`@retry`), pydantic (`RefImageIndicesAndTextPrompt`), and `utils.image.image_path_to_b64`. The function becomes **sync**, takes `client` (a `GrsaiChatClient`), builds OpenAI `messages = [{"role":"system",...},{"role":"user","content":<list>}]` (the `human_content` list is already OpenAI multimodal format — keep it), calls `client.chat(messages)` + `extract_json`, reads `ref_image_indices` / `text_prompt` from the parsed dict. The `{format_instructions}` placeholder is filled by a static stdlib string `_FORMAT_INSTRUCTIONS` (PydanticOutputParser is gone) describing the JSON shape. `image_path_to_b64` → local `_data_uri(path)` (base64). A small bounded parse-retry replaces tenacity.

- [ ] **Step 1: Write the failing test** — `brain/reference_selector_test.py`

```python
import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from brain.reference_selector import select_reference_images_and_generate_prompt


class FakeChat:
    def __init__(self, reply):
        self.reply = reply
        self.calls = []

    def chat(self, messages, **kw):
        self.calls.append(messages)
        return self.reply


class ReferenceSelectorTest(unittest.TestCase):
    def test_selects_indices_and_returns_prompt(self):
        chat = FakeChat('{"ref_image_indices": [0, 2], "text_prompt": "a wide shot of the hero"}')
        pairs = [("a.png", "hero front"), ("b.png", "villain"), ("c.png", "scene")]
        out = select_reference_images_and_generate_prompt(chat, pairs, "hero enters the hall")
        self.assertEqual(out["text_prompt"], "a wide shot of the hero")
        self.assertEqual(out["reference_image_path_and_text_pairs"], [("a.png", "hero front"), ("c.png", "scene")])
        # System+user messages, user content is an OpenAI content list.
        msgs = chat.calls[-1]
        self.assertEqual(msgs[0]["role"], "system")
        self.assertEqual(msgs[1]["role"], "user")
        self.assertIsInstance(msgs[1]["content"], list)

    def test_out_of_range_index_is_dropped(self):
        chat = FakeChat('{"ref_image_indices": [0, 9], "text_prompt": "x"}')
        pairs = [("a.png", "t0"), ("b.png", "t1")]
        out = select_reference_images_and_generate_prompt(chat, pairs, "desc")
        self.assertEqual(out["reference_image_path_and_text_pairs"], [("a.png", "t0")])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest brain.reference_selector_test -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'brain.reference_selector'`

- [ ] **Step 3: Write `brain/reference_selector.py`**

Skeleton below; **paste the three prompt strings verbatim** from `reference_image_selector.py` into the marked constants (do not retype — copy the exact lines). `select_pairs_by_indices` is a **faithful re-port with one sanctioned deviation**: the source (lines 228-236) *raises* `ValueError` on an out-of-range index; the port **silently skips** it (per the Sync & verbatim contract §4 — a single bad LLM index must not crash a multi-shot render; the parse-retry re-asks on malformed output). This is intentional, not a byte-copy.

```python
"""Stdlib port of ViMax ReferenceImageSelector (Phase C). Prompts are VERBATIM
from D:/Aic/vimax/agents/reference_image_selector.py; langchain/tenacity/pydantic
dropped; sync; driven by brain.chat_client.GrsaiChatClient."""
import base64
import os

from .chat_client import extract_json

# >>> VERBATIM COPY: reference_image_selector.py lines 12-57 <<<
SYSTEM_PROMPT_TEXT_ONLY = """..."""  # copy byte-for-byte (keeps {format_instructions})
# >>> VERBATIM COPY: reference_image_selector.py lines 60-108 <<<
SYSTEM_PROMPT_MULTIMODAL = """..."""  # copy byte-for-byte (keeps {format_instructions})
# >>> VERBATIM COPY: reference_image_selector.py lines 111-116 <<<
HUMAN_PROMPT = """..."""  # copy byte-for-byte (keeps {frame_description})

# PydanticOutputParser.get_format_instructions() is gone; supply an equivalent
# static instruction describing RefImageIndicesAndTextPrompt (source 121-135).
_FORMAT_INSTRUCTIONS = (
    'Return ONLY a JSON object: '
    '{"ref_image_indices": [<int>, ...], "text_prompt": "<string>"}. '
    'ref_image_indices: indices (0-based) of the reference images to keep. '
    'text_prompt: the final image-generation prompt.'
)

_MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}
_PARSE_RETRIES = 2  # replaces tenacity @retry(stop_after_attempt(3))


def _data_uri(path):
    ext = os.path.splitext(str(path))[1].lower()
    mime = _MIME.get(ext, "image/png")
    with open(path, "rb") as handle:
        b64 = base64.b64encode(handle.read()).decode("ascii")
    return f"data:{mime};base64,{b64}"


def select_pairs_by_indices(pairs, indices):
    out = []
    seen = set()
    for i in indices or []:
        try:
            i = int(i)
        except (TypeError, ValueError):
            continue
        if 0 <= i < len(pairs) and i not in seen:
            out.append(pairs[i])
            seen.add(i)
    return out


def _ask(client, system_prompt, human_content):
    messages = [
        {"role": "system", "content": system_prompt.format(format_instructions=_FORMAT_INSTRUCTIONS)},
        {"role": "user", "content": human_content},
    ]
    last = None
    for _ in range(_PARSE_RETRIES + 1):
        data = extract_json(client.chat(messages))
        if isinstance(data, dict) and "ref_image_indices" in data:
            return data
        last = data
    return last if isinstance(last, dict) else {"ref_image_indices": [], "text_prompt": ""}


def select_reference_images_and_generate_prompt(client, available_image_path_and_text_pairs, frame_description):
    """Sync port. Returns {reference_image_path_and_text_pairs, text_prompt}.
    Mirrors the source two-stage flow: when >=8 images, text-only pre-filter
    first, then multimodal on the filtered set; else multimodal directly."""
    pairs = list(available_image_path_and_text_pairs or [])

    filtered = pairs
    if len(pairs) >= 8:
        text_content = [{"type": "text", "text": f"Image {i}: {t}"} for i, (_p, t) in enumerate(pairs)]
        text_content.append({"type": "text", "text": HUMAN_PROMPT.format(frame_description=frame_description)})
        pre = _ask(client, SYSTEM_PROMPT_TEXT_ONLY, text_content)
        filtered = select_pairs_by_indices(pairs, pre.get("ref_image_indices") or [])

    mm_content = []
    for i, (path, text) in enumerate(filtered):
        mm_content.append({"type": "text", "text": f"Image {i}: {text}"})
        mm_content.append({"type": "image_url", "image_url": {"url": _data_uri(path)}})
    mm_content.append({"type": "text", "text": HUMAN_PROMPT.format(frame_description=frame_description)})
    res = _ask(client, SYSTEM_PROMPT_MULTIMODAL, mm_content)
    chosen = select_pairs_by_indices(filtered, res.get("ref_image_indices") or [])
    return {
        "reference_image_path_and_text_pairs": chosen,
        "text_prompt": str(res.get("text_prompt") or frame_description),
    }
```

> **Note on the test vs the two-stage flow:** the `< 8 pairs` test path skips the text-only stage, so the fake chat's single reply drives the multimodal stage. The 3-pair test returns indices `[0,2]` → keeps pairs 0 and 2. Keep `_data_uri` reading real files out of the unit test by giving the test fake paths only when `len < 8` AND ensuring the multimodal branch is exercised — the test uses 3 pairs with non-existent paths, so guard `_data_uri` failures: wrap the per-image `open` in a try/except that **skips** an unreadable reference image (a missing local ref must not crash selection). Add that guard in Step 3 (wrap the `mm_content.append(... _data_uri(path) ...)` pair in `try/except OSError: continue`).

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest brain.reference_selector_test -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Verify prompts are byte-identical to source**

Run: `python -c "import re,sys; src=open('integrations/vimax/../vimax/agents/reference_image_selector.py',encoding='utf-8').read()" ` — then manually diff the three constants against source lines 12-57 / 60-108 / 111-116 (or use the dedicated check in C1.5 Step 3 if present). Expected: identical (ignoring the `{format_instructions}`/`{frame_description}` placeholders which are preserved).

> NOTE: the ViMax source lives at `D:/Aic/vimax/agents/reference_image_selector.py` (outside the repo, `HY_VIMAX_HOME` tree). Open it directly to copy.

- [ ] **Step 6: Commit**

```bash
git add integrations/vimax/brain/reference_selector.py integrations/vimax/brain/reference_selector_test.py
git commit -m "feat(vimax): C1.2 - brain/reference_selector.py (verbatim prompts, sync chat)"
```

---

### Task C1.3: Port `CharacterPortraitsGenerator` (`brain/portraits.py`, verbatim 3-view prompts)

**Files:**
- Create: `integrations/vimax/brain/portraits.py`
- Create: `integrations/vimax/brain/portraits_test.py`
- Reference (verbatim source): `D:/Aic/vimax/agents/character_portraits_generator.py` — `prompt_template_front` **17-22**, `prompt_template_side` **24-27**, `prompt_template_back` **29-32**; methods **44-92**.

**Port rules:** Copy the three prompt templates **byte-for-byte**. The source has **dead** langchain imports (never used) — omit them. Drop tenacity `@retry` — justified: the broker retries transient draw failures internally and refunds a hard failure, and the render path's judge reshoot loop is the render-side retry; a portrait view that still fails surfaces as an `error` record in `result.json` (and its failed draw is refunded), so an unbounded tenacity retry is neither needed nor desirable. `character: CharacterInScene` → plain `dict` (keys `identifier_in_scene`, `static_features`, `dynamic_features`). `image_generator` is the brain `ImageGeneratorGrsai`. **Reference chain is load-bearing:** front uses **no** reference; side & back **both** reference `front_image_path` only. Methods become **sync** (call sync `ImageGeneratorGrsai.generate_single_image`, no `await` — per the Sync & verbatim contract).

- [ ] **Step 1: Write the failing test** — `brain/portraits_test.py`

```python
import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from brain.portraits import CharacterPortraitsGenerator


class FakeImg:
    def __init__(self):
        self.calls = []

    def generate_single_image(self, prompt, reference_image_paths=None, **kw):
        self.calls.append({"prompt": prompt, "refs": list(reference_image_paths or [])})

        class Out:
            data = "https://b/p.png"

            def save(self, path):
                pass
        return Out()


class PortraitsTest(unittest.TestCase):
    def setUp(self):
        self.img = FakeImg()
        self.gen = CharacterPortraitsGenerator(self.img)
        self.char = {"idx": 0, "identifier_in_scene": "Alice",
                     "static_features": "tall, blue eyes", "dynamic_features": "red coat"}

    def test_front_has_no_reference(self):
        self.gen.generate_front_portrait(self.char, "anime")
        self.assertEqual(self.img.calls[-1]["refs"], [])
        self.assertIn("Alice", self.img.calls[-1]["prompt"])
        self.assertIn("anime", self.img.calls[-1]["prompt"])

    def test_side_and_back_reference_front(self):
        self.gen.generate_side_portrait(self.char, "front.png")
        self.assertEqual(self.img.calls[-1]["refs"], ["front.png"])
        self.gen.generate_back_portrait(self.char, "front.png")
        self.assertEqual(self.img.calls[-1]["refs"], ["front.png"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest brain.portraits_test -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'brain.portraits'`

- [ ] **Step 3: Write `brain/portraits.py`**

```python
"""Stdlib port of ViMax CharacterPortraitsGenerator (Phase C). Prompt templates
VERBATIM from D:/Aic/vimax/agents/character_portraits_generator.py:17-32; dead
langchain imports omitted; tenacity dropped; CharacterInScene -> dict; sync."""

# >>> VERBATIM COPY: character_portraits_generator.py lines 17-22 <<<
PROMPT_TEMPLATE_FRONT = """..."""  # keeps {identifier} {features} {style}
# >>> VERBATIM COPY: lines 24-27 <<<
PROMPT_TEMPLATE_SIDE = """..."""   # keeps {identifier}
# >>> VERBATIM COPY: lines 29-32 <<<
PROMPT_TEMPLATE_BACK = """..."""   # keeps {identifier}


def _features(character):
    # Reproduces source line 49's OUTPUT exactly: `"(static) " + static + "; (dynamic) " + dynamic`
    # (source +-concats a pydantic object; this f-string over the dict yields the identical string).
    return f"(static) {character.get('static_features', '')}; (dynamic) {character.get('dynamic_features', '')}"


class CharacterPortraitsGenerator:
    def __init__(self, image_generator):
        self.image_generator = image_generator

    def generate_front_portrait(self, character, style):
        prompt = PROMPT_TEMPLATE_FRONT.format(
            identifier=character.get("identifier_in_scene", ""),
            features=_features(character), style=style or "")
        return self.image_generator.generate_single_image(prompt=prompt)

    def generate_side_portrait(self, character, front_image_path):
        prompt = PROMPT_TEMPLATE_SIDE.format(identifier=character.get("identifier_in_scene", ""))
        return self.image_generator.generate_single_image(
            prompt=prompt, reference_image_paths=[front_image_path])

    def generate_back_portrait(self, character, front_image_path):
        prompt = PROMPT_TEMPLATE_BACK.format(identifier=character.get("identifier_in_scene", ""))
        return self.image_generator.generate_single_image(
            prompt=prompt, reference_image_paths=[front_image_path])
```

> Verify the exact `_features` format against source line 49 when copying — if the source uses a different separator, match it byte-for-byte.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest brain.portraits_test -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add integrations/vimax/brain/portraits.py integrations/vimax/brain/portraits_test.py
git commit -m "feat(vimax): C1.3 - brain/portraits.py (verbatim 3-view prompts, sync)"
```

---

### Task C1.4: Port `keyframe_judge` to sync `GrsaiChatClient` (`brain/keyframe_judge.py`)

**Files:**
- Create: `integrations/vimax/brain/keyframe_judge.py`
- Create: `integrations/vimax/brain/keyframe_judge_test.py`
- Reference (verbatim source): `integrations/vimax/keyframe_judge.py` — `SYSTEM_PROMPT` **20-45**, `parse_judge_verdict` **59-76**, `should_reshoot` **79-87**, `judge_capacity` **90-96**, `_coerce_bool` **48-56**, `_data_uri` **129-134**, `generate_with_judge` **99-126**, `KeyframeJudge.judge` **144-165**.

**Port rules:** Copy `SYSTEM_PROMPT` and the pure helpers (`parse_judge_verdict`, `should_reshoot`, `judge_capacity`, `_coerce_bool`, `_data_uri`) **verbatim**. `KeyframeJudge.judge` drops `from langchain_core.messages import ...` and `await self.chat_model.ainvoke(messages)`; it builds OpenAI `messages` (system + user-with-content-list, image blocks already OpenAI format) and calls **sync** `self.chat_model.chat(messages)` → `parse_judge_verdict(reply)`. Keep the fail-open `try/except → {acceptable: True}`. `generate_with_judge` becomes **sync** (callbacks `generate`/`judge` are sync) — this is a **deliberate async→sync re-port** (source is `async`), with the budget-loop semantics **unchanged** and re-pinned by the new sync test below. The old async `integrations/vimax/keyframe_judge.py` and its async test stay untouched until C5. **Billing note (matches spec §6):** a judge *rejection* re-runs `generate` → another **full, charged** draw (the broker has no view of the judge's verdict, so no refund); only an *upstream grsai/broker draw failure* is refunded. The GLOBAL `retries_remaining` bounds total reshoots so `draws ≤ shots + retryBudget ≤ ticket capTotal`.

- [ ] **Step 1: Write the failing test** — `brain/keyframe_judge_test.py`

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest brain.keyframe_judge_test -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'brain.keyframe_judge'`

- [ ] **Step 3: Write `brain/keyframe_judge.py`**

Copy the pure helpers + `SYSTEM_PROMPT` verbatim from `integrations/vimax/keyframe_judge.py`. Then the sync judge + sync loop:

```python
# (verbatim: SYSTEM_PROMPT [src 20-45], _coerce_bool [48-56], parse_judge_verdict
#  [59-76], should_reshoot [79-87], judge_capacity [90-96], _data_uri [129-134])

def generate_with_judge(*, generate, judge=None, max_attempts, retries_remaining, on_reshoot=None):
    """Sync port of keyframe_judge.generate_with_judge:99-126 (callbacks sync).
    Generate -> judge -> reshoot, GLOBAL retries_remaining gates total reshoots."""
    attempts = 0
    issues = ""
    verdict = {"acceptable": True, "issues": ""}
    result = None
    while True:
        attempts += 1
        result = generate(issues)
        if judge is None:
            break
        verdict = judge(result)
        if not should_reshoot(verdict.get("acceptable", True), attempts, max_attempts, retries_remaining):
            break
        retries_remaining -= 1
        issues = verdict.get("issues", "")
        if on_reshoot is not None:
            on_reshoot()
    return {"result": result, "attempts": attempts, "retries_remaining": retries_remaining, "verdict": verdict}


class KeyframeJudge:
    def __init__(self, chat_model):
        self.chat_model = chat_model  # brain.chat_client.GrsaiChatClient (sync, vision)

    def judge(self, frame_path, reference_pairs, target_description):
        import os as _os
        try:
            content = [{"type": "text",
                        "text": f"<TARGET_DESCRIPTION_START>\n{target_description}\n<TARGET_DESCRIPTION_END>"}]
            for idx, (path, text) in enumerate(reference_pairs or []):
                if not path or not _os.path.isfile(path):
                    continue
                content.append({"type": "text", "text": f"Reference Image {idx}: {text or ''}"})
                content.append({"type": "image_url", "image_url": {"url": _data_uri(path)}})
            if not frame_path or not _os.path.isfile(frame_path):
                return {"acceptable": True, "issues": ""}
            content.append({"type": "text", "text": "Generated keyframe to evaluate:"})
            content.append({"type": "image_url", "image_url": {"url": _data_uri(frame_path)}})
            messages = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": content}]
            reply = self.chat_model.chat(messages)
            return parse_judge_verdict(reply or "")
        except Exception:  # noqa: BLE001 - judge failure must never reshoot/charge
            return {"acceptable": True, "issues": ""}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest brain.keyframe_judge_test -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add integrations/vimax/brain/keyframe_judge.py integrations/vimax/brain/keyframe_judge_test.py
git commit -m "feat(vimax): C1.4 - brain/keyframe_judge.py (langchain->sync GrsaiChatClient, vision)"
```

---

### Task C1.5: Static import-isolation guard (`brain/import_isolation_test.py`)

**Files:**
- Create: `integrations/vimax/brain/import_isolation_test.py`

This enforces R-cost (brain never imports the broker/ledger) and venv-free (no langchain/tenacity/pydantic/requests/cv2/PIL) **statically** — not by running anything.

- [ ] **Step 1: Write the test**

```python
import ast, os, sys, unittest

BRAIN = os.path.dirname(__file__)
REPO = os.path.abspath(os.path.join(BRAIN, "..", "..", ".."))
ORCH = os.path.join(REPO, "services", "vimax_native_orchestrator.py")

FORBIDDEN = {
    "langchain", "langchain_core", "tenacity", "pydantic", "requests",
    "cv2", "PIL", "vimax_broker_service", "services.vimax_broker_service",
}


def _imports(path):
    tree = ast.parse(open(path, encoding="utf-8").read(), filename=path)
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                names.add(a.name.split(".")[0])
                names.add(a.name)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module.split(".")[0])
            names.add(node.module)
    return names


class ImportIsolationTest(unittest.TestCase):
    def test_brain_modules_are_stdlib_only(self):
        for fname in os.listdir(BRAIN):
            if not fname.endswith(".py") or fname.endswith("_test.py"):
                continue
            bad = _imports(os.path.join(BRAIN, fname)) & FORBIDDEN
            self.assertFalse(bad, f"brain/{fname} imports forbidden: {bad}")

    def test_native_orchestrator_never_imports_broker_or_ledger(self):
        names = _imports(ORCH)
        for forbidden in ("vimax_broker_service", "services.vimax_broker_service"):
            self.assertNotIn(forbidden, names,
                             "native orchestrator must not import the broker (R-cost)")
        # It also must not write the ledger/ticket files (grep the source text).
        src = open(ORCH, encoding="utf-8").read()
        self.assertNotIn("vimax_ledger", src)
        self.assertNotIn("vimax_tickets", src)

    def test_no_dynamic_broker_import_anywhere(self):
        # Static import analysis above misses importlib.import_module(...) /
        # __import__(...); guard those by source-text scan across brain/* + orch.
        targets = [os.path.join(BRAIN, f) for f in os.listdir(BRAIN)
                   if f.endswith(".py") and not f.endswith("_test.py")] + [ORCH]
        for path in targets:
            src = open(path, encoding="utf-8").read()
            if "vimax_broker_service" in src:
                self.assertNotIn("import_module", src, f"{path}: dynamic broker import")
                self.assertNotIn("__import__", src, f"{path}: dynamic broker import")
            # A literal "vimax_broker_service" string anywhere in brain/orch is a
            # smell even if not a dynamic import — fail and force a human look.
            self.assertNotIn("vimax_broker_service", src,
                             f"{path}: references the broker module (R-cost isolation)")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run — expected PASS now** (C1.1-C1.4 already avoid these imports)

Run: `python -m unittest brain.import_isolation_test -v`
Expected: PASS (2 tests). If it fails, the offending brain module has a forbidden import — fix the port, do not weaken the test.

- [ ] **Step 3: Commit**

```bash
git add integrations/vimax/brain/import_isolation_test.py
git commit -m "test(vimax): C1.5 - static import-isolation guard (R-cost + venv-free)"
```

---

## C2 — Native `run_render` + route + api + panel — FREE

### Task C2.1: `brain/render_runner.py` — ported render orchestration (injected IO)

**Files:**
- Create: `integrations/vimax/brain/render_runner.py`
- Create: `integrations/vimax/brain/render_runner_test.py`
- Reference (control flow + result.json shape): `integrations/vimax/huanying_runner.py:234-409` (`run_render`) + helpers **67-137**, **226-231**, **422-512**.

**Design:** Port `run_render` into a **sync** function `run_render(*, working_dir, flow_id, chat_client, image_gen, shot_idxs=None, edits=None, invalidate_shot_idxs=None, retry_budget=0, max_reshoots_per_shot=1, on_step=None, should_cancel=None) -> dict`. IO is **injected** (chat_client for selector+judge, image_gen for draws) so the test runs with fakes (zero spend). **Per the Sync & verbatim contract:** the source `run_render` is `async` and `await`s the selector/image_gen/judge (huanying_runner.py:346,361,367,376) — drop every `await`, because the injected `chat_client.chat` and `image_gen.generate_single_image` are sync (C1). Shots render **sequentially** (source `for` loop at :304; no `asyncio.gather`/concurrency), so the sync port mirrors the loop one-for-one. No `asyncio.run`. Copy the pure helpers (`merge_shot_edits`, `invalidate_shots`, `portrait_character_dicts`, `portrait_capacity`, `fanout_portrait_registry`, `invalidate_portraits`, `_safe_path_component`, `_read_json`) into `render_runner.py` **verbatim** from `huanying_runner.py` (or import them — but importing `huanying_runner` triggers its stdout reconfigure + `skills_index` import; **copy them** to keep brain self-contained and on the import-isolation allowlist). Preserve the verbatim assembly strings: reference prefix (`huanying_runner.py:350-351`), the `[QC 反馈,请修正]:` reshoot prefix (**:360**), the continuity label `"Previous shot's frame - keep characters/style consistent."` (**:386**). Emit `step` events via `on_step(stage, data)`; check `should_cancel()` at each shot boundary (raise the brain `PlanCancelled`? — render uses its own loop; use a sentinel: if `should_cancel()` returns True at a shot boundary, stop and return the partial result with `"cancelled": True`). Write `result.json` (schema `vimax-render-result/v1`) atomically.

- [ ] **Step 1: Write the failing test** — `brain/render_runner_test.py`

Set up a temp `working_dir` with a minimal `shotplan.json` + one scene + one shot's `shot_description.json` + `characters.json` + an empty `character_portraits_registry.json`. Inject a `FakeChat` (returns selector JSON, then judge `acceptable:true`) and a `FakeImg` (returns an `ImageOutput`-like with `.save` writing a stub png + `.data="https://b/f.png"`). Assert: `result["schemaVersion"]=="vimax-render-result/v1"`, `len(result["outputs"])==1`, the output has `url`, `image_gen` called once (no reshoot), `result.json` exists on disk.

```python
import json, os, sys, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from brain import render_runner


class FakeChat:
    def chat(self, messages, **kw):
        # selector asks first; judge asks with images. Return selector JSON for
        # the selector call (has <FRAME_DESC>), accept for the judge call.
        blob = json.dumps(messages)
        if "TARGET_DESCRIPTION_START" in blob:
            return '{"acceptable": true, "issues": ""}'
        return '{"ref_image_indices": [], "text_prompt": "a shot"}'


class FakeOut:
    data = "https://b/f.png"

    def save(self, path):
        with open(path, "wb") as h:
            h.write(b"\x89PNG stub")


class FakeImg:
    def __init__(self):
        self.n = 0

    def generate_single_image(self, prompt, reference_image_paths=None, **kw):
        self.n += 1
        return FakeOut()


def _seed(working_dir):
    shotplan = {"schemaVersion": "vimax-shotplan/v1", "flowId": "f1",
                "scenes": [{"idx": 0}], "characters": [],
                "shots": [{"idx": 0, "sceneIdx": 0, "localIdx": 0, "camIdx": 0,
                           "variationType": "small", "ffDesc": "hero enters the grand hall at dusk"}]}
    with open(os.path.join(working_dir, "shotplan.json"), "w", encoding="utf-8") as h:
        json.dump(shotplan, h)
    shot_dir = os.path.join(working_dir, "scene_0", "shots", "0")
    os.makedirs(shot_dir, exist_ok=True)
    with open(os.path.join(shot_dir, "shot_description.json"), "w", encoding="utf-8") as h:
        json.dump({"ff_desc": "hero enters the grand hall at dusk", "ff_vis_char_idxs": []}, h)
    with open(os.path.join(working_dir, "scene_0", "characters.json"), "w", encoding="utf-8") as h:
        json.dump([], h)
    with open(os.path.join(working_dir, "scene_0", "character_portraits_registry.json"), "w", encoding="utf-8") as h:
        json.dump({}, h)


class RenderRunnerTest(unittest.TestCase):
    def test_single_shot_render_writes_result(self):
        with tempfile.TemporaryDirectory() as wd:
            _seed(wd)
            img = FakeImg()
            result = render_runner.run_render(
                working_dir=wd, flow_id="f1", chat_client=FakeChat(), image_gen=img,
                retry_budget=2, max_reshoots_per_shot=1)
            self.assertEqual(result["schemaVersion"], "vimax-render-result/v1")
            self.assertEqual(len(result["outputs"]), 1)
            self.assertEqual(result["outputs"][0].get("url"), "https://b/f.png")
            self.assertEqual(img.n, 1)  # no reshoot (judge accepted)
            self.assertTrue(os.path.isfile(os.path.join(wd, "result.json")))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest brain.render_runner_test -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'brain.render_runner'`

- [ ] **Step 3: Write `brain/render_runner.py`** — port `huanying_runner.run_render` to sync with injected `chat_client`/`image_gen`, using `brain.reference_selector.select_reference_images_and_generate_prompt` + `brain.keyframe_judge.{KeyframeJudge,generate_with_judge}`. Copy the pure helpers verbatim. Build the selector via the injected `chat_client`; the judge via `KeyframeJudge(chat_client)`. Preserve the result.json schema:

```python
result = {"schemaVersion": "vimax-render-result/v1", "flowId": flow_id, "mode": "render",
          "outputs": outputs, "elapsedSec": elapsed}
```

> Mirror the source loop exactly (lines 304-394): cache-skip when `first_frame.png` exists; build reference pairs from the per-scene registry (prefer `.url` over `.path`); append the previous shot's local frame for continuity; call selector; `generate_with_judge` with `_gen`/`_judge`/`on_reshoot`; thread `global_retries_remaining`. Emit `on_step("output", {...})` per shot. After the loop, write `result.json` atomically (tmp+replace).

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest brain.render_runner_test -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add integrations/vimax/brain/render_runner.py integrations/vimax/brain/render_runner_test.py
git commit -m "feat(vimax): C2.1 - brain/render_runner.run_render (sync, injected IO)"
```

---

### Task C2.2: Orchestrator `run_render` + route + dispatcher + api + server wiring

**Files:**
- Modify: `services/vimax_native_orchestrator.py` (add `mode` + `(mode,flowId)` dedup; `run_render`; `_run_render`; `broker_url_getter`)
- Modify: `services/vimax_route_service.py:73-147` (add `/native/render` POST)
- Modify: `services/http_route_dispatcher.py` (`_VIMAX_POST_PATHS`)
- Modify: `api/canvasAgentApi.js` (after `vimaxNativeResume`, ~line 312)
- Modify: `server.py:934-939` (pass `broker_url_getter`)
- Modify test: `services/vimax_native_orchestrator_test.py` (add a render-job test with fakes)

- [ ] **Step 1: Write the failing orchestrator test** (append to the existing orchestrator test file; if none, create `services/vimax_native_orchestrator_test.py`)

```python
def test_run_render_streams_and_finishes(self):
    # client_factory injects a fake chat; broker_url_getter + a fake image_gen
    # via an injected image_gen_factory so no network/spend.
    orch = NativeOrchestratorService(
        user_dir_getter=lambda: self.tmp,        # a temp dir seeded like render_runner_test
        credentials_getter=lambda: {"apiKey": "k"},
        client_factory=lambda: FakeChat(),
        broker_url_getter=lambda: "http://127.0.0.1:0/api/v2/vimax/draw",
        image_gen_factory=lambda ticket, broker: FakeImg(),
    )
    started = orch.run_render({"flowId": "f1", "ticketId": "t1"})
    self.assertTrue(started["success"])
    job_id = started["jobId"]
    _wait_terminal(orch, job_id)        # poll job_status until status in done/failed
    st = orch.job_status(job_id)
    self.assertEqual(st["status"], "done")
    self.assertEqual(st["result"]["schemaVersion"], "vimax-render-result/v1")
```

- [ ] **Step 2: Run — verify it fails** (`run_render`/`image_gen_factory` don't exist)

Run: `python -m unittest services.vimax_native_orchestrator_test -v`
Expected: FAIL — `AttributeError: 'NativeOrchestratorService' object has no attribute 'run_render'`

- [ ] **Step 3a: Add `mode` + `(mode,flowId)` dedup + `broker_url_getter` + `image_gen_factory`**

In `__init__` (services/vimax_native_orchestrator.py:40-60), add params:
```python
def __init__(self, *, user_dir_getter, credentials_getter,
             skills_dir_getter=None, client_factory=None, broker_url_getter=None,
             image_gen_factory=None, max_workers=1, max_concurrent_plans=2,
             job_ttl_seconds=1800, paused_ttl_seconds=7200, clock=time.time):
    ...
    self._broker_url_getter = broker_url_getter or (lambda: "")
    self._image_gen_factory = image_gen_factory  # tests inject a fake image gen
```

In `plan()` (line 107), add `"mode": "plan",` to the job dict. Add a dedup helper:
```python
def _running_for(self, mode, flow_id):
    for jid, j in self._jobs.items():
        if j["status"] == "running" and j.get("mode") == mode and j["flowId"] == flow_id:
            return jid
    return None
```
and use it in `plan()` in place of the inline flowId scan (keeping behavior identical for `mode="plan"`).

Add the image-gen builder:
```python
def _build_image_gen(self, ticket_id):
    if self._image_gen_factory is not None:
        return self._image_gen_factory(ticket_id, self._broker_url_getter())
    _ensure_brain_on_path()
    from brain.image_gen import ImageGeneratorGrsai
    return ImageGeneratorGrsai(api_key=str(ticket_id), base_url=self._broker_url_getter())
```

- [ ] **Step 3b: Add `run_render` + `_run_render`** (mirror `plan`/`_run`)

```python
def run_render(self, payload=None):
    payload = dict(payload or {})
    flow_id = str(payload.get("flowId") or "")
    if not flow_id or not is_safe_flow_id(flow_id):
        return {"success": False, "error": "invalid or missing flowId"}
    ticket_id = str(payload.get("ticketId") or "")
    if not ticket_id:
        return {"success": False, "error": "render requires a ticketId (sign a budget first)"}
    client = self._build_client()
    if client is None:
        return {"success": False, "status": "not-configured",
                "error": "grsai credentials not configured (user/config.json)"}
    image_gen = self._build_image_gen(ticket_id)
    with self._lock:
        self._reap_locked()
        dup = self._running_for("render", flow_id)
        if dup:
            return {"success": True, "jobId": dup, "status": "running", "alreadyRunning": True}
        job_id = f"vimax-native-render-{uuid.uuid4().hex[:12]}"
        self._jobs[job_id] = {
            "flowId": flow_id, "mode": "render", "status": "running", "progress": [],
            "result": None, "error": "", "cancel": False,
            "startedAt": self._clock(), "finishedAt": None, "persistError": None,
        }
    threading.Thread(target=self._run_render, args=(job_id, payload, client, image_gen),
                     daemon=True).start()
    return {"success": True, "jobId": job_id, "status": "running"}

def _run_render(self, job_id, payload, client, image_gen):
    _ensure_brain_on_path()
    from brain import render_runner
    try:
        def on_step(stage, data):
            self._emit(job_id, {"type": "step", "stage": stage, "payload": data})
        working_dir = os.path.join(self._user_dir_getter() or ".", "vimax_runs",
                                   str(payload.get("flowId")))
        result = render_runner.run_render(
            working_dir=working_dir, flow_id=str(payload.get("flowId")),
            chat_client=client, image_gen=image_gen,
            shot_idxs=payload.get("shotIdxs"), edits=payload.get("edits"),
            invalidate_shot_idxs=payload.get("invalidateShotIdxs"),
            retry_budget=int(payload.get("retryBudget") or 0),
            max_reshoots_per_shot=int(payload.get("maxReshootsPerShot") or 1),
            on_step=on_step, should_cancel=lambda: self._is_cancelled(job_id))
        self._finish(job_id, "done", result=result)
    except Exception as exc:  # noqa: BLE001
        self._finish(job_id, "failed", error=str(exc))
```

- [ ] **Step 3c: Route** — `services/vimax_route_service.py`, in `handle_post` after the `/native/resume` block (line 125), before `/sign`:
```python
if base == "/api/v2/vimax/native/render":
    if self.native is None:
        return self._json_err(503, "native orchestrator unavailable")
    data, error = self._parse_json_object(body)
    if error is not None:
        return error
    return self._json_ok(self.native.run_render(data))
```

- [ ] **Step 3d: Dispatcher whitelist** — `services/http_route_dispatcher.py`, add to `_VIMAX_POST_PATHS`:
```python
    "/api/v2/vimax/native/render",
```

- [ ] **Step 3e: API client** — `api/canvasAgentApi.js`, after `vimaxNativeResume`:
```javascript
vimaxNativeRender(payload) {
  return postJson(fetchImpl, "/api/v2/vimax/native/render", payload);
},
```

- [ ] **Step 3f: Server wiring** — `server.py:934-939`, add `broker_url_getter`:
```python
    VIMAX_NATIVE_ORCHESTRATOR = NativeOrchestratorService(
        user_dir_getter=lambda: USER_DIR,
        credentials_getter=VIMAX_BRIDGE_SERVICE._default_credentials,
        skills_dir_getter=VIMAX_BRIDGE_SERVICE._default_skills_dir,
        broker_url_getter=lambda: f"http://127.0.0.1:{PORT}/api/v2/vimax/draw",
        max_workers=_vimax_workers,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m unittest services.vimax_native_orchestrator_test -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/vimax_native_orchestrator.py services/vimax_route_service.py services/http_route_dispatcher.py api/canvasAgentApi.js server.py services/vimax_native_orchestrator_test.py
git commit -m "feat(vimax): C2.2 - native run_render route/api/dedup + broker_url_getter"
```

---

### Task C2.3: Panel — `applyVimaxNativeRenderCommand` + dispatch branch

**Files:**
- Modify: `modules/app/appAssistantPanel.js` — new `applyVimaxNativeRenderCommand` near `applyVimaxRenderCommand` (3770); native branch at the **real dispatch site** (4922 — `return await applyVimaxRenderCommand(...)`).

> **Dispatch-site note (verified):** there are TWO sites matching `parseVimaxRenderConfirm`. Line **4781** is a **predicate-pass** that only `return true`s to claim the message — **do NOT edit it**. The actual dispatch is line **4922** (`return await applyVimaxRenderCommand(message, options)`). Only 4922 gets the native branch. The 4781 predicate's `typeof api.vimaxRender === "function"` guard still holds through C2–C4 (the external API method is not removed until C5), so a native deployment still claims the confirm with no predicate change. (C5 updates the predicate to also accept `api.vimaxNativeRender`.)

**Design:** Copy `applyVimaxRenderCommand` (3770-3966) into `applyVimaxNativeRenderCommand`, changing ONLY: (a) submit `await api.vimaxRender(...)` → `await api.vimaxNativeRender(...)` (3849); (b) poll `await api.vimaxJob(...)` → `await api.vimaxNativeJob(...)` (3894) — the native job_status shape is identical (`{status, progress, progressTotal, result, error}`), so the polling/landing code is otherwise unchanged. Keep keyframe landing (`graphStore.updateNodeData`), `vimaxRenderInFlight` guard, error handling, and `state.pendingVimaxRender = null` reset identical.

- [ ] **Step 1: Add the native branch at the real render dispatch site (4922 only)**

Replace the body of the line-4922 dispatch (`return await applyVimaxRenderCommand(message, options);`) with a native-first branch (mirrors the plan-lane branch at 4959). **Leave 4781 untouched.**
```javascript
// 4922 dispatch — native-first when the server has the in-process brain.
if (parseVimaxRenderConfirm(message) && state.pendingVimaxRender && api && typeof api.vimaxRender === "function") {
  if (typeof api.vimaxNativeRender === "function" && (await shouldUseNativeVimax())) {
    return await applyVimaxNativeRenderCommand(message, options);
  }
  return await applyVimaxRenderCommand(message, options);
}
```

- [ ] **Step 2: Add `applyVimaxNativeRenderCommand`** (copy of `applyVimaxRenderCommand` with the two API-call swaps above). Place it immediately before `applyVimaxRenderCommand` (line 3770).

- [ ] **Step 3: Verify in the browser preview** (server already serves source ES modules; reload)

Start the server with native on, open the canvas, run a plan (native), then confirm 成片. With `HY_VIMAX_NATIVE=1` and grsai creds present, `shouldUseNativeVimax()` returns true and the render routes to `/native/render`. **This step is structural only — do NOT confirm a paid draw here; verify the request lands on `/api/v2/vimax/native/render` (preview_network) and the job polls `/native/jobs`.** Paid output is C4.

Run (PowerShell): `$env:HY_VIMAX_NATIVE=1; python server.py` (or reuse the running 8779 instance). Use preview_network to confirm the POST path.
Expected: render confirm POSTs `/api/v2/vimax/native/render`, then GETs `/api/v2/vimax/native/jobs?jobId=...`.

- [ ] **Step 4: Commit**

```bash
git add modules/app/appAssistantPanel.js
git commit -m "feat(vimax): C2.3 - panel native render command + dispatch branch"
```

---

## C3 — Native `run_portraits` + route + api + panel — FREE

### Task C3.1: `brain/render_runner.py` — `run_portraits` (sync, injected IO)

**Files:**
- Modify: `integrations/vimax/brain/render_runner.py` (add `run_portraits`)
- Modify: `integrations/vimax/brain/render_runner_test.py` (add a portraits test)
- Reference: `huanying_runner.py:515-624` + helpers `portrait_character_dicts` **433-454**, `portrait_capacity` **457-464**, `fanout_portrait_registry` **467-486**, `invalidate_portraits` **489-512**.

**Design:** `run_portraits(*, working_dir, flow_id, image_gen, style="", character_idxs=None, invalidate_character_idxs=None, on_step=None, should_cancel=None) -> dict`. Uses `brain.portraits.CharacterPortraitsGenerator(image_gen)`. **Per the Sync & verbatim contract:** the source `run_portraits` is `async` and `await`s the three portrait generators (huanying_runner.py:576,582,588); drop every `await` — `CharacterPortraitsGenerator.generate_{front,side,back}_portrait` are sync (C1.3) and call sync `image_gen.generate_single_image`. Characters/views are generated **sequentially** (source `for` loops), mirrored one-for-one. No `asyncio.run`. Preserve the three-view reference chain (front no-ref; side/back ref the saved `front.png`), the registry schema `{ident: {view: {path, description, url}}}`, the portrait-dir naming `character_portraits/{idx}_{safe_path_component(ident)}`, and the result schema `vimax-portraits-result/v1`. Preserve the description string `f"A {view} view portrait of {ident}."` (huanying_runner:593-595) verbatim.

- [ ] **Step 1: Write the failing portraits test** (temp working_dir with a shotplan that has one visible character; inject `FakeImg`; assert 3 views generated, front called with no ref, side/back with the front path, registry written, result schema `vimax-portraits-result/v1`, `image_gen` called 3×).

- [ ] **Step 2: Run — verify it fails** (`run_portraits` missing)

Run: `python -m unittest brain.render_runner_test -v`
Expected: FAIL — `AttributeError: module 'brain.render_runner' has no attribute 'run_portraits'`

- [ ] **Step 3: Implement `run_portraits`** mirroring `huanying_runner.run_portraits` (sync; injected image_gen; reuse the copied pure helpers).

- [ ] **Step 4: Run — verify it passes**

Run: `python -m unittest brain.render_runner_test -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add integrations/vimax/brain/render_runner.py integrations/vimax/brain/render_runner_test.py
git commit -m "feat(vimax): C3.1 - brain/render_runner.run_portraits (sync, injected IO)"
```

---

### Task C3.2: Orchestrator `run_portraits` + route + dispatcher + api

**Files:** same set as C2.2, `portraits` variant.

- [ ] **Step 1: Failing orchestrator test** — `test_run_portraits_finishes` (mirror the render job test; assert `result["schemaVersion"]=="vimax-portraits-result/v1"`).
- [ ] **Step 2: Run — verify it fails.**
- [ ] **Step 3a: Orchestrator** — add `run_portraits(payload)` + `_run_portraits(job_id, payload, image_gen)` (portraits needs no chat client — it only draws; build only `image_gen`). Job `mode="portraits"`, id prefix `vimax-native-portraits-`. Dedup `_running_for("portraits", flow_id)`.
- [ ] **Step 3b: Route** — `/api/v2/vimax/native/portraits` → `self.native.run_portraits(data)`.
- [ ] **Step 3c: Dispatcher** — add `"/api/v2/vimax/native/portraits"` to `_VIMAX_POST_PATHS`.
- [ ] **Step 3d: API** — `vimaxNativePortraits(payload)` → `postJson(... "/api/v2/vimax/native/portraits" ...)`.
- [ ] **Step 4: Run tests — verify pass.**
- [ ] **Step 5: Commit** — `feat(vimax): C3.2 - native run_portraits route/api`.

---

### Task C3.3: Panel — `applyVimaxNativePortraitsRenderCommand` + dispatch branch

**Files:** `modules/app/appAssistantPanel.js` (new fn near 4130; native branch at the **real dispatch site** 4926 only — 4784 is the predicate-pass, leave it untouched, same as C2.3).

- [ ] **Step 1:** Replace the line-4926 dispatch body (`return await applyVimaxPortraitsRenderCommand(message, options);`) with a native-first branch (mirror C2.3 Step 1, using `api.vimaxNativePortraits` / `applyVimaxNativePortraitsRenderCommand`). **Leave 4784 (predicate-pass) untouched.**
- [ ] **Step 2:** Add `applyVimaxNativePortraitsRenderCommand` = copy of `applyVimaxPortraitsRenderCommand` (4130-4286) swapping submit `api.vimaxPortraits`→`api.vimaxNativePortraits` (4185) and poll `api.vimaxJob`→`api.vimaxNativeJob` (4236).
- [ ] **Step 3:** Preview-verify the request lands on `/native/portraits` + polls `/native/jobs` (structural only — no paid draw).
- [ ] **Step 4: Commit** — `feat(vimax): C3.3 - panel native portraits command + dispatch branch`.

---

## C4 — A/B Golden Reconcile + Real-Machine (GATED on money-confirm)

### Task C4.1: `brain/render_compare.py` — structural result profiles + compare

**Files:**
- Create: `integrations/vimax/brain/render_compare.py`
- Create: `integrations/vimax/brain/render_compare_test.py`
- Pattern reference: `integrations/vimax/brain/golden_compare.py` (profile + `compare_profiles`).

**Design:** Mirror `golden_compare.py` but for `result.json`. `render_result_profile(result)` → `{schemaVersion, outputCount, allHaveUrl, errorCount}`; `portraits_result_profile(result)` → `{schemaVersion, charCount, viewsPerChar(list), allViewsHaveUrl, errorCount}`. `compare_render_profiles(external, native, *, count_tolerance=1)` and `compare_portraits_profiles(...)` → `{equivalent, hardFailures, countDeltas, notes}`. Free, pure, no IO.

- [ ] **Step 1: Write the failing test** — two equivalent render profiles compare `equivalent: True`; a schemaVersion mismatch or an outputCount delta beyond tolerance → `equivalent: False`.
- [ ] **Step 2: Run — verify it fails.**
- [ ] **Step 3: Implement `render_compare.py`.**
- [ ] **Step 4: Run — verify pass.**
- [ ] **Step 5: Commit** — `feat(vimax): C4.1 - brain/render_compare structural result parity`.

### Task C4.2: A/B reconcile harness (FREE, mock image_gen)

**Files:**
- Create: `integrations/vimax/brain/render_golden_run.py` (mirrors `brain/golden_run.py`).

**Design:** A script that runs **native** `run_render`/`run_portraits` with a **mock image_gen** (returns deterministic fake urls — no spend) against a seeded `working_dir`, loads an external `result.json` artifact if present, and prints `compare_render_profiles` / `compare_portraits_profiles` verdicts. This is the structural gate; it proves the native result.json is contract-equivalent without drawing.

- [ ] **Step 1:** Write `render_golden_run.py` (CLI: `--working-dir`, `--external-result <path>` optional, `--mode render|portraits`).
- [ ] **Step 2:** Run on a seeded fixture working_dir; assert the native profile satisfies the hard invariants (schemaVersion, outputs present). Expected: `equivalent: True` (or, with no external artifact, native profile prints + passes its own invariants).
- [ ] **Step 3: Commit** — `feat(vimax): C4.2 - native render/portraits golden reconcile harness (free)`.

### Task C4.3: 🔴 REAL-MACHINE verification (PAID — STOP for explicit user confirm)

> **MONEY GATE.** Do NOT run this task autonomously. Before any paid draw:
> 1. Present the user with: budget (ticket cap), shot count / character count, and the **predicted draw count** (`shots + retryBudget` for render; `3 × visibleChars` for portraits).
> 2. Wait for explicit confirmation.
> 3. Only then run native render/portraits against real grsai through the broker.

- [ ] **Step 1: STOP** — present the cost estimate; obtain explicit user money-confirm.
- [ ] **Step 2 (after confirm):** Run a minimal native render (1-2 shots) + portraits (1 character) on the real canvas with `HY_VIMAX_NATIVE=1`. Verify: keyframes/portraits land on canvas nodes; `result.json` written; ledger `spent == draw count` and `spent ≤ ticket capTotal` (broker enforced); refund on any failed draw.
- [ ] **Step 3:** Run `render_golden_run.py --external-result <a prior external result.json>` to confirm the real native result is structurally equivalent to a real external run.
- [ ] **Step 4: Commit the verification log** — `docs/...` (no code).

---

## C5 — Retire External Runtime (rollback-flagged)

### Task C5.1: Make native the default for render/portraits (keep rollback)

**Files:** `modules/app/appAssistantPanel.js` (dispatch), `server.py`.

- [ ] **Step 1:** With C2/C3 landed and C4 green, the dispatch already prefers native when `shouldUseNativeVimax()`. Document that setting `HY_VIMAX_NATIVE=1` makes plan + render + portraits all native; unset falls back to external (rollback path intact). No code change beyond a comment + a smoke verifying the fallback still routes to `/api/v2/vimax/render` when native is off.
- [ ] **Step 2: Commit** — `chore(vimax): C5.1 - native default for render/portraits behind HY_VIMAX_NATIVE (external fallback retained)`.

### Task C5.2: Remove the venv render/portraits path (after a soak)

> Only after the user confirms the native path is trusted in production. This deletes code — do it as its own reviewable commit.

**Files:** `integrations/vimax/huanying_runner.py` (drop `run_render`/`run_portraits` + their `main` branches — keep `run_plan` until plan is also retired, or delete the file if plan is already native), `integrations/vimax/image_generator_grsai.py`, the old async `integrations/vimax/keyframe_judge.py`, and the `agents`/langchain venv dependency for render+portraits.

- [ ] **Step 1:** Confirm nothing imports the removed modules (codegraph_impact / grep for `run_render`, `ImageGeneratorGrsai`, `huanying_runner`).
- [ ] **Step 1b:** Update the panel **predicate-pass** guards (appAssistantPanel.js:4781 render, 4784 portraits) and the real-dispatch guards (4922/4926) that read `typeof api.vimaxRender === "function"` / `api.vimaxPortraits` — once the external API methods are removed they would go falsy and the confirm would stop being claimed. Switch them to accept the native methods (`api.vimaxNativeRender` / `api.vimaxNativePortraits`).
- [ ] **Step 2:** Delete the external render/portraits path; keep `_venv_python`/bridge only if `run_plan` still needs it (else remove the bridge render/portraits methods too).
- [ ] **Step 3:** Run the full brain + orchestrator + route test suites green.
- [ ] **Step 4: Commit** — `refactor(vimax): C5.2 - retire external venv render/portraits runtime`.

---

## Acceptance (maps to spec §12)

- **AC1** native render produces keyframes, writes back/invalidates, result contract == external (C2 + C4 structural).
- **AC2** native portraits produces 3 views + registry fanout == external (C3 + C4).
- **AC3** cost chain zero-change: sign/draw/cap/refund/ledger unchanged; native never writes ledger / never imports broker (C1.5 static test + AC5 real run).
- **AC4** global `HY_VIMAX_NATIVE` routing; external fallback works (C5.1 smoke).
- **AC5** real machine: `spent == draws`, `spent ≤ capTotal` (C4.3, gated).
- **AC6** plan+render+portraits all native → venv retired (C5.2).

---

## Self-Review (run after authoring; fix inline)

- **Spec coverage:** §2 ports → C1.1-C1.4 (+ C2.1/C3.1 for the runners); §3 R-cost → C1.5 + cost path in C2.2; R-verbatim → verbatim-copy steps + the C1.2 byte-diff check; R-AB → C2.3/C3.3 dispatch + C5.1; R-dedup → `_running_for(mode,flowId)` in C2.2; §6 billing → preserved by the unchanged broker + `generate_with_judge` budget loop (C1.4) + the AC5 ledger check; §10 tests → every C1/C2/C3 task has a unit test + the static isolation test + the C4 structural gate; §11 phasing → C1-C5 = the spec's C1-C5; §12 acceptance → AC1-AC6 above.
- **Type consistency:** `run_render`/`run_portraits` keyword args match between `brain/render_runner.py` (C2.1/C3.1) and the orchestrator `_run_render`/`_run_portraits` callers (C2.2/C3.2). `result.json` schemaVersions (`vimax-render-result/v1`, `vimax-portraits-result/v1`) match between the runner, the orchestrator result, and `render_compare.py`. API methods `vimaxNativeRender`/`vimaxNativePortraits` match between `canvasAgentApi.js` (C2.2/C3.2) and the panel callers (C2.3/C3.3).
- **Placeholders:** the only `"""..."""` placeholders are the **verbatim-copy** prompt constants — these are intentional (copy byte-for-byte from the named source line ranges; transcribing 200 lines into the plan would risk drift). Every other code block is complete.

---

## Review 收口 (adversarial plan-vs-source pass — folded in)

A 4-dimension review read this plan against the real ViMax/huanying source. Resolutions:

1. **[critical→resolved] async→sync was implicit.** The source render/portraits/judge are `async` + `await`; the port is sync. Added the **Sync & verbatim contract** (top) + explicit "drop every `await`, callees are sync" notes in C1.2/C1.3/C1.4/C2.1/C3.1. The injected `chat_client.chat`/`image_gen.generate_single_image` are sync (C1.1/C1.4), so this is correct — but now stated so no implementer naively strips `await` from a still-async call.
2. **[critical→resolved] R-verbatim over-claimed.** Re-scoped R-verbatim to **prompt strings only**; the surrounding Python is a deliberate async→sync / de-langchain / dict-based re-port. Sanctioned deviations enumerated (contract §4): `select_pairs_by_indices` tolerant-skip, `_features` f-string (identical output to source line 49), sync `generate_with_judge`/`judge`, minimal `ImageOutput`, dropped `@retry`.
3. **[major→resolved] panel dispatch site.** The plan said "branch at 4781 + 4922"; **4781 is a predicate-pass** (`return true`), the real dispatch is **4922** (render) / **4926** (portraits). Corrected C2.3/C3.3 to edit only the real site, leave the predicate untouched (its `api.vimaxRender` guard holds through C4), and added C5.1b/C5.2-Step1b to flip the predicate guards to native when the external API is removed.
4. **[major→resolved] import-isolation completeness.** Static AST walk missed dynamic imports; added a source-text scan for `importlib`/`__import__` + any literal `vimax_broker_service` reference across brain/* + the orchestrator (C1.5 Step 1, new `test_no_dynamic_broker_import_anywhere`).
5. **[minor→resolved] dropped `@retry` justified** in C1.3 (broker retries draws + refunds; judge reshoot loop is the render-side retry; a failed view surfaces as an `error` record).
6. **[confirmed correct] billing semantics** — the buildability dimension verified against `vimax_broker_service.py` that a *grsai/broker draw failure* refunds while a *judge rejection* charges a full reshoot draw (spec §6); added the clarifying note to C1.4. Verbatim assembly strings (huanying_runner.py:350-351, 360, 386, 593-595) + helper ranges + result.json schemas were all confirmed byte/shape-accurate.
7. **[false alarms, no change]** The buildability dimension flagged `run_render`/`broker_url_getter`/`image_gen_factory`/`_run_render` as "missing/not wired" — these are precisely what C2.2 **adds** (it read current source as if it should already match the post-plan state). No action; C2.2 already specifies each addition.

8. **[major→resolved, found on direct verification] test invocation was wrong.** The plan's commands said `python -m unittest integrations.vimax.brain.X` from repo root, but there is **no `integrations/__init__.py`** — the existing brain tests (`planner_test`, `golden_compare_test`) run from **`integrations/vimax/`** as `python -m unittest brain.X` (verified: `Ran 8 tests OK`). Corrected every brain test command + added the test-invocation convention note (C1.1 Step 2). This was the gap the failed buildability dimension would have caught; closed by direct repo verification.

> Note: the `cost-isolation` and `buildability-coverage` dimensions each hit a socket error on one run; their scope (cost path + refund + isolation; import scheme + dispatch sites) was independently closed — cost/isolation by the surviving `buildability` dimension reading `vimax_bridge_service.py`/`vimax_broker_service.py` directly (findings 3, 6 + broker_url_getter wiring), and the import-scheme/dispatch questions by my own direct repo verification (findings 3, 8). No open review gap remains.
