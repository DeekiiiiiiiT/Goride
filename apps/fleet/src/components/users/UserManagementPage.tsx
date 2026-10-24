import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Loader2, MoreHorizontal, Shield, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { usePermissions } from '../../hooks/usePermissions';
import { ENTERPRISE_INVITABLE_ROLES, enterpriseSeatHasPermission, resolveEnterpriseSeatRole } from '@roam/auth-client';
import { FleetTagSection } from './FleetTagSection';
import { StaffInviteBanner } from './StaffInviteBanner';
import { formatJMD } from '../../utils/formatJMD';

const FLEET_INVITABLE = [
  { value: 'fleet_manager', label: 'Manager', description: 'Runs day-to-day work. Cannot invite staff, change the Fleet Tag, or remove drivers.' },
  { value: 'fleet_accountant', label: 'Accountant', description: 'Sees money, reports, and exports.' },
  { value: 'fleet_viewer', label: 'Viewer', description: 'Can look at the dashboard only.' },
];

type Seat = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'suspended' | 'invited';
  lastActive: string | null;
  isOwner: boolean;
  inviteId: string | null;
};

type Worker = {
  userId: string;
  name: string;
  email: string;
  serviceLine: 'rideshare' | 'rush_delivery';
  status: string;
  joinedAt: string;
};

const ROLE_LABEL: Record<string, string> = {
  fleet_owner: 'Owner',
  fleet_manager: 'Manager',
  fleet_accountant: 'Accountant',
  fleet_viewer: 'Viewer',
  enterprise_owner: 'Owner',
  enterprise_dispatcher: 'Dispatcher',
  enterprise_customs: 'Customs',
  enterprise_warehouse: 'Warehouse',
  enterprise_finance: 'Finance',
  enterprise_viewer: 'Viewer',
  driver: 'Driver',
  courier: 'Courier',
};

function roleLabel(role: string) {
  return ROLE_LABEL[role] || 'No dashboard access';
}

function namedPerson(id: unknown, seats: Seat[]) {
  const seat = seats.find((s) => s.id === String(id || ''));
  return seat?.name || 'Someone';
}

function activitySentence(event: Record<string, unknown>, seats: Seat[]) {
  const who = namedPerson(event.actor_user_id, seats);
  const whom = namedPerson(event.target_user_id, seats);
  const lines: Record<string, string> = {
    'team.staff.invited': `${who} invited ${whom}`,
    'team.staff.accepted': `${whom} accepted their invite`,
    'team.staff.role_changed': `${who} changed ${whom}'s role`,
    'team.staff.suspended': `${who} suspended ${whom}`,
    'team.staff.reactivated': `${who} turned ${whom}'s access back on`,
    'team.staff.removed': `${who} removed ${whom}`,
    'team.staff.reset_email': `${who} sent ${whom} a password reset`,
    'team.staff.invite_revoked': `${who} cancelled an invite`,
    'team.staff.invite_resent': `${who} sent the invite again`,
  };
  return lines[String(event.action || '')] || 'Team update';
}

export function UserManagementPage({ productLine = 'fleet' }: { productLine?: 'fleet' | 'enterprise' }) {
  const { can, jwtRole } = usePermissions();
  const invitable = productLine === 'enterprise' ? [...ENTERPRISE_INVITABLE_ROLES] : FLEET_INVITABLE;
  const canInvite = productLine === 'enterprise'
    ? enterpriseSeatHasPermission(resolveEnterpriseSeatRole(jwtRole), 'ops.team.manage')
    : can('users.invite');
  const canEditRole = productLine === 'enterprise'
    ? enterpriseSeatHasPermission(resolveEnterpriseSeatRole(jwtRole), 'ops.team.manage')
    : can('users.edit_role');
  const canRemove = can('users.remove');
  const canReset = can('users.send_reset_email');
  const canSuspend = can('users.suspend');
  const canWorkforceRemove = can('workforce.remove');
  const canPause = can('workforce.pause');

  const [seats, setSeats] = useState<Seat[]>([]);
  const [invites, setInvites] = useState<Seat[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [pendingJoins, setPendingJoins] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: invitable[0]?.value || 'fleet_viewer' });
  const [roleTarget, setRoleTarget] = useState<Seat | null>(null);
  const [newRole, setNewRole] = useState('');
  const [removeTarget, setRemoveTarget] = useState<Seat | null>(null);
  const [endTarget, setEndTarget] = useState<Worker | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const [blockers, setBlockers] = useState<Array<{ label: string; amount?: number }>>([]);
  const [checkFailed, setCheckFailed] = useState(false);

  const load = async () => {
    setFetchLoading(true);
    setLoadError(null);
    try {
      const directory = await api.getTeamDirectory();
      setSeats((directory.seats || []) as Seat[]);
      setInvites((directory.invites || []) as Seat[]);
      if (productLine === 'fleet') {
        const [workforce, audit, joins] = await Promise.all([
          api.getWorkforceMembers().catch((err) => {
            setLoadError(err instanceof Error ? err.message : 'Could not load drivers and couriers');
            return { members: [] };
          }),
          api.getTeamAudit().catch(() => ({ events: [] })),
          api.getJoinRequests('pending').catch(() => ({ requests: [] })),
        ]);
        setWorkers((workforce.members || []) as Worker[]);
        setEvents(audit.events || []);
        setPendingJoins((joins.requests || []).length);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load the team');
      setSeats([]);
      setInvites([]);
    } finally {
      setFetchLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    try {
      await work();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  const staffRows = useMemo(() => {
    const rows = [...seats, ...invites];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.name} ${r.email} ${r.role}`.toLowerCase().includes(q));
  }, [seats, invites, query]);

  const pendingJoinsLabel = pendingJoins > 0 ? `Join Requests (${pendingJoins})` : 'Join Requests';

  return (
    <div className="space-y-6">
      <StaffInviteBanner />
      <div className="hidden md:block">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Team Management</h2>
        <p className="max-w-2xl text-slate-500 dark:text-slate-400">
          {productLine === 'fleet'
            ? 'Staff use this dashboard. Drivers and couriers are Roam accounts working with your fleet. Roam manages their login and verification.'
            : 'Invite people who work for your company. They set their own password.'}
        </p>
      </div>

      {productLine === 'fleet' && <FleetTagSection mode="tag" />}

      {loadError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{loadError}</div>
      )}

      <Tabs defaultValue="staff">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="staff">Staff ({seats.length + invites.length})</TabsTrigger>
            {productLine === 'fleet' && <TabsTrigger value="workforce">Drivers & Couriers ({workers.length})</TabsTrigger>}
            {productLine === 'fleet' && <TabsTrigger value="requests">{pendingJoinsLabel}</TabsTrigger>}
            {productLine === 'fleet' && <TabsTrigger value="activity">Activity</TabsTrigger>}
          </TabsList>
        </div>

        <TabsContent value="staff">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Staff</CardTitle>
                <CardDescription>
                  <details>
                    <summary className="cursor-pointer">What each role can do</summary>
                    <ul className="mt-2 space-y-1">
                      {invitable.map((r) => <li key={r.value}><strong>{r.label}.</strong> {r.description}</li>)}
                    </ul>
                  </details>
                </CardDescription>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input placeholder="Search staff" value={query} onChange={(e) => setQuery(e.target.value)} />
                {canInvite && (
                  <Button onClick={() => setInviteOpen(true)}><UserPlus className="mr-2 h-4 w-4" /> Invite staff</Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {fetchLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : staffRows.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">No staff yet. Invite someone who works for your company. Drivers join with your Fleet Tag.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Person</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last active</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staffRows.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="font-medium">{member.name}</div>
                          <div className="text-xs text-slate-500">{member.email}</div>
                        </TableCell>
                        <TableCell><Badge variant="outline">{roleLabel(member.role)}</Badge></TableCell>
                        <TableCell className="capitalize">{member.status}</TableCell>
                        <TableCell>{member.lastActive ? new Date(member.lastActive).toLocaleDateString() : '—'}</TableCell>
                        <TableCell className="text-right">
                          {member.isOwner ? <span className="text-xs text-slate-400">Owner</span> : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label="Staff actions"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {member.status === 'invited' && canInvite && (
                                  <>
                                    <DropdownMenuItem disabled={busy === member.id} onClick={() => void run(member.id, async () => { await api.resendStaffInvite(member.inviteId || ''); toast.success('Invite resent'); })}>Resend invite</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => void run(member.id, async () => { await api.revokeStaffInvite(member.inviteId || ''); toast.success('Invite revoked'); })}>Revoke invite</DropdownMenuItem>
                                  </>
                                )}
                                {member.status === 'active' && canEditRole && (
                                  <DropdownMenuItem onClick={() => { setRoleTarget(member); setNewRole(member.role); }}>Change role</DropdownMenuItem>
                                )}
                                {member.status === 'active' && canSuspend && (
                                  <DropdownMenuItem onClick={() => void run(member.id, async () => { await api.setStaffStatus(member.id, 'suspended'); toast.success('Seat suspended'); })}>Suspend</DropdownMenuItem>
                                )}
                                {member.status === 'suspended' && canSuspend && (
                                  <DropdownMenuItem onClick={() => void run(member.id, async () => { await api.setStaffStatus(member.id, 'active'); toast.success('Seat active again'); })}>Reactivate</DropdownMenuItem>
                                )}
                                {member.status === 'active' && canReset && (
                                  <DropdownMenuItem onClick={() => void run(member.id, async () => { await api.sendStaffResetEmail(member.id); toast.success('Reset email sent'); })}>Send password reset email</DropdownMenuItem>
                                )}
                                {member.status !== 'invited' && canRemove && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-rose-600" onClick={() => setRemoveTarget(member)}>Remove from team</DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {productLine === 'fleet' && (
          <TabsContent value="workforce">
            <Card>
              <CardHeader>
                <CardTitle>Drivers & Couriers</CardTitle>
                <CardDescription>Roam accounts working with your fleet. Actions here end or pause the relationship. They do not change the login.</CardDescription>
              </CardHeader>
              <CardContent>
                {workers.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No drivers or couriers yet. Share your Fleet Tag.</p> : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {workers.map((worker) => (
                      <div key={`${worker.userId}-${worker.serviceLine}`} className="rounded-lg border p-4">
                        <div className="font-medium">{worker.name}</div>
                        <div className="text-xs text-slate-500">{worker.email}</div>
                        <div className="mt-2 flex gap-2">
                          <Badge variant="outline">{worker.serviceLine === 'rush_delivery' ? 'Courier' : 'Driver'}</Badge>
                          <Badge variant="outline" className="capitalize">{worker.status}</Badge>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">Joined {worker.joinedAt ? new Date(worker.joinedAt).toLocaleDateString() : '—'}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {canPause && worker.status === 'active' && (
                            <Button size="sm" variant="outline" disabled={busy === worker.userId} onClick={() => void run(worker.userId, async () => { await api.pauseWorkforceMember(worker.userId, worker.serviceLine); toast.success('Paused in this fleet'); })}>Pause in this fleet</Button>
                          )}
                          {canPause && worker.status === 'paused' && (
                            <Button size="sm" variant="outline" disabled={busy === worker.userId} onClick={() => void run(worker.userId, async () => { await api.resumeWorkforceMember(worker.userId, worker.serviceLine); toast.success('Resumed'); })}>Resume</Button>
                          )}
                          {canWorkforceRemove && (
                            <Button size="sm" variant="outline" className="text-rose-700" onClick={() => { setEndTarget(worker); setConfirmName(''); setBlockers([]); setCheckFailed(false); void api.offboardingCheck(worker.userId).then((r) => setBlockers(r.blockers || [])).catch(() => setCheckFailed(true)); }}>Remove from fleet</Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {productLine === 'fleet' && (
          <TabsContent value="requests">
            <FleetTagSection mode="requests" />
          </TabsContent>
        )}

        {productLine === 'fleet' && (
          <TabsContent value="activity">
            <Card>
              <CardHeader><CardTitle>Activity</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {events.length === 0 ? <p className="text-sm text-slate-500">No team activity yet.</p> : events.map((event) => (
                  <div key={String(event.id)} className="rounded border px-3 py-2 text-sm">
                    <span className="font-medium">{activitySentence(event, seats)}</span>
                    <span className="ml-2 text-slate-500">{event.created_at ? new Date(String(event.created_at)).toLocaleString() : ''}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite staff</DialogTitle>
            <DialogDescription>We email them. They set their own password. You never see it.</DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={(e) => {
            e.preventDefault();
            void run('invite', async () => {
              const result = await api.teamInvite(inviteForm);
              toast.success(result.message || `Invite emailed to ${inviteForm.email}`);
              setInviteOpen(false);
            });
          }}>
            <div><Label>Name</Label><Input required value={inviteForm.name} onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })} /></div>
            <div><Label>Email</Label><Input required type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} /></div>
            <div>
              <Label>Role</Label>
              <Select value={inviteForm.role} onValueChange={(role) => setInviteForm({ ...inviteForm, role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {invitable.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-slate-500">{invitable.find((r) => r.value === inviteForm.role)?.description}</p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy === 'invite'}>{busy === 'invite' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send invite</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!roleTarget} onOpenChange={(open) => !open && setRoleTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change role</DialogTitle></DialogHeader>
          <Select value={newRole} onValueChange={setNewRole}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{invitable.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
          <DialogFooter>
            <Button disabled={!roleTarget || busy === 'role'} onClick={() => roleTarget && void run('role', async () => { await api.updateTeamMemberRole(roleTarget.id, newRole); setRoleTarget(null); toast.success('Role updated'); })}>Update role</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove from team</DialogTitle>
            <DialogDescription>{removeTarget?.name} loses access to this dashboard. Their Roam account stays.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={busy === 'remove'} onClick={() => removeTarget && void run('remove', async () => { await api.removeTeamMember(removeTarget.id); setRemoveTarget(null); toast.success('Removed from team'); })}>Remove from team</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!endTarget} onOpenChange={(open) => !open && setEndTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove from fleet</DialogTitle>
            <DialogDescription>
              {checkFailed
                ? "We couldn't confirm what's still open. Try again."
                : blockers.length
                  ? 'Something is still open. Type their name to remove them. Their Roam login stays. Past weeks stay in your history.'
                  : 'Remove them from this fleet? Their Roam login stays. Past weeks stay in your history.'}
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 text-sm">
            {checkFailed ? null : blockers.length === 0 ? <li>Nothing is still open.</li> : blockers.map((b) => (
              <li key={b.label}>{b.label}{typeof b.amount === 'number' ? ` — ${formatJMD(b.amount, 2)}` : ''}</li>
            ))}
          </ul>
          {blockers.length > 0 && (
            <div>
              <Label>Type {endTarget?.name} to continue</Label>
              <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={busy === 'end' || checkFailed || (blockers.length > 0 && confirmName.trim().toLowerCase() !== (endTarget?.name || '').trim().toLowerCase())}
              onClick={() => endTarget && void run('end', async () => {
                await api.endWorkforceMember(endTarget.userId, { confirmName, serviceLine: endTarget.serviceLine });
                setEndTarget(null);
                toast.success('Removed from fleet');
              })}
            >{blockers.length ? 'Remove anyway' : 'Remove now'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
