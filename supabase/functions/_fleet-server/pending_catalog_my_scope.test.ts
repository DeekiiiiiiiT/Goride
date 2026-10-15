/**
 * GET /vehicle-catalog-pending/my scope: staff org-wide vs driver assigned vehicle.
 * deno test supabase/functions/_fleet-server/pending_catalog_my_scope.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  resolveMyPendingCatalogScope,
  scopeMyPendingCatalogVehicleId,
} from "./pending_catalog_my_scope.ts";

Deno.test("no assigned vehicle → empty scope (not org-wide)", () => {
  assertEquals(
    scopeMyPendingCatalogVehicleId({ assignedVehicleId: null }),
    null,
  );
  assertEquals(
    scopeMyPendingCatalogVehicleId({
      assignedVehicleId: "",
      fleetVehicleIdHint: "vehicle-b",
    }),
    null,
  );
});

Deno.test("assigned vehicle A — hint for vehicle B is rejected", () => {
  assertEquals(
    scopeMyPendingCatalogVehicleId({
      assignedVehicleId: "vehicle-a",
      fleetVehicleIdHint: "vehicle-b",
    }),
    null,
  );
});

Deno.test("assigned vehicle A — matching or omitted hint keeps A", () => {
  assertEquals(
    scopeMyPendingCatalogVehicleId({ assignedVehicleId: "vehicle-a" }),
    "vehicle-a",
  );
  assertEquals(
    scopeMyPendingCatalogVehicleId({
      assignedVehicleId: "vehicle-a",
      fleetVehicleIdHint: "vehicle-a",
    }),
    "vehicle-a",
  );
});

Deno.test("staff with vehicles.view → org-wide (optional vehicle filter)", () => {
  assertEquals(
    resolveMyPendingCatalogScope({
      canViewVehicles: true,
      assignedVehicleId: null,
    }),
    { mode: "org" },
  );
  assertEquals(
    resolveMyPendingCatalogScope({
      canViewVehicles: true,
      assignedVehicleId: null,
      fleetVehicleIdHint: "vehicle-b",
    }),
    { mode: "org", vehicleId: "vehicle-b" },
  );
});

Deno.test("driver without vehicles.view → assigned vehicle only", () => {
  assertEquals(
    resolveMyPendingCatalogScope({
      canViewVehicles: false,
      assignedVehicleId: "vehicle-a",
    }),
    { mode: "vehicle", vehicleId: "vehicle-a" },
  );
  assertEquals(
    resolveMyPendingCatalogScope({
      canViewVehicles: false,
      assignedVehicleId: "vehicle-a",
      fleetVehicleIdHint: "vehicle-b",
    }),
    { mode: "empty" },
  );
  assertEquals(
    resolveMyPendingCatalogScope({
      canViewVehicles: false,
      assignedVehicleId: null,
    }),
    { mode: "empty" },
  );
});
