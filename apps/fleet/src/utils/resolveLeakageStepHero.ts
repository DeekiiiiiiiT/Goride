/**
 * Honest coach-card copy for the leakage-gap wizard step.
 * Money residual and stop-to-stop mileage are separate modes — never claim "all clear" while S2S blocks.
 */
import { FUEL_SPEND_EPS } from './fuelMoneyEpsilon';

export type LeakageStepHeroAction = 'mark_reviewed' | 'fix_stop_to_stop' | null;

export type LeakageStepHero = {
  title: string;
  body: string;
  action: LeakageStepHeroAction;
  /** Under-explained $ still needs disposition + Mark reviewed. */
  showDispositionForm: boolean;
  /** abs(leakage) meaningfully nonzero. */
  moneyResidualActive: boolean;
  /** Under-explained residual awaiting accept. */
  moneyNeedsAccept: boolean;
};

export function resolveLeakageStepHero(input: {
  leakage: number;
  leakageReviewed: boolean;
  stopToStopBlocking: boolean;
  stopToStopSummary?: string | null;
  /** Pre-formatted money string e.g. $12.34 — caller formats. */
  leakageMoneyLabel?: string;
  leakageReviewNote?: string | null;
  leakageReviewBy?: string | null;
  leakageReviewAt?: string | null;
}): LeakageStepHero {
  const leakage = Number(input.leakage) || 0;
  const moneyResidualActive = Math.abs(leakage) > FUEL_SPEND_EPS;
  const underExplained = leakage > FUEL_SPEND_EPS;
  const overExplained = leakage < -FUEL_SPEND_EPS;
  const moneyNeedsAccept = underExplained && !input.leakageReviewed;
  const showDispositionForm = moneyNeedsAccept;
  const moneyLabel = input.leakageMoneyLabel || String(leakage);
  const s2sNote =
    input.stopToStopSummary?.trim() ||
    'Trip/adjustment km still exceed odometer on one or more fill windows.';

  if (moneyNeedsAccept && input.stopToStopBlocking) {
    return {
      title: 'Money leftover and mileage gaps',
      body: `Unexplained fuel ${moneyLabel} still needs Mark reviewed. Also: ${s2sNote}`,
      action: 'mark_reviewed',
      showDispositionForm,
      moneyResidualActive,
      moneyNeedsAccept,
    };
  }

  if (input.stopToStopBlocking && !moneyNeedsAccept) {
    return {
      title: 'Mileage still blocks Finalize',
      body: s2sNote,
      action: 'fix_stop_to_stop',
      showDispositionForm: false,
      moneyResidualActive,
      moneyNeedsAccept: false,
    };
  }

  if (moneyNeedsAccept) {
    return {
      title: 'Review unexplained fuel',
      body: `Unexplained fuel ${moneyLabel} — accept below after you understand the leftover spend.`,
      action: 'mark_reviewed',
      showDispositionForm: true,
      moneyResidualActive,
      moneyNeedsAccept: true,
    };
  }

  if (overExplained && !input.leakageReviewed) {
    return {
      title: 'Review over-explained fuel',
      body: `Over-explained fuel ${moneyLabel} — categorized costs exceed gas-card spend. Fix odometer/trips/policy (cannot accept away).`,
      action: null,
      showDispositionForm: false,
      moneyResidualActive,
      moneyNeedsAccept: false,
    };
  }

  // Money residual accepted or ~0, and S2S not blocking
  if (moneyResidualActive && input.leakageReviewed) {
    const bits = [
      `${overExplained ? 'Over-explained' : 'Unexplained'} fuel ${moneyLabel} accepted`,
    ];
    if (input.leakageReviewNote) bits.push(`“${input.leakageReviewNote}”`);
    if (input.leakageReviewBy) bits.push(`by ${String(input.leakageReviewBy).slice(0, 8)}…`);
    if (input.leakageReviewAt) {
      try {
        bits.push(new Date(input.leakageReviewAt).toLocaleString());
      } catch {
        /* ignore */
      }
    }
    return {
      title: overExplained ? 'Over-explained fuel reviewed' : 'Unexplained fuel reviewed',
      body: `${bits.join(' · ')}. Mileage is clear for Finalize on this check.`,
      action: null,
      showDispositionForm: false,
      moneyResidualActive,
      moneyNeedsAccept: false,
    };
  }

  return {
    title: 'Money clear · mileage clear',
    body: 'No unexplained fuel this week, and stop-to-stop mileage does not block Finalize.',
    action: null,
    showDispositionForm: false,
    moneyResidualActive: false,
    moneyNeedsAccept: false,
  };
}
