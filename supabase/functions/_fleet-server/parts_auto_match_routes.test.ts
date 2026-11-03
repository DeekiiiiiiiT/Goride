/**
 * Parts auto-match route validation and wiring.
 * deno test --no-check supabase/functions/_fleet-server/parts_auto_match_routes.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Hono } from "npm:hono@4.3.11";
import type { Context } from "npm:hono@4.3.11";
import type { RbacUser } from "./rbac_middleware.ts";
import {
  escapePostgrestOrTerm,
  isValidUuid,
  mapPartMatchSchedule,
  ownerOnly,
  parseConflictResolveInput,
  parseKeepBatchInput,
  parseOptionalVehicleId,
  preflightDerivedKeepBatch,
  registerPartsAutoMatchRoutes,
  rpcClientErrorStatus,
  staffOnly,
  supabaseErrorMessage,
  tallyField,
  UUID_RE,
} from "./parts_auto_match_routes.ts";

const VALID = "11111111-1111-4111-8111-111111111111";

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
  const denied = staffOnly(mockContext({
    userId: VALID,
    email: "fleet@roam.test",
    rawRole: "fleet_owner",
    resolvedRole: "fleet_owner",
    organizationId: VALID,
  }));
  assertEquals(denied?.status, 403);
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

Deno.test("registerPartsAutoMatchRoutes mounts keep-batch path", async () => {
  const app = new Hono();
  const calls: string[] = [];
  const supabase = {
    from(table: string) {
      calls.push(`from:${table}`);
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle() {
          return Promise.resolve({ data: { enabled: false }, error: null });
        },
        in() {
          return Promise.resolve({ data: [{ id: VALID }], error: null });
        },
      };
    },
    rpc(name: string) {
      calls.push(`rpc:${name}`);
      return Promise.resolve({ data: null, error: null });
    },
  };
  registerPartsAutoMatchRoutes(app as never, supabase as never);
  const res = await app.request(
    "/make-server-37f42386/admin/auto-match/keep-batch",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ derivedIds: [VALID], note: "batch" }),
    },
  );
  assertEquals(res.status, 401);
  assertEquals(calls.length, 0);
});
