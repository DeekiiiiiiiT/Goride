import { format } from "date-fns";
import type { FinancialTransaction, Trip } from "../types/data";

/**
 * Earliest..latest dates from trip + transaction activity (aligns Earnings History
 * week buckets with Expenses / Settlement, which use the same underlying activity).
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
  const min = Math.min(...ms);
  const max = Math.max(...ms, Date.now());
  return {
    startDate: format(new Date(min), "yyyy-MM-dd"),
    endDate: format(new Date(max), "yyyy-MM-dd"),
  };
}
