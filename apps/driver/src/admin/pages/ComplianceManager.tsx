import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { ShieldCheck, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import type { DriverComplianceRow, DriverDetailDto } from '@roam/types/driver';
import { ComplianceQueueTable } from '../components/ComplianceQueueTable';
import { ComplianceReviewPanel } from '../components/ComplianceReviewPanel';
import { useAdminConfirm } from '../contexts/AdminConfirmContext';
import {
  approveDriver,
  getDriverDetail,
  listComplianceQueue,
  updateComplianceStatus,
} from '../services/driverAdminService';
import { canWriteDriverAdmin } from '../utils/driverAdminRoles';
import { MIN_FORCE_APPROVE_REASON_LENGTH, DEFAULT_FORCE_ACTIVATE_REASON } from '../utils/complianceConstants';

export function ComplianceManager() {
  const { session } = useOutletContext<{ session: Session }>();
  const { confirm } = useAdminConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const canWrite = canWriteDriverAdmin(session.user);

  const [rows, setRows] = useState<DriverComplianceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedRow, setSelectedRow] = useState<DriverComplianceRow | null>(null);
  const [detail, setDetail] = useState<DriverDetailDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [forceRow, setForceRow] = useState<DriverComplianceRow | null>(null);
  const [forceReason, setForceReason] = useState('');

  const load = useCallback(async () => {
    if (!session.access_token) return;
    setLoading(true);
    try {
      const res = await listComplianceQueue(session.access_token, { limit: 100 });
      setRows(res.drivers);
      return res.drivers;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load compliance queue');
      setRows([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [session.access_token]);

  const loadDetail = useCallback(
    async (driverId: string) => {
      if (!session.access_token) return;
      setDetailLoading(true);
      try {
        const res = await getDriverDetail(session.access_token, driverId);
        setDetail(res.driver);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load driver detail');
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [session.access_token],
  );

  useEffect(() => {
    void load().then((drivers) => {
      const reviewId = searchParams.get('review');
      if (!reviewId || !drivers?.length) return;
      const match = drivers.find((d) => d.driver_id === reviewId);
      if (match) {
        setSelectedRow(match);
        void loadDetail(match.driver_id);
      }
    });
  }, [load, searchParams, loadDetail]);

  const selectRow = (row: DriverComplianceRow) => {
    setSelectedRow(row);
    setSearchParams({ review: row.driver_id });
    void loadDetail(row.driver_id);
  };

  const refreshAll = async () => {
    const drivers = await load();
    if (selectedRow) {
      const updated = drivers?.find((d) => d.driver_id === selectedRow.driver_id);
      if (updated) setSelectedRow(updated);
      await loadDetail(selectedRow.driver_id);
    }
  };

  const handleApprove = async (force: boolean) => {
    if (!session.access_token || !selectedRow) return;

    if (force) {
      setForceRow(selectedRow);
      setForceReason(DEFAULT_FORCE_ACTIVATE_REASON);
      return;
    }

    const ok = await confirm({
      title: 'Approve & activate driver',
      description: `Activate ${selectedRow.driver_name || selectedRow.driver_email}? They will be able to go online.`,
      confirmLabel: 'Approve & activate',
    });
    if (!ok) return;

    setActionLoading(true);
    try {
      await approveDriver(session.access_token, selectedRow.driver_id, { force: false });
      toast.success('Driver approved and activated');
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
      await approveDriver(session.access_token, forceRow.driver_id, { force: true, reason });
      toast.success('Driver force-approved');
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
      const res = await updateComplianceStatus(session.access_token, selectedRow.driver_id, {
        background_check: status,
      });
      if (res.driver) setSelectedRow(res.driver);
      toast.success(
        status === 'pending'
          ? 'Resubmit requested — background check reset to pending'
          : `Background check ${status}`,
      );
      await refreshAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleInsuranceVerify = async (expiryDate: string) => {
    if (!session.access_token || !selectedRow) return;
    setActionLoading(true);
    try {
      const res = await updateComplianceStatus(session.access_token, selectedRow.driver_id, {
        insurance_expiry: expiryDate,
      });
      if (res.driver) setSelectedRow(res.driver);
      toast.success('Insurance verified on file');
      await refreshAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Insurance update failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!session.access_token || !selectedRow) return;
    const ok = await confirm({
      title: 'Decline application',
      description:
        'This will reject the background check. The driver stays pending and must address compliance before activation.',
      confirmLabel: 'Decline',
      variant: 'danger',
    });
    if (!ok) return;
    await handleBackgroundCheck('rejected');
  };

  return (
    <div className="space-y-6 text-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
            Compliance Manager
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Select a driver from the queue, verify each requirement, then approve or decline.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshAll()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid lg:grid-cols-5 gap-6 items-start">
        <div className="lg:col-span-2">
          <ComplianceQueueTable
            rows={rows}
            loading={loading}
            selectedId={selectedRow?.driver_id ?? null}
            onSelect={selectRow}
          />
          {!loading && rows.length > 0 && (
            <p className="text-xs text-slate-500 mt-2">{rows.length} in queue</p>
          )}
        </div>

        <div className="lg:col-span-3">
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
              onInsuranceVerify={(d) => void handleInsuranceVerify(d)}
              onApprove={(force) => void handleApprove(force)}
              onDecline={() => void handleDecline()}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/20 p-12 text-center min-h-[480px] flex flex-col items-center justify-center">
              <ShieldCheck className="w-10 h-10 text-slate-600 mb-3" />
              <p className="text-slate-400 text-sm">Select a driver from the queue to begin review.</p>
              <p className="text-slate-600 text-xs mt-2 max-w-sm">
                Use Approve / Decline / Request resubmit for background checks, verify insurance dates,
                and activate when all requirements are met.
              </p>
            </div>
          )}
        </div>
      </div>

      {forceRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setForceRow(null)} />
          <div className="relative w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Force activate driver</h3>
              <button
                type="button"
                onClick={() => setForceRow(null)}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              {forceRow.driver_name || forceRow.driver_email} will be activated immediately, skipping
              all compliance checks. This is logged for audit.
            </p>
            <textarea
              value={forceReason}
              onChange={(e) => setForceReason(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white min-h-[100px] mb-4"
              placeholder={`Reason (min ${MIN_FORCE_APPROVE_REASON_LENGTH} characters)`}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setForceRow(null)}
                className="px-4 py-2 text-sm rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => void submitForceApprove()}
                className="px-4 py-2 text-sm rounded-lg bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50"
              >
                Force activate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
