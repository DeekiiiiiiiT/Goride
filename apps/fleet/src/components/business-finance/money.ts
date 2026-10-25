/** Display money for Business Finance and Ledgers. */
export { formatMoney } from '@roam/ui/formatMoney';

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
