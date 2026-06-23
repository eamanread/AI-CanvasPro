import copy
import re


SENSITIVE_KEY_RE = re.compile(r"(api[_-]?key|authorization|secret|token|password|credential)", re.I)
SENSITIVE_VALUE_RE = re.compile(r"(Bearer\s+[A-Za-z0-9._-]+|sk-[A-Za-z0-9_-]{8,}|data:[^\s]+|blob:[^\s]+|[A-Za-z]:\\[^\s]+)", re.I)


class ClawContextService:
    def preview_context(self, context):
        warnings = []
        return {
            "success": True,
            "context": self.sanitize_context(context or {}, warnings),
            "warnings": warnings,
        }

    def sanitize_context(self, value, warnings=None):
        warnings = warnings if warnings is not None else []
        if isinstance(value, dict):
            result = {}
            for key, child in value.items():
                if SENSITIVE_KEY_RE.search(str(key)):
                    warnings.append(f"removed sensitive field {key}")
                    continue
                result[key] = self.sanitize_context(child, warnings)
            return result
        if isinstance(value, list):
            return [self.sanitize_context(item, warnings) for item in value]
        if isinstance(value, str):
            sanitized = SENSITIVE_VALUE_RE.sub("[redacted]", value)
            if sanitized != value:
                warnings.append("redacted sensitive string")
            return sanitized
        return copy.deepcopy(value)

