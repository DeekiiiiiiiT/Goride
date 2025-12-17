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
  Layers,
  Car,
  Zap,
  HelpCircle,
  Globe,
  MapPin,
  CloudDownload
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Progress } from "../ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Badge } from "../ui/badge";
import { DriverScorecard } from '../drivers/DriverScorecard';
import { VehicleHealthCard } from '../vehicles/VehicleHealthCard';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Label } from "../ui/label";
import { Input } from "../ui/input";

import { 
    detectFileType, 
    mergeAndProcessData, 
    FileData, 
    DEFAULT_FIELDS,
    downloadTemplate,
    validateFile,
    extractReportDate
} from '../../utils/csvHelpers';
import { Trip, FieldDefinition, FieldType, ParsedRow, DriverMetrics, VehicleMetrics } from '../../types/data';
import { api } from '../../services/api';

type Step = 'select_platform' | 'upload' | 'review_files' | 'preview_merged' | 'success';

export function ImportsPage() {
  const [step, setStep] = useState<Step>('select_platform');
  
  // Staging: Multiple files
  const [uploadedFiles, setUploadedFiles] = useState<FileData[]>([]);
  
  // Field Config
  const [availableFields, setAvailableFields] = useState<FieldDefinition[]>(DEFAULT_FIELDS);
  
  // Merged Data
  const [processedData, setProcessedData] = useState<Trip[]>([]);
  const [processedDriverMetrics, setProcessedDriverMetrics] = useState<DriverMetrics[]>([]);
  const [processedVehicleMetrics, setProcessedVehicleMetrics] = useState<VehicleMetrics[]>([]);
  const [processedRentalContracts, setProcessedRentalContracts] = useState<any[]>([]);
  
  // UI States
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [manageFieldsOpen, setManageFieldsOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('Uber');

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
                    const type = detectFileType(results.meta.fields, file.name);
                    const fileData: FileData = {
                        id: Math.random().toString(36).substr(2, 9),
                        name: file.name,
                        rows: results.data as ParsedRow[],
                        headers: results.meta.fields,
                        type
                    };

                    // Run Validation & Date Extraction
                    fileData.validationErrors = validateFile(fileData);
                    fileData.reportDate = extractReportDate(fileData);

                    newFiles.push(fileData);
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
      const { trips, driverMetrics, vehicleMetrics, rentalContracts } = mergeAndProcessData(uploadedFiles, availableFields);

      // 2. Apply Platform Override
      const finalTrips = trips.map(t => ({
          ...t,
          platform: selectedPlatform as any
      }));

      setProcessedData(finalTrips);
      setProcessedDriverMetrics(driverMetrics);
      setProcessedVehicleMetrics(vehicleMetrics);
      setProcessedRentalContracts(rentalContracts);
      setStep('preview_merged');
  };

  const handleConfirmImport = async () => {
      setIsUploading(true);
      try {
          // Generate a Batch ID
          const batchId = crypto.randomUUID();
          
          // Create Batch Metadata
          const batchMeta = {
            id: batchId,
            fileName: uploadedFiles.map(f => f.name).join(', '),
            uploadDate: new Date().toISOString(),
            status: 'completed' as const,
            recordCount: processedData.length,
            type: 'merged_import',
            processedBy: 'Admin' // In real app, use user name
          };

          // Assign batchId to all trips
          const tripsWithBatch = processedData.map(trip => ({
            ...trip,
            batchId
          }));

          // Save Batch Record FIRST
          await api.createBatch(batchMeta);
          
          // Save Trips
          await api.saveTrips(tripsWithBatch);

          // Save Metrics
          if (processedDriverMetrics.length > 0) {
              await api.saveDriverMetrics(processedDriverMetrics);
          }
          if (processedVehicleMetrics.length > 0) {
              await api.saveVehicleMetrics(processedVehicleMetrics);
          }
          
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
      setStep('select_platform');
      setError(null);
      setWarning(null);
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
      if (type === 'uber_payment_driver') return <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600"><CheckCircle className="h-5 w-5" /></div>;
      if (type === 'uber_payment_org') return <div className="p-2 bg-teal-100 rounded-lg text-teal-600"><CheckCircle className="h-5 w-5" /></div>;
      if (type === 'uber_driver_quality') return <div className="p-2 bg-purple-100 rounded-lg text-purple-600"><Zap className="h-5 w-5" /></div>;
      if (type === 'uber_driver_activity') return <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600"><Zap className="h-5 w-5" /></div>;
      if (type === 'uber_vehicle_performance') return <div className="p-2 bg-orange-100 rounded-lg text-orange-600"><Car className="h-5 w-5" /></div>;
      return <div className="p-2 bg-slate-100 rounded-lg text-slate-600"><FileText className="h-5 w-5" /></div>;
  };

  const getFileBadge = (type: FileData['type']) => {
      if (type === 'uber_trip') return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200">Trip Activity</Badge>;
      if (type === 'uber_payment') return <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-green-200">Payment Order</Badge>;
      if (type === 'uber_payment_driver') return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200">Driver Payment</Badge>;
      if (type === 'uber_payment_org') return <Badge className="bg-teal-100 text-teal-700 hover:bg-teal-200 border-teal-200">Org. Payment</Badge>;
      if (type === 'uber_driver_quality') return <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-200">Driver Quality</Badge>;
      if (type === 'uber_vehicle_performance') return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-200 border-orange-200">Vehicle Perf.</Badge>;
      if (type === 'uber_driver_activity') return <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-indigo-200">Driver Activity</Badge>;
      if (type === 'uber_rental_contract') return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-200 border-yellow-200">Rental Contract</Badge>;
      return <Badge variant="secondary">Generic CSV</Badge>;
  };

  // --- API Sync Handler ---
  const handleUberSync = async () => {
    setIsParsing(true);
    setWarning(null);
    setError(null);

    const performSync = async () => {
        try {
            const { projectId, publicAnonKey } = await import('../../utils/supabase/info');
            const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-37f42386/uber/sync`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${publicAnonKey}`
                }
            });

            if (response.status === 401) {
                // Auth Required - Trigger Login Flow
                return "AUTH_REQUIRED";
            }

            if (!response.ok) {
                let errorMsg = "Failed to sync with Uber";
                try {
                    const errData = await response.json();
                    errorMsg = errData.error || errData.message || JSON.stringify(errData);
                } catch (e) {
                    errorMsg = await response.text();
                }
                throw new Error(errorMsg);
            }

            const data = await response.json();
            
            if (data.warning) {
                setWarning(data.warning);
            }

            const newTrips = data.trips.map((t: any) => ({
                ...t,
                id: t.trip_id || crypto.randomUUID(),
                source: 'uber_api'
            }));

            setProcessedData(newTrips);
            setStep('preview_merged');
            return "SUCCESS";

        } catch (e: any) {
            setError(e.message);
            return "ERROR";
        }
    };

    try {
        // 1. Try to Sync
        const result = await performSync();

        // 2. If Auth Required, Start OAuth Flow
        if (result === "AUTH_REQUIRED") {
            const { projectId, publicAnonKey } = await import('../../utils/supabase/info');
            
            // ALWAYS use the production URL for consistency (No trailing slash)
            const redirectUri = "https://chorus-tech-15470154.figma.site";
            
            // Request permissions. 
            // NOTE: You must enable these in Uber Dashboard -> Scopes / Products
            const scope = "profile history";

            // Get Auth URL
            const urlRes = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-37f42386/uber/auth-url?redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`, {
                headers: { 'Authorization': `Bearer ${publicAnonKey}` }
            });
            const urlData = await urlRes.json();
            
            if (urlData.url) {
                // Open Popup
                const width = 600;
                const height = 700;
                const left = (window.screen.width / 2) - (width / 2);
                const top = (window.screen.height / 2) - (height / 2);
                const popup = window.open(urlData.url, 'UberAuth', `width=${width},height=${height},top=${top},left=${left}`);

                // Listen for Success or Code
                const messageHandler = async (event: MessageEvent) => {
                    // Handle the new frontend-based flow
                    if (event.data?.type === 'uber-auth-code') {
                        const code = event.data.code;
                        window.removeEventListener('message', messageHandler);
                        
                        // Exchange Code
                        try {
                            const exchangeRes = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-37f42386/uber/exchange`, {
                                method: 'POST',
                                headers: { 
                                    'Authorization': `Bearer ${publicAnonKey}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ code, redirect_uri: redirectUri })
                            });
                            
                            if (!exchangeRes.ok) {
                                throw new Error("Token exchange failed");
                            }

                            // Retry Sync
                            await performSync();
                        } catch (e: any) {
                            setError(e.message);
                        } finally {
                            setIsParsing(false);
                        }
                    }
                };
                window.addEventListener('message', messageHandler);

                // Check if popup closed manually
                const timer = setInterval(() => {
                    if (popup && popup.closed) {
                        clearInterval(timer);
                        window.removeEventListener('message', messageHandler);
                        // If we didn't get a message by now, user closed it.
                        // We check if isParsing is still true to decide if we should stop loading
                        // But since we can't share state easily with the event listener, we just rely on the user trying again.
                        setIsParsing(false);
                    }
                }, 1000);
            } else {
                 throw new Error("Could not generate login URL.");
            }
        } else {
            setIsParsing(false);
        }

    } catch (e: any) {
        setError(e.message);
        setIsParsing(false);
    }
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
                        <DialogDescription>
                            Add, remove, or modify the data fields used during import mapping.
                        </DialogDescription>
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

           {(step !== 'select_platform' && step !== 'upload' && step !== 'success') && (
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

      {warning && (
        <Alert variant="default" className="bg-yellow-50 border-yellow-200 text-yellow-800">
          <Info className="h-4 w-4 text-yellow-800" />
          <AlertTitle>System Notice</AlertTitle>
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      )}

      {/* STEP 0: SELECT PLATFORM */}
      {step === 'select_platform' && (
        <div className="space-y-6">
            <div className="text-center space-y-2">
                <h3 className="text-lg font-medium text-slate-900">Select Platform</h3>
                <p className="text-slate-500">Choose the service provider for the data you are importing.</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {/* Special API Sync Card */}
                <Card 
                    onClick={handleUberSync}
                    className="cursor-pointer transition-all duration-200 border-2 border-indigo-100 hover:border-indigo-600 hover:shadow-md bg-indigo-50/50"
                >
                    <CardContent className="flex flex-col items-center justify-center p-6 space-y-4">
                        <div className="h-12 w-12 rounded-full bg-indigo-600 flex items-center justify-center">
                            {isParsing ? (
                                <Zap className="h-6 w-6 text-white animate-pulse" /> 
                            ) : (
                                <CloudDownload className="h-6 w-6 text-white" />
                            )}
                        </div>
                        <div className="text-center space-y-1">
                            <h4 className="font-semibold text-indigo-900">Connect & Sync</h4>
                            <p className="text-xs text-indigo-700">{isParsing ? 'Syncing...' : 'Secure OAuth Login'}</p>
                        </div>
                    </CardContent>
                </Card>

                {[
                    { id: 'Uber', icon: Car, color: 'text-slate-900', bg: 'bg-slate-100', border: 'hover:border-slate-900', desc: 'CSV Import' },
                    { id: 'Lyft', icon: Car, color: 'text-pink-600', bg: 'bg-pink-50', border: 'hover:border-pink-500', desc: 'Ride History' },
                    { id: 'Bolt', icon: Zap, color: 'text-green-600', bg: 'bg-green-50', border: 'hover:border-green-500', desc: 'Trip Reports' },
                    { id: 'InDrive', icon: Globe, color: 'text-blue-600', bg: 'bg-blue-50', border: 'hover:border-blue-500', desc: 'Bid Activity' },
                    { id: 'Other', icon: Layers, color: 'text-slate-600', bg: 'bg-slate-50', border: 'hover:border-slate-400', desc: 'Generic CSV' }
                ].map((p) => (
                    <Card 
                        key={p.id}
                        onClick={() => {
                            setSelectedPlatform(p.id);
                            setStep('upload');
                        }}
                        className={`cursor-pointer transition-all duration-200 border-2 hover:shadow-md ${p.border}`}
                    >
                        <CardContent className="flex flex-col items-center justify-center p-6 space-y-4">
                            <div className={`h-12 w-12 rounded-full ${p.bg} flex items-center justify-center`}>
                                <p.icon className={`h-6 w-6 ${p.color}`} />
                            </div>
                            <div className="text-center space-y-1">
                                <h4 className="font-semibold text-slate-900">{p.id}</h4>
                                <p className="text-xs text-slate-500">{p.desc}</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
      )}

      {/* STEP 1: UPLOAD */}
      {step === 'upload' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
                <div>
                    <CardTitle>Upload {selectedPlatform} Data</CardTitle>
                    <CardDescription>
                        {selectedPlatform === 'Uber' 
                        ? 'Upload "Trip Activity" AND "Payment Orders" files together.' 
                        : `Upload your ${selectedPlatform} CSV export files.`}
                    </CardDescription>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => downloadTemplate(availableFields)}>
                        <CloudDownload className="mr-2 h-4 w-4" /> Template
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setStep('select_platform')}>
                        Change Platform
                    </Button>
                </div>
            </div>
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
                                          {file.reportDate && (
                                              <Badge variant="outline" className="text-xs font-normal">
                                                  {new Date(file.reportDate).toLocaleDateString()}
                                              </Badge>
                                          )}
                                      </div>
                                      <div className="space-y-1 mt-1">
                                          <p className="text-xs text-slate-500">
                                              {file.rows.length} rows &bull; {file.headers.length} columns
                                          </p>
                                          {file.validationErrors && file.validationErrors.length > 0 && (
                                              <div className="text-xs text-red-600 font-medium flex flex-col gap-0.5">
                                                  {file.validationErrors.map((err, i) => (
                                                      <span key={i} className="flex items-center">
                                                          <AlertCircle className="h-3 w-3 mr-1 inline" /> {err}
                                                      </span>
                                                  ))}
                                              </div>
                                          )}
                                      </div>
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
                              <div className="flex justify-between text-sm mb-4">
                                  <span className="text-slate-500">Performance Sources:</span>
                                  <span className="font-medium">{uploadedFiles.filter(f => f.type.includes('driver_quality') || f.type.includes('vehicle_performance')).length}</span>
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

      {step === 'preview_merged' && (
          <Card className="flex flex-col h-[700px]">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                      <CardTitle>Preview Merged Data</CardTitle>
                      <CardDescription>
                          Found <strong>{processedData.length}</strong> unique trips, 
                          <strong> {processedDriverMetrics.length}</strong> driver reports, 
                          and <strong> {processedVehicleMetrics.length}</strong> vehicle reports.
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
              <CardContent className="flex-1 overflow-auto pt-0">
                  {processedData.some(t => !t.amount || !t.driverId || t.driverId === 'unknown') && (
                      <Alert variant="destructive" className="mb-4 bg-orange-50 border-orange-200 text-orange-800">
                          <AlertCircle className="h-4 w-4 text-orange-600" />
                          <AlertTitle className="text-orange-900">Validation Issues Detected</AlertTitle>
                          <AlertDescription className="text-orange-800">
                              {processedData.filter(t => !t.amount || !t.driverId || t.driverId === 'unknown').length} trips have missing financial or driver data. These may cause reconciliation errors.
                          </AlertDescription>
                      </Alert>
                  )}
                  <Tabs defaultValue="trips" className="w-full">
                      <TabsList className="mb-4">
                          <TabsTrigger value="trips">Trips & Financials ({processedData.length})</TabsTrigger>
                          <TabsTrigger value="drivers" disabled={processedDriverMetrics.length === 0}>
                              Driver Performance {processedDriverMetrics.length > 0 && `(${processedDriverMetrics.length})`}
                          </TabsTrigger>
                          <TabsTrigger value="vehicles" disabled={processedVehicleMetrics.length === 0}>
                               Vehicle Health {processedVehicleMetrics.length > 0 && `(${processedVehicleMetrics.length})`}
                          </TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="trips" className="space-y-4">
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-md flex items-start sm:items-center gap-3">
                            <FileText className="h-4 w-4 text-slate-500 mt-1 sm:mt-0" />
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <span className="text-sm text-slate-500 font-medium whitespace-nowrap">Source Files:</span>
                                <div className="flex flex-wrap gap-2">
                                    {uploadedFiles.filter(f => ['uber_trip', 'uber_payment', 'uber_payment_org', 'generic'].includes(f.type)).map(f => (
                                        <Badge key={f.id} variant="secondary" className="bg-white border-slate-200 text-slate-600 hover:bg-white font-normal">
                                            {f.name}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="h-[500px] overflow-auto border rounded-md">
                        <Table>
                            <TableHeader className="bg-slate-50 sticky top-0">
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Platform</TableHead>
                                    <TableHead>Driver</TableHead>
                                    <TableHead>From</TableHead>
                                    <TableHead>Earnings</TableHead>
                                    <TableHead>Cash</TableHead>
                                    <TableHead>Net</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {processedData.slice(0, 100).map(trip => (
                                    <TableRow key={trip.id}>
                                        <TableCell className="whitespace-nowrap text-xs">
                                            {new Date(trip.date).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell>{trip.platform}</TableCell>
                                        <TableCell className="text-xs truncate max-w-[100px]" title={trip.driverName || trip.driverId}>
                                            {trip.driverName || trip.driverId}
                                        </TableCell>
                                        <TableCell className="text-xs truncate max-w-[150px]" title={trip.pickupLocation}>{trip.pickupLocation || '-'}</TableCell>
                                        
                                        {/* Phase 3: Financial Columns */}
                                        <TableCell className="font-medium text-emerald-600">
                                            {trip.amount !== undefined ? `$${trip.amount.toFixed(2)}` : '-'}
                                        </TableCell>
                                        <TableCell className="text-slate-500">
                                            {trip.cashCollected && trip.cashCollected > 0 ? `$${trip.cashCollected.toFixed(2)}` : '-'}
                                        </TableCell>
                                        <TableCell className="font-bold">
                                            {trip.netPayout !== undefined ? (
                                                <span className={trip.netPayout < 0 ? 'text-red-600' : 'text-slate-900'}>
                                                    ${trip.netPayout.toFixed(2)}
                                                </span>
                                            ) : '-'}
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
                        </div>
                      </TabsContent>

                      <TabsContent value="drivers" className="space-y-4">
                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-md flex items-start sm:items-center gap-3">
                            <FileText className="h-4 w-4 text-slate-500 mt-1 sm:mt-0" />
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <span className="text-sm text-slate-500 font-medium whitespace-nowrap">Source Files:</span>
                                <div className="flex flex-wrap gap-2">
                                    {uploadedFiles.filter(f => ['uber_driver_quality', 'uber_driver_activity', 'uber_payment_driver'].includes(f.type)).map(f => (
                                        <Badge key={f.id} variant="secondary" className="bg-white border-slate-200 text-slate-600 hover:bg-white font-normal">
                                            {f.name}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="h-[500px] overflow-auto">
                          <DriverScorecard metrics={processedDriverMetrics} />
                        </div>
                      </TabsContent>
                      
                      <TabsContent value="vehicles" className="space-y-4">
                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-md flex items-start sm:items-center gap-3">
                            <FileText className="h-4 w-4 text-slate-500 mt-1 sm:mt-0" />
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <span className="text-sm text-slate-500 font-medium whitespace-nowrap">Source Files:</span>
                                <div className="flex flex-wrap gap-2">
                                    {uploadedFiles.filter(f => ['uber_vehicle_performance'].includes(f.type)).map(f => (
                                        <Badge key={f.id} variant="secondary" className="bg-white border-slate-200 text-slate-600 hover:bg-white font-normal">
                                            {f.name}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="h-[500px] overflow-auto">
                          <VehicleHealthCard metrics={processedVehicleMetrics} />
                        </div>
                      </TabsContent>
                  </Tabs>
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
