export interface CardTripSettlementResult {
  fare_minor: number;
  wallet_paid_minor: number;
  card_charge_minor: number;
}

/** Apply rider wallet balance before charging the selected digital payment method. */
export function computeCardTripSettlement(input: {
  fareMinor: number;
  riderWalletAvailableMinor: number;
}): CardTripSettlementResult {
  const fare = Math.max(0, Math.floor(Number(input.fareMinor) || 0));
  const riderAvailable = Math.max(0, Math.floor(Number(input.riderWalletAvailableMinor) || 0));
  const walletPaid = Math.min(fare, riderAvailable);
  const cardCharge = fare - walletPaid;

  return {
    fare_minor: fare,
    wallet_paid_minor: walletPaid,
    card_charge_minor: cardCharge,
  };
}
