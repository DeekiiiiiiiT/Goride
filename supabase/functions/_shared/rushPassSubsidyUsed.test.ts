import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sumRushPassSubsidyFromOrderRows } from "./rushPassSubsidyUsed.ts";
import { loadRushPassSubsidyUsed } from "./rushPassSubsidyUsed.ts";
import { loadPromoFreeDeliverySubsidyUsed } from "./promoFreeDeliverySubsidyUsed.ts";

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

Deno.test("loadRushPassSubsidyUsed — uses RPC and fail-closes on error (Finding R)", async () => {
  const okClient = {
    rpc: (_fn: string, _args?: Record<string, unknown>) =>
      Promise.resolve({ data: 1260.5, error: null }),
  };
  const ok = await loadRushPassSubsidyUsed(
    okClient,
    "1fc65898-0000-0000-0000-000000000001",
    "2026-08-30T15:02:16.000Z",
  );
  assertEquals(ok.ok, true);
  if (ok.ok) assertEquals(ok.usedJmd, 1260.5);

  const errClient = {
    rpc: (_fn: string, _args?: Record<string, unknown>) =>
      Promise.resolve({ data: null, error: { message: "boom" } }),
  };
  const err = await loadRushPassSubsidyUsed(
    errClient,
    "1fc65898-0000-0000-0000-000000000001",
    "2026-08-30T15:02:16.000Z",
  );
  assertEquals(err.ok, false);
  if (!err.ok) {
    assertEquals(err.error, "boom");
    assertEquals(err.usedJmd, 0);
  }
});

Deno.test("loadPromoFreeDeliverySubsidyUsed — uses RPC and fail-closes (Finding R)", async () => {
  const okClient = {
    rpc: (fn: string, args?: Record<string, unknown>) => {
      assertEquals(fn, "sum_promo_fd_subsidy_used");
      assertEquals(typeof args?.p_month_start, "string");
      return Promise.resolve({ data: "750", error: null });
    },
  };
  const ok = await loadPromoFreeDeliverySubsidyUsed(okClient, "2026-08-01T05:00:00.000Z");
  assertEquals(ok.ok, true);
  if (ok.ok) assertEquals(ok.usedJmd, 750);

  const errClient = {
    rpc: (_fn: string, _args?: Record<string, unknown>) =>
      Promise.resolve({ data: null, error: { message: "truncated" } }),
  };
  const err = await loadPromoFreeDeliverySubsidyUsed(errClient);
  assertEquals(err.ok, false);
  if (!err.ok) assertEquals(err.error, "truncated");
});
