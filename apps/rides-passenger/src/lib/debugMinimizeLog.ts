/** Debug-only minimize flow logging (session 5b9f75). Remove after fix verified. */
const ENDPOINT = 'http://127.0.0.1:7418/ingest/a3d13dc6-6745-44ac-a4fd-f2bafc5169ae';
const SESSION = '5b9f75';
const STORAGE_KEY = 'roam:debug-minimize-5b9f75';

export function debugMinimizeLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
): void {
  const payload = {
    sessionId: SESSION,
    location,
    message,
    data,
    hypothesisId,
    timestamp: Date.now(),
    runId: 'pre-fix',
  };
  try {
    const prev = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]') as unknown[];
    prev.push(payload);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prev.slice(-30)));
  } catch {
    /* ignore */
  }
  // #region agent log
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': SESSION },
    body: JSON.stringify(payload),
  }).catch(() => {});
  // #endregion
}
