/** Readable PostgREST / Supabase client errors for logs and HTTP responses (R16). */
export function formatSupabaseError(err: unknown): string {
  if (err instanceof Error && err.message && err.message !== "[object Object]") {
    const e = err as Error & { details?: string; hint?: string };
    const parts = [e.message];
    if (e.details) parts.push(`details: ${e.details}`);
    if (e.hint) parts.push(`hint: ${e.hint}`);
    return parts.join(" · ");
  }
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof o.message === "string") parts.push(o.message);
    if (typeof o.details === "string") parts.push(`details: ${o.details}`);
    if (typeof o.hint === "string") parts.push(`hint: ${o.hint}`);
    if (parts.length) return parts.join(" · ");
  }
  return String(err);
}
