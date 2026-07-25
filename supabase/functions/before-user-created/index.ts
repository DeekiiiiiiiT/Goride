/**
 * Auth Hook: before_user_created
 * Rejects signup when client supplies privileged user_metadata keys.
 * Configure in Dashboard → Authentication → Hooks (verify JWT off for this function).
 * Fails closed when BEFORE_USER_CREATED_HOOK_SECRET is unset (P0 audit).
 */
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const PRIVILEGED_META_KEYS = new Set([
  "role",
  "roles",
  "organizationId",
  "organization_id",
  "surface",
  "signup_intent",
  "productLine",
  "is_admin",
  "admin",
]);

function normalizeHookSecret(): string | null {
  const raw = Deno.env.get("BEFORE_USER_CREATED_HOOK_SECRET") ?? "";
  const secret = raw.replace(/^v1,whsec_/, "").trim();
  return secret || null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { message: "method_not_allowed" } }), { status: 405 });
  }

  const secret = normalizeHookSecret();
  if (!secret) {
    console.error("[before-user-created] BEFORE_USER_CREATED_HOOK_SECRET is not set");
    return new Response(
      JSON.stringify({
        error: {
          http_code: 500,
          message: "BEFORE_USER_CREATED_HOOK_SECRET is not set on the Edge Function",
        },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

  try {
    const wh = new Webhook(secret);
    const event = wh.verify(payload, headers) as { user?: Record<string, unknown> };

    const user = event.user ?? {};
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const badKeys = Object.keys(meta).filter((k) => PRIVILEGED_META_KEYS.has(k));
    if (badKeys.length > 0) {
      return new Response(
        JSON.stringify({
          error: {
            http_code: 400,
            message: "Signup metadata contains restricted fields",
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[before-user-created]", err);
    return new Response(
      JSON.stringify({
        error: {
          http_code: 401,
          message: "Hook verification failed",
        },
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
});
