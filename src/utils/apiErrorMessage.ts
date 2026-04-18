/**
 * Normalize JSON error bodies from Edge/Supabase handlers where `error` may be a
 * string, `{ message: string }`, or another shape — avoids `[object Object]` in UI.
 */
export function apiErrorBodyToString(raw: unknown, fallback: string): string {
  if (raw == null || raw === "") return fallback;
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (typeof raw === "object" && raw !== null && "message" in raw) {
    const m = (raw as { message?: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  try {
    return JSON.stringify(raw);
  } catch {
    return fallback;
  }
}
