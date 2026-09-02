/**
 * Keyboard queue for FuelPeriodWizard (j/k navigate, a accept, e edit, Enter continue).
 */
import { useEffect } from 'react';
import type { FuelStepId } from '../../../utils/fuelPeriodGating';

export type FuelWizardKeyboardOpts = {
  activeStepId: FuelStepId;
  qualityRowCount: number;
  openDisputeCount: number;
  leakageRowCount: number;
  settlementRowCount: number;
  exceptionBlockerCount: number;
  periodLocked: boolean;
  leakageReviewed: boolean;
  canContinue: boolean;
  isLast: boolean;
  setQueueIndex: (updater: (i: number) => number) => void;
  onMarkLeakageReviewed: () => void;
  onContinue: () => void;
  onEditExceptionAt: (queueIndex: number) => void;
  onOpenQualityRowLogs: (queueIndex: number) => void;
};

export function useFuelWizardKeyboard(opts: FuelWizardKeyboardOpts) {
  const {
    activeStepId,
    qualityRowCount,
    openDisputeCount,
    leakageRowCount,
    settlementRowCount,
    exceptionBlockerCount,
    periodLocked,
    leakageReviewed,
    canContinue,
    isLast,
    setQueueIndex,
    onMarkLeakageReviewed,
    onContinue,
    onEditExceptionAt,
    onOpenQualityRowLogs,
  } = opts;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }
      const queueLen =
        activeStepId === 'data-quality'
          ? qualityRowCount
          : activeStepId === 'adjustments-disputes'
            ? openDisputeCount
            : activeStepId === 'leakage-gap'
              ? leakageRowCount
              : settlementRowCount;
      if (e.key === 'j' && queueLen > 0) {
        e.preventDefault();
        setQueueIndex((i) => (i + 1) % queueLen);
      } else if (e.key === 'k' && queueLen > 0) {
        e.preventDefault();
        setQueueIndex((i) => (i - 1 + queueLen) % queueLen);
      } else if (
        e.key === 'a' &&
        activeStepId === 'leakage-gap' &&
        !periodLocked &&
        !leakageReviewed
      ) {
        e.preventDefault();
        onMarkLeakageReviewed();
      } else if (e.key === 'e' && activeStepId === 'data-quality') {
        e.preventDefault();
        if (exceptionBlockerCount > 0) {
          onEditExceptionAt(0);
        } else {
          onOpenQualityRowLogs(0);
        }
      } else if (e.key === 'Enter' && canContinue && !isLast) {
        e.preventDefault();
        onContinue();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    activeStepId,
    qualityRowCount,
    openDisputeCount,
    leakageRowCount,
    settlementRowCount,
    exceptionBlockerCount,
    periodLocked,
    leakageReviewed,
    canContinue,
    isLast,
    setQueueIndex,
    onMarkLeakageReviewed,
    onContinue,
    onEditExceptionAt,
    onOpenQualityRowLogs,
  ]);
}
