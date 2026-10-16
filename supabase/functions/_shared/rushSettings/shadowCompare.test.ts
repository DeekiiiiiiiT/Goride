import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { shadowCompare, shadowValuesEqual } from "./shadowCompare.ts";
import { clearSettingCache } from "./getSetting.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

function emptySb(): SupabaseClient {
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
    eq() {
      return api;
    },
    async maybeSingle() {
      return { data: null, error: null };
    },
  };
  return api as unknown as SupabaseClient;
}

Deno.test("shadowValuesEqual handles numbers and objects", () => {
  assertEquals(shadowValuesEqual(12, 12), true);
  assertEquals(shadowValuesEqual(12, 12.0000000001), true);
  assertEquals(shadowValuesEqual({ a: 1 }, { a: 1 }), true);
  assertEquals(shadowValuesEqual(true, false), false);
});

Deno.test("shadowCompare returns getSetting (registry default) and tolerates match", async () => {
  clearSettingCache();
  Deno.env.delete("COURIER_DISPATCH_RADIUS_KM");
  const v = await shadowCompare<number>("courier.dispatch.radius_km", 12, {
    supabase: emptySb(),
    skipCache: true,
  });
  assertEquals(v, 12);
});
