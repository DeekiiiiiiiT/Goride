import { assertEquals } from "jsr:@std/assert@1";
import { workOrdersBasePath } from "./maintenance_routes.ts";

Deno.test("internal complete call keeps the function prefix (fleet-ops basePath)", () => {
  assertEquals(workOrdersBasePath("/fleet-ops/maintenance-work-orders"), "/fleet-ops/maintenance-work-orders");
});

Deno.test("works without a prefix (monolith / tests)", () => {
  assertEquals(workOrdersBasePath("/maintenance-work-orders"), "/maintenance-work-orders");
});
