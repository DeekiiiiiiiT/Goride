import React, { useEffect, useState } from 'react';
import { Building2, Car, Loader2 } from 'lucide-react';
import { Button } from '@roam/ui';
import { Input } from '@roam/ui';
import { Label } from '@roam/ui';
import { useDriver } from '../../contexts/DriverContext';
import { DriverOnboardingPage } from '../auth/DriverOnboardingPage';
import { api } from '../../services/api';

type Step = 'mode' | 'fleet' | 'profile';

/**
 * Minimal hybrid flow: choose fleet vs independent, optional fleet UUID join, then shared profile wizard.
 */
export function DriverHybridOnboarding() {
  const { profile, loading, refreshProfile } = useDriver();
  const [step, setStep] = useState<Step>('mode');
  const [fleetId, setFleetId] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (profile?.mode === 'fleet' && profile.fleetId) {
      setStep('profile');
    }
  }, [loading, profile?.fleetId, profile?.mode]);

  const goProfile = () => setStep('profile');

  const handleJoinFleet = async () => {
    setJoinError(null);
    const id = fleetId.trim();
    if (!id) {
      setJoinError('Enter your fleet organization ID.');
      return;
    }
    setJoining(true);
    try {
      await api.joinFleetByFleetId(id);
      await refreshProfile();
      goProfile();
    } catch (e: unknown) {
      setJoinError(e instanceof Error ? e.message : 'Could not join fleet.');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 dark:bg-slate-900">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600 dark:text-emerald-400" />
      </div>
    );
  }

  if (step === 'profile') {
    return <DriverOnboardingPage />;
  }

  if (step === 'fleet') {
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-100 via-white to-slate-100 px-4 py-10 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Join your fleet</h1>
          <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-300">
            Paste the organization ID your fleet admin shared with you.
          </p>
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-xl dark:border-slate-700/60 dark:bg-slate-800/60">
            {joinError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                {joinError}
              </div>
            )}
            <Label htmlFor="fleet-org">Fleet organization ID</Label>
            <Input
              id="fleet-org"
              value={fleetId}
              onChange={e => setFleetId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="mt-2 font-mono text-sm"
              autoComplete="off"
            />
            <div className="mt-6 flex flex-col gap-2">
              <Button type="button" className="w-full" disabled={joining} onClick={() => void handleJoinFleet()}>
                {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Join fleet'}
              </Button>
              <Button type="button" variant="ghost" className="w-full" disabled={joining} onClick={() => setStep('mode')}>
                Back
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-100 via-white to-slate-100 px-4 py-10 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900 dark:text-white">How do you drive?</h1>
        <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-300">
          Choose one to continue. You can finish documents on the next step.
        </p>
        <div className="mt-8 grid gap-4">
          <button
            type="button"
            onClick={() => setStep('fleet')}
            className="flex flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-emerald-500/40 hover:shadow-md dark:border-slate-700 dark:bg-slate-800/80 dark:hover:border-emerald-500/30"
          >
            <Building2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            <span className="text-base font-semibold text-slate-900 dark:text-white">With a fleet</span>
            <span className="text-sm text-slate-600 dark:text-slate-300">I have a fleet ID from my company.</span>
          </button>
          <button
            type="button"
            onClick={() => goProfile()}
            className="flex flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-emerald-500/40 hover:shadow-md dark:border-slate-700 dark:bg-slate-800/80 dark:hover:border-emerald-500/30"
          >
            <Car className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            <span className="text-base font-semibold text-slate-900 dark:text-white">On my own</span>
            <span className="text-sm text-slate-600 dark:text-slate-300">Independent driver — continue to profile setup.</span>
          </button>
        </div>
      </div>
    </div>
  );
}
