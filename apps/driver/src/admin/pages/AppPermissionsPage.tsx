import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { jwtPrimaryRole } from '@roam/auth-client';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AppPermissionsTable, type AppPermissionPolicyPatch } from '@roam/admin-core';
import type { AppPermissionPolicyRow } from '@roam/types';
import {
  getDriverAppPermissionPolicy,
  updateDriverAppPermissionPolicy,
} from '../services/ridesPermissionAdminService';

const WRITE_ROLES = new Set(['platform_owner', 'superadmin', 'driver_admin']);

interface OutletContext {
  session: Session;
}

export function DriverAppPermissionsPage() {
  const { session } = useOutletContext<OutletContext>();
  const userRole = jwtPrimaryRole(session.user);
  const canEdit = userRole ? WRITE_ROLES.has(userRole) : false;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permissions, setPermissions] = useState<AppPermissionPolicyRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { permissions: next } = await getDriverAppPermissionPolicy(session.access_token);
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
    if (!canEdit) return;
    setSaving(true);
    try {
      const { permissions: next } = await updateDriverAppPermissionPolicy(
        session.access_token,
        patches,
      );
      setPermissions(next);
      toast.success('Driver permission policy saved');
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
          Roam Driver app — GPS, notifications, and native-only permissions for dispatch.
        </p>
      </div>
      <AppPermissionsTable
        surfaceLabel="driver"
        permissions={permissions}
        canEdit={canEdit}
        saving={saving}
        onSave={handleSave}
      />
      {!canEdit && (
        <p className="text-xs text-amber-500/90">
          Read-only — driver_admin or higher required to save.
        </p>
      )}
    </div>
  );
}
