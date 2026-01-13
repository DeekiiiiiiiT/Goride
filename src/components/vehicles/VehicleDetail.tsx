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
  MoreVertical,
  DollarSign,
  Receipt,
  Wind,
  Zap,
  Settings,
  Scale,
  Move,
  Info,
  Car
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
import { Textarea } from "../ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
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
import { odometerService } from '../../services/odometerService';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { format, subDays, isSameDay, getDay, getHours } from 'date-fns';
import { projectId, publicAnonKey } from '../../utils/supabase/info';

import { OdometerHistory } from './odometer/OdometerHistory';
import { OdometerDisplay } from './odometer/OdometerDisplay';
import { calculateLiveMileage } from '../../utils/mileageProjection';
import { FixedExpensesManager } from './expenses/FixedExpensesManager';
import { EquipmentManager } from './EquipmentManager';
import { ExteriorManager } from './ExteriorManager';
import { MaintenanceManager, MaintenanceLog } from './MaintenanceManager';

interface VehicleDetailProps {
  vehicle: Vehicle;
  trips: Trip[];
  onBack: () => void;
  onAssignDriver?: () => void;
  onUpdate?: (vehicle: Vehicle) => void;
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

  const [isUpdateOdometerOpen, setIsUpdateOdometerOpen] = useState(false);
  const [odometerRefreshTrigger, setOdometerRefreshTrigger] = useState(0);
  
  // Odometer Update Form
  const [newOdometerValue, setNewOdometerValue] = useState('');
  const [newOdometerDate, setNewOdometerDate] = useState(new Date().toISOString().split('T')[0]);
  const [newOdometerNotes, setNewOdometerNotes] = useState('');
  const [isUpdatingOdometer, setIsUpdatingOdometer] = useState(false);

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<{url: string, name: string, type: string} | null>(null);
  
  // State for document management
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [extraDocuments, setExtraDocuments] = useState<VehicleDocument[]>([]);
  const [deletedDocIds, setDeletedDocIds] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Service Log State
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLog[]>([]);

  const [projectedMileage, setProjectedMileage] = useState<{value: number, isProjected: boolean} | null>(null);

  const getDriveTypeDescription = (type: string) => {
      const t = type.toLowerCase();
      if (t.includes('4wd') || t.includes('awd') || t.includes('4x4')) 
          return "Provides better traction in off-road or slippery conditions, often with higher fuel consumption.";
      if (t.includes('fwd')) 
          return "Common in passenger cars; efficient and compact, placing weight over driven wheels for good traction.";
      if (t.includes('rwd')) 
          return "Often used in performance or utility vehicles for better weight balance and handling.";
      if (t.includes('2wd')) 
          return "Power is sent to two wheels, generally offering better fuel efficiency than 4WD systems.";
      return "The drivetrain configuration determines which wheels receive power, affecting traction and efficiency.";
  };

  const getTransmissionDescription = (type: string) => {
      const t = type.toLowerCase();
      if (t.includes('cvt')) 
          return "Continuously Variable Transmission provides smooth power delivery and optimal engine efficiency.";
      if (t.includes('manual')) 
          return "Allows the driver to manually select gears, offering greater control over power delivery.";
      if (t.includes('automatic')) 
          return "Automatically changes gears as the vehicle moves, freeing the driver from shifting manually.";
      return "The transmission system transfers power from the engine to the wheels.";
  };

  // Specifications State
  const [isEditingSpecs, setIsEditingSpecs] = useState(false);
  const [specsForm, setSpecsForm] = useState({
      engineType: vehicle.specifications?.engineType || '3-cylinder',
      engineSize: vehicle.specifications?.engineSize || '1.0L',
      transmission: vehicle.specifications?.transmission || 'CVT Automatic',
      driveType: vehicle.specifications?.driveType || 'FWD',
      kerbWeight: vehicle.specifications?.kerbWeight || '1070 kg',
      aerodynamicAids: vehicle.specifications?.aerodynamicAids || 'Standard',
      fuelType: vehicle.fuelSettings?.fuelType || 'Gasoline_87',
      fuelEconomy: vehicle.specifications?.fuelEconomy || '24.6',
      tankCapacity: vehicle.specifications?.tankCapacity || '36',
      bodyType: vehicle.bodyType || 'MPV'
  });

  const handleSaveSpecs = async () => {
      try {
          // Normalize fuel type for backend
          const validFuelType = ['Gasoline_87', 'Gasoline_91', 'Gasoline_93', 'Diesel', 'Electric', 'Hybrid'].includes(specsForm.fuelType) 
            ? specsForm.fuelType as any 
            : 'Gasoline_87';

          const updatedVehicle = {
              ...vehicle,
              bodyType: specsForm.bodyType,
              specifications: { 
                  ...vehicle.specifications,
                  engineType: specsForm.engineType,
                  engineSize: specsForm.engineSize,
                  transmission: specsForm.transmission,
                  driveType: specsForm.driveType,
                  kerbWeight: specsForm.kerbWeight,
                  aerodynamicAids: specsForm.aerodynamicAids,
                  fuelEconomy: specsForm.fuelEconomy,
                  tankCapacity: specsForm.tankCapacity,
              },
              fuelSettings: {
                  ...vehicle.fuelSettings,
                  fuelType: validFuelType,
                  // Keep existing or update if logical
                  tankCapacity: parseFloat(specsForm.tankCapacity) || vehicle.fuelSettings?.tankCapacity || 0,
                  efficiencyCity: parseFloat(specsForm.fuelEconomy) || vehicle.fuelSettings?.efficiencyCity || 0,
                  efficiencyHighway: vehicle.fuelSettings?.efficiencyHighway || 0
              }
          };
          await api.saveVehicle(updatedVehicle);
          if (onUpdate) onUpdate(updatedVehicle);
          setIsEditingSpecs(false);
          toast.success("Specifications updated");
      } catch (error) {
          toast.error("Failed to update specifications");
      }
  };

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



  const handleUpdateOdometer = async () => {
      if (!newOdometerValue || !newOdometerDate) {
          toast.error("Please enter a valid reading and date");
          return;
      }
      
      setIsUpdatingOdometer(true);
      try {
          await odometerService.addReading({
              vehicleId: vehicle.id || vehicle.licensePlate,
              value: parseFloat(newOdometerValue),
              date: newOdometerDate,
              source: 'Manual Update',
              type: 'Hard',
              notes: newOdometerNotes
          });
          
          toast.success("Odometer updated successfully");
          setOdometerRefreshTrigger(prev => prev + 1);
          setIsUpdateOdometerOpen(false);
          
          // Reset form
          setNewOdometerValue('');
          setNewOdometerNotes('');
      } catch (error) {
          console.error(error);
          toast.error("Failed to update odometer");
      } finally {
          setIsUpdatingOdometer(false);
      }
  };

  const handleSaveDocument = async () => {
    let docId = editingDocId;
    if (!docId) {
        if (uploadForm.type === 'Registration') docId = 'reg-cert';
        else if (uploadForm.type === 'Fitness') docId = 'fitness-cert';
        else if (uploadForm.type === 'Insurance') docId = 'insurance-policy';
        else if (uploadForm.type === 'Valuation') docId = 'valuation-report';
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
                          <ResponsiveContainer width="100%" height="100%" minHeight={200}>
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
                          <ResponsiveContainer width="100%" height="100%" minHeight={200}>
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
                         <ResponsiveContainer width="100%" height="100%" minHeight={200}>
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
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                      <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-2">
                              <p className="text-sm font-medium text-slate-500">Total Revenue</p>
                              <DollarSign className="h-4 w-4 text-emerald-500" />
                          </div>
                          <h3 className="text-2xl font-bold text-slate-900">
                              ${analytics.financials.totalRevenue.toLocaleString(undefined, {maximumFractionDigits: 2})}
                          </h3>
                          <p className="text-xs text-slate-500 mt-1">Lifetime</p>
                      </CardContent>
                  </Card>

                  <Card>
                      <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-2">
                              <p className="text-sm font-medium text-slate-500">Total Expenses</p>
                              <Receipt className="h-4 w-4 text-rose-500" />
                          </div>
                          <h3 className="text-2xl font-bold text-slate-900">
                              ${analytics.financials.totalExpenses.toLocaleString(undefined, {maximumFractionDigits: 0})}
                          </h3>
                          <p className="text-xs text-slate-500 mt-1">Est. Fuel, Maint, Ins.</p>
                      </CardContent>
                  </Card>

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
                          <CardDescription>Where is the money going?</CardDescription>
                      </CardHeader>
                      <CardContent className="h-[300px]">
                          <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                              <PieChart>
                                  <Pie data={analytics.financials.breakdown} innerRadius={60} outerRadius={80} dataKey="value">
                                      {analytics.financials.breakdown.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                  </Pie>
                                  <RechartsTooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                                  <Legend verticalAlign="bottom" height={36}/>
                              </PieChart>
                          </ResponsiveContainer>
                      </CardContent>
                  </Card>

                  <Card>
                      <CardHeader>
                          <CardTitle>Profitability Analysis</CardTitle>
                          <CardDescription>Revenue vs Expenses vs Profit</CardDescription>
                      </CardHeader>
                      <CardContent className="h-[300px]">
                          <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                              <BarChart 
                                layout="vertical" 
                                data={[
                                    { name: 'Revenue', value: analytics.financials.totalRevenue, fill: '#10b981' },
                                    { name: 'Expenses', value: analytics.financials.totalExpenses, fill: '#ef4444' },
                                    { name: 'Net Profit', value: analytics.financials.netProfit, fill: '#6366f1' }
                                ]}
                                margin={{ left: 20 }}
                              >
                                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                  <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val/1000}k`} />
                                  <YAxis dataKey="name" type="category" fontSize={12} tickLine={false} axisLine={false} width={80} />
                                  <RechartsTooltip formatter={(value: number) => `$${value.toLocaleString()}`} cursor={{fill: 'transparent'}} />
                                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={32}>
                                    {
                                        [
                                            { name: 'Revenue', value: analytics.financials.totalRevenue, fill: '#10b981' },
                                            { name: 'Expenses', value: analytics.financials.totalExpenses, fill: '#ef4444' },
                                            { name: 'Net Profit', value: analytics.financials.netProfit, fill: '#6366f1' }
                                        ].map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))
                                    }
                                  </Bar>
                              </BarChart>
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
                      <TabsTrigger value="exterior">Exterior Parts</TabsTrigger>
                      <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="fixed" className="mt-4">
                      <FixedExpensesManager vehicleId={vehicle.id || vehicle.licensePlate} />
                  </TabsContent>

                  <TabsContent value="equipment" className="mt-4">
                      <EquipmentManager vehicleId={vehicle.id || vehicle.licensePlate} />
                  </TabsContent>

                  <TabsContent value="exterior" className="mt-4">
                      <ExteriorManager vehicleId={vehicle.id || vehicle.licensePlate} />
                  </TabsContent>

                  <TabsContent value="maintenance" className="mt-4">
                      <MaintenanceManager 
                          vehicleId={vehicle.id || vehicle.licensePlate} 
                          logs={maintenanceLogs}
                          maintenanceStatus={maintenanceStatus}
                          onRefresh={() => {
                              const vId = vehicle.id || vehicle.licensePlate;
                              api.getMaintenanceLogs(vId).then(setMaintenanceLogs).catch(console.error);
                          }}
                      />
                  </TabsContent>
              </Tabs>
          </TabsContent>

          <TabsContent value="odometer" className="mt-6">
              <OdometerHistory 
                  vehicleId={vehicle.id || vehicle.licensePlate} 
                  maintenanceLogs={maintenanceLogs} 
                  trips={trips} 
                  onCorrectReading={() => {
                      setNewOdometerValue(vehicle.metrics.odometer?.toString() || '');
                      setIsUpdateOdometerOpen(true);
                  }}
                  refreshTrigger={odometerRefreshTrigger}
              />
          </TabsContent>



          <TabsContent value="profile" className="space-y-6 mt-6">
              <Tabs defaultValue="overview" className="w-full">
                  <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent mb-6">
                      <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2">Overview</TabsTrigger>
                      <TabsTrigger value="specs" className="rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2">Specifications</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="overview" className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Certificate of Fitness */}
                  <Card>
                      <CardHeader className="flex flex-row items-start justify-between pb-2">
                          <div>
                              <CardTitle className="text-base font-bold text-slate-900">Certificate of Fitness</CardTitle>
                              <CardDescription>Fitness and roadworthiness details</CardDescription>
                          </div>
                          <div className="flex gap-2">
                              <Button variant="outline" size="sm" className="h-8" onClick={() => {
                                  const doc = documents.find(d => d.type === 'Fitness');
                                  if (doc?.url) {
                                      setViewingDoc({ url: doc.url, name: doc.name, type: doc.type });
                                  } else {
                                      toast.error("No document file available");
                                  }
                              }}>
                                  <Eye className="w-3 h-3 mr-1" /> View
                              </Button>
                              <Button variant="outline" size="sm" className="h-8" onClick={() => {
                                  const doc = documents.find(d => d.type === 'Fitness');
                                  if (doc) {
                                      setEditingDocId(doc.id);
                                      setUploadForm(prev => ({ 
                                          ...prev, 
                                          type: 'Fitness',
                                          name: doc.name,
                                          expiryDate: doc.expiryDate,
                                          make: doc.metadata?.make || vehicle.make,
                                          model: doc.metadata?.model || vehicle.model,
                                          year: doc.metadata?.year || vehicle.year,
                                          bodyType: doc.metadata?.bodyType || vehicle.bodyType || '',
                                          engineNumber: doc.metadata?.engineNumber || vehicle.engineNumber || '',
                                          ccRating: doc.metadata?.ccRating || vehicle.ccRating || '',
                                          issueDate: doc.uploadDate
                                      }));
                                      setIsUploadOpen(true);
                                  } else {
                                      setUploadForm(prev => ({ 
                                          ...prev, 
                                          type: 'Fitness',
                                          make: vehicle.make,
                                          model: vehicle.model,
                                          year: vehicle.year,
                                          bodyType: vehicle.bodyType || '',
                                          engineNumber: vehicle.engineNumber || '',
                                          ccRating: vehicle.ccRating || ''
                                      }));
                                      setIsUploadOpen(true);
                                  }
                              }}>
                                  <Pencil className="w-3 h-3 mr-1" /> Edit
                              </Button>
                              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0">Valid</Badge>
                          </div>
                      </CardHeader>
                      <CardContent>
                          <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                              <div>
                                  <Label className="text-xs text-slate-500">Make</Label>
                                  <p className="font-medium text-sm">{vehicle.make}</p>
                              </div>
                              <div>
                                  <Label className="text-xs text-slate-500">Model</Label>
                                  <p className="font-medium text-sm">{vehicle.model}</p>
                              </div>
                              <div>
                                  <Label className="text-xs text-slate-500">Year</Label>
                                  <p className="font-medium text-sm">{vehicle.year}</p>
                              </div>
                              <div>
                                  <Label className="text-xs text-slate-500">Colour</Label>
                                  <p className="font-medium text-sm">{vehicle.color || '-'}</p>
                              </div>
                              <div>
                                  <Label className="text-xs text-slate-500">Body Type</Label>
                                  <p className="font-medium text-sm">{vehicle.bodyType || 'Stn/Waggon'}</p>
                              </div>
                              <div>
                                  <Label className="text-xs text-slate-500">Motor / Engine No.</Label>
                                  <p className="font-medium text-sm">{vehicle.engineNumber || '-'}</p>
                              </div>
                              <div>
                                  <Label className="text-xs text-slate-500">CC Rating</Label>
                                  <p className="font-medium text-sm">{vehicle.ccRating || '990'}</p>
                              </div>
                              <div>
                                  <Label className="text-xs text-slate-500">Issue Date</Label>
                                  <p className="font-medium text-sm">{vehicle.fitnessIssueDate ? format(new Date(vehicle.fitnessIssueDate), 'MMM d, yyyy') : '-'}</p>
                              </div>
                              <div className="col-span-2">
                                  <Label className="text-xs text-slate-500">Expiry Date</Label>
                                  <p className="font-medium text-sm">{vehicle.fitnessExpiry ? format(new Date(vehicle.fitnessExpiry), 'MMM d, yyyy') : '-'}</p>
                              </div>
                          </div>
                      </CardContent>
                  </Card>

                  {/* Registration Certificate */}
                  <Card>
                      <CardHeader className="flex flex-row items-start justify-between pb-2">
                          <div>
                              <CardTitle className="text-base font-bold text-slate-900">Registration Certificate</CardTitle>
                              <CardDescription>Official vehicle registration</CardDescription>
                          </div>
                          <div className="flex gap-2">
                              <Button variant="outline" size="sm" className="h-8" onClick={() => {
                                  const doc = documents.find(d => d.type === 'Registration');
                                  if (doc?.url) {
                                      setViewingDoc({ url: doc.url, name: doc.name, type: doc.type });
                                  } else {
                                      toast.error("No document file available");
                                  }
                              }}>
                                  <Eye className="w-3 h-3 mr-1" /> View
                              </Button>
                              <Button variant="outline" size="sm" className="h-8" onClick={() => {
                                  const doc = documents.find(d => d.type === 'Registration');
                                  if (doc) {
                                      setEditingDocId(doc.id);
                                      setUploadForm(prev => ({ 
                                          ...prev, 
                                          type: 'Registration',
                                          name: doc.name,
                                          expiryDate: doc.expiryDate,
                                          laNumber: doc.metadata?.laNumber || vehicle.laNumber || '',
                                          plateNumber: doc.metadata?.plateNumber || vehicle.licensePlate,
                                          mvid: doc.metadata?.mvid || vehicle.mvid || '',
                                          chassisNumber: doc.metadata?.chassisNumber || vehicle.vin,
                                          controlNumber: doc.metadata?.controlNumber || vehicle.controlNumber || '',
                                          issueDate: doc.uploadDate
                                      }));
                                      setIsUploadOpen(true);
                                  } else {
                                      setUploadForm(prev => ({ 
                                          ...prev, 
                                          type: 'Registration',
                                          plateNumber: vehicle.licensePlate,
                                          chassisNumber: vehicle.vin,
                                          laNumber: vehicle.laNumber || '',
                                          mvid: vehicle.mvid || '',
                                          controlNumber: vehicle.controlNumber || ''
                                      }));
                                      setIsUploadOpen(true);
                                  }
                              }}>
                                  <Pencil className="w-3 h-3 mr-1" /> Edit
                              </Button>
                              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0">Valid</Badge>
                          </div>
                      </CardHeader>
                      <CardContent>
                          <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                              <div>
                                  <Label className="text-xs text-slate-500">LA Number</Label>
                                  <p className="font-medium text-sm">{vehicle.laNumber || '-'}</p>
                              </div>
                              <div>
                                  <Label className="text-xs text-slate-500">Reg. Plate No</Label>
                                  <p className="font-medium text-sm">{vehicle.licensePlate}</p>
                              </div>
                              <div>
                                  <Label className="text-xs text-slate-500">MVID</Label>
                                  <p className="font-medium text-sm">{vehicle.mvid || '-'}</p>
                              </div>
                              <div>
                                  <Label className="text-xs text-slate-500">VIN / Chassis No</Label>
                                  <p className="font-medium text-sm">{vehicle.vin}</p>
                              </div>
                              <div>
                                  <Label className="text-xs text-slate-500">Control Number</Label>
                                  <p className="font-medium text-sm">{vehicle.controlNumber || '-'}</p>
                              </div>
                              <div>
                                  <Label className="text-xs text-slate-500">Date Issued</Label>
                                  <p className="font-medium text-sm">{vehicle.registrationIssueDate ? format(new Date(vehicle.registrationIssueDate), 'MMM d, yyyy') : '-'}</p>
                              </div>
                              <div className="col-span-2">
                                  <Label className="text-xs text-slate-500">Expiry Date</Label>
                                  <p className="font-medium text-sm">{vehicle.registrationExpiry ? format(new Date(vehicle.registrationExpiry), 'MMM d, yyyy') : '-'}</p>
                              </div>
                          </div>
                      </CardContent>
                  </Card>

                  {/* Insurance Certificate */}
                  <Card>
                      <CardHeader className="flex flex-row items-start justify-between pb-2">
                          <div>
                              <CardTitle className="text-base font-bold text-slate-900">Insurance Certificate</CardTitle>
                              <CardDescription>Policy and coverage information</CardDescription>
                          </div>
                          <div className="flex gap-2">
                              <Button variant="outline" size="sm" className="h-8" onClick={() => {
                                  const doc = documents.find(d => d.type === 'Insurance');
                                  if (doc?.url) {
                                      setViewingDoc({ url: doc.url, name: doc.name, type: doc.type });
                                  } else {
                                      toast.error("No document file available");
                                  }
                              }}>
                                  <Eye className="w-3 h-3 mr-1" /> View
                              </Button>
                              <Button variant="outline" size="sm" className="h-8" onClick={() => {
                                  const doc = documents.find(d => d.type === 'Insurance');
                                  // Look for stored metadata in the first insurance doc found
                                  const metadata = doc?.metadata || {};
                                  setEditingDocId(doc?.id || null);
                                  setUploadForm(prev => ({ 
                                      ...prev, 
                                      type: 'Insurance',
                                      name: doc?.name || 'Insurance Policy',
                                      expiryDate: doc?.expiryDate || vehicle.insuranceExpiry || '',
                                      policyNumber: metadata.policyNumber || '',
                                      idv: metadata.idv || '',
                                      policyPremium: metadata.policyPremium || '',
                                      excessDeductible: metadata.excessDeductible || '',
                                      depreciationRate: metadata.depreciationRate || '',
                                      authorizedDrivers: metadata.authorizedDrivers || '',
                                      limitationsUse: metadata.limitationsUse || ''
                                  }));
                                  setIsUploadOpen(true);
                              }}>
                                  <Pencil className="w-3 h-3 mr-1" /> Edit
                              </Button>
                              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0">Active</Badge>
                          </div>
                      </CardHeader>
                      <CardContent>
                          {(() => {
                              const doc = documents.find(d => d.type === 'Insurance');
                              const metadata = doc?.metadata || {};
                              return (
                                  <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                                      <div className="col-span-2">
                                          <Label className="text-xs text-slate-500">Certificate / Policy Number</Label>
                                          <p className="font-medium text-sm">{metadata.policyNumber || 'PCCO-80302'}</p>
                                      </div>
                                      <div>
                                          <Label className="text-xs text-slate-500">IDV / Sum Insured</Label>
                                          <p className="font-medium text-sm">${metadata.idv || '2100000'}</p>
                                      </div>
                                      <div>
                                          <Label className="text-xs text-slate-500">Policy Premium</Label>
                                          <p className="font-medium text-sm">${metadata.policyPremium || '120,504.08'}</p>
                                      </div>
                                      <div>
                                          <Label className="text-xs text-slate-500">Excess / Deductible</Label>
                                          <p className="font-medium text-sm">${metadata.excessDeductible || '157500'}</p>
                                      </div>
                                      <div>
                                          <Label className="text-xs text-slate-500">Depreciation Rate</Label>
                                          <p className="font-medium text-sm">{metadata.depreciationRate || '-'}</p>
                                      </div>
                                      <div className="col-span-2">
                                          <Label className="text-xs text-slate-500">Policy Expiry Date</Label>
                                          <p className="font-medium text-sm">{vehicle.insuranceExpiry ? format(new Date(vehicle.insuranceExpiry), 'MMM d, yyyy') : '-'}</p>
                                      </div>
                                      <div className="col-span-2">
                                          <Label className="text-xs text-slate-500">Authorized Drivers</Label>
                                          <p className="text-xs text-slate-700 mt-1 uppercase leading-relaxed">
                                              {metadata.authorizedDrivers || 'SADIKI ABAYOMI THOMAS, KENNY GREGORY RATTRAY ONLY.'}
                                          </p>
                                      </div>
                                      <div className="col-span-2">
                                          <Label className="text-xs text-slate-500">Limitations as to Use</Label>
                                          <p className="text-xs text-slate-700 mt-1 uppercase leading-relaxed">
                                              {metadata.limitationsUse || 'USE ONLY FOR SOCIAL DOMESTIC AND PLEASURE PURPOSES. The Policy does not cover use for hire or reward or commercial travelling.'}
                                          </p>
                                      </div>
                                  </div>
                              );
                          })()}
                      </CardContent>
                  </Card>

                  {/* Valuation Report */}
                  <Card>
                      <CardHeader className="flex flex-row items-start justify-between pb-2">
                          <div>
                              <CardTitle className="text-base font-bold text-slate-900">Valuation Report</CardTitle>
                              <CardDescription>Asset value and deprecation</CardDescription>
                          </div>
                          <div className="flex gap-2">
                              <Button variant="outline" size="sm" className="h-8" onClick={() => {
                                  const doc = documents.find(d => d.type === 'Valuation');
                                  if (doc?.url) {
                                      setViewingDoc({ url: doc.url, name: doc.name, type: doc.type });
                                  } else {
                                      toast.error("No document file available");
                                  }
                              }}>
                                  <Eye className="w-3 h-3 mr-1" /> View
                              </Button>
                              <Button variant="outline" size="sm" className="h-8" onClick={() => {
                                  const doc = documents.find(d => d.type === 'Valuation');
                                  const metadata = doc?.metadata || {};
                                  setEditingDocId(doc?.id || null);
                                  setUploadForm(prev => ({ 
                                      ...prev, 
                                      type: 'Valuation', // Make sure to add this to Select in Dialog
                                      name: doc?.name || 'Valuation Report',
                                      expiryDate: doc?.expiryDate || '',
                                      marketValue: metadata.marketValue || '',
                                      forcedSaleValue: metadata.forcedSaleValue || '',
                                      valuationDate: metadata.valuationDate || '',
                                      modelYear: metadata.modelYear || vehicle.year
                                  }));
                                  setIsUploadOpen(true);
                              }}>
                                  <Pencil className="w-3 h-3 mr-1" /> Edit
                              </Button>
                          </div>
                      </CardHeader>
                      <CardContent>
                          {(() => {
                              const doc = documents.find(d => d.type === 'Valuation');
                              const metadata = doc?.metadata || {};
                              return (
                                  <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                                      <div>
                                          <Label className="text-xs text-slate-500">Market Value</Label>
                                          <p className="font-bold text-lg text-emerald-600">${metadata.marketValue || '2100000'}</p>
                                      </div>
                                      <div>
                                          <Label className="text-xs text-slate-500">Forced Sale Value</Label>
                                          <p className="font-bold text-lg text-amber-600">${metadata.forcedSaleValue || '1890000'}</p>
                                      </div>
                                      <div>
                                          <Label className="text-xs text-slate-500">Valuation Date</Label>
                                          <p className="font-medium text-sm">{metadata.valuationDate ? format(new Date(metadata.valuationDate), 'MMM d, yyyy') : 'Aug 12, 2025'}</p>
                                      </div>
                                      <div>
                                          <Label className="text-xs text-slate-500">Model Year</Label>
                                          <p className="font-medium text-sm">{metadata.modelYear || vehicle.year}</p>
                                      </div>
                                  </div>
                              );
                          })()}
                      </CardContent>
                  </Card>
              </div>

               <div className="pt-6 border-t border-slate-200 mt-8">
                   <div className="flex justify-between items-end mb-4">
                       <div>
                           <h3 className="text-lg font-medium text-slate-900">Vehicle Documents</h3>
                           <p className="text-sm text-slate-500 mt-1">Manage registration, insurance, and permits.</p>
                       </div>
                       <Button onClick={() => setIsUploadOpen(true)} className="bg-slate-900 text-white hover:bg-slate-800">
                           <Upload className="h-4 w-4 mr-2" />
                           Upload Document
                       </Button>
                   </div>
                   
                   <div className="border rounded-md overflow-hidden bg-white shadow-sm">
                       <Table>
                           <TableHeader className="bg-slate-50">
                               <TableRow>
                                   <TableHead>Document Name</TableHead>
                                   <TableHead>Type</TableHead>
                                   <TableHead>Status</TableHead>
                                   <TableHead>Expiry Date</TableHead>
                                   <TableHead className="text-right">Actions</TableHead>
                               </TableRow>
                           </TableHeader>
                           <TableBody>
                               {documents.length === 0 && (
                                   <TableRow>
                                       <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                                           No documents found. Upload one to get started.
                                       </TableCell>
                                   </TableRow>
                               )}
                               {documents.map((doc) => (
                                   <TableRow key={doc.id}>
                                       <TableCell className="font-medium">
                                           <div className="flex items-center gap-3">
                                               <div className="p-2 bg-slate-100 rounded text-slate-500">
                                                   <FileText className="h-4 w-4" />
                                               </div>
                                               {doc.name}
                                           </div>
                                       </TableCell>
                                       <TableCell>{doc.type}</TableCell>
                                       <TableCell>
                                           <Badge variant="outline" className={doc.status === 'Verified' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600'}>
                                               {doc.status}
                                           </Badge>
                                       </TableCell>
                                       <TableCell>{doc.expiryDate ? format(new Date(doc.expiryDate), 'MMM d, yyyy') : 'N/A'}</TableCell>
                                       <TableCell className="text-right">
                                           <div className="flex justify-end items-center gap-1">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-indigo-600" onClick={() => {
                                                    if (doc.url) setViewingDoc({ url: doc.url, name: doc.name, type: doc.type });
                                                    else toast.error("No file available");
                                                }} title="View Document">
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                                
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-900">
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => {
                                                            setEditingDocId(doc.id);
                                                            const metadata = doc.metadata || {};
                                                            setUploadForm(prev => ({
                                                              ...prev,
                                                              type: doc.type,
                                                              name: doc.name,
                                                              expiryDate: doc.expiryDate || '',
                                                              // Spread all potential metadata fields
                                                              ...metadata,
                                                              // Ensure specific mapping if keys differ (mostly matching)
                                                              valuationDate: metadata.valuationDate || '',
                                                              modelYear: metadata.modelYear || vehicle.year,
                                                              marketValue: metadata.marketValue || '',
                                                              forcedSaleValue: metadata.forcedSaleValue || '',
                                                              policyNumber: metadata.policyNumber || '',
                                                              idv: metadata.idv || '',
                                                              policyPremium: metadata.policyPremium || '',
                                                              excessDeductible: metadata.excessDeductible || '',
                                                              depreciationRate: metadata.depreciationRate || '',
                                                              authorizedDrivers: metadata.authorizedDrivers || '',
                                                              limitationsUse: metadata.limitationsUse || '',
                                                              bodyType: metadata.bodyType || vehicle.bodyType || '',
                                                              engineNumber: metadata.engineNumber || vehicle.engineNumber || '',
                                                              ccRating: metadata.ccRating || vehicle.ccRating || '',
                                                              laNumber: metadata.laNumber || vehicle.laNumber || '',
                                                              mvid: metadata.mvid || vehicle.mvid || '',
                                                              controlNumber: metadata.controlNumber || vehicle.controlNumber || '',
                                                              plateNumber: metadata.plateNumber || vehicle.licensePlate,
                                                              chassisNumber: metadata.chassisNumber || vehicle.vin
                                                            }));
                                                            setIsUploadOpen(true);
                                                        }}>
                                                            Edit Details
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem className="text-red-600" onClick={() => {
                                                            setDeletedDocIds(prev => [...prev, doc.id]);
                                                            toast.success("Document deleted");
                                                        }}>
                                                            Delete
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                           </div>
                                       </TableCell>
                                   </TableRow>
                               ))}
                           </TableBody>
                       </Table>
                   </div>
               </div>
               </TabsContent>

               <TabsContent value="specs" className="space-y-6">
                   <Card>
                       <CardHeader className="flex flex-row items-center justify-between">
                           <div>
                               <CardTitle>Technical Specifications</CardTitle>
                               <CardDescription>Detailed vehicle configuration and performance metrics</CardDescription>
                           </div>
                           <Button variant="outline" size="sm" onClick={() => setIsEditingSpecs(true)}>
                               <Pencil className="h-4 w-4 mr-2" />
                               Edit
                           </Button>
                       </CardHeader>
                       <CardContent>
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                               <div className="space-y-6">
                                   {/* Engine */}
                                   <div className="flex gap-4">
                                       <div className="h-10 w-10 shrink-0 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                                           <Zap className="h-5 w-5" />
                                       </div>
                                       <div className="flex-1">
                                           <h4 className="font-medium text-slate-900">Engine</h4>
                                           <p className="text-sm font-semibold text-slate-700 mt-1">{specsForm.engineSize} {specsForm.engineType}</p>
                                           <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                                               {vehicle.specifications?.engineDescription || "Naturally aspirated or turbo - smaller engines are generally more efficient."}
                                           </p>
                                       </div>
                                   </div>
                                   
                                   {/* Transmission */}
                                   <div className="flex gap-4">
                                       <div className="h-10 w-10 shrink-0 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                                           <Settings className="h-5 w-5" />
                                       </div>
                                       <div className="flex-1">
                                           <h4 className="font-medium text-slate-900">Transmission</h4>
                                           <p className="text-sm font-semibold text-slate-700 mt-1">{specsForm.transmission}</p>
                                           <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                                               {vehicle.specifications?.transmissionDescription || getTransmissionDescription(specsForm.transmission)}
                                           </p>
                                       </div>
                                   </div>

                                   {/* Drive Type */}
                                   <div className="flex gap-4">
                                       <div className="h-10 w-10 shrink-0 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                                           <Move className="h-5 w-5" />
                                       </div>
                                       <div className="flex-1">
                                           <h4 className="font-medium text-slate-900">Drive Type</h4>
                                           <p className="text-sm font-semibold text-slate-700 mt-1">{specsForm.driveType}</p>
                                           <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                                               {vehicle.specifications?.driveTypeDescription || getDriveTypeDescription(specsForm.driveType)}
                                           </p>
                                       </div>
                                   </div>
                                   
                                    {/* Fuel */}
                                   <div className="flex gap-4">
                                       <div className="h-10 w-10 shrink-0 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
                                           <Fuel className="h-5 w-5" />
                                       </div>
                                       <div className="flex-1">
                                           <h4 className="font-medium text-slate-900">Fuel & Economy</h4>
                                           <p className="text-sm font-semibold text-slate-700 mt-1">{specsForm.fuelType.replace('_', ' ')}</p>
                                           <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                                               {specsForm.fuelEconomy} km/L • {specsForm.tankCapacity}L Tank
                                           </p>
                                       </div>
                                   </div>
                               </div>

                               <div className="space-y-6">
                                   {/* Kerb Weight */}
                                   <div className="flex gap-4">
                                       <div className="h-10 w-10 shrink-0 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                                           <Scale className="h-5 w-5" />
                                       </div>
                                       <div className="flex-1">
                                           <h4 className="font-medium text-slate-900">Kerb Weight</h4>
                                           <p className="text-sm font-semibold text-slate-700 mt-1">{specsForm.kerbWeight}</p>
                                           <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                                               {vehicle.specifications?.weightDescription || "Light weight reduces the power needed for propulsion."}
                                           </p>
                                       </div>
                                   </div>

                                   {/* Aero */}
                                   <div className="flex gap-4">
                                       <div className="h-10 w-10 shrink-0 rounded-lg bg-sky-50 flex items-center justify-center text-sky-600">
                                           <Wind className="h-5 w-5" />
                                       </div>
                                       <div className="flex-1">
                                           <h4 className="font-medium text-slate-900">Aerodynamic Aids</h4>
                                           <p className="text-sm font-semibold text-slate-700 mt-1">{specsForm.aerodynamicAids}</p>
                                           <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                                               {vehicle.specifications?.aeroDescription || "Spats and undercovers help reduce drag."}
                                           </p>
                                       </div>
                                   </div>

                                   {/* Body Type */}
                                   <div className="flex gap-4">
                                       <div className="h-10 w-10 shrink-0 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
                                           <Car className="h-5 w-5" />
                                       </div>
                                       <div className="flex-1">
                                           <h4 className="font-medium text-slate-900">Body Type</h4>
                                           <p className="text-sm font-semibold text-slate-700 mt-1">{specsForm.bodyType}</p>
                                           <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                                               Vehicle classification and chassis style.
                                           </p>
                                       </div>
                                   </div>
                               </div>
                           </div>
                       </CardContent>
                   </Card>
               </TabsContent>
              </Tabs>
          </TabsContent>
      </Tabs>

      {/* Update Odometer Dialog */}
      <Dialog open={isUpdateOdometerOpen} onOpenChange={setIsUpdateOdometerOpen}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle>Correct Odometer Reading</DialogTitle>
                  <DialogDescription>
                      Manually record a verified odometer reading.
                  </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                  <div className="space-y-2">
                      <Label>Date</Label>
                      <Input 
                          type="date" 
                          value={newOdometerDate} 
                          onChange={(e) => setNewOdometerDate(e.target.value)} 
                      />
                  </div>
                  <div className="space-y-2">
                      <Label>New Reading (km)</Label>
                      <Input 
                          type="number" 
                          placeholder="e.g. 125000" 
                          value={newOdometerValue} 
                          onChange={(e) => setNewOdometerValue(e.target.value)} 
                      />
                  </div>
                  <div className="space-y-2">
                      <Label>Notes (Optional)</Label>
                      <Textarea 
                          placeholder="Reason for correction..." 
                          value={newOdometerNotes} 
                          onChange={(e) => setNewOdometerNotes(e.target.value)} 
                      />
                  </div>
                  <Button onClick={handleUpdateOdometer} disabled={isUpdatingOdometer} className="w-full">
                      {isUpdatingOdometer && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Save Reading
                  </Button>
              </div>
          </DialogContent>
      </Dialog>

          {/* Update Specs Dialog */}
      <Dialog open={isEditingSpecs} onOpenChange={setIsEditingSpecs}>
           <DialogContent className="max-w-2xl">
               <DialogHeader>
                   <DialogTitle>Update Specifications</DialogTitle>
                   <DialogDescription>Modify the technical details of the vehicle.</DialogDescription>
               </DialogHeader>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                   <div className="space-y-4">
                       <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Label>Engine Type</Label>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger><Info className="h-3 w-3 text-slate-400" /></TooltipTrigger>
                                        <TooltipContent>The configuration of the engine cylinders (e.g., Inline-4, V6).</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                            <Input 
                                value={specsForm.engineType} 
                                onChange={e => setSpecsForm({...specsForm, engineType: e.target.value})} 
                                placeholder="e.g. 3-cylinder" 
                            />
                       </div>

                       <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Label>Engine Size</Label>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger><Info className="h-3 w-3 text-slate-400" /></TooltipTrigger>
                                        <TooltipContent>The displacement volume of the engine (e.g., 1.0L).</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                            <Input 
                                value={specsForm.engineSize} 
                                onChange={e => setSpecsForm({...specsForm, engineSize: e.target.value})} 
                                placeholder="e.g. 1.0L" 
                            />
                       </div>

                       <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Label>Transmission</Label>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger><Info className="h-3 w-3 text-slate-400" /></TooltipTrigger>
                                        <TooltipContent>The type of gearbox system (e.g., CVT Automatic).</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                            <Input 
                                value={specsForm.transmission} 
                                onChange={e => setSpecsForm({...specsForm, transmission: e.target.value})} 
                                placeholder="e.g. CVT Automatic" 
                            />
                       </div>

                       <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Label>Drive Type</Label>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger><Info className="h-3 w-3 text-slate-400" /></TooltipTrigger>
                                        <TooltipContent>The drivetrain configuration (e.g., FWD, AWD).</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                            <Input 
                                value={specsForm.driveType} 
                                onChange={e => setSpecsForm({...specsForm, driveType: e.target.value})} 
                                placeholder="e.g. FWD" 
                            />
                       </div>

                       <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Label>Aerodynamic Aids</Label>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger><Info className="h-3 w-3 text-slate-400" /></TooltipTrigger>
                                        <TooltipContent>Features that reduce air resistance (e.g., Spoilers).</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                            <Input 
                                value={specsForm.aerodynamicAids} 
                                onChange={e => setSpecsForm({...specsForm, aerodynamicAids: e.target.value})} 
                                placeholder="e.g. Standard" 
                            />
                       </div>
                   </div>

                   <div className="space-y-4">
                       <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Label>Kerb Weight</Label>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger><Info className="h-3 w-3 text-slate-400" /></TooltipTrigger>
                                        <TooltipContent>The weight of the vehicle without passengers or cargo.</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                            <Input 
                                value={specsForm.kerbWeight} 
                                onChange={e => setSpecsForm({...specsForm, kerbWeight: e.target.value})} 
                                placeholder="e.g. 1070 kg" 
                            />
                       </div>

                       <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Label>Fuel Type</Label>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger><Info className="h-3 w-3 text-slate-400" /></TooltipTrigger>
                                        <TooltipContent>The type of fuel required for the engine.</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                            <Select value={specsForm.fuelType} onValueChange={(val) => setSpecsForm({...specsForm, fuelType: val})}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select fuel type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Gasoline_87">Gasoline (87)</SelectItem>
                                    <SelectItem value="Gasoline_91">Gasoline (91)</SelectItem>
                                    <SelectItem value="Gasoline_93">Gasoline (93)</SelectItem>
                                    <SelectItem value="Diesel">Diesel</SelectItem>
                                    <SelectItem value="Electric">Electric</SelectItem>
                                    <SelectItem value="Hybrid">Hybrid</SelectItem>
                                </SelectContent>
                            </Select>
                       </div>

                       <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Label>Fuel Economy (Km/L)</Label>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger><Info className="h-3 w-3 text-slate-400" /></TooltipTrigger>
                                        <TooltipContent>The distance traveled per unit of fuel.</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                            <Input 
                                value={specsForm.fuelEconomy} 
                                onChange={e => setSpecsForm({...specsForm, fuelEconomy: e.target.value})} 
                                placeholder="e.g. 24.6" 
                            />
                       </div>

                       <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Label>Fuel Tank Capacity (L)</Label>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger><Info className="h-3 w-3 text-slate-400" /></TooltipTrigger>
                                        <TooltipContent>The maximum volume of fuel the tank can hold.</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                            <Input 
                                value={specsForm.tankCapacity} 
                                onChange={e => setSpecsForm({...specsForm, tankCapacity: e.target.value})} 
                                placeholder="e.g. 36" 
                            />
                       </div>

                       <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Label>Body Type</Label>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger><Info className="h-3 w-3 text-slate-400" /></TooltipTrigger>
                                        <TooltipContent>The physical shape/category of the vehicle.</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                            <Input 
                                value={specsForm.bodyType} 
                                onChange={e => setSpecsForm({...specsForm, bodyType: e.target.value})} 
                                placeholder="e.g. MPV" 
                            />
                       </div>
                   </div>
               </div>
               <div className="flex justify-end gap-2">
                   <Button variant="outline" onClick={() => setIsEditingSpecs(false)}>Cancel</Button>
                   <Button onClick={handleSaveSpecs}>Save Changes</Button>
               </div>
           </DialogContent>
      </Dialog>

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
                               <SelectItem value="Valuation">Valuation</SelectItem>
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

                   {/* Dynamic Form Fields based on Type */}
                   {uploadForm.type === 'Registration' && (
                       <div className="grid grid-cols-2 gap-4">
                           <div className="space-y-2">
                               <Label>LA Number</Label>
                               <Input value={uploadForm.laNumber} onChange={e => setUploadForm({...uploadForm, laNumber: e.target.value})} />
                           </div>
                           <div className="space-y-2">
                               <Label>MVID</Label>
                               <Input value={uploadForm.mvid} onChange={e => setUploadForm({...uploadForm, mvid: e.target.value})} />
                           </div>
                           <div className="space-y-2">
                               <Label>Control Number</Label>
                               <Input value={uploadForm.controlNumber} onChange={e => setUploadForm({...uploadForm, controlNumber: e.target.value})} />
                           </div>
                           <div className="space-y-2">
                               <Label>Reg. Plate No</Label>
                               <Input value={uploadForm.plateNumber} onChange={e => setUploadForm({...uploadForm, plateNumber: e.target.value})} />
                           </div>
                       </div>
                   )}

                   {uploadForm.type === 'Fitness' && (
                       <div className="grid grid-cols-2 gap-4">
                           <div className="space-y-2">
                               <Label>Body Type</Label>
                               <Input value={uploadForm.bodyType} onChange={e => setUploadForm({...uploadForm, bodyType: e.target.value})} />
                           </div>
                           <div className="space-y-2">
                               <Label>Engine Number</Label>
                               <Input value={uploadForm.engineNumber} onChange={e => setUploadForm({...uploadForm, engineNumber: e.target.value})} />
                           </div>
                           <div className="space-y-2">
                               <Label>CC Rating</Label>
                               <Input value={uploadForm.ccRating} onChange={e => setUploadForm({...uploadForm, ccRating: e.target.value})} />
                           </div>
                       </div>
                   )}

                   {uploadForm.type === 'Insurance' && (
                       <div className="space-y-4">
                           <div className="grid grid-cols-2 gap-4">
                               <div className="space-y-2">
                                   <Label>Policy Number</Label>
                                   <Input value={uploadForm.policyNumber} onChange={e => setUploadForm({...uploadForm, policyNumber: e.target.value})} />
                               </div>
                               <div className="space-y-2">
                                   <Label>IDV / Sum Insured</Label>
                                   <Input value={uploadForm.idv} onChange={e => setUploadForm({...uploadForm, idv: e.target.value})} />
                               </div>
                               <div className="space-y-2">
                                   <Label>Premium</Label>
                                   <Input value={uploadForm.policyPremium} onChange={e => setUploadForm({...uploadForm, policyPremium: e.target.value})} />
                               </div>
                               <div className="space-y-2">
                                   <Label>Excess / Deductible</Label>
                                   <Input value={uploadForm.excessDeductible} onChange={e => setUploadForm({...uploadForm, excessDeductible: e.target.value})} />
                               </div>
                           </div>
                           <div className="space-y-2">
                               <Label>Authorized Drivers</Label>
                               <Input value={uploadForm.authorizedDrivers} onChange={e => setUploadForm({...uploadForm, authorizedDrivers: e.target.value})} />
                           </div>
                           <div className="space-y-2">
                               <Label>Limitations of Use</Label>
                               <Input value={uploadForm.limitationsUse} onChange={e => setUploadForm({...uploadForm, limitationsUse: e.target.value})} />
                           </div>
                       </div>
                   )}

                   {uploadForm.type === 'Valuation' && (
                       <div className="grid grid-cols-2 gap-4">
                           <div className="space-y-2">
                               <Label>Market Value</Label>
                               <Input value={uploadForm.marketValue} onChange={e => setUploadForm({...uploadForm, marketValue: e.target.value})} />
                           </div>
                           <div className="space-y-2">
                               <Label>Forced Sale Value</Label>
                               <Input value={uploadForm.forcedSaleValue} onChange={e => setUploadForm({...uploadForm, forcedSaleValue: e.target.value})} />
                           </div>
                           <div className="space-y-2">
                               <Label>Valuation Date</Label>
                               <Input type="date" value={uploadForm.valuationDate} onChange={e => setUploadForm({...uploadForm, valuationDate: e.target.value})} />
                           </div>
                       </div>
                   )}
                   <Button onClick={handleSaveDocument} className="w-full">Save Document</Button>
               </div>
           </DialogContent>
      </Dialog>



      {/* Document Viewer Dialog */}
      <Dialog open={!!viewingDoc} onOpenChange={(open) => !open && setViewingDoc(null)}>
          <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden">
              <DialogHeader className="p-4 border-b">
                  <DialogTitle>{viewingDoc?.name}</DialogTitle>
                  <DialogDescription>
                    Viewing document: {viewingDoc?.type}
                  </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-auto bg-slate-100 flex items-center justify-center p-4">
                  {viewingDoc?.url ? (
                      viewingDoc.url.toLowerCase().endsWith('.pdf') ? (
                          <iframe 
                              src={viewingDoc.url} 
                              className="w-full h-full border-0 rounded-md bg-white shadow-sm"
                              title={viewingDoc.name}
                          />
                      ) : (
                          <img 
                              src={viewingDoc.url} 
                              alt={viewingDoc.name} 
                              className="max-w-full max-h-full object-contain rounded-md shadow-sm" 
                          />
                      )
                  ) : (
                      <div className="text-center py-12 text-slate-500">
                          <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
                          <p>No preview available for this document.</p>
                      </div>
                  )}
              </div>
              <div className="p-4 border-t bg-slate-50 flex justify-between items-center">
                  <p className="text-xs text-slate-500">
                      If the document does not load, you can <a href={viewingDoc?.url} target="_blank" rel="noreferrer" className="text-indigo-600 underline">download it directly</a>.
                  </p>
                  <Button variant="outline" onClick={() => setViewingDoc(null)}>Close</Button>
              </div>
          </DialogContent>
      </Dialog>

    </div>
  );
}
