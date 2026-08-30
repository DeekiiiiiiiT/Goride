import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqual } from "./timingSafeEqual.ts";

/**
 * Cron / internal auth for Edge Functions.
 * Edge often injects new-format sb_secret_* keys while GitHub Actions still
 * stores the legacy eyJ service_role JWT — exact string match alone fails.
 * Accept: cron header/Bearer match, exact service key match, or verified legacy JWT.
 */
export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: 403 | 500; error: string };

function decodeJwtRole(jwt: string): string {
  try {
    const part = jwt.split(".")[1];
    if (!part) return "";
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { role?: string };
    return typeof payload.role === "string" ? payload.role : "";
  } catch {
    return "";
  }
}

async function verifyLegacyServiceRoleJwt(jwt: string): Promise<boolean> {
  if (decodeJwtRole(jwt) !== "service_role") return false;
  const url = (Deno.env.get("SUPABASE_URL") || "").trim();
  if (!url) return false;
  try {
    const client = createClient(url, jwt, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
    return !error;
  } catch {
    return false;
  }
}

export async function authorizeCronOrServiceRole(req: Request): Promise<CronAuthResult> {
  const cronSecret = (
    req.headers.get("x-fleet-cron-secret") ||
    req.headers.get("x-cron-secret") ||
    ""
  ).trim();
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const serviceHeader = (req.headers.get("x-service-role") || "").trim();
  const token = serviceHeader || bearer;

  const expectedCron = (
    Deno.env.get("FLEET_CRON_SECRET") ||
    Deno.env.get("RIDES_CRON_SECRET") ||
    Deno.env.get("CRON_SECRET") ||
    ""
  ).trim();
  const expectedService = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();

  if (!expectedCron && !expectedService) {
    return { ok: false, status: 500, error: "server_misconfigured" };
  }

  if (expectedCron && cronSecret && timingSafeEqual(cronSecret, expectedCron)) {
    return { ok: true };
  }
  if (expectedCron && bearer && timingSafeEqual(bearer, expectedCron)) {
    return { ok: true };
  }
  if (expectedService && token && timingSafeEqual(token, expectedService)) {
    return { ok: true };
  }

  if (token.startsWith("eyJ") && decodeJwtRole(token) === "service_role") {
    if (await verifyLegacyServiceRoleJwt(token)) return { ok: true };
  }

  return { ok: false, status: 403, error: "Forbidden" };
}
