import React from 'react';
import { AlertCircle, Car, CheckCircle, Edit, Plus } from 'lucide-react';
import { cn } from '@roam/ui';

const cardClass =
  'rounded-2xl border border-slate-200 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-900';

export function MyVehicle() {
  const hasVehicle = false;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">My Vehicle</h1>

      {!hasVehicle ? (
        <div className={cn(cardClass, 'p-8 text-center')}>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
            <Car className="h-8 w-8 text-slate-400 dark:text-slate-500" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">Add Your Vehicle</h3>
          <p className="mx-auto mb-6 max-w-xs text-sm text-slate-600 dark:text-slate-400">
            Add your vehicle information to track maintenance, expenses, and platform approvals.
          </p>
          <button
            type="button"
            className="mx-auto inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Add Vehicle
          </button>
        </div>
      ) : (
        <>
          <div className={cn(cardClass, 'p-5')}>
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/50">
                  <Car className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">2022 Toyota Camry</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">ABC-1234</p>
                </div>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                aria-label="Edit vehicle"
              >
                <Edit className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/80">
                <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Ownership</p>
                <p className="text-sm font-medium text-slate-900 dark:text-white">Owned</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/80">
                <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Mileage</p>
                <p className="text-sm font-medium text-slate-900 dark:text-white">45,000 mi</p>
              </div>
            </div>
          </div>

          <section>
            <h2 className="mb-3 px-1 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Platform Status
            </h2>
            <div className={cn(cardClass, 'divide-y divide-slate-100 overflow-hidden dark:divide-slate-800')}>
              <PlatformStatus platform="Uber" status="approved" />
              <PlatformStatus platform="Lyft" status="pending" />
              <PlatformStatus platform="Bolt" status="not_submitted" />
            </div>
          </section>

          <section>
            <h2 className="mb-3 px-1 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Documents
            </h2>
            <div className={cn(cardClass, 'divide-y divide-slate-100 overflow-hidden dark:divide-slate-800')}>
              <DocumentItem label="Registration" expires="Dec 2026" status="valid" />
              <DocumentItem label="Insurance" expires="Jun 2026" status="expiring" />
              <DocumentItem label="Inspection" expires="Mar 2026" status="expired" />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function PlatformStatus({
  platform,
  status,
}: {
  platform: string;
  status: 'approved' | 'pending' | 'not_submitted' | 'rejected';
}) {
  const statusConfig = {
    approved: {
      label: 'Approved',
      className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400',
    },
    pending: {
      label: 'Pending',
      className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400',
    },
    not_submitted: {
      label: 'Not Submitted',
      className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    },
    rejected: {
      label: 'Rejected',
      className: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-400',
    },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm font-medium text-slate-900 dark:text-white">{platform}</span>
      <span className={cn('rounded-full px-2 py-1 text-xs font-semibold', config.className)}>
        {config.label}
      </span>
    </div>
  );
}

function DocumentItem({
  label,
  expires,
  status,
}: {
  label: string;
  expires: string;
  status: 'valid' | 'expiring' | 'expired';
}) {
  const Icon = status === 'valid' ? CheckCircle : AlertCircle;
  const color =
    status === 'valid'
      ? 'text-emerald-600 dark:text-emerald-400'
      : status === 'expiring'
        ? 'text-amber-500'
        : 'text-red-500';

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Expires: {expires}</p>
      </div>
      <Icon className={cn('h-5 w-5', color)} />
    </div>
  );
}
