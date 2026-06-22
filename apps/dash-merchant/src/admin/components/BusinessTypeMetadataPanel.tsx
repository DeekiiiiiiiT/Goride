import React from 'react';
import type {
  CategoryTaxonomyKey,
  ComplianceTier,
  FulfillmentType,
  GoLiveRule,
  MerchantBusinessTypeConfig,
  VerticalType,
} from '@roam/types';
import { getDefaultConfig, isRegulatedVertical } from '@roam/vertical-config';

const VERTICAL_OPTIONS: VerticalType[] = [
  'restaurant',
  'grocery',
  'convenience',
  'retail',
  'pharmacy',
  'alcohol',
];

const FULFILLMENT_OPTIONS: FulfillmentType[] = ['cook_to_order', 'pick_and_pack'];
const TAXONOMY_OPTIONS: CategoryTaxonomyKey[] = ['cuisine', 'inventory_category', 'product_category'];
const GO_LIVE_OPTIONS: GoLiveRule[] = ['menu_min_5', 'catalog_imported', 'pos_connected'];
const COMPLIANCE_OPTIONS: ComplianceTier[] = ['standard', 'regulated'];

type Props = {
  value: MerchantBusinessTypeConfig;
  disabled?: boolean;
  onChange: (next: MerchantBusinessTypeConfig) => void;
};

export function BusinessTypeMetadataPanel({ value, disabled, onChange }: Props) {
  const regulated = isRegulatedVertical(value.vertical_type);

  const patch = (partial: Partial<MerchantBusinessTypeConfig>) => {
    onChange({ ...value, ...partial });
  };

  return (
    <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/80 p-3 space-y-3 text-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Vertical metadata</p>
      {regulated && (
        <p className="text-xs text-amber-300/90 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-1.5">
          Regulated vertical — requires compliance review before activation.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-slate-300">
          Vertical
          <select
            disabled={disabled}
            value={value.vertical_type}
            onChange={(e) => {
              const vertical_type = e.target.value as VerticalType;
              const defaults = getDefaultConfig({ id: value.id, label: value.label, vertical_type });
              onChange({ ...value, ...defaults, id: value.id, label: value.label, section_id: value.section_id });
            }}
            className="px-2 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white"
          >
            {VERTICAL_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-slate-300">
          Fulfillment
          <select
            disabled={disabled}
            value={value.fulfillment_type}
            onChange={(e) => patch({ fulfillment_type: e.target.value as FulfillmentType })}
            className="px-2 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white"
          >
            {FULFILLMENT_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-slate-300">
          Category taxonomy
          <select
            disabled={disabled}
            value={value.category_taxonomy_key}
            onChange={(e) => patch({ category_taxonomy_key: e.target.value as CategoryTaxonomyKey })}
            className="px-2 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white"
          >
            {TAXONOMY_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-slate-300">
          Go-live rule
          <select
            disabled={disabled}
            value={value.go_live_rule}
            onChange={(e) => patch({ go_live_rule: e.target.value as GoLiveRule })}
            className="px-2 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white"
          >
            {GO_LIVE_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-slate-300">
          Compliance tier
          <select
            disabled={disabled || regulated}
            value={value.compliance_tier}
            onChange={(e) => patch({ compliance_tier: e.target.value as ComplianceTier })}
            className="px-2 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white disabled:opacity-50"
          >
            {COMPLIANCE_OPTIONS.map((v) => (
              <option key={v} value={v} disabled={v === 'regulated' && !regulated}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-slate-300">
          Default prep (mins)
          <input
            type="number"
            min={5}
            disabled={disabled}
            value={value.default_prep_time_mins}
            onChange={(e) => patch({ default_prep_time_mins: Number(e.target.value) || 15 })}
            className="px-2 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white"
          />
        </label>
        <label className="flex flex-col gap-1 text-slate-300">
          Max delivery radius (km)
          <input
            type="number"
            min={1}
            disabled={disabled}
            value={value.max_delivery_radius_km}
            onChange={(e) => patch({ max_delivery_radius_km: Number(e.target.value) || 5 })}
            className="px-2 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-slate-400">
        <span className="px-2 py-0.5 rounded-full bg-slate-800">{value.vertical_type}</span>
        <span className="px-2 py-0.5 rounded-full bg-slate-800">{value.fulfillment_type}</span>
        <span className="px-2 py-0.5 rounded-full bg-slate-800">{value.go_live_rule}</span>
      </div>
    </div>
  );
}
