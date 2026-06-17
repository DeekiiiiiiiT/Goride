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
}

const CARD_TRIP_ENTRY_TYPES = ["card_trip_digital_credit"] as const;

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
  const fetchLimit = Math.max(limit, 50);

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

  merged.sort((a, b) => b.date.localeCompare(a.date));
  return merged.slice(0, limit);
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
  };
}
