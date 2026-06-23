"""Stdlib-only OpenAI-compatible chat client (Phase A).

No langchain / no venv - just urllib. This is the whole point of the migration:
the brain needs a chat endpoint + JSON, nothing more. Mirrors the grsai
chat shape already proven in the broker and the panel-fix probe.
"""
import json
import re
import time
import urllib.error
import urllib.request

DEFAULT_BASE_URL = "https://grsai.dakka.com.cn/v1"

# Retry these upstream statuses (rate-limit + transient server) - the native
# orchestrator runs decompose in parallel (B1), which makes 429s more likely,
# so the backoff lives here, in the same module as the calls (B-review m3).
_RETRYABLE_STATUS = {429, 500, 502, 503, 504}

# grsai NON-STANDARDLY returns HTTP 400 for a transient overload
# ({"error":{"message":"The model load is too high, please try again later",
# "type":"rix_api_error"}}) instead of 429/503. A 400 is normally a hard client
# error (don't retry), but THIS 400 is transient - observed killing a whole
# native plan mid-decompose during the C5.2 steer real-machine run. Detect it by
# body signal and treat it as retryable.
_OVERLOAD_400_SIGNALS = ("model load is too high", "rix_api_error", "load is too high")


def _is_retryable_status(code):
    return int(code) in _RETRYABLE_STATUS


def _is_overload_400(code, detail):
    return int(code) == 400 and any(sig in (detail or "") for sig in _OVERLOAD_400_SIGNALS)


def extract_json(text):
    """Pull the FIRST complete JSON object/array out of a chat reply. Tolerates
    ```json fences AND trailing prose (e.g. '{...}  note: {0..n}') by scanning
    for the first brace that begins a valid value and using raw_decode, which
    stops at the end of that value and ignores the rest. Returns the parsed
    value or None - never a wrong partial."""
    s = str(text or "")
    fence = re.search(r"```(?:json)?\s*(.*?)```", s, re.S)
    if fence:
        s = fence.group(1)
    decoder = json.JSONDecoder()
    for i, ch in enumerate(s):
        if ch == "{" or ch == "[":
            try:
                return decoder.raw_decode(s, i)[0]
            except ValueError:
                continue
    return None


class GrsaiChatClient:
    def __init__(self, api_key, base_url=None, model="gemini-3.1-pro", timeout=90,
                 max_retries=2, sleep=time.sleep):
        # B5: default 180->90. A healthy grsai chat returns in ~5-40s (probed);
        # a STALL never returns, so 180s x (1+2 retries) = 540s would blow the
        # panel's 5min deadline and look hung. 90s x 3 = 270s worst-case fails
        # over fast while still covering a slow-but-alive call. Tunable per call
        # (orchestrator reads HY_VIMAX_CHAT_TIMEOUT). NOTE (B5 probe 2026-06-14):
        # grsai is concurrency-INtolerant under load (c=3 -> 2/3 timeout), so do
        # NOT raise decompose max_workers without re-probing; the 429/timeout
        # backoff below is the safety net.
        self.api_key = str(api_key or "")
        self.base_url = (base_url or DEFAULT_BASE_URL).rstrip("/")
        self.model = model or "gemini-3.1-pro"
        self.timeout = int(timeout)
        self.max_retries = int(max_retries)
        self._sleep = sleep  # injectable for tests (no real delay)

    def chat(self, messages, max_tokens=8192, temperature=None):
        """messages: [{"role","content"}]. Returns the assistant text content.
        Retries 429/5xx + transient network errors with exponential backoff
        (parallel decompose makes 429 likely); 4xx-other fail loudly at once."""
        endpoint = self.base_url + "/chat/completions"
        payload = {"model": self.model, "messages": messages, "max_tokens": int(max_tokens)}
        if temperature is not None:
            payload["temperature"] = temperature
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            endpoint, data=body, method="POST",
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
        )
        last_err = None
        for attempt in range(self.max_retries + 1):
            try:
                with urllib.request.urlopen(request, timeout=self.timeout) as resp:
                    data = json.loads(resp.read().decode("utf-8", "ignore"))
                choices = data.get("choices") or []
                if not choices:
                    raise ValueError(f"chat response had no choices: {str(data)[:200]}")
                return str((choices[0].get("message") or {}).get("content") or "")
            except urllib.error.HTTPError as exc:
                detail = ""
                try:
                    detail = exc.read().decode("utf-8", "ignore")[:300]
                except Exception:  # noqa: BLE001
                    pass
                last_err = ValueError(f"chat HTTP {exc.code}: {detail}")
                retryable = _is_retryable_status(exc.code) or _is_overload_400(exc.code, detail)
                if not retryable or attempt >= self.max_retries:
                    raise last_err from exc  # 4xx-other or budget exhausted: loud
            except (urllib.error.URLError, TimeoutError) as exc:
                # Transient network / read-timeout. NOTE: a urlopen READ timeout
                # raises socket.timeout (== TimeoutError in py3.10+), which is
                # NOT a URLError subclass - it must be caught here too or the
                # most-likely transient (a stall) would skip retry entirely and
                # propagate raw (B-review C1).
                last_err = ValueError(f"chat network error: {exc}")
                if attempt >= self.max_retries:
                    raise last_err from exc
            # backoff before the next attempt (injected sleep in tests)
            self._sleep(min(2 ** attempt, 8))
        # Defensive: every arm above returns or raises on the final attempt, so
        # this is normally unreachable - but never raise None if a future arm
        # forgets to (B-review C2).
        raise last_err or ValueError("chat failed after retries")
