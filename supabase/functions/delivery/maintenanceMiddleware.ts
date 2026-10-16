/**
 * Rush per-app maintenance gate for the delivery edge function.
 * Fail-open on read errors (platform.maintenance.* onReadError: safe → not active).
 */
import type { MiddlewareHandler } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { getSetting } from "../_shared/rushSettings/getSetting.ts";

export type MaintenanceApp = "customer" | "courier" | "partner";

type MaintenanceValue = {
  active?: boolean;
  message?: string;
  until?: string | null;
};

function isExemptPath(path: string): boolean {
  const p = path.toLowerCase();
  return (
    p.includes("/admin/") ||
    p.includes("/app-config") ||
    p.includes("/internal/") ||
    p.includes("/webhook") ||
    p.includes("/health") ||
    p.includes("/cron") ||
    p.endsWith("/health") ||
    p.endsWith("/ready")
  );
}

/** Path / header heuristics when apps have not yet sent x-roam-app (Phase 4). */
export function classifyMaintenanceApp(
  path: string,
  headerApp?: string | null,
  hints?: { stationDevice?: string | null },
): MaintenanceApp | null {
  if (isExemptPath(path)) return null;

  const hdr = String(headerApp || "").trim().toLowerCase();
  if (hdr === "customer" || hdr === "courier" || hdr === "partner") return hdr;

  const p = path.toLowerCase();

  if (p.includes("/courier")) return "courier";
  if (p.includes("/accept-delivery") || p.includes("/courier-location")) return "courier";

  // Partner (singular /merchant) — not public /merchants discovery
  if (/(^|\/)merchant(\/|$)/.test(p) && !p.includes("/merchants")) return "partner";
  if (p.includes("/station")) return "partner";
  // Station device updating order status
  if (hints?.stationDevice && p.includes("/orders/")) return "partner";

  if (
    p.includes("/customer") ||
    p.includes("/merchants") ||
    p.includes("/rush-pass") ||
    p.includes("/discovery")
  ) {
    return "customer";
  }

  // Place order: POST /orders (no further segment) — customer
  if (/\/orders\/?$/.test(p.split("?")[0] ?? p)) return "customer";

  return null;
}

function settingKeyForApp(app: MaintenanceApp): string {
  return `platform.maintenance.${app}`;
}

export function rushMaintenanceMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const path = c.req.path;
    const app = classifyMaintenanceApp(path, c.req.header("x-roam-app"), {
      stationDevice: c.req.header("X-Station-Device-Token"),
    });
    if (!app) return next();

    try {
      const maint = await getSetting<MaintenanceValue>(settingKeyForApp(app));
      if (maint?.active === true) {
        const until = maint.until ? new Date(maint.until).getTime() : null;
        if (until != null && Number.isFinite(until) && until < Date.now()) {
          return next();
        }
        return c.json(
          {
            error: "Platform is under maintenance. Please try again later.",
            maintenanceMode: true,
            maintenanceMessage:
              maint.message ||
              "We're performing scheduled maintenance. Back soon!",
            app,
          },
          503,
        );
      }
    } catch (e) {
      console.log(
        `[RushMaintenance] read failed, failing open: ${(e as Error).message}`,
      );
    }
    return next();
  };
}
