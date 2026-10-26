/**
 * Fleet product-admin screens on roamfleet.co/admin.
 * Fleet managers are not platform staff. These routes stay on requireProductAdmin("fleet").
 */
import type { Hono } from "npm:hono@4.3.11";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireProductAdmin } from "./product_admin_guard.ts";
import { inferProductLineFromUser } from "./product_line.ts";

type Deps = {
  logAdminAction: (opts: {
    actorId: string;
    actorName: string;
    action: string;
    targetId: string;
    targetEmail: string;
    details: string;
  }) => Promise<void>;
  FLEET_SUB_ROLES: string[];
  canonicalizeRole: (role: string) => string;
  invalidateCustomerCache: () => Promise<void>;
};

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

export function registerFleetPortalRoutes(app: Hono, deps: Deps) {
  const { logAdminAction, FLEET_SUB_ROLES, canonicalizeRole, invalidateCustomerCache } = deps;
  const base = "/make-server-37f42386/fleet-admin";

  app.get(`${base}/team-members`, async (c) => {
    try {
      const auth = await requireProductAdmin(c, "fleet");
      if (auth instanceof Response) return auth;
      const includeUnassigned = c.req.query("includeUnassigned") === "true";
      const supabase = serviceClient();
      const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      if (error) throw new Error(`Auth API error: ${error.message}`);
      const allUsers = data?.users || [];

      const orgNameMap: Record<string, string> = {};
      const orgProductLineMap: Record<string, string> = {};
      for (const u of allUsers) {
        const meta = u.user_metadata || {};
        const appMeta = u.app_metadata || {};
        const role = meta.role || appMeta.role;
        if (role === "admin" || (role === "superadmin" && meta.businessType)) {
          orgNameMap[u.id] = meta.name || u.email || "Unknown Org";
          orgProductLineMap[u.id] = inferProductLineFromUser({
            ...appMeta,
            ...meta,
          } as Record<string, unknown>);
        }
      }

      const members = allUsers
        .filter((u) => FLEET_SUB_ROLES.includes(String(u.user_metadata?.role ?? "")))
        .map((u) => {
          const meta = u.user_metadata || {};
          const orgId = meta.organizationId || null;
          const orgLine = orgId ? orgProductLineMap[orgId] : null;
          return {
            id: u.id,
            email: u.email || "",
            name: meta.name || "",
            role: canonicalizeRole(String(meta.role ?? "")),
            organizationId: orgId,
            organizationName: orgId ? (orgNameMap[orgId] || "Unknown Org") : null,
            productLine: orgLine,
            createdAt: u.created_at || null,
            lastSignIn: u.last_sign_in_at || null,
            status: u.last_sign_in_at
              ? (Date.now() - new Date(u.last_sign_in_at).getTime() < 30 * 24 * 60 * 60 * 1000
                ? "active"
                : "inactive")
              : "inactive",
            isSuspended: !!u.banned_until && new Date(u.banned_until) > new Date(),
          };
        })
        .filter((m: { organizationId: string | null; productLine: string | null }) => {
          if (!m.organizationId) return includeUnassigned;
          return m.productLine === "fleet";
        });

      return c.json({ members });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  app.post(`${base}/reset-password`, async (c) => {
    try {
      const auth = await requireProductAdmin(c, "fleet");
      if (auth instanceof Response) return auth;
      const { email, redirectTo } = await c.req.json();
      if (!email) return c.json({ error: "email required" }, 400);
      const supabase = serviceClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectTo || "https://roamfleet.co/reset-password",
      });
      if (error) throw error;
      await logAdminAction({
        actorId: auth.id,
        actorName: auth.email,
        action: "reset_password_fleet",
        targetId: "",
        targetEmail: email,
        details: "Password recovery email sent",
      });
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  app.post(`${base}/force-logout`, async (c) => {
    try {
      const auth = await requireProductAdmin(c, "fleet");
      if (auth instanceof Response) return auth;
      const { userId } = await c.req.json();
      if (!userId) return c.json({ error: "userId required" }, 400);
      const supabase = serviceClient();
      const { data: target } = await supabase.auth.admin.getUserById(userId);
      const { error } = await supabase.auth.admin.signOut(userId, "global");
      if (error) throw error;
      await logAdminAction({
        actorId: auth.id,
        actorName: auth.email,
        action: "force_logout_fleet",
        targetId: userId,
        targetEmail: target?.user?.email || "",
        details: "All sessions terminated",
      });
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  app.post(`${base}/toggle-suspend`, async (c) => {
    try {
      const auth = await requireProductAdmin(c, "fleet");
      if (auth instanceof Response) return auth;
      const { userId, suspend } = await c.req.json();
      if (!userId) return c.json({ error: "userId required" }, 400);
      const supabase = serviceClient();
      const { data: target, error: getErr } = await supabase.auth.admin.getUserById(userId);
      if (getErr || !target.user) return c.json({ error: "User not found" }, 404);
      const meta = { ...(target.user.user_metadata || {}) };
      if (suspend) meta.accountStatus = "suspended";
      else delete meta.accountStatus;
      const { error: updErr } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: meta,
        ban_duration: suspend ? "8760h" : "none",
      });
      if (updErr) throw updErr;
      await invalidateCustomerCache();
      return c.json({ success: true, suspended: !!suspend });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  app.post(`${base}/set-password`, async (c) => {
    try {
      const auth = await requireProductAdmin(c, "fleet");
      if (auth instanceof Response) return auth;
      const { userId, password } = await c.req.json();
      if (!userId || !password) return c.json({ error: "userId and password required" }, 400);
      const supabase = serviceClient();
      const { error } = await supabase.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
      await logAdminAction({
        actorId: auth.id,
        actorName: auth.email,
        action: "set_password_fleet",
        targetId: userId,
        targetEmail: "",
        details: "Password set by admin",
      });
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });
}
