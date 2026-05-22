import React, { useState } from 'react';
import { Car, Loader2 } from 'lucide-react';
import { Button, Input, Label } from '@roam/ui';
import { useAuth } from '../AuthContext';
import { provisionFleetOwnerAccount } from '../../../services/fleetOwnerAuth';
import { supabase } from '../../../utils/supabase/client';

export function FleetOwnerSignupComplete({ fromRoamdriver }: { fromRoamdriver?: boolean }) {
  const { user, refreshSession } = useAuth();
  const [name, setName] = useState(
    (user?.user_metadata?.name as string) ||
      user?.email?.split('@')[0] ||
      '',
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session expired. Please sign in again.');

      const result = await provisionFleetOwnerAccount(token, {
        name: name.trim() || undefined,
        alsoDrive: true,
      });
      if (!result.success) throw new Error(result.error || 'Could not create fleet.');

      await refreshSession();
      window.history.replaceState({}, '', '/');
      window.location.reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-900">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-600">
            <Car className="h-7 w-7 text-white" />
          </div>
        </div>
        <h1 className="text-center text-2xl font-bold text-slate-900 dark:text-white">Create your fleet</h1>
        <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-300">
          {fromRoamdriver
            ? 'Finish setting up your Roam Fleet portal. You can keep using Roam Driver with the same account.'
            : 'You are almost done. Set up your rideshare fleet on Roam Fleet.'}
        </p>
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </div>
        )}
        <div className="mt-6 space-y-4">
          <div>
            <Label htmlFor="fleet-owner-name">Full name</Label>
            <Input
              id="fleet-owner-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Fleet owner name"
              className="mt-1.5"
            />
          </div>
          <Button type="button" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={loading} onClick={() => void finish()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create fleet account'}
          </Button>
        </div>
      </div>
    </div>
  );
}
