import { useEffect, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { fetchPricingAudit, listMerchantAudit } from '@roam/dash-admin-client';
import { useUrlParam } from '../../components/SegmentTabs';
import { PageHeader } from '../../components/ui/PageHeader';
import { UsersAuditPage } from '../users/UsersAuditPage';
import type { AdminOutletContext } from '../../DashAdminPortal';

const SOURCES = ['staff', 'pricing', 'merchant'] as const;

type Row = { id: string; when: string; who: string; action: string; record: string };

export function AuditHubPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const [params, setParams] = useSearchParams();
  const [source, setSource] = useUrlParam('source', 'staff', SOURCES, 'push');
  const q = params.get('q') || '';
  const entity = params.get('entity') || '';
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const [rows, setRows] = useState<Row[]>([]);

  function write(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  useEffect(() => {
    if (source === 'staff') return;
    const filters = { q: q || undefined, from: from || undefined, to: to || undefined };
    const load = source === 'pricing'
      ? fetchPricingAudit(session.access_token, filters)
      : listMerchantAudit(session.access_token, filters);
    void load
      .then((res) => {
        const list = res.entries ?? [];
        const mapped = list.map((row, index) => ({
          id: String(row.id || index),
          when: String(row.created_at || ''),
          who: String(row.actor_email || row.actor_id || '—'),
          action: String(row.action || 'Change'),
          record: String(row.store_name || row.merchant_id || row.market_id || row.scope || '—'),
        }));
        const needle = entity.trim().toLowerCase();
        setRows(needle ? mapped.filter((row) => `${row.record} ${row.who}`.toLowerCase().includes(needle)) : mapped);
      })
      .catch(() => setRows([]));
  }, [source, session.access_token, q, entity, from, to]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit log"
        description="When it happened, who did it, what changed, and which record."
        tabs={[
          { id: 'staff', label: 'Staff' },
          { id: 'pricing', label: 'Pricing' },
          { id: 'merchant', label: 'Merchant' },
        ]}
        activeTab={source}
        onTab={(id) => setSource(id as typeof SOURCES[number])}
      />
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => write('q', e.target.value)} placeholder="Person or action" className="min-w-40 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
        <input value={entity} onChange={(e) => write('entity', e.target.value)} placeholder="Record" className="min-w-40 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
        <input type="date" value={from} onChange={(e) => write('from', e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
        <input type="date" value={to} onChange={(e) => write('to', e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
      </div>
      {source === 'staff' ? <UsersAuditPage embedded /> : (
        <ul className="space-y-2 text-sm text-slate-300">
          {rows.length === 0 ? <li className="text-slate-500">Nothing in this range.</li> : rows.map((row) => (
            <li key={row.id} className="grid gap-1 rounded-xl border border-slate-800 px-3 py-2 sm:grid-cols-4">
              <span>{row.when ? new Date(row.when).toLocaleString() : '—'}</span>
              <span>{row.who}</span>
              <span>{row.action}</span>
              <span>{row.record}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
