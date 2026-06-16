// Render kernel — the UI-independent core of 「确认成片」: submit the signed job,
// poll to done/cancel/timeout, land keyframes as they arrive, and tally the
// outcome. Extracted (slice 1) from runVimaxRenderLane so the kernel is
// unit-testable in isolation and (slice 2) reusable for the message.cards
// living-card lifecycle. This module NEVER touches panel state, the DOM, the
// graph store, or the network directly — every side effect goes through an
// injected dep. It returns a structured outcome; the lane wrapper translates
// that into receipts / messages / cards. Behavior is locked byte-for-byte to
// the pre-extraction lane by vimaxRenderJob.test.js + the existing render tests.

function safeTrim(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

/**
 * @param {{flowId,ticketId,shotIdxs,edits,invalidateShotIdxs,retryBudget}} params
 * @param {{
 *   submit:(payload)=>Promise<{success?:boolean,jobId?:string,status?:string,error?:string}>,
 *   poll:(jobId:string,since:number)=>Promise<any>,
 *   placeKeyframe:(shotIdx:number,url:string)=>boolean,  // true = landed on a node
 *   sleep:(ms:number)=>Promise<void>,
 *   pollMs:number,
 *   deadlineMs:number,
 *   now:()=>number,                 // epoch ms; injected for testable timeouts
 *   isCancelled:()=>boolean,        // single-flight ⏹ flag
 *   onStarted?:(jobId:string)=>void,// stash the job id for cancel
 *   onPhase?:(p:{phase:string,landedCount:number})=>void, // progress receipt
 * }} deps
 * @returns {Promise<
 *   | {status:"failed", reason:string, jobId?:string, landedCount:number}
 *   | {status:"cancelled", jobId:string, landedCount:number}
 *   | {status:"done", jobId:string, landedCount:number, done:number, failedShots:number,
 *      skipped:number, missing:number, unplaced:number, elapsedSec:number|null, shotCount:number}
 * >}
 */
export async function runVimaxRenderJob(params, deps) {
  const { flowId, ticketId, shotIdxs, edits, invalidateShotIdxs, retryBudget } = params;
  const { submit, poll, placeKeyframe, sleep, pollMs, deadlineMs, now, isCancelled, onStarted, onPhase } = deps;

  let started = null;
  try {
    started = await submit({ flowId, ticketId, shotIdxs, edits, invalidateShotIdxs, retryBudget, maxReshootsPerShot: 1 });
  } catch (error) {
    return { status: "failed", reason: `渲染请求失败：${safeTrim(error?.message) || error}`, landedCount: 0 };
  }
  if (!started || started.success === false || !started.jobId) {
    if (started?.status === "not-configured") {
      return { status: "failed", reason: "ViMax 未配置(请设置 HY_VIMAX_HOME 后重启服务)", landedCount: 0 };
    }
    return { status: "failed", reason: safeTrim(started?.error) || "未知错误", landedCount: 0 };
  }
  const jobId = started.jobId;
  onStarted?.(jobId);

  // Land a keyframe url onto its prep node. Keyed on shotIdx (not array
  // position) and deduped via landedShots, so out-of-order or repeated outputs
  // across polls + the final reconcile never double-paint or mis-map.
  const landedShots = new Set();
  const landKeyframe = (out) => {
    const url = safeTrim(out?.url);
    if (!url) return "no-url";
    const shotIdx = Number(out?.shotIdx);
    if (!Number.isFinite(shotIdx)) return "bad-idx";
    if (landedShots.has(shotIdx)) return "already";
    if (!placeKeyframe(shotIdx, url)) return "unplaced";
    landedShots.add(shotIdx);
    return "landed";
  };

  // Render is long (≈50-75s/keyframe); poll to the server render timeout.
  const deadline = now() + deadlineMs;
  let status = null;
  let since = 0;
  let cancelled = false;
  while (now() < deadline) {
    await sleep(pollMs);
    // Single-flight escape hatch (slice 0): a ⏹ click raises the cancel flag;
    // break before the next poll so a stuck render is never a dead lock. Frames
    // landed so far are kept; the caller keeps the staged budget for 补拍.
    if (isCancelled()) { cancelled = true; break; }
    try {
      status = await poll(jobId, since);
    } catch {
      continue;
    }
    // Stream keyframes onto their prep node the moment each lands, so the canvas
    // fills in progressively instead of all-at-once at the end.
    for (const out of Array.isArray(status?.outputs) ? status.outputs : []) {
      landKeyframe(out);
    }
    const lastPhase = Array.isArray(status?.progress) && status.progress.length
      ? safeTrim(status.progress[status.progress.length - 1]?.phase)
      : "";
    if (lastPhase) {
      onPhase?.({ phase: lastPhase, landedCount: landedShots.size });
    }
    if (Number.isFinite(Number(status?.progressTotal))) since = Number(status.progressTotal);
    if (status && status.status && status.status !== "running") break;
  }

  if (cancelled) {
    return { status: "cancelled", jobId, landedCount: landedShots.size };
  }
  if (!status || status.status !== "done" || !status.result) {
    const reason = safeTrim(status?.error) || (status?.status === "not-found" ? "任务已丢失(服务可能重启)" : "等待超时");
    return { status: "failed", reason, jobId, landedCount: landedShots.size };
  }

  // Final reconcile: land any keyframe the stream missed, then tally honestly.
  const outputs = Array.isArray(status.result.outputs) ? status.result.outputs : [];
  let done = 0;
  let failedShots = 0;
  let skipped = 0;
  let unplaced = 0;
  for (const out of outputs) {
    if (out?.error) { failedShots += 1; continue; }
    const url = safeTrim(out?.url);
    if (out?.skipped && !url) { skipped += 1; continue; }
    if (!url) continue; // neither url, error nor skipped: counted as missing below
    done += 1;
    const outcome = landKeyframe(out);
    if (outcome === "unplaced" || outcome === "bad-idx") unplaced += 1;
  }
  // Anything in the selection that produced no output at all (server dropped it)
  // - surfaced so a "success" can't hide a vanished shot.
  const missing = Math.max(0, shotIdxs.length - (done + failedShots + skipped));
  const elapsedSec = Number(status.result.elapsedSec);

  return {
    status: "done",
    jobId,
    landedCount: landedShots.size,
    done,
    failedShots,
    skipped,
    missing,
    unplaced,
    elapsedSec: Number.isFinite(elapsedSec) ? elapsedSec : null,
    shotCount: shotIdxs.length,
  };
}
