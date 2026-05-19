import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { DispatchSettingsForm } from '../components/DispatchSettingsForm';

interface OutletContext {
  session: Session;
  role: string | undefined;
}

export function ControlPanelPage() {
  const { session, role } = useOutletContext<OutletContext>();

  return (
    <div className="space-y-6 text-slate-200">
      <div>
        <h2 className="text-xl font-semibold text-white">Control Panel</h2>
        <p className="text-sm text-slate-400 mt-1">
          Global dispatch and matching rules. Body types, services, and fares are configured elsewhere.
        </p>
      </div>
      <DispatchSettingsForm accessToken={session.access_token} role={role} />
    </div>
  );
}
