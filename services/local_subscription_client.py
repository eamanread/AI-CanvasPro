import hashlib
import json
import os
import re
import subprocess
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
        one_time_cdkey="",
        tiered_cdkeys=None,
        invalid_cdkey_error_code="INVALID_CDKEY",
        invalid_cdkey_message="授权码错误",
        cdkey_already_used_error_code="CDKEY_ALREADY_USED",
        cdkey_already_used_message="该授权码已使用",
        trial_already_used_error_code="LOCAL_TRIAL_ALREADY_USED",
        trial_already_used_message="该设备已领取过首次免费试用",
        device_unavailable_error_code="LOCAL_DEVICE_FINGERPRINT_UNAVAILABLE",
        clock_rollback_error_code="LOCAL_CLOCK_ROLLBACK_DETECTED",
        license_filename="license.json",
        time_provider=None,
        mac_reader=None,
        local_install_id_resolver=None,
        subscription_duration_seconds=7 * 24 * 60 * 60,
        clock_rollback_grace_seconds=5,
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
        self.one_time_cdkey = str(one_time_cdkey or "").strip()
        self.tiered_cdkeys = self._normalize_tiered_cdkeys(tiered_cdkeys)
        self.invalid_cdkey_error_code = str(
            invalid_cdkey_error_code or "INVALID_CDKEY"
        ).strip() or "INVALID_CDKEY"
        self.invalid_cdkey_message = (
            str(invalid_cdkey_message or "").strip() or "授权码错误"
        )
        self.cdkey_already_used_error_code = str(
            cdkey_already_used_error_code or "CDKEY_ALREADY_USED"
        ).strip() or "CDKEY_ALREADY_USED"
        self.cdkey_already_used_message = (
            str(cdkey_already_used_message or "").strip() or "该授权码已使用"
        )
        self.trial_already_used_error_code = str(
            trial_already_used_error_code or "LOCAL_TRIAL_ALREADY_USED"
        ).strip() or "LOCAL_TRIAL_ALREADY_USED"
        self.trial_already_used_message = (
            str(trial_already_used_message or "").strip()
            or "该设备已领取过首次免费试用"
        )
        self.device_unavailable_error_code = str(
            device_unavailable_error_code or "LOCAL_DEVICE_FINGERPRINT_UNAVAILABLE"
        ).strip() or "LOCAL_DEVICE_FINGERPRINT_UNAVAILABLE"
        self.clock_rollback_error_code = str(
            clock_rollback_error_code or "LOCAL_CLOCK_ROLLBACK_DETECTED"
        ).strip() or "LOCAL_CLOCK_ROLLBACK_DETECTED"
        self.time_provider = time_provider if callable(time_provider) else time.time
        self.mac_reader = mac_reader if callable(mac_reader) else uuid.getnode
        self._use_default_mac_reader = mac_reader is None
        try:
            duration = int(subscription_duration_seconds)
        except Exception:
            duration = 7 * 24 * 60 * 60
        self.subscription_duration_seconds = max(1, duration)
        try:
            grace = int(clock_rollback_grace_seconds)
        except Exception:
            grace = 5
        self.clock_rollback_grace_seconds = max(0, grace)

    def _now_ts(self):
        try:
            return int(self.time_provider())
        except Exception:
            return int(time.time())

    def _normalize_tiered_cdkeys(self, entries):
        # entries: 形如 [{"code": "wkfh0701", "duration_seconds": 604800}, ...]
        # 返回 {归一化后的密钥串: 有效期秒数}；分级密钥统一按"一次性"处理。
        catalog = {}
        if not entries:
            return catalog
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            code = str(entry.get("code") or "").strip()
            if not code:
                continue
            try:
                duration = int(entry.get("duration_seconds"))
            except Exception:
                continue
            if duration <= 0:
                continue
            # 固定/一次性密钥语义不变，分级表不得覆盖它们
            if code == self.fixed_cdkey or code == self.one_time_cdkey:
                continue
            catalog[code] = duration
        return catalog

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

    def _normalize_mac_values(self, value):
        if isinstance(value, (list, tuple, set)):
            raw_values = list(value)
        else:
            raw_values = [value]
        normalized = []
        seen = set()
        for item in raw_values:
            mac = self._normalize_mac(item)
            if mac and mac not in seen:
                normalized.append(mac)
                seen.add(mac)
        return normalized

    def _read_windows_getmac_addresses(self):
        if os.name != "nt":
            return []
        try:
            creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            completed = subprocess.run(
                ["getmac", "/fo", "csv", "/nh"],
                capture_output=True,
                text=True,
                timeout=2,
                creationflags=creationflags,
            )
        except Exception:
            return []
        raw = f"{completed.stdout or ''}\n{completed.stderr or ''}"
        matches = re.findall(r"[0-9A-Fa-f]{2}(?:[-:][0-9A-Fa-f]{2}){5}", raw)
        return self._normalize_mac_values(matches)

    def _read_current_macs(self):
        values = []
        try:
            values.extend(self._normalize_mac_values(self.mac_reader()))
        except Exception:
            pass
        if self._use_default_mac_reader:
            values.extend(self._read_windows_getmac_addresses())

        normalized = []
        seen = set()
        for mac in values:
            if mac and mac not in seen:
                normalized.append(mac)
                seen.add(mac)
        return normalized

    def _read_current_mac(self):
        current_macs = self._read_current_macs()
        return current_macs[0] if current_macs else ""

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

    def read_last_install_id(self):
        payload = self._read_license_payload()
        if not bool(payload.get("activated")):
            return ""
        return self.normalize_install_id(payload.get("lastInstallId"))

    def _active_payload(self, install_id, bound_mac, expires_at=None, activation_source="cdkey"):
        install = self.normalize_install_id(install_id)
        return {
            "success": True,
            "status": self.status_active,
            "expiresAt": int(expires_at) if expires_at else None,
            "activationSource": str(activation_source or "cdkey").strip() or "cdkey",
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

    def _expired_payload(self, install_id, expires_at):
        payload = self._inactive_payload(
            install_id,
            error_code=self.err_required,
            message="授权码已过期，请重新激活",
        )
        payload["status"] = self.status_expired
        payload["expiresAt"] = int(expires_at) if expires_at else None
        return payload

    def _clock_rollback_payload(self, install_id, expires_at=None):
        payload = self._inactive_payload(
            install_id,
            error_code=self.clock_rollback_error_code,
            message="检测到系统时间异常，请恢复正确时间后重新启动",
        )
        payload["expiresAt"] = int(expires_at) if expires_at else None
        return payload

    def _persist_last_seen_at(self, payload, now_ts):
        next_payload = dict(payload) if isinstance(payload, dict) else {}
        previous = int(next_payload.get("lastSeenAt") or 0)
        if now_ts <= previous:
            return
        next_payload["lastSeenAt"] = now_ts
        self._write_license_payload(next_payload)

    def fetch_subscription_status(self, install_id):
        install = self.normalize_install_id(install_id)
        if not install:
            return None
        current_macs = self._read_current_macs()
        if not current_macs:
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
        if bound_mac not in current_macs:
            return self._inactive_payload(
                install,
                error_code=self.err_required,
                message="当前设备未激活，请重新输入授权码",
            )
        now_ts = self._now_ts()
        expires_at = int(payload.get("expiresAt") or 0)
        if expires_at <= 0:
            activated_at = int(payload.get("activatedAt") or now_ts)
            expires_at = activated_at + self.subscription_duration_seconds
        last_seen_at = int(payload.get("lastSeenAt") or payload.get("activatedAt") or 0)
        if now_ts + self.clock_rollback_grace_seconds < last_seen_at:
            return self._clock_rollback_payload(install, expires_at)
        if expires_at <= now_ts:
            return self._expired_payload(install, expires_at)
        self._persist_last_seen_at(payload, now_ts)
        activation_source = str(payload.get("activationSource") or "cdkey").strip() or "cdkey"
        return self._active_payload(install, bound_mac, expires_at, activation_source)

    def _mac_trial_key(self, mac):
        normalized = self._normalize_mac(mac)
        if not normalized:
            return ""
        digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
        return f"sha256:{digest}"

    def _trial_keys_from_payload(self, payload):
        if not isinstance(payload, dict):
            return []
        raw = payload.get("trialMachineHashes")
        if isinstance(raw, list):
            return [str(item or "").strip() for item in raw if str(item or "").strip()]
        legacy_key = str(payload.get("trialMachineHash") or "").strip()
        if legacy_key:
            return [legacy_key]
        if bool(payload.get("trialUsed")):
            key = self._mac_trial_key(payload.get("boundMac"))
            return [key] if key else []
        return []

    def _one_time_cdkey_hashes_from_payload(self, payload):
        if not isinstance(payload, dict):
            return []
        raw = payload.get("oneTimeCdkeyHashes")
        hashes = []
        if isinstance(raw, list):
            hashes.extend(str(item or "").strip() for item in raw)
        legacy_hash = str(payload.get("cdkeyHash") or "").strip()
        one_time_hash = self._hash_cdkey(self.one_time_cdkey)
        if one_time_hash and legacy_hash == one_time_hash:
            hashes.append(legacy_hash)
        normalized = []
        seen = set()
        for item in hashes:
            if item and item not in seen:
                normalized.append(item)
                seen.add(item)
        return normalized

    def _build_license_payload(
        self,
        *,
        install_id,
        bound_mac,
        activated_at,
        expires_at,
        activation_source,
        previous_payload=None,
        cdkey_hash="",
        one_time_cdkey_hash="",
    ):
        previous = previous_payload if isinstance(previous_payload, dict) else {}
        trial_keys = self._trial_keys_from_payload(previous)
        one_time_cdkey_hashes = self._one_time_cdkey_hashes_from_payload(previous)
        if activation_source == "trial":
            trial_key = self._mac_trial_key(bound_mac)
            if trial_key and trial_key not in trial_keys:
                trial_keys.append(trial_key)
        if one_time_cdkey_hash and one_time_cdkey_hash not in one_time_cdkey_hashes:
            one_time_cdkey_hashes.append(one_time_cdkey_hash)
        license_payload = {
            "activated": True,
            "status": self.status_active,
            "activationSource": str(activation_source or "cdkey").strip() or "cdkey",
            "boundMac": bound_mac,
            "activatedAt": activated_at,
            "lastSeenAt": activated_at,
            "expiresAt": expires_at,
            "lastInstallId": install_id,
            "version": 3,
        }
        if cdkey_hash:
            license_payload["cdkeyHash"] = cdkey_hash
        elif previous.get("cdkeyHash"):
            license_payload["cdkeyHash"] = previous.get("cdkeyHash")
        if trial_keys:
            license_payload["trialUsed"] = True
            license_payload["trialMachineHashes"] = trial_keys
        if one_time_cdkey_hashes:
            license_payload["oneTimeCdkeyHashes"] = one_time_cdkey_hashes
        return license_payload

    def _activate_trial(self, install_id, current_mac, previous_payload):
        trial_key = self._mac_trial_key(current_mac)
        if trial_key and trial_key in set(self._trial_keys_from_payload(previous_payload)):
            return self._inactive_payload(
                install_id,
                error_code=self.trial_already_used_error_code,
                message=self.trial_already_used_message,
            )
        activated_at = self._now_ts()
        expires_at = activated_at + self.subscription_duration_seconds
        license_payload = self._build_license_payload(
            install_id=install_id,
            bound_mac=current_mac,
            activated_at=activated_at,
            expires_at=expires_at,
            activation_source="trial",
            previous_payload=previous_payload,
        )
        self._write_license_payload(license_payload)
        return self._active_payload(install_id, current_mac, expires_at, "trial")

    def activate_cdkey(self, install_id, cdkey):
        install = self.normalize_install_id(install_id)
        token = str(cdkey or "").strip()
        if not install:
            return None
        current_mac = self._read_current_mac()
        if not current_mac:
            return self._inactive_payload(
                install,
                error_code=self.device_unavailable_error_code,
                message="无法读取当前设备网卡地址",
            )
        previous_payload = self._read_license_payload()
        if not token:
            return self._activate_trial(install, current_mac, previous_payload)
        is_admin_cdkey = bool(self.fixed_cdkey) and token == self.fixed_cdkey
        is_one_time_cdkey = bool(self.one_time_cdkey) and token == self.one_time_cdkey
        tiered_duration = self.tiered_cdkeys.get(token)
        is_tiered_cdkey = tiered_duration is not None
        if not is_admin_cdkey and not is_one_time_cdkey and not is_tiered_cdkey:
            return self._inactive_payload(
                install,
                error_code=self.invalid_cdkey_error_code,
                message=self.invalid_cdkey_message,
            )
        # 分级密钥与一次性密钥一致：单机激活一次即作废，不可重复激活
        consumes_once = is_one_time_cdkey or is_tiered_cdkey
        cdkey_hash = self._hash_cdkey(token)
        if consumes_once and cdkey_hash in set(self._one_time_cdkey_hashes_from_payload(previous_payload)):
            return self._inactive_payload(
                install,
                error_code=self.cdkey_already_used_error_code,
                message=self.cdkey_already_used_message,
            )
        activated_at = self._now_ts()
        previous_expires_at = 0
        if self._normalize_mac(previous_payload.get("boundMac")) == current_mac:
            try:
                previous_expires_at = int(previous_payload.get("expiresAt") or 0)
            except Exception:
                previous_expires_at = 0
        # 分级密钥按各自有效期；固定/一次性密钥仍用全局默认有效期
        duration_seconds = tiered_duration if is_tiered_cdkey else self.subscription_duration_seconds
        expires_at = max(activated_at, previous_expires_at) + duration_seconds
        license_payload = self._build_license_payload(
            install_id=install,
            bound_mac=current_mac,
            activated_at=activated_at,
            expires_at=expires_at,
            activation_source="cdkey",
            previous_payload=previous_payload,
            cdkey_hash=cdkey_hash,
            one_time_cdkey_hash=cdkey_hash if consumes_once else "",
        )
        self._write_license_payload(license_payload)
        return self._active_payload(install, current_mac, expires_at)

    def _fetch_status_payload(self, install_id):
        return self.fetch_subscription_status(install_id)

    def is_install_entitled_for_model(self, install_id, model_id):
        payload = self.fetch_subscription_status(install_id)
        return isinstance(payload, dict) and self.extract_status(payload) == self.status_active
