import store from '../src/core/stores/appStore.js';
import { ensureThumbDecoded } from './refThumbMediaReveal.js';

let _previewEl = null;
let _previewImgEl = null;
let _previewVideoEl = null;
let _previewBadgeEl = null;
let _activeWrapEl = null;
let _rafId = 0;
let _hasGlobalHideHooks = false;
let _hideTimerId = 0;
let _currentKey = '';
let _pendingImageSrc = '';

const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|avi|mkv)(\?|#|$)/i;
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|svg|avif)(\?|#|$)/i;

function _trim(value) {
  return String(value || '').trim();
}

function _normalizeMediaSrc(value) {
  const src = _trim(value);
  if (!src) return '';
  if (
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('data:') ||
    src.startsWith('blob:') ||
    src.startsWith('/')
  ) {
    return src;
  }
  return '/' + src.replace(/^\/+/, '');
}

function _isLikelyVideoSrc(value) {
  const src = _trim(value);
  if (!src) return false;
  if (src.startsWith('data:video/')) return true;
  return VIDEO_EXT_RE.test(src);
}

function _isLikelyImageSrc(value) {
  const src = _trim(value);
  if (!src) return false;
  if (src.startsWith('data:image/')) return true;
  return IMAGE_EXT_RE.test(src);
}

function _getData(el, names) {
  if (!el) return '';
  for (const name of names) {
    const direct = _trim(el.dataset?.[name]);
    if (direct) return direct;
    const attrName = 'data-' + name.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
    const attr = _trim(el.getAttribute?.(attrName));
    if (attr) return attr;
  }
  return '';
}

function _getNodeFromStore(sourceId) {
  if (!sourceId) return null;
  try {
    // getState() deep-clones the entire store on every call; for a single-node
    // read-only lookup prefer the live (uncloned) state. Do not mutate the result.
    const state = store.getStateRaw?.() ?? store.getState?.();
    return state?.nodes?.[sourceId] || null;
  } catch {
    return null;
  }
}

function _getNodeKind(node) {
  const type = _trim(node?.type).toLowerCase();
  if (!type) return '';
  if (type.includes('video')) return 'video';
  if (type.includes('image')) return 'image';
  if (type.includes('audio')) return 'audio';
  if (type.includes('text')) return 'text';
  return '';
}

function _getPrimaryVideoData(node) {
  const videos = Array.isArray(node?.videos) ? node.videos : [];
  if (!videos.length) return null;
  const index = Number(node?.mainVideoIndex);
  const safeIndex = Number.isFinite(index) ? Math.max(0, Math.trunc(index)) : 0;
  return videos[Math.min(videos.length - 1, safeIndex)] || videos[0] || null;
}

function _firstNormalized(candidates, predicate = null) {
  for (const candidate of candidates) {
    const src = _normalizeMediaSrc(candidate);
    if (!src) continue;
    if (predicate && !predicate(src)) continue;
    return src;
  }
  return '';
}

function _deriveVideoSrcFromNode(node) {
  const video = _getPrimaryVideoData(node);
  const trustedVideoField = _firstNormalized([
    video?.videoUrl,
    video?.url,
    video?.src,
    video?.sourceUrl,
    node?.videoUrl,
    node?.url,
    node?.src,
    node?.sourceUrl
  ], value => !_isLikelyImageSrc(value));
  if (trustedVideoField) return trustedVideoField;
  return _firstNormalized([
    video?.localPath,
    video?.originalLocalPath,
    node?.localPath,
    node?.originalLocalPath,
    video?.displayLocalPath,
    node?.displayLocalPath
  ], value => _isLikelyVideoSrc(value) || (value.startsWith('blob:') && !_isLikelyImageSrc(value)));
}

function _deriveVideoPosterFromNode(node) {
  const video = _getPrimaryVideoData(node);
  const imageLike = _firstNormalized([
    video?.thumbUrl,
    video?.thumbLocalPath,
    video?.firstFrameThumbUrl,
    video?.firstFrameUrl,
    video?.imageUrl,
    node?.thumbUrl,
    node?.thumbLocalPath,
    node?.firstFrameThumbUrl,
    node?.firstFrameUrl,
    node?.imageUrl
  ], value => !_isLikelyVideoSrc(value));
  if (imageLike) return imageLike;
  return _firstNormalized([
    video?.displayLocalPath,
    node?.displayLocalPath
  ], value => _isLikelyImageSrc(value) || !_isLikelyVideoSrc(value));
}

function _deriveImageSrcFromNode(node) {
  const images = Array.isArray(node?.images) ? node.images : [];
  const index = Number(node?.mainImageIndex);
  const safeIndex = Number.isFinite(index) ? Math.max(0, Math.trunc(index)) : 0;
  const image = images[Math.min(images.length - 1, safeIndex)] || images[0] || null;
  return _firstNormalized([
    image?.thumbUrl,
    image?.thumbLocalPath,
    image?.imageUrl,
    image?.url,
    image?.src,
    image?.localPath,
    node?.thumbUrl,
    node?.thumbLocalPath,
    node?.imageUrl,
    node?.url,
    node?.src,
    node?.localPath
  ], value => !_isLikelyVideoSrc(value));
}

function _getThumbImgSrc(wrapEl) {
  const img = wrapEl?.querySelector?.('img.ref-thumb-media');
  return _normalizeMediaSrc(img?.getAttribute?.('src') || img?.src || '');
}

function _getThumbVideo(wrapEl) {
  return wrapEl?.querySelector?.('video.ref-thumb-media') || null;
}

function _setDatasetIfEmpty(el, name, value) {
  const text = _trim(value);
  if (!el?.dataset || !name || !text) return;
  if (!_trim(el.dataset[name])) el.dataset[name] = text;
}

export function resolveRefThumbPreviewMedia(wrapEl, { nodes = null } = {}) {
  if (!wrapEl) return null;
  const sourceId = _getData(wrapEl, ['sourceId']);
  const node = (sourceId && nodes?.[sourceId]) || _getNodeFromStore(sourceId);
  const explicitKind = _trim(_getData(wrapEl, ['previewKind', 'kind', 'refKind'])).toLowerCase();
  const thumbImgSrc = _getThumbImgSrc(wrapEl);
  const thumbVideo = _getThumbVideo(wrapEl);
  const videoChildSrc = _normalizeMediaSrc(
    thumbVideo?.currentSrc ||
    thumbVideo?.getAttribute?.('src') ||
    thumbVideo?.src ||
    ''
  );
  const nodeKind = _getNodeKind(node);
  const kind = explicitKind || nodeKind || (videoChildSrc ? 'video' : '') || (thumbImgSrc ? 'image' : '');

  if (kind === 'video') {
    const src = _firstNormalized([
      _getData(wrapEl, ['previewSrc', 'videoSrc', 'mediaSrc']),
      videoChildSrc,
      _deriveVideoSrcFromNode(node)
    ]);
    const poster = _firstNormalized([
      _getData(wrapEl, ['previewThumb', 'previewPoster', 'thumbSrc', 'poster']),
      thumbVideo?.getAttribute?.('poster') || thumbVideo?.poster,
      thumbImgSrc,
      _deriveVideoPosterFromNode(node)
    ], value => !_isLikelyVideoSrc(value));
    if (!src && !poster) return null;
    return { kind: 'video', src, poster };
  }

  if (kind === 'image') {
    const src = _firstNormalized([
      _getData(wrapEl, ['previewSrc', 'imageSrc', 'mediaSrc']),
      thumbImgSrc,
      _deriveImageSrcFromNode(node)
    ], value => !_isLikelyVideoSrc(value));
    if (!src) return null;
    return { kind: 'image', src };
  }

  if (thumbImgSrc) return { kind: 'image', src: thumbImgSrc };
  return null;
}

function _markPosterDecoded(img, poster) {
  ensureThumbDecoded(poster).then(() => {
    if (!img?.classList || _normalizeMediaSrc(img.getAttribute?.('src') || img.src || '') !== poster) return;
    img.classList.remove('is-pending');
    img.classList.add('is-ready');
  });
}

function _stylePosterImage(img, hasFallbackOverlay) {
  if (!img?.style) return;
  Object.assign(img.style, {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: 'inherit',
    display: 'block'
  });
  if (hasFallbackOverlay) {
    Object.assign(img.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '0'
    });
  }
}

function _styleFallbackOverlay(wrapEl, fallbackEl) {
  if (!fallbackEl || fallbackEl.tagName === 'IMG' || fallbackEl.tagName === 'VIDEO') return;
  if (wrapEl?.style && !_trim(wrapEl.style.position)) wrapEl.style.position = 'relative';
  fallbackEl.classList?.add?.('ref-thumb-video-play-overlay');
  Object.assign(fallbackEl.style || {}, {
    position: 'relative',
    zIndex: '1',
    background: 'transparent',
    pointerEvents: 'none'
  });
}

export function ensureRefThumbPreviewMediaForWrap(wrapEl, options = {}) {
  if (!wrapEl || typeof document === 'undefined') return false;
  const media = resolveRefThumbPreviewMedia(wrapEl, options);
  if (media?.kind !== 'video') return false;

  const poster = _normalizeMediaSrc(media.poster);
  if (!poster) return false;

  _setDatasetIfEmpty(wrapEl, 'previewKind', 'video');
  _setDatasetIfEmpty(wrapEl, 'previewThumb', poster);
  if (media.src) _setDatasetIfEmpty(wrapEl, 'previewSrc', media.src);

  const existingImg = wrapEl.querySelector?.('img.ref-thumb-media');
  if (existingImg) {
    const currentSrc = _normalizeMediaSrc(existingImg.getAttribute?.('src') || existingImg.src || '');
    if (existingImg.dataset?.refVideoPoster === '1' && currentSrc !== poster) {
      existingImg.src = poster;
      existingImg.setAttribute?.('src', poster);
      existingImg.classList?.add?.('is-pending');
      _markPosterDecoded(existingImg, poster);
      return true;
    }
    return false;
  }

  const fallbackEl = wrapEl.querySelector?.('.rh-v5-ref-media-fallback') || wrapEl.querySelector?.('.ref-thumb-media');
  const hasFallbackOverlay = !!fallbackEl && fallbackEl.tagName !== 'IMG' && fallbackEl.tagName !== 'VIDEO';
  const img = document.createElement('img');
  img.classList?.add?.('ref-thumb-media', 'is-pending');
  img.dataset && (img.dataset.refVideoPoster = '1');
  img.alt = '';
  img.draggable = false;
  img.src = poster;
  img.setAttribute?.('src', poster);
  img.setAttribute?.('alt', '');
  img.setAttribute?.('draggable', 'false');
  _stylePosterImage(img, hasFallbackOverlay);
  _styleFallbackOverlay(wrapEl, fallbackEl);

  if (hasFallbackOverlay && typeof wrapEl.insertBefore === 'function') {
    wrapEl.insertBefore(img, fallbackEl);
  } else {
    wrapEl.appendChild?.(img);
  }

  _markPosterDecoded(img, poster);
  return true;
}

export function decorateRefThumbPreviewMedia(containerEl, options = {}) {
  if (!containerEl?.querySelectorAll) return 0;
  let count = 0;
  for (const wrapEl of Array.from(containerEl.querySelectorAll('.ref-thumb-wrap'))) {
    if (ensureRefThumbPreviewMediaForWrap(wrapEl, options)) count += 1;
  }
  return count;
}

function _ensurePreviewEl() {
  if (_previewEl) {
    if (!_previewEl.ownerDocument || _previewEl.ownerDocument === document) return _previewEl;
    _previewEl = null;
    _previewImgEl = null;
    _previewVideoEl = null;
    _previewBadgeEl = null;
    _currentKey = '';
  }
  const root = document.createElement('div');
  root.classList?.add?.('ref-hover-preview');

  const img = document.createElement('img');
  img.classList?.add?.('ref-hover-preview-img');
  img.alt = '';

  const video = document.createElement('video');
  video.classList?.add?.('ref-hover-preview-video');
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.setAttribute?.('muted', '');
  video.setAttribute?.('playsinline', '');
  Object.assign(video.style, {
    display: 'none',
    width: 'auto',
    height: 'auto',
    maxWidth: '360px',
    maxHeight: '240px',
    objectFit: 'contain',
    borderRadius: 'var(--radius-18)',
    background: 'var(--black-90)'
  });

  const badge = document.createElement('div');
  badge.classList?.add?.('ref-hover-preview-badge');
  badge.textContent = '\u25b6';
  Object.assign(badge.style, {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    width: '42px',
    height: '42px',
    borderRadius: '999px',
    background: 'var(--black-60)',
    color: 'var(--white)',
    fontSize: '18px',
    lineHeight: '1',
    pointerEvents: 'none',
    boxShadow: '0 8px 24px var(--black-40)'
  });

  root.appendChild(img);
  root.appendChild(video);
  root.appendChild(badge);
  document.body.appendChild(root);

  _previewEl = root;
  _previewImgEl = img;
  _previewVideoEl = video;
  _previewBadgeEl = badge;
  return root;
}

function _setImagePreview(src) {
  if (!_previewImgEl || !_previewVideoEl) return;
  const key = 'image|' + src;
  _previewVideoEl.pause?.();
  _previewVideoEl.style.display = 'none';
  _previewBadgeEl && (_previewBadgeEl.style.display = 'none');
  _previewImgEl.style.display = 'block';

  if (_currentKey === key && _previewImgEl.getAttribute?.('src') === src) return;
  const isVisible = !!_previewEl?.classList?.contains('is-visible');
  if (!isVisible || !_currentKey) {
    _currentKey = key;
    _pendingImageSrc = '';
    _previewImgEl.src = src;
    _previewImgEl.setAttribute?.('src', src);
    ensureThumbDecoded(src);
    return;
  }
  _pendingImageSrc = src;
  ensureThumbDecoded(src).then(() => {
    if (_pendingImageSrc !== src || !_previewImgEl) return;
    _currentKey = key;
    _pendingImageSrc = '';
    _previewImgEl.src = src;
    _previewImgEl.setAttribute?.('src', src);
  });
}

function _setVideoPreview(media) {
  if (!_previewImgEl || !_previewVideoEl) return;
  const src = _normalizeMediaSrc(media?.src);
  const poster = _normalizeMediaSrc(media?.poster);
  const key = 'video|' + src + '|' + poster;

  if (src) {
    _previewImgEl.style.display = 'none';
    _previewVideoEl.style.display = 'block';
    _previewBadgeEl && (_previewBadgeEl.style.display = 'none');
    if (_currentKey !== key) {
      _previewVideoEl.pause?.();
      if (poster) {
        _previewVideoEl.poster = poster;
        _previewVideoEl.setAttribute?.('poster', poster);
        ensureThumbDecoded(poster);
      } else {
        _previewVideoEl.removeAttribute?.('poster');
      }
      _previewVideoEl.src = src;
      _previewVideoEl.setAttribute?.('src', src);
      _previewVideoEl.load?.();
      _currentKey = key;
      _pendingImageSrc = '';
    }
    const playPromise = _previewVideoEl.play?.();
    playPromise?.catch?.(() => {});
    return;
  }

  if (poster) {
    _previewVideoEl.pause?.();
    _previewVideoEl.style.display = 'none';
    _previewImgEl.style.display = 'block';
    _previewBadgeEl && (_previewBadgeEl.style.display = 'flex');
    _previewImgEl.src = poster;
    _previewImgEl.setAttribute?.('src', poster);
    ensureThumbDecoded(poster);
    _currentKey = key;
  }
}

function _hide() {
  if (_hideTimerId) clearTimeout(_hideTimerId);
  _hideTimerId = 0;
  if (_rafId) cancelAnimationFrame(_rafId);
  _rafId = 0;
  _activeWrapEl = null;
  _pendingImageSrc = '';
  _previewVideoEl?.pause?.();
  _previewEl?.classList?.remove('is-visible');
}

function _scheduleHide(delay = 80) {
  if (_hideTimerId) clearTimeout(_hideTimerId);
  _hideTimerId = window.setTimeout(() => {
    _hideTimerId = 0;
    _hide();
  }, delay);
}

function _schedulePosition() {
  if (_rafId) return;
  _rafId = requestAnimationFrame(() => {
    _rafId = 0;
    if (!_activeWrapEl || !_previewEl) return;
    const rect = _activeWrapEl.getBoundingClientRect();
    const left = rect.left + rect.width / 2;
    const top = rect.top - 10;
    _previewEl.style.left = Math.round(left) + 'px';
    _previewEl.style.top = Math.round(top) + 'px';
  });
}

function _showForWrap(wrapEl, options = {}) {
  const media = resolveRefThumbPreviewMedia(wrapEl, options);
  if (!media) {
    _hide();
    return false;
  }

  _ensurePreviewEl();
  _activeWrapEl = wrapEl;
  if (_hideTimerId) clearTimeout(_hideTimerId);
  _hideTimerId = 0;

  if (media.kind === 'video') _setVideoPreview(media);
  else _setImagePreview(media.src);

  _previewEl.classList.add('is-visible');
  _schedulePosition();
  return true;
}

function _ensureGlobalHideHooks() {
  if (_hasGlobalHideHooks) return;
  _hasGlobalHideHooks = true;
  window.addEventListener('scroll', _hide, true);
  window.addEventListener('blur', _hide, true);
  window.addEventListener('wheel', _hide, { passive: true, capture: true });
}

export function showRefThumbPreviewForWrap(wrapEl, options = {}) {
  if (!wrapEl) return false;
  _ensureGlobalHideHooks();
  ensureRefThumbPreviewMediaForWrap(wrapEl, options);
  return _showForWrap(wrapEl, options);
}

export function hideRefThumbPreview({ delay = 0 } = {}) {
  if (delay > 0) {
    _scheduleHide(delay);
    return;
  }
  _hide();
}

export function bindRefThumbHoverPreview(containerEl, options = {}) {
  if (!containerEl) return () => {};
  _ensureGlobalHideHooks();
  decorateRefThumbPreviewMedia(containerEl, options);

  let mutationObserver = null;
  if (typeof MutationObserver === 'function') {
    mutationObserver = new MutationObserver(() => {
      decorateRefThumbPreviewMedia(containerEl, options);
    });
    mutationObserver.observe(containerEl, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-source-id', 'data-kind', 'data-ref-kind', 'data-preview-kind', 'data-preview-thumb', 'data-preview-poster']
    });
  }

  const onPointerOver = event => {
    const wrapEl = event.target?.closest?.('.ref-thumb-wrap');
    if (!wrapEl || !containerEl.contains(wrapEl)) return;
    ensureRefThumbPreviewMediaForWrap(wrapEl, options);
    _showForWrap(wrapEl, options);
  };

  const onPointerOut = event => {
    const wrapEl = event.target?.closest?.('.ref-thumb-wrap');
    if (!wrapEl || !containerEl.contains(wrapEl)) return;
    const relatedTarget = event.relatedTarget;
    if (relatedTarget && wrapEl.contains(relatedTarget)) return;
    if (relatedTarget && containerEl.contains(relatedTarget)) {
      _scheduleHide(80);
      return;
    }
    _hide();
  };

  const onPointerMove = () => {
    if (!_activeWrapEl) return;
    if (!containerEl.contains(_activeWrapEl)) {
      _hide();
      return;
    }
    _schedulePosition();
  };

  const onPointerDown = () => _hide();

  containerEl.addEventListener('pointerover', onPointerOver);
  containerEl.addEventListener('pointerout', onPointerOut);
  containerEl.addEventListener('pointermove', onPointerMove);
  containerEl.addEventListener('pointerdown', onPointerDown, true);

  return () => {
    mutationObserver?.disconnect?.();
    containerEl.removeEventListener('pointerover', onPointerOver);
    containerEl.removeEventListener('pointerout', onPointerOut);
    containerEl.removeEventListener('pointermove', onPointerMove);
    containerEl.removeEventListener('pointerdown', onPointerDown, true);
  };
}
