/**
 * M-14: package reads ignore part rules (component_id set).
 * deno test --no-check supabase/functions/_fleet-server/maintenance_master_m14_package_reads.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  countBootstrapPackageTemplates,
  filterMaintenancePackageTemplates,
} from "./maintenance_package_templates.ts";
import { getCatalogServiceKit } from "./catalog_api.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const PACKAGE_IDS = ["p1", "p2", "p3", "p4", "p5"];
const PART_RULE_IDS = Array.from({ length: 16 }, (_, i) => `r${i + 1}`);

function mockTemplates() {
  const packages = PACKAGE_IDS.map((id, i) => ({
    id,
    task_name: `Package ${i}`,
    template_scope: "global",
    component_id: null,
  }));
  const partRules = PART_RULE_IDS.map((id, i) => ({
    id,
    task_name: `Part rule ${i}`,
    template_scope: "global",
    component_id: `cat-${i}`,
  }));
  return [...packages, ...partRules];
}

Deno.test("filterMaintenancePackageTemplates keeps 5 packages when 16 part rules present", () => {
  const all = mockTemplates();
  const filtered = filterMaintenancePackageTemplates(all);
  assertEquals(filtered.length, 5);
  assertEquals(filtered.map((r) => r.id), PACKAGE_IDS);
  const counts = countBootstrapPackageTemplates(all);
  assertEquals(counts.total, 5);
  assertEquals(counts.globalApplied, 5);
  assertEquals(counts.catalogApplied, 0);
});

Deno.test("bootstrap package count unchanged with or without part rules in raw query result", () => {
  const packagesOnly = mockTemplates().filter((r) => r.component_id == null);
  const withRules = mockTemplates();
  assertEquals(countBootstrapPackageTemplates(packagesOnly).total, 5);
  assertEquals(countBootstrapPackageTemplates(withRules).total, 5);
});

Deno.test("getCatalogServiceKit uses schedule_for_variant rows only (packages)", async () => {
  const scheduleRows = PACKAGE_IDS.map((id, i) => ({
    template_id: id,
    task_code: `code-${i}`,
    task_name: `Package ${i}`,
    component_id: null,
  }));

  const supabase = {
    rpc: (name: string) => {
      if (name === "schedule_for_variant") {
        return Promise.resolve({ data: scheduleRows, error: null });
      }
      return Promise.resolve({ data: null, error: { message: "unknown rpc" } });
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;

  const kit = await getCatalogServiceKit(supabase, "catalog-1", null);
  assertEquals(kit.items.length, 5);
  assertEquals(kit.pending, false);
});
