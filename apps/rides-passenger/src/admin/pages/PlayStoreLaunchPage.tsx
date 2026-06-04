import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Session, User } from '@supabase/supabase-js';
import { toast } from 'sonner';
import {
  PlayStoreLaunchPage as PlayStoreLaunchView,
  RIDES_DATA_SAFETY_SUMMARY,
} from '@roam/play-store-launch';
import type {
  PlayStoreChecklistPatch,
  PlayStoreLaunchPayload,
  PlayStoreReleaseInput,
} from '@roam/play-store-launch';
import { canWriteAppPermissionPolicy } from '@roam/admin-core';
import {
  addPlayStoreRelease,
  deletePlayStoreRelease,
  getPlayStoreLaunch,
  patchPlayStoreChecklist,
  savePlayStoreDataSafetyNotes,
} from '../services/playStoreLaunchService';

interface OutletContext {
  session: Session;
}

export function PlayStoreLaunchPage() {
  const { session } = useOutletContext<OutletContext>();
  const canEdit = canWriteAppPermissionPolicy(session.user as User, 'rider');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<PlayStoreLaunchPayload | null>(null);

  const load = useCallback(async () => {
    if (!session.access_token) return;
    setLoading(true);
    try {
      const next = await getPlayStoreLaunch(session.access_token);
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
      const partial = await patchPlayStoreChecklist(session.access_token, patches);
      setData((prev) =>
        prev
          ? { ...prev, ...partial }
          : null,
      );
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
      const partial = await savePlayStoreDataSafetyNotes(session.access_token, notes);
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
      await addPlayStoreRelease(session.access_token, input);
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
      await deletePlayStoreRelease(session.access_token, id);
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
      dataSafetySummary={RIDES_DATA_SAFETY_SUMMARY}
      dataSafetyIntro={
        'Use this when filling Policy → App content → Data safety. Roam Rides uses foreground location only (no background location).'
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
