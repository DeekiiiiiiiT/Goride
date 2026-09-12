import type { StatementPlatform, StatementSummary } from '../types/statementSummary';
import {
  aggregateStatementSummaries,
  computePeriodBalances,
} from './aggregateStatementSummaries';

export type EarningsOverlayPlatformTab = 'all' | StatementPlatform;

const PLATFORM_ORDER: StatementPlatform[] = ['Roam', 'Uber', 'InDrive'];
const MATERIAL_EPS = 0.005;

export type OverlayDetailLine = {
  label: string;
  value: number;
  /** Memo / credit style (e.g. Uber toll credits). */
  muted?: boolean;
};

export type EarningsOverlayModel = {
  isAll: boolean;
  summary: StatementSummary | null;
  netEarnings: number;
  tripCount: number;
  platformStrip: Array<{ platform: StatementPlatform; totalEarnings: number }>;
  earningsLines: OverlayDetailLine[];
  refundsLines: OverlayDetailLine[];
  adjustmentsLines: OverlayDetailLine[];
  adjustmentsExpandable: boolean;
  payoutLines: OverlayDetailLine[];
};

function material(n: number): boolean {
  return Math.abs(n) >= MATERIAL_EPS;
}

function orderedPlatforms(rows: StatementSummary[]): StatementSummary[] {
  return PLATFORM_ORDER.map((p) => rows.find((r) => r.platform === p)).filter(
    (r): r is StatementSummary => Boolean(r),
  );
}

function hasActivity(r: StatementSummary): boolean {
  return (
    material(r.totalEarnings) ||
    material(r.totalRefundsExpenses) ||
    material(r.periodAdjustments) ||
    material(r.totalPayout) ||
    material(r.cashCollected) ||
    material(r.bankTransfer) ||
    (r.tripCount ?? 0) > 0 ||
    material(r.platformTollCredits ?? r.uberTollCredits ?? 0)
  );
}

/** Pure mapper for Earnings driver overlay sections. */
export function buildEarningsOverlayModel(
  summaries: StatementSummary[],
  platformTab: EarningsOverlayPlatformTab,
): EarningsOverlayModel {
  const isAll = platformTab === 'all';
  const filtered = isAll
    ? summaries
    : summaries.filter((s) => s.platform === platformTab);
  const platforms = orderedPlatforms(filtered);
  const summary = isAll
    ? aggregateStatementSummaries(platforms.length ? platforms : filtered)
    : platforms[0] ?? filtered[0] ?? null;

  const { endBalance } = computePeriodBalances(summary);

  const platformStrip = isAll
    ? platforms
        .filter(hasActivity)
        .map((r) => ({ platform: r.platform, totalEarnings: r.totalEarnings }))
    : [];

  const earningsLines: OverlayDetailLine[] = [];
  if (summary) {
    earningsLines.push(
      { label: 'Net fare', value: summary.netFare },
      { label: 'Promotions', value: summary.promotions },
      { label: 'Tips', value: summary.tips },
    );
    if (isAll) {
      for (const r of platforms) {
        if (!material(r.totalEarnings) && (r.tripCount ?? 0) === 0) continue;
        earningsLines.push({
          label: `${r.platform} total`,
          value: r.totalEarnings,
        });
      }
    }
  }

  const refundsLines: OverlayDetailLine[] = [];
  if (summary) {
    refundsLines.push({
      label: 'Statement toll / expenses',
      value: summary.totalRefundsExpenses,
    });
    const credits = summary.platformTollCredits ?? summary.uberTollCredits ?? 0;
    if (material(credits)) {
      refundsLines.push({
        label: 'Platform toll credits (memo)',
        value: credits,
        muted: true,
      });
    }
    if (isAll) {
      for (const r of platforms) {
        if (!material(r.totalRefundsExpenses)) continue;
        refundsLines.push({
          label: `${r.platform} expenses`,
          value: r.totalRefundsExpenses,
        });
      }
    }
  }

  const adjustmentsLines: OverlayDetailLine[] = [];
  let adjustmentsExpandable = false;
  if (summary) {
    if (isAll) {
      const withAdj = platforms.filter((r) => material(r.periodAdjustments));
      adjustmentsExpandable = withAdj.length > 0;
      for (const r of withAdj) {
        adjustmentsLines.push({
          label: r.platform,
          value: r.periodAdjustments,
        });
      }
    }
  }

  const payoutLines: OverlayDetailLine[] = [];
  if (summary) {
    payoutLines.push(
      { label: 'Cash collected', value: summary.cashCollected },
      { label: 'Bank transfer', value: summary.bankTransfer },
      { label: 'Total payout', value: -Math.abs(summary.totalPayout) },
    );
    if (isAll) {
      for (const r of platforms) {
        if (
          !material(r.cashCollected) &&
          !material(r.bankTransfer) &&
          !material(r.totalPayout)
        ) {
          continue;
        }
        if (material(r.cashCollected)) {
          payoutLines.push({ label: `${r.platform} cash`, value: r.cashCollected });
        }
        if (material(r.bankTransfer)) {
          payoutLines.push({ label: `${r.platform} bank`, value: r.bankTransfer });
        }
        if (material(r.totalPayout)) {
          payoutLines.push({
            label: `${r.platform} payout`,
            value: -Math.abs(r.totalPayout),
          });
        }
      }
    }
  }

  return {
    isAll,
    summary,
    netEarnings: endBalance,
    tripCount: summary?.tripCount ?? 0,
    platformStrip,
    earningsLines,
    refundsLines,
    adjustmentsLines,
    adjustmentsExpandable,
    payoutLines,
  };
}
