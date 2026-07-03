import React, { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { Button } from "../../ui/button";
import { Switch } from "../../ui/switch";
import { Settings2, Loader2, Bot } from "lucide-react";
import { api } from "../../../services/api";
import { toast } from "sonner@2.0.3";

/**
 * Toll automation settings + ops actions (Phase 7).
 *
 * Wires the Phase 2 refund-automation flag (GET/PUT /automation-settings) and
 * exposes the Phase 4 native-ride bridge as a safe two-step ops action
 * (dry-run preview → apply). All server-side; this is a thin control surface.
 */
export function TollAutomationSettings({ onChanged }: { onChanged?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [minConfidence, setMinConfidence] = useState(85);
  const [personalUseEnabled, setPersonalUseEnabled] = useState(false);
  const [orphanProximity, setOrphanProximity] = useState(180);
  const [driverChargeSync, setDriverChargeSync] = useState(false);
  const [unifiedSettlement, setUnifiedSettlement] = useState(false);
  const [bridging, setBridging] = useState(false);

  const applySettings = (data: {
    refundAutomationEnabled: boolean;
    refundAutoMinConfidence: number;
    personalUseDetectionEnabled: boolean;
    orphanProximityMinutes: number;
    driverTollChargeSyncEnabled?: boolean;
    unifiedTollSettlementEnabled?: boolean;
  }) => {
    setEnabled(data.refundAutomationEnabled);
    setMinConfidence(data.refundAutoMinConfidence);
    setPersonalUseEnabled(data.personalUseDetectionEnabled);
    setOrphanProximity(data.orphanProximityMinutes);
    setDriverChargeSync(data.driverTollChargeSyncEnabled === true);
    setUnifiedSettlement(data.unifiedTollSettlementEnabled === true);
  };

  useEffect(() => {
    let active = true;
    api
      .getTollAutomationSettings()
      .then((res) => {
        if (!active) return;
        applySettings(res.data);
      })
      .catch((e) => console.error("[TollAutomation] load failed", e))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const save = async (next: {
    refundAutomationEnabled?: boolean;
    refundAutoMinConfidence?: number;
    personalUseDetectionEnabled?: boolean;
    orphanProximityMinutes?: number;
    driverTollChargeSyncEnabled?: boolean;
    unifiedTollSettlementEnabled?: boolean;
  }) => {
    setSaving(true);
    try {
      const res = await api.updateTollAutomationSettings(next);
      applySettings(res.data);
      toast.success("Automation settings saved");
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const runBridge = async (dryRun: boolean) => {
    setBridging(true);
    try {
      const res = await api.bridgeRidesTolls({ dryRun });
      if (dryRun) {
        toast.info(`Dry run: ${res.bridged} crossing(s) would be bridged, ${res.skipped} already bridged.`);
      } else {
        toast.success(`Bridged ${res.bridged} native-ride toll(s); ${res.skipped} skipped.`);
        onChanged?.();
      }
    } catch (e: any) {
      toast.error(e.message || "Bridge failed");
    } finally {
      setBridging(false);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="h-4 w-4 mr-2" />
          Automation
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Refund auto-resolution</h4>
              <p className="text-xs text-slate-500">
                Auto-clears integrity-safe cash washes, and auto-links high-confidence dispute
                refunds to their underpaid claim. Everything else waits for review.
              </p>
            </div>

            <label className="flex items-center justify-between">
              <span className="text-sm text-slate-700">Enable auto-resolution</span>
              <Switch
                checked={enabled}
                disabled={saving}
                onCheckedChange={(v) => save({ refundAutomationEnabled: v })}
              />
            </label>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-slate-700">Confidence threshold</label>
                <span className="text-sm font-semibold text-indigo-700">{minConfidence}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={100}
                value={minConfidence}
                disabled={saving}
                onChange={(e) => setMinConfidence(parseInt(e.target.value, 10))}
                onMouseUp={() => save({ refundAutoMinConfidence: minConfidence })}
                onTouchEnd={() => save({ refundAutoMinConfidence: minConfidence })}
                className="w-full mt-2 accent-indigo-600"
              />
              <p className="text-xs text-slate-500 mt-1">Suggestions below this score require manual review.</p>
            </div>

            <div className="border-t border-slate-100 pt-4 space-y-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">Personal-use detection</h4>
                <p className="text-xs text-slate-500">
                  Classifies tolls that no trip explains as likely personal use, moving them out
                  of “Needs Review” into “Personal Use”. Classify-only — a human still confirms
                  any driver charge.
                </p>
              </div>

              <label className="flex items-center justify-between">
                <span className="text-sm text-slate-700">Detect personal-use (orphan) tolls</span>
                <Switch
                  checked={personalUseEnabled}
                  disabled={saving}
                  onCheckedChange={(v) => save({ personalUseDetectionEnabled: v })}
                />
              </label>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm text-slate-700">Trip proximity window</label>
                  <span className="text-sm font-semibold text-indigo-700">{orphanProximity} min</span>
                </div>
                <input
                  type="range"
                  min={15}
                  max={480}
                  step={15}
                  value={orphanProximity}
                  disabled={saving || !personalUseEnabled}
                  onChange={(e) => setOrphanProximity(parseInt(e.target.value, 10))}
                  onMouseUp={() => save({ orphanProximityMinutes: orphanProximity })}
                  onTouchEnd={() => save({ orphanProximityMinutes: orphanProximity })}
                  className="w-full mt-2 accent-indigo-600"
                />
                <p className="text-xs text-slate-500 mt-1">
                  A same-day trip within this window keeps a toll under review; beyond it (or no
                  trip that day) the toll is flagged personal.
                </p>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <label className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">Sync charges to driver financials</span>
                  <Switch
                    checked={driverChargeSync}
                    disabled={saving}
                    onCheckedChange={(v) => save({ driverTollChargeSyncEnabled: v })}
                  />
                </label>
                <p className="text-xs text-slate-500 mt-1">
                  When a toll is resolved as “Charge Driver”, post it to the driver's Expenses,
                  Settlement and Cash Wallet. Classify-only stays intact; this only controls
                  whether the confirmed charge appears in the driver's financials.
                </p>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <label className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">Unified toll settlement</span>
                  <Switch
                    checked={unifiedSettlement}
                    disabled={saving}
                    onCheckedChange={(v) => save({ unifiedTollSettlementEnabled: v })}
                  />
                </label>
                <p className="text-xs text-slate-500 mt-1">
                  One reconciliation-aware toll calc across all driver financial tabs: cash tolls
                  wash, only personal tag tolls are billed, and payout stops double-counting tolls.
                  Requires “Sync charges to driver financials”.
                </p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-center gap-1.5">
                <Bot className="h-4 w-4 text-slate-500" />
                <h4 className="text-sm font-semibold text-slate-900">Native ride tolls</h4>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Import geofence-detected tolls from Roam Driver rides into the ledger.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <Button size="sm" variant="outline" disabled={bridging} onClick={() => runBridge(true)}>
                  Dry run
                </Button>
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" disabled={bridging} onClick={() => runBridge(false)}>
                  {bridging ? <Loader2 className="h-4 w-4 animate-spin" /> : "Bridge now"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
