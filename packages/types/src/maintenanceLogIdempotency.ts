/** Stable idempotency key for legacy maintenance log creates (retries must not spawn a second service). */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

export function resolveMaintenanceLogIdempotencyKey(log: unknown): string {
  if (!log || typeof log !== "object") {
    return crypto.randomUUID();
  }
  const r = log as Record<string, unknown>;
  const existing = r.idempotencyKey;
  if (typeof existing === "string" && existing.trim() !== "") {
    return existing.trim();
  }
  const id = r.id;
  if (id != null && isUuid(String(id))) {
    return String(id).trim();
  }
  return crypto.randomUUID();
}