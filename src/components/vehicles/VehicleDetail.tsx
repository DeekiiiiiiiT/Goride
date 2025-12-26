import React, { useMemo, useState } from 'react';
import { 
  ArrowLeft, 
  ArrowRight,
  Calendar, 
  MapPin, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Clock, 
  Activity,
  Fuel,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  BarChart2,
  Zap,
  PiggyBank,
  Receipt,
  Plus,
  History,
  FileText,
  Upload,
  Eye,
  Download,
  Trash2,
  Pencil,
  Loader2,
  Scan,
  Camera,
  Search,
  User
} from 'lucide-react';
import { toast } from "sonner@2.0.3";
import { 
  LineChart, 
  Line, 
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "../ui/alert-dialog";
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
import { Vehicle, VehicleDocument } from '../../types/vehicle';
import { Trip } from '../../types/data';
import { api } from '../../services/api';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { format, subDays, isSameDay, startOfDay, getDay, getHours } from 'date-fns';
import { toast } from 'sonner@2.0.3';
import { projectId, publicAnonKey } from '../../utils/supabase/info';

import { OdometerHistory } from './odometer/OdometerHistory';
import { UpdateOdometerDialog } from './odometer/UpdateOdometerDialog';
import { odometerService } from '../../services/odometerService';
import { calculateLiveMileage } from '../../utils/mileageProjection';

const MOCK_DOCUMENTS: VehicleDocument[] = [];

interface VehicleDetailProps {
  vehicle: Vehicle;
  trips: Trip[];
  onBack: () => void;
  onAssignDriver?: () => void; // Added
}

import { Textarea } from "../ui/textarea";
import { Checkbox } from "../ui/checkbox";

interface MaintenanceLog {
    id: string;
    vehicleId: string;
    date: string;
    type: string; // 'oil', 'tires', 'maintenance', etc.
    serviceInterval?: 'A' | 'B' | 'C' | 'D'; // A=Basic, B=Interm, C=Major, D=LongTerm
    cost: number;
    odo: number;
    provider: string;
    providerLocationUrl?: string;
    notes: string;
    checklist?: string[]; // Array of completed items
    itemCosts?: Record<string, { material: number, labor: number }>; // Cost breakdown per item
    inspectionFee?: number; // Separate inspection fee
    inspectionResults?: {
        issues: string[]; // List of items needing attention
        notes: string;    // Detailed inspection notes
    };
}

const INSPECTION_CHECKLIST = [
    "Replace Engine Oil & Filter",
    "Replace Air Filter",
    "Replace Cabin Filter",
    "Replace Spark Plugs",
    "Replace Brake Pads (Front)",
    "Replace Brake Pads (Rear)",
    "Resurface/Replace Rotors",
    "Flush Brake Fluid",
    "Flush Coolant",
    "Transmission Service",
    "Wheel Alignment",
    "Rotate/Balance Tires",
    "Replace Tires",
    "Replace Wipers",
    "Replace Battery",
    "Suspension Repair",
    "Steering System Repair",
    "Exhaust System Repair",
    "AC Service",
    "Matching/Calibration",
    "Throttle Body Cleaning"
];

const MAINTENANCE_SCHEDULE = {
    A: {
        label: "Basic Service (Every 5,000 km)",
        interval: 5000,
        items: [
            "Replace Engine Oil (0W-20 or 5W-30)",
            "Replace Oil Filter",
            "Check Tire Pressures (LF, RF, LR, RR)",
            "Top Up Window Washer Fluid",
            "Check Coolant Level",
            "Check Lights (Head, Brake, Indicators, Reverse)"
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

export function VehicleDetail({ vehicle, trips, onBack, onAssignDriver }: VehicleDetailProps) {
  const [isLogServiceOpen, setIsLogServiceOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // Service Log State
  const [scanLoading, setScanLoading] = useState(false);
  const [scanInspectionLoading, setScanInspectionLoading] = useState(false);
  const [logStep, setLogStep] = useState<'details' | 'inspection'>('details');
  const [checklistSearch, setChecklistSearch] = useState("");
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLog[]>([]);
  const [serviceForm, setServiceForm] = useState({
      date: new Date().toISOString().split('T')[0],
      type: '',
      serviceInterval: '', // 'A', 'B', 'C', 'D'
      cost: '',
      odo: '',
      notes: '',
      provider: '',
      providerLocationUrl: '',
      checklist: [] as string[],
      itemCosts: {} as Record<string, { material: number, labor: number }>,
      inspectionFee: '',
      hasInspectionFee: false,
      inspectionIssues: [] as string[],
      inspectionNotes: ''
  });

  const [editingLogId, setEditingLogId] = useState<string | null>(null);

  const resetServiceForm = () => {
      setServiceForm({
          date: new Date().toISOString().split('T')[0],
          type: '',
          serviceInterval: '', 
          cost: '',
          odo: '',
          notes: '',
          provider: '',
          providerLocationUrl: '',
          checklist: [] as string[],
          itemCosts: {} as Record<string, { material: number, labor: number }>,
          inspectionFee: '',
          hasInspectionFee: false,
          inspectionIssues: [],
          inspectionNotes: ''
      });
      setLogStep('details');
      setEditingLogId(null);
  };

  const handleEditLog = (log: MaintenanceLog) => {
      setEditingLogId(log.id);
      setServiceForm({
          date: log.date,
          type: log.type,
          serviceInterval: log.serviceInterval || '',
          cost: log.cost.toString(),
          odo: log.odo.toString(),
          notes: log.notes,
          provider: log.provider,
          providerLocationUrl: log.providerLocationUrl || '',
          checklist: log.checklist || [],
          itemCosts: log.itemCosts || {},
          inspectionFee: log.inspectionFee ? log.inspectionFee.toString() : '',
          hasInspectionFee: !!log.inspectionFee,
          inspectionIssues: log.inspectionResults?.issues || [],
          inspectionNotes: log.inspectionResults?.notes || ''
      });
      setLogStep('details');
      setIsLogServiceOpen(true);
  };

  // Fetch Maintenance Logs
  React.useEffect(() => {
      if (vehicle.id || vehicle.licensePlate) {
          const vId = vehicle.id || vehicle.licensePlate;
          api.getMaintenanceLogs(vId).then(setMaintenanceLogs).catch(console.error);
          
          // Phase 5: Calculate Live Mileage
          calculateLiveMileage(vId, vehicle.metrics.odometer).then(res => {
             setProjectedMileage({
                 value: res.estimatedOdo,
                 isProjected: res.isProjected
             });
          });
      }
  }, [vehicle.id, vehicle.licensePlate, vehicle.metrics.odometer]);

  // Calculate Next Service
  const maintenanceStatus = useMemo(() => {
      const currentOdo = vehicle.metrics.odometer || 0;
      
      // Find last service of each type
      const lastService = maintenanceLogs[0]; // Assuming sorted desc
      const lastOdo = lastService?.odo || 0;
      
      // Default to Basic Service next if no history
      let nextDueOdo = lastOdo + 5000;
      let nextType = 'A';
      
      // Simple logic: If last was A, next is B (if mult of 10k). 
      // Actually simpler: 
      // Next 5k is A.
      // Next 10k is B.
      // Next 40k is C.
      
      // Just check remainder of currentOdo to find next major milestone
      const distToNext5k = 5000 - (currentOdo % 5000);
      nextDueOdo = currentOdo + distToNext5k;
      
      // Determine what kind of milestone that is
      if (nextDueOdo % 100000 === 0) nextType = 'D';
      else if (nextDueOdo % 40000 === 0) nextType = 'C';
      else if (nextDueOdo % 10000 === 0) nextType = 'B';
      else nextType = 'A';
      
      const daysToService = Math.ceil(distToNext5k / 50); // Assume 50km/day avg
      
      return {
          nextTypeLabel: MAINTENANCE_SCHEDULE[nextType as keyof typeof MAINTENANCE_SCHEDULE].label.split('(')[0].trim(),
          nextOdo: nextDueOdo,
          remainingKm: distToNext5k,
          daysToService,
          status: distToNext5k < 500 ? 'Due Soon' : 'Healthy'
      };
  }, [vehicle.metrics.odometer, maintenanceLogs]);

  // Auto-calculate total cost when items change
  React.useEffect(() => {
      const items = serviceForm.itemCosts || {};
      const inspectionCost = serviceForm.hasInspectionFee ? (parseFloat(serviceForm.inspectionFee) || 0) : 0;
      
      let itemsTotal = 0;
      Object.values(items).forEach(c => {
          itemsTotal += (c.material || 0) + (c.labor || 0);
      });
      
      const total = itemsTotal + inspectionCost;

      // Only auto-update if we have some itemized data to rely on
      // This prevents overwriting the AI-scanned total if no items are detailed yet
      const hasItemizedData = Object.keys(items).length > 0 || serviceForm.hasInspectionFee;
      
      if (hasItemizedData) {
          const currentCost = parseFloat(serviceForm.cost) || 0;
          if (Math.abs(total - currentCost) > 0.01) {
              setServiceForm(prev => ({ ...prev, cost: total.toFixed(2) }));
          }
      }
  }, [serviceForm.itemCosts, serviceForm.inspectionFee, serviceForm.hasInspectionFee]);

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
              headers: {
                  'Authorization': `Bearer ${publicAnonKey}`
              },
              body: formData
          });

          const result = await response.json();
          if (result.success && result.data) {
               const odoVal = result.data.odometer ? String(result.data.odometer) : '';
               const costVal = result.data.cost ? String(result.data.cost) : '';
               
               // Try to infer service interval from type or notes
               let inferredInterval = '';
               const notesLower = (result.data.notes || '').toLowerCase();
               if (notesLower.includes('cvt') || notesLower.includes('transmission')) inferredInterval = 'C';
               else if (notesLower.includes('spark plug')) inferredInterval = 'D';
               else if (notesLower.includes('cabin filter') || notesLower.includes('air filter')) inferredInterval = 'B';
               else if (result.data.type === 'maintenance') inferredInterval = 'A';

               setServiceForm({
                   date: result.data.date || new Date().toISOString().split('T')[0],
                   type: result.data.type || 'other', 
                   serviceInterval: inferredInterval,
                   cost: costVal,
                   odo: odoVal,
                   notes: result.data.notes || '',
                   provider: '', // AI doesn't extract provider yet, maybe next time
                   providerLocationUrl: '',
                   checklist: [],
                   itemCosts: {},
                   inspectionFee: '',
                   hasInspectionFee: false,
                   inspectionIssues: [],
                   inspectionNotes: ''
               });
               toast.success("Invoice scanned successfully!");
          } else {
               toast.error("Failed to scan invoice: " + (result.error || "Unknown error"));
          }
      } catch (err: any) {
          console.error(err);
          toast.error("Error scanning invoice");
      } finally {
          setScanLoading(false);
      }
  };

  const handleInspectionScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanInspectionLoading(true);
    try {
        const formData = new FormData();
        formData.append('file', file);

        const { projectId, publicAnonKey } = await import('../../utils/supabase/info');
        const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-37f42386/parse-inspection`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${publicAnonKey}`
            },
            body: formData
        });

        const result = await response.json();
        if (result.success && result.data) {
             const issues = result.data.issues || [];
             const notes = result.data.notes || '';
             
             setServiceForm(prev => ({
                 ...prev,
                 inspectionIssues: [...new Set([...prev.inspectionIssues, ...issues])], // Merge and dedupe
                 inspectionNotes: prev.inspectionNotes ? `${prev.inspectionNotes}\n\n[AI Scan Result]:\n${notes}` : notes
             }));

             toast.success(`Scanned! Found ${issues.length} issues.`);
        } else {
             toast.error("Failed to scan inspection report: " + (result.error || "Unknown error"));
        }
    } catch (err: any) {
        console.error(err);
        toast.error("Error scanning inspection report");
    } finally {
        setScanInspectionLoading(false);
    }
  };
  const [selectedDocument, setSelectedDocument] = useState<VehicleDocument | null>(null);
  const [extraDocuments, setExtraDocuments] = useState<VehicleDocument[]>([]);
  const [deletedDocIds, setDeletedDocIds] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isScanned, setIsScanned] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docToDelete, setDocToDelete] = useState<string | null>(null);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [isUpdateOdometerOpen, setIsUpdateOdometerOpen] = useState(false);
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
    // Insurance Fields
    idv: '',
    policyPremium: '',
    excessDeductible: '',
    depreciationRate: '',
    authorizedDrivers: '',
    limitationsUse: '',
    policyNumber: '',
    // Additional Fields
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

  const confirmDeleteDocument = async () => {
    if (!docToDelete) return;

    // Find the document object
    // We can't access 'documents' memo easily here because of scope? 
    // Actually we can, but let's just use the ID.
    // Logic:
    // 1. If it's in extraDocuments, remove it from there.
    // 2. If it's a default document (reg-cert, fitness-cert), we need to clear those fields on vehicle.
    // 3. If it's in vehicle.documents, we remove it from there.

    const updatedVehicle = { ...vehicle };
    let changed = false;

    // 1. Handle derived documents
    if (docToDelete === 'reg-cert') {
        updatedVehicle.registrationCertificateUrl = undefined; 
        updatedVehicle.registrationExpiry = undefined; 
        changed = true;
    } else if (docToDelete === 'fitness-cert') {
        updatedVehicle.fitnessCertificateUrl = undefined;
        updatedVehicle.fitnessExpiry = undefined;
        changed = true;
    } else if (docToDelete === 'insurance-policy') {
        updatedVehicle.insuranceExpiry = undefined;
        changed = true;
    } else {
        // 2. Handle array documents
        if (updatedVehicle.documents && updatedVehicle.documents.some(d => String(d.id) === docToDelete)) {
            updatedVehicle.documents = updatedVehicle.documents.filter(d => String(d.id) !== docToDelete);
            changed = true;
        }
    }

    if (changed) {
        try {
            await api.saveVehicle(updatedVehicle);
            toast.success("Document deleted permanently");
        } catch (error) {
            console.error("Failed to delete document", error);
            toast.error("Failed to delete document");
        }
    }

    // Also remove from local state to be safe
    setExtraDocuments(prev => prev.filter(doc => String(doc.id) !== docToDelete));
    setDeletedDocIds(prev => [...prev, docToDelete]);
    setDocToDelete(null);
  };

  const handleEditDocument = (doc: VehicleDocument) => {
    setEditingDocId(String(doc.id));
    
    // Pre-populate form
    const formState = {
        type: doc.type,
        name: doc.name,
        expiryDate: doc.expiryDate || '',
        valuationDate: doc.metadata?.valuationDate || '',
        marketValue: doc.metadata?.marketValue || '',
        forcedSaleValue: doc.metadata?.forcedSaleValue || '',
        modelYear: doc.metadata?.modelYear || '',
        chassisNumber: doc.metadata?.chassisNumber || '',
        engineNumber: doc.metadata?.engineNumber || '',
        color: doc.metadata?.color || '',
        odometer: doc.metadata?.odometer || '',
        idv: doc.metadata?.idv || '',
        policyPremium: doc.metadata?.policyPremium || '',
        excessDeductible: doc.metadata?.excessDeductible || '',
        depreciationRate: doc.metadata?.depreciationRate || '',
        authorizedDrivers: doc.metadata?.authorizedDrivers || '',
        limitationsUse: doc.metadata?.limitationsUse || '',
        policyNumber: doc.metadata?.policyNumber || '',
        // New Fields
        make: doc.metadata?.make || '',
        model: doc.metadata?.model || '',
        bodyType: doc.metadata?.bodyType || '',
        ccRating: doc.metadata?.ccRating || '',
        issueDate: doc.metadata?.issueDate || '',
        laNumber: doc.metadata?.laNumber || '',
        plateNumber: doc.metadata?.plateNumber || '',
        mvid: doc.metadata?.mvid || '',
        controlNumber: doc.metadata?.controlNumber || '',
    };
    
    // Try to infer type if it doesn't match dropdown values
    if (!['Registration', 'Insurance', 'Fitness', 'Permit', 'Valuation'].includes(doc.type)) {
        // keep as is or set to Other?
        // Let's assume the doc.type matches the dropdown values usually
    }

    setUploadForm(formState);
    setIsUploadOpen(true);
  };

  const handleScan = async () => {
    if (!selectedFile) {
        toast.error("Please select a file first");
        return;
    }

    setIsParsing(true);
    try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        
        let docType = 'other';
        if (uploadForm.type === 'Valuation') docType = 'valuation_report';
        else if (uploadForm.type === 'Registration') docType = 'vehicle_registration';
        else if (uploadForm.type === 'Fitness') docType = 'fitness_certificate';
        else if (uploadForm.type === 'Insurance') docType = 'insurance_policy';
        
        formData.append('type', docType);

        const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-37f42386/parse-document`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${publicAnonKey}`
            },
            body: formData
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Parsing failed');
        }

        const result = await response.json();
        const data = result.data;
        
        if (!data) throw new Error("No data returned");

        setUploadForm(prev => ({
            ...prev,
            valuationDate: data.valuationDate || prev.valuationDate,
            marketValue: data.marketValue || prev.marketValue,
            forcedSaleValue: data.forcedSaleValue || prev.forcedSaleValue,
            modelYear: data.modelYear || prev.modelYear,
            chassisNumber: data.chassisNumber || data.vin || prev.chassisNumber,
            engineNumber: data.engineNumber || prev.engineNumber,
            color: data.color || prev.color,
            odometer: data.odometer || prev.odometer,
            
            // Insurance Fields
            idv: data.idv || prev.idv,
            policyPremium: data.policyPremium || prev.policyPremium,
            excessDeductible: data.excessDeductible || prev.excessDeductible,
            depreciationRate: data.depreciationRate || prev.depreciationRate,
            authorizedDrivers: data.authorizedDrivers || prev.authorizedDrivers,
            limitationsUse: data.limitationsUse || prev.limitationsUse,
            policyNumber: data.policyNumber || prev.policyNumber,
            expiryDate: data.policyExpiryDate || data.expirationDate || prev.expiryDate,
            
            // New Fields Mapping
            make: data.make || data.Make || prev.make,
            model: data.model || data.Model || prev.model,
            bodyType: data.bodyType || data.BodyType || prev.bodyType,
            ccRating: data.ccRating || data.CCRating || prev.ccRating,
            issueDate: data.issueDate || data.IssueDate || prev.issueDate,
            laNumber: data.laNumber || data.LANumber || data.la_number || prev.laNumber,
            plateNumber: data.plateNumber || data.licensePlate || data.PlateNumber || prev.plateNumber,
            mvid: data.mvid || data.MVID || prev.mvid,
            controlNumber: data.controlNumber || data.ControlNumber || data.control_number || prev.controlNumber,

            name: uploadForm.type === 'Valuation' ? 'Valuation Report' : 
                  uploadForm.type === 'Registration' ? 'Vehicle Registration' :
                  uploadForm.type === 'Fitness' ? 'Certificate of Fitness' :
                  uploadForm.type === 'Insurance' ? 'Insurance Policy' :
                  `${uploadForm.type} Report`
        }));
        
        setIsScanned(true);
        toast.success("Document scanned successfully");
    } catch (e: any) {
        console.error("Scan error:", e);
        toast.error(e.message || "Failed to scan document");
    } finally {
        setIsParsing(false);
    }
  };
  // Merge Real Documents with Mock Documents (logic ready for real data)
  const documents = useMemo(() => {
     const docs: VehicleDocument[] = [];
     const savedDocs = vehicle.documents || [];

     // 1. Registration
     // Only add derived if NO saved document of this type exists
     const hasSavedReg = savedDocs.some(d => d.type === 'Registration');
     if (!hasSavedReg && (vehicle.registrationExpiry || vehicle.registrationCertificateUrl)) {
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
                 controlNumber: vehicle.controlNumber,
                 issueDate: vehicle.registrationIssueDate
             }
         });
     }

     // 2. Fitness
     const hasSavedFit = savedDocs.some(d => d.type === 'Fitness');
     if (!hasSavedFit && (vehicle.fitnessExpiry || vehicle.fitnessCertificateUrl)) {
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
                 color: vehicle.color,
                 bodyType: vehicle.bodyType,
                 engineNumber: vehicle.engineNumber,
                 ccRating: vehicle.ccRating,
                 issueDate: vehicle.fitnessIssueDate
             }
         });
     }

     // 3. Insurance
     const hasSavedIns = savedDocs.some(d => d.type === 'Insurance');
     if (!hasSavedIns && vehicle.insuranceExpiry) {
         docs.push({
             id: 'insurance-policy',
             name: 'Insurance Policy',
             type: 'Insurance',
             status: 'Verified',
             expiryDate: vehicle.insuranceExpiry,
             uploadDate: new Date().toISOString(),
             url: undefined
         });
     }
     
     const allDocs = [...docs, ...savedDocs, ...extraDocuments];
     
     // Deduplicate by ID (in case we forced IDs but types overlapped weirdly)
     const uniqueDocs = Array.from(new Map(allDocs.map(item => [item.id, item])).values());
     
     return uniqueDocs.filter(d => !deletedDocIds.includes(String(d.id)));
  }, [vehicle, extraDocuments, deletedDocIds]);

  const handleSaveDocument = async () => {
    // Determine ID: existing or new
    // Use Canonical IDs for core docs to prevent duplication
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
        uploadDate: new Date().toISOString(), // Should we preserve original date on edit? Maybe.
        url: undefined, // We don't have the URL if we are just editing metadata, but if we uploaded a file...
        // Logic for URL: if editing, try to preserve existing URL if not replaced.
        // But we don't have easy access to the existing doc object here unless we look it up.
        metadata: uploadForm.type === 'Valuation' ? {
            valuationDate: uploadForm.valuationDate,
            marketValue: uploadForm.marketValue,
            forcedSaleValue: uploadForm.forcedSaleValue,
            modelYear: uploadForm.modelYear,
            chassisNumber: uploadForm.chassisNumber,
            engineNumber: uploadForm.engineNumber,
            color: uploadForm.color,
            odometer: uploadForm.odometer
        } : uploadForm.type === 'Insurance' ? {
            idv: uploadForm.idv,
            policyPremium: uploadForm.policyPremium,
            excessDeductible: uploadForm.excessDeductible,
            depreciationRate: uploadForm.depreciationRate,
            authorizedDrivers: uploadForm.authorizedDrivers,
            limitationsUse: uploadForm.limitationsUse,
            policyNumber: uploadForm.policyNumber
        } : uploadForm.type === 'Fitness' ? {
            make: uploadForm.make,
            model: uploadForm.model,
            year: uploadForm.modelYear, // Reuse modelYear
            color: uploadForm.color,
            bodyType: uploadForm.bodyType,
            engineNumber: uploadForm.engineNumber,
            ccRating: uploadForm.ccRating,
            issueDate: uploadForm.issueDate
        } : uploadForm.type === 'Registration' ? {
            laNumber: uploadForm.laNumber,
            plateNumber: uploadForm.plateNumber,
            mvid: uploadForm.mvid,
            chassisNumber: uploadForm.chassisNumber,
            controlNumber: uploadForm.controlNumber,
            issueDate: uploadForm.issueDate
        } : undefined
    };

    // If editing and no new file selected, we should try to keep the old URL/UploadDate
    if (editingDocId) {
        // Find the old doc
        const oldDoc = documents.find(d => d.id === editingDocId);
        if (oldDoc) {
            newDoc.url = oldDoc.url;
            newDoc.uploadDate = oldDoc.uploadDate;
        }
    }
    
    // Update Local State
    if (editingDocId) {
        // Update in extraDocuments if it exists there
        setExtraDocuments(prev => prev.map(d => d.id === editingDocId ? newDoc : d));
    } else {
        setExtraDocuments([...extraDocuments, newDoc]);
    }
    
    setIsUploadOpen(false);
    
    // Persist to Backend
    try {
        const updatedVehicle = { ...vehicle };
        
        // 1. Handle Derived Documents (Reg, Fitness, Insurance)
        // If we are editing "Vehicle Registration", we might want to update the core vehicle fields?
        if (newDoc.type === 'Registration' && (editingDocId === 'reg-cert' || !editingDocId)) {
             updatedVehicle.registrationExpiry = newDoc.expiryDate;
             // We can't easily update URL here without file upload logic separate from this function
        }
        if (newDoc.type === 'Fitness' && (editingDocId === 'fitness-cert' || !editingDocId)) {
             updatedVehicle.fitnessExpiry = newDoc.expiryDate;
        }
        if (newDoc.type === 'Insurance' && (editingDocId === 'insurance-policy' || !editingDocId)) {
             updatedVehicle.insuranceExpiry = newDoc.expiryDate;
        }

        // 2. Handle Array Documents
        if (updatedVehicle.documents) {
            if (editingDocId) {
                // Replace if exists in array
                const index = updatedVehicle.documents.findIndex(d => d.id === editingDocId);
                if (index >= 0) {
                    updatedVehicle.documents[index] = newDoc;
                } else {
                    // It might be a derived doc we are "converting" to a real doc? 
                    // Or it was a derived doc (like reg-cert) that doesn't exist in .documents array.
                    // If we edit 'reg-cert', we probably shouldn't add it to .documents array, 
                    // but just update the vehicle fields above.
                    // Unless we want to store metadata for it now?
                    // The current system separates them. Let's stick to updating fields for derived, and array for others.
                    
                    // If it is NOT a derived ID, add/update it.
                    // UPDATE: We DO want to save derived docs if they have metadata that can't be stored in core fields (like LA Number)
                    updatedVehicle.documents.push(newDoc);
                }
            } else {
                updatedVehicle.documents.push(newDoc);
            }
        } else {
            if (editingDocId) {
                // If editing a derived doc that wasn't in array yet
                 updatedVehicle.documents = [newDoc];
            } else {
                 updatedVehicle.documents = [newDoc];
            }
        }
        
        // Update core fields if Valuation report provided new data
        if (uploadForm.type === 'Valuation') {
            if (uploadForm.color) updatedVehicle.color = uploadForm.color;
            if (uploadForm.engineNumber) updatedVehicle.engineNumber = uploadForm.engineNumber;
            
            // Update odometer logic
            if (uploadForm.odometer && !isNaN(parseFloat(uploadForm.odometer.replace(/[^0-9.]/g, '')))) {
                updatedVehicle.metrics = {
                    ...updatedVehicle.metrics,
                    odometer: parseFloat(uploadForm.odometer.replace(/[^0-9.]/g, ''))
                };
            }
        }
        
        await api.saveVehicle(updatedVehicle);
        toast.success("Document saved successfully");
    } catch (error) {
        console.error("Failed to save vehicle document", error);
        toast.error("Failed to save document. Data may be lost on refresh.");
    }
    
    setIsScanned(false);
    setEditingDocId(null);
    setUploadForm({ 
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
  };


  // --- Analytics Logic ---
  const analytics = useMemo(() => {
    const vehicleTrips = trips.filter(t => t.vehicleId === vehicle.id || t.vehicleId === vehicle.licensePlate);
    
    // 1. Earnings Trend (Last 30 Days)
    const last30Days = Array.from({ length: 30 }, (_, i) => {
        const d = subDays(new Date(), 29 - i);
        return {
            date: format(d, 'MMM dd'),
            fullDate: d,
            earnings: 0,
            trips: 0
        };
    });

    // 2. Daily Performance (Mon-Sun)
    const dayOfWeekStats = [0,0,0,0,0,0,0].map((_, i) => ({ 
        name: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i], 
        earnings: 0, 
        trips: 0 
    }));

    // 3. Activity by Hour (0-23)
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
        
        // Match for 30-day trend
        const dayStat = last30Days.find(d => isSameDay(d.fullDate, tDate));
        if (dayStat) {
            dayStat.earnings += t.amount;
            dayStat.trips += 1;
        }

        // Match for Day of Week
        const dayIndex = getDay(tDate);
        dayOfWeekStats[dayIndex].earnings += t.amount;
        dayOfWeekStats[dayIndex].trips += 1;

        // Match for Hour of Day
        const hourIndex = getHours(tDate);
        activityByHour[hourIndex].trips += 1;
        activityByHour[hourIndex].earnings += t.amount;

        // Aggregates
        totalDurationMinutes += (t.duration || 0);
        totalDistance += (t.distance || 0);
    });

    // 4. Utilization Breakdown
    let activeHours = totalDurationMinutes / 60;
    let idleHours = activeHours * 0.4;

    // Phase 5: Use CSV Metrics if available
    if (vehicle.metrics.onlineHours !== undefined && vehicle.metrics.onTripHours !== undefined) {
        activeHours = vehicle.metrics.onTripHours;
        idleHours = Math.max(0, vehicle.metrics.onlineHours - activeHours);
    }
    
    // 5. Financials (Mocked)
    const totalEarnings = vehicle.metrics.totalLifetimeEarnings;
    const totalTrips = vehicleTrips.length;
    
    const fuelCost = totalDistance * 0.15; // $0.15/km
    const maintenanceCost = totalDistance * 0.05; // $0.05/km
    const insuranceCost = 150 * 6; // 6 months estimated
    const depreciationCost = 200 * 6; // 6 months estimated
    
    const totalExpenses = fuelCost + maintenanceCost + insuranceCost + depreciationCost;
    const netProfit = totalEarnings - totalExpenses;
    const profitMargin = totalEarnings > 0 ? (netProfit / totalEarnings) * 100 : 0;
    
    const vehiclePurchasePrice = 25000;
    const roiPercentage = (netProfit / vehiclePurchasePrice) * 100;

    // 6. Maintenance History
    const mockHistory = [
        { id: 'mock-1', date: '2023-11-15', type: 'Oil Change', cost: 85, odo: Math.max(0, vehicle.metrics.odometer - 3000), provider: 'QuickLube Inc', notes: 'Routine change' },
        { id: 'mock-2', date: '2023-08-10', type: 'Tire Rotation', cost: 45, odo: Math.max(0, vehicle.metrics.odometer - 8000), provider: 'City Tires', notes: 'Checked pressure' },
        { id: 'mock-3', date: '2023-05-22', type: 'Annual Inspection', cost: 120, odo: Math.max(0, vehicle.metrics.odometer - 12000), provider: 'Official Dealer', notes: 'Passed all safety checks' },
        { id: 'mock-4', date: '2023-01-15', type: 'Brake Pad Replacement', cost: 350, odo: Math.max(0, vehicle.metrics.odometer - 20000), provider: 'Mechanic Joe', notes: 'Front pads only' },
    ];
    
    // Use real logs if available, otherwise fallback to mock (for demo purposes)
    const history: any[] = maintenanceLogs.length > 0 ? maintenanceLogs : mockHistory;
    
    const totalMaintCost = history.reduce((sum, item) => sum + (item.cost || 0), 0);

    // Performance Metrics
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

  const utilizationData = [
    { name: 'Active Driving', value: analytics.metrics.activeHours, color: '#10b981' }, 
    { name: 'Idle / Waiting', value: analytics.metrics.idleHours, color: '#fbbf24' }, 
    { name: 'Offline', value: Math.max(0, (24 * 30) - (analytics.metrics.activeHours + analytics.metrics.idleHours)), color: '#e2e8f0' }, 
  ];

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
                      <div className="text-right">
                          <span className="font-bold text-slate-900">
                              {(projectedMileage?.value || vehicle.metrics.odometer).toLocaleString()} km
                          </span>
                          {projectedMileage?.isProjected && (
                              <p className="text-[10px] text-indigo-500 font-medium flex items-center justify-end gap-1">
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
              <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
              <TabsTrigger value="odometer">Odometer</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>

          {/* --- Performance Tab --- */}
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
                          <p className="text-xs text-slate-400 mt-1">
                              Est. based on model
                          </p>
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
                              <LineChart data={analytics.trendData}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                  <XAxis 
                                    dataKey="date" 
                                    tick={{fontSize: 12}} 
                                    tickMargin={10}
                                    axisLine={false}
                                    tickLine={false}
                                  />
                                  <YAxis 
                                    tick={{fontSize: 12}} 
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(val) => `$${val}`}
                                  />
                                  <RechartsTooltip 
                                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Earnings']}
                                    labelStyle={{ color: '#64748b' }}
                                  />
                                  <Line 
                                    type="monotone" 
                                    dataKey="earnings" 
                                    stroke="#4f46e5" 
                                    strokeWidth={2} 
                                    dot={false}
                                    activeDot={{ r: 4 }}
                                  />
                              </LineChart>
                          </ResponsiveContainer>
                      </CardContent>
                  </Card>
                  
                  <Card>
                        <CardHeader>
                            <CardTitle>Peak Performance Days</CardTitle>
                            <CardDescription>Revenue by day of week</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={analytics.dayOfWeekData}>
                                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12}} />
                                    <RechartsTooltip />
                                    <Bar dataKey="earnings" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                  </Card>
              </div>
          </TabsContent>

          {/* --- Utilization Tab --- */}
          <TabsContent value="utilization" className="space-y-6 mt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* Utilization Pie Chart */}
                  <Card className="md:col-span-1">
                       <CardHeader>
                           <CardTitle>Time Distribution</CardTitle>
                           <CardDescription>Active vs Idle vs Offline</CardDescription>
                       </CardHeader>
                       <CardContent className="h-[250px] flex items-center justify-center">
                           <ResponsiveContainer width="100%" height="100%">
                               <PieChart>
                                   <Pie
                                      data={utilizationData}
                                      innerRadius={60}
                                      outerRadius={80}
                                      paddingAngle={5}
                                      dataKey="value"
                                   >
                                      {utilizationData.map((entry, index) => (
                                          <Cell key={`cell-${index}`} fill={entry.color} />
                                      ))}
                                   </Pie>
                                   <Legend verticalAlign="bottom" height={36}/>
                                   <RechartsTooltip />
                               </PieChart>
                           </ResponsiveContainer>
                       </CardContent>
                  </Card>

                  {/* Utilization Stats */}
                  <Card className="md:col-span-2">
                       <CardHeader>
                           <CardTitle>Utilization Insights</CardTitle>
                           <CardDescription>Analysis of vehicle usage patterns</CardDescription>
                       </CardHeader>
                       <CardContent className="grid grid-cols-2 gap-4">
                           <div className="bg-slate-50 p-4 rounded-lg">
                               <div className="flex items-center gap-2 mb-2 text-slate-500">
                                   <Zap className="h-4 w-4" />
                                   <span className="text-sm font-medium">Efficiency Rate</span>
                               </div>
                               <div className="text-2xl font-bold text-slate-900">
                                   {((analytics.metrics.activeHours / (analytics.metrics.activeHours + analytics.metrics.idleHours)) * 100).toFixed(1)}%
                               </div>
                               <p className="text-xs text-slate-400 mt-1">Percentage of "on-duty" time spent moving</p>
                           </div>

                           <div className="bg-slate-50 p-4 rounded-lg">
                               <div className="flex items-center gap-2 mb-2 text-slate-500">
                                   <Clock className="h-4 w-4" />
                                   <span className="text-sm font-medium">Total Active Hours</span>
                               </div>
                               <div className="text-2xl font-bold text-slate-900">
                                   {Math.round(analytics.metrics.activeHours)} hrs
                               </div>
                               <p className="text-xs text-slate-400 mt-1">Last 30 days</p>
                           </div>

                           <div className="bg-slate-50 p-4 rounded-lg col-span-2">
                               <h4 className="font-medium text-slate-900 mb-2">Recommendation</h4>
                               <p className="text-sm text-slate-600">
                                   Vehicle utilization is healthy. Consider scheduling maintenance during the low-activity window between 2 AM and 5 AM on Tuesdays to minimize revenue impact.
                               </p>
                           </div>
                       </CardContent>
                  </Card>
              </div>

              {/* Activity Heatmap / Bar Chart */}
              <Card>
                  <CardHeader>
                      <CardTitle>Activity by Hour of Day</CardTitle>
                      <CardDescription>When is this vehicle most productive?</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={analytics.activityByHour}>
                              <CartesianGrid vertical={false} strokeDasharray="3 3" />
                              <XAxis 
                                dataKey="name" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{fontSize: 10}} 
                                interval={2} 
                              />
                              <RechartsTooltip />
                              <Bar dataKey="trips" fill="#818cf8" radius={[2, 2, 0, 0]} name="Trip Count" />
                          </BarChart>
                      </ResponsiveContainer>
                  </CardContent>
              </Card>
          </TabsContent>
          
          {/* --- Financials Tab --- */}
          <TabsContent value="financials" className="space-y-6 mt-6">
              
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                      <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-2">
                              <p className="text-sm font-medium text-slate-500">Total Revenue</p>
                              <DollarSign className="h-4 w-4 text-emerald-500" />
                          </div>
                          <h3 className="text-2xl font-bold text-slate-900">${analytics.financials.totalRevenue.toLocaleString()}</h3>
                          <p className="text-xs text-slate-500 mt-1">Lifetime</p>
                      </CardContent>
                  </Card>
                  <Card>
                      <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-2">
                              <p className="text-sm font-medium text-slate-500">Total Expenses</p>
                              <Receipt className="h-4 w-4 text-rose-500" />
                          </div>
                          <h3 className="text-2xl font-bold text-slate-900">${analytics.financials.totalExpenses.toLocaleString(undefined, {maximumFractionDigits: 0})}</h3>
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
                              <p className="text-sm font-medium text-slate-500">ROI</p>
                              <TrendingUp className="h-4 w-4 text-emerald-600" />
                          </div>
                          <h3 className="text-2xl font-bold text-slate-900">{analytics.financials.roiPercentage.toFixed(1)}%</h3>
                          <p className="text-xs text-slate-500 mt-1">Based on $25k cost</p>
                      </CardContent>
                  </Card>
              </div>

              {/* Expense Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                      <CardHeader>
                          <CardTitle>Expense Breakdown</CardTitle>
                          <CardDescription>Where is the money going?</CardDescription>
                      </CardHeader>
                      <CardContent className="h-[300px] flex items-center justify-center">
                          <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                  <Pie
                                      data={analytics.financials.breakdown}
                                      innerRadius={60}
                                      outerRadius={80}
                                      paddingAngle={5}
                                      dataKey="value"
                                  >
                                      {analytics.financials.breakdown.map((entry, index) => (
                                          <Cell key={`cell-${index}`} fill={entry.color} />
                                      ))}
                                  </Pie>
                                  <RechartsTooltip formatter={(value: number) => `$${value.toFixed(0)}`} />
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
                          <ResponsiveContainer width="100%" height="100%">
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
                                  <XAxis type="number" tickFormatter={(val) => `$${val/1000}k`} />
                                  <YAxis dataKey="name" type="category" width={80} />
                                  <RechartsTooltip formatter={(val: number) => `$${val.toLocaleString()}`} />
                                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={40}>
                                    {
                                        [
                                          { fill: '#10b981' },
                                          { fill: '#ef4444' },
                                          { fill: '#6366f1' }
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

          {/* --- Phase 6: Maintenance Tab --- */}
          <TabsContent value="maintenance" className="space-y-6 mt-6">
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* Stats Column */}
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

                      <Card>
                          <CardContent className="p-6">
                              <p className="text-sm font-medium text-slate-500 mb-1">Total Maintenance Cost</p>
                              <h3 className="text-2xl font-bold text-slate-900">
                                  ${analytics.maintenance.totalCost.toLocaleString()}
                              </h3>
                              <p className="text-xs text-slate-400 mt-1">Lifetime spend</p>
                          </CardContent>
                      </Card>

                      <Card>
                          <CardContent className="p-6">
                              <p className="text-sm font-medium text-slate-500 mb-1">Next Service Due</p>
                              <h3 className="text-lg font-bold text-slate-900">
                                  {maintenanceStatus.nextOdo.toLocaleString()} km
                              </h3>
                              <p className="text-xs text-slate-400 mt-1">
                                  {maintenanceStatus.remainingKm.toLocaleString()} km remaining
                              </p>
                          </CardContent>
                      </Card>

                      {/* Log Service Action */}
                      <Button 
                          className="w-full bg-indigo-600 hover:bg-indigo-700"
                          onClick={() => {
                              resetServiceForm();
                              setIsLogServiceOpen(true);
                          }}
                      >
                          <Plus className="h-4 w-4 mr-2" />
                          Log New Service
                      </Button>

                      <Dialog open={isLogServiceOpen} onOpenChange={setIsLogServiceOpen}>
                          <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col">
                              <DialogHeader>
                                  <DialogTitle>
                                      {logStep === 'inspection' ? 'Inspection Results' : (editingLogId ? 'Edit Service Log' : 'Log Vehicle Service')}
                                  </DialogTitle>
                                  <DialogDescription>
                                      {logStep === 'inspection' 
                                          ? 'Record detailed findings and recommendations.' 
                                          : (editingLogId ? 'Update maintenance details.' : 'Record a new maintenance event. Scan an invoice to auto-fill.')}
                                  </DialogDescription>
                              </DialogHeader>

                              <div className="flex-1 overflow-y-auto py-4 px-1">
                                  {logStep === 'details' ? (
                                  <div className="grid gap-6">
                                      {/* Top Section: Scan & Basic Info */}
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                          {/* Scan Area */}
                                          <div className="relative w-full h-32 md:h-full min-h-[120px]">
                                              <input 
                                                  type="file" 
                                                  accept="image/*,application/pdf"
                                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                  onChange={handleServiceScan}
                                                  disabled={scanLoading}
                                              />
                                              <div className={`w-full h-full border-2 border-dashed rounded-lg flex flex-col items-center justify-center p-4 text-center transition-colors ${scanLoading ? 'bg-indigo-50 border-indigo-200' : 'hover:bg-slate-50 border-slate-200'}`}>
                                                  {scanLoading ? (
                                                      <>
                                                          <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mb-2" />
                                                          <span className="font-semibold text-indigo-700">Analyzing Invoice...</span>
                                                          <span className="text-xs text-indigo-500">Extracting details with AI</span>
                                                      </>
                                                  ) : (
                                                      <>
                                                          <Scan className="h-8 w-8 text-slate-400 mb-2" />
                                                          <span className="font-semibold text-slate-700">Scan Invoice / Receipt</span>
                                                          <span className="text-xs text-slate-500">Upload image or PDF to auto-fill</span>
                                                      </>
                                                  )}
                                              </div>
                                          </div>

                                          {/* Basic Fields */}
                                          <div className="space-y-4">
                                              <div className="grid grid-cols-2 gap-4">
                                                  <div className="space-y-2">
                                                      <Label htmlFor="date">Date</Label>
                                                      <Input 
                                                          id="date" 
                                                          type="date" 
                                                          value={serviceForm.date}
                                                          onChange={e => setServiceForm({...serviceForm, date: e.target.value})}
                                                      />
                                                  </div>
                                                  <div className="space-y-2">
                                                      <Label htmlFor="type">Type</Label>
                                                      <Select 
                                                          value={serviceForm.type} 
                                                          onValueChange={val => setServiceForm({...serviceForm, type: val})}
                                                      >
                                                          <SelectTrigger>
                                                              <SelectValue placeholder="Select type" />
                                                          </SelectTrigger>
                                                          <SelectContent>
                                                              <SelectItem value="maintenance">General Maintenance</SelectItem>
                                                              <SelectItem value="oil">Oil Change</SelectItem>
                                                              <SelectItem value="tires">Tire Service</SelectItem>
                                                              <SelectItem value="brake">Brakes</SelectItem>
                                                              <SelectItem value="inspection">Inspection</SelectItem>
                                                              <SelectItem value="repair">Repair</SelectItem>
                                                              <SelectItem value="other">Other</SelectItem>
                                                          </SelectContent>
                                                      </Select>
                                                  </div>
                                              </div>

                                              <div className="space-y-2">
                                                  <Label htmlFor="interval">Service Schedule</Label>
                                                  <Select 
                                                      value={serviceForm.serviceInterval} 
                                                      onValueChange={val => setServiceForm({...serviceForm, serviceInterval: val})}
                                                  >
                                                      <SelectTrigger>
                                                          <SelectValue placeholder="Select interval (e.g. 5,000 km)" />
                                                      </SelectTrigger>
                                                      <SelectContent>
                                                          <SelectItem value="A">Basic Service (5,000 km)</SelectItem>
                                                          <SelectItem value="B">Intermediate Service (10,000 km)</SelectItem>
                                                          <SelectItem value="C">Major Service (40,000 km)</SelectItem>
                                                          <SelectItem value="D">Long-Term Service (100,000 km)</SelectItem>
                                                      </SelectContent>
                                                  </Select>
                                              </div>
                                          </div>
                                      </div>

                                      {/* Middle Section: Checklist & Details */}
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                          <div className="space-y-4">
                                              {/* Checklist */}
                                              {serviceForm.serviceInterval && MAINTENANCE_SCHEDULE[serviceForm.serviceInterval as keyof typeof MAINTENANCE_SCHEDULE] ? (
                                                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                                      <h4 className="font-semibold text-sm mb-3 text-slate-800 flex items-center justify-between">
                                                          <span>Checklist Items</span>
                                                          <span className="text-xs font-normal text-slate-500">
                                                              {serviceForm.checklist.length}/{MAINTENANCE_SCHEDULE[serviceForm.serviceInterval as keyof typeof MAINTENANCE_SCHEDULE].items.length}
                                                          </span>
                                                      </h4>
                                                      <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                                                          {MAINTENANCE_SCHEDULE[serviceForm.serviceInterval as keyof typeof MAINTENANCE_SCHEDULE].items.map((item, idx) => (
                                                              <div key={idx} className={`space-y-2 pb-2 ${serviceForm.checklist.includes(item) ? 'border-b border-slate-200 last:border-0' : ''}`}>
                                                                  <div className="flex items-start space-x-2.5">
                                                                      <Checkbox 
                                                                          id={`item-${idx}`} 
                                                                          checked={serviceForm.checklist.includes(item)}
                                                                          onCheckedChange={(checked) => {
                                                                              if (checked) {
                                                                                  setServiceForm(prev => ({...prev, checklist: [...prev.checklist, item]}));
                                                                              } else {
                                                                                  setServiceForm(prev => {
                                                                                      const newCosts = {...prev.itemCosts};
                                                                                      delete newCosts[item];
                                                                                      return {...prev, checklist: prev.checklist.filter(i => i !== item), itemCosts: newCosts};
                                                                                  });
                                                                              }
                                                                          }}
                                                                      />
                                                                      <label
                                                                          htmlFor={`item-${idx}`}
                                                                          className="text-sm text-slate-600 leading-snug cursor-pointer select-none pt-0.5"
                                                                      >
                                                                          {item}
                                                                      </label>
                                                                  </div>
                                                                  {serviceForm.checklist.includes(item) && (
                                                                      <div className="flex gap-3 pl-7 animate-in slide-in-from-top-1 duration-200">
                                                                          <div className="relative w-24">
                                                                              <span className="text-[10px] text-slate-500 absolute -top-3 left-0">Material ($)</span>
                                                                              <Input 
                                                                                  type="number" 
                                                                                  className="h-7 text-xs px-2" 
                                                                                  placeholder="0.00" 
                                                                                  value={serviceForm.itemCosts[item]?.material || ''}
                                                                                  onChange={e => {
                                                                                      const val = parseFloat(e.target.value) || 0;
                                                                                      setServiceForm(prev => ({
                                                                                          ...prev,
                                                                                          itemCosts: {
                                                                                              ...prev.itemCosts,
                                                                                              [item]: { ...prev.itemCosts[item], material: val }
                                                                                          }
                                                                                      }));
                                                                                  }}
                                                                              />
                                                                          </div>
                                                                          <div className="relative w-24">
                                                                              <span className="text-[10px] text-slate-500 absolute -top-3 left-0">Labor ($)</span>
                                                                              <Input 
                                                                                  type="number" 
                                                                                  className="h-7 text-xs px-2" 
                                                                                  placeholder="0.00" 
                                                                                  value={serviceForm.itemCosts[item]?.labor || ''}
                                                                                  onChange={e => {
                                                                                      const val = parseFloat(e.target.value) || 0;
                                                                                      setServiceForm(prev => ({
                                                                                          ...prev,
                                                                                          itemCosts: {
                                                                                              ...prev.itemCosts,
                                                                                              [item]: { ...prev.itemCosts[item], labor: val }
                                                                                          }
                                                                                      }));
                                                                                  }}
                                                                              />
                                                                          </div>
                                                                      </div>
                                                                  )}
                                                              </div>
                                                          ))}

                                                          {/* Inspection Fee Option */}
                                                          <div className={`space-y-2 pb-2 mt-4 pt-4 border-t border-dashed border-slate-200`}>
                                                                  <div className="flex items-center space-x-2.5">
                                                                      <Checkbox 
                                                                          id="inspection-fee" 
                                                                          checked={serviceForm.hasInspectionFee}
                                                                          onCheckedChange={(checked) => {
                                                                               setServiceForm(prev => ({...prev, hasInspectionFee: !!checked}));
                                                                          }}
                                                                      />
                                                                      <label
                                                                          htmlFor="inspection-fee"
                                                                          className="text-sm font-medium text-slate-700 cursor-pointer select-none"
                                                                      >
                                                                          Inspection Fee
                                                                      </label>
                                                                  </div>
                                                                  {serviceForm.hasInspectionFee && (
                                                                      <div className="flex gap-3 pl-7 animate-in slide-in-from-top-1 duration-200">
                                                                          <div className="relative w-full">
                                                                              <span className="text-[10px] text-slate-500 absolute -top-3 left-0">Cost ($)</span>
                                                                              <Input 
                                                                                  type="number" 
                                                                                  className="h-7 text-xs px-2" 
                                                                                  placeholder="0.00" 
                                                                                  value={serviceForm.inspectionFee}
                                                                                  onChange={e => setServiceForm(prev => ({...prev, inspectionFee: e.target.value}))}
                                                                              />
                                                                          </div>
                                                                      </div>
                                                                  )}
                                                          </div>
                                                      </div>
                                                  </div>
                                              ) : (
                                                  <div className="bg-slate-50 p-6 rounded-lg border border-dashed border-slate-200 text-center flex flex-col items-center justify-center h-[200px] text-slate-400">
                                                      <FileText className="h-8 w-8 mb-2 opacity-50" />
                                                      <p className="text-sm">Select a Service Schedule to view the checklist.</p>
                                                  </div>
                                              )}

                                              <div className="grid grid-cols-2 gap-4">
                                                  <div className="space-y-2">
                                                      <Label htmlFor="cost">Total Cost ($)</Label>
                                                      <div className="relative">
                                                          <span className="absolute left-3 top-2.5 text-slate-500">$</span>
                                                          <Input 
                                                              id="cost" 
                                                              type="number" 
                                                              className="pl-7"
                                                              placeholder="0.00" 
                                                              value={serviceForm.cost}
                                                              onChange={e => setServiceForm({...serviceForm, cost: e.target.value})}
                                                          />
                                                      </div>
                                                  </div>
                                                  <div className="space-y-2">
                                                      <Label htmlFor="odo">Odometer (km)</Label>
                                                      <Input 
                                                          id="odo" 
                                                          type="number" 
                                                          placeholder={vehicle.metrics.odometer.toString()}
                                                          value={serviceForm.odo}
                                                          onChange={e => setServiceForm({...serviceForm, odo: e.target.value})}
                                                      />
                                                  </div>
                                              </div>
                                              
                                              <div className="space-y-2">
                                                  <Label htmlFor="provider">Service Provider</Label>
                                                  <div className="space-y-2">
                                                      <div className="flex gap-2">
                                                          <Input 
                                                              id="provider" 
                                                              placeholder="e.g. QuickLube, Toyota Dealer" 
                                                              value={serviceForm.provider}
                                                              onChange={e => setServiceForm({...serviceForm, provider: e.target.value})}
                                                          />
                                                          {serviceForm.providerLocationUrl && (
                                                              <Button
                                                                  variant="outline"
                                                                  size="icon"
                                                                  type="button"
                                                                  title="View on Google Maps"
                                                                  onClick={() => window.open(serviceForm.providerLocationUrl, '_blank')}
                                                              >
                                                                  <MapPin className="h-4 w-4" />
                                                              </Button>
                                                          )}
                                                      </div>
                                                      <Input 
                                                          id="providerLocation" 
                                                          placeholder="Paste Google Maps Link (Optional)" 
                                                          value={serviceForm.providerLocationUrl}
                                                          onChange={e => setServiceForm({...serviceForm, providerLocationUrl: e.target.value})}
                                                          className="text-xs text-slate-500"
                                                      />
                                                  </div>
                                              </div>
                                          </div>

                                          {/* Right Column: Notes */}
                                          <div className="flex flex-col h-full space-y-2">
                                              <Label htmlFor="notes">Notes & Observations</Label>
                                              <Textarea 
                                                  id="notes" 
                                                  className="flex-1 min-h-[300px] resize-none p-4 leading-relaxed" 
                                                  placeholder="Paste detailed invoice items here, note any repairs needed, or add mechanic comments..." 
                                                  value={serviceForm.notes}
                                                  onChange={e => setServiceForm({...serviceForm, notes: e.target.value})}
                                              />
                                          </div>
                                      </div>
                                  </div>
                              ) : (
                                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                      <div className="relative group cursor-pointer">
                                          <input 
                                              type="file" 
                                              accept="image/*,application/pdf"
                                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                              onChange={handleInspectionScan}
                                              disabled={scanInspectionLoading}
                                          />
                                          <div className={`bg-indigo-50 border-2 border-dashed border-indigo-200 group-hover:bg-indigo-100 group-hover:border-indigo-300 transition-colors rounded-lg p-4 ${scanInspectionLoading ? 'opacity-75' : ''}`}>
                                              <div className="flex items-start gap-3">
                                                  <div className="bg-white p-2 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                                                      {scanInspectionLoading ? (
                                                          <Loader2 className="h-5 w-5 text-indigo-600 animate-spin" />
                                                      ) : (
                                                          <Scan className="h-5 w-5 text-indigo-600" />
                                                      )}
                                                  </div>
                                                  <div>
                                                      <h4 className="text-sm font-semibold text-indigo-800">
                                                          {scanInspectionLoading ? 'Analyzing Report...' : 'Inspection Report (Click to Scan)'}
                                                      </h4>
                                                      <p className="text-xs text-indigo-600 mt-1">
                                                          {scanInspectionLoading 
                                                              ? 'Extracting issues and recommendations...' 
                                                              : 'Upload a mechanic\'s report to auto-fill action items and notes.'}
                                                      </p>
                                                  </div>
                                              </div>
                                          </div>
                                      </div>

                                      <div className="space-y-3">
                                          <Label>Action Items (Needs Attention)</Label>
                                          <div className="relative">
                                              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                                              <Input 
                                                  placeholder="Search checklist..." 
                                                  className="pl-9 bg-white"
                                                  value={checklistSearch}
                                                  onChange={(e) => setChecklistSearch(e.target.value)}
                                              />
                                          </div>
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto border rounded-lg p-4 bg-slate-50">
                                              {INSPECTION_CHECKLIST
                                                  .filter(item => item.toLowerCase().includes(checklistSearch.toLowerCase()))
                                                  .map((item) => (
                                                  <div key={item} className="flex items-center space-x-2 p-2 hover:bg-white rounded transition-colors border border-transparent hover:border-slate-200">
                                                      <Checkbox 
                                                          id={`ins-${item}`}
                                                          checked={serviceForm.inspectionIssues.includes(item)}
                                                          onCheckedChange={(checked) => {
                                                              if (checked) {
                                                                  setServiceForm(prev => ({...prev, inspectionIssues: [...prev.inspectionIssues, item]}));
                                                              } else {
                                                                  setServiceForm(prev => ({...prev, inspectionIssues: prev.inspectionIssues.filter(x => x !== item)}));
                                                              }
                                                          }}
                                                          className="data-[state=checked]:bg-indigo-600 border-slate-300"
                                                      />
                                                      <label htmlFor={`ins-${item}`} className="text-sm cursor-pointer flex-1 text-slate-700">
                                                          {item}
                                                      </label>
                                                  </div>
                                              ))}
                                              {INSPECTION_CHECKLIST.filter(item => item.toLowerCase().includes(checklistSearch.toLowerCase())).length === 0 && (
                                                  <div className="col-span-full text-center py-4 text-slate-400 text-sm italic">
                                                      No items found matching "{checklistSearch}"
                                                  </div>
                                              )}
                                          </div>
                                      </div>

                                      <div className="space-y-2">
                                          <Label>Detailed Observations</Label>
                                          <Textarea 
                                              placeholder="Enter detailed inspection findings, measurements (e.g., brake pad thickness), or specific recommendations..."
                                              className="min-h-[150px] resize-none"
                                              value={serviceForm.inspectionNotes}
                                              onChange={e => setServiceForm({...serviceForm, inspectionNotes: e.target.value})}
                                          />
                                      </div>
                                  </div>
                              )}
                              </div>
                              <DialogFooter className="sm:justify-between gap-4 border-t pt-4">
                                  <Button 
                                      variant="ghost" 
                                      onClick={() => {
                                          if (logStep === 'inspection') setLogStep('details');
                                          else setIsLogServiceOpen(false);
                                      }} 
                                      className="text-slate-500"
                                  >
                                    <ArrowLeft className="h-4 w-4 mr-2" />
                                    {logStep === 'inspection' ? 'Back' : 'Back'}
                                  </Button>
                                  <div className="flex gap-2">
                                      <Button variant="outline" onClick={() => setIsLogServiceOpen(false)}>Cancel</Button>
                                      
                                      {logStep === 'details' && serviceForm.hasInspectionFee ? (
                                          <Button onClick={() => setLogStep('inspection')}>
                                              Next <ArrowRight className="h-4 w-4 ml-2" />
                                          </Button>
                                      ) : (
                                          <Button type="submit" onClick={async () => {
                                              try {
                                                  const logId = editingLogId || crypto.randomUUID();
                                                  const log = {
                                                      id: logId,
                                                      vehicleId: vehicle.id || vehicle.licensePlate,
                                                      date: serviceForm.date,
                                                      type: serviceForm.type,
                                                      serviceInterval: serviceForm.serviceInterval as any,
                                                      checklist: serviceForm.checklist,
                                                      itemCosts: serviceForm.itemCosts,
                                                      inspectionFee: serviceForm.hasInspectionFee ? parseFloat(serviceForm.inspectionFee) : 0,
                                                      cost: parseFloat(serviceForm.cost) || 0,
                                                      odo: parseFloat(serviceForm.odo) || 0,
                                                      notes: serviceForm.notes,
                                                      provider: serviceForm.provider || 'Unknown',
                                                      providerLocationUrl: serviceForm.providerLocationUrl,
                                                      inspectionResults: serviceForm.hasInspectionFee ? {
                                                          issues: serviceForm.inspectionIssues,
                                                          notes: serviceForm.inspectionNotes
                                                      } : undefined
                                                  };
                                                  
                                                  await api.saveMaintenanceLog(log);
                                                  
                                                  // Odometer Sync: Also save as an odometer reading
                                                  if (log.odo > 0) {
                                                      await odometerService.addReading({
                                                          vehicleId: log.vehicleId,
                                                          date: log.date,
                                                          value: log.odo,
                                                          type: 'Hard', // Service logs are trusted hard readings
                                                          source: 'Service Log',
                                                          notes: `Auto-recorded from ${log.type} Service (Ref: ${log.id.slice(0,8)})`
                                                      });
                                                  }
                                                  
                                                  // Refresh logs locally
                                                  let newLogs;
                                                  if (editingLogId) {
                                                      newLogs = maintenanceLogs.map(l => l.id === editingLogId ? log : l);
                                                  } else {
                                                      newLogs = [log, ...maintenanceLogs];
                                                  }
                                                  newLogs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                                                  
                                                  // @ts-ignore
                                                  setMaintenanceLogs(newLogs);
                                                  
                                                  toast.success(editingLogId ? "Service log updated!" : "Service log saved!");
                                                  setIsLogServiceOpen(false);
                                                  resetServiceForm();
                                              } catch (err) {
                                                  console.error(err);
                                                  toast.error("Failed to save log");
                                              }
                                          }}>Save Log</Button>
                                      )}
                                  </div>
                              </DialogFooter>
                          </DialogContent>
                      </Dialog>
                  </div>

                  {/* History Timeline */}
                  <Card className="md:col-span-2">
                      <CardHeader>
                          <CardTitle>Service History</CardTitle>
                          <CardDescription>Recent maintenance records</CardDescription>
                      </CardHeader>
                      <CardContent>
                          <div className="space-y-6">
                              {analytics.maintenance.history.map((item, index) => (
                                  <div key={item.id} className="relative pl-6 pb-2 border-l border-slate-200 last:border-0">
                                      <div className={`absolute left-[-5px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-white ${item.inspectionResults?.issues && item.inspectionResults.issues.length > 0 ? 'bg-amber-400' : 'bg-emerald-400'}`}></div>
                                      
                                      <div className="flex justify-between items-start mb-1">
                                          <div>
                                              <h4 className="text-sm font-semibold text-slate-900">{item.type}</h4>
                                              <p className="text-xs text-slate-500">{format(new Date(item.date), 'MMMM d, yyyy')}</p>
                                          </div>
                                          <div className="flex items-center gap-2">
                                              <Badge variant="outline" className="text-slate-600">
                                                  ${item.cost}
                                              </Badge>
                                              <Button 
                                                  variant="ghost" 
                                                  size="icon" 
                                                  className="h-6 w-6"
                                                  onClick={() => handleEditLog(item)}
                                              >
                                                  <Pencil className="h-3 w-3 text-slate-400 hover:text-indigo-600" />
                                              </Button>
                                          </div>
                                      </div>
                                      
                                      <div className="bg-slate-50 p-3 rounded-md mt-2 text-sm">
                                          <div className="flex justify-between text-slate-500 mb-1">
                                              <a 
                                                  href={item.providerLocationUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.provider)}`}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="flex items-center gap-1 hover:text-indigo-600 hover:underline transition-colors"
                                                  onClick={(e) => e.stopPropagation()}
                                                  title="View on Google Maps"
                                              >
                                                  <MapPin className="h-3 w-3" /> {item.provider}
                                              </a>
                                              <span className="flex items-center gap-1">
                                                  <Activity className="h-3 w-3" /> {item.odo.toLocaleString()} km
                                              </span>
                                          </div>
                                          {item.notes && (
                                              <p className="text-slate-600 italic border-t border-slate-200 pt-2 mt-2">
                                                  "{item.notes}"
                                              </p>
                                          )}

                                          {item.checklist && item.checklist.length > 0 && (
                                              <div className="mt-3 pt-2 border-t border-slate-200">
                                                  <div className="flex items-center gap-2 mb-2 text-emerald-600">
                                                      <CheckCircle2 className="h-3 w-3" />
                                                      <span className="text-xs font-semibold">Services Performed</span>
                                                  </div>
                                                  <div className="flex flex-wrap gap-1">
                                                      {item.checklist.map((task: string, i: number) => (
                                                          <Badge key={i} variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                                                              {task}
                                                          </Badge>
                                                      ))}
                                                  </div>
                                              </div>
                                          )}
                                          
                                          {item.inspectionResults?.issues && item.inspectionResults.issues.length > 0 && (
                                              <div className="mt-3 pt-2 border-t border-slate-200">
                                                  <div className="flex items-center gap-2 mb-2 text-amber-600">
                                                      <AlertTriangle className="h-3 w-3" />
                                                      <span className="text-xs font-semibold">Action Items Required</span>
                                                  </div>
                                                  <div className="flex flex-wrap gap-1">
                                                      {item.inspectionResults.issues.map((issue: string, i: number) => (
                                                          <Badge key={i} variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                                                              {issue}
                                                          </Badge>
                                                      ))}
                                                  </div>
                                              </div>
                                          )}
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </CardContent>
                  </Card>

              </div>
          </TabsContent>
          {/* --- Odometer Tab --- */}
          <TabsContent value="odometer" className="space-y-6 mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                      <OdometerHistory vehicleId={vehicle.id} maintenanceLogs={maintenanceLogs} trips={trips} />
                  </div>
                  <div className="space-y-6">
                      <Card>
                          <CardHeader>
                              <CardTitle>About Odometer History</CardTitle>
                          </CardHeader>
                          <CardContent className="text-sm text-slate-600 space-y-4">
                              <p>
                                  This timeline tracks your vehicle's mileage from multiple sources to provide a unified history.
                              </p>
                              <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                      <Wrench className="h-4 w-4 text-blue-500" />
                                      <span><strong>Service Log:</strong> Verified readings from maintenance visits.</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                      <FileText className="h-4 w-4 text-green-500" />
                                      <span><strong>Trip Import:</strong> Calculated mileage from uploaded trip logs.</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                      <User className="h-4 w-4 text-slate-500" />
                                      <span><strong>Manual:</strong> Ad-hoc readings you enter yourself.</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                      <TrendingUp className="h-4 w-4 text-indigo-500" />
                                      <span><strong>Projected:</strong> Estimated based on daily average usage.</span>
                                  </div>
                              </div>
                          </CardContent>
                      </Card>
                  </div>
              </div>
          </TabsContent>

          {/* --- Phase 7: Documents Tab --- */}
          <TabsContent value="documents" className="space-y-6 mt-6">
             <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Vehicle Documents</CardTitle>
                        <CardDescription>Manage registration, insurance, and permits.</CardDescription>
                    </div>
                    <Button size="sm" onClick={() => setIsUploadOpen(true)}><Upload className="h-4 w-4 mr-2" /> Upload Document</Button>
                </CardHeader>
                <CardContent>
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Document Name</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Expiry Date</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {documents.map((doc) => (
                                <TableRow key={doc.id}>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                            <FileText className="h-4 w-4 text-slate-400" />
                                            {doc.name}
                                        </div>
                                    </TableCell>
                                    <TableCell>{doc.type}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={
                                            doc.status === 'Verified' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                            doc.status === 'Expired' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                            doc.status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                            'bg-slate-50 text-slate-700'
                                        }>
                                            {doc.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className={
                                        doc.expiryDate && !isNaN(new Date(doc.expiryDate).getTime()) && new Date(doc.expiryDate) < new Date() ? 'text-rose-600 font-medium' : ''
                                    }>
                                        {doc.expiryDate && !isNaN(new Date(doc.expiryDate).getTime()) 
                                            ? format(new Date(doc.expiryDate), 'MMM d, yyyy') 
                                            : 'N/A'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-8 w-8 hover:bg-slate-100"
                                                onClick={() => setSelectedDocument(doc)}
                                            >
                                                <Eye className="h-4 w-4 text-slate-500 hover:text-indigo-600" />
                                            </Button>
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-8 w-8 hover:bg-slate-100"
                                                onClick={() => handleEditDocument(doc)}
                                            >
                                                <Pencil className="h-4 w-4 text-slate-500 hover:text-indigo-600" />
                                            </Button>
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-8 w-8 hover:bg-rose-50"
                                                onClick={() => setDocToDelete(String(doc.id))}
                                            >
                                                <Trash2 className="h-4 w-4 text-rose-500" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                     </Table>
                </CardContent>
            </Card>
          </TabsContent>

          {/* --- Phase 8: Profile Tab --- */}
          <TabsContent value="profile" className="space-y-6 mt-6">
            {(() => {
                const regDoc = documents.find(d => d.type === 'Registration');
                const insDoc = documents.find(d => d.type === 'Insurance');
                const valDoc = documents.find(d => d.type === 'Valuation');
                const fitDoc = documents.find(d => d.type === 'Fitness');

                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        
                        {/* Certificate of Fitness */}
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <div>
                                    <CardTitle>Certificate of Fitness</CardTitle>
                                    <CardDescription>Fitness and roadworthiness details</CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    {fitDoc && (
                                        <>
                                            <Button size="sm" variant="outline" className="h-8 gap-2" onClick={() => setSelectedDocument(fitDoc)}>
                                                <Eye className="h-3 w-3" /> View
                                            </Button>
                                            <Button size="sm" variant="outline" className="h-8 gap-2" onClick={() => handleEditDocument(fitDoc)}>
                                                <Pencil className="h-3 w-3" /> Edit
                                            </Button>
                                        </>
                                    )}
                                    {fitDoc ? 
                                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Valid</Badge> :
                                        <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200">Missing</Badge>
                                    }
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {fitDoc ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label className="text-xs text-slate-500">Make</Label>
                                            <div className="font-medium">{fitDoc.metadata?.make || vehicle.make || '-'}</div>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500">Model</Label>
                                            <div className="font-medium">{fitDoc.metadata?.model || vehicle.model || '-'}</div>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500">Year</Label>
                                            <div className="font-medium">{fitDoc.metadata?.year || vehicle.year || '-'}</div>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500">Colour</Label>
                                            <div className="font-medium">{fitDoc.metadata?.color || vehicle.color || '-'}</div>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500">Body Type</Label>
                                            <div className="font-medium">{fitDoc.metadata?.bodyType || vehicle.bodyType || '-'}</div>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500">Motor / Engine No.</Label>
                                            <div className="font-medium truncate">{fitDoc.metadata?.engineNumber || vehicle.engineNumber || '-'}</div>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500">CC Rating</Label>
                                            <div className="font-medium">{fitDoc.metadata?.ccRating || '-'}</div>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500">Issue Date</Label>
                                            <div className="font-medium">
                                                {fitDoc.metadata?.issueDate ? format(new Date(fitDoc.metadata.issueDate), 'MMM d, yyyy') : (vehicle.fitnessIssueDate ? format(new Date(vehicle.fitnessIssueDate), 'MMM d, yyyy') : '-')}
                                            </div>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500">Expiry Date</Label>
                                            <div className="font-medium">
                                                {fitDoc.expiryDate ? format(new Date(fitDoc.expiryDate), 'MMM d, yyyy') : '-'}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-40 text-slate-400 bg-slate-50 rounded-lg border border-dashed">
                                        <p>No fitness certificate uploaded</p>
                                        <Button variant="link" onClick={() => {
                                            setUploadForm(prev => ({ ...prev, type: 'Fitness' }));
                                            setIsUploadOpen(true);
                                        }} className="text-indigo-600">Upload Certificate</Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Motor Vehicle Registration Certificate */}
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <div>
                                    <CardTitle>Registration Certificate</CardTitle>
                                    <CardDescription>Official vehicle registration</CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    {regDoc && (
                                        <>
                                            <Button size="sm" variant="outline" className="h-8 gap-2" onClick={() => setSelectedDocument(regDoc)}>
                                                <Eye className="h-3 w-3" /> View
                                            </Button>
                                            <Button size="sm" variant="outline" className="h-8 gap-2" onClick={() => handleEditDocument(regDoc)}>
                                                <Pencil className="h-3 w-3" /> Edit
                                            </Button>
                                        </>
                                    )}
                                    {regDoc ? 
                                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Valid</Badge> :
                                        <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200">Missing</Badge>
                                    }
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {regDoc ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label className="text-xs text-slate-500">LA Number</Label>
                                            <div className="font-medium">{regDoc.metadata?.laNumber || '-'}</div>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500">Reg. Plate No</Label>
                                            <div className="font-medium">{regDoc.metadata?.plateNumber || vehicle.licensePlate || '-'}</div>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500">MVID</Label>
                                            <div className="font-medium">{regDoc.metadata?.mvid || '-'}</div>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500">VIN / Chassis No</Label>
                                            <div className="font-medium truncate" title={vehicle.vin}>{regDoc.metadata?.chassisNumber || vehicle.vin || '-'}</div>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500">Control Number</Label>
                                            <div className="font-medium">{regDoc.metadata?.controlNumber || '-'}</div>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500">Date Issued</Label>
                                            <div className="font-medium">
                                                {regDoc.metadata?.issueDate ? format(new Date(regDoc.metadata.issueDate), 'MMM d, yyyy') : (vehicle.registrationIssueDate ? format(new Date(vehicle.registrationIssueDate), 'MMM d, yyyy') : '-')}
                                            </div>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500">Expiry Date</Label>
                                            <div className="font-medium">
                                                {regDoc.expiryDate ? format(new Date(regDoc.expiryDate), 'MMM d, yyyy') : '-'}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-40 text-slate-400 bg-slate-50 rounded-lg border border-dashed">
                                        <p>No registration certificate uploaded</p>
                                        <Button variant="link" onClick={() => {
                                            setUploadForm(prev => ({ ...prev, type: 'Registration' }));
                                            setIsUploadOpen(true);
                                        }} className="text-indigo-600">Upload Certificate</Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Insurance Certificate */}
                        <Card>
                             <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <div>
                                    <CardTitle>Insurance Certificate</CardTitle>
                                    <CardDescription>Policy and coverage information</CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    {insDoc && (
                                        <>
                                            <Button size="sm" variant="outline" className="h-8 gap-2" onClick={() => setSelectedDocument(insDoc)}>
                                                <Eye className="h-3 w-3" /> View
                                            </Button>
                                            <Button size="sm" variant="outline" className="h-8 gap-2" onClick={() => handleEditDocument(insDoc)}>
                                                <Pencil className="h-3 w-3" /> Edit
                                            </Button>
                                        </>
                                    )}
                                    {insDoc && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Active</Badge>}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {insDoc ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="col-span-2">
                                            <Label className="text-xs text-slate-500">Certificate / Policy Number</Label>
                                            <div className="font-medium">{insDoc.metadata?.policyNumber || '-'}</div>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500">IDV / Sum Insured</Label>
                                            <div className="font-medium">${insDoc.metadata?.idv || '-'}</div>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500">Policy Premium</Label>
                                            <div className="font-medium">${insDoc.metadata?.policyPremium || '-'}</div>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500">Excess / Deductible</Label>
                                            <div className="font-medium">${insDoc.metadata?.excessDeductible || '-'}</div>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500">Depreciation Rate</Label>
                                            <div className="font-medium">{insDoc.metadata?.depreciationRate ? `${insDoc.metadata.depreciationRate}%` : '-'}</div>
                                        </div>
                                         <div>
                                            <Label className="text-xs text-slate-500">Policy Expiry Date</Label>
                                            <div className="font-medium">
                                                {insDoc.expiryDate ? format(new Date(insDoc.expiryDate), 'MMM d, yyyy') : '-'}
                                            </div>
                                        </div>
                                        <div className="col-span-2">
                                            <Label className="text-xs text-slate-500">Authorized Drivers</Label>
                                            <div className="text-sm text-slate-700">{insDoc.metadata?.authorizedDrivers || '-'}</div>
                                        </div>
                                         <div className="col-span-2">
                                            <Label className="text-xs text-slate-500">Limitations as to Use</Label>
                                            <div className="text-sm text-slate-700">{insDoc.metadata?.limitationsUse || '-'}</div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-40 text-slate-400 bg-slate-50 rounded-lg border border-dashed">
                                        <p>No insurance policy linked</p>
                                        <Button variant="link" onClick={() => {
                                            setUploadForm(prev => ({ ...prev, type: 'Insurance' }));
                                            setIsUploadOpen(true);
                                        }} className="text-indigo-600">Upload Policy</Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                        
                        {/* Valuation Report */}
                         <Card>
                             <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <div>
                                    <CardTitle>Valuation Report</CardTitle>
                                    <CardDescription>Asset value and deprecation</CardDescription>
                                </div>
                                {valDoc && (
                                    <>
                                        <Button size="sm" variant="outline" className="h-8 gap-2" onClick={() => setSelectedDocument(valDoc)}>
                                            <Eye className="h-3 w-3" /> View
                                        </Button>
                                        <Button size="sm" variant="outline" className="h-8 gap-2" onClick={() => handleEditDocument(valDoc)}>
                                            <Pencil className="h-3 w-3" /> Edit
                                        </Button>
                                    </>
                                )}
                            </CardHeader>
                            <CardContent>
                                {valDoc ? (
                                    <div className="grid grid-cols-2 gap-4">
                                         <div>
                                            <Label className="text-xs text-slate-500">Market Value</Label>
                                            <div className="font-bold text-lg text-emerald-600">${valDoc.metadata?.marketValue || '-'}</div>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500">Forced Sale Value</Label>
                                            <div className="font-bold text-lg text-amber-600">${valDoc.metadata?.forcedSaleValue || '-'}</div>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500">Valuation Date</Label>
                                            <div className="font-medium">
                                                {valDoc.metadata?.valuationDate ? format(new Date(valDoc.metadata.valuationDate), 'MMM d, yyyy') : '-'}
                                            </div>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500">Model Year</Label>
                                            <div className="font-medium">{valDoc.metadata?.modelYear || vehicle.year}</div>
                                        </div>
                                    </div>
                                ) : (
                                     <div className="flex flex-col items-center justify-center h-40 text-slate-400 bg-slate-50 rounded-lg border border-dashed">
                                        <p>No valuation report available</p>
                                         <Button variant="link" onClick={() => {
                                             setUploadForm(prev => ({ ...prev, type: 'Valuation' }));
                                             setIsUploadOpen(true);
                                         }} className="text-indigo-600">Upload Report</Button>
                                    </div>
                                )}
                            </CardContent>
                         </Card>
                    </div>
                );
            })()}
          </TabsContent>
      </Tabs>

      {/* Document Viewer Modal */}
      <Dialog open={!!selectedDocument} onOpenChange={(open) => !open && setSelectedDocument(null)}>
        <DialogContent className="max-w-3xl w-full h-auto max-h-[90vh] overflow-hidden flex flex-col p-0">
            <DialogHeader className="p-4 pb-2">
                <DialogTitle>{selectedDocument?.name}</DialogTitle>
                <DialogDescription>
                    {selectedDocument?.type} • Uploaded on {selectedDocument?.uploadDate && !isNaN(new Date(selectedDocument.uploadDate).getTime()) 
                        ? format(new Date(selectedDocument.uploadDate), 'MMM d, yyyy') 
                        : 'Unknown Date'}
                </DialogDescription>
            </DialogHeader>
            <div className="flex-1 bg-slate-900 flex items-center justify-center p-4 overflow-auto min-h-[400px]">
                {selectedDocument?.url ? (
                    <img 
                        src={selectedDocument.url} 
                        alt={selectedDocument.name} 
                        className="max-w-full max-h-[70vh] object-contain rounded-md"
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                        <FileText className="h-12 w-12 opacity-50" />
                        <p>No preview available</p>
                    </div>
                )}
            </div>

            {/* Metadata Display for Valuation & Insurance */}
            {(selectedDocument?.metadata && (selectedDocument.type === 'Valuation' || selectedDocument.type === 'Insurance')) && (
                <div className="bg-slate-100 p-4 border-t border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-4">
                    {selectedDocument.type === 'Valuation' ? (
                        <>
                            <div>
                                <p className="text-xs text-slate-500 uppercase font-semibold">Valuation Date</p>
                                <p className="font-medium text-slate-900">
                                    {selectedDocument.metadata.valuationDate 
                                        ? format(new Date(selectedDocument.metadata.valuationDate), 'MMM d, yyyy') 
                                        : '-'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 uppercase font-semibold">Model Year</p>
                                <p className="font-medium text-slate-900">{selectedDocument.metadata.modelYear || '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 uppercase font-semibold">Market Value</p>
                                <p className="font-medium text-emerald-600">${selectedDocument.metadata.marketValue || '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 uppercase font-semibold">Forced Sale Value</p>
                                <p className="font-medium text-amber-600">${selectedDocument.metadata.forcedSaleValue || '-'}</p>
                            </div>
                        </>
                    ) : (
                        <>
                            <div>
                                <p className="text-xs text-slate-500 uppercase font-semibold">Policy Number</p>
                                <p className="font-medium text-slate-900">{selectedDocument.metadata.policyNumber || '-'}</p>
                            </div>
                             <div>
                                <p className="text-xs text-slate-500 uppercase font-semibold">IDV / Sum Insured</p>
                                <p className="font-medium text-slate-900">${selectedDocument.metadata.idv || '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 uppercase font-semibold">Premium</p>
                                <p className="font-medium text-slate-900">${selectedDocument.metadata.policyPremium || '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 uppercase font-semibold">Excess</p>
                                <p className="font-medium text-slate-900">${selectedDocument.metadata.excessDeductible || '-'}</p>
                            </div>
                            <div className="col-span-2">
                                <p className="text-xs text-slate-500 uppercase font-semibold">Authorized Drivers</p>
                                <p className="font-medium text-slate-900 truncate" title={selectedDocument.metadata.authorizedDrivers}>
                                    {selectedDocument.metadata.authorizedDrivers || '-'}
                                </p>
                            </div>
                            <div className="col-span-2">
                                <p className="text-xs text-slate-500 uppercase font-semibold">Limitations</p>
                                <p className="font-medium text-slate-900 truncate" title={selectedDocument.metadata.limitationsUse}>
                                    {selectedDocument.metadata.limitationsUse || '-'}
                                </p>
                            </div>
                        </>
                    )}
                </div>
            )}

            <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                 <Button variant="outline" onClick={() => setSelectedDocument(null)}>Close</Button>
                 {selectedDocument?.url && (
                    <Button onClick={() => window.open(selectedDocument.url, '_blank')}>
                        <Download className="h-4 w-4 mr-2" /> Download
                    </Button>
                 )}
            </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={!!docToDelete} onOpenChange={(open) => {
          if (!open) setDocToDelete(null);
      }}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This will permanently delete this document and any associated data from the vehicle record. This action cannot be undone.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDeleteDocument} className="bg-rose-600 hover:bg-rose-700">Delete</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Update Odometer Dialog */}
      <UpdateOdometerDialog 
        isOpen={isUpdateOdometerOpen}
        onClose={() => setIsUpdateOdometerOpen(false)}
        onSuccess={() => {
            // Trigger a refresh of the vehicle metrics if possible?
            // For now, at least close the dialog. 
            // Phase 5 will handle live metric updates.
        }}
        vehicleId={vehicle.id || vehicle.licensePlate}
        currentReading={vehicle.metrics.odometer}
      />

      {/* Upload Document Modal */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="sm:max-w-[700px]">
            <DialogHeader>
                <DialogTitle>Upload Vehicle Document</DialogTitle>
                <DialogDescription>
                    Add a new document to this vehicle's record.
                </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className={(uploadForm.type === 'Valuation' || uploadForm.type === 'Insurance') ? "space-y-2 col-span-2" : "space-y-2"}>
                        <Label htmlFor="doc-type">
                            Type
                        </Label>
                        <Select 
                            value={uploadForm.type} 
                            onValueChange={(val) => {
                                setUploadForm({...uploadForm, type: val});
                                setIsScanned(false);
                            }}
                        >
                            <SelectTrigger id="doc-type">
                                <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Registration">Registration</SelectItem>
                                <SelectItem value="Insurance">Insurance</SelectItem>
                                <SelectItem value="Fitness">Fitness Certificate</SelectItem>
                                <SelectItem value="Permit">Carrier Permit</SelectItem>
                                <SelectItem value="Valuation">Valuation Report</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {uploadForm.type !== 'Valuation' && uploadForm.type !== 'Insurance' && (
                        <div className="space-y-2">
                            <Label htmlFor="doc-expiry">
                                Expiry Date
                            </Label>
                            <Input 
                                id="doc-expiry" 
                                type="date" 
                                value={uploadForm.expiryDate}
                                onChange={(e) => setUploadForm({...uploadForm, expiryDate: e.target.value})}
                            />
                        </div>
                    )}
                </div>
                
                {uploadForm.type !== 'Valuation' && uploadForm.type !== 'Insurance' && (
                    <div className="space-y-2">
                        <Label htmlFor="doc-name">
                            Document Name
                        </Label>
                        <Input 
                            id="doc-name" 
                            placeholder="e.g. 2025 Renewal" 
                            value={uploadForm.name}
                            onChange={(e) => setUploadForm({...uploadForm, name: e.target.value})}
                        />
                    </div>
                )}
                
                <div className="space-y-2">
                    <Label htmlFor="doc-file">
                        File
                    </Label>
                    <Input 
                        id="doc-file" 
                        type="file" 
                        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    />
                </div>

                {(uploadForm.type === 'Valuation' || uploadForm.type === 'Insurance') && !isScanned && (
                    <Button 
                        type="button" 
                        onClick={handleScan} 
                        disabled={isParsing} 
                        className="w-full mt-2"
                    >
                        {isParsing ? 'Scanning...' : 'Scan & Extract Data'}
                    </Button>
                )}
                
                {((uploadForm.type === 'Valuation' || uploadForm.type === 'Insurance' || uploadForm.type === 'Registration' || uploadForm.type === 'Fitness') && (isScanned || editingDocId)) && (
                    <div className="border-t border-slate-100 pt-4 mt-2 space-y-4">
                        <h4 className="text-sm font-medium text-slate-900">Extracted Data</h4>
                        
                        {uploadForm.type === 'Registration' && (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="reg-la" className="text-xs">LA Number</Label>
                                    <Input 
                                        id="reg-la" 
                                        value={uploadForm.laNumber}
                                        onChange={(e) => setUploadForm({...uploadForm, laNumber: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="reg-plate" className="text-xs">Reg. Plate No</Label>
                                    <Input 
                                        id="reg-plate" 
                                        value={uploadForm.plateNumber}
                                        onChange={(e) => setUploadForm({...uploadForm, plateNumber: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="reg-mvid" className="text-xs">MVID</Label>
                                    <Input 
                                        id="reg-mvid" 
                                        value={uploadForm.mvid}
                                        onChange={(e) => setUploadForm({...uploadForm, mvid: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="reg-chassis" className="text-xs">VIN / Chassis No</Label>
                                    <Input 
                                        id="reg-chassis" 
                                        value={uploadForm.chassisNumber}
                                        onChange={(e) => setUploadForm({...uploadForm, chassisNumber: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="reg-control" className="text-xs">Control Number</Label>
                                    <Input 
                                        id="reg-control" 
                                        value={uploadForm.controlNumber}
                                        onChange={(e) => setUploadForm({...uploadForm, controlNumber: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="reg-issue" className="text-xs">Date Issued</Label>
                                    <Input 
                                        id="reg-issue" 
                                        type="date"
                                        value={uploadForm.issueDate}
                                        onChange={(e) => setUploadForm({...uploadForm, issueDate: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="reg-expiry" className="text-xs">Expiry Date</Label>
                                    <Input 
                                        id="reg-expiry" 
                                        type="date"
                                        value={uploadForm.expiryDate}
                                        onChange={(e) => setUploadForm({...uploadForm, expiryDate: e.target.value})}
                                    />
                                </div>
                            </div>
                        )}

                        {uploadForm.type === 'Fitness' && (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="fit-make" className="text-xs">Make</Label>
                                    <Input 
                                        id="fit-make" 
                                        value={uploadForm.make}
                                        onChange={(e) => setUploadForm({...uploadForm, make: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="fit-model" className="text-xs">Model</Label>
                                    <Input 
                                        id="fit-model" 
                                        value={uploadForm.model}
                                        onChange={(e) => setUploadForm({...uploadForm, model: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="fit-year" className="text-xs">Year</Label>
                                    <Input 
                                        id="fit-year" 
                                        value={uploadForm.modelYear}
                                        onChange={(e) => setUploadForm({...uploadForm, modelYear: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="fit-color" className="text-xs">Colour</Label>
                                    <Input 
                                        id="fit-color" 
                                        value={uploadForm.color}
                                        onChange={(e) => setUploadForm({...uploadForm, color: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="fit-body" className="text-xs">Body Type</Label>
                                    <Input 
                                        id="fit-body" 
                                        value={uploadForm.bodyType}
                                        onChange={(e) => setUploadForm({...uploadForm, bodyType: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="fit-engine" className="text-xs">Motor / Engine No.</Label>
                                    <Input 
                                        id="fit-engine" 
                                        value={uploadForm.engineNumber}
                                        onChange={(e) => setUploadForm({...uploadForm, engineNumber: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="fit-cc" className="text-xs">CC Rating</Label>
                                    <Input 
                                        id="fit-cc" 
                                        value={uploadForm.ccRating}
                                        onChange={(e) => setUploadForm({...uploadForm, ccRating: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="fit-issue" className="text-xs">Issue Date</Label>
                                    <Input 
                                        id="fit-issue" 
                                        type="date"
                                        value={uploadForm.issueDate}
                                        onChange={(e) => setUploadForm({...uploadForm, issueDate: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="fit-expiry" className="text-xs">Expiry Date</Label>
                                    <Input 
                                        id="fit-expiry" 
                                        type="date"
                                        value={uploadForm.expiryDate}
                                        onChange={(e) => setUploadForm({...uploadForm, expiryDate: e.target.value})}
                                    />
                                </div>
                            </div>
                        )}
                        
                        {uploadForm.type === 'Valuation' ? (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="val-date" className="text-xs">Valuation Date</Label>
                                    <Input 
                                        id="val-date" 
                                        type="date" 
                                        value={uploadForm.valuationDate}
                                        onChange={(e) => setUploadForm({...uploadForm, valuationDate: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="val-odometer" className="text-xs">Odometer Reading</Label>
                                    <Input 
                                        id="val-odometer" 
                                        value={uploadForm.odometer}
                                        onChange={(e) => setUploadForm({...uploadForm, odometer: e.target.value})}
                                    />
                                </div>
                                
                                <div className="space-y-2">
                                    <Label htmlFor="val-market" className="text-xs">Market Value</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-slate-500 text-sm">$</span>
                                        <Input 
                                            id="val-market" 
                                            className="pl-7" 
                                            value={uploadForm.marketValue}
                                            onChange={(e) => setUploadForm({...uploadForm, marketValue: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="val-forced" className="text-xs">Forced Sale Value</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-slate-500 text-sm">$</span>
                                        <Input 
                                            id="val-forced" 
                                            className="pl-7" 
                                            value={uploadForm.forcedSaleValue}
                                            onChange={(e) => setUploadForm({...uploadForm, forcedSaleValue: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="val-chassis" className="text-xs">Chassis Number</Label>
                                    <Input 
                                        id="val-chassis" 
                                        value={uploadForm.chassisNumber}
                                        onChange={(e) => setUploadForm({...uploadForm, chassisNumber: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="val-engine" className="text-xs">Engine Number</Label>
                                    <Input 
                                        id="val-engine" 
                                        value={uploadForm.engineNumber}
                                        onChange={(e) => setUploadForm({...uploadForm, engineNumber: e.target.value})}
                                    />
                                </div>
                                <div className="col-span-2 space-y-2">
                                    <Label htmlFor="val-color" className="text-xs">Color</Label>
                                    <Input 
                                        id="val-color" 
                                        value={uploadForm.color}
                                        onChange={(e) => setUploadForm({...uploadForm, color: e.target.value})}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2 col-span-2">
                                    <Label htmlFor="ins-policy" className="text-xs">Certificate / Policy Number</Label>
                                    <Input 
                                        id="ins-policy" 
                                        value={uploadForm.policyNumber}
                                        onChange={(e) => setUploadForm({...uploadForm, policyNumber: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="ins-idv" className="text-xs">IDV / Sum Insured</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-slate-500 text-sm">$</span>
                                        <Input 
                                            id="ins-idv" 
                                            className="pl-7" 
                                            value={uploadForm.idv}
                                            onChange={(e) => setUploadForm({...uploadForm, idv: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="ins-premium" className="text-xs">Policy Premium</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-slate-500 text-sm">$</span>
                                        <Input 
                                            id="ins-premium" 
                                            className="pl-7" 
                                            value={uploadForm.policyPremium}
                                            onChange={(e) => setUploadForm({...uploadForm, policyPremium: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="ins-excess" className="text-xs">Excess / Deductible</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-slate-500 text-sm">$</span>
                                        <Input 
                                            id="ins-excess" 
                                            className="pl-7" 
                                            value={uploadForm.excessDeductible}
                                            onChange={(e) => setUploadForm({...uploadForm, excessDeductible: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="ins-dep" className="text-xs">Depreciation Rate</Label>
                                    <Input 
                                        id="ins-dep" 
                                        value={uploadForm.depreciationRate}
                                        onChange={(e) => setUploadForm({...uploadForm, depreciationRate: e.target.value})}
                                        placeholder="e.g. 10%"
                                    />
                                </div>
                                <div className="col-span-2 space-y-2">
                                    <Label htmlFor="ins-drivers" className="text-xs">Authorized Drivers</Label>
                                    <Input 
                                        id="ins-drivers" 
                                        value={uploadForm.authorizedDrivers}
                                        onChange={(e) => setUploadForm({...uploadForm, authorizedDrivers: e.target.value})}
                                    />
                                </div>
                                <div className="col-span-2 space-y-2">
                                    <Label htmlFor="ins-limits" className="text-xs">Limitations as to Use</Label>
                                    <Input 
                                        id="ins-limits" 
                                        value={uploadForm.limitationsUse}
                                        onChange={(e) => setUploadForm({...uploadForm, limitationsUse: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="ins-expiry" className="text-xs">Policy Expiry</Label>
                                    <Input 
                                        id="ins-expiry" 
                                        type="date"
                                        value={uploadForm.expiryDate}
                                        onChange={(e) => setUploadForm({...uploadForm, expiryDate: e.target.value})}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsUploadOpen(false)}>Cancel</Button>
                {(uploadForm.type !== 'Valuation' && uploadForm.type !== 'Insurance') || isScanned || editingDocId ? (
                    <Button onClick={handleSaveDocument}>{editingDocId ? 'Save Changes' : 'Upload'}</Button>
                ) : null}
            </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}