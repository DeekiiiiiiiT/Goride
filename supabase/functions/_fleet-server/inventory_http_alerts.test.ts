import { assertEquals } from "jsr:@std/assert@1";
import {
  createInventoryTestApp,
  INVENTORY_API_PREFIX,
  testInventoryUser,
} from "./inventory_test_app.ts";

const runIntegration = Deno.env.get("INVENTORY_INTEGRATION_TESTS") === "1";

Deno.test({
  name: "GET inventory alerts list",
  ignore: !runIntegration,
  fn: async () => {
    const app = createInventoryTestApp(testInventoryUser());
    const res = await app.request(`${INVENTORY_API_PREFIX}/alerts`);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(Array.isArray(body.items), true);
  },
});
