function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

// Derives the PRD chapter-20 success metrics that are computable from local
// execution data. Rates are 0..1; counts are raw so callers can aggregate.
export function computeExecutionMetrics(snapshot = {}) {
  const executions = safeArray(snapshot.executions);
  const total = executions.length;
  let withSkill = 0;
  let actionCompleted = 0;
  let actionFailed = 0;
  let actionBlocked = 0;
  let durationSum = 0;
  let durationCount = 0;
  let failedExecutions = 0;
  let failedWithRecovery = 0;
  let findable = 0;
  for (const execution of executions) {
    if (safeArray(execution?.matchedSkills).length) {
      withSkill += 1;
    }
    if (execution?.id) {
      findable += 1;
    }
    const events = safeArray(execution?.timeline);
    let sawFailed = false;
    let sawRecovery = false;
    for (const event of events) {
      const status = String(event?.status || "");
      if (status === "completed") {
        actionCompleted += 1;
        const duration = Number(event?.durationMs || 0);
        if (duration > 0) {
          durationSum += duration;
          durationCount += 1;
        }
        if (sawFailed) {
          sawRecovery = true;
        }
      } else if (status === "failed") {
        actionFailed += 1;
        sawFailed = true;
      } else if (status === "blocked_by_skill") {
        actionBlocked += 1;
      } else if (sawFailed && (status === "skipped" || status === "undone")) {
        sawRecovery = true;
      }
    }
    if (execution?.status === "failed" || sawFailed) {
      failedExecutions += 1;
      if (sawRecovery) {
        failedWithRecovery += 1;
      }
    }
  }
  const terminalActions = actionCompleted + actionFailed + actionBlocked;
  return {
    totalExecutions: total,
    skillHitRate: total ? withSkill / total : 0,
    actionCompletedCount: actionCompleted,
    actionFailedCount: actionFailed,
    actionBlockedBySkillCount: actionBlocked,
    actionValidityRate: terminalActions ? actionCompleted / terminalActions : 0,
    failedExecutionsCount: failedExecutions,
    failedExecutionsWithRecovery: failedWithRecovery,
    failureRecoveryRate: failedExecutions ? failedWithRecovery / failedExecutions : 0,
    executionFindabilityRate: total ? findable / total : 1,
    avgActionDurationMs: durationCount ? durationSum / durationCount : 0,
  };
}
