import { assertEquals } from "jsr:@std/assert@1";
import {
  createInventoryTestApp,
  INVENTORY_API_PREFIX,
  testInventoryUser,
} from "./inventory_test_app.ts";

const runIntegration = Deno.env.get("INVENTORY_INTEGRATION_TESTS") === "1";

Deno.test({
  name: "POST items import and GET categories",
  ignore: !runIntegration,
  fn: async () => {
    const app = createInventoryTestApp(testInventoryUser());
    const importRes = await app.request(`${INVENTORY_API_PREFIX}/items/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: { rows: [] } }),
    });
    assertEquals(importRes.status < 500, true);

    const catRes = await app.request(`${INVENTORY_API_PREFIX}/categories`);
    assertEquals(catRes.status, 200);
  },
});
