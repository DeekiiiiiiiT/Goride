/**
 * Resolution order tests for getSetting (env → market → platform → default).
 */
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  clearSettingCache,
  getSetting,
  parseEnvOverride,
  safeReadFallback,
} from "./getSetting.ts";
import { getRegistryEntry } from "./registry.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type FakeRow = {
  key: string;
  scope: string;
  scope_id: string;
  value: unknown;
  version: number;
};

function fakeSupabase(rows: FakeRow[]): SupabaseClient {
  const filters: Record<string, unknown> = {};
  const api = {
    schema() {
      return api;
    },
    from() {
      return api;
    },
    select() {
      return api;
    },
    eq(col: string, val: unknown) {
      filters[col] = val;
      return api;
    },
    async maybeSingle() {
      const hit = rows.find(
        (r) =>
          r.key === filters.key &&
          r.scope === filters.scope &&
          r.scope_id === filters.scope_id,
      );
      for (const k of Object.keys(filters)) delete filters[k];
      return { data: hit ?? null, error: null };
    },
  };
  return api as unknown as SupabaseClient;
}

Deno.test("parseEnvOverride boolean + OFF invert", () => {
  const remittance = getRegistryEntry("courier.cash.remittance_enabled")!;
  assertEquals(parseEnvOverride("1", remittance), false);
  assertEquals(parseEnvOverride("0", remittance), true);

  const ordering = getRegistryEntry("customer.ordering.enabled")!;
  assertEquals(parseEnvOverride("false", ordering), false);
  assertEquals(parseEnvOverride("true", ordering), true);
});

Deno.test("parseEnvOverride TTL ms → seconds", () => {
  const ttl = getRegistryEntry("courier.dispatch.offer_ttl_seconds")!;
  assertEquals(parseEnvOverride("90000", ttl), 90);
  assertEquals(parseEnvOverride("60", ttl), 60);
});

Deno.test("safeReadFallback keeps orders / blocks maintenance invent", () => {
  const ordering = getRegistryEntry("customer.ordering.enabled")!;
  assertEquals(safeReadFallback("customer.ordering.enabled", ordering), true);

  const card = getRegistryEntry("customer.payment.card")!;
  assertEquals(safeReadFallback("customer.payment.card", card), true);

  const maint = getRegistryEntry("platform.maintenance.customer")!;
  assertEquals(
    safeReadFallback("platform.maintenance.customer", maint),
    maint.default,
  );
});

Deno.test("getSetting: unknown key throws", async () => {
  clearSettingCache();
  await assertRejects(
    () => getSetting("does.not.exist", { skipCache: true }),
    Error,
    "Unknown rush setting key",
  );
});

Deno.test("getSetting: registry default when store empty", async () => {
  clearSettingCache();
  Deno.env.delete("COURIER_DISPATCH_RADIUS_KM");
  const v = await getSetting<number>("courier.dispatch.radius_km", {
    supabase: fakeSupabase([]),
    skipCache: true,
  });
  assertEquals(v, 12);
});

Deno.test("getSetting: platform beats default", async () => {
  clearSettingCache();
  Deno.env.delete("COURIER_DISPATCH_RADIUS_KM");
  const v = await getSetting<number>("courier.dispatch.radius_km", {
    supabase: fakeSupabase([
      {
        key: "courier.dispatch.radius_km",
        scope: "platform",
        scope_id: "00000000-0000-0000-0000-000000000000",
        value: 8,
        version: 2,
      },
    ]),
    skipCache: true,
  });
  assertEquals(v, 8);
});

Deno.test("getSetting: market beats platform", async () => {
  clearSettingCache();
  Deno.env.delete("COURIER_DISPATCH_RADIUS_KM");
  const marketId = "11111111-1111-1111-1111-111111111111";
  const v = await getSetting<number>("courier.dispatch.radius_km", {
    marketId,
    supabase: fakeSupabase([
      {
        key: "courier.dispatch.radius_km",
        scope: "platform",
        scope_id: "00000000-0000-0000-0000-000000000000",
        value: 8,
        version: 2,
      },
      {
        key: "courier.dispatch.radius_km",
        scope: "market",
        scope_id: marketId,
        value: 20,
        version: 1,
      },
    ]),
    skipCache: true,
  });
  assertEquals(v, 20);
});

Deno.test("getSetting: env beats market", async () => {
  clearSettingCache();
  Deno.env.set("COURIER_DISPATCH_RADIUS_KM", "3");
  try {
    const marketId = "11111111-1111-1111-1111-111111111111";
    const v = await getSetting<number>("courier.dispatch.radius_km", {
      marketId,
      supabase: fakeSupabase([
        {
          key: "courier.dispatch.radius_km",
          scope: "market",
          scope_id: marketId,
          value: 20,
          version: 1,
        },
      ]),
      skipCache: true,
    });
    assertEquals(v, 3);
  } finally {
    Deno.env.delete("COURIER_DISPATCH_RADIUS_KM");
  }
});

Deno.test("getSetting: invalid stored value falls back to default", async () => {
  clearSettingCache();
  Deno.env.delete("COURIER_DISPATCH_RADIUS_KM");
  const v = await getSetting<number>("courier.dispatch.radius_km", {
    supabase: fakeSupabase([
      {
        key: "courier.dispatch.radius_km",
        scope: "platform",
        scope_id: "00000000-0000-0000-0000-000000000000",
        value: "not-a-number",
        version: 1,
      },
    ]),
    skipCache: true,
  });
  assertEquals(v, 12);
});
