import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('requirements: opencv-python stays on a wheel-backed version range', () => {
  const requirements = readFileSync(new URL('./requirements.txt', import.meta.url), 'utf8');
  const opencvLine = requirements
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('opencv-python'));

  assert.ok(opencvLine, 'opencv-python dependency should exist in requirements.txt');
  assert.match(
    opencvLine,
    /^opencv-python>=4\.8,<4\.11$/,
    'opencv-python should stay below 4.11 so Python 3.12 macOS installs use prebuilt wheels'
  );
});
