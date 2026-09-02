/**
 * Org preference: dual-approval spend threshold for Consumption Reconciliation (Wave J).
 */
import React, { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { api } from '../../services/api';
import { toast } from 'sonner';
import {
  FUEL_SECOND_APPROVER_THRESHOLD,
  resolveFuelSecondApproverThreshold,
} from '../../utils/fuelDualApproval';
import { formatFuelMoney } from '../../utils/formatFuelMoney';

export function FuelDualApprovalSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [threshold, setThreshold] = useState(String(FUEL_SECOND_APPROVER_THRESHOLD));
  const [prefs, setPrefs] = useState<Record<string, unknown>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const p = (await api.getPreferences().catch(() => ({}))) as Record<string, unknown>;
        if (cancelled) return;
        setPrefs(p || {});
        setThreshold(
          String(resolveFuelSecondApproverThreshold(p?.fuelSecondApproverThreshold as number)),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const n = Number(threshold);
      if (!Number.isFinite(n) || n < 0) {
        throw new Error('Enter a non-negative amount (0 turns dual approval off)');
      }
      const next = { ...prefs, fuelSecondApproverThreshold: n };
      await api.savePreferences(next);
      setPrefs(next);
      toast.success(
        n === 0
          ? 'Dual approval turned off'
          : `Second approval required above ${formatFuelMoney(n)}`,
      );
    } catch (e: any) {
      toast.error(e?.message || 'Could not save threshold');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading dual-approval settings…</p>;
  }

  return (
    <div className="rounded-lg border border-slate-200 p-4 space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-slate-900">Dual approval threshold</h4>
        <p className="text-xs text-slate-500 mt-0.5">
          Weeks with total spend above this amount need a second admin identity before Finalize can
          lock. Set to 0 to disable.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label className="text-xs text-slate-600" htmlFor="fuel-second-threshold">
            Threshold (JMD)
          </label>
          <Input
            id="fuel-second-threshold"
            className="min-h-11 w-40"
            inputMode="decimal"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
          />
        </div>
        <Button type="button" className="min-h-11" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
