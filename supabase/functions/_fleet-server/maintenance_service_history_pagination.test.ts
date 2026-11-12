/**
 * R-01 — service history pages by work order, not by line row.
 * deno test --no-check supabase/functions/_fleet-server/maintenance_service_history_pagination.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import {
  applyServiceHistoryPageLinesQuery,
  paginateServiceHistoryWorkOrders,
  sortServiceHistoryLineRows,
} from "./maintenance_logging_helpers.ts";

const WO_A = "11111111-1111-4111-8111-111111111111";

Deno.test("R-01 — one service with 3 slim rows → total 1 on pageSize 2", () => {
  const slim = [
    { work_order_id: WO_A, performed_at_date: "2026-11-01" },
    { work_order_id: WO_A, performed_at_date: "2026-11-01" },
    { work_order_id: WO_A, performed_at_date: "2026-11-01" },
  ];
  const { pageIds, total } = paginateServiceHistoryWorkOrders(slim, 1, 2);
  assertEquals(total, 1);
  assertEquals(pageIds, [WO_A]);
});

Deno.test("R-01 — discounted service lines all belong to the single page work order", () => {
  const lines = [
    { line_id: "l1", work_order_id: WO_A, performed_at_date: "2026-11-01", discount_amount: 500 },
    { line_id: "l2", work_order_id: WO_A, performed_at_date: "2026-11-01", discount_amount: 500 },
    { line_id: "l3", work_order_id: WO_A, performed_at_date: "2026-11-01", discount_amount: 500 },
  ];
  const sorted = sortServiceHistoryLineRows(lines, [WO_A]);
  assertEquals(sorted.length, 3);
  assertEquals(sorted.every((r) => String(r.work_order_id) === WO_A), true);
});

/** Records every query-builder call so the test can see which filters were applied. */
function recorder() {
  const calls: { m: string; args: unknown[] }[] = [];
  const q: Record<string, unknown> = {};
  for (const m of ["eq", "in", "or", "gte", "ilike", "order"]) {
    q[m] = (...args: unknown[]) => {
      calls.push({ m, args });
      return q;
    };
  }
  return { q, calls };
}

Deno.test("R-02 — page lines query uses org + work_order_id only (no part/search filter)", () => {
  const { q, calls } = recorder();
  applyServiceHistoryPageLinesQuery(q, "org-1", [WO_A]);
  assertEquals(calls.map((c) => c.m), ["eq", "in", "order"]);
  assertEquals(calls[0].args, ["organization_id", "org-1"]);
  assertEquals(calls[1].args, ["work_order_id", [WO_A]]);
});

Deno.test("R-02 — part filter matches 1 of 3 lines, but all 3 come back so net total is right", () => {
  // Service: oil 8,000 · air filter 1,000 · labor 8,000 = 17,000; discount 1,000 → 16,000.
  const allLines = [
    { line_id: "l1", work_order_id: WO_A, category_code: "oil", line_total: 8000, discount_amount: 1000 },
    { line_id: "l2", work_order_id: WO_A, category_code: "air_filter", line_total: 1000, discount_amount: 1000 },
    { line_id: "l3", work_order_id: WO_A, category_code: "labor", line_total: 8000, discount_amount: 1000 },
  ];
  const { q, calls } = recorder();
  applyServiceHistoryPageLinesQuery(q, "org-1", [WO_A]);
  // Apply the recorded calls to the fake table the way PostgREST would.
  let rows = allLines.map((r) => ({ ...r, organization_id: "org-1" })) as Record<string, unknown>[];
  for (const c of calls) {
    if (c.m === "eq") rows = rows.filter((r) => r[c.args[0] as string] === c.args[1]);
    if (c.m === "in") rows = rows.filter((r) => (c.args[1] as unknown[]).includes(r[c.args[0] as string]));
    if (c.m === "or" || c.m === "ilike" || c.m === "gte") throw new Error("filter leaked into page lines query");
  }
  const sum = rows.reduce((s, r) => s + Number(r.line_total), 0);
  assertEquals(rows.length, 3);
  assertEquals(sum - 1000, 16000);
});
