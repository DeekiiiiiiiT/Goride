import React from 'react';
import { FLEET_PUBLIC_URL, ENTERPRISE_PUBLIC_URL, PRODUCT_LINE } from '../../config/productLine';

type Props = {
  message?: string;
  expectedProductLine?: 'fleet' | 'enterprise';
  onSignOut: () => Promise<void>;
};

export function WrongProductLineGate({ message, expectedProductLine, onSignOut }: Props) {
  const isFleetPortal = PRODUCT_LINE === 'fleet';
  const targetUrl = expectedProductLine === 'enterprise' || (!expectedProductLine && !isFleetPortal)
    ? ENTERPRISE_PUBLIC_URL
    : FLEET_PUBLIC_URL;
  const targetLabel = targetUrl.includes('enterprise') ? 'Roam Enterprise' : 'Roam Fleet';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 px-6">
      <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-sm text-center space-y-4">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Wrong product</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          {message ||
            `This account is registered on ${targetLabel}. Sign in there to access your fleet dashboard.`}
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <a
            href={targetUrl}
            className="w-full inline-flex justify-center rounded-xl bg-indigo-600 py-3 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Open {targetLabel}
          </a>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 py-3 text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
