/** Client-derived package mission stages — Receive → Deliver. */

export const PACKAGE_MISSION_STAGE_IDS = [
  'receive',
  'invoice',
  'duty',
  'bill',
  'clear',
  'deliver',
] as const;

export type PackageMissionStageId = (typeof PACKAGE_MISSION_STAGE_IDS)[number];

export type PackageMissionStage = {
  id: PackageMissionStageId;
  label: string;
  done: boolean;
  summary: string;
};

export type PackageMissionDeriveResult = {
  stages: PackageMissionStage[];
  currentStageId: PackageMissionStageId;
  primaryAction: string;
};

const PRIMARY_ACTION: Record<PackageMissionStageId, string> = {
  receive: 'Receive package at US freight forwarder',
  invoice: 'Upload / verify customer commercial invoice',
  duty: 'Calculate landed cost / duty',
  bill: 'Generate consolidated billing invoice',
  clear: 'Clear customs lanes',
  deliver: 'Complete last-mile delivery',
};

const LABELS: Record<PackageMissionStageId, string> = {
  receive: 'Receive',
  invoice: 'Invoice',
  duty: 'Duty',
  bill: 'Bill',
  clear: 'Clear',
  deliver: 'Deliver',
};

export function derivePackageMission(
  pkg: Record<string, unknown> | null | undefined,
  duty: Record<string, unknown> | null | undefined,
  scanEvents: Record<string, unknown>[] | undefined,
  invoices: Record<string, unknown>[] | undefined,
): PackageMissionDeriveResult {
  const status = String(pkg?.status ?? '');
  const scans = scanEvents ?? [];
  const hasReceiveScan = scans.some(
    (ev) => String(ev.event_type || '') === 'received_at_warehouse',
  );
  const receiveDone = Boolean(status && status !== 'expected') || hasReceiveScan;

  const invoiceDone = Boolean(pkg?.invoice_verified_at || pkg?.invoice_unobtainable_at);
  const dutyDone = Boolean(duty?.computed_at || duty?.id || duty?.total_duty_usd_minor != null);
  const packageInvoices = (invoices ?? []).filter(
    (inv) => String(inv.package_id ?? '') === String(pkg?.id ?? ''),
  );
  const billDone = packageInvoices.length > 0;
  const clearDone = status === 'customs_cleared';
  const deliverDone = status === 'delivered' || status === 'collected';

  const stages: PackageMissionStage[] = [
    {
      id: 'receive',
      label: LABELS.receive,
      done: receiveDone,
      summary: receiveDone
        ? `Received · ${status.replace(/_/g, ' ') || 'at freight forwarder'}`
        : 'Waiting for US receive',
    },
    {
      id: 'invoice',
      label: LABELS.invoice,
      done: invoiceDone,
      summary: pkg?.invoice_verified_at
        ? 'Customer commercial invoice verified'
        : pkg?.invoice_unobtainable_at
          ? 'Customer invoice marked unobtainable'
          : pkg?.invoice_file_name || pkg?.invoice_storage_path
            ? 'Customer commercial invoice on hand — verify for seal'
            : 'Needs customer commercial invoice (seal gate)',
    },
    {
      id: 'duty',
      label: LABELS.duty,
      done: dutyDone,
      summary: dutyDone ? 'Duty snapshot ready' : 'No duty snapshot yet',
    },
    {
      id: 'bill',
      label: LABELS.bill,
      done: billDone,
      summary: billDone
        ? `Billing ${String(packageInvoices[0]?.invoice_number ?? packageInvoices[0]?.id ?? '').slice(0, 24)}`
        : 'No consolidated billing invoice yet',
    },
    {
      id: 'clear',
      label: LABELS.clear,
      done: clearDone,
      summary:
        status === 'customs_hold'
          ? 'On customs hold'
          : clearDone
            ? 'Customs cleared'
            : 'Not cleared yet',
    },
    {
      id: 'deliver',
      label: LABELS.deliver,
      done: deliverDone,
      summary: deliverDone
        ? status.replace(/_/g, ' ')
        : status === 'ready_for_fulfillment' || status === 'received_hub'
          ? `At ${status.replace(/_/g, ' ')}`
          : 'Not delivered yet',
    },
  ];

  const current =
    stages.find((s) => !s.done)?.id ??
    (deliverDone ? 'deliver' : stages[stages.length - 1].id);

  return {
    stages,
    currentStageId: current,
    primaryAction: PRIMARY_ACTION[current],
  };
}
