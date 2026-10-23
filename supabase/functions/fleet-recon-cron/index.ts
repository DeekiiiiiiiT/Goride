/** Door for the week calculator. The database job has no Google login, so this door signs the call. */

import {
  googleIdToken,
  readServiceAccount,
  reconWorkerUri,
} from "../_fleet-server/recon_worker_google.ts";

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
  const sa = readServiceAccount();
  if (!sa) {
    return new Response(JSON.stringify({ error: "server_misconfigured" }), { status: 500 });
  }
  const body = await req.json().catch(() => ({})) as { nightly?: boolean };
  try {
    const uri = await reconWorkerUri(sa);
    const idToken = await googleIdToken(sa, uri);
    const res = await fetch(`${uri}/tick`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ nightly: body.nightly === true }),
    });
    const text = await res.text();
    return new Response(text || "{}", {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[fleet-recon-cron]", e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: "wake_failed" }), { status: 502 });
  }
});
