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
