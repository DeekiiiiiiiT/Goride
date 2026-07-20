import type { FuelEntry } from '../types/fuel';

export type FuelEntrySource =
  | 'driver-portal'
  | 'admin-manual'
  | 'admin-edit'
  | 'bulk-import'
  | 'fuel-card';

const AUTH_SOURCES: FuelEntrySource[] = [
  'driver-portal',
  'admin-manual',
  'admin-edit',
  'bulk-import',
  'fuel-card',
];

function asAuthSource(value: unknown): FuelEntrySource | null {
  if (typeof value !== 'string') return null;
  return (AUTH_SOURCES as string[]).includes(value) ? (value as FuelEntrySource) : null;
}

/**
 * Who authored the fuel log line — not payment style.
 * `metadata.isManual` / `portal_type` mean cash-style fill-up, NOT admin authorship.
 */
export function resolveFuelEntrySource(entry: FuelEntry): FuelEntrySource {
  const explicit =
    asAuthSource(entry.entrySource) || asAuthSource(entry.metadata?.entrySource);
  if (explicit) return explicit;

  const metaSource = entry.metadata?.source;
  if (metaSource === 'Bulk Manual' || metaSource === 'Bulk Log') return 'bulk-import';
  // SubmitExpenseModal stamps source: 'Manual' — true admin create
  if (metaSource === 'Manual') return 'admin-manual';

  if (entry.type === 'Card_Transaction') return 'fuel-card';

  const topSource = (entry as FuelEntry & { source?: string }).source;
  // Posted from approved driver expense (guarantee) — not admin-authored
  if (
    topSource === 'Manual Approval' ||
    metaSource === 'Manual Approval' ||
    entry.type === 'Reimbursement'
  ) {
    return 'driver-portal';
  }

  const isFromPortal =
    topSource === 'Driver Portal' ||
    entry.type === 'Manual_Entry' ||
    entry.geofenceMetadata != null;

  if (isFromPortal) {
    // Real admin edit signals only — never isManual (cash flag)
    const wasAdminEdited =
      entry.metadata?.isEdited === true ||
      entry.metadata?.previousPaymentSource != null;
    return wasAdminEdited ? 'admin-edit' : 'driver-portal';
  }

  // Legacy admin Fuel Log modal: Fuel_Manual_Entry + source Fuel Log (guarantee uses Reimbursement)
  if (
    entry.type === 'Fuel_Manual_Entry' &&
    (metaSource === 'Fuel Log' || topSource === 'Fuel Log')
  ) {
    return 'admin-manual';
  }

  // Prefer Portal over false Admin when authorship is unknown
  return 'driver-portal';
}

/** Authorship for a financial tx about to become a posted fuel_entry. */
export function resolveAuthorshipFromTransaction(tx: {
  entrySource?: string;
  type?: string;
  metadata?: Record<string, unknown> | null;
}): FuelEntrySource {
  const m = tx.metadata || {};
  const explicit =
    asAuthSource(tx.entrySource) || asAuthSource(m.entrySource);
  if (explicit) return explicit;

  const src = m.source;
  if (src === 'Bulk Manual' || src === 'Bulk Log') return 'bulk-import';
  if (src === 'Manual') return 'admin-manual';
  // Admin Fuel Log modal (not cash isManual — that flag is payment style)
  if (tx.type === 'Fuel_Manual_Entry' && src === 'Fuel Log') {
    return 'admin-manual';
  }

  return 'driver-portal';
}
