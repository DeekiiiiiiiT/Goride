/**
 * Edge kernel unit checks (ADR-0020 / D12).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Hono } from "npm:hono@4.3.11";
import {
  createFleetFunction,
  normalizeMonolithPathname,
  normalizeSlugPathname,
  normalizeFleetCorePathname,
} from "../_shared/edgeKernel.ts";

Deno.test("normalizeSlugPathname strips /functions/v1/{slug}", () => {
  assertEquals(
    normalizeSlugPathname("fleet-fuel", "/functions/v1/fleet-fuel/health"),
    "/fleet-fuel/health",
  );
  assertEquals(
    normalizeSlugPathname("fleet-fuel", "/fleet-fuel/health"),
    "/fleet-fuel/health",
  );
});

Deno.test("normalizeMonolithPathname rewrites admin/ledger prefixes", () => {
  assertEquals(
    normalizeMonolithPathname("/admin/foo"),
    "/make-server-37f42386/admin/foo",
  );
  assertEquals(
    normalizeMonolithPathname("/ledger/bar"),
    "/make-server-37f42386/ledger/bar",
  );
});

Deno.test("normalizeFleetCorePathname maps /fleet-core to make-server paths", () => {
  assertEquals(
    normalizeFleetCorePathname("/fleet-core/admin/foo"),
    "/make-server-37f42386/admin/foo",
  );
  assertEquals(
    normalizeFleetCorePathname("/functions/v1/fleet-core/health"),
    "/make-server-37f42386/health",
  );
});

Deno.test("createFleetFunction exposes /health and guards /internal without service role", async () => {
  const domain = new Hono();
  domain.get("/ping", (c) => c.json({ ok: true }));

  const app = createFleetFunction({
    slug: "fleet-fuel",
    pathStyle: "slug",
    domainApp: domain,
    serve: false,
    registerParentRoutes: (parent) => {
      parent.post("/internal/seal-fuel-week", (c) => c.json({ sealed: true }));
    },
  });

  const health = await app.request("http://local/fleet-fuel/health");
  assertEquals(health.status, 200);

  const internal = await app.request("http://local/fleet-fuel/internal/seal-fuel-week", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  // Service-role guard must reject missing/wrong key
  assertEquals(internal.status === 401 || internal.status === 403, true);
});
