import { useEffect, useRef, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { supabase } from '@roam/auth-client';
import { MaterialIcon } from '../signup/components/MaterialIcon';
import PartnerAuthFlow from '../components/PartnerAuthFlow';
import {
  acceptTeamInviteByToken,
  fetchTeamInvitePreview,
  type TeamInvitePreviewData,
} from '../lib/partner-api';
import {
  clearTeamInvitePath,
  clearTeamInviteToken,
  parseTeamInviteTokenFromPath,
  persistTeamInviteToken,
  readTeamInviteToken,
} from '../lib/teamInviteSession';
import { formatRoleLabel, TeamRole } from '../types/team';

interface TeamInviteLandingPageProps {
  session: Session | null;
  inviteToken?: string | null;
  onAccepted: () => void;
}

export default function TeamInviteLandingPage({
  session,
  inviteToken: inviteTokenProp,
  onAccepted,
}: TeamInviteLandingPageProps) {
  const [preview, setPreview] = useState<TeamInvitePreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [wrongAccount, setWrongAccount] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const acceptAttempted = useRef(false);

  const token =
    inviteTokenProp ||
    parseTeamInviteTokenFromPath() ||
    readTeamInviteToken();

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    persistTeamInviteToken(token);
    void fetchTeamInvitePreview(token)
      .then((res) => setPreview(res.invite))
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Invite not found'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!session?.user || !token || !preview || acceptAttempted.current) return;
    acceptAttempted.current = true;
    void (async () => {
      setClaiming(true);
      setWrongAccount(false);
      try {
        await acceptTeamInviteByToken(token);
        clearTeamInviteToken();
        clearTeamInvitePath();
        toast.success(`You joined ${preview.merchantName}`);
        onAccepted();
      } catch (err) {
        acceptAttempted.current = false;
        const message = err instanceof Error ? err.message : 'Could not accept invite';
        if (message.includes('email address that received this invite')) {
          setWrongAccount(true);
          return;
        }
        toast.error(message);
      } finally {
        setClaiming(false);
      }
    })();
  }, [session?.user, token, preview, onAccepted]);

  const handleSignOut = async () => {
    acceptAttempted.current = false;
    setWrongAccount(false);
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <p className="text-body-lg text-on-surface-variant">Loading invite…</p>
      </div>
    );
  }

  if (showAuth && !session) {
    return (
      <PartnerAuthFlow
        inviteMode
        onLoginSuccess={() => setShowAuth(false)}
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-margin-mobile py-inset-lg text-on-background">
      <div className="w-full max-w-md space-y-inset-lg rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-lg shadow-sm">
        <div className="flex items-center gap-inset-sm">
          <MaterialIcon name="people" className="text-primary" />
          <h1 className="text-headline-md font-bold text-primary">Team invite</h1>
        </div>

        {preview ? (
          <>
            <p className="text-body-lg">
              You&apos;ve been invited to join <strong>{preview.merchantName}</strong> as{' '}
              <strong>{formatRoleLabel(preview.role as TeamRole)}</strong>.
            </p>
            <p className="text-body-sm text-on-surface-variant">
              Invite sent to {preview.inviteeEmailMasked}
              {preview.expiresAt
                ? ` · Expires ${new Date(preview.expiresAt).toLocaleDateString()}`
                : ''}
            </p>
          </>
        ) : (
          <p className="text-body-sm text-on-surface-variant">This invite link is invalid or expired.</p>
        )}

        {wrongAccount && preview && (
          <div className="space-y-inset-sm rounded-lg border border-error/30 bg-error-container/20 p-inset-md">
            <p className="text-body-sm text-on-surface">
              You&apos;re signed in as <strong>{session?.user?.email}</strong>, but this invite was sent to{' '}
              <strong>{preview.inviteeEmailMasked}</strong>.
            </p>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="min-h-[44px] w-full rounded-lg border border-outline-variant bg-surface px-inset-md py-2 text-body-md font-semibold text-primary"
            >
              Sign out and use invited email
            </button>
          </div>
        )}

        {!session && preview && (
          <>
            <p className="text-body-sm text-on-surface-variant">
              Sign in or create an account with the email you were invited with.
            </p>
            <button
              type="button"
              onClick={() => setShowAuth(true)}
              className="min-h-[48px] w-full rounded-lg bg-primary-container px-inset-lg py-3 text-headline-md font-bold text-on-primary shadow-sm"
            >
              Continue to sign in
            </button>
          </>
        )}

        {session && claiming && (
          <p className="text-body-sm text-on-surface-variant">Joining team…</p>
        )}
      </div>
    </div>
  );
}
