/**
 * Fuel Brain Control Panel (Dominion → Fuel Management)
 * Policies, evidence health, unknown queue, flag status.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Alert, AlertDescription, AlertTitle } from '../../ui/alert';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import {
  Brain,
  Fuel,
  ShieldAlert,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Layers,
} from 'lucide-react';

type BrainHealth = {
  service: string;
  status: string;
  brain_enabled: boolean;
  flags: Record<string, string>;
};

type BrainPolicy = {
  id: string;
  name: string;
  deadheadGapMaxMinutes: number;
  personalGapMinMinutes: number;
  peakHoursStart: number;
  peakHoursEnd: number;
  unknownFinalizeThresholdKm: number;
  unknownFinalizeThresholdPct: number;
  isDefault: boolean;
};

type UnknownReview = {
  id: string;
  driverId: string;
  vehicleId: string;
  weekStart: string;
  weekEnd: string;
  unknownKm: number;
  status: string;
};

type EvidenceHealth = {
  weekStart: string;
  weekEnd: string;
  sessionCount: number;
  declaredPersonalKm: number;
  openUnknownReviews: number;
};

type ProductProfile = {
  id: string;
  productKey: string;
  organizationId?: string | null;
  fuelBrainConsumerAllowed: boolean;
  notes?: string | null;
};

function mondayYmd(d = new Date()): string {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x.toISOString().slice(0, 10);
}

function sundayYmd(monday: string): string {
  const x = new Date(`${monday}T12:00:00`);
  x.setDate(x.getDate() + 6);
  return x.toISOString().slice(0, 10);
}

export function FuelBrainPage() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [health, setHealth] = useState<BrainHealth | null>(null);
  const [policy, setPolicy] = useState<BrainPolicy | null>(null);
  const [reviews, setReviews] = useState<UnknownReview[]>([]);
  const [evidence, setEvidence] = useState<EvidenceHealth | null>(null);
  const [profiles, setProfiles] = useState<ProductProfile[]>([]);
  const [weekStart, setWeekStart] = useState(mondayYmd());
  const [orgIdDraft, setOrgIdDraft] = useState('');

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
      const weekEnd = sundayYmd(weekStart);
      const [hRes, pRes, rRes, eRes, prRes] = await Promise.all([
        fetch(`${baseUrl}/functions/v1/fuel-brain/health`, { headers: headers() }),
        fetch(`${baseUrl}/functions/v1/fuel-brain/admin/policies`, { headers: headers() }),
        fetch(`${baseUrl}/functions/v1/fuel-brain/admin/unknown-reviews?status=open`, {
          headers: headers(),
        }),
        fetch(
          `${baseUrl}/functions/v1/fuel-brain/admin/evidence-health?weekStart=${weekStart}&weekEnd=${weekEnd}`,
          { headers: headers() },
        ),
        fetch(`${baseUrl}/functions/v1/fuel-brain/admin/product-profiles`, { headers: headers() }),
      ]);

      if (hRes.ok) setHealth(await hRes.json());
      if (pRes.ok) {
        const data = await pRes.json();
        const list = (data.policies || []) as BrainPolicy[];
        setPolicy(list.find((p) => p.isDefault) || list[0] || null);
      } else if (pRes.status === 401 || pRes.status === 403) {
        setError('Platform admin access required for Fuel Brain policies.');
      }
      if (rRes.ok) {
        const data = await rRes.json();
        setReviews(data.reviews || []);
      }
      if (eRes.ok) setEvidence(await eRes.json());
      if (prRes.ok) {
        const data = await prRes.json();
        setProfiles(data.profiles || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Fuel Brain');
    } finally {
      setLoading(false);
    }
  }, [session, baseUrl, headers, weekStart]);

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
    setSuccess('Policy saved');
    setTimeout(() => setSuccess(null), 2500);
  };

  const resolveReview = async (id: string, label: string) => {
    const res = await fetch(`${baseUrl}/functions/v1/fuel-brain/admin/unknown-reviews/${id}/resolve`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ resolutionLabel: label }),
    });
    if (res.ok) void fetchAll();
  };

  const addOrgProfile = async () => {
    if (!orgIdDraft.trim()) return;
    const res = await fetch(`${baseUrl}/functions/v1/fuel-brain/admin/product-profiles`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        productKey: 'fleet',
        organizationId: orgIdDraft.trim(),
        fuelBrainConsumerAllowed: true,
      }),
    });
    if (res.ok) {
      setOrgIdDraft('');
      void fetchAll();
    }
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
              Control plane
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
            Purpose rules for fuel km. Money (receipts + policy %) stays in Fleet. Enable flags in
            order: sessions → brain Edge → Fleet consumer.
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

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Fuel className="h-4 w-4" /> Brain Edge
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>
              Status:{' '}
              <Badge variant={health?.brain_enabled ? 'default' : 'secondary'}>
                {health?.brain_enabled ? 'Enabled' : 'Off'}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 font-mono">
              FUEL_BRAIN_ENABLED={health?.flags?.FUEL_BRAIN_ENABLED ?? '?'}
            </p>
            <p className="text-xs text-slate-500 font-mono">
              FLEET_USE_FUEL_BRAIN={health?.flags?.FLEET_USE_FUEL_BRAIN ?? '?'}
            </p>
            <p className="text-xs text-slate-500 font-mono">
              SESSIONS={health?.flags?.FUEL_PERSONAL_SESSIONS_ENABLED ?? '?'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Evidence (week)</CardTitle>
            <CardDescription>
              <Input
                type="date"
                className="h-8 mt-1 max-w-[180px]"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
              />
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p>Sessions: {evidence?.sessionCount ?? '—'}</p>
            <p>Declared personal km: {evidence?.declaredPersonalKm ?? '—'}</p>
            <p>Open Unknown reviews: {evidence?.openUnknownReviews ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4" /> Consumer orgs
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p className="text-xs text-slate-500">
              Orgs allowed to turn on FLEET_USE_FUEL_BRAIN (profile stub).
            </p>
            <ul className="text-xs space-y-1 max-h-20 overflow-y-auto">
              {profiles.length === 0 && <li className="text-slate-400">None yet</li>}
              {profiles.map((p) => (
                <li key={p.id}>
                  {p.organizationId || '(global)'} —{' '}
                  {p.fuelBrainConsumerAllowed ? 'allowed' : 'blocked'}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input
                className="h-8"
                placeholder="Organization ID"
                value={orgIdDraft}
                onChange={(e) => setOrgIdDraft(e.target.value)}
              />
              <Button size="sm" variant="outline" onClick={() => void addOrgProfile()}>
                Allow
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Alert className="border-amber-200 bg-amber-50 text-amber-950">
        <ShieldAlert className="h-4 w-4 text-amber-700" />
        <AlertTitle>Safe cutover</AlertTitle>
        <AlertDescription>
          Legacy residual math stays default until FLEET_USE_FUEL_BRAIN=1. Unknown never becomes
          Personal automatically. See docs/platform/FUEL_BRAIN_CUTOVER.md.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="policies">
        <TabsList>
          <TabsTrigger value="policies">Deadhead / Unknown policy</TabsTrigger>
          <TabsTrigger value="queue">Unknown queue ({reviews.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="policies" className="space-y-4">
          {policy ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{policy.name}</CardTitle>
                <CardDescription>Gap rules + finalize thresholds</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
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
                  <Label>Unknown finalize threshold (km)</Label>
                  <Input
                    type="number"
                    value={policy.unknownFinalizeThresholdKm}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        unknownFinalizeThresholdKm: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Unknown finalize threshold (%)</Label>
                  <Input
                    type="number"
                    value={policy.unknownFinalizeThresholdPct}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        unknownFinalizeThresholdPct: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button onClick={() => void savePolicy()}>Save policy</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-slate-500">
              No policy loaded — deploy fuel-brain Edge and apply migration.
            </p>
          )}
        </TabsContent>
        <TabsContent value="queue">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Open Unknown reviews</CardTitle>
              <CardDescription>Label unexplained km — never auto-Personal</CardDescription>
            </CardHeader>
            <CardContent>
              {reviews.length === 0 ? (
                <p className="text-sm text-slate-500">Queue empty.</p>
              ) : (
                <ul className="space-y-3">
                  {reviews.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 text-sm"
                    >
                      <div>
                        <div className="font-medium">
                          {r.unknownKm.toFixed(1)} km · {r.weekStart} → {r.weekEnd}
                        </div>
                        <div className="text-xs text-slate-500">
                          Driver {r.driverId} · Vehicle {r.vehicleId}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {(['personal', 'deadhead', 'company', 'dismissed'] as const).map((label) => (
                          <Button
                            key={label}
                            size="sm"
                            variant="outline"
                            className="text-xs capitalize"
                            onClick={() => void resolveReview(r.id, label)}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
