/** Minimal structural shape so Admin/Fleet keep their local FuelEntry types. */
export interface FuelEntryLike {
  id: string;
  date: string;
  time?: string;
  amount: number;
  liters?: number | null;
  pricePerLiter?: number | null;
  location?: string | null;
  vehicleId?: string;
  driverId?: string;
  cardId?: string;
  odometer?: number | null;
  odometerImageUrl?: string;
  transactionId?: string;
  type?: string;
  entryMode?: string;
  paymentSource?: string;
  entrySource?: string;
  reconciliationStatus?: string;
  metadata?: Record<string, unknown> | null;
}

export type FuelMatchStatus =
  | 'matched'
  | 'unmatched_statement'
  | 'unmatched_driver'
  | 'ambiguous'
  | 'amount_mismatch';

export interface FuelMatchPair<T extends FuelEntryLike = FuelEntryLike> {
  status: FuelMatchStatus;
  statementEntry?: T;
  driverEntry?: T;
  score?: number;
  notes?: string;
}

const DAY_WINDOW_MS = 36 * 60 * 60 * 1000; // ±1.5 days

const STATEMENT_IMPORT_SOURCES = new Set([
  'jaa_raw',
  'jaa_statement_details',
  'fuel_statement',
]);

function metaOf(e: FuelEntryLike): Record<string, unknown> {
  return (e.metadata || {}) as Record<string, unknown>;
}

/** True for JAA/CSV statement ledger rows (Card Inventory), not driver Logs. */
export function isJaaStatementLedgerRow(entry: FuelEntryLike): boolean {
  const m = metaOf(entry);
  const importSource = String(m.importSource || '');
  if (STATEMENT_IMPORT_SOURCES.has(importSource)) return true;
  // Statement-classified rows without driver-portal provenance
  if (m.jaaRowKind != null && entry.entrySource !== 'driver-portal') return true;
  return false;
}

function dayMs(iso: string, time?: string): number {
  if (time && /^\d{2}:\d{2}/.test(time) && !iso.includes('T')) {
    return new Date(`${iso}T${time.length === 5 ? `${time}:00` : time}`).getTime();
  }
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
  return d.getTime();
}

function isApprovedStatementFuel(e: FuelEntryLike): boolean {
  const m = metaOf(e);
  const kind = m.jaaRowKind;
  if (kind === 'fee' || kind === 'declined') return false;
  if (m.countsInFuelSpend === false) return false;
  return (
    e.entrySource === 'fuel-card' ||
    e.entrySource === 'bulk-import' ||
    Boolean(m.jaaReceiptNumber) ||
    isJaaStatementLedgerRow(e)
  );
}

/** Roam Gas Card odometer anchors (awaiting JAA money). */
function isRoamGasCardAnchor(e: FuelEntryLike): boolean {
  if (metaOf(e).awaitingCardStatement) return true;
  if (e.paymentSource !== 'Gas_Card') return false;
  if (e.entrySource !== 'driver-portal') return false;
  if (Number(e.amount) === 0 && e.entryMode === 'Anchor') return true;
  return false;
}

function isGasCardDriverLog(e: FuelEntryLike): boolean {
  if (isRoamGasCardAnchor(e)) return true;
  if (e.paymentSource === 'Gas_Card') return true;
  if (e.type === 'Card_Transaction' && e.entrySource === 'driver-portal') return true;
  const ps = String(metaOf(e).paymentSource || '').toLowerCase();
  return ps === 'company_card' || ps === 'gas_card';
}

/**
 * Match imported JAA statement rows to Roam Gas Card anchors.
 * Security keys: Roam cardId + Roam vehicleId + time window.
 * Never scores on JAA DRIVER_NAME / LICENSE_NUMBER / MILEAGE.
 */
export function matchJaaStatementToDriverLogs<T extends FuelEntryLike>(
  statementEntries: T[],
  driverCandidates: T[],
): FuelMatchPair<T>[] {
  const statements = statementEntries.filter(isApprovedStatementFuel).filter((s) => {
    const kind = metaOf(s).jaaRowKind;
    return kind !== 'fee' && kind !== 'declined';
  });
  const drivers = driverCandidates
    .filter(isGasCardDriverLog)
    .filter((d) => !metaOf(d).jaaMatchedStatementId);

  const usedDriverIds = new Set<string>();
  const pairs: FuelMatchPair<T>[] = [];

  for (const stmt of statements) {
    if (metaOf(stmt).jaaMatchedDriverEntryId) {
      const linkedId = String(metaOf(stmt).jaaMatchedDriverEntryId);
      const linked = drivers.find((d) => d.id === linkedId);
      pairs.push({
        status: 'matched',
        statementEntry: stmt,
        driverEntry: linked,
        score: 100,
        notes: 'Already linked',
      });
      if (linked) usedDriverIds.add(linked.id);
      continue;
    }

    const candidates = drivers
      .filter((d) => !usedDriverIds.has(d.id))
      .map((d) => {
        let score = 0;
        const notes: string[] = [];

        if (stmt.cardId && d.cardId && stmt.cardId === d.cardId) {
          score += 50;
        } else if (stmt.cardId && d.cardId && stmt.cardId !== d.cardId) {
          score -= 40;
          notes.push('card mismatch');
        }

        if (stmt.vehicleId && d.vehicleId && stmt.vehicleId === d.vehicleId) {
          score += 35;
        } else if (d.vehicleId && !stmt.vehicleId) {
          if (stmt.cardId && d.cardId && stmt.cardId === d.cardId) score += 10;
        } else if (stmt.vehicleId && d.vehicleId && stmt.vehicleId !== d.vehicleId) {
          score -= 25;
          notes.push('vehicle mismatch');
        }

        const dayDelta = Math.abs(dayMs(stmt.date, stmt.time) - dayMs(d.date, d.time));
        if (dayDelta <= DAY_WINDOW_MS) score += 30;
        else {
          score -= 35;
          notes.push('date out of window');
        }

        if (metaOf(d).awaitingCardStatement) score += 5;

        return { d, score, notes };
      })
      .filter((c) => c.score >= 55)
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      pairs.push({
        status: 'unmatched_statement',
        statementEntry: stmt,
        notes: 'No Roam Gas Card log within match window',
      });
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
 * driver gets money snapshot for Logs UI. Driver station wins over JAA vendor.
 */
export function applyFuelMatchLinks<T extends FuelEntryLike>(
  pair: FuelMatchPair<T>,
): { statement?: T; driver?: T } {
  if (!pair.statementEntry || !pair.driverEntry) return {};
  if (pair.status !== 'matched' && pair.status !== 'amount_mismatch') return {};

  const stmt = pair.statementEntry;
  const drv = pair.driverEntry;
  const stmtMeta = metaOf(stmt);
  const drvMeta = metaOf(drv);

  const stmtPpl =
    stmt.liters && stmt.liters > 0
      ? Number((stmt.amount / stmt.liters).toFixed(2))
      : stmt.pricePerLiter;

  const statement = {
    ...stmt,
    driverId: drv.driverId || stmt.driverId,
    vehicleId: drv.vehicleId || stmt.vehicleId,
    cardId: drv.cardId || stmt.cardId,
    odometer: drv.odometer ?? stmt.odometer,
    odometerImageUrl: drv.odometerImageUrl || stmt.odometerImageUrl,
    entryMode: drv.odometer != null ? 'Anchor' : stmt.entryMode,
    transactionId: drv.transactionId || stmt.transactionId,
    reconciliationStatus: 'Verified',
    metadata: {
      ...stmtMeta,
      jaaMatchedDriverEntryId: drv.id,
      jaaMatchScore: pair.score,
      jaaMatchNotes: pair.notes,
    },
  } as T;

  const driver = {
    ...drv,
    amount: stmt.amount,
    liters: stmt.liters ?? drv.liters,
    pricePerLiter: stmtPpl ?? drv.pricePerLiter,
    // Roam verified station wins — never overwrite with JAA VENDOR_NAME
    location: drv.location || stmt.location,
    cardId: stmt.cardId || drv.cardId,
    vehicleId: drv.vehicleId || stmt.vehicleId,
    reconciliationStatus: 'Verified',
    metadata: {
      ...drvMeta,
      awaitingCardStatement: false,
      jaaMatchedStatementId: stmt.id,
      jaaReceiptNumber: stmtMeta.jaaReceiptNumber,
      jaaResponse: stmtMeta.jaaResponse,
      jaaFuelType: stmtMeta.jaaFuelType,
      jaaMatchScore: pair.score,
      priorDriverAmount: drv.amount,
      priorDriverLiters: drv.liters,
    },
  } as T;

  return { statement, driver };
}

export type JaaMatchApplySummary = {
  matched: number;
  unmatchedStatement: number;
  ambiguous: number;
  unmatchedDriver: number;
};

/** Match + apply updates for pairs that are clearly matched (skips ambiguous). */
export function buildJaaMatchUpdates<T extends FuelEntryLike>(
  statementEntries: T[],
  allEntries: T[],
): { pairs: FuelMatchPair<T>[]; updates: T[]; summary: JaaMatchApplySummary } {
  const pairs = matchJaaStatementToDriverLogs(statementEntries, allEntries);
  const updates: T[] = [];
  const seen = new Set<string>();

  for (const pair of pairs) {
    if (pair.status !== 'matched' && pair.status !== 'amount_mismatch') continue;
    // Skip already-linked no-ops when apply would re-save identical links
    if (pair.notes === 'Already linked') continue;
    const { statement, driver } = applyFuelMatchLinks(pair);
    if (statement && !seen.has(statement.id)) {
      updates.push(statement);
      seen.add(statement.id);
    }
    if (driver && !seen.has(driver.id)) {
      updates.push(driver);
      seen.add(driver.id);
    }
  }

  return {
    pairs,
    updates,
    summary: {
      matched: pairs.filter((p) => p.status === 'matched' && p.notes !== 'Already linked').length,
      unmatchedStatement: pairs.filter((p) => p.status === 'unmatched_statement').length,
      ambiguous: pairs.filter((p) => p.status === 'ambiguous').length,
      unmatchedDriver: pairs.filter((p) => p.status === 'unmatched_driver').length,
    },
  };
}
