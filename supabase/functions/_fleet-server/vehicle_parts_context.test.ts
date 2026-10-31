/**
 * deno test --no-check supabase/functions/_fleet-server/vehicle_parts_context.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  loadVehiclePartsContextExtras,
  PART_REPEAT_ALERT_NOTE_COLUMNS,
} from "./vehicle_parts_context.ts";

Deno.test("part_repeat_alert note columns exclude title", () => {
  assertEquals(PART_REPEAT_ALERT_NOTE_COLUMNS.includes("title"), false);
  assertEquals(PART_REPEAT_ALERT_NOTE_COLUMNS, "detail, created_at");
});

Deno.test("loadVehiclePartsContextExtras uses open alert when ledger has no notes", async () => {
  const alertSelects: string[] = [];
  const ledgerChain = {
    select() { return ledgerChain; },
    eq() { return ledgerChain; },
    is() { return ledgerChain; },
    not() { return ledgerChain; },
    order() { return ledgerChain; },
    limit() { return Promise.resolve({ data: [], error: null }); },
  };
  const orgChain = {
    select() { return orgChain; },
    eq() { return orgChain; },
    maybeSingle() {
      return Promise.resolve({ data: { name: "Test Org", fleet_tag: "TST" }, error: null });
    },
  };
  const alertChain = {
    select(cols: string) {
      alertSelects.push(cols);
      return alertChain;
    },
    eq() { return alertChain; },
    order() { return alertChain; },
    limit() { return alertChain; },
    maybeSingle() {
      return Promise.resolve({
        data: { detail: "Repeat brake wear flagged", created_at: "2026-10-30T12:00:00Z" },
        error: null,
      });
    },
  };
  const supabase = {
    from(table: string) {
      if (table === "maintenance_service_ledger") return ledgerChain;
      if (table === "organizations") return orgChain;
      if (table === "part_repeat_alert") return alertChain;
      if (table === "vehicle_catalog") {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle() { return Promise.resolve({ data: null, error: null }); },
          ilike() { return this; },
          lte() { return this; },
          or() { return this; },
          limit() { return Promise.resolve({ data: [], error: null }); },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  const extras = await loadVehiclePartsContextExtras(
    supabase as never,
    "org-1",
    "veh-roomy",
    { year: 2019, make: "Toyota", model: "Roomy", licensePlate: "5179KZ" },
  );

  assertEquals(alertSelects.length, 1);
  assertEquals(alertSelects[0], PART_REPEAT_ALERT_NOTE_COLUMNS);
  assertEquals((extras.latestNote as { text: string }).text, "Repeat brake wear flagged");
});
