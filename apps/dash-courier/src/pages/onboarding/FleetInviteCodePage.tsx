import { useEffect, useState } from 'react';
import { OnboardingHeader } from '@/components/layout/OnboardingHeader';
import { Button, Input, Label } from '@roam/ui';
import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { normalizeFleetTagName } from '@roam/types';

type Props = {
  onBack: () => void;
  onContinue: () => void;
  accessToken: string;
};

type JoinMode = 'invite_code' | 'fleet_tag';

export function FleetInviteCodePage({ onBack, onContinue, accessToken }: Props) {
  const [mode, setMode] = useState<JoinMode>('invite_code');
  const [code, setCode] = useState('');
  const [fleetTag, setFleetTag] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [requestSent, setRequestSent] = useState<{ orgName: string; tag: string } | null>(null);

  useEffect(() => {
    if (skipped) onContinue();
  }, [skipped, onContinue]);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    apikey: publicAnonKey,
  };

  const accept = async () => {
    setLoading(true);
    setError(null);
    try {
      if (mode === 'invite_code') {
        if (!code.trim()) {
          onContinue();
          return;
        }
        const res = await fetch(`${API_ENDPOINTS.admin}/workforce/invites/accept`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ inviteCode: code.trim().toUpperCase() }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Invalid invite code');
        onContinue();
        return;
      }

      const tag = normalizeFleetTagName(fleetTag);
      if (!tag) {
        setError('Enter a Fleet Tag or skip if you work independently.');
        return;
      }
      const res = await fetch(`${API_ENDPOINTS.admin}/workforce/join-requests`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ fleetTag: tag, serviceLine: 'rush_delivery' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not submit join request');
      setRequestSent({
        orgName: typeof data.organization_name === 'string' ? data.organization_name : 'the fleet',
        tag: typeof data.fleet_tag === 'string' ? data.fleet_tag : tag,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join fleet');
    } finally {
      setLoading(false);
    }
  };

  if (skipped) return null;

  if (requestSent) {
    return (
      <div className="flex min-h-screen flex-col bg-background px-4 py-8">
        <OnboardingHeader title="Request sent" onBack={onBack} variant="centered" />
        <div className="mx-auto mt-8 w-full max-w-md space-y-4">
          <p className="text-sm text-muted-foreground">
            Waiting for {requestSent.orgName} (@{requestSent.tag}) to approve your join request.
            You can continue — you&apos;ll be linked once they accept.
          </p>
          <Button className="w-full" onClick={onContinue}>
            Continue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background px-4 py-8">
      <OnboardingHeader title="Join a fleet" onBack={onBack} variant="centered" />
      <div className="mx-auto mt-8 w-full max-w-md space-y-4">
        <p className="text-sm text-muted-foreground">
          Join with an invite code (instant), a Fleet Tag (owner must approve), or skip if you work
          independently. If your company invites you by Roam Tag, you&apos;ll see that later under
          Fleet Invites.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={mode === 'invite_code' ? 'default' : 'outline'}
            disabled={loading}
            onClick={() => {
              setMode('invite_code');
              setError(null);
            }}
          >
            Invite code
          </Button>
          <Button
            type="button"
            variant={mode === 'fleet_tag' ? 'default' : 'outline'}
            disabled={loading}
            onClick={() => {
              setMode('fleet_tag');
              setError(null);
            }}
          >
            Fleet Tag
          </Button>
        </div>

        {mode === 'invite_code' ? (
          <div>
            <Label htmlFor="invite">Fleet invite code</Label>
            <Input
              id="invite"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD1234"
              className="mt-1 uppercase tracking-widest"
              disabled={loading}
            />
          </div>
        ) : (
          <div>
            <Label htmlFor="fleet-tag">Fleet Tag</Label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                @
              </span>
              <Input
                id="fleet-tag"
                value={fleetTag}
                onChange={(e) => setFleetTag(normalizeFleetTagName(e.target.value))}
                placeholder="acme_fleet"
                className="pl-7 font-mono"
                maxLength={24}
                disabled={loading}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Your fleet owner must approve before you are linked.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" onClick={() => void accept()} disabled={loading}>
          {loading
            ? mode === 'fleet_tag'
              ? 'Sending…'
              : 'Joining…'
            : mode === 'fleet_tag'
              ? 'Request to join'
              : 'Continue'}
        </Button>
        <Button variant="ghost" className="w-full" disabled={loading} onClick={() => setSkipped(true)}>
          Skip — I&apos;m an independent courier
        </Button>
      </div>
    </div>
  );
}
