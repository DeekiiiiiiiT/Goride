/**
 * Recover plaza attribution on historical tolls.
 *
 * Always previews first: these rows feed settled reconciliations, so the
 * unresolved and ambiguous sets get reviewed before anything is written.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';

interface Summary {
  totalLedger: number;
  knownPlazas: number;
  alreadyAttributed: number;
  willAttribute: number;
  ambiguous: number;
  unresolved: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied?: () => void;
}

export function TollPlazaAttributionDialog({ open, onOpenChange, onApplied }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ambiguous, setAmbiguous] = useState<Array<{ id: string; text: string; candidates: string[] }>>([]);
  const [unresolved, setUnresolved] = useState<Array<{ id: string; text: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  const preview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getTollPlazaBackfillStatus();
      setSummary(res?.summary ?? null);
      setAmbiguous(res?.ambiguousSample ?? []);
      setUnresolved(res?.unresolvedSample ?? []);
    } catch (err) {
      console.error('[PlazaAttribution] preview failed:', err);
      toast.error("Couldn't check plaza attribution. Please try again.");
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }, [onOpenChange]);

  useEffect(() => {
    if (open) preview();
  }, [open, preview]);

  const apply = async () => {
    setApplying(true);
    try {
      const res = await api.runTollPlazaBackfill(false);
      const n = res?.summary?.attributed ?? 0;
      toast.success(
        n > 0
          ? `Attributed ${n} toll${n === 1 ? '' : 's'} to their plaza.`
          : 'Every toll that could be attributed already is.',
      );
      onOpenChange(false);
      onApplied?.();
    } catch (err) {
      console.error('[PlazaAttribution] apply failed:', err);
      toast.error('Failed to attribute tolls. Please try again.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={applying ? () => {} : onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fix plaza attribution</DialogTitle>
          <DialogDescription>
            Older tolls were imported without a plaza link, which is why they group under "Unknown Plaza"
            on charts. This reads the plaza name off each statement line and links it. Nothing is deleted,
            and anything it cannot place with certainty is left alone for you to decide.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <p className="flex items-center gap-2 text-sm text-slate-500 py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking every toll…
          </p>
        )}

        {!loading && summary && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Tolls" value={summary.totalLedger} />
              <Stat label="Already linked" value={summary.alreadyAttributed} tone="slate" />
              <Stat label="Will link" value={summary.willAttribute} tone="emerald" />
              <Stat label="Need a decision" value={summary.ambiguous + summary.unresolved} tone="amber" />
            </div>

            {ambiguous.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 font-medium text-amber-700">
                  <HelpCircle className="h-4 w-4" /> Matches more than one plaza
                </p>
                <p className="text-xs text-slate-500 mb-2">
                  Left unlinked on purpose — picking the wrong plaza would move money to the wrong place.
                </p>
                <ul className="space-y-1">
                  {ambiguous.slice(0, 10).map(row => (
                    <li key={row.id} className="flex items-center justify-between gap-3 text-xs">
                      <span className="truncate text-slate-600">{row.text || row.id}</span>
                      <span className="flex gap-1 shrink-0">
                        {row.candidates.map(c => (
                          <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {unresolved.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                  <AlertTriangle className="h-4 w-4" /> No recognisable plaza on the statement line
                </p>
                <p className="text-xs text-slate-500 mb-2">
                  Usually a plaza that is not in the Toll Database yet. Add it, then run this again.
                </p>
                <ul className="space-y-1">
                  {unresolved.slice(0, 10).map(row => (
                    <li key={row.id} className="truncate text-xs text-slate-600">
                      {row.text || `(no text) ${row.id}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {summary.willAttribute === 0 && summary.ambiguous === 0 && summary.unresolved === 0 && (
              <p className="flex items-center gap-1.5 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Every toll is already attributed to a plaza.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
            Close
          </Button>
          <Button
            onClick={apply}
            disabled={applying || loading || !summary?.willAttribute}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {applying && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Link {summary?.willAttribute ?? 0} toll{summary?.willAttribute === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone = 'slate' }: { label: string; value: number; tone?: 'slate' | 'emerald' | 'amber' }) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'amber'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-slate-900 dark:text-slate-100';
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
      <div className={`text-xl font-semibold ${toneClass}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
