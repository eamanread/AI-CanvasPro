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
