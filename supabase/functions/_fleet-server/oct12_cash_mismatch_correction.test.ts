import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  OCT12_CASH_MISMATCH_AMOUNT,
  OCT12_CASH_MISMATCH_SOURCE_WEEK,
} from "./oct12_cash_mismatch_correction.ts";

Deno.test("§1.5 cash mismatch constants match audit", () => {
  assertEquals(OCT12_CASH_MISMATCH_AMOUNT, 3201.27);
  assertEquals(OCT12_CASH_MISMATCH_SOURCE_WEEK, "2026-10-12");
});
