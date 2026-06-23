import test from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => payload,
    text: async () => JSON.stringify(payload)
  };
}

test('dreaminaGenApi: 查询失败 failed 快照会继续显示生成中并轮询', async () => {
  try {
    let calls = 0;
    const progress = [];

    globalThis.fetch = async url => {
      const textUrl = String(url);
      if (textUrl.startsWith('/api/v2/dreamina/query_result?') && textUrl.includes('submitId=sid-query-failed')) {
        calls += 1;
        if (calls === 1) {
          return jsonResponse({
            success: true,
            submitId: 'sid-query-failed',
            status: 'failed',
            failReason: '查询失败',
            outputs: []
          });
        }
        return jsonResponse({
          success: true,
          submitId: 'sid-query-failed',
          status: 'success',
          outputs: [{ localPath: 'output/dreamina/text2video/query-failed.mp4' }]
        });
      }
      throw new Error('unexpected fetch url: ' + textUrl);
    };

    const { pollDreaminaUntilDone } = await import('./dreaminaGenApi.js');
    const result = await pollDreaminaUntilDone('sid-query-failed', {
      intervalMs: 1,
      maxWaitMs: 5000,
      maxTransientErrors: 3,
      onProgress: snapshot => {
        progress.push(`${snapshot.status}:${snapshot.phase}:${snapshot.label}`);
      }
    });

    assert.equal(calls, 2);
    assert.equal(result.submitId, 'sid-query-failed');
    assert.deepEqual(progress, ['pending:generating:生成中', 'success:done:已完成']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
