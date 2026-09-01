import { useEffect, useState } from 'react';
import { OnboardingHeader } from '@/components/layout/OnboardingHeader';
import { Button, Input, Label } from '@roam/ui';
import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';

type Props = {
  onBack: () => void;
  onContinue: () => void;
  accessToken: string;
};

export function FleetInviteCodePage({ onBack, onContinue, accessToken }: Props) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    if (skipped) onContinue();
  }, [skipped, onContinue]);

  const accept = async () => {
    if (!code.trim()) {
      onContinue();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/workforce/invites/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          apikey: publicAnonKey,
        },
        body: JSON.stringify({ inviteCode: code.trim().toUpperCase() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Invalid invite code');
      onContinue();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not accept invite');
    } finally {
      setLoading(false);
    }
  };

  if (skipped) return null;

  return (
    <div className="flex min-h-screen flex-col bg-background px-4 py-8">
      <OnboardingHeader title="Join a fleet" onBack={onBack} variant="centered" />
      <div className="mx-auto mt-8 w-full max-w-md space-y-4">
        <p className="text-sm text-muted-foreground">
          If your fleet owner gave you an invite code, enter it here. You can skip if you work independently.
        </p>
        <div>
          <Label htmlFor="invite">Fleet invite code</Label>
          <Input
            id="invite"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD1234"
            className="mt-1 uppercase tracking-widest"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" onClick={() => void accept()} disabled={loading}>
          {loading ? 'Joining…' : 'Continue'}
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => setSkipped(true)}>
          Skip — I&apos;m an independent courier
        </Button>
      </div>
    </div>
  );
}
