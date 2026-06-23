import assert from 'node:assert/strict';
import test from 'node:test';

const {
  resolvePromptSubmitGeneratingState,
  scanPromptSubmitButtons,
} = await import('./modules/promptSubmitButtonState.js');

test('prompt submit state detects generating labels', () => {
  assert.equal(resolvePromptSubmitGeneratingState({ text: '\u751f\u6210\u4e2d', disabled: true }), true);
  assert.equal(resolvePromptSubmitGeneratingState({ text: '\u63d0\u4ea4\u4e2d', disabled: true }), true);
  assert.equal(resolvePromptSubmitGeneratingState({ className: 'is-generating', disabled: true }), true);
});

test('prompt submit state returns to idle for normal labels or enabled buttons', () => {
  assert.equal(resolvePromptSubmitGeneratingState({ text: '\u751f\u6210', disabled: false, previousGenerating: true }), false);
  assert.equal(resolvePromptSubmitGeneratingState({ text: '', disabled: false, previousGenerating: true }), false);
  assert.equal(resolvePromptSubmitGeneratingState({ className: 'runninghub-provider', disabled: true }), false);
});

test('prompt submit state preserves generating while button stays disabled', () => {
  assert.equal(resolvePromptSubmitGeneratingState({ text: '', disabled: true, previousGenerating: true }), true);
  assert.equal(resolvePromptSubmitGeneratingState({ text: '', disabled: true, previousGenerating: false }), false);
});

test('prompt submit scan covers prompt buttons outside the text panel', () => {
  const originalNode = globalThis.Node;
  globalThis.Node = { ELEMENT_NODE: 1 };

  const button = {
    nodeType: 1,
    className: 'prompt-submit',
    disabled: true,
    dataset: { promptSubmitGenerating: 'true' },
    innerHTML: '<svg data-old></svg>',
    textContent: '',
    classList: {
      added: new Set(),
      removed: new Set(),
      toggle(name, on) {
        if (on) this.added.add(name);
        else this.removed.add(name);
      },
    },
    matches() {
      return false;
    },
    setAttribute() {},
    getAttribute() { return ''; },
    querySelector() { return null; },
  };

  const root = {
    nodeType: 1,
    matches(selector) {
      return selector === '.text-prompt-panel .prompt-submit:not(.debug-wrench-btn)';
    },
    querySelectorAll(selector) {
      return selector === '.prompt-submit:not(.debug-wrench-btn)' ? [button] : [];
    },
  };

  try {
    scanPromptSubmitButtons(root);
    assert.equal(button.dataset.promptSubmitGenerating, 'true');
    assert.equal(button.classList.added.has('is-icon-spinning'), true);
    assert.match(button.innerHTML, /path d="M12 19V5"/);
  } finally {
    globalThis.Node = originalNode;
  }
});

test('prompt submit state preserves explicit generation stop buttons', () => {
  const originalNode = globalThis.Node;
  globalThis.Node = { ELEMENT_NODE: 1 };

  const button = {
    nodeType: 1,
    className: 'prompt-submit',
    disabled: false,
    dataset: { generationAction: 'stop' },
    innerHTML: '<svg data-stop></svg>',
    textContent: '',
    classList: { toggle() {} },
    matches(selector) {
      if (selector === '.debug-wrench-btn') return false;
      return String(selector).includes('prompt-submit');
    },
    setAttribute() { throw new Error('explicit stop button should not be normalized'); },
    getAttribute(name) { return name === 'data-generation-action' ? 'stop' : ''; },
    querySelector() { return null; },
  };

  try {
    scanPromptSubmitButtons(button);
    assert.equal(button.innerHTML, '<svg data-stop></svg>');
  } finally {
    globalThis.Node = originalNode;
  }
});
