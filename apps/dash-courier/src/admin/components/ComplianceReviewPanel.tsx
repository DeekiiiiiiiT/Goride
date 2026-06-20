import React from 'react';
import { Loader2, ShieldCheck, User, Car, FileCheck, AlertCircle } from 'lucide-react';
import type { CourierComplianceRow, CourierDetailDto } from '@roam/types/courier';
import { ComplianceChecklist, BlockerChips } from './ComplianceChecklist';
import { canForceApproveCourier } from '../utils/courierAdminRoles';
import type { Session } from '@supabase/supabase-js';
import { formatBlockersList } from '../utils/complianceLabels';

type Props = {
  row: CourierComplianceRow;
  detail: CourierDetailDto | null;
  detailLoading: boolean;
  canWrite: boolean;
  session: Session;
  actionLoading: boolean;
  onRefresh: () => void;
  onBackgroundCheck: (status: 'approved' | 'rejected' | 'pending') => void;
  onApprove: (force: boolean) => void;
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
      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
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
  onApprove,
}: Props) {
  const canForce = canForceApproveCourier(session.user) || row.can_force_approve;
  const bgStatus = row.background_check_status ?? detail?.background_check_status ?? null;
  const vehicles = detail?.vehicles ?? [];
  const compliance = detail?.compliance;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 flex flex-col h-full min-h-[480px]">
      <div className="px-5 py-4 border-b border-slate-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">
              {row.courier_name || row.courier_email || 'Courier review'}
            </h3>
            <p className="text-sm text-slate-400 mt-0.5">{row.courier_email}</p>
            <p className="text-xs text-slate-600 font-mono mt-1">{row.courier_id}</p>
          </div>
          <p className="text-xs capitalize text-slate-400">
            Account: <span className="text-slate-200">{row.account_status}</span>
          </p>
        </div>
        <div className="mt-3">
          <BlockerChips blockers={row.blockers} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {!canWrite && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            Read-only view. Write access requires courier_admin or platform role.
          </div>
        )}

        <Section title="Verification checklist" icon={<ShieldCheck className="w-4 h-4 text-emerald-400" />}>
          <ComplianceChecklist blockers={row.blockers} />
          {row.blockers.length > 0 && (
            <p className="text-xs text-slate-500 pt-1">Outstanding: {formatBlockersList(row.blockers)}</p>
          )}
        </Section>

        <Section title="Profile & onboarding" icon={<User className="w-4 h-4 text-slate-400" />}>
          <span
            className={`inline-flex px-2 py-0.5 rounded border text-xs ${
              row.onboarding_complete
                ? 'border-emerald-500/30 text-emerald-300'
                : 'border-amber-500/30 text-amber-200'
            }`}
          >
            {row.onboarding_complete ? 'Onboarding complete' : 'Onboarding incomplete'}
          </span>
        </Section>

        <Section title="Background check" icon={<FileCheck className="w-4 h-4 text-emerald-400" />}>
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

        <Section title="Vehicle" icon={<Car className="w-4 h-4 text-sky-400" />}>
          {detailLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
          ) : vehicles.length === 0 ? (
            <p className="text-xs text-slate-500">No vehicle registered in courier app.</p>
          ) : (
            <ul className="text-sm space-y-2">
              {vehicles.map((v) => (
                <li key={v.id} className="text-slate-300">
                  {v.year} {v.make} {v.model} · {v.license_plate}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="px-5 py-4 border-t border-slate-800 bg-slate-900/80 space-y-3">
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
              <ActionBtn variant="warning" disabled={actionLoading} onClick={() => onApprove(true)}>
                Force activate
              </ActionBtn>
            )}
            <ActionBtn disabled={actionLoading} onClick={onRefresh}>
              Refresh
            </ActionBtn>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Switch to a compliance admin account to take action.</p>
        )}
      </div>
    </div>
  );
}
