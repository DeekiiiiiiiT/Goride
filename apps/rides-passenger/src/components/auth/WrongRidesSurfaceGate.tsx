import React from 'react';

type Props = {
  onSignOut: () => Promise<void>;
};

export function WrongRidesSurfaceGate({ onSignOut }: Props) {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-zinc-100 px-6 safe-x safe-t safe-b">
      <div className="max-w-md w-full rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm text-center space-y-4">
        <h1 className="text-lg font-semibold text-zinc-900">Wrong app for this account</h1>
        <p className="text-sm text-zinc-600 leading-relaxed">
          Roam Rides is for rider and driver accounts. Your profile is set to a fleet or platform role, so this
          shell is blocked.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="w-full rounded-xl bg-zinc-900 py-3 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Sign out
          </button>
          <p className="text-xs text-zinc-500">
            Sign out above, then open the Roam product that matches your role (for example Roam Fleet).
          </p>
        </div>
      </div>
    </div>
  );
}
