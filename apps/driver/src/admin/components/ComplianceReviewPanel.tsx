import React, { useState } from 'react';
import { Loader2, ShieldCheck, User, Car, FileCheck, AlertCircle } from 'lucide-react';
import type { DriverComplianceRow, DriverDetailDto } from '@roam/types/driver';
import { ComplianceChecklist, BlockerChips } from './ComplianceChecklist';
import { canForceApproveDriver } from '../utils/driverAdminRoles';
import type { Session } from '@supabase/supabase-js';
import { formatBlockersList } from '../utils/complianceLabels';

type Props = {
  row: DriverComplianceRow;
  detail: DriverDetailDto | null;
  detailLoading: boolean;
  canWrite: boolean;
  session: Session;
  actionLoading: boolean;
  onRefresh: () => void;
  onBackgroundCheck: (status: 'approved' | 'rejected' | 'pending') => void;
  onInsuranceVerify: (expiryDate: string) => void;
  onApprove: (force: boolean) => void;
  onDecline: () => void;
};

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4 space-y-3">
      <h4 className="text-sm font-medium text-white flex items-center gap-2">
        {icon}
        {title}
      </h4>
      {children}
    </section>
  );
}

function ActionBtn({
  variant = 'secondary',
  disabled,
  onClick,
  children,
}: {
  variant?: 'primary' | 'danger' | 'secondary' | 'warning';
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const styles =
    variant === 'primary'
      ? 'bg-violet-600 hover:bg-violet-500 text-white'
      : variant === 'danger'
        ? 'border border-red-500/40 text-red-300 hover:bg-red-500/10'
        : variant === 'warning'
          ? 'border border-amber-500/40 text-amber-200 hover:bg-amber-500/10'
          : 'border border-slate-700 text-slate-300 hover:bg-slate-800';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}

export function ComplianceReviewPanel({
  row,
  detail,
  detailLoading,
  canWrite,
  session,
  actionLoading,
  onRefresh,
  onBackgroundCheck,
  onInsuranceVerify,
  onApprove,
  onDecline,
}: Props) {
  const canForce = canForceApproveDriver(session.user) || row.can_force_approve || canWrite;
  const [insuranceDate, setInsuranceDate] = useState(
    row.insurance_expiry ?? detail?.insurance_expiry ?? '',
  );

  const bgStatus = row.background_check_status ?? detail?.background_check_status ?? null;
  const vehicles = detail?.vehicles ?? [];
  const compliance = detail?.compliance;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 flex flex-col h-full min-h-[480px]">
      <div className="px-5 py-4 border-b border-slate-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">
              {row.driver_name || row.driver_email || 'Driver review'}
            </h3>
            <p className="text-sm text-slate-400 mt-0.5">{row.driver_email}</p>
            <p className="text-xs text-slate-600 font-mono mt-1">{row.driver_id}</p>
          </div>
          <div className="text-right text-xs space-y-1">
            <p className="capitalize text-slate-400">
              Account: <span className="text-slate-200">{row.account_status}</span>
            </p>
            <p className="capitalize text-slate-400">
              Mode: <span className="text-slate-200">{row.mode}</span>
            </p>
          </div>
        </div>
        <div className="mt-3">
          <BlockerChips blockers={row.blockers} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {!canWrite && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            Read-only view. Compliance write access requires driver_admin or platform role.
          </div>
        )}

        <Section title="Verification checklist" icon={<ShieldCheck className="w-4 h-4 text-blue-400" />}>
          <ComplianceChecklist blockers={row.blockers} mode={row.mode} />
          {row.blockers.length > 0 && (
            <p className="text-xs text-slate-500 pt-1">
              Outstanding: {formatBlockersList(row.blockers)}
            </p>
          )}
        </Section>

        <Section title="Profile & onboarding" icon={<User className="w-4 h-4 text-slate-400" />}>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`px-2 py-0.5 rounded border ${row.onboarding_complete ? 'border-emerald-500/30 text-emerald-300' : 'border-amber-500/30 text-amber-200'}`}>
              {row.onboarding_complete ? 'Onboarding complete' : 'Onboarding incomplete'}
            </span>
          </div>
          {!row.onboarding_complete && (
            <p className="text-xs text-slate-500">
              Driver must finish onboarding in the driver app. You cannot mark this complete from admin.
            </p>
          )}
        </Section>

        <Section title="Background check" icon={<FileCheck className="w-4 h-4 text-violet-400" />}>
          <p className="text-sm text-slate-400 capitalize">
            Current status: <span className="text-slate-200">{bgStatus ?? 'not started'}</span>
          </p>
          {canWrite && (
            <div className="flex flex-wrap gap-2 pt-1">
              <ActionBtn
                variant="primary"
                disabled={actionLoading || bgStatus === 'approved'}
                onClick={() => onBackgroundCheck('approved')}
              >
                Approve
              </ActionBtn>
              <ActionBtn
                variant="danger"
                disabled={actionLoading || bgStatus === 'rejected'}
                onClick={() => onBackgroundCheck('rejected')}
              >
                Decline
              </ActionBtn>
              <ActionBtn
                variant="warning"
                disabled={actionLoading || bgStatus === 'pending'}
                onClick={() => onBackgroundCheck('pending')}
              >
                Request resubmit
              </ActionBtn>
            </div>
          )}
        </Section>

        {row.mode !== 'fleet' && (
          <Section title="Insurance" icon={<FileCheck className="w-4 h-4 text-emerald-400" />}>
            <p className="text-sm text-slate-400">
              On file:{' '}
              <span className="text-slate-200">
                {row.insurance_expiry ?? detail?.insurance_expiry ?? 'Not recorded'}
              </span>
            </p>
            {canWrite && (
              <div className="flex flex-wrap items-end gap-2 pt-1">
                <label className="text-xs text-slate-500 block">
                  Expiry date
                  <input
                    type="date"
                    value={insuranceDate}
                    onChange={(e) => setInsuranceDate(e.target.value)}
                    className="mt-1 block rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-white"
                  />
                </label>
                <ActionBtn
                  variant="primary"
                  disabled={actionLoading || !insuranceDate}
                  onClick={() => onInsuranceVerify(insuranceDate)}
                >
                  Verify on file
                </ActionBtn>
              </div>
            )}
          </Section>
        )}

        {row.mode !== 'fleet' && (
          <Section title="Vehicle" icon={<Car className="w-4 h-4 text-sky-400" />}>
            {detailLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
            ) : vehicles.length === 0 ? (
              <p className="text-xs text-slate-500">
                No vehicle registered. Driver must add a vehicle in the driver app before strict approval.
              </p>
            ) : (
              <ul className="text-sm space-y-2">
                {vehicles.map((v) => (
                  <li key={v.id} className="text-slate-300">
                    {v.year} {v.make} {v.model} · {v.license_plate}
                    <span className="text-xs text-slate-500 ml-2 capitalize">({v.status})</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}
      </div>

      <div className="px-5 py-4 border-t border-slate-800 bg-slate-900/80 space-y-3">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Final decision</p>
        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            <ActionBtn
              variant="primary"
              disabled={
                actionLoading ||
                row.account_status !== 'pending' ||
                !(compliance?.can_strict_approve ?? row.can_strict_approve)
              }
              onClick={() => onApprove(false)}
            >
              Approve & activate
            </ActionBtn>
            {canForce && row.account_status === 'pending' && (
              <ActionBtn
                variant="warning"
                disabled={actionLoading}
                onClick={() => onApprove(true)}
              >
                Force activate (skip verification)
              </ActionBtn>
            )}
            <ActionBtn variant="danger" disabled={actionLoading} onClick={onDecline}>
              Decline application
            </ActionBtn>
            <ActionBtn disabled={actionLoading} onClick={onRefresh}>
              Refresh
            </ActionBtn>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Switch to a compliance admin account to take action.</p>
        )}
        {row.account_status === 'pending' &&
          !(compliance?.can_strict_approve ?? row.can_strict_approve) &&
          canWrite && (
            <p className="text-xs text-amber-400/90">
              Resolve all blockers above before strict approval, or use force activate to skip verification (requires audit reason).
            </p>
          )}
      </div>
    </div>
  );
}
