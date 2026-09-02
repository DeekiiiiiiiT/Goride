/**
 * One-click evidence pack for auditors (strip + settlement + notes).
 * Server JSON is canonical; client CSV is offline fallback.
 */
import { downloadCSV } from './export';
import { formatFuelMoney } from './formatFuelMoney';

export type FuelEvidencePackInput = {
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  strip: {
    totalSpend: number;
    gasCard: number;
    cashFromEarnings: number;
    company: number;
    driver: number;
    leakage: number;
  };
  settlementRows: Array<{
    plate: string;
    cashFromEarnings: number;
    driverShare: number;
    netPay: number;
    status?: string;
  }>;
  openDisputeCount: number;
  leakageReviewed: boolean;
  stepNotes?: Array<{ step: string; note: string; at: string }>;
  secondApproverConfirmed?: boolean;
};

export function buildFuelEvidenceCsvRows(
  input: FuelEvidencePackInput,
): Record<string, string | number>[] {
  const rows: Record<string, string | number>[] = [
    {
      section: 'summary',
      week: input.weekLabel,
      weekStart: input.weekStart,
      weekEnd: input.weekEnd,
      totalSpend: formatFuelMoney(input.strip.totalSpend),
      gasCard: formatFuelMoney(input.strip.gasCard),
      cashFromEarnings: formatFuelMoney(input.strip.cashFromEarnings),
      company: formatFuelMoney(input.strip.company),
      driver: formatFuelMoney(input.strip.driver),
      unexplained: formatFuelMoney(input.strip.leakage),
      openDisputes: input.openDisputeCount,
      unexplainedReviewed: input.leakageReviewed ? 'yes' : 'no',
      secondApprover: input.secondApproverConfirmed ? 'yes' : 'n/a',
    },
  ];
  for (const r of input.settlementRows) {
    rows.push({
      section: 'settlement',
      plate: r.plate,
      cashFromEarnings: formatFuelMoney(r.cashFromEarnings),
      driverShare: formatFuelMoney(r.driverShare),
      netPay: formatFuelMoney(r.netPay),
      status: r.status || '',
    });
  }
  for (const n of input.stepNotes || []) {
    rows.push({
      section: 'note',
      step: n.step,
      note: n.note,
      at: n.at,
    });
  }
  return rows;
}

export function downloadFuelEvidencePack(input: FuelEvidencePackInput): void {
  void downloadCSV(buildFuelEvidenceCsvRows(input), `fuel-evidence-${input.weekStart}.csv`);
}

/** Shape server evidence-pack JSON into the accountant CSV (Wave E). */
export function downloadFuelEvidencePackFromServer(args: {
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  pack: {
    period?: Record<string, unknown>;
    audit?: Array<Record<string, unknown>>;
    snapshots?: Array<Record<string, unknown>>;
  };
  fallbackStrip?: FuelEvidencePackInput['strip'];
  secondApproverConfirmed?: boolean;
}): void {
  const p = args.pack.period || {};
  const snaps = Array.isArray(args.pack.snapshots) ? args.pack.snapshots : [];
  const settlementRows = snaps.map((s) => {
    const cash = Number(s.driverSpend) || 0;
    const driverShare = Number(s.driverShare) || 0;
    return {
      plate: String(s.vehiclePlate || s.vehicleId || s.driverId || ''),
      cashFromEarnings: cash,
      driverShare,
      netPay: cash - driverShare,
      status: 'locked',
    };
  });
  const strip = {
    totalSpend: Number(p.totalSpend) || args.fallbackStrip?.totalSpend || 0,
    gasCard: Number(p.gasCardSpend) || args.fallbackStrip?.gasCard || 0,
    cashFromEarnings: Number(p.cashFromEarnings) || args.fallbackStrip?.cashFromEarnings || 0,
    company: Number(p.companyShare) || args.fallbackStrip?.company || 0,
    driver: Number(p.driverShare) || args.fallbackStrip?.driver || 0,
    leakage: Number(p.unexplained) || args.fallbackStrip?.leakage || 0,
  };
  const stepNotes = (args.pack.audit || [])
    .filter((a) => a.action === 'step' || a.action === 'leakage_review' || a.action === 'second_approve')
    .map((a) => {
      const payload = (a.payload && typeof a.payload === 'object' ? a.payload : {}) as Record<
        string,
        unknown
      >;
      const source = String(payload.source || '');
      const systemLabel =
        source === 'ui_service_approve'
          ? ' [system: ui_service_approve]'
          : source === 'auto_close_service'
            ? ' [system: auto_close_service]'
            : '';
      return {
        step: String(a.action || ''),
        note: `${String(payload.note || a.payload || '')}${systemLabel}`.trim() || systemLabel.trim(),
        at: String(a.at || ''),
      };
    });
  downloadFuelEvidencePack({
    weekLabel: args.weekLabel,
    weekStart: args.weekStart,
    weekEnd: args.weekEnd,
    strip,
    settlementRows,
    openDisputeCount: 0,
    leakageReviewed: Boolean(p.leakageReviewedAt),
    stepNotes,
    secondApproverConfirmed: args.secondApproverConfirmed,
  });
}
