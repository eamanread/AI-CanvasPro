"""Shared flowId validation (B1.3b-review route-security#R1).

flowId becomes a filesystem path segment (user_dir/vimax_runs/<flowId>) in both
the native orchestrator and the external bridge, so an unvalidated value like
"../../x" would let os.path.join escape the runs dir. Reject anything that is
not a safe single path component. The panel generates ids like
"vimax-<base36>-<base36>", which match; legitimate ids never contain separators."""
import re

# letters / digits / underscore / hyphen only, bounded length (no '.', '/', '\\')
_SAFE_FLOW_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


def is_safe_flow_id(value):
    """True iff value is a safe single path component for a working_dir name."""
    return bool(_SAFE_FLOW_ID_RE.match(str(value or "")))
