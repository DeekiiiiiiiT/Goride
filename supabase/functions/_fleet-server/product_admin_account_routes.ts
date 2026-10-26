/**
 * Fleet and Enterprise admin account pages.
 * A product admin can see and manage only that product's customers and team.
 */
import type { Hono } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { logAdminAction } from "./audit_log.ts";
import { inferProductLineFromUser, type ProductLine } from "./product_line.ts";
import { requireProductAdmin, type ProductAdminUser } from "./product_admin_guard.ts";

const TEAM_ROLES = new Set([
  "fleet_manager",
  "fleet_accountant",
  "fleet_viewer",
  "manager",
  "viewer",
  "enterprise_dispatcher",
  "enterprise_customs",
  "enterprise_warehouse",
  "enterprise_finance",
  "enterprise_viewer",
]);

type AuthUser = {
  id: string;
  email?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  banned_until?: string | null;
  user_metadata?: Record<string, unknown>;
};

function metaOf(user: AuthUser): Record<string, unknown> {
  return user.user_metadata || {};
}

export function userOnProductLine(
  user: AuthUser,
  owners: Map<string, ProductLine>,
  product: ProductLine,
): boolean {
  const meta = metaOf(user);
  const role = typeof meta.role === "string" ? meta.role : "";
  if (TEAM_ROLES.has(role)) {
    const orgId = typeof meta.organizationId === "string" ? meta.organizationId : "";
    if (!orgId) return false;
    return owners.get(orgId) === product;
  }
  if (role === "admin" || role === "fleet_owner") {
    return inferProductLineFromUser(meta) === product;
  }
  return false;
}

async function listAuthUsers(supabase: SupabaseClient): Promise<AuthUser[]> {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(error.message);
  return (data?.users || []) as AuthUser[];
}

function ownerLines(users: AuthUser[]): Map<string, ProductLine> {
  const owners = new Map<string, ProductLine>();
  for (const user of users) {
    const meta = metaOf(user);
    const role = meta.role;
    if (role === "admin" || role === "fleet_owner" || (role === "superadmin" && meta.businessType)) {
      owners.set(user.id, inferProductLineFromUser(meta));
    }
  }
  return owners;
}

async function targetOnProduct(
  supabase: SupabaseClient,
  userId: string,
  product: ProductLine,
): Promise<AuthUser | Response> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user) return Response.json({ error: "User not found" }, { status: 404 });
  const user = data.user as AuthUser;
  const users = await listAuthUsers(supabase);
  if (!userOnProductLine(user, ownerLines(users), product)) {
    return Response.json({ error: "That account is not on this product" }, { status: 403 });
  }
  return user;
}

function registerForProduct(app: Hono, supabase: SupabaseClient, product: ProductLine) {
  const prefix = product === "fleet" ? "fleet-admin" : "enterprise-admin";
  const base = `/make-server-37f42386/${prefix}`;

  async function gate(c: { req: { header: (n: string) => string | undefined }; json: (b: unknown, s?: number) => Response }) {
    const auth = await requireProductAdmin(c, product);
    if (auth instanceof Response) return auth;
    return auth;
  }

  app.get(`${base}/team-members`, async (c) => {
    try {
      const auth = await gate(c);
      if (auth instanceof Response) return auth;
      const users = await listAuthUsers(supabase);
      const owners = ownerLines(users);
      const names = new Map<string, string>();
      for (const user of users) {
        const meta = metaOf(user);
        if (owners.has(user.id)) {
          names.set(user.id, String(meta.name || user.email || "Unknown"));
        }
      }
      const members = users
        .filter((user) => userOnProductLine(user, owners, product) && TEAM_ROLES.has(String(metaOf(user).role || "")))
        .map((user) => {
          const meta = metaOf(user);
          const orgId = typeof meta.organizationId === "string" ? meta.organizationId : null;
          const lastSignIn = user.last_sign_in_at || null;
          return {
            id: user.id,
            email: user.email || "",
            name: String(meta.name || ""),
            role: String(meta.role || ""),
            organizationId: orgId,
            organizationName: orgId ? (names.get(orgId) || "Unknown") : null,
            productLine: product,
            createdAt: user.created_at || null,
            lastSignIn,
            status: lastSignIn && Date.now() - new Date(lastSignIn).getTime() < 30 * 24 * 60 * 60 * 1000
              ? "active"
              : "inactive",
            isSuspended: !!user.banned_until && new Date(user.banned_until) > new Date(),
          };
        });
      return c.json({ members });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return c.json({ error: message }, 500);
    }
  });

  app.post(`${base}/reset-password`, async (c) => {
    try {
      const auth = await gate(c);
      if (auth instanceof Response) return auth;
      const body = await c.req.json().catch(() => ({})) as { email?: string; redirectTo?: string };
      const email = typeof body.email === "string" ? body.email.trim() : "";
      if (!email) return c.json({ error: "Email is required" }, 400);
      const users = await listAuthUsers(supabase);
      const owners = ownerLines(users);
      const target = users.find((user) => (user.email || "").toLowerCase() === email.toLowerCase());
      if (!target || !userOnProductLine(target, owners, product)) {
        return c.json({ error: "That account is not on this product" }, 403);
      }
      const redirectTo = typeof body.redirectTo === "string" && body.redirectTo.length > 0
        ? body.redirectTo
        : undefined;
      const { error } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email,
        options: redirectTo ? { redirectTo } : undefined,
      });
      if (error) throw error;
      await record(auth, "reset_password", target.id, email, product);
      return c.json({ success: true, message: `Password reset link generated for ${email}` });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return c.json({ error: message }, 500);
    }
  });

  app.post(`${base}/force-logout`, async (c) => {
    try {
      const auth = await gate(c);
      if (auth instanceof Response) return auth;
      const body = await c.req.json().catch(() => ({})) as { userId?: string };
      const userId = typeof body.userId === "string" ? body.userId : "";
      if (!userId) return c.json({ error: "userId is required" }, 400);
      const target = await targetOnProduct(supabase, userId, product);
      if (target instanceof Response) return target;
      const { error } = await supabase.auth.admin.signOut(userId, "global");
      if (error) throw error;
      await record(auth, "force_logout", userId, target.email || "", product);
      return c.json({ success: true, message: `All sessions terminated for user ${userId}` });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return c.json({ error: message }, 500);
    }
  });

  app.post(`${base}/toggle-suspend`, async (c) => {
    try {
      const auth = await gate(c);
      if (auth instanceof Response) return auth;
      const body = await c.req.json().catch(() => ({})) as { userId?: string; suspend?: boolean };
      const userId = typeof body.userId === "string" ? body.userId : "";
      if (!userId || typeof body.suspend !== "boolean") {
        return c.json({ error: "userId (string) and suspend (boolean) are required" }, 400);
      }
      const target = await targetOnProduct(supabase, userId, product);
      if (target instanceof Response) return target;
      const ban_duration = body.suspend ? "876000h" : "none";
      const { error } = await supabase.auth.admin.updateUserById(userId, { ban_duration });
      if (error) throw error;
      await record(auth, body.suspend ? "suspend_user" : "reactivate_user", userId, target.email || "", product);
      return c.json({ success: true, message: `User ${userId} has been ${body.suspend ? "suspended" : "reactivated"}` });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return c.json({ error: message }, 500);
    }
  });

  app.post(`${base}/set-password`, async (c) => {
    try {
      const auth = await gate(c);
      if (auth instanceof Response) return auth;
      if (auth.role.endsWith("_ops")) {
        return c.json({ error: "Only a product admin can set a password" }, 403);
      }
      const body = await c.req.json().catch(() => ({})) as { userId?: string; password?: string };
      const userId = typeof body.userId === "string" ? body.userId : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!userId || !password) return c.json({ error: "userId and password are required" }, 400);
      if (password.length < 8) return c.json({ error: "Password must be at least 8 characters" }, 400);
      const target = await targetOnProduct(supabase, userId, product);
      if (target instanceof Response) return target;
      const { error } = await supabase.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
      await record(auth, "set_password", userId, target.email || "", product);
      return c.json({ success: true, message: "Password updated successfully" });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return c.json({ error: message }, 500);
    }
  });
}

async function record(
  auth: ProductAdminUser,
  action: string,
  targetId: string,
  targetEmail: string,
  product: ProductLine,
) {
  await logAdminAction({
    actorId: auth.id,
    actorName: auth.email || product,
    action,
    targetId,
    targetEmail,
    details: product,
  });
}

export function registerProductAdminAccountRoutes(app: Hono, supabase: SupabaseClient) {
  registerForProduct(app, supabase, "fleet");
  registerForProduct(app, supabase, "enterprise");
}
