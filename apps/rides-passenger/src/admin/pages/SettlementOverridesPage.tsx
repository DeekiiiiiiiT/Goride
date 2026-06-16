import React, { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import {
  DollarSign,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  User,
  XCircle,
} from 'lucide-react';
import {
  listSettlementOverrides,
  writeoffRiderArrears,
  adjustDriverCredit,
  getReasonCodes,
  formatMoneyMinor,
  type SettlementOverrideDto,
} from '../services/ridesAdminService';

interface OutletContext {
  session: Session;
}

const ACTION_LABELS: Record<string, string> = {
  arrears_writeoff: 'Arrears Write-off',
  driver_credit_adjustment: 'Driver Credit Adj.',
  admin_driver_credit: 'Driver Credit',
  admin_driver_debit: 'Driver Debit',
  admin_arrears_writeoff: 'Arrears Write-off',
  admin_settlement_adjustment: 'Settlement Adjustment',
};

function actionBadge(action: string) {
  const styles: Record<string, string> = {
    arrears_writeoff: 'bg-amber-100 text-amber-800',
    admin_arrears_writeoff: 'bg-amber-100 text-amber-800',
    driver_credit_adjustment: 'bg-blue-100 text-blue-800',
    admin_driver_credit: 'bg-green-100 text-green-800',
    admin_driver_debit: 'bg-red-100 text-red-800',
    admin_settlement_adjustment: 'bg-teal-100 text-teal-800',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[action] ?? 'bg-gray-100 text-gray-800'}`}>
      {ACTION_LABELS[action] ?? action}
    </span>
  );
}

export function SettlementOverridesPage() {
  const { session } = useOutletContext<OutletContext>();
  const token = session?.access_token;
  const [overrides, setOverrides] = useState<SettlementOverrideDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [searchRiderId, setSearchRiderId] = useState('');
  const [searchDriverId, setSearchDriverId] = useState('');

  const [reasonCodes, setReasonCodes] = useState<Record<string, string>>({});
  const [modalOpen, setModalOpen] = useState<'writeoff' | 'driver-adj' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Write-off form
  const [wRiderId, setWRiderId] = useState('');
  const [wRideId, setWRideId] = useState('');
  const [wAmount, setWAmount] = useState('');
  const [wReason, setWReason] = useState('');
  const [wNotes, setWNotes] = useState('');

  // Driver adjustment form
  const [dRideId, setDRideId] = useState('');
  const [dAmount, setDAmont] = useState('');
  const [dReason, setDReason] = useState('');
  const [dNotes, setDNotes] = useState('');

  const loadOverrides = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await listSettlementOverrides(token, {
        riderId: searchRiderId || undefined,
        driverId: searchDriverId || undefined,
        page,
        limit: 20,
      });
      setOverrides(result.overrides);
      setTotal(result.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load overrides');
    } finally {
      setLoading(false);
    }
  }, [token, searchRiderId, searchDriverId, page]);

  useEffect(() => {
    void loadOverrides();
  }, [loadOverrides]);

  useEffect(() => {
    if (!token) return;
    getReasonCodes(token)
      .then((r) => setReasonCodes(r.reason_codes))
      .catch(() => {});
  }, [token]);

  const handleWriteoff = async () => {
    if (!wRiderId.trim() || !wReason) {
      toast.error('Rider ID and reason are required');
      return;
    }
    setSubmitting(true);
    try {
      const result = await writeoffRiderArrears(token!, wRiderId.trim(), {
        rideId: wRideId.trim() || undefined,
        amountMinor: wAmount ? Math.round(Number(wAmount) * 100) : undefined,
        reasonCode: wReason,
        notes: wNotes.trim() || undefined,
      });
      toast.success(`Wrote off ${formatMoneyMinor(result.amount_written_off_minor, 'JMD')}. New arrears: ${formatMoneyMinor(result.new_arrears_minor, 'JMD')}`);
      setModalOpen(null);
      resetForms();
      void loadOverrides();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to write off arrears');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDriverAdjustment = async () => {
    if (!dRideId.trim() || !dAmount || !dReason) {
      toast.error('Ride ID, amount, and reason are required');
      return;
    }
    setSubmitting(true);
    try {
      const result = await adjustDriverCredit(
        token!,
        dRideId.trim(),
        Math.round(Number(dAmount) * 100),
        dReason,
        dNotes.trim() || undefined,
      );
      toast.success(`Adjusted driver credit by ${formatMoneyMinor(result.adjustment_minor, 'JMD')}`);
      setModalOpen(null);
      resetForms();
      void loadOverrides();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to adjust driver credit');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForms = () => {
    setWRiderId('');
    setWRideId('');
    setWAmount('');
    setWReason('');
    setWNotes('');
    setDRideId('');
    setDAmont('');
    setDReason('');
    setDNotes('');
  };

  const reasonOptions = Object.entries(reasonCodes).map(([code, label]) => ({ code, label }));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Settlement Overrides</h1>
          <p className="text-sm text-slate-400 mt-1">Manual adjustments to rider arrears and driver credits</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModalOpen('writeoff')}
            className="flex items-center gap-2 px-3 py-2 bg-amber-600 hover:bg-amber-700 rounded-lg text-sm text-white"
          >
            <Plus className="w-4 h-4" />
            Write-off Arrears
          </button>
          <button
            onClick={() => setModalOpen('driver-adj')}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white"
          >
            <Plus className="w-4 h-4" />
            Adjust Driver Credit
          </button>
          <button
            onClick={() => void loadOverrides()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchRiderId}
            onChange={(e) => { setSearchRiderId(e.target.value); setPage(1); }}
            placeholder="Filter by Rider ID..."
            className="bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white w-56"
          />
        </div>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchDriverId}
            onChange={(e) => { setSearchDriverId(e.target.value); setPage(1); }}
            placeholder="Filter by Driver ID..."
            className="bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white w-56"
          />
        </div>
        <span className="text-sm text-slate-400">{total} record{total !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : overrides.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No settlement overrides found</p>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/50">
              <tr>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Action</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Amount</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Reason</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">User</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {overrides.map((o) => (
                <tr key={o.id} className="hover:bg-slate-700/50">
                  <td className="px-4 py-3">{actionBadge(o.action_type)}</td>
                  <td className="px-4 py-3 text-right text-white font-mono">
                    {formatMoneyMinor(o.amount_minor, o.currency)}
                  </td>
                  <td className="px-4 py-3 text-white">{o.reason_label ?? o.reason_code}</td>
                  <td className="px-4 py-3 text-slate-300 text-xs font-mono">
                    {o.rider_user_id ? `R: ${o.rider_user_id.slice(0, 8)}…` : ''}
                    {o.driver_user_id ? `D: ${o.driver_user_id.slice(0, 8)}…` : ''}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {new Date(o.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 20 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white text-sm disabled:opacity-50"
          >
            Prev
          </button>
          <span className="text-sm text-slate-400">Page {page}</span>
          <button
            disabled={page * 20 >= total}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-800 rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">
                {modalOpen === 'writeoff' ? 'Write-off Rider Arrears' : 'Adjust Driver Credit'}
              </h2>
              <button
                onClick={() => { setModalOpen(null); resetForms(); }}
                className="text-slate-400 hover:text-white"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {modalOpen === 'writeoff' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Rider User ID *</label>
                  <input
                    type="text"
                    value={wRiderId}
                    onChange={(e) => setWRiderId(e.target.value)}
                    placeholder="UUID of rider"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Ride ID (optional)</label>
                  <input
                    type="text"
                    value={wRideId}
                    onChange={(e) => setWRideId(e.target.value)}
                    placeholder="Link to specific ride"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Amount (JMD, blank = full)</label>
                  <input
                    type="number"
                    value={wAmount}
                    onChange={(e) => setWAmount(e.target.value)}
                    placeholder="Leave blank for full arrears"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Reason *</label>
                  <select
                    value={wReason}
                    onChange={(e) => setWReason(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="">Select reason...</option>
                    {reasonOptions.map((r) => (
                      <option key={r.code} value={r.code}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Notes</label>
                  <textarea
                    value={wNotes}
                    onChange={(e) => setWNotes(e.target.value)}
                    rows={2}
                    placeholder="Optional details..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <button
                  onClick={() => void handleWriteoff()}
                  disabled={submitting}
                  className="w-full py-2 bg-amber-600 hover:bg-amber-700 rounded-lg text-white font-medium disabled:opacity-50"
                >
                  {submitting ? 'Processing...' : 'Write-off Arrears'}
                </button>
              </div>
            )}

            {modalOpen === 'driver-adj' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Ride ID *</label>
                  <input
                    type="text"
                    value={dRideId}
                    onChange={(e) => setDRideId(e.target.value)}
                    placeholder="UUID of ride"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Adjustment Amount (JMD) *</label>
                  <input
                    type="number"
                    value={dAmount}
                    onChange={(e) => setDAmont(e.target.value)}
                    placeholder="Positive to credit, negative to debit"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Reason *</label>
                  <select
                    value={dReason}
                    onChange={(e) => setDReason(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="">Select reason...</option>
                    {reasonOptions.map((r) => (
                      <option key={r.code} value={r.code}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Notes</label>
                  <textarea
                    value={dNotes}
                    onChange={(e) => setDNotes(e.target.value)}
                    rows={2}
                    placeholder="Optional details..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <button
                  onClick={() => void handleDriverAdjustment()}
                  disabled={submitting}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium disabled:opacity-50"
                >
                  {submitting ? 'Processing...' : 'Adjust Driver Credit'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
