/**
 * Sync Status Card
 * 
 * Shows the sync status between matching.policies and rides.dispatch_settings.
 * Allows manual sync for backward compatibility during transition.
 */

import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Alert, AlertDescription, AlertTitle } from '../../ui/alert';
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import type { SyncStatus } from './types';

interface SyncStatusCardProps {
  policyId: string | null;
  canEdit: boolean;
  session: { access_token: string } | null;
}

export function SyncStatusCard({ policyId, canEdit, session }: SyncStatusCardProps) {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!session || !policyId) return;

    setLoading(true);
    setError(null);

    try {
      const baseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const res = await fetch(
        `${baseUrl}/functions/v1/matching/admin/policies/${policyId}/sync-status`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to fetch sync status');
      }

      const data = await res.json();
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch sync status');
    } finally {
      setLoading(false);
    }
  }, [session, policyId]);

  const handleSync = async () => {
    if (!session || !policyId || !canEdit) return;

    setSyncing(true);
    setError(null);

    try {
      const baseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const res = await fetch(`${baseUrl}/functions/v1/matching/admin/sync-to-legacy`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ policy_id: policyId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Sync failed');
      }

      // Refresh status after sync
      await fetchStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
            Sync Status
            {status?.in_sync && (
              <Badge variant="default" className="bg-green-500 text-xs">In Sync</Badge>
            )}
            {status && !status.in_sync && status.legacy_available && (
              <Badge variant="destructive" className="text-xs">Out of Sync</Badge>
            )}
            {status && !status.legacy_available && (
              <Badge variant="secondary" className="text-xs">Legacy N/A</Badge>
            )}
          </CardTitle>
          <CardDescription className="text-slate-400 mt-1">
            Comparison between Matching Brain and legacy Control Panel settings
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchStatus}
            disabled={loading || !policyId}
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Check
          </Button>
          {canEdit && status && !status.in_sync && status.legacy_available && (
            <Button
              type="button"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
              Sync to Legacy
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!status && !loading && !error && (
          <p className="text-sm text-slate-500">
            Click "Check" to compare settings between Matching Brain and the legacy Control Panel.
          </p>
        )}

        {status && (
          <div className="space-y-4">
            {status.in_sync ? (
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm">
                  {status.legacy_available
                    ? 'All settings are synchronized'
                    : status.message || 'No legacy settings found'}
                </span>
              </div>
            ) : status.differences && status.differences.length > 0 ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300"
                >
                  {expanded ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                  {status.differences.length} setting{status.differences.length !== 1 ? 's' : ''} differ between systems
                </button>

                {expanded && (
                  <div className="rounded-lg border border-slate-200 overflow-hidden dark:border-slate-700">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-800">
                        <tr>
                          <th className="px-3 py-2 text-left text-slate-400 font-medium">Setting</th>
                          <th className="px-3 py-2 text-left text-slate-400 font-medium">Matching Brain</th>
                          <th className="px-3 py-2 text-left text-slate-400 font-medium">Legacy</th>
                        </tr>
                      </thead>
                      <tbody>
                        {status.differences.map((diff) => (
                          <tr key={diff.field} className="border-t border-slate-200 dark:border-slate-700">
                            <td className="px-3 py-2 text-slate-300 font-mono text-xs">
                              {diff.field}
                            </td>
                            <td className="px-3 py-2 text-green-400 font-mono text-xs">
                              {JSON.stringify(diff.matching_value)}
                            </td>
                            <td className="px-3 py-2 text-red-400 font-mono text-xs">
                              {JSON.stringify(diff.legacy_value)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <p className="text-xs text-slate-500">
                  The Matching Brain values will be used when MATCHING_BRAIN_ENABLED is on.
                  Click "Sync to Legacy" to copy current values to the legacy system for backward compatibility.
                </p>
              </div>
            ) : null}

            {status.matching_updated_at && (
              <div className="flex gap-4 text-xs text-slate-500 pt-2 border-t border-slate-200 dark:border-slate-800">
                <span>Matching Brain: {new Date(status.matching_updated_at).toLocaleString()}</span>
                {status.legacy_updated_at && (
                  <span>Legacy: {new Date(status.legacy_updated_at).toLocaleString()}</span>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
