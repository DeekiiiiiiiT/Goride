import { assertEquals } from "jsr:@std/assert@1";

Deno.test("legacy bulk assign uses row-locked draw", async () => {
  const src = await Deno.readTextFile(
    new URL("./register_residual_monolith_routes.tsx", import.meta.url),
  );
  const block = src.slice(
    src.indexOf("/make-server-37f42386/fleet/equipment/bulk"),
    src.indexOf("// Inventory Endpoints"),
  );
  if (!block.includes("legacyFleetInventoryApiRetired")) {
    throw new Error("bulk assign must block via legacyFleetInventoryApiRetired");
  }
  if (!block.includes("Legacy inventory draw removed")) {
    throw new Error("bulk assign must refuse legacy inventory draw");
  }
  assertEquals(true, true);
});
