/**
 * Keep in sync with packages/roam-shared/src/fuel/blendedDriverShareRatio.ts
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
