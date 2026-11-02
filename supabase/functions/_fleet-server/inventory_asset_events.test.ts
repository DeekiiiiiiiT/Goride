/** R31 — POST /assets/:id/events route declared with inventory.move gate. */
import { assertEquals } from "jsr:@std/assert@1";

const SRC = await Deno.readTextFile(
  new URL("./inventory_controller_extended.ts", import.meta.url),
);

Deno.test("inventory extended declares POST asset events with move permission", () => {
  if (!SRC.includes('app.post(`${PREFIX}/assets/:id/events`')) {
    throw new Error("missing POST /assets/:id/events");
  }
  const block = SRC.slice(
    SRC.indexOf('app.post(`${PREFIX}/assets/:id/events`'),
    SRC.indexOf('app.get(`${PREFIX}/assets/:id/documents`'),
  );
  if (!block.includes('requirePermission("inventory.move")')) {
    throw new Error("POST asset events must require inventory.move");
  }
  if (!block.includes("insertAssetEvent")) {
    throw new Error("POST asset events must call insertAssetEvent");
  }
  assertEquals(true, true);
});
