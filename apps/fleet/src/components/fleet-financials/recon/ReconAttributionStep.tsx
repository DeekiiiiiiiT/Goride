import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ReconRunPayload } from '../../../services/reconApi';
import { postReconAttribution } from '../../../services/reconApi';
import { Button } from '../../ui/button';

export function ReconAttributionStep({
  run,
  onRefresh,
}: {
  run: ReconRunPayload;
  onRefresh: () => void;
}) {
  const unattributed = run.attribution?.rowCount ?? 0;
  const amount = run.attribution?.amountMajor ?? 0;
  const sampleRows = run.attribution?.rows ?? [];
  const [busy, setBusy] = useState<'rideshare' | 'rush_delivery' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const assignAll = async (serviceLine: 'rideshare' | 'rush_delivery') => {
    if (!sampleRows.length) {
      setError('No row ids loaded — refresh the run or assign from toll/fuel screens.');
      return;
    }
    setBusy(serviceLine);
    setError(null);
    try {
      await postReconAttribution(
        run.run.serviceLine as 'rideshare' | 'rush_delivery',
        run.run.weekKey,
        {
          rows: sampleRows.map((r) => ({
            id: r.id,
            entity: r.entity,
            serviceLine,
          })),
          expectedVersion: run.run.version,
        },
      );
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save attribution');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Shared fuel and toll rows need a service line before both weeks can close.
      </p>
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 tabular-nums">
        <p className="text-2xl font-bold text-slate-900">{unattributed}</p>
        <p className="text-sm text-slate-600">
          unattributed row{unattributed === 1 ? '' : 's'}
          {amount > 0 ? ` · $${amount.toFixed(2)} total` : ''}
        </p>
      </div>
      {unattributed === 0 ? (
        <p className="text-sm text-emerald-800">Nothing left to assign for this week.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void assignAll('rideshare')}
          >
            {busy === 'rideshare' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Rideshare
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void assignAll('rush_delivery')}
          >
            {busy === 'rush_delivery' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Delivery
          </Button>
        </div>
      )}
      {sampleRows.length > 0 && sampleRows.length < unattributed ? (
        <p className="text-xs text-amber-800">
          Showing {sampleRows.length} of {unattributed} rows — assign these first, then refresh.
        </p>
      ) : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
