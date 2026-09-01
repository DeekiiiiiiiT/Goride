/**
 * Phase 5 — targeted settlement repair after audit fixes.
 *
 * Usage (ops / service role):
 *   import { repairDriverSettlementWeeks } from './settlement_audit_repair.ts'
 *   await repairDriverSettlementWeeks({ driverId, force: true, onlyOpenOrOwes: true })
 *
 * Do NOT mass-force closed paid weeks without PO review of payout deltas.
 */
import {
  rebuildAllPeriodsForDriver,
  rebuildDriverFinancialPeriod,
  listDriverFinancialPeriods,
} from './driver_financial_periods.ts';

export async function repairDriverSettlementWeeks(opts: {
  driverId: string;
  /** When true, rewrite signed weeks (required to fix tip-stripped cash-sync rows). */
  force?: boolean;
  /** Limit to open / company_owes / driver_owes / pending / awaiting_* weeks. */
  onlyOpenOrOwes?: boolean;
  anchors?: string[];
}): Promise<{ rebuilt: number; skipped: number; anchors: string[] }> {
  const driverId = String(opts.driverId || '').trim();
  if (!driverId) throw new Error('driverId required');

  if (opts.anchors?.length) {
    let rebuilt = 0;
    for (const anchor of opts.anchors) {
      await rebuildDriverFinancialPeriod(driverId, anchor);
      rebuilt++;
    }
    return { rebuilt, skipped: 0, anchors: opts.anchors };
  }

  if (opts.onlyOpenOrOwes) {
    const periods = await listDriverFinancialPeriods(driverId);
    const targets = periods.filter((p) => {
      const st = String(p.settlementStatus || '').toLowerCase();
      const po = String(p.payoutStatus || '').toLowerCase();
      if (st === 'company_owes' || st === 'driver_owes' || st === 'pending' || st === 'overpaid') {
        return true;
      }
      if (po === 'awaiting_cash' || po === 'awaiting_tolls' || po === 'pending') return true;
      if (p.status === 'open' || p.status === 'reopened') return true;
      // Tip-gap heuristic: gross != fleet + driver + tipsPaid (within $1)
      const tipsPaid = Number(p.tipsPaidToDriver) || 0;
      const tipsWh = Number(p.tipsWithheld) || 0;
      const gap = Math.abs(
        Number(p.earningsGross) -
          (Number(p.fleetShare) + Number(p.driverShare) + tipsPaid - tipsWh),
      );
      // earningsGross = fares + tips; fleet includes withheld — identity:
      // gross ≈ driverShare + fleetShare + tipsPaid - tipsWithheld... actually
      // fleetShare already includes tipsWithheld, so gross = driver + fleet + tipsPaid
      const identityGap = Math.abs(
        Number(p.earningsGross) - (Number(p.driverShare) + Number(p.fleetShare) + tipsPaid),
      );
      return identityGap > 1;
    });
    let rebuilt = 0;
    for (const p of targets) {
      await rebuildDriverFinancialPeriod(driverId, p.periodAnchor);
      rebuilt++;
    }
    return {
      rebuilt,
      skipped: periods.length - rebuilt,
      anchors: targets.map((t) => t.periodAnchor),
    };
  }

  const result = await rebuildAllPeriodsForDriver(driverId, { force: !!opts.force });
  return {
    rebuilt: result.rebuilt,
    skipped: result.skippedSigned,
    anchors: [],
  };
}
