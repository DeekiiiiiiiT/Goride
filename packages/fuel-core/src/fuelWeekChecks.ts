/**
 * Fuel checks part (audit Part J screens 4, 5): the week's card fills waiting for their
 * statement, and the fill-to-fill stretches flagged "possible fill not scanned" (F-08),
 * with the closes already written. Pure — the route loads fills and dispositions.
 */
import {
  buildFillToFillStretches,
  detectPossibleFillNotScannedFlags,
  type FillAnchor,
} from './possibleFillNotScanned.ts';

export type WeekChecksFill = {
  id?: unknown;
  date?: unknown;
  odometer?: unknown;
  amount?: unknown;
  vehicleId?: unknown;
  vehicle_id?: unknown;
  metadata?: unknown;
};

export type WeekChecksDisposition = {
  entryId: string;
  flagCode: string;
  note: string | null;
  actorId: string | null;
  at: string | null;
};

export type AwaitingCardFill = {
  entryId: string;
  vehicleId: string;
  dateYmd: string;
  odometer: number | null;
  amountSoFar: number;
  daysWaiting: number;
};

export type PossibleFillCheck = {
  /** The disposition key: `stretch:{vehicleId}:{from}:{to}`. */
  flagId: string;
  vehicleId: string;
  startDate: string;
  endDate: string;
  startOdometer: number;
  endOdometer: number;
  stretchKm: number;
  /** The car's usual longest stretch (90th percentile of the prior 8 weeks). */
  p90Km: number;
  closed: WeekChecksDisposition | null;
};

export type WeekStretch = {
  vehicleId: string;
  startDate: string;
  endDate: string;
  km: number;
  flagged: boolean;
};

export type FuelWeekChecks = {
  awaiting: AwaitingCardFill[];
  possibleFills: PossibleFillCheck[];
  /** Fill-to-fill stretches that end in the week, per car (for the stretch chart). */
  stretches: WeekStretch[];
};

function ymd(v: unknown): string {
  return String(v || '').slice(0, 10);
}

function meta(e: WeekChecksFill): Record<string, unknown> {
  return e.metadata && typeof e.metadata === 'object' ? (e.metadata as Record<string, unknown>) : {};
}

function vehicleOf(e: WeekChecksFill): string {
  return String(e.vehicleId || e.vehicle_id || '').trim();
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T12:00:00Z`);
  const b = Date.parse(`${toYmd}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Card statement rows are money, not fills (F-07) — they never count here. */
function isStatementRow(e: WeekChecksFill): boolean {
  return String(meta(e).importSource || '') === 'jaa_raw';
}

export function buildFuelWeekChecks(input: {
  /** Fills from 9 weeks before the week to its end (F-08 lookback). */
  fills: WeekChecksFill[];
  weekStart: string;
  weekEnd: string;
  todayYmd: string;
  dispositions: WeekChecksDisposition[];
}): FuelWeekChecks {
  const { weekStart, weekEnd } = input;
  const fills = input.fills.filter((f) => f && !isStatementRow(f));

  const awaiting: AwaitingCardFill[] = [];
  for (const f of fills) {
    const d = ymd(f.date);
    if (!d || d < weekStart || d > weekEnd) continue;
    if (meta(f).awaitingCardStatement !== true) continue;
    const odo = Number(f.odometer);
    awaiting.push({
      entryId: String(f.id || ''),
      vehicleId: vehicleOf(f),
      dateYmd: d,
      odometer: Number.isFinite(odo) && odo > 0 ? odo : null,
      amountSoFar: Number(f.amount) || 0,
      daysWaiting: daysBetween(d, input.todayYmd),
    });
  }
  awaiting.sort((a, b) => a.dateYmd.localeCompare(b.dateYmd) || a.vehicleId.localeCompare(b.vehicleId));

  const closedById = new Map<string, WeekChecksDisposition>();
  for (const d of input.dispositions) {
    if (d.flagCode === 'possible_fill_not_scanned') closedById.set(d.entryId, d);
  }

  const anchorsByVehicle = new Map<string, FillAnchor[]>();
  for (const f of fills) {
    const vid = vehicleOf(f);
    const odo = Number(f.odometer);
    if (!vid || !Number.isFinite(odo) || odo <= 0) continue;
    const list = anchorsByVehicle.get(vid) || [];
    list.push({
      id: String(f.id || ''),
      date: ymd(f.date),
      odometer: odo,
      awaitingCardStatement: meta(f).awaitingCardStatement === true,
    });
    anchorsByVehicle.set(vid, list);
  }

  const possibleFills: PossibleFillCheck[] = [];
  const stretches: WeekStretch[] = [];
  for (const [vehicleId, anchors] of [...anchorsByVehicle].sort((a, b) => a[0].localeCompare(b[0]))) {
    const flags = detectPossibleFillNotScannedFlags({ vehicleId, anchors, weekStart, weekEnd });
    const flaggedKeys = new Set(flags.map((f) => `${f.startDate}|${f.endDate}|${f.stretchKm}`));
    for (const f of flags) {
      possibleFills.push({
        flagId: f.entryId,
        vehicleId,
        startDate: f.startDate,
        endDate: f.endDate,
        startOdometer: f.startOdometer,
        endOdometer: f.endOdometer,
        stretchKm: f.stretchKm,
        p90Km: f.p90Km,
        closed: closedById.get(f.entryId) || null,
      });
    }
    for (const s of buildFillToFillStretches(anchors)) {
      const end = ymd(s.to.date);
      if (end < weekStart || end > weekEnd) continue;
      const start = ymd(s.from.date);
      stretches.push({
        vehicleId,
        startDate: start,
        endDate: end,
        km: s.km,
        flagged: flaggedKeys.has(`${start}|${end}|${s.km}`),
      });
    }
  }

  return { awaiting, possibleFills, stretches };
}
