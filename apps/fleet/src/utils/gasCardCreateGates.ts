/**
 * Shared Gas Card create gates — keep Known fill and Driver claim aligned (audit A5).
 */
export type GasCardCreateGateInput = {
  assignedGasCard: { id: string } | null;
  gasCardLookupDone: boolean;
  matchedStationId?: string | null;
  odometer: number | string | null | undefined;
  hasOdometerPhoto: boolean;
};

export type GasCardCreateGateResult =
  | { ok: true }
  | { ok: false; error: string };

export function validateGasCardCreateGates(
  input: GasCardCreateGateInput,
): GasCardCreateGateResult {
  if (!input.gasCardLookupDone) {
    return { ok: false, error: 'Looking up assigned gas card…' };
  }
  if (!input.assignedGasCard) {
    return {
      ok: false,
      error: 'No Active gas card assigned to this vehicle/driver in Card Inventory',
    };
  }
  if (!(Number(input.odometer) > 0)) {
    return { ok: false, error: 'Odometer reading is required' };
  }
  if (!input.hasOdometerPhoto) {
    return { ok: false, error: 'Odometer photo is required for Gas Card fills' };
  }
  if (!String(input.matchedStationId || '').trim()) {
    return { ok: false, error: 'Select a verified station from the Dominion list' };
  }
  return { ok: true };
}
