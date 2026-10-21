/**
 * Fuel close sweeper is called by GitHub with the service key, not a user login.
 * requireAuth must let that route through; the handler does its own check.
 * Run: deno test --no-check rbac_machine_routes.test.ts (from this directory)
 */
/// <reference lib="deno.ns" />
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Hono } from "npm:hono@4.3.11";
import { requireAuth } from "./rbac_middleware.ts";

function appWithGate() {
  const app = new Hono();
  app.use("*", requireAuth({ strict: true }));
  app.post("/fleet-fuel/fuel/period-jobs/sweep", (c) => c.json({ reached: true }));
  app.post("/fleet-fuel/fuel/periods/auto-close", (c) => c.json({ reached: true }));
  app.post("/fleet-fuel/fuel/entries", (c) => c.json({ reached: true }));
  return app;
}

const serviceKey = { Authorization: "Bearer eyJ.service.role" };

Deno.test("sweep reaches its handler when the caller is not a user", async () => {
  const res = await appWithGate().request("/fleet-fuel/fuel/period-jobs/sweep", {
    method: "POST",
    headers: serviceKey,
  });
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { reached: true });
});

Deno.test("auto-close reaches its handler when the caller is not a user", async () => {
  const res = await appWithGate().request("/fleet-fuel/fuel/periods/auto-close", {
    method: "POST",
    headers: serviceKey,
  });
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { reached: true });
});

Deno.test("ordinary fuel routes still require a user login", async () => {
  const res = await appWithGate().request("/fleet-fuel/fuel/entries", { method: "POST" });
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Unauthorized: No token provided");
});
