import { FUEL_SPEND_EPS } from './fuelMoneyEpsilon';

export type FuelLeakageKind = 'high' | 'minor' | 'savings' | 'balanced';

export type FuelLeakageDisplay = {
  kind: FuelLeakageKind;
  colorClass: string;
  label: string;
  icon: 'alert' | 'minus' | 'trend-down' | 'check';
};

/** Color + text + icon for Misc / Leakage so the column is not color-only. */
export function getLeakageDisplay(val: number): FuelLeakageDisplay {
  const n = Number(val) || 0;
  if (n > 50) {
    return { kind: 'high', colorClass: 'text-red-600 font-bold', label: 'High leakage', icon: 'alert' };
  }
  if (n > FUEL_SPEND_EPS) {
    return { kind: 'minor', colorClass: 'text-amber-600', label: 'Minor leakage', icon: 'minus' };
  }
  if (n < -FUEL_SPEND_EPS) {
    return { kind: 'savings', colorClass: 'text-emerald-600', label: 'Savings', icon: 'trend-down' };
  }
  return { kind: 'balanced', colorClass: 'text-slate-600', label: 'Balanced', icon: 'check' };
}
