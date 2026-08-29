import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../../ui/alert';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { gctAdminService, type GctHealth } from '../../../services/gctAdminService';

export function GctEnginePage() {
  const [health, setHealth] = useState<GctHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHealth(await gctAdminService.health());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load GCT health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const fromEngine = Boolean(health?.fromDb);
  const gctOn =
    health?.resolverFlags &&
    typeof health.resolverFlags === 'object' &&
    (health.resolverFlags as { gct_enabled?: boolean }).gct_enabled !== false;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">GCT engine</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live Jamaica GCT rates, registrations, and ledger health. Accounting is the only charge
            source.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not load</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {health && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Charging rate (live)</CardDescription>
                <CardTitle className="text-3xl">{health.effectiveRatePercent}%</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {health.gctEnabled ? 'GCT enabled' : 'GCT disabled'} ·{' '}
                {fromEngine ? 'Accounting engine' : 'Fallback seed (DB unavailable)'}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Standard rate (engine)</CardDescription>
                <CardTitle className="text-3xl">
                  {health.dbStandardRatePercent != null ? `${health.dbStandardRatePercent}%` : '—'}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Edit under Rates & classes
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Open periods</CardDescription>
                <CardTitle className="text-3xl">{health.openPeriodCount}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Needs review: {health.needsReviewEntities.length}
                {(health.orphanOutputCount || health.orphanInputCount) ? (
                  <>
                    {' '}
                    · Orphans: {(health.orphanOutputCount ?? 0) + (health.orphanInputCount ?? 0)}
                  </>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Engine status</CardTitle>
              <CardDescription>
                Live quotes use Accounting → Rates. Global Settings tax has been removed.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p>
                Resolver flags:{' '}
                <code className="text-xs">{JSON.stringify(health.resolverFlags ?? {})}</code>
              </p>
              <p>
                Engine authoritative:{' '}
                {fromEngine && gctOn ? 'yes' : fromEngine ? 'yes (GCT kill-switch off)' : 'degraded'}
              </p>
            </CardContent>
          </Card>

          {fromEngine ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Engine live</AlertTitle>
              <AlertDescription>
                Customer charges use the Accounting standard rate. Manage rates under Rates &
                classes; remittance under Remittance & filing.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Engine rate unavailable</AlertTitle>
              <AlertDescription>
                No standard rate row resolved — charging fell back to the seeded statutory rate.
                Check Rates & classes.
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Entities needing review</CardTitle>
              <CardDescription>
                Registered without TRN or placeholder Roam entity — clear before filing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {health.needsReviewEntities.length === 0 ? (
                <p className="text-sm text-muted-foreground">None flagged.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {health.needsReviewEntities.map((e) => (
                    <li key={String(e.id)} className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{String(e.entity_type)}</Badge>
                      <span className="font-mono text-xs">{String(e.entity_id)}</span>
                      <span className="text-muted-foreground">{String(e.notes || '')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
