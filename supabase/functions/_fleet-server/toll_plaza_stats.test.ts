import { assertEquals } from "jsr:@std/assert@1";
import {
  attachPlazaStats,
  EMPTY_PLAZA_STATS,
  statsRowToPlazaStats,
  type TollPlazaStats,
} from "./toll_plaza_stats.ts";

Deno.test("statsRowToPlazaStats coerces numeric strings from the view", () => {
  const stats = statsRowToPlazaStats({
    organization_id: "org-1",
    plaza_id: "plaza-1",
    total_transactions: "39",
    total_spend: "14430",
    avg_amount: "370.0000000000000000",
    last_transaction_date: "2026-08-19",
    last_updated: "2026-08-25T22:01:43.915478+00:00",
  });

  assertEquals(stats.totalTransactions, 39);
  assertEquals(stats.totalSpend, 14430);
  assertEquals(stats.avgAmount, 370);
  assertEquals(stats.lastTransactionDate, "2026-08-19");
});

Deno.test("statsRowToPlazaStats rounds a repeating average to cents", () => {
  const stats = statsRowToPlazaStats({
    organization_id: "org-1",
    plaza_id: "plaza-1",
    total_transactions: 3,
    total_spend: 1000,
    avg_amount: "333.3333333333333333",
    last_transaction_date: null,
    last_updated: null,
  });

  assertEquals(stats.avgAmount, 333.33);
  assertEquals(stats.lastTransactionDate, "");
});

Deno.test("attachPlazaStats gives untrafficked plazas an explicit zero record", () => {
  const busy: TollPlazaStats = {
    totalTransactions: 4,
    totalSpend: 3120,
    avgAmount: 780,
    lastTransactionDate: "2026-08-21",
    lastUpdated: "2026-08-25T22:05:51Z",
  };
  const map = new Map<string, TollPlazaStats>([["plaza-a", busy]]);

  const [a, b] = attachPlazaStats(
    [{ id: "plaza-a", name: "Vineyard" }, { id: "plaza-b", name: "Spanish Town" }],
    map,
  ) as any[];

  assertEquals(a.stats.totalSpend, 3120);
  assertEquals(b.stats, EMPTY_PLAZA_STATS);
});

Deno.test("attachPlazaStats never mutates the plaza it was given", () => {
  const plaza = { id: "plaza-a", name: "Vineyard" } as any;
  attachPlazaStats([plaza], new Map());
  assertEquals(plaza.stats, undefined);
});
