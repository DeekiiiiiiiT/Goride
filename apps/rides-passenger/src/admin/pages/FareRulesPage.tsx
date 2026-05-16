import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { FareRulesManager } from './FareRulesManager';

interface OutletContext {
  session: Session;
  role: string | undefined;
}

export function FareRulesPage() {
  const { session } = useOutletContext<OutletContext>();
  
  return <FareRulesManager accessToken={session.access_token} />;
}
