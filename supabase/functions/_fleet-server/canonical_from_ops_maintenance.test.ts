/**
 * deno test --no-check supabase/functions/_fleet-server/canonical_from_ops_maintenance.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import { appendCanonicalMaintenanceIfEligible } from "./canonical_from_ops.ts";
import type { Context } from "npm:hono@4.3.11";

Deno.test("appendCanonicalMaintenanceIfEligible — ineligible record does not post", async () => {
  const r = await appendCanonicalMaintenanceIfEligible({
    id: "x",
    vehicleId: "v",
    performed_at_date: "2026-01-01",
    cost: 0,
    status: "Completed",
    currency: "JMD",
    service_type: "Quick job",
    provider: null,
  }, {} as Context);
  assertEquals(r.posted, false);
  assertEquals(r.failed, false);
});
