import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyMaintenanceApp } from "./maintenanceMiddleware.ts";

Deno.test("classifyMaintenanceApp exempts admin/health/app-config", () => {
  assertEquals(classifyMaintenanceApp("/delivery/admin/settings"), null);
  assertEquals(classifyMaintenanceApp("/delivery/app-config"), null);
  assertEquals(classifyMaintenanceApp("/delivery/internal/cron"), null);
  assertEquals(classifyMaintenanceApp("/delivery/health"), null);
  assertEquals(classifyMaintenanceApp("/delivery/webhooks/wipay"), null);
});

Deno.test("classifyMaintenanceApp path heuristics", () => {
  assertEquals(classifyMaintenanceApp("/delivery/courier/offers"), "courier");
  assertEquals(classifyMaintenanceApp("/delivery/orders/x/accept-delivery"), "courier");
  assertEquals(classifyMaintenanceApp("/delivery/merchant/orders"), "partner");
  assertEquals(classifyMaintenanceApp("/delivery/merchants"), "customer");
  assertEquals(classifyMaintenanceApp("/delivery/orders"), "customer");
  assertEquals(classifyMaintenanceApp("/delivery/customer/account"), "customer");
});

Deno.test("classifyMaintenanceApp respects x-roam-app header", () => {
  assertEquals(classifyMaintenanceApp("/delivery/orders/x/status", "partner"), "partner");
  assertEquals(classifyMaintenanceApp("/delivery/orders/x/status", "courier"), "courier");
});
