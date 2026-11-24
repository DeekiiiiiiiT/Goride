import { timingSafeEqual } from "./timingSafeEqual.ts";
import { secretKeyCandidates } from "./serviceKey.ts";

/**
 * Cron / internal auth for Edge Functions.
 *
 * Accepts only credentials that survive the key rotation:
 *   - the cron secret, as `x-fleet-cron-secret` / `x-cron-secret` header or as a Bearer, and
 *   - one of the current secret keys, as `x-service-role` / `x-service-key` / `apikey` / Bearer.
 *
 * The legacy service_role JWT and the legacy `SUPABASE_SERVICE_ROLE_KEY` value are NOT accepted.
 * Those are what phase 8 switches off, and anything still sending them has to move to the new
 * secret key or the cron secret first.
 */
export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: 403 | 500; error: string };

export async function authorizeCronOrServiceRole(req: Request): Promise<CronAuthResult> {
  const cronSecret = (
    req.headers.get("x-fleet-cron-secret") ||
    req.headers.get("x-cron-secret") ||
    ""
  ).trim();
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const serviceHeader = (
    req.headers.get("x-service-role") ||
    req.headers.get("x-service-key") ||
    req.headers.get("apikey") ||
    ""
  ).trim();
  const supplied = serviceHeader || bearer;

  const expectedCron = (
    Deno.env.get("FLEET_CRON_SECRET") ||
    Deno.env.get("RIDES_CRON_SECRET") ||
    Deno.env.get("CRON_SECRET") ||
    ""
  ).trim();
  const candidates = secretKeyCandidates();

  if (!expectedCron && candidates.length === 0) {
    return { ok: false, status: 500, error: "server_misconfigured" };
  }

  if (expectedCron && cronSecret && timingSafeEqual(cronSecret, expectedCron)) {
    return { ok: true };
  }
  if (expectedCron && bearer && timingSafeEqual(bearer, expectedCron)) {
    return { ok: true };
  }
  for (const candidate of candidates) {
    if (supplied && timingSafeEqual(supplied, candidate)) return { ok: true };
  }

  return { ok: false, status: 403, error: "Forbidden" };
}
