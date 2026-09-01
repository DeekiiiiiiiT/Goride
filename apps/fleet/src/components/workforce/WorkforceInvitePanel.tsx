import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus } from 'lucide-react';
import { api } from '../../services/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { toast } from 'sonner';

export type WorkforceInviteServiceLine = 'rideshare' | 'rush_delivery';

type Props = {
  serviceLine: WorkforceInviteServiceLine;
  inviteButtonLabel: string;
  dialogTitle: string;
  dialogDescription: string;
  /** button: header action only; full: pending card + button */
  variant?: 'full' | 'button';
};

export function WorkforcePendingInvites({ serviceLine }: { serviceLine: WorkforceInviteServiceLine }) {
  const { data: invitesData } = useQuery({
    queryKey: ['workforce-invites'],
    queryFn: () => api.getWorkforceInvites(),
  });

  const pendingInvites = useMemo(() => {
    const invites = invitesData?.invites ?? [];
    return invites.filter(
      (i: { status?: string; service_line?: string }) =>
        i.status === 'pending' && i.service_line === serviceLine,
    );
  }, [invitesData, serviceLine]);

  if (pendingInvites.length === 0) return null;

  const copyCode = (code: string) => {
    void navigator.clipboard.writeText(code);
    toast.success('Code copied');
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Pending invites</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {pendingInvites.slice(0, 5).map((inv: { id: string; invite_code?: string }) => (
          <div
            key={inv.id}
            className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
          >
            <span className="font-mono text-sm font-semibold tracking-wider">{inv.invite_code}</span>
            <Button variant="ghost" size="sm" onClick={() => copyCode(String(inv.invite_code))}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function WorkforceInvitePanel({
  serviceLine,
  inviteButtonLabel,
  dialogTitle,
  dialogDescription,
  variant = 'full',
}: Props) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitedEmail, setInvitedEmail] = useState('');
  const [invitedPhone, setInvitedPhone] = useState('');
  const [lastCode, setLastCode] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const createInvite = useMutation({
    mutationFn: () =>
      api.createWorkforceInvite({
        serviceLine,
        invitedEmail: invitedEmail.trim() || undefined,
        invitedPhone: invitedPhone.trim() || undefined,
      }),
    onSuccess: (data) => {
      const code = data?.invite?.invite_code ?? data?.invite?.inviteCode;
      if (code) setLastCode(String(code));
      void queryClient.invalidateQueries({ queryKey: ['workforce-invites'] });
      toast.success('Invite created — share the code with your driver');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not create invite'),
  });

  const copyCode = (code: string) => {
    void navigator.clipboard.writeText(code);
    toast.success('Code copied');
  };

  const openInvite = () => {
    setInviteOpen(true);
    setLastCode(null);
    setInvitedEmail('');
    setInvitedPhone('');
  };

  return (
    <>
      {variant === 'full' && <WorkforcePendingInvites serviceLine={serviceLine} />}

      <Button
        variant={variant === 'button' ? 'outline' : 'default'}
        className={variant === 'button' ? '' : 'bg-indigo-600 hover:bg-indigo-700'}
        onClick={openInvite}
      >
        <Plus className="mr-2 h-4 w-4" />
        {inviteButtonLabel}
      </Button>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>
          {lastCode ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-slate-600">Share this code:</p>
              <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-3 dark:bg-slate-800">
                <span className="flex-1 font-mono text-lg font-bold tracking-widest">{lastCode}</span>
                <Button variant="outline" size="sm" onClick={() => copyCode(lastCode)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email (optional)</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={invitedEmail}
                  onChange={(e) => setInvitedEmail(e.target.value)}
                  placeholder="driver@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-phone">Phone (optional)</Label>
                <Input
                  id="invite-phone"
                  value={invitedPhone}
                  onChange={(e) => setInvitedPhone(e.target.value)}
                  placeholder="8765551234"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            {lastCode ? (
              <Button onClick={() => setInviteOpen(false)}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
                <Button
                  className="bg-indigo-600 hover:bg-indigo-700"
                  disabled={createInvite.isPending}
                  onClick={() => createInvite.mutate()}
                >
                  {createInvite.isPending ? 'Creating…' : 'Generate code'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
