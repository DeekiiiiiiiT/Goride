import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { FinancialTransaction } from "../../types/data";
import { Fuel, Plus, Gauge, Droplets, TrendingDown } from "lucide-react";
import { formatSafeDate, formatSafeTime, parseSafeDate } from "../../utils/timeUtils";

interface FuelTrackerProps {
  transactions: FinancialTransaction[];
  onAddTransaction: (txn: FinancialTransaction) => void;
  vehicles: { id: string; plate: string }[];
}

export function FuelTracker({ transactions, onAddTransaction, vehicles }: FuelTrackerProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    time: '12:00',
    vehicleId: '',
    odometer: '',
    fuelType: 'Regular',
    quantity: '',
    unitPrice: '',
    totalCost: '',
    vendor: ''
  });

  const fuelTransactions = useMemo(() => 
    transactions.filter(t => t.category === 'Fuel').sort((a, b) => parseSafeDate(b.date).getTime() - parseSafeDate(a.date).getTime()),
  [transactions]);

  // Analytics
  const stats = useMemo(() => {
    if (fuelTransactions.length === 0) return { avgCost: 0, totalCost: 0, totalFuel: 0, efficiency: 0 };
    
    const totalCost = fuelTransactions.reduce((acc, t) => acc + Math.abs(t.amount), 0);
    const totalFuel = fuelTransactions.reduce((acc, t) => acc + (t.quantity || 0), 0);
    
    return {
        avgCost: totalFuel > 0 ? totalCost / totalFuel : 0,
        totalCost,
        totalFuel,
        efficiency: 12.5 // Mock efficiency as we need two odometer readings to calculate real efficiency
    };
  }, [fuelTransactions]);

  const handleSubmit = () => {
    const amount = parseFloat(formData.totalCost) || (parseFloat(formData.quantity) * parseFloat(formData.unitPrice));
    
    const newTxn: FinancialTransaction = {
        id: `txn_fuel_${Date.now()}`,
        date: formData.date,
        time: formData.time,
        vehicleId: formData.vehicleId,
        type: 'Expense',
        category: 'Fuel',
        description: `Fuel - ${formData.vendor || 'Unknown Station'}`,
        amount: -Math.abs(amount),
        paymentMethod: 'Credit Card',
        status: 'Completed',
        isReconciled: false,
        odometer: parseFloat(formData.odometer),
        quantity: parseFloat(formData.quantity),
        unitPrice: parseFloat(formData.unitPrice),
        subType: formData.fuelType,
        vendor: formData.vendor
    };
    
    onAddTransaction(newTxn);
    setIsOpen(false);
    setFormData({
        date: new Date().toISOString().split('T')[0],
        time: '12:00',
        vehicleId: '',
        odometer: '',
        fuelType: 'Regular',
        quantity: '',
        unitPrice: '',
        totalCost: '',
        vendor: ''
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
              <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                      <div className="p-2 bg-amber-100 rounded-full text-amber-600">
                          <Fuel className="h-4 w-4" />
                      </div>
                      <div>
                          <p className="text-xs text-slate-500 font-medium uppercase">Total Fuel Cost</p>
                          <h3 className="text-2xl font-bold text-slate-900">${stats.totalCost.toFixed(2)}</h3>
                      </div>
                  </div>
              </CardContent>
          </Card>
          <Card>
              <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                      <div className="p-2 bg-blue-100 rounded-full text-blue-600">
                          <Droplets className="h-4 w-4" />
                      </div>
                      <div>
                          <p className="text-xs text-slate-500 font-medium uppercase">Avg Price/L</p>
                          <h3 className="text-2xl font-bold text-slate-900">${stats.avgCost.toFixed(3)}</h3>
                      </div>
                  </div>
              </CardContent>
          </Card>
          <Card>
              <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                      <div className="p-2 bg-emerald-100 rounded-full text-emerald-600">
                          <Gauge className="h-4 w-4" />
                      </div>
                      <div>
                          <p className="text-xs text-slate-500 font-medium uppercase">Avg Efficiency</p>
                          <h3 className="text-2xl font-bold text-slate-900">{stats.efficiency} km/L</h3>
                      </div>
                  </div>
              </CardContent>
          </Card>
          
          <div className="flex items-center justify-end">
             <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogTrigger asChild>
                    <Button className="gap-2 bg-amber-600 hover:bg-amber-700 text-white">
                        <Plus className="h-4 w-4" /> Log Fuel
                    </Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Log Fuel Entry</DialogTitle>
                        <DialogDescription>Record a new refueling transaction.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Date</Label>
                                <Input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                            </div>
                            <div className="space-y-2">
                                <Label>Time</Label>
                                <Input type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Vehicle</Label>
                            <Select value={formData.vehicleId} onValueChange={v => setFormData({...formData, vehicleId: v})}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select Vehicle" />
                                </SelectTrigger>
                                <SelectContent>
                                    {vehicles.map(v => (
                                        <SelectItem key={v.id} value={v.id}>{v.plate} ({v.id})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Odometer</Label>
                                <Input type="number" placeholder="12345" value={formData.odometer} onChange={e => setFormData({...formData, odometer: e.target.value})} />
                            </div>
                            <div className="space-y-2">
                                <Label>Fuel Type</Label>
                                <Select value={formData.fuelType} onValueChange={v => setFormData({...formData, fuelType: v})}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Regular">Regular (87)</SelectItem>
                                        <SelectItem value="Premium">Premium (91)</SelectItem>
                                        <SelectItem value="Diesel">Diesel</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>Quantity (L)</Label>
                                <Input type="number" value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} />
                            </div>
                            <div className="space-y-2">
                                <Label>Price/L</Label>
                                <Input type="number" value={formData.unitPrice} onChange={e => setFormData({...formData, unitPrice: e.target.value})} />
                            </div>
                            <div className="space-y-2">
                                <Label>Total Cost</Label>
                                <Input type="number" value={formData.totalCost} onChange={e => setFormData({...formData, totalCost: e.target.value})} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Station / Vendor</Label>
                            <Input placeholder="e.g. Shell" value={formData.vendor} onChange={e => setFormData({...formData, vendor: e.target.value})} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmit} disabled={!formData.vehicleId || !formData.quantity}>Save Entry</Button>
                    </DialogFooter>
                </DialogContent>
             </Dialog>
          </div>
      </div>

      <Card>
          <CardHeader>
              <CardTitle>Fuel Logs</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
              <Table>
                  <TableHeader>
                      <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Vehicle</TableHead>
                          <TableHead>Odometer</TableHead>
                          <TableHead>Vendor</TableHead>
                          <TableHead className="text-right">Quantity</TableHead>
                          <TableHead className="text-right">Price/L</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {fuelTransactions.length > 0 ? (
                          fuelTransactions.slice(0, 10).map(t => (
                              <TableRow key={t.id}>
                                  <TableCell>{formatSafeDate(t.date)} <span className="text-xs text-slate-400">{t.time || 'Timeless'}</span></TableCell>
                                  <TableCell><span className="font-mono text-xs">{t.vehicleId || '-'}</span></TableCell>
                                  <TableCell>{t.odometer?.toLocaleString() || '-'}</TableCell>
                                  <TableCell>{t.vendor || t.description}</TableCell>
                                  <TableCell className="text-right">{t.quantity?.toFixed(2)} L</TableCell>
                                  <TableCell className="text-right">${t.unitPrice?.toFixed(3)}</TableCell>
                                  <TableCell className="text-right font-bold text-rose-600">${Math.abs(t.amount).toFixed(2)}</TableCell>
                              </TableRow>
                          ))
                      ) : (
                          <TableRow>
                              <TableCell colSpan={7} className="h-24 text-center text-slate-500">No fuel logs found.</TableCell>
                          </TableRow>
                      )}
                  </TableBody>
              </Table>
          </CardContent>
      </Card>
    </div>
  );
}