import React, { useCallback } from 'react';
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
import { CategoryTagsEditor } from './CategoryTagsEditor';

export type MetadataTabId = 'identity' | 'catalog' | 'logistics' | 'documents';

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
  activeTab: MetadataTabId;
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

const fieldClass =
  'px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white w-full text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600/50';

const labelClass = 'text-sm font-medium text-slate-300';

export function BusinessTypeMetadataPanel({ value, disabled, activeTab, onChange }: Props) {
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

  if (activeTab === 'identity') {
    return (
      <div className="space-y-5">
        <div>
          <h3 className="text-base font-semibold text-white">Core identity</h3>
          <p className="mt-1 text-sm text-slate-400">
            Defines how this business type behaves on the partner setup form.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Vertical</span>
            <select
              disabled={disabled}
              value={value.vertical_type}
              onChange={(e) => handleVerticalChange(e.target.value as VerticalType)}
              className={fieldClass}
            >
              {VERTICAL_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Fulfillment</span>
            <select
              disabled={disabled}
              value={value.fulfillment_type}
              onChange={(e) => patch({ fulfillment_type: e.target.value as FulfillmentType })}
              className={fieldClass}
            >
              {FULFILLMENT_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    );
  }

  if (activeTab === 'catalog') {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-base font-semibold text-white">Catalog & taxonomy</h3>
          <p className="mt-1 text-sm text-slate-400">
            Controls category behaviour and the tags partners can select during signup.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Category taxonomy</span>
            <select
              disabled={disabled}
              value={value.category_taxonomy_key}
              onChange={(e) => patch({ category_taxonomy_key: e.target.value as CategoryTaxonomyKey })}
              className={fieldClass}
            >
              {TAXONOMY_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Go-live rule</span>
            <select
              disabled={disabled}
              value={value.go_live_rule}
              onChange={(e) => patch({ go_live_rule: e.target.value as GoLiveRule })}
              className={fieldClass}
            >
              {GO_LIVE_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={labelClass}>Compliance tier</span>
            {regulated ? (
              <span className="inline-flex w-fit items-center rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1 text-xs text-amber-200">
                regulated (derived from vertical)
              </span>
            ) : (
              <span className="inline-flex w-fit items-center rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                standard
              </span>
            )}
          </div>
        </div>

        {value.category_taxonomy_key !== 'none' && (
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
            <h4 className="text-sm font-medium text-white">Category tags</h4>
            <p className="mt-1 mb-3 text-xs text-slate-500">
              Shown to partners on the categories step of signup.
            </p>
            <CategoryTagsEditor
              value={value.category_tags ?? []}
              disabled={disabled}
              onChange={(category_tags) => patch({ category_tags })}
            />
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'logistics') {
    return (
      <div className="space-y-5">
        <div>
          <h3 className="text-base font-semibold text-white">SLA & logistics</h3>
          <p className="mt-1 text-sm text-slate-400">
            Default prep time and delivery radius applied when partners choose this type.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Default prep (mins)</span>
            <input
              type="number"
              min={5}
              max={120}
              disabled={disabled}
              value={value.default_prep_time_mins}
              onChange={(e) => patch({ default_prep_time_mins: Number(e.target.value) || 15 })}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Max delivery radius (km)</span>
            <input
              type="number"
              min={1}
              max={50}
              disabled={disabled}
              value={value.max_delivery_radius_km}
              onChange={(e) => patch({ max_delivery_radius_km: Number(e.target.value) || 5 })}
              className={fieldClass}
            />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-white">KYC & required documents</h3>
        <p className="mt-1 text-sm text-slate-400">
          Documents partners must upload before their application can be reviewed.
        </p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
        <RequiredDocumentsEditor
          value={value.required_document_types}
          vertical={value.vertical_type}
          disabled={disabled}
          onChange={(required_document_types) => patch({ required_document_types })}
        />
      </div>
    </div>
  );
}
