import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Button } from "../ui/button";
import { Fuel, Save } from "lucide-react";
import { Vehicle } from '../../types/vehicle';
import { toast } from "sonner@2.0.3";
import { api } from '../../services/api';

interface FuelSettingsCardProps {
    vehicle: Vehicle;
    onSave: (vehicle: Vehicle) => void;
}

export function FuelSettingsCard({ vehicle, onSave }: FuelSettingsCardProps) {
    const [fuelType, setFuelType] = useState<string>(vehicle.fuelSettings?.fuelType || 'Gasoline_87');
    const [cityEff, setCityEff] = useState<string>(vehicle.fuelSettings?.efficiencyCity?.toString() || '');
    const [hwyEff, setHwyEff] = useState<string>(vehicle.fuelSettings?.efficiencyHighway?.toString() || '');
    const [tankCap, setTankCap] = useState<string>(vehicle.fuelSettings?.tankCapacity?.toString() || '');
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        setFuelType(vehicle.fuelSettings?.fuelType || 'Gasoline_87');
        setCityEff(vehicle.fuelSettings?.efficiencyCity?.toString() || '');
        setHwyEff(vehicle.fuelSettings?.efficiencyHighway?.toString() || '');
        setTankCap(vehicle.fuelSettings?.tankCapacity?.toString() || '');
        setIsDirty(false);
    }, [vehicle]);

    const handleChange = (setter: React.Dispatch<React.SetStateAction<string>>, value: string) => {
        setter(value);
        setIsDirty(true);
    };

    const handleSave = async () => {
        const city = parseFloat(cityEff);
        const hwy = parseFloat(hwyEff);
        const tank = parseFloat(tankCap);

        if (isNaN(city) || isNaN(hwy) || isNaN(tank)) {
            toast.error("Please enter valid numbers for efficiency and tank capacity");
            return;
        }

        const updatedVehicle: Vehicle = {
            ...vehicle,
            fuelSettings: {
                fuelType: fuelType as any,
                efficiencyCity: city,
                efficiencyHighway: hwy,
                tankCapacity: tank
            }
        };

        try {
            await api.saveVehicle(updatedVehicle);
            onSave(updatedVehicle);
            setIsDirty(false);
            toast.success("Fuel settings saved");
        } catch (error) {
            console.error("Failed to save fuel settings", error);
            toast.error("Failed to save fuel settings");
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Fuel className="h-5 w-5 text-indigo-600" />
                    Fuel Configuration
                </CardTitle>
                <CardDescription>
                    Configure fuel efficiency and tank details for accurate cost calculations.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Fuel Type</Label>
                        <Select value={fuelType} onValueChange={(v) => { setFuelType(v); setIsDirty(true); }}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Gasoline_87">Gasoline (87 Regular)</SelectItem>
                                <SelectItem value="Gasoline_91">Gasoline (91 Premium)</SelectItem>
                                <SelectItem value="Gasoline_93">Gasoline (93 Super)</SelectItem>
                                <SelectItem value="Diesel">Diesel</SelectItem>
                                <SelectItem value="Electric">Electric</SelectItem>
                                <SelectItem value="Hybrid">Hybrid</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Tank Capacity (L)</Label>
                        <Input 
                            type="number" 
                            value={tankCap} 
                            onChange={(e) => handleChange(setTankCap, e.target.value)}
                            placeholder="e.g. 60"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>City Efficiency (L/100km)</Label>
                        <Input 
                            type="number" 
                            value={cityEff} 
                            onChange={(e) => handleChange(setCityEff, e.target.value)}
                            placeholder="e.g. 10.5"
                        />
                        <p className="text-xs text-slate-500">Lower is better</p>
                    </div>
                    <div className="space-y-2">
                        <Label>Highway Efficiency (L/100km)</Label>
                        <Input 
                            type="number" 
                            value={hwyEff} 
                            onChange={(e) => handleChange(setHwyEff, e.target.value)}
                            placeholder="e.g. 7.2"
                        />
                        <p className="text-xs text-slate-500">Lower is better</p>
                    </div>
                </div>

                <div className="pt-2 flex justify-end">
                    <Button onClick={handleSave} disabled={!isDirty}>
                        <Save className="mr-2 h-4 w-4" />
                        Save Changes
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
