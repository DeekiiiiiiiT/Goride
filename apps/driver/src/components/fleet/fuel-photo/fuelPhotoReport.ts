/**
 * FO-15: problems in the fuel flow report themselves, tagged with the step, so a hang like
 * 25 Nov (Kenny's phone) shows up the first time it happens. Warnings only, never blocking.
 */
import * as Sentry from '@sentry/capacitor';

export type FuelPhotoStepName =
  | 'gps'
  | 'odometer_read'
  | 'pump_read'
  | 'gas_card_lookup'
  | 'camera'
  | 'resume'
  | 'save';

export function reportFuelStep(step: FuelPhotoStepName, reason: string, extra?: Record<string, unknown>): void {
  try {
    Sentry.withScope((scope) => {
      scope.setLevel('warning');
      scope.setTag('flow', 'fuel_photo_first');
      scope.setTag('fuel_step', step);
      if (extra) scope.setExtras(extra);
      Sentry.captureMessage(`fuel_step_${step}: ${reason}`);
    });
  } catch {
    /* Sentry off (no DSN) */
  }
}
