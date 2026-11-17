/** Classify Imagen / network errors for worker step 4 (outage vs content vs key). */
export type PictureFailureClass = "outage" | "content" | "key";

const IMAGEN_HTTP_RE = /Imagen HTTP (\d{3})/i;

export function classifyPictureGenerationError(err: unknown): PictureFailureClass {
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";

  if (name === "AbortError" || /timeout|timed out|network|fetch failed|ECONNRESET/i.test(msg)) {
    return "outage";
  }

  const http = IMAGEN_HTTP_RE.exec(msg);
  if (http) {
    const code = Number(http[1]);
    if (code === 401 || code === 403) return "key";
    if (code === 429 || (code >= 500 && code <= 599)) return "outage";
  }

  if (
    /returned no image|safety|blocked prompt|refused|content policy|image was not generated/i.test(msg)
  ) {
    return "content";
  }

  return "outage";
}