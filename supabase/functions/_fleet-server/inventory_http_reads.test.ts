import { assertEquals } from "jsr:@std/assert@1";
import {
  createInventoryTestApp,
  INVENTORY_API_PREFIX,
  testInventoryUser,
} from "./inventory_test_app.ts";

const runIntegration = Deno.env.get("INVENTORY_INTEGRATION_TESTS") === "1";

Deno.test({
  name: "GET inventory overview stock items settings",
  ignore: !runIntegration,
  fn: async () => {
    const app = createInventoryTestApp(testInventoryUser());
    for (const path of ["/overview", "/stock", "/items", "/settings"]) {
      const res = await app.request(`${INVENTORY_API_PREFIX}${path}`);
      assertEquals(res.status < 500, true, path);
    }
  },
});
