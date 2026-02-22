import React, { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '../ui/sheet';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import {
  ShieldCheck,
  ShieldAlert,
  Trash2,
  Pencil,
  MapPin,
  FileText,
  BarChart3,
  DollarSign,
  Activity,
  Calendar,
  Radio,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { TollPlaza } from '../../types/toll';

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatDate(iso?: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-JM', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatCurrency(amount?: number) {
  if (amount == null) return '—';
  return `J$${amount.toLocaleString('en-JM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  verified:   { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Verified' },
  unverified: { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   label: 'Unverified' },
  learnt:     { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500',    label: 'Learnt' },
};

const OPS_CONFIG: Record<string, { dot: string; label: string }> = {
  active:             { dot: 'bg-emerald-500', label: 'Active' },
  inactive:           { dot: 'bg-red-500',     label: 'Inactive' },
  under_construction: { dot: 'bg-amber-500',   label: 'Under Construction' },
};

// ─── Props ──────────────────────────────────────────────────────────────────
interface TollPlazaDetailPanelProps {
  plaza: TollPlaza;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<TollPlaza>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onPromote: (plaza: TollPlaza) => Promise<void>;
  onDemote: (id: string) => Promise<void>;
  onEdit: (plaza: TollPlaza) => void;
}

// ─── Section wrapper ────────────────────────────────────────────────────────
function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        {icon}
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</h4>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

// ─── Detail row ─────────────────────────────────────────────────────────────
function DetailRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className={`text-xs font-medium text-slate-800 text-right ${mono ? 'font-mono' : ''}`}>
        {value || '—'}
      </span>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────
export function TollPlazaDetailPanel({
  plaza,
  isOpen,
  onClose,
  onUpdate,
  onDelete,
  onPromote,
  onDemote,
  onEdit,
}: TollPlazaDetailPanelProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const status = STATUS_CONFIG[plaza.status] || STATUS_CONFIG.unverified;
  const ops = OPS_CONFIG[plaza.operationalStatus || 'active'] || OPS_CONFIG.active;

  // ── Action helpers ────────────────────────────────────────────────────
  const runAction = async (key: string, fn: () => Promise<void>) => {
    setActionLoading(key);
    try {
      await fn();
    } finally {
      setActionLoading(null);
    }
  };

  const handlePromote = () => runAction('promote', () => onPromote(plaza));
  const handleDemote = () => runAction('demote', () => onDemote(plaza.id));
  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    runAction('delete', async () => {
      await onDelete(plaza.id);
      onClose();
    });
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) { onClose(); setConfirmDelete(false); } }}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
        {/* ── Header ────────────────────────────────────────────────────── */}
        <SheetHeader className="p-5 pb-3 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg font-bold text-slate-900 truncate pr-6">
                {plaza.name}
              </SheetTitle>
              <SheetDescription className="sr-only">
                Detail panel for toll plaza: {plaza.name}
              </SheetDescription>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {/* Status badge */}
                <Badge className={`${status.bg} ${status.text} border-0 text-[10px] font-semibold px-2 py-0.5`}>
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${status.dot} mr-1`} />
                  {status.label}
                </Badge>
                {/* Operational status */}
                <Badge variant="outline" className="text-[10px] font-medium text-slate-500 border-slate-200 px-2 py-0.5">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${ops.dot} mr-1`} />
                  {ops.label}
                </Badge>
              </div>
            </div>
          </div>

          {/* Action buttons row */}
          <div className="flex items-center gap-1.5 mt-3">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => onEdit(plaza)}
            >
              <Pencil className="h-3 w-3" />
              Edit
            </Button>
          </div>
        </SheetHeader>

        {/* ── Scrollable body ───────────────────────────────────────────── */}
        <div className="p-5 space-y-5">

          {/* Location Section */}
          <Section title="Location" icon={<MapPin className="h-3.5 w-3.5 text-indigo-500" />}>
            <DetailRow
              label="GPS"
              value={
                plaza.location?.lat && plaza.location?.lng
                  ? `${plaza.location.lat.toFixed(6)}, ${plaza.location.lng.toFixed(6)}`
                  : 'Not set'
              }
              mono
            />
            {plaza.plusCode && <DetailRow label="Plus Code" value={plaza.plusCode} mono />}
            <DetailRow label="Parish" value={plaza.parish} />
            {plaza.address && <DetailRow label="Address" value={plaza.address} />}
            <DetailRow label="Geofence Radius" value={`${plaza.geofenceRadius || 200}m`} />
            {plaza.location?.accuracy != null && (
              <DetailRow label="GPS Accuracy" value={`±${plaza.location.accuracy}m`} />
            )}
          </Section>

          <Separator />

          {/* Details Section */}
          <Section title="Details" icon={<FileText className="h-3.5 w-3.5 text-indigo-500" />}>
            <DetailRow label="Highway" value={plaza.highway} />
            <DetailRow label="Direction" value={plaza.direction} />
            <DetailRow label="Operator" value={plaza.operator} />
            <DetailRow label="Data Source" value={
              <Badge variant="outline" className="text-[10px] capitalize px-1.5 py-0">
                {plaza.dataSource}
              </Badge>
            } />
            <DetailRow label="Created" value={formatDate(plaza.createdAt)} />
            <DetailRow label="Last Updated" value={formatDate(plaza.updatedAt)} />
          </Section>

          {plaza.notes && (
            <>
              <Separator />
              <Section title="Notes" icon={<FileText className="h-3.5 w-3.5 text-slate-400" />}>
                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap bg-slate-50 rounded-md p-2.5 border border-slate-100">
                  {plaza.notes}
                </p>
              </Section>
            </>
          )}

          <Separator />

          {/* Toll Rates Section */}
          {plaza.rates && plaza.rates.length > 0 && (
            <>
              <Section title="Toll Rates" icon={<DollarSign className="h-3.5 w-3.5 text-emerald-500" />}>
                <div className="bg-slate-50 rounded-md border border-slate-100 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-100/50">
                        <th className="text-left px-2.5 py-1.5 text-slate-500 font-medium">Class</th>
                        <th className="text-right px-2.5 py-1.5 text-slate-500 font-medium">Rate</th>
                        <th className="text-right px-2.5 py-1.5 text-slate-500 font-medium">Effective</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plaza.rates.map((r, i) => (
                        <tr key={`${r.vehicleClass}-${i}`} className="border-b border-slate-100 last:border-0">
                          <td className="px-2.5 py-1.5 text-slate-700 font-medium">{r.vehicleClass}</td>
                          <td className="px-2.5 py-1.5 text-right text-slate-800 font-semibold">
                            {formatCurrency(r.rate)}
                          </td>
                          <td className="px-2.5 py-1.5 text-right text-slate-500">
                            {formatDate(r.effectiveDate)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
              <Separator />
            </>
          )}

          {/* Statistics Section */}
          <Section title="Statistics" icon={<BarChart3 className="h-3.5 w-3.5 text-violet-500" />}>
            <div className="grid grid-cols-2 gap-2">
              <StatCard
                label="Total Txns"
                value={plaza.stats?.totalTransactions?.toLocaleString() || '0'}
                icon={<Activity className="h-3.5 w-3.5 text-blue-500" />}
              />
              <StatCard
                label="Total Spend"
                value={formatCurrency(plaza.stats?.totalSpend)}
                icon={<DollarSign className="h-3.5 w-3.5 text-emerald-500" />}
              />
              <StatCard
                label="Avg Toll"
                value={formatCurrency(plaza.stats?.avgAmount)}
                icon={<BarChart3 className="h-3.5 w-3.5 text-violet-500" />}
              />
              <StatCard
                label="Last Txn"
                value={plaza.stats?.lastTransactionDate ? formatDate(plaza.stats.lastTransactionDate) : '—'}
                icon={<Calendar className="h-3.5 w-3.5 text-amber-500" />}
              />
            </div>
          </Section>

          <Separator />

          {/* Quick Actions */}
          <Section title="Quick Actions" icon={<Radio className="h-3.5 w-3.5 text-rose-500" />}>
            <div className="space-y-2">
              {/* Promote — show only if NOT verified */}
              {plaza.status !== 'verified' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-9 gap-2 justify-center text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  disabled={actionLoading !== null}
                  onClick={handlePromote}
                >
                  {actionLoading === 'promote' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5" />
                  )}
                  Promote to Verified
                </Button>
              )}

              {/* Demote — show only if verified */}
              {plaza.status === 'verified' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-9 gap-2 justify-center text-xs border-amber-200 text-amber-700 hover:bg-amber-50"
                  disabled={actionLoading !== null}
                  onClick={handleDemote}
                >
                  {actionLoading === 'demote' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ShieldAlert className="h-3.5 w-3.5" />
                  )}
                  Demote to Unverified
                </Button>
              )}

              {/* Delete */}
              {!confirmDelete ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-9 gap-2 justify-center text-xs border-red-200 text-red-600 hover:bg-red-50"
                  disabled={actionLoading !== null}
                  onClick={handleDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Plaza
                </Button>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-red-700">Confirm deletion?</p>
                      <p className="text-[10px] text-red-600 mt-0.5">
                        This will permanently remove "{plaza.name}" and cannot be undone.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-7 text-xs flex-1 gap-1.5"
                      disabled={actionLoading === 'delete'}
                      onClick={handleDelete}
                    >
                      {actionLoading === 'delete' ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                      Yes, Delete
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs flex-1"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Stat card helper ───────────────────────────────────────────────────────
function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
      <div className="flex items-center gap-1.5 mb-0.5">
        {icon}
        <span className="text-[10px] text-slate-500 font-medium">{label}</span>
      </div>
      <p className="text-sm font-bold text-slate-800 truncate">{value}</p>
    </div>
  );
}