import React, { useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import type { PaymentLedgerLine } from '@roam/types/paymentLedgerLine';
import { api } from '../../../services/api';
import { linesToUberCsv } from '../../../utils/exportUberPaymentLinesCsv';

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

interface PaymentLinesPanelProps {
  tripId: string;
  batchId?: string;
  platform?: string;
}

export function PaymentLinesPanel({ tripId, batchId, platform }: PaymentLinesPanelProps) {
  const [lines, setLines] = useState<PaymentLedgerLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const res = await api.getPaymentLedgerLines({
          tripId,
          batchId,
          platform: platform === 'Roam' ? 'Roam' : undefined,
        });
        if (!cancelled) setLines(res.data || []);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load payment lines');
          setLines([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [tripId, batchId, platform]);

  if (platform && platform !== 'Uber' && platform !== 'Roam') {
    return null;
  }

  const handleUberExport = () => {
    if (lines.length === 0) {
      toast.error('No payment lines to export');
      return;
    }
    const csv = linesToUberCsv(lines);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `uber_payment_lines_${tripId.slice(0, 8)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${lines.length} payment line(s)`);
  };

  return (
    <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-4">
      <div className="flex items-center justify-between mb-2">
        <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Payment lines
        </h5>
        {lines.length > 0 && (
          <button
            type="button"
            onClick={handleUberExport}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            <Download className="h-3.5 w-3.5" />
            Uber CSV
          </button>
        )}
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : error ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">{error}</p>
      ) : lines.length === 0 ? (
        <p className="text-sm text-slate-500">No payment ledger lines for this trip.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-left text-slate-600 dark:text-slate-400">
                <th className="px-2 py-2">Reporting</th>
                <th className="px-2 py-2">Description</th>
                <th className="px-2 py-2 text-right">Paid to you</th>
                <th className="px-2 py-2 text-right">Earnings</th>
                <th className="px-2 py-2 text-right">Cash</th>
                <th className="px-2 py-2 text-right">Bank</th>
                <th className="px-2 py-2 text-right">Fare</th>
                <th className="px-2 py-2 text-right">Surge</th>
                <th className="px-2 py-2 text-right">Tip</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {lines.map((line) => (
                <tr key={line.id} className="text-slate-700 dark:text-slate-300">
                  <td className="px-2 py-2 whitespace-nowrap">{formatWhen(line.reportingAt)}</td>
                  <td className="px-2 py-2 max-w-[200px] truncate" title={line.description}>
                    {line.description}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(line.paidToYou)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(line.earningsGross)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(line.cashCollected)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(line.bankTransferred)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(line.fareBreakdown.base)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(line.fareBreakdown.surge)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(line.fareBreakdown.tip)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
