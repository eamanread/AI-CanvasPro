import hashlib
import json
import os
import re
import time
import uuid

from services.subscription_client import SubscriptionRemoteClient


class LocalSubscriptionClient(SubscriptionRemoteClient):
    def __init__(
        self,
        *,
        state_dir,
        fixed_cdkey,
        status_active,
        err_required,
        required_message,
        contact_text,
        contact_url,
        invalid_cdkey_error_code="INVALID_CDKEY",
        invalid_cdkey_message="授权码错误",
        device_unavailable_error_code="LOCAL_DEVICE_FINGERPRINT_UNAVAILABLE",
        license_filename="license.json",
        time_provider=None,
        mac_reader=None,
        local_install_id_resolver=None,
    ):
        super().__init__(
            api_base_url="",
            timeout_seconds=1,
            status_active=status_active,
            err_required=err_required,
            required_message=required_message,
            contact_text=contact_text,
            contact_url=contact_url,
            local_install_id_resolver=local_install_id_resolver,
        )
        self.state_dir = os.path.abspath(str(state_dir or "."))
        self.license_file = os.path.join(
            self.state_dir,
            str(license_filename or "license.json").strip() or "license.json",
        )
        self.fixed_cdkey = str(fixed_cdkey or "").strip()
        self.invalid_cdkey_error_code = str(
            invalid_cdkey_error_code or "INVALID_CDKEY"
        ).strip() or "INVALID_CDKEY"
        self.invalid_cdkey_message = (
            str(invalid_cdkey_message or "").strip() or "授权码错误"
        )
        self.device_unavailable_error_code = str(
            device_unavailable_error_code or "LOCAL_DEVICE_FINGERPRINT_UNAVAILABLE"
        ).strip() or "LOCAL_DEVICE_FINGERPRINT_UNAVAILABLE"
        self.time_provider = time_provider if callable(time_provider) else time.time
        self.mac_reader = mac_reader if callable(mac_reader) else uuid.getnode

    def _now_ts(self):
        try:
            return int(self.time_provider())
        except Exception:
            return int(time.time())

    def _hash_cdkey(self, value):
        token = str(value or "").strip()
        if not token:
            return ""
        digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
        return f"sha256:{digest}"

    def _normalize_mac(self, value):
        if isinstance(value, int):
            if value <= 0 or value >= (1 << 48):
                return ""
            compact = f"{value:012X}"
        else:
            compact = re.sub(r"[^0-9A-F]", "", str(value or "").strip().upper())
            if len(compact) != 12:
                return ""
        if compact == "000000000000":
            return ""
        return ":".join(compact[index:index + 2] for index in range(0, 12, 2))

    def _read_current_mac(self):
        try:
            return self._normalize_mac(self.mac_reader())
        except Exception:
            return ""

    def _read_license_payload(self):
        try:
            with open(self.license_file, "r", encoding="utf-8-sig") as f:
                data = json.load(f)
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _write_license_payload(self, payload):
        data = dict(payload) if isinstance(payload, dict) else {}
        os.makedirs(os.path.dirname(self.license_file), exist_ok=True)
        temp_path = f"{self.license_file}.tmp"
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(temp_path, self.license_file)

    def _active_payload(self, install_id, bound_mac):
        install = self.normalize_install_id(install_id)
        return {
            "success": True,
            "status": self.status_active,
            "activationSource": "cdkey",
            "generationScope": "all",
            "entitledNodeTypes": [],
            "entitledProviders": [],
            "contactText": self.contact_text,
            "contactUrl": self.contact_url,
            "installId": install,
            "boundMac": str(bound_mac or "").strip(),
        }

    def _inactive_payload(self, install_id, *, error_code, message):
        install = self.normalize_install_id(install_id)
        code = str(error_code or self.err_required).strip() or self.err_required
        return {
            "success": False,
            "status": self.status_none,
            "errorCode": code,
            "code": code,
            "message": str(message or "").strip() or "请先激活授权码",
            "activationSource": "",
            "generationScope": "none",
            "entitledNodeTypes": [],
            "entitledProviders": [],
            "contactText": self.contact_text,
            "contactUrl": self.contact_url,
            "installId": install,
        }

    def fetch_subscription_status(self, install_id):
        install = self.normalize_install_id(install_id)
        if not install:
            return None
        current_mac = self._read_current_mac()
        if not current_mac:
            return self._inactive_payload(
                install,
                error_code=self.err_required,
                message="无法读取当前设备网卡地址",
            )
        payload = self._read_license_payload()
        if not bool(payload.get("activated")):
            return self._inactive_payload(
                install,
                error_code=self.err_required,
                message="请先激活授权码",
            )
        bound_mac = self._normalize_mac(payload.get("boundMac"))
        if not bound_mac:
            return self._inactive_payload(
                install,
                error_code=self.err_required,
                message="请先激活授权码",
            )
        if bound_mac != current_mac:
            return self._inactive_payload(
                install,
                error_code=self.err_required,
                message="当前设备未激活，请重新输入授权码",
            )
        return self._active_payload(install, bound_mac)

    def activate_cdkey(self, install_id, cdkey):
        install = self.normalize_install_id(install_id)
        token = str(cdkey or "").strip()
        if not install or not token:
            return None
        if token != self.fixed_cdkey:
            return self._inactive_payload(
                install,
                error_code=self.invalid_cdkey_error_code,
                message=self.invalid_cdkey_message,
            )
        current_mac = self._read_current_mac()
        if not current_mac:
            return self._inactive_payload(
                install,
                error_code=self.device_unavailable_error_code,
                message="无法读取当前设备网卡地址",
            )
        license_payload = {
            "activated": True,
            "status": self.status_active,
            "activationSource": "cdkey",
            "cdkeyHash": self._hash_cdkey(token),
            "boundMac": current_mac,
            "activatedAt": self._now_ts(),
            "lastInstallId": install,
            "version": 1,
        }
        self._write_license_payload(license_payload)
        return self._active_payload(install, current_mac)

    def _fetch_status_payload(self, install_id):
        return self.fetch_subscription_status(install_id)

    def is_install_entitled_for_model(self, install_id, model_id):
        payload = self.fetch_subscription_status(install_id)
        return isinstance(payload, dict) and self.extract_status(payload) == self.status_active
