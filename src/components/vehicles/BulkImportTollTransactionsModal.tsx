import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Label } from "../ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Loader2, AlertCircle, CheckCircle2, ArrowUpRight, ArrowDownLeft, MinusCircle, Sparkles, UploadCloud } from "lucide-react";
import { api } from "../../services/api";
import { toast } from "sonner@2.0.3";

interface BulkImportTollTransactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicleId?: string;
  vehicleName?: string;
  tollTagId?: string;
  tollTagUuid?: string;
  onSuccess: () => void;
  mode?: 'usage' | 'topup'; // Defaults to 'usage' if not provided
}

interface ParsedTransaction {
  date: Date;
  location: string;
  laneId: string;
  amount: number;
  type: 'Usage' | 'Top-up' | 'Refund';
  rawDate: string;
  isValid: boolean;
  error?: string;
  vehicleId?: string; 
  tagId?: string;
  matchedVehicleName?: string;
  driverId?: string;
  driverName?: string;
  discount?: number;
  paymentAfterDiscount?: number;
}

export function BulkImportTollTransactionsModal({ 
  isOpen, 
  onClose, 
  vehicleId, 
  vehicleName,
  tollTagId,
  tollTagUuid,
  onSuccess,
  mode = 'usage'
}: BulkImportTollTransactionsModalProps) {
  const [csvContent, setCsvContent] = useState('');
  const [parsedTx, setParsedTx] = useState<ParsedTransaction[]>([]);
  const [step, setStep] = useState<'input' | 'preview' | 'importing'>('input');
  const [importStats, setImportStats] = useState({ total: 0, success: 0, failed: 0 });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [targetVehicleId, setTargetVehicleId] = useState<string>(vehicleId || '');
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [tollTags, setTollTags] = useState<any[]>([]); // Store toll tags for lookup
  
  const [currentBatchId, setCurrentBatchId] = useState<string>('');
  const [currentBatchName, setCurrentBatchName] = useState<string>('');
  
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Load vehicles and tags
  React.useEffect(() => {
    const fetchData = async () => {
        try {
            const [vData, tData, dData] = await Promise.all([
                api.getVehicles(),
                api.getTollTags(),
                api.getDrivers()
            ]);
            setVehicles(vData);
            setTollTags(tData);
            setDrivers(dData);
        } catch (err) {
            console.error("Failed to load init data", err);
        }
    };
    
    if (isOpen) {
        fetchData();
    }
  }, [isOpen]);

  // Effect to set target vehicle if provided via props (e.g. from VehicleDetail)
  React.useEffect(() => {
      if (vehicleId) {
          setTargetVehicleId(vehicleId);
      }
  }, [vehicleId]);



  const matchVehicle = (tagId?: string) => {
      let matchedVehicleId = vehicleId; 
      let matchedVehicleName = vehicleName;
      let matchedDriverId = '';
      let matchedDriverName = '';
      let error = '';

      if (tagId) {
          const tag = tollTags.find((t: any) => t.tagNumber === tagId);
          if (tag) {
              if (tag.assignedVehicleId) {
                  matchedVehicleId = tag.assignedVehicleId;
                  matchedVehicleName = tag.assignedVehicleName;
              } else {
                  error = `Tag ${tagId} is unassigned`;
              }
          } else {
              error = `Tag ${tagId} not found in system`;
          }
      } else if (!matchedVehicleId) {
          error = 'Missing Tag ID for auto-match';
      }

      // Try to resolve driver from vehicle assignment
      if (matchedVehicleId) {
          const vehicle = vehicles.find((v: any) => v.id === matchedVehicleId);
          if (vehicle && vehicle.currentDriverId) {
              matchedDriverId = vehicle.currentDriverId;
              const driver = drivers.find((d: any) => d.id === matchedDriverId);
              if (driver) {
                  matchedDriverName = driver.name || driver.driverName || '';
              }
          }
      }

      return { matchedVehicleId, matchedVehicleName, matchedDriverId, matchedDriverName, error };
  };

  const parseTransactionsFromText = (text: string): ParsedTransaction[] => {
      const lines = text.split('\n');
      return lines
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.toLowerCase().startsWith('tag id') && !line.toLowerCase().startsWith('plaza name')) 
        .map(line => {
          // Robust CSV splitting handling quotes
          let parts: string[] = [];
          if (line.includes('\t')) {
              parts = line.split('\t');
          } else {
              parts = line.split(',');
          }
          
          parts = parts.map(p => p.trim().replace(/^"|"$/g, ''));
          
          let tagId = '';
          let location = '';
          let laneId = '';
          let dateStr = '';
          let amountStr = '';
          
          if (parts.length >= 5) {
              tagId = parts[0];
              location = parts[1];
              laneId = parts[2];
              dateStr = parts[3];
              amountStr = parts[4];
          } else {
              location = parts[0] || 'Unknown';
              laneId = parts[1] || '';
              dateStr = parts[2] || '';
              amountStr = parts[3] || '';
          }
  
          let isValid = true;
          let dateObj = new Date();
          let amount = 0;
          let error = '';
  
          if (!dateStr) {
              isValid = false;
              error = 'Missing Date';
          } else {
              const d = new Date(dateStr);
              if (isNaN(d.getTime())) {
                  isValid = false;
                  error = 'Invalid Date format';
              } else {
                  dateObj = d;
              }
          }
  
          if (!amountStr) {
               if (isValid) {
                   isValid = false;
                   error = 'Missing Amount';
               }
          } else {
              const cleanAmount = amountStr.replace(/[^0-9.-]/g, '');
              const parsedAmt = parseFloat(cleanAmount);
              if (isNaN(parsedAmt)) {
                  isValid = false;
                  error = 'Invalid Amount';
              } else {
                  amount = parsedAmt;
              }
          }
  
          let type: 'Usage' | 'Top-up' | 'Refund' = 'Usage';
          
          if (mode === 'usage') {
              type = 'Usage';
              if (amount > 0) amount = -amount; 
          } else if (mode === 'topup') {
              type = 'Top-up';
              if (amount < 0) amount = Math.abs(amount); 
          } else {
              if (amount < 0) {
                  type = 'Usage'; 
              } else {
                  type = 'Top-up';
              }
          }

          const match = matchVehicle(tagId);
          if (match.error) {
              isValid = false;
              error = match.error;
          }
  
          return {
            date: dateObj,
            location,
            laneId,
            amount,
            type,
            rawDate: dateStr,
            isValid,
            error,
            tagId,
            vehicleId: match.matchedVehicleId,
            matchedVehicleName: match.matchedVehicleName,
            driverId: match.matchedDriverId,
            driverName: match.matchedDriverName
          };
        });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      const newBatchId = crypto.randomUUID();
      setCurrentBatchId(newBatchId);
      setCurrentBatchName(file.name);
      
      const isImage = file.type.startsWith('image/');
      
      if (!isImage) {
          const text = await file.text();
          setCsvContent(text);
    
          // Try local parse first
          const localParsed = parseTransactionsFromText(text);
          
          // If we have valid results, use them
          if (localParsed.length > 0 && localParsed.some(t => t.isValid)) {
              setParsedTx(localParsed);
              setStep('preview');
              toast.success("File parsed successfully");
              if (fileInputRef.current) fileInputRef.current.value = '';
              return;
          }
      }

      // Fallback to AI (only if local parse completely failed OR it's an image)
      setIsAnalyzing(true);
      try {
          let res;
          if (isImage) {
              res = await api.parseTollImageWithAI(file);
          } else {
              const text = await file.text(); // Redundant but safe
              res = await api.parseTollCsvWithAI(text);
          }

          if (res.data) {
               const parsed = res.data.map((tx: any) => {
                   let rawAmount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount;
                   let finalAmount = rawAmount;
                   let finalType = tx.type;
 
                   if (mode === 'usage') {
                       finalType = 'Usage';
                       if (finalAmount > 0) finalAmount = -finalAmount;
                   } else if (mode === 'topup') {
                       finalType = 'Top-up';
                       if (finalAmount < 0) finalAmount = Math.abs(finalAmount);
                   }
 
                   const match = matchVehicle(tx.tagId);
                   
                   const dateObj = new Date(tx.date);
                   const isDateValid = !isNaN(dateObj.getTime());
                   
                   const isValid = !!match.matchedVehicleId && 
                                   isDateValid && 
                                   (!tx.status || tx.status.toLowerCase() !== 'failure');
                   
                   const error = !isDateValid ? 'Invalid Date' : 
                                 (!match.matchedVehicleId ? 'Missing Vehicle Assignment' : 
                                 (tx.status === 'Failure' ? 'Transaction Failed' : ''));

                   return {
                       date: dateObj,
                       location: tx.location || "Unknown",
                       laneId: tx.laneId || "",
                       amount: finalAmount,
                       type: finalType,
                       rawDate: tx.date,
                       isValid: isValid, 
                       error: match.error || error,
                       vehicleId: match.matchedVehicleId,
                       tagId: tx.tagId,
                       matchedVehicleName: match.matchedVehicleName,
                       driverId: match.matchedDriverId,
                       driverName: match.matchedDriverName,
                       discount: tx.discount || 0,
                       paymentAfterDiscount: tx.paymentAfterDiscount || 0
                   };
               });
               setParsedTx(parsed);
               setStep('preview');
               toast.success("AI Analysis Complete");
          }
      } catch (err) {
          console.error(err);
          toast.error("AI Analysis Failed. Please check the file format.");
      } finally {
          setIsAnalyzing(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
  };

  const handleManualParse = () => {
    if (!csvContent.trim()) {
      toast.error("Please enter some data");
      return;
    }

    const newBatchId = crypto.randomUUID();
    setCurrentBatchId(newBatchId);
    setCurrentBatchName(`Manual Import ${new Date().toLocaleString()}`);

    const parsed = parseTransactionsFromText(csvContent);
    if (parsed.length === 0) {
        toast.error("No valid lines found");
        return;
    }

    setParsedTx(parsed);
    setStep('preview');
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleImport = async () => {
    if (isSubmitting) return;
    if (parsedTx.length === 0) {
        toast.error("No transactions to import");
        return;
    }

    // 1. Start Loading State
    setIsSubmitting(true);
    setStep('importing');
    setImportStats({ total: parsedTx.length, success: 0, failed: 0 });

    // 2. Process Transactions
    try {
        let successCount = 0;
        let failCount = 0;
        
        // Track balance changes per vehicle: vehicleId -> change amount
        const vehicleBalanceChanges: Record<string, number> = {};

        for (const tx of parsedTx) {
            if (!tx.isValid || !tx.vehicleId) {
                failCount++;
                setImportStats(prev => ({ ...prev, failed: failCount }));
                continue;
            }

            // Find tag info if available
            let txTollTagId = tollTagId; 
            let txTollTagUuid = tollTagUuid;
            
            if (!txTollTagId && tx.tagId) {
                txTollTagId = tx.tagId;
                const tag = tollTags.find((t: any) => t.tagNumber === tx.tagId);
                if (tag) txTollTagUuid = tag.id;
            }

            try {
                await api.saveTransaction({
                    date: tx.date.toISOString(),
                    amount: tx.amount, 
                    type: tx.type === 'Usage' ? 'Usage' : 'Expense', 
                    category: tx.type === 'Usage' ? 'Toll Usage' : 'Toll Top-up',
                    description: (tx.type === 'Top-up' && (!tx.location || tx.location === 'Unknown'))
                        ? `Balance Top-up`
                        : `${tx.location} ${tx.laneId ? `(${tx.laneId})` : ''}`.trim(),
                    vehicleId: tx.vehicleId,
                    vehiclePlate: tx.matchedVehicleName || vehicleName || 'Unknown Vehicle',
                    driverId: tx.driverId,
                    driverName: tx.driverName,
                    paymentMethod: 'Tag Balance',
                    status: 'Completed',
                    isReconciled: false,
                    time: tx.date.toLocaleTimeString(),
                    batchId: currentBatchId,
                    batchName: currentBatchName,
                    metadata: {
                        tollTagId: txTollTagId,
                        tollTagUuid: txTollTagUuid,
                        laneId: tx.laneId,
                        imported: true,
                        importDate: new Date().toISOString(),
                        discount: tx.discount,
                        paymentAfterDiscount: tx.paymentAfterDiscount,
                        originalType: tx.type
                    }
                });
                
                // Aggregate balance change
                vehicleBalanceChanges[tx.vehicleId] = (vehicleBalanceChanges[tx.vehicleId] || 0) + tx.amount;
                successCount++;
            } catch (error) {
                console.error(`Failed to import tx ${tx.date}`, error);
                failCount++;
            }
            
            setImportStats(prev => ({ ...prev, success: successCount, failed: failCount }));
        }

        // 3. Update balances for all affected vehicles
        const vehiclesToUpdate = Object.keys(vehicleBalanceChanges);
        if (vehiclesToUpdate.length > 0) {
            for (const vId of vehiclesToUpdate) {
                try {
                    const vehicle = vehicles.find((v: any) => v.id === vId);
                    if (vehicle) {
                        const change = vehicleBalanceChanges[vId];
                        if (change !== 0) {
                            const newBalance = (vehicle.tollBalance || 0) + change;
                            await api.saveVehicle({
                                ...vehicle,
                                tollBalance: newBalance
                            });
                        }
                    }
                } catch (err) {
                    console.error(`Failed to update balance for vehicle ${vId}`, err);
                    // Don't fail the whole import for this
                }
            }
        }

        // 4. Finish
        if (successCount === 0 && failCount > 0) {
            toast.error(`Import failed. ${failCount} transactions failed.`);
            setIsSubmitting(false); // Let user try again or fix
            setStep('preview');
        } else {
            toast.success(`Import complete. ${successCount} imported.`);
            onSuccess();
            
            // Allow animation to finish
            await new Promise(r => setTimeout(r, 1000));
            
            onClose();
            // Reset state
            setStep('input');
            setCsvContent('');
            setParsedTx([]);
            setIsSubmitting(false);
        }

    } catch (e) {
        console.error("Critical error during import", e);
        toast.error("Import crashed. Check console.");
        setIsSubmitting(false);
        setStep('preview');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-[800px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Import {mode === 'usage' ? 'Toll Usage' : 'Top-up'} Transactions</DialogTitle>
          <DialogDescription>
             Upload a CSV/Excel file for AI Analysis or paste transactions manually.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
            {step === 'input' && (
                <div className="space-y-6">
                    {/* File Upload Area */}
                    <div 
                        className="border-2 border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 hover:border-indigo-300 transition-all group relative bg-white"
                        onClick={() => !isAnalyzing && fileInputRef.current?.click()}
                    >
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept=".csv,.txt,.tsv,.png,.jpg,.jpeg"
                            onChange={handleFileUpload}
                            disabled={isAnalyzing}
                        />
                        {isAnalyzing ? (
                            <div className="flex flex-col items-center animate-pulse">
                                <Loader2 className="h-8 w-8 text-indigo-600 animate-spin mb-2" />
                                <p className="text-sm font-medium text-indigo-600">Analyzing with AI...</p>
                            </div>
                        ) : (
                            <>
                                <div className="bg-indigo-50 p-3 rounded-full mb-3 group-hover:scale-110 transition-transform">
                                    <Sparkles className="h-6 w-6 text-indigo-600" />
                                </div>
                                <p className="text-sm font-medium text-slate-900">Upload File (CSV, Excel, Image)</p>
                                <p className="text-xs text-slate-500 mt-1">AI will analyze files or screenshots automatically</p>
                            </>
                        )}
                    </div>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-slate-200" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-white px-2 text-slate-500 font-medium">Or paste text manually</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Textarea 
                            placeholder={`Spanish Town East\tE03\t26 Dec 2025 09:20 AM\tJMD -275.00\nSpanish Town West\tW03\t24 Dec 2025 03:30 PM\tJMD -275.00`} 
                            className="h-[200px] font-mono text-sm whitespace-pre"
                            value={csvContent}
                            onChange={(e) => setCsvContent(e.target.value)}
                        />
                        <p className="text-xs text-slate-500">
                             Format: <code>Plaza Name, Lane ID, Date & Time, Amount</code>
                        </p>
                    </div>
                </div>
            )}

            {step === 'preview' && (
                <div className="space-y-4">
                     <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Preview</AlertTitle>
                        <AlertDescription>
                            Found {parsedTx.length} transactions. {parsedTx.filter(t => !t.isValid).length} invalid.
                        </AlertDescription>
                    </Alert>
                    
                    <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Tag ID / Vehicle</TableHead>
                                    {mode === 'usage' && <TableHead>Location</TableHead>}
                                    {mode === 'usage' && <TableHead>Lane</TableHead>}
                                    <TableHead>Type</TableHead>
                                    {mode === 'topup' && <TableHead className="text-right">Discount</TableHead>}
                                    {mode === 'topup' && <TableHead className="text-right">Net Paid</TableHead>}
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {parsedTx.map((tx, i) => (
                                    <TableRow key={i}>
                                        <TableCell className="whitespace-nowrap">
                                            {tx.isValid ? tx.date.toLocaleString() : tx.rawDate}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-mono text-slate-500">{tx.tagId || '-'}</span>
                                                <span className="text-sm font-medium">
                                                    {tx.matchedVehicleName || (tx.vehicleId ? 'Current Vehicle' : 'Unmatched')}
                                                </span>
                                            </div>
                                        </TableCell>
                                        {mode === 'usage' && <TableCell>{tx.location}</TableCell>}
                                        {mode === 'usage' && <TableCell>{tx.laneId}</TableCell>}
                                        <TableCell>
                                            {tx.isValid && (
                                                tx.type === 'Usage' ? 
                                                <span className="text-slate-600 flex items-center gap-1 text-xs"><MinusCircle className="h-3 w-3" /> Usage</span> :
                                                <span className="text-amber-600 flex items-center gap-1 text-xs"><ArrowUpRight className="h-3 w-3" /> Top-up</span>
                                            )}
                                        </TableCell>
                                        {mode === 'topup' && (
                                            <TableCell className="text-right text-slate-500">
                                                {tx.discount && tx.discount > 0 ? `-$${tx.discount.toFixed(2)}` : '-'}
                                            </TableCell>
                                        )}
                                        {mode === 'topup' && (
                                            <TableCell className="text-right text-slate-700">
                                                {tx.paymentAfterDiscount && tx.paymentAfterDiscount > 0 ? `$${tx.paymentAfterDiscount.toFixed(2)}` : '-'}
                                            </TableCell>
                                        )}
                                        <TableCell className={`text-right font-medium ${tx.amount < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                            {tx.isValid ? `$${tx.amount.toFixed(2)}` : '-'}
                                        </TableCell>
                                        <TableCell>
                                            {tx.isValid ? (
                                                <span className="text-emerald-600 flex items-center gap-1 text-xs font-medium">
                                                    <CheckCircle2 className="h-3 w-3" /> OK
                                                </span>
                                            ) : (
                                                <span className="text-red-600 text-xs font-medium">
                                                    {tx.error}
                                                </span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}

            {step === 'importing' && (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                    <h3 className="text-lg font-medium">Importing Transactions...</h3>
                    <p className="text-slate-500">
                        Processed {importStats.success + importStats.failed} of {importStats.total}
                    </p>
                    <div className="w-full max-w-xs bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div 
                            className="bg-indigo-600 h-full transition-all duration-300"
                            style={{ width: `${((importStats.success + importStats.failed) / importStats.total) * 100}%` }}
                        />
                    </div>
                </div>
            )}
        </div>

        <DialogFooter>
          {step === 'input' && (
              <>
                <Button variant="outline" onClick={onClose} disabled={isAnalyzing}>Cancel</Button>
                <Button onClick={handleManualParse} disabled={isAnalyzing}>
                    Next: Preview
                </Button>
              </>
          )}
          {step === 'preview' && (
              <>
                <Button variant="outline" onClick={() => setStep('input')} disabled={isSubmitting}>Back</Button>
                <Button onClick={handleImport} disabled={isSubmitting || parsedTx.filter(t => t.isValid).length === 0}>
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Import {parsedTx.filter(t => t.isValid).length} Transactions
                </Button>
              </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
