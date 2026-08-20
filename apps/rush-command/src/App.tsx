import { useEffect, useState, useCallback } from 'react';
import { AuthRecoveryGate } from '@roam/auth-client';
import type { Session } from '@supabase/supabase-js';
import {
  canAccessCommand,
  hasDeviceSession,
} from '@roam/merchant-ops';
import SplashPage from './pages/SplashPage';
import StoreTabletApp from './components/store-tablet/StoreTabletApp';
import LoginPage from './pages/LoginPage';
import CommandOwnerPage from './pages/CommandOwnerPage';
import CommandNotInvitedPage from './pages/CommandNotInvitedPage';
import QueryErrorState from './components/QueryErrorState';
import { useMerchant } from './hooks/useMerchant';
import {
  supabase,
  ensureValidCommandSession,
  migratePartnerSessionToCommand,
} from './lib/command-supabase';
import { initCommandMerchantOps } from './lib/init-command-merchant-ops';
import { isTabletEntryPath } from './lib/storeTabletUrl';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { toast } from 'sonner';

initCommandMerchantOps();

const SPLASH_MIN_MS = 1200;
const AUTH_READY_MAX_MS = 6_000;

export default function App() {
  return (
    <AuthRecoveryGate title="Reset password" subtitle="Roam Command" signInHref="/">
      <CommandApp />
    </AuthRecoveryGate>
  );
}

function CommandApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [splashComplete, setSplashComplete] = useState(false);
  const { isOnline, wasOffline, clearWasOffline } = useNetworkStatus();

  const { merchant, isLoading: merchantLoading, error: merchantError, refetch } = useMerchant(session);

  useEffect(() => {
    if (wasOffline && isOnline) {
      toast.success('Back online');
      clearWasOffline();
    }
  }, [wasOffline, isOnline, clearWasOffline]);

  useEffect(() => {
    migratePartnerSessionToCommand();
    const splashStartedAt = Date.now();
    let splashTimer: number | undefined;
    const authFailSafe = window.setTimeout(() => {
      setAuthReady(true);
      setSplashComplete(true);
    }, AUTH_READY_MAX_MS);

    void supabase.auth
      .getSession()
      .then(({ data: { session: initialSession } }) => {
        window.clearTimeout(authFailSafe);
        setSession(initialSession);
        setAuthReady(true);
        if (initialSession) {
          void ensureValidCommandSession().then(setSession);
        }
        const elapsed = Date.now() - splashStartedAt;
        splashTimer = window.setTimeout(
          () => setSplashComplete(true),
          Math.max(0, SPLASH_MIN_MS - elapsed),
        );
      })
      .catch(() => {
        window.clearTimeout(authFailSafe);
        setAuthReady(true);
        setSplashComplete(true);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      subscription.unsubscribe();
      window.clearTimeout(authFailSafe);
      if (splashTimer) window.clearTimeout(splashTimer);
    };
  }, []);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const showKiosk = isTabletEntryPath() || hasDeviceSession();

  if (!splashComplete || !authReady) {
    return <SplashPage title="Roam Command" />;
  }

  if (showKiosk) {
    return <StoreTabletApp />;
  }

  if (!session) {
    return (
      <LoginPage
        onSuccess={async () => {
          const {
            data: { session: nextSession },
          } = await supabase.auth.getSession();
          setSession(nextSession);
        }}
        inviteMode
      />
    );
  }

  if (merchantLoading) {
    return <SplashPage title="Roam Command" />;
  }

  if (merchantError || !merchant) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface p-inset-lg">
        <QueryErrorState
          title="Could not load your store"
          message="Sign out and try again, or use Roam Partner if you only need delivery orders."
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  if (!canAccessCommand(merchant.id, merchant)) {
    return <CommandNotInvitedPage onSignOut={() => void handleSignOut()} />;
  }

  return (
    <div className="command-app-shell min-h-dvh bg-background">
      {!isOnline && (
        <div
          role="status"
          className="sticky top-0 z-[60] bg-error px-margin-mobile py-2 text-center text-label-md font-semibold text-on-error"
        >
          No internet connection — live updates paused
        </div>
      )}
      <CommandOwnerPage merchant={merchant} onSignOut={() => void handleSignOut()} />
    </div>
  );
}
