import React, { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { Button } from "../../ui/button";
import { Switch } from "../../ui/switch";
import { Settings2, Loader2, Bot, Wrench } from "lucide-react";
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
  const [matchOnIngest, setMatchOnIngest] = useState(false);
  const [disputeRefundTripSync, setDisputeRefundTripSync] = useState(false);
  const [unlinkedRefundUndo, setUnlinkedRefundUndo] = useState(false);
  const [bridging, setBridging] = useState(false);
  const [claimsSyncChecking, setClaimsSyncChecking] = useState(false);
  const [claimsSyncApplying, setClaimsSyncApplying] = useState(false);
  const [claimsSyncReport, setClaimsSyncReport] = useState<{
    labelsToFix: number;
    transactionDatesToFix: number;
    needsManualReview: Array<{ claimId: string; transactionId: string }>;
  } | null>(null);
  const [matchIndexChecking, setMatchIndexChecking] = useState(false);
  const [matchIndexApplying, setMatchIndexApplying] = useState(false);
  const [matchIndexReport, setMatchIndexReport] = useState<{
    totalTolls: number;
    missingMatchStatus: number;
    message: string;
  } | null>(null);

  const applySettings = (data: {
    refundAutomationEnabled: boolean;
    refundAutoMinConfidence: number;
    personalUseDetectionEnabled: boolean;
    orphanProximityMinutes: number;
    driverTollChargeSyncEnabled?: boolean;
    unifiedTollSettlementEnabled?: boolean;
    matchOnIngestEnabled?: boolean;
    disputeRefundTripSyncEnabled?: boolean;
    unlinkedRefundUndoEnabled?: boolean;
  }) => {
    setEnabled(data.refundAutomationEnabled);
    setMinConfidence(data.refundAutoMinConfidence);
    setPersonalUseEnabled(data.personalUseDetectionEnabled);
    setOrphanProximity(data.orphanProximityMinutes);
    setDriverChargeSync(data.driverTollChargeSyncEnabled === true);
    setUnifiedSettlement(data.unifiedTollSettlementEnabled === true);
    setMatchOnIngest(data.matchOnIngestEnabled === true);
    setDisputeRefundTripSync(data.disputeRefundTripSyncEnabled === true);
    setUnlinkedRefundUndo(data.unlinkedRefundUndoEnabled === true);
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
    matchOnIngestEnabled?: boolean;
    disputeRefundTripSyncEnabled?: boolean;
    unlinkedRefundUndoEnabled?: boolean;
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

  const checkClaimsSync = async () => {
    setClaimsSyncChecking(true);
    try {
      const res = await api.getClaimsTollSyncStatus();
      setClaimsSyncReport({
        labelsToFix: res.summary.labelsToFix,
        transactionDatesToFix: res.summary.transactionDatesToFix,
        needsManualReview: res.needsManualReview,
      });
      toast.info(res.message);
    } catch (e: any) {
      toast.error(e.message || "Status check failed");
    } finally {
      setClaimsSyncChecking(false);
    }
  };

  const applyClaimsSyncRepair = async () => {
    setClaimsSyncApplying(true);
    try {
      const res = await api.repairClaimsTollSync(false);
      setClaimsSyncReport({
        labelsToFix: 0,
        transactionDatesToFix: 0,
        needsManualReview: res.needsManualReview,
      });
      toast.success(res.message);
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message || "Repair failed");
    } finally {
      setClaimsSyncApplying(false);
    }
  };

  const checkMatchIndex = async () => {
    setMatchIndexChecking(true);
    try {
      const res = await api.getMatchIndexBackfillStatus();
      setMatchIndexReport({
        totalTolls: res.totalTolls,
        missingMatchStatus: res.missingMatchStatus,
        message: res.message,
      });
      toast.info(res.message);
    } catch (e: any) {
      toast.error(e.message || "Status check failed");
    } finally {
      setMatchIndexChecking(false);
    }
  };

  const applyMatchIndexBackfill = async () => {
    setMatchIndexApplying(true);
    try {
      const res = await api.runMatchIndexBackfill(false, 100);
      setMatchIndexReport({
        totalTolls: res.totalTolls ?? 0,
        missingMatchStatus: res.remaining ?? 0,
        message: res.message,
      });
      toast.success(res.message);
    } catch (e: any) {
      toast.error(e.message || "Backfill failed");
    } finally {
      setMatchIndexApplying(false);
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
      <PopoverContent align="end" className="w-[min(920px,95vw)] p-5">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Toll Automation</h3>
              <p className="text-xs text-slate-500">
                Controls how tolls are auto-resolved, detected, and synced to driver financials.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Refund auto-resolution */}
              <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">Refund auto-resolution</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
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

                <div className="border-t border-slate-100 pt-3">
                  <label className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">Sync dispute matches to claims &amp; trips</span>
                    <Switch
                      checked={disputeRefundTripSync}
                      disabled={saving}
                      onCheckedChange={(v) => save({ disputeRefundTripSyncEnabled: v })}
                    />
                  </label>
                  <p className="text-xs text-slate-500 mt-1">
                    When a dispute refund is matched (or unmatched), cascade the resolution into the
                    linked claim's driver-charge sync and the trip's Unlinked Refunds status, instead
                    of only marking the refund itself.
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <label className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">Undo Apply to Underpaid</span>
                    <Switch
                      checked={unlinkedRefundUndo}
                      disabled={saving}
                      onCheckedChange={(v) => save({ unlinkedRefundUndoEnabled: v })}
                    />
                  </label>
                  <p className="text-xs text-slate-500 mt-1">
                    Allow reversing an Unlinked Refund that was applied to an underpaid claim —
                    restores the trip, claim, and driver financials.
                  </p>
                </div>
              </div>

              {/* Personal-use detection */}
              <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">Personal-use detection</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
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
              </div>

              {/* Driver financial sync */}
              <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                <h4 className="text-sm font-semibold text-slate-900">Driver financial sync</h4>

                <div>
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
                    One reconciliation-aware toll calc across all driver financial tabs: cash
                    tolls wash, only personal tag tolls are billed, and payout stops
                    double-counting tolls. Requires “Sync charges to driver financials”.
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <label className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">Match-on-ingest (beta)</span>
                    <Switch
                      checked={matchOnIngest}
                      disabled={saving}
                      onCheckedChange={(v) => save({ matchOnIngestEnabled: v })}
                    />
                  </label>
                  <p className="text-xs text-slate-500 mt-1">
                    Computes each toll's trip match once, when it's created, instead of every time
                    this dashboard loads — and re-checks it when a trip is imported later, even
                    weeks after. Purely additive: never resolves or charges anything by itself.
                  </p>
                </div>
              </div>

              {/* Claims ↔ Toll Ledger repair */}
              <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                <div className="flex items-center gap-1.5">
                  <Wrench className="h-4 w-4 text-slate-500" />
                  <h4 className="text-sm font-semibold text-slate-900">Claims ↔ Toll Ledger repair</h4>
                </div>
                <p className="text-xs text-slate-500">
                  One-time fix for claims resolved before this system existed: corrects labels
                  and dates. Never auto-charges — flags anything that needs a manual re-resolve.
                </p>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={claimsSyncChecking} onClick={checkClaimsSync}>
                    {claimsSyncChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check status"}
                  </Button>
                  <Button
                    size="sm"
                    className="bg-indigo-600 hover:bg-indigo-700"
                    disabled={claimsSyncApplying}
                    onClick={applyClaimsSyncRepair}
                  >
                    {claimsSyncApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply repair"}
                  </Button>
                </div>
                {claimsSyncReport && (
                  <div className="text-xs text-slate-600 space-y-1 border-t border-slate-100 pt-2">
                    <p>Labels to fix: <span className="font-semibold">{claimsSyncReport.labelsToFix}</span></p>
                    <p>Dates to fix: <span className="font-semibold">{claimsSyncReport.transactionDatesToFix}</span></p>
                    {claimsSyncReport.needsManualReview.length > 0 ? (
                      <div>
                        <p className="text-amber-700 font-medium">
                          Needs manual re-resolve ({claimsSyncReport.needsManualReview.length}) — flip to Write
                          Off then back to Charge Driver in Resolved History:
                        </p>
                        <ul className="mt-1 space-y-0.5 max-h-24 overflow-y-auto font-mono text-[10px] text-slate-500">
                          {claimsSyncReport.needsManualReview.map((r: { claimId: string; transactionId: string }) => (
                            <li key={r.claimId} title={r.transactionId}>{r.claimId}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-emerald-700">Nothing needs manual review.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Native ride tolls */}
              <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                <div className="flex items-center gap-1.5">
                  <Bot className="h-4 w-4 text-slate-500" />
                  <h4 className="text-sm font-semibold text-slate-900">Native ride tolls</h4>
                </div>
                <p className="text-xs text-slate-500">
                  Import geofence-detected tolls from Roam Driver rides into the ledger.
                </p>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={bridging} onClick={() => runBridge(true)}>
                    Dry run
                  </Button>
                  <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" disabled={bridging} onClick={() => runBridge(false)}>
                    {bridging ? <Loader2 className="h-4 w-4 animate-spin" /> : "Bridge now"}
                  </Button>
                </div>
              </div>

              {/* Match-Index backfill */}
              <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                <div className="flex items-center gap-1.5">
                  <Wrench className="h-4 w-4 text-slate-500" />
                  <h4 className="text-sm font-semibold text-slate-900">Match-Index backfill</h4>
                </div>
                <p className="text-xs text-slate-500">
                  One-time fix for tolls created before Match-on-ingest existed: computes their
                  trip match once so the fast read path can use it. Never auto-charges anything.
                </p>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={matchIndexChecking} onClick={checkMatchIndex}>
                    {matchIndexChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check status"}
                  </Button>
                  <Button
                    size="sm"
                    className="bg-indigo-600 hover:bg-indigo-700"
                    disabled={matchIndexApplying}
                    onClick={applyMatchIndexBackfill}
                  >
                    {matchIndexApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply backfill (100)"}
                  </Button>
                </div>
                {matchIndexReport && (
                  <div className="text-xs text-slate-600 space-y-1 border-t border-slate-100 pt-2">
                    <p>Total tolls: <span className="font-semibold">{matchIndexReport.totalTolls}</span></p>
                    <p>Still missing matchStatus: <span className="font-semibold">{matchIndexReport.missingMatchStatus}</span></p>
                    <p className="text-slate-500">{matchIndexReport.message}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
