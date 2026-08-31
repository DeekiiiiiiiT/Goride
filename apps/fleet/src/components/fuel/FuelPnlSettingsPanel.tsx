import React, { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { api } from '../../services/api';
import {
  loadFuelReconciliationSettings,
  setCachedFuelReconSettings,
} from '../../services/fuelReconSettings';
import { toast } from 'sonner';

/**
 * Fuel recon settings: org default JMD/L, Fuel Brain kill switch, P&L backfill.
 */
export function FuelPnlSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [defaultPrice, setDefaultPrice] = useState('');
  const [fuelBrainEnabled, setFuelBrainEnabled] = useState(true);
  const [fuelBrainShadowCompare, setFuelBrainShadowCompare] = useState(false);
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
        const [settings, status] = await Promise.all([
          loadFuelReconciliationSettings(true),
          api.getFuelPnlOffsetBackfillStatus().catch(() => null),
        ]);
        if (cancelled) return;
        setFuelBrainEnabled(settings.fuelBrainEnabled);
        setFuelBrainShadowCompare(settings.fuelBrainShadowCompare);
        setDefaultPrice(
          settings.defaultPricePerLiterJmd != null
            ? String(settings.defaultPricePerLiterJmd)
            : '',
        );
        if (status) {
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

  const saveSettings = async () => {
    setSaving(true);
    try {
      const trimmed = defaultPrice.trim();
      const price =
        trimmed === ''
          ? null
          : (() => {
              const n = Number(trimmed);
              return Number.isFinite(n) && n > 0 ? n : null;
            })();
      const res = await api.updateFuelReconciliationSettings({
        fuelBrainEnabled,
        fuelBrainShadowCompare,
        defaultPricePerLiterJmd: price,
      });
      setCachedFuelReconSettings({
        fuelBrainEnabled: res.fuelBrainEnabled,
        fuelBrainShadowCompare: res.fuelBrainShadowCompare,
        defaultPricePerLiterJmd: res.defaultPricePerLiterJmd,
      });
      setDefaultPrice(
        res.defaultPricePerLiterJmd != null ? String(res.defaultPricePerLiterJmd) : '',
      );
      toast.success('Fuel reconciliation settings saved');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

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
        <h4 className="text-sm font-semibold text-slate-900">Reconciliation pricing &amp; Fuel Brain</h4>
        <p className="text-xs text-slate-500 mt-0.5">
          Org default JMD/L prices cash-only weeks when gas-card cost is missing. Fuel Brain toggles
          apply immediately without a rebuild.
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="default-price-jmd" className="text-xs">
            Default price per litre (JMD)
          </Label>
          <Input
            id="default-price-jmd"
            type="number"
            min={0}
            step="0.01"
            placeholder="e.g. 200"
            value={defaultPrice}
            onChange={(e) => setDefaultPrice(e.target.value)}
            className="max-w-[200px]"
          />
          <p className="text-[11px] text-slate-500">
            Leave blank to fail loud (costs show as zero with a NO PRICE badge) when no observed price.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 max-w-md">
          <div>
            <p className="text-xs font-medium text-slate-800">Use Fuel Brain in recon</p>
            <p className="text-[11px] text-slate-500">When off, recon uses the legacy residual path.</p>
          </div>
          <Switch checked={fuelBrainEnabled} onCheckedChange={setFuelBrainEnabled} />
        </div>

        <div className="flex items-center justify-between gap-4 max-w-md">
          <div>
            <p className="text-xs font-medium text-slate-800">Shadow-compare Fuel Brain</p>
            <p className="text-[11px] text-slate-500">Log brain vs legacy without cutting over.</p>
          </div>
          <Switch checked={fuelBrainShadowCompare} onCheckedChange={setFuelBrainShadowCompare} />
        </div>

        <Button type="button" size="sm" disabled={saving} onClick={saveSettings}>
          {saving ? 'Saving…' : 'Save settings'}
        </Button>
      </div>

      <div className="border-t border-slate-100 pt-3 space-y-2">
        <h4 className="text-sm font-semibold text-slate-900">Business Finance backfill</h4>
        <p className="text-xs text-slate-500">
          Finalize always syncs driver-share fuel to the Business Finance Fuel line. Use backfill only
          for weeks finalized before this was automatic.
        </p>
        {backfillPreview && backfillPreview.eligibleCount > 0 ? (
          <>
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
          </>
        ) : (
          <p className="text-xs text-slate-500">
            No historical fills need a P&amp;L offset — live Finalize is already syncing.
          </p>
        )}
      </div>
    </div>
  );
}
