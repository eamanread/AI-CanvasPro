import re
import threading
import time
from collections import OrderedDict


class SubscriptionGateService:
    def __init__(
        self,
        *,
        client,
        status_active="active",
        status_none="none",
        error_model_not_entitled="SUBSCRIPTION_MODEL_NOT_ENTITLED",
        model_name_map=None,
        cache_max=2048,
        success_logger=None,
        enforce_generation_subscription=False,
        require_cdkey_source=False,
    ):
        self.client = client
        self.status_active = str(status_active or "active").strip().lower() or "active"
        self.status_none = str(status_none or "none").strip().lower() or "none"
        self.error_model_not_entitled = str(
            error_model_not_entitled or "SUBSCRIPTION_MODEL_NOT_ENTITLED"
        ).strip() or "SUBSCRIPTION_MODEL_NOT_ENTITLED"
        self.model_name_map = dict(model_name_map or {})
        self.cache_max = max(1, int(cache_max or 2048))
        self.success_logger = success_logger
        self.enforce_generation_subscription = bool(enforce_generation_subscription)
        self.require_cdkey_source = bool(require_cdkey_source)
        self._success_logged_installs = OrderedDict()
        self._lock = threading.Lock()

    def extract_install_id_from_request(self, handler, payload=None):
        return self.client.extract_install_id_from_request(handler, payload)

    def normalize_required_model_id(self, value):
        s = str(value or "").strip()
        if not s:
            return ""
        if s.startswith("runninghub/"):
            return s
        if s.startswith("dreamina/"):
            return s
        if re.match(r"^\d+$", s):
            return f"runninghub/{s}"
        return s

    def clear_generation_access_cache(self, install_id):
        install = str(install_id or "").strip()
        if not install:
            return
        with self._lock:
            self._success_logged_installs.pop(install, None)

    def _mark_first_generation_access_success_log(self, install_id):
        install = str(install_id or "").strip()
        if not install:
            return False
        with self._lock:
            if install in self._success_logged_installs:
                return False
            self._success_logged_installs[install] = int(time.time())
            while len(self._success_logged_installs) > self.cache_max:
                self._success_logged_installs.popitem(last=False)
        return True

    def _log_generation_access_success(self, decision):
        if not isinstance(decision, dict):
            return
        if not bool(decision.get("allowed")):
            return
        status = str(decision.get("status") or "").strip().lower()
        reason = str(decision.get("reasonCode") or "").strip().upper()
        if status != self.status_active or reason != "ACTIVE":
            return
        if not self._mark_first_generation_access_success_log(decision.get("installId")):
            return
        try:
            if callable(self.success_logger):
                self.success_logger(decision)
        except Exception:
            return

    def _normalize_generation_decision(self, decision, *, required_model_id="", provider="", node_type=""):
        result = dict(decision) if isinstance(decision, dict) else {}
        result["requiredModelId"] = str(required_model_id or "").strip()
        result["provider"] = str(provider or "").strip()
        result["nodeType"] = str(node_type or "").strip()
        if "activationSource" not in result:
            result["activationSource"] = self.client.extract_activation_source(result.get("payload"))
        if "generationScope" not in result:
            result["generationScope"] = self.client.extract_generation_scope(result.get("payload"))
        if "entitledNodeTypes" not in result:
            result["entitledNodeTypes"] = self.client.extract_entitled_node_types(result.get("payload"))
        if "entitledProviders" not in result:
            result["entitledProviders"] = self.client.extract_entitled_providers(result.get("payload"))
        return result

    def check_generation_access(
        self,
        handler,
        payload=None,
        required_model_id="",
        provider="",
        node_type="",
        require_cdkey_source=None,
    ):
        model_id = self.normalize_required_model_id(required_model_id)
        if not self.enforce_generation_subscription:
            install_id = self.extract_install_id_from_request(handler, payload)
            return self._normalize_generation_decision(
                {
                    "allowed": True,
                    "installId": install_id,
                    "status": self.status_active,
                    "reasonCode": "GENERATION_GATE_DISABLED",
                    "reasonMessage": "",
                    "payload": None,
                    "activationSource": "",
                    "generationScope": "",
                    "entitledNodeTypes": [],
                    "entitledProviders": [],
                },
                required_model_id=model_id,
                provider=provider,
                node_type=node_type,
            )

        decision = self.client.evaluate_install_active(
            self.extract_install_id_from_request(handler, payload)
        )
        decision = self._normalize_generation_decision(
            decision,
            required_model_id=model_id,
            provider=provider,
            node_type=node_type,
        )
        if not bool(decision.get("allowed")):
            return decision

        need_cdkey = self.require_cdkey_source
        if require_cdkey_source is not None:
            need_cdkey = bool(require_cdkey_source)
        activation_source = str(decision.get("activationSource") or "").strip().lower()
        if need_cdkey and activation_source != "cdkey":
            decision["allowed"] = False
            decision["reasonCode"] = "SUBSCRIPTION_SOURCE_NOT_ALLOWED"
            decision["reasonMessage"] = "仅 CDKEY 激活用户可提交生成"
            return decision

        self._log_generation_access_success(decision)
        return decision

    def build_subscription_denial_payload(self, decision):
        decision = dict(decision) if isinstance(decision, dict) else {}
        denial = self.client.subscription_required_payload(
            decision.get("reasonMessage") or "未激活"
        )
        denial["reasonCode"] = decision.get("reasonCode") or ""
        denial["subscriptionStatus"] = decision.get("status") or self.status_none
        denial["installId"] = decision.get("installId") or ""
        denial["requiredModelId"] = decision.get("requiredModelId") or ""
        denial["activationSource"] = decision.get("activationSource") or ""
        denial["generationScope"] = decision.get("generationScope") or ""
        denial["provider"] = decision.get("provider") or ""
        denial["nodeType"] = decision.get("nodeType") or ""
        return denial
