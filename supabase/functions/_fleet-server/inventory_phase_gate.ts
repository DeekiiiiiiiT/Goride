/**
 * Inventory phase feature flags (audit P1). Routes return 403 when phase is off.
 */
import type { Context, Hono } from "npm:hono@4.3.11";
import { isFleetInventoryPhaseEnabled } from "./platform_inventory_flags.ts";
import type { RbacUser } from "./rbac_middleware.ts";

export const INVENTORY_PHASE_OFF_MESSAGE = "This part of Inventory isn't switched on yet";

type InvEnv = { Variables: { rbacUser?: RbacUser } };

export async function inventoryPhaseGuard(
  c: Context<InvEnv>,
  flagName: string,
): Promise<Response | null> {
  const on = await isFleetInventoryPhaseEnabled(flagName);
  if (on) return null;
  return c.json({ error: INVENTORY_PHASE_OFF_MESSAGE }, 403);
}

function pathAfterPrefix(path: string, prefix: string): string {
  if (!path.startsWith(prefix)) return path;
  const rest = path.slice(prefix.length);
  return rest.startsWith("/") ? rest : `/${rest}`;
}

function isAssetDiagnosticsPath(sub: string): boolean {
  return /^\/assets\/[^/]+\/diagnostics\/?$/.test(sub);
}

function isAssetPhasePath(sub: string): boolean {
  if (sub === "/assets" || sub.startsWith("/assets/")) {
    if (isAssetDiagnosticsPath(sub)) return false;
    return true;
  }
  return false;
}

function phase6Path(sub: string): boolean {
  if (sub === "/vendors" || sub.startsWith("/vendors/")) return true;
  if (sub === "/purchase-orders" || sub.startsWith("/purchase-orders/")) return true;
  if (sub === "/reorder" || sub.startsWith("/reorder/")) return true;
  if (sub === "/requisitions" || sub.startsWith("/requisitions/")) return true;
  if (sub === "/finance/post") return true;
  if (sub === "/analytics/procurement-mtd") return true;
  if (sub === "/analytics/vendor-stats") return true;
  return false;
}

function phase7Path(sub: string): boolean {
  if (sub === "/counts" || sub.startsWith("/counts/")) return true;
  if (sub === "/scanners" || sub.startsWith("/scanners/")) return true;
  if (sub === "/analytics/count-accuracy") return true;
  return false;
}

export function registerInventoryPhaseMiddleware(app: Hono<InvEnv>, prefix: string) {
  app.use(`${prefix}/*`, async (c, next) => {
    const sub = pathAfterPrefix(c.req.path, prefix);
    let flag: string | null = null;
    if (isAssetPhasePath(sub)) flag = "fleet_inventory_phase4_assets";
    else if (phase6Path(sub)) flag = "fleet_inventory_phase6_purchasing";
    else if (phase7Path(sub)) flag = "fleet_inventory_phase7_counts";
    else if (isAssetDiagnosticsPath(sub)) flag = "fleet_inventory_phase8_telematics";

    if (flag) {
      const denied = await inventoryPhaseGuard(c, flag);
      if (denied) return denied;
    }
    await next();
  });
  app.use(prefix, async (c, next) => {
    const sub = pathAfterPrefix(c.req.path, prefix);
    if (sub !== "" && sub !== "/") {
      await next();
      return;
    }
    await next();
  });
}

export async function guardInventoryPhase8Diagnostics(
  c: Context<InvEnv>,
): Promise<Response | null> {
  return inventoryPhaseGuard(c, "fleet_inventory_phase8_telematics");
}
