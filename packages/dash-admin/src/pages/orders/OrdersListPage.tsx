import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { listOrders, type DashOrderRow } from '@roam/dash-admin-client';
import { useUrlParam } from '../../components/SegmentTabs';
import { PageHeader } from '../../components/ui/PageHeader';
import { DataTable, downloadCsv } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { EntityDrawer } from '../../components/ui/bits';
import { formatMoney, formatRelative } from '../../components/ui/format';
import type { AdminOutletContext } from '../../DashAdminPortal';

const VIEWS = ['all', 'in-flight', 'unassigned', 'attention', 'cancelled'] as const;
type ViewId = typeof VIEWS[number];

export function OrdersListPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useUrlParam<ViewId>('view', (params.get('status') === 'live' ? 'in-flight' : 'all') as ViewId, VIEWS);
  const [page, setPage] = useState(Number(params.get('page') || '1'));
  const [q, setQ] = useState(params.get('q') || '');
  const [from, setFrom] = useState(params.get('from') || '');
  const [to, setTo] = useState(params.get('to') || '');
  const [orders, setOrders] = useState<DashOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [peek, setPeek] = useState<DashOrderRow | null>(null);
  const customerId = params.get('customer_id') || '';
  const courierType = params.get('type') === 'courier';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listOrders(session.access_token, {
        status: view === 'in-flight' || view === 'unassigned' ? 'live' : view === 'cancelled' ? 'cancelled' : undefined,
        unassigned: view === 'unassigned' || undefined,
        attention: view === 'attention' || undefined,
        has_courier: courierType || undefined,
        customer_id: customerId || undefined,
        q: q || undefined,
        from: from || undefined,
        to: to || undefined,
        page,
        limit: 50,
      });
      setOrders(res.orders);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load orders');
      toast.error(e instanceof Error ? e.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [session.access_token, view, q, from, to, page, customerId, courierType]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  function chooseView(next: ViewId) {
    setView(next);
    setPage(1);
    const updated = new URLSearchParams(params);
    updated.set('view', next);
    updated.delete('status');
    updated.delete('page');
    setParams(updated, { replace: false });
  }

  const pageCount = Math.max(1, Math.ceil(total / 50));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Orders"
        description="Every Rush order across all markets."
        actions={
          <button
            type="button"
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200"
            onClick={() => downloadCsv(
              'orders.csv',
              ['order', 'merchant', 'customer', 'status', 'total', 'placed'],
              orders.map((row) => [
                row.order_number,
                row.merchant?.name || '',
                row.customer?.name || '',
                row.status,
                String(row.total),
                row.placed_at,
              ]),
            )}
          >
            Export
          </button>
        }
        tabs={VIEWS.map((id) => ({ id, label: id === 'in-flight' ? 'In flight' : id === 'attention' ? 'Needs attention' : id[0].toUpperCase() + id.slice(1) }))}
        activeTab={view}
        onTab={(id) => chooseView(id as ViewId)}
      />
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => {
            const next = e.target.value;
            setQ(next);
            setPage(1);
            const updated = new URLSearchParams(params);
            if (next) updated.set('q', next); else updated.delete('q');
            updated.delete('page');
            setParams(updated, { replace: true });
          }}
          placeholder="Search order number or address"
          className="min-w-48 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
        <input type="date" value={from} onChange={(e) => {
          setFrom(e.target.value); setPage(1);
          const updated = new URLSearchParams(params);
          if (e.target.value) updated.set('from', e.target.value); else updated.delete('from');
          updated.delete('page');
          setParams(updated, { replace: true });
        }} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
        <input type="date" value={to} onChange={(e) => {
          setTo(e.target.value); setPage(1);
          const updated = new URLSearchParams(params);
          if (e.target.value) updated.set('to', e.target.value); else updated.delete('to');
          updated.delete('page');
          setParams(updated, { replace: true });
        }} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
      </div>
      <DataTable
        columns={[
          { key: 'order', header: 'Order', cell: (row) => <span className="text-white font-medium">{row.order_number}</span> },
          { key: 'merchant', header: 'Merchant', cell: (row) => row.merchant?.name || '—' },
          { key: 'customer', header: 'Customer', cell: (row) => row.customer?.name || '—' },
          { key: 'courier', header: 'Courier', cell: (row) => row.courier_display_name || '—' },
          { key: 'market', header: 'Market', cell: (row) => row.market_name || '—' },
          { key: 'payment', header: 'Payment', cell: (row) => row.payment_method || row.payment_status || '—' },
          { key: 'status', header: 'Status', cell: (row) => <StatusBadge value={row.status} /> },
          { key: 'total', header: 'Total', cell: (row) => formatMoney(row.total) },
          { key: 'placed', header: 'Placed', cell: (row) => <span title={formatRelative(row.placed_at).absolute}>{formatRelative(row.placed_at).label}</span> },
        ]}
        rows={orders}
        loading={loading}
        error={error}
        emptyTitle="No orders in this view"
        page={page}
        pageCount={pageCount}
        onPage={(next) => {
          setPage(next);
          const updated = new URLSearchParams(params);
          updated.set('page', String(next));
          setParams(updated, { replace: true });
        }}
        onRow={setPeek}
        totalLabel={`${total} orders`}
      />
      <EntityDrawer open={!!peek} title={peek?.order_number || 'Order'} onClose={() => setPeek(null)}>
        {peek && (
          <div className="space-y-3 text-sm text-slate-300">
            <StatusBadge value={peek.status} />
            <p>{peek.merchant?.name || 'Merchant unknown'}</p>
            <p>{peek.customer?.name || 'Customer unknown'}</p>
            <p>{formatMoney(peek.total)}</p>
            <button type="button" className="text-amber-300" onClick={() => navigate(`/orders/${peek.id}`)}>Open the full order</button>
          </div>
        )}
      </EntityDrawer>
    </div>
  );
}
