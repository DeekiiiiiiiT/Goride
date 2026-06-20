import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { ShieldCheck, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import type { CourierComplianceRow, CourierDetailDto } from '@roam/types/courier';
import { ComplianceQueueTable } from '../components/ComplianceQueueTable';
import { ComplianceReviewPanel } from '../components/ComplianceReviewPanel';
import { useAdminConfirm } from '../contexts/AdminConfirmContext';
import {
  approveCourier,
  getCourierDetail,
  listComplianceQueue,
  updateComplianceStatus,
} from '../services/courierAdminService';
import { canWriteCourierAdmin } from '../utils/courierAdminRoles';
import { MIN_FORCE_APPROVE_REASON_LENGTH } from '../utils/complianceLabels';

export function ComplianceManager() {
  const { session } = useOutletContext<{ session: Session }>();
  const { confirm } = useAdminConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const canWrite = canWriteCourierAdmin(session.user);

  const [rows, setRows] = useState<CourierComplianceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedRow, setSelectedRow] = useState<CourierComplianceRow | null>(null);
  const [detail, setDetail] = useState<CourierDetailDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [forceRow, setForceRow] = useState<CourierComplianceRow | null>(null);
  const [forceReason, setForceReason] = useState('');

  const load = useCallback(async () => {
    if (!session.access_token) return;
    setLoading(true);
    try {
      const res = await listComplianceQueue(session.access_token, { limit: 100 });
      setRows(res.couriers);
      return res.couriers;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load compliance queue');
      setRows([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [session.access_token]);

  const loadDetail = useCallback(
    async (courierId: string) => {
      if (!session.access_token) return;
      setDetailLoading(true);
      try {
        const res = await getCourierDetail(session.access_token, courierId);
        setDetail(res.courier);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load courier detail');
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [session.access_token],
  );

  useEffect(() => {
    void load().then((couriers) => {
      const reviewId = searchParams.get('review');
      if (!reviewId || !couriers?.length) return;
      const match = couriers.find((d) => d.courier_id === reviewId);
      if (match) {
        setSelectedRow(match);
        void loadDetail(match.courier_id);
      }
    });
  }, [load, searchParams, loadDetail]);

  const selectRow = (row: CourierComplianceRow) => {
    setSelectedRow(row);
    setSearchParams({ review: row.courier_id });
    void loadDetail(row.courier_id);
  };

  const refreshAll = async () => {
    const couriers = await load();
    if (selectedRow) {
      const updated = couriers?.find((d) => d.courier_id === selectedRow.courier_id);
      if (updated) setSelectedRow(updated);
      await loadDetail(selectedRow.courier_id);
    }
  };

  const handleApprove = async (force: boolean) => {
    if (!session.access_token || !selectedRow) return;
    if (force) {
      setForceRow(selectedRow);
      setForceReason('Approved by admin after manual review');
      return;
    }
    const ok = await confirm({
      title: 'Approve & activate courier',
      description: `Activate ${selectedRow.courier_name || selectedRow.courier_email}?`,
      confirmLabel: 'Approve & activate',
    });
    if (!ok) return;
    setActionLoading(true);
    try {
      await approveCourier(session.access_token, selectedRow.courier_id, { force: false });
      toast.success('Courier approved');
      await refreshAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setActionLoading(false);
    }
  };

  const submitForceApprove = async () => {
    if (!session.access_token || !forceRow) return;
    const reason = forceReason.trim();
    if (reason.length < MIN_FORCE_APPROVE_REASON_LENGTH) {
      toast.error(`Reason must be at least ${MIN_FORCE_APPROVE_REASON_LENGTH} characters.`);
      return;
    }
    setActionLoading(true);
    try {
      await approveCourier(session.access_token, forceRow.courier_id, { force: true, reason });
      toast.success('Courier force-approved');
      setForceRow(null);
      setForceReason('');
      await refreshAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Force approve failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBackgroundCheck = async (status: 'approved' | 'rejected' | 'pending') => {
    if (!session.access_token || !selectedRow) return;
    setActionLoading(true);
    try {
      const res = await updateComplianceStatus(session.access_token, selectedRow.courier_id, {
        background_check: status,
      });
      if (res.courier) setSelectedRow(res.courier);
      toast.success('Background check updated');
      await refreshAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 text-slate-200">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            Compliance
          </h2>
          <p className="text-sm text-slate-400 mt-1">Review courier onboarding and approve activation.</p>
        </div>
        <button
          type="button"
          onClick={() => void refreshAll()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-sm text-slate-300 hover:bg-slate-800"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[520px]">
        <ComplianceQueueTable
          rows={rows}
          loading={loading}
          selectedId={selectedRow?.courier_id ?? null}
          onSelect={selectRow}
        />
        {selectedRow ? (
          <ComplianceReviewPanel
            row={selectedRow}
            detail={detail}
            detailLoading={detailLoading}
            canWrite={canWrite}
            session={session}
            actionLoading={actionLoading}
            onRefresh={() => void refreshAll()}
            onBackgroundCheck={(s) => void handleBackgroundCheck(s)}
            onApprove={(f) => void handleApprove(f)}
          />
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 flex items-center justify-center p-12 text-slate-500 text-sm">
            Select a courier from the queue to review.
          </div>
        )}
      </div>

      {forceRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setForceRow(null)} />
          <div className="relative w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Force activate courier</h3>
              <button type="button" onClick={() => setForceRow(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-400">
              {forceRow.courier_name || forceRow.courier_email} will be activated, skipping remaining blockers.
            </p>
            <textarea
              value={forceReason}
              onChange={(e) => setForceReason(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              placeholder="Audit reason (required)"
            />
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => void submitForceApprove()}
              className="w-full py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium disabled:opacity-50"
            >
              Force activate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
