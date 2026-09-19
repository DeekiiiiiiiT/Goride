import { describe, expect, it } from 'vitest';
import { validateGasCardCreateGates } from './gasCardCreateGates';

const okBase = {
  assignedGasCard: { id: 'card-1' },
  gasCardLookupDone: true,
  matchedStationId: 'st-1',
  odometer: 184476,
  hasOdometerPhoto: true,
};

describe('validateGasCardCreateGates', () => {
  it('passes when all gates are satisfied', () => {
    expect(validateGasCardCreateGates(okBase)).toEqual({ ok: true });
  });

  it('fails while card lookup is in progress', () => {
    const r = validateGasCardCreateGates({ ...okBase, gasCardLookupDone: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Looking up/i);
  });

  it('fails when no Active card is assigned', () => {
    const r = validateGasCardCreateGates({ ...okBase, assignedGasCard: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/No Active gas card/i);
  });

  it('fails when odometer is missing or zero', () => {
    expect(validateGasCardCreateGates({ ...okBase, odometer: 0 }).ok).toBe(false);
    expect(validateGasCardCreateGates({ ...okBase, odometer: '' }).ok).toBe(false);
    expect(validateGasCardCreateGates({ ...okBase, odometer: null }).ok).toBe(false);
  });

  it('fails when odometer photo is missing', () => {
    const r = validateGasCardCreateGates({ ...okBase, hasOdometerPhoto: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Odometer photo/i);
  });

  it('fails when verified station is missing', () => {
    const r = validateGasCardCreateGates({ ...okBase, matchedStationId: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/verified station/i);
  });
});
