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

Deno.test("inventory phase0: legacy draw helper exists", async () => {
  const mod = await import("./inventory_legacy_stock.ts");
  assertEquals(typeof mod.legacyDrawInventoryQuantity, "function");
});
