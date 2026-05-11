import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { AlertTriangle, Trash2, CheckCircle2, User, Fuel, Car, Ticket, FileText } from "lucide-react";
import { api } from "../../services/api";
import { toast } from "sonner@2.0.3";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import { Checkbox } from "../../components/ui/checkbox";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Badge } from "../../components/ui/badge";

interface DataResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function DataResetModal({ isOpen, onClose, onSuccess }: DataResetModalProps) {
  const [step, setStep] = useState<'select' | 'driver-select' | 'type-select' | 'date-select' | 'preview' | 'confirm' | 'processing' | 'success'>('select');
  const [target, setTarget] = useState<'trips' | 'transactions' | 'driver' | 'all' | 'date' | null>(null);
  const [progress, setProgress] = useState(0);
  const [drivers, setDrivers] = useState<{id: string, name: string}[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [previewItems, setPreviewItems] = useState<any[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [isAllTime, setIsAllTime] = useState(false);

  React.useEffect(() => {
      if (isOpen) {
          api.getDrivers().then(setDrivers).catch(console.error);
      }
  }, [isOpen]);
  
  const [dateConfig, setDateConfig] = useState<{
      type: 'upload' | 'record',
      startDate: string,
      endDate: string,
      targets: string[]
  }>({
      type: 'upload',
      startDate: '',
      endDate: '',
      targets: ['trips', 'tolls', 'fuel']
  });

  const handleSelect = (t: 'trips' | 'transactions' | 'driver' | 'all') => {
    setTarget(t);
    if (t === 'trips') {
        setDateConfig(prev => ({ ...prev, targets: ['trips'] }));
        setStep('type-select');
    } else if (t === 'transactions') {
        setDateConfig(prev => ({ ...prev, targets: ['tolls', 'fuel'] }));
        setStep('type-select');
    } else if (t === 'driver') {
        setDateConfig(prev => ({ ...prev, targets: ['trips', 'tolls', 'fuel'] }));
        setStep('driver-select');
    } else {
        setStep('confirm');
    }
  };

  const handleFetchPreview = async () => {
    setStep('processing');
    setProgress(30);

    const startDate = isAllTime ? '1970-01-01' : dateConfig.startDate;
    const endDate = isAllTime ? '2100-01-01' : dateConfig.endDate;

    if (!startDate || !endDate) {
        toast.error("Please select start and end dates or choose All Time");
        setStep('date-select');
        return;
    }

    try {
        const payload: any = {
            type: dateConfig.type,
            startDate,
            endDate,
            targets: dateConfig.targets,
            preview: true
        };

        if (target === 'driver') {
            if (!selectedDriverId) {
                toast.error("Please select a driver");
                setStep('driver-select');
                return;
            }
            payload.driverId = selectedDriverId;
        }

        const res = await api.resetDataByDate(payload);
        const items = res.items || [];
        setPreviewItems(items);
        setSelectedKeys(items.map((i: any) => i.key)); // Default select all
        setStep('preview');
        setProgress(0);

    } catch (error) {
        console.error("Preview failed", error);
        toast.error("Failed to fetch preview. Check console.");
        setStep('date-select');
    }
  };

  const handleConfirmDeletion = async () => {
      setStep('processing');
      setProgress(10);
      try {
          if (target === 'all') {
             // Nuclear option: All targets, All time
             await api.resetDataByDate({
                 type: 'record',
                 startDate: '1970-01-01',
                 endDate: '2100-01-01',
                 targets: ['trips', 'transactions']
             });
          } else {
             // Deletion by Keys
             if (selectedKeys.length === 0) {
                 toast.error("No items selected for deletion.");
                 setStep('preview');
                 return;
             }
             await api.resetDataByDate({ keys: selectedKeys });
          }

          setProgress(100);
          setStep('success');
          toast.success("Data successfully purged.");
          onSuccess();

      } catch (error) {
          console.error("Reset failed", error);
          toast.error("Failed to reset data. Check console.");
          setStep('select');
      }
  };

  const toggleDateTarget = (t: string) => {
      setDateConfig(prev => {
          if (prev.targets.includes(t)) {
              return { ...prev, targets: prev.targets.filter(x => x !== t) };
          } else {
              return { ...prev, targets: [...prev.targets, t] };
          }
      });
  };

  const toggleKeySelection = (key: string) => {
      setSelectedKeys(prev => 
          prev.includes(key) 
              ? prev.filter(k => k !== key)
              : [...prev, key]
      );
  };

  const toggleSelectAll = () => {
      if (selectedKeys.length === previewItems.length) {
          setSelectedKeys([]);
      } else {
          setSelectedKeys(previewItems.map(i => i.key));
      }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] w-full overflow-hidden max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-600">
            <AlertTriangle className="h-5 w-5" />
            Reset System Data
          </DialogTitle>
          <DialogDescription>
            {step === 'preview' ? 'Review the data that will be permanently deleted.' : 'This utility helps you clear corrupted data caused by the previous reconciliation logic.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'select' && (
          <div className="grid gap-4 py-4">
            <Button 
                variant="outline" 
                className="w-full h-auto p-4 flex justify-start items-start gap-4 whitespace-normal hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
                onClick={() => handleSelect('trips')}
            >
                <div className="bg-rose-100 p-2 rounded-full shrink-0">
                    <Trash2 className="h-4 w-4 text-rose-600" />
                </div>
                <div className="text-left flex-1">
                    <div className="font-semibold">Reset Imported Trips</div>
                    <div className="text-xs text-slate-500 leading-relaxed">
                        Filter and delete imported trips.
                    </div>
                </div>
            </Button>

            <Button 
                variant="outline" 
                className="w-full h-auto p-4 flex justify-start items-start gap-4 whitespace-normal hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200"
                onClick={() => handleSelect('transactions')}
            >
                <div className="bg-amber-100 p-2 rounded-full shrink-0">
                    <Trash2 className="h-4 w-4 text-amber-600" />
                </div>
                <div className="text-left flex-1">
                    <div className="font-semibold">Reset Toll Transactions</div>
                    <div className="text-xs text-slate-500 leading-relaxed">
                        Filter and delete toll transactions.
                    </div>
                </div>
            </Button>

            <Button 
                variant="outline" 
                className="w-full h-auto p-4 flex justify-start items-start gap-4 whitespace-normal hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200"
                onClick={() => handleSelect('driver')}
            >
                <div className="bg-indigo-100 p-2 rounded-full shrink-0">
                    <User className="h-4 w-4 text-indigo-600" />
                </div>
                <div className="text-left flex-1">
                    <div className="font-semibold">Reset Driver Data</div>
                    <div className="text-xs text-slate-500 leading-relaxed">
                        Purge trips and transactions for a specific driver.
                    </div>
                </div>
            </Button>

            <Button 
                variant="destructive" 
                className="w-full h-auto p-4 flex justify-start items-start gap-4 whitespace-normal"
                onClick={() => handleSelect('all')}
            >
                <div className="bg-white/20 p-2 rounded-full shrink-0">
                    <AlertTriangle className="h-4 w-4 text-white" />
                </div>
                <div className="text-left flex-1">
                    <div className="font-semibold text-white">Reset Everything</div>
                    <div className="text-xs text-rose-100 leading-relaxed">
                        Wipes all trips and transactions immediately.
                    </div>
                </div>
            </Button>
          </div>
        )}

        {step === 'driver-select' && (
             <div className="py-4 space-y-4">
                 <div className="space-y-2">
                    <Label>Select Driver</Label>
                    <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                        <SelectTrigger>
                            <SelectValue placeholder="Choose a driver..." />
                        </SelectTrigger>
                        <SelectContent>
                            {drivers.map(d => (
                                <SelectItem key={d.id} value={d.id}>{d.name || 'Unknown Driver'}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                 </div>
                 <div className="pt-4 flex justify-end">
                    <Button variant="ghost" onClick={() => setStep('select')} className="mr-2">Back</Button>
                    <Button onClick={() => setStep('type-select')} disabled={!selectedDriverId}>Next</Button>
                 </div>
             </div>
        )}

        {step === 'type-select' && (
            <div className="py-4 space-y-6">
                <div className="space-y-3">
                    <Label className="text-base font-medium">Select Data Types to Purge</Label>
                    <p className="text-sm text-slate-500">Choose which records should be removed from the system.</p>
                    <div className="grid grid-cols-1 gap-4 pt-2">
                        <div className="flex items-center space-x-2 border p-4 rounded-md bg-slate-50">
                            <Checkbox 
                                id="check-trips" 
                                checked={dateConfig.targets.includes('trips')}
                                disabled={target === 'trips'}
                                onCheckedChange={() => toggleDateTarget('trips')}
                            />
                            <div className="grid gap-1.5 leading-none">
                                <label
                                    htmlFor="check-trips"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                >
                                    Trips
                                </label>
                                <p className="text-xs text-slate-500">
                                    Journey records, pickup/dropoff locations, and mileage.
                                </p>
                            </div>
                        </div>
                        
                        <div className="flex items-center space-x-2 border p-4 rounded-md bg-slate-50">
                            <Checkbox 
                                id="check-tolls" 
                                checked={dateConfig.targets.includes('tolls')}
                                onCheckedChange={() => toggleDateTarget('tolls')}
                            />
                            <div className="grid gap-1.5 leading-none">
                                <label
                                    htmlFor="check-tolls"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                >
                                    Toll Data
                                </label>
                                <p className="text-xs text-slate-500">
                                    Toll receipts, transactions, and tag usage logs.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center space-x-2 border p-4 rounded-md bg-slate-50">
                            <Checkbox 
                                id="check-fuel" 
                                checked={dateConfig.targets.includes('fuel')}
                                onCheckedChange={() => toggleDateTarget('fuel')}
                            />
                             <div className="grid gap-1.5 leading-none">
                                <label
                                    htmlFor="check-fuel"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                >
                                    Fuel Logs
                                </label>
                                <p className="text-xs text-slate-500">
                                    Fuel station receipts, consumption logs, and cost entries.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="pt-4 flex justify-end">
                    <Button variant="ghost" onClick={() => setStep('select')} className="mr-2">Back</Button>
                    <Button onClick={() => setStep('date-select')}>Next</Button>
                 </div>
            </div>
        )}

        {step === 'date-select' && (
            <div className="py-4 space-y-6">
                <div className="space-y-3">
                    <Label className="text-base font-medium">Delete Method</Label>
                    <RadioGroup 
                        value={dateConfig.type} 
                        onValueChange={(v) => setDateConfig(prev => ({ ...prev, type: v as any }))}
                        className="grid grid-cols-2 gap-4"
                    >
                        <div>
                            <RadioGroupItem value="upload" id="upload" className="peer sr-only" />
                            <Label 
                                htmlFor="upload"
                                className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:text-primary cursor-pointer"
                            >
                                <span className="mb-1 font-semibold">By Upload Date</span>
                                <span className="text-xs text-center text-muted-foreground">Delete based on when files were imported (Batch Date)</span>
                            </Label>
                        </div>
                        <div>
                            <RadioGroupItem value="record" id="record" className="peer sr-only" />
                            <Label 
                                htmlFor="record"
                                className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:text-primary cursor-pointer"
                            >
                                <span className="mb-1 font-semibold">By Record Date</span>
                                <span className="text-xs text-center text-muted-foreground">Delete based on the actual date of the trip or transaction</span>
                            </Label>
                        </div>
                    </RadioGroup>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Start Date</Label>
                        <Input 
                            type="date" 
                            disabled={isAllTime}
                            value={dateConfig.startDate}
                            onChange={(e) => setDateConfig(prev => ({ ...prev, startDate: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>End Date</Label>
                        <Input 
                            type="date" 
                            disabled={isAllTime}
                            value={dateConfig.endDate}
                            onChange={(e) => setDateConfig(prev => ({ ...prev, endDate: e.target.value }))}
                        />
                    </div>
                </div>

                <div className="flex items-center space-x-2">
                    <Checkbox 
                        id="all-time" 
                        checked={isAllTime}
                        onCheckedChange={(c) => setIsAllTime(!!c)}
                    />
                    <label
                        htmlFor="all-time"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer text-indigo-600"
                    >
                        Delete entire history (All Time)
                    </label>
                </div>

                <div className="pt-4 flex justify-end">
                    <Button variant="ghost" onClick={() => setStep('type-select')} className="mr-2">Back</Button>
                    <Button onClick={handleFetchPreview}>Preview Deletion</Button>
                 </div>
            </div>
        )}

        {step === 'preview' && (
            <div className="flex flex-col flex-1 min-h-0 py-4">
                <div className="flex items-center justify-between mb-2 px-1">
                    <div className="text-sm text-slate-500">
                        Found {previewItems.length} items to delete.
                        <br/>
                        <span className="text-xs">Uncheck any items you wish to keep.</span>
                    </div>
                    <div className="space-x-2">
                        <Button size="sm" variant="outline" onClick={toggleSelectAll}>
                            {selectedKeys.length === previewItems.length ? 'Deselect All' : 'Select All'}
                        </Button>
                    </div>
                </div>
                
                <div className="border rounded-md flex-1 min-h-0 overflow-hidden">
                    <ScrollArea className="h-[400px]">
                        <Table>
                            <TableHeader className="bg-slate-50 sticky top-0 z-10">
                                <TableRow>
                                    <TableHead className="w-[50px]"></TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Driver</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {previewItems.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                                            <div className="flex flex-col items-center gap-1">
                                                <span>No data found for the selected criteria.</span>
                                                <span className="text-xs opacity-70">
                                                    Searching for: {dateConfig.targets.join(', ')} <br/>
                                                    Range: {isAllTime ? 'All Time' : `${dateConfig.startDate} to ${dateConfig.endDate}`} <br/>
                                                    Type: By {dateConfig.type === 'upload' ? 'Upload' : 'Record'} Date
                                                </span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    previewItems.map((item) => {
                                        let Icon = FileText;
                                        let badgeColor = "bg-slate-50 text-slate-700 border-slate-200";
                                        const typeStr = (item.type || '').toLowerCase();
                                        const descStr = (item.description || '').toLowerCase();
                                        
                                        if (typeStr === 'trip') {
                                            Icon = Car;
                                            badgeColor = "bg-indigo-50 text-indigo-700 border-indigo-200";
                                        } else if (typeStr === 'fuel log' || descStr.includes('fuel')) {
                                            Icon = Fuel;
                                            badgeColor = "bg-amber-50 text-amber-700 border-amber-200";
                                        } else if (descStr.includes('toll') || typeStr.includes('toll')) {
                                            Icon = Ticket;
                                            badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
                                        }

                                        return (
                                            <TableRow key={item.key} className={!selectedKeys.includes(item.key) ? 'bg-slate-50/50 opacity-60' : ''}>
                                                <TableCell>
                                                    <Checkbox 
                                                        checked={selectedKeys.includes(item.key)}
                                                        onCheckedChange={() => toggleKeySelection(item.key)}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-xs whitespace-nowrap">
                                                    {item.date ? new Date(item.date).toLocaleDateString() : 'N/A'}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={`gap-1 ${badgeColor}`}>
                                                        <Icon className="h-3 w-3" />
                                                        {item.type}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-xs max-w-[200px] truncate" title={item.description}>
                                                    {item.description}
                                                    {(item.receiptUrl || item.invoiceUrl) && (
                                                        <span className="ml-1 inline-flex items-center text-blue-600" title="Has Receipt/Invoice">
                                                            <FileText className="h-3 w-3" />
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-xs font-mono">
                                                    {item.amount !== undefined ? item.amount?.toFixed(2) : '-'}
                                                </TableCell>
                                                <TableCell className="text-xs truncate max-w-[100px]" title={item.driverName}>
                                                    {item.driverName}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </div>
                <div className="pt-4 flex justify-end">
                    <Button variant="ghost" onClick={() => setStep('date-select')} className="mr-2">Back</Button>
                    <Button variant="destructive" onClick={() => setStep('confirm')} disabled={selectedKeys.length === 0}>
                        Proceed to Delete ({selectedKeys.length})
                    </Button>
                </div>
            </div>
        )}

        {step === 'confirm' && (
          <div className="py-6">
             <div className="bg-rose-50 border border-rose-100 p-4 rounded-lg text-rose-800 text-sm mb-4">
                <strong>Warning:</strong> This action is irreversible. 
                {target === 'driver' && ` All selected data for driver ${drivers.find(d => d.id === selectedDriverId)?.name} will be permanently deleted.`}
                {target === 'trips' && !isAllTime && ` Trips between ${dateConfig.startDate} and ${dateConfig.endDate} will be permanently deleted.`}
                {target === 'transactions' && !isAllTime && ` Transactions between ${dateConfig.startDate} and ${dateConfig.endDate} will be permanently deleted.`}
                {isAllTime && target !== 'all' && ` ALL ${target} history will be permanently deleted.`}
                {target === 'all' && " All imported data will be wiped."}
             </div>
             <p className="text-center text-slate-600">Are you absolutely sure you want to proceed?</p>
             <div className="pt-6 flex justify-center gap-4">
                <Button variant="outline" onClick={() => setStep('preview')}>Cancel</Button>
                <Button variant="destructive" onClick={handleConfirmDeletion}>Yes, Permanently Delete</Button>
             </div>
          </div>
        )}

        {step === 'processing' && (
            <div className="py-12 flex flex-col items-center justify-center space-y-4">
                <div className="h-12 w-12 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
                <p className="text-slate-500">Sanitizing database... {progress}%</p>
            </div>
        )}

        {step === 'success' && (
            <div className="py-8 flex flex-col items-center justify-center space-y-4 text-center">
                <div className="h-12 w-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                    <h3 className="text-lg font-medium text-slate-900">Data Successfully Purged</h3>
                    <p className="text-slate-500 max-w-xs mx-auto mt-1">
                        Selected Trips, Tolls, and Fuel data have been permanently deleted. You can now safely re-import.
                    </p>
                </div>
                <Button className="mt-4" onClick={onClose}>Done</Button>
            </div>
        )}

        {step === 'select' && (
           <DialogFooter>
             <Button variant="ghost" onClick={onClose}>Cancel</Button>
           </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
