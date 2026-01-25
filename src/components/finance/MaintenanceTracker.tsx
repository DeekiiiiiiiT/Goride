import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { FinancialTransaction } from "../../types/data";
import { Wrench, Plus, AlertTriangle, CalendarClock } from "lucide-react";
import { formatSafeDate, parseSafeDate } from "../../utils/timeUtils";

interface MaintenanceTrackerProps {
  transactions: FinancialTransaction[];
  onAddTransaction: (txn: FinancialTransaction) => void;
  vehicles: { id: string; plate: string }[];
}

export function MaintenanceTracker({ transactions, onAddTransaction, vehicles }: MaintenanceTrackerProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    vehicleId: '',
    serviceType: 'Oil Change',
    odometer: '',
    provider: '',
    partsCost: '',
    laborCost: '',
    totalCost: '',
    nextDue: ''
  });

  const maintenanceTxns = useMemo(() => 
    transactions.filter(t => t.category === 'Maintenance').sort((a, b) => parseSafeDate(b.date).getTime() - parseSafeDate(a.date).getTime()),
  [transactions]);

  const stats = useMemo(() => {
    const totalCost = maintenanceTxns.reduce((acc, t) => acc + Math.abs(t.amount), 0);
    const count = maintenanceTxns.length;
    return {
        totalCost,
        avgCost: count > 0 ? totalCost / count : 0,
        lastService: maintenanceTxns[0]?.date || 'N/A'
    };
  }, [maintenanceTxns]);

  const handleSubmit = () => {
    const parts = parseFloat(formData.partsCost) || 0;
    const labor = parseFloat(formData.laborCost) || 0;
    const total = parseFloat(formData.totalCost) || (parts + labor);
    
    const newTxn: FinancialTransaction = {
        id: `txn_maint_${Date.now()}`,
        date: formData.date,
        time: '09:00',
        vehicleId: formData.vehicleId,
        type: 'Expense',
        category: 'Maintenance',
        description: `Service: ${formData.serviceType} - ${formData.provider}`,
        amount: -Math.abs(total),
        paymentMethod: 'Bank Transfer',
        status: 'Completed',
        isReconciled: false,
        odometer: parseFloat(formData.odometer),
        subType: formData.serviceType,
        vendor: formData.provider,
        partsCost: parts,
        laborCost: labor,
        notes: `Next due: ${formData.nextDue}`
    };
    
    onAddTransaction(newTxn);
    setIsOpen(false);
    setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        vehicleId: '',
        serviceType: 'Oil Change',
        odometer: '',
        provider: '',
        partsCost: '',
        laborCost: '',
        totalCost: '',
        nextDue: ''
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
              <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                      <div className="p-2 bg-purple-100 rounded-full text-purple-600">
                          <Wrench className="h-4 w-4" />
                      </div>
                      <div>
                          <p className="text-xs text-slate-500 font-medium uppercase">Total Maint. Cost</p>
                          <h3 className="text-2xl font-bold text-slate-900">${stats.totalCost.toFixed(2)}</h3>
                      </div>
                  </div>
              </CardContent>
          </Card>
           <Card>
              <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                      <div className="p-2 bg-slate-100 rounded-full text-slate-600">
                          <CalendarClock className="h-4 w-4" />
                      </div>
                      <div>
                          <p className="text-xs text-slate-500 font-medium uppercase">Last Service</p>
                          <h3 className="text-xl font-bold text-slate-900">{stats.lastService}</h3>
                      </div>
                  </div>
              </CardContent>
          </Card>
          
          <div className="md:col-span-2 flex items-center justify-end">
             <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogTrigger asChild>
                    <Button className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
                        <Plus className="h-4 w-4" /> Log Maintenance
                    </Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Log Maintenance</DialogTitle>
                        <DialogDescription>Record a service or repair event.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Date</Label>
                                <Input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
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
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Service Type</Label>
                                <Select value={formData.serviceType} onValueChange={v => setFormData({...formData, serviceType: v})}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Oil Change">Oil Change</SelectItem>
                                        <SelectItem value="Tires">Tires</SelectItem>
                                        <SelectItem value="Brakes">Brakes</SelectItem>
                                        <SelectItem value="Inspection">Inspection</SelectItem>
                                        <SelectItem value="Repair">Repair</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Odometer</Label>
                                <Input type="number" placeholder="12345" value={formData.odometer} onChange={e => setFormData({...formData, odometer: e.target.value})} />
                            </div>
                        </div>
                        <div className="space-y-2">
                             <Label>Service Provider</Label>
                             <Input placeholder="e.g. Mechanic Shop" value={formData.provider} onChange={e => setFormData({...formData, provider: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>Parts Cost</Label>
                                <Input type="number" value={formData.partsCost} onChange={e => setFormData({...formData, partsCost: e.target.value})} />
                            </div>
                            <div className="space-y-2">
                                <Label>Labor Cost</Label>
                                <Input type="number" value={formData.laborCost} onChange={e => setFormData({...formData, laborCost: e.target.value})} />
                            </div>
                            <div className="space-y-2">
                                <Label>Total Cost</Label>
                                <Input type="number" value={formData.totalCost} onChange={e => setFormData({...formData, totalCost: e.target.value})} />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmit} disabled={!formData.vehicleId}>Save Record</Button>
                    </DialogFooter>
                </DialogContent>
             </Dialog>
          </div>
      </div>

      <Card>
          <CardHeader>
              <CardTitle>Maintenance History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
              <Table>
                  <TableHeader>
                      <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Vehicle</TableHead>
                          <TableHead>Service</TableHead>
                          <TableHead>Provider</TableHead>
                          <TableHead className="text-right">Parts</TableHead>
                          <TableHead className="text-right">Labor</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {maintenanceTxns.length > 0 ? (
                          maintenanceTxns.slice(0, 10).map(t => (
                              <TableRow key={t.id}>
                                  <TableCell>{formatSafeDate(t.date)}</TableCell>
                                  <TableCell><span className="font-mono text-xs">{t.vehicleId || '-'}</span></TableCell>
                                  <TableCell>{t.subType}</TableCell>
                                  <TableCell>{t.vendor}</TableCell>
                                  <TableCell className="text-right">{t.partsCost ? `$${t.partsCost}` : '-'}</TableCell>
                                  <TableCell className="text-right">{t.laborCost ? `$${t.laborCost}` : '-'}</TableCell>
                                  <TableCell className="text-right font-bold text-rose-600">${Math.abs(t.amount).toFixed(2)}</TableCell>
                              </TableRow>
                          ))
                      ) : (
                          <TableRow>
                              <TableCell colSpan={7} className="h-24 text-center text-slate-500">No maintenance records found.</TableCell>
                          </TableRow>
                      )}
                  </TableBody>
              </Table>
          </CardContent>
      </Card>
    </div>
  );
}
