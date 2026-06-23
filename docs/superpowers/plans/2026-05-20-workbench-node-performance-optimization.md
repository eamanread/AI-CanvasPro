# Workbench Node Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 缓解工作台画布节点数量较多时拖动、缩放、浏览卡顿的问题，并用低风险、可回滚的方式逐步定位和优化前端瓶颈。

**Architecture:** 优先利用现有 DOM 节点虚拟化能力，让离屏节点更早离开浏览器 DOM，降低主线程布局、样式计算和 SVG 连线重绘压力。后续阶段只在第一阶段验证不足时继续推进，避免把虚拟化、历史快照和主渲染器改动混在一次变更里。

**Tech Stack:** Native ES modules, DOM renderer, SVG edge rendering, Node.js built-in test runner (`node --test`), browser console performance probe.

---

## Investigation Summary

当前判断：卡顿大概率是前端画布渲染瓶颈，不像后端接口瓶颈。

依据：
- 问题和“画布上工作节点很多”强相关，典型压力点是 DOM 数量、样式计算、布局计算、SVG 连线重绘和主线程事件处理。
- `src/core/rendererVirtualization.js` 已经存在节点虚拟化逻辑，说明项目架构中已经承认“节点多时不能全部常驻 DOM”。
- 当前虚拟化窗口偏宽：`mountPadding: 600`、`parkPadding: 900`。屏幕外较远的节点仍可能保持挂载，节点密集时会留下较大的 DOM 压力。
- `src/core/interaction.js` 已经使用 `requestAnimationFrame` 批处理视口更新，所以第一怀疑点不是单纯事件没节流，而是每帧需要处理的 DOM/SVG 工作量过大。
- `modules/perf/perfProbe.js` 已经提供拖拽 FPS 和连线重绘采样入口，可以用于改前、改后对比。
- `modules/history.js` 当前保留 50 份历史快照；大图每份快照包含 nodes/edges，可能加重内存压力，但更适合作为第二阶段单独验证。

## Scope

第一阶段不修改：
- `src/core/renderer.js`
- `src/core/interaction.js`
- `modules/history.js`
- `integrations/seedance_extension_bridge/**`
- Python 服务、生成 API、Seedance 桥接逻辑

原因：
- 用户反馈的卡顿发生在已打开画布的节点交互中，优先级最高的是前端 DOM/SVG 压力。
- `src/core/renderer.js` 是压缩/混淆后的主渲染器，直接改它风险高。
- Seedance、后端接口、无头浏览器桥接和画布 pan/zoom 卡顿不是同一个问题域。

---

## Phase 1: Tighten Renderer Virtualization Window

**目标:** 只收窄现有虚拟化窗口，让离屏节点更早 park，减少同一时间挂在 DOM 里的节点数量。

**风险:** 低。

**可能副作用:**
- 快速拖动画布时，较远节点可能比现在稍晚出现。
- 如果参数过小，节点在视口边缘可能频繁 mount/park。

**风险控制:**
- 保持 `parkPadding > mountPadding`，保留滞回区间。
- 只把 `600/900` 收窄到 `400/650`，不做激进裁剪。
- 保留 `settleDelayMs: 120`、`batchSize: 24`、`recentPinMs: 2000`。

### Task 1: Add a Focused Virtualization Config Test

**Files:**
- Create: `src/core/rendererVirtualizationConfig.test.js`

- [x] **Step 1: Create the test file**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RENDERER_VIRTUALIZATION_CONFIG,
  buildVirtualizationCandidateSets,
} from './rendererVirtualization.js';

test('rendererVirtualization config keeps a bounded hysteresis window', () => {
  assert.equal(RENDERER_VIRTUALIZATION_CONFIG.mountPadding, 400);
  assert.equal(RENDERER_VIRTUALIZATION_CONFIG.parkPadding, 650);
  assert.ok(
    RENDERER_VIRTUALIZATION_CONFIG.parkPadding > RENDERER_VIRTUALIZATION_CONFIG.mountPadding,
    'park padding must stay larger than mount padding to avoid edge flicker',
  );
  assert.equal(RENDERER_VIRTUALIZATION_CONFIG.settleDelayMs, 120);
  assert.equal(RENDERER_VIRTUALIZATION_CONFIG.batchSize, 24);
  assert.equal(RENDERER_VIRTUALIZATION_CONFIG.recentPinMs, 2000);
});

test('rendererVirtualization default config parks only nodes outside the park buffer', () => {
  const result = buildVirtualizationCandidateSets({
    nodes: {
      visible: { id: 'visible', x: 980, y: 0, width: 120, height: 120 },
      hysteresis: { id: 'hysteresis', x: 1425, y: 0, width: 120, height: 120 },
      far: { id: 'far', x: 1700, y: 0, width: 120, height: 120 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    containerWidth: 1000,
    containerHeight: 800,
  });

  assert.equal(result.mountCandidateIds.has('visible'), true);
  assert.equal(result.parkCandidateIds.has('visible'), false);

  assert.equal(result.mountCandidateIds.has('hysteresis'), false);
  assert.equal(result.parkCandidateIds.has('hysteresis'), false);

  assert.equal(result.mountCandidateIds.has('far'), false);
  assert.equal(result.parkCandidateIds.has('far'), true);
});
```

- [x] **Step 2: Run the new test before implementation**

Run:

```bash
cmd /c node --test src/core/rendererVirtualizationConfig.test.js
```

Expected before config change:
- FAIL
- The failure should show the current config is still `600/900`.

### Task 2: Change Only the Virtualization Config Numbers

**Files:**
- Modify: `src/core/rendererVirtualization.js`

- [x] **Step 1: Update the config**

Change only these values:

```js
mountPadding: 600 -> 400
parkPadding: 900 -> 650
```

In the current minified numeric form, that means:

```js
0x258 -> 0x190
0x384 -> 0x28a
```

Do not change:
- `settleDelayMs`
- `batchSize`
- `recentPinMs`
- `isNodeInsideViewportPadding`
- `collectVirtualKeepAliveNodeIds`
- `buildVirtualizationCandidateSets`

- [x] **Step 2: Run focused tests**

Run:

```bash
cmd /c node --test src/core/rendererVirtualization.test.js src/core/rendererVirtualizationConfig.test.js
```

Expected:
- PASS for both virtualization test files.

### Task 3: Manual Performance Check

**Files:**
- No code changes.

- [ ] **Step 1: Enable the existing performance probe in browser console**

```js
window.__setPerfProbeEnabled?.(true)
window.__resetPerfProbe?.()
```

- [ ] **Step 2: Exercise a large-node workbench**

Manual actions:
- Pan the canvas horizontally and vertically.
- Zoom in and out.
- Select several nodes.
- Drag one node near a dense area.
- Pan away from dense nodes, then pan back.

- [ ] **Step 3: Capture before/after signals**

```js
window.__getPerfProbeSnapshot?.()
window.__huanyingRenderer?.wrapperMap?.size
[...window.__huanyingRenderer.wrapperMap.values()].filter(el => el?.isConnected).length
```

Expected:
- Mounted DOM node count should be lower when the viewport is away from dense areas.
- Offscreen nodes should reappear when panned back.
- Selected, dragged, pinned, connection-source, and hover nodes should remain interactive.
- Canvas pan/zoom should feel less likely to freeze on large workbenches.

---

## Phase 2: Reduce History Snapshot Memory Pressure

**Trigger:** Only start this phase if Phase 1 passes tests but large-node workbenches still become sluggish after many edits, undos, or long sessions.

**目标:** 降低大图长期使用时的内存压力。

**风险:** 中低。

**Tradeoff:** Undo history becomes shorter.

### Task 1: Change Default History Capacity

**Files:**
- Modify: `modules/history.js`

- [x] **Step 1: Change default history max from 50 to 30**

Current values:

```js
max = 0x32
createHistory({ store: appStore, max: 0x32 })
```

Change to:

```js
max = 0x1e
createHistory({ store: appStore, max: 0x1e })
```

- [x] **Step 2: Add or update a focused history capacity test**

If an existing history test file exists, add a test there. If no focused history test exists, create `modules/history.test.js` with a small fake store that commits 35 snapshots and verifies the undo count is capped at 30.

Expected behavior:
- After more than 30 commits, history should retain only the newest 30 undo snapshots.
- Undo and redo should still load snapshots correctly.

- [x] **Step 3: Run history tests**

Run:

```bash
cmd /c node --test modules/history.test.js
```

Expected:
- PASS.

### Task 2: Manual Long-Session Check

**Files:**
- No code changes.

- [ ] **Step 1: Open a large workbench**

- [ ] **Step 2: Perform repeated node operations**

Manual actions:
- Move nodes.
- Add or duplicate nodes.
- Delete nodes.
- Undo and redo several times.

- [ ] **Step 3: Confirm behavior**

Expected:
- Undo/redo still works.
- Long sessions should show less memory buildup than before.
- The shorter history depth is acceptable for product usage.

---

## Phase 3: Deep Renderer and Edge Redraw Optimization

**Trigger:** Only start this phase if Phase 1 and Phase 2 are insufficient, or performance probe data shows edge redraw/render work remains high even with fewer mounted nodes.

**目标:** 针对主渲染器中的高成本路径做更深层优化。

**风险:** 中高。

**Reason for deferral:** `src/core/renderer.js` is compressed/minified and central to the canvas. Changes here have wider regression risk and should be driven by measurement.

### Task 1: Extend Performance Diagnostics

**Files:**
- Modify: `modules/perf/perfProbe.js`
- Modify: `src/core/renderer.js`

- [ ] **Step 1: Add render timing samples**

Add a probe entry that records:
- render mode or trigger
- total render duration
- node count
- mounted node count
- parked node count
- edge count
- updated edge count

- [ ] **Step 2: Expose a console snapshot**

Keep using:

```js
window.__getPerfProbeSnapshot?.()
```

Expected:
- Snapshot includes drag FPS, edge redraw samples, and renderer timing samples.

### Task 2: Optimize Edge Redraw Work

**Files:**
- Modify: `src/core/renderer.js`

- [ ] **Step 1: Use probe output to identify expensive edge redraw modes**

Expected investigation output:
- Which operation causes high edge redraw duration.
- Whether all edges redraw on pan/zoom or only affected edges redraw.
- Whether offscreen edges are still being measured or updated.

- [ ] **Step 2: Reduce unnecessary edge updates**

Candidate optimization:
- Skip updating edges whose endpoints are both far outside the viewport.
- Keep edges connected to selected, dragged, hovered, or connection-source nodes alive.
- Recompute offscreen edge geometry when either endpoint re-enters the visible or near-visible area.

- [ ] **Step 3: Run focused tests and manual interaction checks**

Expected:
- Edges connected to visible nodes remain correct.
- Edges do not disappear incorrectly while selecting, dragging, or connecting nodes.
- Large workbenches show lower edge redraw duration in `window.__getPerfProbeSnapshot?.()`.

### Task 3: Avoid Unnecessary Node Updates During Pure Viewport Changes

**Files:**
- Modify: `src/core/renderer.js`
- Modify only supporting files if measurement proves a state boundary needs adjustment.

- [ ] **Step 1: Separate viewport-only work from node-data work**

Expected investigation:
- Identify whether pan/zoom triggers node component update paths that should only run on node data changes.

- [ ] **Step 2: Skip expensive node refresh paths during pure pan/zoom**

Expected behavior:
- Pan/zoom updates transform and virtualization state.
- Node content refresh only runs when node data, result state, selection state, or interaction state changes.

- [ ] **Step 3: Manual regression test**

Manual actions:
- Pan and zoom.
- Select nodes.
- Edit node parameters.
- Trigger node result changes.
- Drag nodes.
- Connect nodes.

Expected:
- Node UI remains correct.
- Pan/zoom feels smoother.
- No stale node display after edits or result updates.

---

## Rollback Plan

Phase 1 rollback:
- Restore `mountPadding: 600`.
- Restore `parkPadding: 900`.
- Remove `src/core/rendererVirtualizationConfig.test.js` if the config test only applies to the tighter values.

Phase 2 rollback:
- Restore history max from `30` to `50`.

Phase 3 rollback:
- Revert renderer and perf probe changes as a separate commit or patch.
- Keep Phase 1 if it already proved beneficial and has no regressions.

## Recommended Execution Order

1. Execute Phase 1 only.
2. Run focused virtualization tests.
3. Manually test a large workbench.
4. Decide whether Phase 2 is necessary based on long-session memory/undo behavior.
5. Enter Phase 3 only with performance probe evidence.
