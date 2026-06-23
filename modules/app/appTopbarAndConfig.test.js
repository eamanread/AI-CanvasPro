import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDreaminaCancelledStatusSnapshot,
  openDreaminaManualAuthLinkInWindow,
  shouldAutoOpenDreaminaWebAuthLink,
} from './appTopbarAndConfig.js';

test('shouldAutoOpenDreaminaWebAuthLink opens after web login success', () => {
  const status = {
    runtime: {
      active: true,
      loginMode: 'web',
      phase: 'success',
      authorizeUrl: 'https://example.com/dreamina/cli/v1/dreamina_cli_login?cb=1',
      loginPageUrl: 'https://jimeng.jianying.com/ai-tool/login',
    },
  };

  const state = {
    webLoginPrimedAt: Date.now() - 30000,
    autoOpenedManualAuthUrl: '',
  };

  assert.equal(shouldAutoOpenDreaminaWebAuthLink(status, state, Date.now()), true);
});

test('shouldAutoOpenDreaminaWebAuthLink does not open for non-terminal phase', () => {
  const status = {
    runtime: {
      active: true,
      loginMode: 'web',
      phase: 'starting',
      authorizeUrl: 'https://example.com/dreamina/cli/v1/dreamina_cli_login?cb=1',
      loginPageUrl: 'https://jimeng.jianying.com/ai-tool/login',
    },
  };

  const state = {
    webLoginPrimedAt: Date.now() - 30000,
    autoOpenedManualAuthUrl: '',
  };

  assert.equal(shouldAutoOpenDreaminaWebAuthLink(status, state, Date.now()), false);
});

test('openDreaminaManualAuthLinkInWindow reuses an existing browser window', () => {
  const opened = [];
  const handle = {
    closed: false,
    location: {
      href: 'https://example.com/old',
    },
    focus() {
      opened.push('focus');
    },
  };

  const result = openDreaminaManualAuthLinkInWindow(handle, 'https://example.com/new');

  assert.equal(result, true);
  assert.equal(handle.location.href, 'https://example.com/new');
  assert.deepEqual(opened, ['focus']);
});

test('buildDreaminaCancelledStatusSnapshot clears active login state immediately', () => {
  const status = {
    installed: true,
    loggedIn: false,
    message: '网页登录已启动',
    runtime: {
      active: true,
      phase: 'starting',
      loginMode: 'web',
      startedAt: 100,
      loginPageUrl: 'https://jimeng.jianying.com/ai-tool/login',
      authorizeUrl: 'https://example.com/auth',
    },
  };

  const cancelled = buildDreaminaCancelledStatusSnapshot(status);

  assert.equal(cancelled.loggedIn, false);
  assert.equal(cancelled.message, '即梦登录已取消');
  assert.equal(cancelled.runtime.active, false);
  assert.equal(cancelled.runtime.phase, 'cancelled');
  assert.equal(cancelled.runtime.message, '即梦登录已取消');
  assert.equal(cancelled.runtime.loginMode, 'web');
  assert.equal(cancelled.runtime.loginPageUrl, 'https://jimeng.jianying.com/ai-tool/login');
});
