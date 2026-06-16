import React, { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import {
  listDisputes,
  getDispute,
  markDisputeUnderReview,
  resolveDispute,
  formatMoneyMinor,
  type DisputeAdminDto,
  type DisputeWithRideDto,
} from '../services/ridesAdminService';

interface OutletContext {
  session: Session;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'open', label: 'Open' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'resolved_rider_favor', label: 'Resolved (Rider)' },
  { value: 'resolved_driver_favor', label: 'Resolved (Driver)' },
  { value: 'resolved_partial', label: 'Resolved (Partial)' },
  { value: 'rejected', label: 'Rejected' },
];

const RESOLUTION_OPTIONS = [
  { value: 'rider_favor', label: 'Resolve in Rider\'s Favor (Full Credit)' },
  { value: 'partial', label: 'Partial Resolution' },
  { value: 'driver_favor', label: 'Resolve in Driver\'s Favor (No Credit)' },
  { value: 'rejected', label: 'Reject Dispute' },
];

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    open: 'bg-amber-100 text-amber-800',
    under_review: 'bg-blue-100 text-blue-800',
    resolved_rider_favor: 'bg-green-100 text-green-800',
    resolved_driver_favor: 'bg-slate-100 text-slate-800',
    resolved_partial: 'bg-teal-100 text-teal-800',
    rejected: 'bg-red-100 text-red-800',
  };
  const labels: Record<string, string> = {
    open: 'Open',
    under_review: 'Under Review',
    resolved_rider_favor: 'Rider Favor',
    resolved_driver_favor: 'Driver Favor',
    resolved_partial: 'Partial',
    rejected: 'Rejected',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status] ?? 'bg-gray-100 text-gray-800'}`}>
      {labels[status] ?? status}
    </span>
  );
}

export function DisputesPage() {
  const { session } = useOutletContext<OutletContext>();
  const [disputes, setDisputes] = useState<DisputeAdminDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const [selectedDispute, setSelectedDispute] = useState<DisputeWithRideDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [partialAmount, setPartialAmount] = useState('');

  const loadDisputes = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listDisputes(session.access_token, {
        status: statusFilter || undefined,
        page,
        limit: 20,
      });
      setDisputes(result.disputes);
      setTotal(result.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load disputes');
    } finally {
      setLoading(false);
    }
  }, [session.access_token, statusFilter, page]);

  useEffect(() => {
    void loadDisputes();
  }, [loadDisputes]);

  const openDetail = async (disputeId: string) => {
    setDetailLoading(true);
    setSelectedDispute(null);
    setResolution('');
    setAdminNotes('');
    setPartialAmount('');
    try {
      const result = await getDispute(session.access_token, disputeId);
      setSelectedDispute(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load dispute');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleMarkUnderReview = async () => {
    if (!selectedDispute) return;
    setResolving(true);
    try {
      await markDisputeUnderReview(session.access_token, selectedDispute.dispute.id);
      toast.success('Dispute marked as under review');
      setSelectedDispute({
        ...selectedDispute,
        dispute: { ...selectedDispute.dispute, dispute_status: 'under_review' },
      });
      void loadDisputes();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update dispute');
    } finally {
      setResolving(false);
    }
  };

  const handleResolve = async () => {
    if (!selectedDispute || !resolution || !adminNotes.trim()) {
      toast.error('Please select a resolution and add admin notes');
      return;
    }
    if (resolution === 'partial' && (!partialAmount || Number(partialAmount) <= 0)) {
      toast.error('Please enter a valid partial amount');
      return;
    }
    setResolving(true);
    try {
      await resolveDispute(
        session.access_token,
        selectedDispute.dispute.id,
        resolution as 'rider_favor' | 'driver_favor' | 'partial' | 'rejected',
        adminNotes.trim(),
        resolution === 'partial' ? Math.round(Number(partialAmount) * 100) : undefined,
      );
      toast.success('Dispute resolved');
      setSelectedDispute(null);
      void loadDisputes();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to resolve dispute');
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Cash Settlement Disputes</h1>
          <p className="text-sm text-slate-400 mt-1">Review and resolve rider disputes</p>
        </div>
        <button
          onClick={() => void loadDisputes()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <span className="text-sm text-slate-400">{total} dispute{total !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : disputes.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No disputes found</p>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/50">
              <tr>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Reason</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Amount</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Created</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {disputes.map((d) => (
                <tr key={d.id} className="hover:bg-slate-700/50">
                  <td className="px-4 py-3">{statusBadge(d.dispute_status)}</td>
                  <td className="px-4 py-3 text-white">{d.reason_label ?? d.dispute_reason}</td>
                  <td className="px-4 py-3 text-right text-white font-mono">
                    {formatMoneyMinor(d.disputed_amount_minor, 'JMD')}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {new Date(d.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => void openDetail(d.id)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white text-xs"
                    >
                      View
                    </button>
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

      {(selectedDispute || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {detailLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              </div>
            ) : selectedDispute && (
              <div className="p-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-white">Dispute Detail</h2>
                    <p className="text-sm text-slate-400 mt-1">
                      {statusBadge(selectedDispute.dispute.dispute_status)}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedDispute(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    <XCircle className="w-6 h-6" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-slate-900/50 rounded-lg p-4">
                    <p className="text-xs text-slate-400 mb-1">Disputed Amount</p>
                    <p className="text-xl font-bold text-white">
                      {formatMoneyMinor(selectedDispute.dispute.disputed_amount_minor, 'JMD')}
                    </p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-4">
                    <p className="text-xs text-slate-400 mb-1">Reason</p>
                    <p className="text-white">
                      {selectedDispute.dispute.reason_label ?? selectedDispute.dispute.dispute_reason}
                    </p>
                  </div>
                </div>

                {selectedDispute.dispute.rider_notes && (
                  <div className="bg-slate-900/50 rounded-lg p-4 mb-6">
                    <p className="text-xs text-slate-400 mb-1">Rider Notes</p>
                    <p className="text-white">{selectedDispute.dispute.rider_notes}</p>
                  </div>
                )}

                {selectedDispute.ride && (
                  <div className="bg-slate-900/50 rounded-lg p-4 mb-6">
                    <p className="text-xs text-slate-400 mb-2">Trip Info</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <p className="text-slate-300">Fare: <span className="text-white">{formatMoneyMinor(selectedDispute.ride.fare_final_minor ?? 0, 'JMD')}</span></p>
                      <p className="text-slate-300">Cash Received: <span className="text-white">{formatMoneyMinor(selectedDispute.ride.cash_received_minor ?? 0, 'JMD')}</span></p>
                      <p className="text-slate-300 col-span-2 truncate">From: {selectedDispute.ride.pickup_address ?? '—'}</p>
                      <p className="text-slate-300 col-span-2 truncate">To: {selectedDispute.ride.dropoff_address ?? '—'}</p>
                    </div>
                  </div>
                )}

                {['open', 'under_review'].includes(selectedDispute.dispute.dispute_status) && (
                  <div className="border-t border-slate-700 pt-6">
                    {selectedDispute.dispute.dispute_status === 'open' && (
                      <button
                        onClick={() => void handleMarkUnderReview()}
                        disabled={resolving}
                        className="w-full mb-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium disabled:opacity-50"
                      >
                        {resolving ? 'Updating...' : 'Mark as Under Review'}
                      </button>
                    )}

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Resolution</label>
                        <select
                          value={resolution}
                          onChange={(e) => setResolution(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                        >
                          <option value="">Select resolution...</option>
                          {RESOLUTION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>

                      {resolution === 'partial' && (
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-2">Credit Amount (JMD)</label>
                          <input
                            type="number"
                            value={partialAmount}
                            onChange={(e) => setPartialAmount(e.target.value)}
                            placeholder="0.00"
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Admin Notes (required)</label>
                        <textarea
                          value={adminNotes}
                          onChange={(e) => setAdminNotes(e.target.value)}
                          rows={3}
                          placeholder="Explain the resolution..."
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                        />
                      </div>

                      <button
                        onClick={() => void handleResolve()}
                        disabled={resolving || !resolution || !adminNotes.trim()}
                        className="w-full py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white font-medium disabled:opacity-50"
                      >
                        {resolving ? 'Resolving...' : 'Resolve Dispute'}
                      </button>
                    </div>
                  </div>
                )}

                {selectedDispute.dispute.resolved_at && (
                  <div className="border-t border-slate-700 pt-6 mt-6">
                    <p className="text-sm text-slate-400 mb-2">Resolution Details</p>
                    {selectedDispute.dispute.resolution_amount_minor != null && selectedDispute.dispute.resolution_amount_minor > 0 && (
                      <p className="text-white mb-2">
                        Amount Credited: {formatMoneyMinor(selectedDispute.dispute.resolution_amount_minor, 'JMD')}
                      </p>
                    )}
                    {selectedDispute.dispute.admin_notes && (
                      <p className="text-slate-300">{selectedDispute.dispute.admin_notes}</p>
                    )}
                    <p className="text-xs text-slate-500 mt-2">
                      Resolved: {new Date(selectedDispute.dispute.resolved_at).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
