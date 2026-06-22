import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ChevronDown, ChevronUp, Loader2, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { VerticalType } from '@roam/types';
import { useAdminConfirm } from '../../../contexts/AdminConfirmContext';
import { canWriteDashAdmin } from '../../../utils/dashAdminRoles';
import {
  createMerchantBusinessType,
  createMerchantBusinessTypeSection,
  deleteMerchantBusinessType,
  deleteMerchantBusinessTypeSection,
  listMerchantBusinessTypes,
  updateMerchantBusinessType,
  updateMerchantBusinessTypeSection,
  type MerchantBusinessTypeDto,
  type MerchantBusinessTypeSectionDto,
} from '../../../services/dashAdminService';
import { BusinessTypeMetadataModal } from '../../../components/BusinessTypeMetadataModal';
import { validateBusinessTypeMetadata } from '../../../utils/validateBusinessTypeMetadata';
import { getDefaultConfig, isRegulatedVertical } from '@roam/vertical-config';
import type { AdminOutletContext } from '../../../DashAdminPortal';
import { invalidateMerchantBusinessTypesCache } from '../../../../hooks/useMerchantBusinessTypes';

const TYPE_TEMPLATES: { value: VerticalType | 'custom'; label: string }[] = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'grocery', label: 'Grocery' },
  { value: 'convenience', label: 'Convenience' },
  { value: 'retail', label: 'Retail' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'alcohol', label: 'Alcohol' },
  { value: 'custom', label: 'Custom (restaurant defaults)' },
];

export function BusinessTypesPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const { confirm } = useAdminConfirm();
  const token = session.access_token;
  const canWrite = canWriteDashAdmin(session.user);

  const [sections, setSections] = useState<MerchantBusinessTypeSectionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const [newSectionLabel, setNewSectionLabel] = useState('');
  const [addingTypeSectionId, setAddingTypeSectionId] = useState<string | null>(null);
  const [newTypeLabel, setNewTypeLabel] = useState('');
  const [newTypeTemplate, setNewTypeTemplate] = useState<VerticalType | 'custom'>('restaurant');
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionLabel, setEditingSectionLabel] = useState('');
  const [editingSectionSort, setEditingSectionSort] = useState(0);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editingTypeLabel, setEditingTypeLabel] = useState('');
  const [metadataTypeId, setMetadataTypeId] = useState<string | null>(null);
  const [metadataDraft, setMetadataDraft] = useState<MerchantBusinessTypeDto | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listMerchantBusinessTypes(token);
      setSections(res.sections);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load business types');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshCatalog = async () => {
    invalidateMerchantBusinessTypesCache();
    await load();
  };

  const visibleSections = sections
    .filter((s) => showInactive || s.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));

  const typesForSection = (section: MerchantBusinessTypeSectionDto) =>
    section.types
      .filter((t) => showInactive || t.is_active)
      .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));

  const handleAddSection = async () => {
    const label = newSectionLabel.trim();
    if (!label) return;
    setBusy(true);
    try {
      await createMerchantBusinessTypeSection(token, { label });
      setNewSectionLabel('');
      toast.success('Section added');
      await refreshCatalog();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add section');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSection = async (id: string) => {
    const label = editingSectionLabel.trim();
    if (!label) return;
    setBusy(true);
    try {
      await updateMerchantBusinessTypeSection(token, id, {
        label,
        sort_order: editingSectionSort,
      });
      setEditingSectionId(null);
      toast.success('Section updated');
      await refreshCatalog();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update section');
    } finally {
      setBusy(false);
    }
  };

  const handleMoveSection = async (section: MerchantBusinessTypeSectionDto, direction: 'up' | 'down') => {
    const sorted = [...visibleSections];
    const idx = sorted.findIndex((s) => s.id === section.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    setBusy(true);
    try {
      await Promise.all([
        updateMerchantBusinessTypeSection(token, section.id, { sort_order: other.sort_order }),
        updateMerchantBusinessTypeSection(token, other.id, { sort_order: section.sort_order }),
      ]);
      await refreshCatalog();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reorder section');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveSection = async (section: MerchantBusinessTypeSectionDto) => {
    const activeTypes = section.types.filter((t) => t.is_active);
    if (activeTypes.length > 0) {
      toast.error('Deactivate business types in this section first');
      return;
    }
    const ok = await confirm({
      title: 'Deactivate section?',
      description: `Hide "${section.label}" from the partner setup form.`,
      confirmLabel: 'Deactivate',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteMerchantBusinessTypeSection(token, section.id);
      toast.success('Section deactivated');
      await refreshCatalog();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to deactivate section');
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreSection = async (section: MerchantBusinessTypeSectionDto) => {
    setBusy(true);
    try {
      await updateMerchantBusinessTypeSection(token, section.id, { is_active: true });
      toast.success('Section restored');
      await refreshCatalog();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to restore section');
    } finally {
      setBusy(false);
    }
  };

  const handleAddType = async (sectionId: string) => {
    const label = newTypeLabel.trim();
    if (!label) return;
    const vertical = newTypeTemplate === 'custom' ? 'restaurant' : newTypeTemplate;
    const defaults = getDefaultConfig({ label, section_id: sectionId, vertical_type: vertical });
    const validation = validateBusinessTypeMetadata(defaults);
    if (!validation.valid) {
      toast.error(validation.errors[0] ?? 'Invalid template configuration');
      return;
    }
    setBusy(true);
    try {
      await createMerchantBusinessType(token, {
        label,
        section_id: sectionId,
        vertical_type: defaults.vertical_type,
        fulfillment_type: defaults.fulfillment_type,
        category_taxonomy_key: defaults.category_taxonomy_key,
        default_prep_time_mins: defaults.default_prep_time_mins,
        max_delivery_radius_km: defaults.max_delivery_radius_km,
        compliance_tier: defaults.compliance_tier,
        go_live_rule: defaults.go_live_rule,
        required_document_types: defaults.required_document_types,
      });
      setNewTypeLabel('');
      setNewTypeTemplate('restaurant');
      setAddingTypeSectionId(null);
      toast.success('Business type added');
      await refreshCatalog();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add business type');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveType = async (id: string) => {
    const label = editingTypeLabel.trim();
    if (!label) return;
    setBusy(true);
    try {
      await updateMerchantBusinessType(token, id, { label });
      setEditingTypeId(null);
      toast.success('Business type updated');
      await refreshCatalog();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update business type');
    } finally {
      setBusy(false);
    }
  };

  const openMetadata = (type: MerchantBusinessTypeDto) => {
    setMetadataTypeId(type.id);
    setMetadataDraft({
      ...getDefaultConfig(type),
      category_tags: Array.isArray(type.category_tags) ? [...type.category_tags] : [],
    });
  };

  const closeMetadata = () => {
    setMetadataTypeId(null);
    setMetadataDraft(null);
  };

  const metadataType = metadataTypeId
    ? sections.flatMap((section) => section.types).find((type) => type.id === metadataTypeId)
    : undefined;

  const handleSaveMetadata = async (type: MerchantBusinessTypeDto) => {
    if (!metadataDraft) return;
    const validation = validateBusinessTypeMetadata(metadataDraft);
    if (!validation.valid) {
      toast.error(validation.errors.join(' '));
      return;
    }
    setBusy(true);
    try {
      const { type: saved } = await updateMerchantBusinessType(token, type.id, {
        vertical_type: metadataDraft.vertical_type,
        fulfillment_type: metadataDraft.fulfillment_type,
        category_taxonomy_key: metadataDraft.category_taxonomy_key,
        default_prep_time_mins: metadataDraft.default_prep_time_mins,
        max_delivery_radius_km: metadataDraft.max_delivery_radius_km,
        compliance_tier: metadataDraft.compliance_tier,
        go_live_rule: metadataDraft.go_live_rule,
        required_document_types: metadataDraft.required_document_types,
        category_tags: metadataDraft.category_tags ?? [],
      });
      setSections((current) =>
        current.map((section) => ({
          ...section,
          types: section.types.map((item) => (item.id === saved.id ? saved : item)),
        })),
      );
      closeMetadata();
      toast.success('Metadata updated');
      invalidateMerchantBusinessTypesCache();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update metadata');
    } finally {
      setBusy(false);
    }
  };

  const handleDeactivateType = async (id: string, label: string) => {
    const ok = await confirm({
      title: 'Deactivate business type?',
      description: `"${label}" will no longer appear on the partner setup form. Existing merchants keep their saved value.`,
      confirmLabel: 'Deactivate',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteMerchantBusinessType(token, id);
      toast.success('Business type deactivated');
      await refreshCatalog();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to deactivate business type');
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreType = async (id: string) => {
    setBusy(true);
    try {
      await updateMerchantBusinessType(token, id, { is_active: true });
      toast.success('Business type restored');
      await refreshCatalog();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to restore business type');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Business Types</h2>
          <p className="text-sm text-slate-400 mt-1">
            Sections and types shown on the partner setup form. Changes apply immediately.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-slate-600 bg-slate-900 text-amber-500 focus:ring-amber-500/40"
          />
          Show inactive
        </label>
      </div>

      {canWrite && (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
          <p className="text-sm font-medium text-white mb-3">Add section</p>
          <div className="flex flex-wrap gap-2">
            <input
              value={newSectionLabel}
              onChange={(e) => setNewSectionLabel(e.target.value)}
              placeholder="e.g. Regulated"
              className="flex-1 min-w-[200px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
            <button
              type="button"
              disabled={busy || !newSectionLabel.trim()}
              onClick={() => void handleAddSection()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Add section
            </button>
          </div>
        </div>
      )}

      {visibleSections.length === 0 ? (
        <p className="text-slate-400 text-center py-12">No sections yet. Add one to get started.</p>
      ) : (
        <div className="space-y-4">
          {visibleSections.map((section, sectionIndex) => {
            const sectionTypes = typesForSection(section);
            return (
              <section
                key={section.id}
                className={`rounded-xl border overflow-hidden ${
                  section.is_active ? 'border-slate-800 bg-slate-950' : 'border-slate-800/50 bg-slate-950/40 opacity-80'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/50">
                  {editingSectionId === section.id ? (
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                      <input
                        value={editingSectionLabel}
                        onChange={(e) => setEditingSectionLabel(e.target.value)}
                        className="flex-1 min-w-[160px] px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                      />
                      <input
                        type="number"
                        value={editingSectionSort}
                        onChange={(e) => setEditingSectionSort(Number(e.target.value) || 0)}
                        className="w-20 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                        title="Sort order"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleSaveSection(section.id)}
                        className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingSectionId(null)}
                        className="px-3 py-1.5 text-sm rounded-lg text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-white">{section.label}</h3>
                          {!section.is_active && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">
                              inactive
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-mono">
                          {section.id} · sort {section.sort_order}
                        </p>
                      </div>
                      {canWrite && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={busy || sectionIndex === 0}
                            onClick={() => void handleMoveSection(section, 'up')}
                            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30"
                            aria-label="Move section up"
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={busy || sectionIndex === visibleSections.length - 1}
                            onClick={() => void handleMoveSection(section, 'down')}
                            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30"
                            aria-label="Move section down"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSectionId(section.id);
                              setEditingSectionLabel(section.label);
                              setEditingSectionSort(section.sort_order);
                            }}
                            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                            aria-label="Edit section"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {section.is_active ? (
                            <button
                              type="button"
                              onClick={() => void handleRemoveSection(section)}
                              className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800"
                              aria-label="Deactivate section"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleRestoreSection(section)}
                              className="p-2 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800"
                              aria-label="Restore section"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="divide-y divide-slate-800">
                  {sectionTypes.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-slate-500 text-center">No types in this section</p>
                  ) : (
                    sectionTypes.map((type) => (
                      <div key={type.id} className="flex flex-col">
                        <div
                          className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${
                            !type.is_active ? 'opacity-70' : ''
                          }`}
                        >
                          {editingTypeId === type.id ? (
                            <div className="flex flex-1 flex-wrap items-center gap-2">
                              <input
                                value={editingTypeLabel}
                                onChange={(e) => setEditingTypeLabel(e.target.value)}
                                className="flex-1 min-w-[160px] px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                              />
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleSaveType(type.id)}
                                className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTypeId(null)}
                                className="px-3 py-1.5 text-sm rounded-lg text-slate-400 hover:text-white"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm text-white">{type.label}</p>
                                  {!type.is_active && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">
                                      inactive
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 font-mono">{type.id}</p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                    {type.vertical_type ?? 'restaurant'}
                                  </span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                    {type.fulfillment_type ?? 'cook_to_order'}
                                  </span>
                                  {isRegulatedVertical(type.vertical_type) && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
                                      regulated
                                    </span>
                                  )}
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                    {type.required_document_types?.length ?? 3} docs
                                  </span>
                                  {(type.category_tags?.length ?? 0) > 0 && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                      {type.category_tags?.length} tags
                                    </span>
                                  )}
                                </div>
                              </div>
                              {canWrite && (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => openMetadata(type)}
                                    className="px-2 py-1 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
                                  >
                                    Metadata
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingTypeId(type.id);
                                      setEditingTypeLabel(type.label);
                                    }}
                                    className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                                    aria-label="Edit type"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  {type.is_active ? (
                                    <button
                                      type="button"
                                      onClick={() => void handleDeactivateType(type.id, type.label)}
                                      className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800"
                                      aria-label="Deactivate type"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => void handleRestoreType(type.id)}
                                      className="p-2 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800"
                                      aria-label="Restore type"
                                    >
                                      <RotateCcw className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {canWrite && section.is_active && (
                  <div className="px-4 py-3 border-t border-slate-800 bg-slate-900/30">
                    {addingTypeSectionId === section.id ? (
                      <div className="flex flex-wrap gap-2">
                        <input
                          value={newTypeLabel}
                          onChange={(e) => setNewTypeLabel(e.target.value)}
                          placeholder="e.g. Pharmacy"
                          className="flex-1 min-w-[140px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                        />
                        <select
                          value={newTypeTemplate}
                          onChange={(e) =>
                            setNewTypeTemplate(e.target.value as VerticalType | 'custom')
                          }
                          className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                        >
                          {TYPE_TEMPLATES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={busy || !newTypeLabel.trim()}
                          onClick={() => void handleAddType(section.id)}
                          className="px-3 py-2 text-sm rounded-lg bg-amber-600 text-white disabled:opacity-50"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAddingTypeSectionId(null);
                            setNewTypeLabel('');
                            setNewTypeTemplate('restaurant');
                          }}
                          className="px-3 py-2 text-sm rounded-lg text-slate-400"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAddingTypeSectionId(section.id)}
                        className="inline-flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300"
                      >
                        <Plus className="w-4 h-4" />
                        Add business type
                      </button>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {metadataDraft && metadataTypeId && metadataType && (
        <BusinessTypeMetadataModal
          open
          typeLabel={metadataType.label}
          typeId={metadataTypeId}
          value={metadataDraft}
          disabled={!canWrite || busy}
          busy={busy}
          onChange={setMetadataDraft}
          onSave={() => void handleSaveMetadata(metadataType)}
          onClose={closeMetadata}
        />
      )}
    </div>
  );
}
