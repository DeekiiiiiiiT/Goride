/**
 * Client mirror of server aggregateFinalizedForWeek (NEW-5) — keep money fields honest.
 */
export function aggregateFinalizedForWeek(snaps: Array<Record<string, unknown>>) {
  let totalSpend = 0;
  let gasCardSpend = 0;
  let cashFromEarnings = 0;
  let companyShare = 0;
  let driverShare = 0;
  let unexplained = 0;
  const vehicles = new Set<string>();
  const drivers = new Set<string>();

  for (const s of snaps) {
    const spend = Number(s.totalGasCardCost) || 0;
    totalSpend += spend;
    const gas = Number(s.gasCardSpend);
    const cash = Number(s.driverSpend);
    if (Number.isFinite(gas) && gas >= 0) gasCardSpend += gas;
    else gasCardSpend += spend;
    if (Number.isFinite(cash) && cash >= 0) cashFromEarnings += cash;
    companyShare += Number(s.companyShare) || 0;
    driverShare += Number(s.driverShare) || 0;
    unexplained += Number(s.miscellaneousCost) || 0;
    if (s.vehicleId) vehicles.add(String(s.vehicleId));
    if (s.driverId) drivers.add(String(s.driverId));
  }

  // Fallback only when neither split field was present on any snap
  if (cashFromEarnings === 0 && gasCardSpend === 0 && totalSpend > 0) {
    gasCardSpend = totalSpend;
  }

  return {
    total_spend: totalSpend,
    gas_card_spend: gasCardSpend,
    cash_from_earnings: cashFromEarnings,
    company_share: companyShare,
    driver_share: driverShare,
    unexplained,
    vehicle_count: vehicles.size,
    driver_count: drivers.size,
  };
}
