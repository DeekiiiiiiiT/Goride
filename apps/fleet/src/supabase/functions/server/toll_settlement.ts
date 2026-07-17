/**
 * Toll settlement persistence — SQL RPCs with KV mirror fallback.
 * When correct_toll_settlement_order is off, callers should skip writes.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { isFeatureEnabled, FEATURE_FLAGS } from "./feature_flags.ts";
import {
  activeSettlementCredits,
  clampSettlementApply,
  remainingTollShortfall,
  settlementIdempotencyKey,
  type SettlementAllocationLike,
  type SettlementSourceType,
  SETTLEMENT_TOLERANCE,
} from "../../../utils/tollSettlement.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const KV_PREFIX = "toll_alloc:";
const KV_IDEM_PREFIX = "toll_alloc_idem:";

export type ApplyAllocationInput = {
  sourceType: Exclude<SettlementSourceType, "reversal">;
  sourceId: string;
  tollId: string;
  claimId?: string | null;
  amount: number;
  tollCost: number;
  tollPeriodAnchor?: string | null;
  actor?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  /** Override deterministic key when stacking multiple applies from one source. */
  idempotencyKey?: string;
};

export async function isCorrectSettlementOrderEnabled(orgId?: string | null): Promise<boolean> {
  // Product default ON when the flag row has never been created — emergency
  // disable still works once the flag exists with enabled:false.
  const existing = await kv.get(`feature_flag:${FEATURE_FLAGS.CORRECT_TOLL_SETTLEMENT_ORDER}`);
  if (!existing) return true;
  return isFeatureEnabled(FEATURE_FLAGS.CORRECT_TOLL_SETTLEMENT_ORDER, orgId);
}

function rowToLike(row: any): SettlementAllocationLike {
  return {
    id: row.id ? String(row.id) : undefined,
    sourceType: row.source_type || row.sourceType,
    sourceId: String(row.source_id || row.sourceId || ""),
    tollId: String(row.toll_id || row.tollId || ""),
    claimId: row.claim_id ?? row.claimId ?? null,
    amount: Math.abs(Number(row.amount) || 0),
    reversesId: row.reverses_id ?? row.reversesId ?? null,
    idempotencyKey: row.idempotency_key || row.idempotencyKey,
  };
}

async function loadKvAllocationsForToll(tollId: string): Promise<SettlementAllocationLike[]> {
  const all = (await kv.getByPrefix(KV_PREFIX)) || [];
  return all
    .filter((a: any) => a && String(a.tollId) === String(tollId))
    .map((a: any) => rowToLike({
      id: a.id,
      source_type: a.sourceType,
      source_id: a.sourceId,
      toll_id: a.tollId,
      claim_id: a.claimId,
      amount: a.amount,
      reverses_id: a.reversesId,
      idempotency_key: a.idempotencyKey,
    }));
}

export async function loadAllocationsForToll(tollId: string): Promise<SettlementAllocationLike[]> {
  try {
    const { data, error } = await supabase
      .from("toll_settlement_allocations")
      .select("*")
      .eq("toll_id", tollId);
    if (!error && Array.isArray(data)) {
      return data.map(rowToLike);
    }
  } catch {
    // table missing during rollout — fall through to KV
  }
  return loadKvAllocationsForToll(tollId);
}

export async function getRemainingShortfall(tollId: string, tollCost: number): Promise<number> {
  const allocs = await loadAllocationsForToll(tollId);
  return remainingTollShortfall(tollCost, allocs, tollId);
}

async function mirrorKvAllocation(record: Record<string, unknown>): Promise<void> {
  const id = String(record.id);
  const idem = String(record.idempotencyKey || "");
  await kv.set(`${KV_PREFIX}${id}`, record);
  if (idem) await kv.set(`${KV_IDEM_PREFIX}${idem}`, { id });
}

/** Apply a credit allocation. Idempotent. Caps to remaining when softCap is true. */
export async function applySettlementAllocation(
  input: ApplyAllocationInput,
  opts?: { softCap?: boolean; rejectOverAllocation?: boolean },
): Promise<
  | { ok: true; duplicate: boolean; allocation: SettlementAllocationLike; remainingAfter: number; applyAmount: number }
  | { ok: false; error: string; status: number }
> {
  const softCap = opts?.softCap !== false;
  const rejectOver = opts?.rejectOverAllocation === true;
  const idem =
    input.idempotencyKey ||
    settlementIdempotencyKey(input.sourceType, input.sourceId, input.tollId, input.amount);

  const existing = await loadAllocationsForToll(input.tollId);
  const clamp = clampSettlementApply(input.tollCost, existing, input.tollId, input.amount);
  if (clamp.applyAmount <= SETTLEMENT_TOLERANCE) {
    return {
      ok: true,
      duplicate: false,
      allocation: {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        tollId: input.tollId,
        amount: 0,
        idempotencyKey: idem,
      },
      remainingAfter: clamp.remainingBefore,
      applyAmount: 0,
    };
  }
  if (clamp.overAllocation && rejectOver && !softCap) {
    return {
      ok: false,
      status: 409,
      error: `over_allocation: ${input.amount} exceeds remaining ${clamp.remainingBefore}`,
    };
  }
  const applyAmount = softCap ? clamp.applyAmount : Math.abs(input.amount);

  // Idempotency via KV first (works even before SQL migration).
  // Reversed rows must NOT satisfy idempotency: a period reset reverses the
  // allocation, and redoing the same apply (same source/toll/amount) has to
  // produce a fresh ACTIVE row — otherwise redone work silently records
  // nothing. Walk the reapply chain to a deterministic next-generation key.
  let effectiveIdem = idem;
  for (let gen = 0; gen < 8; gen++) {
    const pointer = await kv.get(`${KV_IDEM_PREFIX}${effectiveIdem}`);
    if (!pointer?.id) break;
    const prior = await kv.get(`${KV_PREFIX}${pointer.id}`);
    if (!prior) break;
    const priorReversed = existing.some(
      (a) => a.sourceType === "reversal" && String(a.reversesId || "") === String(prior.id),
    );
    if (!priorReversed) {
      return {
        ok: true,
        duplicate: true,
        allocation: rowToLike({
          id: prior.id,
          source_type: prior.sourceType,
          source_id: prior.sourceId,
          toll_id: prior.tollId,
          claim_id: prior.claimId,
          amount: prior.amount,
          idempotency_key: prior.idempotencyKey,
        }),
        remainingAfter: remainingTollShortfall(input.tollCost, existing, input.tollId),
        applyAmount: Math.abs(Number(prior.amount) || 0),
      };
    }
    // Deterministic per reversed generation — a double-click after the same
    // reset lands on the same key and stays idempotent.
    effectiveIdem = `${idem}:reapply:${prior.id}`;
  }

  let sqlAllocation: SettlementAllocationLike | null = null;
  try {
    const { data, error } = await supabase.rpc("toll_settlement_apply", {
      p: {
        source_type: input.sourceType,
        source_id: input.sourceId,
        toll_id: input.tollId,
        claim_id: input.claimId || null,
        amount: applyAmount,
        toll_cost: input.tollCost,
        toll_period_anchor: input.tollPeriodAnchor || null,
        idempotency_key: effectiveIdem,
        actor: input.actor || null,
        notes: input.notes || null,
        metadata: input.metadata || {},
      },
    });
    if (!error && data?.ok && data.allocation) {
      sqlAllocation = rowToLike(data.allocation);
    }
  } catch {
    // SQL unavailable — KV-only path below
  }

  const id = sqlAllocation?.id || `alloc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const record = {
    id,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    tollId: input.tollId,
    claimId: input.claimId || null,
    amount: applyAmount,
    tollPeriodAnchor: input.tollPeriodAnchor || null,
    idempotencyKey: effectiveIdem,
    reversesId: null,
    actor: input.actor || null,
    notes: input.notes || null,
    metadata: input.metadata || {},
    createdAt: new Date().toISOString(),
  };
  await mirrorKvAllocation(record);

  const after = await loadAllocationsForToll(input.tollId);
  return {
    ok: true,
    duplicate: false,
    allocation: rowToLike({
      id,
      source_type: input.sourceType,
      source_id: input.sourceId,
      toll_id: input.tollId,
      claim_id: input.claimId,
      amount: applyAmount,
      idempotency_key: effectiveIdem,
    }),
    remainingAfter: remainingTollShortfall(input.tollCost, after, input.tollId),
    applyAmount,
  };
}

/** Reverse allocations for a source (dispute refund, unlinked trip, etc.). */
export async function reverseSettlementsForSource(
  sourceType: SettlementSourceType,
  sourceId: string,
  opts?: { actor?: string; notes?: string },
): Promise<{ reversed: number; errors: string[] }> {
  let reversed = 0;
  const errors: string[] = [];

  // Prefer SQL reverse by scanning source
  try {
    const { data, error } = await supabase
      .from("toll_settlement_allocations")
      .select("*")
      .eq("source_type", sourceType)
      .eq("source_id", sourceId);
    if (!error && Array.isArray(data)) {
      for (const row of data) {
        if (row.source_type === "reversal") continue;
        try {
          const { error: revErr } = await supabase.rpc("toll_settlement_reverse", {
            p: {
              allocation_id: row.id,
              actor: opts?.actor || "system",
              notes: opts?.notes || null,
            },
          });
          if (revErr) errors.push(revErr.message);
          else reversed++;
        } catch (e: any) {
          errors.push(e?.message || String(e));
        }
      }
    }
  } catch {
    // ignore — KV path
  }

  const all = (await kv.getByPrefix(KV_PREFIX)) || [];
  for (const a of all) {
    if (!a || a.sourceType !== sourceType || String(a.sourceId) !== String(sourceId)) continue;
    if (a.sourceType === "reversal" || a.reversed) continue;
    const revId = `rev-${a.id}`;
    const revKey = `rev:${a.idempotencyKey || a.id}`;
    if (await kv.get(`${KV_IDEM_PREFIX}${revKey}`)) continue;
    const revRecord = {
      id: revId,
      sourceType: "reversal",
      sourceId: a.sourceId,
      tollId: a.tollId,
      claimId: a.claimId || null,
      amount: Math.abs(Number(a.amount) || 0),
      idempotencyKey: revKey,
      reversesId: a.id,
      actor: opts?.actor || "system",
      notes: opts?.notes || null,
      createdAt: new Date().toISOString(),
    };
    await mirrorKvAllocation(revRecord);
    reversed++;
  }

  return { reversed, errors };
}

/** Reverse all active allocations owned by tolls in a period reset. */
export async function reverseSettlementsForTolls(
  tollIds: string[],
  opts?: { actor?: string },
): Promise<{ reversed: number }> {
  let reversed = 0;
  const set = new Set(tollIds.map(String));
  const all = (await kv.getByPrefix(KV_PREFIX)) || [];
  for (const a of all) {
    if (!a || !set.has(String(a.tollId))) continue;
    if (a.sourceType === "reversal") continue;
    const revKey = `rev:period:${a.idempotencyKey || a.id}`;
    if (await kv.get(`${KV_IDEM_PREFIX}${revKey}`)) continue;
    await mirrorKvAllocation({
      id: `rev-${a.id}`,
      sourceType: "reversal",
      sourceId: a.sourceId,
      tollId: a.tollId,
      claimId: a.claimId || null,
      amount: Math.abs(Number(a.amount) || 0),
      idempotencyKey: revKey,
      reversesId: a.id,
      actor: opts?.actor || "period_reset",
      createdAt: new Date().toISOString(),
    });
    reversed++;
    try {
      await supabase.rpc("toll_settlement_reverse", {
        p: { allocation_id: a.id, actor: opts?.actor || "period_reset" },
      });
    } catch {
      // optional SQL
    }
  }
  return { reversed };
}

export async function sumActiveCredits(tollId: string): Promise<number> {
  const allocs = await loadAllocationsForToll(tollId);
  return activeSettlementCredits(allocs, tollId);
}

export {
  SETTLEMENT_TOLERANCE,
  settlementIdempotencyKey,
  projectClaimFromSettlement,
} from "../../../utils/tollSettlement.ts";
