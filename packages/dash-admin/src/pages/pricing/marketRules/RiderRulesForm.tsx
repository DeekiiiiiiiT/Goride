import React from 'react';
import { HelpCircle } from 'lucide-react';
import type { PricingRulesPayload } from '@roam/dash-admin-client';
import { formatJmd } from './partyRulesUtils';

/** Plain-English tips for rider pricing fields (view + edit). */
export const RIDER_RULE_TIPS = {
  basePay:
    'Flat amount the courier earns on every trip before distance pay. Part of the Rider pay ladder.',
  perKm:
    'Extra pay for each whole kilometer of the trip (after the road-distance multiplier is applied).',
  minPay:
    'Floor for courier earnings on a trip. If base + distance is lower, we top them up to this amount.',
  codPause:
    'If a courier is holding this much unpaid COD cash (or more), they are paused from taking new jobs until they settle.',
  roadMultiplier:
    'Turns straight-line map distance into an estimated road distance (e.g. 1.4×). Used for delivery fee and courier distance pay.',
  tipProcessing:
    'When on, card processing on the tip comes out of the courier’s tip — the customer is not charged that fee again.',
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
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 w-56 -translate-y-1/2 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-[11px] leading-snug text-slate-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
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
          label="Courier base pay (JMD)"
          tip={RIDER_RULE_TIPS.basePay}
          value={rules.courier_base_pay_jmd ?? 150}
          onChange={(v) => setRules((r) => ({ ...r, courier_base_pay_jmd: v }))}
          disabled={!canWrite}
        />
        <Field
          label="Courier per km (JMD)"
          tip={RIDER_RULE_TIPS.perKm}
          value={rules.courier_per_km_jmd ?? 60}
          onChange={(v) => setRules((r) => ({ ...r, courier_per_km_jmd: v }))}
          disabled={!canWrite}
        />
        <Field
          label="Courier min pay (JMD)"
          tip={RIDER_RULE_TIPS.minPay}
          value={rules.courier_min_pay_jmd ?? 350}
          onChange={(v) => setRules((r) => ({ ...r, courier_min_pay_jmd: v }))}
          disabled={!canWrite}
        />
        <Field
          label="COD pause threshold (JMD)"
          tip={RIDER_RULE_TIPS.codPause}
          value={rules.cod?.pause_threshold_jmd ?? 10000}
          onChange={(v) =>
            setRules((r) => ({ ...r, cod: { ...r.cod, pause_threshold_jmd: v } }))
          }
          disabled={!canWrite}
        />
        <Field
          label="Road distance multiplier (×)"
          tip={RIDER_RULE_TIPS.roadMultiplier}
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
        <span className="inline-flex items-center gap-1">
          Card processing on tip deducted from courier (not customer)
          <span className="relative group inline-flex" tabIndex={0}>
            <HelpCircle
              className="w-3.5 h-3.5 text-slate-600 hover:text-slate-400 cursor-help shrink-0"
              aria-hidden
            />
            <span
              role="tooltip"
              className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 w-56 -translate-y-1/2 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-[11px] leading-snug text-slate-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            >
              {RIDER_RULE_TIPS.tipProcessing}
            </span>
          </span>
        </span>
      </label>
    </div>
  );
}

export function RiderRulesReadonly({ rules }: { rules: PricingRulesPayload }) {
  const rows = [
    {
      label: 'Courier base pay',
      tip: RIDER_RULE_TIPS.basePay,
      value: formatJmd(rules.courier_base_pay_jmd ?? 150),
    },
    {
      label: 'Courier per km',
      tip: RIDER_RULE_TIPS.perKm,
      value: formatJmd(rules.courier_per_km_jmd ?? 60),
    },
    {
      label: 'Courier min pay',
      tip: RIDER_RULE_TIPS.minPay,
      value: formatJmd(rules.courier_min_pay_jmd ?? 350),
    },
    {
      label: 'COD pause threshold',
      tip: RIDER_RULE_TIPS.codPause,
      value: formatJmd(rules.cod?.pause_threshold_jmd ?? 10000),
    },
    {
      label: 'Road distance multiplier',
      tip: RIDER_RULE_TIPS.roadMultiplier,
      value: `${rules.road_distance_multiplier ?? 1.4}×`,
    },
    {
      label: 'Tip processing from rider',
      tip: RIDER_RULE_TIPS.tipProcessing,
      value: rules.tip_processing_from_rider !== false ? 'Yes' : 'No',
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
  const gg = rules.growth_guarantee ?? {
    enabled: true,
    tier_slugs: ['dominant'],
    months_from_assignment: 6,
    min_orders_per_month: 20,
    max_credit_jmd_per_period: 50_000,
  };
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Platform controls for this {scopeLabel}. Statutory GCT is managed in Accounting → GCT — not
        per-market blobs. Base delivery fee is under Customer → Delivery (platform-wide).
      </p>
      <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 space-y-3">
        <h3 className="text-sm font-medium text-amber-50">Growth Guarantee</h3>
        <p className="text-xs text-amber-200/80">
          Dominant merchants under the monthly order floor get a commission credit back to Economy
          rate. Credits land in merchant adjustments (idempotent per month).
        </p>
        <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            disabled={!canWrite}
            checked={gg.enabled !== false}
            onChange={(e) =>
              setRules((r) => ({
                ...r,
                growth_guarantee: { ...gg, enabled: e.target.checked },
              }))
            }
            className="rounded border-slate-600"
          />
          Enabled
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-slate-400">
            Months from Dominant assignment
            <input
              type="number"
              min={1}
              max={24}
              disabled={!canWrite}
              value={gg.months_from_assignment ?? 6}
              onChange={(e) =>
                setRules((r) => ({
                  ...r,
                  growth_guarantee: {
                    ...gg,
                    months_from_assignment: Number(e.target.value) || 6,
                  },
                }))
              }
              className="mt-1 w-full px-3 py-1.5 text-sm rounded-lg bg-slate-950 border border-slate-700 text-white"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Min completed orders / month
            <input
              type="number"
              min={1}
              max={500}
              disabled={!canWrite}
              value={gg.min_orders_per_month ?? 20}
              onChange={(e) =>
                setRules((r) => ({
                  ...r,
                  growth_guarantee: {
                    ...gg,
                    min_orders_per_month: Number(e.target.value) || 20,
                  },
                }))
              }
              className="mt-1 w-full px-3 py-1.5 text-sm rounded-lg bg-slate-950 border border-slate-700 text-white"
            />
          </label>
          <label className="block text-xs text-slate-400 col-span-2">
            Max credit per merchant / month (J$)
            <input
              type="number"
              min={0}
              disabled={!canWrite}
              value={gg.max_credit_jmd_per_period ?? 50_000}
              onChange={(e) =>
                setRules((r) => ({
                  ...r,
                  growth_guarantee: {
                    ...gg,
                    max_credit_jmd_per_period: Number(e.target.value) || 50_000,
                  },
                }))
              }
              className="mt-1 w-full px-3 py-1.5 text-sm rounded-lg bg-slate-950 border border-slate-700 text-white"
            />
          </label>
        </div>
      </div>
    </div>
  );
}

export function PlatformRulesReadonly({ rules }: { rules: PricingRulesPayload }) {
  const gg = rules.growth_guarantee;
  const rows = [
    { label: 'GCT', value: 'Accounting → GCT engine' },
    { label: 'Base delivery', value: 'Customer → Delivery' },
    { label: 'Menu inflation cap', value: 'Platform max (25%)' },
    {
      label: 'Growth Guarantee',
      value: gg?.enabled === false
        ? 'Off'
        : `On · ${gg?.min_orders_per_month ?? 20} orders / ${gg?.months_from_assignment ?? 6} mo`,
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
