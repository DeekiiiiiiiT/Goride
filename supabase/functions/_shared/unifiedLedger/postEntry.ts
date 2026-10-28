import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type PostEntryResult = {
  inserted?: boolean;
  skipped?: boolean;
  conflict?: boolean;
  entry_id?: string | null;
};

const ORG_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fail closed — null-org ledger rows are invisible to org-scoped reads. */
export function requireOrganizationId(
  value: string | null | undefined,
  context: string,
): string {
  const id = String(value || "").trim();
  if (!ORG_UUID_RE.test(id)) {
    throw new Error(`organization_id required for ${context}`);
  }
  return id;
}

export type PostEntryParams = {
  idempotencyKey: string;
  entryType: string;
  debitAccountKey: string;
  creditAccountKey: string;
  amountMinor: number;
  currency: string;
  requestHash?: string | null;
  /** Required — posts without org never land in week_totals / Settlements. */
  organizationId: string;
  product?: 
    | "roam_rides" | "roam_driver" | "roam_fleet"  // Rideshare
    | "roam_dash" | "roam_partner" | "roam_courier" // Delivery
    | "roam_enterprise"                             // Enterprise freight
    | "platform"                                    // System
    | "rides" | "fleet" | "dash";                  // Legacy (deprecated)
  effectiveAt?: string;
  referenceType?: string | null;
  referenceId?: string | null;
  metadata?: Record<string, unknown>;
  createdByUserId?: string | null;
  sourceSystem?: string | null;
  sourceId?: string | null;
  sourceIdempotencyKey?: string | null;
};

let pubClient: SupabaseClient | null = null;

export function unifiedLedgerClient(): SupabaseClient {
  if (!pubClient) {
    pubClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
  }
  return pubClient;
}

export async function ledgerPostEntry(
  params: PostEntryParams,
): Promise<PostEntryResult> {
  const organizationId = requireOrganizationId(
    params.organizationId,
    `ledgerPostEntry:${params.entryType}`,
  );
  const client = unifiedLedgerClient();
  const { data, error } = await client.rpc("ledger_post_entry", {
    p_idempotency_key: params.idempotencyKey,
    p_entry_type: params.entryType,
    p_debit_account_key: params.debitAccountKey,
    p_credit_account_key: params.creditAccountKey,
    p_amount_minor: params.amountMinor,
    p_currency: params.currency,
    p_request_hash: params.requestHash ?? null,
    p_organization_id: organizationId,
    p_product: params.product ?? "platform",
    p_effective_at: params.effectiveAt ?? new Date().toISOString(),
    p_reference_type: params.referenceType ?? null,
    p_reference_id: params.referenceId ?? null,
    p_metadata: params.metadata ?? {},
    p_created_by_user_id: params.createdByUserId ?? null,
    p_source_system: params.sourceSystem ?? null,
    p_source_id: params.sourceId ?? null,
    p_source_idempotency_key: params.sourceIdempotencyKey ?? null,
  });

  if (error) {
    console.error("[unifiedLedger] post_entry failed:", error.message);
    return { inserted: false, skipped: false, conflict: false };
  }

  return (data ?? {}) as PostEntryResult;
}

/** Convert major currency units (Dash numeric) to minor. */
export function majorToMinor(amount: number): number {
  return Math.round(Number(amount) * 100);
}
