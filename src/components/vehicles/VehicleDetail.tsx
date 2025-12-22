import React, { useMemo, useState } from 'react';
import { 
  ArrowLeft, 
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
  Pencil
} from 'lucide-react';
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

const MOCK_DOCUMENTS: VehicleDocument[] = [];

interface VehicleDetailProps {
  vehicle: Vehicle;
  trips: Trip[];
  onBack: () => void;
  onAssignDriver?: () => void; // Added
}

export function VehicleDetail({ vehicle, trips, onBack, onAssignDriver }: VehicleDetailProps) {
  const [isLogServiceOpen, setIsLogServiceOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<VehicleDocument | null>(null);
  const [extraDocuments, setExtraDocuments] = useState<VehicleDocument[]>([]);
  const [deletedDocIds, setDeletedDocIds] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isScanned, setIsScanned] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docToDelete, setDocToDelete] = useState<string | null>(null);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);

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

    // 6. Maintenance History (Mocked)
    const history = [
        { id: 1, date: '2023-11-15', type: 'Oil Change', cost: 85, odo: Math.max(0, vehicle.metrics.odometer - 3000), provider: 'QuickLube Inc', notes: 'Routine change' },
        { id: 2, date: '2023-08-10', type: 'Tire Rotation', cost: 45, odo: Math.max(0, vehicle.metrics.odometer - 8000), provider: 'City Tires', notes: 'Checked pressure' },
        { id: 3, date: '2023-05-22', type: 'Annual Inspection', cost: 120, odo: Math.max(0, vehicle.metrics.odometer - 12000), provider: 'Official Dealer', notes: 'Passed all safety checks' },
        { id: 4, date: '2023-01-15', type: 'Brake Pad Replacement', cost: 350, odo: Math.max(0, vehicle.metrics.odometer - 20000), provider: 'Mechanic Joe', notes: 'Front pads only' },
    ];
    
    const totalMaintCost = history.reduce((sum, item) => sum + item.cost, 0);

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
  }, [vehicle, trips]);

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
              <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Today's Pulse</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
                                 <div className="bg-emerald-100 p-2 rounded-full text-emerald-600">
                                     <CheckCircle2 className="h-5 w-5" />
                                 </div>
                                 <div>
                                     <p className="text-sm font-medium text-slate-500">Service Status</p>
                                     <h4 className="text-lg font-bold text-slate-900">
                                         {vehicle.serviceStatus === 'OK' ? 'Healthy' : vehicle.serviceStatus}
                                     </h4>
                                 </div>
                             </div>
                             {vehicle.serviceStatus !== 'OK' && (
                                 <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                                     Action Required: {vehicle.nextServiceType}
                                 </p>
                             )}
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
                                  {format(new Date(vehicle.nextServiceDate || Date.now()), 'MMM d, yyyy')}
                              </h3>
                              <p className="text-xs text-slate-400 mt-1">
                                  {vehicle.daysToService} days remaining
                              </p>
                          </CardContent>
                      </Card>

                      {/* Log Service Action */}
                      <Dialog open={isLogServiceOpen} onOpenChange={setIsLogServiceOpen}>
                          <DialogTrigger asChild>
                              <Button className="w-full bg-indigo-600 hover:bg-indigo-700">
                                  <Plus className="h-4 w-4 mr-2" />
                                  Log New Service
                              </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-[425px]">
                              <DialogHeader>
                                  <DialogTitle>Log Vehicle Service</DialogTitle>
                                  <DialogDescription>
                                      Record a new maintenance event for {vehicle.licensePlate}.
                                  </DialogDescription>
                              </DialogHeader>
                              <div className="grid gap-4 py-4">
                                  <div className="grid grid-cols-4 items-center gap-4">
                                      <Label htmlFor="date" className="text-right">
                                          Date
                                      </Label>
                                      <Input id="date" type="date" className="col-span-3" />
                                  </div>
                                  <div className="grid grid-cols-4 items-center gap-4">
                                      <Label htmlFor="type" className="text-right">
                                          Type
                                      </Label>
                                      <Select>
                                          <SelectTrigger className="col-span-3">
                                              <SelectValue placeholder="Select service type" />
                                          </SelectTrigger>
                                          <SelectContent>
                                              <SelectItem value="oil">Oil Change</SelectItem>
                                              <SelectItem value="tires">Tire Service</SelectItem>
                                              <SelectItem value="brake">Brakes</SelectItem>
                                              <SelectItem value="inspection">General Inspection</SelectItem>
                                          </SelectContent>
                                      </Select>
                                  </div>
                                  <div className="grid grid-cols-4 items-center gap-4">
                                      <Label htmlFor="cost" className="text-right">
                                          Cost ($)
                                      </Label>
                                      <Input id="cost" type="number" className="col-span-3" placeholder="0.00" />
                                  </div>
                                  <div className="grid grid-cols-4 items-center gap-4">
                                      <Label htmlFor="odo" className="text-right">
                                          Odometer
                                      </Label>
                                      <Input id="odo" type="number" className="col-span-3" defaultValue={vehicle.metrics.odometer} />
                                  </div>
                                  <div className="grid grid-cols-4 items-center gap-4">
                                      <Label htmlFor="notes" className="text-right">
                                          Notes
                                      </Label>
                                      <Input id="notes" className="col-span-3" placeholder="Mechanic notes..." />
                                  </div>
                              </div>
                              <DialogFooter>
                                  <Button type="submit" onClick={() => setIsLogServiceOpen(false)}>Save Log</Button>
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
                                      <div className="absolute left-[-5px] top-1 h-2.5 w-2.5 rounded-full bg-slate-300 ring-4 ring-white"></div>
                                      
                                      <div className="flex justify-between items-start mb-1">
                                          <div>
                                              <h4 className="text-sm font-semibold text-slate-900">{item.type}</h4>
                                              <p className="text-xs text-slate-500">{format(new Date(item.date), 'MMMM d, yyyy')}</p>
                                          </div>
                                          <Badge variant="outline" className="text-slate-600">
                                              ${item.cost}
                                          </Badge>
                                      </div>
                                      
                                      <div className="bg-slate-50 p-3 rounded-md mt-2 text-sm">
                                          <div className="flex justify-between text-slate-500 mb-1">
                                              <span className="flex items-center gap-1">
                                                  <MapPin className="h-3 w-3" /> {item.provider}
                                              </span>
                                              <span className="flex items-center gap-1">
                                                  <Activity className="h-3 w-3" /> {item.odo.toLocaleString()} km
                                              </span>
                                          </div>
                                          {item.notes && (
                                              <p className="text-slate-600 italic border-t border-slate-200 pt-2 mt-2">
                                                  "{item.notes}"
                                              </p>
                                          )}
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </CardContent>
                  </Card>

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