/**
 * Blended driver-share ratio for a weekly fuel report.
 * Entries carry no category — this ratio is the only way to keep entry-level
 * ledger postings consistent with the category-weighted driverShare.
 */
export function blendedDriverShareRatio(driverShare: number, totalGasCardCost: number): number {
  if (!totalGasCardCost || totalGasCardCost <= 0) return 0;
  return driverShare / totalGasCardCost;
}

export function blendedDriverShareRatioFromReport(report: {
  driverShare?: number;
  totalGasCardCost?: number;
  gasCardSpend?: number;
}): number {
  const cost = Number(report.totalGasCardCost) || Number(report.gasCardSpend) || 0;
  return blendedDriverShareRatio(Number(report.driverShare) || 0, cost);
}
