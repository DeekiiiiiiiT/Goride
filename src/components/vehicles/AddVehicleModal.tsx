import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Loader2, Upload, FileText, Check, Camera, Car, FileCheck, Sparkles, AlertTriangle, Tag } from 'lucide-react';
import { api } from '../../services/api';
import { toast } from 'sonner@2.0.3';
import { Vehicle } from '../../types/vehicle';
import { cn } from "../ui/utils";
import { convertPdfToImage } from '../../utils/pdf-helper';
import { findMatchingVehicle } from '../../utils/identityMatcher';
import { showCatalogGateToastIfApplicable } from '../../utils/catalogGateErrors';
import { CatalogVariantPicker, type CatalogVariantPickerSource } from './CatalogVariantPicker';
import { CatalogFacetSelect } from './CatalogFacetSelect';
import { useCatalogCandidates } from '../../hooks/useCatalogCandidates';
import { extractChassisPrefix } from '../../utils/chassisPrefix';
import type { VehicleCatalogRecord } from '../../types/vehicleCatalog';

interface AddVehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVehicleAdded: (vehicle: Vehicle) => void;
  existingVehicles?: Vehicle[];
}

const FileUploadZone = ({ 
    label, 
    file, 
    onFileSelect, 
    accept = "image/*,.pdf",
    icon: Icon = Upload,
    required = false,
    className,
    uploadLabel = "Upload File",
    scanLabel = "Scan / Photo"
}: { 
    label: string, 
    file: File | null, 
    onFileSelect: (f: File) => void,
    accept?: string,
    icon?: any,
    required?: boolean,
    className?: string,
    uploadLabel?: string,
    scanLabel?: string
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    // Helper to render hidden inputs safely
    const renderHiddenInputs = () => (
        <>
            <input 
                ref={inputRef}
                type="file" 
                className="hidden" 
                accept={accept}
                onChange={(e) => {
                    if (e.target.files?.[0]) onFileSelect(e.target.files[0]);
                    e.target.value = '';
                }}
            />
            <input 
                ref={cameraInputRef}
                type="file" 
                className="hidden" 
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                    if (e.target.files?.[0]) onFileSelect(e.target.files[0]);
                    e.target.value = '';
                }}
            />
        </>
    );

    if (file) {
        return (
             <div className={cn("space-y-2", className)}>
                <Label className={cn("text-xs font-medium uppercase text-slate-500", required && "after:content-['*'] after:ml-0.5 after:text-red-500")}>
                    {label}
                </Label>
                <div 
                    className="border-2 border-dashed border-emerald-500 bg-emerald-50/50 rounded-lg p-4 flex flex-col items-center justify-center text-center gap-2 h-32 cursor-pointer transition-colors hover:bg-emerald-100/50" 
                    onClick={() => inputRef.current?.click()}
                >
                    {renderHiddenInputs()}
                    <div className="bg-emerald-100 p-2 rounded-full">
                        <Check className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div className="text-sm font-medium text-emerald-900 w-full truncate px-2">
                        {file.name}
                    </div>
                    <div className="text-xs text-emerald-600 font-medium">Click to change</div>
                </div>
            </div>
        )
    }

    return (
        <div className={cn("space-y-2", className)}>
            <Label className={cn("text-xs font-medium uppercase text-slate-500", required && "after:content-['*'] after:ml-0.5 after:text-red-500")}>
                {label}
            </Label>
            
            {renderHiddenInputs()}

            <div className="flex flex-col gap-2">
                {/* Primary: Scan Camera */}
                <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); cameraInputRef.current?.click(); }}
                    className="flex flex-col items-center justify-center gap-2 h-24 bg-white hover:bg-slate-50 border-2 border-slate-200 hover:border-slate-900 border-dashed rounded-xl transition-all text-slate-700 group shadow-sm hover:shadow-md"
                >
                    <div className="bg-slate-50 p-2 rounded-full group-hover:bg-slate-900 group-hover:text-white transition-colors">
                        <Camera className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-semibold">{scanLabel}</span>
                </button>

                {/* Secondary: Upload File */}
                <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); inputRef.current?.click(); }}
                    className="flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200"
                >
                    <Icon className="h-3.5 w-3.5" />
                    {uploadLabel}
                </button>
            </div>
        </div>
    );
};

export function AddVehicleModal({ isOpen, onClose, onVehicleAdded, existingVehicles = [] }: AddVehicleModalProps) {
  const [step, setStep] = useState(1); // 1 = Upload docs, 2 = Verify Details
  /** Step 1: fitness upload → parse review → registration upload → combined verify. */
  const [uploadSubStep, setUploadSubStep] = useState<"fitness" | "fitness_review" | "registration">("fitness");
  /**
   * Step 2: switch between registration, fitness, and the new "motor type"
   * (catalog variant) field editors. The catalog tab hosts CatalogVariantPicker.
   */
  const [verifyDocTab, setVerifyDocTab] = useState<"registration" | "fitness" | "catalog">("registration");
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [fitnessFile, setFitnessFile] = useState<File | null>(null);
  const [registrationFile, setRegistrationFile] = useState<File | null>(null);

  // Default status is 'Inactive' — the server will force Inactive anyway when
  // there is no catalog match (the "parked until matched" rule). The operator
  // can flip to Active from VehicleDetail once the platform has approved the
  // catalog entry.
  const [formData, setFormData] = useState({
    // Common
    status: 'Inactive',
    
    // Fitness Certificate Fields
    make: '',
    model: '',
    year: new Date().getFullYear().toString(),
    color: '',
    bodyType: '',
    engineNumber: '',
    ccRating: '',
    fitnessIssueDate: '',
    fitnessExpiryDate: '',

    // Registration Certificate Fields
    laNumber: '',
    licensePlate: '',
    mvid: '',
    vin: '',
    controlNumber: '',
    registrationIssueDate: '',
    registrationExpiryDate: '',

    // Hybrid catalog matching disambiguators (collected on the new "motor type"
    // tab). Sent both to the matches endpoint and stamped on the vehicle so
    // the server-side resolver picks the same row when the user has not
    // explicitly selected a candidate.
    trim: '',
    /** 1-12; narrows production span when same MMY has facelift / mid-cycle changes. */
    productionMonth: '',
    drivetrain: '',
    transmission: '',
    fuelType: '',
    /** OEM chassis / frame index prefix (e.g. M900A); seeded from VIN/chassisNo on scan. */
    chassis: '',
  });

  /**
   * Catalog row picked (or auto-picked) by CatalogVariantPicker. We stamp
   * vehicle_catalog_id + hints from this row before posting to the server so
   * the resolver can confirm the match deterministically and the pending
   * queue (when 0 matches) gets the richest possible payload.
   */
  const [selectedCatalogRow, setSelectedCatalogRow] = useState<VehicleCatalogRecord | null>(null);
  const [catalogPickerSource, setCatalogPickerSource] = useState<CatalogVariantPickerSource | null>(null);

  const handleCatalogPickerChange = React.useCallback(
    (row: VehicleCatalogRecord | null, source: CatalogVariantPickerSource) => {
      setSelectedCatalogRow(row);
      setCatalogPickerSource(source);
    },
    [],
  );

  /**
   * When the picker is in force-pick mode (2+ candidates) we must block save
   * until the operator chooses a row. Auto-match (1) and no-match (0) are
   * both fine to save — the server gates operational use either way.
   */
  const catalogSaveBlocked = catalogPickerSource === "pending";

  // Single source of truth for the DB-backed dropdowns on the "Motor type"
  // tab. Anchors are make + model + year + chassis prefix.
  const { facets: catalogFacets, loading: catalogFacetsLoading } = useCatalogCandidates({
    make: formData.make,
    model: formData.model,
    year: formData.year,
    chassis: formData.chassis,
  });

  const matchedVehicle = React.useMemo(() => {
      if (!formData.licensePlate) return null;
      return findMatchingVehicle({
          licensePlate: formData.licensePlate
      }, existingVehicles);
  }, [formData.licensePlate, existingVehicles]);

  const formatDateForInput = (dateStr: string | undefined | null): string => {
      if (!dateStr) return '';
      let dStr = dateStr.trim();
      
      // Already YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return dStr;
      
      // Handle DD/MM/YYYY or DD-MM-YYYY
      if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(dStr)) {
          const parts = dStr.split(/[\/-]/);
          const day = parts[0].padStart(2, '0');
          const month = parts[1].padStart(2, '0');
          const year = parts[2];
          return `${year}-${month}-${day}`;
      }

      // Try parsing standard formats
      const date = new Date(dStr);
      if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
      }
      return '';
  };

  const scanDocument = async (file: File, type: 'vehicle_registration' | 'fitness_certificate') => {
      try {
          const res = await api.parseDocument(file, type);
          return res.success ? res.data : null;
      } catch (e: any) {
          // Check for PDF text extraction failure (scanned PDF)
          const isPdf = file.type === 'application/pdf';
          const isExtractionError = e.message && (
             e.message.includes('Could not extract text') || 
             e.message.includes('scanned image') ||
             e.message.includes('upload a JPEG/PNG') ||
             e.message.includes('Invalid MIME type') ||
             e.message.includes('Only image types are supported')
          );

          if (isPdf && isExtractionError) {
              console.log("Scanned PDF detected. Converting to image...");
              toast.info("Scanned PDF detected. Converting to image for AI analysis...");
              
              try {
                  const imageFile = await convertPdfToImage(file);
                  if (imageFile) {
                      const res2 = await api.parseDocument(imageFile, type);
                      return res2.success ? res2.data : null;
                  }
              } catch (conversionError) {
                  console.error("PDF Rasterization failed:", conversionError);
              }
          }

          console.error(`Error scanning ${type}:`, e);
          toast.error(e.message || `Failed to scan ${type.replace('_', ' ')}`);
          return null;
      }
  };

  /** Parse fitness only; then show fitness_review before registration. */
  const handleParseFitnessClick = async () => {
      if (!fitnessFile) {
          toast.error("Please upload your Certificate of Fitness.");
          return;
      }
      setIsScanning(true);
      let newData = { ...formData };
      const data = await scanDocument(fitnessFile, "fitness_certificate");
      console.log("Fitness Scan Result:", data);
      if (data) {
          // Backup chassis source: fitness certificate's "Chassis No." field
          // (server prompt extracts it as `chassisNo`). Used only when the
          // registration scan hasn't populated chassis yet.
          const fitnessChassisRaw = (data as { chassisNo?: unknown; vin?: unknown }).chassisNo
              ?? (data as { chassisNo?: unknown; vin?: unknown }).vin
              ?? "";
          newData = {
              ...newData,
              make: data.make != null ? String(data.make) : newData.make,
              model: data.model != null ? String(data.model) : newData.model,
              year: data.year != null ? String(data.year) : newData.year,
              color: data.color != null ? String(data.color) : newData.color,
              bodyType: data.bodyType != null ? String(data.bodyType) : newData.bodyType,
              engineNumber: data.engineNumber != null ? String(data.engineNumber) : newData.engineNumber,
              ccRating: data.ccRating != null ? String(data.ccRating) : newData.ccRating,
              fitnessIssueDate: formatDateForInput(data.issueDate) || newData.fitnessIssueDate,
              fitnessExpiryDate: formatDateForInput(data.expirationDate) || newData.fitnessExpiryDate,
              chassis: newData.chassis || extractChassisPrefix(String(fitnessChassisRaw)),
          };
          toast.success("Certificate of Fitness processed. Review the details below.");
      } else {
          toast.warning("Could not read all details from this certificate. You can fix them after registration is scanned.");
      }
      setFormData(newData);
      setIsScanning(false);
      setUploadSubStep("fitness_review");
  };

  /** After registration file is added: parse registration only (fitness already in formData). */
  const handleScanClick = async () => {
      if (!registrationFile) {
          toast.error("Please add your Motor Vehicle Registration.");
          return;
      }
      setIsScanning(true);
      let newData = { ...formData };
      let scanSuccess = false;

      const data = await scanDocument(registrationFile, "vehicle_registration");
      console.log("Registration Scan Result:", data);
      if (data) {
          const vinUpper = (data.vin || newData.vin || "").toUpperCase();
          newData = {
              ...newData,
              licensePlate: (data.plate || data.plateNumber || newData.licensePlate || "").toUpperCase(),
              vin: vinUpper,
              // Seed the chassis prefix from the registration VIN only when
              // the operator hasn't typed one already. Picker uses this to
              // narrow catalog candidates (ilike on chassis_code).
              chassis: newData.chassis || extractChassisPrefix(vinUpper),
              mvid: data.mvid != null ? String(data.mvid) : newData.mvid,
              laNumber: data.laNumber != null ? String(data.laNumber) : newData.laNumber,
              controlNumber: data.controlNumber != null ? String(data.controlNumber) : newData.controlNumber,
              registrationIssueDate: formatDateForInput(data.issueDate) || newData.registrationIssueDate,
              registrationExpiryDate: formatDateForInput(data.expirationDate) || newData.registrationExpiryDate,
          };
          scanSuccess = true;
      }

      setFormData(newData);
      setIsScanning(false);
      setVerifyDocTab("registration");
      setStep(2);

      if (scanSuccess) {
          toast.success("Registration processed. Review and submit when ready.");
      } else {
          toast.warning("Could not read all registration details. Please verify manually.");
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation: Require at least some identifier or document
    const hasData = formData.licensePlate || formData.make || formData.model || registrationFile || fitnessFile;
    if (!hasData) {
      toast.error("Please provide vehicle details or upload a document.");
      return;
    }

    // Hybrid catalog matching: when the picker has 2+ candidates we must not
    // silently guess. Force the operator onto the catalog tab to pick.
    if (catalogSaveBlocked) {
      toast.error("Pick the matching motor type before saving.");
      setVerifyDocTab("catalog");
      return;
    }

    setIsLoading(true);
    try {
      // Upload Documents & Generate Image
      let fitnessUrl = '';
      let registrationUrl = '';
      let generatedImageUrl = ''; 
      
      const asyncTasks = [];

      if (fitnessFile) {
        asyncTasks.push(api.uploadFile(fitnessFile).then(res => fitnessUrl = res.url));
      }
      if (registrationFile) {
        asyncTasks.push(api.uploadFile(registrationFile).then(res => registrationUrl = res.url));
      }

      // Generate Image
      if (formData.make && formData.model && formData.color) {
           asyncTasks.push(
               (async () => {
                   try {
                       toast.info("Generating studio quality vehicle image... (this may take a moment)");
                       const imgRes = await api.generateVehicleImage({
                           make: formData.make,
                           model: formData.model,
                           year: formData.year,
                           color: formData.color,
                           bodyType: formData.bodyType,
                           licensePlate: formData.licensePlate
                       });
                       if (imgRes.url) {
                           generatedImageUrl = imgRes.url;
                       }
                   } catch (e) {
                       console.error("Image gen failed", e);
                   }
               })()
           );
      }

      await Promise.all(asyncTasks);

      // Determine Identity
      const plateToUse = formData.licensePlate ? formData.licensePlate.toUpperCase() : '';
      const fallbackId = `UNKNOWN-${Date.now()}`;
      
      // Try to find existing
      const existingVehicle = plateToUse 
        ? existingVehicles.find(v => (v.licensePlate || '').toUpperCase() === plateToUse || v.id === plateToUse)
        : null;

      // Hybrid catalog matching: gather all the disambiguator hints we will
      // stamp on the vehicle. When the picker auto-matched or the operator
      // explicitly picked a row, we stamp the canonical values from that row;
      // otherwise we stamp whatever the operator typed so the pending request
      // is still rich.
      const trimToHint = (v: string | null | undefined) => {
        const s = (v ?? "").toString().trim();
        return s === "" ? undefined : s;
      };
      const monthNum = parseInt(String(formData.productionMonth ?? "").trim(), 10);
      const stampedMonth =
        Number.isFinite(monthNum) && monthNum >= 1 && monthNum <= 12 ? monthNum : undefined;
      const catalogHints: Partial<Vehicle> = selectedCatalogRow
        ? {
            vehicle_catalog_id: selectedCatalogRow.id,
            vehicle_catalog_trim_hint: trimToHint(selectedCatalogRow.trim_series ?? formData.trim),
            vehicle_catalog_chassis_hint:
              trimToHint(selectedCatalogRow.chassis_code) ?? trimToHint(formData.chassis),
            vehicle_catalog_generation_hint: trimToHint(selectedCatalogRow.generation),
            vehicle_catalog_engine_code_hint: trimToHint(selectedCatalogRow.engine_code),
            vehicle_catalog_engine_type_hint: trimToHint(selectedCatalogRow.engine_type),
            vehicle_catalog_full_model_code_hint: trimToHint(selectedCatalogRow.full_model_code),
            vehicle_catalog_catalog_trim_hint: trimToHint(selectedCatalogRow.catalog_trim),
            vehicle_catalog_emissions_prefix_hint: trimToHint(selectedCatalogRow.emissions_prefix),
            vehicle_catalog_trim_suffix_hint: trimToHint(selectedCatalogRow.trim_suffix_code),
            vehicle_catalog_drivetrain_hint:
              trimToHint(selectedCatalogRow.drivetrain) ?? trimToHint(formData.drivetrain),
            vehicle_catalog_fuel_type_hint:
              trimToHint(selectedCatalogRow.fuel_type) ?? trimToHint(formData.fuelType),
            vehicle_catalog_transmission_hint:
              trimToHint(selectedCatalogRow.transmission) ?? trimToHint(formData.transmission),
            vehicle_catalog_fuel_category_hint: trimToHint(selectedCatalogRow.fuel_category),
            vehicle_catalog_fuel_grade_hint: trimToHint(selectedCatalogRow.fuel_grade),
            vehicle_catalog_production_month_hint: stampedMonth,
          }
        : {
            // No match yet — server will park + queue. Send everything we have
            // so the platform admin sees the full picture in the pending UI.
            vehicle_catalog_trim_hint: trimToHint(formData.trim),
            vehicle_catalog_chassis_hint: trimToHint(formData.chassis),
            vehicle_catalog_drivetrain_hint: trimToHint(formData.drivetrain),
            vehicle_catalog_fuel_type_hint: trimToHint(formData.fuelType),
            vehicle_catalog_transmission_hint: trimToHint(formData.transmission),
            vehicle_catalog_production_month_hint: stampedMonth,
          };

      let finalVehicle: Vehicle;

      if (existingVehicle) {
          // MERGE
          finalVehicle = {
              ...existingVehicle,
              // Update fields if they have value in formData
              make: formData.make || existingVehicle.make,
              model: formData.model || existingVehicle.model,
              year: formData.year || existingVehicle.year,
              color: formData.color || existingVehicle.color,
              bodyType: formData.bodyType || existingVehicle.bodyType,
              vin: formData.vin || existingVehicle.vin,
              
              // Only update specific fields if provided
              registrationExpiry: formData.registrationExpiryDate || existingVehicle.registrationExpiry,
              fitnessExpiry: formData.fitnessExpiryDate || existingVehicle.fitnessExpiry,
              registrationIssueDate: formData.registrationIssueDate || existingVehicle.registrationIssueDate,
              fitnessIssueDate: formData.fitnessIssueDate || existingVehicle.fitnessIssueDate,
              
              // Extended fields
              engineNumber: formData.engineNumber || existingVehicle.engineNumber,
              ccRating: formData.ccRating || existingVehicle.ccRating,
              controlNumber: formData.controlNumber || existingVehicle.controlNumber,
              mvid: formData.mvid || existingVehicle.mvid,
              laNumber: formData.laNumber || existingVehicle.laNumber,

              // Update Image only if generated
              image: generatedImageUrl || existingVehicle.image,
              
              // Update URLs only if new files
              fitnessCertificateUrl: fitnessUrl || existingVehicle.fitnessCertificateUrl,
              registrationCertificateUrl: registrationUrl || existingVehicle.registrationCertificateUrl,

              // Hybrid catalog matching: catalog id + hints from the picker.
              ...catalogHints,
          };
          toast.info(`Updated existing vehicle: ${plateToUse}`);
      } else {
          // CREATE NEW
          finalVehicle = {
            id: plateToUse || fallbackId,
            licensePlate: plateToUse, // Can be empty
            make: formData.make || 'Unknown',
            model: formData.model || 'Unknown',
            year: formData.year,
            vin: formData.vin || (plateToUse ? `${plateToUse}-VIN` : ''),
            // Always create as Inactive. If the server confirms a catalog
            // match the operator can promote to Active afterwards. If there
            // is no match the gate forces Inactive anyway.
            status: 'Inactive' as any,
            color: formData.color,
            
            bodyType: formData.bodyType,
            engineNumber: formData.engineNumber,
            ccRating: formData.ccRating,
            controlNumber: formData.controlNumber,
            fitnessIssueDate: formData.fitnessIssueDate,
            fitnessExpiry: formData.fitnessExpiryDate,
            registrationIssueDate: formData.registrationIssueDate,
            registrationExpiry: formData.registrationExpiryDate,
            
            image: generatedImageUrl || 'figma:asset/6426d17c3b251d9c214959cf1b6b0705de44c168.png',
            metrics: {
                todayEarnings: 0,
                utilizationRate: 0,
                totalLifetimeEarnings: 0,
                odometer: 0,
                fuelLevel: 100,
                healthScore: 100
            },
            serviceStatus: 'OK',
            nextServiceType: 'Inspection',
            daysToService: 90,
            
            fitnessCertificateUrl: fitnessUrl,
            registrationCertificateUrl: registrationUrl,
            mvid: formData.mvid,
            laNumber: formData.laNumber,

            // Hybrid catalog matching: catalog id + hints from the picker.
            ...catalogHints,
          };
      }

      const saveRes = await api.saveVehicle(finalVehicle);
      const merged = saveRes?.data && typeof saveRes.data === "object"
        ? { ...finalVehicle, ...(saveRes.data as object) }
        : finalVehicle;
      onVehicleAdded(merged);

      const matched = saveRes?.catalogMatched !== false && saveRes?.catalogStatus !== 'pending_catalog' && saveRes?.catalogStatus !== 'needs_info';
      if (matched) {
        toast.success(existingVehicle ? "Vehicle updated" : "Vehicle added and matched to motor catalog");
      } else {
        // Persistent, prominent message — this vehicle is parked until a
        // platform admin approves the motor type. Operations (assigning a
        // driver, fueling, trips) are blocked by the server until then.
        toast.warning(
          existingVehicle
            ? "Vehicle updated and parked"
            : "Vehicle added but parked",
          {
            description:
              "This make/model isn't in the motor catalog yet. The vehicle stays Inactive and cannot be assigned, fueled, or driven until a platform admin approves the catalog entry.",
            duration: 12000,
          },
        );
      }
      handleClose();
      
    } catch (error) {
      console.error(error);
      const handled = showCatalogGateToastIfApplicable(error);
      if (!handled) toast.error("Failed to save vehicle");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
        status: 'Inactive',
        make: '', model: '', year: new Date().getFullYear().toString(),
        color: '', bodyType: '', engineNumber: '', ccRating: '', fitnessIssueDate: '', fitnessExpiryDate: '',
        laNumber: '', licensePlate: '', mvid: '', vin: '', controlNumber: '', registrationIssueDate: '', registrationExpiryDate: '',
        trim: '', productionMonth: '', drivetrain: '', transmission: '', fuelType: '', chassis: ''
    });
    setFitnessFile(null);
    setRegistrationFile(null);
    setUploadSubStep("fitness");
    setVerifyDocTab("registration");
    setSelectedCatalogRow(null);
    setCatalogPickerSource(null);
    setStep(1);
    onClose();
  };

  const fitnessCertificateFieldEditors = (
    <div className="space-y-3 pt-1">
      <div>
        <Label className="text-xs text-slate-500">Make</Label>
        <Input value={formData.make} onChange={(e) => setFormData({ ...formData, make: e.target.value })} placeholder="Toyota" />
      </div>
      <div>
        <Label className="text-xs text-slate-500">Model</Label>
        <Input value={formData.model} onChange={(e) => setFormData({ ...formData, model: e.target.value })} placeholder="Camry" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-slate-500">Year</Label>
          <Input value={formData.year} onChange={(e) => setFormData({ ...formData, year: e.target.value })} placeholder="2019" />
        </div>
        <div>
          <Label className="text-xs text-slate-500">Colour</Label>
          <Input value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })} placeholder="White" />
        </div>
      </div>
      <div>
        <Label className="text-xs text-slate-500">Body type</Label>
        <Input value={formData.bodyType} onChange={(e) => setFormData({ ...formData, bodyType: e.target.value })} placeholder="Sedan" />
      </div>
      <div>
        <Label className="text-xs text-slate-500">Motor or engine no.</Label>
        <Input value={formData.engineNumber} onChange={(e) => setFormData({ ...formData, engineNumber: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs text-slate-500">CC rating</Label>
        <Input value={formData.ccRating} onChange={(e) => setFormData({ ...formData, ccRating: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-slate-500">Fitness issue</Label>
          <Input type="date" value={formData.fitnessIssueDate} onChange={(e) => setFormData({ ...formData, fitnessIssueDate: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs text-slate-500">Fitness expiry</Label>
          <Input type="date" value={formData.fitnessExpiryDate} onChange={(e) => setFormData({ ...formData, fitnessExpiryDate: e.target.value })} />
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[900px] overflow-hidden max-h-[90vh] overflow-y-auto z-[100]">
        <DialogHeader>
          <DialogTitle>Add New Vehicle</DialogTitle>
          <DialogDescription>
            {step === 1 && uploadSubStep === "fitness"
                ? "Step 1 of 3 — Add your Certificate of Fitness (scan or upload)."
                : step === 1 && uploadSubStep === "fitness_review"
                  ? "Step 2 of 3 — Review what we extracted from your fitness certificate."
                  : step === 1 && uploadSubStep === "registration"
                    ? "Step 3 of 3 — Add your Motor Vehicle Registration (scan or upload)."
                    : "Review registration details and submit. Fitness was confirmed in an earlier step."}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="py-4">
          {/* Documents Section - Always visible in Step 1, minimized in Step 2? No, just keep simple logic */}
          {step === 1 && uploadSubStep === "fitness" && (
            <div className="space-y-3 max-w-md mx-auto">
              <FileUploadZone
                label="Certificate of Fitness"
                file={fitnessFile}
                onFileSelect={setFitnessFile}
                accept="image/*,.pdf"
                icon={FileCheck}
                uploadLabel="Upload Fitness"
                scanLabel="Scan Fitness"
              />
            </div>
          )}
          {step === 1 && uploadSubStep === "fitness_review" && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3 max-w-lg mx-auto">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <FileCheck className="h-4 w-4 text-emerald-600" />
                Extracted from Certificate of Fitness
              </div>
              <p className="text-xs text-slate-600">
                Confirm or correct the values below, then continue to add your registration.
              </p>
              {fitnessCertificateFieldEditors}
            </div>
          )}
          {step === 1 && uploadSubStep === "registration" && (
            <div className="space-y-3 max-w-md mx-auto">
              <FileUploadZone
                label="Motor Vehicle Registration"
                file={registrationFile}
                onFileSelect={setRegistrationFile}
                accept="image/*,.pdf"
                icon={Car}
                uploadLabel="Upload Registration"
                scanLabel="Scan Registration"
              />
            </div>
          )}
          
          {/* Step 2: Tabs between registration and fitness editors */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-slate-50 p-2 sm:p-3 rounded-lg border">
                    <div
                      className="flex rounded-lg bg-slate-200/60 p-1 gap-1 flex-1 min-w-0"
                      role="tablist"
                      aria-label="Document details"
                    >
                      <button
                        type="button"
                        id="verify-tab-registration"
                        role="tab"
                        aria-selected={verifyDocTab === "registration"}
                        onClick={() => setVerifyDocTab("registration")}
                        className={cn(
                          "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors min-h-[2.5rem]",
                          verifyDocTab === "registration"
                            ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80",
                        )}
                      >
                        <Car className="h-4 w-4 shrink-0 text-blue-600" />
                        <span className="truncate">Registration</span>
                      </button>
                      <button
                        type="button"
                        id="verify-tab-fitness"
                        role="tab"
                        aria-selected={verifyDocTab === "fitness"}
                        onClick={() => setVerifyDocTab("fitness")}
                        className={cn(
                          "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors min-h-[2.5rem]",
                          verifyDocTab === "fitness"
                            ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80",
                        )}
                      >
                        <FileCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                        <span className="truncate">Fitness</span>
                      </button>
                      <button
                        type="button"
                        id="verify-tab-catalog"
                        role="tab"
                        aria-selected={verifyDocTab === "catalog"}
                        onClick={() => setVerifyDocTab("catalog")}
                        className={cn(
                          "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors min-h-[2.5rem] relative",
                          verifyDocTab === "catalog"
                            ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80",
                        )}
                      >
                        <Tag className="h-4 w-4 shrink-0 text-indigo-600" />
                        <span className="truncate">Motor type</span>
                        {catalogSaveBlocked && (
                          <span
                            aria-hidden
                            className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white"
                          />
                        )}
                      </button>
                    </div>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => {
                        setStep(1);
                        setUploadSubStep("fitness");
                      }}
                      className="text-xs h-auto p-0 text-emerald-600 shrink-0 self-end sm:self-auto"
                    >
                      Re-upload documents
                    </Button>
                </div>

                {matchedVehicle && (
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 flex items-start gap-3 animate-in zoom-in-95 duration-300">
                        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="text-sm font-bold text-amber-900">Identity Match Detected</h4>
                            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                                A vehicle with license plate <span className="font-bold underline">{matchedVehicle.licensePlate}</span> already exists in the system.
                                Submitting will update the existing asset profile instead of creating a duplicate.
                            </p>
                        </div>
                    </div>
                )}

                {verifyDocTab === "registration" && (
                <div
                  className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3 max-w-lg mx-auto"
                  role="tabpanel"
                  id="verify-panel-registration"
                  aria-labelledby="verify-tab-registration"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Car className="h-4 w-4 text-blue-600" />
                    Motor Vehicle Registration
                  </div>
                  <p className="text-xs text-slate-600">
                    Edit the fields parsed from your registration document. Switch to the Fitness tab to review or edit certificate details.
                  </p>
                  <div className="space-y-3 pt-1">
                            <div>
                                <Label className="text-xs text-slate-500">LA Number</Label>
                                <Input value={formData.laNumber} onChange={(e) => setFormData({...formData, laNumber: e.target.value})} />
                            </div>
                            <div>
                                <Label className="text-xs text-slate-500">Reg. Plate No <span className="text-red-500">*</span></Label>
                                <Input value={formData.licensePlate} onChange={(e) => setFormData({...formData, licensePlate: e.target.value.toUpperCase()})} className="font-mono text-lg font-bold tracking-wider" placeholder="ABC-123" />
                            </div>
                            <div>
                                <Label className="text-xs text-slate-500">MVID</Label>
                                <Input value={formData.mvid} onChange={(e) => setFormData({...formData, mvid: e.target.value})} />
                            </div>
                            <div>
                                <Label className="text-xs text-slate-500">VIN / Chassis No</Label>
                                <Input value={formData.vin} onChange={(e) => setFormData({...formData, vin: e.target.value.toUpperCase()})} className="font-mono" />
                            </div>
                            <div>
                                <Label className="text-xs text-slate-500">Control Number</Label>
                                <Input value={formData.controlNumber} onChange={(e) => setFormData({...formData, controlNumber: e.target.value})} />
                            </div>
                             <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs text-slate-500">Date Issued</Label>
                                    <Input type="date" value={formData.registrationIssueDate} onChange={(e) => setFormData({...formData, registrationIssueDate: e.target.value})} />
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-500">Expiry Date</Label>
                                    <Input type="date" value={formData.registrationExpiryDate} onChange={(e) => setFormData({...formData, registrationExpiryDate: e.target.value})} />
                                </div>
                            </div>
                  </div>
                </div>
                )}

                {verifyDocTab === "fitness" && (
                <div
                  className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3 max-w-lg mx-auto"
                  role="tabpanel"
                  id="verify-panel-fitness"
                  aria-labelledby="verify-tab-fitness"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <FileCheck className="h-4 w-4 text-emerald-600" />
                    Certificate of Fitness
                  </div>
                  <p className="text-xs text-slate-600">
                    Edit any values parsed from your fitness certificate before submitting.
                  </p>
                  {fitnessCertificateFieldEditors}
                </div>
                )}

                {verifyDocTab === "catalog" && (
                <div
                  className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3 max-w-lg mx-auto"
                  role="tabpanel"
                  id="verify-panel-catalog"
                  aria-labelledby="verify-tab-catalog"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Tag className="h-4 w-4 text-indigo-600" />
                    Confirm motor type
                  </div>
                  <p className="text-xs text-slate-600">
                    The exact variant matters for service intervals, parts, and reporting.
                    Add any details that distinguish this vehicle from similar ones, then pick the matching catalog row.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="sm:col-span-2">
                      <Label className="text-xs text-slate-500">Chassis code (auto-detected from registration)</Label>
                      <Input
                        value={formData.chassis}
                        onChange={(e) => setFormData({ ...formData, chassis: e.target.value.toUpperCase() })}
                        placeholder="e.g. M900A"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        We use the chassis prefix to filter the catalog. Edit if it looks wrong.
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Production month (optional)</Label>
                      <Input
                        value={formData.productionMonth}
                        onChange={(e) => setFormData({ ...formData, productionMonth: e.target.value })}
                        inputMode="numeric"
                        placeholder={"1\u201312"}
                      />
                    </div>
                    <CatalogFacetSelect
                      label="Trim / series"
                      value={formData.trim}
                      onChange={(v) => setFormData({ ...formData, trim: v })}
                      options={catalogFacets.trim_series}
                      loading={catalogFacetsLoading}
                    />
                    <CatalogFacetSelect
                      label="Drivetrain"
                      value={formData.drivetrain}
                      onChange={(v) => setFormData({ ...formData, drivetrain: v })}
                      options={catalogFacets.drivetrain}
                      loading={catalogFacetsLoading}
                    />
                    <CatalogFacetSelect
                      label="Transmission"
                      value={formData.transmission}
                      onChange={(v) => setFormData({ ...formData, transmission: v })}
                      options={catalogFacets.transmission}
                      loading={catalogFacetsLoading}
                    />
                    <div className="sm:col-span-2">
                      <CatalogFacetSelect
                        label="Fuel type"
                        value={formData.fuelType}
                        onChange={(v) => setFormData({ ...formData, fuelType: v })}
                        options={catalogFacets.fuel_type}
                        loading={catalogFacetsLoading}
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <CatalogVariantPicker
                      make={formData.make}
                      model={formData.model}
                      year={formData.year}
                      month={formData.productionMonth}
                      trim={formData.trim}
                      drivetrain={formData.drivetrain}
                      transmission={formData.transmission}
                      fuel_type={formData.fuelType}
                      body_type={formData.bodyType}
                      chassis_code={formData.chassis || undefined}
                      value={selectedCatalogRow?.id ?? null}
                      onChange={handleCatalogPickerChange}
                      disabled={isLoading}
                    />
                  </div>
                </div>
                )}

                <div className="max-w-lg mx-auto border-t pt-4 space-y-2">
                    <Label className="text-xs text-slate-500 mb-1.5 block">Vehicle Status</Label>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex gap-2 text-xs text-amber-900">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <div>
                            <div className="font-semibold">New vehicles start parked.</div>
                            <p className="mt-0.5 text-amber-800">
                                The vehicle will be saved as <span className="font-medium">Inactive</span> while it is verified
                                against the platform motor catalog. You'll be able to set it Active from the vehicle's detail
                                page once it is approved.
                            </p>
                        </div>
                    </div>
                    <Select
                        value="Inactive"
                        onValueChange={() => {/* locked at create — see banner above */}}
                        disabled
                    >
                    <SelectTrigger className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="Inactive">Inactive (parked, pending catalog)</SelectItem>
                    </SelectContent>
                    </Select>
                </div>
            </div>
          )}
          
          <DialogFooter className="mt-6">
             <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            
            {step === 1 && uploadSubStep === "fitness" ? (
              <Button
                type="button"
                onClick={() => void handleParseFitnessClick()}
                disabled={!fitnessFile || isScanning}
                className="bg-slate-900 text-white hover:bg-slate-800"
              >
                {isScanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {isScanning ? "Processing..." : "Parse certificate"}
              </Button>
            ) : step === 1 && uploadSubStep === "fitness_review" ? (
              <>
                <Button type="button" variant="ghost" onClick={() => setUploadSubStep("fitness")}>
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() => setUploadSubStep("registration")}
                  className="bg-slate-900 text-white hover:bg-slate-800"
                >
                  Continue to registration
                </Button>
              </>
            ) : step === 1 && uploadSubStep === "registration" ? (
              <>
                <Button type="button" variant="ghost" onClick={() => setUploadSubStep("fitness_review")}>
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleScanClick()}
                  disabled={!registrationFile || isScanning}
                  className="bg-slate-900 text-white hover:bg-slate-800"
                >
                  {isScanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  {isScanning ? "Processing..." : "Parse registration"}
                </Button>
              </>
            ) : step === 1 ? null : (
                <Button
                  type="submit"
                  disabled={isLoading || catalogSaveBlocked}
                  title={catalogSaveBlocked ? "Pick the matching motor type on the Motor type tab to continue" : undefined}
                >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {catalogSaveBlocked ? "Pick motor type to continue" : "Add Vehicle"}
                </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}