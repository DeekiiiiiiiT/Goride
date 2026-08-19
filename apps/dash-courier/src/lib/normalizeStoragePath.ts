const BUCKET = 'courier-documents';

/** Extract storage path from a legacy signed URL or return path as-is. */
export function normalizeStoragePath(urlOrPath: string): string {
  if (!urlOrPath.startsWith('http')) return urlOrPath;
  try {
    const url = new URL(urlOrPath);
    const marker = `/object/sign/${BUCKET}/`;
    const publicMarker = `/object/public/${BUCKET}/`;
    const idx = url.pathname.indexOf(marker);
    if (idx >= 0) {
      return decodeURIComponent(url.pathname.slice(idx + marker.length).split('?')[0] ?? '');
    }
    const pubIdx = url.pathname.indexOf(publicMarker);
    if (pubIdx >= 0) {
      return decodeURIComponent(url.pathname.slice(pubIdx + publicMarker.length).split('?')[0] ?? '');
    }
  } catch {
    // fall through
  }
  return urlOrPath;
}
