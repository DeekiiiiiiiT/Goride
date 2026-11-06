import { assertEquals } from "jsr:@std/assert@1";

const R16_SRC = await Deno.readTextFile(
  new URL("./inventory_controller_r16.ts", import.meta.url),
);

Deno.test("R16 registers settings categories locations routes", async () => {
  for (const fragment of [
    "`${PREFIX}/settings`",
    "`${PREFIX}/categories`",
    "`${PREFIX}/locations`",
  ]) {
    if (!R16_SRC.includes(fragment)) {
      throw new Error(`missing R16 route fragment: ${fragment}`);
    }
  }
  const mod = await import("./inventory_controller_r16.ts");
  assertEquals(typeof mod.registerInventoryR16Routes, "function");
});

Deno.test("inventory extended wires R16 settings categories locations", async () => {
  const src = await Deno.readTextFile(
    new URL("./inventory_controller_extended.ts", import.meta.url),
  );
  if (!src.includes("registerInventoryR16Routes(app)")) {
    throw new Error("expected R16 route registration in extended controller");
  }
  assertEquals(true, true);
});
