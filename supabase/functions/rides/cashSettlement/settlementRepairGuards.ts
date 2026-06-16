import type { JournalLineSpec } from "./buildJournalEntries.ts";

/** Journal entry types that indicate split settlement (not legacy underpay-only). */
export const SPLIT_JOURNAL_ENTRY_TYPES = [
  "wallet_fare_from_rider",
  "wallet_fare_to_driver",
  "platform_fare_guarantee",
] as const;

export function hasSplitJournalEvidence(existingTypes: Set<string>): boolean {
  return SPLIT_JOURNAL_ENTRY_TYPES.some((t) => existingTypes.has(t));
}

/** Legacy V2 repair must not run on split trips or add arrears after wallet fare. */
export function shouldSkipLegacySettlementRepair(params: {
  outcome: string;
  existingTypes: Set<string>;
}): boolean {
  if (params.outcome === "split") return true;
  return hasSplitJournalEvidence(params.existingTypes);
}

export function filterLegacyRepairMissingLines(
  lines: JournalLineSpec[],
  existingTypes: Set<string>,
): JournalLineSpec[] {
  return lines.filter((line) => {
    if (existingTypes.has(line.entry_type)) return false;
    if (line.entry_type === "cash_trip_arrears" && existingTypes.has("wallet_fare_from_rider")) {
      return false;
    }
    return true;
  });
}

/**
 * Split repair must never debit the rider twice (wallet_fare + arrears for same gap).
 * When arrears already posted, only driver-credit lines may be inserted.
 */
export function filterSplitRepairMissingLines(
  lines: JournalLineSpec[],
  existingTypes: Set<string>,
): JournalLineSpec[] {
  const hasWalletFare = existingTypes.has("wallet_fare_from_rider");
  const hasArrears = existingTypes.has("cash_trip_arrears");

  return lines.filter((line) => {
    if (existingTypes.has(line.entry_type)) return false;
    if (line.entry_type === "wallet_fare_from_rider" && hasArrears) return false;
    if (line.entry_type === "cash_trip_arrears") return false;
    if (line.entry_type === "wallet_fare_from_rider" && hasWalletFare) return false;
    return true;
  });
}

/** Rider shortfall display: wallet collection + company receivable must not exceed gap. */
export function reconcileRiderShortfallDisplay(params: {
  owedMinor: number;
  cashReceivedMinor: number;
  walletPaidMinor: number;
  arrearsMinor: number;
}): { wallet_paid_minor: number; rider_arrears_minor: number } {
  const shortfall = Math.max(0, params.owedMinor - params.cashReceivedMinor);
  let walletPaid = Math.max(0, Math.floor(params.walletPaidMinor));
  let riderArrears = Math.max(0, Math.floor(params.arrearsMinor));

  if (shortfall <= 0) {
    return { wallet_paid_minor: 0, rider_arrears_minor: 0 };
  }

  if (walletPaid + riderArrears > shortfall) {
    if (walletPaid > 0) {
      riderArrears = Math.max(0, shortfall - walletPaid);
    } else {
      walletPaid = Math.max(0, shortfall - riderArrears);
    }
  }

  return { wallet_paid_minor: walletPaid, rider_arrears_minor: riderArrears };
}
