import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AppPermissionsTable, type AppPermissionPolicyPatch } from '@roam/admin-core';
import type { AppPermissionPolicyRow } from '@roam/types';
import {
  getAppPermissionPolicy,
  updateAppPermissionPolicy,
} from '../services/ridesAdminService';

const WRITE_ROLES = new Set(['platform_owner', 'superadmin', 'rides_admin']);

interface OutletContext {
  session: Session;
  role: string | undefined;
}

export function AppPermissionsPage() {
  const { session, role } = useOutletContext<OutletContext>();
  const canEdit = role ? WRITE_ROLES.has(role) : false;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permissions, setPermissions] = useState<AppPermissionPolicyRow[]>([]);

  const load = useCallback(async () => {
    if (!session.access_token) return;
    setLoading(true);
    try {
      const { permissions: next } = await getAppPermissionPolicy(session.access_token, 'rider');
      setPermissions(next);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load permissions');
    } finally {
      setLoading(false);
    }
  }, [session.access_token]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (patches: AppPermissionPolicyPatch[]) => {
    if (!session.access_token || !canEdit) return;
    setSaving(true);
    try {
      const { permissions: next } = await updateAppPermissionPolicy(
        session.access_token,
        'rider',
        patches,
      );
      setPermissions(next);
      toast.success('Rider permission policy saved');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-200">
      <div>
        <h2 className="text-xl font-semibold text-white">App Permissions</h2>
        <p className="text-sm text-slate-400 mt-1">
          Rider app (Roam Rides) — control prompts and gates for location, notifications, and more.
        </p>
      </div>
      <AppPermissionsTable
        surfaceLabel="rider"
        permissions={permissions}
        canEdit={canEdit}
        saving={saving}
        onSave={handleSave}
      />
      {!canEdit && (
        <p className="text-xs text-amber-500/90">
          Read-only — rides_admin or higher required to save.
        </p>
      )}
    </div>
  );
}
