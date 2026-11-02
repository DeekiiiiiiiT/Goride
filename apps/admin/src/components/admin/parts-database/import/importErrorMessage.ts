const GATEWAY_STATUS_RE = /\b(502|503|504)\b/;
const HTML_TITLE_RE = /<title>\s*([^<]+?)\s*<\/title>/i;

/** Strip nginx/HTML error pages into a short line for toasts. */
export function humanizeHttpErrorText(text: string, status?: number): string {
  const trimmed = text.trim();
  if (!trimmed) {
    if (status === 504) return "Gateway timed out — the server took too long. Wait a moment and try again.";
    if (status === 503) return "Service temporarily unavailable. Try again in a minute.";
    if (status === 502) return "Bad gateway — upstream did not respond. Try again shortly.";
    return "";
  }
  if (trimmed.startsWith("<") || trimmed.includes("<html")) {
    const title = HTML_TITLE_RE.exec(trimmed)?.[1]?.trim();
    if (title && GATEWAY_STATUS_RE.test(title)) {
      if (/504/i.test(title)) return "Gateway timed out — the server took too long. Wait a moment and try again.";
      if (/503/i.test(title)) return "Service temporarily unavailable. Try again in a minute.";
      if (/502/i.test(title)) return "Bad gateway — upstream did not respond. Try again shortly.";
    }
    if (GATEWAY_STATUS_RE.test(trimmed)) {
      return "Connection timed out talking to the server. Wait a moment and try Upload and check again.";
    }
    return "Unexpected server response. Try again, or use View background jobs if the check is still running.";
  }
  if (trimmed.length > 280) return `${trimmed.slice(0, 277)}…`;
  return trimmed;
}

/** Turn API / Supabase / unknown throws into user-visible text. */
export function importErrorMessage(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") {
    const s = humanizeHttpErrorText(value) || value.trim();
    if (!s || s === "[object Object]") return "";
    return s;
  }
  if (value instanceof Error) {
    const m = value.message.trim();
    if (!m || m === "[object Object]") return "";
    return m;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
    if (typeof o.error === "string" && o.error.trim()) return o.error.trim();
    if (o.error && typeof o.error === "object") {
      const nested = importErrorMessage(o.error);
      if (nested) return nested;
    }
    if (typeof o.error_description === "string") return o.error_description;
    if (typeof o.details === "string" && o.details.trim()) return o.details.trim();
    if (typeof o.hint === "string" && o.hint.trim()) return o.hint.trim();
    try {
      const json = JSON.stringify(value);
      if (json && json !== "{}" && json.length < 500) return json;
    } catch {
      /* ignore */
    }
  }
  const s = String(value);
  return s === "[object Object]" ? "" : s;
}

export const IMPORT_CHECK_FAILED_FALLBACK =
  "Import check failed on the server. Deploy the latest fleet-core, refresh this page, and try again.";
