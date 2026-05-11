import { toast } from "sonner@2.0.3";
import { VEHICLE_PENDING_CATALOG_ERROR_CODE } from "./vehicleCatalogGate";

type GateLikeError = {
  code?: string;
  status?: number;
  details?: { code?: string; vehicleId?: string; catalogStatus?: string; error?: string } | null;
  message?: string;
};

export function isCatalogGateError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as GateLikeError;
  if (e.code === VEHICLE_PENDING_CATALOG_ERROR_CODE) return true;
  if (e.details?.code === VEHICLE_PENDING_CATALOG_ERROR_CODE) return true;
  return false;
}

export function showCatalogGateToastIfApplicable(
  err: unknown,
  opts?: { actionLabel?: string; onAction?: () => void },
): boolean {
  if (!isCatalogGateError(err)) return false;
  const e = err as GateLikeError;
  const message = e.details?.error || e.message || "This vehicle is pending catalog approval.";
  toast.warning(message, {
    description:
      "A platform admin must approve the motor type before this action is allowed. The vehicle remains parked until then.",
    duration: 8000,
    action: opts?.actionLabel && opts.onAction ? { label: opts.actionLabel, onClick: opts.onAction } : undefined,
  });
  return true;
}

export async function runWithCatalogGateToast<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    showCatalogGateToastIfApplicable(err);
    throw err;
  }
}