/** Door for database jobs. The delivery app requires a signed token at the gate, so the database calls this first. */

const ALLOWED = new Set([
  "/internal/disputes/process-pending-refunds",
  "/internal/rush-money/recon",
  "/internal/rush-money/scores",
]);

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
  const body = await req.json().catch(() => ({})) as { path?: string };
  const path = String(body.path || "");
  if (!ALLOWED.has(path)) {
    return new Response(JSON.stringify({ error: "Unknown job" }), { status: 400 });
  }
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!base || !key) {
    return new Response(JSON.stringify({ error: "server_misconfigured" }), { status: 500 });
  }
  const res = await fetch(`${base}/functions/v1/delivery${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: "{}",
  });
  const text = await res.text();
  return new Response(text || "{}", {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
});
