import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { FleetInviteCodePage } from '@/pages/onboarding/FleetInviteCodePage';

type Props = {
  onBack: () => void;
  onJoined?: () => void;
};

/** Post-onboarding fleet join — reuses invite code flow from onboarding. */
export function JoinFleetFromSettings({ onBack, onJoined }: Props) {
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token ?? null);
    });
  }, []);

  if (!accessToken) {
    return (
      <div className="fixed inset-0 z-[80] bg-background flex items-center justify-center">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] bg-background">
      <FleetInviteCodePage
        accessToken={accessToken}
        onBack={onBack}
        onContinue={() => {
          onJoined?.();
          onBack();
        }}
      />
    </div>
  );
}
