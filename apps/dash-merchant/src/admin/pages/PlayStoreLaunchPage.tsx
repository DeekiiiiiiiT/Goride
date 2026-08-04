import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Session, User } from '@supabase/supabase-js';
import { toast } from 'sonner';
import {
  PlayStoreLaunchPage as PlayStoreLaunchView,
  type PlayStoreChecklistPatch,
  type PlayStoreLaunchPayload,
  type PlayStoreReleaseInput,
} from '@roam/play-store-launch';
import type { DataSafetyState } from '@roam/play-store-launch';
import { canWriteAppPermissionPolicy } from '@roam/admin-core';
import type { AdminOutletContext } from '../DashAdminPortal';
import {
  addDashPlayStoreRelease,
  deleteDashPlayStoreRelease,
  exportDashPlayStoreDataSafetyCsv,
  getDashPlayStoreLaunch,
  importDashPlayStoreDataSafetyCsv,
  patchDashPlayStoreChecklist,
  saveDashPlayStoreDataSafetyNotes,
  saveDashPlayStoreDataSafetyRows,
} from '../services/playStoreLaunchService';

export function DashPlayStoreLaunchPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const canEdit = canWriteAppPermissionPolicy(session.user as User, 'dash');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<PlayStoreLaunchPayload | null>(null);

  const load = useCallback(async () => {
    if (!session.access_token) return;
    setLoading(true);
    try {
      setData(await getDashPlayStoreLaunch(session.access_token));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load Play Store tracker');
    } finally {
      setLoading(false);
    }
  }, [session.access_token]);

  useEffect(() => {
    void load();
  }, [load]);

  const onPatchChecklist = async (patches: PlayStoreChecklistPatch[]) => {
    if (!session.access_token || !canEdit) return;
    setSaving(true);
    try {
      const partial = await patchDashPlayStoreChecklist(session.access_token, patches);
      setData((prev) => (prev ? { ...prev, ...partial } : null));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const onSaveDataSafetyNotes = async (notes: string) => {
    if (!session.access_token || !canEdit) return;
    setSaving(true);
    try {
      const partial = await saveDashPlayStoreDataSafetyNotes(session.access_token, notes);
      setData((prev) => (prev ? { ...prev, ...partial } : null));
      toast.success('Notes saved');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const onImportDataSafetyCsv = async (csv: string, dryRun?: boolean) => {
    if (!session.access_token || !canEdit) return {};
    setSaving(true);
    try {
      const result = await importDashPlayStoreDataSafetyCsv(session.access_token, csv, dryRun);
      if (!dryRun && result.payload) {
        setData((prev) => (prev ? { ...prev, ...result.payload } : null));
        toast.success('Data safety CSV imported');
      }
      return { diff: result.diff, issues: result.issues };
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
      return {};
    } finally {
      setSaving(false);
    }
  };

  const onExportDataSafetyCsv = async () => {
    if (!session.access_token) return;
    setSaving(true);
    try {
      await exportDashPlayStoreDataSafetyCsv(session.access_token);
      toast.success('CSV exported');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setSaving(false);
    }
  };

  const onSaveDataSafetyRows = async (state: DataSafetyState, expectedUpdatedAt?: string | null) => {
    if (!session.access_token || !canEdit) return;
    setSaving(true);
    try {
      const partial = await saveDashPlayStoreDataSafetyRows(
        session.access_token,
        state,
        expectedUpdatedAt,
      );
      setData((prev) => (prev ? { ...prev, ...partial } : null));
      toast.success('Data safety saved');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const onAddRelease = async (input: PlayStoreReleaseInput) => {
    if (!session.access_token || !canEdit) return;
    setSaving(true);
    try {
      await addDashPlayStoreRelease(session.access_token, input);
      await load();
      toast.success('Release logged');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not add release');
    } finally {
      setSaving(false);
    }
  };

  const onDeleteRelease = async (id: string) => {
    if (!session.access_token || !canEdit) return;
    setSaving(true);
    try {
      await deleteDashPlayStoreRelease(session.access_token, id);
      await load();
      toast.success('Release removed');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not remove release');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PlayStoreLaunchView
      data={data}
      dataSafetyTemplateUrl="/data-safety/dash-customer-template.csv"
      dataSafetyTemplateLoadLabel="Rush template"
      dataSafetyIntro="Use when filling Policy → App content → Data safety for Roam Rush (customer). Export CSV and import into Play Console."
      loading={loading}
      canEdit={canEdit}
      saving={saving}
      onRefresh={() => void load()}
      onPatchChecklist={onPatchChecklist}
      onSaveDataSafetyNotes={onSaveDataSafetyNotes}
      onImportDataSafetyCsv={onImportDataSafetyCsv}
      onExportDataSafetyCsv={onExportDataSafetyCsv}
      onSaveDataSafetyRows={onSaveDataSafetyRows}
      onAddRelease={onAddRelease}
      onDeleteRelease={onDeleteRelease}
    />
  );
}
