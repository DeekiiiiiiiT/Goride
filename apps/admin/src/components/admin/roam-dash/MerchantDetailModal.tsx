import React, { useState } from "react";
import {
  Loader2,
  Building2,
  Mail,
  Phone,
  MapPin,
  Globe,
  Clock,
  Image as ImageIcon,
  StickyNote,
  History,
  CheckCircle2,
  XCircle,
  Eye,
  FileQuestion,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { Button } from "../../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import { MerchantStatusBadge } from "./MerchantStatusBadge";
import { MerchantActionDialog } from "./MerchantActionDialog";
import {
  changeMerchantStatus,
  type DashMerchant,
  type MerchantAuditEntry,
  type MerchantHours,
  type MerchantVerificationStatus,
} from "../../../services/dashMerchantVerificationService";
import { toast } from "sonner";

interface MerchantDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessToken: string | undefined;
  merchant: DashMerchant | null;
  hours: MerchantHours[];
  auditLog: MerchantAuditEntry[];
  ownerEmail: string;
  loading: boolean;
  onUpdated: () => void;
}

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const ALLOWED_NEXT: Record<MerchantVerificationStatus, MerchantVerificationStatus[]> = {
  pending: ["in_review", "approved", "rejected"],
  in_review: ["docs_requested", "approved", "rejected"],
  docs_requested: ["in_review", "approved", "rejected"],
  approved: [],
  rejected: [],
};

function fmtTime(t: string | null): string {
  if (!t) return "—";
  // Postgres TIME comes back like "08:00:00"
  const parts = t.split(":");
  if (parts.length < 2) return t;
  const h = parseInt(parts[0], 10);
  const m = parts[1];
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${ampm}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(iso);
}

export function MerchantDetailModal({
  open,
  onOpenChange,
  accessToken,
  merchant,
  hours,
  auditLog,
  ownerEmail,
  loading,
  onUpdated,
}: MerchantDetailModalProps) {
  const [actionStatus, setActionStatus] = useState<MerchantVerificationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  if (!merchant && !loading) return null;

  const allowed = merchant ? ALLOWED_NEXT[merchant.verification_status] || [] : [];

  const submitAction = async (
    target: MerchantVerificationStatus,
    payload: { notes?: string; internal_notes?: string },
  ) => {
    if (!accessToken || !merchant) return;
    setBusy(true);
    try {
      await changeMerchantStatus(accessToken, merchant.id, {
        status: target,
        ...payload,
      });
      toast.success(`Merchant ${target.replace("_", " ")}`);
      setActionStatus(null);
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[min(92vh,920px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <div className="shrink-0 border-b px-6 pt-6 pb-4">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="flex items-center gap-3">
                <Building2 className="w-5 h-5 text-slate-500" />
                {merchant?.name || "Merchant"}
                {merchant && <MerchantStatusBadge status={merchant.verification_status} />}
              </DialogTitle>
              <DialogDescription>
                Review the application and choose an action below. All changes are logged.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {loading || !merchant ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <Tabs defaultValue="business" className="w-full">
                <TabsList className="grid grid-cols-5 w-full mb-4">
                  <TabsTrigger value="business" className="gap-1">
                    <Building2 className="w-3.5 h-3.5" /> Business
                  </TabsTrigger>
                  <TabsTrigger value="hours" className="gap-1">
                    <Clock className="w-3.5 h-3.5" /> Hours
                  </TabsTrigger>
                  <TabsTrigger value="branding" className="gap-1">
                    <ImageIcon className="w-3.5 h-3.5" /> Branding
                  </TabsTrigger>
                  <TabsTrigger value="notes" className="gap-1">
                    <StickyNote className="w-3.5 h-3.5" /> Notes
                  </TabsTrigger>
                  <TabsTrigger value="history" className="gap-1">
                    <History className="w-3.5 h-3.5" /> History
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="business" className="space-y-4">
                  <DetailRow label="Business name" value={merchant.name} />
                  <DetailRow label="Slug" value={merchant.slug} mono />
                  <DetailRow label="Description" value={merchant.description || "—"} multiline />
                  <DetailRow label="Cuisine" value={merchant.cuisine_type || "—"} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <DetailRow
                      icon={<Mail className="w-3.5 h-3.5" />}
                      label="Owner email"
                      value={ownerEmail || "—"}
                    />
                    <DetailRow
                      icon={<Mail className="w-3.5 h-3.5" />}
                      label="Business email"
                      value={merchant.email || "—"}
                    />
                    <DetailRow
                      icon={<Phone className="w-3.5 h-3.5" />}
                      label="Phone"
                      value={merchant.phone || "—"}
                    />
                    <DetailRow
                      icon={<MapPin className="w-3.5 h-3.5" />}
                      label="Delivery radius"
                      value={`${merchant.delivery_radius_km ?? 0} km`}
                    />
                  </div>
                  <DetailRow
                    icon={<MapPin className="w-3.5 h-3.5" />}
                    label="Address"
                    value={
                      <div className="flex items-start gap-2">
                        <span>{merchant.address || "—"}</span>
                        {merchant.address && merchant.lat != null && merchant.lng != null && (
                          <a
                            href={`https://www.google.com/maps?q=${merchant.lat},${merchant.lng}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-500 hover:underline text-xs inline-flex items-center gap-1"
                          >
                            View map <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    }
                  />
                  <DetailRow
                    label="Submitted"
                    value={`${fmtDate(merchant.submitted_at)} (${fmtRelative(merchant.submitted_at)})`}
                  />
                  {merchant.verified_at && (
                    <DetailRow
                      label="Last status change"
                      value={`${fmtDate(merchant.verified_at)} (${fmtRelative(merchant.verified_at)})`}
                    />
                  )}
                </TabsContent>

                <TabsContent value="hours">
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Day</th>
                          <th className="text-left px-3 py-2 font-medium">Opens</th>
                          <th className="text-left px-3 py-2 font-medium">Closes</th>
                          <th className="text-left px-3 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {DAY_LABELS.map((label, idx) => {
                          const h = hours.find((row) => row.day_of_week === idx);
                          return (
                            <tr key={idx} className="border-t">
                              <td className="px-3 py-2">{label}</td>
                              <td className="px-3 py-2">{h?.is_closed ? "—" : fmtTime(h?.open_time || null)}</td>
                              <td className="px-3 py-2">{h?.is_closed ? "—" : fmtTime(h?.close_time || null)}</td>
                              <td className="px-3 py-2">
                                {h?.is_closed ? (
                                  <span className="text-rose-500">Closed</span>
                                ) : h ? (
                                  <span className="text-emerald-600">Open</span>
                                ) : (
                                  <span className="text-muted-foreground">Not set</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                <TabsContent value="branding">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <BrandingImage
                      label="Logo"
                      url={merchant.logo_url}
                      onZoom={setZoomImage}
                    />
                    <BrandingImage
                      label="Cover image"
                      url={merchant.cover_image_url}
                      onZoom={setZoomImage}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="notes" className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-foreground">Visible to merchant (rejection reason)</Label>
                    <Textarea
                      readOnly
                      value={merchant.rejection_reason || "(none)"}
                      className="resize-none bg-muted/30 min-h-[80px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Internal admin notes</Label>
                    <Textarea
                      readOnly
                      value={merchant.verification_notes || "(none)"}
                      className="resize-none bg-muted/30 min-h-[80px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      Updated whenever an admin records notes via an action. The merchant only sees the
                      rejection reason / docs-requested message above, not internal notes.
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="history">
                  {auditLog.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No history yet.
                    </p>
                  ) : (
                    <ol className="relative border-l border-slate-300 ml-3 dark:border-slate-700 space-y-4">
                      {auditLog.map((entry) => (
                        <li key={entry.id} className="ml-4">
                          <span className="absolute -left-1.5 flex items-center justify-center w-3 h-3 rounded-full bg-amber-500/80 ring-4 ring-slate-900" />
                          <div className="text-xs text-muted-foreground">
                            {fmtDate(entry.created_at)} · {fmtRelative(entry.created_at)}
                          </div>
                          <div className="mt-1 text-sm">
                            <span className="font-medium">
                              {entry.actor_email || "System"}
                            </span>{" "}
                            <span className="text-muted-foreground">
                              {entry.action === "merchant_resubmitted"
                                ? "resubmitted application"
                                : `changed status`}
                            </span>{" "}
                            {entry.from_status && entry.to_status && (
                              <>
                                <span className="font-mono text-xs bg-muted/40 px-1.5 py-0.5 rounded">
                                  {entry.from_status}
                                </span>{" "}
                                →{" "}
                                <span className="font-mono text-xs bg-muted/40 px-1.5 py-0.5 rounded">
                                  {entry.to_status}
                                </span>
                              </>
                            )}
                          </div>
                          {entry.notes && (
                            <p className="mt-1 text-sm text-foreground bg-muted/30 rounded px-2 py-1.5">
                              {entry.notes}
                            </p>
                          )}
                          {entry.internal_notes && (
                            <p className="mt-1 text-xs italic text-amber-500 bg-amber-500/5 rounded px-2 py-1.5 border border-amber-500/20">
                              Internal: {entry.internal_notes}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </div>

          <div className="shrink-0 border-t bg-muted/20 px-6 py-4">
            <DialogFooter className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                Close
              </Button>
              <div className="flex flex-wrap gap-2 justify-end">
                {merchant && allowed.includes("in_review") && (
                  <Button
                    variant="outline"
                    onClick={() => setActionStatus("in_review")}
                    disabled={busy}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Start Review
                  </Button>
                )}
                {merchant && allowed.includes("docs_requested") && (
                  <Button
                    variant="outline"
                    onClick={() => setActionStatus("docs_requested")}
                    disabled={busy}
                  >
                    <FileQuestion className="w-4 h-4 mr-1" />
                    Request Docs
                  </Button>
                )}
                {merchant && allowed.includes("rejected") && (
                  <Button
                    variant="outline"
                    className="text-rose-500 hover:text-rose-400 border-rose-500/40 hover:bg-rose-500/10"
                    onClick={() => setActionStatus("rejected")}
                    disabled={busy}
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    Reject
                  </Button>
                )}
                {merchant && allowed.includes("approved") && (
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-500 text-white"
                    onClick={() => setActionStatus("approved")}
                    disabled={busy}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    Approve
                  </Button>
                )}
              </div>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <MerchantActionDialog
        open={actionStatus !== null}
        onOpenChange={(o) => !o && setActionStatus(null)}
        merchantName={merchant?.name || ""}
        targetStatus={actionStatus}
        busy={busy}
        onConfirm={(payload) => actionStatus && submitAction(actionStatus, payload)}
      />

      {zoomImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-6 cursor-zoom-out"
          onClick={() => setZoomImage(null)}
        >
          <img src={zoomImage} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}
    </>
  );
}

function DetailRow({
  label,
  value,
  icon,
  mono,
  multiline,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  mono?: boolean;
  multiline?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div
        className={`text-sm text-foreground ${mono ? "font-mono" : ""} ${
          multiline ? "whitespace-pre-wrap" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function BrandingImage({
  label,
  url,
  onZoom,
}: {
  label: string;
  url: string | null;
  onZoom: (url: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {url ? (
        <button
          type="button"
          onClick={() => onZoom(url)}
          className="block w-full rounded-md overflow-hidden border bg-muted/30 hover:opacity-90 transition-opacity"
        >
          <img src={url} alt={label} className="w-full h-40 object-cover" />
        </button>
      ) : (
        <div className="w-full h-40 rounded-md border bg-muted/30 flex items-center justify-center text-muted-foreground text-xs">
          No {label.toLowerCase()} uploaded
        </div>
      )}
    </div>
  );
}
