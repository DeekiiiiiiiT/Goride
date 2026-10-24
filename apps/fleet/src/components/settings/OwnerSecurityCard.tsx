import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../auth/AuthContext';

type StaffOption = { id: string; name: string; role: string; status: string; isOwner: boolean };

export function OwnerSecurityCard() {
  const { can } = usePermissions();
  const { teamAccess, refreshSession } = useAuth();
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [toUserId, setToUserId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!can('settings.edit')) return;
    void api.getTeamDirectory()
      .then((res) => {
        const seats = (res.seats || []) as StaffOption[];
        setStaff(seats.filter((seat) => seat.status === 'active' && !seat.isOwner && seat.role !== 'fleet_owner'));
      })
      .catch(() => setStaff([]));
  }, [can]);

  if (!can('settings.edit')) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ownership</CardTitle>
        <CardDescription>
          Hand the fleet to someone who is already on the team. They must accept before anything changes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="transfer-user">New owner</Label>
          <select
            id="transfer-user"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={toUserId}
            onChange={(e) => setToUserId(e.target.value)}
          >
            <option value="">Choose a team member</option>
            {staff.map((seat) => (
              <option key={seat.id} value={seat.id}>
                {seat.name} · {seat.role.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <Button
            type="button"
            disabled={busy || !toUserId}
            onClick={() => {
              setBusy(true);
              void api.startOwnershipTransfer(toUserId)
                .then(() => {
                  toast.success('Transfer started. They must accept.');
                  void refreshSession();
                })
                .catch((e) => toast.error(e instanceof Error ? e.message : 'Could not start transfer'))
                .finally(() => setBusy(false));
            }}
          >
            Start ownership transfer
          </Button>
        </div>
        {teamAccess?.outgoingTransfer && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              const id = teamAccess.outgoingTransfer?.id;
              if (!id) return;
              setBusy(true);
              void api.cancelOwnershipTransfer(id)
                .then(() => {
                  toast.success('Transfer cancelled');
                  void refreshSession();
                })
                .catch((e) => toast.error(e instanceof Error ? e.message : 'Could not cancel'))
                .finally(() => setBusy(false));
            }}
          >
            Cancel pending transfer
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
