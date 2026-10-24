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
          .neq("scope_type", "organization")
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .limit(1)
          .maybeSingle();
        if (pending) {
          const scopeType = pending.scope_type ?? "global";
          const { data: existingSeat } = await pdb.from("user_roles")
            .select("id")
            .eq("user_id", userId)
            .eq("role_id", pending.role_id)
            .eq("scope_type", scopeType)
            .maybeSingle();
          if (!existingSeat) {
            await pdb.from("user_roles").insert({
              user_id: userId,
              role_id: pending.role_id,
              scope_type: scopeType,
              scope_id: pending.scope_id,
            });
          }
          await pdb.from("pending_invites").update({
            accepted_at: new Date().toISOString(),
            accepted_user_id: userId,
          }).eq("id", pending.id);
        }
      }

      const dbRoles = await fetchUserRoleNames(userId);
      const platformRoles = dbRoles.filter((role) =>
        role === "superadmin" ||
        role === "platform_owner" ||
        role === "platform_support" ||
        role === "platform_analyst"
      );
      if (platformRoles.length > 0) {
        appMeta.roles = platformRoles;
        appMeta.role = platformRoles[0];
      } else if (userMeta.app === "plug") {
        const existing = typeof appMeta.role === "string" ? appMeta.role.trim() : "";
        if (!existing) {
          const auth = (await import("https://esm.sh/@supabase/supabase-js@2")).createClient(dbUrl, serviceKey);
          const { data: existingUser } = await auth.auth.admin.getUserById(userId);
          const stored = existingUser?.user?.app_metadata as Record<string, unknown> | undefined;
          const storedRole = typeof stored?.role === "string" ? stored.role.trim() : "";
          if (!storedRole) {
            await auth.auth.admin.updateUserById(userId, {
              app_metadata: { ...(stored || {}), role: "explorer_user" },
            });
            appMeta.role = "explorer_user";
          } else {
            appMeta.role = storedRole;
          }
        }
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
