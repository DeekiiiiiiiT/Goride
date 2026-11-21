import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  estimateCostUSD,
  GEMINI_GROUNDING_FREE_QUERIES_PER_MONTH,
  groundingCostUSD,
} from "./api_pricing.ts";

Deno.test("grounding: free while the month's 5,000 queries last", () => {
  assertEquals(groundingCostUSD(5, 0), 0);
  assertEquals(groundingCostUSD(5, GEMINI_GROUNDING_FREE_QUERIES_PER_MONTH - 5), 0);
});

Deno.test("grounding: only the queries past the free allowance are charged", () => {
  // 4,998 used → 2 free left → 3 of 5 billed at US$0.014
  assertEquals(groundingCostUSD(5, 4998), 0.042);
  assertEquals(groundingCostUSD(5, 10000), 0.07);
});

Deno.test("grounding: unknown month count charges every query", () => {
  assertEquals(groundingCostUSD(5, Number.POSITIVE_INFINITY), 0.07);
  assertEquals(groundingCostUSD(5, Number.NaN), 0.07);
});

Deno.test("grounding: zero or negative queries cost nothing", () => {
  assertEquals(groundingCostUSD(0, 0), 0);
  assertEquals(groundingCostUSD(-3, 9999), 0);
});

Deno.test("estimateCostUSD: a grounding line without a month count is charged in full", () => {
  assertEquals(estimateCostUSD("gemini", "gemini-3.8-flash", "grounding", { requests: 5 }), 0.07);
});
