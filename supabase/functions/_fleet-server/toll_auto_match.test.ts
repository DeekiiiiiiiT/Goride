import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { AUTO_MATCH_SCAN_CAP, runPerfectMatchAutoMatch } from "./toll_auto_match.ts";

Deno.test("runPerfectMatchAutoMatch: PERFECT_MATCH writes + sync", async () => {
  const updates: string[] = [];
  const syncs: string[] = [];
  const audits: string[] = [];

  const result = await runPerfectMatchAutoMatch(
    {
      unreconciled: [{ id: "tx1", amount: -100, isReconciled: false }],
      trips: [{ id: "trip1", driverId: "d1", driverName: "A", tollCharges: 100 }],
      timezone: "America/Jamaica",
      driverAliasMap: new Map(),
      actorId: "actor-1",
    },
    {
      resolveExpectedCostsBatch: async () => [{ expectedCost: 100 }],
      findMatches: () => [
        { tripId: "trip1", confidenceScore: 100, matchType: "PERFECT_MATCH" },
      ],
      updateTollLedgerEntry: async (id) => {
        updates.push(id);
      },
      syncTripRefundOnTollLink: async (opts) => {
        syncs.push(opts.tripId);
      },
      writeTollLedgerEntry: async (opts) => {
        audits.push(String(opts.sourceId));
      },
    },
  );

  assertEquals(result.autoReconciled, 1);
  assertEquals(result.errors.length, 0);
  assertEquals(updates, ["tx1"]);
  assertEquals(syncs, ["trip1"]);
  assertEquals(audits, ["tx1"]);
});

Deno.test("runPerfectMatchAutoMatch: skips non-perfect and ambiguous", async () => {
  let updates = 0;
  const result = await runPerfectMatchAutoMatch(
    {
      unreconciled: [
        { id: "a", isReconciled: false },
        { id: "b", isReconciled: false },
      ],
      trips: [{ id: "t1" }],
      timezone: "UTC",
      driverAliasMap: {},
      actorId: "x",
    },
    {
      resolveExpectedCostsBatch: async () => [{ expectedCost: 1 }, { expectedCost: 1 }],
      findMatches: (_tx, _trips, _tz, _alias, _cost, _ex) => {
        if (_tx.id === "a") return [{ tripId: "t1", confidenceScore: 50, matchType: "NEAR_MATCH" }];
        return [{ tripId: "t1", confidenceScore: 90, matchType: "PERFECT_MATCH", isAmbiguous: true }];
      },
      updateTollLedgerEntry: async () => {
        updates++;
      },
      syncTripRefundOnTollLink: async () => {},
      writeTollLedgerEntry: async () => {},
    },
  );
  assertEquals(result.autoReconciled, 0);
  assertEquals(updates, 0);
});

Deno.test("runPerfectMatchAutoMatch: compensates after sync failure", async () => {
  const actions: string[] = [];
  const result = await runPerfectMatchAutoMatch(
    {
      unreconciled: [{ id: "tx2", amount: -50, isReconciled: false }],
      trips: [{ id: "trip2", driverId: "d2" }],
      timezone: "UTC",
      driverAliasMap: {},
      actorId: "actor",
    },
    {
      resolveExpectedCostsBatch: async () => [{ expectedCost: 50 }],
      findMatches: () => [
        { tripId: "trip2", confidenceScore: 99, matchType: "PERFECT_MATCH" },
      ],
      updateTollLedgerEntry: async (_id, _patch, action) => {
        actions.push(action);
      },
      syncTripRefundOnTollLink: async () => {
        throw new Error("sync boom");
      },
      writeTollLedgerEntry: async () => {},
    },
  );
  assertEquals(result.autoReconciled, 0);
  assertEquals(result.errors.some((e) => e.includes("sync boom")), true);
  assertEquals(actions, ["reconciled", "unreconciled"]);
});

Deno.test("AUTO_MATCH_SCAN_CAP is bounded", () => {
  assertEquals(AUTO_MATCH_SCAN_CAP, 3000);
});
