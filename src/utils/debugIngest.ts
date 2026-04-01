/** Cursor debug NDJSON ingest. In Vite dev, use same-origin proxy so the browser can POST (avoids mixed-content/CORS to localhost). */
export const DEBUG_INGEST_URL =
  import.meta.env.DEV
    ? '/__debug-ingest'
    : 'http://127.0.0.1:7468/ingest/79a58ae7-e17e-42e5-8ba3-5b5d5c3ba194';
