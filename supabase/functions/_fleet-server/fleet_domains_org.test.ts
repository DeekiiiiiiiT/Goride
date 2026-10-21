import { assertEquals } from "jsr:@std/assert";
import { FLEET_DOMAINS, orgOf } from "./fleet_domains.ts";

Deno.test("orgOf reads orgId and metadata org_id", () => {
  assertEquals(orgOf({ orgId: "org-a" }), "org-a");
  assertEquals(orgOf({ metadata: { org_id: "org-b" } }), "org-b");
  assertEquals(orgOf({ organizationId: "org-c", orgId: "org-a" }), "org-c");
});

Deno.test("fuel entry map stamps organization_id from orgId", () => {
  const def = FLEET_DOMAINS.find((d) => d.domain === "fuel_entries");
  const row = def?.mapRow("fuel_entry:fill-1", {
    id: "fill-1",
    orgId: "org-a",
    date: "2026-10-17",
    amount: 1500,
  });
  assertEquals(row?.organization_id, "org-a");
});
