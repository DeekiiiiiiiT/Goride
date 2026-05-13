/**
 * InDrive wallet fee rules (GET /ledger/driver-indrive-wallet) — same for `ledger:%` and `ledger_event:*` value shapes.
 * Period: [startDate, endDate] inclusive (YYYY-MM-DD). Lifetime: all rows (no date filter on fee totals).
 */
export function computeIndriveWalletFeesFromLedgerEntries(
  entries: ReadonlyArray<Record<string, unknown>>,
  startDate: string,
  endDate: string,
): { periodFees: number; lifetimeInDriveFees: number } {
  const ledgerRowDate = (raw: unknown) =>
    raw != null && typeof raw === 'string' ? String(raw).split('T')[0] : '';

  let platformFeeInDrive = 0;
  let fareGapInDrive = 0;
  let lifetimePlatformFeeInDrive = 0;
  let lifetimeFareGapInDrive = 0;

  for (const e of entries) {
    const plat = (e.platform === 'GoRide' ? 'Roam' : e.platform) || 'Other';
    const net = Number(e.netAmount) || 0;
    const gross = Number(e.grossAmount) || 0;
    const et = e.eventType;
    const d = ledgerRowDate(e.date);
    const inPeriod = d >= startDate && d <= endDate;

    if (et === 'platform_fee' && plat === 'InDrive') {
      const absNet = Math.abs(net);
      lifetimePlatformFeeInDrive += absNet;
      if (inPeriod) platformFeeInDrive += absNet;
    }
    if (et === 'fare_earning' && plat === 'InDrive') {
      const gap = gross - net;
      lifetimeFareGapInDrive += gap;
      if (inPeriod) fareGapInDrive += gap;
    }
  }

  const periodFees = platformFeeInDrive > 0 ? platformFeeInDrive : fareGapInDrive;
  const lifetimeInDriveFees =
    lifetimePlatformFeeInDrive > 0 ? lifetimePlatformFeeInDrive : lifetimeFareGapInDrive;

  return {
    periodFees: Number(periodFees.toFixed(2)),
    lifetimeInDriveFees: Number(lifetimeInDriveFees.toFixed(2)),
  };
}
