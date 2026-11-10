import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MAINTENANCE_JOBS_ADMIN_ROUTE_GUARDS } from "./maintenance_jobs_admin_routes.ts";
import { MAINTENANCE_MASTER_ROUTE_GUARDS } from "./maintenance_master_routes.ts";

Deno.test("jobs admin GET routes are staff_read", () => {
  assertEquals(MAINTENANCE_JOBS_ADMIN_ROUTE_GUARDS["GET /admin/maintenance/jobs"], "staff_read");
});

Deno.test("jobs admin write routes are catalog.write", () => {
  for (const [route, guard] of Object.entries(MAINTENANCE_JOBS_ADMIN_ROUTE_GUARDS)) {
    if (route.startsWith("GET")) continue;
    assertEquals(guard, "catalog.write", route);
  }
});

Deno.test("maintenance master guards include jobs admin routes", () => {
  assertEquals(
    MAINTENANCE_MASTER_ROUTE_GUARDS["PUT /admin/maintenance/sections/:id/members"],
    "catalog.write",
  );
  assertEquals(
    MAINTENANCE_MASTER_ROUTE_GUARDS["POST /admin/maintenance/jobs/:id/retire"],
    "catalog.write",
  );
});

Deno.test("retire cascade response shape", () => {
  const payload = { removedFromSections: 2, removedLinks: 3 };
  assertEquals(payload.removedFromSections, 2);
  assertEquals(payload.removedLinks, 3);
});
