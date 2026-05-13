// cache-bust: force recompile — 2026-02-10
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
import { 
    Loader2, Wrench, AlertTriangle, CheckCircle, HelpCircle, ArrowLeft, ChevronDown,
    Scissors, Minimize2, Grid, Zap, Target, SearchX, Eye, Info 
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { Label } from '../ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { STANDARD_EXTERIOR_PARTS, EXTERIOR_SECTIONS, DAMAGE_TYPES, SEVERITY_LEVELS } from '../../utils/vehicle_parts';
import { createDamageReport, appendDamageHistory } from '../../utils/equipment-helpers';

interface DriverEquipmentProps {
    onBack?: () => void;
}

export function DriverEquipment({ onBack }: DriverEquipmentProps) {
    const { user } = useAuth();
    const [items, setItems] = useState<EquipmentItem[]>([]);
    const [exteriorItems, setExteriorItems] = useState<EquipmentItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [vehicleId, setVehicleId] = useState<string | null>(null);
    const [reportDialogOpen, setReportDialogOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<EquipmentItem | null>(null);
    const [damageNotes, setDamageNotes] = useState('');
    const [selectedDamageTypes, setSelectedDamageTypes] = useState<string[]>([]);
    const [severity, setSeverity] = useState<string>('Cosmetic');
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
            
            let targetVehicleId: string | null = null;

            if (currentDriver) {
                // Check 1: Driver has assignedVehicleId
                if (currentDriver.assignedVehicleId) {
                    targetVehicleId = currentDriver.assignedVehicleId;
                } else {
                    // Check 2: Vehicle has currentDriverId matching driver
                    const vehicles = await api.getVehicles();
                    const assignedVehicle = vehicles.find(v => 
                        v.currentDriverId === currentDriver.id || 
                        v.currentDriverId === currentDriver.driverId
                    );
                    if (assignedVehicle) {
                        targetVehicleId = assignedVehicle.id;
                    }
                }
            }

            if (targetVehicleId) {
                setVehicleId(targetVehicleId);
                const allEquipment = await equipmentService.getEquipment(targetVehicleId);
                
                // Process Interior
                setItems(allEquipment.filter(i => i.category !== 'Exterior'));

                // Process Exterior
                const exteriorDb = allEquipment.filter(i => i.category === 'Exterior');
                const dbPartNames = new Set(exteriorDb.map(p => p.name));
                
                const virtualParts = STANDARD_EXTERIOR_PARTS
                    .filter(name => !dbPartNames.has(name))
                    .map(name => ({
                        id: `virtual-${name.replace(/\s+/g, '-')}`,
                        vehicleId: targetVehicleId!,
                        name,
                        category: 'Exterior' as const,
                        status: 'Good' as const,
                        price: 0,
                        description: 'Standard Part',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    }));

                setExteriorItems([...exteriorDb, ...virtualParts]);
            } else {
                setItems([]);
                setExteriorItems([]);
            }
        } catch (error) {
            toast.error("Failed to load equipment list");
        } finally {
            setLoading(false);
        }
    };

    const handleReportDamage = (item: EquipmentItem) => {
        setSelectedItem(item);
        setDamageNotes('');
        setSelectedDamageTypes([]);
        setSeverity('Cosmetic');
        setReportDialogOpen(true);
    };

    const submitDamageReport = async () => {
        if (!selectedItem || !vehicleId) return;
        
        if (selectedDamageTypes.length === 0) {
            toast.error("Please select at least one damage type");
            return;
        }

        try {
            setReporting(true);

            const report = createDamageReport(
                user?.email || 'Unknown Driver',
                selectedDamageTypes,
                severity,
                damageNotes
            );

            let itemToSave = { ...selectedItem };
            
            // Handle virtual items (they don't exist in DB yet)
            if (itemToSave.id.startsWith('virtual-')) {
                itemToSave.id = ''; // clear virtual ID so backend generates new one
            }

            const updatedItem = appendDamageHistory(itemToSave, report);
            updatedItem.vehicleId = vehicleId; // Ensure vehicleId is attached

            // Force status to 'Missing' if that damage type is selected
            if (selectedDamageTypes.includes('Missing')) {
                updatedItem.status = 'Missing';
            }

            await equipmentService.saveEquipment(updatedItem);
            
            toast.success("Damage reported successfully");
            setReportDialogOpen(false);
            loadEquipment();
        } catch (error) {
            console.error(error);
            toast.error("Failed to submit report");
        } finally {
            setReporting(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
    };

    const calculateTotalCost = (item: EquipmentItem) => {
        const basePrice = item.price || 0;
        const shipping = item.shippingCost || 0;
        const subItemsTotal = (item.subItems || []).reduce((sum, sub) => sum + (sub.cost || 0), 0);
        return basePrice + shipping + subItemsTotal;
    };

    const groupedExterior = React.useMemo(() => {
        const grouped: Record<string, EquipmentItem[]> = {};
        Object.keys(EXTERIOR_SECTIONS).forEach(s => grouped[s] = []);
        grouped['Other'] = [];
        
        exteriorItems.forEach(item => {
            let found = false;
            for (const [section, parts] of Object.entries(EXTERIOR_SECTIONS)) {
                if (parts.includes(item.name)) {
                    grouped[section].push(item);
                    found = true;
                    break;
                }
            }
            if (!found) grouped['Other'].push(item);
        });
        return grouped;
    }, [exteriorItems]);

    const renderEquipmentCard = (item: EquipmentItem) => {
        const hasDetails = (item.subItems && item.subItems.length > 0) || (item.shippingCost || 0) > 0;
        const totalCost = calculateTotalCost(item);
        
        return (
            <Card key={item.id} className={`shadow-sm ${item.status === 'Damaged' || item.status === 'Missing' ? 'border-red-200 bg-red-50/30' : ''}`}>
                <CardContent className="p-4 flex justify-between items-start">
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-slate-900">{item.name}</h4>
                            <Badge variant={
                                item.status === 'Good' ? 'default' : 
                                item.status === 'Maintenance' ? 'secondary' : 'destructive'
                            } className="text-[10px] h-5 px-1.5">
                                {item.status}
                            </Badge>
                        </div>
                        
                        {/* Item Value with Collapsible Dropdown Details */}
                        {hasDetails ? (
                            <Collapsible>
                                <CollapsibleTrigger className="group flex items-center gap-2 mt-1 hover:opacity-80 transition-opacity outline-none">
                                    <p className="text-sm font-medium text-slate-600">
                                        {formatCurrency(totalCost)}
                                    </p>
                                    <ChevronDown className="h-4 w-4 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                </CollapsibleTrigger>
                                
                                {item.description && <p className="text-sm text-slate-500 mt-1">{item.description}</p>}

                                <CollapsibleContent>
                                    <div className="mt-3 pl-3 border-l-2 border-slate-100 space-y-2 animate-in slide-in-from-top-2 fade-in duration-200">
                                        {/* Base Item Cost */}
                                        {(item.price || 0) > 0 && (
                                            <div className="flex items-center justify-between text-sm group">
                                                <span className="text-slate-700 flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-slate-400"></span>
                                                    {item.name}
                                                </span>
                                                <span className="text-slate-500 font-mono text-xs">
                                                    {formatCurrency(item.price)}
                                                </span>
                                            </div>
                                        )}
                                        
                                        {/* Shipping Cost Line Item */}
                                        {(item.shippingCost || 0) > 0 && (
                                            <div className="flex items-center justify-between text-sm group">
                                                <span className="text-slate-700 flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-slate-400"></span>
                                                    Shipping
                                                </span>
                                                <span className="text-slate-500 font-mono text-xs">
                                                    {formatCurrency(item.shippingCost!)}
                                                </span>
                                            </div>
                                        )}

                                        {item.subItems?.map(sub => (
                                            <div key={sub.id} className="flex items-center justify-between text-sm group">
                                                <span className="text-slate-700 flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-slate-400"></span>
                                                    {sub.name}
                                                </span>
                                                {sub.cost > 0 && (
                                                    <span className="text-slate-500 font-mono text-xs">
                                                        {formatCurrency(sub.cost)}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </CollapsibleContent>
                            </Collapsible>
                        ) : (
                            <>
                                <p className="text-sm font-medium text-slate-600 mt-1">
                                    {formatCurrency(totalCost)}
                                </p>
                                {item.description && <p className="text-sm text-slate-500 mt-1">{item.description}</p>}
                            </>
                        )}

                        {item.notes && <p className="text-xs text-amber-600 mt-2 bg-amber-50 p-2 rounded border border-amber-100">{item.notes}</p>}
                    </div>
                    
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 ml-4 shrink-0"
                        onClick={() => handleReportDamage(item)}
                    >
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {item.status === 'Good' ? 'Report' : 'Update'}
                    </Button>
                </CardContent>
            </Card>
        );
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
            <Collapsible defaultOpen={false} className="w-full">
                <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between w-full p-4 bg-white rounded-lg border border-slate-200 shadow-sm cursor-pointer hover:bg-slate-50 transition-all active:scale-[0.99] select-none group">
                        <div className="flex items-center gap-3">
                            {onBack && (
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onBack();
                                    }} 
                                    className="-ml-2 h-8 w-8 text-slate-500 hover:text-slate-900"
                                >
                                    <ArrowLeft className="h-5 w-5" />
                                </Button>
                            )}
                            <div>
                                <h2 className="text-lg font-bold text-slate-900 leading-tight">Vehicle Equipment</h2>
                                <p className="text-sm text-slate-500 font-normal">Inventory for your assigned vehicle</p>
                            </div>
                        </div>
                        <ChevronDown className="h-5 w-5 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                    </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                    <div className="pt-4 px-1">
                        <Tabs defaultValue="interior" className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="interior">Interior</TabsTrigger>
                                <TabsTrigger value="exterior">Exterior</TabsTrigger>
                            </TabsList>

                            <TabsContent value="interior" className="mt-4 space-y-4">
                                {items.length === 0 ? (
                                    <Card>
                                        <CardContent className="flex flex-col items-center justify-center p-8 text-center">
                                            <CheckCircle className="h-12 w-12 text-emerald-100 mb-4" />
                                            <h3 className="font-medium text-slate-900">No Interior Equipment</h3>
                                            <p className="text-sm text-slate-500 mt-1">This vehicle has no tracked interior equipment.</p>
                                        </CardContent>
                                    </Card>
                                ) : (
                                    items.map(item => renderEquipmentCard(item))
                                )}
                            </TabsContent>

                            <TabsContent value="exterior" className="mt-4 space-y-4">
                                {Object.entries(groupedExterior).map(([section, sectionItems]) => {
                                    if (sectionItems.length === 0) return null;
                                    return (
                                        <Collapsible key={section} defaultOpen={false} className="border rounded-lg bg-white overflow-hidden shadow-sm">
                                            <CollapsibleTrigger className="flex items-center justify-between w-full p-4 hover:bg-slate-50 transition-colors group">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-semibold text-xs text-slate-500 uppercase tracking-wider">{section}</h3>
                                                    {sectionItems.some(i => ['Damaged', 'Missing', 'Maintenance'].includes(i.status)) && (
                                                        <Badge variant="destructive" className="text-[10px] h-5 px-1.5 ml-2">
                                                            {sectionItems.filter(i => ['Damaged', 'Missing', 'Maintenance'].includes(i.status)).length} Issues
                                                        </Badge>
                                                    )}
                                                </div>
                                                <ChevronDown className="h-4 w-4 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                            </CollapsibleTrigger>
                                            <CollapsibleContent>
                                                <div className="p-4 pt-0 grid gap-3 border-t bg-slate-50/50">
                                                    <div className="mt-4 grid gap-3">
                                                        {sectionItems.map(item => renderEquipmentCard(item))}
                                                    </div>
                                                </div>
                                            </CollapsibleContent>
                                        </Collapsible>
                                    );
                                })}
                            </TabsContent>
                        </Tabs>
                    </div>
                </CollapsibleContent>
            </Collapsible>
            
            <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
                <DialogContent className="max-h-[90vh] flex flex-col p-0 overflow-hidden sm:max-w-xl bg-slate-50">
                    <div className="shrink-0 p-6 pb-4 bg-white border-b border-slate-100">
                        <DialogHeader>
                            <DialogTitle className="text-xl">Report Damage</DialogTitle>
                            <DialogDescription className="text-base text-slate-500 mt-1">
                                Please describe the damage or issue with the <strong className="text-slate-900">{selectedItem?.name}</strong>.
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-8">
                        {/* Damage Types */}
                        <div className="space-y-3">
                            <Label className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Type of Damage</Label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {DAMAGE_TYPES.map(type => {
                                    const isSelected = selectedDamageTypes.includes(type);
                                    return (
                                        <div
                                            key={type}
                                            onClick={() => {
                                                setSelectedDamageTypes(prev => {
                                                    const newTypes = prev.includes(type) 
                                                        ? prev.filter(t => t !== type)
                                                        : [...prev, type];
                                                    
                                                    // Auto-set severity to Critical if 'Missing' is selected
                                                    if (newTypes.includes('Missing')) {
                                                        setSeverity('Critical');
                                                    }
                                                    
                                                    return newTypes;
                                                });
                                            }}
                                            className={`
                                                relative flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 select-none
                                                ${isSelected 
                                                    ? 'border-red-600 bg-red-50/50 shadow-sm' 
                                                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                                                }
                                            `}
                                        >
                                            <div className={`
                                                flex items-center justify-center w-10 h-10 rounded-lg transition-colors
                                                ${isSelected ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}
                                            `}>
                                                {type.includes('Scratches') && <Scissors className="h-5 w-5" />}
                                                {type.includes('Dents') && <Minimize2 className="h-5 w-5" />}
                                                {type.includes('Chips') && <Grid className="h-5 w-5" />}
                                                {type.includes('Cracks') && <Zap className="h-5 w-5" />}
                                                {type.includes('Punctures') && <Target className="h-5 w-5" />}
                                                {type.includes('Missing') && <SearchX className="h-5 w-5" />}
                                            </div>
                                            <span className={`font-medium text-sm ${isSelected ? 'text-red-900' : 'text-slate-700'}`}>
                                                {type}
                                            </span>
                                            {isSelected && (
                                                <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-red-600 animate-in zoom-in duration-200" />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Severity */}
                        <div className="space-y-3">
                            <Label className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Severity Level</Label>
                            <div className="grid grid-cols-3 gap-3">
                                {SEVERITY_LEVELS.map(level => {
                                    const isSelected = severity === level;
                                    const isCosmetic = level === 'Cosmetic';
                                    const isMonitor = level === 'Monitor';
                                    const isCritical = level === 'Critical';

                                    let activeClass = '';
                                    if (isSelected) {
                                        if (isCosmetic) activeClass = 'bg-yellow-50 border-yellow-500 text-yellow-700 ring-1 ring-yellow-500';
                                        if (isMonitor) activeClass = 'bg-orange-50 border-orange-500 text-orange-700 ring-1 ring-orange-500';
                                        if (isCritical) activeClass = 'bg-red-50 border-red-500 text-red-700 ring-1 ring-red-500';
                                    } else {
                                        activeClass = 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50';
                                    }

                                    return (
                                        <div
                                            key={level}
                                            onClick={() => setSeverity(level)}
                                            className={`
                                                flex flex-col items-center justify-center py-3 px-2 rounded-lg border-2 cursor-pointer transition-all duration-200 gap-2
                                                ${activeClass}
                                            `}
                                        >
                                            {isCosmetic && <Info className={`h-5 w-5 ${isSelected ? 'text-yellow-600' : 'text-slate-400'}`} />}
                                            {isMonitor && <Eye className={`h-5 w-5 ${isSelected ? 'text-orange-600' : 'text-slate-400'}`} />}
                                            {isCritical && <AlertTriangle className={`h-5 w-5 ${isSelected ? 'text-red-600' : 'text-slate-400'}`} />}
                                            <span className="font-semibold text-sm">{level}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Notes */}
                        <div className="space-y-3">
                            <Label htmlFor="damage-notes" className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Additional Details</Label>
                            <Textarea 
                                id="damage-notes" 
                                placeholder="Please describe exactly where the damage is and how it happened..." 
                                value={damageNotes}
                                onChange={(e) => setDamageNotes(e.target.value)}
                                className="min-h-[100px] resize-none bg-white border-slate-200 focus:border-slate-400 focus:ring-slate-400"
                            />
                        </div>
                    </div>
                    
                    <div className="shrink-0 p-6 bg-white border-t border-slate-100 flex justify-end gap-3">
                        <Button variant="ghost" size="lg" onClick={() => setReportDialogOpen(false)} className="font-medium text-slate-600">Cancel</Button>
                        <Button 
                            className="bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-200" 
                            size="lg"
                            onClick={submitDamageReport} 
                            disabled={reporting}
                        >
                            {reporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Submit Damage Report
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}