/**
 * Driver Profile tab — documents, personal info, notes, compliance verify.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  CheckCircle2,
  CreditCard as CreditCardIcon,
  Download,
  Eye,
  FileText,
  Loader2,
  Plus,
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

/** Lightweight date parse for display — avoids circular import with DriverDetail. */
function parseDisplayDate(dateStr: string | Date | undefined | null): Date | null {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return Number.isNaN(dateStr.getTime()) ? null : dateStr;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
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

type DriverNote = {
  id: string;
  text: string;
  createdAt: string;
  createdBy: string;
};

export type DriverProfileTabProps = {
  driverId: string;
  driverName: string;
  driver?: any;
  documents: DriverDocument[];
  selectedDocument: DriverDocument | null;
  setSelectedDocument: (doc: DriverDocument | null) => void;
  canEditDrivers: boolean;
  /** Refresh parent documents after verify (parent rebuilds from driver record). */
  onComplianceChanged?: () => void;
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
  documents,
  selectedDocument,
  setSelectedDocument,
  canEditDrivers,
  onComplianceChanged,
}: DriverProfileTabProps) {
  const [notes, setNotes] = useState<DriverNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [localDocs, setLocalDocs] = useState<DriverDocument[]>(documents);

  useEffect(() => {
    setLocalDocs(documents);
  }, [documents]);

  const loadNotes = useCallback(async () => {
    if (!driverId) return;
    setNotesLoading(true);
    try {
      const res = await api.getDriverNotes(driverId);
      setNotes(Array.isArray(res?.notes) ? res.notes : []);
    } catch {
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  }, [driverId]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  const handleAddNote = async () => {
    const text = noteText.trim();
    if (!text || !canEditDrivers) return;
    setSavingNote(true);
    try {
      const res = await api.addDriverNote(driverId, text);
      setNotes(Array.isArray(res?.notes) ? res.notes : res?.note ? [res.note, ...notes] : notes);
      setNoteText('');
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
      const res = await api.verifyDriverDocument(driverId, doc.id);
      if (Array.isArray(res?.documents)) {
        setLocalDocs(res.documents);
      } else {
        setLocalDocs((prev) =>
          prev.map((d) =>
            d.id === doc.id
              ? {
                  ...d,
                  status: 'Verified',
                  verifiedAt: res?.verification?.verifiedAt,
                  verifiedBy: res?.verification?.verifiedBy,
                }
              : d,
          ),
        );
      }
      toast.success(`${doc.name} marked verified`);
      onComplianceChanged?.();
    } catch (e: any) {
      toast.error(e?.message || 'Verify failed');
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <>
      <Tabs defaultValue="documents" className="w-full">
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
                <div className="text-center py-10 text-sm text-slate-500">
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
                    {localDocs.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-slate-400" />
                            {doc.name}
                          </div>
                        </TableCell>
                        <TableCell>{doc.type}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              doc.status === 'Verified'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : doc.status === 'Expired'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : doc.status === 'Pending'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-slate-50 text-slate-700'
                            }
                          >
                            {doc.status}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className={
                            doc.expiryDate && new Date(doc.expiryDate) < new Date()
                              ? 'text-rose-600 font-medium'
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
                            {canEditDrivers && doc.status !== 'Verified' && doc.status !== 'Expired' && (
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
                    ))}
                  </TableBody>
                </Table>
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
              )}
              {notesLoading ? (
                <div className="flex justify-center py-8 text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : notes.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">No notes yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {notes.map((n) => {
                    const d = parseDisplayDate(n.createdAt);
                    return (
                      <li key={n.id} className="py-3 space-y-1">
                        <p className="text-sm text-slate-800 whitespace-pre-wrap">{n.text}</p>
                        <p className="text-xs text-slate-400">
                          {d ? format(d, 'MMM d, yyyy HH:mm') : n.createdAt}
                          {n.createdBy ? ` · ${n.createdBy}` : ''}
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
