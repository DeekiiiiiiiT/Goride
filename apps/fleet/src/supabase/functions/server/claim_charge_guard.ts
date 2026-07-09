const VARIANCE_THRESHOLD = 0.05;

export function computeChargeShortfall(
  tollCost: number,
  platformRefund: number,
  claimPaidAmount = 0,
): number {
  const cost = Math.abs(tollCost);
  const platform = Math.abs(platformRefund || 0);
  const paid = Math.abs(claimPaidAmount || 0);

  if (platform > VARIANCE_THRESHOLD) {
    const afterPlatform = Math.max(0, cost - platform);
    const extraCredits = Math.max(0, paid - platform);
    const shortfall = Math.round((afterPlatform - extraCredits) * 100) / 100;
    return shortfall > VARIANCE_THRESHOLD ? shortfall : 0;
  }

  const shortfall = Math.round((cost - paid) * 100) / 100;
  return shortfall > VARIANCE_THRESHOLD ? shortfall : 0;
}

export function isFullTollChargeWhenShortfallRemains(
  chargeAmount: number,
  tollCost: number,
  shortfall: number,
): boolean {
  const charge = Math.abs(chargeAmount);
  const cost = Math.abs(tollCost);
  const owed = Math.abs(shortfall);
  if (owed <= VARIANCE_THRESHOLD) return false;
  if (charge <= owed + VARIANCE_THRESHOLD) return false;
  return charge >= cost - VARIANCE_THRESHOLD && owed < cost - VARIANCE_THRESHOLD;
}

export function guardClaimChargeAmount(input: {
  chargeAmount: number;
  tollCost: number;
  platformRefund?: number;
  claimPaidAmount?: number;
}): { ok: true; amount: number } | { ok: false; message: string; suggestedAmount: number } {
  const tollCost = Math.abs(input.tollCost);
  const shortfall = computeChargeShortfall(
    tollCost,
    input.platformRefund ?? 0,
    input.claimPaidAmount ?? 0,
  );
  const charge = Math.abs(input.chargeAmount);

  if (isFullTollChargeWhenShortfallRemains(charge, tollCost, shortfall)) {
    return {
      ok: false,
      message: `Only $${shortfall.toFixed(2)} is still owed after platform credits — not the full $${tollCost.toFixed(2)} toll.`,
      suggestedAmount: shortfall,
    };
  }

  return { ok: true, amount: charge };
}
