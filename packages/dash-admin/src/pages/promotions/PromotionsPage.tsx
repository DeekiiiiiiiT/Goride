import React, { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Loader2, Tag } from 'lucide-react';
import { toast } from 'sonner';
import {
  createPromotion,
  listMerchants,
  listPromotions,
  setPromotionStatus,
} from '@roam/dash-admin-client';
import { canWriteDashAdmin } from '../../utils/dashAdminRoles';
import type { AdminOutletContext } from '../../DashAdminPortal';

type PromoType = 'percent_off' | 'amount_off' | 'free_delivery';
type PromoStatus = 'active' | 'paused' | 'ended' | 'scheduled';

type PromoRow = {
  id: string;
  merchant_id: string;
  type: string;
  title: string;
  promo_code: string | null;
  discount_percent: number | null;
  discount_amount: number | null;
  min_order: number | null;
  date_start: string;
  date_end: string | null;
  status: string;
  redemptions?: number | null;
};

const TYPE_OPTIONS: { value: PromoType; label: string }[] = [
  { value: 'percent_off', label: '% Off' },
  { value: 'amount_off', label: 'Amount Off' },
  { value: 'free_delivery', label: 'Free Delivery' },
];

function statusBadgeClass(status: string) {
  if (status === 'active') return 'bg-emerald-500/20 text-emerald-300';
  if (status === 'paused') return 'bg-amber-500/20 text-amber-300';
  if (status === 'scheduled') return 'bg-sky-500/20 text-sky-300';
  return 'bg-slate-700 text-slate-300';
}

export function PromotionsPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const canWrite = canWriteDashAdmin(session.user);
  const [promos, setPromos] = useState<PromoRow[]>([]);
  const [merchants, setMerchants] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [filterMerchantId, setFilterMerchantId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [merchantId, setMerchantId] = useState('');
  const [type, setType] = useState<PromoType>('percent_off');
  const [title, setTitle] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [discountValue, setDiscountValue] = useState('20');
  const [minOrder, setMinOrder] = useState('');
  const [dateStart, setDateStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [dateEnd, setDateEnd] = useState('');
  const [creating, setCreating] = useState(false);

  const merchantNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of merchants) map.set(m.id, m.name);
    return map;
  }, [merchants]);

  const refresh = async () => {
    const [promoRes, merchantRes] = await Promise.all([
      listPromotions(
        session.access_token,
        filterMerchantId || undefined,
        filterStatus || undefined,
      ),
      listMerchants(session.access_token, { limit: 200 }).catch(() => ({ merchants: [] })),
    ]);
    setPromos(((promoRes as { promotions?: PromoRow[] }).promotions ?? []) as PromoRow[]);
    const rows = ((merchantRes as { merchants?: Array<Record<string, unknown>> }).merchants ?? [])
      .map((m) => ({
        id: String(m.id),
        name: String(m.name || m.id),
      }))
      .filter((m) => m.id);
    setMerchants(rows);
  };

  useEffect(() => {
    void refresh()
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [session.access_token, filterMerchantId, filterStatus]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) return;
    if (!merchantId.trim() || !title.trim() || !dateStart) {
      toast.error('Merchant, title, and start date are required');
      return;
    }
    if ((type === 'percent_off' || type === 'amount_off') && !discountValue.trim()) {
      toast.error('Enter a discount value');
      return;
    }
    setCreating(true);
    try {
      await createPromotion(session.access_token, {
        merchant_id: merchantId.trim(),
        type,
        title: title.trim(),
        date_start: dateStart,
        date_end: dateEnd || null,
        promo_code: promoCode.trim().toUpperCase() || undefined,
        discount_percent: type === 'percent_off' ? Number(discountValue) : null,
        discount_amount: type === 'amount_off' ? Number(discountValue) : null,
        min_order: minOrder ? Number(minOrder) : null,
        status: 'active',
      });
      setTitle('');
      setPromoCode('');
      setDiscountValue(type === 'percent_off' ? '20' : type === 'amount_off' ? '500' : '');
      setMinOrder('');
      toast.success('Promotion created');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  const setStatus = async (id: string, status: PromoStatus) => {
    if (!canWrite) return;
    setBusyId(id);
    try {
      await setPromotionStatus(session.access_token, id, status);
      toast.success(status === 'active' ? 'Promotion turned on' : status === 'paused' ? 'Promotion paused' : 'Promotion ended');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <Loader2 className="w-8 h-8 animate-spin text-amber-400" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Tag className="w-5 h-5 text-amber-400" />
            Promotions
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Create and turn company or merchant promos on/off. Merchants can also manage their own in Partner.
          </p>
        </div>
        <Link to="/pricing" className="text-sm text-amber-400 hover:underline">
          Launch free-delivery rules → Pricing Hub
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={filterMerchantId}
          onChange={(e) => setFilterMerchantId(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        >
          <option value="">All merchants</option>
          {merchants.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="scheduled">Scheduled</option>
          <option value="ended">Ended</option>
        </select>
      </div>

      {canWrite && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3"
        >
          <h3 className="md:col-span-2 lg:col-span-3 text-sm font-medium text-slate-300">Create promotion</h3>
          <select
            required
            value={merchantId}
            onChange={(e) => setMerchantId(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            <option value="">Select merchant</option>
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            value={type}
            onChange={(e) => {
              const next = e.target.value as PromoType;
              setType(next);
              setDiscountValue(next === 'percent_off' ? '20' : next === 'amount_off' ? '500' : '');
            }}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            required
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
          <input
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
            placeholder="Promo code (optional)"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
          {(type === 'percent_off' || type === 'amount_off') && (
            <input
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder={type === 'percent_off' ? 'Percent' : 'Amount JMD'}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          )}
          <input
            value={minOrder}
            onChange={(e) => setMinOrder(e.target.value)}
            placeholder="Min order JMD (optional)"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
          <input
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            required
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
          <input
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400 disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900 text-left text-slate-400">
            <tr>
              <th className="px-4 py-3">Title / Code</th>
              <th className="px-4 py-3">Merchant</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Dates</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Uses</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {promos.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No promotions yet.
                </td>
              </tr>
            ) : (
              promos.map((p) => (
                <tr key={p.id} className="border-t border-slate-800 text-slate-200">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{p.title}</div>
                    <div className="text-xs text-amber-400/80">{p.promo_code || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    {merchantNameById.get(p.merchant_id) || p.merchant_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3">{p.type}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {String(p.date_start).slice(0, 10)}
                    {p.date_end ? ` → ${String(p.date_end).slice(0, 10)}` : ''}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadgeClass(p.status)}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{Number(p.redemptions ?? 0)}</td>
                  <td className="px-4 py-3">
                    {canWrite && p.status !== 'ended' && (
                      <div className="flex flex-wrap gap-2">
                        {p.status !== 'active' && (
                          <button
                            type="button"
                            disabled={busyId === p.id}
                            onClick={() => void setStatus(p.id, 'active')}
                            className="text-xs text-emerald-400 hover:underline disabled:opacity-50"
                          >
                            Turn on
                          </button>
                        )}
                        {p.status === 'active' && (
                          <button
                            type="button"
                            disabled={busyId === p.id}
                            onClick={() => void setStatus(p.id, 'paused')}
                            className="text-xs text-amber-400 hover:underline disabled:opacity-50"
                          >
                            Pause
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busyId === p.id}
                          onClick={() => void setStatus(p.id, 'ended')}
                          className="text-xs text-slate-400 hover:underline disabled:opacity-50"
                        >
                          End
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
