const DEBUG_BUFFER_KEY = 'debug_daf54e_buffer';

/** Session debug logging — remove after investigation. */
export function debugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
) {
  const entry = {
    sessionId: 'daf54e',
    location,
    message,
    data,
    hypothesisId,
    timestamp: Date.now(),
  };

  try {
    const raw = sessionStorage.getItem(DEBUG_BUFFER_KEY);
    const buf: typeof entry[] = raw ? JSON.parse(raw) : [];
    buf.push(entry);
    if (buf.length > 80) buf.splice(0, buf.length - 80);
    sessionStorage.setItem(DEBUG_BUFFER_KEY, JSON.stringify(buf));
  } catch {
    /* ignore */
  }

  // #region agent log
  fetch('http://127.0.0.1:7418/ingest/a3d13dc6-6745-44ac-a4fd-f2bafc5169ae', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': 'daf54e',
    },
    body: JSON.stringify(entry),
  }).catch(() => {});
  // #endregion
}
