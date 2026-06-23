import test from 'node:test';
import assert from 'node:assert/strict';

import { clearApiConfig } from './configApi.js';
import { generateImage } from './aiImageApi.js';

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalSetTimeout = globalThis.setTimeout;

function makeJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return String(name || '').toLowerCase() === 'content-type'
          ? 'application/json'
          : null;
      },
    },
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

function makeTextResponse(body, status = 200) {
  const text = String(body || '');
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return String(name || '').toLowerCase() === 'content-type'
          ? 'text/plain'
          : null;
      },
    },
    async json() {
      return JSON.parse(text);
    },
    async text() {
      return text;
    },
  };
}

test.after(() => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  globalThis.setTimeout = originalSetTimeout;
});

test('aiImageApi: grsai 落盘失败时透传远程资源过期信息', async () => {
  globalThis.window = {
    currentProjectId: 'proj-test',
    location: { href: 'http://localhost/' },
  };
  globalThis.setTimeout = (fn, ms, ...args) =>
    originalSetTimeout(fn, Number(ms) > 0 ? 0 : Number(ms), ...args);

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl === '/api/config') {
      return makeJsonResponse({
        providers: {
          grsai: {
            apiUrl: 'https://api.grsai.example.com',
            apiKey: 'k_grsai',
          },
        },
      });
    }

    if (requestUrl === '/api/v2/proxy/image') {
      const body = JSON.parse(String(options.body || '{}'));
      const apiUrl = String(body.apiUrl || '');
      if (apiUrl.endsWith('/v1/draw/nano-banana')) {
        return makeJsonResponse({
          status: 'pending',
          data: { task_id: 'task-grsai-expired-1' },
        });
      }
      if (apiUrl.endsWith('/v1/draw/result')) {
        return makeJsonResponse({
          status: 'succeeded',
          results: [{ url: 'https://img.example.com/grsai-expired.png' }],
        });
      }
    }

    if (requestUrl === '/api/v2/save_output_from_url') {
      return makeJsonResponse({ error: 'Download HTTPError: 404' }, 502);
    }

    if (requestUrl === 'https://img.example.com/grsai-expired.png') {
      return makeTextResponse(
        'file not found, The resource is valid for 2 hours',
        404,
      );
    }

    throw new Error(`unexpected fetch url: ${requestUrl}`);
  };

  clearApiConfig();

  await assert.rejects(
    () =>
      generateImage({
        provider: 'grsai',
        model: 'nano-banana-2',
        prompt: 'p',
        inputUrls: [],
      }),
    /The resource is valid for 2 hours/,
  );
});
