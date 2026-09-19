import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Plus } from 'lucide-react';
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
import { formatCourierRoamTagDisplay, normalizeCourierRoamTagName } from '@roam/types';

export type WorkforceInviteServiceLine = 'rideshare' | 'rush_delivery';

type Props = {
  serviceLine: WorkforceInviteServiceLine;
  inviteButtonLabel: string;
  dialogTitle: string;
  dialogDescription: string;
  /** button: header action only; full: pending card + button */
  variant?: 'full' | 'button';
  buttonClassName?: string;
};

type InviteRow = {
  id: string;
  invite_code?: string;
  invite_kind?: string;
  invited_roam_tag?: string | null;
  status?: string;
  service_line?: string;
};

export function WorkforcePendingInvites({ serviceLine }: { serviceLine: WorkforceInviteServiceLine }) {
  const { pendingInvites, cancelInvite, copyCode } = usePendingInvites(serviceLine);

  if (pendingInvites.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Pending invites</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <PendingInviteList
          serviceLine={serviceLine}
          pendingInvites={pendingInvites}
          cancelInvite={cancelInvite}
          copyCode={copyCode}
          limit={8}
        />
      </CardContent>
    </Card>
  );
}

/** Compact filter-bar control: opens a dialog with pending workforce invites. */
export function WorkforcePendingInvitesButton({
  serviceLine,
}: {
  serviceLine: WorkforceInviteServiceLine;
}) {
  const [open, setOpen] = useState(false);
  const { pendingInvites, cancelInvite, copyCode } = usePendingInvites(serviceLine);
  const count = pendingInvites.length;
  const who = serviceLine === 'rideshare' ? 'driver' : 'courier';

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="rounded-full"
        onClick={() => setOpen(true)}
        aria-label={`Pending invites${count > 0 ? ` (${count})` : ''}`}
      >
        Pending invites{count > 0 ? ` (${count})` : ''}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pending invites</DialogTitle>
            <DialogDescription>
              {count === 0
                ? `No pending ${who} invites right now.`
                : `Waiting for ${who}${count === 1 ? '' : 's'} to accept.`}
            </DialogDescription>
          </DialogHeader>
          {count === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Invite a {who} by Roam Tag or code and it will show up here.
            </p>
          ) : (
            <div className="max-h-[60vh] space-y-2 overflow-y-auto py-1">
              <PendingInviteList
                serviceLine={serviceLine}
                pendingInvites={pendingInvites}
                cancelInvite={cancelInvite}
                copyCode={copyCode}
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function usePendingInvites(serviceLine: WorkforceInviteServiceLine) {
  const queryClient = useQueryClient();
  const { data: invitesData } = useQuery({
    queryKey: ['workforce-invites'],
    queryFn: () => api.getWorkforceInvites(),
  });

  const cancelInvite = useMutation({
    mutationFn: (inviteId: string) => api.cancelWorkforceInvite(inviteId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workforce-invites'] });
      toast.success('Invite cancelled');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not cancel invite'),
  });

  const pendingInvites = useMemo(() => {
    const invites = (invitesData?.invites ?? []) as InviteRow[];
    return invites.filter(
      (i) => i.status === 'pending' && i.service_line === serviceLine,
    );
  }, [invitesData, serviceLine]);

  const copyCode = (code: string) => {
    void navigator.clipboard.writeText(code);
    toast.success('Code copied');
  };

  return { pendingInvites, cancelInvite, copyCode };
}

function PendingInviteList({
  serviceLine,
  pendingInvites,
  cancelInvite,
  copyCode,
  limit,
}: {
  serviceLine: WorkforceInviteServiceLine;
  pendingInvites: InviteRow[];
  cancelInvite: ReturnType<typeof usePendingInvites>['cancelInvite'];
  copyCode: (code: string) => void;
  limit?: number;
}) {
  const rows = limit ? pendingInvites.slice(0, limit) : pendingInvites;
  return (
    <>
      {rows.map((inv) => {
        const isTag = inv.invite_kind === 'roam_tag';
        const label = isTag
          ? formatCourierRoamTagDisplay(inv.invited_roam_tag) || 'Roam Tag invite'
          : String(inv.invite_code ?? '');
        const cancelling = cancelInvite.isPending && cancelInvite.variables === inv.id;
        return (
          <div
            key={inv.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
          >
            <div className="min-w-0">
              <span className={`font-semibold tracking-wider ${isTag ? 'text-sm' : 'font-mono text-sm'}`}>
                {label}
              </span>
              {isTag ? (
                <p className="text-[11px] text-slate-500">
                  Waiting for {serviceLine === 'rideshare' ? 'driver' : 'courier'} to accept
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {!isTag && inv.invite_code ? (
                <Button variant="ghost" size="sm" onClick={() => copyCode(String(inv.invite_code))}>
                  <Copy className="h-4 w-4" />
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-600 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                disabled={cancelInvite.isPending}
                onClick={() => cancelInvite.mutate(inv.id)}
              >
                {cancelling ? 'Cancelling…' : 'Cancel'}
              </Button>
            </div>
          </div>
        );
      })}
    </>
  );
}

export function WorkforceInvitePanel({
  serviceLine,
  inviteButtonLabel,
  dialogTitle,
  dialogDescription,
  variant = 'full',
  buttonClassName,
}: Props) {
  const isCourier = serviceLine === 'rush_delivery';
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteMode, setInviteMode] = useState<'code' | 'roam_tag'>(isCourier ? 'roam_tag' : 'code');
  const [invitedEmail, setInvitedEmail] = useState('');
  const [invitedPhone, setInvitedPhone] = useState('');
  const [roamTag, setRoamTag] = useState('');
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [tagInviteSent, setTagInviteSent] = useState<{ tag: string; name?: string | null } | null>(null);
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

  const createByTag = useMutation({
    mutationFn: () =>
      api.createWorkforceInviteByRoamTag({
        roamTag: normalizeCourierRoamTagName(roamTag),
        serviceLine: 'rush_delivery',
      }),
    onSuccess: (data) => {
      const tag = data?.courier?.custom_tag_name || normalizeCourierRoamTagName(roamTag);
      setTagInviteSent({
        tag,
        name: data?.courier?.display_name ?? null,
      });
      void queryClient.invalidateQueries({ queryKey: ['workforce-invites'] });
      toast.success('Invite sent');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not send invite'),
  });

  const copyCode = (code: string) => {
    void navigator.clipboard.writeText(code);
    toast.success('Code copied');
  };

  const openInvite = () => {
    setInviteOpen(true);
    setLastCode(null);
    setTagInviteSent(null);
    setInvitedEmail('');
    setInvitedPhone('');
    setRoamTag('');
    setInviteMode(isCourier ? 'roam_tag' : 'code');
  };

  return (
    <>
      {variant === 'full' && <WorkforcePendingInvites serviceLine={serviceLine} />}

      <Button
        variant={variant === 'button' && !buttonClassName ? 'outline' : 'default'}
        className={
          buttonClassName ||
          (variant === 'button' ? '' : 'bg-indigo-600 hover:bg-indigo-700')
        }
        onClick={openInvite}
      >
        <Plus className="mr-2 h-4 w-4" />
        {inviteButtonLabel}
      </Button>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          {tagInviteSent ? (
            <div className="flex flex-col items-center justify-center gap-3 py-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                <Check className="h-8 w-8 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
              </div>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-50">Invite sent</p>
              <Button className="mt-2" onClick={() => setInviteOpen(false)}>
                Done
              </Button>
            </div>
          ) : (
            <>
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
              {isCourier ? (
                <div className="flex gap-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                  <button
                    type="button"
                    className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
                      inviteMode === 'roam_tag' ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-600'
                    }`}
                    onClick={() => setInviteMode('roam_tag')}
                  >
                    By Roam Tag
                  </button>
                  <button
                    type="button"
                    className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
                      inviteMode === 'code' ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-600'
                    }`}
                    onClick={() => setInviteMode('code')}
                  >
                    Invite code
                  </button>
                </div>
              ) : null}

              {isCourier && inviteMode === 'roam_tag' ? (
                <div className="space-y-2">
                  <Label htmlFor="invite-roam-tag">Courier Roam Tag</Label>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500">@</span>
                    <Input
                      id="invite-roam-tag"
                      value={roamTag.replace(/^@+/, '')}
                      onChange={(e) => setRoamTag(e.target.value.replace(/^@+/, '').toLowerCase())}
                      placeholder="courier_handle"
                      autoCapitalize="none"
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    They’ll get an in-app invite to Accept or Decline.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="invite-email">Email (optional)</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      value={invitedEmail}
                      onChange={(e) => setInvitedEmail(e.target.value)}
                      placeholder={isCourier ? 'courier@example.com' : 'driver@example.com'}
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
                </>
              )}
            </div>
          )}
          <DialogFooter>
            {lastCode ? (
              <Button onClick={() => setInviteOpen(false)}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
                {isCourier && inviteMode === 'roam_tag' ? (
                  <Button
                    className="bg-indigo-600 hover:bg-indigo-700"
                    disabled={createByTag.isPending || !normalizeCourierRoamTagName(roamTag)}
                    onClick={() => createByTag.mutate()}
                  >
                    {createByTag.isPending ? 'Sending…' : 'Send invite'}
                  </Button>
                ) : (
                  <Button
                    className="bg-indigo-600 hover:bg-indigo-700"
                    disabled={createInvite.isPending}
                    onClick={() => createInvite.mutate()}
                  >
                    {createInvite.isPending ? 'Creating…' : 'Generate code'}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
