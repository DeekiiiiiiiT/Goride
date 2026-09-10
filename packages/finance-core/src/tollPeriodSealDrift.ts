/**
 * Read-only: does period toll_* disagree with an independent toll seal?
 * Used by Close Week prepare metrics before seal→rebuild sync.
 */
import { CLOSE_INVARIANT_EPS } from './closeInvariants.ts';

export function tollPeriodDisagreesWithSeal(
  period: { tollSpend: number; tollChargedToDriver: number },
  seal: { totalSpend: number; chargedToDriver: number },
  eps: number = CLOSE_INVARIANT_EPS,
): boolean {
  return (
    Math.abs((Number(period.tollSpend) || 0) - (Number(seal.totalSpend) || 0)) > eps ||
    Math.abs((Number(period.tollChargedToDriver) || 0) - (Number(seal.chargedToDriver) || 0)) > eps
  );
}

/** Count drivers with period↔seal toll drift (null seal skipped). */
export function countTollPeriodSealDrift(
  rows: Array<{
    tollSpend: number;
    tollChargedToDriver: number;
    sealSpend: number | null;
    sealCharged: number | null;
  }>,
  eps: number = CLOSE_INVARIANT_EPS,
): number {
  let n = 0;
  for (const r of rows) {
    if (r.sealSpend == null || r.sealCharged == null) continue;
    if (
      tollPeriodDisagreesWithSeal(
        { tollSpend: r.tollSpend, tollChargedToDriver: r.tollChargedToDriver },
        { totalSpend: r.sealSpend, chargedToDriver: r.sealCharged },
        eps,
      )
    ) {
      n += 1;
    }
  }
  return n;
}
