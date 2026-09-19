/**
 * Route fuel-log Edit away from silent no-op money forms (audit A3).
 */
import type { FuelEntry } from '../types/fuel';
import type { FinancialTransaction } from '../types/data';
import { isAwaitingCashStatement, isAwaitingCashTx } from '@roam/fuel-core';

function metaOf(e: FuelEntry): Record<string, unknown> {
  return (e.metadata || {}) as Record<string, unknown>;
}

function fillGroupIdOf(e: FuelEntry): string {
  const g = metaOf(e).fillGroupId;
  return typeof g === 'string' ? g.trim() : '';
}

function metaFlagOn(v: unknown): boolean {
  return v === true || v === 'true' || v === 1 || v === '1';
}

export type FuelLogEditGate =
  | { kind: 'edit' }
  | { kind: 'resolve_split_cash'; fillGroupId: string }
  | { kind: 'awaiting_card_readonly'; reason: string };

/**
 * Classify what Edit should do for a Transaction Logs row.
 * Pass sibling entries in the same fill group when available.
 */
export function classifyFuelLogEdit(
  entry: FuelEntry,
  siblings: FuelEntry[] = [],
): FuelLogEditGate {
  const group = siblings.length > 0 ? siblings : [entry];
  const cashLeg =
    group.find((e) => metaOf(e).splitRole === 'cash') ||
    group.find((e) => metaOf(e).splitVolumeOwner === true) ||
    (isAwaitingCashStatement(metaOf(entry)) ? entry : undefined);

  if (cashLeg && isAwaitingCashStatement(metaOf(cashLeg))) {
    const gid = fillGroupIdOf(cashLeg) || fillGroupIdOf(entry);
    if (gid) return { kind: 'resolve_split_cash', fillGroupId: gid };
  }

  const cardLeg =
    group.find((e) => metaOf(e).splitRole === 'card') ||
    (metaFlagOn(metaOf(entry).awaitingCardStatement) ||
    (entry.paymentSource === 'Gas_Card' && Number(entry.amount) === 0)
      ? entry
      : undefined);

  if (cardLeg && metaFlagOn(metaOf(cardLeg).awaitingCardStatement)) {
    return {
      kind: 'awaiting_card_readonly',
      reason:
        'Amount and liters come from the card statement. Physical facts (odometer, date, vehicle) stay locked until match.',
    };
  }

  // Lone Gas Card $0 anchor awaiting statement (not necessarily split)
  if (
    entry.paymentSource === 'Gas_Card' &&
    Number(entry.amount) === 0 &&
    (metaFlagOn(metaOf(entry).awaitingCardStatement) || entry.entryMode === 'Anchor')
  ) {
    return {
      kind: 'awaiting_card_readonly',
      reason:
        'Amount and liters come from the card statement. Physical facts (odometer, date, vehicle) stay locked until match.',
    };
  }

  return { kind: 'edit' };
}

/** Find the awaiting-cash financial tx for a fill group (Resolve dialog input). */
export function findAwaitingCashTxForFillGroup(
  transactions: FinancialTransaction[],
  fillGroupId: string,
): FinancialTransaction | null {
  const gid = String(fillGroupId || '').trim();
  if (!gid) return null;
  return (
    transactions.find(
      (t) =>
        String(t.metadata?.fillGroupId || '') === gid &&
        isAwaitingCashTx({
          status: t.status,
          metadata: t.metadata as Record<string, unknown>,
        }),
    ) ||
    transactions.find((t) => String(t.metadata?.fillGroupId || '') === gid) ||
    null
  );
}

export function entryHasAwaitingSplitCash(
  entry: FuelEntry,
  siblings: FuelEntry[] = [],
): boolean {
  return classifyFuelLogEdit(entry, siblings).kind === 'resolve_split_cash';
}
