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
  const [detectedFormatLabel, setDetectedFormatLabel] = useState<string>('');
  
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

      // Smart format detection: find the header row and identify the CSV format
      const headerIndex = rows.findIndex(row => 
          row.some(cell => {
              const lower = (cell || '').trim().toLowerCase();
              return lower === 'payment method' || lower === 'vehicle plate' || 
                     lower === 'vehicle' || lower === 'highway' || 
                     lower === 'vehicleid' || lower === 'vehicleplate' ||
                     lower === 'reconciliationstatus' || lower === 'paymentmethod';
          })
      );
      
      const hasHeader = headerIndex !== -1;
      
      // Build header name → column index map
      type CsvFormat = 'current-export' | 'legacy-v1' | 'legacy-v2' | 'basic';
      let detectedFormat: CsvFormat = 'basic';
      const headerMap: Record<string, number> = {};
      
      if (hasHeader) {
          const headerRow = rows[headerIndex];
          headerRow.forEach((cell, idx) => {
              const key = (cell || '').trim().toLowerCase();
              if (key) headerMap[key] = idx;
          });
          
          // Detect format by unique header signatures
          if ('reconciliationstatus' in headerMap || 'matchedtripid' in headerMap || 'vehicleid' in headerMap) {
              detectedFormat = 'current-export';
          } else if ('highway' in headerMap || 'direction' in headerMap) {
              detectedFormat = 'legacy-v2';
          } else if ('category' in headerMap || 'lane id' in headerMap || 'vehicle plate' in headerMap) {
              detectedFormat = 'legacy-v1';
          } else {
              detectedFormat = 'legacy-v1'; // fallback for any header-based format
          }
      }
      
      // Set human-readable format label for UI feedback
      const formatLabels: Record<CsvFormat, string> = {
          'current-export': 'Current System Export',
          'legacy-v1': 'Legacy Format (v1)',
          'legacy-v2': 'Legacy Format (v2)',
          'basic': 'Basic (No Header)',
      };
      setDetectedFormatLabel(formatLabels[detectedFormat]);
      
      // Helper to get a column value by header name (tries multiple name variants)
      const getCol = (row: string[], ...names: string[]): string => {
          for (const name of names) {
              const idx = headerMap[name.toLowerCase()];
              if (idx !== undefined) return (row[idx] || '').trim();
          }
          return '';
      };
      
      const startIdx = hasHeader ? headerIndex + 1 : 0;

      return rows.slice(startIdx)
        .filter(row => {
             // Basic filtering of repeated headers or invalid rows
             if (row.length === 0) return false;
             const firstCell = (row[0] || '').toLowerCase();
             return !firstCell.startsWith('tag id') && !firstCell.startsWith('plaza name') && !firstCell.startsWith('date');
        })
        .map(row => {
             const parts = row.map(cell => (cell || '').trim());
             
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

             if (hasHeader) {
                 switch (detectedFormat) {
                     case 'current-export':
                         // Current system export: id, date, time, vehicleId, vehiclePlate, driverId, driverName, plaza, type, paymentMethod, amount, ...
                         dateStr = `${getCol(parts, 'date')} ${getCol(parts, 'time')}`;
                         amountStr = getCol(parts, 'amount');
                         vehiclePlate = getCol(parts, 'vehicleplate', 'vehicleid');
                         driverName = getCol(parts, 'drivername');
                         tagId = getCol(parts, 'referencetagid');
                         typeStr = getCol(parts, 'type');
                         location = getCol(parts, 'plaza');
                         description = getCol(parts, 'description') || location;
                         paymentMethod = getCol(parts, 'paymentmethod') || 'Tag Balance';
                         // IGNORE old status/reconciliation — import as fresh unreconciled
                         break;
                         
                     case 'legacy-v2':
                         // Old Format #2: Date, Time, Vehicle, Driver, Plaza, Highway, Direction, Type, Payment Method, Amount, Abs Amount, Status, Reference #, Tag ID, Description, Reconciled, Trip ID, Batch ID
                         dateStr = `${getCol(parts, 'date')} ${getCol(parts, 'time')}`;
                         amountStr = getCol(parts, 'amount');
                         vehiclePlate = getCol(parts, 'vehicle');
                         driverName = getCol(parts, 'driver');
                         location = getCol(parts, 'plaza');
                         const highway = getCol(parts, 'highway');
                         const direction = getCol(parts, 'direction');
                         description = getCol(parts, 'description') || [location, highway, direction].filter(Boolean).join(' — ');
                         if (!description) description = location;
                         typeStr = getCol(parts, 'type');
                         paymentMethod = getCol(parts, 'payment method') || 'Tag Balance';
                         tagId = getCol(parts, 'tag id');
                         referenceNumber = getCol(parts, 'reference #');
                         // IGNORE: Status, Reconciled, Trip ID, Batch ID — import as fresh unreconciled
                         break;
                         
                     case 'legacy-v1':
                     default:
                         // Old Format #1: Date, Time, Amount, Type, Category, Description, Payment Method, Status, Vehicle Plate, Driver Name, Tag ID, Lane ID, Reference Number
                         dateStr = `${getCol(parts, 'date')} ${getCol(parts, 'time')}`;
                         amountStr = getCol(parts, 'amount');
                         typeStr = getCol(parts, 'type');
                         category = getCol(parts, 'category');
                         description = getCol(parts, 'description');
                         location = description;
                         paymentMethod = getCol(parts, 'payment method') || 'Tag Balance';
                         // IGNORE old status — import as fresh unreconciled
                         vehiclePlate = getCol(parts, 'vehicle plate');
                         driverName = getCol(parts, 'driver name');
                         tagId = getCol(parts, 'tag id');
                         laneId = getCol(parts, 'lane id');
                         referenceNumber = getCol(parts, 'reference number');
                         break;
                 }
             } else {
                 // No header — basic legacy schema (positional)
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
                 // Smart date parsing: handle DD/MM/YYYY, MM/DD/YYYY, and ISO formats
                 let d = new Date(dateStr);
                 
                 if (isNaN(d.getTime())) {
                     // Try parsing DD/MM/YYYY or D/M/YYYY format (common in non-US locales)
                     // Match patterns like "16/1/2026 7:29:32 am" or "16/1/2026"
                     const dmyMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s*(.*)?$/);
                     if (dmyMatch) {
                         const [, dayOrMonth, monthOrDay, year, timePart] = dmyMatch;
                         const num1 = parseInt(dayOrMonth);
                         const num2 = parseInt(monthOrDay);
                         
                         // If first number > 12, it MUST be a day (DD/MM/YYYY)
                         // If second number > 12, it MUST be a day (MM/DD/YYYY) 
                         // If both <= 12, assume DD/MM/YYYY (non-US default for this system)
                         let day: number, month: number;
                         if (num1 > 12) {
                             day = num1; month = num2; // DD/MM/YYYY
                         } else if (num2 > 12) {
                             day = num2; month = num1; // MM/DD/YYYY
                         } else {
                             day = num1; month = num2; // Ambiguous — default DD/MM/YYYY
                         }
                         
                         const reconstructed = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}${timePart ? ' ' + timePart.trim() : ''}`;
                         d = new Date(reconstructed);
                     }
                 }
                 
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

             if (mode === 'recovery' && !hasHeader) {
                 isValid = false;
                 error = 'Format Mismatch: Recovery requires Disaster Recovery Export CSV';
             }
     
             let type: 'Usage' | 'Top-up' | 'Refund' | 'Expense' = 'Usage';
             
             if (hasHeader) {
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
             
             if (match.error && !hasHeader) {
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
                const finalCategory = tx.category || (tx.type === 'Usage' ? 'Toll Usage' : tx.type === 'Refund' ? 'Toll Refund' : 'Toll Top-up');
                
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
            const refundCount = parsedTx.filter(t => t.isValid && t.type === 'Refund').length;
            const chargeCount = successCount - refundCount;
            const toastMsg = refundCount > 0
                ? `Import complete. ${chargeCount} charges, ${refundCount} refunds imported.`
                : `Import complete. ${successCount} imported.`;
            toast.success(toastMsg);
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
      <DialogContent className="sm:max-w-[95vw] lg:max-w-[1200px] max-h-[85vh] flex flex-col">
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
                <div className="space-y-3">
                     {detectedFormatLabel && (
                         <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-md">
                             <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                             <span className="text-xs text-indigo-800">
                                 Detected format: <strong>{detectedFormatLabel}</strong>
                                 {(detectedFormatLabel.includes('Legacy') || detectedFormatLabel.includes('Current')) && 
                                     ' — Old status/reconciliation data ignored. All imported as fresh & unreconciled.'}
                             </span>
                         </div>
                     )}
                     <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md">
                         <AlertCircle className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                         <span className="text-xs text-slate-600">
                             Found <strong>{parsedTx.length}</strong> transactions
                             {parsedTx.some(t => t.type === 'Refund') && (
                                 <> (<strong>{parsedTx.filter(t => t.type !== 'Refund').length}</strong> charges, <strong className="text-emerald-600">{parsedTx.filter(t => t.type === 'Refund').length} refunds</strong>)</>
                             )}
                             . <strong>{parsedTx.filter(t => !t.isValid).length}</strong> invalid.
                         </span>
                     </div>
                    
                    <div className="border rounded-md overflow-x-auto">
                        <Table className="text-xs">
                            <TableHeader>
                                <TableRow className="[&>th]:py-1.5 [&>th]:px-2 [&>th]:text-[11px] [&>th]:font-semibold [&>th]:text-slate-500 [&>th]:uppercase [&>th]:tracking-wider">
                                    <TableHead className="whitespace-nowrap">Date</TableHead>
                                    <TableHead className="whitespace-nowrap">Vehicle</TableHead>
                                    <TableHead className="whitespace-nowrap">Driver</TableHead>
                                    <TableHead className="whitespace-nowrap">Tag ID</TableHead>
                                    <TableHead className="whitespace-nowrap">Location</TableHead>
                                    <TableHead className="whitespace-nowrap">Lane</TableHead>
                                    <TableHead className="whitespace-nowrap">Type</TableHead>
                                    <TableHead className="whitespace-nowrap">Payment</TableHead>
                                    <TableHead className="whitespace-nowrap">Description</TableHead>
                                    <TableHead className="whitespace-nowrap">Ref #</TableHead>
                                    {mode === 'topup' && <TableHead className="text-right whitespace-nowrap">Discount</TableHead>}
                                    {mode === 'topup' && <TableHead className="text-right whitespace-nowrap">Net Paid</TableHead>}
                                    <TableHead className="text-right whitespace-nowrap">Amount</TableHead>
                                    <TableHead className="whitespace-nowrap text-center">Valid</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {parsedTx.map((tx, i) => (
                                    <TableRow key={i} className={`[&>td]:py-1 [&>td]:px-2 ${!tx.isValid ? 'bg-red-50/50' : ''}`}>
                                        <TableCell className="whitespace-nowrap text-slate-700">
                                            {tx.isValid ? tx.date.toLocaleString() : <span className="text-red-500">{tx.rawDate || '—'}</span>}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap font-medium text-slate-800 max-w-[180px] truncate">
                                            {tx.matchedVehicleName || tx.vehiclePlate || (tx.vehicleId ? 'Current' : <span className="text-slate-400">—</span>)}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap text-slate-600 max-w-[120px] truncate">
                                            {tx.driverName || <span className="text-slate-400">—</span>}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap font-mono text-slate-500">
                                            {tx.tagId || <span className="text-slate-300">—</span>}
                                        </TableCell>
                                        <TableCell className="text-slate-600 max-w-[140px] truncate">
                                            {tx.location || <span className="text-slate-300">—</span>}
                                        </TableCell>
                                        <TableCell className="text-slate-500">
                                            {tx.laneId || <span className="text-slate-300">—</span>}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            {tx.type === 'Usage' ? (
                                                <span className="text-slate-600 flex items-center gap-0.5"><MinusCircle className="h-3 w-3" /> Usage</span>
                                            ) : tx.type === 'Top-up' ? (
                                                <span className="text-amber-600 flex items-center gap-0.5"><ArrowUpRight className="h-3 w-3" /> Top-up</span>
                                            ) : tx.type === 'Refund' ? (
                                                <span className="text-blue-600 flex items-center gap-0.5"><ArrowDownLeft className="h-3 w-3" /> Refund</span>
                                            ) : (
                                                <span className="text-slate-500">{tx.type}</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap text-slate-500">
                                            {tx.paymentMethod || <span className="text-slate-300">—</span>}
                                        </TableCell>
                                        <TableCell className="text-slate-500 max-w-[160px] truncate" title={tx.description || ''}>
                                            {tx.description || <span className="text-slate-300">—</span>}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap font-mono text-slate-400">
                                            {tx.referenceNumber || <span className="text-slate-300">—</span>}
                                        </TableCell>
                                        {mode === 'topup' && (
                                            <TableCell className="text-right text-slate-500">
                                                {tx.discount && tx.discount > 0 ? `-$${tx.discount.toFixed(2)}` : '—'}
                                            </TableCell>
                                        )}
                                        {mode === 'topup' && (
                                            <TableCell className="text-right text-slate-700">
                                                {tx.paymentAfterDiscount && tx.paymentAfterDiscount > 0 ? `$${tx.paymentAfterDiscount.toFixed(2)}` : '—'}
                                            </TableCell>
                                        )}
                                        <TableCell className={`text-right font-medium whitespace-nowrap ${tx.amount < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                            {tx.isValid ? `$${tx.amount.toFixed(2)}` : '—'}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {tx.isValid ? (
                                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                                            ) : (
                                                <span className="text-red-500 text-[10px] font-medium leading-tight block max-w-[80px] mx-auto" title={tx.error}>
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