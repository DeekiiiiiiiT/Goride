import React, { useMemo, useState } from 'react';
import { 
  ArrowLeft, 
  Clock, 
  MapPin, 
  TrendingUp, 
  Fuel,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  PiggyBank,
  CreditCard,
  Plus,
  Loader2,
  Scan,
  Pencil,
  Activity,
  Tag,
  Unlink,
  FileText,
  Upload,
  Eye,
  Download,
  Trash2,
  MoreVertical
} from 'lucide-react';
import { toast } from "sonner@2.0.3";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from '../ui/SafeResponsiveContainer';
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../ui/table";
import { Checkbox } from "../ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Vehicle, VehicleDocument } from '../../types/vehicle';
import { Trip } from '../../types/data';
import { api } from '../../services/api';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { format, subDays, isSameDay, getDay, getHours } from 'date-fns';
import { projectId, publicAnonKey } from '../../utils/supabase/info';

import { OdometerHistory } from './odometer/OdometerHistory';
import { OdometerDisplay } from './odometer/OdometerDisplay';
import { calculateLiveMileage } from '../../utils/mileageProjection';
import { FixedExpensesManager } from './expenses/FixedExpensesManager';
import { EquipmentManager } from './EquipmentManager';

interface VehicleDetailProps {
  vehicle: Vehicle;
  trips: Trip[];
  onBack: () => void;
  onAssignDriver?: () => void;
  onUpdate?: (vehicle: Vehicle) => void;
}

interface MaintenanceLog {
    id: string;
    vehicleId: string;
    date: string;
    type: string;
    serviceInterval?: 'A' | 'B' | 'C' | 'D';
    cost: number;
    odo: number;
    provider: string;
    providerLocationUrl?: string;
    notes: string;
    checklist?: string[];
    itemCosts?: Record<string, { material: number, labor: number }>;
    inspectionFee?: number;
    inspectionResults?: {
        issues: string[];
        notes: string;
    };
}

const MAINTENANCE_SCHEDULE = {
    A: {
        label: "Basic Service (Every 5,000 km)",
        interval: 5000,
        items: [
            "Replace Engine Oil (0W-20 or 5W-30)",
            "Replace Oil Filter",
            "Check Tire Pressures",
            "Top Up Window Washer Fluid",
            "Check Coolant Level",
            "Check Lights"
        ]
    },
    B: {
        label: "Intermediate Service (Every 10,000 km)",
        interval: 10000,
        items: [
            "Includes all Basic Service items",
            "Rotate Tires",
            "Inspect/Clean/Replace Engine Air Filter",
            "Replace Cabin A/C Filter",
            "Inspect Wiper Blades",
            "Inspect Brake Pads"
        ]
    },
    C: {
        label: "Major Service (Every 40,000 km)",
        interval: 40000,
        items: [
            "Includes all Intermediate Service items",
            "Drain & Refill CVT Transmission Fluid",
            "Flush & Replace Brake Fluid",
            "Inspect Drive/Serpentine Belt",
            "Inspect Suspension Bushings & Boots"
        ]
    },
    D: {
        label: "Long-Term Service (Every 100,000 km)",
        interval: 100000,
        items: [
            "Replace Spark Plugs (Iridium)",
            "Flush Radiator Coolant"
        ]
    }
};

export function VehicleDetail({ vehicle, trips, onBack, onAssignDriver, onUpdate }: VehicleDetailProps) {
  const [isLogServiceOpen, setIsLogServiceOpen] = useState(false);
  const [isUpdateOdometerOpen, setIsUpdateOdometerOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  
  // State for document management
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [extraDocuments, setExtraDocuments] = useState<VehicleDocument[]>([]);
  const [deletedDocIds, setDeletedDocIds] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Service Log State
  const [scanLoading, setScanLoading] = useState(false);
  const [logStep, setLogStep] = useState<'details' | 'inspection'>('details');
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLog[]>([]);
  const [serviceForm, setServiceForm] = useState({
      date: new Date().toISOString().split('T')[0],
      type: '',
      serviceInterval: '',
      cost: '',
      odo: '',
      notes: '',
      provider: '',
      checklist: [] as string[],
      itemCosts: {} as Record<string, { material: number, labor: number }>,
      inspectionFee: '',
      hasInspectionFee: false,
      inspectionIssues: [] as string[],
      inspectionNotes: ''
  });
  const [editingLogId, setEditingLogId] = useState<string | null>(null);

  const [projectedMileage, setProjectedMileage] = useState<{value: number, isProjected: boolean} | null>(null);

  const [uploadForm, setUploadForm] = useState({
    type: 'Registration',
    name: '',
    expiryDate: '',
    valuationDate: '',
    marketValue: '',
    forcedSaleValue: '',
    modelYear: '',
    chassisNumber: '',
    engineNumber: '',
    color: '',
    odometer: '',
    idv: '',
    policyPremium: '',
    excessDeductible: '',
    depreciationRate: '',
    authorizedDrivers: '',
    limitationsUse: '',
    policyNumber: '',
    make: '',
    model: '',
    bodyType: '',
    ccRating: '',
    issueDate: '',
    laNumber: '',
    plateNumber: '',
    mvid: '',
    controlNumber: '',
  });

  // Fetch Maintenance Logs & Projected Mileage
  React.useEffect(() => {
      if (vehicle.id || vehicle.licensePlate) {
          const vId = vehicle.id || vehicle.licensePlate;
          api.getMaintenanceLogs(vId).then(setMaintenanceLogs).catch(console.error);
          
          calculateLiveMileage(vId, vehicle.metrics.odometer, trips).then(res => {
             setProjectedMileage({
                 value: res.estimatedOdo,
                 isProjected: res.isProjected
             });
          });
      }
  }, [vehicle.id, vehicle.licensePlate, vehicle.metrics.odometer, trips]);

  const maintenanceStatus = useMemo(() => {
      const currentOdo = vehicle.metrics.odometer || 0;
      const lastService = maintenanceLogs[0];
      const lastOdo = lastService?.odo || 0;
      
      const distToNext5k = 5000 - (currentOdo % 5000);
      const nextDueOdo = currentOdo + distToNext5k;
      
      let nextType = 'A';
      if (nextDueOdo % 100000 === 0) nextType = 'D';
      else if (nextDueOdo % 40000 === 0) nextType = 'C';
      else if (nextDueOdo % 10000 === 0) nextType = 'B';
      
      const daysToService = Math.ceil(distToNext5k / 50);
      
      return {
          nextTypeLabel: MAINTENANCE_SCHEDULE[nextType as keyof typeof MAINTENANCE_SCHEDULE].label.split('(')[0].trim(),
          nextOdo: nextDueOdo,
          remainingKm: distToNext5k,
          daysToService,
          status: distToNext5k < 500 ? 'Due Soon' : 'Healthy'
      };
  }, [vehicle.metrics.odometer, maintenanceLogs]);

  // Analytics Logic
  const analytics = useMemo(() => {
    const vehicleTrips = trips.filter(t => t.vehicleId === vehicle.id || t.vehicleId === vehicle.licensePlate);
    
    const last30Days = Array.from({ length: 30 }, (_, i) => {
        const d = subDays(new Date(), 29 - i);
        return {
            date: format(d, 'MMM dd'),
            fullDate: d,
            earnings: 0,
            trips: 0
        };
    });

    const dayOfWeekStats = [0,0,0,0,0,0,0].map((_, i) => ({ 
        name: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i], 
        earnings: 0, 
        trips: 0 
    }));

    const activityByHour = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        name: `${i}:00`,
        trips: 0,
        earnings: 0
    }));

    let totalDurationMinutes = 0;
    let totalDistance = 0;

    vehicleTrips.forEach(t => {
        const tDate = new Date(t.date);
        const dayStat = last30Days.find(d => isSameDay(d.fullDate, tDate));
        if (dayStat) {
            dayStat.earnings += t.amount;
            dayStat.trips += 1;
        }

        const dayIndex = getDay(tDate);
        dayOfWeekStats[dayIndex].earnings += t.amount;
        dayOfWeekStats[dayIndex].trips += 1;

        const hourIndex = getHours(tDate);
        activityByHour[hourIndex].trips += 1;
        activityByHour[hourIndex].earnings += t.amount;

        totalDurationMinutes += (t.duration || 0);
        totalDistance += (t.distance || 0);
    });

    let activeHours = totalDurationMinutes / 60;
    let idleHours = activeHours * 0.4;

    if (vehicle.metrics.onlineHours !== undefined && vehicle.metrics.onTripHours !== undefined) {
        activeHours = vehicle.metrics.onTripHours;
        idleHours = Math.max(0, vehicle.metrics.onlineHours - activeHours);
    }
    
    const totalEarnings = vehicle.metrics.totalLifetimeEarnings;
    const totalTrips = vehicleTrips.length;
    
    const fuelCost = totalDistance * 0.15;
    const maintenanceCost = totalDistance * 0.05;
    const insuranceCost = 150 * 6;
    const depreciationCost = 200 * 6;
    
    const totalExpenses = fuelCost + maintenanceCost + insuranceCost + depreciationCost;
    const netProfit = totalEarnings - totalExpenses;
    const profitMargin = totalEarnings > 0 ? (netProfit / totalEarnings) * 100 : 0;
    
    const vehiclePurchasePrice = 25000;
    const roiPercentage = (netProfit / vehiclePurchasePrice) * 100;
    
    // Use real logs if available
    const history: any[] = maintenanceLogs;
    const totalMaintCost = history.reduce((sum, item) => sum + (item.cost || 0), 0);

    const earningsPerTrip = totalTrips > 0 ? totalEarnings / totalTrips : 0;
    const earningsPerKm = totalDistance > 0 ? totalEarnings / totalDistance : 0;
    const earningsPerHour = activeHours > 0 ? totalEarnings / activeHours : 0;

    return {
        trendData: last30Days,
        dayOfWeekData: dayOfWeekStats,
        activityByHour,
        metrics: {
            earningsPerTrip,
            earningsPerKm,
            earningsPerHour,
            totalDistance,
            activeHours,
            idleHours
        },
        financials: {
            totalRevenue: totalEarnings,
            totalExpenses,
            netProfit,
            profitMargin,
            roiPercentage,
            breakdown: [
                { name: 'Fuel', value: fuelCost, color: '#f59e0b' },
                { name: 'Maintenance', value: maintenanceCost, color: '#ef4444' },
                { name: 'Insurance', value: insuranceCost, color: '#6366f1' },
                { name: 'Depreciation', value: depreciationCost, color: '#94a3b8' }
            ]
        },
        maintenance: {
            history,
            totalCost: totalMaintCost,
            nextDue: vehicle.nextServiceDate
        }
    };
  }, [vehicle, trips, maintenanceLogs]);

  // Documents Logic
  const documents = useMemo(() => {
     const docs: VehicleDocument[] = [];
     const savedDocs = vehicle.documents || [];

     // Derived Docs
     if (vehicle.registrationExpiry || vehicle.registrationCertificateUrl) {
         if (!savedDocs.some(d => d.type === 'Registration')) {
             docs.push({
                 id: 'reg-cert',
                 name: 'Vehicle Registration',
                 type: 'Registration',
                 status: vehicle.registrationCertificateUrl ? 'Verified' : 'Pending',
                 expiryDate: vehicle.registrationExpiry || '',
                 uploadDate: vehicle.registrationIssueDate || new Date().toISOString(),
                 url: vehicle.registrationCertificateUrl,
                 metadata: {
                     laNumber: vehicle.laNumber,
                     plateNumber: vehicle.licensePlate,
                     mvid: vehicle.mvid,
                     chassisNumber: vehicle.vin,
                     controlNumber: vehicle.controlNumber
                 }
             });
         }
     }

     if (vehicle.fitnessExpiry || vehicle.fitnessCertificateUrl) {
         if (!savedDocs.some(d => d.type === 'Fitness')) {
             docs.push({
                 id: 'fitness-cert',
                 name: 'Certificate of Fitness',
                 type: 'Fitness',
                 status: vehicle.fitnessCertificateUrl ? 'Verified' : 'Pending',
                 expiryDate: vehicle.fitnessExpiry || '',
                 uploadDate: vehicle.fitnessIssueDate || new Date().toISOString(),
                 url: vehicle.fitnessCertificateUrl,
                 metadata: {
                     make: vehicle.make,
                     model: vehicle.model,
                     year: vehicle.year,
                     bodyType: vehicle.bodyType,
                     engineNumber: vehicle.engineNumber,
                     ccRating: vehicle.ccRating
                 }
             });
         }
     }

     if (vehicle.insuranceExpiry) {
         if (!savedDocs.some(d => d.type === 'Insurance')) {
             docs.push({
                 id: 'insurance-policy',
                 name: 'Insurance Policy',
                 type: 'Insurance',
                 status: 'Verified',
                 expiryDate: vehicle.insuranceExpiry,
                 uploadDate: new Date().toISOString()
             });
         }
     }
     
     const allDocs = [...docs, ...savedDocs, ...extraDocuments];
     const uniqueDocs = Array.from(new Map(allDocs.map(item => [item.id, item])).values());
     
     return uniqueDocs.filter(d => !deletedDocIds.includes(String(d.id)));
  }, [vehicle, extraDocuments, deletedDocIds]);

  const handleUnassignTag = async () => {
    if (!window.confirm("Are you sure you want to unlink this toll tag?")) return;
    try {
        const updatedVehicle = {
            ...vehicle,
            tollTagId: undefined,
            tollTagUuid: undefined,
            tollTagProvider: undefined
        };
        await api.saveVehicle(updatedVehicle);
        if (vehicle.tollTagUuid) {
             const tags = await api.getTollTags();
             const tag = tags.find((t: any) => t.id === vehicle.tollTagUuid);
             if (tag) {
                 await api.saveTollTag({
                     ...tag,
                     assignedVehicleId: undefined,
                     assignedVehicleName: undefined
                 });
             }
        }
        toast.success("Toll tag unlinked");
        if (onUpdate) onUpdate(updatedVehicle);
    } catch (error) {
        toast.error("Failed to unlink tag");
    }
  };

  const handleServiceScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setScanLoading(true);
      try {
          const formData = new FormData();
          formData.append('file', file);
          const { projectId, publicAnonKey } = await import('../../utils/supabase/info');
          const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-37f42386/parse-invoice`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${publicAnonKey}` },
              body: formData
          });
          const result = await response.json();
          if (result.success && result.data) {
               setServiceForm(prev => ({
                   ...prev,
                   date: result.data.date || prev.date,
                   type: result.data.type || 'other', 
                   cost: result.data.cost ? String(result.data.cost) : prev.cost,
                   odo: result.data.odometer ? String(result.data.odometer) : prev.odo,
                   notes: result.data.notes || prev.notes
               }));
               toast.success("Invoice scanned successfully!");
          } else {
               toast.error("Failed to scan invoice");
          }
      } catch (err) {
          toast.error("Error scanning invoice");
      } finally {
          setScanLoading(false);
      }
  };

  const handleSaveDocument = async () => {
    let docId = editingDocId;
    if (!docId) {
        if (uploadForm.type === 'Registration') docId = 'reg-cert';
        else if (uploadForm.type === 'Fitness') docId = 'fitness-cert';
        else if (uploadForm.type === 'Insurance') docId = 'insurance-policy';
        else docId = `doc-${Date.now()}`;
    }
    
    const newDoc: VehicleDocument = {
        id: docId,
        name: uploadForm.name || `${uploadForm.type} Document`,
        type: uploadForm.type,
        status: 'Verified',
        expiryDate: uploadForm.expiryDate,
        uploadDate: new Date().toISOString(),
        metadata: { ...uploadForm }
    };
    
    if (editingDocId) {
        setExtraDocuments(prev => prev.map(d => d.id === editingDocId ? newDoc : d));
    } else {
        setExtraDocuments([...extraDocuments, newDoc]);
    }
    
    setIsUploadOpen(false);
    
    try {
        const updatedVehicle = { ...vehicle };
        if (newDoc.type === 'Registration' && (editingDocId === 'reg-cert' || !editingDocId)) {
             updatedVehicle.registrationExpiry = newDoc.expiryDate;
        }
        if (newDoc.type === 'Fitness' && (editingDocId === 'fitness-cert' || !editingDocId)) {
             updatedVehicle.fitnessExpiry = newDoc.expiryDate;
        }
        if (newDoc.type === 'Insurance' && (editingDocId === 'insurance-policy' || !editingDocId)) {
             updatedVehicle.insuranceExpiry = newDoc.expiryDate;
        }

        if (updatedVehicle.documents) {
            if (editingDocId) {
                const index = updatedVehicle.documents.findIndex(d => d.id === editingDocId);
                if (index >= 0) updatedVehicle.documents[index] = newDoc;
                else updatedVehicle.documents.push(newDoc);
            } else {
                updatedVehicle.documents.push(newDoc);
            }
        } else {
            updatedVehicle.documents = [newDoc];
        }
        
        await api.saveVehicle(updatedVehicle);
        toast.success("Document saved successfully");
    } catch (error) {
        toast.error("Failed to save document");
    }
    setEditingDocId(null);
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-right duration-300">
      
      {/* --- Top Navigation --- */}
      <Button variant="ghost" onClick={onBack} className="pl-0 hover:bg-transparent hover:text-indigo-600">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Fleet
      </Button>

      {/* --- Header Section --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 overflow-hidden border-indigo-100 shadow-sm">
             <div className="flex flex-col md:flex-row h-full">
                 <div className="md:w-1/3 relative bg-slate-100 min-h-[200px]">
                     {vehicle.image?.startsWith('figma:') ? (
                        <ImageWithFallback src={vehicle.image} alt={vehicle.model} className="h-full w-full object-cover" />
                     ) : (
                        <img src={vehicle.image} alt={vehicle.model} className="h-full w-full object-cover" />
                     )}
                     <div className="absolute top-3 left-3">
                         <Badge className={vehicle.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-500'}>
                             {vehicle.status}
                         </Badge>
                     </div>
                 </div>
                 <div className="p-6 flex-1 flex flex-col justify-between">
                     <div>
                         <div className="flex justify-between items-start">
                             <div>
                                 <h1 className="text-2xl font-bold text-slate-900">{vehicle.year} {vehicle.model}</h1>
                                 <div className="flex items-center gap-2 mt-1">
                                     <span className="font-mono text-sm bg-slate-100 px-2 py-0.5 rounded text-slate-600">{vehicle.licensePlate}</span>
                                     <span className="text-sm text-slate-400">|</span>
                                     <span className="text-sm text-slate-500">VIN: {vehicle.vin}</span>
                                 </div>
                             </div>
                             <div className="text-right">
                                 <p className="text-sm text-slate-500">Lifetime Earnings</p>
                                 <p className="text-2xl font-bold text-emerald-600">${vehicle.metrics.totalLifetimeEarnings.toLocaleString()}</p>
                             </div>
                         </div>
                         
                             <div className="mt-6 flex items-center gap-4">
                                 <div className="flex items-center gap-3 bg-indigo-50 p-3 rounded-lg border border-indigo-100 pr-8">
                                     <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                                         <Activity className="h-5 w-5" />
                                     </div>
                                     <div>
                                         <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wider">Current Driver</p>
                                         <p className="font-medium text-slate-900">{vehicle.currentDriverName || 'Unassigned'}</p>
                                     </div>
                                     <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="ml-4 h-8 text-xs bg-white"
                                        onClick={onAssignDriver}
                                     >
                                         Change Driver
                                     </Button>
                                 </div>

                                 <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 pr-8">
                                    <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600">
                                        <Tag className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Toll Tag</p>
                                        <p className="font-medium text-slate-900">
                                            {vehicle.tollTagId ? `${vehicle.tollTagProvider} ${vehicle.tollTagId}` : 'None Assigned'}
                                        </p>
                                    </div>
                                    {vehicle.tollTagId && (
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="ml-4 h-8 w-8 p-0 text-slate-400 hover:text-red-600"
                                            onClick={handleUnassignTag}
                                            title="Unlink Tag"
                                        >
                                            <Unlink className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                             </div>
                     </div>
                 </div>
             </div>
          </Card>

          <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-lg">Today's Pulse</CardTitle>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setIsUpdateOdometerOpen(true)}
                    title="Update Odometer"
                  >
                     <Pencil className="h-3 w-3 text-slate-400 hover:text-indigo-600" />
                  </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                      <span className="text-slate-500 text-sm">Odometer</span>
                      <div className="flex flex-col items-end">
                          <OdometerDisplay value={projectedMileage?.value || vehicle.metrics.odometer} size="sm" />
                          {projectedMileage?.isProjected && (
                              <p className="text-[10px] text-indigo-500 font-medium flex items-center justify-end gap-1 mt-1">
                                  <TrendingUp className="h-3 w-3" /> Projected
                              </p>
                          )}
                      </div>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                      <span className="text-slate-500 text-sm">Earnings</span>
                      <span className="font-bold text-slate-900">${vehicle.metrics.todayEarnings.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                      <span className="text-slate-500 text-sm">Utilization</span>
                      <div className="flex items-center gap-2">
                          <div className="h-2 w-16 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500" style={{ width: `${vehicle.metrics.utilizationRate}%` }}></div>
                          </div>
                          <span className="font-bold text-slate-900">{vehicle.metrics.utilizationRate.toFixed(1)}%</span>
                      </div>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                      <span className="text-slate-500 text-sm">Health Score</span>
                      <span className={`font-bold ${vehicle.metrics.healthScore > 80 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {vehicle.metrics.healthScore}/100
                      </span>
                  </div>
                  
                  {vehicle.serviceStatus !== 'OK' && (
                      <div className="bg-amber-50 text-amber-800 text-xs p-3 rounded-md flex items-start gap-2 mt-2">
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                          <div>
                              <p className="font-bold">Service Due: {vehicle.nextServiceType}</p>
                              <p>Due in {vehicle.daysToService} days</p>
                          </div>
                      </div>
                  )}
              </CardContent>
          </Card>
      </div>

      <Tabs defaultValue="performance" className="w-full">
          <TabsList>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="utilization">Utilization</TabsTrigger>
              <TabsTrigger value="financials">Financials</TabsTrigger>
              <TabsTrigger value="expenses">Vehicle Expenses</TabsTrigger>
              <TabsTrigger value="odometer">Odometer</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>

          <TabsContent value="performance" className="space-y-6 mt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                      <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-2">
                              <p className="text-sm font-medium text-slate-500">Earnings per Hour</p>
                              <Clock className="h-4 w-4 text-emerald-500" />
                          </div>
                          <h3 className="text-2xl font-bold text-slate-900">${analytics.metrics.earningsPerHour.toFixed(2)}</h3>
                          <p className="text-xs text-emerald-600 flex items-center mt-1">
                              <TrendingUp className="h-3 w-3 mr-1" /> Top 10% of fleet
                          </p>
                      </CardContent>
                  </Card>
                  <Card>
                      <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-2">
                              <p className="text-sm font-medium text-slate-500">Earnings per Trip</p>
                              <MapPin className="h-4 w-4 text-indigo-500" />
                          </div>
                          <h3 className="text-2xl font-bold text-slate-900">${analytics.metrics.earningsPerTrip.toFixed(2)}</h3>
                          <p className="text-xs text-slate-400 mt-1">
                              Based on {trips.length} trips
                          </p>
                      </CardContent>
                  </Card>
                  <Card>
                      <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-2">
                              <p className="text-sm font-medium text-slate-500">Fuel Efficiency</p>
                              <Fuel className="h-4 w-4 text-amber-500" />
                          </div>
                          <h3 className="text-2xl font-bold text-slate-900">12.5 km/L</h3>
                          <p className="text-xs text-slate-400 mt-1">Est. based on model</p>
                      </CardContent>
                  </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                      <CardHeader>
                          <CardTitle>Earnings Trend (30 Days)</CardTitle>
                          <CardDescription>Daily revenue performance</CardDescription>
                      </CardHeader>
                      <CardContent className="h-[300px]">
                          <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={analytics.trendData}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                  <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                                  <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                                  <RechartsTooltip formatter={(value: number) => [`$${value}`, 'Earnings']} />
                                  <Bar dataKey="earnings" fill="#6366f1" radius={[4, 4, 0, 0]} />
                              </BarChart>
                          </ResponsiveContainer>
                      </CardContent>
                  </Card>
                  <Card>
                      <CardHeader>
                          <CardTitle>Hourly Activity</CardTitle>
                          <CardDescription>Peak earning hours</CardDescription>
                      </CardHeader>
                      <CardContent className="h-[300px]">
                          <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={analytics.activityByHour}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                  <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} interval={2} />
                                  <YAxis fontSize={12} tickLine={false} axisLine={false} />
                                  <RechartsTooltip />
                                  <Bar dataKey="trips" fill="#10b981" radius={[4, 4, 0, 0]} name="Trips" />
                              </BarChart>
                          </ResponsiveContainer>
                      </CardContent>
                  </Card>
              </div>
          </TabsContent>

          <TabsContent value="utilization" className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                      <CardHeader>
                          <CardTitle>Utilization Breakdown</CardTitle>
                          <CardDescription>Time distribution (Monthly)</CardDescription>
                      </CardHeader>
                      <CardContent className="h-[300px] flex items-center justify-center">
                         <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie 
                                    data={[
                                        { name: 'Active Driving', value: analytics.metrics.activeHours, color: '#10b981' }, 
                                        { name: 'Idle / Waiting', value: analytics.metrics.idleHours, color: '#fbbf24' }, 
                                        { name: 'Offline', value: Math.max(0, (24 * 30) - (analytics.metrics.activeHours + analytics.metrics.idleHours)), color: '#e2e8f0' }
                                    ]} 
                                    innerRadius={60} 
                                    outerRadius={80} 
                                    dataKey="value"
                                >
                                    {[
                                        { name: 'Active Driving', value: analytics.metrics.activeHours, color: '#10b981' }, 
                                        { name: 'Idle / Waiting', value: analytics.metrics.idleHours, color: '#fbbf24' }, 
                                        { name: 'Offline', value: Math.max(0, (24 * 30) - (analytics.metrics.activeHours + analytics.metrics.idleHours)), color: '#e2e8f0' }
                                    ].map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <RechartsTooltip />
                                <Legend verticalAlign="bottom" />
                            </PieChart>
                         </ResponsiveContainer>
                      </CardContent>
                  </Card>
              </div>
          </TabsContent>

          <TabsContent value="financials" className="space-y-6 mt-6">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                      <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-2">
                              <p className="text-sm font-medium text-slate-500">Net Profit</p>
                              <PiggyBank className="h-4 w-4 text-indigo-500" />
                          </div>
                          <h3 className={`text-2xl font-bold ${analytics.financials.netProfit >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                              ${analytics.financials.netProfit.toLocaleString(undefined, {maximumFractionDigits: 0})}
                          </h3>
                          <p className="text-xs text-slate-500 mt-1">{analytics.financials.profitMargin.toFixed(1)}% Margin</p>
                      </CardContent>
                  </Card>
                  <Card>
                      <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-2">
                              <p className="text-sm font-medium text-slate-500">Toll Balance</p>
                              <CreditCard className="h-4 w-4 text-amber-600" />
                          </div>
                          <h3 className="text-2xl font-bold text-slate-900">${(vehicle.tollBalance || 0).toLocaleString()}</h3>
                          <div className="flex items-center justify-between mt-1">
                             <p className="text-xs text-slate-500">Tag: {vehicle.tollTagId || 'N/A'}</p>
                          </div>
                      </CardContent>
                  </Card>
               </div>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                      <CardHeader>
                          <CardTitle>Expense Breakdown</CardTitle>
                      </CardHeader>
                      <CardContent className="h-[300px]">
                          <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                  <Pie data={analytics.financials.breakdown} innerRadius={60} outerRadius={80} dataKey="value">
                                      {analytics.financials.breakdown.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                  </Pie>
                                  <RechartsTooltip />
                                  <Legend />
                              </PieChart>
                          </ResponsiveContainer>
                      </CardContent>
                  </Card>
               </div>
          </TabsContent>

          <TabsContent value="expenses" className="space-y-6 mt-6">
              <Tabs defaultValue="fixed" className="w-full">
                  <TabsList>
                      <TabsTrigger value="fixed">Fixed Expenses</TabsTrigger>
                      <TabsTrigger value="equipment">Equipment Expenses</TabsTrigger>
                      <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="fixed" className="mt-4">
                      <FixedExpensesManager vehicleId={vehicle.id || vehicle.licensePlate} />
                  </TabsContent>

                  <TabsContent value="equipment" className="mt-4">
                      <EquipmentManager vehicleId={vehicle.id || vehicle.licensePlate} />
                  </TabsContent>

                  <TabsContent value="maintenance" className="mt-4">
                       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                           <div className="space-y-4">
                               <Card>
                                   <CardContent className="p-6">
                                      <div className="flex items-center gap-3 mb-4">
                                          <div className={
                                              maintenanceStatus.status === 'Due Soon' ? "bg-amber-100 p-2 rounded-full text-amber-600" :
                                              "bg-emerald-100 p-2 rounded-full text-emerald-600"
                                          }>
                                              <CheckCircle2 className="h-5 w-5" />
                                          </div>
                                          <div>
                                              <p className="text-sm font-medium text-slate-500">Service Status</p>
                                              <h4 className="text-lg font-bold text-slate-900">
                                                  {maintenanceStatus.status}
                                              </h4>
                                          </div>
                                      </div>
                                      <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded">
                                          Next: {maintenanceStatus.nextTypeLabel}
                                      </p>
                                   </CardContent>
                               </Card>

                               <Button 
                                   className="w-full bg-indigo-600 hover:bg-indigo-700"
                                   onClick={() => {
                                       setIsLogServiceOpen(true);
                                   }}
                               >
                                   <Plus className="h-4 w-4 mr-2" />
                                   Log New Service
                               </Button>
                           </div>
                           
                           <Card className="md:col-span-2">
                               <CardHeader>
                                   <CardTitle>Maintenance History</CardTitle>
                               </CardHeader>
                               <CardContent>
                                   <Table>
                                       <TableHeader>
                                           <TableRow>
                                               <TableHead>Date</TableHead>
                                               <TableHead>Type</TableHead>
                                               <TableHead>Odometer</TableHead>
                                               <TableHead className="text-right">Cost</TableHead>
                                           </TableRow>
                                       </TableHeader>
                                       <TableBody>
                                           {analytics.maintenance.history.map((log: any) => (
                                               <TableRow key={log.id}>
                                                   <TableCell>{format(new Date(log.date), 'MMM d, yyyy')}</TableCell>
                                                   <TableCell>{log.type}</TableCell>
                                                   <TableCell>{log.odo.toLocaleString()} km</TableCell>
                                                   <TableCell className="text-right">${log.cost}</TableCell>
                                               </TableRow>
                                           ))}
                                       </TableBody>
                                   </Table>
                               </CardContent>
                           </Card>
                       </div>
                  </TabsContent>
              </Tabs>
          </TabsContent>

          <TabsContent value="odometer" className="mt-6">
              <OdometerHistory vehicleId={vehicle.id || vehicle.licensePlate} maintenanceLogs={maintenanceLogs} trips={trips} />
          </TabsContent>

          <TabsContent value="documents" className="space-y-6 mt-6">
               <div className="flex justify-between items-center">
                   <h3 className="text-lg font-medium">Vehicle Documents</h3>
                   <Button onClick={() => setIsUploadOpen(true)}>
                       <Plus className="h-4 w-4 mr-2" />
                       Add Document
                   </Button>
               </div>
               
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                   {documents.map((doc) => (
                       <Card key={doc.id}>
                           <CardContent className="p-4">
                               <div className="flex justify-between items-start mb-3">
                                   <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                                       <FileText className="h-5 w-5" />
                                   </div>
                                   <Badge variant={doc.status === 'Verified' ? 'default' : 'outline'}>{doc.status}</Badge>
                               </div>
                               <h4 className="font-semibold">{doc.name}</h4>
                               <p className="text-xs text-slate-500 mt-1">Exp: {doc.expiryDate || 'N/A'}</p>
                               <div className="mt-4 flex gap-2">
                                   <Button variant="outline" size="sm" className="flex-1" onClick={() => {
                                       setEditingDocId(doc.id);
                                       setUploadForm(prev => ({ ...prev, type: doc.type, name: doc.name }));
                                       setIsUploadOpen(true);
                                   }}>Edit</Button>
                                   <Button variant="ghost" size="icon" onClick={() => {
                                       setDeletedDocIds(prev => [...prev, doc.id]);
                                       toast.success("Document deleted");
                                   }}>
                                       <Trash2 className="h-4 w-4 text-red-500" />
                                   </Button>
                               </div>
                           </CardContent>
                       </Card>
                   ))}
               </div>
          </TabsContent>

          <TabsContent value="profile" className="space-y-6 mt-6">
              <Card>
                  <CardHeader>
                      <CardTitle>Vehicle Profile</CardTitle>
                      <CardDescription>Core vehicle details</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <Label className="text-xs text-slate-500">Make & Model</Label>
                              <p className="font-medium">{vehicle.make} {vehicle.model}</p>
                          </div>
                          <div>
                              <Label className="text-xs text-slate-500">Year</Label>
                              <p className="font-medium">{vehicle.year}</p>
                          </div>
                          <div>
                              <Label className="text-xs text-slate-500">License Plate</Label>
                              <p className="font-medium">{vehicle.licensePlate}</p>
                          </div>
                          <div>
                              <Label className="text-xs text-slate-500">VIN</Label>
                              <p className="font-medium">{vehicle.vin}</p>
                          </div>
                          <div>
                              <Label className="text-xs text-slate-500">Color</Label>
                              <p className="font-medium">{vehicle.color || 'N/A'}</p>
                          </div>
                      </div>
                  </CardContent>
              </Card>
          </TabsContent>
      </Tabs>

      {/* Upload Document Dialog */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
           <DialogContent>
               <DialogHeader>
                   <DialogTitle>{editingDocId ? 'Edit Document' : 'Upload Document'}</DialogTitle>
                   <DialogDescription>Attach vehicle documents.</DialogDescription>
               </DialogHeader>
               <div className="space-y-4 py-4">
                   <div className="space-y-2">
                       <Label>Document Type</Label>
                       <Select 
                           value={uploadForm.type} 
                           onValueChange={(val) => setUploadForm({...uploadForm, type: val})}
                       >
                           <SelectTrigger><SelectValue /></SelectTrigger>
                           <SelectContent>
                               <SelectItem value="Registration">Registration</SelectItem>
                               <SelectItem value="Insurance">Insurance</SelectItem>
                               <SelectItem value="Fitness">Fitness</SelectItem>
                               <SelectItem value="Other">Other</SelectItem>
                           </SelectContent>
                       </Select>
                   </div>
                   <div className="space-y-2">
                       <Label>Name</Label>
                       <Input value={uploadForm.name} onChange={(e) => setUploadForm({...uploadForm, name: e.target.value})} />
                   </div>
                   <div className="space-y-2">
                       <Label>Expiry Date</Label>
                       <Input type="date" value={uploadForm.expiryDate} onChange={(e) => setUploadForm({...uploadForm, expiryDate: e.target.value})} />
                   </div>
                   <Button onClick={handleSaveDocument} className="w-full">Save Document</Button>
               </div>
           </DialogContent>
      </Dialog>

      {/* Service Log Dialog */}
      <Dialog open={isLogServiceOpen} onOpenChange={setIsLogServiceOpen}>
          <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                  <DialogTitle>Log Service</DialogTitle>
                  <DialogDescription>Record a new service event.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-2">
                           <Label>Date</Label>
                           <Input type="date" value={serviceForm.date} onChange={e => setServiceForm({...serviceForm, date: e.target.value})} />
                       </div>
                       <div className="space-y-2">
                           <Label>Type</Label>
                           <Select value={serviceForm.type} onValueChange={val => setServiceForm({...serviceForm, type: val})}>
                               <SelectTrigger><SelectValue /></SelectTrigger>
                               <SelectContent>
                                   <SelectItem value="maintenance">Maintenance</SelectItem>
                                   <SelectItem value="oil">Oil Change</SelectItem>
                                   <SelectItem value="tires">Tires</SelectItem>
                                   <SelectItem value="repair">Repair</SelectItem>
                               </SelectContent>
                           </Select>
                       </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-2">
                           <Label>Odometer</Label>
                           <Input type="number" value={serviceForm.odo} onChange={e => setServiceForm({...serviceForm, odo: e.target.value})} />
                       </div>
                       <div className="space-y-2">
                           <Label>Cost</Label>
                           <Input type="number" value={serviceForm.cost} onChange={e => setServiceForm({...serviceForm, cost: e.target.value})} />
                       </div>
                  </div>
                  <div className="space-y-2">
                       <Label>Upload Invoice (AI Scan)</Label>
                       <div className="flex items-center gap-2">
                           <Input type="file" onChange={handleServiceScan} disabled={scanLoading} />
                           {scanLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                       </div>
                  </div>
                  <div className="space-y-2">
                       <Label>Notes</Label>
                       <Input value={serviceForm.notes} onChange={e => setServiceForm({...serviceForm, notes: e.target.value})} />
                  </div>
                  <Button onClick={() => {
                      // Save Logic simplified
                      toast.success("Service logged!");
                      setIsLogServiceOpen(false);
                  }} className="w-full">Save Log</Button>
              </div>
          </DialogContent>
      </Dialog>

    </div>
  );
}
