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
import Papa from 'papaparse';

interface BulkImportTollTransactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicleId?: string;
  vehicleName?: string;
  tollTagId?: string;
  tollTagUuid?: string;
  onSuccess: () => void;
  mode?: 'usage' | 'topup' | 'recovery'; // Defaults to 'usage' if not provided
}

interface ParsedTransaction {
  date: Date;
  location: string;
  laneId: string;
  amount: number;
  type: 'Usage' | 'Top-up' | 'Refund' | 'Expense';
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
  
  // Phase 2: Enhanced Import Fields
  paymentMethod?: string;
  category?: string;
  status?: string;
  vehiclePlate?: string;
  description?: string;
  referenceNumber?: string;
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



  const matchVehicle = (tagId?: string, plate?: string, driverName?: string, paymentMethod?: string) => {
      let matchedVehicleId = vehicleId; 
      let matchedVehicleName = vehicleName;
      let matchedDriverId = '';
      let matchedDriverName = '';
      let error = '';

      // 1. Tag ID Match (Highest Priority)
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
              // Only error if we strictly expect a tag (i.e. not a cash transaction)
              // If it's a "Cash" transaction, we allow Tag ID to be missing or invalid/dummy if needed, 
              // but usually Cash won't have Tag ID. If it DOES have Tag ID and it's invalid, maybe still error?
              // Let's rely on Plate match if Tag fails for Cash.
              if (paymentMethod !== 'Cash') {
                  error = `Tag ${tagId} not found in system`;
              }
          }
      } else if (!matchedVehicleId && !plate && !driverName) {
           // Only error about missing Tag ID if NO other identifier exists
           error = 'Missing Tag ID for auto-match';
      }

      // 2. Plate Match (If Tag failed or missing, and Plate provided)
      if (!matchedVehicleId && plate) {
          const cleanPlate = plate.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          const vehicle = vehicles.find((v: any) => 
              v.licensePlate?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === cleanPlate
          );
          
          if (vehicle) {
              matchedVehicleId = vehicle.id;
              matchedVehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.licensePlate})`;
              error = ''; // Clear error if Plate matched
          } else if (!tagId) {
               // Only error on plate if we didn't have a tag to blame
               error = `Vehicle Plate ${plate} not found`;
          }
      }

      // 3. Driver Name Match (Fallback)
      if (!matchedVehicleId && driverName) {
           const cleanName = driverName.toLowerCase();
           const driver = drivers.find((d: any) => 
               (d.name && d.name.toLowerCase() === cleanName) || 
               (d.driverName && d.driverName.toLowerCase() === cleanName)
           );

           if (driver) {
               matchedDriverId = driver.id;
               matchedDriverName = driver.name || driver.driverName;
               
               // Find vehicle assigned to this driver
               const vehicle = vehicles.find((v: any) => v.currentDriverId === driver.id);
               if (vehicle) {
                   matchedVehicleId = vehicle.id;
                   matchedVehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.licensePlate})`;
                   error = '';
               }
           } else if (!tagId && !plate) {
               error = `Driver ${driverName} not found`;
           }
      }

      // Try to resolve driver from vehicle assignment
      if (matchedVehicleId && !matchedDriverId) {
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
      // Phase 2: Logic Replacement - Parsing with PapaParse
      const result = Papa.parse(text, { 
          header: false, 
          skipEmptyLines: true 
      });
      
      const rows = result.data as string[][];

      // Detect format: If header row contains 'Payment Method' or 'Vehicle Plate', it's the Universal Export
      const headerIndex = rows.findIndex(row => 
          row.some(cell => (cell || '').toLowerCase().includes('payment method') || (cell || '').toLowerCase().includes('vehicle plate'))
      );
      
      const hasUniversalHeader = headerIndex !== -1;
      const startIdx = hasUniversalHeader ? headerIndex + 1 : 0;

      return rows.slice(startIdx)
        .filter(row => {
             // Basic filtering of repeated headers or invalid rows
             if (row.length === 0) return false;
             const firstCell = (row[0] || '').toLowerCase();
             return !firstCell.startsWith('tag id') && !firstCell.startsWith('plaza name') && !firstCell.startsWith('date');
        })
        .map(row => {
             // Phase 3: Column Mapping & Schema Support
             const parts = row.map(cell => (cell || '').trim());
             
             // Universal Schema: Date, Time, Amount, Type, Category, Description, Payment Method, Status, Vehicle Plate, Driver Name, Tag ID, Lane ID, Reference Number
             const isUniversal = hasUniversalHeader || parts.length >= 8; 

             let tagId = '';
             let location = '';
             let laneId = '';
             let dateStr = '';
             let amountStr = '';
             
             // Enhanced Fields
             let paymentMethod = 'Tag Balance';
             let category = '';
             let status = '';
             let vehiclePlate = '';
             let driverName = '';
             let typeStr = '';
             let description = '';
             let referenceNumber = '';

             if (isUniversal) {
                 // 0: Date, 1: Time, 2: Amount, 3: Type, 4: Category, 5: Description, 6: Payment Method, 7: Status, 8: Plate, 9: Driver, 10: TagID, 11: LaneID, 12: Ref
                 dateStr = `${parts[0]} ${parts[1]}`;
                 amountStr = parts[2];
                 typeStr = parts[3];
                 category = parts[4];
                 description = parts[5];
                 location = description; 
                 paymentMethod = parts[6];
                 status = parts[7];
                 vehiclePlate = parts[8];
                 driverName = parts[9];
                 tagId = parts[10] || '';
                 laneId = parts[11] || '';
                 referenceNumber = parts[12] || '';
             } else {
                 // Legacy Schema
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
             }

             // Phase 4: Data Transformation & Validation
             let isValid = true;
             let dateObj = new Date();
             let amount = 0;
             let error = '';
     
             if (!dateStr || dateStr.trim() === '') {
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

             if (mode === 'recovery' && !isUniversal) {
                 isValid = false;
                 error = 'Format Mismatch: Recovery requires Disaster Recovery Export CSV';
             }
     
             let type: 'Usage' | 'Top-up' | 'Refund' | 'Expense' = 'Usage';
             
             if (isUniversal) {
                 if (typeStr.toLowerCase().includes('usage')) type = 'Usage';
                 else if (typeStr.toLowerCase().includes('top')) type = 'Top-up';
                 else if (typeStr.toLowerCase().includes('refund')) type = 'Refund';
                 else if (typeStr.toLowerCase().includes('expense')) type = 'Expense';
             } else {
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
             }

             // Phase 5: Vehicle Matching
             const match = matchVehicle(tagId, vehiclePlate, driverName, paymentMethod);
             
             if (match.error && !isUniversal) {
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
                 error: error || undefined,
                 tagId,
                 vehicleId: match.matchedVehicleId,
                 matchedVehicleName: match.matchedVehicleName,
                 driverId: match.matchedDriverId,
                 driverName: driverName || match.matchedDriverName,
                 vehiclePlate,
                 paymentMethod,
                 category,
                 status,
                 description,
                 referenceNumber
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
                       paymentAfterDiscount: tx.paymentAfterDiscount || 0,
                       vehiclePlate: tx.vehiclePlate,
                       paymentMethod: tx.paymentMethod || 'Tag Balance',
                       category: tx.category,
                       status: tx.status,
                       description: tx.description,
                       referenceNumber: tx.referenceNumber
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
                const finalPaymentMethod = tx.paymentMethod || 'Tag Balance';
                const finalStatus = tx.status || 'Completed';
                const finalCategory = tx.category || (tx.type === 'Usage' ? 'Toll Usage' : 'Toll Top-up');
                
                // Construct description: Use provided description or fallback to Location + Lane
                const finalDescription = tx.description || (
                    (tx.type === 'Top-up' && (!tx.location || tx.location === 'Unknown'))
                        ? `Balance Top-up`
                        : `${tx.location} ${tx.laneId ? `(${tx.laneId})` : ''}`.trim()
                );

                await api.saveTransaction({
                    date: tx.date.toISOString(),
                    amount: tx.amount, 
                    type: (tx.type === 'Usage' ? 'Usage' : 'Expense'), // Maps Top-up/Refund to Expense
                    category: finalCategory,
                    description: finalDescription,
                    vehicleId: tx.vehicleId,
                    vehiclePlate: tx.matchedVehicleName || vehicleName || tx.vehiclePlate || 'Unknown Vehicle',
                    driverId: tx.driverId,
                    driverName: tx.driverName,
                    paymentMethod: finalPaymentMethod,
                    status: finalStatus,
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
                        originalType: tx.type,
                        referenceNumber: tx.referenceNumber
                    }
                });
                
                // Aggregate balance change ONLY if paid by Tag Balance
                // Cash payments do not affect the Vehicle's "Toll Balance" (which represents the Tag account)
                // In Recovery Mode, we rely on finalPaymentMethod to be accurate (from Universal CSV).
                if (finalPaymentMethod !== 'Cash') {
                    vehicleBalanceChanges[tx.vehicleId] = (vehicleBalanceChanges[tx.vehicleId] || 0) + tx.amount;
                }
                
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
          <DialogTitle>
            {mode === 'recovery' 
              ? 'Restore Toll Transactions (Disaster Recovery)' 
              : `Bulk Import ${mode === 'usage' ? 'Toll Usage' : 'Top-up'} Transactions`}
          </DialogTitle>
          <DialogDescription>
             {mode === 'recovery' 
               ? 'Upload the "Disaster Recovery" CSV file to restore your full transaction history.'
               : 'Upload a CSV/Excel file for AI Analysis or paste transactions manually.'}
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
                                    {(mode === 'usage' || mode === 'recovery') && <TableHead>Location</TableHead>}
                                    {(mode === 'usage' || mode === 'recovery') && <TableHead>Lane</TableHead>}
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
                                        {(mode === 'usage' || mode === 'recovery') && <TableCell>{tx.location}</TableCell>}
                                        {(mode === 'usage' || mode === 'recovery') && <TableCell>{tx.laneId}</TableCell>}
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
