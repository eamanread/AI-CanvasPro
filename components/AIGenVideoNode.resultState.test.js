import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('AIGenVideoNode update clears stale no-result class after video generation result arrives', () => {
  const script = String.raw`
    import assert from 'node:assert/strict';

    class FakeClassList {
      constructor(owner) {
        this.owner = owner;
        this.items = new Set();
      }
      add(...tokens) {
        for (const token of tokens) {
          if (token) this.items.add(String(token));
        }
        this.sync();
      }
      remove(...tokens) {
        for (const token of tokens) this.items.delete(String(token));
        this.sync();
      }
      toggle(token, force) {
        const name = String(token);
        const shouldAdd = force === undefined ? !this.items.has(name) : !!force;
        if (shouldAdd) this.items.add(name);
        else this.items.delete(name);
        this.sync();
        return shouldAdd;
      }
      contains(token) {
        return this.items.has(String(token));
      }
      sync() {
        this.owner.className = Array.from(this.items).join(' ');
      }
    }

    function createElement(tagName = 'div') {
      const el = {
        tagName: String(tagName || 'div').toUpperCase(),
        className: '',
        style: {
          setProperty() {},
          removeProperty() {}
        },
        dataset: {},
        children: [],
        childNodes: [],
        parentNode: null,
        textContent: '',
        innerHTML: '',
        appendChild(child) {
          if (child?.parentNode) child.parentNode.removeChild(child);
          child.parentNode = this;
          this.children.push(child);
          this.childNodes.push(child);
          return child;
        },
        removeChild(child) {
          this.children = this.children.filter((item) => item !== child);
          this.childNodes = this.childNodes.filter((item) => item !== child);
          child.parentNode = null;
          return child;
        },
        replaceChildren(...children) {
          this.children = [];
          this.childNodes = [];
          for (const child of children) this.appendChild(child);
        },
        remove() {
          if (this.parentNode) this.parentNode.removeChild(this);
        },
        addEventListener() {},
        removeEventListener() {},
        querySelector() { return null; },
        querySelectorAll() { return []; },
        setAttribute(name, value) { this[String(name)] = String(value); },
        getAttribute(name) { return this[String(name)] || ''; },
        closest() { return null; },
        contains(target) { return target === this || this.children.includes(target); },
        getBoundingClientRect() {
          return { left: 0, top: 0, right: 320, bottom: 180, width: 320, height: 180 };
        }
      };
      el.classList = new FakeClassList(el);
      return el;
    }

    const body = createElement('body');
    const documentElement = createElement('html');
    globalThis.window = {
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {},
      getSelection() { return null; },
      innerWidth: 1200,
      innerHeight: 800,
      DEV_MODE: false,
      showToast() {},
      _triggerLocalCacheSave() {},
      URL: {
        createObjectURL() { return 'blob:test'; },
        revokeObjectURL() {}
      }
    };
    globalThis.document = {
      activeElement: null,
      body,
      documentElement,
      addEventListener() {},
      removeEventListener() {},
      createElement,
      createElementNS(_ns, tagName) { return createElement(tagName); },
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; }
    };
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText() { return Promise.resolve(); } } },
      configurable: true
    });
    globalThis.requestAnimationFrame = () => 0;
    globalThis.cancelAnimationFrame = () => {};
    globalThis.CustomEvent = class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    };

    const { AIGenVideoNode } = await import('./components/AIGenVideoNode.js');
    const instance = new AIGenVideoNode({
      id: 'node-video-result-menu',
      type: 'ai-video',
      provider: 'grsai',
      model: 'nano-video-1'
    });
    instance._root = createElement('div');
    instance._root.classList.add('no-result');
    instance.previewEl = createElement('div');
    instance._placeholderEl = createElement('div');
    instance.promptEl = createElement('div');
    instance.footerEl = null;
    instance._normalizeDreaminaNodeData = (data) => data;
    instance._loadAndDisplayVideo = () => {};
    instance._updateSubmitButtonState = () => {};
    instance._maybeResumeDreaminaTaskImpl = () => {};
    instance._maybeResumeRunningHubTaskImpl = () => {};
    instance._maybeResumeAsyncTaskImpl = () => {};
    instance._renderRefBar = () => {};
    instance._syncPromptBoxSizeFromData = () => {};
    instance._syncDreaminaPromptPlaceholder = () => {};
    instance._isDreaminaVideoNode = () => false;
    instance._isRunninghubWorkflowModel = () => false;

    instance.update({
      id: 'node-video-result-menu',
      type: 'ai-video',
      provider: 'grsai',
      model: 'nano-video-1',
      videos: [{ localPath: 'output/generated.mp4' }],
      localPath: 'output/generated.mp4',
      _bizRev: 2
    });

    assert.equal(instance._root.classList.contains('no-result'), false);
    process.exit(0);
  `;

  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 15000
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
