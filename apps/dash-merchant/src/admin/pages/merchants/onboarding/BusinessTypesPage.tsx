import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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
import { BusinessTypeMetadataPanel } from '../../../components/BusinessTypeMetadataPanel';
import { getDefaultConfig } from '@roam/vertical-config';
import type { AdminOutletContext } from '../../../DashAdminPortal';
import { invalidateMerchantBusinessTypesCache } from '../../../../hooks/useMerchantBusinessTypes';

export function BusinessTypesPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const { confirm } = useAdminConfirm();
  const token = session.access_token;
  const canWrite = canWriteDashAdmin(session.user);

  const [sections, setSections] = useState<MerchantBusinessTypeSectionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [newSectionLabel, setNewSectionLabel] = useState('');
  const [addingTypeSectionId, setAddingTypeSectionId] = useState<string | null>(null);
  const [newTypeLabel, setNewTypeLabel] = useState('');
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionLabel, setEditingSectionLabel] = useState('');
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editingTypeLabel, setEditingTypeLabel] = useState('');
  const [metadataTypeId, setMetadataTypeId] = useState<string | null>(null);
  const [metadataDraft, setMetadataDraft] = useState<MerchantBusinessTypeDto | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listMerchantBusinessTypes(token);
      setSections(res.sections.filter((s) => s.is_active));
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
      await updateMerchantBusinessTypeSection(token, id, { label });
      setEditingSectionId(null);
      toast.success('Section updated');
      await refreshCatalog();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update section');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveSection = async (section: MerchantBusinessTypeSectionDto) => {
    const activeTypes = section.types.filter((t) => t.is_active);
    if (activeTypes.length > 0) {
      toast.error('Remove business types in this section first');
      return;
    }
    const ok = await confirm({
      title: 'Remove section?',
      description: `Hide "${section.label}" from the partner setup form.`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteMerchantBusinessTypeSection(token, section.id);
      toast.success('Section removed');
      await refreshCatalog();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove section');
    } finally {
      setBusy(false);
    }
  };

  const handleAddType = async (sectionId: string) => {
    const label = newTypeLabel.trim();
    if (!label) return;
    setBusy(true);
    try {
      const defaults = getDefaultConfig({ label });
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

  const handleSaveMetadata = async (type: MerchantBusinessTypeDto) => {
    if (!metadataDraft) return;
    setBusy(true);
    try {
      await updateMerchantBusinessType(token, type.id, {
        vertical_type: metadataDraft.vertical_type,
        fulfillment_type: metadataDraft.fulfillment_type,
        category_taxonomy_key: metadataDraft.category_taxonomy_key,
        default_prep_time_mins: metadataDraft.default_prep_time_mins,
        max_delivery_radius_km: metadataDraft.max_delivery_radius_km,
        compliance_tier: metadataDraft.compliance_tier,
        go_live_rule: metadataDraft.go_live_rule,
        required_document_types: metadataDraft.required_document_types,
      });
      setMetadataTypeId(null);
      setMetadataDraft(null);
      toast.success('Metadata updated');
      await refreshCatalog();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update metadata');
    } finally {
      setBusy(false);
    }
  };

  const openMetadata = (type: MerchantBusinessTypeDto) => {
    setMetadataTypeId(type.id);
    setMetadataDraft(getDefaultConfig(type));
  };

  const handleRemoveType = async (id: string, label: string) => {
    const ok = await confirm({
      title: 'Remove business type?',
      description: `"${label}" will no longer appear on the partner setup form. Existing merchants keep their saved value.`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteMerchantBusinessType(token, id);
      toast.success('Business type removed');
      await refreshCatalog();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove business type');
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
      </div>

      {canWrite && (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
          <p className="text-sm font-medium text-white mb-3">Add section</p>
          <div className="flex flex-wrap gap-2">
            <input
              value={newSectionLabel}
              onChange={(e) => setNewSectionLabel(e.target.value)}
              placeholder="e.g. Food Service"
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

      {sections.length === 0 ? (
        <p className="text-slate-400 text-center py-12">No sections yet. Add one to get started.</p>
      ) : (
        <div className="space-y-4">
          {sections.map((section) => {
            const activeTypes = section.types.filter((t) => t.is_active);
            return (
              <section
                key={section.id}
                className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/50">
                  {editingSectionId === section.id ? (
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                      <input
                        value={editingSectionLabel}
                        onChange={(e) => setEditingSectionLabel(e.target.value)}
                        className="flex-1 min-w-[160px] px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
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
                        <h3 className="font-medium text-white">{section.label}</h3>
                        <p className="text-xs text-slate-500 font-mono">{section.id}</p>
                      </div>
                      {canWrite && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSectionId(section.id);
                              setEditingSectionLabel(section.label);
                            }}
                            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                            aria-label="Edit section"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRemoveSection(section)}
                            className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800"
                            aria-label="Remove section"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="divide-y divide-slate-800">
                  {activeTypes.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-slate-500 text-center">No types in this section</p>
                  ) : (
                    activeTypes.map((type) => (
                      <div
                        key={type.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
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
                              <p className="text-sm text-white">{type.label}</p>
                              <p className="text-xs text-slate-500 font-mono">{type.id}</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                  {type.vertical_type ?? 'restaurant'}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                  {type.fulfillment_type ?? 'cook_to_order'}
                                </span>
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
                                <button
                                  type="button"
                                  onClick={() => void handleRemoveType(type.id, type.label)}
                                  className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800"
                                  aria-label="Remove type"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </>
                        )}
                        {metadataTypeId === type.id && metadataDraft && (
                          <div className="w-full px-4 pb-3">
                            <BusinessTypeMetadataPanel
                              value={metadataDraft}
                              disabled={!canWrite || busy}
                              onChange={setMetadataDraft}
                            />
                            {canWrite && (
                              <div className="flex gap-2 mt-2">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void handleSaveMetadata(type)}
                                  className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white disabled:opacity-50"
                                >
                                  Save metadata
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMetadataTypeId(null);
                                    setMetadataDraft(null);
                                  }}
                                  className="px-3 py-1.5 text-sm rounded-lg text-slate-400"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {canWrite && (
                  <div className="px-4 py-3 border-t border-slate-800 bg-slate-900/30">
                    {addingTypeSectionId === section.id ? (
                      <div className="flex flex-wrap gap-2">
                        <input
                          value={newTypeLabel}
                          onChange={(e) => setNewTypeLabel(e.target.value)}
                          placeholder="e.g. Juice Bar"
                          className="flex-1 min-w-[160px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                        />
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
    </div>
  );
}
