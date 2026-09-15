import { describe, expect, it } from 'vitest';
import { validateDisposition, FUEL_RESIDUAL_DISPOSITIONS } from './fuelResidualDisposition.ts';

describe('fuelResidualDisposition', () => {
  it('accepts known dispositions with a note', () => {
    const r = validateDisposition({
      disposition: 'missing_litres',
      note: 'No litres on JAA import',
    });
    expect(r.ok).toBe(true);
  });

  it('rejects short notes and unknown codes', () => {
    expect(validateDisposition({ disposition: 'missing_litres', note: 'short' }).ok).toBe(false);
    expect(validateDisposition({ disposition: 'nope', note: 'long enough note' }).ok).toBe(false);
  });

  it('lists the Stage 6 taxonomy', () => {
    expect(FUEL_RESIDUAL_DISPOSITIONS).toContain('accepted_variance');
  });
});
