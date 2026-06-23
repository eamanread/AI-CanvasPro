"""Stdlib-only grsai (dakka) nano-banana image generator (Phase C).

Ported from integrations/vimax/image_generator_grsai.py: requests -> urllib
(mirrors the broker's _default_grsai_draw urllib SSE pattern), asyncio dropped
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
            # An already-public http(s) reference (e.g. a portrait url persisted
            # by a PRIOR subprocess - the in-process _PATH_URL registry is empty
            # in a fresh render process) is used directly; only local paths need
            # the local->url lookup.
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
        # Stash the prompt + refs so the runner can record them.
        out.gen_prompt = prompt
        out.gen_refs = urls
        return out

    def _submit_and_poll(self, payload):
        # requests.post(json=payload) -> urllib (mirror broker _default_grsai_draw).
        # Filter the broker-only "cost" key so it never reaches the draw body.
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

    # _extract_url / _from_obj copied VERBATIM from image_generator_grsai.py:104-154
    # (tests pin both the broker whole-JSON envelope and direct grsai SSE shapes).
    @staticmethod
    def _extract_url(body):
        """Accepts BOTH response shapes: a grsai SSE stream (many
        `data: {...}` lines, direct mode) AND a single JSON object (the
        Huanying broker's whole-packet proxy - possibly pretty-printed
        over multiple lines). Try the whole body as one JSON first, then
        fall back to per-line SSE parsing."""
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

        # Broker whole-packet case: the entire body is one JSON object.
        try:
            url = _from_obj(json.loads(text))
            if url:
                return url
        except ValueError as err:
            if "grsai draw failed" in str(err):
                raise
        except Exception:
            pass

        # Direct grsai SSE case: scan data: lines for the terminal event.
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
