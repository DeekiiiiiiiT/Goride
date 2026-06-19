import React from 'react';
import { Loader2 } from 'lucide-react';
import { useHauler } from '../../contexts/HaulerContext';
import { HaulerOnboardingWizard } from '../auth/HaulerOnboardingWizard';
import { HaulerShell } from './HaulerShell';

export function HaulerAppGate() {
  const { profile, loading } = useHauler();

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#0b1326] text-[#d8c3ad]">
        <Loader2 className="h-8 w-8 animate-spin text-[#f59e0b]" />
      </div>
    );
  }

  if (!profile?.onboardingComplete) {
    return <HaulerOnboardingWizard />;
  }

  return <HaulerShell />;
}
