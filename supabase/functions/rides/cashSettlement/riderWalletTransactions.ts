import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getRidesPaymentDb } from "../../_shared/ridesPaymentDb.ts";
import {
  getAccountByKey,
  listJournalForAccountKey,
  mapJournalRowsForAccount,
  riderWalletTransactionTitle,
} from "../../_shared/paymentAccounts.ts";
import { riderAccountKeyForUser } from "./buildJournalEntries.ts";

export interface RiderWalletTransactionBreakdownLine {
  label: string;
  amount_minor: number;
  entry_type: string;
}

export interface RiderWalletTransactionRow {
  id: string;
  kind: "journal";
  title: string;
  amount_minor: number;
  currency: string;
  date: string;
  is_credit: boolean;
  ride_request_id: string | null;
  entry_type: string;
  breakdown?: RiderWalletTransactionBreakdownLine[];
  source_ids?: string[];
  metadata?: Record<string, unknown>;
}

const CARD_TRIP_ENTRY_TYPES = ["card_trip_digital_credit"] as const;

const TRIP_PAYMENT_ENTRY_TYPES = new Set([
  "wallet_fare_from_rider",
  "card_trip_digital_credit",
]);

function pubRidesClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

async function loadRiderCompletedCardRideIds(
  ridesDb: SupabaseClient,
  riderUserId: string,
  limit: number,
): Promise<string[]> {
  const { data: native, error } = await ridesDb
    .from("ride_requests")
    .select("id")
    .eq("rider_user_id", riderUserId)
    .eq("payment_method", "card")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(limit);

  if (!error && native?.length) {
    return native.map((row) => String(row.id));
  }

  const { data: pub } = await pubRidesClient()
    .from("rides_ride_requests")
    .select("id")
    .eq("rider_user_id", riderUserId)
    .eq("payment_method", "card")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(limit);

  return (pub ?? []).map((row) => String(row.id));
}

async function listCardTripChargeJournalRows(
  rideIds: string[],
  currency: string,
  limit: number,
): Promise<Array<Record<string, unknown>>> {
  if (rideIds.length === 0) return [];

  const { db: client, tables } = await getRidesPaymentDb();
  const { data } = await client
    .from(tables.journal)
    .select("*")
    .in("ride_request_id", rideIds)
    .in("entry_type", [...CARD_TRIP_ENTRY_TYPES])
    .eq("currency", currency)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as Array<Record<string, unknown>>;
}

function breakdownLabel(
  entryType: string,
  metadata?: Record<string, unknown>,
): string {
  if (entryType === "wallet_fare_from_rider") return "Wallet";
  if (entryType === "card_trip_digital_credit") {
    if (metadata?.payment_source === "demo_lynk") return "Lynk";
    return "Card";
  }
  return riderWalletTransactionTitle(entryType, metadata);
}

/** Merge wallet + card portions of the same trip into one rider-visible payment. */
export function consolidateTripPayments(
  rows: RiderWalletTransactionRow[],
): RiderWalletTransactionRow[] {
  const byRide = new Map<string, RiderWalletTransactionRow[]>();
  const standalone: RiderWalletTransactionRow[] = [];

  for (const row of rows) {
    if (row.ride_request_id && TRIP_PAYMENT_ENTRY_TYPES.has(row.entry_type)) {
      const list = byRide.get(row.ride_request_id) ?? [];
      list.push(row);
      byRide.set(row.ride_request_id, list);
    } else {
      standalone.push(row);
    }
  }

  const consolidated: RiderWalletTransactionRow[] = [...standalone];

  for (const [rideId, parts] of byRide) {
    if (parts.length === 1) {
      consolidated.push(parts[0]);
      continue;
    }

    const breakdown: RiderWalletTransactionBreakdownLine[] = parts.map((part) => ({
      label: breakdownLabel(part.entry_type, part.metadata),
      amount_minor: part.amount_minor,
      entry_type: part.entry_type,
    }));

    const totalMinor = breakdown.reduce((sum, line) => sum + line.amount_minor, 0);
    const date = parts.map((part) => part.date).sort((a, b) => b.localeCompare(a))[0];

    consolidated.push({
      id: `trip-payment:${rideId}`,
      kind: "journal",
      title: "Trip payment",
      amount_minor: totalMinor,
      currency: parts[0].currency,
      date,
      is_credit: false,
      ride_request_id: rideId,
      entry_type: "trip_payment",
      breakdown,
      source_ids: parts.map((part) => part.id),
    });
  }

  consolidated.sort((a, b) => b.date.localeCompare(a.date));
  return consolidated;
}

function mapCardTripChargeRow(
  row: Record<string, unknown>,
): RiderWalletTransactionRow {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const entryType = String(row.entry_type ?? "");
  return {
    id: String(row.id),
    kind: "journal",
    title: riderWalletTransactionTitle(entryType, metadata),
    amount_minor: Math.max(0, Math.floor(Number(row.amount_minor ?? 0))),
    currency: String(row.currency ?? "JMD"),
    date: String(row.created_at),
    is_credit: false,
    ride_request_id: row.ride_request_id ? String(row.ride_request_id) : null,
    entry_type: entryType,
    metadata,
  };
}

function mapAccountJournalRow(
  row: ReturnType<typeof mapJournalRowsForAccount>[number],
): RiderWalletTransactionRow {
  return {
    id: row.id,
    kind: "journal",
    title: riderWalletTransactionTitle(row.entry_type, row.metadata),
    amount_minor: row.amount_minor,
    currency: row.currency,
    date: row.created_at,
    is_credit: row.is_credit,
    ride_request_id: row.ride_request_id,
    entry_type: row.entry_type,
    metadata: row.metadata,
  };
}

/** Rider wallet feed: account journal plus card-trip charges (driver-side journal rows). */
export async function listRiderWalletTransactions(
  db: SupabaseClient | undefined,
  riderUserId: string,
  currency: string,
  limit = 50,
): Promise<RiderWalletTransactionRow[]> {
  const accountKey = riderAccountKeyForUser(riderUserId);
  const account = await getAccountByKey(db, accountKey, currency);
  const fetchLimit = Math.max(limit * 2, 50);

  const accountRows = account
    ? mapJournalRowsForAccount(
      String(account.id),
      await listJournalForAccountKey(db, accountKey, currency, fetchLimit),
    ).map(mapAccountJournalRow)
    : [];

  const rideIds = await loadRiderCompletedCardRideIds(db ?? pubRidesClient(), riderUserId, fetchLimit);
  const cardChargeRows = (await listCardTripChargeJournalRows(rideIds, currency, fetchLimit))
    .map(mapCardTripChargeRow);

  const seen = new Set<string>();
  const merged: RiderWalletTransactionRow[] = [];

  for (const row of [...accountRows, ...cardChargeRows]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }

  const consolidated = consolidateTripPayments(merged);
  return consolidated.slice(0, limit);
}

export function riderWalletTransactionToDto(row: RiderWalletTransactionRow): {
  id: string;
  kind: "journal";
  title: string;
  amount_minor: string;
  currency: string;
  date: string;
  is_credit: boolean;
  ride_id?: string;
  entry_type?: string;
  breakdown?: RiderWalletTransactionBreakdownLine[];
} {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    amount_minor: String(row.amount_minor),
    currency: row.currency,
    date: row.date,
    is_credit: row.is_credit,
    ride_id: row.ride_request_id ?? undefined,
    entry_type: row.entry_type,
    breakdown: row.breakdown,
  };
}
