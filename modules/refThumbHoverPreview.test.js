import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  bindRefThumbHoverPreview,
  hideRefThumbPreview,
  resolveRefThumbPreviewMedia,
  showRefThumbPreviewForWrap
} from './refThumbHoverPreview.js';
import { _handlePillHover, _handlePillOut } from './nodePromptShared.js';

const previousDocument = globalThis.document;
const previousWindow = globalThis.window;
const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
const previousImage = globalThis.Image;

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
    return this.values.has(String(name));
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
    this.textContent = '';
    this.innerHTML = '';
    this.scrollIntoViewCalled = false;
  }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  insertBefore(child, beforeChild) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    const index = this.children.indexOf(beforeChild);
    if (index >= 0) this.children.splice(index, 0, child);
    else this.children.push(child);
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
    this.attributes.set(String(name), String(value));
    if (String(name) === 'src') this.src = String(value);
    if (String(name) === 'poster') this.poster = String(value);
    if (String(name).startsWith('data-')) {
      const key = String(name)
        .slice(5)
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = String(value);
    }
  }

  getAttribute(name) {
    return this.attributes.get(String(name)) || '';
  }

  removeAttribute(name) {
    this.attributes.delete(String(name));
    if (String(name) === 'src') this.src = '';
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const hasClass = (element, name) => {
      return element.classList.contains(name) || String(element.className || '').split(/\s+/).includes(name);
    };
    const matches = element => {
      if (selector === 'img.ref-thumb-media') {
        return element.tagName === 'IMG' && hasClass(element, 'ref-thumb-media');
      }
      if (selector === 'video.ref-thumb-media') {
        return element.tagName === 'VIDEO' && hasClass(element, 'ref-thumb-media');
      }
      if (selector === '.ref-thumb-wrap') {
        return hasClass(element, 'ref-thumb-wrap');
      }
      if (selector === '.ref-thumb-media') {
        return hasClass(element, 'ref-thumb-media');
      }
      if (selector === '.rh-v5-ref-media-fallback') {
        return hasClass(element, 'rh-v5-ref-media-fallback');
      }
      if (selector === '.ref-hover-preview') {
        return hasClass(element, 'ref-hover-preview');
      }
      if (selector === '.ref-hover-preview-img') {
        return hasClass(element, 'ref-hover-preview-img');
      }
      if (selector === '.ref-hover-preview-video') {
        return hasClass(element, 'ref-hover-preview-video');
      }
      return false;
    };
    const visit = element => {
      for (const child of element.children) {
        if (matches(child)) results.push(child);
        visit(child);
      }
    };
    visit(this);
    return results;
  }

  closest(selector) {
    if (selector === '.ref-pill' && this.classList.contains('ref-pill')) return this;
    if (selector === '.ref-thumb-wrap' && this.classList.contains('ref-thumb-wrap')) return this;
    return this.parentNode?.closest?.(selector) || null;
  }

  contains(other) {
    if (other === this) return true;
    return this.children.some(child => child.contains(other));
  }

  getBoundingClientRect() {
    return { left: 100, top: 80, width: 44, height: 44 };
  }

  scrollIntoView() {
    this.scrollIntoViewCalled = true;
  }

  addEventListener() {}

  removeEventListener() {}
}

class FakeVideoElement extends FakeElement {
  constructor() {
    super('video');
    this.muted = false;
    this.loop = false;
    this.playsInline = false;
    this.preload = '';
    this.src = '';
    this.poster = '';
    this.paused = true;
  }

  play() {
    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }
}

function createDocumentStub() {
  const body = new FakeElement('body');
  const doc = {
    body,
    createElement(tagName) {
      const element = String(tagName).toLowerCase() === 'video'
        ? new FakeVideoElement()
        : new FakeElement(tagName);
      element.ownerDocument = doc;
      return element;
    }
  };
  body.ownerDocument = doc;
  return doc;
}

function createRefWrap({ sourceId = 'video-1', thumbSrc = '/data/thumb.webp' } = {}) {
  const wrap = new FakeElement('div');
  wrap.classList.add('ref-thumb-wrap');
  wrap.dataset.sourceId = sourceId;
  const img = new FakeElement('img');
  img.classList.add('ref-thumb-media');
  img.setAttribute('src', thumbSrc);
  wrap.appendChild(img);
  return wrap;
}

function createVideoFallbackRefWrap({ sourceId = 'video-1' } = {}) {
  const wrap = new FakeElement('div');
  wrap.classList.add('ref-thumb-wrap');
  wrap.dataset.sourceId = sourceId;
  wrap.dataset.kind = 'video';
  const fallback = new FakeElement('div');
  fallback.classList.add('ref-thumb-media', 'rh-v5-ref-media-fallback');
  wrap.appendChild(fallback);
  return wrap;
}

beforeEach(() => {
  globalThis.document = createDocumentStub();
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    setTimeout(callback) {
      callback();
      return 1;
    },
    clearTimeout() {}
  };
  globalThis.requestAnimationFrame = callback => {
    callback();
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.Image = class {
    set src(value) {
      this._src = value;
      this.complete = true;
      this.naturalWidth = 1;
    }

    decode() {
      return Promise.resolve();
    }
  };
});

afterEach(() => {
  hideRefThumbPreview();
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
  if (previousRequestAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
  else globalThis.requestAnimationFrame = previousRequestAnimationFrame;
  if (previousCancelAnimationFrame === undefined) delete globalThis.cancelAnimationFrame;
  else globalThis.cancelAnimationFrame = previousCancelAnimationFrame;
  if (previousImage === undefined) delete globalThis.Image;
  else globalThis.Image = previousImage;
});

test('resolves video reference previews from source node media and poster data', () => {
  const wrap = createRefWrap();
  const media = resolveRefThumbPreviewMedia(wrap, {
    nodes: {
      'video-1': {
        id: 'video-1',
        type: 'source-video',
        localPath: 'output/video.mp4',
        thumbUrl: '/data/thumb.webp'
      }
    }
  });

  assert.equal(media.kind, 'video');
  assert.equal(media.src, '/output/video.mp4');
  assert.equal(media.poster, '/data/thumb.webp');
});

test('does not treat video poster images as playable video sources', () => {
  const wrap = createRefWrap();
  const media = resolveRefThumbPreviewMedia(wrap, {
    nodes: {
      'video-1': {
        id: 'video-1',
        type: 'source-video',
        displayLocalPath: 'data/uploads/video-display.webp',
        thumbUrl: '/data/uploads/video-thumb.webp'
      }
    }
  });

  assert.equal(media.kind, 'video');
  assert.equal(media.src, '');
  assert.equal(media.poster, '/data/thumb.webp');
});

test('shows a muted video preview for a video reference wrap', () => {
  const wrap = createRefWrap();

  showRefThumbPreviewForWrap(wrap, {
    nodes: {
      'video-1': {
        id: 'video-1',
        type: 'source-video',
        localPath: 'output/video.mp4',
        thumbUrl: '/data/thumb.webp'
      }
    }
  });

  const preview = document.body.querySelector('.ref-hover-preview');
  const video = preview.querySelector('.ref-hover-preview-video');

  assert.equal(preview.classList.contains('is-visible'), true);
  assert.equal(video.src, '/output/video.mp4');
  assert.equal(video.poster, '/data/thumb.webp');
  assert.equal(video.muted, true);
  assert.equal(video.paused, false);
});

test('bind decorates video reference fallback tiles with the source poster', () => {
  const container = new FakeElement('div');
  const wrap = createVideoFallbackRefWrap();
  const fallback = wrap.querySelector('.rh-v5-ref-media-fallback');
  container.appendChild(wrap);

  const cleanup = bindRefThumbHoverPreview(container, {
    nodes: {
      'video-1': {
        id: 'video-1',
        type: 'source-video',
        localPath: 'output/video.mp4',
        videos: [{ thumbUrl: '/data/first-frame.webp' }]
      }
    }
  });

  const img = wrap.querySelector('img.ref-thumb-media');
  assert.ok(img);
  assert.equal(img.getAttribute('src'), '/data/first-frame.webp');
  assert.equal(fallback.parentNode, wrap);

  cleanup();
});

test('@ pill hover shows and hides the matching video reference preview', () => {
  const wrap = createRefWrap();
  wrap.dataset.previewKind = 'video';
  wrap.dataset.previewSrc = '/output/video.mp4';
  wrap.dataset.previewThumb = '/data/thumb.webp';

  const refBarEl = new FakeElement('div');
  refBarEl.appendChild(wrap);
  refBarEl.querySelector = selector => {
    if (selector === '.ref-thumb-wrap[data-source-id="video-1"]') return wrap;
    return null;
  };

  const pill = new FakeElement('span');
  pill.classList.add('ref-pill');
  pill.dataset.nodeId = 'video-1';

  _handlePillHover({ target: pill }, { refBarEl });

  let preview = document.body.querySelector('.ref-hover-preview');
  let video = preview.querySelector('.ref-hover-preview-video');
  assert.equal(wrap.classList.contains('highlight'), true);
  assert.equal(wrap.scrollIntoViewCalled, true);
  assert.equal(video.src, '/output/video.mp4');

  _handlePillOut({ target: pill }, { refBarEl });

  preview = document.body.querySelector('.ref-hover-preview');
  assert.equal(wrap.classList.contains('highlight'), false);
  assert.equal(preview.classList.contains('is-visible'), false);
});
