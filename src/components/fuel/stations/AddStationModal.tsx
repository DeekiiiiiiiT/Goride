import React, { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import { StationProfile, StationOverride, LocationStatus } from '../../../types/station';
import { generateStationId, normalizeStationName, inferBrandFromName } from '../../../utils/stationUtils';
import { encodePlusCode, decodePlusCode, isValidPlusCode, isFullPlusCode, getPlusCodePrecision, recoverShortCode, extractLocality, extractCodePortion, getDefaultGeofenceRadius } from '../../../utils/plusCode';
import { fuelService } from '../../../services/fuelService';
import { Plus, X, Loader2, Building2, MapPin, Search, CheckCircle2, Hash, ArrowDownUp, Info, Grid3X3, Navigation, Globe, Pencil, Copy, Check } from 'lucide-react';
import { Slider } from '../../ui/slider';
import { toast } from 'sonner@2.0.3';
import { AlertTriangle, Merge, ShieldAlert, ShieldCheck as ShieldCheckIcon } from 'lucide-react';
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
  onMergeIntoExisting?: (existingStationId: string) => Promise<void>;
  /** Phase 7: Pre-populated nearby station from backend enrichment */
  initialNearbyStation?: DuplicateStationInfo | null;
}

export function AddStationModal({ isOpen, onClose, onAdd, editStation, onUpdate, onMergeIntoExisting, initialNearbyStation }: AddStationModalProps) {
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

  // --- Duplicate detection state (Phase 4) ---
  const [duplicateStation, setDuplicateStation] = useState<DuplicateStationInfo | null>(initialNearbyStation || null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [forceCreate, setForceCreate] = useState(false);
  
  const isEditMode = !!editStation;

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

  // Reset form on open
  useEffect(() => {
    if (isOpen) {
      setShowCopyField(false);
      setDuplicateStation(initialNearbyStation || null);
      setCheckingDuplicate(false);
      setForceCreate(false);
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
    setForceCreate(false);
    
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
    try {
      const excludeId = isEditMode ? editStation?.id : undefined;
      const dupeCheck = await fuelService.checkStationDuplicate(plusCode, lat, lng, excludeId, formData.category);
      if (dupeCheck?.isDuplicate && dupeCheck.existingStation) {
        setDuplicateStation({
          id: dupeCheck.existingStation.id,
          name: dupeCheck.existingStation.name,
          plusCode: dupeCheck.existingStation.plusCode || '',
          address: dupeCheck.existingStation.address || '',
          brand: dupeCheck.existingStation.brand || '',
          status: dupeCheck.existingStation.status || 'unknown',
          distance: dupeCheck.existingStation.distance ?? 0,
          matchType: dupeCheck.existingStation.matchType || 'geofence',
          geofenceRadius: dupeCheck.existingStation.geofenceRadius,
        });
        setForceCreate(false);
        console.log(`[Duplicate Check] Match found: ${dupeCheck.existingStation.name} (${dupeCheck.existingStation.matchType}, ${dupeCheck.existingStation.distance}m)`);
      } else {
        setDuplicateStation(null);
      }
    } catch (err) {
      console.warn('[Duplicate Check] Non-blocking failure:', err);
      // Don't block the user — verification still succeeded
    } finally {
      setCheckingDuplicate(false);
    }
  }, [isEditMode, editStation?.id, formData.category]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

    // --- Final duplicate guard (Phase 5) ---
    // If the user didn't go through Verify GPS (skipped straight to submit), run a synchronous check now
    if (!duplicateStation && !forceCreate) {
      const finalPlusCode = plusCodeInput.trim() || encodePlusCode(lat, lng, 11);
      try {
        setLoading(true);
        const excludeId = isEditMode ? editStation?.id : undefined;
        const dupeCheck = await fuelService.checkStationDuplicate(finalPlusCode, lat, lng, excludeId, formData.category);
        if (dupeCheck?.isDuplicate && dupeCheck.existingStation) {
          // Duplicate found at submit time — show warning and abort save
          setDuplicateStation({
            id: dupeCheck.existingStation.id,
            name: dupeCheck.existingStation.name,
            plusCode: dupeCheck.existingStation.plusCode || '',
            address: dupeCheck.existingStation.address || '',
            brand: dupeCheck.existingStation.brand || '',
            status: dupeCheck.existingStation.status || 'unknown',
            distance: dupeCheck.existingStation.distance ?? 0,
            matchType: dupeCheck.existingStation.matchType || 'geofence',
            geofenceRadius: dupeCheck.existingStation.geofenceRadius,
          });
          setForceCreate(false);
          setLoading(false);
          toast.warning(`Duplicate detected: "${dupeCheck.existingStation.name}". Resolve below before saving.`);
          return; // Abort — user must choose Merge or Create Anyway
        }
      } catch (err) {
        console.warn('[Submit Duplicate Guard] Non-blocking failure:', err);
        // Proceed with save — don't block on network errors
      }
    }

    setLoading(true);
    try {
      const normalizedName = normalizeStationName(formData.name);
      
      // Auto-generate Plus Code if not provided but coords exist
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
        status: (isEditMode && editStation?.status) ? editStation.status : ('unverified' as LocationStatus),
        dataSource: (isEditMode && editStation?.dataSource) ? editStation.dataSource : 'manual',
        location: { lat, lng },
      };

      // If user explicitly chose "Create Anyway", pass the override flag so the backend skips its own dupe check
      if (forceCreate) {
        (newStation as any)._overrideDuplicate = true;
      }

      if (isEditMode && editStation && onUpdate) {
        await onUpdate(editStation.id, newStation);
        toast.success("Station updated successfully.");
      } else {
        await onAdd(newStation);
        toast.success("Station added successfully.");
      }
      onClose();
    } catch (error: any) {
      // Handle 409 duplicate errors from the backend (belt-and-suspenders with the backend guard)
      if (error.duplicate && error.existingStation) {
        setDuplicateStation({
          id: error.existingStation.id,
          name: error.existingStation.name,
          plusCode: error.existingStation.plusCode || '',
          address: error.existingStation.address || '',
          brand: error.existingStation.brand || '',
          status: error.existingStation.status || 'unknown',
          distance: error.existingStation.distance ?? 0,
          matchType: error.existingStation.matchType || 'geofence',
          geofenceRadius: error.existingStation.geofenceRadius,
        });
        setForceCreate(false);
        toast.warning(`Backend duplicate guard: "${error.existingStation.name}". Resolve below.`);
      } else {
        console.error("Failed to add station:", error);
        toast.error("Failed to add station. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEditMode ? (
              <>
                <Pencil className="h-5 w-5 text-amber-600" />
                Edit Station — Verify Location
              </>
            ) : (
              <>
                <Plus className="h-5 w-5 text-blue-600" />
                Add New Station (Unverified)
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isEditMode ? (
              <>
                Edit <span className="font-semibold">{editStation?.name}</span> and verify its location. 
                Enter or update the <span className="font-semibold text-violet-600">Plus Code</span>, then click "Verify GPS" to re-populate address &amp; coordinates.
              </>
            ) : (
              <>
                Manually register a gas station in the unverified management queue. 
                Enter a <span className="font-semibold text-violet-600">Plus Code</span> for highest accuracy, then click "Verify GPS" to auto-populate all location fields.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Station Name */}
            <div className="col-span-2 space-y-2">
              <Label htmlFor="name">Gas Station Name*</Label>
              <Input
                id="name"
                placeholder="e.g. Total Liguanea"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            {/* Brand / Category */}
            <div className="space-y-2">
              <Label htmlFor="brand">Brand / Parent Company</Label>
              <Select
                value={formData.brand}
                onValueChange={(value) => setFormData({ ...formData, brand: value })}
              >
                <SelectTrigger id="brand">
                  <SelectValue placeholder={fetchingCompanies ? "Loading..." : "Select brand"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Independent">Independent</SelectItem>
                  {parentCompanies.map((company) => (
                    <SelectItem key={company.id} value={company.name}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value: 'fuel' | 'non_fuel') =>
                  setFormData({ ...formData, category: value })
                }
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fuel">Fuel Station</SelectItem>
                  <SelectItem value="non_fuel">Non-Fuel Location</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* ===== PLUS CODE SECTION — PRIMARY LOCATION INPUT ===== */}
            <div className="col-span-2 space-y-2">
              <div className="bg-gradient-to-r from-violet-50 to-indigo-50 p-3 rounded-lg border-2 border-violet-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Grid3X3 className="h-3.5 w-3.5 text-violet-600" />
                    <Label htmlFor="plusCode" className="text-[10px] uppercase text-violet-700 font-bold tracking-wide">
                      Plus Code (Open Location Code)*
                    </Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-violet-400 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[280px] text-xs">
                          <p className="font-semibold mb-1">Plus Code = Primary Location</p>
                          <p>Enter the full Plus Code from Google Maps (e.g. 7795X453+XH4). This is more precise than a street address.</p>
                          <p className="mt-1 font-medium">How to find it:</p>
                          <ol className="list-decimal pl-3 mt-0.5 space-y-0.5 text-muted-foreground">
                            <li>Open Google Maps</li>
                            <li>Tap/click the location</li>
                            <li>The Plus Code appears near the coordinates</li>
                          </ol>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="flex items-center gap-2">
                    {plusCodeSynced && isVerified && (
                      <div className="flex items-center gap-1 text-[9px] text-emerald-600 font-medium">
                        <CheckCircle2 className="h-3 w-3" />
                        Verified
                      </div>
                    )}
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 text-[10px] text-violet-700 hover:text-violet-800 hover:bg-violet-100 px-2 font-semibold"
                      onClick={handleVerifyFromPlusCode}
                      disabled={geocoding || !plusCodeInput.trim()}
                    >
                      {geocoding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Navigation className="h-3 w-3 mr-1" />}
                      Verify GPS
                    </Button>
                  </div>
                </div>
                <div className="relative">
                  <Input
                    id="plusCode"
                    placeholder="e.g. 7795X453+XH4"
                    value={plusCodeInput}
                    onChange={(e) => handlePlusCodeChange(e.target.value.toUpperCase())}
                    className={`h-10 text-sm font-mono tracking-wider pl-3 pr-20 ${
                      isVerified && plusCodeValid === true 
                        ? 'border-emerald-300 bg-emerald-50/30 focus-visible:ring-emerald-300' 
                        : plusCodeValid === true 
                          ? 'border-violet-200 bg-white focus-visible:ring-violet-300' 
                          : plusCodeValid === false 
                            ? 'border-red-200 bg-red-50/30 focus-visible:ring-red-300' 
                            : 'bg-white'
                    }`}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {plusCodeValid === true && plusCodeInput && (
                      <span className="text-[8px] font-bold uppercase text-violet-500 bg-violet-50 px-1.5 py-0.5 rounded">
                        {getPlusCodePrecision(plusCodeInput)}
                      </span>
                    )}
                    {plusCodeValid === false && (
                      <span className="text-[8px] font-bold uppercase text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
                        Invalid
                      </span>
                    )}
                    {isVerified && plusCodeValid === true && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    )}
                  </div>
                </div>
                <p className="text-[8px] text-violet-400 italic mt-1.5">
                  Enter the full Plus Code from Google Maps, then click "Verify GPS" to auto-populate address &amp; coordinates.
                </p>
              </div>
            </div>

            {/* ===== STREET ADDRESS — SECONDARY (Auto-populated or manual) ===== */}
            <div className="col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="address" className="flex items-center gap-1.5">
                  Street Address
                  {!plusCodeInput.trim() && <span className="text-[9px] text-amber-600 font-normal">(or enter address as fallback)</span>}
                </Label>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-[10px] text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2"
                  onClick={handleVerifyFromAddress}
                  disabled={addressGeocoding || !formData.address}
                >
                  {addressGeocoding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
                  Lookup Address
                </Button>
              </div>
              <div className="relative">
                <Input
                  id="address"
                  placeholder="Auto-populated from Plus Code, or enter manually"
                  value={formData.address}
                  onChange={(e) => {
                    setFormData({ ...formData, address: e.target.value });
                    if (isVerified && !plusCodeInput.trim()) setIsVerified(false);
                  }}
                  className={isVerified && formData.address ? "pr-10 border-emerald-200 bg-emerald-50/30" : ""}
                />
                {isVerified && formData.address && (
                  <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                )}
              </div>
            </div>

            {/* City / Parish */}
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                placeholder="e.g. Kingston"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="parish">Parish</Label>
              <Input
                id="parish"
                placeholder="e.g. St. Andrew"
                value={formData.parish}
                onChange={(e) => setFormData({ ...formData, parish: e.target.value })}
              />
            </div>

            {/* GPS Coordinates Section — Auto-populated from Plus Code */}
            <div className="col-span-2 grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
               <div className="col-span-2 flex items-center justify-between mb-0.5">
                 <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wide">GPS Coordinates</span>
                 {(formData.lat !== '' && formData.lng !== '') && (
                   <Button
                     type="button"
                     variant="ghost"
                     size="sm"
                     className={`h-6 text-[10px] px-2 gap-1 transition-colors ${
                       showCopyField
                         ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-50 hover:text-emerald-600'
                         : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
                     }`}
                     onClick={() => {
                       setShowCopyField(true);
                       setTimeout(() => {
                         copyInputRef.current?.focus();
                         copyInputRef.current?.select();
                       }, 100);
                     }}
                   >
                     {showCopyField ? (
                       <>
                         <Check className="h-3 w-3" />
                         Copied!
                       </>
                     ) : (
                       <>
                         <Copy className="h-3 w-3" />
                         Copy
                       </>
                     )}
                   </Button>
                 )}
               </div>
               <div className="space-y-1.5">
                  <Label htmlFor="lat" className="text-[10px] uppercase text-slate-500 font-bold">Latitude</Label>
                  <Input
                    id="lat"
                    type="number"
                    step="any"
                    placeholder="Auto from Plus Code"
                    value={formData.lat}
                    onChange={(e) => setFormData({ ...formData, lat: parseFloat(e.target.value) || '' })}
                    className={`h-8 text-xs font-mono ${isVerified ? 'border-emerald-200 bg-emerald-50/30' : ''}`}
                  />
               </div>
               <div className="space-y-1.5">
                  <Label htmlFor="lng" className="text-[10px] uppercase text-slate-500 font-bold">Longitude</Label>
                  <Input
                    id="lng"
                    type="number"
                    step="any"
                    placeholder="Auto from Plus Code"
                    value={formData.lng}
                    onChange={(e) => setFormData({ ...formData, lng: parseFloat(e.target.value) || '' })}
                    className={`h-8 text-xs font-mono ${isVerified ? 'border-emerald-200 bg-emerald-50/30' : ''}`}
                  />
               </div>
               <p className="col-span-2 text-[9px] text-slate-400 italic">
                  Coordinates are auto-populated when you verify a Plus Code. You can also enter them manually.
               </p>
               {showCopyField && (
                 <div className="col-span-2 mt-2">
                   <Input
                     ref={copyInputRef}
                     type="text"
                     value={`Latitude: ${formData.lat}, Longitude: ${formData.lng}`}
                     readOnly
                     className="h-8 text-xs font-mono border-emerald-200 bg-emerald-50/30"
                   />
                 </div>
               )}
            </div>

            {/* ===== GEOFENCE RADIUS SLIDER ===== */}
            <div className="col-span-2 space-y-2">
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-3 rounded-lg border border-amber-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-amber-600" />
                    <Label className="text-[10px] uppercase text-amber-700 font-bold tracking-wide">
                      Geofence Radius
                    </Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-amber-400 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[280px] text-xs">
                          <p className="font-semibold mb-1">Spatial Match Boundary</p>
                          <p>The geofence radius defines the circular boundary around the Plus Code anchor point. 
                             Fuel transactions must occur within this radius to be considered spatially valid.</p>
                          <p className="mt-1 text-muted-foreground">Default is calculated from Plus Code precision. 
                             Tighter Plus Codes allow smaller radii.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-amber-800 tabular-nums">
                      {geofenceRadius ?? getDefaultGeofenceRadius(plusCodeInput || undefined)}m
                    </span>
                    {geofenceRadius !== null && geofenceRadius !== getDefaultGeofenceRadius(plusCodeInput || undefined) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-5 text-[9px] text-amber-600 hover:text-amber-700 hover:bg-amber-100 px-1.5"
                        onClick={() => setGeofenceRadius(null)}
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                </div>
                <Slider
                  value={[geofenceRadius ?? getDefaultGeofenceRadius(plusCodeInput || undefined)]}
                  onValueChange={([val]) => setGeofenceRadius(val)}
                  min={20}
                  max={500}
                  step={5}
                  className="[&_[data-slot=slider-track]]:h-2 [&_[data-slot=slider-range]]:bg-amber-500 [&_[data-slot=slider-thumb]]:border-amber-500 [&_[data-slot=slider-thumb]]:size-4"
                />
                <div className="flex justify-between mt-1.5">
                  <span className="text-[8px] text-amber-400">20m (tight)</span>
                  <span className="text-[8px] text-amber-400">
                    Default: {getDefaultGeofenceRadius(plusCodeInput || undefined)}m
                    {plusCodeInput && plusCodeValid ? ` (${getPlusCodePrecision(plusCodeInput)} precision)` : ' (no Plus Code)'}
                  </span>
                  <span className="text-[8px] text-amber-400">500m (wide)</span>
                </div>
              </div>
            </div>

            {/* ===== DUPLICATE STATION WARNING (Phase 4) ===== */}
            {duplicateStation && (
              <div className="col-span-2 animate-in slide-in-from-top-2 duration-300">
                <div className="bg-gradient-to-r from-red-50 to-orange-50 p-4 rounded-lg border-2 border-red-200 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 mt-0.5">
                      <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
                        <ShieldAlert className="h-4.5 w-4.5 text-red-600" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-red-700 mb-1">Duplicate Station Detected</h4>
                      <p className="text-xs text-red-600 leading-relaxed">
                        {duplicateStation.matchType === 'pluscode' ? (
                          <>
                            A station with Plus Code <span className="font-mono font-bold">{duplicateStation.plusCode}</span> already exists:{' '}
                            <span className="font-semibold">{duplicateStation.name}</span>
                            {duplicateStation.address && <span className="text-red-500"> ({duplicateStation.address})</span>}
                          </>
                        ) : (
                          <>
                            The coordinates fall within <span className="font-bold">{duplicateStation.distance}m</span> of existing station{' '}
                            <span className="font-semibold">{duplicateStation.name}</span>
                            {duplicateStation.address && <span className="text-red-500"> ({duplicateStation.address})</span>}
                            <span className="text-red-500"> — geofence: {duplicateStation.geofenceRadius || 150}m</span>
                          </>
                        )}
                      </p>

                      {/* Existing station details */}
                      <div className="mt-2 bg-white/60 rounded-md p-2 border border-red-100">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                          <div>
                            <span className="text-red-400 uppercase font-bold tracking-wide">Station</span>
                            <p className="text-red-700 font-medium truncate">{duplicateStation.name}</p>
                          </div>
                          <div>
                            <span className="text-red-400 uppercase font-bold tracking-wide">Brand</span>
                            <p className="text-red-700 font-medium">{duplicateStation.brand || 'Unknown'}</p>
                          </div>
                          <div>
                            <span className="text-red-400 uppercase font-bold tracking-wide">Status</span>
                            <p className={cn(
                              "font-medium capitalize text-[11px] inline-flex items-center gap-1 mt-0.5",
                              duplicateStation.status === 'verified' ? 'text-emerald-700' :
                              duplicateStation.status === 'unverified' ? 'text-amber-700' :
                              'text-red-700'
                            )}>
                              <span className={cn(
                                "inline-block h-1.5 w-1.5 rounded-full",
                                duplicateStation.status === 'verified' ? 'bg-emerald-500' :
                                duplicateStation.status === 'unverified' ? 'bg-amber-500' :
                                'bg-red-500'
                              )} />
                              {duplicateStation.status}
                              {duplicateStation.status === 'verified' && (
                                <span className="text-[9px] text-emerald-500 font-normal">(merge recommended)</span>
                              )}
                            </p>
                          </div>
                          <div>
                            <span className="text-red-400 uppercase font-bold tracking-wide">Distance</span>
                            <p className="text-red-700 font-medium">{duplicateStation.distance}m ({duplicateStation.matchType})</p>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="mt-3 space-y-2">
                        <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide">Choose an action:</p>
                        <div className="flex flex-col gap-2">
                          {onMergeIntoExisting && (
                            <Button
                              type="button"
                              size="sm"
                              className="h-auto py-2 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-2 justify-start w-full"
                              onClick={async () => {
                                setLoading(true);
                                try {
                                  await onMergeIntoExisting(duplicateStation.id);
                                  toast.success(`Merged into "${duplicateStation.name}" successfully.`);
                                  onClose();
                                } catch (err) {
                                  console.error('[Merge Into Existing] Failed:', err);
                                  toast.error('Failed to merge into existing station.');
                                } finally {
                                  setLoading(false);
                                }
                              }}
                              disabled={loading}
                            >
                              <Merge className="h-4 w-4 shrink-0" />
                              <div className="text-left">
                                <span className="font-semibold block">Merge Into {duplicateStation.name.length > 25 ? duplicateStation.name.slice(0, 25) + '...' : duplicateStation.name}</span>
                                <span className="text-emerald-200 text-[10px] font-normal block mt-0.5">Combine this data into the existing station record</span>
                              </div>
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-auto py-2 px-3 text-xs border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-900 hover:border-amber-400 gap-2 justify-start w-full"
                            onClick={() => {
                              setForceCreate(true);
                              setDuplicateStation(null);
                              toast.info('Override accepted — this is a separate station. Click the save button to confirm.');
                            }}
                          >
                            <ShieldCheckIcon className="h-4 w-4 shrink-0 text-amber-600" />
                            <div className="text-left">
                              <span className="font-semibold block">Not a Duplicate — Create as Separate Station</span>
                              <span className="text-amber-600 text-[10px] font-normal block mt-0.5">I've confirmed these are different locations that happen to be nearby</span>
                            </div>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Duplicate check in progress indicator */}
            {checkingDuplicate && (
              <div className="col-span-2 flex items-center justify-center gap-2 py-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
                <span className="text-xs text-violet-600 font-medium">Checking for duplicate stations...</span>
              </div>
            )}

            {/* Telephone / Country */}
            <div className="space-y-2">
              <Label htmlFor="phone">Telephone</Label>
              <Input
                id="phone"
                placeholder="e.g. 876-123-4567"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !!duplicateStation}
              className={
                forceCreate
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : duplicateStation
                    ? 'bg-red-400 cursor-not-allowed opacity-60'
                    : 'bg-blue-600 hover:bg-blue-700'
              }
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : forceCreate ? (
                <>
                  <AlertTriangle className="mr-1.5 h-4 w-4" />
                  {isEditMode ? 'Update Anyway (Override)' : 'Create Anyway (Override)'}
                </>
              ) : duplicateStation ? (
                'Resolve Duplicate First'
              ) : isEditMode ? (
                'Update Station'
              ) : (
                'Add Station'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}