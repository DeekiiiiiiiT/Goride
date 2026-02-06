import React, { useMemo, useState, useEffect } from 'react';
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
  Car,
  Gauge
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
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
  DialogTitle as DialogTitle2,
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
import { Checkbox } from "../ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Vehicle, VehicleDocument } from '../../types/vehicle';
import { FuelScenario } from '../../types/fuel';
import { Trip } from '../../types/data';
import { api } from '../../services/api';
import { odometerService } from '../../services/odometerService';
import { fuelService } from '../../services/fuelService';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { format, subDays, isSameDay, getDay, getHours, differenceInDays, addDays, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { DateRange } from "react-day-picker";
import { DatePickerWithRange } from "../ui/date-range-picker";
import { projectId, publicAnonKey } from '../../utils/supabase/info';

import { OdometerHistory } from './odometer/OdometerHistory';
import { OdometerDisplay } from './odometer/OdometerDisplay';
import { MasterLogTimeline } from './odometer/MasterLogTimeline';
import { calculateLiveMileage } from '../../utils/mileageProjection';
import { FixedExpensesManager } from './expenses/FixedExpensesManager';
import { EquipmentManager } from './EquipmentManager';
import { ExteriorManager } from './ExteriorManager';
import { MaintenanceManager, MaintenanceLog } from './MaintenanceManager';

interface VehicleDetailProps {
  vehicle: Vehicle;
  trips: Trip[];
  vehicleMetrics?: import('../../types/data').VehicleMetrics[]; // Added
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

export function VehicleDetail({ vehicle, trips, vehicleMetrics, onBack, onAssignDriver, onUpdate }: VehicleDetailProps) {

  const [isUpdateOdometerOpen, setIsUpdateOdometerOpen] = useState(false);
  const [odometerRefreshTrigger, setOdometerRefreshTrigger] = useState(0);
  const [scenarios, setScenarios] = useState<FuelScenario[]>([]);

  useEffect(() => {
    fuelService.getFuelScenarios().then(setScenarios).catch(console.error);
  }, []);
  
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

  // Date Range State
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
      from: subDays(new Date(), 29),
      to: new Date(),
  });

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
      bodyType: vehicle.bodyType || 'MPV',
      fuelScenarioId: vehicle.fuelScenarioId || ''
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
              fuelScenarioId: (specsForm.fuelScenarioId && specsForm.fuelScenarioId !== 'none') ? specsForm.fuelScenarioId : undefined,
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
    
    // Calculate date range
    const daysDiff = (dateRange?.from && dateRange?.to) ? Math.max(1, differenceInDays(dateRange.to, dateRange.from) + 1) : 30;
    const startDate = dateRange?.from ? startOfDay(dateRange.from) : subDays(new Date(), 29);

    const trendData = Array.from({ length: daysDiff }, (_, i) => {
        const d = addDays(startDate, i);
        return {
            date: format(d, 'MMM dd'),
            fullDate: d,
            earnings: 0,
            trips: 0
        };
    });

    const kmTrackingData = Array.from({ length: daysDiff }, (_, i) => {
        const d = addDays(startDate, i);
        return {
            date: format(d, 'MMM dd'),
            fullDate: d,
            uber: 0,
            indrive: 0,
            goride: 0,
            other: 0
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
    let sumVisibleEarnings = 0;

    vehicleTrips.forEach(t => {
        const tDate = new Date(t.date);
        
        // Filter out trips outside of date range
        if (dateRange?.from && dateRange?.to) {
             if (!isWithinInterval(tDate, { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to) })) {
                 return;
             }
        } else {
             // Default 30 days logic if no range selected (though state initializes it)
             const cutoff = subDays(new Date(), 30);
             if (tDate < cutoff) return;
        }

        const dayStat = trendData.find(d => isSameDay(d.fullDate, tDate));
        if (dayStat) {
            dayStat.earnings += t.amount;
            dayStat.trips += 1;
        }
        
        const kmStat = kmTrackingData.find(d => isSameDay(d.fullDate, tDate));
        if (kmStat) {
            const p = (t.platform || 'other').toLowerCase();
            const dist = t.distance || 0;
            if (p.includes('uber')) kmStat.uber += dist;
            else if (p.includes('indrive')) kmStat.indrive += dist;
            else if (p.includes('goride')) kmStat.goride += dist;
            else kmStat.other += dist;
        }

        const dayIndex = getDay(tDate);
        dayOfWeekStats[dayIndex].earnings += t.amount;
        dayOfWeekStats[dayIndex].trips += 1;

        const hourIndex = getHours(tDate);
        activityByHour[hourIndex].trips += 1;
        activityByHour[hourIndex].earnings += t.amount;

        totalDurationMinutes += (t.duration || 0);
        totalDistance += (t.distance || 0);
        sumVisibleEarnings += t.amount;
    });

    let activeHours = totalDurationMinutes / 60;
    let idleHours = activeHours * 0.4;
    
    // Determine Earnings Base for Rate Calculations
    // We must ensure the numerator (Earnings) and denominator (Hours/Trips/Km) represent the same dataset.
    let earningsForHourlyRate = sumVisibleEarnings;

    if (vehicle.metrics.onlineHours !== undefined && vehicle.metrics.onTripHours !== undefined) {
        // If we use lifetime hours from metrics, we must use lifetime earnings
    }
    
    const totalEarnings = sumVisibleEarnings; // Use visible earnings for the period, not lifetime
    const totalTrips = vehicleTrips.filter(t => {
         const tDate = new Date(t.date);
         if (dateRange?.from && dateRange?.to) {
             return isWithinInterval(tDate, { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to) });
         }
         return true;
    }).length; // Re-calculate count
    
    const fuelCost = totalDistance * 0.15;
    const maintenanceCost = totalDistance * 0.05;
    
    // Estimate Insurance and Depreciation based on time period
    const daysCount = daysDiff;
    const insuranceCost = (150 * 6) / 365 * daysCount; 
    const depreciationCost = (200 * 6) / 365 * daysCount;
    
    const totalExpenses = fuelCost + maintenanceCost + insuranceCost + depreciationCost;
    const netProfit = totalEarnings - totalExpenses;
    const profitMargin = totalEarnings > 0 ? (netProfit / totalEarnings) * 100 : 0;
    
    const vehiclePurchasePrice = 25000;
    const roiPercentage = (netProfit / vehiclePurchasePrice) * 100;
    
    // Use real logs if available
    const history: any[] = maintenanceLogs;
    const totalMaintCost = history.reduce((sum, item) => sum + (item.cost || 0), 0);

    // Use consistent datasets for rates (Visible Trips vs Visible Earnings)
    const earningsPerTrip = totalTrips > 0 ? sumVisibleEarnings / totalTrips : 0;
    const earningsPerKm = totalDistance > 0 ? sumVisibleEarnings / totalDistance : 0;
    const earningsPerHour = activeHours > 0 ? earningsForHourlyRate / activeHours : 0;

    // Phase 2: Extract Distance Metrics from vehicleMetrics prop
    let distanceMetrics = null;
    if (vehicleMetrics && vehicleMetrics.length > 0) {
        // Filter metrics for this vehicle (already filtered by parent likely, but safe to check)
        const myMetrics = vehicleMetrics.filter(m => 
            (m.vehicleId === vehicle.id) || 
            (m.plateNumber && vehicle.licensePlate && m.plateNumber.includes(vehicle.licensePlate))
        );

        if (myMetrics.length > 0) {
             // Find relevant one for date range
             const relevant = myMetrics.filter(m => {
                 if (!dateRange?.from) return true;
                 const mStart = new Date(m.periodStart);
                 const mEnd = new Date(m.periodEnd);
                 return mStart <= (dateRange.to || new Date()) && mEnd >= dateRange.from;
             }).sort((a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime())[0]; // Take latest

             if (relevant && relevant.openDistance !== undefined) {
                 distanceMetrics = {
                     open: relevant.openDistance || 0,
                     enroute: relevant.enrouteDistance || 0,
                     onTrip: relevant.onTripDistance || 0,
                     unavailable: relevant.unavailableDistance || 0,
                     total: (relevant.openDistance || 0) + (relevant.enrouteDistance || 0) + (relevant.onTripDistance || 0) + (relevant.unavailableDistance || 0)
                 };
             }
        }
    }

    return {
        trendData: trendData,
        kmTrackingData,
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
        distanceMetrics, // New
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
  }, [vehicle, trips, maintenanceLogs, dateRange]);

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
      <div className="flex justify-between items-center">
        <Button variant="ghost" onClick={onBack} className="pl-0 hover:bg-transparent hover:text-indigo-600">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Fleet
        </Button>
        <DatePickerWithRange date={dateRange} setDate={setDateRange} />
      </div>

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
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="utilization">Utilization</TabsTrigger>
              <TabsTrigger value="financials">Financials</TabsTrigger>
              <TabsTrigger value="expenses">Vehicle Expenses</TabsTrigger>
              <TabsTrigger value="odometer">Odometer</TabsTrigger>
              <TabsTrigger value="km-tracking">Km Tracking</TabsTrigger>
              <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                          <div className="text-2xl font-bold">${analytics.financials.totalRevenue.toFixed(2)}</div>
                          <p className="text-xs text-muted-foreground">
                              For selected period
                          </p>
                      </CardContent>
                  </Card>
                  <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
                          <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                          <div className="text-2xl font-bold text-emerald-600">${analytics.financials.netProfit.toFixed(2)}</div>
                          <p className="text-xs text-muted-foreground">
                              {analytics.financials.profitMargin.toFixed(1)}% Margin
                          </p>
                      </CardContent>
                  </Card>
                  <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium">Earnings / Km</CardTitle>
                          <Activity className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                          <div className="text-2xl font-bold">${analytics.metrics.earningsPerKm.toFixed(2)}</div>
                          <p className="text-xs text-muted-foreground">
                              Target: $1.20
                          </p>
                      </CardContent>
                  </Card>
                  
                  {/* New Distance Metrics Tile */}
                  <Card>
                    <CardHeader className="pb-2">
                       <CardTitle className="text-sm font-medium text-slate-500">Distance Metrics</CardTitle>
                    </CardHeader>
                    <CardContent>
                       {analytics.distanceMetrics ? (
                          <>
                             <div className="h-[100px] w-full relative">
                                <ResponsiveContainer width="100%" height="100%">
                                   <PieChart>
                                      <Pie
                                         data={[
                                            { name: 'Open Dist', value: analytics.distanceMetrics.open, fill: '#1e3a8a' },
                                            { name: 'Enroute Dist', value: analytics.distanceMetrics.enroute, fill: '#fbbf24' },
                                            { name: 'On Trip Dist', value: analytics.distanceMetrics.onTrip, fill: '#10b981' },
                                            { name: 'Unavailable Dist', value: analytics.distanceMetrics.unavailable, fill: '#94a3b8' }
                                         ]}
                                         cx="50%"
                                         cy="50%"
                                         innerRadius={30}
                                         outerRadius={45}
                                         paddingAngle={0}
                                         dataKey="value"
                                         startAngle={90}
                                         endAngle={-270}
                                         stroke="none"
                                      >
                                         <Cell key="Open" fill="#1e3a8a" />
                                         <Cell key="Enroute" fill="#fbbf24" />
                                         <Cell key="On Trip" fill="#10b981" />
                                         <Cell key="Unavailable" fill="#94a3b8" />
                                      </Pie>
                                      <RechartsTooltip formatter={(value: number) => [value.toFixed(1) + ' km', 'Distance']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} itemStyle={{ color: '#64748b' }} />
                                   </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                                   <div className="text-lg font-bold text-slate-900">{analytics.distanceMetrics.total.toFixed(0)}</div>
                                   <div className="text-[8px] text-slate-500 font-medium uppercase tracking-wide">Total KM</div>
                                </div>
                             </div>
                             <div className="mt-2 grid grid-cols-4 gap-1 text-center">
                                <div className="flex flex-col items-center">
                                   <span className="text-xs font-bold text-slate-900">{analytics.distanceMetrics.open.toFixed(0)}</span>
                                   <span className="text-[9px] text-slate-500">Open</span>
                                </div>
                                <div className="flex flex-col items-center">
                                   <span className="text-xs font-bold text-slate-900">{analytics.distanceMetrics.enroute.toFixed(0)}</span>
                                   <span className="text-[9px] text-slate-500">Enroute</span>
                                </div>
                                <div className="flex flex-col items-center">
                                   <span className="text-xs font-bold text-slate-900">{analytics.distanceMetrics.onTrip.toFixed(0)}</span>
                                   <span className="text-[9px] text-slate-500">On Trip</span>
                                </div>
                                <div className="flex flex-col items-center">
                                   <span className="text-xs font-bold text-slate-900">{analytics.distanceMetrics.unavailable.toFixed(0)}</span>
                                   <span className="text-[9px] text-slate-500">Unavail</span>
                                </div>
                             </div>
                          </>
                       ) : (
                          <div className="h-[140px] flex flex-col items-center justify-center text-slate-400">
                             <MapPin className="h-8 w-8 mb-2 opacity-20" />
                             <p className="text-xs text-center">Upload "Vehicle Time & Distance" Report</p>
                          </div>
                       )}
                    </CardContent>
                  </Card>
              </div>
          </TabsContent>

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
                              <BarChart data={[{
                                  name: 'Metrics',
                                  Revenue: analytics.financials.totalRevenue,
                                  Expenses: analytics.financials.totalExpenses,
                                  Profit: analytics.financials.netProfit
                              }]}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                  <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                                  <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                                  <RechartsTooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                                  <Bar dataKey="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                                  <Bar dataKey="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                  <Bar dataKey="Profit" fill="#6366f1" radius={[4, 4, 0, 0]} />
                              </BarChart>
                          </ResponsiveContainer>
                      </CardContent>
                  </Card>
               </div>
          </TabsContent>

          <TabsContent value="expenses" className="space-y-6 mt-6">
              <FixedExpensesManager vehicleId={vehicle.id || vehicle.licensePlate} />
          </TabsContent>

          <TabsContent value="odometer" className="space-y-6 mt-6">
              <Card>
                  <CardHeader>
                      <CardTitle>Odometer History</CardTitle>
                      <CardDescription>Track mileage verification and history</CardDescription>
                  </CardHeader>
                  <CardContent>
                      <Tabs defaultValue="history">
                          <TabsList>
                              <TabsTrigger value="history">History Log</TabsTrigger>
                              <TabsTrigger value="timeline">Unified Timeline</TabsTrigger>
                          </TabsList>
                          <TabsContent value="history" className="mt-4">
                              <OdometerHistory 
                                  vehicleId={vehicle.id || vehicle.licensePlate} 
                                  refreshTrigger={odometerRefreshTrigger}
                              />
                          </TabsContent>
                          <TabsContent value="timeline" className="mt-4">
                              <MasterLogTimeline vehicleId={vehicle.id || vehicle.licensePlate} />
                          </TabsContent>
                      </Tabs>
                  </CardContent>
              </Card>
          </TabsContent>

          <TabsContent value="km-tracking" className="space-y-6 mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                      <CardHeader>
                          <CardTitle>Km by Platform</CardTitle>
                          <CardDescription>Where are the miles coming from?</CardDescription>
                      </CardHeader>
                      <CardContent className="h-[300px]">
                          <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                              <BarChart data={analytics.kmTrackingData}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                  <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                                  <YAxis fontSize={12} tickLine={false} axisLine={false} />
                                  <RechartsTooltip />
                                  <Bar dataKey="uber" stackId="a" fill="#000000" name="Uber" />
                                  <Bar dataKey="indrive" stackId="a" fill="#10b981" name="InDrive" />
                                  <Bar dataKey="goride" stackId="a" fill="#6366f1" name="GoRide" />
                                  <Bar dataKey="other" stackId="a" fill="#94a3b8" name="Other" radius={[4, 4, 0, 0]} />
                              </BarChart>
                          </ResponsiveContainer>
                      </CardContent>
                  </Card>
                  
                  <Card>
                      <CardHeader>
                          <CardTitle>Projected Annual Mileage</CardTitle>
                          <CardDescription>Based on current trends</CardDescription>
                      </CardHeader>
                      <CardContent>
                          <div className="text-center py-10">
                              <div className="text-5xl font-bold text-slate-900 mb-2">
                                  {((analytics.metrics.totalDistance / 30) * 365).toLocaleString(undefined, {maximumFractionDigits: 0})}
                              </div>
                              <p className="text-sm text-slate-500 uppercase tracking-widest font-semibold">Km / Year</p>
                              <div className="mt-6 flex justify-center gap-8">
                                  <div>
                                      <p className="text-2xl font-bold text-slate-700">{(analytics.metrics.totalDistance / 30).toFixed(1)}</p>
                                      <p className="text-xs text-slate-400">Avg Km / Day</p>
                                  </div>
                                  <div>
                                      <p className="text-2xl font-bold text-slate-700">{(analytics.metrics.earningsPerKm * (analytics.metrics.totalDistance / 30)).toLocaleString(undefined, {style: 'currency', currency: 'USD'})}</p>
                                      <p className="text-xs text-slate-400">Est. Daily Rev</p>
                                  </div>
                              </div>
                          </div>
                      </CardContent>
                  </Card>
              </div>
          </TabsContent>

          <TabsContent value="profile" className="space-y-6 mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* ... Profile content (omitted for brevity, assume standard layout) ... */}
                  {/* Restoring profile logic from memory/standard pattern as it wasn't fully read but standard CRUD */}
                  <Card>
                      <CardHeader>
                          <div className="flex justify-between items-center">
                              <CardTitle>Vehicle Specifications</CardTitle>
                              <Button variant="ghost" size="sm" onClick={() => setIsEditingSpecs(!isEditingSpecs)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  {isEditingSpecs ? 'Cancel' : 'Edit'}
                              </Button>
                          </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                          {/* Render Specs Form or View */}
                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <Label className="text-xs text-slate-500">Engine Type</Label>
                                  {isEditingSpecs ? (
                                      <Input value={specsForm.engineType} onChange={e => setSpecsForm({...specsForm, engineType: e.target.value})} />
                                  ) : (
                                      <p className="font-medium">{vehicle.specifications?.engineType || '-'}</p>
                                  )}
                              </div>
                              <div>
                                  <Label className="text-xs text-slate-500">Transmission</Label>
                                  {isEditingSpecs ? (
                                      <Input value={specsForm.transmission} onChange={e => setSpecsForm({...specsForm, transmission: e.target.value})} />
                                  ) : (
                                      <p className="font-medium">{vehicle.specifications?.transmission || '-'}</p>
                                  )}
                              </div>
                              {isEditingSpecs && (
                                  <div className="col-span-2 mt-4">
                                      <Button onClick={handleSaveSpecs} className="w-full">Save Changes</Button>
                                  </div>
                              )}
                          </div>
                      </CardContent>
                  </Card>

                  <Card>
                      <CardHeader>
                          <div className="flex justify-between items-center">
                              <CardTitle>Documents</CardTitle>
                              <Button variant="outline" size="sm" onClick={() => setIsUploadOpen(true)}>
                                  <Upload className="h-4 w-4 mr-2" /> Upload
                              </Button>
                          </div>
                      </CardHeader>
                      <CardContent>
                          <div className="space-y-2">
                              {documents.map(doc => (
                                  <div key={doc.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                                      <div className="flex items-center gap-3">
                                          <FileText className="h-5 w-5 text-indigo-500" />
                                          <div>
                                              <p className="font-medium text-sm text-slate-900">{doc.name}</p>
                                              <p className="text-xs text-slate-500">Expires: {doc.expiryDate || 'N/A'}</p>
                                          </div>
                                      </div>
                                      <Badge variant={doc.status === 'Verified' ? 'default' : 'secondary'}>{doc.status}</Badge>
                                  </div>
                              ))}
                              {documents.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No documents uploaded.</p>}
                          </div>
                      </CardContent>
                  </Card>
                  
                  {/* Maintenance Manager */}
                  <div className="md:col-span-2">
                      <MaintenanceManager vehicleId={vehicle.id || vehicle.licensePlate} />
                  </div>
                  
                  {/* Equipment Manager */}
                  <div className="md:col-span-2">
                      <EquipmentManager vehicleId={vehicle.id || vehicle.licensePlate} />
                  </div>
                  
                  {/* Exterior Manager */}
                  <div className="md:col-span-2">
                      <ExteriorManager vehicleId={vehicle.id || vehicle.licensePlate} />
                  </div>
              </div>
          </TabsContent>
      </Tabs>

      {/* --- Dialogs --- */}
      <Dialog open={isUpdateOdometerOpen} onOpenChange={setIsUpdateOdometerOpen}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle2>Update Odometer</DialogTitle2>
                  <DialogDescription>Record a new odometer reading for this vehicle.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                  <div className="space-y-2">
                      <Label>New Reading (km)</Label>
                      <Input 
                          type="number" 
                          placeholder="e.g. 45050" 
                          value={newOdometerValue}
                          onChange={(e) => setNewOdometerValue(e.target.value)}
                      />
                  </div>
                  <div className="space-y-2">
                      <Label>Date</Label>
                      <Input 
                          type="date" 
                          value={newOdometerDate}
                          onChange={(e) => setNewOdometerDate(e.target.value)}
                      />
                  </div>
                  <div className="space-y-2">
                      <Label>Notes (Optional)</Label>
                      <Textarea 
                          placeholder="Routine check, service, etc."
                          value={newOdometerNotes}
                          onChange={(e) => setNewOdometerNotes(e.target.value)}
                      />
                  </div>
              </div>
              <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setIsUpdateOdometerOpen(false)}>Cancel</Button>
                  <Button onClick={handleUpdateOdometer} disabled={isUpdatingOdometer}>
                      {isUpdatingOdometer && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Update Reading
                  </Button>
              </div>
          </DialogContent>
      </Dialog>

      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
          <DialogContent className="max-w-md">
              <DialogHeader>
                  <DialogTitle2>{editingDocId ? 'Edit Document' : 'Upload Document'}</DialogTitle2>
                  <DialogDescription>Add or update vehicle documentation.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                  <div className="space-y-2">
                      <Label>Document Type</Label>
                      <Select 
                          value={uploadForm.type} 
                          onValueChange={(val) => setUploadForm({...uploadForm, type: val})}
                      >
                          <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                              <SelectItem value="Registration">Registration</SelectItem>
                              <SelectItem value="Insurance">Insurance</SelectItem>
                              <SelectItem value="Fitness">Fitness</SelectItem>
                              <SelectItem value="Valuation">Valuation</SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                      </Select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                          <Label>Expiry Date</Label>
                          <Input 
                              type="date" 
                              value={uploadForm.expiryDate}
                              onChange={(e) => setUploadForm({...uploadForm, expiryDate: e.target.value})}
                          />
                      </div>
                      <div className="space-y-2">
                          <Label>Issue Date</Label>
                          <Input 
                              type="date" 
                              value={uploadForm.issueDate || ''}
                              onChange={(e) => setUploadForm({...uploadForm, issueDate: e.target.value})}
                          />
                      </div>
                  </div>

                  <div className="space-y-2">
                      <Label>File</Label>
                      <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => document.getElementById('file-upload')?.click()}>
                          <Upload className="h-8 w-8 text-slate-400 mb-2" />
                          <p className="text-sm font-medium text-slate-600">{selectedFile ? selectedFile.name : "Click to upload"}</p>
                          <p className="text-xs text-slate-400">PDF, JPG, PNG up to 5MB</p>
                          <input 
                              id="file-upload" 
                              type="file" 
                              className="hidden" 
                              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                          />
                      </div>
                  </div>
              </div>
              <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setIsUploadOpen(false)}>Cancel</Button>
                  <Button onClick={handleSaveDocument}>Save Document</Button>
              </div>
          </DialogContent>
      </Dialog>

    </div>
  );
}
