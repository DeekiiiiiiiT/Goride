/** Fleet Money → Wallet read model (matches GET /ledger/wallet-snapshot). */

export type FleetWalletDriverAmount = {
  driverId: string;
  name: string;
  amount: number;
  amountMinor: number;
};

export type FleetWalletSnapshot = {
  asOf: string;
  period: { start: string; end: string };
  currency: string;
  cashInHand: {
    amount: number;
    amountMinor: number;
    driverCount: number;
    topHolders: FleetWalletDriverAmount[];
  };
  debt: {
    amount: number;
    amountMinor: number;
    driverCount: number;
    topDebtors: FleetWalletDriverAmount[];
  };
  balance: {
    amount: number;
    amountMinor: number;
    byPlatform: { roam: number; uber: number; indrive: number };
    payoutScheduledLabel?: string;
    payoutObserved?: boolean;
    payoutReconciliationGap?: number;
  };
  roamCash: { status: 'coming_soon' };
};

export function emptyFleetWalletSnapshot(
  start: string,
  end: string,
): FleetWalletSnapshot {
  return {
    asOf: new Date().toISOString(),
    period: { start, end },
    currency: 'JMD',
    cashInHand: { amount: 0, amountMinor: 0, driverCount: 0, topHolders: [] },
    debt: { amount: 0, amountMinor: 0, driverCount: 0, topDebtors: [] },
    balance: {
      amount: 0,
      amountMinor: 0,
      byPlatform: { roam: 0, uber: 0, indrive: 0 },
    },
    roamCash: { status: 'coming_soon' },
  };
}
