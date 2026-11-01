import { assertEquals } from "jsr:@std/assert@1";

Deno.test("legacy bulk assign uses row-locked draw", async () => {
  const src = await Deno.readTextFile(
    new URL("./register_residual_monolith_routes.tsx", import.meta.url),
  );
  const block = src.slice(
    src.indexOf("/make-server-37f42386/fleet/equipment/bulk"),
    src.indexOf("// Inventory Endpoints"),
  );
  if (!block.includes("legacyDrawInventoryQuantity")) {
    throw new Error("bulk assign must use legacyDrawInventoryQuantity");
  }
  assertEquals(true, true);
});
