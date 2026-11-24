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
    normalizeFleetCorePathname("/functions/v1/fleet-core/trips"),
    "/make-server-37f42386/trips",
  );
  assertEquals(normalizeFleetCorePathname("/fleet-core/health"), "/health");
  assertEquals(normalizeFleetCorePathname("/fleet-core/ready"), "/ready");
  assertEquals(
    normalizeFleetCorePathname("/fleet-core/v1/extraction-status"),
    "/v1/extraction-status",
  );
});

Deno.test("normalizeFleetCorePathname does not double-prefix legacy make-server paths", () => {
  assertEquals(
    normalizeFleetCorePathname(
      "/fleet-core/make-server-37f42386/recon/weeks",
    ),
    "/make-server-37f42386/recon/weeks",
  );
  assertEquals(
    normalizeFleetCorePathname(
      "/functions/v1/fleet-core/make-server-37f42386/recon/weeks",
    ),
    "/make-server-37f42386/recon/weeks",
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

Deno.test("internal seal accepts a secret key or the cron secret, never the legacy key", async () => {
  const SECRET = "sb_secret_test_key_value";
  const LEGACY = "legacy-service-role-jwt";
  const CRON = "cron-secret-value";

  const previous = {
    secretKeys: Deno.env.get("SUPABASE_SECRET_KEYS"),
    legacy: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    cron: Deno.env.get("FLEET_CRON_SECRET"),
  };
  Deno.env.set("SUPABASE_SECRET_KEYS", JSON.stringify({ default: SECRET }));
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", LEGACY);
  Deno.env.set("FLEET_CRON_SECRET", CRON);
  try {
    const gated = new Hono();
    gated.use("*", async (c) =>
      c.json({ error: "Unauthorized: Valid authentication required" }, 401),
    );

    const app = createFleetFunction({
      slug: "fleet-toll",
      pathStyle: "slug",
      serve: false,
      registerParentRoutes: (parent) => {
        parent.post("/internal/seal-toll-week", (c) => c.json({ sealed: true }));
        parent.route("/", gated);
      },
    });

    const post = (headers: Record<string, string>) =>
      app.request("http://local/fleet-toll/internal/seal-toll-week", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: "{}",
      });

    // The leaked legacy service_role JWT must no longer open an internal route.
    const legacy = await post({ authorization: `Bearer ${LEGACY}` });
    assertEquals(legacy.status, 401);

    // The new secret key must, on either accepted header.
    const viaHeader = await post({ "x-service-key": SECRET });
    assertEquals(viaHeader.status, 200);
    assertEquals(await viaHeader.json(), { sealed: true });

    const viaBearer = await post({ authorization: `Bearer ${SECRET}` });
    assertEquals(viaBearer.status, 200);

    // So must the fleet cron secret.
    const cron = await post({ "x-fleet-cron-secret": CRON });
    assertEquals(cron.status, 200);
  } finally {
    const restore = (key: string, value: string | undefined) => {
      if (value == null) Deno.env.delete(key);
      else Deno.env.set(key, value);
    };
    restore("SUPABASE_SECRET_KEYS", previous.secretKeys);
    restore("SUPABASE_SERVICE_ROLE_KEY", previous.legacy);
    restore("FLEET_CRON_SECRET", previous.cron);
  }
});
