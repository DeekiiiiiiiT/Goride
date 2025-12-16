import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../ui/table";
import { 
  UploadCloud, 
  CheckCircle, 
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  X,
  Check,
  Info,
  Settings,
  Plus,
  Trash2,
  Edit2,
  PlusCircle,
  FileText,
  Merge,
  Layers
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Progress } from "../ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Label } from "../ui/label";
import { Input } from "../ui/input";

import { 
    detectFileType, 
    mergeAndProcessData, 
    FileData, 
    DEFAULT_FIELDS 
} from '../../utils/csvHelpers';
import { Trip, FieldDefinition, FieldType, ParsedRow } from '../../types/data';
import { api } from '../../services/api';

type Step = 'upload' | 'review_files' | 'preview_merged' | 'success';

export function ImportsPage() {
  const [step, setStep] = useState<Step>('upload');
  
  // Staging: Multiple files
  const [uploadedFiles, setUploadedFiles] = useState<FileData[]>([]);
  
  // Field Config
  const [availableFields, setAvailableFields] = useState<FieldDefinition[]>(DEFAULT_FIELDS);
  
  // Merged Data
  const [processedData, setProcessedData] = useState<Trip[]>([]);
  
  // UI States
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manageFieldsOpen, setManageFieldsOpen] = useState(false);

  // Load Fields
  useEffect(() => {
    const saved = localStorage.getItem('goRide_fields');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Simple validation to ensure we don't break the app
        if (Array.isArray(parsed) && parsed.length > 0) {
            setAvailableFields(parsed);
        }
      } catch (e) {}
    }
  }, []);

  const saveFields = (fields: FieldDefinition[]) => {
    setAvailableFields(fields);
    localStorage.setItem('goRide_fields', JSON.stringify(fields));
  };

  // --- File Handling ---

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setIsParsing(true);
    setError(null);

    let completed = 0;
    const newFiles: FileData[] = [];

    acceptedFiles.forEach(file => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                completed++;
                
                if (results.meta.fields) {
                    const type = detectFileType(results.meta.fields);
                    newFiles.push({
                        id: Math.random().toString(36).substr(2, 9),
                        name: file.name,
                        rows: results.data as ParsedRow[],
                        headers: results.meta.fields,
                        type
                    });
                }

                if (completed === acceptedFiles.length) {
                    setIsParsing(false);
                    setUploadedFiles(prev => [...prev, ...newFiles]);
                    setStep('review_files');
                }
            },
            error: (err) => {
                console.error("Parse error", err);
                completed++; // Ensure we don't hang
                if (completed === acceptedFiles.length) setIsParsing(false);
            }
        });
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'application/vnd.ms-excel': ['.csv'] },
    disabled: isParsing
  });

  const removeFile = (id: string) => {
      setUploadedFiles(prev => {
          const next = prev.filter(f => f.id !== id);
          if (next.length === 0) setStep('upload');
          return next;
      });
  };

  const handleMerge = () => {
      // 1. Merge
      const merged = mergeAndProcessData(uploadedFiles, availableFields);
      setProcessedData(merged);
      setStep('preview_merged');
  };

  const handleConfirmImport = async () => {
      setIsUploading(true);
      try {
          await api.saveTrips(processedData);
          setStep('success');
      } catch (e: any) {
          setError(e.message || "Failed to save trips");
      } finally {
          setIsUploading(false);
      }
  };

  const reset = () => {
      setUploadedFiles([]);
      setProcessedData([]);
      setStep('upload');
      setError(null);
  };

  // --- Field Management Handlers (Simplified for this view) ---
  const [fieldNameInput, setFieldNameInput] = useState('');
  const [fieldTypeInput, setFieldTypeInput] = useState<FieldType>('text');

  const handleAddField = () => {
      if (!fieldNameInput) return;
      const key = fieldNameInput.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const newField: FieldDefinition = {
          key, label: fieldNameInput, type: fieldTypeInput, required: false, removable: true, isCustom: true, isVisible: true, isRequired: false
      };
      saveFields([...availableFields, newField]);
      setFieldNameInput('');
  };
  
  const deleteField = (key: string) => {
      saveFields(availableFields.filter(f => f.key !== key));
  };


  // --- Render Helpers ---

  const getFileIcon = (type: FileData['type']) => {
      if (type === 'uber_trip') return <div className="p-2 bg-blue-100 rounded-lg text-blue-600"><Merge className="h-5 w-5" /></div>;
      if (type === 'uber_payment') return <div className="p-2 bg-green-100 rounded-lg text-green-600"><CheckCircle className="h-5 w-5" /></div>;
      return <div className="p-2 bg-slate-100 rounded-lg text-slate-600"><FileText className="h-5 w-5" /></div>;
  };

  const getFileBadge = (type: FileData['type']) => {
      if (type === 'uber_trip') return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200">Trip Activity</Badge>;
      if (type === 'uber_payment') return <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-green-200">Payment Order</Badge>;
      return <Badge variant="secondary">Generic CSV</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Batch Import</h2>
          <p className="text-slate-500 dark:text-slate-400">
            Upload multiple Uber reports. We'll merge them by Trip ID automatically.
          </p>
        </div>
        <div className="flex gap-2">
           <Dialog open={manageFieldsOpen} onOpenChange={setManageFieldsOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                        <Settings className="h-4 w-4 mr-2" />
                        Fields
                    </Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Manage System Fields</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="flex gap-2 items-end">
                             <div className="flex-1 space-y-1">
                                <Label>New Field Name</Label>
                                <Input value={fieldNameInput} onChange={e => setFieldNameInput(e.target.value)} placeholder="e.g. Tolls" />
                             </div>
                             <div className="w-[120px] space-y-1">
                                <Label>Type</Label>
                                <Select value={fieldTypeInput} onValueChange={(v: any) => setFieldTypeInput(v)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="text">Text</SelectItem>
                                        <SelectItem value="number">Number</SelectItem>
                                        <SelectItem value="date">Date</SelectItem>
                                    </SelectContent>
                                </Select>
                             </div>
                             <Button onClick={handleAddField} disabled={!fieldNameInput}><Plus className="h-4 w-4" /></Button>
                        </div>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto">
                            {availableFields.map(f => (
                                <div key={f.key} className="flex justify-between items-center p-2 border rounded text-sm">
                                    <span>{f.label} <span className="text-xs text-slate-400">({f.type})</span></span>
                                    {f.removable && (
                                        <Button variant="ghost" size="icon" onClick={() => deleteField(f.key)} className="h-6 w-6 text-slate-400 hover:text-red-500">
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </DialogContent>
           </Dialog>

           {(step !== 'upload' && step !== 'success') && (
               <Button variant="ghost" onClick={reset}>Cancel</Button>
           )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* STEP 1: UPLOAD */}
      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle>Drop Files</CardTitle>
            <CardDescription>
                Upload "Trip Activity" AND "Payment Orders" files together.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div 
              {...getRootProps()} 
              className={`
                border-2 border-dashed rounded-lg p-16 text-center cursor-pointer transition-all duration-200
                ${isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50'}
              `}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="h-20 w-20 rounded-full bg-indigo-100 flex items-center justify-center">
                  <Layers className="h-10 w-10 text-indigo-600" />
                </div>
                {isParsing ? (
                   <p className="text-lg font-medium animate-pulse">Parsing files...</p>
                ) : (
                  <div>
                    <p className="text-xl font-medium text-slate-900">
                      Drag & Drop Multiple CSVs
                    </p>
                    <p className="text-slate-500 mt-2">
                      or click to select files
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: REVIEW FILES */}
      {step === 'review_files' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                  <h3 className="text-lg font-medium">Staged Files ({uploadedFiles.length})</h3>
                  <div className="grid gap-3">
                      {uploadedFiles.map(file => (
                          <div key={file.id} className="bg-white border rounded-lg p-4 flex items-center justify-between shadow-sm">
                              <div className="flex items-center gap-4">
                                  {getFileIcon(file.type)}
                                  <div>
                                      <div className="flex items-center gap-2">
                                          <p className="font-medium text-slate-900">{file.name}</p>
                                          {getFileBadge(file.type)}
                                      </div>
                                      <p className="text-xs text-slate-500 mt-0.5">
                                          {file.rows.length} rows &bull; {file.headers.length} columns
                                      </p>
                                  </div>
                              </div>
                              <Button variant="ghost" size="icon" onClick={() => removeFile(file.id)} className="text-slate-400 hover:text-red-500">
                                  <X className="h-4 w-4" />
                              </Button>
                          </div>
                      ))}
                      
                      <div {...getRootProps()} className="border-2 border-dashed border-slate-200 rounded-lg p-4 flex items-center justify-center cursor-pointer hover:bg-slate-50 text-slate-500 text-sm">
                          <input {...getInputProps()} />
                          <Plus className="h-4 w-4 mr-2" /> Add more files
                      </div>
                  </div>
              </div>

              <div>
                  <Card className="bg-slate-50 border-slate-200">
                      <CardHeader>
                          <CardTitle className="text-base">Merge Strategy</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                          <div className="text-sm text-slate-600 space-y-2">
                              <p>We will attempt to join data using:</p>
                              <div className="flex items-center gap-2 font-mono text-xs bg-white p-2 border rounded">
                                  <Badge variant="outline" className="text-[10px]">KEY</Badge>
                                  Trip UUID
                              </div>
                          </div>
                          
                          <div className="pt-4 border-t border-slate-200">
                              <div className="flex justify-between text-sm mb-2">
                                  <span className="text-slate-500">Trip Sources:</span>
                                  <span className="font-medium">{uploadedFiles.filter(f => f.type === 'uber_trip').length}</span>
                              </div>
                              <div className="flex justify-between text-sm mb-4">
                                  <span className="text-slate-500">Payment Sources:</span>
                                  <span className="font-medium">{uploadedFiles.filter(f => f.type === 'uber_payment').length}</span>
                              </div>

                              <Button onClick={handleMerge} className="w-full" size="lg">
                                  Merge & Preview <ArrowRight className="ml-2 h-4 w-4" />
                              </Button>
                          </div>
                      </CardContent>
                  </Card>
              </div>
          </div>
      )}

      {/* STEP 3: PREVIEW MERGED */}
      {step === 'preview_merged' && (
          <Card className="flex flex-col h-[600px]">
              <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                      <CardTitle>Preview Merged Data</CardTitle>
                      <CardDescription>
                          Found <strong>{processedData.length}</strong> unique trips from <strong>{uploadedFiles.length}</strong> files.
                      </CardDescription>
                  </div>
                  <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setStep('review_files')}>
                          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Files
                      </Button>
                      <Button onClick={handleConfirmImport} disabled={isUploading}>
                         {isUploading ? "Uploading..." : "Confirm Import"}
                      </Button>
                  </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto">
                  <Table>
                      <TableHeader>
                          <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Platform</TableHead>
                              <TableHead>Driver</TableHead>
                              <TableHead>From</TableHead>
                              <TableHead>To</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Status</TableHead>
                          </TableRow>
                      </TableHeader>
                      <TableBody>
                          {processedData.slice(0, 100).map(trip => (
                              <TableRow key={trip.id}>
                                  <TableCell className="whitespace-nowrap text-xs">
                                      {new Date(trip.date).toLocaleDateString()}
                                      <br/>
                                      <span className="text-slate-400">{new Date(trip.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                  </TableCell>
                                  <TableCell>{trip.platform}</TableCell>
                                  <TableCell className="text-xs truncate max-w-[100px]" title={trip.driverId}>{trip.driverId}</TableCell>
                                  <TableCell className="text-xs truncate max-w-[150px]" title={trip.pickupLocation}>{trip.pickupLocation || '-'}</TableCell>
                                  <TableCell className="text-xs truncate max-w-[150px]" title={trip.dropoffLocation}>{trip.dropoffLocation || '-'}</TableCell>
                                  <TableCell className="font-medium">
                                      {trip.amount > 0 ? `$${trip.amount.toFixed(2)}` : <span className="text-red-400 font-normal">Missing</span>}
                                  </TableCell>
                                  <TableCell>
                                      <Badge variant="outline" className={
                                          trip.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                                          trip.status === 'Cancelled' ? 'bg-rose-50 text-rose-700 border-rose-200' : ''
                                      }>
                                          {trip.status}
                                      </Badge>
                                  </TableCell>
                              </TableRow>
                          ))}
                      </TableBody>
                  </Table>
              </CardContent>
          </Card>
      )}

      {step === 'success' && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-4">
             <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-emerald-600" />
             </div>
             <div>
               <h3 className="text-2xl font-bold text-slate-900">Import Complete!</h3>
               <p className="text-slate-500">Successfully imported {processedData.length} trips.</p>
             </div>
             <Button onClick={reset} size="lg" className="mt-4">
               Import More Files
             </Button>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
