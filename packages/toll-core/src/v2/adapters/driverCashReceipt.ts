import type {
  AdapterProblem,
  DriverCashReceiptResult,
  DriverCashRow,
  DriverCashSubmission,
} from './types.ts';

export function driverCashReceipt(submission: DriverCashSubmission): DriverCashReceiptResult {
  const problems: AdapterProblem[] = [];
  const rows: DriverCashRow[] = [];

  if (!submission.receiptUrl?.trim()) {
    problems.push({ row: 1, reason: 'Receipt URL is required' });
    return { kind: 'driver_cash', rows, problems };
  }

  const sourceRef = submission.receiptNumber?.trim()
    ? `receipt:${submission.receiptNumber.trim()}`
  : `submission:${submission.submissionId}`;

  const row: DriverCashRow = {
    source_ref: sourceRef,
    occurred_at: submission.occurredAt,
    amount_minor: submission.amountMinor,
    plaza_id: submission.plazaId,
    vehicle_id: submission.vehicleId,
    driver_id: submission.driverId,
    evidence_status: 'unverified',
    evidence: {
      receipt_url: submission.receiptUrl.trim(),
      plaza: submission.plaza,
      lane: submission.lane,
      collector: submission.collector,
      vehicleClass: submission.vehicleClass,
    },
  };
  rows.push(row);

  return { kind: 'driver_cash', rows, problems };
}
