import React, { useState, useCallback, useEffect } from 'react';
import { API_ENDPOINTS } from '../../services/apiConfig';
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
  CloudDownload,
  AlertTriangle,
  ChevronsUpDown,
  ShieldCheck,
  Clock,
  BarChart2,
  Fuel,
  CreditCard,
  MinusCircle
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Progress } from "../ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Badge } from "../ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { DriverScorecard } from '../drivers/DriverScorecard';
import { VehicleHealthCard } from '../vehicles/VehicleHealthCard';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { toast } from "sonner@2.0.3";
import { BulkImportTollTransactionsModal } from '../vehicles/BulkImportTollTransactionsModal';

import { 
    detectFileType, 
    mergeAndProcessData,
    constructAiPayload, 
    FileData, 
    DEFAULT_FIELDS,
    downloadTemplate,
    validateFile,
    extractReportDate
} from '../../utils/csvHelpers';
import { fetchFullTollHistory, generateBackupCSV } from '../../utils/exportHelpers';
import { Trip, FieldDefinition, FieldType, ParsedRow, DriverMetrics, VehicleMetrics, OrganizationMetrics, ImportAuditState } from '../../types/data';
import { FuelEntry, FuelCard } from '../../types/fuel';
import { api } from '../../services/api';
import { fuelService } from '../../services/fuelService';
import { DataSanitizer } from '../../services/dataSanitizer';
import { ImpactAnalysis } from './ImpactAnalysis';

import { AuditSummaryCard } from './AuditSummaryCard';
import { QuarantineList } from './QuarantineList';
import { CalibrationReport } from './CalibrationReport';
import { tripCalibrationService } from '../../services/tripCalibrationService';

type Step = 'select_platform' | 'upload' | 'review_files' | 'preview_merged' | 'success';

const CollapsibleSection = ({ title, children, defaultOpen = true, icon }: { title: string, children: React.ReactNode, defaultOpen?: boolean, icon?: React.ReactNode }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-2">
            <div className="flex items-center justify-between px-1">
                 <div className="flex items-center gap-2">
                    {icon}
                    <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                </div>
                <div className="flex items-center gap-2">
                    {!isOpen && <Badge variant="outline" className="text-xs font-normal text-slate-500">Hidden</Badge>}
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-slate-200">
                            <ChevronsUpDown className="h-4 w-4 text-slate-500" />
                            <span className="sr-only">Toggle</span>
                        </Button>
                    </CollapsibleTrigger>
                </div>
            </div>
            <CollapsibleContent className="space-y-4">
                {children}
            </CollapsibleContent>
        </Collapsible>
    )
}

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
  const [processedOrganizationMetrics, setProcessedOrganizationMetrics] = useState<OrganizationMetrics[]>([]);
  const [processedRentalContracts, setProcessedRentalContracts] = useState<any[]>([]);
  const [processedInsights, setProcessedInsights] = useState<{ alerts: string[], trends: string[] } | null>(null);
  
  // Phase 5: Calibration Stats
  const [calibrationStats, setCalibrationStats] = useState<ProcessedBatch['calibrationStats']>(undefined);

  // Phase 1: New Audit State
  const [auditState, setAuditState] = useState<ImportAuditState | null>(null);

  // Phase 3: Fuel Data
  const [fuelCards, setFuelCards] = useState<FuelCard[]>([]);
  const [processedFuelEntries, setProcessedFuelEntries] = useState<FuelEntry[]>([]);

  // UI States
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [manageFieldsOpen, setManageFieldsOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('Uber');
  const [disabledColumns, setDisabledColumns] = useState<Record<string, string[]>>({});
  const [tollImportMode, setTollImportMode] = useState<'usage' | 'topup' | 'recovery' | null>(null);

  const handleExportBackup = async () => {
      try {
          const toastId = toast.loading("Preparing Disaster Recovery Backup...");
          const rows = await fetchFullTollHistory();
          
          if (rows.length === 0) {
              toast.dismiss(toastId);
              toast.info("No toll transactions found to export.");
              return;
          }

          const csvContent = generateBackupCSV(rows);
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', `toll_disaster_recovery_${new Date().toISOString().split('T')[0]}.csv`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          toast.dismiss(toastId);
          toast.success(`Exported ${rows.length} records successfully.`);
      } catch (err) {
          console.error(err);
          toast.error("Export failed. Please try again.");
      }
  };

  // Load Fields
  useEffect(() => {
    const saved = localStorage.getItem('goRide_fields');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Simple validation to ensure we don't break the app
        if (Array.isArray(parsed) && parsed.length > 0) {
            // Ensure system fields like 'odometer' are present if missing from saved config
            const systemFields = DEFAULT_FIELDS.filter(df => !parsed.some((pf: any) => pf.key === df.key));
            const merged = [...parsed, ...systemFields];
            setAvailableFields(merged);
        }
      } catch (e) {}
    }
  }, []);

  // Load Fuel Cards
  useEffect(() => {
      const loadFuelCards = async () => {
          try {
              const cards = await fuelService.getFuelCards();
              setFuelCards(cards);
          } catch (e) {
              console.error("Failed to load fuel cards for matching", e);
          }
      };
      loadFuelCards();
  }, []);

  const saveFields = (fields: FieldDefinition[]) => {
    setAvailableFields(fields);
    localStorage.setItem('goRide_fields', JSON.stringify(fields));
  };

  // --- File Handling ---

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setIsParsing(true);
    setError(null);
    setWarning(null);

    let completed = 0;
    const newFiles: FileData[] = [];

    const handleAiMapping = async (fileData: FileData) => {
        try {
            setWarning("AI is analyzing file structure... this may take a moment.");
            const { projectId, publicAnonKey } = await import('../../utils/supabase/info');
            const res = await fetch(`${API_ENDPOINTS.ai}/ai/map-csv`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${publicAnonKey}`
                },
                body: JSON.stringify({
                    headers: fileData.headers,
                    sample: fileData.rows.slice(0, 5),
                    targetFields: availableFields.map(f => ({ key: f.key, label: f.label, type: f.type }))
                })
            });
            const data = await res.json();
            if (data.success && data.mapping) {
                fileData.customMapping = data.mapping;
                console.log("AI Mapping Applied for " + fileData.name, data.mapping);
            }
        } catch (e) {
            console.error("AI Mapping Failed:", e);
        }
    };

    const processQueue = async () => {
         // Identify generics (potential candidates for AI mapping)
         const generics = newFiles.filter(f => f.type === 'generic');
         
         // Only run AI if it's generic AND has rows
         if (generics.length > 0) {
             await Promise.all(generics.map(f => {
                 if (f.rows.length > 0) return handleAiMapping(f);
                 return Promise.resolve();
             }));
         }

         setIsParsing(false);
         setUploadedFiles(prev => [...prev, ...newFiles]);
         setStep('review_files');
         setWarning(null); 
    };

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
                    processQueue();
                }
            },
            error: (err) => {
                console.error("Parse error", err);
                completed++; // Ensure we don't hang
                if (completed === acceptedFiles.length) processQueue();
            }
        });
    });
  }, [availableFields]);

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
      // Phase 1: Capture Organization Name
      const knownFleetName = localStorage.getItem('goride_fleet_name') || undefined;
      const { trips, driverMetrics, vehicleMetrics, rentalContracts, organizationMetrics, fuelEntries, organizationName, calibrationStats } = mergeAndProcessData(uploadedFiles, availableFields, knownFleetName, fuelCards);

      if (organizationName) {
          localStorage.setItem('goride_fleet_name', organizationName);
          // Trigger update for AppLayout
          window.dispatchEvent(new Event('fleetNameUpdated'));
      }

      // 2. Apply Platform Override
      const finalTrips = trips.map(t => ({
          ...t,
          platform: selectedPlatform as any
      }));

      setProcessedData(finalTrips);
      setProcessedDriverMetrics(driverMetrics);
      setProcessedVehicleMetrics(vehicleMetrics);
      setProcessedOrganizationMetrics(organizationMetrics);
      setProcessedRentalContracts(rentalContracts);
      setProcessedFuelEntries(fuelEntries || []);
      setCalibrationStats(calibrationStats);
      setStep('preview_merged');
  };

  const getFilteredFiles = useCallback(() => {
    return uploadedFiles.map(file => {
        const disabled = disabledColumns[file.id] || [];
        if (disabled.length === 0) return file;

        const newHeaders = file.headers.filter(h => !disabled.includes(h));
        const newRows = file.rows.map(row => {
            const newRow: any = {};
            Object.keys(row).forEach(key => {
                if (!disabled.includes(key)) {
                    newRow[key] = row[key];
                }
            });
            return newRow;
        });

        return { ...file, headers: newHeaders, rows: newRows };
    });
  }, [uploadedFiles, disabledColumns]);

  const handleAnalyze = async () => {
    setIsParsing(true);
    setWarning("AI is analyzing your fleet data... This may take 30-60 seconds.");
    
    try {
        const filteredFiles = getFilteredFiles();

        // 1. Get AI Analysis
        const payload = constructAiPayload(filteredFiles);
        const { projectId, publicAnonKey } = await import('../../utils/supabase/info');
        
        const res = await fetch(`${API_ENDPOINTS.ai}/analyze-fleet`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${publicAnonKey}`
            },
            body: JSON.stringify({ payload })
        });
        
        const aiResponse = await res.json();
        if (!aiResponse.success) throw new Error(aiResponse.error || "AI Analysis Failed");
        
        const aiData = aiResponse.data; // { drivers, vehicles, financials, insights }

        // 2. Get Local Trips (for the table view)
        // This also runs the robust "Bottom-Up" financial calculation we just fixed.
        const knownFleetName = localStorage.getItem('goride_fleet_name') || undefined;
        const localResult = mergeAndProcessData(filteredFiles, availableFields, knownFleetName, fuelCards);
        
        if (localResult.organizationName) {
            localStorage.setItem('goride_fleet_name', localResult.organizationName);
            window.dispatchEvent(new Event('fleetNameUpdated'));
        }
        
        // Apply Platform Override (Parity with Legacy Merge)
        const finalTrips = localResult.trips.map(t => ({
            ...t,
            platform: selectedPlatform as any
        }));

        // 3. Merge AI Data into State
        setProcessedData(finalTrips); // Keep local trips for table
        setCalibrationStats(localResult.calibrationStats);
        setProcessedFuelEntries(localResult.fuelEntries || []);
        
        // Phase 1: Run AI Auditor
        if (aiData.drivers || aiData.vehicles || aiData.financials) {
            
            // OPTION 2 FIX: Override AI Financials with Local Bottom-Up Calculation
            // We trust our row-by-row sum ($38k) more than the AI's text reading ($77k)
            const trustedFinancials = localResult.organizationMetrics.length > 0 
                ? localResult.organizationMetrics[0] 
                : (aiData.financials || { totalEarnings: 0, netFare: 0, balanceStart: 0, balanceEnd: 0, periodChange: 0, fleetProfitMargin: 0, cashPosition: 0, periodStart: new Date().toISOString(), periodEnd: new Date().toISOString() });

            const audit = DataSanitizer.audit({
                // FIX: Prioritize Local Parser for Drivers/Vehicles (AI is hallucinating zeros)
                drivers: localResult.driverMetrics.length > 0 ? localResult.driverMetrics : (aiData.drivers || []),
                vehicles: localResult.vehicleMetrics.length > 0 ? localResult.vehicleMetrics : (aiData.vehicles || []),
                financials: trustedFinancials,
                metadata: aiData.metadata || { analysisDate: new Date().toISOString(), periodStart: new Date().toISOString(), periodEnd: new Date().toISOString(), filesProcessed: uploadedFiles.length },
                insights: aiData.insights || { alerts: [], trends: [], recommendations: [] }
            }, finalTrips);
            
            setAuditState(audit);
            
            // Hydrate Legacy State for Backward Compatibility
            setProcessedDriverMetrics(audit.sanitized.drivers.map(r => r.data));
            setProcessedVehicleMetrics(audit.sanitized.vehicles.map(r => r.data));
            setProcessedOrganizationMetrics([audit.sanitized.financials.data]);
            setProcessedInsights(aiData.insights);
            
            // Console Log for Devs
            console.log("AI Auditor Results:", audit.report);
            
            // Set Warning if Health is not 100%
            if (audit.report.status !== 'healthy') {
                 setWarning(audit.report.summary);
            }
        } else {
            // Fallback for partial AI failure
             if (aiData.drivers) setProcessedDriverMetrics(aiData.drivers); 
             if (aiData.vehicles) setProcessedVehicleMetrics(aiData.vehicles);
             if (aiData.financials) setProcessedOrganizationMetrics([aiData.financials]); 
             if (aiData.insights) setProcessedInsights(aiData.insights);
        }
        
        // Log insights for now (Phase 8 will visualize them)
        console.log("AI Insights:", aiData.insights);
        if (aiData.insights?.alerts?.length > 0) {
            setWarning(`AI Found Alerts: ${aiData.insights.alerts[0]}`);
        }

        setStep('preview_merged');
    } catch (e: any) {
        setError(e.message);
    } finally {
        setIsParsing(false);
        // Do not clear warning immediately so user sees the result
    }
  };

  const handleConfirmImport = async () => {
      setIsUploading(true);
      try {
          // Phase 6: Automatic Anchor Calibration
          // This tags trips with the nearest preceding verified anchor
          setWarning("Calibrating trips against physical odometer anchors...");
          const calibratedTrips = await tripCalibrationService.calibrateTrips(processedData);
          
          // Generate a Batch ID
          const batchId = crypto.randomUUID();
          
          // Create Batch Metadata
          const batchMeta = {
            id: batchId,
            fileName: uploadedFiles.map(f => f.name).join(', '),
            uploadDate: new Date().toISOString(),
            status: 'completed' as const,
            recordCount: calibratedTrips.length,
            type: 'merged_import',
            processedBy: 'Admin' // In real app, use user name
          };

          // Save Batch Record FIRST
          await api.createBatch(batchMeta);
          
          if (auditState) {
              // PHASE 7: NEW SAVE FLOW (Mega-JSON)
              const fleetState = {
                  drivers: auditState.sanitized.drivers.map(d => d.data),
                  vehicles: auditState.sanitized.vehicles.map(v => v.data),
                  trips: calibratedTrips.map(t => ({ ...t, batchId })), // Attach Batch ID and Calibrated Tags
                  financials: auditState.sanitized.financials.data,
                  metadata: auditState.sanitized.metadata,
                  insights: auditState.sanitized.insights
              };
              
              await api.saveFleetState(fleetState);
              
              // Notifications from AI Insights
              if (fleetState.insights) {
                  const promises = [];
                  if (fleetState.insights.alerts?.length > 0) {
                      for (const alertMsg of fleetState.insights.alerts) {
                           const isCritical = alertMsg.toLowerCase().includes('ghost') || alertMsg.toLowerCase().includes('fraud') || alertMsg.toLowerCase().includes('risk') || alertMsg.toLowerCase().includes('phantom');
                           promises.push(api.createNotification({
                              id: crypto.randomUUID(),
                              type: 'alert',
                              severity: isCritical ? 'critical' : 'warning',
                              title: isCritical ? 'Critical Anomaly Detected' : 'Fleet Alert',
                              message: alertMsg,
                              timestamp: new Date().toISOString(),
                              read: false
                           }));
                      }
                  }
                  // Trends
                  if (fleetState.insights.trends?.length > 0) {
                      for (const trendMsg of fleetState.insights.trends) {
                          promises.push(api.createNotification({
                              id: crypto.randomUUID(),
                              type: 'update',
                              severity: 'info',
                              title: 'Performance Trend',
                              message: trendMsg,
                              timestamp: new Date().toISOString(),
                              read: false
                          }));
                      }
                  }
                  await Promise.all(promises);
              }
              
          } else {
              // LEGACY FLOW (Fallback for standard merge)
              const tripsWithBatch = calibratedTrips.map(trip => ({
                ...trip,
                batchId
              }));

              await api.saveTrips(tripsWithBatch);

              if (processedDriverMetrics.length > 0) {
                  await api.saveDriverMetrics(processedDriverMetrics);
              }
              if (processedVehicleMetrics.length > 0) {
                  await api.saveVehicleMetrics(processedVehicleMetrics);
              }
          }

          // Phase 5: Save Fuel Entries
          if (processedFuelEntries.length > 0) {
              await Promise.all(processedFuelEntries.map(entry => 
                  fuelService.createFuelEntry(entry)
              ));
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

  const handleEditAnomaly = (id: string, type: 'trip' | 'driver' | 'vehicle', updatedData: any) => {
      if (!auditState) return;
      const newState = { ...auditState };
      
      if (type === 'trip' && newState.sanitized.trips) {
          const idx = newState.sanitized.trips.findIndex(t => t.data.id === id);
          if (idx !== -1) {
              // 1. Update Data
              newState.sanitized.trips[idx].data = { ...newState.sanitized.trips[idx].data, ...updatedData };
              // 2. Re-Audit
              const reAudit = DataSanitizer.auditTrip(newState.sanitized.trips[idx].data);
              newState.sanitized.trips[idx] = reAudit;
          }
      } else if (type === 'driver') {
          const idx = newState.sanitized.drivers.findIndex(d => d.data.driverId === id);
          if (idx !== -1) {
              newState.sanitized.drivers[idx].data = { ...newState.sanitized.drivers[idx].data, ...updatedData };
              const reAudit = DataSanitizer.auditDriver(newState.sanitized.drivers[idx].data);
              newState.sanitized.drivers[idx] = reAudit;
          }
      } else if (type === 'vehicle') {
          // Find by plate or ID
          const idx = newState.sanitized.vehicles.findIndex(v => (v.data.plateNumber === id || v.data.vehicleId === id));
          if (idx !== -1) {
              newState.sanitized.vehicles[idx].data = { ...newState.sanitized.vehicles[idx].data, ...updatedData };
              const reAudit = DataSanitizer.auditVehicle(newState.sanitized.vehicles[idx].data);
              newState.sanitized.vehicles[idx] = reAudit;
          }
      }
      
      // 3. Re-calculate Report Score & Summary (Simplified for now - strictly re-running report gen would be best but this is okay)
      // Actually, we should trigger a full report regen if we want the score to update.
      // But for Phase 4, just updating the record state is sufficient to remove it from the quarantine list if healthy.
      
      setAuditState(newState);
      if (type === 'trip') setProcessedData(newState.sanitized.trips?.map(t => t.data) || []);
      if (type === 'driver') setProcessedDriverMetrics(newState.sanitized.drivers.map(d => d.data));
      if (type === 'vehicle') setProcessedVehicleMetrics(newState.sanitized.vehicles.map(v => v.data));
  };

  const handleDismissAnomaly = (id: string, type: 'trip' | 'driver' | 'vehicle') => {
      if (!auditState) return;
      const newState = { ...auditState };
      
      if (type === 'trip') {
          const idx = newState.sanitized.trips.findIndex(t => t.data.id === id);
          if (idx !== -1) {
              newState.sanitized.trips[idx].issues = [];
              // Rudimentary count update - ideally we re-run audit
              newState.report.warningCount = Math.max(0, newState.report.warningCount - 1);
          }
      } else if (type === 'driver') {
          const idx = newState.sanitized.drivers.findIndex(d => d.data.driverId === id);
          if (idx !== -1) {
              newState.sanitized.drivers[idx].issues = [];
              newState.report.warningCount = Math.max(0, newState.report.warningCount - 1);
          }
      } else if (type === 'vehicle') {
          const idx = newState.sanitized.vehicles.findIndex(v => v.data.plateNumber === id || v.data.vehicleId === id);
          if (idx !== -1) {
              newState.sanitized.vehicles[idx].issues = [];
              newState.report.warningCount = Math.max(0, newState.report.warningCount - 1);
          }
      }
      setAuditState(newState);
  };

  const handleExcludeAnomaly = (id: string, type: 'trip' | 'driver' | 'vehicle') => {
      if (!auditState) return;
      const newState = { ...auditState };
      
      if (type === 'trip') {
          const idx = newState.sanitized.trips.findIndex(t => t.data.id === id);
          if (idx !== -1) {
              newState.sanitized.trips[idx].isExcluded = true;
              newState.report.warningCount = Math.max(0, newState.report.warningCount - 1);
          }
      } else if (type === 'driver') {
          const idx = newState.sanitized.drivers.findIndex(d => d.data.driverId === id);
          if (idx !== -1) {
              newState.sanitized.drivers[idx].isExcluded = true;
              newState.report.warningCount = Math.max(0, newState.report.warningCount - 1);
          }
      } else if (type === 'vehicle') {
          const idx = newState.sanitized.vehicles.findIndex(v => v.data.plateNumber === id || v.data.vehicleId === id);
          if (idx !== -1) {
              newState.sanitized.vehicles[idx].isExcluded = true;
              newState.report.warningCount = Math.max(0, newState.report.warningCount - 1);
          }
      }
      setAuditState(newState);
      
      // Update processed lists to remove excluded items
      if (type === 'trip') setProcessedData(newState.sanitized.trips.filter(t => !t.isExcluded).map(t => t.data));
      if (type === 'driver') setProcessedDriverMetrics(newState.sanitized.drivers.filter(d => !d.isExcluded).map(d => d.data));
      if (type === 'vehicle') setProcessedVehicleMetrics(newState.sanitized.vehicles.filter(v => !v.isExcluded).map(v => v.data));
  };

  const getFileIcon = (type: FileData['type']) => {
      if (type === 'uber_trip') return <div className="p-2 bg-blue-100 rounded-lg text-blue-600"><Merge className="h-5 w-5" /></div>;
      if (type === 'uber_payment') return <div className="p-2 bg-green-100 rounded-lg text-green-600"><CheckCircle className="h-5 w-5" /></div>;
      if (type === 'uber_payment_driver') return <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600"><CheckCircle className="h-5 w-5" /></div>;
      if (type === 'uber_payment_org') return <div className="p-2 bg-teal-100 rounded-lg text-teal-600"><CheckCircle className="h-5 w-5" /></div>;
      if (type === 'uber_driver_quality') return <div className="p-2 bg-purple-100 rounded-lg text-purple-600"><Zap className="h-5 w-5" /></div>;
      if (type === 'uber_driver_activity') return <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600"><Zap className="h-5 w-5" /></div>;
      if (type === 'uber_vehicle_performance') return <div className="p-2 bg-orange-100 rounded-lg text-orange-600"><Car className="h-5 w-5" /></div>;
      if (type === 'fuel_statement') return <div className="p-2 bg-rose-100 rounded-lg text-rose-600"><Fuel className="h-5 w-5" /></div>;
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
      if (type === 'fuel_statement') return <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-200 border-rose-200">Fuel Statement</Badge>;
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
            const response = await fetch(`${API_ENDPOINTS.fleet}/uber/sync`, {
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
            const urlRes = await fetch(`${API_ENDPOINTS.fleet}/uber/auth-url?redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`, {
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
                            const exchangeRes = await fetch(`${API_ENDPOINTS.fleet}/uber/exchange`, {
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
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
                <DialogContent className="max-w-3xl max-h-[80vh]">
                    <DialogHeader>
                        <DialogTitle>Manage System Fields</DialogTitle>
                        <DialogDescription>
                            Select which columns should be parsed for each file. Uncheck columns to ignore them.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4 overflow-y-auto max-h-[60vh]">
                        {uploadedFiles.map(file => (
                            <div key={file.id} className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-900">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-indigo-500" />
                                        <span className="font-semibold text-sm">{file.name}</span>
                                    </div>
                                    <Badge variant="outline" className="bg-white">{file.type}</Badge>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                    {file.headers.map(header => (
                                        <div key={header} className="flex items-center space-x-2 bg-white dark:bg-slate-800 p-2 rounded border border-slate-100 dark:border-slate-700">
                                            <Checkbox 
                                                id={`col-${file.id}-${header}`} 
                                                checked={!disabledColumns[file.id]?.includes(header)}
                                                onCheckedChange={(checked) => {
                                                    setDisabledColumns(prev => {
                                                        const current = prev[file.id] || [];
                                                        if (checked) {
                                                            return { ...prev, [file.id]: current.filter(h => h !== header) };
                                                        } else {
                                                            return { ...prev, [file.id]: [...current, header] };
                                                        }
                                                    });
                                                }}
                                            />
                                            <Label htmlFor={`col-${file.id}-${header}`} className="text-xs truncate cursor-pointer select-none" title={header}>
                                                {header}
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {uploadedFiles.length === 0 && (
                            <div className="text-center text-slate-500 py-8">
                                No files uploaded.
                            </div>
                        )}
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
                        <div className="text-center">
                            <h4 className="font-semibold text-indigo-900">Uber Sync</h4>
                            <p className="text-xs text-indigo-600/80 mt-1">Connect Account</p>
                        </div>
                    </CardContent>
                </Card>

                {/* CSV Options */}
                {[
                    { id: 'Uber', icon: 'UB', color: 'bg-black text-white' },
                    { id: 'InDrive', icon: 'IN', color: 'bg-blue-500 text-white' },
                    { id: 'Fuel', icon: <Fuel className="h-6 w-6" />, color: 'bg-amber-500 text-white' },
                    { id: 'Toll Top-up', icon: <CreditCard className="h-6 w-6" />, color: 'bg-emerald-600 text-white', action: () => setTollImportMode('topup') },
                    { id: 'Toll Usage', icon: <MinusCircle className="h-6 w-6" />, color: 'bg-slate-600 text-white', action: () => setTollImportMode('usage') },
                    { id: 'Disaster Recovery', icon: <CloudDownload className="h-6 w-6" />, color: 'bg-white border-2 border-slate-200 text-slate-600', subtext: 'Export Backup', action: handleExportBackup },
                    { id: 'Restore Backup', icon: <UploadCloud className="h-6 w-6" />, color: 'bg-rose-50 border-2 border-rose-100 text-rose-600', subtext: 'Import Recovery CSV', action: () => setTollImportMode('recovery') },
                ].map((platform: any) => (
                    <Card 
                        key={platform.id}
                        onClick={() => {
                            if (platform.action) {
                                platform.action();
                            } else {
                                setSelectedPlatform(platform.id); 
                                setStep('upload'); 
                            }
                        }}
                        className="cursor-pointer transition-all duration-200 hover:border-slate-400 hover:shadow-md"
                    >
                        <CardContent className="flex flex-col items-center justify-center p-6 space-y-4">
                            <div className={`h-12 w-12 rounded-full ${platform.color} flex items-center justify-center font-bold text-lg`}>
                                {platform.icon}
                            </div>
                            <div className="text-center">
                                <h4 className="font-semibold">{platform.id}</h4>
                                <p className="text-xs text-slate-500 mt-1">{platform.subtext || 'CSV Import'}</p>
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
            <div className="flex justify-between items-center">
                <div>
                    <CardTitle>Upload {selectedPlatform} Data</CardTitle>
                    <CardDescription>
                        {selectedPlatform === 'Uber' 
                        ? 'Upload "Trip Activity" AND "Payment Orders" files together.' 
                        : selectedPlatform === 'Fuel'
                        ? 'Upload your fuel card statement (CSV).'
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

                              <div className="flex flex-col gap-2 w-full">
                                  <Button onClick={handleAnalyze} className="w-full bg-violet-600 hover:bg-violet-700 shadow-sm" size="lg" disabled={isParsing}>
                                      {isParsing ? (
                                        <>
                                            <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                                            AI Analyzing...
                                        </>
                                      ) : (
                                        <>Analyze Fleet with AI <Zap className="ml-2 h-4 w-4" /></>
                                      )}
                                  </Button>
                              </div>
                          </div>
                      </CardContent>
                  </Card>
              </div>
          </div>
      )}

      {/* STEP 3: PREVIEW & CONFIRM */}
      {step === 'preview_merged' && (
          <div className="flex flex-col h-[calc(100vh-140px)] gap-4">
              
               {/* PHASE 2: AI Audit Summary Card */}
              <CollapsibleSection 
                  title="Data Quality Assessment" 
                  icon={<ShieldCheck className="h-5 w-5 text-indigo-600" />}
              >
                  {auditState ? (
                       <AuditSummaryCard report={auditState.report} />
                  ) : (
                      // Legacy Warning (Fallback)
                      warning && (
                        <Alert variant="default" className="bg-yellow-50 border-yellow-200 text-yellow-800">
                            <Info className="h-4 w-4 text-yellow-800" />
                            <AlertTitle>System Notice</AlertTitle>
                            <AlertDescription>{warning}</AlertDescription>
                        </Alert>
                      )
                  )}
              </CollapsibleSection>

              {/* Phase 5: Calibration Verification */}
              {calibrationStats && (
                  <CollapsibleSection 
                      title="Performance Calibration" 
                      icon={<Clock className="h-5 w-5 text-blue-500" />}
                  >
                      <CalibrationReport 
                          stats={calibrationStats} 
                          tripCount={processedData.filter(t => t.status === 'Completed').length} 
                      />
                  </CollapsibleSection>
              )}

              {/* Quick Stats Bar */}
              <CollapsibleSection 
                  title="Import Statistics" 
                  icon={<BarChart2 className="h-5 w-5 text-slate-500" />}
              >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card>
                            <CardContent className="p-4 flex flex-col items-center text-center">
                                <span className="text-xs text-slate-500 uppercase font-medium">Trips Found</span>
                                <span className="text-2xl font-bold text-slate-900">{processedData.filter(t => t.status === 'Completed').length}</span>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4 flex flex-col items-center text-center">
                                <span className="text-xs text-slate-500 uppercase font-medium">Drivers</span>
                                <span className="text-2xl font-bold text-slate-900">{processedDriverMetrics.length}</span>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4 flex flex-col items-center text-center">
                                <span className="text-xs text-slate-500 uppercase font-medium">Vehicles</span>
                                <span className="text-2xl font-bold text-slate-900">{processedVehicleMetrics.length}</span>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4 flex flex-col items-center text-center">
                                <span className="text-xs text-slate-500 uppercase font-medium">Total Volume</span>
                                <span className="text-2xl font-bold text-slate-900">
                                    ${processedOrganizationMetrics[0]?.totalEarnings?.toLocaleString() || "0"}
                                </span>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Financial Health Checks (New Tiles) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card>
                            <CardContent className="p-4 flex flex-col items-center text-center">
                                <span className="text-xs text-slate-500 uppercase font-medium">Pending Balance</span>
                                <span className="text-2xl font-bold text-slate-900">
                                    ${processedOrganizationMetrics[0]?.balanceEnd?.toLocaleString(undefined, {minimumFractionDigits: 2}) || '0.00'}
                                </span>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="p-4 flex flex-col items-center text-center">
                                <span className="text-xs text-slate-500 uppercase font-medium">Transferred To Bank Account</span>
                                <span className="text-2xl font-bold text-slate-900">
                                    {processedOrganizationMetrics[0]?.bankTransfer ? `$${processedOrganizationMetrics[0].bankTransfer.toLocaleString(undefined, {minimumFractionDigits: 2})}` : '-'}
                                </span>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="p-4 flex flex-col items-center text-center">
                                <span className="text-xs text-slate-500 uppercase font-medium">Cash Collected in Hand</span>
                                <span className="text-2xl font-bold text-red-600">
                                    ${processedOrganizationMetrics[0]?.totalCashExposure?.toLocaleString(undefined, {minimumFractionDigits: 2}) || '0.00'}
                                </span>
                            </CardContent>
                        </Card>
                    </div>
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                  title="Import Preview"
                  icon={<FileText className="h-5 w-5 text-slate-500" />}
                  defaultOpen={true}
              >
                  <Card className="flex-1 flex flex-col overflow-hidden border-slate-200 shadow-sm min-h-[600px]">
                      <CardHeader className="pb-2 border-b border-slate-100 bg-white sticky top-0 z-10">
                          <div className="flex justify-between items-center">
                              <div className="space-y-1">
                                  <CardTitle className="text-xl">Import Preview</CardTitle>
                                  <CardDescription>
                                      Review the merged data before committing to the database.
                                  </CardDescription>
                              </div>
                              <div className="flex gap-2">
                                  <Button variant="outline" onClick={() => setStep('review_files')}>
                                      <ArrowLeft className="mr-2 h-4 w-4" /> Back to Files
                                  </Button>
                                  <Button onClick={handleConfirmImport} disabled={isUploading || (auditState?.report.status === 'critical')} className={auditState?.report.status === 'critical' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}>
                                     {isUploading ? "Uploading..." : (auditState?.report.status === 'critical' ? "Force Import (Risky)" : "Confirm Import")}
                                  </Button>
                              </div>
                          </div>
                      </CardHeader>
                      <CardContent className="flex-1 overflow-auto pt-4 bg-slate-50/50">
                          
                          <Tabs defaultValue={auditState && (auditState.report.warningCount > 0 || auditState.report.criticalCount > 0) ? "quarantine" : "fleet"} className="w-full">
                          <TabsList className="mb-4 bg-white border border-slate-200 p-1 h-auto flex-wrap">
                              {auditState && (auditState.report.warningCount > 0 || auditState.report.criticalCount > 0) && (
                                  <TabsTrigger value="quarantine" className="data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700 flex items-center gap-2">
                                      <AlertTriangle className="h-4 w-4" />
                                      Flagged Records
                                      <Badge variant="outline" className="h-5 px-1.5 ml-1 bg-amber-100 text-amber-800 border-amber-200">
                                          {auditState.report.warningCount + auditState.report.criticalCount}
                                      </Badge>
                                  </TabsTrigger>
                              )}
                              <TabsTrigger value="fleet" className="data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">Analysis Dashboard</TabsTrigger>
                              <TabsTrigger value="trips" className="data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">Trips ({processedData.length})</TabsTrigger>
                              <TabsTrigger value="financials" className="data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">Financials</TabsTrigger>
                              <TabsTrigger value="drivers" disabled={processedDriverMetrics.length === 0} className="data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
                                  Driver Performance {processedDriverMetrics.length > 0 && `(${processedDriverMetrics.length})`}
                              </TabsTrigger>
                              <TabsTrigger value="vehicles" disabled={processedVehicleMetrics.length === 0} className="data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
                                   Vehicle Health {processedVehicleMetrics.length > 0 && `(${processedVehicleMetrics.length})`}
                              </TabsTrigger>
                              <TabsTrigger value="trip_meter" disabled={processedData.length === 0} className="data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
                                   Trip Meter {processedData.length > 0 && `(${processedData.length})`}
                              </TabsTrigger>
                              <TabsTrigger value="fuel" disabled={processedFuelEntries.length === 0} className="data-[state=active]:bg-rose-50 data-[state=active]:text-rose-700">
                                   Fuel Data {processedFuelEntries.length > 0 && `(${processedFuelEntries.length})`}
                              </TabsTrigger>
                          </TabsList>

                          <TabsContent value="quarantine" className="space-y-4">
                              {auditState && (
                                  <>
                                    <ImpactAnalysis newState={auditState} />
                                    <QuarantineList 
                                        auditState={auditState} 
                                        onDismiss={handleDismissAnomaly}
                                        onExclude={handleExcludeAnomaly}
                                        onSave={handleEditAnomaly}
                                    />
                                  </>
                              )}
                          </TabsContent>

                          <TabsContent value="fleet" className="space-y-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Performance Metrics</CardTitle>
                                    <CardDescription>
                                        Analyzed performance metrics for {processedData.length} trips.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {processedData.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center p-12 bg-slate-50 border border-dashed rounded-lg text-slate-500">
                                            <Layers className="h-12 w-12 text-slate-300 mb-2" />
                                            <p>No trip data found to analyze.</p>
                                            <p className="text-xs mt-1">Upload Trip Activity or Payment files.</p>
                                        </div>
                                    ) : (
                                        <div className="rounded-md border h-[500px] overflow-auto">
                                            {/* Mobile Card View */}
                                            <div className="md:hidden p-4 space-y-4">
                                                {processedData.slice(0, 50).map((trip) => {
                                                    const dateStr = trip.date || trip.requestTime;
                                                    const date = dateStr ? new Date(dateStr) : null;
                                                    const dist = trip.distance || 0;
                                                    const dur = trip.duration || 0;
                                                    const earn = trip.grossEarnings || 0;
                                                    const speed = dur > 0 ? (dist / (dur / 60)) : 0;
                                                    
                                                    return (
                                                        <Card key={trip.id} className="border-slate-200 shadow-sm">
                                                            <CardContent className="p-3">
                                                                <div className="flex justify-between items-center mb-2">
                                                                    <span className="font-medium text-slate-900">{date ? date.toLocaleDateString() : 'No Date'}</span>
                                                                    <Badge variant="outline">{dur.toFixed(0)} min</Badge>
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-y-2 text-sm text-slate-600">
                                                                    <div>Speed: <span className="text-slate-900">{speed.toFixed(1)} km/h</span></div>
                                                                    <div>Earn: <span className="text-emerald-700 font-medium">${earn.toFixed(2)}</span></div>
                                                                    <div className="col-span-2 text-xs text-slate-400 mt-1">ID: {trip.id.substring(0,8)}...</div>
                                                                </div>
                                                            </CardContent>
                                                        </Card>
                                                    );
                                                })}
                                            </div>

                                            {/* Desktop Table */}
                                            <Table className="hidden md:table">
                                                <TableHeader className="bg-slate-50 sticky top-0">
                                                    <TableRow>
                                                        <TableHead>Date</TableHead>
                                                        <TableHead>Day</TableHead>
                                                        <TableHead>Time of Day</TableHead>
                                                        <TableHead className="text-right">Speed</TableHead>
                                                        <TableHead className="text-right">Earn/Km</TableHead>
                                                        <TableHead className="text-right">Earn/Min</TableHead>
                                                        <TableHead className="text-right">Efficiency</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {(() => {
                                                        const avgDist = processedData.reduce((sum, t) => sum + (t.distance || 0), 0) / (processedData.length || 1);
                                                        
                                                        return processedData.map((trip) => {
                                                            const dateStr = trip.date || trip.requestTime;
                                                            const date = dateStr ? new Date(dateStr) : null;
                                                            
                                                            const dayOfWeek = date ? date.toLocaleDateString('en-US', { weekday: 'long' }) : '-';
                                                            const hour = date ? date.getHours() : 0;
                                                            
                                                            let timeOfDay = '-';
                                                            if (date) {
                                                                timeOfDay = 'Night';
                                                                if (hour >= 6 && hour < 12) timeOfDay = 'Morning';
                                                                else if (hour >= 12 && hour < 18) timeOfDay = 'Afternoon';
                                                                else if (hour >= 18 && hour < 24) timeOfDay = 'Evening';
                                                            }

                                                            const dist = trip.distance || 0;
                                                            const dur = trip.duration || 0; // minutes
                                                            const earn = trip.grossEarnings || 0;
                                                            
                                                            // Speed: km/h (assuming dist is km)
                                                            const speed = dur > 0 ? (dist / (dur / 60)) : 0;
                                                            
                                                            // Earn per km
                                                            const earnPerKm = dist > 0 ? (earn / dist) : 0;
                                                            
                                                            // Earn per min
                                                            const earnPerMin = dur > 0 ? (earn / dur) : 0;
                                                            
                                                            // Efficiency
                                                            const eff = avgDist > 0 ? (dist / avgDist) : 0;
                                                            
                                                            return (
                                                                <TableRow key={trip.id}>
                                                                    <TableCell className="whitespace-nowrap">{date ? date.toLocaleDateString() : 'No Date'}</TableCell>
                                                                    <TableCell>{dayOfWeek}</TableCell>
                                                                    <TableCell>
                                                                      <Badge variant="outline" className="font-normal">{timeOfDay}</Badge>
                                                                    </TableCell>
                                                                    <TableCell className="text-right">{speed.toFixed(1)} km/h</TableCell>
                                                                    <TableCell className="text-right">{earnPerKm === 0 ? '-' : `$${earnPerKm.toFixed(2)}`}</TableCell>
                                                                    <TableCell className="text-right">{earnPerMin === 0 ? '-' : `$${earnPerMin.toFixed(2)}`}</TableCell>
                                                                    <TableCell className="text-right">{eff.toFixed(2)}x</TableCell>
                                                                </TableRow>
                                                            );
                                                        });
                                                    })()}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                          </TabsContent>
                          
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
                                        <TableHead>Trip ID</TableHead>
                                        <TableHead>Date & Time</TableHead>
                                        <TableHead>Duration</TableHead>
                                        <TableHead>Distance</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Pickup</TableHead>
                                        <TableHead>Dropoff</TableHead>
                                        <TableHead>Service</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {processedData.slice(0, 100).map(trip => (
                                        <TableRow key={trip.id}>
                                            <TableCell className="font-mono text-xs text-slate-500">
                                                {trip.id.substring(0, 8)}...
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{new Date(trip.requestTime || trip.date).toLocaleDateString()}</span>
                                                    <span className="text-slate-500">
                                                        {new Date(trip.requestTime || trip.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                        {trip.dropoffTime && ` - ${new Date(trip.dropoffTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs">{trip.duration ? `${Math.round(trip.duration)} min` : '-'}</TableCell>
                                            <TableCell className="text-xs">{trip.distance ? `${trip.distance.toFixed(1)} km` : '-'}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={
                                                    trip.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                                                    trip.status === 'Cancelled' ? 'bg-rose-50 text-rose-700 border-rose-200' : ''
                                                }>
                                                    {trip.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-xs truncate max-w-[150px]" title={trip.pickupLocation}>
                                                {trip.pickupArea || trip.pickupLocation || '-'}
                                            </TableCell>
                                            <TableCell className="text-xs truncate max-w-[150px]" title={trip.dropoffLocation}>
                                                {trip.dropoffArea || trip.dropoffLocation || '-'}
                                            </TableCell>
                                            <TableCell className="text-xs">{trip.serviceType || 'UberX'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            </div>
                          </TabsContent>

                          <TabsContent value="financials" className="space-y-4">
                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md flex items-start sm:items-center gap-3">
                                <FileText className="h-4 w-4 text-slate-500 mt-1 sm:mt-0" />
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                    <span className="text-sm text-slate-500 font-medium whitespace-nowrap">Source Files:</span>
                                    <div className="flex flex-wrap gap-2">
                                        {uploadedFiles.filter(f => f.type === 'uber_payment').map(f => (
                                            <Badge key={f.id} variant="secondary" className="bg-white border-slate-200 text-slate-600 hover:bg-white font-normal">
                                                {f.name}
                                            </Badge>
                                        ))}
                                        {uploadedFiles.filter(f => f.type === 'uber_payment').length === 0 && (
                                            <span className="text-xs text-slate-400 italic">No payment files linked</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="h-[500px] overflow-auto border rounded-md">
                                {/* Mobile Financial Cards */}
                                <div className="md:hidden p-4 space-y-4">
                                    {processedData.slice(0, 50).map(trip => (
                                        <Card key={trip.id} className="border-slate-200">
                                            <CardContent className="p-3 space-y-2">
                                                <div className="flex justify-between items-center">
                                                     <div className="font-mono text-xs text-slate-500">{trip.id.substring(0, 8)}...</div>
                                                     <div className="text-emerald-700 font-bold">${trip.netToDriver !== undefined ? trip.netToDriver.toFixed(2) : '-'}</div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-y-1 text-xs text-slate-600">
                                                    <div className="flex justify-between mr-2"><span>Gross:</span> <span>{trip.grossEarnings?.toFixed(2) || '-'}</span></div>
                                                    <div className="flex justify-between"><span>Base:</span> <span>{trip.fareBreakdown?.baseFare?.toFixed(2) || '-'}</span></div>
                                                    <div className="flex justify-between mr-2"><span>Tips:</span> <span>{trip.fareBreakdown?.tips?.toFixed(2) || '-'}</span></div>
                                                    <div className="flex justify-between"><span>Surge:</span> <span>{trip.fareBreakdown?.surge?.toFixed(2) || '-'}</span></div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>

                                <Table className="hidden md:table">
                                <TooltipProvider>
                                <TableHeader className="bg-slate-50 sticky top-0 z-10">
                                    <TableRow>
                                        <TableHead>
                                            <Tooltip>
                                                <TooltipTrigger className="flex items-center gap-1 cursor-help">
                                                    Trip ID <Info className="h-3 w-3 text-slate-400" />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>Unique identifier for the trip</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TableHead>
                                        <TableHead className="text-right">
                                            <Tooltip>
                                                <TooltipTrigger className="flex items-center justify-end gap-1 cursor-help w-full">
                                                    Gross Earnings <Info className="h-3 w-3 text-slate-400" />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>Total amount charged to the rider (before deductions)</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TableHead>
                                        <TableHead className="text-right">
                                            <Tooltip>
                                                <TooltipTrigger className="flex items-center justify-end gap-1 cursor-help w-full">
                                                    Base Fare <Info className="h-3 w-3 text-slate-400" />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>The core fare based on trip time and distance</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TableHead>
                                        <TableHead className="text-right">
                                            <Tooltip>
                                                <TooltipTrigger className="flex items-center justify-end gap-1 cursor-help w-full">
                                                    Tips <Info className="h-3 w-3 text-slate-400" />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>Gratuity paid by the rider</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TableHead>
                                        <TableHead className="text-right">
                                            <Tooltip>
                                                <TooltipTrigger className="flex items-center justify-end gap-1 cursor-help w-full">
                                                    Wait Time <Info className="h-3 w-3 text-slate-400" />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>Earnings for waiting at the pickup location</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TableHead>
                                        <TableHead className="text-right">
                                            <Tooltip>
                                                <TooltipTrigger className="flex items-center justify-end gap-1 cursor-help w-full">
                                                    Surge <Info className="h-3 w-3 text-slate-400" />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>Extra earnings due to high demand (surge pricing)</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TableHead>
                                        <TableHead className="text-right">
                                            <Tooltip>
                                                <TooltipTrigger className="flex items-center justify-end gap-1 cursor-help w-full">
                                                    Airport Fees <Info className="h-3 w-3 text-slate-400" />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>Surcharges for airport pickups or drop-offs</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TableHead>
                                        <TableHead className="text-right">
                                            <Tooltip>
                                                <TooltipTrigger className="flex items-center justify-end gap-1 cursor-help w-full">
                                                    Time at Stop <Info className="h-3 w-3 text-slate-400" />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>Earnings for time spent at intermediate stops</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TableHead>
                                        <TableHead className="text-right">
                                            <Tooltip>
                                                <TooltipTrigger className="flex items-center justify-end gap-1 cursor-help w-full">
                                                    Taxes <Info className="h-3 w-3 text-slate-400" />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>Tax amount collected or deducted</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TableHead>
                                        <TableHead className="text-right">
                                            <Tooltip>
                                                <TooltipTrigger className="flex items-center justify-end gap-1 cursor-help w-full">
                                                    Toll Charges <Info className="h-3 w-3 text-slate-400" />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>Tolls paid during the trip (reimbursed)</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TableHead>
                                        <TableHead className="text-right text-amber-600">
                                            <Tooltip>
                                                <TooltipTrigger className="flex items-center justify-end gap-1 cursor-help w-full">
                                                    Cash Collected <Info className="h-3 w-3 text-amber-500" />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>Cash payment collected directly from the rider</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TableHead>
                                        <TableHead className="text-right font-bold">
                                            <Tooltip>
                                                <TooltipTrigger className="flex items-center justify-end gap-1 cursor-help w-full">
                                                    Net to Driver <Info className="h-3 w-3 text-slate-400" />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>This is the final amount added to your bank payout after all deductions and cash adjustments</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                </TooltipProvider>
                                <TableBody>
                                    {processedData.slice(0, 100).map(trip => (
                                        <TableRow key={trip.id}>
                                            <TableCell className="font-mono text-xs text-slate-500">
                                                {trip.id.substring(0, 8)}...
                                            </TableCell>
                                            <TableCell className="text-right font-medium text-xs">
                                                {trip.grossEarnings !== undefined ? trip.grossEarnings.toFixed(2) : '-'}
                                            </TableCell>
                                            <TableCell className="text-right text-slate-500 text-xs">
                                                {trip.fareBreakdown?.baseFare ? trip.fareBreakdown.baseFare.toFixed(2) : '-'}
                                            </TableCell>
                                            <TableCell className="text-right text-slate-500 text-xs">
                                                {trip.fareBreakdown?.tips ? trip.fareBreakdown.tips.toFixed(2) : '-'}
                                            </TableCell>
                                            <TableCell className="text-right text-slate-500 text-xs">
                                                {trip.fareBreakdown?.waitTime ? trip.fareBreakdown.waitTime.toFixed(2) : '-'}
                                            </TableCell>
                                            <TableCell className="text-right text-slate-500 text-xs">
                                                {trip.fareBreakdown?.surge ? trip.fareBreakdown.surge.toFixed(2) : '-'}
                                            </TableCell>
                                            <TableCell className="text-right text-slate-500 text-xs">
                                                {trip.fareBreakdown?.airportFees ? trip.fareBreakdown.airportFees.toFixed(2) : '-'}
                                            </TableCell>
                                            <TableCell className="text-right text-slate-500 text-xs">
                                                {trip.fareBreakdown?.timeAtStop ? trip.fareBreakdown.timeAtStop.toFixed(2) : '-'}
                                            </TableCell>
                                             <TableCell className="text-right text-slate-500 text-xs">
                                                {trip.fareBreakdown?.taxes ? trip.fareBreakdown.taxes.toFixed(2) : '-'}
                                            </TableCell>
                                            <TableCell className="text-right text-slate-500 text-xs">
                                                {trip.tollCharges ? trip.tollCharges.toFixed(2) : '-'}
                                            </TableCell>
                                            <TableCell className="text-right text-amber-600 font-medium text-xs">
                                                {trip.cashCollected ? trip.cashCollected.toFixed(2) : '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-emerald-600 text-xs">
                                                {trip.netToDriver !== undefined ? trip.netToDriver.toFixed(2) : '-'}
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
                              <VehicleHealthCard 
                                metrics={processedVehicleMetrics} 
                                totalDistance={processedData.reduce((sum, t) => sum + (t.distance || 0), 0)}
                              />
                            </div>
                          </TabsContent>

                          <TabsContent value="trip_meter" className="space-y-4">
                              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md flex items-start sm:items-center gap-3">
                                <FileText className="h-4 w-4 text-slate-500 mt-1 sm:mt-0" />
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                    <span className="text-sm text-slate-500 font-medium whitespace-nowrap">Source Files:</span>
                                    <div className="flex flex-wrap gap-2">
                                        {uploadedFiles.filter(f => ['uber_trip', 'uber_vehicle_performance'].includes(f.type)).map(f => (
                                            <Badge key={f.id} variant="secondary" className="bg-white border-slate-200 text-slate-600 hover:bg-white font-normal">
                                                {f.name}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="h-[500px] overflow-auto border rounded-md">
                                <Table>
                                    <TableHeader className="bg-slate-50 sticky top-0 z-10">
                                        <TableRow>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Trip ID</TableHead>
                                            <TableHead className="text-right">Available (hrs)</TableHead>
                                            <TableHead className="text-right">To Trip (hrs)</TableHead>
                                            <TableHead className="text-right">On Trip (hrs)</TableHead>
                                            <TableHead className="text-right">Total (hrs)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {processedData.slice(0, 100).map((trip, i) => {
                                            const dateStr = trip.date || trip.requestTime;
                                            const date = dateStr ? new Date(dateStr).toLocaleDateString() : '-';
                                            
                                            return (
                                                <TableRow key={trip.id || i}>
                                                    <TableCell className="font-medium">{date}</TableCell>
                                                    <TableCell className="font-mono text-xs text-slate-500">{trip.id ? trip.id.substring(0, 8) : '-'}</TableCell>
                                                    <TableCell className="text-right font-medium text-blue-700 bg-blue-50">
                                                        {(trip.availableHours || 0).toFixed(2)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium text-amber-700 bg-amber-50">
                                                        {(trip.toTripHours || 0).toFixed(2)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium text-emerald-700 bg-emerald-50">
                                                        {(trip.onTripHours || 0).toFixed(2)}
                                                    </TableCell>
                                                    <TableCell className="text-right text-slate-500">
                                                        {(trip.totalHours || 0).toFixed(2)}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                        {processedData.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                                                    No trips found. Please upload a "Trip Activity" file.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                          </TabsContent>

                          <TabsContent value="fuel" className="space-y-4">
                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md flex items-start sm:items-center gap-3">
                                <Fuel className="h-4 w-4 text-rose-500 mt-1 sm:mt-0" />
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                    <span className="text-sm text-slate-500 font-medium whitespace-nowrap">Source Files:</span>
                                    <div className="flex flex-wrap gap-2">
                                        {uploadedFiles.filter(f => f.type === 'fuel_statement').map(f => (
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
                                            <TableHead>Card Status</TableHead>
                                            <TableHead>Location</TableHead>
                                            <TableHead className="text-right">Volume (L)</TableHead>
                                            <TableHead className="text-right">Amount ($)</TableHead>
                                            <TableHead>Type</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {processedFuelEntries.map(entry => (
                                            <TableRow key={entry.id}>
                                                <TableCell>{new Date(entry.date).toLocaleDateString()}</TableCell>
                                                <TableCell>
                                                    {entry.cardId ? (
                                                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Matched</Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Unmatched</Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-xs truncate max-w-[200px]" title={entry.location}>{entry.location || '-'}</TableCell>
                                                <TableCell className="text-right">{entry.liters?.toFixed(2) || '-'}</TableCell>
                                                <TableCell className="text-right font-medium">${entry.amount.toFixed(2)}</TableCell>
                                                <TableCell><Badge variant="outline" className="font-normal text-slate-500">{entry.type.replace('_', ' ')}</Badge></TableCell>
                                            </TableRow>
                                        ))}
                                        {processedFuelEntries.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                                                    No fuel data found. Please upload a "Fuel Statement" file.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                          </TabsContent>
                      </Tabs>
                  </CardContent>
              </Card>
              </CollapsibleSection>
          </div>
      )}

      {step === 'success' && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-4">
             <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-emerald-600" />
             </div>
             <div>
               <h3 className="text-2xl font-bold text-slate-900">Fleet Sync Complete!</h3>
               <p className="text-slate-500">
                  Your fleet database has been updated successfully.<br/>
                  {processedData.length} trips and {processedDriverMetrics.length} driver records have been committed.
                  {processedFuelEntries.length > 0 && <><br/>{processedFuelEntries.length} fuel entries imported.</>}
               </p>
               {processedInsights && (processedInsights.alerts?.length || 0) > 0 && (
                   <div className="mt-4 p-4 bg-orange-50 text-orange-800 rounded-md text-sm border border-orange-100 max-w-md mx-auto">
                       <strong>Note:</strong> {processedInsights.alerts?.length} alerts have been logged to the dashboard.
                   </div>
               )}
             </div>
             <div className="flex gap-3">
                <Button onClick={reset} size="lg" className="mt-4">
                  Import Another Batch
                </Button>
             </div>
          </CardContent>
        </Card>
      )}

      <BulkImportTollTransactionsModal
        isOpen={!!tollImportMode}
        onClose={() => setTollImportMode(null)}
        mode={tollImportMode || 'usage'}
        onSuccess={() => setTollImportMode(null)}
      />
    </div>
  );
}
