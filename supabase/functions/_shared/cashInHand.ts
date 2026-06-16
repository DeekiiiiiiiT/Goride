/** Physical cash the driver entered at settlement — never the trip fare. */
export function cashReceivedMinorFromTripRow(row: Record<string, unknown>): number {
  const method = row.payment_method as string | null;
  if (String(row.status) !== "completed" || method === "card") return 0;

  const raw = row.cash_received_minor;
  if (raw != null && Number.isFinite(Number(raw))) {
    return Math.max(0, Math.floor(Number(raw)));
  }

  const snap = row.cash_settlement_snapshot;
  if (snap && typeof snap === "object" && snap !== null) {
    const received = (snap as Record<string, unknown>).cash_received_minor;
    if (received != null && Number.isFinite(Number(received))) {
      return Math.max(0, Math.floor(Number(received)));
    }
  }

  return 0;
}
