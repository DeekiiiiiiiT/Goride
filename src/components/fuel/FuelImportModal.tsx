import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { UploadCloud, FileText, CheckCircle, AlertTriangle, ArrowRight, X, AlertCircle } from "lucide-react";
import { FuelCard, FuelEntry } from '../../types/fuel';
import { toast } from "sonner@2.0.3";

interface FuelImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (entries: FuelEntry[]) => void;
    cards: FuelCard[];
    vehicles: any[];
    drivers: any[];
}

type Step = 'upload' | 'mapping' | 'review';

interface ImportedRow {
    [key: string]: string;
}

interface ColumnMapping {
    date: string;
    time?: string;
    cardNumber: string;
    amount: string;
    volume: string;
    location?: string;
    product?: string;
    odometer?: string;
}

export function FuelImportModal({ isOpen, onClose, onSave, cards, vehicles, drivers }: FuelImportModalProps) {
    const [step, setStep] = useState<Step>('upload');
    const [file, setFile] = useState<File | null>(null);
    const [headers, setHeaders] = useState<string[]>([]);
    const [rawRows, setRawRows] = useState<ImportedRow[]>([]);
    const [mapping, setMapping] = useState<ColumnMapping>({
        date: '',
        cardNumber: '',
        amount: '',
        volume: ''
    });
    const [previewData, setPreviewData] = useState<Partial<FuelEntry>[]>([]);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        setFile(file);
        
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            preview: 50, // Preview first 50 for mapping
            complete: (results) => {
                setHeaders(results.meta.fields || []);
                setRawRows(results.data as ImportedRow[]);
                setStep('mapping');
                
                // Auto-detect mapping
                const newMapping = { ...mapping };
                const fields = results.meta.fields || [];
                
                const findField = (terms: string[]) => fields.find(f => terms.some(t => f.toLowerCase().includes(t)));
                
                newMapping.date = findField(['date', 'dt', 'time']) || '';
                newMapping.cardNumber = findField(['card', 'pan', 'number']) || '';
                newMapping.amount = findField(['amount', 'cost', 'total', 'price']) || '';
                newMapping.volume = findField(['vol', 'liters', 'gallons', 'qty', 'quantity']) || '';
                newMapping.location = findField(['location', 'station', 'site', 'merchant']) || '';
                newMapping.product = findField(['product', 'grade', 'fuel']) || '';
                newMapping.odometer = findField(['odo', 'meter', 'kms', 'mileage']) || '';

                setMapping(newMapping);
            }
        });
    }, [mapping]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'text/csv': ['.csv'], 'application/vnd.ms-excel': ['.csv'] },
        maxFiles: 1
    });

    const handleProcess = () => {
        if (!file) return;

        // Parse full file
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const rows = results.data as ImportedRow[];
                const processed: Partial<FuelEntry>[] = rows.map((row, index) => {
                    // 1. Basic Data
                    const amount = parseFloat(row[mapping.amount]?.replace(/[^0-9.-]/g, '') || '0');
                    const liters = parseFloat(row[mapping.volume]?.replace(/[^0-9.-]/g, '') || '0');
                    const pricePerLiter = (amount && liters) ? amount / liters : 0;
                    
                    // 2. Date Parsing
                    let dateStr = row[mapping.date];
                    if (mapping.time && row[mapping.time]) {
                        dateStr += ' ' + row[mapping.time];
                    }
                    const date = new Date(dateStr).toISOString();

                    // 3. Card Matching
                    const rawCardNum = row[mapping.cardNumber]?.replace(/\D/g, '') || '';
                    // Match last 4 digits
                    const matchedCard = cards.find(c => c.cardNumber.endsWith(rawCardNum.slice(-4)));
                    
                    // 4. Vehicle Matching
                    let vehicleId = matchedCard?.assignedVehicleId;
                    let driverId = matchedCard?.assignedDriverId;

                    return {
                        id: crypto.randomUUID(), // Temp ID
                        date,
                        type: 'Card_Transaction',
                        amount,
                        liters,
                        pricePerLiter,
                        location: mapping.location ? row[mapping.location] : undefined,
                        odometer: mapping.odometer ? parseFloat(row[mapping.odometer]) : undefined,
                        cardId: matchedCard?.id,
                        vehicleId,
                        driverId,
                        // Helper prop for UI
                        _rawCard: row[mapping.cardNumber]
                    } as any;
                });

                setPreviewData(processed);
                setStep('review');
            }
        });
    };

    const handleSave = () => {
        // Filter out invalid entries if needed, or just save all
        const validEntries = previewData.map(d => {
             // Clean up helper props
             const { _rawCard, ...rest } = d as any;
             return rest as FuelEntry;
        });
        
        onSave(validEntries);
        onClose();
        
        // Reset
        setStep('upload');
        setFile(null);
        setPreviewData([]);
    };

    const getVehicleName = (id?: string) => {
        if (!id) return 'Unassigned';
        const v = vehicles.find(v => v.id === id);
        return v ? `${v.licensePlate} (${v.model})` : 'Unknown';
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Import Fuel Statement</DialogTitle>
                    <DialogDescription>Upload a CSV file from your fuel card provider.</DialogDescription>
                </DialogHeader>

                {step === 'upload' && (
                    <div className="py-8">
                         <div 
                            {...getRootProps()} 
                            className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                                isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-500 hover:bg-slate-50'
                            }`}
                        >
                            <input {...getInputProps()} />
                            <div className="flex flex-col items-center gap-4">
                                <div className="p-4 bg-slate-100 rounded-full">
                                    <UploadCloud className="h-8 w-8 text-slate-500" />
                                </div>
                                <div className="space-y-1">
                                    <p className="font-medium text-slate-900">Click to upload or drag and drop</p>
                                    <p className="text-sm text-slate-500">CSV files only (max 10MB)</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {step === 'mapping' && (
                    <div className="space-y-6 py-4">
                        <Alert>
                            <FileText className="h-4 w-4" />
                            <AlertTitle>File: {file?.name}</AlertTitle>
                            <AlertDescription>
                                Map the columns from your CSV to the system fields.
                            </AlertDescription>
                        </Alert>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Transaction Date <span className="text-red-500">*</span></Label>
                                <Select value={mapping.date} onValueChange={(v) => setMapping(prev => ({...prev, date: v}))}>
                                    <SelectTrigger><SelectValue placeholder="Select Column" /></SelectTrigger>
                                    <SelectContent>
                                        {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Card Number <span className="text-red-500">*</span></Label>
                                <Select value={mapping.cardNumber} onValueChange={(v) => setMapping(prev => ({...prev, cardNumber: v}))}>
                                    <SelectTrigger><SelectValue placeholder="Select Column" /></SelectTrigger>
                                    <SelectContent>
                                        {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Total Cost <span className="text-red-500">*</span></Label>
                                <Select value={mapping.amount} onValueChange={(v) => setMapping(prev => ({...prev, amount: v}))}>
                                    <SelectTrigger><SelectValue placeholder="Select Column" /></SelectTrigger>
                                    <SelectContent>
                                        {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Volume (L) <span className="text-red-500">*</span></Label>
                                <Select value={mapping.volume} onValueChange={(v) => setMapping(prev => ({...prev, volume: v}))}>
                                    <SelectTrigger><SelectValue placeholder="Select Column" /></SelectTrigger>
                                    <SelectContent>
                                        {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Location / Station</Label>
                                <Select value={mapping.location} onValueChange={(v) => setMapping(prev => ({...prev, location: v}))}>
                                    <SelectTrigger><SelectValue placeholder="Select Column" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">-- None --</SelectItem>
                                        {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Odometer</Label>
                                <Select value={mapping.odometer} onValueChange={(v) => setMapping(prev => ({...prev, odometer: v}))}>
                                    <SelectTrigger><SelectValue placeholder="Select Column" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">-- None --</SelectItem>
                                        {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                )}

                {step === 'review' && (
                    <div className="space-y-4 py-4">
                        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg border">
                             <div className="flex items-center gap-2">
                                <CheckCircle className="h-5 w-5 text-emerald-500" />
                                <span className="text-sm font-medium">
                                    {previewData.filter(d => d.cardId).length} Matched
                                </span>
                             </div>
                             <div className="flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-amber-500" />
                                <span className="text-sm font-medium">
                                    {previewData.filter(d => !d.cardId).length} Unmatched Cards
                                </span>
                             </div>
                        </div>

                        <div className="rounded-md border h-[300px] overflow-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Card Number</TableHead>
                                        <TableHead>Vehicle</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Volume</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {previewData.map((row, i) => (
                                        <TableRow key={i}>
                                            <TableCell>
                                                {row.cardId ? (
                                                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                                                ) : (
                                                    <AlertCircle className="h-4 w-4 text-amber-500" />
                                                )}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                {row.date ? new Date(row.date).toLocaleDateString() : '-'}
                                            </TableCell>
                                            <TableCell>{(row as any)._rawCard}</TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                {row.vehicleId ? (
                                                    <Badge variant="secondary" className="font-normal">
                                                        {getVehicleName(row.vehicleId)}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-slate-400 italic">Unassigned</span>
                                                )}
                                            </TableCell>
                                            <TableCell>${row.amount?.toFixed(2)}</TableCell>
                                            <TableCell>{row.liters?.toFixed(1)} L</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                )}

                <DialogFooter>
                    {step === 'upload' && (
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                    )}
                    {step === 'mapping' && (
                        <>
                            <Button variant="ghost" onClick={() => setStep('upload')}>Back</Button>
                            <Button onClick={handleProcess}>
                                Process File <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </>
                    )}
                    {step === 'review' && (
                        <>
                            <Button variant="ghost" onClick={() => setStep('mapping')}>Back</Button>
                            <Button onClick={handleSave}>
                                Import {previewData.length} Entries
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
