import React from 'react';
import type { PricingRulesPayload } from '@roam/dash-admin-client';
import { formatJmd } from './partyRulesUtils';

function Field({
  label,
  value,
  onChange,
  disabled,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  step?: string | number;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      <input
        type="number"
        step={step ?? '1'}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm disabled:opacity-50"
      />
    </div>
  );
}

export function RiderRulesForm({
  rules,
  setRules,
  canWrite,
  scopeLabel,
}: {
  rules: PricingRulesPayload;
  setRules: React.Dispatch<React.SetStateAction<PricingRulesPayload>>;
  canWrite: boolean;
  scopeLabel: string;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        What couriers earn and owe — for this {scopeLabel}. Delivery fee schedule is under Customer
        rules.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Courier delivery share (%)"
          value={Math.round((rules.courier_delivery_share ?? 0.8) * 100)}
          onChange={(v) => setRules((r) => ({ ...r, courier_delivery_share: v / 100 }))}
          disabled={!canWrite}
        />
        <Field
          label="COD pause threshold (JMD)"
          value={rules.cod?.pause_threshold_jmd ?? 10000}
          onChange={(v) =>
            setRules((r) => ({ ...r, cod: { ...r.cod, pause_threshold_jmd: v } }))
          }
          disabled={!canWrite}
        />
        <Field
          label="Road distance multiplier (×)"
          value={rules.road_distance_multiplier ?? 1.4}
          onChange={(v) => setRules((r) => ({ ...r, road_distance_multiplier: v }))}
          disabled={!canWrite}
          step="0.1"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-400">
        <input
          type="checkbox"
          checked={rules.tip_processing_from_rider !== false}
          disabled={!canWrite}
          onChange={(e) =>
            setRules((r) => ({ ...r, tip_processing_from_rider: e.target.checked }))
          }
        />
        Card processing on tip deducted from courier (not customer)
      </label>
    </div>
  );
}

export function RiderRulesReadonly({ rules }: { rules: PricingRulesPayload }) {
  const rows = [
    {
      label: 'Courier delivery share',
      value: `${Math.round((rules.courier_delivery_share ?? 0.8) * 100)}%`,
    },
    {
      label: 'COD pause threshold',
      value: formatJmd(rules.cod?.pause_threshold_jmd ?? 10000),
    },
    {
      label: 'Road distance multiplier',
      value: `${rules.road_distance_multiplier ?? 1.4}×`,
    },
    {
      label: 'Tip processing from rider',
      value: rules.tip_processing_from_rider !== false ? 'Yes' : 'No',
    },
  ];
  return (
    <dl className="rounded-xl border border-slate-800 divide-y divide-slate-800">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
          <dt className="text-slate-500">{row.label}</dt>
          <dd className="text-slate-200 font-medium text-right">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PlatformRulesForm({
  rules,
  setRules,
  canWrite,
  scopeLabel,
}: {
  rules: PricingRulesPayload;
  setRules: React.Dispatch<React.SetStateAction<PricingRulesPayload>>;
  canWrite: boolean;
  scopeLabel: string;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">Engine enablement for this {scopeLabel}.</p>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={Boolean(rules.pricing_v2_enabled)}
          onChange={(e) => setRules((r) => ({ ...r, pricing_v2_enabled: e.target.checked }))}
          disabled={!canWrite}
        />
        Enable Model B pricing for this layer
      </label>
      <Field
        label="Legacy tax rate in blob (%) — prefer Dominion GCT settings"
        value={rules.tax_rate_percent ?? 16.5}
        onChange={(v) => setRules((r) => ({ ...r, tax_rate_percent: v }))}
        disabled={!canWrite}
        step="0.1"
      />
    </div>
  );
}

export function PlatformRulesReadonly({ rules }: { rules: PricingRulesPayload }) {
  const rows = [
    {
      label: 'Pricing model',
      value: rules.pricing_v2_enabled ? 'Model B' : 'Legacy Model A',
    },
    { label: 'Tax rate in blob', value: `${rules.tax_rate_percent ?? 16.5}%` },
  ];
  return (
    <dl className="rounded-xl border border-slate-800 divide-y divide-slate-800">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
          <dt className="text-slate-500">{row.label}</dt>
          <dd className="text-slate-200 font-medium text-right">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
