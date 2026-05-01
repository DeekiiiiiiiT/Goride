import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Loader2, FileText, Check, Car, FileCheck, Sparkles, AlertTriangle, Tag, Image as ImageIcon } from 'lucide-react';
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
import { useVehicleCatalogAnchorFacets } from '../../hooks/useVehicleCatalogAnchorFacets';
import { extractChassisPrefix } from '../../utils/chassisPrefix';
import type { VehicleCatalogRecord } from '../../types/vehicleCatalog';

interface AddVehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVehicleAdded: (vehicle: Vehicle) => void;
  existingVehicles?: Vehicle[];
}

const ACCEPT_IMAGE_ONLY = 'image/*';
const ACCEPT_PDF_ONLY = '.pdf,application/pdf';

/** Desktop-first: image-only or PDF-only file pick (no camera / scan). */
const FileUploadZone = ({
  label,
  file,
  onFileSelect,
  required = false,
  className,
}: {
  label: string;
  file: File | null;
  onFileSelect: (f: File) => void;
  required?: boolean;
  className?: string;
}) => {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const hiddenInputs = (
    <>
      <input
        ref={imageInputRef}
        type="file"
        className="hidden"
        accept={ACCEPT_IMAGE_ONLY}
        onChange={(e) => {
          if (e.target.files?.[0]) onFileSelect(e.target.files[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={pdfInputRef}
        type="file"
        className="hidden"
        accept={ACCEPT_PDF_ONLY}
        onChange={(e) => {
          if (e.target.files?.[0]) onFileSelect(e.target.files[0]);
          e.target.value = '';
        }}
      />
    </>
  );

  if (file) {
    return (
      <div className={cn('space-y-2', className)}>
        <Label
          className={cn(
            'text-xs font-medium uppercase text-slate-500',
            required && "after:content-['*'] after:ml-0.5 after:text-red-500",
          )}
        >
          {label}
        </Label>
        {hiddenInputs}
        <div className="border-2 border-dashed border-emerald-500 bg-emerald-50/50 rounded-lg p-4 flex flex-col items-center justify-center text-center gap-2 min-h-[7rem]">
          <div className="bg-emerald-100 p-2 rounded-full">
            <Check className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="text-sm font-medium text-emerald-900 w-full truncate px-2">{file.name}</div>
          <div className="text-xs text-emerald-600 font-medium">Replace file</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              imageInputRef.current?.click();
            }}
            className="flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            <ImageIcon className="h-4 w-4 shrink-0" />
            Replace with image
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              pdfInputRef.current?.click();
            }}
            className="flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            <FileText className="h-4 w-4 shrink-0" />
            Replace with PDF
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Label
        className={cn(
          'text-xs font-medium uppercase text-slate-500',
          required && "after:content-['*'] after:ml-0.5 after:text-red-500",
        )}
      >
        {label}
      </Label>
      {hiddenInputs}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            imageInputRef.current?.click();
          }}
          className="flex flex-col items-center justify-center gap-2 min-h-[6.5rem] bg-white hover:bg-slate-50 border-2 border-slate-200 hover:border-slate-900 border-dashed rounded-xl transition-all text-slate-700 group shadow-sm hover:shadow-md"
        >
          <div className="bg-slate-50 p-2 rounded-full group-hover:bg-slate-900 group-hover:text-white transition-colors">
            <ImageIcon className="h-5 w-5" />
          </div>
          <span className="text-xs font-semibold">Upload image</span>
          <span className="text-[10px] text-slate-500 px-2 text-center">JPEG or PNG</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            pdfInputRef.current?.click();
          }}
          className="flex flex-col items-center justify-center gap-2 min-h-[6.5rem] bg-white hover:bg-slate-50 border-2 border-slate-200 hover:border-slate-900 border-dashed rounded-xl transition-all text-slate-700 group shadow-sm hover:shadow-md"
        >
          <div className="bg-slate-50 p-2 rounded-full group-hover:bg-slate-900 group-hover:text-white transition-colors">
            <FileText className="h-5 w-5" />
          </div>
          <span className="text-xs font-semibold">Upload PDF</span>
          <span className="text-[10px] text-slate-500 px-2 text-center">.pdf only</span>
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
   * Step 2: switch between registration, fitness, and the "Verify vehicle"
   * (catalog variant) field editors. The verify tab mirrors VehicleDetail's
   * "Align with motor catalog" overlay so behaviour stays identical across
   * the app.
   */
  const [verifyDocTab, setVerifyDocTab] = useState<"registration" | "fitness" | "verify">("registration");
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

    // Hybrid catalog matching disambiguators (collected from the parsed docs;
    // the Verify vehicle tab seeds its own dropdowns from these). Sent both to
    // the matches endpoint and stamped on the vehicle so the server-side
    // resolver picks the same row when the user has not explicitly selected a
    // candidate.
    trim: '',
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

  // ---------------------------------------------------------------------------
  // Verify vehicle tab — mirrors VehicleDetail's "Align with motor catalog"
  // overlay. Make/Model/Year/Chassis are catalog-backed dropdowns (so the
  // strings line up with the DB), seeded from parsed registration + fitness.
  // ---------------------------------------------------------------------------
  const [verifySearchMake, setVerifySearchMake] = useState('');
  const [verifySearchModel, setVerifySearchModel] = useState('');
  const [verifySearchYear, setVerifySearchYear] = useState('');
  const [verifySearchChassis, setVerifySearchChassis] = useState('');
  const [verifySearchDrivetrain, setVerifySearchDrivetrain] = useState('');
  const [verifySearchTransmission, setVerifySearchTransmission] = useState('');

  // MMY-only fetch: distinct chassis codes for the mandatory chassis dropdown.
  const { facets: verifyMmyFacets, loading: verifyMmyLoading } = useCatalogCandidates({
    make: verifySearchMake,
    model: verifySearchModel,
    year: verifySearchYear,
    skipChassisFilter: true,
  });
  // After chassis is chosen: drivetrain / transmission facets + picker narrowing.
  const { facets: verifyFacets, loading: verifyFacetsLoading } = useCatalogCandidates({
    make: verifySearchMake,
    model: verifySearchModel,
    year: verifySearchYear,
    chassis: verifySearchChassis,
  });

  const {
    makes: verifyMakeOptions,
    models: verifyModelOptions,
    years: verifyYearOptions,
    loadingMakes: verifyMakesLoading,
    loadingModels: verifyModelsLoading,
    loadingYears: verifyYearsLoading,
  } = useVehicleCatalogAnchorFacets(verifySearchMake, verifySearchModel);

  const onVerifyMakeChange = useCallback((v: string) => {
    setVerifySearchMake(v);
    setVerifySearchModel('');
    setVerifySearchYear('');
    setVerifySearchChassis('');
    setVerifySearchDrivetrain('');
    setVerifySearchTransmission('');
  }, []);

  const onVerifyModelChange = useCallback((v: string) => {
    setVerifySearchModel(v);
    setVerifySearchYear('');
    setVerifySearchChassis('');
    setVerifySearchDrivetrain('');
    setVerifySearchTransmission('');
  }, []);

  const onVerifyYearChange = useCallback((v: string) => {
    setVerifySearchYear(v);
    setVerifySearchChassis('');
    setVerifySearchDrivetrain('');
    setVerifySearchTransmission('');
  }, []);

  /**
   * Seed verify-tab inputs from the parsed registration + fitness the first
   * time the user lands on the tab. After that we let them edit freely; we
   * only re-seed on a fresh open of the modal (handleClose resets the ref).
   */
  const verifySeededRef = useRef(false);
  useEffect(() => {
    if (verifyDocTab !== 'verify') return;
    if (verifySeededRef.current) return;
    setVerifySearchMake(formData.make || '');
    setVerifySearchModel(formData.model || '');
    setVerifySearchYear(formData.year || '');
    setVerifySearchChassis((formData.chassis || extractChassisPrefix(formData.vin)) ?? '');
    setVerifySearchDrivetrain(formData.drivetrain || '');
    setVerifySearchTransmission(formData.transmission || '');
    verifySeededRef.current = true;
  }, [verifyDocTab, formData.make, formData.model, formData.year, formData.chassis, formData.vin, formData.drivetrain, formData.transmission]);

  /** Reset the picker selection whenever the anchor inputs change. */
  useEffect(() => {
    if (verifyDocTab !== 'verify') return;
    setSelectedCatalogRow(null);
    setCatalogPickerSource(null);
  }, [verifyDocTab, verifySearchMake, verifySearchModel, verifySearchYear, verifySearchChassis]);

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
      toast.error("Verify the vehicle on the Verify vehicle tab before saving.");
      setVerifyDocTab("verify");
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
      // is still rich. Verify-tab values (catalog-backed) win over the raw
      // parsed fields when both are present, since those are what actually
      // matched the catalog.
      const trimToHint = (v: string | null | undefined) => {
        const s = (v ?? "").toString().trim();
        return s === "" ? undefined : s;
      };
      const verifyChassisHint = trimToHint(verifySearchChassis) ?? trimToHint(formData.chassis);
      const verifyDrivetrainHint = trimToHint(verifySearchDrivetrain) ?? trimToHint(formData.drivetrain);
      const verifyTransmissionHint = trimToHint(verifySearchTransmission) ?? trimToHint(formData.transmission);
      const catalogHints: Partial<Vehicle> = selectedCatalogRow
        ? {
            vehicle_catalog_id: selectedCatalogRow.id,
            vehicle_catalog_trim_hint: trimToHint(selectedCatalogRow.trim_series ?? formData.trim),
            vehicle_catalog_chassis_hint:
              trimToHint(selectedCatalogRow.chassis_code) ?? verifyChassisHint,
            vehicle_catalog_generation_hint: trimToHint(selectedCatalogRow.generation),
            vehicle_catalog_engine_code_hint: trimToHint(selectedCatalogRow.engine_code),
            vehicle_catalog_engine_type_hint: trimToHint(selectedCatalogRow.engine_type),
            vehicle_catalog_full_model_code_hint: trimToHint(selectedCatalogRow.full_model_code),
            vehicle_catalog_catalog_trim_hint: trimToHint(selectedCatalogRow.catalog_trim),
            vehicle_catalog_emissions_prefix_hint: trimToHint(selectedCatalogRow.emissions_prefix),
            vehicle_catalog_trim_suffix_hint: trimToHint(selectedCatalogRow.trim_suffix_code),
            vehicle_catalog_drivetrain_hint:
              trimToHint(selectedCatalogRow.drivetrain) ?? verifyDrivetrainHint,
            vehicle_catalog_fuel_type_hint:
              trimToHint(selectedCatalogRow.fuel_type) ?? trimToHint(formData.fuelType),
            vehicle_catalog_transmission_hint:
              trimToHint(selectedCatalogRow.transmission) ?? verifyTransmissionHint,
            vehicle_catalog_fuel_category_hint: trimToHint(selectedCatalogRow.fuel_category),
            vehicle_catalog_fuel_grade_hint: trimToHint(selectedCatalogRow.fuel_grade),
          }
        : {
            // No match yet — server will park + queue. Send everything we have
            // so the platform admin sees the full picture in the pending UI.
            vehicle_catalog_trim_hint: trimToHint(formData.trim),
            vehicle_catalog_chassis_hint: verifyChassisHint,
            vehicle_catalog_drivetrain_hint: verifyDrivetrainHint,
            vehicle_catalog_fuel_type_hint: trimToHint(formData.fuelType),
            vehicle_catalog_transmission_hint: verifyTransmissionHint,
          };

      // Verify-tab values are catalog-backed; prefer them as the "make / model
      // / year" stamped on the vehicle so the resolver picks the same row.
      const stampedMake = verifySearchMake.trim() || formData.make;
      const stampedModel = verifySearchModel.trim() || formData.model;
      const stampedYear = /^\d{4}$/.test(verifySearchYear.trim()) ? verifySearchYear.trim() : formData.year;

      let finalVehicle: Vehicle;

      if (existingVehicle) {
          // MERGE
          finalVehicle = {
              ...existingVehicle,
              // Verify-tab values win (they came from the catalog dropdowns);
              // fall back to parsed formData, then the existing record.
              make: stampedMake || existingVehicle.make,
              model: stampedModel || existingVehicle.model,
              year: stampedYear || existingVehicle.year,
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
            make: stampedMake || 'Unknown',
            model: stampedModel || 'Unknown',
            year: stampedYear,
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
        trim: '', drivetrain: '', transmission: '', fuelType: '', chassis: ''
    });
    setFitnessFile(null);
    setRegistrationFile(null);
    setUploadSubStep("fitness");
    setVerifyDocTab("registration");
    setSelectedCatalogRow(null);
    setCatalogPickerSource(null);
    setVerifySearchMake('');
    setVerifySearchModel('');
    setVerifySearchYear('');
    setVerifySearchChassis('');
    setVerifySearchDrivetrain('');
    setVerifySearchTransmission('');
    verifySeededRef.current = false;
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
                ? "Step 1 of 3 — Add your Certificate of Fitness (image or PDF)."
                : step === 1 && uploadSubStep === "fitness_review"
                  ? "Step 2 of 3 — Review what we extracted from your fitness certificate."
                  : step === 1 && uploadSubStep === "registration"
                    ? "Step 3 of 3 — Add your Motor Vehicle Registration (image or PDF)."
                    : "Review registration details and submit. Fitness was confirmed in an earlier step."}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="py-4">
          {/* Documents Section - Always visible in Step 1, minimized in Step 2? No, just keep simple logic */}
          {step === 1 && uploadSubStep === "fitness" && (
            <div className="space-y-3 max-w-md mx-auto">
              <FileUploadZone label="Certificate of Fitness" file={fitnessFile} onFileSelect={setFitnessFile} />
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
              <FileUploadZone label="Motor Vehicle Registration" file={registrationFile} onFileSelect={setRegistrationFile} />
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
                        id="verify-tab-verify"
                        role="tab"
                        aria-selected={verifyDocTab === "verify"}
                        onClick={() => setVerifyDocTab("verify")}
                        className={cn(
                          "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors min-h-[2.5rem] relative",
                          verifyDocTab === "verify"
                            ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80",
                        )}
                      >
                        <Tag className="h-4 w-4 shrink-0 text-indigo-600" />
                        <span className="truncate">Verify vehicle</span>
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

                {verifyDocTab === "verify" && (
                <div
                  className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3 max-w-lg mx-auto"
                  role="tabpanel"
                  id="verify-panel-verify"
                  aria-labelledby="verify-tab-verify"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Tag className="h-4 w-4 text-indigo-600" />
                    Verify vehicle
                  </div>
                  <p className="text-xs text-slate-600">
                    Choose make, model, and year from the catalog, then a chassis code (required).
                    Optionally narrow with drivetrain and transmission. We auto-match when only one
                    catalog row fits.
                  </p>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-1">
                    <div className="space-y-1.5">
                      <CatalogFacetSelect
                        label="Make"
                        value={verifySearchMake}
                        onChange={onVerifyMakeChange}
                        options={verifyMakeOptions}
                        loading={verifyMakesLoading}
                        optional={false}
                        allowAny={false}
                        emptyHint="Could not load makes from catalog"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <CatalogFacetSelect
                        label="Model"
                        value={verifySearchModel}
                        onChange={onVerifyModelChange}
                        options={verifyModelOptions}
                        loading={verifyModelsLoading}
                        optional={false}
                        allowAny={false}
                        emptyHint={verifySearchMake.trim().length >= 2 ? "No models for this make" : "Select a make first"}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <CatalogFacetSelect
                        label="Year"
                        value={verifySearchYear}
                        onChange={onVerifyYearChange}
                        options={verifyYearOptions}
                        loading={verifyYearsLoading}
                        optional={false}
                        allowAny={false}
                        emptyHint={
                          verifySearchMake.trim().length >= 2 && verifySearchModel.trim().length >= 2
                            ? "No years for this make/model"
                            : "Select make and model first"
                        }
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-3">
                      <CatalogFacetSelect
                        label="Chassis code"
                        value={verifySearchChassis}
                        onChange={(v) => setVerifySearchChassis(v.toUpperCase())}
                        options={verifyMmyFacets.chassis_code}
                        loading={verifyMmyLoading}
                        optional={false}
                        allowAny={false}
                        emptyHint="No chassis codes in the catalog for this make/model/year"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <CatalogFacetSelect
                        label="Drivetrain"
                        value={verifySearchDrivetrain}
                        onChange={setVerifySearchDrivetrain}
                        options={verifyFacets.drivetrain}
                        loading={verifyFacetsLoading}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <CatalogFacetSelect
                        label="Transmission"
                        value={verifySearchTransmission}
                        onChange={setVerifySearchTransmission}
                        options={verifyFacets.transmission}
                        loading={verifyFacetsLoading}
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    {verifySearchChassis.trim() &&
                    /^\d{4}$/.test(verifySearchYear.trim()) &&
                    verifySearchMake.trim().length >= 2 &&
                    verifySearchModel.trim().length >= 2 ? (
                      <CatalogVariantPicker
                        make={verifySearchMake}
                        model={verifySearchModel}
                        year={verifySearchYear}
                        drivetrain={verifySearchDrivetrain}
                        transmission={verifySearchTransmission}
                        chassis_code={verifySearchChassis}
                        value={selectedCatalogRow?.id ?? null}
                        onChange={handleCatalogPickerChange}
                        disabled={isLoading}
                      />
                    ) : (
                      <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                        Select make, model, year, and chassis above to search the motor catalog.
                      </p>
                    )}
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
                  title={catalogSaveBlocked ? "Verify the vehicle on the Verify vehicle tab to continue" : undefined}
                >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {catalogSaveBlocked ? "Verify vehicle to continue" : "Add Vehicle"}
                </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}