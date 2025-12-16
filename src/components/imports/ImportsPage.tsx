import React, { useState, useCallback } from 'react';
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
  FileText, 
  CheckCircle, 
  AlertCircle,
  ArrowRight,
  ArrowLeft
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Progress } from "../ui/progress";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

import { detectMapping, processData, FIELD_LABELS } from '../../utils/csvHelpers';
import { CsvMapping, ParsedRow, Trip } from '../../types/data';
import { api } from '../../services/api';

type Step = 'upload' | 'mapping' | 'preview' | 'success';

export function ImportsPage() {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [rawRows, setRawRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<CsvMapping>({ date: '', amount: '', driverId: '' });
  const [processedData, setProcessedData] = useState<Trip[]>([]);
  
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (selectedFile) {
      setFile(selectedFile);
      parseFile(selectedFile);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv']
    },
    maxFiles: 1,
    disabled: step !== 'upload'
  });

  const parseFile = (file: File) => {
    setIsParsing(true);
    setError(null);
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setIsParsing(false);
        if (results.errors && results.errors.length > 0) {
          setError(`Error parsing CSV: ${results.errors[0].message}`);
        } else if (results.meta.fields) {
          setHeaders(results.meta.fields);
          setRawRows(results.data as ParsedRow[]);
          
          // Auto-detect mapping
          const detected = detectMapping(results.meta.fields);
          setMapping(detected);
          setStep('mapping');
        }
      },
      error: (error) => {
        setIsParsing(false);
        setError(`Failed to parse file: ${error.message}`);
      }
    });
  };

  const handleMappingChange = (field: keyof CsvMapping, value: string) => {
    setMapping(prev => ({ ...prev, [field]: value }));
  };

  const proceedToPreview = () => {
    // Validate required fields
    if (!mapping.date || !mapping.amount || !mapping.driverId) {
      setError("Please map all required fields (Date, Amount, Driver ID).");
      return;
    }
    
    setError(null);
    const processed = processData(rawRows, mapping);
    setProcessedData(processed);
    setStep('preview');
  };

  const handleUpload = async () => {
    setIsUploading(true);
    try {
      await api.saveTrips(processedData);
      setStep('success');
    } catch (err: any) {
      setError(err.message || "Failed to upload data");
    } finally {
      setIsUploading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setRawRows([]);
    setHeaders([]);
    setProcessedData([]);
    setStep('upload');
    setError(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Data Import</h2>
        <p className="text-slate-500 dark:text-slate-400">
          Upload and normalize trip data.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle>Upload CSV</CardTitle>
            <CardDescription>Drag and drop your trip log file here.</CardDescription>
          </CardHeader>
          <CardContent>
            <div 
              {...getRootProps()} 
              className={`
                border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors
                ${isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50'}
              `}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center justify-center space-y-2">
                <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center mb-2">
                  <UploadCloud className="h-5 w-5 text-indigo-600" />
                </div>
                {isParsing ? (
                  <p className="text-sm font-medium text-slate-900">Parsing file...</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-slate-900">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-xs text-slate-500">
                      CSV files only (max 10MB)
                    </p>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'mapping' && (
        <Card>
          <CardHeader>
            <CardTitle>Map Columns</CardTitle>
            <CardDescription>Match your CSV columns to the required fields.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Trip Date <span className="text-rose-500">*</span></Label>
                  <Select value={mapping.date} onValueChange={(v) => handleMappingChange('date', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Fare Amount <span className="text-rose-500">*</span></Label>
                  <Select value={mapping.amount} onValueChange={(v) => handleMappingChange('amount', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Driver ID <span className="text-rose-500">*</span></Label>
                  <Select value={mapping.driverId} onValueChange={(v) => handleMappingChange('driverId', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Platform (Optional)</Label>
                  <Select value={mapping.platform || ''} onValueChange={(v) => handleMappingChange('platform', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                       <SelectItem value=" ">None</SelectItem>
                      {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Status (Optional)</Label>
                  <Select value={mapping.status || ''} onValueChange={(v) => handleMappingChange('status', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value=" ">None</SelectItem>
                      {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={reset}>Cancel</Button>
              <Button onClick={proceedToPreview}>
                Preview Data <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'preview' && (
        <Card className="flex flex-col h-[600px]">
           <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle>Preview Import</CardTitle>
              <CardDescription>
                Found {processedData.length} valid trips.
              </CardDescription>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <Button variant="outline" className="flex-1 md:flex-none" onClick={() => setStep('mapping')}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button className="flex-1 md:flex-none" onClick={handleUpload} disabled={isUploading}>
                {isUploading ? 'Importing...' : 'Confirm Import'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
             {isUploading && (
                <div className="mb-4 space-y-2">
                   <Progress value={66} className="h-2" />
                   <p className="text-xs text-slate-500 text-center">Uploading records...</p>
                </div>
             )}
             
             <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Driver ID</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processedData.slice(0, 50).map((trip) => (
                    <TableRow key={trip.id}>
                      <TableCell>{new Date(trip.date).toLocaleDateString()}</TableCell>
                      <TableCell>{trip.platform}</TableCell>
                      <TableCell className="font-mono text-xs">{trip.driverId}</TableCell>
                      <TableCell>${trip.amount.toFixed(2)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
                          ${trip.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 
                            trip.status === 'Cancelled' ? 'bg-rose-100 text-rose-700' : 
                            'bg-amber-100 text-amber-700'
                          }
                        `}>
                          {trip.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
             </div>
             {processedData.length > 50 && (
               <p className="text-xs text-slate-500 text-center mt-4">
                 Showing first 50 rows of {processedData.length}
               </p>
             )}
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
               Upload Another File
             </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
