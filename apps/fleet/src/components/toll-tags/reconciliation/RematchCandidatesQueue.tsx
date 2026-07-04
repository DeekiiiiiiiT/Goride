import React, { useEffect, useState } from 'react';
import { AlertOctagon, ChevronDown, X } from 'lucide-react';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../ui/collapsible';
import { api } from '../../../services/api';
import { toast } from 'sonner@2.0.3';

/**
 * MOI-5: surfaces tolls flagged because a newly-imported trip now looks like
 * a better match than whatever they were originally resolved as (Approved /
 * Rejected / Personal-charged). This is deliberately its own queue — separate
 * from the Needs Review tab — because these tolls are, by definition, ones
 * that already left the normal Unmatched/Needs Review pool.
 *
 * Dismiss only clears the review flag. It never changes the toll's status,
 * resolution, or any financial record — actually correcting a flagged toll
 * (relinking, reversing a charge) is done through the existing Edit
 * Transaction / Claim flows elsewhere in this dashboard, not here.
 */
export function RematchCandidatesQueue({ driverId }: { driverId?: string }) {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .getRematchCandidates(driverId)
      .then((res) => setCandidates(res.candidates || []))
      .catch((err) => console.error('[RematchCandidatesQueue] Failed to load:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverId]);

  if (loading || candidates.length === 0) return null;

  const handleDismiss = async (tollId: string) => {
    setDismissingId(tollId);
    try {
      await api.dismissRematchCandidate(tollId);
      setCandidates((prev) => prev.filter((c) => c.tollId !== tollId));
      toast.success('Dismissed — original resolution left unchanged.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to dismiss');
    } finally {
      setDismissingId(null);
    }
  };

  return (
    <Collapsible defaultOpen={false} className="rounded-lg border border-amber-300 bg-amber-50 overflow-hidden">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-amber-100/60 transition-colors">
        <div className="flex items-center gap-2 text-sm text-amber-800">
          <AlertOctagon className="h-4 w-4 shrink-0" />
          <span>
            <strong>{candidates.length}</strong> already-resolved toll{candidates.length === 1 ? '' : 's'} now{' '}
            {candidates.length === 1 ? 'has' : 'have'} a matching trip — worth a second look.
          </span>
        </div>
        <ChevronDown className="h-4 w-4 text-amber-600 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-0 group-data-[state=closed]:-rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="divide-y divide-amber-200 border-t border-amber-200">
          {candidates.map((c) => (
            <div key={c.tollId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <span className="font-medium text-slate-700">{c.date}</span>
                <span className="text-slate-500">{c.driverName || 'Unknown driver'}</span>
                <span className="text-rose-600 font-medium">-${Math.abs(c.amount).toFixed(2)}</span>
                <Badge variant="outline" className="text-xs">
                  was: {c.resolution || c.status}
                </Badge>
                {c.rematchCandidate?.confidenceScore != null && (
                  <span className="text-xs text-slate-500">
                    new match confidence: {c.rematchCandidate.confidenceScore}
                  </span>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={dismissingId === c.tollId}
                onClick={() => handleDismiss(c.tollId)}
                className="shrink-0 text-slate-500 hover:text-slate-800"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Dismiss
              </Button>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
