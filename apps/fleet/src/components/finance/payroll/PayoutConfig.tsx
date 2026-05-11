import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { Save } from "lucide-react";

interface DriverConfig {
  driverId: string;
  driverName: string;
  type: 'Commission' | 'Salary';
  rate: number; // Percentage or Fixed Amount
  frequency: 'Weekly' | 'Bi-Weekly' | 'Monthly';
}

interface PayoutConfigProps {
  drivers: { id: string; name: string }[];
  onSaveConfig: (config: DriverConfig[]) => void;
}

export function PayoutConfig({ drivers, onSaveConfig }: PayoutConfigProps) {
  // Initialize with default values
  const [configs, setConfigs] = useState<DriverConfig[]>(
    drivers.map(d => ({
        driverId: d.id,
        driverName: d.name,
        type: 'Commission',
        rate: 70, // Default 70%
        frequency: 'Weekly'
    }))
  );

  const handleUpdate = (id: string, field: keyof DriverConfig, value: any) => {
    setConfigs(prev => prev.map(c => c.driverId === id ? { ...c, [field]: value } : c));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
            <div>
                <CardTitle>Driver Payout Configuration</CardTitle>
                <CardDescription>Set commission rates and payment schedules.</CardDescription>
            </div>
            <Button onClick={() => onSaveConfig(configs)} className="gap-2">
                <Save className="h-4 w-4" /> Save Changes
            </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Driver Name</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Rate / Salary</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Status</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {configs.map(config => (
                    <TableRow key={config.driverId}>
                        <TableCell className="font-medium">{config.driverName}</TableCell>
                        <TableCell>
                            <select 
                                className="bg-transparent border-none text-sm focus:ring-0"
                                value={config.type}
                                onChange={(e) => handleUpdate(config.driverId, 'type', e.target.value)}
                            >
                                <option value="Commission">Commission</option>
                                <option value="Salary">Fixed Salary</option>
                            </select>
                        </TableCell>
                        <TableCell>
                            <div className="flex items-center gap-1">
                                {config.type === 'Salary' && <span className="text-slate-500">$</span>}
                                <Input 
                                    type="number" 
                                    className="h-8 w-20" 
                                    value={config.rate}
                                    onChange={(e) => handleUpdate(config.driverId, 'rate', parseFloat(e.target.value))}
                                />
                                {config.type === 'Commission' && <span className="text-slate-500">%</span>}
                            </div>
                        </TableCell>
                        <TableCell>
                             <select 
                                className="bg-transparent border-none text-sm focus:ring-0"
                                value={config.frequency}
                                onChange={(e) => handleUpdate(config.driverId, 'frequency', e.target.value)}
                            >
                                <option value="Weekly">Weekly</option>
                                <option value="Bi-Weekly">Bi-Weekly</option>
                                <option value="Monthly">Monthly</option>
                            </select>
                        </TableCell>
                        <TableCell>
                            <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">Active</Badge>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
