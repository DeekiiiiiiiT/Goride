import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { gctAdminService } from '../../../services/gctAdminService';

export function GctEntitiesPage() {
  const [entities, setEntities] = useState<Array<Record<string, unknown>>>([]);
  const [watchlist, setWatchlist] = useState<Array<Record<string, unknown>>>([]);
  const [threshold, setThreshold] = useState(15_000_000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trnEdits, setTrnEdits] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ent, watch] = await Promise.all([
        gctAdminService.entities(),
        gctAdminService.watchlist(),
      ]);
      setEntities(ent.entities);
      setWatchlist(watch.watchlist);
      setThreshold(watch.thresholdJmd);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveRegistration(id: string, registered: boolean) {
    const trn = trnEdits[id] ?? '';
    try {
      await gctAdminService.patchEntity(id, {
        trn,
        registered,
        needs_review: false,
        registered_from: registered ? new Date().toISOString().slice(0, 10) : null,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">GCT registrations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          TRN required to mark registered. Threshold watchlist is advisory only — never auto-registers.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Tabs defaultValue="entities">
        <TabsList>
          <TabsTrigger value="entities">Entities</TabsTrigger>
          <TabsTrigger value="watchlist">Threshold watchlist</TabsTrigger>
        </TabsList>
        <TabsContent value="entities" className="mt-4">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-3">Type</th>
                  <th className="p-3">Entity</th>
                  <th className="p-3">TRN</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center">
                      <Loader2 className="h-4 w-4 animate-spin inline" />
                    </td>
                  </tr>
                ) : (
                  entities.map((e) => {
                    const id = String(e.id);
                    return (
                      <tr key={id} className="border-t align-top">
                        <td className="p-3">
                          <Badge variant="outline">{String(e.entity_type)}</Badge>
                          {e.needs_review ? (
                            <Badge className="ml-2" variant="destructive">
                              review
                            </Badge>
                          ) : null}
                        </td>
                        <td className="p-3 font-mono text-xs">{String(e.entity_id)}</td>
                        <td className="p-3">
                          <Input
                            className="h-8 max-w-[160px]"
                            defaultValue={String(e.trn || '')}
                            onChange={(ev) =>
                              setTrnEdits((prev) => ({ ...prev, [id]: ev.target.value }))
                            }
                          />
                        </td>
                        <td className="p-3">{e.registered ? 'Registered' : 'Not registered'}</td>
                        <td className="p-3 space-x-2">
                          <Button size="sm" variant="outline" onClick={() => void saveRegistration(id, true)}>
                            Mark registered
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => void saveRegistration(id, false)}>
                            Clear
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
        <TabsContent value="watchlist" className="mt-4">
          <p className="text-sm text-muted-foreground mb-3">
            Rolling 12-month supplies vs J${threshold.toLocaleString()} (s.27). Advisory only.
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-3">Merchant</th>
                  <th className="p-3">Rolling supplies</th>
                  <th className="p-3">Advisory</th>
                </tr>
              </thead>
              <tbody>
                {watchlist.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-6 text-muted-foreground text-center">
                      No merchants approaching or over threshold.
                    </td>
                  </tr>
                ) : (
                  watchlist.map((w) => (
                    <tr key={String(w.merchantId)} className="border-t">
                      <td className="p-3 font-mono text-xs">{String(w.merchantId)}</td>
                      <td className="p-3">
                        J${Number(w.rollingSuppliesJmd).toLocaleString()}
                      </td>
                      <td className="p-3">
                        <Badge variant={w.advisory === 'over_threshold' ? 'destructive' : 'secondary'}>
                          {String(w.advisory)}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
