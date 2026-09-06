/**
 * S1-9 guardrail: list SELECT must include every column the mapper reads.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  PERIOD_LIST_MAPPER_COLUMNS,
  PERIOD_LIST_SELECT,
  RECONCILED_PERIOD_LIST_SELECT,
  selectIncludesColumns,
} from "./settlement_period_select.ts";

Deno.test("PERIOD_LIST_SELECT covers every mapPeriodListRow column", () => {
  const missing = selectIncludesColumns(PERIOD_LIST_SELECT, PERIOD_LIST_MAPPER_COLUMNS);
  assertEquals(missing, []);
});

Deno.test("RECONCILED_PERIOD_LIST_SELECT includes metadata + earnings_gross", () => {
  const missing = selectIncludesColumns(RECONCILED_PERIOD_LIST_SELECT, [
    ...PERIOD_LIST_MAPPER_COLUMNS,
    "earnings_gross",
    "driver_share",
    "fleet_share",
    "cash_written_off",
  ]);
  assertEquals(missing, []);
});

Deno.test("selectIncludesColumns flags omitted mapper fields", () => {
  const missing = selectIncludesColumns(
    "driver_id, period_anchor, settlement_amount",
    PERIOD_LIST_MAPPER_COLUMNS,
  );
  assertEquals(missing.includes("metadata"), true);
  assertEquals(missing.includes("cash_still_held"), true);
});
