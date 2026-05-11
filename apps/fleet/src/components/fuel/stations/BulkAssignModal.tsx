import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../../ui/dialog";
import { Button } from "../../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Loader2, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { api } from '../../../services/api';
import { StationProfile } from '../../../types/station';

interface BulkAssignModalProps {
    open: boolean;
    onClose: () => void;
    entryIds: string[];
    stationGroupName: string;
    verifiedStations: StationProfile[];
    onAssignComplete: () => void;
}

export function BulkAssignModal({ open, onClose, entryIds, stationGroupName, verifiedStations, onAssignComplete }: BulkAssignModalProps) {
    const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
    const [isAssigning, setIsAssigning] = useState(false);
    const [result, setResult] = useState<any | null>(null);

    const sortedStations = useMemo(() =>
        [...verifiedStations].sort((a, b) => a.name.localeCompare(b.name)),
        [verifiedStations]
    );

    const selectedStation = useMemo(() =>
        sortedStations.find(s => s.id === selectedStationId) ?? null,
        [sortedStations, selectedStationId]
    );

    const handleAssign = async () => {
        if (!selectedStationId) return;
        setIsAssigning(true);
        setResult(null);

        try {
            const res = await api.bulkAssignStation(entryIds, selectedStationId);
            setResult(res);
            setIsAssigning(false);

            // Contextual toast feedback (Steps 7.5 / 7.6)
            const updated = res.summary?.updated ?? 0;
            const skippedAlready = res.summary?.skippedAlreadyAssigned ?? 0;
            const skippedNotFound = res.summary?.skippedNotFound ?? 0;
            const stationName = res.station?.name ?? 'station';

            if (updated === 0 && skippedAlready > 0) {
                // Edge case 7.6: all entries already assigned
                toast.info(`All ${skippedAlready} entries are already assigned to ${stationName}. No changes made.`);
            } else {
                let msg = `${updated} entry${updated !== 1 ? 's' : ''} assigned to ${stationName}`;
                if (skippedAlready > 0) msg += ` (${skippedAlready} already assigned)`;
                toast.success(msg);
            }

            if (skippedNotFound > 0) {
                toast.warning(`${skippedNotFound} entry${skippedNotFound !== 1 ? 's were' : ' was'} not found — may have been deleted`);
            }

            // Trigger parent data refresh (does NOT close this modal)
            if (updated > 0) {
                onAssignComplete();
            }

            // Auto-close after a brief delay so user can read the result summary
            setTimeout(() => {
                handleClose();
            }, 1800);
        } catch (err: any) {
            toast.error(`Assignment failed: ${err.message}`);
            setIsAssigning(false);
        }
    };

    const handleClose = () => {
        if (isAssigning) return; // Don't close while in-flight
        setSelectedStationId(null);
        setResult(null);
        setIsAssigning(false);
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>Assign to Verified Station</DialogTitle>
                    <DialogDescription>
                        Link <span className="font-semibold text-foreground">{entryIds.length}</span> transaction{entryIds.length !== 1 ? 's' : ''} from{' '}
                        <span className="font-semibold text-foreground">{stationGroupName}</span> to a verified station.
                    </DialogDescription>
                </DialogHeader>

                {/* Result summary (shown after successful assignment) */}
                {result ? (
                    <div className="py-4 space-y-3">
                        <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                            <CheckCircle2 className="h-5 w-5 shrink-0" />
                            <p className="text-sm font-medium">{result.message}</p>
                        </div>

                        {(result.summary?.skippedNotFound > 0 || result.summary?.skippedAlreadyAssigned > 0) && (
                            <div className="space-y-2 text-sm">
                                {result.summary.skippedNotFound > 0 && (
                                    <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                                        <AlertTriangle className="h-4 w-4 shrink-0" />
                                        <span>{result.summary.skippedNotFound} entry(ies) not found (may have been deleted)</span>
                                    </div>
                                )}
                                {result.summary.skippedAlreadyAssigned > 0 && (
                                    <div className="flex items-center gap-2 text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                                        <Info className="h-4 w-4 shrink-0" />
                                        <span>{result.summary.skippedAlreadyAssigned} entry(ies) already assigned to this station</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="py-4 space-y-4">
                        {/* Station picker */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">Target Station</label>
                            <Select
                                value={selectedStationId ?? ''}
                                onValueChange={(val) => setSelectedStationId(val)}
                                disabled={isAssigning}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select a verified station..." />
                                </SelectTrigger>
                                <SelectContent className="max-h-[280px]">
                                    {sortedStations.map((station) => (
                                        <SelectItem key={station.id} value={station.id}>
                                            <div className="flex flex-col">
                                                <span className="font-medium">
                                                    {station.name}
                                                    {station.brand && station.brand !== station.name ? ` (${station.brand})` : ''}
                                                </span>
                                                {station.address && (
                                                    <span className="text-xs text-muted-foreground">{station.address}</span>
                                                )}
                                            </div>
                                        </SelectItem>
                                    ))}
                                    {sortedStations.length === 0 && (
                                        <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                                            No verified stations available
                                        </div>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Preview */}
                        {selectedStation && (
                            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Will assign to</p>
                                <p className="font-semibold text-sm">{selectedStation.name}</p>
                                {selectedStation.address && (
                                    <p className="text-xs text-muted-foreground">{selectedStation.address}</p>
                                )}
                                {selectedStation.plusCode && (
                                    <p className="text-xs text-muted-foreground font-mono">{selectedStation.plusCode}</p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    Current visits: {selectedStation.stats?.totalVisits ?? 0} | After: {(Number(selectedStation.stats?.totalVisits) || 0) + entryIds.length}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter>
                    {result ? (
                        <Button onClick={handleClose}>Done</Button>
                    ) : (
                        <>
                            <Button variant="outline" onClick={handleClose} disabled={isAssigning}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleAssign}
                                disabled={!selectedStationId || isAssigning}
                            >
                                {isAssigning ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Assigning...
                                    </>
                                ) : (
                                    `Assign ${entryIds.length} to ${selectedStation?.name ?? 'Station'}`
                                )}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}