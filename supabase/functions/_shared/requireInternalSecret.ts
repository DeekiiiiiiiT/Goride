import { timingSafeEqual } from "./timingSafeEqual.ts";

/**
 * Fail-closed internal/cron auth: secret must be set and header must match.
 * Returns null when authorized; otherwise a Response to return.
 */
export function requireInternalSecret(
  req: Request,
  opts: {
    envKeys: string[];
    headerNames: string[];
  },
): Response | null {
  let expected = "";
  for (const key of opts.envKeys) {
    const v = Deno.env.get(key);
    if (v && v.trim()) {
      expected = v.trim();
      break;
    }
  }
  if (!expected) {
    console.error("[requireInternalSecret] no secret configured:", opts.envKeys.join(","));
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let provided = "";
  for (const name of opts.headerNames) {
    const v = req.headers.get(name);
    if (v && v.trim()) {
      provided = v.trim();
      break;
    }
  }
  if (!provided || !timingSafeEqual(provided, expected)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

/**
 * Like requireInternalSecret, but accepts ANY of the configured secrets (not just the first
 * one found) and also a Bearer token. Needed where a function is called by both a database
 * job (X-Fleet-Cron-Secret) and its own older caller (X-Merchant-Push-Secret), because the
 * single-secret version only ever honoured the first env var that happened to be set.
 *
 * Fail-closed: returns 500 when nothing is configured, 401 when nothing matches.
 */
export function authorizeInternalRequest(
  req: Request,
  opts: {
    envKeys: string[];
    headerNames: string[];
    /** Extra accepted values, e.g. the service key (see _shared/serviceKey.ts). */
    alsoAccept?: string[];
  },
): Response | null {
  const expected: string[] = [];
  for (const key of opts.envKeys) {
    const v = (Deno.env.get(key) || "").trim();
    if (v) expected.push(v);
  }
  for (const v of opts.alsoAccept ?? []) {
    const trimmed = v.trim();
    if (trimmed) expected.push(trimmed);
  }

  if (expected.length === 0) {
    console.error(
      "[authorizeInternalRequest] no secret configured:",
      [...opts.envKeys, "alsoAccept"].join(","),
    );
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const provided: string[] = [];
  for (const name of opts.headerNames) {
    const v = req.headers.get(name);
    if (v && v.trim()) provided.push(v.trim());
  }
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (bearer) provided.push(bearer);

  for (const candidate of provided) {
    for (const secret of expected) {
      if (timingSafeEqual(candidate, secret)) return null;
    }
  }

  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
