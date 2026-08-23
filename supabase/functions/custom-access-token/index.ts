/**
 * Auth Hook: custom_access_token
 * Merges DB-granted platform roles into JWT app_metadata cache (read-only cache).
 */
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { fetchUserRoleNames } from "../_shared/rbacQuery.ts";

const PRIVILEGED_USER_META = new Set([
  "role",
  "roles",
  "organizationId",
  "organization_id",
  "surface",
  "signup_intent",
]);

function normalizeHookSecret(): string | null {
  const raw = Deno.env.get("CUSTOM_ACCESS_TOKEN_HOOK_SECRET") ?? "";
  const secret = raw.replace(/^v1,whsec_/, "").trim();
  return secret || null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });
  }

  const secret = normalizeHookSecret();
  if (!secret) {
    console.error("[custom-access-token] CUSTOM_ACCESS_TOKEN_HOOK_SECRET is not set");
    return new Response(
      JSON.stringify({ error: "CUSTOM_ACCESS_TOKEN_HOOK_SECRET is not set on the Edge Function" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

  try {
    const wh = new Webhook(secret);
    const event = wh.verify(payload, headers) as {
      claims?: Record<string, unknown>;
      user_id?: string;
    };

    const claims = { ...(event.claims || {}) };
    const appMeta = { ...((claims.app_metadata as Record<string, unknown>) || {}) };
    const userMeta = { ...((claims.user_metadata as Record<string, unknown>) || {}) };

    for (const key of PRIVILEGED_USER_META) {
      delete userMeta[key];
    }
    claims.user_metadata = userMeta;

    const userId = event.user_id ?? (claims.sub as string | undefined);
    const email = (claims.email as string | undefined)?.toLowerCase();
    if (userId) {
      const dbUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const pdb = (await import("https://esm.sh/@supabase/supabase-js@2")).createClient(
        dbUrl,
        serviceKey,
        { db: { schema: "platform" } },
      );

      if (email) {
        const { data: pending } = await pdb.from("pending_invites")
          .select("id, role_id, scope_type, scope_id")
          .eq("email", email)
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .limit(1)
          .maybeSingle();
        if (pending) {
          await pdb.from("user_roles").upsert({
            user_id: userId,
            role_id: pending.role_id,
            scope_type: pending.scope_type ?? "global",
            scope_id: pending.scope_id,
          }, { onConflict: "user_id,role_id" });
          await pdb.from("pending_invites").update({
            accepted_at: new Date().toISOString(),
            accepted_user_id: userId,
          }).eq("id", pending.id);
        }
      }

      const dbRoles = await fetchUserRoleNames(userId);
      if (dbRoles.length > 0) {
        appMeta.roles = dbRoles;
        appMeta.role = dbRoles[0];
      }
    }

    claims.app_metadata = appMeta;
    if (typeof appMeta.role === "string" && appMeta.role.trim()) {
      claims.role = "authenticated";
    }

    return new Response(JSON.stringify({ claims }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[custom-access-token]", err);
    return new Response(
      JSON.stringify({ error: "Hook verification failed" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
});
