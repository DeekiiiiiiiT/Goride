/**
 * Single money formatter for the fleet app.
 *
 * Lived inside AnalyticsKpiGrid, which meant anything that was not a chart hand-rolled
 * `$${n.toFixed(2)}` instead and rendered US-looking amounts for Jamaican dollars.
 */
export function formatJMD(value: number, decimals = 0): string {
  // Browsers print JMD in the en-JM locale as a bare "$" (looks like US dollars), so the
  // "J$" sign is written here: "J$28,000.00", "-J$5,500.00".
  const n = Number.isFinite(value) ? value : 0;
  const body = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(n));
  const rounded = Number(Math.abs(n).toFixed(decimals));
  return `${n < 0 && rounded !== 0 ? '-' : ''}J$${body}`;
}

/** Same formatting with an explicit +/- so a delta reads as a direction, not a total. */
export function formatJMDDelta(value: number, decimals = 0): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${formatJMD(Math.abs(value), decimals)}`;
}
