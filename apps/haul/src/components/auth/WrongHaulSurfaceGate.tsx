import React from 'react';
import type { User } from '@supabase/supabase-js';
import { isPassengerOnlyMetadataRole } from '@roam/auth-client';
import { ShieldAlert } from 'lucide-react';

const RIDES_PUBLIC = 'https://roam-s.co/login';
const FLEET_PUBLIC = 'https://roamfleet.co';

export function WrongHaulSurfaceGate({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const isRider = isPassengerOnlyMetadataRole(user.user_metadata?.role as string | undefined);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-8 text-slate-200">
      <div className="w-full max-w-md space-y-4 text-center">
        <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15">
          <ShieldAlert className="h-8 w-8 text-red-400" />
        </div>
        <h1 className="text-xl font-semibold">{isRider ? 'Roam Rides account' : 'Wrong account type'}</h1>
        <p className="text-sm leading-relaxed text-slate-400">
          {isRider ? (
            <>
              <strong>{user.email}</strong> is signed in as a Roam Rides rider. Roam Haul uses the same login, but
              you need a hauler profile here. Sign out, then sign up again on this page — your rider account will be
              linked for freight jobs.
            </>
          ) : (
            <>
              This app is for haulers. Use roamdriver.co for rideshare driving, roam-s.co for riding, or
              roamfleet.co for fleet operations.
            </>
          )}
        </p>
        <div className="flex flex-col gap-2 pt-2">
          {isRider && (
            <a
              href={RIDES_PUBLIC}
              className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium hover:bg-slate-800"
            >
              Open Roam Rides
            </a>
          )}
          {!isRider && (
            <a
              href={FLEET_PUBLIC}
              className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium hover:bg-slate-800"
            >
              Open Roam Fleet
            </a>
          )}
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"
          >
            Sign out and try again
          </button>
        </div>
      </div>
    </div>
  );
}
