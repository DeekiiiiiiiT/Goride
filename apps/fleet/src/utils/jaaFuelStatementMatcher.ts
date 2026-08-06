import type { FuelEntry } from '../types/fuel';

export type FuelMatchStatus = 'matched' | 'unmatched_statement' | 'unmatched_driver' | 'ambiguous' | 'amount_mismatch';

export interface FuelMatchPair {
  status: FuelMatchStatus;
  statementEntry?: FuelEntry;
  driverEntry?: FuelEntry;
  score?: number;
  notes?: string;
}

const DAY_WINDOW_MS = 36 * 60 * 60 * 1000; // ±1.5 days

function dayMs(iso: string, time?: string): number {
  if (time && /^\d{2}:\d{2}/.test(time) && !iso.includes('T')) {
    return new Date(`${iso}T${time.length === 5 ? `${time}:00` : time}`).getTime();
  }
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
  return d.getTime();
}

function isApprovedStatementFuel(e: FuelEntry): boolean {
  const kind = (e.metadata as any)?.jaaRowKind;
  if (kind === 'fee' || kind === 'declined') return false;
  if ((e.metadata as any)?.countsInFuelSpend === false) return false;
  return (
    e.entrySource === 'fuel-card' ||
    e.entrySource === 'bulk-import' ||
    Boolean((e.metadata as any)?.jaaReceiptNumber) ||
    (e.metadata as any)?.importSource === 'jaa_statement_details' ||
    (e.metadata as any)?.importSource === 'jaa_raw' ||
    (e.metadata as any)?.importSource === 'fuel_statement'
  );
}

/** Roam Gas Card odometer anchors (awaiting JAA money). */
function isRoamGasCardAnchor(e: FuelEntry): boolean {
  if ((e.metadata as any)?.awaitingCardStatement) return true;
  if (e.paymentSource !== 'Gas_Card') return false;
  if (e.entrySource !== 'driver-portal') return false;
  // Pending zero-amount odo logs
  if (Number(e.amount) === 0 && e.entryMode === 'Anchor') return true;
  return false;
}

function isGasCardDriverLog(e: FuelEntry): boolean {
  if (isRoamGasCardAnchor(e)) return true;
  if (e.paymentSource === 'Gas_Card') return true;
  if (e.type === 'Card_Transaction' && e.entrySource === 'driver-portal') return true;
  const ps = String((e.metadata as any)?.paymentSource || '').toLowerCase();
  return ps === 'company_card' || ps === 'gas_card';
}

/**
 * Match imported JAA statement rows to Roam Gas Card anchors.
 * Security keys: Roam cardId + Roam vehicleId + time window.
 * Never scores on JAA DRIVER_NAME / LICENSE_NUMBER / MILEAGE.
 * Amount/liters not required (anchors are $0 until matched).
 */
export function matchJaaStatementToDriverLogs(
  statementEntries: FuelEntry[],
  driverCandidates: FuelEntry[],
): FuelMatchPair[] {
  const statements = statementEntries.filter(isApprovedStatementFuel).filter((s) => {
    const kind = (s.metadata as any)?.jaaRowKind;
    return kind !== 'fee' && kind !== 'declined';
  });
  const drivers = driverCandidates
    .filter(isGasCardDriverLog)
    .filter((d) => !(d.metadata as any)?.jaaMatchedStatementId);

  const usedDriverIds = new Set<string>();
  const pairs: FuelMatchPair[] = [];

  for (const stmt of statements) {
    if ((stmt.metadata as any)?.jaaMatchedDriverEntryId) {
      const linked = drivers.find((d) => d.id === (stmt.metadata as any)?.jaaMatchedDriverEntryId);
      pairs.push({ status: 'matched', statementEntry: stmt, driverEntry: linked, score: 100, notes: 'Already linked' });
      if (linked) usedDriverIds.add(linked.id);
      continue;
    }

    const candidates = drivers
      .filter((d) => !usedDriverIds.has(d.id))
      .map((d) => {
        let score = 0;
        const notes: string[] = [];

        // Primary: same inventory card
        if (stmt.cardId && d.cardId && stmt.cardId === d.cardId) {
          score += 50;
        } else if (stmt.cardId && d.cardId && stmt.cardId !== d.cardId) {
          score -= 40;
          notes.push('card mismatch');
        }

        // Secondary: same Roam vehicle
        if (stmt.vehicleId && d.vehicleId && stmt.vehicleId === d.vehicleId) {
          score += 35;
        } else if (d.vehicleId && !stmt.vehicleId) {
          // Statement may lack vehicle until card assignment — soft credit if card matched
          if (stmt.cardId && d.cardId && stmt.cardId === d.cardId) score += 10;
        } else if (stmt.vehicleId && d.vehicleId && stmt.vehicleId !== d.vehicleId) {
          score -= 25;
          notes.push('vehicle mismatch');
        }

        const stmtDay = dayMs(stmt.date, stmt.time);
        const drvDay = dayMs(d.date, d.time);
        const dayDelta = Math.abs(stmtDay - drvDay);
        if (dayDelta <= DAY_WINDOW_MS) score += 30;
        else {
          score -= 35;
          notes.push('date out of window');
        }

        // Prefer awaiting anchors over legacy money logs when both exist
        if ((d.metadata as any)?.awaitingCardStatement) score += 5;

        return { d, score, notes };
      })
      .filter((c) => c.score >= 55)
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      pairs.push({ status: 'unmatched_statement', statementEntry: stmt, notes: 'No Roam Gas Card log within match window' });
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
    pairs.push({
      status: 'matched',
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

/**
 * Apply link: JAA money stays on statement; Roam identity/odo copied onto statement;
 * Anchor cleared of awaiting state and receives money snapshot for UI.
 */
export function applyFuelMatchLinks(pair: FuelMatchPair): { statement?: FuelEntry; driver?: FuelEntry } {
  if (!pair.statementEntry || !pair.driverEntry) return {};
  if (pair.status !== 'matched' && pair.status !== 'amount_mismatch') return {};

  const stmtPpl =
    pair.statementEntry.liters && pair.statementEntry.liters > 0
      ? Number((pair.statementEntry.amount / pair.statementEntry.liters).toFixed(2))
      : pair.statementEntry.pricePerLiter;

  const statement: FuelEntry = {
    ...pair.statementEntry,
    // Roam security fields win
    driverId: pair.driverEntry.driverId || pair.statementEntry.driverId,
    vehicleId: pair.driverEntry.vehicleId || pair.statementEntry.vehicleId,
    cardId: pair.driverEntry.cardId || pair.statementEntry.cardId,
    odometer: pair.driverEntry.odometer ?? pair.statementEntry.odometer,
    odometerImageUrl: pair.driverEntry.odometerImageUrl || pair.statementEntry.odometerImageUrl,
    entryMode: pair.driverEntry.odometer != null ? 'Anchor' : pair.statementEntry.entryMode,
    transactionId: pair.driverEntry.transactionId || pair.statementEntry.transactionId,
    reconciliationStatus: 'Verified',
    metadata: {
      ...(pair.statementEntry.metadata || {}),
      jaaMatchedDriverEntryId: pair.driverEntry.id,
      jaaMatchScore: pair.score,
      jaaMatchNotes: pair.notes,
    },
  };

  const driver: FuelEntry = {
    ...pair.driverEntry,
    // Money truth from JAA
    amount: pair.statementEntry.amount,
    liters: pair.statementEntry.liters ?? pair.driverEntry.liters,
    pricePerLiter: stmtPpl ?? pair.driverEntry.pricePerLiter,
    location: pair.statementEntry.location || pair.driverEntry.location,
    cardId: pair.statementEntry.cardId || pair.driverEntry.cardId,
    vehicleId: pair.driverEntry.vehicleId || pair.statementEntry.vehicleId,
    reconciliationStatus: 'Verified',
    metadata: {
      ...(pair.driverEntry.metadata || {}),
      awaitingCardStatement: false,
      jaaMatchedStatementId: pair.statementEntry.id,
      jaaReceiptNumber: (pair.statementEntry.metadata as any)?.jaaReceiptNumber,
      jaaResponse: (pair.statementEntry.metadata as any)?.jaaResponse,
      jaaFuelType: (pair.statementEntry.metadata as any)?.jaaFuelType,
      jaaMatchScore: pair.score,
      priorDriverAmount: pair.driverEntry.amount,
      priorDriverLiters: pair.driverEntry.liters,
    },
  };

  return { statement, driver };
}
