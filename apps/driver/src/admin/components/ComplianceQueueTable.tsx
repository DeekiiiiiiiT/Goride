import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, MoreHorizontal } from 'lucide-react';
import type { DriverComplianceRow } from '@roam/types/driver';
import { BlockerChips } from './ComplianceChecklist';
import { canForceApproveDriver } from '../utils/driverAdminRoles';

type Props = {
  rows: DriverComplianceRow[];
  loading: boolean;
  canWrite: boolean;
  adminRole: string | null;
  compact?: boolean;
  actionLoadingId?: string | null;
  onApprove: (row: DriverComplianceRow, force: boolean, reason?: string) => void;
  onUpdateBackgroundCheck: (row: DriverComplianceRow, status: 'approved' | 'rejected' | 'pending') => void;
};

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === 'active'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : status === 'pending'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
        : 'border-slate-600/40 bg-slate-500/10 text-slate-400';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium border ${styles}`}>
      {status}
    </span>
  );
}

export function ComplianceQueueTable({
  rows,
  loading,
  canWrite,
  adminRole,
  compact,
  actionLoadingId,
  onApprove,
  onUpdateBackgroundCheck,
}: Props) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const canForce = canForceApproveDriver(adminRole);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading compliance queue…
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-12 text-center">
        <p className="text-slate-400">No drivers awaiting compliance review.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-900/80 text-slate-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 font-medium">Driver</th>
              <th className="px-4 py-3 font-medium">Account</th>
              {!compact && <th className="px-4 py-3 font-medium">Mode</th>}
              <th className="px-4 py-3 font-medium">Blockers</th>
              {!compact && <th className="px-4 py-3 font-medium">Background check</th>}
              {canWrite && <th className="px-4 py-3 font-medium text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((row) => {
              const isLoading = actionLoadingId === row.driver_id;
              const showApprove =
                canWrite &&
                row.account_status === 'pending' &&
                (row.can_strict_approve || (canForce && row.can_force_approve));

              return (
                <tr key={row.driver_id} className="hover:bg-slate-900/50">
                  <td className="px-4 py-3">
                    <Link
                      to={`/users/${row.driver_id}?tab=compliance`}
                      className="font-medium text-white hover:text-violet-300"
                    >
                      {row.driver_name || row.driver_email || 'Unknown'}
                    </Link>
                    {row.driver_email && row.driver_name && (
                      <p className="text-xs text-slate-500 mt-0.5">{row.driver_email}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.account_status} />
                  </td>
                  {!compact && (
                    <td className="px-4 py-3 text-slate-400 capitalize">{row.mode}</td>
                  )}
                  <td className="px-4 py-3 max-w-xs">
                    <BlockerChips blockers={row.blockers} />
                  </td>
                  {!compact && (
                    <td className="px-4 py-3 text-slate-400 capitalize">
                      {row.background_check_status ?? 'not started'}
                    </td>
                  )}
                  {canWrite && (
                    <td className="px-4 py-3 text-right">
                      <div className="relative inline-flex items-center gap-2 justify-end">
                        {showApprove && (
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => onApprove(row, false)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50"
                          >
                            {isLoading ? '…' : 'Approve'}
                          </button>
                        )}
                        {canWrite && row.account_status === 'pending' && canForce && !row.can_strict_approve && (
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => onApprove(row, true)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium border border-amber-500/40 text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
                          >
                            Force
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setMenuId(menuId === row.driver_id ? null : row.driver_id)}
                          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {menuId === row.driver_id && (
                          <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-slate-700 bg-slate-900 shadow-xl py-1 text-left">
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800"
                              onClick={() => {
                                onUpdateBackgroundCheck(row, 'approved');
                                setMenuId(null);
                              }}
                            >
                              Approve background check
                            </button>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800"
                              onClick={() => {
                                onUpdateBackgroundCheck(row, 'rejected');
                                setMenuId(null);
                              }}
                            >
                              Reject background check
                            </button>
                            <Link
                              to={`/users/${row.driver_id}?tab=compliance`}
                              className="block px-3 py-2 text-xs hover:bg-slate-800 text-violet-300"
                              onClick={() => setMenuId(null)}
                            >
                              View details
                            </Link>
                          </div>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
