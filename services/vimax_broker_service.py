import json
import os
import threading
import time
import uuid


class VimaxBroker:
    """Render-ticket broker (α′ F4) - the physical form of cost sovereignty.

    The panel signs a render-ticket/v1 (a budget cap + per-shot estimate);
    the runner's image calls hit draw() carrying the ticketId as a Bearer
    token. draw() verifies the ticket, RESERVES the cost under a lock
    (cap checked + spent incremented atomically, so concurrent draws from
    ViMax's asyncio.gather can never overshoot the cap), proxies the grsai
    draw whole-packet, and refunds the reservation if the upstream call
    fails. Cap/invalid -> HTTP 200 with a grsai-shaped failed envelope
    (HY_TICKET_* failure_reason) so the runner's adapter turns it into a
    per-shot ValueError instead of a 4xx that would crash asyncio.gather.

    The ledger (spent-per-ticket) is the audit trail; tmp+os.replace keeps
    it crash-safe. Sole writer is this process under _lock (the server is
    one thread per request).
    """

    def __init__(
        self,
        user_dir_getter=None,
        credentials_getter=None,
        grsai_draw_fn=None,
        clock=None,
    ):
        self._user_dir_getter = user_dir_getter or (lambda: os.path.join(os.getcwd(), "user"))
        self._credentials_getter = credentials_getter or (lambda: {})
        self._grsai_draw_fn = grsai_draw_fn or _default_grsai_draw
        self._clock = clock or time.time
        self._lock = threading.Lock()

    # --- paths -----------------------------------------------------------------

    def _ticket_path(self, ticket_id):
        return os.path.join(self._user_dir_getter(), "vimax_tickets", f"{ticket_id}.json")

    def _ledger_path(self):
        return os.path.join(self._user_dir_getter(), "vimax_ledger.json")

    def _read_ledger(self):
        try:
            with open(self._ledger_path(), "r", encoding="utf-8") as handle:
                data = json.load(handle)
            return data if isinstance(data, dict) else {}
        except (OSError, ValueError):
            return {}

    def _write_ledger(self, ledger):
        path = self._ledger_path()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as handle:
            json.dump(ledger, handle, ensure_ascii=False, indent=2)
        os.replace(tmp, path)

    # --- sign ------------------------------------------------------------------

    def sign(self, payload=None):
        payload = payload or {}
        flow_id = str(payload.get("flowId") or "")
        try:
            cap_total = float(payload.get("capTotal") or 0)
        except (TypeError, ValueError):
            cap_total = 0
        if not flow_id:
            return {"success": False, "error": "flowId is required"}
        if cap_total <= 0:
            return {"success": False, "error": "capTotal must be > 0"}
        ttl = int(payload.get("ttlSeconds") or 3600)
        now = self._clock()
        ticket_id = f"vtk-{uuid.uuid4().hex[:16]}"
        ticket = {
            "schemaVersion": "render-ticket/v1",
            "ticketId": ticket_id,
            "flowId": flow_id,
            "shotIdxs": list(payload.get("shotIdxs") or []),
            "estimateByShot": list(payload.get("estimateByShot") or []),
            "portraitsOf": list(payload.get("portraitsOf") or []),
            "retryBudget": int(payload.get("retryBudget") or 0),
            "capTotal": cap_total,
            "signedAt": now,
            "expiresAt": now + ttl,
        }
        path = self._ticket_path(ticket_id)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(ticket, handle, ensure_ascii=False, indent=2)
        return {"success": True, **ticket}

    def _load_ticket(self, ticket_id):
        try:
            with open(self._ticket_path(ticket_id), "r", encoding="utf-8") as handle:
                data = json.load(handle)
            return data if isinstance(data, dict) else None
        except (OSError, ValueError):
            return None

    # --- draw ------------------------------------------------------------------

    @staticmethod
    def _bearer(authorization):
        value = str(authorization or "").strip()
        if value.lower().startswith("bearer "):
            return value[7:].strip()
        return value

    @staticmethod
    def _failed(reason):
        # grsai terminal shape so the adapter's iter_lines/json.loads turns
        # it into a ValueError at the shot granularity (never a 4xx).
        return {"status": "failed", "failure_reason": reason, "results": None}

    def draw(self, authorization, payload=None):
        payload = payload or {}
        ticket_id = self._bearer(authorization)
        ticket = self._load_ticket(ticket_id)
        if not ticket:
            return self._failed(f"HY_TICKET_INVALID: unknown ticket {ticket_id}")
        if self._clock() > float(ticket.get("expiresAt") or 0):
            return self._failed("HY_TICKET_INVALID: ticket expired")
        cap_total = float(ticket.get("capTotal") or 0)
        try:
            cost = float(payload.get("cost") or 1.0)
        except (TypeError, ValueError):
            cost = 1.0

        # Reserve under the lock: cap-check + increment are atomic so
        # concurrent draws cannot both pass then both bill past the cap.
        with self._lock:
            ledger = self._read_ledger()
            entry = ledger.get(ticket_id) if isinstance(ledger.get(ticket_id), dict) else {"spent": 0.0, "draws": 0}
            spent = float(entry.get("spent", 0.0))
            if spent + cost > cap_total + 1e-9:
                return self._failed(
                    f"HY_TICKET_CAP_EXCEEDED: spent {spent}+{cost} > cap {cap_total}"
                )
            entry["spent"] = spent + cost
            entry["draws"] = int(entry.get("draws", 0)) + 1
            ledger[ticket_id] = entry
            self._write_ledger(ledger)

        creds = self._credentials_getter() or {}
        try:
            url = self._grsai_draw_fn(payload, creds.get("apiKey", ""), creds.get("baseUrl", ""))
        except Exception as error:  # noqa: BLE001 - upstream failure, refund the reservation
            with self._lock:
                ledger = self._read_ledger()
                entry = ledger.get(ticket_id)
                if isinstance(entry, dict):
                    entry["spent"] = max(0.0, float(entry.get("spent", 0.0)) - cost)
                    entry["draws"] = max(0, int(entry.get("draws", 0)) - 1)
                    ledger[ticket_id] = entry
                    self._write_ledger(ledger)
            return {"status": "failed", "failure_reason": f"upstream draw failed: {error}", "results": None}
        return {"status": "succeeded", "results": [{"url": url, "content": ""}]}


def _default_grsai_draw(payload, api_key, base_url):
    """Whole-packet proxy of the grsai draw SSE: submit, consume the
    stream, return the final succeeded url (raise on failure). Uses
    stdlib urllib - the Huanying server python has no `requests`."""
    import urllib.request

    endpoint = (base_url or "https://grsai.dakka.com.cn/v1").rstrip("/") + "/draw/nano-banana"
    body = json.dumps({k: v for k, v in payload.items() if k != "cost"}).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    final_url = None
    with urllib.request.urlopen(request, timeout=360) as resp:
        for raw in resp:
            line = raw.decode("utf-8", "ignore").strip()
            if not line:
                continue
            if line.startswith("data:"):
                line = line[5:].strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if event.get("status") == "succeeded":
                results = event.get("results") or []
                if results:
                    final_url = results[0].get("url")
            elif event.get("status") == "failed":
                raise ValueError(f"grsai draw failed: {event.get('failure_reason') or event.get('error')}")
    if not final_url:
        raise ValueError("grsai draw: no url in response")
    return final_url
