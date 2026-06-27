import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { toBaseQty } from "./uomService.ts";

export type LedgerEntryInput = {
  nodeId: string;
  itemId: string;
  qty: number;
  uomId: string;
  transactionType: string;
  referenceType?: string;
  referenceId?: string;
  unitCostBase?: number;
  idempotencyKey?: string;
  createdBy?: string;
};

export async function appendLedgerEntry(
  sb: SupabaseClient,
  input: LedgerEntryInput,
): Promise<void> {
  const quantityBase = await toBaseQty(sb, input.itemId, input.qty, input.uomId);

  const { error } = await sb.from("inventory_ledger").insert({
    node_id: input.nodeId,
    item_id: input.itemId,
    quantity: input.qty,
    uom_id: input.uomId,
    quantity_base: quantityBase,
    transaction_type: input.transactionType,
    reference_type: input.referenceType ?? null,
    reference_id: input.referenceId ?? null,
    unit_cost_base: input.unitCostBase ?? null,
    idempotency_key: input.idempotencyKey ?? null,
    created_by: input.createdBy ?? null,
  });

  if (error) {
    if (error.code === "23505" && input.idempotencyKey) return;
    throw error;
  }
}

export async function getBalance(
  sb: SupabaseClient,
  nodeId: string,
  itemId: string,
): Promise<number> {
  const { data } = await sb
    .from("inventory_balances")
    .select("quantity_base")
    .eq("node_id", nodeId)
    .eq("item_id", itemId)
    .maybeSingle();

  return Number((data as Record<string, unknown> | null)?.quantity_base ?? 0);
}
