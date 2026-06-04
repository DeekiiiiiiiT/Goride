import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Session, User } from '@supabase/supabase-js';
import { toast } from 'sonner';
import {
  PlayStoreLaunchPage as PlayStoreLaunchView,
  DRIVER_DATA_SAFETY_SUMMARY,
  type PlayStoreChecklistPatch,
  type PlayStoreLaunchPayload,
  type PlayStoreReleaseInput,
} from '@roam/play-store-launch';
import { canWriteAppPermissionPolicy } from '@roam/admin-core';
import {
  addDriverPlayStoreRelease,
  deleteDriverPlayStoreRelease,
  getDriverPlayStoreLaunch,
  patchDriverPlayStoreChecklist,
  saveDriverPlayStoreDataSafetyNotes,
} from '../services/playStoreLaunchService';

interface OutletContext {
  session: Session;
}

export function DriverPlayStoreLaunchPage() {
  const { session } = useOutletContext<OutletContext>();
  const canEdit = canWriteAppPermissionPolicy(session.user as User, 'driver');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<PlayStoreLaunchPayload | null>(null);

  const load = useCallback(async () => {
    if (!session.access_token) return;
    setLoading(true);
    try {
      const next = await getDriverPlayStoreLaunch(session.access_token);
      setData(next);
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
      const partial = await patchDriverPlayStoreChecklist(session.access_token, patches);
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
      const partial = await saveDriverPlayStoreDataSafetyNotes(session.access_token, notes);
      setData((prev) => (prev ? { ...prev, ...partial } : null));
      toast.success('Notes saved');
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
      await addDriverPlayStoreRelease(session.access_token, input);
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
      await deleteDriverPlayStoreRelease(session.access_token, id);
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
      dataSafetySummary={DRIVER_DATA_SAFETY_SUMMARY}
      dataSafetyIntro={
        'Use this when filling Policy → App content → Data safety. Roam Driver declares foreground and background location, plus compliance photo uploads.'
      }
      loading={loading}
      canEdit={canEdit}
      saving={saving}
      onRefresh={() => void load()}
      onPatchChecklist={onPatchChecklist}
      onSaveDataSafetyNotes={onSaveDataSafetyNotes}
      onAddRelease={onAddRelease}
      onDeleteRelease={onDeleteRelease}
    />
  );
}
