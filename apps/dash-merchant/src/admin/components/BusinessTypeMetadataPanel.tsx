import React, { useCallback } from 'react';
import { Settings, Package, Clock, FileText } from 'lucide-react';
import type {
  CategoryTaxonomyKey,
  FulfillmentType,
  GoLiveRule,
  MerchantBusinessTypeConfig,
  VerticalType,
} from '@roam/types';
import {
  applyVerticalPreset,
  getVerticalPreset,
  isRegulatedVertical,
} from '@roam/vertical-config';
import { RequiredDocumentsEditor } from './RequiredDocumentsEditor';

const VERTICAL_OPTIONS: VerticalType[] = [
  'restaurant',
  'grocery',
  'convenience',
  'retail',
  'pharmacy',
  'alcohol',
];

const FULFILLMENT_OPTIONS: FulfillmentType[] = ['cook_to_order', 'pick_and_pack'];
const TAXONOMY_OPTIONS: CategoryTaxonomyKey[] = ['cuisine', 'inventory_category', 'none'];
const GO_LIVE_OPTIONS: GoLiveRule[] = ['menu_min_5', 'catalog_imported', 'pos_connected'];

type Props = {
  value: MerchantBusinessTypeConfig;
  disabled?: boolean;
  onChange: (next: MerchantBusinessTypeConfig) => void;
};

function hasCustomizations(current: MerchantBusinessTypeConfig, vertical: VerticalType): boolean {
  const preset = getVerticalPreset(vertical);
  return (
    current.fulfillment_type !== preset.fulfillment_type ||
    current.category_taxonomy_key !== preset.category_taxonomy_key ||
    current.go_live_rule !== preset.go_live_rule ||
    current.default_prep_time_mins !== preset.default_prep_time_mins ||
    current.max_delivery_radius_km !== preset.max_delivery_radius_km ||
    JSON.stringify([...current.required_document_types].sort()) !==
      JSON.stringify([...preset.required_document_types].sort())
  );
}

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 space-y-3">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-emerald-400">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </p>
      {children}
    </div>
  );
}

export function BusinessTypeMetadataPanel({ value, disabled, onChange }: Props) {
  const regulated = isRegulatedVertical(value.vertical_type);

  const patch = (partial: Partial<MerchantBusinessTypeConfig>) => {
    onChange({ ...value, ...partial });
  };

  const applyVerticalChange = useCallback(
    (vertical_type: VerticalType, preserveCustom: boolean) => {
      const next = preserveCustom
        ? applyVerticalPreset(value, vertical_type, { preserveCustomDocs: true })
        : applyVerticalPreset(value, vertical_type);
      onChange(next);
    },
    [value, onChange],
  );

  const handleVerticalChange = (vertical_type: VerticalType) => {
    if (vertical_type === value.vertical_type) return;

    const customized = hasCustomizations(value, vertical_type);
    if (customized) {
      const applyPreset = window.confirm(
        `Apply the ${vertical_type} preset? Click OK to replace operational fields, or Cancel to keep your custom values (compliance and docs will still update).`,
      );
      applyVerticalChange(vertical_type, !applyPreset);
      return;
    }
    applyVerticalChange(vertical_type, false);
  };

  const selectClass =
    'px-2 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white w-full';

  return (
    <div className="mt-3 space-y-3 text-sm">
      {regulated && (
        <p className="text-xs text-amber-300/90 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-1.5">
          Regulated vertical — requires compliance review before activation.
        </p>
      )}

      <SectionCard title="Core Identity" icon={Settings}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-slate-300">
            Vertical
            <select
              disabled={disabled}
              value={value.vertical_type}
              onChange={(e) => handleVerticalChange(e.target.value as VerticalType)}
              className={selectClass}
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
              className={selectClass}
            >
              {FULFILLMENT_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Catalog and Taxonomy" icon={Package}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-slate-300">
            Category taxonomy
            <select
              disabled={disabled}
              value={value.category_taxonomy_key}
              onChange={(e) => patch({ category_taxonomy_key: e.target.value as CategoryTaxonomyKey })}
              className={selectClass}
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
              className={selectClass}
            >
              {GO_LIVE_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1 text-slate-300 sm:col-span-2">
            Compliance tier
            {regulated ? (
              <span className="inline-flex w-fit items-center rounded-full bg-amber-500/15 border border-amber-500/30 px-3 py-1 text-xs text-amber-200">
                regulated (derived from vertical)
              </span>
            ) : (
              <span className="inline-flex w-fit items-center rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                standard
              </span>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="SLA and Logistics" icon={Clock}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-slate-300">
            Default prep (mins)
            <input
              type="number"
              min={5}
              max={120}
              disabled={disabled}
              value={value.default_prep_time_mins}
              onChange={(e) => patch({ default_prep_time_mins: Number(e.target.value) || 15 })}
              className={selectClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-slate-300">
            Max delivery radius (km)
            <input
              type="number"
              min={1}
              max={50}
              disabled={disabled}
              value={value.max_delivery_radius_km}
              onChange={(e) => patch({ max_delivery_radius_km: Number(e.target.value) || 5 })}
              className={selectClass}
            />
          </label>
        </div>
      </SectionCard>

      <SectionCard title="KYC / Required Documents" icon={FileText}>
        <RequiredDocumentsEditor
          value={value.required_document_types}
          vertical={value.vertical_type}
          disabled={disabled}
          onChange={(required_document_types) => patch({ required_document_types })}
        />
      </SectionCard>

      <div className="flex flex-wrap gap-2 text-xs text-slate-400">
        <span className="px-2 py-0.5 rounded-full bg-slate-800">{value.vertical_type}</span>
        <span className="px-2 py-0.5 rounded-full bg-slate-800">{value.fulfillment_type}</span>
        <span className="px-2 py-0.5 rounded-full bg-slate-800">{value.go_live_rule}</span>
        <span className="px-2 py-0.5 rounded-full bg-slate-800">
          {value.required_document_types.length} docs
        </span>
      </div>
    </div>
  );
}
