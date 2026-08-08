import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/auth/AuthProvider';
import { freightService } from '@/app/services/freightService';

type Tab = 'missing' | 'mismatch' | 'ready';

/** Invoice Audit Queue — wired to /packages/invoice-audit. */
export function InvoiceAuditQueuePage() {
  const [tab, setTab] = useState<Tab>('missing');
  const { organizationId, session } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['freight', 'invoice-audit', organizationId, tab],
    queryFn: () => freightService.invoiceAuditQueue(tab, organizationId),
    enabled: Boolean(session),
  });
  const verify = useMutation({
    mutationFn: (id: string) => freightService.verifyInvoice(id, undefined, organizationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['freight', 'invoice-audit'] });
    },
  });

  const rows = useMemo(() => q.data?.packages ?? [], [q.data]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Invoice Audit</h1>
        <p className="mt-1 text-sm text-slate-500">
          Verify invoices before packages can seal on a flight
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['missing', 'Awaiting Invoice'],
            ['mismatch', 'Unverified'],
            ['ready', 'Ready'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tab === id
                ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {q.isLoading && <p className="text-sm text-slate-500">Loading queue…</p>}
      {q.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(q.error as Error).message}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {!q.isLoading && rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">Queue clear for this tab.</div>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Tracking</th>
                <th className="px-4 py-2">Suite</th>
                <th className="px-4 py-2">Declared USD</th>
                <th className="px-4 py-2">Weight</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const id = String(row.id);
                const suite = row.suites as { suite_code?: string } | null;
                const declared = Number(row.declared_value_usd_minor ?? 0) / 100;
                return (
                  <tr key={id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {String(row.courier_tracking_number ?? '—')}
                    </td>
                    <td className="px-4 py-2.5">{suite?.suite_code ?? '—'}</td>
                    <td className="px-4 py-2.5 tabular-nums">${declared.toFixed(2)}</td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {row.weight_lbs != null ? `${row.weight_lbs} lb` : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          to={`/app/package-duty?id=${id}`}
                          className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
                        >
                          Open
                        </Link>
                        {tab !== 'ready' ? (
                          <button
                            type="button"
                            disabled={verify.isPending}
                            onClick={() => verify.mutate(id)}
                            className="rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-semibold text-slate-950 disabled:opacity-60"
                          >
                            Mark verified
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
