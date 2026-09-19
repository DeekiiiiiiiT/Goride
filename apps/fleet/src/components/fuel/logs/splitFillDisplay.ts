/**
 * Display helpers for Gas Card + Cash grouped fuel log rows.
 */
import type { FuelEntry } from '../../../types/fuel';
import type { FuelLogDisplayRow } from './groupFuelEntriesByFillGroup';

function metaFlagOn(v: unknown): boolean {
  return v === true || v === 'true' || v === 1 || v === '1';
}

export function isPendingSplitEntry(entry: FuelEntry): boolean {
  const gid = entry.metadata?.fillGroupId;
  return typeof gid === 'string' && gid.length > 0;
}

export function splitEntriesHaveMismatch(entries: FuelEntry[]): boolean {
  return entries.some((e) => {
    const m = e.metadata || {};
    return metaFlagOn(m.splitVariance) && !metaFlagOn(m.splitReconciled);
  });
}

export function volumeOwnerEntry(entries: FuelEntry[]): FuelEntry | undefined {
  return (
    entries.find((e) => e.metadata?.splitVolumeOwner === true) ||
    entries.find((e) => e.metadata?.splitRole === 'cash') ||
    entries[0]
  );
}

export function cashSplitEntry(entries: FuelEntry[]): FuelEntry | undefined {
  return entries.find((e) => e.metadata?.splitRole === 'cash');
}

export function cardSplitEntry(entries: FuelEntry[]): FuelEntry | undefined {
  return entries.find((e) => e.metadata?.splitRole === 'card');
}

/** Card leg shown to ops: statement amount when present, else driver claim, else row amount. */
export function cardDisplayAmount(card: FuelEntry | undefined): number {
  if (!card) return 0;
  const m = card.metadata || {};
  if (m.splitStatementAmount != null && Number.isFinite(Number(m.splitStatementAmount))) {
    return Number(m.splitStatementAmount);
  }
  if (m.splitExpectedCardAmount != null && Number.isFinite(Number(m.splitExpectedCardAmount))) {
    return Number(m.splitExpectedCardAmount);
  }
  return Number(card.amount) || 0;
}

export function splitRowDisplayAmount(row: Extract<FuelLogDisplayRow, { kind: 'split' }>): number {
  return Number(row.pumpTotal) || 0;
}

export function splitRowLiters(row: Extract<FuelLogDisplayRow, { kind: 'split' }>): number {
  const owner = volumeOwnerEntry(row.entries);
  return Number(owner?.liters) || 0;
}

export type SplitBreakdown = {
  pumpTotal: number;
  cashAmount: number;
  cardAmount: number;
  expectedCardAmount: number | null;
  statementAmount: number | null;
  derivedCashAmount: number | null;
  varianceDelta: number | null;
  hasMismatch: boolean;
  reconciled: boolean;
  cashPendingStatement: boolean;
};

export function buildSplitBreakdown(entries: FuelEntry[]): SplitBreakdown | null {
  if (!entries.length) return null;
  const cash = cashSplitEntry(entries);
  const card = cardSplitEntry(entries);
  const pumpTotal =
    Number(entries[0]?.metadata?.splitPumpTotal) ||
    (Number(cash?.amount) || 0) + cardDisplayAmount(card);
  const expected =
    card?.metadata?.splitExpectedCardAmount != null
      ? Number(card.metadata.splitExpectedCardAmount)
      : null;
  const statement =
    card?.metadata?.splitStatementAmount != null
      ? Number(card.metadata.splitStatementAmount)
      : null;
  const derived =
    card?.metadata?.splitDerivedCashAmount != null
      ? Number(card.metadata.splitDerivedCashAmount)
      : cash?.metadata?.splitDerivedCashAmount != null
        ? Number(cash.metadata.splitDerivedCashAmount)
        : null;
  const cashPending =
    metaFlagOn(cash?.metadata?.awaitingCashStatement) ||
    (metaFlagOn(card?.metadata?.awaitingCardStatement) && !statement);
  const delta =
    card?.metadata?.splitVarianceDelta != null
      ? Number(card.metadata.splitVarianceDelta)
      : statement != null && pumpTotal > 0
        ? Math.round((statement - pumpTotal) * 100) / 100
        : null;
  const reconciled = entries.some((e) => metaFlagOn(e.metadata?.splitReconciled));
  const cashAmount =
    derived != null && !cashPending
      ? derived
      : Number(cash?.amount) || 0;
  return {
    pumpTotal,
    cashAmount,
    cardAmount: cardDisplayAmount(card),
    expectedCardAmount: expected,
    statementAmount: statement,
    derivedCashAmount: derived,
    varianceDelta: delta,
    hasMismatch: splitEntriesHaveMismatch(entries),
    reconciled,
    cashPendingStatement: cashPending,
  };
}

/** Entries to render for a display row (primary first for actions). */
export function entriesForDisplayRow(row: FuelLogDisplayRow): FuelEntry[] {
  if (row.kind === 'single') return [row.entry];
  return row.entries;
}

export function primaryEntryForDisplayRow(row: FuelLogDisplayRow): FuelEntry {
  if (row.kind === 'single') return row.entry;
  return row.primary;
}
