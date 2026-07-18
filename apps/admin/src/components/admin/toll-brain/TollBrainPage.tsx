/**
 * Toll Brain Control Panel (Dominion → Toll Management)
 * Detect dials + Match dials — source of truth for rides live + fleet recon.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Alert, AlertDescription, AlertTitle } from '../../ui/alert';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Checkbox } from '../../ui/checkbox';
import {
  Brain,
  MapPin,
  GitCompare,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Radio,
} from 'lucide-react';

type BrainHealth = {
  service: string;
  status: string;
  brain_enabled: boolean;
  stack?: string;
  flags: Record<string, string>;
};

type BrainPolicy = {
  id: string;
  name: string;
  detectionEnabled: boolean;
  detectEnroute: boolean;
  geofenceRadiusM: number;
  roundTripCooldownMs: number;
  approachMinutes: number;
  postTripMinutes: number;
  sameDayPadDays: number;
  varianceThreshold: number;
  cashAmountDeltaMax: number;
  cashReceiptProximityMinutes: number;
  personalUseDetectionEnabled: boolean;
  orphanProximityMinutes: number;
  ambiguityMinScore: number;
  ambiguityMaxGap: number;
  maxSuggestions: number;
  liveLedgerMaterializeEnabled: boolean;
  tripTimeMode: 'trust_utc' | 'legacy_reinterpret';
  isDefault: boolean;
};

export function TollBrainPage() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [health, setHealth] = useState<BrainHealth | null>(null);
  const [policy, setPolicy] = useState<BrainPolicy | null>(null);

  const baseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');

  const headers = useCallback(() => {
    return {
      Authorization: `Bearer ${session?.access_token || ''}`,
      'Content-Type': 'application/json',
    };
  }, [session]);

  const fetchAll = useCallback(async () => {
    if (!session || !baseUrl) {
      setLoading(false);
      setError(!baseUrl ? 'VITE_SUPABASE_URL not configured' : null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [hRes, pRes] = await Promise.all([
        fetch(`${baseUrl}/functions/v1/toll-brain/health`, { headers: headers() }),
        fetch(`${baseUrl}/functions/v1/toll-brain/admin/policies`, { headers: headers() }),
      ]);
      if (hRes.ok) setHealth(await hRes.json());
      if (pRes.ok) {
        const data = await pRes.json();
        const list = (data.policies || []) as BrainPolicy[];
        setPolicy(list.find((p) => p.isDefault) || list[0] || null);
      } else if (pRes.status === 401 || pRes.status === 403) {
        setError('Platform admin access required for Toll Brain policies.');
      } else {
        setError('Could not load Toll Brain policies — deploy toll-brain Edge and apply migration.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Toll Brain');
    } finally {
      setLoading(false);
    }
  }, [session, baseUrl, headers]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const savePolicy = async (label: string) => {
    if (!policy || !session) return;
    setSuccess(null);
    setError(null);
    const res = await fetch(`${baseUrl}/functions/v1/toll-brain/admin/policies`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(policy),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.message || 'Save failed');
      return;
    }
    const data = await res.json();
    setPolicy(data.policy);
    setSuccess(label);
    setTimeout(() => setSuccess(null), 2500);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="h-6 w-6 text-sky-600" />
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Toll Brain</h1>
            <Badge variant="outline" className="border-sky-300 text-sky-800 bg-sky-50">
              Detect + Match
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
            Platform authority for live plaza detection and toll↔trip classification (Uber, InDrive,
            Roam). Money finalization stays in rides / fleet.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void fetchAll()}>
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="border-emerald-200 bg-emerald-50">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Radio className="h-4 w-4" /> Health
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <div>
            Edge:{' '}
            <Badge variant={health?.brain_enabled ? 'default' : 'secondary'}>
              {health?.brain_enabled ? 'Brain on' : 'Brain off'}
            </Badge>{' '}
            <span className="text-xs text-slate-500">{health?.stack}</span>
          </div>
          <p className="text-xs font-mono text-slate-500">
            TOLL_BRAIN_ENABLED={health?.flags?.TOLL_BRAIN_ENABLED ?? '?'} · RIDES_USE_TOLL_BRAIN=
            {health?.flags?.RIDES_USE_TOLL_BRAIN ?? '?'} · FLEET_USE_TOLL_BRAIN=
            {health?.flags?.FLEET_USE_TOLL_BRAIN ?? '?'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Detect (live + quote)
          </CardTitle>
          <CardDescription>
            GPS / route vs plaza catalog. Rides honor these when RIDES_USE_TOLL_BRAIN=1.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {policy ? (
            <>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="det-enabled"
                    checked={policy.detectionEnabled}
                    onCheckedChange={(v) => setPolicy({ ...policy, detectionEnabled: !!v })}
                  />
                  <Label htmlFor="det-enabled">Detection enabled</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="det-enroute"
                    checked={policy.detectEnroute}
                    onCheckedChange={(v) => setPolicy({ ...policy, detectEnroute: !!v })}
                  />
                  <Label htmlFor="det-enroute">Detect while en route to pickup</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="live-ledger"
                    checked={policy.liveLedgerMaterializeEnabled}
                    onCheckedChange={(v) =>
                      setPolicy({ ...policy, liveLedgerMaterializeEnabled: !!v })
                    }
                  />
                  <Label htmlFor="live-ledger">Live ledger materialize (fleet)</Label>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Geofence radius (m)</Label>
                  <Input
                    type="number"
                    value={policy.geofenceRadiusM}
                    onChange={(e) =>
                      setPolicy({ ...policy, geofenceRadiusM: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Round-trip cooldown (ms)</Label>
                  <Input
                    type="number"
                    value={policy.roundTripCooldownMs}
                    onChange={(e) =>
                      setPolicy({ ...policy, roundTripCooldownMs: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <Button onClick={() => void savePolicy('Detect rules saved')}>Save detect rules</Button>
            </>
          ) : (
            <p className="text-sm text-slate-500">No policy loaded.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <GitCompare className="h-4 w-4" /> Match (recon)
          </CardTitle>
          <CardDescription>
            Toll expense ↔ trip credit windows. Fleet recon mirrors these dials.
            Fleet timezone stays in Platform Settings — this dial only controls
            whether trip clocks are trusted as real UTC.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {policy ? (
            <>
              <div className="space-y-2 rounded-md border border-slate-200 p-3">
                <Label htmlFor="trip-time-mode">Trip time mode (match clock)</Label>
                <select
                  id="trip-time-mode"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={policy.tripTimeMode || 'trust_utc'}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      tripTimeMode: e.target.value as 'trust_utc' | 'legacy_reinterpret',
                    })
                  }
                >
                  <option value="trust_utc">Trust stored UTC (Uber / InDrive — recommended)</option>
                  <option value="legacy_reinterpret">
                    Legacy reinterpret (old CSV imports that baked local time into Z)
                  </option>
                </select>
                <p className="text-xs text-slate-500">
                  Wrong overnight matches came from auto-reinterpreting correct Uber times. Keep
                  Trust stored UTC unless you still have pre-fleetTz CSV trip rows.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="personal-use"
                  checked={policy.personalUseDetectionEnabled}
                  onCheckedChange={(v) =>
                    setPolicy({ ...policy, personalUseDetectionEnabled: !!v })
                  }
                />
                <Label htmlFor="personal-use">Personal-use / orphan detection</Label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label>Approach window (min)</Label>
                  <Input
                    type="number"
                    value={policy.approachMinutes}
                    onChange={(e) =>
                      setPolicy({ ...policy, approachMinutes: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Post-trip buffer (min)</Label>
                  <Input
                    type="number"
                    value={policy.postTripMinutes}
                    onChange={(e) =>
                      setPolicy({ ...policy, postTripMinutes: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Orphan proximity (min)</Label>
                  <Input
                    type="number"
                    value={policy.orphanProximityMinutes}
                    onChange={(e) =>
                      setPolicy({ ...policy, orphanProximityMinutes: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Cash amount delta max ($)</Label>
                  <Input
                    type="number"
                    value={policy.cashAmountDeltaMax}
                    onChange={(e) =>
                      setPolicy({ ...policy, cashAmountDeltaMax: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Cash proximity (min)</Label>
                  <Input
                    type="number"
                    value={policy.cashReceiptProximityMinutes}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        cashReceiptProximityMinutes: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Variance threshold ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={policy.varianceThreshold}
                    onChange={(e) =>
                      setPolicy({ ...policy, varianceThreshold: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Ambiguity min score</Label>
                  <Input
                    type="number"
                    value={policy.ambiguityMinScore}
                    onChange={(e) =>
                      setPolicy({ ...policy, ambiguityMinScore: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Ambiguity max gap</Label>
                  <Input
                    type="number"
                    value={policy.ambiguityMaxGap}
                    onChange={(e) =>
                      setPolicy({ ...policy, ambiguityMaxGap: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Max suggestions</Label>
                  <Input
                    type="number"
                    value={policy.maxSuggestions}
                    onChange={(e) =>
                      setPolicy({ ...policy, maxSuggestions: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <Button onClick={() => void savePolicy('Match rules saved')}>Save match rules</Button>
            </>
          ) : (
            <p className="text-sm text-slate-500">No policy loaded.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
