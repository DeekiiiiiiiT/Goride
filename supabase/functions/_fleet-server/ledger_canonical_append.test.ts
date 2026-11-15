/**
 * deno test --no-check supabase/functions/_fleet-server/ledger_canonical_append.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import type { Context } from "npm:hono@4.3.11";
import {
  appendCanonicalLedgerEvents,
  ledgerCanonicalTestHooks,
} from "./ledger_canonical.ts";

function ensureSupabaseEnv() {
  if (!Deno.env.get("SUPABASE_URL")) {
    Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
  }
  if (!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  }
}

const ORG = "b2222222-2222-4222-8222-222222222222";

const sampleEvent = {
  idempotencyKey: "ledger-append-test:1",
  date: "2026-01-01",
  driverId: "fleet",
  eventType: "maintenance",
  direction: "outflow",
  netAmount: 100,
  grossAmount: 100,
  currency: "JMD",
  sourceType: "financial_event",
  sourceId: "rec-1",
  organizationId: ORG,
  platform: "Roam",
};

const mockContext = {
  get: (key: string) => {
    if (key === "rbacUser") {
      return { organizationId: ORG, userId: "u1", resolvedRole: "fleet_owner" };
    }
    return undefined;
  },
} as Context;

ensureSupabaseEnv();

Deno.test("appendCanonicalLedgerEvents — dual-write failed → failed 1, success false", async () => {
  ledgerCanonicalTestHooks.getCanonicalEventByIdemKeyOverride = async () => null;
  ledgerCanonicalTestHooks.fleetDualWriteCanonicalEventOverride = async () => (
    { status: "failed", reason: "ledger blocked" }
  );
  try {
    const r = await appendCanonicalLedgerEvents([sampleEvent], mockContext);
    assertEquals(r.inserted, 0);
    assertEquals(r.failed, 1);
    assertEquals(r.success, false);
    assertEquals(r.details[0]?.error, "ledger blocked");
  } finally {
    ledgerCanonicalTestHooks.getCanonicalEventByIdemKeyOverride = undefined;
    ledgerCanonicalTestHooks.fleetDualWriteCanonicalEventOverride = undefined;
  }
});

Deno.test("appendCanonicalLedgerEvents — dual-write posted → inserted 1", async () => {
  ledgerCanonicalTestHooks.getCanonicalEventByIdemKeyOverride = async () => null;
  ledgerCanonicalTestHooks.fleetDualWriteCanonicalEventOverride = async () => ({ status: "posted" });
  try {
    const r = await appendCanonicalLedgerEvents([sampleEvent], mockContext);
    assertEquals(r.inserted, 1);
    assertEquals(r.failed, 0);
    assertEquals(r.success, true);
  } finally {
    ledgerCanonicalTestHooks.getCanonicalEventByIdemKeyOverride = undefined;
    ledgerCanonicalTestHooks.fleetDualWriteCanonicalEventOverride = undefined;
  }
});

Deno.test("appendCanonicalLedgerEvents — dual-write skipped → skipped 1, success true", async () => {
  ledgerCanonicalTestHooks.getCanonicalEventByIdemKeyOverride = async () => null;
  ledgerCanonicalTestHooks.fleetDualWriteCanonicalEventOverride = async () => (
    { status: "skipped", reason: "neutral" }
  );
  try {
    const r = await appendCanonicalLedgerEvents([sampleEvent], mockContext);
    assertEquals(r.skipped, 1);
    assertEquals(r.failed, 0);
    assertEquals(r.success, true);
    assertEquals(r.details[0]?.skipped, true);
    assertEquals(r.details[0]?.reason, "neutral");
  } finally {
    ledgerCanonicalTestHooks.getCanonicalEventByIdemKeyOverride = undefined;
    ledgerCanonicalTestHooks.fleetDualWriteCanonicalEventOverride = undefined;
  }
});