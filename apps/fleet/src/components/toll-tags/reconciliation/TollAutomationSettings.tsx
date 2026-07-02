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
  const [bridging, setBridging] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .getTollAutomationSettings()
      .then((res) => {
        if (!active) return;
        setEnabled(res.data.refundAutomationEnabled);
        setMinConfidence(res.data.refundAutoMinConfidence);
      })
      .catch((e) => console.error("[TollAutomation] load failed", e))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const save = async (next: { refundAutomationEnabled?: boolean; refundAutoMinConfidence?: number }) => {
    setSaving(true);
    try {
      const res = await api.updateTollAutomationSettings(next);
      setEnabled(res.data.refundAutomationEnabled);
      setMinConfidence(res.data.refundAutoMinConfidence);
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
