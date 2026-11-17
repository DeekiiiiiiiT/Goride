/**
 * Door for the vehicle-picture worker and fill. The database jobs (pg_cron / pg_net) have no
 * user login, and fleet-core's gateway requires one, so they call this function with the fleet
 * cron secret; it forwards to fleet-core with the service-role key. Same pattern as fleet-toll-cron.
 *   POST /fleet-picture-cron/run   → fleet-core internal/vehicle-pictures/run
 *   POST /fleet-picture-cron/fill  → fleet-core internal/vehicle-pictures/fill (body passed through)
 */

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const secret = (req.headers.get("x-fleet-cron-secret") || "").trim();
  const expected = (Deno.env.get("FLEET_CRON_SECRET") || Deno.env.get("CRON_SECRET") || "").trim();
  if (!expected || !secret || !sameSecret(secret, expected)) return json({ error: "Forbidden" }, 403);

  const op = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  if (op !== "run" && op !== "fill") return json({ error: "Unknown operation" }, 404);

  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!base || !key) return json({ error: "server_misconfigured" }, 500);

  const body = op === "fill" ? (await req.text()) || "{}" : "{}";
  const res = await fetch(`${base}/functions/v1/fleet-core/internal/vehicle-pictures/${op}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      apikey: key,
      "X-Fleet-Cron-Secret": secret,
    },
    body,
  });
  const text = await res.text();
  return new Response(text || "{}", {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
});
