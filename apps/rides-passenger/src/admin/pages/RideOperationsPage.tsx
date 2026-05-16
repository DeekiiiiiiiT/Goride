import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';

interface OutletContext {
  session: Session;
  role: string | undefined;
}

export function RideOperationsPage() {
  const { role } = useOutletContext<OutletContext>();
  
  return (
    <div className="space-y-6 text-slate-200">
      <div>
        <h2 className="text-xl font-semibold text-white">Ride Operations</h2>
        <p className="text-sm text-slate-400 mt-1">
          Monitor and manage active rides.
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-8 text-center">
        <p className="text-slate-400">
          Ride operations tools coming soon. This will include:
        </p>
        <ul className="text-sm text-slate-500 mt-4 space-y-1">
          <li>• Active ride monitoring</li>
          <li>• Support tools for ride issues</li>
          <li>• Ride cancellation management</li>
          <li>• Driver assignment overrides</li>
        </ul>
      </div>

      <p className="text-xs text-slate-500">
        Role: <span className="font-mono">{role || 'unknown'}</span>
      </p>
    </div>
  );
}
