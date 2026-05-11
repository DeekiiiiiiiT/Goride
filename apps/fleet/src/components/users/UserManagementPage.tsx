import React, { useState } from 'react';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { UserPlus, MoreHorizontal, Loader2, Shield, Copy, Check, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { TeamMember } from '../../types/data';
import { api } from '../../services/api';
import { usePermissions } from '../../hooks/usePermissions';

// Role display configuration
const ROLE_CONFIG: Record<string, { label: string; description: string; color: string }> = {
  admin:            { label: 'Fleet Owner',      description: 'Full access to all features',           color: 'bg-purple-50 text-purple-700 border-purple-200' },
  fleet_owner:      { label: 'Fleet Owner',      description: 'Full access to all features',           color: 'bg-purple-50 text-purple-700 border-purple-200' },
  fleet_manager:    { label: 'Fleet Manager',    description: 'Manage drivers, vehicles, and operations', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  fleet_accountant: { label: 'Fleet Accountant', description: 'View financials, reports, and exports',  color: 'bg-amber-50 text-amber-700 border-amber-200' },
  fleet_viewer:     { label: 'Fleet Viewer',     description: 'Read-only dashboard access',            color: 'bg-slate-50 text-slate-600 border-slate-200' },
  driver:           { label: 'Driver',           description: 'Driver app access only',                color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const INVITABLE_ROLES = [
  { value: 'fleet_manager',    label: 'Fleet Manager',    description: 'Manage drivers, vehicles, and operations' },
  { value: 'fleet_accountant', label: 'Fleet Accountant', description: 'View financials, reports, and exports' },
  { value: 'fleet_viewer',     label: 'Fleet Viewer',     description: 'Read-only dashboard access' },
];

function getRoleDisplay(role: string) {
  return ROLE_CONFIG[role] || ROLE_CONFIG.fleet_viewer;
}

export function UserManagementPage() {
  const { can } = usePermissions();
  const [members, setMembers] = useState<(TeamMember & { isOwner?: boolean })[]>([]);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);

  // Invite form
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'fleet_manager' });
  // Invite result (temp password)
  const [inviteResult, setInviteResult] = useState<{ name: string; email: string; temporaryPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Password Reset
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [selectedUserForReset, setSelectedUserForReset] = useState<TeamMember | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Role Change
  const [isRoleChangeOpen, setIsRoleChangeOpen] = useState(false);
  const [roleChangeTarget, setRoleChangeTarget] = useState<TeamMember | null>(null);
  const [newRole, setNewRole] = useState('');

  // Remove confirmation
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);

  const fetchMembers = async () => {
    setFetchLoading(true);
    try {
      const data = await api.getTeamMembers();
      setMembers(data);
    } catch (e) {
      console.error("Failed to fetch team members", e);
      // Fallback to legacy endpoint
      try {
        const data = await api.getUsers();
        setMembers(data);
      } catch {
        setMembers([]);
      }
    } finally {
      setFetchLoading(false);
    }
  };

  React.useEffect(() => { fetchMembers(); }, []);

  // Step 9.5: Invite handler — uses /team/invite endpoint
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await api.teamInvite(inviteForm);
      setInviteResult({
        name: inviteForm.name,
        email: inviteForm.email,
        temporaryPassword: result.temporaryPassword,
      });
      toast.success(`${inviteForm.name} invited as ${getRoleDisplay(inviteForm.role).label}`);
      fetchMembers();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to invite team member");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPassword = () => {
    if (inviteResult?.temporaryPassword) {
      navigator.clipboard.writeText(inviteResult.temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const closeInviteDialog = () => {
    setIsInviteOpen(false);
    setInviteResult(null);
    setInviteForm({ name: '', email: '', role: 'fleet_manager' });
    setCopied(false);
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForReset || !newPassword) return;
    setLoading(true);
    try {
      await api.updateUserPassword(selectedUserForReset.id, newPassword);
      toast.success(`Password updated for ${selectedUserForReset.name}`);
      setIsResetPasswordOpen(false);
      setNewPassword('');
      setSelectedUserForReset(null);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleChangeTarget || !newRole) return;
    setLoading(true);
    try {
      await api.updateTeamMemberRole(roleChangeTarget.id, newRole);
      toast.success(`${roleChangeTarget.name}'s role updated to ${getRoleDisplay(newRole).label}`);
      setIsRoleChangeOpen(false);
      setRoleChangeTarget(null);
      setNewRole('');
      fetchMembers();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to update role");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setLoading(true);
    try {
      await api.removeTeamMember(removeTarget.id);
      toast.success(`${removeTarget.name} has been removed`);
      setIsRemoveOpen(false);
      setRemoveTarget(null);
      fetchMembers();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to remove team member");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Team Management</h2>
        <p className="text-slate-500 dark:text-slate-400">
          Invite and manage team members for your organization.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-slate-500" />
              Team Members
            </CardTitle>
            <CardDescription>
              Each member gets role-based access. Fleet Owners have full access, Managers can operate but not manage users, Accountants see financials, Viewers get read-only dashboards.
            </CardDescription>
          </div>
          <Dialog open={isInviteOpen} onOpenChange={(open) => { if (!open) closeInviteDialog(); else setIsInviteOpen(true); }}>
            {can('users.invite') && (
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Invite Team Member
              </Button>
            </DialogTrigger>
            )}
            <DialogContent>
              {!inviteResult ? (
                <>
                  <DialogHeader>
                    <DialogTitle>Invite Team Member</DialogTitle>
                    <DialogDescription>
                      A temporary password will be generated. Share it securely with the new member.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleInvite} className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="invite-name">Full Name</Label>
                      <Input 
                        id="invite-name" 
                        placeholder="Jane Doe" 
                        required 
                        value={inviteForm.name}
                        onChange={(e) => setInviteForm({...inviteForm, name: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="invite-email">Email Address</Label>
                      <Input 
                        id="invite-email" 
                        type="email" 
                        placeholder="jane@company.com" 
                        required 
                        value={inviteForm.email}
                        onChange={(e) => setInviteForm({...inviteForm, email: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="invite-role">Role</Label>
                      <Select 
                        value={inviteForm.role} 
                        onValueChange={(val) => setInviteForm({...inviteForm, role: val})}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INVITABLE_ROLES.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              <div className="flex flex-col">
                                <span>{r.label}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-500">
                        {INVITABLE_ROLES.find(r => r.value === inviteForm.role)?.description}
                      </p>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={closeInviteDialog} type="button">Cancel</Button>
                      <Button type="submit" disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Send Invite
                      </Button>
                    </DialogFooter>
                  </form>
                </>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle className="text-emerald-700">Invitation Sent!</DialogTitle>
                    <DialogDescription>
                      Share these credentials with <strong>{inviteResult.name}</strong> securely.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase">Email</p>
                        <p className="text-sm font-mono">{inviteResult.email}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase">Temporary Password</p>
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono bg-white px-2 py-1 rounded border flex-1">
                            {inviteResult.temporaryPassword}
                          </code>
                          <Button variant="outline" size="sm" onClick={handleCopyPassword}>
                            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <p className="text-xs">
                        This password is shown only once. Make sure to share it with the team member before closing this dialog.
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={closeInviteDialog}>Done</Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {fetchLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              <span className="ml-2 text-slate-500">Loading team members...</span>
            </div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const roleInfo = getRoleDisplay(member.role);
                const isOwner = (member as any).isOwner || member.role === 'admin';
                return (
                  <TableRow key={member.id}>
                    <TableCell className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={member.avatarUrl} />
                        <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">
                          {member.name}
                          {isOwner && <span className="ml-1.5 text-xs text-purple-500 font-normal">(Owner)</span>}
                        </span>
                        <span className="text-xs text-slate-500">{member.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={roleInfo.color}>
                        {roleInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                        {member.status || 'active'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-500 text-sm">
                      {member.lastActive || '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {!isOwner ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {can('users.edit_role') && (
                              <DropdownMenuItem onClick={() => {
                                setRoleChangeTarget(member);
                                setNewRole(member.role);
                                setIsRoleChangeOpen(true);
                              }}>
                                Change Role
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => {
                              setSelectedUserForReset(member);
                              setIsResetPasswordOpen(true);
                              setNewPassword('');
                            }}>
                              Reset Password
                            </DropdownMenuItem>
                            {can('users.remove') && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-rose-600"
                                  onClick={() => {
                                    setRemoveTarget(member);
                                    setIsRemoveOpen(true);
                                  }}
                                >
                                  Remove Member
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {members.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                    No team members yet. Invite someone to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>

      {/* Reset Password Dialog */}
      <Dialog open={isResetPasswordOpen} onOpenChange={setIsResetPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Enter a new password for {selectedUserForReset?.name}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetPasswordSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input 
                id="newPassword" 
                type="text" 
                placeholder="New password" 
                required 
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
              />
              <p className="text-xs text-slate-500">Must be at least 6 characters.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setIsResetPasswordOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Password
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Change Role Dialog */}
      <Dialog open={isRoleChangeOpen} onOpenChange={setIsRoleChangeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>
              Update the role for {roleChangeTarget?.name}. This changes what they can see and do.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRoleChange} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>New Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVITABLE_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="driver">Driver</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                {INVITABLE_ROLES.find(r => r.value === newRole)?.description || 
                 (newRole === 'driver' ? 'Driver app access only' : '')}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setIsRoleChangeOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Role
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation Dialog */}
      <Dialog open={isRemoveOpen} onOpenChange={setIsRemoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-rose-700">Remove Team Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <strong>{removeTarget?.name}</strong> ({removeTarget?.email}) from your organization? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setIsRemoveOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemove} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
