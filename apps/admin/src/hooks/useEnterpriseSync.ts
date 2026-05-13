import { useState, useEffect, useCallback } from 'react';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { useAuth } from '../components/auth/AuthContext';
import { toast } from 'sonner@2.0.3';

export function useEnterpriseSync() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [activeLocks, setActiveLocks] = useState<any[]>([]);

  const baseUrl = `https://${projectId}.supabase.co/functions/v1/make-server-37f42386`;
  const headers = {
    'Authorization': `Bearer ${publicAnonKey}`,
    'Content-Type': 'application/json'
  };

  const loadPreferences = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${baseUrl}/sync/preferences?userId=${user.id}`, { headers });
      const data = await res.json();
      setPreferences(data);
    } catch (e) {
      console.error("Failed to load preferences", e);
    }
  }, [user]);

  const savePreferences = async (newPrefs: any) => {
    if (!user) return;
    setSyncStatus('syncing');
    try {
      await fetch(`${baseUrl}/sync/preferences`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId: user.id, preferences: newPrefs })
      });
      setPreferences(newPrefs);
      setSyncStatus('idle');
    } catch (e) {
      setSyncStatus('error');
    }
  };

  const acquireLock = async (resourceId: string, resourceType: string) => {
    if (!user) return false;
    try {
      const res = await fetch(`${baseUrl}/sync/lock`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          resourceId,
          resourceType,
          userId: user.id,
          userName: user.user_metadata?.name || user.email
        })
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(`Locked by ${data.lockedBy}`);
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  };

  const releaseLock = async (resourceId: string, resourceType: string) => {
    if (!user) return;
    try {
      await fetch(`${baseUrl}/sync/lock`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ resourceId, resourceType, userId: user.id })
      });
    } catch (e) {
      console.error("Failed to release lock", e);
    }
  };

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  return { preferences, savePreferences, acquireLock, releaseLock, syncStatus };
}
