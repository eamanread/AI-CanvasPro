"""统一审计报告 / GO-NO-GO / 退出码。判定区零时间戳（确定性铁律）。

所有审计插件的输出形态唯一，回归才可逐字节比对。
"""
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from enum import Enum
import json


class Verdict(str, Enum):
    PASS = "PASS"
    WARN = "WARN"
    FAIL = "FAIL"


@dataclass(frozen=True)
class Finding:
    check: str                       # 检查项ID，引回 PRD 的 FR/DoD，如 "D5-FR-02"
    verdict: Verdict
    detail: str                      # 客观事实，如 "色相偏移 30.0° > 阈值 15°"
    measured: object = None
    threshold: object = None
    fix: str = ""                    # FAIL 必须非空：可执行修复动作


@dataclass
class Report:
    audit: str                       # 审计名，如 "consistency"
    target: str                      # 被审对象标识
    findings: list = field(default_factory=list)
    skipped: bool = False            # True=本审计与该 case kind 不匹配、空转未跑（区别于"跑了且无FAIL"）

    def add(self, *a, **k) -> "Report":
        self.findings.append(Finding(*a, **k))
        return self

    @property
    def decision(self) -> str:       # 有 FAIL 必 NO-GO（全套件统一语义）
        return "NO-GO" if any(f.verdict == Verdict.FAIL for f in self.findings) else "GO"

    @property
    def exit_code(self) -> int:      # 0=GO, 1=NO-GO（CI 用）
        return 0 if self.decision == "GO" else 1

    def to_json(self) -> str:        # 判定区确定性：sort_keys + 无时间戳
        body = {
            "audit": self.audit,
            "target": self.target,
            "decision": self.decision,
            "findings": [
                {**asdict(f), "verdict": f.verdict.value} for f in self.findings
            ],
        }
        return json.dumps(body, ensure_ascii=False, sort_keys=True, indent=2)

    def assert_fail_has_fix(self) -> "Report":   # 铁律：每条 FAIL 必带修复动作
        for f in self.findings:
            if f.verdict == Verdict.FAIL and not f.fix:
                raise AssertionError(f"FAIL 缺修复动作: {f.check}")
        return self


def merge(audit: str, target: str, *reports: Report) -> Report:
    """把多份子报告合成一份（用于一个 case 跑多个审计）。"""
    out = Report(audit=audit, target=target)
    for r in reports:
        out.findings.extend(r.findings)
    return out
