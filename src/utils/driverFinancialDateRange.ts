import { format } from "date-fns";
import type { FinancialTransaction, Trip } from "../types/data";

/**
 * Earliest..latest dates from trip + transaction activity (aligns Earnings History
 * week buckets with Expenses / Settlement, which use the same underlying activity).
 *
 * - Ignores timestamps in the future (bad imports / typos) so we never extend the range past "today".
 * - End date is always capped at today's calendar date so the server does not synthesize future weeks.
 */
export function deriveDriverFinancialDateRange(
  trips: Trip[] | undefined,
  transactions: FinancialTransaction[] | undefined,
): { startDate: string; endDate: string } | null {
  const ms: number[] = [];
  for (const t of trips || []) {
    const raw = t.date || (t as { requestTimestamp?: string }).requestTimestamp;
    if (!raw) continue;
    const d = new Date(String(raw).split("T")[0] + "T12:00:00");
    const x = d.getTime();
    if (!Number.isNaN(x)) ms.push(x);
  }
  for (const tx of transactions || []) {
    const raw = tx.date;
    if (!raw) continue;
    const d = new Date(String(raw).split("T")[0] + "T12:00:00");
    const x = d.getTime();
    if (!Number.isNaN(x)) ms.push(x);
  }
  if (ms.length === 0) return null;

  const now = Date.now();
  const reasonable = ms.filter((x) => x <= now);
  if (reasonable.length === 0) return null;

  const min = Math.min(...reasonable);

  return {
    startDate: format(new Date(min), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
  };
}
