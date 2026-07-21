/**
 * Fuel Brain Control Panel (Dominion → Fuel Management)
 * Rule cards: Ride Share / Company Ops / Deadhead (editable) / Personal residual / Misc.
 */

import { useCallback, useEffect, useState } from 'react';
import { projectId } from '../../../utils/supabase/info';
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
  Fuel,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Car,
  Wrench,
  Route,
  User,
  Droplets,
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
  deadheadGapMaxMinutes: number;
  personalGapMinMinutes: number;
  peakHoursStart: number;
  peakHoursEnd: number;
  industryFallbackPct: number;
  crossValidationPp: number;
  preferOdoGaps: boolean;
  ambiguousDeadheadSplitPct: number;
  isDefault: boolean;
};

export function FuelBrainPage() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [health, setHealth] = useState<BrainHealth | null>(null);
  const [policy, setPolicy] = useState<BrainPolicy | null>(null);

  // Shared projectId falls back to the default project when VITE_* env is unset (local dev)
  const baseUrl = `https://${projectId}.supabase.co`;

  const headers = useCallback(() => {
    return {
      Authorization: `Bearer ${session?.access_token || ''}`,
      'Content-Type': 'application/json',
    };
  }, [session]);

  const fetchAll = useCallback(async () => {
    if (!session) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [hRes, pRes] = await Promise.all([
        fetch(`${baseUrl}/functions/v1/fuel-brain/health`, { headers: headers() }),
        fetch(`${baseUrl}/functions/v1/fuel-brain/admin/policies`, { headers: headers() }),
      ]);
      if (hRes.ok) setHealth(await hRes.json());
      if (pRes.ok) {
        const data = await pRes.json();
        const list = (data.policies || []) as BrainPolicy[];
        setPolicy(list.find((p) => p.isDefault) || list[0] || null);
      } else if (pRes.status === 401 || pRes.status === 403) {
        setError('Platform admin access required for Fuel Brain policies.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Fuel Brain');
    } finally {
      setLoading(false);
    }
  }, [session, baseUrl, headers]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const savePolicy = async () => {
    if (!policy || !session) return;
    setSuccess(null);
    setError(null);
    const res = await fetch(`${baseUrl}/functions/v1/fuel-brain/admin/policies`, {
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
    setSuccess('Deadhead rules saved');
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
            <Brain className="h-6 w-6 text-amber-600" />
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Fuel Brain</h1>
            <Badge variant="outline" className="border-amber-300 text-amber-800 bg-amber-50">
              Residual Personal
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
            Automated km stack: Ride Share → Company Ops → Deadhead → Personal (leftover). No driver
            toggles. Misc is cash leakage only.
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
            <Fuel className="h-4 w-4" /> Health
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <div>
            Edge:{' '}
            <Badge variant={health?.brain_enabled ? 'default' : 'secondary'}>
              {health?.brain_enabled ? 'Classify on' : 'Classify off'}
            </Badge>{' '}
            <span className="text-xs text-slate-500">{health?.stack}</span>
          </div>
          <p className="text-xs font-mono text-slate-500">
            FUEL_BRAIN_ENABLED={health?.flags?.FUEL_BRAIN_ENABLED ?? '?'} · FLEET_USE_FUEL_BRAIN=
            {health?.flags?.FLEET_USE_FUEL_BRAIN ?? '?'}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Car className="h-4 w-4" /> Ride Share
            </CardTitle>
            <CardDescription>Locked rule</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            Full trip stack from platform imports (On Trip + Enroute + Open + Unavailable). Not
            editable here.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4" /> Company Ops
            </CardTitle>
            <CardDescription>Locked rule</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            Admin mileage adjustments typed Company Misc / Maintenance. Not editable here.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" /> Personal (residual)
            </CardTitle>
            <CardDescription>Locked rule</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            Everything left after Ride Share, Company Ops, and capped Deadhead. Includes unlabeled
            miles (missed imports, drift). No driver input.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Droplets className="h-4 w-4" /> Misc (Leakage)
            </CardTitle>
            <CardDescription>Locked rule</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            Spend − (all four category $). Efficiency / theft / pump signal — not a km type.
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Route className="h-4 w-4" /> Deadhead rules
          </CardTitle>
          <CardDescription>
            Odo gaps between trips first; time bands only when odo missing. Always capped to leftover
            after Ride Share + Company Ops.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {policy ? (
            <>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="prefer-odo"
                  checked={policy.preferOdoGaps}
                  onCheckedChange={(v) => setPolicy({ ...policy, preferOdoGaps: !!v })}
                />
                <Label htmlFor="prefer-odo">Prefer odometer gaps between trips</Label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Deadhead gap max (min)</Label>
                  <Input
                    type="number"
                    value={policy.deadheadGapMaxMinutes}
                    onChange={(e) =>
                      setPolicy({ ...policy, deadheadGapMaxMinutes: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Personal gap min (min)</Label>
                  <Input
                    type="number"
                    value={policy.personalGapMinMinutes}
                    onChange={(e) =>
                      setPolicy({ ...policy, personalGapMinMinutes: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Peak hours start</Label>
                  <Input
                    type="number"
                    value={policy.peakHoursStart}
                    onChange={(e) =>
                      setPolicy({ ...policy, peakHoursStart: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Peak hours end</Label>
                  <Input
                    type="number"
                    value={policy.peakHoursEnd}
                    onChange={(e) =>
                      setPolicy({ ...policy, peakHoursEnd: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Industry fallback %</Label>
                  <Input
                    type="number"
                    value={policy.industryFallbackPct}
                    onChange={(e) =>
                      setPolicy({ ...policy, industryFallbackPct: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Cross-validation (pp)</Label>
                  <Input
                    type="number"
                    value={policy.crossValidationPp}
                    onChange={(e) =>
                      setPolicy({ ...policy, crossValidationPp: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Ambiguous → deadhead %</Label>
                  <Input
                    type="number"
                    value={policy.ambiguousDeadheadSplitPct}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        ambiguousDeadheadSplitPct: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <Button onClick={() => void savePolicy()}>Save deadhead rules</Button>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              No policy loaded — apply migration and redeploy fuel-brain Edge.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
