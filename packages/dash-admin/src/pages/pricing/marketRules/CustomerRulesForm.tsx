import React from 'react';
import { HelpCircle } from 'lucide-react';
import type { PricingRulesPayload } from '@roam/dash-admin-client';
import { formatJmd } from './partyRulesUtils';

/** Plain-English tips for customer pricing fields (view + edit). */
export const CUSTOMER_RULE_TIPS = {
  deliveryBase: 'Platform starting delivery fee (JMD) before distance add-ons. Same for every plan.',
  includedKm: 'How many kilometers are covered before per-km distance charges apply.',
  perExtraKm: 'Extra charge for each km past the included distance.',
  serviceAvgRate: 'Platform fee % on food for orders at or below the threshold.',
  serviceOverrideRate: 'Lower platform fee % on the part of the order above the threshold.',
  overrideThreshold: 'Food total where the lower service rate starts applying.',
  serviceMinFee: 'Smallest service fee we will charge on an order.',
  serviceMaxFee: 'Largest service fee we will charge on an order.',
  minimumOrder: 'Lowest food total allowed before checkout can continue.',
  smallOrderThreshold: 'Food total below this triggers the small-order fee.',
  smallOrderFee: 'Extra fee when the order is under the small-order threshold.',
  cardProcessingFee: 'Extra % added when the customer pays by card.',
  freeDeliveryFirstN: 'New customers get free delivery for their first N orders. 0 = off.',
  distanceAddonEnabled: 'Experiment: add a Distance service line on longer trips (off by default).',
  distanceAddonThreshold: 'Road km before the distance service fee starts.',
  distanceAddonPerKm: 'JMD charged per whole km past the threshold.',
  distanceAddonMax: 'Cap on the distance service line (JMD).',
} as const;

function LabelWithTip({ label, tip }: { label: string; tip: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      <span className="relative group inline-flex" tabIndex={0}>
        <HelpCircle
          className="w-3.5 h-3.5 text-slate-600 hover:text-slate-400 cursor-help shrink-0"
          aria-hidden
        />
        {/* Open to the right so tips aren’t clipped by the modal’s scroll box */}
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 w-52 -translate-y-1/2 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-[11px] leading-snug text-slate-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        >
          {tip}
        </span>
      </span>
    </span>
  );
}

function Field({
  label,
  tip,
  value,
  onChange,
  disabled,
  step,
}: {
  label: string;
  tip?: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  step?: string | number;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">
        {tip ? <LabelWithTip label={label} tip={tip} /> : label}
      </label>
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
  tip,
  value,
  onChange,
  disabled,
}: {
  label: string;
  tip?: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={label} tip={tip} value={value} onChange={onChange} disabled={disabled} step="0.1" />
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
        What the customer pays Roam on top of food — for this {scopeLabel}. Delivery fee is
        platform-wide (same for every merchant plan).
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Delivery base (JMD)"
          tip={CUSTOMER_RULE_TIPS.deliveryBase}
          value={rules.delivery?.base_jmd ?? 450}
          onChange={(v) =>
            setRules((r) => ({ ...r, delivery: { ...r.delivery, base_jmd: v } }))
          }
          disabled={!canWrite}
        />
        <Field
          label="Included km"
          tip={CUSTOMER_RULE_TIPS.includedKm}
          value={rules.delivery?.included_km ?? 0}
          onChange={(v) =>
            setRules((r) => ({ ...r, delivery: { ...r.delivery, included_km: v } }))
          }
          disabled={!canWrite}
        />
        <Field
          label="Per extra km (JMD)"
          tip={CUSTOMER_RULE_TIPS.perExtraKm}
          value={rules.delivery?.per_extra_km_jmd ?? 60}
          onChange={(v) =>
            setRules((r) => ({ ...r, delivery: { ...r.delivery, per_extra_km_jmd: v } }))
          }
          disabled={!canWrite}
        />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 space-y-3">
        <h3 className="text-sm font-medium text-white">Service fee (bracketed)</h3>
        <div className="grid grid-cols-2 gap-3">
          <PctField
            label="Average rate (%)"
            tip={CUSTOMER_RULE_TIPS.serviceAvgRate}
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
            tip={CUSTOMER_RULE_TIPS.serviceOverrideRate}
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
            tip={CUSTOMER_RULE_TIPS.overrideThreshold}
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
            tip={CUSTOMER_RULE_TIPS.serviceMinFee}
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
            tip={CUSTOMER_RULE_TIPS.serviceMaxFee}
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
            tip={CUSTOMER_RULE_TIPS.minimumOrder}
            value={rules.min_order_subtotal_jmd ?? 800}
            onChange={(v) => setRules((r) => ({ ...r, min_order_subtotal_jmd: v }))}
            disabled={!canWrite}
          />
          <Field
            label="Small-order threshold (JMD)"
            tip={CUSTOMER_RULE_TIPS.smallOrderThreshold}
            value={rules.small_order_threshold_jmd ?? 1500}
            onChange={(v) => setRules((r) => ({ ...r, small_order_threshold_jmd: v }))}
            disabled={!canWrite}
          />
          <Field
            label="Small-order fee (JMD)"
            tip={CUSTOMER_RULE_TIPS.smallOrderFee}
            value={rules.small_order_fee_jmd ?? 400}
            onChange={(v) => setRules((r) => ({ ...r, small_order_fee_jmd: v }))}
            disabled={!canWrite}
          />
          <PctField
            label="Card processing fee (%)"
            tip={CUSTOMER_RULE_TIPS.cardProcessingFee}
            value={Math.round((rules.card_processing_fee_percent ?? 0.045) * 1000) / 10}
            onChange={(v) => setRules((r) => ({ ...r, card_processing_fee_percent: v / 100 }))}
            disabled={!canWrite}
          />
          <Field
            label="Free delivery first N orders"
            tip={CUSTOMER_RULE_TIPS.freeDeliveryFirstN}
            value={rules.launch_promos?.free_delivery_first_n_orders ?? 0}
            onChange={(v) =>
              setRules((r) => ({
                ...r,
                launch_promos: { free_delivery_first_n_orders: v },
              }))
            }
            disabled={!canWrite}
          />
          <Field
            label="Promo free delivery max km"
            tip="Platform free-delivery promos (e.g. FREEDEL) only waive delivery within this distance. Beyond it, delivery is charged."
            value={rules.promo_free_delivery?.max_free_delivery_km ?? 8}
            onChange={(v) =>
              setRules((r) => ({
                ...r,
                promo_free_delivery: {
                  max_free_delivery_km: v,
                  monthly_subsidy_budget_jmd:
                    r.promo_free_delivery?.monthly_subsidy_budget_jmd ?? 1500,
                },
              }))
            }
            disabled={!canWrite}
          />
          <Field
            label="Promo free delivery monthly budget (JMD)"
            tip="Total platform subsidy for non-Pass free-delivery promos per Jamaica calendar month. Cap must cover the courier cost at max km."
            value={rules.promo_free_delivery?.monthly_subsidy_budget_jmd ?? 1500}
            onChange={(v) =>
              setRules((r) => ({
                ...r,
                promo_free_delivery: {
                  max_free_delivery_km: r.promo_free_delivery?.max_free_delivery_km ?? 8,
                  monthly_subsidy_budget_jmd: v,
                },
              }))
            }
            disabled={!canWrite}
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-white">Distance service fee (experiment)</h3>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={rules.service_fee?.distance_addon?.enabled === true}
              disabled={!canWrite}
              onChange={(e) =>
                setRules((r) => ({
                  ...r,
                  service_fee: {
                    ...r.service_fee,
                    distance_addon: {
                      enabled: e.target.checked,
                      threshold_km: r.service_fee?.distance_addon?.threshold_km ?? 5,
                      per_km_jmd: r.service_fee?.distance_addon?.per_km_jmd ?? 20,
                      max_jmd: r.service_fee?.distance_addon?.max_jmd ?? 200,
                    },
                  },
                }))
              }
            />
            <span title={CUSTOMER_RULE_TIPS.distanceAddonEnabled}>Enabled</span>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Threshold (km)"
            tip={CUSTOMER_RULE_TIPS.distanceAddonThreshold}
            value={rules.service_fee?.distance_addon?.threshold_km ?? 5}
            onChange={(v) =>
              setRules((r) => ({
                ...r,
                service_fee: {
                  ...r.service_fee,
                  distance_addon: {
                    enabled: r.service_fee?.distance_addon?.enabled ?? false,
                    threshold_km: v,
                    per_km_jmd: r.service_fee?.distance_addon?.per_km_jmd ?? 20,
                    max_jmd: r.service_fee?.distance_addon?.max_jmd ?? 200,
                  },
                },
              }))
            }
            disabled={!canWrite}
          />
          <Field
            label="Per km (JMD)"
            tip={CUSTOMER_RULE_TIPS.distanceAddonPerKm}
            value={rules.service_fee?.distance_addon?.per_km_jmd ?? 20}
            onChange={(v) =>
              setRules((r) => ({
                ...r,
                service_fee: {
                  ...r.service_fee,
                  distance_addon: {
                    enabled: r.service_fee?.distance_addon?.enabled ?? false,
                    threshold_km: r.service_fee?.distance_addon?.threshold_km ?? 5,
                    per_km_jmd: v,
                    max_jmd: r.service_fee?.distance_addon?.max_jmd ?? 200,
                  },
                },
              }))
            }
            disabled={!canWrite}
          />
          <Field
            label="Max (JMD)"
            tip={CUSTOMER_RULE_TIPS.distanceAddonMax}
            value={rules.service_fee?.distance_addon?.max_jmd ?? 200}
            onChange={(v) =>
              setRules((r) => ({
                ...r,
                service_fee: {
                  ...r.service_fee,
                  distance_addon: {
                    enabled: r.service_fee?.distance_addon?.enabled ?? false,
                    threshold_km: r.service_fee?.distance_addon?.threshold_km ?? 5,
                    per_km_jmd: r.service_fee?.distance_addon?.per_km_jmd ?? 20,
                    max_jmd: v,
                  },
                },
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
  const rows: Array<{ label: string; tip: string; value: string }> = [
    {
      label: 'Delivery base',
      tip: CUSTOMER_RULE_TIPS.deliveryBase,
      value: formatJmd(rules.delivery?.base_jmd ?? 450),
    },
    {
      label: 'Included km',
      tip: CUSTOMER_RULE_TIPS.includedKm,
      value: String(rules.delivery?.included_km ?? 0),
    },
    {
      label: 'Per extra km',
      tip: CUSTOMER_RULE_TIPS.perExtraKm,
      value: formatJmd(rules.delivery?.per_extra_km_jmd ?? 60),
    },
    {
      label: 'Service average rate',
      tip: CUSTOMER_RULE_TIPS.serviceAvgRate,
      value: `${avgPct}%`,
    },
    {
      label: 'Service override rate',
      tip: CUSTOMER_RULE_TIPS.serviceOverrideRate,
      value: `${Math.round((rules.service_fee?.override_rate ?? 0.09) * 1000) / 10}%`,
    },
    {
      label: 'Override threshold',
      tip: CUSTOMER_RULE_TIPS.overrideThreshold,
      value: formatJmd(rules.service_fee?.override_threshold_jmd ?? 5000),
    },
    {
      label: 'Service min fee',
      tip: CUSTOMER_RULE_TIPS.serviceMinFee,
      value: formatJmd(rules.service_fee?.min_jmd ?? 150),
    },
    {
      label: 'Service max fee',
      tip: CUSTOMER_RULE_TIPS.serviceMaxFee,
      value: formatJmd(rules.service_fee?.max_jmd ?? 2500),
    },
    {
      label: 'Minimum order',
      tip: CUSTOMER_RULE_TIPS.minimumOrder,
      value: formatJmd(rules.min_order_subtotal_jmd ?? 800),
    },
    {
      label: 'Small-order threshold',
      tip: CUSTOMER_RULE_TIPS.smallOrderThreshold,
      value: formatJmd(rules.small_order_threshold_jmd ?? 1500),
    },
    {
      label: 'Small-order fee',
      tip: CUSTOMER_RULE_TIPS.smallOrderFee,
      value: formatJmd(rules.small_order_fee_jmd ?? 400),
    },
    {
      label: 'Card processing fee',
      tip: CUSTOMER_RULE_TIPS.cardProcessingFee,
      value: `${Math.round((rules.card_processing_fee_percent ?? 0.045) * 1000) / 10}%`,
    },
    {
      label: 'Free delivery first N orders',
      tip: CUSTOMER_RULE_TIPS.freeDeliveryFirstN,
      value: String(rules.launch_promos?.free_delivery_first_n_orders ?? 0),
    },
  ];
  return (
    <dl className="rounded-xl border border-slate-800 divide-y divide-slate-800">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
          <dt className="text-slate-500">
            <LabelWithTip label={row.label} tip={row.tip} />
          </dt>
          <dd className="text-slate-200 font-medium text-right">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
