import React, { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { AtSign, Check, Copy, Loader2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { usePermissions } from '../../hooks/usePermissions';
import { formatFleetTagDisplay, normalizeFleetTagName } from '@roam/types';

type JoinRequestRow = {
  id: string;
  requester_user_id: string;
  service_line: 'rideshare' | 'rush_delivery';
  status: string;
  created_at: string;
  requester_name?: string | null;
  requester_email?: string | null;
  verification?: 'approved' | 'pending';
  holdsVehicle?: boolean;
};

export function FleetTagSection({ mode = 'all' }: { mode?: 'all' | 'tag' | 'requests' }) {
  const { can } = usePermissions();
  const canEditTag = can('fleet_tag.set');
  const canApprove = can('workforce.approve');

  const [tag, setTag] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);

  const [requests, setRequests] = useState<JoinRequestRow[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const loadTag = async () => {
    setLoading(true);
    try {
      const data = await api.ensureFleetTag();
      setTag(data.fleet_tag);
      setOrgName(data.organization_name);
      setDraft(data.fleet_tag ?? '');
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to load Fleet Tag');
    } finally {
      setLoading(false);
    }
  };

  const loadRequests = async () => {
    setRequestsLoading(true);
    try {
      const data = await api.getJoinRequests(mode === 'requests' ? undefined : 'pending');
      setRequests(data.requests ?? []);
    } catch (e) {
      console.error(e);
      setRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  };

  useEffect(() => {
    void loadTag();
    void loadRequests();
  }, []);

  const handleCopy = () => {
    if (!tag) return;
    const display = formatFleetTagDisplay(tag);
    navigator.clipboard.writeText(display);
    setCopied(true);
    toast.success('Fleet Tag copied');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    const normalized = normalizeFleetTagName(draft);
    if (!normalized) {
      toast.error('Enter a Fleet Tag');
      return;
    }
    setSaving(true);
    try {
      const data = await api.updateFleetTag(normalized);
      setTag(data.fleet_tag);
      setDraft(data.fleet_tag ?? '');
      setEditing(false);
      toast.success('Fleet Tag saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save Fleet Tag');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (id: string) => {
    setActingId(id);
    try {
      await api.approveJoinRequest(id);
      toast.success('Join request approved');
      await loadRequests();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to approve');
    } finally {
      setActingId(null);
    }
  };

  const handleDeny = async (id: string) => {
    setActingId(id);
    try {
      await api.denyJoinRequest(id);
      toast.success('Join request denied');
      await loadRequests();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to deny');
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {mode !== 'requests' && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AtSign className="h-5 w-5 text-slate-500" />
            Fleet Tag
          </CardTitle>
          <CardDescription>
            Share this tag so drivers and couriers can ask to join.
            {orgName ? <span className="mt-1 block font-medium text-slate-700 dark:text-slate-200">{orgName}</span> : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading Fleet Tag…
            </div>
          ) : editing ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="fleet-tag-input">Your Fleet Tag</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    @
                  </span>
                  <Input
                    id="fleet-tag-input"
                    value={draft}
                    onChange={(e) => setDraft(normalizeFleetTagName(e.target.value))}
                    className="pl-7 font-mono"
                    placeholder="acme_fleet"
                    maxLength={24}
                    disabled={saving}
                  />
                </div>
                <p className="text-xs text-slate-500">3–24 characters: letters, numbers, underscores.</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => {
                    setEditing(false);
                    setDraft(tag ?? '');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {tag ? (
                <>
                  <Badge
                    variant="outline"
                    className="px-3 py-1.5 font-mono text-base text-slate-800 dark:text-slate-100"
                  >
                    {formatFleetTagDisplay(tag)}
                  </Badge>
                  <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                    {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    No Fleet Tag yet. Choose carefully — you can only set it once.
                  </p>
                  {canEditTag && (
                    <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>
                      <Pencil className="mr-1.5 h-4 w-4" />
                      Set Fleet Tag
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {mode !== 'tag' && (
      <Card>
        <CardHeader>
          <CardTitle>Join Requests</CardTitle>
          <CardDescription>
            Drivers and couriers who entered your Fleet Tag. Approve to add them to the fleet, or deny.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requestsLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading requests…
            </div>
          ) : requests.length === 0 ? (
            <p className="text-sm text-slate-500">No pending join requests.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requester</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => {
                  const busy = actingId === r.id;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {r.requester_name || 'Unknown'}
                        </div>
                        <div className="text-xs text-slate-500">{r.requester_email || 'Unknown user'}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge variant="outline">{r.verification === 'approved' ? 'Roam verified' : 'Verification pending'}</Badge>
                          {r.holdsVehicle ? <Badge variant="outline">Has a vehicle</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {r.service_line === 'rush_delivery' ? 'Courier' : 'Driver'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600 dark:text-slate-300">
                        {new Date(r.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {canApprove && r.status === 'pending' ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              disabled={busy}
                              onClick={() => void handleApprove(r.id)}
                            >
                              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                              Approve
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void handleDeny(r.id)}
                            >
                              <X className="mr-1 h-4 w-4" />
                              Deny
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs capitalize text-slate-400">{r.status}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
