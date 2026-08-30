import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  RUSH_PASS_SUBSIDY_ORDER_COLUMNS,
  sumRushPassSubsidyFromOrderRows,
} from "./rushPassSubsidyUsed.ts";

Deno.test("sumRushPassSubsidyFromOrderRows — prefers column over snapshot", () => {
  const used = sumRushPassSubsidyFromOrderRows([
    {
      status: "placed",
      platform_delivery_subsidy_jmd: 630,
      pricing_snapshot: { platform_delivery_subsidy_jmd: 100 },
    },
  ]);
  assertEquals(used, 630);
});

Deno.test("sumRushPassSubsidyFromOrderRows — snapshot fallback + skip cancelled", () => {
  const used = sumRushPassSubsidyFromOrderRows([
    {
      status: "cancelled",
      platform_delivery_subsidy_jmd: 630,
      pricing_snapshot: {},
    },
    {
      status: "placed",
      platform_delivery_subsidy_jmd: 0,
      pricing_snapshot: { promo_cost_jmd: 400 },
    },
    {
      status: "placed",
      platform_delivery_subsidy_jmd: 630,
      pricing_snapshot: {},
    },
  ]);
  assertEquals(used, 1030);
});

Deno.test("RUSH_PASS_SUBSIDY_ORDER_COLUMNS — no top-level promo_cost_jmd (Finding L)", () => {
  assertEquals(
    RUSH_PASS_SUBSIDY_ORDER_COLUMNS.includes(
      "promo_cost_jmd" as (typeof RUSH_PASS_SUBSIDY_ORDER_COLUMNS)[number],
    ),
    false,
  );
  assertEquals(RUSH_PASS_SUBSIDY_ORDER_COLUMNS.length, 3);
});
