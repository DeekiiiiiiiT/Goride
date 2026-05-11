import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Loader2, MapPin, Settings, FileText, Building2, Grid3X3, Navigation, Search, CheckCircle2, Info, Copy, Check } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { api } from '../../services/api';
import { TollPlaza, TollDirection, TollPlazaStatus } from '../../types/toll';
import {
  encodePlusCode,
  decodePlusCode,
  isValidPlusCode,
  isFullPlusCode,
  getPlusCodePrecision,
  recoverShortCode,
  extractLocality,
  extractCodePortion,
  getDefaultGeofenceRadius,
} from '../../utils/plusCode';
import { fuelService } from '../../services/fuelService';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Slider } from '../ui/slider';

// ─── Props ──────────────────────────────────────────────────────────────────
interface AddTollPlazaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingPlaza?: TollPlaza | null;
}

// ─── Defaults & Options ─────────────────────────────────────────────────────
const DIRECTION_OPTIONS: TollDirection[] = [
  'Eastbound', 'Westbound', 'Northbound', 'Southbound', 'Both', 'Unknown',
];

const OPERATOR_SUGGESTIONS = [
  'TransJamaican Highway',
  'Jamaica North South Highway Company Limited',
  'NROCC',
  'Other',
];

const STATUS_OPTIONS: { value: TollPlazaStatus; label: string }[] = [
  { value: 'unverified', label: 'Unverified' },
  { value: 'verified', label: 'Verified' },
  { value: 'learnt', label: 'Learnt' },
];

const OPERATIONAL_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'under_construction', label: 'Under Construction' },
];

interface FormState {
  name: string;
  highway: string;
  direction: TollDirection;
  operator: string;
  lat: string;
  lng: string;
  plusCode: string;
  parish: string;
  address: string;
  geofenceRadius: string;
  status: TollPlazaStatus;
  operationalStatus: string;
  notes: string;
}

const INITIAL_FORM: FormState = {
  name: '',
  highway: '',
  direction: 'Both',
  operator: '',
  lat: '',
  lng: '',
  plusCode: '',
  parish: '',
  address: '',
  geofenceRadius: '200',
  status: 'unverified',
  operationalStatus: 'active',
  notes: '',
};

// ─── Component ──────────────────────────────────────────────────────────────
export function AddTollPlazaModal({ isOpen, onClose, onSaved, editingPlaza }: AddTollPlazaModalProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  // ─── Phase 10A: Geo-location state ──────────────────────────────────────
  const [geocoding, setGeocoding] = useState(false);
  const [addressGeocoding, setAddressGeocoding] = useState(false);
  const [plusCodeValid, setPlusCodeValid] = useState<boolean | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [plusCodeSynced, setPlusCodeSynced] = useState(false);
  const [geofenceRadiusNum, setGeofenceRadiusNum] = useState<number | null>(null);
  const [showCopyField, setShowCopyField] = useState(false);
  const copyInputRef = React.useRef<HTMLInputElement>(null);

  const isEditMode = !!editingPlaza;

  // Reset / populate form when modal opens
  useEffect(() => {
    if (!isOpen) return;

    // Reset geo-location state
    setGeocoding(false);
    setAddressGeocoding(false);
    setShowCopyField(false);

    if (editingPlaza) {
      setForm({
        name: editingPlaza.name || '',
        highway: editingPlaza.highway || '',
        direction: editingPlaza.direction || 'Both',
        operator: typeof editingPlaza.operator === 'string' ? editingPlaza.operator : '',
        lat: editingPlaza.location?.lat != null ? String(editingPlaza.location.lat) : '',
        lng: editingPlaza.location?.lng != null ? String(editingPlaza.location.lng) : '',
        plusCode: editingPlaza.plusCode || '',
        parish: editingPlaza.parish || '',
        address: editingPlaza.address || '',
        geofenceRadius: editingPlaza.geofenceRadius != null ? String(editingPlaza.geofenceRadius) : '200',
        status: editingPlaza.status || 'unverified',
        operationalStatus: editingPlaza.operationalStatus || 'active',
        notes: editingPlaza.notes || '',
      });
      setPlusCodeValid(editingPlaza.plusCode ? true : null);
      setPlusCodeSynced(false);
      setIsVerified(false);
      setGeofenceRadiusNum(editingPlaza.geofenceRadius ?? null);
    } else {
      setForm(INITIAL_FORM);
      setPlusCodeValid(null);
      setPlusCodeSynced(false);
      setIsVerified(false);
      setGeofenceRadiusNum(null);
    }
    setErrors({});
  }, [isOpen, editingPlaza]);

  // ─── Phase 10A: Plus Code real-time validation ────────────────────────────
  const handlePlusCodeChange = useCallback((value: string) => {
    setForm(prev => ({ ...prev, plusCode: value }));
    setIsVerified(false);
    setPlusCodeSynced(false);
    // Clear location validation error when user starts typing
    setErrors(prev => {
      if (!prev.plusCode) return prev;
      const next = { ...prev };
      delete next.plusCode;
      return next;
    });

    const trimmed = value.trim();
    if (!trimmed) {
      setPlusCodeValid(null);
      return;
    }

    const codePart = extractCodePortion(trimmed);
    const valid = isValidPlusCode(codePart);
    setPlusCodeValid(valid);
  }, []);

  // ─── Phase 10C: Verify GPS from Plus Code
  // ────────────────────────────────────────────────────────────────────────────
  // CRITICAL: Coordinates ALWAYS come from our local Plus Code decoder, never
  // from Google's geocoding API. Google's geocoder can snap coordinates to
  // nearby POIs, introducing drift that defeats Plus Code precision.
  //
  // The user's Plus Code input is NEVER overwritten for full codes — for
  // compound/short codes the recovered full code replaces the input so the
  // user sees the canonical form.
  const handleVerifyFromPlusCode = async () => {
    const trimmed = form.plusCode.trim();

    if (!trimmed) {
      toast.error('Please enter a Plus Code first.');
      return;
    }

    // Extract just the code portion (before any space) for validation
    const codePart = extractCodePortion(trimmed);

    if (!isValidPlusCode(codePart)) {
      toast.error('Invalid Plus Code format. Examples: 7795X36X+5W (full) or X36X+5W Portmore (compound).');
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
          toast.error('Compound Plus Code requires a locality reference (e.g. X36X+5W Portmore).');
          setGeocoding(false);
          return;
        }

        // Step B2: Geocode ONLY the locality name to get reference coordinates
        let refLat: number;
        let refLng: number;
        try {
          const localityQuery = `${locality}, Jamaica`;
          const refResult = await fuelService.geocodeAddress(localityQuery);
          refLat = refResult.lat;
          refLng = refResult.lng;
        } catch (geoErr: any) {
          console.error('[TollPlaza] Locality geocoding failed:', geoErr);
          toast.error(`Could not locate "${locality}". Try entering the full Plus Code (e.g. 7795X36X+5W).`);
          setGeocoding(false);
          return;
        }

        // Step B3: Recover the full Plus Code using OLC recoverNearest algorithm
        const recovered = recoverShortCode(codePart, refLat, refLng);
        if (!recovered) {
          toast.error('Failed to recover full Plus Code from short code + locality.');
          setGeocoding(false);
          return;
        }

        fullCode = recovered;
      }

      // Step 2: Decode the full Plus Code LOCALLY — exact center of the
      // Plus Code cell, with zero drift from Google's POI snapping
      const decoded = decodePlusCode(fullCode);
      if (!decoded) {
        toast.error('Failed to decode Plus Code.');
        setGeocoding(false);
        return;
      }

      const lat = parseFloat(decoded.lat.toFixed(7));
      const lng = parseFloat(decoded.lng.toFixed(7));

      // Step 3: Reverse geocode the EXACT coordinates to get address details
      try {
        const result = await fuelService.reverseGeocode(lat, lng);

        setForm(prev => ({
          ...prev,
          lat: String(lat),
          lng: String(lng),
          address: result.streetAddress || result.formattedAddress || prev.address,
          parish: result.parish || prev.parish,
        }));

        // For compound codes, update the input to the recovered full code
        if (!isFullPlusCode(codePart)) {
          setForm(prev => ({ ...prev, plusCode: fullCode }));
        }

        setPlusCodeValid(true);
        setPlusCodeSynced(true);
        setIsVerified(true);

        // Auto-set geofence radius from Plus Code precision if not manually configured
        if (geofenceRadiusNum === null) {
          const autoRadius = getDefaultGeofenceRadius(fullCode);
          setGeofenceRadiusNum(autoRadius);
          setForm(prev => ({ ...prev, geofenceRadius: String(autoRadius) }));
        }

        toast.success(`Location verified from Plus Code (${fullCode}). Address, coordinates & parish auto-populated.`);
      } catch (reverseError: any) {
        // Even if reverse geocode fails, we still have EXACT coordinates
        console.warn('[TollPlaza] Reverse geocode failed, using coordinates only:', reverseError);

        setForm(prev => ({
          ...prev,
          lat: String(lat),
          lng: String(lng),
        }));

        if (!isFullPlusCode(codePart)) {
          setForm(prev => ({ ...prev, plusCode: fullCode }));
        }

        setPlusCodeValid(true);
        setPlusCodeSynced(true);
        setIsVerified(true);

        if (geofenceRadiusNum === null) {
          const autoRadius = getDefaultGeofenceRadius(fullCode);
          setGeofenceRadiusNum(autoRadius);
          setForm(prev => ({ ...prev, geofenceRadius: String(autoRadius) }));
        }

        toast.warning('Coordinates populated from Plus Code. Address lookup failed — enter address manually.');
      }
    } catch (error: any) {
      console.error('[TollPlaza] Plus Code verification error:', error);
      toast.error(`Verification failed: ${error.message}`);
    } finally {
      setGeocoding(false);
    }
  };

  /**
   * Phase 10D: Verify from Street Address (fallback flow)
   * Address → geocode → lat/lng → auto-generate Plus Code
   */
  const handleVerifyFromAddress = async () => {
    if (!form.address.trim()) {
      toast.error('Please enter an address first.');
      return;
    }

    setAddressGeocoding(true);
    try {
      const fullQuery = `${form.address}, ${form.parish || ''}, Jamaica`.replace(/, ,/g, ',');
      const result = await fuelService.geocodeAddress(fullQuery);

      const newLat = result.lat;
      const newLng = result.lng;
      const generated = encodePlusCode(newLat, newLng, 11);

      setForm(prev => ({
        ...prev,
        lat: String(newLat),
        lng: String(newLng),
        parish: result.parish || prev.parish,
        plusCode: generated,
      }));

      setPlusCodeValid(true);
      setPlusCodeSynced(true);
      setIsVerified(true);

      // Auto-set geofence radius from generated Plus Code if not manually configured
      if (geofenceRadiusNum === null) {
        const autoRadius = getDefaultGeofenceRadius(generated);
        setGeofenceRadiusNum(autoRadius);
        setForm(prev => ({ ...prev, geofenceRadius: String(autoRadius) }));
      }

      toast.success('Location verified from address. Plus Code and coordinates auto-generated.');
    } catch (error: any) {
      console.error('[TollPlaza] Address geocoding error:', error);
      toast.error(`Could not verify location: ${error.message}`);
    } finally {
      setAddressGeocoding(false);
    }
  };

  // Field updater
  const updateField = (field: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    // Clear error on change
    if (errors[field]) {
      setErrors(prev => { const next = { ...prev }; delete next[field]; return next; });
    }
  };

  // Validation
  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {};

    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.highway.trim()) errs.highway = 'Highway is required';

    // Location: require at least a Plus Code or an address
    if (!form.plusCode.trim() && !form.address.trim()) {
      errs.plusCode = 'Either a Plus Code or street address is required';
    }

    if (form.lat.trim()) {
      const lat = parseFloat(form.lat);
      if (isNaN(lat) || lat < -90 || lat > 90) errs.lat = 'Must be between -90 and 90';
    }
    if (form.lng.trim()) {
      const lng = parseFloat(form.lng);
      if (isNaN(lng) || lng < -180 || lng > 180) errs.lng = 'Must be between -180 and 180';
    }
    // Geofence radius is constrained by the slider (20–500), no string validation needed

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Submit
  const handleSubmit = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const lat = form.lat.trim() ? parseFloat(form.lat) : 0;
      const lng = form.lng.trim() ? parseFloat(form.lng) : 0;

      // Guard: need valid coordinates (either from Plus Code verify or manual entry)
      if ((lat === 0 && lng === 0) && !form.plusCode.trim()) {
        toast.error('Valid coordinates are required. Use "Verify GPS" to populate from Plus Code, or enter lat/lng manually.');
        setSaving(false);
        return;
      }

      // Auto-generate Plus Code if not provided but coordinates exist
      const finalPlusCode = form.plusCode.trim() || (lat !== 0 || lng !== 0 ? encodePlusCode(lat, lng, 11) : '');
      const radius = geofenceRadiusNum ?? getDefaultGeofenceRadius(finalPlusCode || undefined);

      const plaza: Partial<TollPlaza> = {
        name: form.name.trim(),
        highway: form.highway.trim(),
        direction: form.direction,
        operator: form.operator.trim() || 'Other',
        location: { lat, lng },
        plusCode: finalPlusCode || undefined,
        parish: form.parish.trim() || undefined,
        address: form.address.trim() || undefined,
        geofenceRadius: radius,
        status: form.status,
        operationalStatus: form.operationalStatus as 'active' | 'inactive' | 'under_construction',
        dataSource: 'manual',
        notes: form.notes.trim() || undefined,
      };

      // Preserve identity fields when editing
      if (isEditMode && editingPlaza) {
        plaza.id = editingPlaza.id;
        plaza.createdAt = editingPlaza.createdAt;
        plaza.stats = editingPlaza.stats;
      }

      await api.saveTollPlaza(plaza);

      toast.success(isEditMode ? `"${plaza.name}" updated successfully.` : `"${plaza.name}" created successfully.`);
      onSaved();
      onClose();
    } catch (e) {
      console.error('[AddTollPlazaModal] Save failed:', e);
      toast.error(`Failed to ${isEditMode ? 'update' : 'create'} toll plaza.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-indigo-600" />
            {isEditMode ? 'Edit Toll Plaza' : 'Add Toll Plaza'}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Update the details and verify the location. Enter or update the Plus Code, then click "Verify GPS" to re-populate address & coordinates.'
              : 'Enter a Plus Code for highest accuracy, then click "Verify GPS" to auto-populate all location fields.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* ── Basic Info ──────────────────────────────────────────────── */}
          <fieldset className="space-y-4">
            <legend className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-1">
              <Building2 className="h-4 w-4 text-slate-500" />
              Basic Information
            </legend>

            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="plaza-name">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="plaza-name"
                placeholder="e.g. Portmore Toll Plaza"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                className={errors.name ? 'border-red-400' : ''}
              />
              {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
            </div>

            {/* Highway */}
            <div className="space-y-1.5">
              <Label htmlFor="plaza-highway">
                Highway <span className="text-red-500">*</span>
              </Label>
              <Input
                id="plaza-highway"
                placeholder="e.g. Highway 2000 (East-West)"
                value={form.highway}
                onChange={(e) => updateField('highway', e.target.value)}
                className={errors.highway ? 'border-red-400' : ''}
              />
              {errors.highway && <p className="text-xs text-red-500">{errors.highway}</p>}
            </div>

            {/* Direction + Operator row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Direction</Label>
                <Select value={form.direction} onValueChange={(v) => updateField('direction', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select direction" />
                  </SelectTrigger>
                  <SelectContent>
                    {DIRECTION_OPTIONS.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Operator</Label>
                <Select value={form.operator || 'Other'} onValueChange={(v) => updateField('operator', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select operator" />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATOR_SUGGESTIONS.map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </fieldset>

          {/* ── Location ───────────────────────────────────────────────── */}
          <fieldset className="space-y-4">
            <legend className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-1">
              {isVerified ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <MapPin className="h-4 w-4 text-slate-500" />
              )}
              Location
              {isVerified && (
                <span className="text-[9px] text-emerald-600 font-medium ml-1">Verified</span>
              )}
            </legend>

            {/* ===== PLUS CODE SECTION — PRIMARY LOCATION INPUT ===== */}
            <div className="space-y-2">
              <div className="bg-gradient-to-r from-violet-50 to-indigo-50 p-3 rounded-lg border-2 border-violet-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Grid3X3 className="h-3.5 w-3.5 text-violet-600" />
                    <Label htmlFor="plaza-pluscode" className="text-[10px] uppercase text-violet-700 font-bold tracking-wide">
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
                      disabled={geocoding || !form.plusCode.trim()}
                    >
                      {geocoding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Navigation className="h-3 w-3 mr-1" />}
                      Verify GPS
                    </Button>
                  </div>
                </div>
                <div className="relative">
                  <Input
                    id="plaza-pluscode"
                    placeholder="e.g. 7795X453+XH4"
                    value={form.plusCode}
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
                    {plusCodeValid === true && form.plusCode && (
                      <span className="text-[8px] font-bold uppercase text-violet-500 bg-violet-50 px-1.5 py-0.5 rounded">
                        {getPlusCodePrecision(form.plusCode)}
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
                {errors.plusCode && (
                  <p className="text-xs text-red-500 mt-1">{errors.plusCode}</p>
                )}
              </div>
            </div>

            {/* ===== GPS COORDINATES — Auto-populated from Plus Code ===== */}
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
              <div className="col-span-2 flex items-center justify-between mb-0.5">
                <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wide">GPS Coordinates</span>
                {form.lat.trim() !== '' && form.lng.trim() !== '' && (
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
                <Label htmlFor="plaza-lat" className="text-[10px] uppercase text-slate-500 font-bold">Latitude</Label>
                <Input
                  id="plaza-lat"
                  type="number"
                  step="any"
                  placeholder="Auto from Plus Code"
                  value={form.lat}
                  onChange={(e) => updateField('lat', e.target.value)}
                  className={`h-8 text-xs font-mono ${errors.lat ? 'border-red-400' : isVerified ? 'border-emerald-200 bg-emerald-50/30' : ''}`}
                />
                {errors.lat && <p className="text-xs text-red-500">{errors.lat}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plaza-lng" className="text-[10px] uppercase text-slate-500 font-bold">Longitude</Label>
                <Input
                  id="plaza-lng"
                  type="number"
                  step="any"
                  placeholder="Auto from Plus Code"
                  value={form.lng}
                  onChange={(e) => updateField('lng', e.target.value)}
                  className={`h-8 text-xs font-mono ${errors.lng ? 'border-red-400' : isVerified ? 'border-emerald-200 bg-emerald-50/30' : ''}`}
                />
                {errors.lng && <p className="text-xs text-red-500">{errors.lng}</p>}
              </div>
              <p className="col-span-2 text-[9px] text-slate-400 italic">
                Coordinates are auto-populated when you verify a Plus Code. You can also enter them manually.
              </p>
              {showCopyField && (
                <div className="col-span-2 mt-2">
                  <Input
                    ref={copyInputRef}
                    type="text"
                    value={`Latitude: ${form.lat}, Longitude: ${form.lng}`}
                    readOnly
                    className="h-8 text-xs font-mono border-emerald-200 bg-emerald-50/30"
                  />
                </div>
              )}
            </div>

            {/* ===== STREET ADDRESS — SECONDARY (Auto-populated or manual fallback) ===== */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="plaza-address" className="flex items-center gap-1.5">
                  Street Address
                  {!form.plusCode.trim() && (
                    <span className="text-[9px] text-amber-600 font-normal">(or enter address as fallback)</span>
                  )}
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2"
                  onClick={handleVerifyFromAddress}
                  disabled={addressGeocoding || !form.address.trim()}
                >
                  {addressGeocoding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
                  Lookup Address
                </Button>
              </div>
              <div className="relative">
                <Input
                  id="plaza-address"
                  placeholder="Auto-populated from Plus Code, or enter manually"
                  value={form.address}
                  onChange={(e) => {
                    updateField('address', e.target.value);
                    // Typing an address also satisfies the "Plus Code or address required" validation
                    if (errors.plusCode) {
                      setErrors(prev => { const next = { ...prev }; delete next.plusCode; return next; });
                    }
                    if (isVerified && !form.plusCode.trim()) setIsVerified(false);
                  }}
                  className={isVerified && form.address ? 'pr-10 border-emerald-200 bg-emerald-50/30' : ''}
                />
                {isVerified && form.address && (
                  <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                )}
              </div>
            </div>

            {/* Parish */}
            <div className="space-y-1.5">
              <Label htmlFor="plaza-parish">Parish</Label>
              <Input
                id="plaza-parish"
                placeholder="e.g. St. Catherine"
                value={form.parish}
                onChange={(e) => updateField('parish', e.target.value)}
              />
            </div>

            {/* ===== GEOFENCE RADIUS SLIDER ===== */}
            <div className="space-y-2">
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
                             Toll transactions must occur within this radius to be considered spatially valid.</p>
                          <p className="mt-1 text-muted-foreground">Default is calculated from Plus Code precision.
                             Tighter Plus Codes allow smaller radii.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-amber-800 tabular-nums">
                      {geofenceRadiusNum ?? getDefaultGeofenceRadius(form.plusCode.trim() || undefined)}m
                    </span>
                    {geofenceRadiusNum !== null && geofenceRadiusNum !== getDefaultGeofenceRadius(form.plusCode.trim() || undefined) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-5 text-[9px] text-amber-600 hover:text-amber-700 hover:bg-amber-100 px-1.5"
                        onClick={() => setGeofenceRadiusNum(null)}
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                </div>
                <Slider
                  value={[geofenceRadiusNum ?? getDefaultGeofenceRadius(form.plusCode.trim() || undefined)]}
                  onValueChange={([val]) => setGeofenceRadiusNum(val)}
                  min={20}
                  max={500}
                  step={5}
                  className="[&_[data-slot=slider-track]]:h-2 [&_[data-slot=slider-range]]:bg-amber-500 [&_[data-slot=slider-thumb]]:border-amber-500 [&_[data-slot=slider-thumb]]:size-4"
                />
                <div className="flex justify-between mt-1.5">
                  <span className="text-[8px] text-amber-400">20m (tight)</span>
                  <span className="text-[8px] text-amber-400">
                    Default: {getDefaultGeofenceRadius(form.plusCode.trim() || undefined)}m
                    {form.plusCode.trim() && plusCodeValid ? ` (${getPlusCodePrecision(form.plusCode)} precision)` : ' (no Plus Code)'}
                  </span>
                  <span className="text-[8px] text-amber-400">500m (wide)</span>
                </div>
              </div>
            </div>
          </fieldset>

          {/* ── Configuration ──────────────────────────────────────────── */}
          <fieldset className="space-y-4">
            <legend className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-1">
              <Settings className="h-4 w-4 text-slate-500" />
              Configuration
            </legend>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Status */}
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => updateField('status', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Operational Status */}
              <div className="space-y-1.5">
                <Label>Operational Status</Label>
                <Select value={form.operationalStatus} onValueChange={(v) => updateField('operationalStatus', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATIONAL_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </fieldset>

          {/* ── Notes ──────────────────────────────────────────────────── */}
          <fieldset className="space-y-3">
            <legend className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-1">
              <FileText className="h-4 w-4 text-slate-500" />
              Notes
            </legend>
            <Textarea
              placeholder="Optional notes about this toll plaza..."
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              rows={3}
            />
          </fieldset>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving}
            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Saving...' : isEditMode ? 'Update Plaza' : 'Create Plaza'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}