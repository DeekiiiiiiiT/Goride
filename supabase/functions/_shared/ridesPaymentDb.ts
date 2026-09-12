/**
 * Wallet / payment journal DB access with hosted fallback (public views).
 */
import { createClient, type PostgrestError, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type RidesPaymentTables = {
  accounts: string;
  journal: string;
  obligations: string;
};

type Resolved = {
  db: SupabaseClient;
  tables: RidesPaymentTables;
};

const NATIVE: RidesPaymentTables = {
  accounts: "payment_accounts",
  journal: "payment_journal_entries",
  obligations: "payment_obligations",
};

const PUBLIC_VIEWS: RidesPaymentTables = {
  accounts: "rides_payment_accounts",
  journal: "rides_payment_journal_entries",
  obligations: "rides_payment_obligations",
};

let resolved: Resolved | null = null;
let testOverride: Resolved | null = null;

/** Test-only: inject an in-memory client instead of probing Supabase. */
export function setRidesPaymentDbOverrideForTests(override: Resolved | null): void {
  testOverride = override;
  resolved = null;
}

/** Test-only: clear cached resolution between tests. */
export function resetRidesPaymentDbForTests(): void {
  testOverride = null;
  resolved = null;
}

function serviceClient(schema: string): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { db: { schema } },
  );
}

function isMissingTableError(error: PostgrestError | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST205") return true;
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("schema cache") ||
    msg.includes("could not find the table") ||
    msg.includes("schema must be one of")
  );
}

/** Table exists in schema cache but role cannot use it — must try public views. */
function isUnusableTableError(error: PostgrestError | null): boolean {
  if (!error) return false;
  if (isMissingTableError(error)) return true;
  const msg = (error.message ?? "").toLowerCase();
  const code = String(error.code ?? "");
  // Postgres 42501 + PostgREST wrappers — native rides.* often lacks GRANTs;
  // public.rides_payment_* views are the granted path (see 20260620120002).
  return (
    code === "42501" ||
    msg.includes("permission denied") ||
    msg.includes("insufficient_privilege")
  );
}

async function probe(schema: string, table: string): Promise<PostgrestError | null> {
  const db = serviceClient(schema);
  const { error } = await db.from(table).select("id").limit(1);
  return error;
}

/** Resolve once per isolate; tries rides schema then public views. */
export async function getRidesPaymentDb(): Promise<Resolved> {
  if (testOverride) return testOverride;
  if (resolved) return resolved;

  const ridesErr = await probe("rides", NATIVE.accounts);
  // Only bind rides.* when the probe fully succeeds — permission denied used to
  // look "not missing" and permanently poison the isolate onto an unreadable table.
  if (!ridesErr) {
    resolved = { db: serviceClient("rides"), tables: NATIVE };
    return resolved;
  }
  if (!isUnusableTableError(ridesErr)) {
    // Unexpected error (network, auth, etc.) — still try public before giving up.
    console.warn(
      `[ridesPaymentDb] rides.${NATIVE.accounts} probe failed (${ridesErr.code}: ${ridesErr.message}); trying public views`,
    );
  }

  const publicErr = await probe("public", PUBLIC_VIEWS.accounts);
  if (!publicErr) {
    resolved = { db: serviceClient("public"), tables: PUBLIC_VIEWS };
    return resolved;
  }
  if (!isUnusableTableError(publicErr)) {
    throw new Error(
      `Payment wallet tables probe failed on public.${PUBLIC_VIEWS.accounts}: ${publicErr.message}`,
    );
  }

  throw new Error(
    "Payment wallet tables are not available. Run migration 20260620120002_payment_accounts_public_views.sql " +
      "or expose the rides schema in Supabase API settings and GRANT service_role on rides.payment_accounts.",
  );
}
