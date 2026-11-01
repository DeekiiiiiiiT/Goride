/**
 * Phase 0 — legacy inventory security (INV-01, INV-03 interim, bulk draw lock).
 */
import { assertEquals } from "jsr:@std/assert@1";

Deno.test("inventory phase0: templates route requires auth in registrar", async () => {
  const src = await Deno.readTextFile(
    new URL("./register_residual_monolith_routes.tsx", import.meta.url),
  );
  const block = src.slice(
    src.indexOf('"/make-server-37f42386/templates"'),
    src.indexOf('// Weekly Check-Ins Endpoints'),
  );
  if (!block.includes("requireAuth()")) {
    throw new Error("templates POST missing requireAuth");
  }
  if (!block.includes('requirePermission("inventory.kits.manage")')) {
    throw new Error("templates POST missing inventory.kits.manage");
  }
  if (!block.includes("stampOrgRequired")) {
    throw new Error("templates POST missing stampOrgRequired");
  }
  assertEquals(true, true);
});

Deno.test("inventory phase0: bulk equipment rejects legacy inventory draw", async () => {
  const src = await Deno.readTextFile(
    new URL("./register_residual_monolith_routes.tsx", import.meta.url),
  );
  const block = src.slice(
    src.indexOf('"/make-server-37f42386/fleet/equipment/bulk"'),
    src.indexOf("// Inventory Endpoints"),
  );
  if (block.includes("inventory_legacy_stock")) {
    throw new Error("bulk equipment must not import inventory_legacy_stock");
  }
  if (!block.includes("Legacy inventory draw removed")) {
    throw new Error("bulk equipment must 410 when inventoryId is set");
  }
  assertEquals(true, true);
});
