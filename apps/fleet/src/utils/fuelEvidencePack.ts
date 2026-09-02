/**
 * One-click evidence pack for auditors (strip + settlement + notes).
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

export function downloadFuelEvidencePack(input: FuelEvidencePackInput): void {
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
  void downloadCSV(rows, `fuel-evidence-${input.weekStart}.csv`);
}
