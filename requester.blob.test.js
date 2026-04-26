import assert from 'node:assert/strict';
import test from 'node:test';

test('requester: responseType blob returns a Blob instead of parsing JSON/text', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'image/png' },
    blob: async () => new Blob(['pngdata'], { type: 'image/png' }),
    text: async () => 'not-a-blob',
    json: async () => ({ wrong: true }),
  });

  try {
    const { requester } = await import('./api/requester.js');
    const result = await requester({
      url: 'https://example.com/test.png',
      buildUrl: false,
      provider: 'remote',
      responseType: 'blob',
    });

    assert.ok(result instanceof Blob);
    assert.equal(result.type, 'image/png');
    assert.equal(await result.text(), 'pngdata');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
