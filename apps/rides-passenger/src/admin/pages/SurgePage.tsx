import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { SurgeCellsManager } from './SurgeCellsManager';

interface OutletContext {
  session: Session;
  role: string | undefined;
}

export function SurgePage() {
  const { session, role } = useOutletContext<OutletContext>();
  
  return <SurgeCellsManager accessToken={session.access_token} role={role} />;
}
