import React from 'react';
import { AlertCircle, CheckCircle, Shield } from 'lucide-react';
import { cn } from '@roam/ui';
import { useAuth } from '../../contexts/AuthContext';
import { useDriver } from '../../contexts/DriverContext';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { getDocStatus, useDriverProfileExtras } from '../../hooks/useDriverProfileExtras';

const cardClass =
  'rounded-2xl border border-slate-200 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-900';

export function InsuranceCenter() {
  const { user } = useAuth();
  const { profile } = useDriver();
  const { driverRecord } = useCurrentDriver();
  const { vehicle, loading } = useDriverProfileExtras(driverRecord, user);

  const expiry =
    (vehicle?.insuranceExpiry as string | undefined) ||
    (driverRecord?.insuranceExpiry as string | undefined) ||
    (driverRecord?.insurance_expiry as string | undefined) ||
    undefined;
  const provider =
    profile?.insuranceProvider ||
    (driverRecord?.insuranceProvider as string | undefined) ||
    (vehicle?.insuranceProvider as string | undefined) ||
    undefined;

  const hasPolicy = Boolean(expiry || provider);
  const status = getDocStatus(expiry);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">Insurance</h1>

      <div
        className={cn(
          cardClass,
          'border-sky-200 bg-gradient-to-br from-sky-50 to-cyan-50 p-5 dark:from-sky-950/40 dark:to-cyan-950/30',
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-950/60">
            <Shield className="h-6 w-6 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900 dark:text-white">Insurance Status</p>
            {loading ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
            ) : hasPolicy ? (
              <>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {provider ? `${provider} · ` : ''}
                  {status.text}
                </p>
                {expiry && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Expiry on file: {new Date(expiry).toLocaleDateString()}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">No policy on file</p>
            )}
          </div>
          {loading ? null : hasPolicy && status.status === 'valid' ? (
            <CheckCircle className="h-6 w-6 shrink-0 text-emerald-500" />
          ) : (
            <AlertCircle className="h-6 w-6 shrink-0 text-amber-500" />
          )}
        </div>
      </div>

      <p className="px-1 text-sm text-slate-600 dark:text-slate-400">
        Contact support to update insurance on your account.
      </p>
    </div>
  );
}
