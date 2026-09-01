import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button, Input, Label } from '@roam/ui';
import { api } from '../../../services/api';

export interface JoinFleetStepProps {
  onSuccess: () => void | Promise<void>;
  onBack: () => void;
  /** Optional post-join hook (e.g. mark onboarding complete in Google flow). */
  afterJoin?: () => Promise<void>;
  disabled?: boolean;
}

/**
 * Shared invite-code fleet join step for hybrid and Google driver onboarding.
 */
export function JoinFleetStep({ onSuccess, onBack, afterJoin, disabled }: JoinFleetStepProps) {
  const [inviteCode, setInviteCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const handleJoinFleet = async () => {
    setJoinError(null);
    const code = inviteCode.trim().toUpperCase();
    if (!code) {
      setJoinError('Enter the invite code your fleet gave you.');
      return;
    }
    setJoining(true);
    try {
      await api.acceptWorkforceInvite(code);
      if (afterJoin) await afterJoin();
      await onSuccess();
    } catch (e: unknown) {
      setJoinError(e instanceof Error ? e.message : 'Could not join fleet.');
    } finally {
      setJoining(false);
    }
  };

  const busy = joining || disabled;

  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Join a fleet</h1>
      <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-300">
        Enter the 8-character invite code your fleet admin gave you.
      </p>
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-xl dark:border-slate-700/60 dark:bg-slate-800/60">
        {joinError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {joinError}
          </div>
        )}
        <Label htmlFor="fleet-invite-code">Fleet invite code</Label>
        <Input
          id="fleet-invite-code"
          value={inviteCode}
          onChange={e => setInviteCode(e.target.value.toUpperCase())}
          placeholder="ABCD1234"
          className="mt-2 font-mono text-sm tracking-widest"
          autoComplete="off"
          maxLength={8}
          disabled={busy}
        />
        <div className="mt-6 flex flex-col gap-2">
          <Button type="button" className="w-full" disabled={busy} onClick={() => void handleJoinFleet()}>
            {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Join fleet'}
          </Button>
          <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={onBack}>
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}
