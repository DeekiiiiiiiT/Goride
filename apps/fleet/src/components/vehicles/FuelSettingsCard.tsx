import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Fuel, Pencil, Check, X, Info } from 'lucide-react';
import { Vehicle } from '../../types/vehicle';
import { FuelType } from '../../types/fuel';
import { toast } from "sonner@2.0.3";
import { api } from '../../services/api';

interface FuelSettingsCardProps {
    vehicle: Vehicle;
    onUpdate?: (vehicle: Vehicle) => void;
}

const FUEL_TYPES: { value: FuelType; label: string }[] = [
    { value: 'Gasoline_87', label: 'Regular Unleaded (87)' },
    { value: 'Gasoline_91', label: 'Premium Unleaded (91)' },
    { value: 'Gasoline_93', label: 'Super Premium (93)' },
    { value: 'Diesel', label: 'Diesel' },
    { value: 'Electric', label: 'Electric (EV)' },
    { value: 'Hybrid', label: 'Hybrid' },
];

export function FuelSettingsCard({ vehicle, onUpdate }: FuelSettingsCardProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const [formData, setFormData] = useState({
        fuelType: vehicle.fuelSettings?.fuelType || 'Gasoline_87',
        efficiencyCity: vehicle.fuelSettings?.efficiencyCity || 12, // Default 12 L/100km
        efficiencyHighway: vehicle.fuelSettings?.efficiencyHighway || 15, // Default 15 L/100km
        tankCapacity: vehicle.fuelSettings?.tankCapacity || 50, // Default 50L
    });

    const handleSave = async () => {
        setIsLoading(true);
        try {
            const updatedVehicle: Vehicle = {
                ...vehicle,
                fuelSettings: {
                    fuelType: formData.fuelType as FuelType,
                    efficiencyCity: parseFloat(formData.efficiencyCity.toString()),
                    efficiencyHighway: parseFloat(formData.efficiencyHighway.toString()),
                    tankCapacity: parseFloat(formData.tankCapacity.toString())
                }
            };

            await api.saveVehicle(updatedVehicle);
            
            toast.success("Fuel settings updated");
            if (onUpdate) onUpdate(updatedVehicle);
            setIsEditing(false);
        } catch (error) {
            console.error("Failed to save fuel settings", error);
            toast.error("Failed to save fuel settings");
        } finally {
            setIsLoading(false);
        }
    };

    const handleCancel = () => {
        setFormData({
            fuelType: vehicle.fuelSettings?.fuelType || 'Gasoline_87',
            efficiencyCity: vehicle.fuelSettings?.efficiencyCity || 12,
            efficiencyHighway: vehicle.fuelSettings?.efficiencyHighway || 15,
            tankCapacity: vehicle.fuelSettings?.tankCapacity || 50,
        });
        setIsEditing(false);
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                    <CardTitle>Fuel Specifications</CardTitle>
                    <CardDescription>Efficiency metrics for cost calculation</CardDescription>
                </div>
                {!isEditing ? (
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setIsEditing(true)}>
                        <Pencil className="h-4 w-4 text-slate-500 hover:text-indigo-600" />
                    </Button>
                ) : (
                    <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-rose-500" onClick={handleCancel}>
                            <X className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-500" onClick={handleSave} disabled={isLoading}>
                            <Check className="h-4 w-4" />
                        </Button>
                    </div>
                )}
            </CardHeader>
            <CardContent>
                {isEditing ? (
                    <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                        <div className="space-y-2">
                            <Label>Fuel Type</Label>
                            <Select 
                                value={formData.fuelType} 
                                onValueChange={(val) => setFormData(prev => ({ ...prev, fuelType: val as FuelType }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {FUEL_TYPES.map(t => (
                                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs">City Efficiency (L/100km)</Label>
                                <Input 
                                    type="number" 
                                    step="0.1"
                                    value={formData.efficiencyCity}
                                    onChange={(e) => setFormData(prev => ({ ...prev, efficiencyCity: parseFloat(e.target.value) }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Highway Efficiency (L/100km)</Label>
                                <Input 
                                    type="number" 
                                    step="0.1"
                                    value={formData.efficiencyHighway}
                                    onChange={(e) => setFormData(prev => ({ ...prev, efficiencyHighway: parseFloat(e.target.value) }))}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs">Tank Capacity (Liters)</Label>
                            <Input 
                                type="number"
                                value={formData.tankCapacity}
                                onChange={(e) => setFormData(prev => ({ ...prev, tankCapacity: parseFloat(e.target.value) }))}
                            />
                        </div>
                        <div className="bg-blue-50 p-2 rounded text-xs text-blue-700 flex gap-2">
                            <Info className="h-4 w-4 shrink-0" />
                            <p>These values are used to calculate "Operating Fuel Cost" for weekly reconciliation.</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                            <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                                <Fuel className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider">Fuel Type</p>
                                <p className="font-medium text-slate-900">
                                    {FUEL_TYPES.find(t => t.value === formData.fuelType)?.label || formData.fuelType}
                                </p>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-xs text-slate-500">City Efficiency</Label>
                                <div className="text-lg font-semibold text-slate-900">{formData.efficiencyCity} <span className="text-xs text-slate-400 font-normal">L/100km</span></div>
                            </div>
                            <div>
                                <Label className="text-xs text-slate-500">Highway Efficiency</Label>
                                <div className="text-lg font-semibold text-slate-900">{formData.efficiencyHighway} <span className="text-xs text-slate-400 font-normal">L/100km</span></div>
                            </div>
                            <div>
                                <Label className="text-xs text-slate-500">Tank Capacity</Label>
                                <div className="text-lg font-semibold text-slate-900">{formData.tankCapacity} <span className="text-xs text-slate-400 font-normal">L</span></div>
                            </div>
                            <div>
                                <Label className="text-xs text-slate-500">Est. Range</Label>
                                <div className="text-lg font-semibold text-slate-900">
                                    {formData.efficiencyCity > 0 ? Math.round((formData.tankCapacity / formData.efficiencyCity) * 100) : 0} - {formData.efficiencyHighway > 0 ? Math.round((formData.tankCapacity / formData.efficiencyHighway) * 100) : 0} <span className="text-xs text-slate-400 font-normal">km</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}