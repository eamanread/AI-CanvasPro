export function hasRenderableVideoResult(node) {
  if (!node || typeof node !== 'object') return false;
  const videos = Array.isArray(node.videos) ? node.videos : [];
  if (videos.length > 0) return true;
  if (String(node.videoUrl || '').trim()) return true;
  if (String(node.localPath || '').trim()) return true;
  if (String(node.src || '').trim()) return true;
  return false;
}
