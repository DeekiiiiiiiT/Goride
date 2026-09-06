/**
 * Driver Profile tab — documents, personal info, notes, compliance verify, audit trail.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { format, differenceInCalendarDays, isValid } from 'date-fns';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard as CreditCardIcon,
  Download,
  Eye,
  FileText,
  Loader2,
  Plus,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Separator } from '../../ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/dialog';
import { toast } from 'sonner';
import { api } from '../../../services/api';
import {
  useDriverAudit,
  useDriverCompliance,
  useDriverNotes,
  useInvalidateDriverProfileQueries,
} from '../../../hooks/useDriverProfileQueries';

/** Lightweight date parse for display — avoids circular import with DriverDetail. */
function parseDisplayDate(dateStr: string | Date | undefined | null): Date | null {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return Number.isNaN(dateStr.getTime()) ? null : dateStr;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysUntilExpiry(expiryRaw: string | null | undefined): number | null {
  if (!expiryRaw) return null;
  const d = parseDisplayDate(expiryRaw);
  if (!d) return null;
  return differenceInCalendarDays(d, new Date());
}

function expiryCue(days: number | null): { label: string; className: string } | null {
  if (days == null) return null;
  if (days < 0) {
    return {
      label: `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`,
      className: 'bg-rose-50 text-rose-800 border-rose-200',
    };
  }
  if (days === 0) {
    return { label: 'Expires today', className: 'bg-rose-50 text-rose-800 border-rose-200' };
  }
  if (days <= 30) {
    return {
      label: `Renew within ${days} day${days === 1 ? '' : 's'}`,
      className: 'bg-amber-50 text-amber-900 border-amber-200',
    };
  }
  if (days <= 90) {
    return {
      label: `Renewal due in ${days} days`,
      className: 'bg-slate-50 text-slate-700 border-slate-200',
    };
  }
  return null;
}

export type DriverDocument = {
  id: string;
  name: string;
  type: string;
  status: 'Verified' | 'Pending' | 'Expired' | 'Rejected';
  expiryDate: string;
  uploadDate: string;
  url?: string;
  verifiedAt?: string;
  verifiedBy?: string;
};

/** Network-error fallback only — compliance API is the primary document source. */
export function buildDriverDocuments(driver: any): DriverDocument[] {
  if (!driver) return [];
  const docs: DriverDocument[] = [];
  const expiry = String(driver.licenseExpiry || '').slice(0, 10);
  const verifications = (driver.complianceVerifications || {}) as Record<
    string,
    { status?: string; verifiedAt?: string; verifiedBy?: string }
  >;
  const expiryExpired = (() => {
    if (!expiry) return false;
    const d = parseDisplayDate(expiry);
    return !!(d && d < new Date());
  })();

  const resolveStatus = (
    docId: string,
    fallback: DriverDocument['status'],
  ): DriverDocument['status'] => {
    const v = verifications[docId];
    if (v?.status === 'Verified' || v?.status === 'Rejected' || v?.status === 'Pending') {
      if (expiryExpired && (docId === 'license-front' || docId === 'license-back')) return 'Expired';
      return v.status;
    }
    if (expiryExpired && (docId === 'license-front' || docId === 'license-back')) return 'Expired';
    return fallback;
  };

  if (driver.licenseFrontUrl) {
    const id = 'license-front';
    const v = verifications[id];
    docs.push({
      id,
      name: 'Driver License (Front)',
      type: 'License',
      status: resolveStatus(id, 'Pending'),
      expiryDate: expiry || '',
      uploadDate: '',
      url: driver.licenseFrontUrl,
      verifiedAt: v?.verifiedAt,
      verifiedBy: v?.verifiedBy,
    });
  }
  if (driver.licenseBackUrl) {
    const id = 'license-back';
    const v = verifications[id];
    docs.push({
      id,
      name: 'Driver License (Back)',
      type: 'License Back',
      status: resolveStatus(id, 'Pending'),
      expiryDate: expiry || '',
      uploadDate: '',
      url: driver.licenseBackUrl,
      verifiedAt: v?.verifiedAt,
      verifiedBy: v?.verifiedBy,
    });
  }
  if (driver.proofOfAddressUrl || driver.addressDocUrl) {
    const id = 'proof-address';
    const v = verifications[id];
    docs.push({
      id,
      name: `Proof of Address (${driver.proofOfAddressType || 'Document'})`,
      type: 'Address Proof',
      status: resolveStatus(id, 'Pending'),
      expiryDate: '',
      uploadDate: '',
      url: driver.proofOfAddressUrl || driver.addressDocUrl,
      verifiedAt: v?.verifiedAt,
      verifiedBy: v?.verifiedBy,
    });
  }
  return docs;
}

type DriverNote = {
  id: string;
  text: string;
  createdAt: string;
  createdBy: string;
  followUpDate?: string | null;
  assignedTo?: string | null;
};

type AuditEvent = {
  id?: string;
  action?: string;
  actorId?: string;
  reason?: string;
  at?: string;
};

export type DriverProfileTabProps = {
  driverId: string;
  driverName: string;
  driver?: any;
  canEditDrivers: boolean;
  onComplianceChanged?: () => void;
  /** Open Notes sub-tab when set (e.g. "Add note" from header). */
  initialSubTab?: 'documents' | 'personal-info' | 'notes';
};

function maskAccountNumber(raw: string, canEdit: boolean): string {
  if (!raw) return '';
  if (canEdit) return raw;
  const digits = raw.replace(/\s+/g, '');
  if (digits.length <= 4) return '••••';
  return `••••${digits.slice(-4)}`;
}

export function DriverProfileTab({
  driverId,
  driverName,
  driver,
  canEditDrivers,
  onComplianceChanged,
  initialSubTab = 'documents',
}: DriverProfileTabProps) {
  const fallbackDocs = useMemo(() => buildDriverDocuments(driver), [driver]);
  const complianceQuery = useDriverCompliance(driverId, fallbackDocs);
  const notesQuery = useDriverNotes(driverId);
  const auditQuery = useDriverAudit(driverId);
  const { invalidateCompliance, invalidateNotes, invalidateAudit } =
    useInvalidateDriverProfileQueries();

  const notes = (notesQuery.data || []) as DriverNote[];
  const notesLoading = notesQuery.isLoading || notesQuery.isFetching;
  const auditEvents = (auditQuery.data || []) as AuditEvent[];
  const auditLoading = auditQuery.isLoading || auditQuery.isFetching;
  const localDocs = (complianceQuery.data?.documents ||
    (complianceQuery.isError ? fallbackDocs : [])) as DriverDocument[];
  const [noteText, setNoteText] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<DriverDocument | null>(null);
  const [subTab, setSubTab] = useState(initialSubTab);
  const [complianceExpiry, setComplianceExpiry] = useState<string | null>(
    driver?.licenseExpiry ? String(driver.licenseExpiry).slice(0, 10) : null,
  );

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    if (complianceQuery.data?.licenseExpiry) {
      setComplianceExpiry(complianceQuery.data.licenseExpiry);
    } else if (driver?.licenseExpiry) {
      setComplianceExpiry(String(driver.licenseExpiry).slice(0, 10));
    }
  }, [complianceQuery.data?.licenseExpiry, driver?.licenseExpiry]);

  const licenseDays = useMemo(() => daysUntilExpiry(complianceExpiry), [complianceExpiry]);
  const licenseExpired = licenseDays != null && licenseDays < 0;
  const licenseCue = expiryCue(licenseDays);

  const handleAddNote = async () => {
    const text = noteText.trim();
    if (!text || !canEditDrivers) return;
    setSavingNote(true);
    try {
      await api.addDriverNote(
        driverId,
        text,
        followUpDate || undefined,
        assignedTo.trim() || undefined,
      );
      await invalidateNotes(driverId);
      setNoteText('');
      setFollowUpDate('');
      setAssignedTo('');
      toast.success('Note saved');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save note');
    } finally {
      setSavingNote(false);
    }
  };

  const handleVerify = async (doc: DriverDocument) => {
    if (!canEditDrivers || doc.status === 'Verified') return;
    setVerifyingId(doc.id);
    try {
      await api.verifyDriverDocument(driverId, doc.id);
      await invalidateCompliance(driverId);
      toast.success(`${doc.name} marked verified`);
      void api
        .appendDriverAudit(driverId, {
          action: 'compliance_verify',
          after: { documentId: doc.id, status: 'Verified' },
        })
        .then(() => invalidateAudit(driverId))
        .catch(() => {});
      onComplianceChanged?.();
    } catch (e: any) {
      toast.error(e?.message || 'Verify failed');
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <>
      {/* Compliance lifecycle — mirror courier blocker tone */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {licenseExpired ? (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Cannot dispatch
            </Badge>
          ) : (
            <Badge className="bg-emerald-600">License clear for dispatch</Badge>
          )}
          {complianceExpiry && (
            <span className="text-sm text-slate-600 dark:text-slate-400">
              License expires{' '}
              {(() => {
                const d = parseDisplayDate(complianceExpiry);
                return d ? format(d, 'MMM d, yyyy') : complianceExpiry;
              })()}
            </span>
          )}
          {licenseCue && (
            <Badge variant="outline" className={licenseCue.className}>
              {licenseCue.label}
            </Badge>
          )}
        </div>
        {licenseExpired ? (
          <div
            className="rounded-lg bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-sm border border-rose-200 dark:border-rose-900/40"
            role="alert"
          >
            <p className="font-medium text-rose-900 dark:text-rose-200 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              Driver licence expired — cannot dispatch
            </p>
            <p className="mt-0.5 text-rose-800/80 dark:text-rose-200/80">
              Renew the licence and update the expiry date before assigning trips. Fleet cannot override this
              blocker from here.
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No licence expiry blocker on record
            {licenseCue ? ` — ${licenseCue.label.toLowerCase()}.` : '.'}
          </p>
        )}
      </div>

      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as typeof subTab)} className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 mb-6">
          <TabsTrigger
            value="documents"
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none pb-2 px-4 text-slate-500 data-[state=active]:text-indigo-600"
          >
            Documents
          </TabsTrigger>
          <TabsTrigger
            value="personal-info"
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none pb-2 px-4 text-slate-500 data-[state=active]:text-indigo-600"
          >
            Personal Information
          </TabsTrigger>
          <TabsTrigger
            value="notes"
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none pb-2 px-4 text-slate-500 data-[state=active]:text-indigo-600"
          >
            Notes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Driver Documents</CardTitle>
                <CardDescription>
                  Uploaded at onboarding. Reviewers with edit access can mark documents verified.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {localDocs.length === 0 ? (
                <div className="text-center py-10 text-sm text-slate-500" data-testid="profile-docs-empty">
                  No documents on file for this driver.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expiry Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {localDocs.map((doc) => {
                      const docDays = daysUntilExpiry(doc.expiryDate);
                      const cue = expiryCue(docDays);
                      const expired =
                        doc.status === 'Expired' || (docDays != null && docDays < 0);
                      return (
                        <TableRow key={doc.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-slate-400" />
                              {doc.name}
                            </div>
                          </TableCell>
                          <TableCell>{doc.type}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1 items-start">
                              <Badge
                                variant="outline"
                                className={
                                  expired
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : doc.status === 'Verified'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : doc.status === 'Pending'
                                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                                        : 'bg-slate-50 text-slate-700'
                                }
                              >
                                {expired && doc.status !== 'Expired' ? 'Expired' : doc.status}
                              </Badge>
                              {cue && (
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${cue.className}`}>
                                  {cue.label}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell
                            className={
                              expired ? 'text-rose-600 font-medium' : cue && docDays != null && docDays <= 30
                                ? 'text-amber-700 font-medium'
                                : ''
                            }
                          >
                            {(() => {
                              if (!doc.expiryDate) return '—';
                              const d = parseDisplayDate(doc.expiryDate);
                              return d ? format(d, 'MMM d, yyyy') : '—';
                            })()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {doc.url ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 hover:bg-slate-100"
                                  aria-label={`View ${doc.name}`}
                                  onClick={() => setSelectedDocument(doc)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                              {canEditDrivers && doc.status !== 'Verified' && !expired && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-emerald-700"
                                  disabled={verifyingId === doc.id}
                                  onClick={() => handleVerify(doc)}
                                  aria-label={`Verify ${doc.name}`}
                                >
                                  {verifyingId === doc.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <>
                                      <CheckCircle2 className="h-4 w-4 mr-1" />
                                      Verify
                                    </>
                                  )}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Audit trail</CardTitle>
              <CardDescription>Recent ops actions for this driver (verify, write-off, payout, etc.).</CardDescription>
            </CardHeader>
            <CardContent>
              {auditLoading ? (
                <div className="flex justify-center py-8 text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : auditEvents.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8" data-testid="profile-audit-empty">
                  No audit events yet.
                </p>
              ) : (
                <ul className="relative border-l border-slate-200 dark:border-slate-700 ml-2 space-y-4">
                  {auditEvents.slice(0, 40).map((ev, idx) => {
                    const at = parseDisplayDate(ev.at);
                    return (
                      <li key={ev.id || `${ev.at}-${idx}`} className="pl-4 relative">
                        <span className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full bg-indigo-500 ring-2 ring-white dark:ring-slate-900" />
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {ev.action || 'event'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {at ? format(at, 'MMM d, yyyy HH:mm') : ev.at || '—'}
                          {ev.actorId ? ` · ${ev.actorId}` : ''}
                        </p>
                        {ev.reason ? (
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{ev.reason}</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="personal-info">
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>Personal details and contact info.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 max-w-2xl">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input value={driverName} readOnly className="bg-slate-50" />
                  </div>
                  <div className="space-y-2">
                    <Label>Email Address</Label>
                    <Input value={driver?.email || 'N/A'} readOnly className="bg-slate-50" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Phone Number</Label>
                    <Input value={driver?.phone || 'N/A'} readOnly className="bg-slate-50" />
                  </div>
                  <div className="space-y-2">
                    <Label>Driver ID</Label>
                    <Input value={driverId} readOnly className="bg-slate-50 font-mono" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>License Number</Label>
                    <Input
                      value={driver?.licenseNumber || '—'}
                      readOnly
                      className="bg-slate-50 font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>License Expiry</Label>
                    <Input
                      value={
                        complianceExpiry
                          ? (() => {
                              const d = parseDisplayDate(complianceExpiry);
                              return d ? format(d, 'MMM d, yyyy') : complianceExpiry;
                            })()
                          : '—'
                      }
                      readOnly
                      className="bg-slate-50"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCardIcon className="h-4 w-4 text-slate-500" />
                  <h4 className="font-semibold text-slate-900">Bank Account Information</h4>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name on Account</Label>
                    <Input
                      value={driver?.bankInfo?.accountName || ''}
                      readOnly
                      className="bg-slate-50"
                      placeholder="Not set"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Bank Name</Label>
                    <Input
                      value={driver?.bankInfo?.bankName || ''}
                      readOnly
                      className="bg-slate-50"
                      placeholder="Not set"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Branch</Label>
                    <Input
                      value={driver?.bankInfo?.branch || ''}
                      readOnly
                      className="bg-slate-50"
                      placeholder="Not set"
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Account Number</Label>
                    <Input
                      value={maskAccountNumber(String(driver?.bankInfo?.accountNumber || ''), canEditDrivers)}
                      readOnly
                      className="bg-slate-50"
                      placeholder="Not set"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Account Type</Label>
                  <Input
                    value={driver?.bankInfo?.accountType || ''}
                    readOnly
                    className="bg-slate-50"
                    placeholder="Not set"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          <Card>
            <CardHeader>
              <CardTitle>Driver Notes</CardTitle>
              <CardDescription>Internal ops notes with timestamps.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {canEditDrivers && (
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Add a note…"
                      className="min-h-[80px]"
                      aria-label="New driver note"
                    />
                    <Button
                      className="shrink-0 self-end"
                      disabled={!noteText.trim() || savingNote}
                      onClick={() => void handleAddNote()}
                    >
                      {savingNote ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Plus className="h-4 w-4 mr-2" />
                      )}
                      Add note
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 max-w-xs">
                      <Label htmlFor="note-follow-up" className="text-xs text-slate-500 whitespace-nowrap">
                        Follow-up (optional)
                      </Label>
                      <Input
                        id="note-follow-up"
                        type="date"
                        value={followUpDate}
                        onChange={(e) => setFollowUpDate(e.target.value)}
                        className="h-8"
                      />
                    </div>
                    <div className="flex items-center gap-2 max-w-xs">
                      <Label htmlFor="note-assigned-to" className="text-xs text-slate-500 whitespace-nowrap">
                        Assign to (user id)
                      </Label>
                      <Input
                        id="note-assigned-to"
                        value={assignedTo}
                        onChange={(e) => setAssignedTo(e.target.value)}
                        placeholder="Optional"
                        className="h-8"
                        aria-label="Assign note follow-up to user id"
                      />
                    </div>
                  </div>
                </div>
              )}
              {notesLoading ? (
                <div className="flex justify-center py-8 text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : notes.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8" data-testid="profile-notes-empty">
                  No notes yet.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {notes.map((n) => {
                    const d = parseDisplayDate(n.createdAt);
                    const fu = n.followUpDate ? parseDisplayDate(n.followUpDate) : null;
                    return (
                      <li key={n.id} className="py-3 space-y-1">
                        <p className="text-sm text-slate-800 whitespace-pre-wrap">{n.text}</p>
                        <p className="text-xs text-slate-400">
                          {d ? format(d, 'MMM d, yyyy HH:mm') : n.createdAt}
                          {n.createdBy ? ` · ${n.createdBy}` : ''}
                          {fu && isValid(fu) ? ` · Follow-up ${format(fu, 'MMM d, yyyy')}` : ''}
                          {n.assignedTo ? ` · Assigned ${n.assignedTo}` : ''}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedDocument} onOpenChange={(open) => !open && setSelectedDocument(null)}>
        <DialogContent className="max-w-3xl w-full h-auto max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle>{selectedDocument?.name}</DialogTitle>
            <DialogDescription>
              {selectedDocument?.type}
              {selectedDocument?.uploadDate
                ? ` • Uploaded on ${(() => {
                    const d = parseDisplayDate(selectedDocument.uploadDate);
                    return d ? format(d, 'MMM d, yyyy') : '-';
                  })()}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 bg-slate-900 flex items-center justify-center p-4 overflow-auto min-h-[400px]">
            {selectedDocument?.url ? (
              <img
                src={selectedDocument.url}
                alt={selectedDocument.name}
                className="max-w-full max-h-[70vh] object-contain rounded-md"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                <FileText className="h-12 w-12 opacity-50" />
                <p>No preview available</p>
              </div>
            )}
          </div>
          <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSelectedDocument(null)}>
              Close
            </Button>
            {selectedDocument?.url && (
              <Button onClick={() => window.open(selectedDocument.url, '_blank')}>
                <Download className="h-4 w-4 mr-2" /> Download
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
