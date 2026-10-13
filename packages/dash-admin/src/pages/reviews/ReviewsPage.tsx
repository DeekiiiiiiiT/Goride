import { useEffect, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { hideReview, listReviews } from '@roam/dash-admin-client';
import { canWriteDashAdmin } from '../../utils/dashAdminRoles';
import type { AdminOutletContext } from '../../DashAdminPortal';

export function ReviewsPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const canWrite = canWriteDashAdmin(session.user);
  const [params, setParams] = useSearchParams();
  const rating = params.get('rating') || '';
  const hidden = params.get('hidden') || '';
  const store = params.get('store') || '';
  const page = Number(params.get('page') || '1');
  const [reviews, setReviews] = useState<Array<Record<string, unknown>>>([]);
  const [total, setTotal] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  function write(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  }

  const load = () => {
    setLoading(true);
    void listReviews(session.access_token, {
      rating: rating || undefined,
      hidden: hidden || undefined,
      page,
    })
      .then((res) => {
        const needle = store.trim().toLowerCase();
        const list = res.reviews ?? [];
        setReviews(needle ? list.filter((row) => String(row.store_name || '').toLowerCase().includes(needle)) : list);
        setTotal(res.total ?? list.length);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [session.access_token, rating, hidden, page]);

  const pageCount = Math.max(1, Math.ceil(total / 50));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select value={rating} onChange={(e) => write('rating', e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">
          <option value="">Any rating</option>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={String(n)}>{n} stars</option>)}
        </select>
        <select value={hidden} onChange={(e) => write('hidden', e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">
          <option value="">Shown and hidden</option>
          <option value="visible">Shown</option>
          <option value="hidden">Hidden</option>
        </select>
        <input value={store} onChange={(e) => write('store', e.target.value)} placeholder="Store" className="min-w-40 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
      </div>
      {canWrite && picked.length > 0 && (
        <button
          type="button"
          className="text-sm text-amber-300"
          onClick={() => {
            void Promise.all(picked.map((id) => hideReview(session.access_token, id, true))).then(() => {
              setPicked([]);
              load();
            });
          }}
        >
          Hide selected
        </button>
      )}
      {loading ? <p className="text-sm text-slate-400">Loading reviews…</p> : null}
      {!loading && reviews.length === 0 ? <p className="text-sm text-slate-500">No reviews.</p> : null}
      {reviews.map((r) => (
        <div key={String(r.id)} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex justify-between gap-2">
            <span className="text-white text-sm">{String(r.store_name || r.order_number || 'Store')}</span>
            <span className="text-amber-400 text-sm">{'★'.repeat(Number(r.customer_rating || 0))}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">{String(r.courier_name || 'No courier')} · {String(r.order_number || '')}</p>
          <p className="text-sm text-slate-400 mt-2">{String(r.customer_review || '')}</p>
          {canWrite && (
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={picked.includes(String(r.id))}
                onChange={(event) => {
                  const id = String(r.id);
                  setPicked((current) => event.target.checked ? [...current, id] : current.filter((item) => item !== id));
                }}
              />
              Select
            </label>
          )}
          {canWrite && (
            <button
              type="button"
              onClick={async () => {
                await hideReview(session.access_token, String(r.id), !r.review_hidden);
                load();
              }}
              className="mt-2 text-xs text-slate-500 hover:text-white"
            >
              {r.review_hidden ? 'Unhide' : 'Hide'} review
            </button>
          )}
        </div>
      ))}
      {pageCount > 1 && (
        <div className="flex gap-2 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => write('page', String(page - 1))} className="rounded-lg border border-slate-700 px-3 py-1 text-slate-200">Previous</button>
          <span className="text-slate-400">{page} of {pageCount}</span>
          <button type="button" disabled={page >= pageCount} onClick={() => write('page', String(page + 1))} className="rounded-lg border border-slate-700 px-3 py-1 text-slate-200">Next</button>
        </div>
      )}
    </div>
  );
}
