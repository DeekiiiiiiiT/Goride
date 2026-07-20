import React, { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { api } from '../../services/api';
import { toast } from 'sonner';

/**
 * Business Finance fuel sync is always on. This panel is backfill-only for
 * weeks finalized before automatic offsets existed.
 */
export function FuelPnlSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [backfillPreview, setBackfillPreview] = useState<{
    eligibleCount: number;
    totalAmount: number;
    message: string;
  } | null>(null);
  const [backfillBusy, setBackfillBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await api.getFuelPnlOffsetBackfillStatus().catch(() => null);
        if (!cancelled && status) {
          setBackfillPreview({
            eligibleCount: status.eligibleCount,
            totalAmount: status.totalAmount,
            message: status.message,
          });
        }
      } catch (e) {
        console.warn('[FuelPnlSettings] load failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runBackfill = async (dryRun: boolean) => {
    setBackfillBusy(true);
    try {
      const res = await api.runFuelPnlOffsetBackfill({ dryRun });
      if (dryRun) {
        toast.message(
          `Dry run: ${res.eligibleCount} fill(s), $${res.totalAmount.toLocaleString()} would be offset`,
        );
      } else {
        toast.success(`Applied offsets to ${res.appliedCount} fill(s)`);
        const status = await api.getFuelPnlOffsetBackfillStatus().catch(() => null);
        if (status) {
          setBackfillPreview({
            eligibleCount: status.eligibleCount,
            totalAmount: status.totalAmount,
            message: status.message,
          });
        }
      }
    } catch (e: any) {
      toast.error(e?.message || 'Backfill failed');
    } finally {
      setBackfillBusy(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading Business Finance settings…</p>;
  }

  return (
    <div className="rounded-lg border border-slate-200 p-4 space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-slate-900">Business Finance</h4>
        <p className="text-xs text-slate-500 mt-0.5">
          Finalize always syncs driver-share fuel to the Business Finance Fuel line (company share
          stays as fleet cost). Use backfill only for weeks finalized before this was automatic.
        </p>
      </div>

      {backfillPreview && backfillPreview.eligibleCount > 0 ? (
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <p className="text-xs text-slate-600">{backfillPreview.message}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={backfillBusy}
              onClick={() => runBackfill(true)}
            >
              Preview backfill
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={backfillBusy}
              onClick={() => runBackfill(false)}
            >
              Apply backfill
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500 border-t border-slate-100 pt-3">
          No historical fills need a P&amp;L offset — live Finalize is already syncing.
        </p>
      )}
    </div>
  );
}
