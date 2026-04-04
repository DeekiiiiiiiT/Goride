import type { CanonicalLedgerEventInput } from '../types/ledgerCanonical';
import type { UberImportReconciliation } from './uberImportReconciliation';

const TOL = 0.06;

/**
 * Sums built `statement_line` events and checks they match the same reconciliation
 * used for the import preview (before POST to canonical append).
 */
export function verifyCanonicalImportVsReconciliation(
  events: CanonicalLedgerEventInput[],
  recon: UberImportReconciliation,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  let netFare = 0;
  let totalEarningsStmt = 0;
  let promo = 0;
  let tips = 0;
  let refundsMag = 0;

  for (const e of events) {
    if (e.eventType !== 'statement_line') continue;
    const code = String((e.metadata as { lineCode?: string })?.lineCode || '');
    const n = Number(e.netAmount);
    if (!Number.isFinite(n)) continue;
    switch (code) {
      case 'NET_FARE':
        netFare += n;
        break;
      case 'TOTAL_EARNINGS':
        totalEarningsStmt += n;
        break;
      case 'PROMOTIONS':
        promo += n;
        break;
      case 'TIPS':
        tips += n;
        break;
      case 'REFUNDS_EXPENSES':
        refundsMag += Math.abs(n);
        break;
      default:
        break;
    }
  }

  if (recon.hasSsot) {
    if (Math.abs(netFare - recon.netFare) > TOL) {
      errors.push(
        `NET_FARE posted sum $${netFare.toFixed(2)} ≠ preview $${recon.netFare.toFixed(2)}`,
      );
    }
    if (Math.abs(totalEarningsStmt - recon.totalEarnings) > TOL) {
      errors.push(
        `TOTAL_EARNINGS sum $${totalEarningsStmt.toFixed(2)} ≠ preview $${recon.totalEarnings.toFixed(2)}`,
      );
    }
    if (Math.abs(promo - recon.promotions) > TOL) {
      errors.push(
        `PROMOTIONS sum $${promo.toFixed(2)} ≠ preview $${recon.promotions.toFixed(2)}`,
      );
    }
    if (Math.abs(tips - recon.tipsStatement) > TOL) {
      errors.push(`TIPS sum $${tips.toFixed(2)} ≠ preview $${recon.tipsStatement.toFixed(2)}`);
    }
    if (Math.abs(refundsMag - recon.refundsTotal) > TOL) {
      errors.push(
        `Refunds & expenses $${refundsMag.toFixed(2)} ≠ preview $${recon.refundsTotal.toFixed(2)}`,
      );
    }
  } else {
    if (Math.abs(netFare - recon.netFare) > TOL) {
      errors.push(
        `NET_FARE (no SSOT) $${netFare.toFixed(2)} ≠ preview $${recon.netFare.toFixed(2)}`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}
