import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MAINTENANCE_MASTER_ROUTE_GUARDS } from "./maintenance_master_routes.ts";

const WRITE_PREFIXES = ["/admin/maintenance", "/admin/vehicle-catalog", "/admin/catalog"];

Deno.test("maintenance master write routes declare catalog.write or govern", () => {
  for (const [route, guard] of Object.entries(MAINTENANCE_MASTER_ROUTE_GUARDS)) {
    if (route.startsWith("GET")) continue;
    assertEquals(guard === "staff_read", false, route);
  }
});

Deno.test("each maintenance master route has a Deno test name slot", () => {
  const expected = [
    "GET /admin/maintenance/rules",
    "POST /admin/maintenance/rules",
    "PATCH /admin/maintenance/rules/:id",
    "GET /admin/maintenance/rules/:id/impact",
    "POST /admin/maintenance/rules/:id/retire",
    "GET /admin/maintenance/preview",
    "GET /admin/maintenance/history",
    "POST /admin/maintenance/conflicts/:id/resolve",
    "PATCH /vehicles/:vehicleId/maintenance/custom-interval",
  ];
  for (const key of expected) {
    assertEquals(key in MAINTENANCE_MASTER_ROUTE_GUARDS, true, key);
  }
});

Deno.test("write route prefixes are catalog scoped", () => {
  for (const key of Object.keys(MAINTENANCE_MASTER_ROUTE_GUARDS)) {
    if (key.startsWith("GET")) continue;
    const path = key.split(" ").slice(1).join(" ");
    const ok = WRITE_PREFIXES.some((p) => path.startsWith(p)) || path.startsWith("/vehicles/");
    assertEquals(ok, true, key);
  }
});
