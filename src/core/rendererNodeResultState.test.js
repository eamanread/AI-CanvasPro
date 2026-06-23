import test from 'node:test';
import assert from 'node:assert/strict';
import { hasRenderableVideoResult } from './rendererNodeResultState.js';

test('renderer result state: ai-video localPath counts as a renderable result', () => {
  assert.equal(hasRenderableVideoResult({ type: 'ai-video', localPath: 'output/generated.mp4' }), true);
});

test('renderer result state: ai-video videos array counts as a renderable result', () => {
  assert.equal(hasRenderableVideoResult({ type: 'ai-video', videos: [{ localPath: 'output/generated.mp4' }] }), true);
});

test('renderer result state: empty ai-video result fields are not renderable', () => {
  assert.equal(hasRenderableVideoResult({ type: 'ai-video', videos: [], videoUrl: '', localPath: '' }), false);
});
