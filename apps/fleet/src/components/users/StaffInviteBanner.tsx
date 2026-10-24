import React, { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { api } from '../../services/api';
import { toast } from 'sonner';

export function StaffInviteBanner({
  onAccepted,
  invite: seeded,
}: {
  onAccepted?: () => void;
  invite?: { id: string; role: string; organizationName: string } | null;
}) {
  const [invites, setInvites] = useState<Array<{ id: string; role: string; organizationName: string }>>(
    seeded ? [seeded] : [],
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (seeded) return;
    void api.myStaffInvites().then((r) => setInvites(r.invites || [])).catch(() => setInvites([]));
  }, [seeded]);

  if (!invites.length) return null;
  const invite = invites[0];
  const roleLabel = invite.role.replace(/_/g, ' ');

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950 sm:flex-row sm:items-center sm:justify-between">
      <p>{invite.organizationName} invited you to the dashboard as {roleLabel}. Your Roam login stays the same.</p>
      <Button
        size="sm"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void api.acceptStaffInvite(invite.id)
            .then(() => {
              toast.success('You accepted the invite.');
              setInvites((rows) => rows.filter((r) => r.id !== invite.id));
              onAccepted?.();
            })
            .catch((e) => toast.error(e instanceof Error ? e.message : 'Could not accept'))
            .finally(() => setBusy(false));
        }}
      >
        Accept
      </Button>
    </div>
  );
}
