/**
 * Unlinked card charges — approved JAA statement rows with no ops counterpart.
 * Shared by fleet UI (Unlinked chip), drift control, and week-close gate.
 */

import { isJaaStatementLedgerRow, type JaaLedgerEntryLike } from './jaaStatementLedger.ts';

export type UnlinkedCardChargeEntryLike = JaaLedgerEntryLike & {
  amount?: number | string | null;
  cardId?: string | null;
  date?: string | null;
  id?: string;
  paymentSource?: string | null;
  metadata?: Record<string, unknown> | null;
};

function metaOf(e: UnlinkedCardChargeEntryLike): Record<string, unknown> {
  const m = e.metadata;
  return m && typeof m === 'object' ? (m as Record<string, unknown>) : {};
}

/**
 * Approved fuel statement row with no linked driver/ops log and not dismissed.
 * Ambiguous matcher outcomes that were never applied also match (still unmatched).
 */
export function isUnlinkedCardCharge(entry: UnlinkedCardChargeEntryLike): boolean {
  if (!isJaaStatementLedgerRow(entry)) return false;
  const m = metaOf(entry);
  if (String(m.jaaRowKind || '') !== 'approved_fuel') return false;
  if (m.jaaMatchedDriverEntryId) return false;
  if (m.adoptionDismissedAt) return false;
  return (Number(entry.amount) || 0) > 0;
}

export function countUnlinkedCardCharges(
  entries: UnlinkedCardChargeEntryLike[],
): number {
  return entries.reduce((n, e) => n + (isUnlinkedCardCharge(e) ? 1 : 0), 0);
}

export type GasCardStatementDrift = {
  cardId: string;
  /** Gross approved statement fuel (matched + unmatched) — display only. */
  statementFuelTotal: number;
  /** Gross ops gas-card spend (matched + orphan) — display only. */
  opsGasCardTotal: number;
  /** Unmatched approved statement money (the Unlinked queue). */
  unlinkedTotal: number;
  /** Ops gas-card money with no statement behind it. */
  orphanOpsTotal: number;
  /**
   * Net unreconciled money: unlinkedTotal − orphanOpsTotal.
   * Matched pairs never contribute, so a pair straddling a week boundary cannot create drift.
   */
  drift: number;
  unlinkedCount: number;
  unlinkedEntryIds: string[];
  orphanOpsCount: number;
  orphanOpsEntryIds: string[];
};

function isOpsGasCardSpendRow(entry: UnlinkedCardChargeEntryLike): boolean {
  if (isJaaStatementLedgerRow(entry)) return false;
  const m = metaOf(entry);
  if (m.countsInFuelSpend === false) return false;
  if (m.awaitingCardStatement) return false;
  if (m.jaaRowKind === 'fee' || m.jaaRowKind === 'declined') return false;
  const pay = String(entry.paymentSource || m.paymentSource || '');
  if (pay !== 'Gas_Card' && pay !== 'company_card') return false;
  return (Number(entry.amount) || 0) > 0;
}

/** Ops gas-card spend with no statement link — money with no issuer source. */
export function isOrphanOpsGasCardSpend(entry: UnlinkedCardChargeEntryLike): boolean {
  return isOpsGasCardSpendRow(entry) && !metaOf(entry).jaaMatchedStatementId;
}

function isApprovedStatementFuel(entry: UnlinkedCardChargeEntryLike): boolean {
  if (!isJaaStatementLedgerRow(entry)) return false;
  const m = metaOf(entry);
  if (String(m.jaaRowKind || '') !== 'approved_fuel') return false;
  if (m.adoptionDismissedAt) return false;
  if (m.countsInFuelSpend === false) return false;
  return (Number(entry.amount) || 0) > 0;
}

function cardKey(entry: UnlinkedCardChargeEntryLike): string {
  const m = metaOf(entry);
  return String(entry.cardId || m.cardId || m.jaaCardCode || '').trim() || '_unknown';
}

type CardAccumulator = {
  statementFuelTotal: number;
  opsGasCardTotal: number;
  unlinkedTotal: number;
  orphanOpsTotal: number;
  unlinkedEntryIds: string[];
  orphanOpsEntryIds: string[];
};

/** Per-card statement vs ops gas-card reconciliation (live rows only). */
export function computeGasCardStatementDriftByCard(
  entries: UnlinkedCardChargeEntryLike[],
): GasCardStatementDrift[] {
  const byCard = new Map<string, CardAccumulator>();

  const bump = (cardId: string) => {
    let row = byCard.get(cardId);
    if (!row) {
      row = {
        statementFuelTotal: 0,
        opsGasCardTotal: 0,
        unlinkedTotal: 0,
        orphanOpsTotal: 0,
        unlinkedEntryIds: [],
        orphanOpsEntryIds: [],
      };
      byCard.set(cardId, row);
    }
    return row;
  };

  for (const e of entries) {
    const amt = Number(e.amount) || 0;
    if (isApprovedStatementFuel(e)) {
      const row = bump(cardKey(e));
      row.statementFuelTotal += amt;
      if (isUnlinkedCardCharge(e)) {
        row.unlinkedTotal += amt;
        if (e.id) row.unlinkedEntryIds.push(String(e.id));
      }
    } else if (isOpsGasCardSpendRow(e)) {
      const row = bump(cardKey(e));
      row.opsGasCardTotal += amt;
      if (isOrphanOpsGasCardSpend(e)) {
        row.orphanOpsTotal += amt;
        if (e.id) row.orphanOpsEntryIds.push(String(e.id));
      }
    }
  }

  return [...byCard.entries()]
    .map(([cardId, row]) => ({
      cardId,
      statementFuelTotal: row.statementFuelTotal,
      opsGasCardTotal: row.opsGasCardTotal,
      unlinkedTotal: row.unlinkedTotal,
      orphanOpsTotal: row.orphanOpsTotal,
      drift: row.unlinkedTotal - row.orphanOpsTotal,
      unlinkedCount: row.unlinkedEntryIds.length,
      unlinkedEntryIds: row.unlinkedEntryIds,
      orphanOpsCount: row.orphanOpsEntryIds.length,
      orphanOpsEntryIds: row.orphanOpsEntryIds,
    }))
    .filter((r) => r.statementFuelTotal > 0 || r.opsGasCardTotal > 0)
    .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
}

export type GasCardStatementDriftSummary = {
  statementFuelTotal: number;
  opsGasCardTotal: number;
  unlinkedTotal: number;
  orphanOpsTotal: number;
  drift: number;
  unlinkedCount: number;
  unlinkedEntryIds: string[];
  orphanOpsCount: number;
  orphanOpsEntryIds: string[];
  byCard: GasCardStatementDrift[];
};

/** Org/week rollup across cards. */
export function computeGasCardStatementDriftSummary(
  entries: UnlinkedCardChargeEntryLike[],
): GasCardStatementDriftSummary {
  const byCard = computeGasCardStatementDriftByCard(entries);
  const out: GasCardStatementDriftSummary = {
    statementFuelTotal: 0,
    opsGasCardTotal: 0,
    unlinkedTotal: 0,
    orphanOpsTotal: 0,
    drift: 0,
    unlinkedCount: 0,
    unlinkedEntryIds: [],
    orphanOpsCount: 0,
    orphanOpsEntryIds: [],
    byCard,
  };
  for (const c of byCard) {
    out.statementFuelTotal += c.statementFuelTotal;
    out.opsGasCardTotal += c.opsGasCardTotal;
    out.unlinkedTotal += c.unlinkedTotal;
    out.orphanOpsTotal += c.orphanOpsTotal;
    out.unlinkedEntryIds.push(...c.unlinkedEntryIds);
    out.orphanOpsEntryIds.push(...c.orphanOpsEntryIds);
  }
  out.drift = out.unlinkedTotal - out.orphanOpsTotal;
  out.unlinkedCount = out.unlinkedEntryIds.length;
  out.orphanOpsCount = out.orphanOpsEntryIds.length;
  return out;
}

/**
 * Week-close predicate: every blocking state names rows the operator can act on
 * (adopt/link/dismiss a statement row, or link/edit an orphan ops log).
 */
export function gasCardStatementDriftBlocks(summary: GasCardStatementDriftSummary): boolean {
  return summary.unlinkedCount > 0 || summary.orphanOpsCount > 0;
}
