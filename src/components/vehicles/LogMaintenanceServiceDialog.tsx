import React, { useState, useEffect, useMemo } from "react";
import {
  CheckCircle2,
  Loader2,
  Scan,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { toast } from "sonner@2.0.3";
import { api } from "../../services/api";
import { publicAnonKey } from "../../utils/supabase/info";
import { API_ENDPOINTS } from "../../services/apiConfig";
import type { CatalogMaintenanceTaskOption, MaintenanceLog } from "../../types/maintenance";
import { MAINTENANCE_SCHEDULE_PRESETS } from "../../constants/maintenanceSchedulePresets";

const MAINTENANCE_SCHEDULES = MAINTENANCE_SCHEDULE_PRESETS.map((p) => ({
  id: p.id,
  label: p.label,
  interval: p.interval_miles,
  items: p.items,
}));

const INSPECTION_ITEMS = [
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
  "Brake Service",
];

export interface LogMaintenanceServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  catalogTemplates: CatalogMaintenanceTaskOption[];
  /** Prefill odometer (e.g. fleet canonical reading). */
  defaultOdo?: number;
  onSaved?: () => void;
}

export function LogMaintenanceServiceDialog({
  open,
  onOpenChange,
  vehicleId,
  catalogTemplates,
  defaultOdo,
  onSaved,
}: LogMaintenanceServiceDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);

  const [formData, setFormData] = useState<Partial<MaintenanceLog>>({
    date: new Date().toISOString().split("T")[0],
    type: "Regular Maintenance",
    status: "Completed",
    cost: 0,
    odo: 0,
    provider: "",
    notes: "",
    invoiceUrl: "",
    checklist: [],
    itemCosts: {},
    inspectionResults: {
      issues: [],
      notes: "",
    },
  });

  const [selectedScheduleId, setSelectedScheduleId] = useState<string>("");
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

  useEffect(() => {
    if (!open) return;
    setFormData({
      date: new Date().toISOString().split("T")[0],
      type: "Regular Maintenance",
      status: "Completed",
      cost: 0,
      odo: defaultOdo != null && Number.isFinite(defaultOdo) ? defaultOdo : 0,
      provider: "",
      notes: "",
      invoiceUrl: "",
      checklist: [],
      itemCosts: {},
      inspectionResults: {
        issues: [],
        notes: "",
      },
    });
    setStep(1);
    const first = scheduleChoices[0];
    setSelectedScheduleId(first?.id ?? "");
    setChecklistItems(first?.items ?? MAINTENANCE_SCHEDULES[0].items);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when dialog opens for a vehicle/catalog; scheduleChoices derived from catalogTemplates
  }, [open, vehicleId, defaultOdo, catalogTemplates]);

  useEffect(() => {
    if (selectedScheduleId) {
      const schedule = scheduleChoices.find((s) => s.id === selectedScheduleId);
      if (schedule) {
        const newItems = schedule.items;
        setChecklistItems(newItems);
        setFormData((prev) => ({
          ...prev,
          checklist: [...new Set([...(prev.checklist || []), ...newItems])],
          ...(schedule.templateId ? { type: schedule.label } : {}),
        }));
      }
    }
  }, [selectedScheduleId, scheduleChoices]);

  const handleServiceScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanLoading(true);
    try {
      let uploadedUrl = "";
      try {
        const uploadRes = await api.uploadFile(file);
        if (uploadRes && uploadRes.url) {
          uploadedUrl = uploadRes.url;
        }
      } catch (err) {
        console.warn("Upload failed, proceeding with parsing only", err);
      }

      const scanFormData = new FormData();
      scanFormData.append("file", file);

      const response = await fetch(`${API_ENDPOINTS.ai}/parse-invoice`, {
        method: "POST",
        headers: { Authorization: `Bearer ${publicAnonKey}` },
        body: scanFormData,
      });

      const result = await response.json();

      if (result.success && result.data) {
        setFormData((prev) => ({
          ...prev,
          date: result.data.date || prev.date,
          type: result.data.type || "Regular Maintenance",
          cost: result.data.cost ? Number(result.data.cost) : prev.cost,
          odo: result.data.odometer ? Number(result.data.odometer) : prev.odo,
          notes: result.data.notes || prev.notes,
          provider: result.data.vendor || prev.provider,
          invoiceUrl: uploadedUrl || prev.invoiceUrl,
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
        ...(choice?.templateId ? { templateId: choice.templateId, type: choice.label } : {}),
      };

      await api.saveMaintenanceLog(payload);
      toast.success("Service log saved");
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      console.error(error);
      toast.error("Failed to save service log");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChecklistToggle = (item: string) => {
    setFormData((prev) => {
      const currentList = prev.checklist || [];
      if (currentList.includes(item)) {
        return { ...prev, checklist: currentList.filter((i) => i !== item) };
      }
      return { ...prev, checklist: [...currentList, item] };
    });
  };

  const handleCostChange = (item: string, field: "material" | "labor", value: string) => {
    const numValue = parseFloat(value) || 0;
    setFormData((prev) => ({
      ...prev,
      itemCosts: {
        ...prev.itemCosts,
        [item]: {
          ...(prev.itemCosts?.[item] || { material: 0, labor: 0 }),
          [field]: numValue,
        },
      },
    }));
  };

  const handleInspectionIssueToggle = (issue: string) => {
    setFormData((prev) => {
      const currentIssues = prev.inspectionResults?.issues || [];
      const newIssues = currentIssues.includes(issue)
        ? currentIssues.filter((i) => i !== issue)
        : [...currentIssues, issue];

      return {
        ...prev,
        inspectionResults: {
          ...(prev.inspectionResults || { notes: "" }),
          issues: newIssues,
        },
      };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>{step === 1 ? "Add Service Log" : "Inspection Results"}</DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Record maintenance details for this vehicle."
              : "Record detailed findings and recommendations."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {step === 1 ? (
            <div className="space-y-6">
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center bg-slate-50 relative group hover:bg-slate-100 transition-colors">
                <Input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleServiceScan}
                  disabled={scanLoading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="bg-white p-3 rounded-xl shadow-sm mb-3">
                  {scanLoading ? (
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                  ) : (
                    <Scan className="w-6 h-6 text-indigo-600" />
                  )}
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
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(val) => setFormData({ ...formData, type: val })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
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
                <Select value={selectedScheduleId} onValueChange={setSelectedScheduleId}>
                  <SelectTrigger className="bg-slate-50 border-slate-200">
                    <SelectValue placeholder="Select maintenance schedule..." />
                  </SelectTrigger>
                  <SelectContent>
                    {scheduleChoices.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
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
                        <div
                          key={`${item}-${idx}`}
                          className={`p-3 rounded-md border transition-all ${
                            isChecked ? "border-indigo-200 bg-indigo-50/50" : "border-transparent hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id={`log-item-${vehicleId}-${idx}`}
                              checked={isChecked}
                              onCheckedChange={() => handleChecklistToggle(item)}
                            />
                            <div className="flex-1">
                              <Label
                                htmlFor={`log-item-${vehicleId}-${idx}`}
                                className="text-sm font-medium cursor-pointer leading-tight block mb-1"
                              >
                                {item}
                              </Label>

                              {isChecked && (
                                <div className="flex gap-2 mt-2 animate-in slide-in-from-top-1 fade-in">
                                  <div className="relative flex-1">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                                      Mat ($)
                                    </span>
                                    <Input
                                      className="h-7 text-xs pl-12 bg-white"
                                      placeholder="0.00"
                                      value={formData.itemCosts?.[item]?.material || ""}
                                      onChange={(e) => handleCostChange(item, "material", e.target.value)}
                                    />
                                  </div>
                                  <div className="relative flex-1">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                                      Lab ($)
                                    </span>
                                    <Input
                                      className="h-7 text-xs pl-12 bg-white"
                                      placeholder="0.00"
                                      value={formData.itemCosts?.[item]?.labor || ""}
                                      onChange={(e) => handleCostChange(item, "labor", e.target.value)}
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
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Total Cost ($)</Label>
                  <Input
                    type="number"
                    value={formData.cost || ""}
                    onChange={(e) => setFormData({ ...formData, cost: parseFloat(e.target.value) })}
                    className="bg-slate-50 font-medium"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Odometer (km)</Label>
                  <Input
                    type="number"
                    value={formData.odo || ""}
                    onChange={(e) => setFormData({ ...formData, odo: parseFloat(e.target.value) })}
                    className="bg-slate-50 font-medium"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Service Provider</Label>
                <Input
                  value={formData.provider}
                  onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
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
                      <div key={item} className="flex items-center space-x-2">
                        <Checkbox
                          id={`inspect-${vehicleId}-${idx}`}
                          checked={formData.inspectionResults?.issues.includes(item)}
                          onCheckedChange={() => handleInspectionIssueToggle(item)}
                        />
                        <label
                          htmlFor={`inspect-${vehicleId}-${idx}`}
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
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      inspectionResults: {
                        ...(formData.inspectionResults || { issues: [] }),
                        notes: e.target.value,
                      },
                    })
                  }
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-slate-50/50">
          <Button
            variant="ghost"
            onClick={() => (step === 1 ? onOpenChange(false) : setStep(1))}
            className="mr-auto"
          >
            {step === 1 ? (
              "Cancel"
            ) : (
              <>
                <ArrowLeft className="w-4 h-4 mr-2" /> Back
              </>
            )}
          </Button>

          {step === 1 ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => setStep(2)} className="bg-slate-900 text-white hover:bg-slate-800">
                Next <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isLoading} className="bg-slate-900 text-white hover:bg-slate-800">
                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save Log
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
