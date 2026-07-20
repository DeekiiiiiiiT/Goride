import React, { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { StationProfile, StationOverride, LocationStatus } from '../../../types/station';
import { normalizeStationName, inferBrandFromName } from '../../../utils/stationUtils';
import { encodePlusCode, decodePlusCode, isValidPlusCode, isFullPlusCode, getPlusCodePrecision, recoverShortCode, extractLocality, extractCodePortion, getDefaultGeofenceRadius } from '../../../utils/plusCode';
import { fuelService } from '../../../services/fuelService';
import { Plus, Loader2, MapPin, Search, CheckCircle2, Info, Grid3X3, Navigation, Pencil, Check } from 'lucide-react';
import { Slider } from '../../ui/slider';
import { toast } from 'sonner@2.0.3';
import { AlertTriangle, Merge, ShieldAlert, ShieldCheck as ShieldCheckIcon, Trash2 } from 'lucide-react';
import { cn } from "../../ui/utils";

export interface DuplicateStationInfo {
  id: string;
  name: string;
  plusCode: string;
  address: string;
  brand: string;
  status: string;
  distance: number;
  matchType: 'pluscode' | 'geofence';
  geofenceRadius?: number;
}

interface AddStationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (station: StationOverride) => Promise<void>;
  editStation?: StationProfile | null;
  onUpdate?: (id: string, station: StationOverride) => Promise<void>;
  /** Merge only into Verified GOD stations — never Unverified CSV. */
  onMergeIntoExisting?: (existingStationId: string) => Promise<void>;
  /** Delete a nearby CSV Unverified reference so GOD create can proceed. */
  onDeleteCsvReference?: (stationId: string) => Promise<void>;
  /** When true, save creates/updates a Verified GOD station (Verify Location flow). */
  verifyAsGodList?: boolean;
  /** Phase 7: Pre-populated nearby station from backend enrichment */
  initialNearbyStation?: DuplicateStationInfo | null;
}

function mapDupePayload(raw: any): DuplicateStationInfo {
  return {
    id: raw.id,
    name: raw.name,
    plusCode: raw.plusCode || '',
    address: raw.address || '',
    brand: raw.brand || '',
    status: raw.status || 'unknown',
    distance: raw.distance ?? 0,
    matchType: raw.matchType || 'geofence',
    geofenceRadius: raw.geofenceRadius,
  };
}

export function AddStationModal({
  isOpen,
  onClose,
  onAdd,
  editStation,
  onUpdate,
  onMergeIntoExisting,
  onDeleteCsvReference,
  verifyAsGodList = false,
  initialNearbyStation,
}: AddStationModalProps) {
  // Phase 5: Use React Query for parent companies caching
  const { data: parentCompaniesData = [] } = useQuery({
    queryKey: ['parentCompanies'],
    queryFn: () => fuelService.getParentCompanies(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [addressGeocoding, setAddressGeocoding] = useState(false);
  const [parentCompanies, setParentCompanies] = useState<any[]>([]);
  const [fetchingCompanies, setFetchingCompanies] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [plusCodeInput, setPlusCodeInput] = useState('');
  const [plusCodeValid, setPlusCodeValid] = useState<boolean | null>(null);
  const [plusCodeSynced, setPlusCodeSynced] = useState(false);
  const [geofenceRadius, setGeofenceRadius] = useState<number | null>(null);
  const [showCopyField, setShowCopyField] = useState(false);
  const copyInputRef = React.useRef<HTMLInputElement>(null);

  // --- Duplicate detection: hard = Verified GOD; soft = CSV Unverified reference ---
  const [duplicateStation, setDuplicateStation] = useState<DuplicateStationInfo | null>(null);
  const [csvReference, setCsvReference] = useState<DuplicateStationInfo | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [forceCreate, setForceCreate] = useState(false);
  const [dismissedCsvId, setDismissedCsvId] = useState<string | null>(null);
  const [deletingCsv, setDeletingCsv] = useState(false);
  
  const isEditMode = !!editStation;
  const isVerifyGodFlow = !!verifyAsGodList;

  const [formData, setFormData] = useState({
    name: '',
    brand: '',
    address: '',
    city: '',
    parish: '',
    country: 'Jamaica',
    phone: '',
    category: 'fuel' as 'fuel' | 'non_fuel',
    lat: '' as string | number,
    lng: '' as string | number,
  });

  const [wizardStep, setWizardStep] = useState<'nearby' | 'station' | 'pin' | 'confirm'>('station');

  // Reset form on open
  useEffect(() => {
    if (isOpen) {
      setShowCopyField(false);
      setCheckingDuplicate(false);
      setForceCreate(false);
      setDismissedCsvId(null);
      // Seed soft CSV reference from nearby enrichment if unverified; hard dupe only if verified
      const nearby = initialNearbyStation || null;
      let seedCsv: DuplicateStationInfo | null = null;
      let seedDupe: DuplicateStationInfo | null = null;
      if (nearby?.status === 'verified') {
        seedDupe = nearby;
      } else if (nearby) {
        seedCsv = nearby;
      }
      setDuplicateStation(seedDupe);
      setCsvReference(seedCsv);
      setWizardStep(seedDupe || seedCsv ? 'nearby' : 'station');
      if (editStation) {
        // Pre-fill form with existing station data for edit mode
        setFormData({
          name: editStation.name || '',
          brand: editStation.brand || '',
          address: editStation.address || '',
          city: editStation.city || '',
          parish: editStation.parish || '',
          country: editStation.country || 'Jamaica',
          phone: editStation.contactInfo?.phone || '',
          category: editStation.category || 'fuel',
          lat: editStation.location?.lat ?? '',
          lng: editStation.location?.lng ?? '',
        });
        setPlusCodeInput(editStation.plusCode || '');
        setPlusCodeValid(editStation.plusCode ? true : null);
        setPlusCodeSynced(false);
        setIsVerified(false);
        setGeofenceRadius(editStation.geofenceRadius || null);
      } else {
        setFormData({
          name: '',
          brand: '',
          address: '',
          city: '',
          parish: '',
          country: 'Jamaica',
          phone: '',
          category: 'fuel',
          lat: '',
          lng: '',
        });
        setPlusCodeInput('');
        setPlusCodeValid(null);
        setPlusCodeSynced(false);
        setIsVerified(false);
        setGeofenceRadius(null);
      }
    }
  }, [isOpen, editStation, initialNearbyStation]);

  useEffect(() => {
    if (isOpen) {
      // Phase 5: Use cached parent companies from React Query
      const filtered = (parentCompaniesData || []).filter(c => c.name !== "Independent");
      setParentCompanies(filtered);
      setFetchingCompanies(false);
    }
  }, [isOpen, parentCompaniesData]);

  // Validate Plus Code as user types
  const handlePlusCodeChange = useCallback((value: string) => {
    setPlusCodeInput(value);
    setIsVerified(false);
    setPlusCodeSynced(false);
    setDuplicateStation(null);
    setCsvReference(null);
    setForceCreate(false);
    setDismissedCsvId(null);
    
    const trimmed = value.trim();
    if (!trimmed) {
      setPlusCodeValid(null);
      return;
    }
    
    const valid = isValidPlusCode(trimmed);
    setPlusCodeValid(valid);
  }, []);

  /**
   * Reusable duplicate-check helper (Phase 5).
   * Non-blocking — logs warnings on failure so verification still succeeds.
   */
  const runDuplicateCheck = useCallback(async (plusCode: string, lat: number, lng: number) => {
    setCheckingDuplicate(true);
    setDuplicateStation(null);
    setCsvReference(null);
    try {
      const excludeId = isEditMode ? editStation?.id : undefined;
      const dupeCheck = await fuelService.checkStationDuplicate(plusCode, lat, lng, excludeId, formData.category);
      if (dupeCheck?.isDuplicate && dupeCheck.existingStation) {
        setDuplicateStation(mapDupePayload(dupeCheck.existingStation));
        setForceCreate(false);
        setWizardStep('nearby');
        console.log(`[Duplicate Check] GOD match: ${dupeCheck.existingStation.name}`);
      }
      if (dupeCheck?.csvReference && dupeCheck.csvReference.id !== dismissedCsvId) {
        setCsvReference(mapDupePayload(dupeCheck.csvReference));
        if (!(dupeCheck?.isDuplicate && dupeCheck.existingStation)) {
          setWizardStep('nearby');
        }
        console.log(`[Duplicate Check] CSV reference: ${dupeCheck.csvReference.name}`);
      }
    } catch (err) {
      console.warn('[Duplicate Check] Non-blocking failure:', err);
    } finally {
      setCheckingDuplicate(false);
    }
  }, [isEditMode, editStation?.id, formData.category, dismissedCsvId]);

  /**
   * PRIMARY FLOW: Verify GPS from Plus Code
   * 
   * Supports TWO modes:
   * A) Full Plus Code (e.g. "7795X36X+5W") → LOCAL decode → exact lat/lng → reverse geocode → address
   * B) Compound/Short Plus Code (e.g. "X36X+5W Portmore") → geocode ONLY the locality for
   *    reference coords → recover full code via OLC algorithm → LOCAL decode → exact lat/lng
   * 
   * CRITICAL: Coordinates ALWAYS come from our local Plus Code decoder, never from Google's
   * geocoding API. Google's geocoder can snap coordinates to nearby POIs, introducing drift
   * that defeats the purpose of Plus Code precision.
   * 
   * The user's Plus Code input is NEVER overwritten — the recovered full code is shown
   * separately so the user retains their original Google Maps code.
   */
  const handleVerifyFromPlusCode = async () => {
    const trimmed = plusCodeInput.trim();
    
    if (!trimmed) {
      toast.error("Please enter a Plus Code first.");
      return;
    }
    
    // Extract just the code portion (before any space) for validation
    const codePart = extractCodePortion(trimmed);
    
    if (!isValidPlusCode(codePart)) {
      toast.error("Invalid Plus Code format. Examples: 7795X36X+5W (full) or X36X+5W Portmore (compound).");
      return;
    }
    
    setGeocoding(true);
    try {
      let fullCode: string;
      
      if (isFullPlusCode(codePart)) {
        // --- MODE A: Already a full Plus Code ---
        fullCode = codePart;
      } else {
        // --- MODE B: Compound/Short Plus Code ---
        // Step B1: Extract the locality reference (e.g. "Portmore" from "X36X+5W Portmore")
        const locality = extractLocality(trimmed);
        if (!locality) {
          toast.error("Compound Plus Code requires a locality reference (e.g. X36X+5W Portmore).");
          setGeocoding(false);
          return;
        }
        
        // Step B2: Geocode ONLY the locality name to get reference coordinates
        // We do NOT send the Plus Code to Google — only the locality (e.g. "Portmore, Jamaica")
        let refLat: number;
        let refLng: number;
        try {
          const localityQuery = `${locality}, ${formData.country || 'Jamaica'}`;
          const refResult = await fuelService.geocodeAddress(localityQuery);
          refLat = refResult.lat;
          refLng = refResult.lng;
        } catch (geoErr: any) {
          console.error("Locality geocoding failed:", geoErr);
          toast.error(`Could not locate "${locality}". Try entering the full Plus Code (e.g. 7795X36X+5W).`);
          setGeocoding(false);
          return;
        }
        
        // Step B3: Recover the full Plus Code using OLC recoverNearest algorithm
        const recovered = recoverShortCode(codePart, refLat, refLng);
        if (!recovered) {
          toast.error("Failed to recover full Plus Code from short code + locality.");
          setGeocoding(false);
          return;
        }
        
        fullCode = recovered;
      }
      
      // Step 2: Decode the full Plus Code LOCALLY — this gives the EXACT center of the
      // Plus Code cell, with zero drift from Google's POI snapping
      const decoded = decodePlusCode(fullCode);
      if (!decoded) {
        toast.error("Failed to decode Plus Code.");
        setGeocoding(false);
        return;
      }
      
      const lat = parseFloat(decoded.lat.toFixed(7));
      const lng = parseFloat(decoded.lng.toFixed(7));
      
      // Step 3: Reverse geocode the EXACT Plus Code coordinates to get address details
      try {
        const result = await fuelService.reverseGeocode(lat, lng);
        
        setFormData(prev => ({
          ...prev,
          lat,
          lng,
          address: result.streetAddress || result.formattedAddress || prev.address,
          city: result.city || prev.city,
          parish: result.parish || prev.parish,
          country: result.country || prev.country,
        }));
        
        // Update the Plus Code input to the recovered full code so the user sees the
        // canonical form, but ONLY for compound codes (full codes stay untouched)
        if (!isFullPlusCode(codePart)) {
          setPlusCodeInput(fullCode);
        }
        
        setPlusCodeValid(true);
        setPlusCodeSynced(true);
        setIsVerified(true);
        // Auto-set geofence radius from Plus Code precision if not manually configured
        if (geofenceRadius === null) {
          setGeofenceRadius(getDefaultGeofenceRadius(fullCode));
        }
        toast.success(`Location verified from Plus Code (${fullCode}). Address, coordinates, and region auto-populated.`);
        
        // Run duplicate check
        runDuplicateCheck(fullCode, lat, lng);
      } catch (reverseError: any) {
        // Even if reverse geocode fails, we still have EXACT coordinates from local decode
        console.warn("Reverse geocode failed, using coordinates only:", reverseError);
        
        setFormData(prev => ({
          ...prev,
          lat,
          lng,
        }));
        
        if (!isFullPlusCode(codePart)) {
          setPlusCodeInput(fullCode);
        }
        
        setPlusCodeValid(true);
        setPlusCodeSynced(true);
        setIsVerified(true);
        // Auto-set geofence radius from Plus Code precision if not manually configured
        if (geofenceRadius === null) {
          setGeofenceRadius(getDefaultGeofenceRadius(fullCode));
        }
        toast.warning("Coordinates populated from Plus Code. Address lookup failed — enter address manually.");
        
        // Run duplicate check
        runDuplicateCheck(fullCode, lat, lng);
      }
    } catch (error: any) {
      console.error("Plus Code verification error:", error);
      toast.error(`Verification failed: ${error.message}`);
    } finally {
      setGeocoding(false);
    }
  };

  /**
   * SECONDARY FLOW: Verify from Street Address (fallback)
   * Address → geocode → lat/lng → auto-generate Plus Code
   */
  const handleVerifyFromAddress = async () => {
    if (!formData.address) {
      toast.error("Please enter an address first.");
      return;
    }

    setAddressGeocoding(true);
    try {
      const fullQuery = `${formData.address}, ${formData.city || ''}, ${formData.parish || ''}, ${formData.country}`.replace(/, ,/g, ',');
      const result = await fuelService.geocodeAddress(fullQuery);
      
      const newLat = result.lat;
      const newLng = result.lng;
      const generated = encodePlusCode(newLat, newLng, 11);
      
      setFormData(prev => ({
        ...prev,
        lat: newLat,
        lng: newLng,
        city: result.city || prev.city,
        parish: result.parish || prev.parish,
      }));
      
      setPlusCodeInput(generated);
      setPlusCodeValid(true);
      setPlusCodeSynced(true);
      setIsVerified(true);
      // Auto-set geofence radius from generated Plus Code if not manually configured
      if (geofenceRadius === null) {
        setGeofenceRadius(getDefaultGeofenceRadius(generated));
      }
      toast.success("Location verified from address. Plus Code and coordinates auto-generated.");

      // Run duplicate check against newly generated Plus Code + coordinates
      runDuplicateCheck(generated, newLat, newLng);
    } catch (error: any) {
      console.error("Geocoding error:", error);
      toast.error(`Could not verify location: ${error.message}`);
    } finally {
      setAddressGeocoding(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    // Only Confirm may save — blocks Enter / accidental submit from earlier steps
    if (wizardStep !== 'confirm') return;
    if (!formData.name) {
      toast.error("Station name is required.");
      return;
    }
    
    if (!plusCodeInput.trim() && !formData.address) {
      toast.error("Either a Plus Code or street address is required.");
      return;
    }

    // Ensure we have valid coordinates
    const lat = typeof formData.lat === 'number' ? formData.lat : parseFloat(formData.lat as string);
    const lng = typeof formData.lng === 'number' ? formData.lng : parseFloat(formData.lng as string);
    
    if (isNaN(lat) || isNaN(lng)) {
      toast.error("Valid coordinates are required. Use 'Verify GPS' to populate from Plus Code.");
      return;
    }

    // --- Final hard-duplicate guard (Verified GOD only) ---
    if (!duplicateStation && !forceCreate) {
      const finalPlusCode = plusCodeInput.trim() || encodePlusCode(lat, lng, 11);
      try {
        setLoading(true);
        const excludeId = isEditMode ? editStation?.id : undefined;
        const dupeCheck = await fuelService.checkStationDuplicate(finalPlusCode, lat, lng, excludeId, formData.category);
        if (dupeCheck?.csvReference && dupeCheck.csvReference.id !== dismissedCsvId) {
          setCsvReference(mapDupePayload(dupeCheck.csvReference));
        }
        if (dupeCheck?.isDuplicate && dupeCheck.existingStation) {
          setDuplicateStation(mapDupePayload(dupeCheck.existingStation));
          setForceCreate(false);
          setLoading(false);
          setWizardStep('nearby');
          toast.warning(`Verified GOD duplicate: "${dupeCheck.existingStation.name}". Resolve below before saving.`);
          return;
        }
      } catch (err) {
        console.warn('[Submit Duplicate Guard] Non-blocking failure:', err);
      }
    }

    setLoading(true);
    try {
      const normalizedName = normalizeStationName(formData.name);
      
      const finalPlusCode = plusCodeInput.trim() || encodePlusCode(lat, lng, 11);
      
      const newStation: StationOverride = {
        name: normalizedName,
        address: formData.address || 'Address pending verification',
        brand: formData.brand || inferBrandFromName(normalizedName),
        city: formData.city || 'Unknown City',
        parish: formData.parish || 'Unknown Parish',
        country: formData.country,
        plusCode: finalPlusCode,
        geofenceRadius: geofenceRadius ?? getDefaultGeofenceRadius(finalPlusCode),
        contactInfo: {
          phone: formData.phone,
        },
        category: formData.category,
        status: (isVerifyGodFlow
          ? 'verified'
          : (isEditMode && editStation?.status) ? editStation.status : ('unverified' as LocationStatus)) as LocationStatus,
        dataSource: (isEditMode && editStation?.dataSource) ? editStation.dataSource : 'manual',
        location: { lat, lng },
      };

      if (forceCreate) {
        (newStation as any)._overrideDuplicate = true;
      }

      if (isEditMode && editStation && onUpdate) {
        await onUpdate(editStation.id, newStation);
        toast.success(isVerifyGodFlow ? 'Verified station saved to GOD list.' : 'Station updated successfully.');
      } else {
        await onAdd(newStation);
        toast.success('Station added successfully.');
      }
      onClose();
    } catch (error: any) {
      if (error.duplicate && error.existingStation) {
        const status = error.existingStation.status || 'unknown';
        if (status === 'unverified') {
          setCsvReference(mapDupePayload(error.existingStation));
          toast.info(`CSV reference nearby: "${error.existingStation.name}". Delete it or continue — nothing is copied to GOD.`);
        } else {
          setDuplicateStation(mapDupePayload(error.existingStation));
          setForceCreate(false);
          setWizardStep('nearby');
          toast.warning(`Backend GOD duplicate: "${error.existingStation.name}". Resolve below.`);
        }
      } else {
        console.error("Failed to add station:", error);
        toast.error("Failed to add station. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const needsNearbyStep = !!(duplicateStation || csvReference);
  const wizardSteps = (isVerifyGodFlow
    ? [
        ...(needsNearbyStep || wizardStep === 'nearby' ? [{ id: 'nearby' as const, label: 'Nearby' }] : []),
        { id: 'station' as const, label: 'Station' },
        { id: 'pin' as const, label: 'Pin' },
        { id: 'confirm' as const, label: 'Confirm' },
      ]
    : [
        { id: 'station' as const, label: 'Station' },
        { id: 'pin' as const, label: 'Pin' },
        { id: 'confirm' as const, label: 'Confirm' },
      ]
  );
  const stepIndex = Math.max(0, wizardSteps.findIndex((s) => s.id === wizardStep));
  const goNext = () => {
    const next = wizardSteps[stepIndex + 1];
    if (!next) return;
    // Defer so the Continue click cannot land on the Confirm "Save" button that replaces it
    window.setTimeout(() => setWizardStep(next.id), 0);
  };
  const goBack = () => {
    const prev = wizardSteps[stepIndex - 1];
    if (prev) setWizardStep(prev.id);
  };
  const canAdvanceFromStation = !!formData.name.trim();
  const canAdvanceFromPin = (() => {
    const lat = typeof formData.lat === 'number' ? formData.lat : parseFloat(String(formData.lat));
    const lng = typeof formData.lng === 'number' ? formData.lng : parseFloat(String(formData.lng));
    return !isNaN(lat) && !isNaN(lng) && (!!plusCodeInput.trim() || !!formData.address.trim());
  })();

  const resolveCsvAndContinue = async (deleteRef: boolean) => {
    if (!csvReference) {
      setWizardStep('station');
      return;
    }
    if (deleteRef) {
      setDeletingCsv(true);
      try {
        if (onDeleteCsvReference) {
          await onDeleteCsvReference(csvReference.id);
        } else {
          await fuelService.deleteStation(csvReference.id);
        }
        setDismissedCsvId(csvReference.id);
        setCsvReference(null);
        toast.success('Unverified match deleted.');
        setWizardStep('station');
      } catch (err) {
        console.error('[Delete CSV reference]', err);
        toast.error('Could not delete unverified match.');
      } finally {
        setDeletingCsv(false);
      }
      return;
    }
    setDismissedCsvId(csvReference.id);
    setCsvReference(null);
    setWizardStep('station');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px] w-[calc(100%-1.5rem)] flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 border-slate-200 shadow-xl">
        <div className="shrink-0 border-b border-slate-100 bg-white px-5 pt-5 pb-4">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold tracking-tight text-slate-900">
              {isVerifyGodFlow ? (
                <>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                    <ShieldCheckIcon className="h-4 w-4" />
                  </span>
                  Verify to GOD list
                </>
              ) : isEditMode ? (
                <>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                    <Pencil className="h-4 w-4" />
                  </span>
                  Edit station
                </>
              ) : (
                <>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                    <Plus className="h-4 w-4" />
                  </span>
                  Add CSV reference
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 leading-relaxed">
              {isVerifyGodFlow
                ? 'Your pin only. CSV nearby is a hint — never copied into GOD.'
                : isEditMode
                  ? `Editing ${editStation?.name || 'station'}.`
                  : 'Draft shelf only — use Verify from the Resolution Queue for GOD.'}
            </DialogDescription>
          </DialogHeader>

          <ol className="mt-4 flex items-center gap-1.5" aria-label="Progress">
            {wizardSteps.map((s, i) => {
              const active = s.id === wizardStep;
              const done = i < stepIndex;
              return (
                <li key={s.id} className="flex flex-1 items-center gap-1.5 min-w-0">
                  <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <div
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold transition-colors',
                        active && 'bg-emerald-600 text-white shadow-sm',
                        done && !active && 'bg-emerald-100 text-emerald-800',
                        !active && !done && 'bg-slate-100 text-slate-400',
                      )}
                    >
                      {done && !active ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    <span
                      className={cn(
                        'truncate text-[10px] font-medium',
                        active ? 'text-emerald-800' : done ? 'text-slate-600' : 'text-slate-400',
                      )}
                    >
                      {s.label}
                    </span>
                  </div>
                  {i < wizardSteps.length - 1 && (
                    <div className={cn('mb-4 h-px flex-1', done || active ? 'bg-emerald-200' : 'bg-slate-200')} />
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (wizardStep === 'confirm') {
              void handleSubmit(e);
              return;
            }
            if (wizardStep === 'station' && canAdvanceFromStation) goNext();
            else if (wizardStep === 'pin' && canAdvanceFromPin) goNext();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            {wizardStep === 'nearby' && (
              <div className="space-y-4 animate-in fade-in-0 slide-in-from-right-2 duration-200">
                {duplicateStation ? (
                  <div className="rounded-xl border border-red-200 bg-red-50/80 p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
                        <ShieldAlert className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <h3 className="text-sm font-semibold text-red-900">Already on GOD list</h3>
                        <p className="text-xs text-red-800/90 leading-relaxed">
                          <span className="font-medium">{duplicateStation.name}</span>
                          {' '}is {duplicateStation.distance}m away (Verified).
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      {onMergeIntoExisting && (
                        <Button
                          type="button"
                          className="h-11 justify-start gap-3 bg-emerald-600 hover:bg-emerald-700 text-white"
                          disabled={loading}
                          onClick={async () => {
                            setLoading(true);
                            try {
                              await onMergeIntoExisting(duplicateStation.id);
                              toast.success(`Merged into "${duplicateStation.name}".`);
                              onClose();
                            } catch (err) {
                              console.error('[Merge Into Existing] Failed:', err);
                              toast.error('Failed to merge into GOD station.');
                            } finally {
                              setLoading(false);
                            }
                          }}
                        >
                          <Merge className="h-4 w-4 shrink-0" />
                          <span className="text-left">
                            <span className="block text-sm font-semibold">Merge into this GOD station</span>
                            <span className="block text-[11px] font-normal text-emerald-100">Attach this stop — recommended</span>
                          </span>
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 justify-start gap-3 border-slate-200"
                        onClick={() => {
                          setForceCreate(true);
                          setDuplicateStation(null);
                          setWizardStep('station');
                          toast.info('Creating a separate GOD station.');
                        }}
                      >
                        <ShieldCheckIcon className="h-4 w-4 shrink-0 text-slate-600" />
                        <span className="text-left">
                          <span className="block text-sm font-semibold text-slate-800">Different place — continue</span>
                          <span className="block text-[11px] font-normal text-slate-500">Create a new GOD pin nearby</span>
                        </span>
                      </Button>
                    </div>
                  </div>
                ) : csvReference ? (
                  <div className="space-y-5 animate-in fade-in-0 duration-200">
                    <div className="text-center space-y-1.5 px-2">
                      <p className="text-sm font-semibold text-slate-900">Found in Unverified</p>
                      <p className="text-sm text-slate-700 font-medium truncate">{csvReference.name}</p>
                      <p className="text-xs text-slate-500">{csvReference.distance}m away · not on your GOD list</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-20 flex-col gap-1.5 border-red-200 bg-red-50 text-red-800 hover:bg-red-100 hover:text-red-900"
                        disabled={deletingCsv || loading}
                        onClick={() => void resolveCsvAndContinue(true)}
                      >
                        {deletingCsv ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Trash2 className="h-5 w-5" />
                        )}
                        <span className="text-sm font-semibold">Delete</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-20 flex-col gap-1.5 border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                        disabled={deletingCsv || loading}
                        onClick={() => void resolveCsvAndContinue(false)}
                      >
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        <span className="text-sm font-semibold">Keep</span>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 text-sm text-emerald-900">
                    No nearby conflicts. Continue to name your station.
                    <div className="mt-3">
                      <Button type="button" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setWizardStep('station')}>
                        Continue
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {wizardStep === 'station' && (
              <div className="space-y-4 animate-in fade-in-0 slide-in-from-right-2 duration-200">
                {forceCreate && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                    Creating a separate GOD station near an existing Verified pin.
                  </p>
                )}
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-xs font-medium text-slate-700">Station name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g. Total Spanish Town Road"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="h-11"
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="brand" className="text-xs font-medium text-slate-700">Brand</Label>
                    <Select value={formData.brand} onValueChange={(value) => setFormData({ ...formData, brand: value })}>
                      <SelectTrigger id="brand" className="h-11">
                        <SelectValue placeholder={fetchingCompanies ? 'Loading…' : 'Select brand'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Independent">Independent</SelectItem>
                        {parentCompanies.map((company) => (
                          <SelectItem key={company.id} value={company.name}>{company.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category" className="text-xs font-medium text-slate-700">Category</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value: 'fuel' | 'non_fuel') => setFormData({ ...formData, category: value })}
                    >
                      <SelectTrigger id="category" className="h-11">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fuel">Fuel Station</SelectItem>
                        <SelectItem value="non_fuel">Non-Fuel</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 'pin' && (
              <div className="space-y-4 animate-in fade-in-0 slide-in-from-right-2 duration-200">
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="plusCode" className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                      <Grid3X3 className="h-3.5 w-3.5 text-slate-500" />
                      Plus Code *
                    </Label>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={handleVerifyFromPlusCode}
                      disabled={geocoding || !plusCodeInput.trim()}
                    >
                      {geocoding ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Navigation className="h-3.5 w-3.5 mr-1.5" />}
                      Verify GPS
                    </Button>
                  </div>
                  <Input
                    id="plusCode"
                    placeholder="e.g. 7795X453+XH4"
                    value={plusCodeInput}
                    onChange={(e) => handlePlusCodeChange(e.target.value.toUpperCase())}
                    className={cn(
                      'h-11 font-mono tracking-wide',
                      isVerified && plusCodeValid === true && 'border-emerald-300 bg-emerald-50/40',
                      plusCodeValid === false && 'border-red-300 bg-red-50/30',
                    )}
                  />
                  <p className="text-[11px] text-slate-500">Paste from Google Maps, then Verify GPS to fill address &amp; coords.</p>
                  {checkingDuplicate && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Checking GOD list…
                    </div>
                  )}
                  {isVerified && (
                    <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      GPS verified
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="address" className="text-xs font-medium text-slate-700">Street address</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px] text-slate-600"
                      onClick={handleVerifyFromAddress}
                      disabled={addressGeocoding || !formData.address}
                    >
                      {addressGeocoding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
                      Lookup
                    </Button>
                  </div>
                  <Input
                    id="address"
                    placeholder="Auto-filled from Plus Code"
                    value={formData.address}
                    onChange={(e) => {
                      setFormData({ ...formData, address: e.target.value });
                      if (isVerified && !plusCodeInput.trim()) setIsVerified(false);
                    }}
                    className="h-10"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="city" className="text-xs font-medium text-slate-700">City</Label>
                    <Input id="city" placeholder="Kingston" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="h-10" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="parish" className="text-xs font-medium text-slate-700">Parish</Label>
                    <Input id="parish" placeholder="St. Andrew" value={formData.parish} onChange={(e) => setFormData({ ...formData, parish: e.target.value })} className="h-10" />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="lat" className="text-[10px] uppercase tracking-wide text-slate-500">Latitude</Label>
                    <Input id="lat" type="number" step="any" value={formData.lat} onChange={(e) => setFormData({ ...formData, lat: parseFloat(e.target.value) || '' })} className="h-9 font-mono text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="lng" className="text-[10px] uppercase tracking-wide text-slate-500">Longitude</Label>
                    <Input id="lng" type="number" step="any" value={formData.lng} onChange={(e) => setFormData({ ...formData, lng: parseFloat(e.target.value) || '' })} className="h-9 font-mono text-xs" />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-slate-500" />
                      Geofence
                    </Label>
                    <span className="text-sm font-semibold tabular-nums text-slate-800">
                      {geofenceRadius ?? getDefaultGeofenceRadius(plusCodeInput || undefined)}m
                    </span>
                  </div>
                  <Slider
                    value={[geofenceRadius ?? getDefaultGeofenceRadius(plusCodeInput || undefined)]}
                    onValueChange={([val]) => setGeofenceRadius(val)}
                    min={20}
                    max={500}
                    step={5}
                    className="[&_[data-slot=slider-range]]:bg-emerald-600 [&_[data-slot=slider-thumb]]:border-emerald-600"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>20m</span>
                    <span>Default {getDefaultGeofenceRadius(plusCodeInput || undefined)}m</span>
                    <span>500m</span>
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 'confirm' && (
              <div className="space-y-4 animate-in fade-in-0 slide-in-from-right-2 duration-200">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Ready to save</h3>
                  <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 text-xs">
                    <dt className="text-slate-500">Name</dt>
                    <dd className="font-medium text-slate-900 truncate">{formData.name || '—'}</dd>
                    <dt className="text-slate-500">Brand</dt>
                    <dd className="text-slate-800">{formData.brand || 'Independent'}</dd>
                    <dt className="text-slate-500">Plus Code</dt>
                    <dd className="font-mono text-slate-800 truncate">{plusCodeInput || '—'}</dd>
                    <dt className="text-slate-500">Address</dt>
                    <dd className="text-slate-800 truncate">{formData.address || '—'}</dd>
                    <dt className="text-slate-500">GPS</dt>
                    <dd className="font-mono text-slate-800">
                      {formData.lat !== '' && formData.lng !== '' ? `${formData.lat}, ${formData.lng}` : '—'}
                    </dd>
                    <dt className="text-slate-500">Geofence</dt>
                    <dd className="text-slate-800">{geofenceRadius ?? getDefaultGeofenceRadius(plusCodeInput || undefined)}m</dd>
                  </dl>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-xs font-medium text-slate-700">Phone (optional)</Label>
                    <Input id="phone" placeholder="876-…" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="h-10" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country" className="text-xs font-medium text-slate-700">Country</Label>
                    <Input id="country" value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })} className="h-10" />
                  </div>
                </div>
                {isVerifyGodFlow && (
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Saves as <span className="font-medium text-emerald-800">Verified GOD</span> from this form only.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0 flex items-center justify-between gap-2 border-t border-slate-100 bg-white px-5 py-3.5">
            <Button
              type="button"
              variant="ghost"
              className="text-slate-600"
              disabled={loading}
              onClick={() => {
                if (stepIndex <= 0) {
                  onClose();
                  return;
                }
                goBack();
              }}
            >
              {stepIndex <= 0 ? 'Cancel' : 'Back'}
            </Button>

            {wizardStep === 'nearby' ? null : wizardStep === 'confirm' ? (
              <Button
                type="button"
                disabled={loading || !!duplicateStation}
                className={cn(
                  'min-w-[140px]',
                  forceCreate ? 'bg-amber-600 hover:bg-amber-700' : isVerifyGodFlow ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-900 hover:bg-slate-800',
                )}
                onClick={() => void handleSubmit()}
              >
                {loading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
                ) : forceCreate ? (
                  <><AlertTriangle className="mr-1.5 h-4 w-4" />Save separate</>
                ) : isVerifyGodFlow ? (
                  'Save to GOD list'
                ) : isEditMode ? (
                  'Update station'
                ) : (
                  'Add to CSV shelf'
                )}
              </Button>
            ) : (
              <Button
                type="button"
                className="min-w-[120px] bg-emerald-600 hover:bg-emerald-700"
                disabled={wizardStep === 'station' ? !canAdvanceFromStation : !canAdvanceFromPin}
                onMouseDown={(e) => e.preventDefault()}
                onClick={goNext}
              >
                Continue
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
