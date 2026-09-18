/**
 * Fuel Flags monitor — problem fills only (integrity / exception / location / outliers).
 * Disposition (not week lock) resolves open → resolved; lock is a separate status.
 */
import type { FuelEntry } from '../types/fuel';
import { toEntryYmd } from './fuelWeekPeriod';
import { isFuelReconPeriodLocked } from '@roam/fuel-core';
import {
  getDisposition,
  isFlagCodeDisposed,
  type FuelFlagDispositionMap,
  type FuelFlagDispositionRecord,
} from './fuelFlagDisposition';

/** Monitor badges on fill rows. */
export type FuelFillFlagCategory = 'Integrity' | 'Outlier';

export type FuelFillFlagSeverity = 'critical' | 'warning' | 'info';

export type FuelFillFlagReason = {
  code: string;
  label: string;
  category: FuelFillFlagCategory;
  severity: FuelFillFlagSeverity;
  /** Disposition answered this claim — keep for desk/audit, not a close blocker. */
  resolved?: boolean;
  disposition?: FuelFlagDispositionRecord | null;
};

export type FuelFillFlagClassification = {
  entryId: string;
  dateYmd: string;
  categories: FuelFillFlagCategory[];
  reasons: FuelFillFlagReason[];
  primarySeverity: FuelFillFlagSeverity;
  /** True when the fill has at least one monitor flag (open or resolved). */
  isFlagged: boolean;
  /** True when any critical reason is still open (undisposed). */
  hasOpenCritical: boolean;
};

const SEVERITY_RANK: Record<FuelFillFlagSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

function meta(entry: FuelEntry): Record<string, unknown> {
  return (entry.metadata || {}) as Record<string, unknown>;
}

function pushReason(
  reasons: FuelFillFlagReason[],
  categories: Set<FuelFillFlagCategory>,
  reason: FuelFillFlagReason,
) {
  reasons.push(reason);
  categories.add(reason.category);
}

/**
 * Classify a fill for the Fuel Flags monitor desk.
 * Pass `outlierEntryIds` (price/station) for Outlier category.
 * Pass `dispositions` so accepted flags show as resolved (not dropped).
 */
export function classifyFuelFillFlags(
  entry: FuelEntry,
  opts?: {
    outlierEntryIds?: ReadonlySet<string>;
    dispositions?: FuelFlagDispositionMap;
  },
): FuelFillFlagClassification {
  const categories = new Set<FuelFillFlagCategory>();
  const reasons: FuelFillFlagReason[] = [];
  const m = meta(entry);
  const anomalyReason = String(m.anomalyReason || '').trim();
  const signalTier = String(m.signalTier || '').trim().toLowerCase();
  const integrity = String(m.integrityStatus || '').trim().toLowerCase();
  const location = String(entry.locationStatus || '').trim();

  if (signalTier === 'exception') {
    pushReason(reasons, categories, {
      code: 'signal_exception',
      label: anomalyReason || 'Exception fill',
      category: 'Integrity',
      severity: 'critical',
    });
  }

  if (integrity === 'critical') {
    pushReason(reasons, categories, {
      code: 'integrity_critical',
      label: anomalyReason || 'Integrity critical',
      category: 'Integrity',
      severity: 'critical',
    });
  } else if (integrity === 'warning') {
    pushReason(reasons, categories, {
      code: 'integrity_warning',
      label: anomalyReason || 'Integrity warning',
      category: 'Integrity',
      severity: 'warning',
    });
  }

  if (entry.isFlagged) {
    pushReason(reasons, categories, {
      code: 'is_flagged',
      label: anomalyReason || 'Fill flagged',
      category: 'Integrity',
      severity: 'warning',
    });
  }

  if (location === 'anomaly') {
    pushReason(reasons, categories, {
      code: 'location_anomaly',
      label: 'Location anomaly',
      category: 'Integrity',
      severity: 'warning',
    });
  }

  if (opts?.outlierEntryIds?.has(entry.id)) {
    pushReason(reasons, categories, {
      code: 'price_outlier',
      label: 'Price / station outlier',
      category: 'Outlier',
      severity: 'warning',
    });
  }

  // Dedupe by code|label; drop generic is_flagged when a more specific integrity_* shares the label.
  const seen = new Set<string>();
  const uniqueReasons = reasons.filter((r) => {
    if (r.code === 'is_flagged' && anomalyReason) {
      const sameLabel = reasons.some(
        (o) =>
          (o.code === 'integrity_critical' || o.code === 'integrity_warning') &&
          o.label === r.label,
      );
      if (sameLabel) return false;
    }
    const key = `${r.code}|${r.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const withDisposition = uniqueReasons.map((r) => {
    const disposed = isFlagCodeDisposed({
      entryId: entry.id,
      flagCode: r.code,
      dispositions: opts?.dispositions,
      metadata: m,
    });
    const disposition = getDisposition(opts?.dispositions, entry.id, r.code);
    return {
      ...r,
      resolved: disposed,
      disposition:
        disposition ||
        (disposed && r.code === 'signal_exception'
          ? {
              entryId: entry.id,
              flagCode: r.code,
              action: 'accepted' as const,
              note: String(m.exceptionResolveNote || '') || null,
              at: String(m.exceptionResolvedAt || '') || null,
            }
          : null),
    };
  });

  let primarySeverity: FuelFillFlagSeverity = 'info';
  const openReasons = withDisposition.filter((r) => !r.resolved);
  const severitySource = openReasons.length > 0 ? openReasons : withDisposition;
  for (const r of severitySource) {
    if (SEVERITY_RANK[r.severity] > SEVERITY_RANK[primarySeverity]) {
      primarySeverity = r.severity;
    }
  }

  const catList = (['Integrity', 'Outlier'] as FuelFillFlagCategory[]).filter((c) =>
    categories.has(c),
  );

  const hasOpenCritical = withDisposition.some(
    (r) => r.severity === 'critical' && !r.resolved,
  );

  return {
    entryId: entry.id,
    dateYmd: toEntryYmd(entry.date),
    categories: catList,
    reasons: withDisposition,
    primarySeverity,
    isFlagged: withDisposition.length > 0,
    hasOpenCritical,
  };
}

/**
 * Flag code to accept for a fill — desk + wizard parity.
 * Prefer open critical; else first unresolved reason.
 */
export function resolveOpenFlagCodeForAccept(
  entry: FuelEntry,
  dispositions?: FuelFlagDispositionMap,
): string | null {
  const c = classifyFuelFillFlags(entry, { dispositions });
  const openCritical = c.reasons.find((r) => r.severity === 'critical' && !r.resolved);
  if (openCritical) return openCritical.code;
  const firstOpen = c.reasons.find((r) => !r.resolved);
  return firstOpen?.code ?? null;
}

/** All unresolved reason codes on a fill (desk edit → corrected). */
export function listOpenFlagCodesForEntry(
  entry: FuelEntry,
  dispositions?: FuelFlagDispositionMap,
): string[] {
  return classifyFuelFillFlags(entry, { dispositions })
    .reasons.filter((r) => !r.resolved)
    .map((r) => r.code);
}

/** Week cleared when SQL recon period is locked. */
export function isFuelFillFlagWeekCleared(period: {
  status?: string | null;
  lockedAt?: string | null;
} | null | undefined): boolean {
  return isFuelReconPeriodLocked(period);
}

export type FuelFlagRowStatus = 'open' | 'resolved' | 'cleared_by_lock';

export type FuelFlagDeskRow = FuelFillFlagClassification & {
  entry: FuelEntry;
  /** @deprecated use status — true when not open (legacy Cleared filter). */
  cleared: boolean;
  status: FuelFlagRowStatus;
  plate: string;
  driverName: string;
};

function resolveDeskRowStatus(
  classification: FuelFillFlagClassification,
  weekLocked: boolean,
): FuelFlagRowStatus {
  const openReasons = classification.reasons.filter((r) => !r.resolved);
  if (openReasons.length === 0 && classification.reasons.length > 0) return 'resolved';
  if (weekLocked) return 'cleared_by_lock';
  return 'open';
}

/**
 * Build desk rows for a period window: monitor-flagged fills only.
 */
export function buildFuelFlagDeskRows(
  entries: FuelEntry[],
  opts: {
    weekStartYmd: string;
    weekEndYmd: string;
    weekLocked: boolean;
    outlierEntryIds?: ReadonlySet<string>;
    dispositions?: FuelFlagDispositionMap;
    plateByVehicleId?: Map<string, string>;
    driverNameById?: Map<string, string>;
  },
): FuelFlagDeskRow[] {
  const rows: FuelFlagDeskRow[] = [];
  for (const entry of entries) {
    const day = toEntryYmd(entry.date);
    if (day < opts.weekStartYmd || day > opts.weekEndYmd) continue;
    const classification = classifyFuelFillFlags(entry, {
      outlierEntryIds: opts.outlierEntryIds,
      dispositions: opts.dispositions,
    });
    if (!classification.isFlagged) continue;
    const plate = entry.vehicleId
      ? opts.plateByVehicleId?.get(entry.vehicleId) || entry.vehicleId.slice(0, 8)
      : '—';
    const driverName = entry.driverId
      ? opts.driverNameById?.get(entry.driverId) || 'Unknown driver'
      : 'Unknown driver';
    const status = resolveDeskRowStatus(classification, opts.weekLocked);
    rows.push({
      ...classification,
      entry,
      cleared: status !== 'open',
      status,
      plate,
      driverName,
    });
  }
  return rows.sort((a, b) => {
    const sev = SEVERITY_RANK[b.primarySeverity] - SEVERITY_RANK[a.primarySeverity];
    if (sev !== 0) return sev;
    return b.dateYmd.localeCompare(a.dateYmd);
  });
}

export type FuelFlagLegendDetailRow = {
  flag: string;
  meaning: string;
};

export type FuelFlagCategoryLegendItem = {
  id: FuelFillFlagCategory;
  title: string;
  body: string;
  detailTitle: string;
  rows: FuelFlagLegendDetailRow[];
  bulletsTitle?: string;
  bullets?: string[];
  note?: string;
};

export const FUEL_FLAG_CATEGORY_LEGEND: FuelFlagCategoryLegendItem[] = [
  {
    id: 'Integrity',
    title: 'Integrity / exception',
    body: 'Problem fills — exception, integrity warnings, flagged capacity issues, location anomaly.',
    detailTitle: 'Integrity / exception',
    rows: [
      {
        flag: 'Exception',
        meaning:
          'Hard problem fill (signalTier: exception) — blocks Finalize until dispositioned.',
      },
      {
        flag: 'Integrity critical',
        meaning: 'Auto rules said this fill is badly wrong (see reasons below).',
      },
      {
        flag: 'Integrity warning',
        meaning: 'Suspicious but milder.',
      },
      {
        flag: 'isFlagged',
        meaning: 'Generic “this fill is flagged” (capacity/outlier style).',
      },
      {
        flag: 'Location anomaly',
        meaning: 'GPS/station match looks wrong for this fill.',
      },
    ],
    bulletsTitle: 'Integrity / anomaly reasons the backend writes',
    bullets: [
      'Tank overflow (one fill bigger than tank)',
      'Soft anchor / tank overfill',
      'High fuel consumption (efficiency way off)',
      'High transaction frequency',
      'Fragmented purchase (tiny liters, e.g. <5L)',
      'Approaching capacity',
      'High fuel velocity ($/km)',
    ],
  },
  {
    id: 'Outlier',
    title: 'Price outliers',
    body: 'Paid $/L high versus this station’s recent median for the period.',
    detailTitle: 'Price outliers',
    rows: [
      {
        flag: 'Station median outlier',
        meaning: 'Paid $/L is high versus this station’s recent median for the period.',
      },
    ],
    note: 'Computed for the selected period and stamped as Outlier on matching fills.',
  },
];

export const FUEL_FLAG_RECON_NOTE =
  'Week health and lock blockers (disputes, unexplained $, thin odometer) → Week Reconciliation.';
