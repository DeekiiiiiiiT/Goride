import React from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import type { FareRuleAdminDto } from '../services/ridesAdminService';
import { formatMoneyMinor } from '../services/ridesAdminService';
import { useVehicleTypesContext } from '../context/VehicleTypesContext';

type Props = {
  rule: FareRuleAdminDto | null;
  onClose: () => void;
  onEdit: (rule: FareRuleAdminDto) => void;
  onDelete: (rule: FareRuleAdminDto) => void;
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 border-b border-slate-800/80 last:border-0">
      <span className="text-sm text-slate-500 shrink-0">{label}</span>
      <span className="text-sm text-slate-100 text-right font-medium">{value}</span>
    </div>
  );
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-JM', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function FareRuleDetailOverlay({ rule, onClose, onEdit, onDelete }: Props) {
  const { vehicleTypeTableLabel } = useVehicleTypesContext();
  if (!rule) return null;

  const fmt = (minor: number) => formatMoneyMinor(minor, rule.currency);
  const location = rule.location_label ?? rule.location_key ?? rule.city;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-md h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fare-rule-detail-title"
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-800">
          <div className="min-w-0">
            <h3 id="fare-rule-detail-title" className="text-lg font-semibold text-white truncate">
              Fare rule
            </h3>
            <p className="text-sm text-slate-400 mt-0.5 truncate">{location}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="rounded-xl border border-slate-800 bg-slate-800/20 px-4">
            <DetailRow label="Location" value={location} />
            <DetailRow
              label="Location key"
              value={<span className="font-mono text-xs text-slate-400">{rule.location_key ?? rule.city}</span>}
            />
            <DetailRow
              label="Service"
              value={
                <span>
                  {vehicleTypeTableLabel(rule.vehicle_type)}
                  <span className="block font-mono text-xs text-slate-500 font-normal mt-0.5">
                    {rule.vehicle_type}
                  </span>
                </span>
              }
            />
            <DetailRow
              label="Status"
              value={
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    rule.is_active
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  {rule.is_active ? 'Active' : 'Inactive'}
                </span>
              }
            />
            <DetailRow label="Currency" value={rule.currency} />
          </div>

          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mt-6 mb-2">
            Pricing
          </p>
          <div className="rounded-xl border border-slate-800 bg-slate-800/20 px-4">
            <DetailRow label="Base fare" value={fmt(rule.base_fare_minor)} />
            <DetailRow label="Per km" value={fmt(rule.price_per_km_minor)} />
            <DetailRow label="Per min" value={fmt(rule.price_per_min_minor)} />
            <DetailRow label="Booking fee" value={fmt(rule.booking_fee_minor)} />
            <DetailRow label="Estimated tolls" value={fmt(rule.estimated_tolls_minor ?? 0)} />
            <DetailRow label="Min fare" value={fmt(rule.min_fare_minor)} />
          </div>

          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mt-6 mb-2">
            Metadata
          </p>
          <div className="rounded-xl border border-slate-800 bg-slate-800/20 px-4">
            <DetailRow label="Rule ID" value={<span className="font-mono text-[11px] break-all">{rule.id}</span>} />
            <DetailRow label="Effective from" value={formatWhen(rule.effective_from)} />
            <DetailRow label="Created" value={formatWhen(rule.created_at)} />
            <DetailRow label="Updated" value={formatWhen(rule.updated_at)} />
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 flex gap-2">
          <button
            type="button"
            onClick={() => onEdit(rule)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800"
          >
            <Pencil className="w-4 h-4" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(rule)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
