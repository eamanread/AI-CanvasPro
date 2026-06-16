import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const stylePath = path.resolve(process.cwd(), 'style.css');

test('shared prompt panels use the softer glass surface override', () => {
  const css = readFileSync(stylePath, 'utf8');

  assert.match(
    css,
    /\.text-prompt-panel,\s*\.text-prompt-panel\.viewport-fixed-prompt,\s*\.text-prompt-panel\.video-fixed-prompt\{background:rgba\(22,\s*24,\s*28,\s*0\.68\)\}/
  );
});
