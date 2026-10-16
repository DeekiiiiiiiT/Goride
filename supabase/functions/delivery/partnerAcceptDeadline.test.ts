import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { secondsPastAcceptDeadline } from "./partnerAcceptDeadline.ts";
import { clearSettingCache, getSetting } from "../_shared/rushSettings/getSetting.ts";
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

Deno.test("secondsPastAcceptDeadline: fresh order not overdue", async () => {
  clearSettingCache();
  // Warm cache with injected client so tests don't need live Supabase env.
  await getSetting<number>("partner.orders.accept_deadline_seconds", {
    supabase: emptySb(),
    skipCache: true,
  });
  const placedAt = new Date().toISOString();
  const result = await secondsPastAcceptDeadline(placedAt);
  assertEquals(result.overdue, false);
  assertEquals(result.deadlineSec, 270);
});

Deno.test("secondsPastAcceptDeadline: old order overdue", async () => {
  clearSettingCache();
  await getSetting<number>("partner.orders.accept_deadline_seconds", {
    supabase: emptySb(),
    skipCache: true,
  });
  const placedAt = new Date(Date.now() - 400_000).toISOString();
  const result = await secondsPastAcceptDeadline(placedAt);
  assertEquals(result.overdue, true);
  assertEquals(result.deadlineSec, 270);
});
