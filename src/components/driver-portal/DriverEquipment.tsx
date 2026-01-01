import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../../services/api';
import { equipmentService } from '../../services/equipmentService';
import { EquipmentItem } from '../../types/equipment';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Loader2, Wrench, AlertTriangle, CheckCircle, HelpCircle, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { Label } from '../ui/label';

interface DriverEquipmentProps {
    onBack?: () => void;
}

export function DriverEquipment({ onBack }: DriverEquipmentProps) {
    const { user } = useAuth();
    const [items, setItems] = useState<EquipmentItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [vehicleId, setVehicleId] = useState<string | null>(null);
    const [reportDialogOpen, setReportDialogOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<EquipmentItem | null>(null);
    const [damageNotes, setDamageNotes] = useState('');
    const [reporting, setReporting] = useState(false);

    useEffect(() => {
        loadEquipment();
    }, [user]);

    const loadEquipment = async () => {
        if (!user?.email) return;

        try {
            setLoading(true);
            // 1. Find driver's assigned vehicle
            const drivers = await api.getDrivers();
            const currentDriver = drivers.find(d => d.email === user.email);
            
            if (currentDriver) {
                // Check 1: Driver has assignedVehicleId
                if (currentDriver.assignedVehicleId) {
                    setVehicleId(currentDriver.assignedVehicleId);
                    const equipment = await equipmentService.getEquipment(currentDriver.assignedVehicleId);
                    setItems(equipment);
                    return;
                }

                // Check 2: Vehicle has currentDriverId matching driver
                const vehicles = await api.getVehicles();
                const assignedVehicle = vehicles.find(v => 
                    v.currentDriverId === currentDriver.id || 
                    v.currentDriverId === currentDriver.driverId
                );

                if (assignedVehicle) {
                    setVehicleId(assignedVehicle.id);
                    const equipment = await equipmentService.getEquipment(assignedVehicle.id);
                    setItems(equipment);
                    return;
                }
            }
            
            // If no vehicle assigned, show empty state
            setItems([]);
        } catch (error) {
            toast.error("Failed to load equipment list");
        } finally {
            setLoading(false);
        }
    };

    const handleReportDamage = (item: EquipmentItem) => {
        setSelectedItem(item);
        setDamageNotes('');
        setReportDialogOpen(true);
    };

    const submitDamageReport = async () => {
        if (!selectedItem || !vehicleId) return;
        
        try {
            setReporting(true);
            await equipmentService.saveEquipment({
                ...selectedItem,
                status: 'Damaged',
                notes: damageNotes ? (selectedItem.notes ? selectedItem.notes + '\n' + damageNotes : damageNotes) : selectedItem.notes
            });
            
            toast.success("Damage reported successfully");
            setReportDialogOpen(false);
            loadEquipment();
        } catch (error) {
            toast.error("Failed to submit report");
        } finally {
            setReporting(false);
        }
    };

    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
    }

    if (!vehicleId) {
        return (
            <div className="p-4 text-center">
                <Wrench className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                <h3 className="text-lg font-medium text-slate-900">No Vehicle Assigned</h3>
                <p className="text-slate-500 mt-2">You must be assigned to a vehicle to view its equipment inventory.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
                {onBack && (
                    <Button variant="ghost" size="icon" onClick={onBack} className="-ml-2">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                )}
                <div>
                    <h2 className="text-xl font-bold text-slate-900">Vehicle Equipment</h2>
                    <p className="text-sm text-slate-500">Inventory for your assigned vehicle</p>
                </div>
            </div>

            <div className="grid gap-4">
                {items.length === 0 ? (
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center p-8 text-center">
                            <CheckCircle className="h-12 w-12 text-emerald-100 mb-4" />
                            <h3 className="font-medium text-slate-900">No Equipment Listed</h3>
                            <p className="text-sm text-slate-500 mt-1">This vehicle has no tracked equipment inventory.</p>
                        </CardContent>
                    </Card>
                ) : (
                    items.map(item => (
                        <Card key={item.id} className={item.status === 'Damaged' || item.status === 'Missing' ? 'border-red-200 bg-red-50/30' : ''}>
                            <CardContent className="p-4 flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-semibold text-slate-900">{item.name}</h4>
                                        <Badge variant={
                                            item.status === 'Good' ? 'default' : 
                                            item.status === 'Maintenance' ? 'secondary' : 'destructive'
                                        } className="text-[10px] h-5 px-1.5">
                                            {item.status}
                                        </Badge>
                                    </div>
                                    {item.description && <p className="text-sm text-slate-500 mt-1">{item.description}</p>}
                                    {item.notes && <p className="text-xs text-amber-600 mt-2 bg-amber-50 p-2 rounded border border-amber-100">{item.notes}</p>}
                                </div>
                                
                                {item.status === 'Good' && (
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                                        onClick={() => handleReportDamage(item)}
                                    >
                                        <AlertTriangle className="h-3 w-3 mr-1" />
                                        Report
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Report Damage</DialogTitle>
                        <DialogDescription>
                            Please describe the damage or issue with the <strong>{selectedItem?.name}</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Label htmlFor="damage-notes" className="mb-2 block">Details</Label>
                        <Textarea 
                            id="damage-notes" 
                            placeholder="Describe what happened..." 
                            value={damageNotes}
                            onChange={(e) => setDamageNotes(e.target.value)}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setReportDialogOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={submitDamageReport} disabled={reporting}>
                            {reporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Submit Report
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
