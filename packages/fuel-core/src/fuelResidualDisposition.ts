/**
 * Residual disposition taxonomy (Stage 6) — Unexplained step outcomes.
 */

export const FUEL_RESIDUAL_DISPOSITIONS = [
  'missing_odometer',
  'missing_litres',
  'untracked_company_ops',
  'driver_personal_unlogged',
  'suspected_card_misuse',
  'accepted_variance',
] as const;

export type FuelResidualDisposition = (typeof FUEL_RESIDUAL_DISPOSITIONS)[number];

export type FuelResidualDispositionRecord = {
  vehicleId: string;
  weekStart: string;
  disposition: FuelResidualDisposition;
  note: string;
  actorId?: string;
  at: string;
};

export function isFuelResidualDisposition(v: unknown): v is FuelResidualDisposition {
  return (
    typeof v === 'string' &&
    (FUEL_RESIDUAL_DISPOSITIONS as readonly string[]).includes(v)
  );
}

export function validateDisposition(input: {
  disposition: unknown;
  note?: unknown;
  requireNoteMinLength?: number;
}): { ok: true; disposition: FuelResidualDisposition; note: string } | { ok: false; error: string } {
  if (!isFuelResidualDisposition(input.disposition)) {
    return { ok: false, error: 'invalid_disposition' };
  }
  const note = String(input.note || '').trim();
  const min = input.requireNoteMinLength ?? 8;
  if (note.length < min) {
    return { ok: false, error: 'disposition_note_required' };
  }
  return { ok: true, disposition: input.disposition, note };
}
