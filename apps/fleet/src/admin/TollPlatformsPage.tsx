import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { fetchTollPlatforms, saveTollPlatforms, type TollPlatformRule } from './fleetAdminService';

/** Same wording as the old Fleet Policy table, so staff see what fleets used to see. */
export const TOLL_PAYBACK_MODES: Array<{ value: string; label: string }> = [
  { value: 'per_trip', label: 'On each trip' },
  { value: 'adjustments', label: 'In weekly adjustments' },
  { value: 'rider_pays_driver', label: 'The rider pays the driver' },
  { value: 'native', label: 'Roam charges the rider' },
  { value: 'none', label: 'Not paid back' },
];

const NAMES: Record<string, string> = { uber: 'Uber', indrive: 'InDrive', roam: 'Roam' };
const platformName = (p: string) => NAMES[p] ?? p.charAt(0).toUpperCase() + p.slice(1);

type Row = Pick<TollPlatformRule, 'platform' | 'paysTollsBack' | 'paybackMode' | 'takesDisputes' | 'disputeWindowDays'>;
const pick = (r: TollPlatformRule): Row => ({
  platform: r.platform,
  paysTollsBack: r.paysTollsBack,
  paybackMode: r.paybackMode,
  takesDisputes: r.takesDisputes,
  disputeWindowDays: r.disputeWindowDays ?? null,
});

/** Roam Fleet Admin → Toll platforms. One list for every fleet; saving updates every fleet. */
export function TollPlatformsPage({ accessToken }: { accessToken: string }) {
  const [saved, setSaved] = useState<Row[] | null>(null);
  const [draft, setDraft] = useState<Row[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchTollPlatforms(accessToken);
      const rows = res.platforms.map(pick);
      setSaved(rows);
      setDraft(rows);
      setCanEdit(res.canEdit);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the toll platforms.');
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const changed = useMemo(() => {
    if (!saved || !draft) return [] as Row[];
    return draft.filter((r, i) => JSON.stringify(r) !== JSON.stringify(saved[i]));
  }, [saved, draft]);

  const badDays = (draft ?? []).some(
    (r) => r.takesDisputes && (r.disputeWindowDays == null || r.disputeWindowDays < 1 || r.disputeWindowDays > 60),
  );

  const setRow = (i: number, patch: Partial<Row>) =>
    setDraft((d) => (d ? d.map((r, j) => (j === i ? { ...r, ...patch } : r)) : d));

  const save = async () => {
    if (changed.length === 0 || badDays) return;
    setBusy(true);
    setError(null);
    try {
      const res = await saveTollPlatforms(accessToken, changed);
      const rows = res.platforms.map(pick);
      setSaved(rows);
      setDraft(rows);
      toast.success(
        res.companiesUpdated != null
          ? `Saved for every fleet (${res.companiesUpdated} ${res.companiesUpdated === 1 ? 'fleet' : 'fleets'})`
          : 'Saved for every fleet',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the toll platforms.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6" data-testid="toll-platforms-page">
      <div>
        <h2 className="text-xl font-semibold">Toll platforms</h2>
        <p className="mt-1 text-sm text-slate-400">
          How each ride app pays tolls back. This is the same for every fleet; saving changes it for all of them.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-800/80 bg-rose-950/40 p-4 text-sm text-rose-100">{error}</div>
      ) : null}

      {!draft ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-900 text-left text-xs text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">Platform</th>
                <th className="px-3 py-2 font-medium">Pays tolls back</th>
                <th className="px-3 py-2 font-medium">How</th>
                <th className="px-3 py-2 font-medium">Takes disputes</th>
                <th className="px-3 py-2 font-medium">Days to dispute</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {draft.map((p, i) => (
                <tr key={p.platform} data-testid={`toll-platforms-row-${p.platform}`}>
                  <td className="px-4 py-3 font-semibold">{platformName(p.platform)}</td>
                  <td className="px-3 py-3">
                    <Switch
                      checked={p.paysTollsBack}
                      disabled={!canEdit}
                      onCheckedChange={(v) => setRow(i, { paysTollsBack: v })}
                      aria-label={`${platformName(p.platform)} pays tolls back`}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <select
                      className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"
                      value={p.paybackMode}
                      disabled={!canEdit}
                      onChange={(e) => setRow(i, { paybackMode: e.target.value })}
                      aria-label={`How ${platformName(p.platform)} pays tolls back`}
                    >
                      {TOLL_PAYBACK_MODES.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <Switch
                      checked={p.takesDisputes}
                      disabled={!canEdit}
                      onCheckedChange={(v) =>
                        setRow(i, { takesDisputes: v, disputeWindowDays: v ? p.disputeWindowDays ?? 9 : p.disputeWindowDays })
                      }
                      aria-label={`${platformName(p.platform)} takes disputes`}
                    />
                  </td>
                  <td className="px-3 py-3">
                    {p.takesDisputes ? (
                      <span className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={60}
                          disabled={!canEdit}
                          className="h-9 w-20 rounded-lg border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100"
                          value={p.disputeWindowDays ?? ''}
                          onChange={(e) => setRow(i, { disputeWindowDays: e.target.value === '' ? null : Number(e.target.value) })}
                          aria-label={`${platformName(p.platform)} days to dispute`}
                        />
                        <span className="text-slate-400">days</span>
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {draft && canEdit ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-slate-400" data-testid="toll-platforms-change-count">
            {badDays
              ? 'Days to dispute must be 1 to 60.'
              : changed.length === 0
                ? 'No changes'
                : `${changed.length} ${changed.length === 1 ? 'platform' : 'platforms'} changed`}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" disabled={changed.length === 0 || busy} onClick={() => setDraft(saved)}>
              Discard
            </Button>
            <Button disabled={changed.length === 0 || badDays || busy} onClick={() => void save()} data-testid="toll-platforms-save">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save for every fleet
            </Button>
          </div>
        </div>
      ) : draft ? (
        <p className="text-sm text-slate-400">Only the fleet owner can change these.</p>
      ) : null}
    </div>
  );
}
