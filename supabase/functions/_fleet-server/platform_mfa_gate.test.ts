/**
 * Platform staff routes stay closed until the authenticator step (aal2).
 * Run: deno test --no-check platform_mfa_gate.test.ts
 */
/// <reference lib="deno.ns" />
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Hono } from "npm:hono@4.3.11";
import {
  assertPlatformStaffResponse,
  hasPlatformStaffAccess,
  platformMfaRequiredResponse,
  requirePlatformStaff,
  type RbacUser,
} from "./rbac_middleware.ts";

function bearer(aal: "aal1" | "aal2"): string {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ aal, sub: "u1" }));
  return `Bearer ${header}.${payload}.sig`;
}

function owner(): RbacUser {
  return {
    userId: "owner-1",
    email: "owner@example.com",
    rawRole: "platform_owner",
    resolvedRole: "platform_owner",
    organizationId: null,
  };
}

function analyst(): RbacUser {
  return {
    userId: "analyst-1",
    email: "analyst@example.com",
    rawRole: "platform_analyst",
    resolvedRole: "platform_analyst",
    organizationId: null,
  };
}

function fleetOwner(): RbacUser {
  return {
    userId: "fleet-1",
    email: "fleet@example.com",
    rawRole: "fleet_owner",
    resolvedRole: "fleet_owner",
    organizationId: "fleet-1",
  };
}

function staffApp(user: RbacUser) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("rbacUser", user);
    await next();
  });
  app.use("*", requirePlatformStaff());
  app.get("/admin-stats", (c) => c.json({ ok: true }));
  return app;
}

Deno.test("aal1 owner token is refused with mfa_required", async () => {
  const res = await staffApp(owner()).request("/admin-stats", {
    headers: { Authorization: bearer("aal1") },
  });
  assertEquals(res.status, 403);
  assertEquals(await res.json(), {
    error: "Forbidden",
    message: "Two-step login required",
    code: "mfa_required",
  });
});

Deno.test("aal2 owner token reaches the handler", async () => {
  const res = await staffApp(owner()).request("/admin-stats", {
    headers: { Authorization: bearer("aal2") },
  });
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });
});

Deno.test("aal1 analyst token is refused", async () => {
  const res = await staffApp(analyst()).request("/admin-stats", {
    headers: { Authorization: bearer("aal1") },
  });
  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.code, "mfa_required");
});

Deno.test("assertPlatformStaffResponse returns mfa_required for an aal1 owner", async () => {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("rbacUser", owner());
    await next();
  });
  app.get("/catalog", (c) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    return c.json({ ok: true });
  });
  const res = await app.request("/catalog", {
    headers: { Authorization: bearer("aal1") },
  });
  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.code, "mfa_required");
});

Deno.test("fleet owner password session still passes a shared gate", async () => {
  const app = new Hono();
  const user = fleetOwner();
  app.use("*", async (c, next) => {
    c.set("rbacUser", user);
    await next();
  });
  app.get("/admin/feature-flags", (c) => {
    const current = c.get("rbacUser") as RbacUser;
    const mfa = platformMfaRequiredResponse(c, current);
    if (mfa) return mfa;
    if (!hasPlatformStaffAccess(current) && current.resolvedRole !== "fleet_owner") {
      return c.json({ error: "Forbidden" }, 403);
    }
    return c.json({ ok: true });
  });
  const res = await app.request("/admin/feature-flags", {
    headers: { Authorization: bearer("aal1") },
  });
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });
});
