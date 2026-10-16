import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import {
  approveMenuPriceReview,
  listMenuPriceReviews,
  rejectMenuPriceReview,
  type MenuPriceChangeRequest,
} from '@roam/dash-admin-client';
import { canWriteDashAdmin } from '../utils/dashAdminRoles';
import { formatMoney } from '../components/ui/format';
import type { AdminOutletContext } from '../DashAdminPortal';

/** Ops queue for partner menu price rises above partner.menu.price_change_review_pct. */
export function MenuPriceReviewsPage({ embedded = false }: { embedded?: boolean }) {
  const { session } = useOutletContext<AdminOutletContext>();
  const canWrite = canWriteDashAdmin(session.user);
  const [rows, setRows] = useState<MenuPriceChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const res = await listMenuPriceReviews(session.access_token, 'pending');
      setRows(res.requests ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load price reviews.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.access_token]);

  async function approve(id: string) {
    setBusyId(id);
    try {
      await approveMenuPriceReview(session.access_token, id);
      toast.success('Price approved and applied.');
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approve failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    setBusyId(id);
    try {
      await rejectMenuPriceReview(session.access_token, id);
      toast.success('Price change rejected.');
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reject failed.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-4 p-1'}>
      {!embedded ? (
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Menu price reviews</h1>
          <p className="mt-1 text-sm text-slate-400">
            Partner price increases above the{' '}
            <code className="text-slate-300">partner.menu.price_change_review_pct</code> setting wait
            here until ops approve or reject. Set that threshold to 0 to skip review.
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-400">
          Increases above <code className="text-slate-300">partner.menu.price_change_review_pct</code>{' '}
          stay on the live menu until you approve. Threshold 0 means no review.
        </p>
      )}

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-400">Loading…</p> : null}
      {!loading && rows.length === 0 ? (
        <p className="text-sm text-slate-500">No pending price rises.</p>
      ) : null}

      <ul className="space-y-3">
        {rows.map((row) => {
          const merchantName =
            (row.merchant && typeof row.merchant === 'object' && 'name' in row.merchant
              ? String((row.merchant as { name?: string }).name || '')
              : '') || 'Merchant';
          const itemName = row.item_name || 'Menu item';
          return (
            <li key={row.id} className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-100">
                    {itemName}
                    <span className="text-slate-500"> · {merchantName}</span>
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    {formatMoney(Number(row.old_price))} → {formatMoney(Number(row.new_price))}
                    <span className="text-amber-300"> (+{Number(row.pct_increase).toFixed(1)}%)</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Requested {new Date(row.created_at).toLocaleString()}
                  </p>
                </div>
                {canWrite ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-sm text-emerald-300 disabled:opacity-40"
                      onClick={() => void approve(row.id)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      className="rounded-lg bg-red-500/15 px-3 py-1.5 text-sm text-red-300 disabled:opacity-40"
                      onClick={() => void reject(row.id)}
                    >
                      Reject
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
