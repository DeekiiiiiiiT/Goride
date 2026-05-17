/** Session debug logging — remove after investigation. */
export function debugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
) {
  // #region agent log
  fetch('http://127.0.0.1:7418/ingest/a3d13dc6-6745-44ac-a4fd-f2bafc5169ae', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': 'daf54e',
    },
    body: JSON.stringify({
      sessionId: 'daf54e',
      location,
      message,
      data,
      hypothesisId,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}
