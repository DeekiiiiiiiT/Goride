import React from 'react';
import { ShieldAlert } from 'lucide-react';

export function WrongHaulSurfaceGate({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 p-8">
      <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mb-4">
        <ShieldAlert className="w-8 h-8 text-red-400" />
      </div>
      <h1 className="text-xl font-semibold mb-2">Wrong account type</h1>
      <p className="text-slate-400 text-center max-w-md mb-6 text-sm">
        This portal is for haulers. Use roamdriver.co for rideshare, or roam-s.co for riding.
      </p>
      <button
        type="button"
        onClick={() => void onSignOut()}
        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium"
      >
        Sign out
      </button>
    </div>
  );
}
