import React from 'react';

const RIDES_PUBLIC = 'https://roam-s.co/login';

type Props = {
  variant: 'passenger' | 'other';
  onSignOut: () => Promise<void>;
};

export function WrongAdminSurfaceGate({ variant, onSignOut }: Props) {
  const title = variant === 'passenger' ? 'Rider account' : 'Wrong portal';
  const body =
    variant === 'passenger'
      ? 'This portal is for platform administrators only. Use Roam Rides for rider booking.'
      : 'This portal is for platform administrators only. Sign out and open the correct Roam product for your role.';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-950 px-6">
      <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-8 shadow-sm text-center space-y-4">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{body}</p>
        <div className="flex flex-col gap-2 pt-2">
          {variant === 'passenger' && (
            <a
              href={RIDES_PUBLIC}
              className="w-full inline-flex justify-center rounded-xl bg-emerald-600 py-3 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Open Roam Rides
            </a>
          )}
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="w-full rounded-xl border border-slate-300 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
