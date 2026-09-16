/**
 * Cross-function earnings week seal (F4 / B2). Same contract as fuel_seal_http (ADR-0019).
 * Until fleet-pay hosts the seal endpoint, week_close may still call sealEarningsWeek in-process
 * but MUST block on failure (no warn). This HTTP helper is used once earnings is extracted.
 */
import { buildSealIdempotencyKey } from "./week_seal_log.ts";

const SEAL_TIMEOUT_MS = 15_000;
const SEAL_ATTEMPTS = 3;
const SEAL_BACKOFF_MS = [400, 1200, 2500];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function sealEarningsWeekViaHttp(opts: {
  organizationId: string;
  weekKey: string;
  actorId?: string;
  force?: boolean;
  asOf?: string;
  idempotencyKey?: string;
  correlationId?: string;
}): Promise<{ published: number }> {
  const base =
    Deno.env.get("FLEET_PAY_URL") ||
    `${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/fleet-pay`;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!base || !key) {
    throw new Error("sealEarningsWeekViaHttp: missing FLEET_PAY_URL/SUPABASE_URL or service role key");
  }

  const idempotencyKey =
    opts.idempotencyKey ||
    buildSealIdempotencyKey(opts.organizationId, opts.weekKey, "earnings");
  const correlationId = opts.correlationId || crypto.randomUUID();
  const url = `${base.replace(/\/$/, "")}/internal/seal-earnings-week`;
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= SEAL_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          apikey: key,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          "X-Request-Id": correlationId,
        },
        body: JSON.stringify(opts),
        signal: AbortSignal.timeout(SEAL_TIMEOUT_MS),
      });
      const text = await res.text();
      let body: { published?: number; error?: string } = {};
      try {
        body = JSON.parse(text);
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        throw new Error(
          body.error || `fleet-pay earnings seal failed HTTP ${res.status}: ${text.slice(0, 200)}`,
        );
      }
      return { published: Number(body.published) || 0 };
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      console.warn(
        `[sealEarningsWeekViaHttp] attempt ${attempt}/${SEAL_ATTEMPTS} failed`,
        opts.weekKey,
        lastErr.message,
      );
      if (attempt < SEAL_ATTEMPTS) {
        await sleep(SEAL_BACKOFF_MS[attempt - 1] ?? 2000);
      }
    }
  }

  throw new Error(
    lastErr?.message ||
      `fleet-pay earnings seal failed after ${SEAL_ATTEMPTS} attempts`,
  );
}
