import type { MaintenanceLogLine } from "../../../../types/maintenance";

export type LogServiceDraftPayload = {
  version: 1;
  savedAt: string;
  step: string;
  formMeta: {
    date: string;
    type: string;
    currency: string;
    odo: number;
    provider: string;
    notes: string;
    invoiceUrl: string;
    id?: string;
  };
  lines: MaintenanceLogLine[];
  logMode: "package" | "quick_job" | "inspect";
  selectedPackageId: string | null;
  selectedSystemId: string | null;
  selectedCategoryIds: string[];
  idempotencyKey: string;
  anomalyAcknowledged: boolean;
};

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function logServiceDraftKey(userId: string, vehicleId: string): string {
  return `roam:fleet:log-service-draft:${userId}:${vehicleId}`;
}

export function readLogServiceDraft(userId: string, vehicleId: string): LogServiceDraftPayload | null {
  if (!userId || !vehicleId) return null;
  try {
    const raw = localStorage.getItem(logServiceDraftKey(userId, vehicleId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LogServiceDraftPayload;
    if (parsed.version !== 1) return null;
    const age = Date.now() - Date.parse(parsed.savedAt);
    if (!Number.isFinite(age) || age > MAX_AGE_MS) {
      localStorage.removeItem(logServiceDraftKey(userId, vehicleId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeLogServiceDraft(userId: string, vehicleId: string, payload: LogServiceDraftPayload): void {
  if (!userId || !vehicleId) return;
  try {
    localStorage.setItem(logServiceDraftKey(userId, vehicleId), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function clearLogServiceDraft(userId: string, vehicleId: string): void {
  if (!userId || !vehicleId) return;
  try {
    localStorage.removeItem(logServiceDraftKey(userId, vehicleId));
  } catch {
    /* ignore */
  }
}
