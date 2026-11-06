import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import registry from "../fleet-core/routes.generated.json" with { type: "json" };

Deno.test("V-01: vehicle-catalog purge route removed from fleet-core registry", () => {
  const routes = registry.routes as string[];
  assertEquals(
    routes.some((r) => r.includes("/admin/vehicle-catalog/purge")),
    false,
  );
});
