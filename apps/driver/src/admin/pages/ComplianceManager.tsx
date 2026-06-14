import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { jwtPrimaryRole } from '@roam/auth-client';
import { ShieldCheck, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import type { DriverComplianceRow } from '@roam/types/driver';
import { ComplianceQueueTable } from '../components/ComplianceQueueTable';
import { useAdminConfirm } from '../contexts/AdminConfirmContext';
import {
  approveDriver,
  listComplianceQueue,
  updateComplianceStatus,
} from '../services/driverAdminService';
import { canWriteDriverAdmin } from '../utils/driverAdminRoles';
import { MIN_FORCE_APPROVE_REASON_LENGTH } from '../utils/complianceConstants';

export function ComplianceManager() {
  const { session } = useOutletContext<{ session: Session }>();
  const { confirm } = useAdminConfirm();
  const adminRole = jwtPrimaryRole(session.user);
  const canWrite = canWriteDriverAdmin(adminRole);

  const [rows, setRows] = useState<DriverComplianceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [forceRow, setForceRow] = useState<DriverComplianceRow | null>(null);
  const [forceReason, setForceReason] = useState('');

  const load = useCallback(async () => {
    if (!session.access_token) return;
    setLoading(true);
    try {
      const res = await listComplianceQueue(session.access_token, { limit: 100 });
      setRows(res.drivers);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load compliance queue');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [session.access_token]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleApprove = async (row: DriverComplianceRow, force: boolean) => {
    if (!session.access_token) return;

    if (force) {
      setForceRow(row);
      setForceReason('');
      return;
    }

    const ok = await confirm({
      title: 'Approve driver',
      description: `Activate ${row.driver_name || row.driver_email || 'this driver'}? They will be able to go online.`,
      confirmLabel: 'Approve',
    });
    if (!ok) return;

    setActionLoadingId(row.driver_id);
    try {
      await approveDriver(session.access_token, row.driver_id, { force: false });
      toast.success('Driver approved');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setActionLoadingId(null);
    }
  };

  const submitForceApprove = async () => {
    if (!session.access_token || !forceRow) return;
    const reason = forceReason.trim();
    if (reason.length < MIN_FORCE_APPROVE_REASON_LENGTH) {
      toast.error(`Reason must be at least ${MIN_FORCE_APPROVE_REASON_LENGTH} characters.`);
      return;
    }

    setActionLoadingId(forceRow.driver_id);
    try {
      await approveDriver(session.access_token, forceRow.driver_id, { force: true, reason });
      toast.success('Driver force-approved');
      setForceRow(null);
      setForceReason('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Force approve failed');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleBackgroundCheck = async (
    row: DriverComplianceRow,
    status: 'approved' | 'rejected' | 'pending',
  ) => {
    if (!session.access_token) return;
    setActionLoadingId(row.driver_id);
    try {
      await updateComplianceStatus(session.access_token, row.driver_id, { background_check: status });
      toast.success(`Background check set to ${status}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setActionLoadingId(null);
    }
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
            Review drivers awaiting activation and resolve compliance blockers.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <ComplianceQueueTable
        rows={rows}
        loading={loading}
        canWrite={canWrite}
        adminRole={adminRole}
        actionLoadingId={actionLoadingId}
        onApprove={(row, force) => void handleApprove(row, force)}
        onUpdateBackgroundCheck={(row, status) => void handleBackgroundCheck(row, status)}
      />

      {!loading && rows.length > 0 && (
        <p className="text-xs text-slate-500">{rows.length} driver(s) in compliance queue</p>
      )}

      {forceRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setForceRow(null)} />
          <div className="relative w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Force approve driver</h3>
              <button
                type="button"
                onClick={() => setForceRow(null)}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              {forceRow.driver_name || forceRow.driver_email} still has compliance blockers.
              Document why you are overriding requirements.
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
                disabled={actionLoadingId === forceRow.driver_id}
                onClick={() => void submitForceApprove()}
                className="px-4 py-2 text-sm rounded-lg bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50"
              >
                Force approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
