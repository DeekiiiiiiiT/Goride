import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Vehicle } from '../../types/vehicle';
import { EquipmentTemplate } from '../../services/templateService';
import { InventoryItem } from '../../types/fleet';
import { Checkbox } from "../ui/checkbox";
import { ScrollArea } from "../ui/scroll-area";
import { Label } from "../ui/label";

interface BulkAssignmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    vehicles: Vehicle[];
    templates: EquipmentTemplate[];
    inventory: InventoryItem[];
    onConfirm: (vehicleIds: string[], sourceId: string, sourceType: 'template' | 'inventory') => Promise<void>;
}

export function BulkAssignmentModal({ isOpen, onClose, vehicles, templates, inventory, onConfirm }: BulkAssignmentModalProps) {
    const [step, setStep] = useState(1);
    const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
    const [sourceType, setSourceType] = useState<'template' | 'inventory'>('template');
    const [selectedSourceId, setSelectedSourceId] = useState<string>('');
    const [loading, setLoading] = useState(false);

    const handleNext = () => setStep(s => s + 1);
    const handleBack = () => setStep(s => s - 1);
    
    const handleConfirm = async () => {
        setLoading(true);
        try {
            await onConfirm(selectedVehicles, selectedSourceId, sourceType);
            onClose();
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const toggleVehicle = (id: string) => {
        setSelectedVehicles(prev => 
            prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]
        );
    };

    const selectAllVehicles = () => {
        if (selectedVehicles.length === vehicles.length) {
            setSelectedVehicles([]);
        } else {
            setSelectedVehicles(vehicles.map(v => v.id));
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Bulk Equipment Assignment - Step {step} of 3</DialogTitle>
                    <DialogDescription>
                        {step === 1 && "Select vehicles to assign equipment to."}
                        {step === 2 && "Select equipment source (Template or Inventory)."}
                        {step === 3 && "Review and confirm assignment."}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    {step === 1 && (
                        <div className="space-y-4">
                            <div className="flex items-center space-x-2 pb-2 border-b">
                                <Checkbox 
                                    checked={selectedVehicles.length === vehicles.length && vehicles.length > 0} 
                                    onCheckedChange={selectAllVehicles}
                                />
                                <Label>Select All ({vehicles.length})</Label>
                            </div>
                            <ScrollArea className="h-[300px]">
                                <div className="space-y-2">
                                    {vehicles.map(v => (
                                        <div key={v.id} className="flex items-center space-x-2 p-2 hover:bg-slate-50 rounded">
                                            <Checkbox 
                                                checked={selectedVehicles.includes(v.id)}
                                                onCheckedChange={() => toggleVehicle(v.id)}
                                            />
                                            <div className="text-sm">
                                                <div className="font-medium">{v.licensePlate}</div>
                                                <div className="text-muted-foreground text-xs">{v.make} {v.model}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4">
                            <div className="flex space-x-4 mb-4">
                                <Button 
                                    variant={sourceType === 'template' ? 'default' : 'outline'}
                                    onClick={() => { setSourceType('template'); setSelectedSourceId(''); }}
                                    className="flex-1"
                                >
                                    Use Template
                                </Button>
                                <Button 
                                    variant={sourceType === 'inventory' ? 'default' : 'outline'}
                                    onClick={() => { setSourceType('inventory'); setSelectedSourceId(''); }}
                                    className="flex-1"
                                >
                                    From Inventory
                                </Button>
                            </div>

                            <ScrollArea className="h-[300px]">
                                {sourceType === 'template' ? (
                                    <div className="grid grid-cols-1 gap-2">
                                        {templates.map(t => (
                                            <div 
                                                key={t.id}
                                                className={`p-3 border rounded cursor-pointer ${selectedSourceId === t.id ? 'border-primary bg-primary/5' : 'hover:bg-slate-50'}`}
                                                onClick={() => setSelectedSourceId(t.id)}
                                            >
                                                <div className="font-medium">{t.name}</div>
                                                <div className="text-xs text-muted-foreground">{t.items.length} items</div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-2">
                                        {inventory.map(i => (
                                            <div 
                                                key={i.id}
                                                className={`p-3 border rounded cursor-pointer flex justify-between ${selectedSourceId === i.id ? 'border-primary bg-primary/5' : 'hover:bg-slate-50'}`}
                                                onClick={() => setSelectedSourceId(i.id)}
                                            >
                                                <div>
                                                    <div className="font-medium">{i.name}</div>
                                                    <div className="text-xs text-muted-foreground">{i.category}</div>
                                                </div>
                                                <div className="text-sm font-semibold">Qty: {i.quantity}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </ScrollArea>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-4">
                            <div className="bg-slate-50 p-4 rounded-lg space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Target Vehicles:</span>
                                    <span className="font-medium">{selectedVehicles.length} selected</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Source Type:</span>
                                    <span className="font-medium capitalize">{sourceType}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Item/Template:</span>
                                    <span className="font-medium">
                                        {sourceType === 'template' 
                                            ? templates.find(t => t.id === selectedSourceId)?.name 
                                            : inventory.find(i => i.id === selectedSourceId)?.name
                                        }
                                    </span>
                                </div>
                            </div>
                            <div className="text-sm text-yellow-600 bg-yellow-50 p-3 rounded border border-yellow-200">
                                Warning: This action cannot be easily undone. Items will be assigned immediately.
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    {step > 1 && (
                        <Button variant="outline" onClick={handleBack} disabled={loading}>Back</Button>
                    )}
                    {step < 3 ? (
                        <Button onClick={handleNext} disabled={selectedVehicles.length === 0 || (step === 2 && !selectedSourceId)}>Next</Button>
                    ) : (
                        <Button onClick={handleConfirm} disabled={loading}>
                            {loading ? "Processing..." : "Confirm Assignment"}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
