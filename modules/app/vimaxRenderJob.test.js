import assert from "node:assert/strict";
import test from "node:test";

import { runVimaxRenderJob } from "./vimaxRenderJob.js";

// Slice 1: the render kernel extracted from runVimaxRenderLane. It is
// UI-independent — every side effect goes through an injected dep — so the
// poll/land/cancel/tally behavior is unit-testable in isolation and (slice 2)
// reusable for the living-card lifecycle. These tests lock the kernel's
// behavior so the lane refactor stays byte-for-byte equivalent.

function baseDeps(overrides = {}) {
  const placed = [];
  const phases = [];
  const started = [];
  let clock = 0;
  return {
    placed, phases, started,
    deps: {
      submit: async () => ({ success: true, jobId: "job-1" }),
      poll: async () => ({ status: "done", result: { outputs: [], elapsedSec: 1 } }),
      placeKeyframe: (shotIdx, url) => { placed.push({ shotIdx, url }); return true; },
      sleep: async () => {},
      pollMs: 1,
      deadlineMs: 1000,
      now: () => (clock += 1), // monotone fake clock; each read advances 1ms
      isCancelled: () => false,
      onStarted: (jobId) => started.push(jobId),
      onPhase: (p) => phases.push(p),
      ...overrides,
    },
  };
}

const PARAMS = { flowId: "f1", ticketId: "tkt", shotIdxs: [0, 1], edits: [], invalidateShotIdxs: [], retryBudget: 1 };

test("submit throwing yields a failed outcome with the 渲染请求失败 reason (parity with the lane)", async () => {
  const { deps } = baseDeps({ submit: async () => { throw new Error("boom"); } });
  const out = await runVimaxRenderJob(PARAMS, deps);
  assert.equal(out.status, "failed");
  assert.match(out.reason, /渲染请求失败：boom/);
});

test("a not-configured submit yields the 未配置 failed reason", async () => {
  const { deps } = baseDeps({ submit: async () => ({ success: false, status: "not-configured" }) });
  const out = await runVimaxRenderJob(PARAMS, deps);
  assert.equal(out.status, "failed");
  assert.match(out.reason, /未配置/);
});

test("a submit with no jobId yields 未知错误 (or the server error)", async () => {
  const { deps } = baseDeps({ submit: async () => ({ success: true }) });
  const out = await runVimaxRenderJob(PARAMS, deps);
  assert.equal(out.status, "failed");
  assert.match(out.reason, /未知错误/);
});

test("onStarted fires with the job id so the lane can stash it for cancel", async () => {
  const { deps, started } = baseDeps();
  await runVimaxRenderJob(PARAMS, deps);
  assert.deepEqual(started, ["job-1"]);
});

test("happy path: tallies the final reconcile and lands keyframes on nodes", async () => {
  const { deps, placed } = baseDeps({
    poll: async () => ({
      status: "done",
      result: {
        outputs: [
          { shotIdx: 0, url: "https://g/0.png" },
          { shotIdx: 1, url: "https://g/1.png" },
        ],
        elapsedSec: 12,
      },
    }),
  });
  const out = await runVimaxRenderJob(PARAMS, deps);
  assert.equal(out.status, "done");
  assert.equal(out.done, 2);
  assert.equal(out.shotCount, 2);
  assert.equal(out.failedShots, 0);
  assert.equal(out.skipped, 0);
  assert.equal(out.missing, 0);
  assert.equal(out.elapsedSec, 12);
  assert.deepEqual(placed.map((p) => p.shotIdx).sort(), [0, 1]);
});

test("streaming outputs land progressively and are not double-placed by the final reconcile (dedup)", async () => {
  let polls = 0;
  const { deps, placed } = baseDeps({
    poll: async () => {
      polls += 1;
      if (polls === 1) {
        return { status: "running", outputs: [{ shotIdx: 0, url: "https://g/0.png" }], progress: [{ phase: "drawing 0" }] };
      }
      return { status: "done", result: { outputs: [
        { shotIdx: 0, url: "https://g/0.png" }, // already streamed -> must not re-place
        { shotIdx: 1, url: "https://g/1.png" },
      ], elapsedSec: 5 } };
    },
  });
  const out = await runVimaxRenderJob(PARAMS, deps);
  assert.equal(out.status, "done");
  assert.equal(out.done, 2, "final tally counts both url'd outputs");
  // shot 0 placed exactly once despite appearing in both the stream and the reconcile.
  assert.equal(placed.filter((p) => p.shotIdx === 0).length, 1, "shot 0 placed once (dedup)");
  assert.equal(placed.filter((p) => p.shotIdx === 1).length, 1);
});

test("a partial result tallies failed/skipped/missing/unplaced honestly", async () => {
  const { deps } = baseDeps({
    placeKeyframe: (shotIdx) => shotIdx !== 2, // shot 2 has no node -> unplaced
    poll: async () => ({ status: "done", result: { outputs: [
      { shotIdx: 0, url: "https://g/0.png" },          // done + placed
      { shotIdx: 1, error: "draw failed" },             // failedShots
      { shotIdx: 2, url: "https://g/2.png" },          // done but unplaced
      { shotIdx: 3, skipped: true },                    // skipped (reused frame)
    ], elapsedSec: 9 } }),
  });
  const out = await runVimaxRenderJob({ ...PARAMS, shotIdxs: [0, 1, 2, 3, 4] }, deps);
  assert.equal(out.status, "done");
  assert.equal(out.done, 2, "two url'd outputs");
  assert.equal(out.failedShots, 1);
  assert.equal(out.skipped, 1);
  assert.equal(out.unplaced, 1);
  assert.equal(out.missing, 1, "shot 4 produced no output at all");
});

test("a cancel mid-poll stops the loop and returns cancelled with the landed count", async () => {
  let polls = 0;
  let cancel = false;
  const { deps } = baseDeps({
    isCancelled: () => cancel,
    poll: async () => {
      polls += 1;
      cancel = true; // user clicks ⏹ during the first poll
      return { status: "running", outputs: [{ shotIdx: 0, url: "https://g/0.png" }] };
    },
  });
  const out = await runVimaxRenderJob(PARAMS, deps);
  assert.equal(out.status, "cancelled");
  assert.equal(out.jobId, "job-1");
  assert.equal(out.landedCount, 1, "the frame that landed before cancel is counted");
  assert.ok(polls >= 1);
});

test("a stuck running job past the deadline yields a 等待超时 failure", async () => {
  let t = 0;
  const { deps } = baseDeps({
    now: () => (t += 400), // each read jumps 400ms; deadlineMs 1000 -> ~2 iterations then expire
    deadlineMs: 1000,
    poll: async () => ({ status: "running", outputs: [] }),
  });
  const out = await runVimaxRenderJob(PARAMS, deps);
  assert.equal(out.status, "failed");
  assert.match(out.reason, /超时/);
});

test("a transient poll error is swallowed and the loop recovers on the next tick", async () => {
  // The kernel's `catch { continue; }` mirrors the original lane: a flaky poll
  // must not abort the render — it retries on the next interval. (slice-1
  // parity review: this resilience path was previously untested in both.)
  let polls = 0;
  const { deps } = baseDeps({
    poll: async () => {
      polls += 1;
      if (polls === 1) throw new Error("transient network blip");
      return { status: "done", result: { outputs: [{ shotIdx: 0, url: "https://g/0.png" }], elapsedSec: 3 } };
    },
  });
  const out = await runVimaxRenderJob(PARAMS, deps);
  assert.equal(out.status, "done", "render still completes after a transient poll error");
  assert.equal(polls, 2, "the failed poll was retried on the next tick");
  assert.equal(out.done, 1);
});
