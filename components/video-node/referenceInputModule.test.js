import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createVideoNodeReferenceInputModule } from './referenceInputModule.js';

const previousDocument = globalThis.document;
const previousWindow = globalThis.window;
const previousUrl = globalThis.URL;

class FakeClassList {
  constructor(owner) {
    this.owner = owner;
    this.values = new Set();
  }

  add(...names) {
    names.filter(Boolean).forEach(name => this.values.add(String(name)));
    this._sync();
  }

  remove(...names) {
    names.filter(Boolean).forEach(name => this.values.delete(String(name)));
    this._sync();
  }

  contains(name) {
    const classes = String(this.owner.className || '').split(/\s+/).filter(Boolean);
    return this.values.has(String(name)) || classes.includes(String(name));
  }

  _sync() {
    this.owner.className = Array.from(this.values).join(' ');
  }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.className = '';
    this.classList = new FakeClassList(this);
    this.attributes = new Map();
    this._innerHTML = '';
  }

  set innerHTML(value) {
    this._innerHTML = String(value || '');
  }

  get innerHTML() {
    return this._innerHTML;
  }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  setAttribute(name, value) {
    const key = String(name || '');
    this.attributes.set(key, String(value || ''));
    if (key === 'draggable') this.draggable = String(value || '');
    if (key.startsWith('data-')) {
      const dataKey = key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[dataKey] = String(value || '');
    }
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    if (selector !== '.ref-thumb-wrap') return [];
    return this.children.filter(child => child.classList.contains('ref-thumb-wrap'));
  }

  addEventListener() {}
}

class FakeRefBarElement extends FakeElement {
  constructor() {
    super('div');
    this.container = null;
    this.promptButton = null;
  }

  set innerHTML(value) {
    this._innerHTML = String(value || '');
    this.children = [];
    this.container = null;
    this.promptButton = null;
    if (this._innerHTML.includes('prompt-attachment-btn')) {
      this.promptButton = new FakeElement('div');
      this.promptButton.className = 'prompt-attachment-btn';
      this.appendChild(this.promptButton);
    }
    if (this._innerHTML.includes('ref-thumb-container')) {
      this.container = new FakeElement('div');
      this.container.className = 'ref-thumb-container';
      this.appendChild(this.container);
    }
  }

  get innerHTML() {
    return this._innerHTML;
  }

  querySelector(selector) {
    if (selector === '.prompt-attachment-btn') return this.promptButton;
    if (selector === '.ref-thumb-container') return this.container;
    return super.querySelector(selector);
  }
}

function createDocumentStub() {
  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    }
  };
}

function createStore(state, incomingEdges) {
  return {
    getState() {
      return state;
    },
    getIncomingEdges(nodeId) {
      return incomingEdges.filter(edge => edge.targetId === nodeId);
    }
  };
}

beforeEach(() => {
  globalThis.document = createDocumentStub();
  globalThis.window = { ADVANCED_MODE: false };
  globalThis.URL = {
    createObjectURL() {
      return 'blob:test-thumb';
    },
    revokeObjectURL() {}
  };
});

afterEach(() => {
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
  if (previousUrl === undefined) delete globalThis.URL;
  else globalThis.URL = previousUrl;
});

test('reference input renders a nested video first-frame thumb in the small tile', async () => {
  const targetId = 'video-target';
  const sourceId = 'source-video-1';
  const state = {
    nodes: {
      [targetId]: {
        id: targetId,
        type: 'ai-video',
        provider: 'grsai',
        model: 'nano-video-1'
      },
      [sourceId]: {
        id: sourceId,
        type: 'source-video',
        localPath: 'output/video.mp4',
        videos: [{ localPath: 'output/video.mp4', thumbUrl: '/data/first-frame.webp' }]
      }
    }
  };
  const incomingEdges = [{ id: 'edge-video-ref', sourceId, targetId, refSlot: '' }];
  const decoded = [];
  const proto = createVideoNodeReferenceInputModule({
    store: createStore(state, incomingEdges),
    api: {},
    _syncPillLabels() {},
    getImage: async () => null,
    ensureThumbDecoded(src) {
      decoded.push(src);
    },
    revealRefThumbMedia() {}
  });
  const refBarEl = new FakeRefBarElement();
  const ctx = Object.assign(Object.create(proto), {
    nodeId: targetId,
    _data: state.nodes[targetId],
    refBarEl,
    _refThumbObjectUrls: new Map(),
    _v5RefThumbObjectUrls: new Map(),
    _basicRefThumbObjectUrls: new Map(),
    _ltxRefThumbObjectUrls: new Map(),
    _videoThumbPending: new Set(),
    _isRunninghubWorkflowModel() {
      return false;
    },
    _resolveMediaUrl(value) {
      return String(value || '');
    },
    _syncBtnIconState() {}
  });

  await proto._renderRefBarImpl.call(ctx);

  const wrap = refBarEl.container?.children[0] || null;
  assert.ok(wrap, 'expected a rendered reference tile');
  assert.match(wrap.innerHTML, /<img src="\/data\/first-frame\.webp"/);
  assert.doesNotMatch(wrap.innerHTML, /rh-v5-ref-media-fallback/);
  assert.deepEqual(decoded, ['/data/first-frame.webp']);
});

test('reference input source state key changes when a nested video thumb appears', () => {
  const proto = createVideoNodeReferenceInputModule({
    store: createStore({ nodes: {} }, []),
    api: {},
    _syncPillLabels() {},
    getImage: async () => null,
    ensureThumbDecoded() {},
    revealRefThumbMedia() {}
  });
  const withoutThumb = {
    id: 'source-video-1',
    type: 'source-video',
    localPath: 'output/video.mp4',
    videos: [{ localPath: 'output/video.mp4' }]
  };
  const withThumb = {
    ...withoutThumb,
    videos: [{ localPath: 'output/video.mp4', thumbUrl: '/data/first-frame.webp' }]
  };

  assert.notEqual(
    proto._getRefSourceStateKey(withoutThumb),
    proto._getRefSourceStateKey(withThumb)
  );
});
