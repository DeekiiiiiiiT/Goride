import { serviceKey } from "../_shared/serviceKey.ts";
/**
 * Door for fuel database jobs. The database job has no user login.
 * Body {} (or no job) = close-job sweeper (hourly). Body {"job":"auto-close"} = daily auto-close of
 * eligible weeks for every company (moved here from GitHub Actions, 24 Nov 2026).
 */

const JOBS: Record<string, string> = {
  sweep: "/fuel/period-jobs/sweep",
  "auto-close": "/fuel/periods/auto-close?orgId=all",
};

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }
  const secret = (req.headers.get("x-fleet-cron-secret") || "").trim();
  const expected = (Deno.env.get("FLEET_CRON_SECRET") || Deno.env.get("CRON_SECRET") || "").trim();
  if (!expected || !secret || !sameSecret(secret, expected)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const key = serviceKey();
  if (!base || !key) {
    return new Response(JSON.stringify({ error: "server_misconfigured" }), { status: 500 });
  }
  const body = await req.json().catch(() => ({})) as { job?: string };
  const job = String(body.job || "sweep");
  const path = JOBS[job];
  if (!path) {
    return new Response(JSON.stringify({ error: "Unknown job" }), { status: 400 });
  }
  const res = await fetch(`${base}/functions/v1/fleet-fuel${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",

      apikey: key,
      "X-Fleet-Cron-Secret": expected,
    },
    body: "{}",
  });
  const text = await res.text();
  return new Response(text || "{}", {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
});
