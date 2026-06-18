import React from 'react';
import { Loader2, Car, Navigation, Truck, CircleCheck, CircleX } from 'lucide-react';
import type { CrossProductStatus } from '../../../services/platform/identityService';

export interface CrossProductStatusPanelProps {
  status: CrossProductStatus | null;
  loading?: boolean;
}

export function CrossProductStatusPanel({ status, loading }: CrossProductStatusPanelProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
      </div>
    );
  }

  if (!status) {
    return <p className="text-sm text-slate-500 py-6 text-center">No status loaded.</p>;
  }

  return (
    <div className="space-y-4">
      {(status.email || status.name || status.phone) && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400">
          <div>
            <span className="text-slate-500">Email: </span>
            <span className="text-slate-200">{status.email}</span>
          </div>
          {status.name && (
            <div>
              <span className="text-slate-500">Name: </span>
              <span className="text-slate-200">{status.name}</span>
            </div>
          )}
          {status.phone && (
            <div>
              <span className="text-slate-500">Phone: </span>
              <span className="text-slate-200">{status.phone}</span>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-50 rounded-lg p-4 dark:bg-slate-800/50">
          <div className="flex items-center gap-2 mb-3">
            <Car className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-slate-900 dark:text-white">Roam Driver</span>
            {status.products.driver?.exists ? (
              <CircleCheck className="w-4 h-4 text-emerald-400 ml-auto" />
            ) : (
              <CircleX className="w-4 h-4 text-slate-500 ml-auto" />
            )}
          </div>
          {status.products.driver?.exists ? (
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Status</span>
                <span
                  className={`font-medium ${
                    status.products.driver.status === 'active'
                      ? 'text-emerald-400'
                      : status.products.driver.status === 'suspended'
                        ? 'text-amber-400'
                        : status.products.driver.status === 'deactivated'
                          ? 'text-red-400'
                          : 'text-slate-300'
                  }`}
                >
                  {status.products.driver.status || 'Unknown'}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Mode</span>
                <span className="text-slate-300">{status.products.driver.mode || '—'}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Onboarding</span>
                <span className="text-slate-300">
                  {status.products.driver.onboarding_complete ? 'Complete' : 'Incomplete'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Not a driver</p>
          )}
        </div>

        <div className="bg-slate-50 rounded-lg p-4 dark:bg-slate-800/50">
          <div className="flex items-center gap-2 mb-3">
            <Navigation className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-slate-900 dark:text-white">Roam Rides</span>
            {status.products.rider?.exists ? (
              <CircleCheck className="w-4 h-4 text-emerald-400 ml-auto" />
            ) : (
              <CircleX className="w-4 h-4 text-slate-500 ml-auto" />
            )}
          </div>
          {status.products.rider?.exists ? (
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Status</span>
                <span
                  className={`font-medium ${
                    status.products.rider.account_status === 'active'
                      ? 'text-emerald-400'
                      : status.products.rider.account_status === 'suspended'
                        ? 'text-amber-400'
                        : status.products.rider.account_status === 'banned'
                          ? 'text-red-400'
                          : 'text-slate-300'
                  }`}
                >
                  {status.products.rider.account_status || 'Unknown'}
                </span>
              </div>
              {status.products.rider.display_name && (
                <div className="flex justify-between text-slate-400">
                  <span>Name</span>
                  <span className="text-slate-300 truncate max-w-[120px]">
                    {status.products.rider.display_name}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500">{status.products.rider?.error || 'Not a rider'}</p>
          )}
        </div>

        <div className="bg-slate-50 rounded-lg p-4 dark:bg-slate-800/50">
          <div className="flex items-center gap-2 mb-3">
            <Truck className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-slate-900 dark:text-white">Roam Fleet</span>
            {status.products.fleet?.exists ? (
              <CircleCheck className="w-4 h-4 text-emerald-400 ml-auto" />
            ) : (
              <CircleX className="w-4 h-4 text-slate-500 ml-auto" />
            )}
          </div>
          {status.products.fleet?.exists ? (
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Role</span>
                <span className="text-slate-300">{status.products.fleet.role || '—'}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Status</span>
                <span
                  className={`font-medium ${
                    status.products.fleet.account_status === 'active' ||
                    !status.products.fleet.account_status
                      ? 'text-emerald-400'
                      : status.products.fleet.account_status === 'suspended'
                        ? 'text-amber-400'
                        : 'text-slate-300'
                  }`}
                >
                  {status.products.fleet.account_status || 'Active'}
                </span>
              </div>
              {status.products.fleet.business_type && (
                <div className="flex justify-between text-slate-400">
                  <span>Type</span>
                  <span className="text-slate-300 capitalize">{status.products.fleet.business_type}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Not a fleet manager</p>
          )}
        </div>
      </div>

      {status.auth_status && (
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
          <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Auth Status</h4>
          <div className="flex flex-wrap gap-4 text-xs text-slate-400">
            <div>
              <span className="text-slate-500">Auth ban: </span>
              {status.auth_status.is_banned ? (
                <span className="text-red-400">
                  Until{' '}
                  {status.auth_status.banned_until
                    ? new Date(status.auth_status.banned_until).toLocaleDateString()
                    : 'indefinitely'}
                </span>
              ) : (
                <span className="text-emerald-400">Not banned</span>
              )}
            </div>
            <div>
              <span className="text-slate-500">Email: </span>
              {status.auth_status.email_confirmed_at ? (
                <span className="text-emerald-400">Verified</span>
              ) : (
                <span className="text-amber-400">Unverified</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
