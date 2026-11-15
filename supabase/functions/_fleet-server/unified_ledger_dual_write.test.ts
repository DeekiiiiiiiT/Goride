/**
 * deno test --no-check supabase/functions/_fleet-server/unified_ledger_dual_write.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import {
  fleetDualWriteCanonicalEvent,
  unifiedLedgerDualWriteTestHooks,
} from "./unified_ledger_dual_write.ts";

function ensureSupabaseEnv() {
  if (!Deno.env.get("SUPABASE_URL")) {
    Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
  }
  if (!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  }
}

const ORG = "a1111111-1111-4111-8111-111111111111";

const baseEvent = {
  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  idempotencyKey: "unified-dw-test",
  eventType: "maintenance",
  direction: "outflow",
  netAmount: 100,
  driverId: "fleet",
  sourceType: "financial_event",
  sourceId: "src-1",
  organizationId: ORG,
};

ensureSupabaseEnv();

Deno.test("fleetDualWriteCanonicalEvent — postEntry failure → failed", async () => {
  unifiedLedgerDualWriteTestHooks.postEntryOverride = async () => ({ ok: false, error: "ledger blocked" });
  try {
    const r = await fleetDualWriteCanonicalEvent(baseEvent);
    assertEquals(r.status, "failed");
    assertEquals(r.reason, "ledger blocked");
  } finally {
    unifiedLedgerDualWriteTestHooks.postEntryOverride = undefined;
  }
});

Deno.test("fleetDualWriteCanonicalEvent — postEntry success → posted", async () => {
  unifiedLedgerDualWriteTestHooks.postEntryOverride = async () => ({ ok: true });
  try {
    const r = await fleetDualWriteCanonicalEvent(baseEvent);
    assertEquals(r.status, "posted");
  } finally {
    unifiedLedgerDualWriteTestHooks.postEntryOverride = undefined;
  }
});

Deno.test("fleetDualWriteCanonicalEvent — flag off → skipped", async () => {
  unifiedLedgerDualWriteTestHooks.dualWriteEnabledOverride = () => false;
  try {
    const r = await fleetDualWriteCanonicalEvent(baseEvent);
    assertEquals(r.status, "skipped");
    assertEquals(r.reason, "flag_off");
  } finally {
    unifiedLedgerDualWriteTestHooks.dualWriteEnabledOverride = undefined;
  }
});

Deno.test("fleetDualWriteCanonicalEvent — neutral → skipped", async () => {
  const r = await fleetDualWriteCanonicalEvent({ ...baseEvent, direction: "neutral" });
  assertEquals(r.status, "skipped");
  assertEquals(r.reason, "neutral");
});

Deno.test("fleetDualWriteCanonicalEvent — zero amount → skipped", async () => {
  const r = await fleetDualWriteCanonicalEvent({ ...baseEvent, netAmount: 0 });
  assertEquals(r.status, "skipped");
  assertEquals(r.reason, "zero_amount");
});

Deno.test("fleetDualWriteCanonicalEvent — self_ref accounts → skipped", async () => {
  const r = await fleetDualWriteCanonicalEvent({
    ...baseEvent,
    direction: "inflow",
    organizationId: undefined,
    driverId: "fleet",
  });
  assertEquals(r.status, "skipped");
  assertEquals(r.reason, "self_ref_accounts");
});