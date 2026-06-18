import React from 'react';
import type { User } from '@supabase/supabase-js';
import { userMetadataSurface } from '@roam/auth-client';

const RIDES_PUBLIC = 'https://roam-s.co/login';
const HAUL_PUBLIC = 'https://roamhaul.co';

type Props = {
  user: User;
  onSignOut: () => Promise<void>;
};

export function PassengerFleetSurfaceGate({ user, onSignOut }: Props) {
  const surface = userMetadataSurface(user);
  const isHauler = surface === 'hauler';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 px-6">
      <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-sm text-center space-y-4">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
          {isHauler ? 'Hauler account' : 'Rider account'}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          {isHauler ? (
            <>
              You signed in as a hauler, but this is <strong>Roam Fleet</strong> (fleet operators). Open{' '}
              <strong>Roam Haul</strong> to accept freight jobs.
            </>
          ) : (
            <>
              You are signed in with a Roam Rides rider profile. <strong>Roam Fleet</strong> is for fleet and
              platform operators — not riders or haulers. If you meant to haul freight, use Roam Haul instead.
            </>
          )}
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <a
            href={isHauler ? HAUL_PUBLIC : RIDES_PUBLIC}
            className="w-full inline-flex justify-center rounded-xl bg-emerald-600 py-3 text-sm font-medium text-white hover:bg-emerald-500"
          >
            {isHauler ? 'Open Roam Haul' : 'Open Roam Rides'}
          </a>
          {!isHauler && (
            <a
              href={HAUL_PUBLIC}
              className="w-full inline-flex justify-center rounded-xl border border-slate-200 dark:border-slate-700 py-3 text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Open Roam Haul
            </a>
          )}
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 py-3 text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
