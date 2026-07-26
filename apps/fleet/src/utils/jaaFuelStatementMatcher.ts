import type { FuelEntry } from '../types/fuel';

export type FuelMatchStatus = 'matched' | 'unmatched_statement' | 'unmatched_driver' | 'ambiguous' | 'amount_mismatch';

export interface FuelMatchPair {
  status: FuelMatchStatus;
  statementEntry?: FuelEntry;
  driverEntry?: FuelEntry;
  score?: number;
  notes?: string;
}

const AMOUNT_TOLERANCE = 1.0; // JMD
const LITERS_TOLERANCE = 0.05;
const DAY_WINDOW_MS = 36 * 60 * 60 * 1000; // ±1.5 days

function dayMs(iso: string): number {
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
  return d.getTime();
}

function absDiff(a: number, b: number) {
  return Math.abs(a - b);
}

function isGasCardDriverLog(e: FuelEntry): boolean {
  if (e.paymentSource === 'Gas_Card') return true;
  if (e.type === 'Card_Transaction' && e.entrySource === 'driver-portal') return true;
  if (e.type === 'Card_Transaction' && (e as any).source === 'Driver Portal') return true;
  // Expense-backed company card fills often land as Manual/Card with metadata
  const ps = String((e.metadata as any)?.paymentSource || '').toLowerCase();
  return ps === 'company_card' || ps === 'gas_card';
}

function isStatementImport(e: FuelEntry): boolean {
  return (
    e.entrySource === 'fuel-card' ||
    e.entrySource === 'bulk-import' ||
    Boolean((e.metadata as any)?.jaaReceiptNumber) ||
    Boolean((e.metadata as any)?.importSource === 'jaa_statement_details')
  );
}

/**
 * Match imported JAA statement Card_Transaction rows to driver gas-card logs.
 * Keys: vehicleId (preferred) or plate-ish location metadata, date window, amount, liters.
 */
export function matchJaaStatementToDriverLogs(
  statementEntries: FuelEntry[],
  driverCandidates: FuelEntry[],
): FuelMatchPair[] {
  const statements = statementEntries.filter(isStatementImport);
  const drivers = driverCandidates.filter(isGasCardDriverLog).filter((d) => !d.metadata?.jaaMatchedStatementId);

  const usedDriverIds = new Set<string>();
  const pairs: FuelMatchPair[] = [];

  for (const stmt of statements) {
    if (stmt.metadata?.jaaMatchedDriverEntryId) {
      const linked = drivers.find((d) => d.id === stmt.metadata?.jaaMatchedDriverEntryId);
      pairs.push({ status: 'matched', statementEntry: stmt, driverEntry: linked, score: 100, notes: 'Already linked' });
      if (linked) usedDriverIds.add(linked.id);
      continue;
    }

    const candidates = drivers
      .filter((d) => !usedDriverIds.has(d.id))
      .map((d) => {
        let score = 0;
        const notes: string[] = [];

        if (stmt.vehicleId && d.vehicleId && stmt.vehicleId === d.vehicleId) {
          score += 40;
        } else if (stmt.vehicleId && d.vehicleId) {
          score -= 20;
          notes.push('vehicle mismatch');
        }

        const stmtDay = dayMs(stmt.date);
        const drvDay = dayMs(d.date);
        const dayDelta = Math.abs(stmtDay - drvDay);
        if (dayDelta <= DAY_WINDOW_MS) score += 25;
        else {
          score -= 30;
          notes.push('date out of window');
        }

        const stmtAmt = Math.abs(Number(stmt.amount) || 0);
        const drvAmt = Math.abs(Number(d.amount) || 0);
        if (stmtAmt > 0 && drvAmt > 0) {
          if (absDiff(stmtAmt, drvAmt) <= AMOUNT_TOLERANCE) score += 25;
          else if (absDiff(stmtAmt, drvAmt) <= 50) {
            score += 5;
            notes.push('amount soft mismatch');
          } else {
            score -= 20;
            notes.push('amount mismatch');
          }
        }

        const stmtL = Number(stmt.liters) || 0;
        const drvL = Number(d.liters) || 0;
        if (stmtL > 0 && drvL > 0) {
          if (absDiff(stmtL, drvL) <= LITERS_TOLERANCE) score += 20;
          else if (absDiff(stmtL, drvL) <= 0.5) score += 5;
          else {
            score -= 10;
            notes.push('liters mismatch');
          }
        }

        // Odometer / mileage if both present
        const stmtOdo = Number(stmt.odometer) || Number((stmt.metadata as any)?.mileage) || 0;
        const drvOdo = Number(d.odometer) || 0;
        if (stmtOdo > 0 && drvOdo > 0) {
          if (absDiff(stmtOdo, drvOdo) <= 5) score += 10;
        }

        return { d, score, notes };
      })
      .filter((c) => c.score >= 50)
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      pairs.push({ status: 'unmatched_statement', statementEntry: stmt, notes: 'No driver log within match window' });
      continue;
    }

    if (candidates.length > 1 && candidates[0].score - candidates[1].score < 10) {
      pairs.push({
        status: 'ambiguous',
        statementEntry: stmt,
        driverEntry: candidates[0].d,
        score: candidates[0].score,
        notes: `Ambiguous: ${candidates.length} candidates`,
      });
      continue;
    }

    const best = candidates[0];
    usedDriverIds.add(best.d.id);
    const softAmount = best.notes.includes('amount soft mismatch') || best.notes.includes('amount mismatch');
    pairs.push({
      status: softAmount && best.score < 70 ? 'amount_mismatch' : 'matched',
      statementEntry: stmt,
      driverEntry: best.d,
      score: best.score,
      notes: best.notes.join('; ') || undefined,
    });
  }

  for (const d of drivers) {
    if (!usedDriverIds.has(d.id)) {
      pairs.push({ status: 'unmatched_driver', driverEntry: d, notes: 'No matching JAA statement row' });
    }
  }

  return pairs;
}

/** Apply link metadata onto a matched pair (caller persists). */
export function applyFuelMatchLinks(pair: FuelMatchPair): { statement?: FuelEntry; driver?: FuelEntry } {
  if (!pair.statementEntry || !pair.driverEntry) return {};
  if (pair.status !== 'matched' && pair.status !== 'amount_mismatch') return {};

  const statement: FuelEntry = {
    ...pair.statementEntry,
    transactionId: pair.driverEntry.transactionId || pair.statementEntry.transactionId,
    reconciliationStatus: pair.status === 'matched' ? 'Verified' : 'Flagged',
    metadata: {
      ...(pair.statementEntry.metadata || {}),
      jaaMatchedDriverEntryId: pair.driverEntry.id,
      jaaMatchScore: pair.score,
      jaaMatchNotes: pair.notes,
    },
  };

  const stmtPpl =
    pair.statementEntry.liters && pair.statementEntry.liters > 0
      ? Number((pair.statementEntry.amount / pair.statementEntry.liters).toFixed(2))
      : pair.statementEntry.pricePerLiter;
  const drvPpl = pair.driverEntry.pricePerLiter;
  const pplDisagree =
    stmtPpl != null && drvPpl != null && Math.abs(stmtPpl - drvPpl) > 1;

  const driver: FuelEntry = {
    ...pair.driverEntry,
    // Prefer statement as source of truth for $ / L when linked
    amount: pair.statementEntry.amount,
    liters: pair.statementEntry.liters ?? pair.driverEntry.liters,
    pricePerLiter: stmtPpl ?? pair.driverEntry.pricePerLiter,
    reconciliationStatus: pplDisagree || pair.status === 'amount_mismatch' ? 'Flagged' : 'Verified',
    metadata: {
      ...(pair.driverEntry.metadata || {}),
      jaaMatchedStatementId: pair.statementEntry.id,
      jaaReceiptNumber: (pair.statementEntry.metadata as any)?.jaaReceiptNumber,
      jaaMatchScore: pair.score,
      jaaPriceDiscrepancy: pplDisagree || undefined,
      priorDriverAmount: pair.driverEntry.amount,
      priorDriverLiters: pair.driverEntry.liters,
      priorDriverPpl: pair.driverEntry.pricePerLiter,
    },
  };

  return { statement, driver };
}
