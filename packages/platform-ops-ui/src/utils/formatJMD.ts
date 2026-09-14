/**
 * Single money formatter for the fleet app.
 *
 * Lived inside AnalyticsKpiGrid, which meant anything that was not a chart hand-rolled
 * `$${n.toFixed(2)}` instead and rendered US-looking amounts for Jamaican dollars.
 */
export function formatJMD(value: number, decimals = 0): string {
  return new Intl.NumberFormat('en-JM', {
    style: 'currency',
    currency: 'JMD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number.isFinite(value) ? value : 0);
}

/** Same formatting with an explicit +/- so a delta reads as a direction, not a total. */
export function formatJMDDelta(value: number, decimals = 0): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${formatJMD(Math.abs(value), decimals)}`;
}
