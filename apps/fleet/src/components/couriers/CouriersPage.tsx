import React, { useMemo, useState } from 'react';
import type { CourierComplianceBlocker } from '@roam/types/courier';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Loader2, Plus, Search, Package } from 'lucide-react';
import { api } from '../../services/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Label } from '../ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { toast } from 'sonner';

export interface CourierProfile {
  id: string;
  name: string;
  status: string;
  phone?: string;
  email?: string;
  totalDeliveries?: number;
  complianceBlockers?: CourierComplianceBlocker[];
}

const BLOCKER_LABELS: Partial<Record<CourierComplianceBlocker, string>> = {
  onboarding_incomplete: 'Onboarding',
  background_check_not_approved: 'Background check',
  license_missing: 'License',
  vehicle_missing: 'Vehicle',
  insurance_missing: 'Insurance',
  account_suspended: 'Suspended',
};

function normalizeCourier(row: Record<string, unknown>): CourierProfile {
  return {
    id: String(row.id ?? ''),
    name:
      (typeof row.name === 'string' && row.name.trim()) ||
      (typeof row.driverName === 'string' && row.driverName.trim()) ||
      'Unknown Courier',
    status: (typeof row.status === 'string' && row.status) || 'Active',
    phone: typeof row.phone === 'string' ? row.phone : undefined,
    email: typeof row.email === 'string' ? row.email : undefined,
    totalDeliveries: typeof row.totalTrips === 'number' ? row.totalTrips : undefined,
    complianceBlockers: Array.isArray(row.complianceBlockers)
      ? (row.complianceBlockers as CourierComplianceBlocker[])
      : undefined,
  };
}

export function CouriersPage() {
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitedEmail, setInvitedEmail] = useState('');
  const [invitedPhone, setInvitedPhone] = useState('');
  const [lastCode, setLastCode] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: couriers = [], isLoading, isError } = useQuery({
    queryKey: ['couriers', 'rush'],
    queryFn: async () => {
      const drivers = await api.getDrivers();
      return (Array.isArray(drivers) ? drivers : [])
        .filter((d) => {
          const lines = (d as { serviceLines?: string[] }).serviceLines;
          return !lines?.length || lines.includes('rush_delivery');
        })
        .map((d) => normalizeCourier(d as Record<string, unknown>))
        .filter((c) => c.id);
    },
  });

  const { data: invitesData } = useQuery({
    queryKey: ['workforce-invites'],
    queryFn: () => api.getWorkforceInvites(),
  });

  const pendingInvites = useMemo(() => {
    const invites = invitesData?.invites ?? [];
    return invites.filter((i: { status?: string; service_line?: string }) =>
      i.status === 'pending' && i.service_line === 'rush_delivery',
    );
  }, [invitesData]);

  const createInvite = useMutation({
    mutationFn: () =>
      api.createWorkforceInvite({
        serviceLine: 'rush_delivery',
        invitedEmail: invitedEmail.trim() || undefined,
        invitedPhone: invitedPhone.trim() || undefined,
      }),
    onSuccess: (data) => {
      const code = data?.invite?.invite_code ?? data?.invite?.inviteCode;
      if (code) setLastCode(String(code));
      void queryClient.invalidateQueries({ queryKey: ['workforce-invites'] });
      toast.success('Invite created — share the code with your courier');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not create invite'),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return couriers;
    return couriers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q),
    );
  }, [couriers, search]);

  const copyCode = (code: string) => {
    void navigator.clipboard.writeText(code);
    toast.success('Code copied');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Couriers
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Delivery workforce — invite couriers to join your fleet on Roam Rush Courier.
          </p>
        </div>
        <Button
          className="bg-indigo-600 hover:bg-indigo-700"
          onClick={() => {
            setInviteOpen(true);
            setLastCode(null);
            setInvitedEmail('');
            setInvitedPhone('');
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Invite courier
        </Button>
      </div>

      {pendingInvites.length > 0 && (
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
                <span className="font-mono text-sm font-semibold tracking-wider">
                  {inv.invite_code}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyCode(String(inv.invite_code))}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search couriers…"
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex min-h-[280px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Could not load couriers. Try refreshing.
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 py-16 dark:border-slate-700">
          <Package className="h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500">No couriers yet. Invite your first courier.</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Compliance</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Deliveries</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((courier) => (
                  <TableRow key={courier.id}>
                    <TableCell className="font-medium">{courier.name}</TableCell>
                    <TableCell>
                      <Badge variant={courier.status === 'Active' ? 'default' : 'secondary'}>
                        {courier.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {courier.complianceBlockers?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {courier.complianceBlockers.slice(0, 2).map((b) => (
                            <Badge key={b} variant="outline" className="text-[10px]">
                              {BLOCKER_LABELS[b] ?? b}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-emerald-600">Clear</span>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-500">{courier.phone ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {courier.totalDeliveries ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a courier</DialogTitle>
            <DialogDescription>
              Generate a code for your courier to enter in the Roam Rush Courier app. Roam reviews
              and approves all couriers before they can go online.
            </DialogDescription>
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
                  placeholder="courier@example.com"
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
                <Button variant="outline" onClick={() => setInviteOpen(false)}>
                  Cancel
                </Button>
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
    </div>
  );
}
