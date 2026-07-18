/**
 * Auth Hook: custom_access_token
 * Ensures JWT app_metadata role/roles/organizationId are the only authz claims;
 * never elevates from user_metadata.
 * Configure in Dashboard → Authentication → Hooks (verify JWT off).
 */
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const PRIVILEGED_USER_META = new Set([
  "role",
  "roles",
  "organizationId",
  "organization_id",
  "surface",
  "signup_intent",
]);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });
  }

  const secret = Deno.env.get("CUSTOM_ACCESS_TOKEN_HOOK_SECRET") ?? "";
  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

  try {
    let event: {
      claims?: Record<string, unknown>;
      user_id?: string;
    };
    if (secret) {
      const wh = new Webhook(secret.replace(/^v1,whsec_/, ""));
      event = wh.verify(payload, headers) as typeof event;
    } else {
      event = JSON.parse(payload) as typeof event;
    }

    const claims = { ...(event.claims || {}) };
    const appMeta = { ...((claims.app_metadata as Record<string, unknown>) || {}) };
    const userMeta = { ...((claims.user_metadata as Record<string, unknown>) || {}) };

    // Strip privileged keys from user_metadata claims (defense in depth)
    for (const key of PRIVILEGED_USER_META) {
      delete userMeta[key];
    }
    claims.user_metadata = userMeta;

    // Authz only from app_metadata already on the user record
    claims.app_metadata = appMeta;
    if (typeof appMeta.role === "string" && appMeta.role.trim()) {
      // Keep standard claim in sync with server-controlled app_metadata
      claims.role = "authenticated";
    }

    return new Response(JSON.stringify({ claims }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[custom-access-token]", err);
    return new Response(
      JSON.stringify({ error: `Failed to process hook: ${err}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
