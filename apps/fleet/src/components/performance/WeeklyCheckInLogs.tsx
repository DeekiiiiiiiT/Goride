import React, { useState, useEffect } from 'react';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { api } from '../../services/api';
import { WeeklyCheckIn } from '../../types/check-in';
import { Loader2, CheckCircle2, XCircle, Clock, Eye, MapPin, Truck, User } from 'lucide-react';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";

export function WeeklyCheckInLogs() {
    const [checkIns, setCheckIns] = useState<WeeklyCheckIn[]>([]);
    const [drivers, setDrivers] = useState<any[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedCheckIn, setSelectedCheckIn] = useState<WeeklyCheckIn | null>(null);

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            try {
                const [checkInData, driverData, vehicleData] = await Promise.all([
                    api.getCheckIns(),
                    api.getDrivers(),
                    api.getVehicles()
                ]);
                setCheckIns(checkInData || []);
                setDrivers(driverData || []);
                setVehicles(vehicleData || []);
            } catch (error) {
                console.error("Error loading check-in logs:", error);
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, []);

    const getDriverName = (driverId: string) => {
        const driver = drivers.find(d => d.id === driverId);
        return driver ? driver.name : 'Unknown Driver';
    };

    const getVehiclePlate = (vehicleId: string) => {
        const vehicle = vehicles.find(v => v.id === vehicleId);
        return vehicle ? vehicle.licensePlate : 'Unknown Vehicle';
    };

    const getStatusBadge = (status?: string) => {
        switch (status) {
            case 'approved':
            case 'auto_approved':
                return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Approved</Badge>;
            case 'rejected':
                return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Rejected</Badge>;
            case 'pending_review':
                return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Pending Review</Badge>;
            default:
                return <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">Pending</Badge>;
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Weekly Check-In Logs</h3>
                <div className="text-sm text-slate-500">{checkIns.length} Records</div>
            </div>

            <div className="rounded-md border bg-white overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date & Time</TableHead>
                            <TableHead>Driver</TableHead>
                            <TableHead>Vehicle</TableHead>
                            <TableHead>Reading</TableHead>
                            <TableHead>Method</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {checkIns.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                                    No check-in records found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            checkIns.map((log) => (
                                <TableRow key={log.id}>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-medium text-slate-900">
                                                {format(new Date(log.timestamp), 'MMM dd, yyyy')}
                                            </span>
                                            <span className="text-xs text-slate-500">
                                                {format(new Date(log.timestamp), 'hh:mm a')}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center">
                                                <User className="h-4 w-4 text-slate-600" />
                                            </div>
                                            <span className="text-sm font-medium">{getDriverName(log.driverId)}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Truck className="h-4 w-4 text-slate-400" />
                                            <span className="text-sm">{getVehiclePlate(log.vehicleId)}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-900">{log.odometer.toLocaleString()} km</span>
                                            {log.aiReading && log.aiReading !== log.odometer && (
                                                <span className="text-[10px] text-slate-400 line-through">AI: {log.aiReading}</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="secondary" className="text-[10px] font-normal">
                                            {log.method === 'ai_verified' ? 'AI Scan' : 'Manual Entry'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {getStatusBadge(log.reviewStatus)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={() => setSelectedCheckIn(log)}
                                        >
                                            <Eye className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Detail Dialog */}
            <Dialog open={!!selectedCheckIn} onOpenChange={(open) => !open && setSelectedCheckIn(null)}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Check-In Verification Details</DialogTitle>
                        <DialogDescription>
                            Review the odometer submission from {selectedCheckIn && getDriverName(selectedCheckIn.driverId)}.
                        </DialogDescription>
                    </DialogHeader>

                    {selectedCheckIn && (
                        <div className="space-y-6 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <span className="text-xs text-slate-500 uppercase font-semibold">Odometer Reading</span>
                                    <p className="text-2xl font-bold text-slate-900">{selectedCheckIn.odometer.toLocaleString()} km</p>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-xs text-slate-500 uppercase font-semibold">Week Start</span>
                                    <p className="text-sm font-medium">{selectedCheckIn.weekStart}</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <span className="text-xs text-slate-500 uppercase font-semibold">Odometer Photo</span>
                                <div className="aspect-video w-full rounded-lg bg-slate-100 border overflow-hidden relative group">
                                    {selectedCheckIn.photoUrl ? (
                                        <ImageWithFallback 
                                            src={selectedCheckIn.photoUrl} 
                                            alt="Odometer" 
                                            className="h-full w-full object-cover" 
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                            <Eye className="h-10 w-10 opacity-20 mb-2" />
                                            <span className="text-sm">No photo uploaded</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-slate-50 p-4 rounded-lg border space-y-3">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-500">Method:</span>
                                    <span className="font-medium">{selectedCheckIn.method === 'ai_verified' ? 'AI Verified' : 'Manual Override'}</span>
                                </div>
                                {selectedCheckIn.manualReadingReason && (
                                    <div className="text-sm">
                                        <span className="text-slate-500 block mb-1">Reason for manual entry:</span>
                                        <p className="p-2 bg-white border rounded text-slate-700 italic">"{selectedCheckIn.manualReadingReason}"</p>
                                    </div>
                                )}
                                {selectedCheckIn.managerNotes && (
                                    <div className="text-sm">
                                        <span className="text-slate-500 block mb-1">Manager Notes:</span>
                                        <p className="p-2 bg-indigo-50 border border-indigo-100 rounded text-slate-700">"{selectedCheckIn.managerNotes}"</p>
                                    </div>
                                )}
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-500">Status:</span>
                                    <div>{getStatusBadge(selectedCheckIn.reviewStatus)}</div>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
