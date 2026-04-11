import React, { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { 
    Wrench, 
    Calendar, 
    DollarSign, 
    FileText, 
    Plus, 
    Search, 
    Filter, 
    MoreVertical, 
    CheckCircle2, 
    AlertTriangle, 
    Clock, 
    Receipt,
    Loader2,
    Eye,
    Trash2,
    Upload,
    Scan,
    ArrowLeft,
    ChevronRight,
    ArrowRight
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Checkbox } from '../ui/checkbox';
import { toast } from 'sonner@2.0.3';
import { api } from '../../services/api';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { API_ENDPOINTS } from '../../services/apiConfig';
import type { CatalogMaintenanceTaskOption } from '../../types/maintenance';

// --- Constants ---

const MAINTENANCE_SCHEDULES = [
    {
        id: 'A',
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
    {
        id: 'B',
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
    {
        id: 'C',
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
    {
        id: 'D',
        label: "Long-Term Service (Every 100,000 km)",
        interval: 100000,
        items: [
            "Replace Spark Plugs (Iridium)",
            "Flush Radiator Coolant"
        ]
    }
];

const INSPECTION_ITEMS = [
    "Flush Coolant", "Transmission Service",
    "Wheel Alignment", "Rotate/Balance Tires",
    "Replace Tires", "Replace Wipers",
    "Replace Battery", "Suspension Repair",
    "Steering System Repair", "Exhaust System Repair",
    "AC Service", "Brake Service"
];

export interface MaintenanceLog {
    id: string;
    vehicleId: string;
    date: string;
    type: string;
    /** When set, server advances `vehicle_maintenance_schedule` for this template. */
    templateId?: string;
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
    invoiceUrl?: string; // URL to the uploaded invoice image
    status?: 'Scheduled' | 'Completed' | 'In Progress';
}

interface MaintenanceManagerProps {
    vehicleId: string;
    logs: MaintenanceLog[];
    maintenanceStatus: {
        status: string;
        nextTypeLabel: string;
        daysToService: number;
        nextOdo: number;
        remainingKm: number;
    };
    /** Super Admin templates for this vehicle's catalog match — drives checklist + `templateId` on save. */
    catalogTemplates?: CatalogMaintenanceTaskOption[];
    onRefresh: () => void;
}

const MaintenanceManagerComponent: React.FC<MaintenanceManagerProps> = ({ 
    vehicleId, 
    logs = [], 
    maintenanceStatus = {
        status: 'Unknown',
        nextTypeLabel: 'Service',
        daysToService: 0,
        nextOdo: 0,
        remainingKm: 0
    }, 
    catalogTemplates = [],
    onRefresh 
}) => {
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [selectedLog, setSelectedLog] = useState<MaintenanceLog | null>(null);
    const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
    
    // Form State
    const [step, setStep] = useState<1 | 2>(1);
    const [isLoading, setIsLoading] = useState(false);
    const [scanLoading, setScanLoading] = useState(false);
    
    const [formData, setFormData] = useState<Partial<MaintenanceLog>>({
        date: new Date().toISOString().split('T')[0],
        type: 'Regular Maintenance',
        status: 'Completed',
        cost: 0,
        odo: 0,
        provider: '',
        notes: '',
        invoiceUrl: '',
        checklist: [],
        itemCosts: {},
        inspectionResults: {
            issues: [],
            notes: ''
        }
    });

    const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
    const [checklistItems, setChecklistItems] = useState<string[]>([]);

    const scheduleChoices = useMemo(() => {
        if (catalogTemplates.length > 0) {
            return catalogTemplates.map((t) => ({
                id: t.templateId,
                label: t.label,
                items: t.checklistLines,
                templateId: t.templateId as string | undefined,
            }));
        }
        return MAINTENANCE_SCHEDULES.map((s) => ({
            id: s.id,
            label: s.label,
            items: s.items,
            templateId: undefined as string | undefined,
        }));
    }, [catalogTemplates]);

    // Update checklist items when schedule changes
    useEffect(() => {
        if (selectedScheduleId) {
            const schedule = scheduleChoices.find((s) => s.id === selectedScheduleId);
            if (schedule) {
                const newItems = schedule.items;
                setChecklistItems(newItems);
                
                // Auto-check schedule items
                setFormData(prev => ({
                    ...prev,
                    checklist: [...new Set([...(prev.checklist || []), ...newItems])],
                    ...(schedule.templateId
                        ? { type: schedule.label }
                        : {}),
                }));
            }
        }
    }, [selectedScheduleId, scheduleChoices]);

    const handleServiceScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
  
        setScanLoading(true);
        try {
            // 1. Upload the file to get a URL
            let uploadedUrl = '';
            try {
                const uploadRes = await api.uploadFile(file);
                if (uploadRes && uploadRes.url) {
                    uploadedUrl = uploadRes.url;
                }
            } catch (err) {
                console.warn("Upload failed, proceeding with parsing only", err);
            }

            // 2. Parse the invoice
            const scanFormData = new FormData();
            scanFormData.append('file', file);
            
            const response = await fetch(`${API_ENDPOINTS.ai}/parse-invoice`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${publicAnonKey}` },
                body: scanFormData
            });
            
            const result = await response.json();
            
            if (result.success && result.data) {
                 setFormData(prev => ({
                     ...prev,
                     date: result.data.date || prev.date,
                     type: result.data.type || 'Regular Maintenance', 
                     cost: result.data.cost ? Number(result.data.cost) : prev.cost,
                     odo: result.data.odometer ? Number(result.data.odometer) : prev.odo,
                     notes: result.data.notes || prev.notes,
                     provider: result.data.vendor || prev.provider,
                     invoiceUrl: uploadedUrl || prev.invoiceUrl
                 }));
                 toast.success("Invoice scanned successfully!");
            } else {
                 toast.error("Failed to extract data from invoice");
            }
        } catch (err) {
            console.error(err);
            toast.error("Error scanning invoice");
        } finally {
            setScanLoading(false);
        }
    };

    const handleSave = async () => {
        if (!formData.date || !formData.type) {
            toast.error("Please fill in required fields");
            return;
        }

        setIsLoading(true);
        try {
            const choice = scheduleChoices.find((s) => s.id === selectedScheduleId);
            const payload = {
                ...formData,
                vehicleId,
                id: formData.id || crypto.randomUUID(),
                cost: Number(formData.cost) || 0,
                odo: Number(formData.odo) || 0,
                ...(choice?.templateId
                    ? { templateId: choice.templateId, type: choice.label }
                    : {}),
            };

            await api.saveMaintenanceLog(payload);
            toast.success("Service log saved");
            setIsAddDialogOpen(false);
            onRefresh();
        } catch (error) {
            console.error(error);
            toast.error("Failed to save service log");
        } finally {
            setIsLoading(false);
        }
    };

    const openAddDialog = () => {
        setFormData({
            date: new Date().toISOString().split('T')[0],
            type: 'Regular Maintenance',
            status: 'Completed',
            cost: 0,
            odo: 0,
            provider: '',
            notes: '',
            invoiceUrl: '',
            checklist: [],
            itemCosts: {},
            inspectionResults: {
                issues: [],
                notes: ''
            }
        });
        setStep(1);
        const first = scheduleChoices[0];
        setSelectedScheduleId(first?.id ?? '');
        setChecklistItems(first?.items ?? MAINTENANCE_SCHEDULES[0].items);
        setIsAddDialogOpen(true);
    };

    const openViewDialog = (log: MaintenanceLog) => {
        setSelectedLog(log);
        setIsViewDialogOpen(true);
    };

    const handleChecklistToggle = (item: string) => {
        setFormData(prev => {
            const currentList = prev.checklist || [];
            if (currentList.includes(item)) {
                return { ...prev, checklist: currentList.filter(i => i !== item) };
            } else {
                return { ...prev, checklist: [...currentList, item] };
            }
        });
    };

    const handleCostChange = (item: string, field: 'material' | 'labor', value: string) => {
        const numValue = parseFloat(value) || 0;
        setFormData(prev => ({
            ...prev,
            itemCosts: {
                ...prev.itemCosts,
                [item]: {
                    ...(prev.itemCosts?.[item] || { material: 0, labor: 0 }),
                    [field]: numValue
                }
            }
        }));
    };

    const handleInspectionIssueToggle = (issue: string) => {
        setFormData(prev => {
            const currentIssues = prev.inspectionResults?.issues || [];
            const newIssues = currentIssues.includes(issue) 
                ? currentIssues.filter(i => i !== issue)
                : [...currentIssues, issue];
            
            return {
                ...prev,
                inspectionResults: {
                    ...(prev.inspectionResults || { notes: '' }),
                    issues: newIssues
                }
            };
        });
    };

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-gradient-to-br from-white to-slate-50 border-slate-200">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500">Service Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-3 mb-2">
                            <div className={
                                maintenanceStatus.status === 'Due Soon' ? "bg-amber-100 p-2 rounded-full text-amber-600" :
                                maintenanceStatus.status === 'Overdue' ? "bg-red-100 p-2 rounded-full text-red-600" :
                                "bg-emerald-100 p-2 rounded-full text-emerald-600"
                            }>
                                {maintenanceStatus.status === 'Overdue' ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                            </div>
                            <h4 className="text-2xl font-bold text-slate-900">{maintenanceStatus.status}</h4>
                        </div>
                        <p className="text-sm text-slate-600">
                            Due in <span className="font-semibold">{maintenanceStatus.daysToService} days</span> ({maintenanceStatus.remainingKm.toLocaleString()} km)
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500">Next Scheduled Service</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                                <Calendar className="h-5 w-5" />
                            </div>
                            <h4 className="text-xl font-bold text-slate-900">{maintenanceStatus.nextTypeLabel}</h4>
                        </div>
                        <p className="text-sm text-slate-600">
                            Target: <span className="font-mono bg-slate-100 px-1 rounded">{maintenanceStatus.nextOdo.toLocaleString()} km</span>
                        </p>
                    </CardContent>
                </Card>

                <Card className="flex flex-col justify-center items-center p-6 border-dashed border-2 bg-slate-50/50 hover:bg-slate-50 transition-colors cursor-pointer group" onClick={openAddDialog}>
                     <div className="bg-indigo-100 p-3 rounded-full text-indigo-600 mb-3 group-hover:scale-110 transition-transform">
                         <Plus className="h-6 w-6" />
                     </div>
                     <h4 className="font-semibold text-indigo-700">Log New Service</h4>
                     <p className="text-xs text-slate-500 text-center mt-1">Record maintenance, repairs, or inspections</p>
                </Card>
            </div>

            {/* Maintenance History */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Maintenance History</CardTitle>
                        <CardDescription>Record of all services performed on this vehicle</CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Service Type</TableHead>
                                <TableHead>Provider</TableHead>
                                <TableHead>Odometer</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Cost</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {logs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center h-32 text-muted-foreground">
                                        No maintenance logs found. Click "Log New Service" to add one.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                logs.map((log) => (
                                    <TableRow key={log.id} className="group">
                                        <TableCell className="font-medium">{format(new Date(log.date), 'MMM d, yyyy')}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="capitalize">{log.type}</Badge>
                                                {log.invoiceUrl && <Receipt className="h-3 w-3 text-slate-400" />}
                                            </div>
                                        </TableCell>
                                        <TableCell>{log.provider || '-'}</TableCell>
                                        <TableCell>{log.odo.toLocaleString()} km</TableCell>
                                        <TableCell>
                                            <Badge variant={log.status === 'Completed' ? 'default' : 'secondary'} className={
                                                log.status === 'Completed' ? "bg-green-100 text-green-700 hover:bg-green-100 shadow-none" : ""
                                            }>
                                                {log.status || 'Completed'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-semibold">
                                            ${log.cost.toLocaleString()}
                                        </TableCell>
                                        <TableCell>
                                            <Button variant="ghost" size="icon" onClick={() => openViewDialog(log)}>
                                                <Eye className="h-4 w-4 text-slate-400 hover:text-indigo-600" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Add Service Dialog (Multi-Step Wizard) */}
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogContent className="sm:max-w-[900px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
                    <DialogHeader className="px-6 py-4 border-b">
                        <DialogTitle>{step === 1 ? 'Edit Service Log' : 'Inspection Results'}</DialogTitle>
                        <DialogDescription>
                            {step === 1 ? 'Update maintenance details.' : 'Record detailed findings and recommendations.'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto px-6 py-6">
                        {step === 1 ? (
                            <div className="space-y-6">
                                {/* Scan Invoice Area */}
                                <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center bg-slate-50 relative group hover:bg-slate-100 transition-colors">
                                    <Input 
                                        type="file" 
                                        accept="image/*,.pdf"
                                        onChange={handleServiceScan}
                                        disabled={scanLoading}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    />
                                    <div className="bg-white p-3 rounded-xl shadow-sm mb-3">
                                        {scanLoading ? <Loader2 className="w-6 h-6 animate-spin text-indigo-600" /> : <Scan className="w-6 h-6 text-indigo-600" />}
                                    </div>
                                    <h3 className="font-semibold text-slate-900">Scan Invoice / Receipt</h3>
                                    <p className="text-sm text-slate-500">Upload image or PDF to auto-fill</p>
                                    {formData.invoiceUrl && (
                                        <div className="absolute top-4 right-4 bg-emerald-100 text-emerald-700 text-xs px-2 py-1 rounded flex items-center">
                                            <CheckCircle2 className="w-3 h-3 mr-1" /> Uploaded
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label>Date</Label>
                                        <Input 
                                            type="date" 
                                            value={formData.date}
                                            onChange={e => setFormData({...formData, date: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Type</Label>
                                        <Select 
                                            value={formData.type} 
                                            onValueChange={val => setFormData({...formData, type: val})}
                                        >
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Regular Maintenance">Regular Maintenance</SelectItem>
                                                <SelectItem value="Oil Change">Oil Change</SelectItem>
                                                <SelectItem value="Tire Service">Tire Service</SelectItem>
                                                <SelectItem value="Repair">Repair</SelectItem>
                                                <SelectItem value="Inspection">Inspection</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Service Schedule</Label>
                                    <Select 
                                        value={selectedScheduleId} 
                                        onValueChange={setSelectedScheduleId}
                                    >
                                        <SelectTrigger className="bg-slate-50 border-slate-200">
                                            <SelectValue placeholder="Select maintenance schedule..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {scheduleChoices.map((s) => (
                                                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    <div className="border rounded-lg p-4 bg-white flex flex-col h-[300px]">
                                        <div className="flex justify-between items-center mb-3">
                                            <Label className="text-sm font-semibold">Checklist Items</Label>
                                            <span className="text-xs text-slate-400">
                                                {formData.checklist?.length || 0}/{checklistItems.length}
                                            </span>
                                        </div>
                                        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                                            {checklistItems.map((item, idx) => {
                                                const isChecked = formData.checklist?.includes(item);
                                                return (
                                                    <div key={idx} className={`p-3 rounded-md border transition-all ${isChecked ? 'border-indigo-200 bg-indigo-50/50' : 'border-transparent hover:bg-slate-50'}`}>
                                                        <div className="flex items-start gap-3">
                                                            <Checkbox 
                                                                id={`item-${idx}`} 
                                                                checked={isChecked}
                                                                onCheckedChange={() => handleChecklistToggle(item)}
                                                            />
                                                            <div className="flex-1">
                                                                <Label htmlFor={`item-${idx}`} className="text-sm font-medium cursor-pointer leading-tight block mb-1">
                                                                    {item}
                                                                </Label>
                                                                
                                                                {isChecked && (
                                                                    <div className="flex gap-2 mt-2 animate-in slide-in-from-top-1 fade-in">
                                                                        <div className="relative flex-1">
                                                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">Mat ($)</span>
                                                                            <Input 
                                                                                className="h-7 text-xs pl-12 bg-white" 
                                                                                placeholder="0.00"
                                                                                value={formData.itemCosts?.[item]?.material || ''}
                                                                                onChange={(e) => handleCostChange(item, 'material', e.target.value)}
                                                                            />
                                                                        </div>
                                                                        <div className="relative flex-1">
                                                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">Lab ($)</span>
                                                                            <Input 
                                                                                className="h-7 text-xs pl-12 bg-white" 
                                                                                placeholder="0.00"
                                                                                value={formData.itemCosts?.[item]?.labor || ''}
                                                                                onChange={(e) => handleCostChange(item, 'labor', e.target.value)}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="flex flex-col h-[300px]">
                                        <Label className="mb-2 font-semibold">Notes & Observations</Label>
                                        <Textarea 
                                            className="flex-1 resize-none bg-slate-50 border-slate-200"
                                            placeholder="Pre-inspection performed. Engine service performed..."
                                            value={formData.notes}
                                            onChange={e => setFormData({...formData, notes: e.target.value})}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label>Total Cost ($)</Label>
                                        <Input 
                                            type="number" 
                                            value={formData.cost || ''}
                                            onChange={e => setFormData({...formData, cost: parseFloat(e.target.value)})}
                                            className="bg-slate-50 font-medium"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Odometer (km)</Label>
                                        <Input 
                                            type="number" 
                                            value={formData.odo || ''}
                                            onChange={e => setFormData({...formData, odo: parseFloat(e.target.value)})}
                                            className="bg-slate-50 font-medium"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Service Provider</Label>
                                    <Input 
                                        value={formData.provider}
                                        onChange={e => setFormData({...formData, provider: e.target.value})}
                                        placeholder="e.g. Whole-Heated Car Service LTD"
                                        className="bg-slate-50"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex items-start gap-3">
                                    <div className="bg-blue-100 p-2 rounded-full text-blue-600 mt-0.5">
                                        <Scan className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-blue-900 text-sm">Inspection Report</h4>
                                        <p className="text-xs text-blue-700 mt-1">
                                            Select items that require attention or repair. These will be flagged in the vehicle history.
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <Label className="font-semibold">Action Items (Needs Attention)</Label>
                                    <div className="border rounded-lg p-4 max-h-[300px] overflow-y-auto bg-white">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {INSPECTION_ITEMS.map((item, idx) => (
                                                <div key={idx} className="flex items-center space-x-2">
                                                    <Checkbox 
                                                        id={`inspect-${idx}`} 
                                                        checked={formData.inspectionResults?.issues.includes(item)}
                                                        onCheckedChange={() => handleInspectionIssueToggle(item)}
                                                    />
                                                    <label 
                                                        htmlFor={`inspect-${idx}`} 
                                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                                    >
                                                        {item}
                                                    </label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <Label className="font-semibold">Detailed Observations</Label>
                                    <Textarea 
                                        className="h-32 bg-slate-50 border-slate-200"
                                        placeholder="Enter detailed inspection findings, measurements (e.g., brake pad thickness), or specific recommendations..."
                                        value={formData.inspectionResults?.notes}
                                        onChange={e => setFormData({
                                            ...formData, 
                                            inspectionResults: { 
                                                ...(formData.inspectionResults || { issues: [] }), 
                                                notes: e.target.value 
                                            }
                                        })}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="px-6 py-4 border-t bg-slate-50/50">
                        <Button variant="ghost" onClick={() => step === 1 ? setIsAddDialogOpen(false) : setStep(1)} className="mr-auto">
                            {step === 1 ? 'Cancel' : (
                                <>
                                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                                </>
                            )}
                        </Button>
                        
                        {step === 1 ? (
                            <>
                                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                                <Button onClick={() => setStep(2)} className="bg-slate-900 text-white hover:bg-slate-800">
                                    Next <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                                <Button onClick={handleSave} disabled={isLoading} className="bg-slate-900 text-white hover:bg-slate-800">
                                    {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                    Save Log
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* View Details Dialog */}
            <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>Service Details</DialogTitle>
                        <DialogDescription>
                            {selectedLog?.date && format(new Date(selectedLog.date), 'MMMM d, yyyy')} • {selectedLog?.type}
                        </DialogDescription>
                    </DialogHeader>
                    
                    {selectedLog && (
                        <div className="grid gap-6 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-slate-500 text-xs uppercase tracking-wide">Cost</Label>
                                    <p className="text-2xl font-bold text-slate-900">${selectedLog.cost.toLocaleString()}</p>
                                </div>
                                <div>
                                    <Label className="text-slate-500 text-xs uppercase tracking-wide">Odometer</Label>
                                    <p className="text-xl font-medium text-slate-900">{selectedLog.odo.toLocaleString()} km</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-slate-500 text-xs uppercase tracking-wide">Provider</Label>
                                    <p className="font-medium">{selectedLog.provider || 'N/A'}</p>
                                </div>
                                <div>
                                    <Label className="text-slate-500 text-xs uppercase tracking-wide">Status</Label>
                                    <Badge className="mt-1">{selectedLog.status || 'Completed'}</Badge>
                                </div>
                            </div>

                            {selectedLog.checklist && selectedLog.checklist.length > 0 && (
                                <div>
                                    <Label className="text-slate-500 text-xs uppercase tracking-wide">Checklist Items</Label>
                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                        {selectedLog.checklist.map((item, i) => (
                                            <div key={i} className="flex items-center text-sm">
                                                <CheckCircle2 className="w-3 h-3 text-emerald-500 mr-2" />
                                                {item}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selectedLog.notes && (
                                <div>
                                    <Label className="text-slate-500 text-xs uppercase tracking-wide">Notes</Label>
                                    <div className="mt-1 p-3 bg-slate-50 rounded-md text-sm border border-slate-100">
                                        {selectedLog.notes}
                                    </div>
                                </div>
                            )}

                            {selectedLog.invoiceUrl && (
                                <div>
                                    <Label className="text-slate-500 text-xs uppercase tracking-wide">Receipt / Invoice</Label>
                                    <div className="mt-2 rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
                                        <img src={selectedLog.invoiceUrl} alt="Receipt" className="w-full h-auto max-h-[300px] object-contain" />
                                        <div className="p-2 bg-white border-t border-slate-100 flex justify-end">
                                            <Button variant="ghost" size="sm" asChild>
                                                <a href={selectedLog.invoiceUrl} target="_blank" rel="noopener noreferrer">
                                                    <Eye className="w-4 h-4 mr-2" /> Open Full Image
                                                </a>
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    
                    <DialogFooter>
                        <Button onClick={() => setIsViewDialogOpen(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export const MaintenanceManager = React.memo(MaintenanceManagerComponent);
