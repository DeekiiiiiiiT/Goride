import { useEffect, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { getConsoleSummary } from '@roam/dash-admin-client';
import { PageHeader } from '../../components/ui/PageHeader';
import { downloadCsv } from '../../components/ui/DataTable';
import { formatMoney } from '../../components/ui/format';
import type { AdminOutletContext } from '../../DashAdminPortal';

function jamToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Jamaica' }).format(new Date());
}

export function ReportsPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const [params, setParams] = useSearchParams();
  const today = jamToday();
  const from = params.get('from') || today;
  const to = params.get('to') || today;
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getConsoleSummary>> | null>(null);

  function write(key: 'from' | 'to', value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  }

  useEffect(() => {
    void getConsoleSummary(session.access_token, { from, to }).then(setSummary).catch(() => setSummary(null));
  }, [session.access_token, from, to]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports"
        description="Orders and sales for the dates you pick, next to the stretch just before."
        actions={summary ? (
          <button
            type="button"
            className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950"
            onClick={() => downloadCsv(
              'rush-report.csv',
              ['market', 'orders', 'sales', 'orders before', 'sales before'],
              summary.byMarket.map((row) => [row.name, String(row.orders), String(row.gmv), String(row.ordersPrevious ?? ''), String(row.gmvPrevious ?? '')]),
            )}
          >
            Export
          </button>
        ) : null}
      />
      <div className="flex flex-wrap gap-2">
        <input type="date" value={from} onChange={(e) => write('from', e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
        <input type="date" value={to} onChange={(e) => write('to', e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
      </div>
      {!summary ? <p className="text-sm text-slate-400">Reports are not available yet.</p> : (
        <ul className="space-y-2 text-sm text-slate-200">
          {summary.byMarket.map((row) => (
            <li key={row.name} className="flex flex-wrap justify-between gap-2 rounded-xl border border-slate-800 px-3 py-2">
              <span>{row.name}</span>
              <span>{row.orders} · {formatMoney(row.gmv)}</span>
              <span className="text-slate-400">before {row.ordersPrevious ?? 0} · {formatMoney(row.gmvPrevious ?? 0)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
