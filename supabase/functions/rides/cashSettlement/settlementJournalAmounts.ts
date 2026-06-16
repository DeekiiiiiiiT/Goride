import { getRidesPaymentDb } from "../../_shared/ridesPaymentDb.ts";

export interface SettlementJournalAmounts {
  cash_received_minor: number;
  wallet_paid_minor: number;
  arrears_minor: number;
}

/** Read settlement amounts from payment journal when ride columns/snapshot are missing. */
export async function settlementJournalAmountsForRide(
  rideId: string,
): Promise<SettlementJournalAmounts> {
  const { db: client, tables } = await getRidesPaymentDb();
  const { data: rows } = await client
    .from(tables.journal)
    .select("entry_type, amount_minor")
    .eq("ride_request_id", rideId);

  let cash_received_minor = 0;
  let wallet_paid_minor = 0;
  let arrears_minor = 0;

  for (const row of rows ?? []) {
    const type = String(row.entry_type ?? "");
    const amount = Math.max(0, Math.floor(Number(row.amount_minor ?? 0)));
    if (amount <= 0) continue;
    if (type === "cash_trip_collection") {
      cash_received_minor = Math.max(cash_received_minor, amount);
    }
    if (type === "wallet_fare_from_rider") {
      wallet_paid_minor += amount;
    }
    if (type === "cash_trip_arrears") {
      arrears_minor += amount;
    }
  }

  return { cash_received_minor, wallet_paid_minor, arrears_minor };
}
