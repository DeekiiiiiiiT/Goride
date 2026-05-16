import React, { useState } from 'react';
import {
  Loader2,
  Building2,
  Mail,
  Phone,
  MapPin,
  Clock,
  Image as ImageIcon,
  StickyNote,
  History,
  CheckCircle2,
  XCircle,
  Eye,
  FileQuestion,
  ExternalLink,
  X,
} from 'lucide-react';
import { MerchantStatusBadge } from './MerchantStatusBadge';
import { MerchantActionDialog } from './MerchantActionDialog';
import {
  changeMerchantStatus,
  type DashMerchant,
  type MerchantAuditEntry,
  type MerchantHours,
  type MerchantVerificationStatus,
} from '../services/dashAdminService';
import { toast } from 'sonner';

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
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const ALLOWED_NEXT: Record<MerchantVerificationStatus, MerchantVerificationStatus[]> = {
  pending: ['in_review', 'approved', 'rejected'],
  in_review: ['docs_requested', 'approved', 'rejected'],
  docs_requested: ['in_review', 'approved', 'rejected'],
  approved: [],
  rejected: [],
};

function fmtTime(t: string | null): string {
  if (!t) return '—';
  const parts = t.split(':');
  if (parts.length < 2) return t;
  const h = parseInt(parts[0], 10);
  const m = parts[1];
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${ampm}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(iso);
}

type TabId = 'business' | 'hours' | 'branding' | 'notes' | 'history';

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
  const [activeTab, setActiveTab] = useState<TabId>('business');
  const [actionStatus, setActionStatus] = useState<MerchantVerificationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  if (!open) return null;
  if (!merchant && !loading) return null;

  const allowed = merchant ? ALLOWED_NEXT[merchant.verification_status] || [] : [];

  const submitAction = async (
    target: MerchantVerificationStatus,
    payload: { notes?: string; internal_notes?: string }
  ) => {
    if (!accessToken || !merchant) return;
    setBusy(true);
    try {
      await changeMerchantStatus(accessToken, merchant.id, {
        status: target,
        ...payload,
      });
      toast.success(`Merchant ${target.replace('_', ' ')}`);
      setActionStatus(null);
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'business', label: 'Business', icon: <Building2 className="w-3.5 h-3.5" /> },
    { id: 'hours', label: 'Hours', icon: <Clock className="w-3.5 h-3.5" /> },
    { id: 'branding', label: 'Branding', icon: <ImageIcon className="w-3.5 h-3.5" /> },
    { id: 'notes', label: 'Notes', icon: <StickyNote className="w-3.5 h-3.5" /> },
    { id: 'history', label: 'History', icon: <History className="w-3.5 h-3.5" /> },
  ];

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60" onClick={() => onOpenChange(false)} />
        <div className="relative bg-slate-900 border border-slate-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-slate-500" />
              <h2 className="text-lg font-semibold text-white">
                {merchant?.name || 'Merchant'}
              </h2>
              {merchant && <MerchantStatusBadge status={merchant.verification_status} />}
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="p-1 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-2 border-b border-slate-800 shrink-0 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === tab.id
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading || !merchant ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <>
                {activeTab === 'business' && (
                  <div className="space-y-4">
                    <DetailRow label="Business name" value={merchant.name} />
                    <DetailRow label="Slug" value={merchant.slug} mono />
                    <DetailRow
                      label="Description"
                      value={merchant.description || '—'}
                      multiline
                    />
                    <DetailRow label="Cuisine" value={merchant.cuisine_type || '—'} />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <DetailRow
                        icon={<Mail className="w-3.5 h-3.5" />}
                        label="Owner email"
                        value={ownerEmail || '—'}
                      />
                      <DetailRow
                        icon={<Mail className="w-3.5 h-3.5" />}
                        label="Business email"
                        value={merchant.email || '—'}
                      />
                      <DetailRow
                        icon={<Phone className="w-3.5 h-3.5" />}
                        label="Phone"
                        value={merchant.phone || '—'}
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
                          <span>{merchant.address || '—'}</span>
                          {merchant.address && merchant.lat != null && merchant.lng != null && (
                            <a
                              href={`https://www.google.com/maps?q=${merchant.lat},${merchant.lng}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-400 hover:underline text-xs inline-flex items-center gap-1"
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
                  </div>
                )}

                {activeTab === 'hours' && (
                  <div className="rounded-md border border-slate-700 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-800/50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-slate-300">Day</th>
                          <th className="text-left px-3 py-2 font-medium text-slate-300">Opens</th>
                          <th className="text-left px-3 py-2 font-medium text-slate-300">Closes</th>
                          <th className="text-left px-3 py-2 font-medium text-slate-300">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {DAY_LABELS.map((label, idx) => {
                          const h = hours.find((row) => row.day_of_week === idx);
                          return (
                            <tr key={idx} className="border-t border-slate-700">
                              <td className="px-3 py-2 text-slate-300">{label}</td>
                              <td className="px-3 py-2 text-slate-400">
                                {h?.is_closed ? '—' : fmtTime(h?.open_time || null)}
                              </td>
                              <td className="px-3 py-2 text-slate-400">
                                {h?.is_closed ? '—' : fmtTime(h?.close_time || null)}
                              </td>
                              <td className="px-3 py-2">
                                {h?.is_closed ? (
                                  <span className="text-rose-400">Closed</span>
                                ) : h ? (
                                  <span className="text-emerald-400">Open</span>
                                ) : (
                                  <span className="text-slate-500">Not set</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {activeTab === 'branding' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <BrandingImage label="Logo" url={merchant.logo_url} onZoom={setZoomImage} />
                    <BrandingImage
                      label="Cover image"
                      url={merchant.cover_image_url}
                      onZoom={setZoomImage}
                    />
                  </div>
                )}

                {activeTab === 'notes' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-300">
                        Visible to merchant (rejection reason)
                      </label>
                      <div className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-300 min-h-[80px]">
                        {merchant.rejection_reason || '(none)'}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-300">
                        Internal admin notes
                      </label>
                      <div className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-300 min-h-[80px]">
                        {merchant.verification_notes || '(none)'}
                      </div>
                      <p className="text-xs text-slate-500">
                        Updated whenever an admin records notes via an action.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === 'history' && (
                  <>
                    {auditLog.length === 0 ? (
                      <p className="text-sm text-slate-500 py-8 text-center">No history yet.</p>
                    ) : (
                      <ol className="relative border-l border-slate-700 ml-3 space-y-4">
                        {auditLog.map((entry) => (
                          <li key={entry.id} className="ml-4">
                            <span className="absolute -left-1.5 flex items-center justify-center w-3 h-3 rounded-full bg-amber-500/80 ring-4 ring-slate-900" />
                            <div className="text-xs text-slate-500">
                              {fmtDate(entry.created_at)} · {fmtRelative(entry.created_at)}
                            </div>
                            <div className="mt-1 text-sm text-slate-300">
                              <span className="font-medium text-white">
                                {entry.actor_email || 'System'}
                              </span>{' '}
                              <span>
                                {entry.action === 'merchant_resubmitted'
                                  ? 'resubmitted application'
                                  : 'changed status'}
                              </span>{' '}
                              {entry.from_status && entry.to_status && (
                                <>
                                  <span className="font-mono text-xs bg-slate-800 px-1.5 py-0.5 rounded">
                                    {entry.from_status}
                                  </span>{' '}
                                  →{' '}
                                  <span className="font-mono text-xs bg-slate-800 px-1.5 py-0.5 rounded">
                                    {entry.to_status}
                                  </span>
                                </>
                              )}
                            </div>
                            {entry.notes && (
                              <p className="mt-1 text-sm text-slate-300 bg-slate-800/50 rounded px-2 py-1.5">
                                {entry.notes}
                              </p>
                            )}
                            {entry.internal_notes && (
                              <p className="mt-1 text-xs italic text-amber-400 bg-amber-500/10 rounded px-2 py-1.5 border border-amber-500/20">
                                Internal: {entry.internal_notes}
                              </p>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-wrap justify-between gap-2 p-4 border-t border-slate-800 shrink-0 bg-slate-900/50">
            <button
              onClick={() => onOpenChange(false)}
              disabled={busy}
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white disabled:opacity-50"
            >
              Close
            </button>
            <div className="flex flex-wrap gap-2">
              {merchant && allowed.includes('in_review') && (
                <button
                  onClick={() => setActionStatus('in_review')}
                  disabled={busy}
                  className="flex items-center gap-1 px-3 py-2 text-sm font-medium border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                >
                  <Eye className="w-4 h-4" />
                  Start Review
                </button>
              )}
              {merchant && allowed.includes('docs_requested') && (
                <button
                  onClick={() => setActionStatus('docs_requested')}
                  disabled={busy}
                  className="flex items-center gap-1 px-3 py-2 text-sm font-medium border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                >
                  <FileQuestion className="w-4 h-4" />
                  Request Docs
                </button>
              )}
              {merchant && allowed.includes('rejected') && (
                <button
                  onClick={() => setActionStatus('rejected')}
                  disabled={busy}
                  className="flex items-center gap-1 px-3 py-2 text-sm font-medium border border-rose-500/40 rounded-lg text-rose-400 hover:bg-rose-500/10 disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" />
                  Reject
                </button>
              )}
              {merchant && allowed.includes('approved') && (
                <button
                  onClick={() => setActionStatus('approved')}
                  disabled={busy}
                  className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Approve
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <MerchantActionDialog
        open={actionStatus !== null}
        onOpenChange={(o) => !o && setActionStatus(null)}
        merchantName={merchant?.name || ''}
        targetStatus={actionStatus}
        busy={busy}
        onConfirm={(payload) => actionStatus && submitAction(actionStatus, payload)}
      />

      {zoomImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-6 cursor-zoom-out"
          onClick={() => setZoomImage(null)}
        >
          <img
            src={zoomImage}
            alt=""
            className="max-w-full max-h-full object-contain rounded-lg"
          />
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
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
        {icon}
        {label}
      </div>
      <div
        className={`text-sm text-slate-200 ${mono ? 'font-mono' : ''} ${
          multiline ? 'whitespace-pre-wrap' : ''
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
      <label className="block text-sm font-medium text-slate-300">{label}</label>
      {url ? (
        <button
          type="button"
          onClick={() => onZoom(url)}
          className="block w-full rounded-md overflow-hidden border border-slate-700 bg-slate-800/50 hover:opacity-90 transition-opacity"
        >
          <img src={url} alt={label} className="w-full h-40 object-cover" />
        </button>
      ) : (
        <div className="w-full h-40 rounded-md border border-slate-700 bg-slate-800/50 flex items-center justify-center text-slate-500 text-xs">
          No {label.toLowerCase()} uploaded
        </div>
      )}
    </div>
  );
}
