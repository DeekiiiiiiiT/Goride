/**
 * F-30 done-test 20: brain policies on provenance; locked weeks never recompute.
 */
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { computeFuelWeekSnapshot, type ComputeFuelWeekSnapshotDeps } from "./fuel_week_compute.ts";
import { fuelPeriodComputeResponse } from "./fuel_period_routes.ts";

const BRAIN = {
  deadhead_gap_minutes: 7,
  personal_gap_minutes: 12,
  ambiguous_deadhead_split_pct: 55,
};

function stubComputeDeps(onInsert: (row: Record<string, unknown>) => void): ComputeFuelWeekSnapshotDeps {
  const snapQuery = {
    select: () => snapQuery,
    eq: () => snapQuery,
    order: () => snapQuery,
    limit: () => snapQuery,
    maybeSingle: async () => ({ data: null, error: null }),
  };
  const periodUpdate = {
    eq: () => ({
      eq: async () => ({ error: null }),
    }),
  };
  const sb = {
    from: (table: string) => {
      if (table === "fuel_week_snapshot") {
        return {
          ...snapQuery,
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                onInsert(row);
                return {
                  data: {
                    id: "snap-test",
                    version: row.version,
                    inputs_hash: row.inputs_hash,
                    money: row.money,
                    provenance: row.provenance,
                  },
                  error: null,
                };
              },
            }),
          }),
          update: () => periodUpdate,
        };
      }
      if (table === "fuel_brain_policies") {
        return {
          select: () => ({
            limit: async () => ({ data: [BRAIN], error: null }),
          }),
        };
      }
      if (table === "fuel_reconciliation_period") {
        return { update: () => periodUpdate };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return {
    sb: sb as unknown as ComputeFuelWeekSnapshotDeps["sb"],
    hashInputs: async () => "hash-f30",
    prepare: async () => ({
      ok: true as const,
      reports: [{ driverId: "d1", metadata: { chargedBy: "fuel-chain-v3" } }],
      totalSpend: 100,
    }),
  };
}

Deno.test("F-30: computeFuelWeekSnapshot stamps brainPolicies on new snapshot provenance", async () => {
  let inserted: Record<string, unknown> = {};
  const result = await computeFuelWeekSnapshot({
    orgId: "org-f30",
    periodId: "period-f30",
    weekStart: "2026-11-16",
    weekEnd: "2026-11-22",
    deps: stubComputeDeps((row) => {
      inserted = row;
    }),
  });
  assertEquals(result.reused, false);
  const prov = (inserted.provenance || {}) as Record<string, unknown>;
  assertEquals(prov.brainPolicies, BRAIN);
  assertEquals(prov.engineVersion, "fuel-chain-v3");
});

Deno.test("F-30: locked period compute returns stored snapshot and does not recompute", async () => {
  let computeCalls = 0;
  const latest = {
    version: 2,
    inputs_hash: "saved-hash",
    money: { reports: [{ driverId: "kenny" }], totalSpend: 28800 },
    provenance: { brainPolicies: BRAIN, engineVersion: "fuel-chain-v3" },
  };
  const out = await fuelPeriodComputeResponse({
    orgId: "org1",
    periodId: "p-16",
    period: { status: "locked", week_start: "2026-11-16", week_end: "2026-11-22" },
    latestSnapshot: latest,
    computeSnapshot: async () => {
      computeCalls += 1;
      throw new Error("computeFuelWeekSnapshot must not run for locked period");
    },
  });
  assertEquals(computeCalls, 0);
  assertEquals(out.kind, "locked");
  if (out.kind !== "locked") return;
  const body = out.body;
  assertEquals(body.reused, true);
  assertEquals(body.locked, true);
  assertEquals((body.provenance as Record<string, unknown>).brainPolicies, BRAIN);
});