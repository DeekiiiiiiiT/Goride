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

function PctField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={label} value={value} onChange={onChange} disabled={disabled} step="0.1" />
  );
}

export function CustomerRulesForm({
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
        What the customer pays Roam on top of food — for this {scopeLabel}.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Base delivery (JMD)"
          value={rules.delivery?.base_fee_jmd ?? 400}
          onChange={(v) =>
            setRules((r) => ({ ...r, delivery: { ...r.delivery, base_fee_jmd: v } }))
          }
          disabled={!canWrite}
        />
        <Field
          label="Included km"
          value={rules.delivery?.included_km ?? 2}
          onChange={(v) =>
            setRules((r) => ({ ...r, delivery: { ...r.delivery, included_km: v } }))
          }
          disabled={!canWrite}
        />
        <Field
          label="Per extra km (JMD)"
          value={rules.delivery?.per_extra_km_jmd ?? 60}
          onChange={(v) =>
            setRules((r) => ({ ...r, delivery: { ...r.delivery, per_extra_km_jmd: v } }))
          }
          disabled={!canWrite}
        />
        <Field
          label="Max delivery fee (JMD)"
          value={rules.delivery?.max_fee_jmd ?? 1500}
          onChange={(v) =>
            setRules((r) => ({ ...r, delivery: { ...r.delivery, max_fee_jmd: v } }))
          }
          disabled={!canWrite}
        />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 space-y-3">
        <h3 className="text-sm font-medium text-white">Service fee (bracketed)</h3>
        <div className="grid grid-cols-2 gap-3">
          <PctField
            label="Average rate (%)"
            value={Math.round((rules.service_fee?.avg_rate ?? 0.15) * 1000) / 10}
            onChange={(v) =>
              setRules((r) => ({
                ...r,
                service_fee: { ...r.service_fee, mode: 'marginal', avg_rate: v / 100 },
              }))
            }
            disabled={!canWrite}
          />
          <PctField
            label="Override rate (%)"
            value={Math.round((rules.service_fee?.override_rate ?? 0.09) * 1000) / 10}
            onChange={(v) =>
              setRules((r) => ({
                ...r,
                service_fee: { ...r.service_fee, mode: 'marginal', override_rate: v / 100 },
              }))
            }
            disabled={!canWrite}
          />
          <Field
            label="Override threshold (JMD)"
            value={rules.service_fee?.override_threshold_jmd ?? 5000}
            onChange={(v) =>
              setRules((r) => ({
                ...r,
                service_fee: {
                  ...r.service_fee,
                  mode: 'marginal',
                  override_threshold_jmd: v,
                },
              }))
            }
            disabled={!canWrite}
          />
          <Field
            label="Minimum fee (JMD)"
            value={rules.service_fee?.min_jmd ?? 150}
            onChange={(v) =>
              setRules((r) => ({
                ...r,
                service_fee: { ...r.service_fee, mode: 'marginal', min_jmd: v },
              }))
            }
            disabled={!canWrite}
          />
          <Field
            label="Maximum fee (JMD)"
            value={rules.service_fee?.max_jmd ?? 2500}
            onChange={(v) =>
              setRules((r) => ({
                ...r,
                service_fee: { ...r.service_fee, mode: 'marginal', max_jmd: v },
              }))
            }
            disabled={!canWrite}
          />
          <Field
            label="Minimum order subtotal (JMD)"
            value={rules.min_order_subtotal_jmd ?? 800}
            onChange={(v) => setRules((r) => ({ ...r, min_order_subtotal_jmd: v }))}
            disabled={!canWrite}
          />
          <PctField
            label="Card processing fee (%)"
            value={Math.round((rules.card_processing_fee_percent ?? 0.045) * 1000) / 10}
            onChange={(v) => setRules((r) => ({ ...r, card_processing_fee_percent: v / 100 }))}
            disabled={!canWrite}
          />
          <Field
            label="Free delivery first N orders"
            value={rules.launch_promos?.free_delivery_first_n_orders ?? 0}
            onChange={(v) =>
              setRules((r) => ({
                ...r,
                launch_promos: { free_delivery_first_n_orders: v },
              }))
            }
            disabled={!canWrite}
          />
        </div>
      </div>
    </div>
  );
}

export function CustomerRulesReadonly({ rules }: { rules: PricingRulesPayload }) {
  const avgPct = Math.round((rules.service_fee?.avg_rate ?? 0.15) * 1000) / 10;
  const rows = [
    { label: 'Base delivery', value: formatJmd(rules.delivery?.base_fee_jmd ?? 400) },
    { label: 'Included km', value: String(rules.delivery?.included_km ?? 2) },
    { label: 'Per extra km', value: formatJmd(rules.delivery?.per_extra_km_jmd ?? 60) },
    { label: 'Max delivery fee', value: formatJmd(rules.delivery?.max_fee_jmd ?? 1500) },
    { label: 'Service average rate', value: `${avgPct}%` },
    {
      label: 'Service override rate',
      value: `${Math.round((rules.service_fee?.override_rate ?? 0.09) * 1000) / 10}%`,
    },
    {
      label: 'Override threshold',
      value: formatJmd(rules.service_fee?.override_threshold_jmd ?? 5000),
    },
    { label: 'Service min fee', value: formatJmd(rules.service_fee?.min_jmd ?? 150) },
    { label: 'Service max fee', value: formatJmd(rules.service_fee?.max_jmd ?? 2500) },
    { label: 'Minimum order', value: formatJmd(rules.min_order_subtotal_jmd ?? 800) },
    {
      label: 'Card processing fee',
      value: `${Math.round((rules.card_processing_fee_percent ?? 0.045) * 1000) / 10}%`,
    },
    {
      label: 'Free delivery first N orders',
      value: String(rules.launch_promos?.free_delivery_first_n_orders ?? 0),
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
