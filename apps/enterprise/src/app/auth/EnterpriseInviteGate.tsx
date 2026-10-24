import { useEffect, useState } from 'react';
import { supabaseEnterpriseApp } from '@roam/auth-client';
import { teamService } from '@/app/services/teamService';

type Invite = { id: string; role: string; organizationName: string };

/** Shown before any module gate so a new invitee can accept. */
export function EnterpriseInviteGate({ children }: { children: React.ReactNode }) {
  const [invite, setInvite] = useState<Invite | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void teamService.myInvites()
      .then((res) => {
        if (!cancelled) setInvite(res.invites[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setInvite(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (invite === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        Loading…
      </div>
    );
  }

  if (!invite) return <>{children}</>;

  const roleLabel = invite.role.replace(/_/g, ' ');
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-lg rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-4 text-sm text-indigo-950">
        <p>
          {invite.organizationName} invited you to the dashboard as {roleLabel}. Your Roam login stays the same.
        </p>
        {error ? <p className="mt-2 text-red-700">{error}</p> : null}
        <button
          type="button"
          disabled={busy}
          className="mt-3 rounded-md bg-indigo-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          onClick={() => {
            setBusy(true);
            setError(null);
            void teamService.acceptInvite(invite.id)
              .then(async () => {
                await supabaseEnterpriseApp.auth.refreshSession();
                window.location.assign('/');
              })
              .catch((e: unknown) => {
                setError(e instanceof Error ? e.message : 'Could not accept');
                setBusy(false);
              });
          }}
        >
          Accept
        </button>
      </div>
    </div>
  );
}
