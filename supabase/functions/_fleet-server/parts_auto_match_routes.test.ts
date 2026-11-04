/**
 * Parts auto-match route validation and wiring.
 * deno test --no-check supabase/functions/_fleet-server/parts_auto_match_routes.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Hono } from "npm:hono@4.3.11";
import type { Context } from "npm:hono@4.3.11";
import { requirePermission, type RbacUser } from "./rbac_middleware.ts";
import {
  enrichPartMatchHealthPayload,
  escapePostgrestOrTerm,
  isValidUuid,
  mapPartMatchSchedule,
  ownerOnly,
  parseConflictResolveInput,
  parseKeepBatchInput,
  parseOptionalVehicleId,
  preflightDerivedKeepBatch,
  registerPartsAutoMatchRoutes,
  revisionDiffRows,
  rpcClientErrorStatus,
  staffOnly,
  supabaseErrorMessage,
  tallyField,
  UUID_RE,
} from "./parts_auto_match_routes.ts";

const VALID = "11111111-1111-4111-8111-111111111111";
const BASE = "/make-server-37f42386/admin/auto-match";
const ADMIN = "/make-server-37f42386/admin";

function staffJwt(): string {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ aal: "aal2", sub: "staff-test" }));
  return `Bearer ${header}.${payload}.sig`;
}

const fleetUser: RbacUser = {
  userId: VALID,
  email: "fleet@roam.test",
  rawRole: "fleet_owner",
  resolvedRole: "fleet_owner",
  organizationId: VALID,
};

const platformSupport: RbacUser = {
  userId: VALID,
  email: "support@roam.test",
  rawRole: "platform_support",
  resolvedRole: "platform_support",
  organizationId: null,
};

const platformOwner: RbacUser = {
  userId: VALID,
  email: "owner@roam.test",
  rawRole: "platform_owner",
  resolvedRole: "platform_owner",
  organizationId: null,
};

const platformCatalogEditor: RbacUser = {
  userId: VALID,
  email: "editor@roam.test",
  rawRole: "platform_catalog_editor",
  resolvedRole: "platform_catalog_editor",
  organizationId: null,
};

/** Same permission gate as production, without Supabase JWT validation (needs rbacUser on context). */
function testRouteGuard() {
  return [
    async (c: Context, next: () => Promise<void>) => {
      const rbacUser = c.get("rbacUser") as RbacUser | undefined;
      if (!rbacUser) {
        return c.json({ error: "Unauthorized: No token provided" }, 401);
      }
      await next();
    },
    requirePermission("catalog.import"),
  ];
}

function mountAutoMatchApp(user: RbacUser | undefined, supabase: unknown) {
  const app = new Hono<{ Variables: { rbacUser: RbacUser } }>();
  if (user) {
    app.use("*", async (c, next) => {
      c.set("rbacUser", user);
      await next();
    });
  }
  registerPartsAutoMatchRoutes(app as never, supabase as never, {
    routeGuard: testRouteGuard() as never,
  });
  return app;
}

function autoMatchSupabase(overrides?: { enabled?: boolean; derivedHit?: boolean }) {
  const enabled = overrides?.enabled ?? true;
  const derivedHit = overrides?.derivedHit ?? true;
  const chain = (result: { data: unknown; error: null; count?: number } = { data: [], error: null, count: 0 }) => {
    const q: Record<string, unknown> = {};
    const ret = () => q;
    for (const m of ["select", "eq", "neq", "is", "or", "ilike", "order", "limit", "delete", "update", "insert"]) {
      q[m] = ret;
    }
    q.in = () => Promise.resolve({
      data: derivedHit ? [{ id: VALID }] : [],
      error: null,
    });
    q.maybeSingle = () => Promise.resolve({ data: { enabled, id: VALID }, error: null });
    q.single = () => Promise.resolve({ data: { id: VALID, enabled }, error: null });
    q.then = (onFulfilled: (v: typeof result) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected);
    return q;
  };
  return {
    from(_table: string) {
      return chain();
    },
    rpc(name: string) {
      if (name === "parts_auto_match_enabled") {
        return Promise.resolve({ data: enabled, error: null });
      }
      if (name === "part_match_health") {
        return Promise.resolve({ data: { engineVersion: 1, normVersion: 0, enabled }, error: null });
      }
      if (name === "part_match_schedule") {
        return Promise.resolve({ data: { cronSchedule: "0 3 * * *" }, error: null });
      }
      if (name === "part_match_catalog_completeness") {
        return Promise.resolve({ data: { vehicleCount: 0 }, error: null });
      }
      if (name === "admin_platforms") {
        return Promise.resolve({ data: { platforms: [] }, error: null });
      }
      if (name === "admin_vehicle_oe_numbers") {
        return Promise.resolve({ data: { rows: [] }, error: null });
      }
      if (name === "part_norm_position") {
        return Promise.resolve({ data: [{ norm_position: "front", norm_side: "left" }], error: null });
      }
      if (name === "part_import_norm_version") {
        return Promise.resolve({ data: 1, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
}

function authHeaders(extra: Record<string, string> = {}) {
  return { Authorization: staffJwt(), "Content-Type": "application/json", ...extra };
}

function mockContext(user?: RbacUser): Context {
  return {
    get(key: string) {
      if (key === "rbacUser") return user;
      return undefined;
    },
    req: { header: () => "" },
    json(body: unknown, status?: number) {
      return new Response(JSON.stringify(body), { status: status ?? 200 });
    },
  } as unknown as Context;
}

const staffUser: RbacUser = {
  userId: VALID,
  email: "staff@roam.test",
  rawRole: "platform_support",
  resolvedRole: "platform_support",
  organizationId: null,
};

Deno.test("parts auto-match routes module loads", () => {
  assertEquals(typeof registerPartsAutoMatchRoutes, "function");
});

Deno.test({
  name: "health vehicleId validation",
  fn() {
    const cases: Array<[string | undefined, boolean, string | null]> = [
      [undefined, true, null],
      ["", true, null],
      [VALID, true, VALID],
      ["not-a-uuid", false, null],
      ["11111111-1111-4111-8111-11111111111g", false, null],
    ];
    for (const [raw, ok, id] of cases) {
      const out = parseOptionalVehicleId(raw);
      assertEquals(out.ok, ok, raw);
      if (out.ok) assertEquals(out.id, id, raw);
    }
  },
});

Deno.test({
  name: "conflict resolve input validation",
  fn() {
    const good = parseConflictResolveInput({ action: "keep", note: "audit" });
    assertEquals(good.ok, true);
    if (good.ok) {
      assertEquals(good.action, "keep");
      assertEquals(good.note, "audit");
    }
    assertEquals(parseConflictResolveInput({ action: "remove" }).ok, true);
    const merge = parseConflictResolveInput({ action: "merge", note: "same pad" });
    assertEquals(merge.ok, true);
    if (merge.ok) assertEquals(merge.action, "merge");
    assertEquals(parseConflictResolveInput({ action: "merge" }).ok, false);
    assertEquals(parseConflictResolveInput({ action: "hold" }).ok, false);
    assertEquals(parseConflictResolveInput(null).ok, false);
  },
});

Deno.test({
  name: "keep-batch input validation",
  fn() {
    const good = parseKeepBatchInput({ derivedIds: [VALID], note: "batch" });
    assertEquals(good.ok, true);
    if (good.ok) {
      assertEquals(good.ids, [VALID]);
      assertEquals(good.note, "batch");
    }
    assertEquals(parseKeepBatchInput({ derivedIds: [] }).ok, false);
    assertEquals(parseKeepBatchInput({ derivedIds: ["bad"] }).ok, false);
    assertEquals(parseKeepBatchInput({}).ok, false);
  },
});

Deno.test("tallyField aggregates conflict totals", () => {
  const totals = tallyField([
    { conflict_type: "oe_ambiguous", status: "open" },
    { conflict_type: "oe_ambiguous", status: "open" },
    { conflict_type: "system_link", status: "kept" },
  ], "conflict_type");
  assertEquals(totals.oe_ambiguous, 2);
  assertEquals(totals.system_link, 1);
});

Deno.test("rpcClientErrorStatus maps client errors to 400", () => {
  assertEquals(rpcClientErrorStatus({ code: "P0001", message: "Derived fit not found" }), 400);
  assertEquals(rpcClientErrorStatus({ message: "Unknown conflict id" }), 400);
  assertEquals(rpcClientErrorStatus({ code: "23514", message: "violates check constraint" }), 400);
  assertEquals(rpcClientErrorStatus({ message: "connection reset" }), 500);
});

Deno.test("supabaseErrorMessage prefers message and details", () => {
  assertEquals(supabaseErrorMessage({ message: "Derived fit not found", details: "detail" }), "Derived fit not found");
  assertEquals(supabaseErrorMessage({ message: "", details: "Unknown derived fit" }), "Unknown derived fit");
});

Deno.test("escapePostgrestOrTerm strips or-breaking characters", () => {
  assertEquals(escapePostgrestOrTerm("abc,def(1)"), "abcdef1");
  assertEquals(escapePostgrestOrTerm("1.5"), "1.5");
});

Deno.test("mapPartMatchSchedule aligns API field names", () => {
  const mapped = mapPartMatchSchedule({
    nextRun: "2026-11-04T03:00:00.000Z",
    cronSchedule: "0 3 * * *",
    jobName: "part-match-nightly",
  });
  assertEquals(mapped.cron, "0 3 * * *");
  assertEquals(mapped.jobname, "part-match-nightly");
  assertEquals(mapped.intervalLabel, "Daily at 03:00 UTC");
});

Deno.test("UUID helper matches route regex", () => {
  assertEquals(isValidUuid(VALID), true);
  assertEquals(UUID_RE.test(VALID), true);
  assertEquals(isValidUuid("nope"), false);
});

Deno.test("staffOnly denies fleet roles on auto-match routes", async () => {
  const denied = staffOnly(mockContext(fleetUser));
  assertEquals(denied?.status, 403);
});

Deno.test("revisionDiffRows fallback uses text not raw objects", () => {
  const rows = revisionDiffRows([{
    id: "rev-1",
    vehicle_oe_number_id: VALID,
    created_at: "2026-01-01T00:00:00Z",
    old_row: { oe_number: "A" },
    new_row: { oe_number: "A" },
  }]);
  assertEquals(rows.length, 1);
  assertEquals(typeof rows[0].old_value, "string");
  assertEquals(typeof rows[0].new_value, "string");
  assertEquals(rows[0].old_value, "row updated");
});

Deno.test("fleet role is forbidden on staff auto-match routes", async () => {
  const app = mountAutoMatchApp(fleetUser, autoMatchSupabase());
  const res = await app.request(`${BASE}/health`, { headers: authHeaders() });
  assertEquals(res.status, 403);
});

Deno.test("platform support is forbidden on owner-only keep-batch", async () => {
  const app = mountAutoMatchApp(platformSupport, autoMatchSupabase());
  const res = await app.request(`${BASE}/keep-batch`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ derivedIds: [VALID], note: "n" }),
  });
  assertEquals(res.status, 403);
});

Deno.test("platform support is forbidden on owner-only remove-batch", async () => {
  const app = mountAutoMatchApp(platformSupport, autoMatchSupabase());
  const res = await app.request(`${BASE}/derived/remove-batch`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ derivedIds: [VALID], note: "n" }),
  });
  assertEquals(res.status, 403);
});

Deno.test("platform support is forbidden on owner-only run-audit", async () => {
  const app = mountAutoMatchApp(platformSupport, autoMatchSupabase());
  const res = await app.request(`${BASE}/run-audit`, { method: "POST", headers: authHeaders() });
  assertEquals(res.status, 403);
});

const OWNER_ONLY_MSG = "Only the owner can run this.";

Deno.test("catalog editor is forbidden on owner-only keep-batch", async () => {
  const app = mountAutoMatchApp(platformCatalogEditor, autoMatchSupabase());
  const res = await app.request(`${BASE}/keep-batch`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ derivedIds: [VALID], note: "n" }),
  });
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, OWNER_ONLY_MSG);
});

Deno.test("catalog editor is forbidden on owner-only remove-batch", async () => {
  const app = mountAutoMatchApp(platformCatalogEditor, autoMatchSupabase());
  const res = await app.request(`${BASE}/derived/remove-batch`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ derivedIds: [VALID], note: "n" }),
  });
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, OWNER_ONLY_MSG);
});

Deno.test("catalog editor is forbidden on owner-only run-audit", async () => {
  const app = mountAutoMatchApp(platformCatalogEditor, autoMatchSupabase());
  const res = await app.request(`${BASE}/run-audit`, { method: "POST", headers: authHeaders() });
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, OWNER_ONLY_MSG);
});

Deno.test("auto-match routes reject bad input with 400", async (t) => {
  const app = mountAutoMatchApp(platformOwner, autoMatchSupabase());
  const cases: Array<{ name: string; path: string; init: RequestInit }> = [
    { name: "health vehicleId", path: `${BASE}/health?vehicleId=not-a-uuid`, init: { headers: authHeaders() } },
    { name: "conflicts vehicleId", path: `${BASE}/conflicts?vehicleId=bad`, init: { headers: authHeaders() } },
    {
      name: "conflict resolve id",
      path: `${BASE}/conflicts/not-a-uuid/resolve`,
      init: { method: "POST", headers: authHeaders(), body: JSON.stringify({ action: "keep" }) },
    },
    {
      name: "conflict resolve body",
      path: `${BASE}/conflicts/${VALID}/resolve`,
      init: { method: "POST", headers: authHeaders(), body: JSON.stringify({ action: "hold" }) },
    },
    {
      name: "resolve batch empty",
      path: `${BASE}/conflicts/resolve-batch`,
      init: { method: "POST", headers: authHeaders(), body: JSON.stringify({ items: [] }) },
    },
    {
      name: "resolve batch bad id",
      path: `${BASE}/conflicts/resolve-batch`,
      init: {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ items: [{ id: "bad", action: "keep" }] }),
      },
    },
    {
      name: "confirm merge bad report id",
      path: `${BASE}/position-reports/bad-id/confirm-merge`,
      init: {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ survivor_id: VALID }),
      },
    },
    {
      name: "mark fixed bad report id",
      path: `${BASE}/position-reports/not-uuid/mark-fixed`,
      init: { method: "POST", headers: authHeaders() },
    },
    {
      name: "platform detail bad id",
      path: `${BASE}/platforms/not-uuid`,
      init: { headers: authHeaders() },
    },
    {
      name: "export missing vehicle",
      path: `${ADMIN}/catalog/find-parts/export`,
      init: { headers: authHeaders() },
    },
    {
      name: "export bad vehicle",
      path: `${ADMIN}/catalog/find-parts/export?vehicleId=bad`,
      init: { headers: authHeaders() },
    },
    {
      name: "vehicle oe-numbers bad id",
      path: `${ADMIN}/vehicles/bad-id/oe-numbers`,
      init: { headers: authHeaders() },
    },
    {
      name: "derived fits bad vehicle",
      path: `${ADMIN}/vehicles/not-uuid/derived-fits`,
      init: { headers: authHeaders() },
    },
    {
      name: "revisions bad vehicle",
      path: `${ADMIN}/vehicles/bad/revisions`,
      init: { headers: authHeaders() },
    },
    {
      name: "normalize missing number",
      path: `${ADMIN}/oe-numbers/normalize`,
      init: { method: "POST", headers: authHeaders(), body: JSON.stringify({ brand: "Toyota" }) },
    },
    {
      name: "part oe refs bad part id",
      path: `${ADMIN}/parts/bad/oe-references`,
      init: { headers: authHeaders() },
    },
  ];
  for (const c of cases) {
    await t.step(c.name, async () => {
      const res = await app.request(c.path, c.init);
      assertEquals(res.status, 400, c.path);
    });
  }
});

Deno.test("owner-only routes reject bad input with 400", async (t) => {
  const app = mountAutoMatchApp(platformOwner, autoMatchSupabase());
  const cases: Array<{ name: string; path: string; init?: RequestInit }> = [
    {
      name: "keep batch empty",
      path: `${BASE}/keep-batch`,
      init: { method: "POST", headers: authHeaders(), body: JSON.stringify({ derivedIds: [] }) },
    },
    {
      name: "remove batch bad uuid",
      path: `${BASE}/derived/remove-batch`,
      init: { method: "POST", headers: authHeaders(), body: JSON.stringify({ derivedIds: ["bad"] }) },
    },
    {
      name: "keep batch invalid uuid",
      path: `${BASE}/keep-batch`,
      init: {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ derivedIds: ["bad"], note: "x" }),
      },
    },
    {
      name: "platform link bad platform id",
      path: `${BASE}/platforms/bad/links`,
      init: {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          platform_b_id: VALID,
          maintenance_component_id: VALID,
          evidence_url: "https://example.com/e",
        }),
      },
    },
    {
      name: "patch link bad link id",
      path: `${BASE}/platforms/${VALID}/links/bad-link`,
      init: { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ note: "x" }) },
    },
    {
      name: "delete link bad link id",
      path: `${BASE}/platforms/${VALID}/links/not-uuid`,
      init: { method: "DELETE", headers: authHeaders() },
    },
    {
      name: "vehicle oe post missing fields",
      path: `${ADMIN}/vehicles/${VALID}/oe-numbers`,
      init: { method: "POST", headers: authHeaders(), body: JSON.stringify({ oe_brand: "Toyota" }) },
    },
    {
      name: "vehicle oe patch bad ids",
      path: `${ADMIN}/vehicles/bad/oe-numbers/${VALID}`,
      init: { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ note: "x" }) },
    },
    {
      name: "rematch bad vehicle query",
      path: `${ADMIN}/catalog/find-parts/rematch?vehicleId=bad`,
      init: { method: "POST", headers: authHeaders() },
    },
    {
      name: "part ref post bad part id",
      path: `${ADMIN}/parts/bad/oe-references`,
      init: {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ oe_brand: "Toyota", oe_number: "1", evidence_url: "https://example.com/e" }),
      },
    },
  ];
  for (const c of cases) {
    await t.step(c.name, async () => {
      const res = await app.request(c.path, c.init ?? { headers: authHeaders() });
      assertEquals(res.status, 400, c.path);
    });
  }
});

Deno.test("owner keep-batch returns 400 when derived id is unknown", async () => {
  const app = mountAutoMatchApp(platformOwner, autoMatchSupabase({ derivedHit: false }));
  const res = await app.request(`${BASE}/keep-batch`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ derivedIds: [VALID], note: "batch" }),
  });
  assertEquals(res.status, 400);
});

Deno.test("ownerOnly denies platform staff without owner access", async () => {
  const denied = ownerOnly(mockContext(staffUser));
  assertEquals(denied?.status, 403);
});

Deno.test("preflightDerivedKeepBatch returns 400 for unknown fit ids", async () => {
  const supabase = {
    from() {
      return {
        select() { return this; },
        in() {
          return Promise.resolve({ data: [], error: null });
        },
      };
    },
  };
  const out = await preflightDerivedKeepBatch(supabase as never, [VALID]);
  assertEquals(out.ok, false);
  if (!out.ok) assertEquals(out.error.includes("Unknown derived fit"), true);
});

Deno.test("unauthenticated auto-match routes return 401", async () => {
  const app = mountAutoMatchApp(undefined, autoMatchSupabase());
  const res = await app.request(`${BASE}/schedule`, { headers: { "Content-Type": "application/json" } });
  assertEquals(res.status, 401);
});

Deno.test("parseKeepBatchInput rejects empty derived ids", () => {
  const out = parseKeepBatchInput({ derivedIds: [], note: "x" });
  assertEquals(out.ok, false);
});

Deno.test("parseKeepBatchInput rejects invalid uuid in batch", () => {
  const out = parseKeepBatchInput({ derivedIds: ["not-a-uuid"], note: "x" });
  assertEquals(out.ok, false);
});

Deno.test("health vehicleId query returns 400 for invalid uuid via parseOptionalVehicleId", () => {
  const out = parseOptionalVehicleId("bad-id");
  assertEquals(out.ok, false);
});

Deno.test("platform owner can reach health when input is valid", async () => {
  const app = mountAutoMatchApp(platformOwner, autoMatchSupabase());
  const health = await app.request(`${BASE}/health`, { headers: authHeaders() });
  assertEquals(health.status, 200);
  const body = await health.json() as Record<string, unknown>;
  assertEquals(body.engineHash, "#F10-99A");
  assertEquals(body.normVersion, 0);
});

Deno.test("health payload includes engineHash from version fields", () => {
  const out = enrichPartMatchHealthPayload({ engineVersion: 8, normVersion: 1, enabled: true });
  assertEquals(out.engineHash, "#F81-99A");
});

function positionReportSupabase(reportRow: Record<string, unknown>, onRpc?: (name: string, args: Record<string, unknown>) => void) {
  return {
    from(table: string) {
      if (table === "part_norm_position_backfill_report") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: reportRow, error: null }),
            }),
          }),
        };
      }
      return autoMatchSupabase().from(table);
    },
    rpc(name: string, args?: Record<string, unknown>) {
      onRpc?.(name, args ?? {});
      if (name === "part_norm_position_report_remap" || name === "part_norm_position_report_confirm_merge") {
        return Promise.resolve({ data: null, error: null });
      }
      return autoMatchSupabase().rpc(name);
    },
  };
}

Deno.test("position remap Any passes null position and side to RPC", async () => {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const app = mountAutoMatchApp(
    platformOwner,
    positionReportSupabase(
      { id: VALID, reason: "unmapped", resolved_at: null },
      (name, args) => rpcCalls.push({ name, args }),
    ),
  );
  const res = await app.request(`${BASE}/position-reports/${VALID}/remap`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ position: "any", side: "any" }),
  });
  assertEquals(res.status, 200);
  const remap = rpcCalls.find((c) => c.name === "part_norm_position_report_remap");
  assertEquals(remap?.args.p_position, null);
  assertEquals(remap?.args.p_side, null);
});

Deno.test("confirm merge calls confirm_merge RPC with survivor_id", async () => {
  const survivor = "22222222-2222-4222-8222-222222222222";
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const app = mountAutoMatchApp(
    platformOwner,
    positionReportSupabase(
      {
        id: VALID,
        reason: "duplicate_after_normalization",
        survivor_id: survivor,
        resolved_at: null,
      },
      (name, args) => rpcCalls.push({ name, args }),
    ),
  );
  const res = await app.request(`${BASE}/position-reports/${VALID}/confirm-merge`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ survivor_id: survivor }),
  });
  assertEquals(res.status, 200);
  const merge = rpcCalls.find((c) => c.name === "part_norm_position_report_confirm_merge");
  assertEquals(merge?.args.p_survivor_id, survivor);
  assertEquals(merge?.args.p_report_id, VALID);
});
