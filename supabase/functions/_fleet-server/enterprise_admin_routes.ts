/**
 * Enterprise product-admin customer/team APIs (roamenterprise.co/admin).
 * Gated with requireProductAdmin("enterprise").
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireProductAdmin } from "./product_admin_guard.ts";
import {
  ALL_BUSINESS_TYPES,
  inferProductLineFromUser,
  isEnabledBusinessType,
} from "./product_line.ts";
import { getPlatformSettingsCached } from "./platform_settings.ts";
import { ensureCustomerOrganization } from "./ensure_customer_org.ts";
import {
  DEFAULT_ENTERPRISE_MODULES,
  resolveEffectiveModules,
  sanitizeModuleOverrides,
} from "./enterprise_modules.ts";

type RegisterDeps = {
  fetchCustomersWithCache: (productLine?: "fleet" | "enterprise") => Promise<any[]>;
  invalidateCustomerCache: () => Promise<void>;
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
};

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

function assertEnterpriseTarget(meta: Record<string, unknown> | undefined): boolean {
  return inferProductLineFromUser(meta) === "enterprise";
}

export function registerEnterpriseAdminRoutes(app: Hono, deps: RegisterDeps) {
  const {
    fetchCustomersWithCache,
    invalidateCustomerCache,
    logAdminAction,
    FLEET_SUB_ROLES,
    canonicalizeRole,
  } = deps;

  const base = "/make-server-37f42386/enterprise-admin";

  // GET customers
  app.get(`${base}/customers`, async (c) => {
    try {
      const auth = await requireProductAdmin(c, "enterprise");
      if (auth instanceof Response) return auth;
      const forceRefresh = c.req.query("refresh") === "true";
      if (forceRefresh) await invalidateCustomerCache();
      const customers = await fetchCustomersWithCache("enterprise");
      return c.json({ customers, productLine: "enterprise" });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // POST create customer
  app.post(`${base}/customers`, async (c) => {
    try {
      const auth = await requireProductAdmin(c, "enterprise");
      if (auth instanceof Response) return auth;

      const CREATE_ROLES = new Set([
        "platform_owner",
        "superadmin",
        "enterprise_admin",
        "enterprise_ops",
      ]);
      if (!CREATE_ROLES.has(auth.role) && !auth.isPlatformRole) {
        return c.json({ error: "Forbidden — enterprise admin/ops or platform owner required" }, 403);
      }

      const { email, name, businessType } = await c.req.json();
      if (!email || !name || !businessType) {
        return c.json({ error: "email, name, and businessType are all required" }, 400);
      }
      if (!(ALL_BUSINESS_TYPES as readonly string[]).includes(businessType)) {
        return c.json({
          error: `Invalid businessType. Must be one of: ${ALL_BUSINESS_TYPES.join(", ")}`,
        }, 400);
      }
      if (businessType === "rideshare" || businessType === "taxi") {
        return c.json({ error: "Rideshare/taxi are not available on Enterprise" }, 400);
      }

      const entSettings = await getPlatformSettingsCached("enterprise");
      // Freight Forwarder (warehouse) is invite-only — Enterprise Admin can always create those accounts.
      if (businessType !== "warehouse" && !isEnabledBusinessType(entSettings, businessType)) {
        return c.json({ error: `Business type "${businessType}" is not enabled` }, 403);
      }

      const tempPassword = Array.from(crypto.getRandomValues(new Uint8Array(9)))
        .map((b: number) => b.toString(36).padStart(2, "0"))
        .join("")
        .slice(0, 12);

      const supabase = serviceClient();
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        user_metadata: {
          name,
          role: "admin",
          businessType,
          productLine: "enterprise",
        },
        app_metadata: {
          role: "admin",
          businessType,
          productLine: "enterprise",
        },
        email_confirm: true,
      });

      if (error) {
        if (
          error.message?.includes("already been registered") ||
          error.message?.includes("already exists")
        ) {
          return c.json({ error: "An account with this email already exists" }, 409);
        }
        throw error;
      }

      const userId = data.user.id;
      await supabase.auth.admin.updateUserById(userId, {
        app_metadata: {
          ...(data.user.app_metadata || {}),
          organizationId: userId,
          productLine: "enterprise",
          role: "admin",
          businessType,
        },
        user_metadata: {
          ...(data.user.user_metadata || {}),
          name,
          role: "admin",
          businessType,
          productLine: "enterprise",
          organizationId: userId,
        },
      });

      await ensureCustomerOrganization(supabase, {
        userId,
        email,
        name,
        businessType,
        productLine: "enterprise",
      });

      await invalidateCustomerCache();
      await logAdminAction({
        actorId: auth.id,
        actorName: auth.email,
        action: "create_enterprise_customer",
        targetId: userId,
        targetEmail: email,
        details: `Business type: ${businessType}`,
      });

      return c.json({
        success: true,
        userId,
        temporaryPassword: tempPassword,
        message: `Customer account created for ${name}. Share the temporary password securely.`,
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // Suspend
  app.post(`${base}/customers/:userId/suspend`, async (c) => {
    try {
      const auth = await requireProductAdmin(c, "enterprise");
      if (auth instanceof Response) return auth;
      const userId = c.req.param("userId");
      const body = await c.req.json().catch(() => ({})) as { reason?: string };
      const reason = typeof body.reason === "string" ? body.reason.trim() : "Suspended by admin";
      const supabase = serviceClient();
      const { data: target, error: getErr } = await supabase.auth.admin.getUserById(userId);
      if (getErr || !target.user) return c.json({ error: "User not found" }, 404);
      const meta = { ...(target.user.user_metadata || {}) };
      if (!assertEnterpriseTarget(meta) &&
        inferProductLineFromUser(target.user.app_metadata as Record<string, unknown>) !== "enterprise") {
        return c.json({ error: "User is not a Roam Enterprise customer" }, 400);
      }
      meta.accountStatus = "suspended";
      const { error: updErr } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: meta,
        ban_duration: "8760h",
      });
      if (updErr) throw updErr;
      await invalidateCustomerCache();
      await logAdminAction({
        actorId: auth.id,
        actorName: auth.email,
        action: "suspend_enterprise_customer",
        targetId: userId,
        targetEmail: target.user.email || "",
        details: reason,
      });
      return c.json({ success: true, status: "suspended" });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // Reactivate
  app.post(`${base}/customers/:userId/reactivate`, async (c) => {
    try {
      const auth = await requireProductAdmin(c, "enterprise");
      if (auth instanceof Response) return auth;
      const userId = c.req.param("userId");
      const supabase = serviceClient();
      const { data: target, error: getErr } = await supabase.auth.admin.getUserById(userId);
      if (getErr || !target.user) return c.json({ error: "User not found" }, 404);
      const meta = { ...(target.user.user_metadata || {}) };
      delete meta.accountStatus;
      const { error: updErr } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: meta,
        ban_duration: "none",
      });
      if (updErr) throw updErr;
      await invalidateCustomerCache();
      await logAdminAction({
        actorId: auth.id,
        actorName: auth.email,
        action: "reactivate_enterprise_customer",
        targetId: userId,
        targetEmail: target.user.email || "",
        details: "Account reactivated",
      });
      return c.json({ success: true, status: "active" });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // Sign out
  app.post(`${base}/customers/:userId/sign-out`, async (c) => {
    try {
      const auth = await requireProductAdmin(c, "enterprise");
      if (auth instanceof Response) return auth;
      const userId = c.req.param("userId");
      const supabase = serviceClient();
      const { data: target, error: getErr } = await supabase.auth.admin.getUserById(userId);
      if (getErr || !target.user) return c.json({ error: "User not found" }, 404);
      const { error } = await supabase.auth.admin.signOut(userId, "global");
      if (error) throw error;
      await logAdminAction({
        actorId: auth.id,
        actorName: auth.email,
        action: "sign_out_enterprise_customer",
        targetId: userId,
        targetEmail: target.user.email || "",
        details: "All sessions terminated",
      });
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // Reset password email
  app.post(`${base}/reset-password`, async (c) => {
    try {
      const auth = await requireProductAdmin(c, "enterprise");
      if (auth instanceof Response) return auth;
      const { email, redirectTo } = await c.req.json();
      if (!email) return c.json({ error: "email required" }, 400);
      const supabase = serviceClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectTo || "https://roamenterprise.co/reset-password",
      });
      if (error) throw error;
      await logAdminAction({
        actorId: auth.id,
        actorName: auth.email,
        action: "reset_password_enterprise",
        targetId: "",
        targetEmail: email,
        details: "Password recovery email sent",
      });
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // Force logout (alias of sign-out by email/id body used by Dominion UI)
  app.post(`${base}/force-logout`, async (c) => {
    try {
      const auth = await requireProductAdmin(c, "enterprise");
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
        action: "force_logout_enterprise",
        targetId: userId,
        targetEmail: target?.user?.email || "",
        details: "All sessions terminated",
      });
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // Toggle suspend (Dominion-compatible body)
  app.post(`${base}/toggle-suspend`, async (c) => {
    try {
      const auth = await requireProductAdmin(c, "enterprise");
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

  // Set password
  app.post(`${base}/set-password`, async (c) => {
    try {
      const auth = await requireProductAdmin(c, "enterprise");
      if (auth instanceof Response) return auth;
      const { userId, password } = await c.req.json();
      if (!userId || !password) return c.json({ error: "userId and password required" }, 400);
      const supabase = serviceClient();
      const { error } = await supabase.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
      await logAdminAction({
        actorId: auth.id,
        actorName: auth.email,
        action: "set_password_enterprise",
        targetId: userId,
        targetEmail: "",
        details: "Password set by admin",
      });
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // Team members list
  app.get(`${base}/team-members`, async (c) => {
    try {
      const auth = await requireProductAdmin(c, "enterprise");
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
        const app = u.app_metadata || {};
        const role = meta.role || app.role;
        if (role === "admin" || (role === "superadmin" && meta.businessType)) {
          orgNameMap[u.id] = meta.name || u.email || "Unknown Org";
          orgProductLineMap[u.id] = inferProductLineFromUser({
            ...app,
            ...meta,
          } as Record<string, unknown>);
        }
      }

      let members = allUsers
        .filter((u: any) => FLEET_SUB_ROLES.includes(u.user_metadata?.role))
        .map((u: any) => {
          const meta = u.user_metadata || {};
          const orgId = meta.organizationId || null;
          const orgLine = orgId ? orgProductLineMap[orgId] : null;
          return {
            id: u.id,
            email: u.email || "",
            name: meta.name || "",
            role: canonicalizeRole(meta.role),
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
          return m.productLine === "enterprise";
        });

      return c.json({ members });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // GET org feature modules (product-line + overrides + effective)
  app.get(`${base}/customers/:orgId/modules`, async (c) => {
    try {
      const auth = await requireProductAdmin(c, "enterprise");
      if (auth instanceof Response) return auth;
      const orgId = c.req.param("orgId");
      const supabase = serviceClient();
      const { data: org, error } = await supabase
        .from("organizations")
        .select("id, product_line, enabled_modules, name")
        .eq("id", orgId)
        .maybeSingle();
      if (error) throw error;
      if (!org) return c.json({ error: "Organization not found" }, 404);
      if (org.product_line !== "enterprise") {
        return c.json({ error: "Not an Enterprise organization" }, 400);
      }

      const settings = await getPlatformSettingsCached("enterprise");
      const productLineModules = {
        ...DEFAULT_ENTERPRISE_MODULES,
        ...((settings?.enabledModules as Record<string, boolean>) || {}),
      };
      const orgOverrides = (org.enabled_modules as Record<string, boolean> | null) || null;
      const effective = resolveEffectiveModules(productLineModules, orgOverrides);

      return c.json({
        orgId,
        productLineModules,
        orgOverrides,
        effectiveModules: effective,
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // PUT org feature module overrides
  app.put(`${base}/customers/:orgId/modules`, async (c) => {
    try {
      const auth = await requireProductAdmin(c, "enterprise");
      if (auth instanceof Response) return auth;
      const WRITE_ROLES = new Set([
        "platform_owner",
        "superadmin",
        "enterprise_admin",
        "enterprise_ops",
      ]);
      if (!WRITE_ROLES.has(auth.role) && !auth.isPlatformRole) {
        return c.json({ error: "Forbidden" }, 403);
      }

      const orgId = c.req.param("orgId");
      const body = await c.req.json();
      const overrides = sanitizeModuleOverrides(
        body.enabledModules === undefined ? body : body.enabledModules,
      );

      const supabase = serviceClient();
      const { data: org, error: getErr } = await supabase
        .from("organizations")
        .select("id, product_line, name")
        .eq("id", orgId)
        .maybeSingle();
      if (getErr) throw getErr;
      if (!org) return c.json({ error: "Organization not found" }, 404);
      if (org.product_line !== "enterprise") {
        return c.json({ error: "Not an Enterprise organization" }, 400);
      }

      const { error: updErr } = await supabase
        .from("organizations")
        .update({ enabled_modules: overrides })
        .eq("id", orgId);
      if (updErr) throw updErr;

      const settings = await getPlatformSettingsCached("enterprise");
      const productLineModules = {
        ...DEFAULT_ENTERPRISE_MODULES,
        ...((settings?.enabledModules as Record<string, boolean>) || {}),
      };
      const effective = resolveEffectiveModules(productLineModules, overrides);

      await logAdminAction({
        actorId: auth.id,
        actorName: auth.email,
        action: "update_enterprise_org_modules",
        targetId: orgId,
        targetEmail: "",
        details: `Updated feature modules for ${org.name || orgId}`,
      });

      return c.json({
        success: true,
        orgId,
        orgOverrides: overrides,
        effectiveModules: effective,
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });
}
