import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Wallet, XCircle } from 'lucide-react';
import type { RiderArrearsRowDto } from '@roam/types/rides';
import {
  formatMoneyMinor,
  getReasonCodes,
  listRidersWithArrears,
  writeoffRiderArrears,
} from '../services/ridesAdminService';

interface OutletContext {
  session: Session;
}

export function OutstandingBalancesPage() {
  const { session } = useOutletContext<OutletContext>();
  const token = session?.access_token;
  const navigate = useNavigate();

  const [riders, setRiders] = useState<RiderArrearsRowDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [writeoffRider, setWriteoffRider] = useState<RiderArrearsRowDto | null>(null);
  const [reasonCodes, setReasonCodes] = useState<Record<string, string>>({});
  const [wReason, setWReason] = useState('');
  const [wNotes, setWNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await listRidersWithArrears(token, { page, limit: 50 });
      setRiders(result.riders);
      setTotal(result.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load outstanding balances');
    } finally {
      setLoading(false);
    }
  }, [token, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token) return;
    void getReasonCodes(token)
      .then((r) => setReasonCodes(r.reason_codes))
      .catch(() => undefined);
  }, [token]);

  const handleWriteoff = async () => {
    if (!token || !writeoffRider || !wReason.trim()) return;
    setSubmitting(true);
    try {
      const result = await writeoffRiderArrears(token, writeoffRider.user_id, {
        reasonCode: wReason,
        notes: wNotes.trim() || undefined,
        currency: writeoffRider.currency,
      });
      toast.success(
        `Wrote off ${formatMoneyMinor(result.amount_written_off_minor, result.currency)}`,
      );
      setWriteoffRider(null);
      setWReason('');
      setWNotes('');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Write-off failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Outstanding Balances</h1>
          <p className="text-sm text-slate-400 mt-1">
            Riders with unpaid cash trip balances
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white text-sm"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <p className="text-sm text-slate-400 mb-4">{total} rider{total === 1 ? '' : 's'} with arrears</p>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        </div>
      ) : riders.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Wallet className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>No riders with outstanding balances</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-left text-slate-400">
                <th className="px-4 py-3 font-medium">Rider</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium text-right">Outstanding</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {riders.map((r) => (
                <tr key={r.user_id} className="border-b border-slate-800/80 hover:bg-slate-900/40">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/users/${r.user_id}`)}
                      className="text-left hover:underline text-white"
                    >
                      {r.display_name || r.email || r.user_id.slice(0, 8)}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{r.phone || '—'}</td>
                  <td className="px-4 py-3 text-slate-300">{r.email || '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-amber-300">
                    {formatMoneyMinor(r.arrears_minor, r.currency)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setWriteoffRider(r);
                        setWReason('');
                        setWNotes('');
                      }}
                      className="text-xs text-amber-400 hover:text-amber-300"
                    >
                      Write off
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 50 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-3 py-1 text-slate-400 text-sm">Page {page}</span>
          <button
            type="button"
            disabled={page * 50 >= total}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {writeoffRider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-slate-900 border border-slate-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Write off arrears</h3>
              <button
                type="button"
                onClick={() => setWriteoffRider(null)}
                className="text-slate-400 hover:text-white"
                aria-label="Close"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              Rider: {writeoffRider.display_name || writeoffRider.user_id.slice(0, 8)} ·{' '}
              {formatMoneyMinor(writeoffRider.arrears_minor, writeoffRider.currency)}
            </p>
            <label className="block text-xs text-slate-500 mb-1">Reason</label>
            <select
              value={wReason}
              onChange={(e) => setWReason(e.target.value)}
              className="w-full mb-3 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white"
            >
              <option value="">Select reason…</option>
              {Object.entries(reasonCodes).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
            <label className="block text-xs text-slate-500 mb-1">Notes (optional)</label>
            <textarea
              value={wNotes}
              onChange={(e) => setWNotes(e.target.value)}
              className="w-full mb-4 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white"
              rows={2}
            />
            <button
              type="button"
              disabled={submitting || !wReason}
              onClick={() => void handleWriteoff()}
              className="w-full py-2 bg-amber-600 hover:bg-amber-700 rounded-lg text-white font-medium disabled:opacity-50"
            >
              {submitting ? 'Processing…' : 'Confirm write-off'}
            </button>
            <p className="mt-3 text-xs text-slate-500 text-center">
              <Link to={`/admin/users/${writeoffRider.user_id}`} className="underline">
                View rider profile
              </Link>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
