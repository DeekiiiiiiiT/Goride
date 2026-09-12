import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button, Input, Label } from '@roam/ui';
import { api } from '../../../services/api';
import { normalizeFleetTagName } from '@roam/types';

export interface JoinFleetStepProps {
  onSuccess: () => void | Promise<void>;
  onBack: () => void;
  /** Optional post-join hook (e.g. mark onboarding complete in Google flow). */
  afterJoin?: () => Promise<void>;
  disabled?: boolean;
}

type JoinMode = 'invite_code' | 'fleet_tag';

/**
 * Shared fleet join step: invite code (instant) or Fleet Tag (request + wait).
 */
export function JoinFleetStep({ onSuccess, onBack, afterJoin, disabled }: JoinFleetStepProps) {
  const [mode, setMode] = useState<JoinMode>('invite_code');
  const [inviteCode, setInviteCode] = useState('');
  const [fleetTag, setFleetTag] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [requestSent, setRequestSent] = useState<{ orgName: string; tag: string } | null>(null);

  const handleJoinFleet = async () => {
    setJoinError(null);
    setJoining(true);
    try {
      if (mode === 'invite_code') {
        const code = inviteCode.trim().toUpperCase();
        if (!code) {
          setJoinError('Enter the invite code your fleet gave you.');
          return;
        }
        await api.acceptWorkforceInvite(code);
        if (afterJoin) await afterJoin();
        await onSuccess();
        return;
      }

      const tag = normalizeFleetTagName(fleetTag);
      if (!tag) {
        setJoinError('Enter the Fleet Tag for the fleet you want to join.');
        return;
      }
      const result = await api.requestFleetJoin(tag, 'rideshare');
      setRequestSent({
        orgName: result.organization_name || 'the fleet',
        tag: result.fleet_tag || tag,
      });
    } catch (e: unknown) {
      setJoinError(e instanceof Error ? e.message : 'Could not join fleet.');
    } finally {
      setJoining(false);
    }
  };

  const busy = joining || disabled;

  if (requestSent) {
    return (
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Request sent
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-300">
          Waiting for {requestSent.orgName} (@{requestSent.tag}) to approve your join request.
          You can continue — you&apos;ll be linked once they accept.
        </p>
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-xl dark:border-slate-700/60 dark:bg-slate-800/60">
          <Button
            type="button"
            className="w-full"
            onClick={() => void (async () => {
              if (afterJoin) await afterJoin();
              await onSuccess();
            })()}
          >
            Continue
          </Button>
          <Button type="button" variant="ghost" className="mt-2 w-full" onClick={onBack}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Join a fleet</h1>
      <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-300">
        Use an invite code for instant join, or a Fleet Tag to request approval.
      </p>
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-xl dark:border-slate-700/60 dark:bg-slate-800/60">
        <div className="mb-4 grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={mode === 'invite_code' ? 'default' : 'outline'}
            className="w-full"
            disabled={busy}
            onClick={() => {
              setMode('invite_code');
              setJoinError(null);
            }}
          >
            Invite code
          </Button>
          <Button
            type="button"
            variant={mode === 'fleet_tag' ? 'default' : 'outline'}
            className="w-full"
            disabled={busy}
            onClick={() => {
              setMode('fleet_tag');
              setJoinError(null);
            }}
          >
            Fleet Tag
          </Button>
        </div>

        {joinError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {joinError}
          </div>
        )}

        {mode === 'invite_code' ? (
          <>
            <Label htmlFor="fleet-invite-code">Fleet invite code</Label>
            <Input
              id="fleet-invite-code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="ABCD1234"
              className="mt-2 font-mono text-sm tracking-widest"
              autoComplete="off"
              maxLength={8}
              disabled={busy}
            />
          </>
        ) : (
          <>
            <Label htmlFor="fleet-tag">Fleet Tag</Label>
            <div className="relative mt-2">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">@</span>
              <Input
                id="fleet-tag"
                value={fleetTag}
                onChange={(e) => setFleetTag(normalizeFleetTagName(e.target.value))}
                placeholder="acme_fleet"
                className="pl-7 font-mono text-sm"
                autoComplete="off"
                maxLength={24}
                disabled={busy}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Your fleet owner must approve before you are linked.
            </p>
          </>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <Button type="button" className="w-full" disabled={busy} onClick={() => void handleJoinFleet()}>
            {joining ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === 'invite_code' ? (
              'Join fleet'
            ) : (
              'Request to join'
            )}
          </Button>
          <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={onBack}>
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}
