import React, { useState, useRef } from 'react';
// cache-bust: v1.0.3 - Explicitly standardizing Badge import
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Textarea } from '../../ui/textarea';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { Badge } from '../../ui/badge';
import { Progress } from '../../ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import { Alert, AlertDescription, AlertTitle } from '../../ui/alert';
import { 
  Upload, 
  FileText, 
  Check, 
  AlertTriangle, 
  ArrowRight, 
  Download,
  Loader2,
  MapPin,
  XCircle,
  RefreshCw,
  Edit2,
  Search,
  Wand2
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../ui/tabs';
import { Checkbox } from '../../ui/checkbox';
import { toast } from "sonner@2.0.3";
import { StationOverride, StationProfile } from '../../../types/station';
import { processBatchWithRateLimit, geocodeAddress, searchPlace, GeocodedResult } from '../../../utils/geocoding';
import { generateStationId, normalizeStationName } from '../../../utils/stationUtils';
import { encodePlusCode } from '../../../utils/plusCode';

interface StationImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (stations: StationOverride[]) => void;
  existingStations?: StationProfile[];
  mode?: 'fuel' | 'non_fuel';
}

type ImportStep = 'input' | 'resolving' | 'preview';

export interface ParsedStation {
  // Original CSV Data
  name: string;
  brand: string;
  address: string;
  city: string;
  parish: string;
  country: string;
  phone: string;
  status: string;
  amenities: string;
  avgPrice: number;
  lastPrice: number;
  totalVisits: number;
  lastUpdated: string;
  dataSource: string;
  inputLat?: number;
  inputLng?: number;
  
  // Validation
  isValid: boolean;
  errors: string[];

  // Geocoding Results
  resolvedAddress?: string;
  coordinates?: { lat: number; lng: number };
  googlePlaceId?: string;
  matchStatus?: 'matched' | 'partial' | 'none' | 'pending';
  matchConfidence?: 'high' | 'medium' | 'low';
  isSelected?: boolean;
  
  // Duplicate Detection
  isDuplicate?: boolean;
  duplicateId?: string;
}

export function StationImportWizard({ isOpen, onClose, onImport, existingStations = [], mode = 'fuel' }: StationImportWizardProps) {
  const [step, setStep] = useState<ImportStep>('input');
  const [activeTab, setActiveTab] = useState('matched');
  const [csvContent, setCsvContent] = useState('');
  const [parsedData, setParsedData] = useState<ParsedStation[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Progress & Error State
  const [progress, setProgress] = useState(0);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState(0);
  const [apiError, setApiError] = useState<string | null>(null);
  
  const SAMPLE_CSV = mode === 'fuel' 
    ? `Parent Company,Gas Station Name,Street Address,City,Parish,Country,Telephone,Status,Amenities,Avg Price,Last Price,Total Visits,Last Updated,Data Source,Lat,Lng
Cool Oasis,COOL OASIS BARNETT STREET,122 BARNETT STREET,Montego Bay,St. James,Jamaica,8769748411,active,,0,0,0,2026-02-01T22:02:27.318Z,import,18.4658377,-77.9163098
Texaco,TEXACO HWT,456 HWT Road,Kingston,St. Andrew,Jamaica,8769261234,active,,150,150,25,2026-02-02T10:00:00.000Z,import,,`
    : `Category,Location Name,Street Address,City,Parish,Country,Telephone,Status,Amenities,Avg Price,Last Price,Total Visits,Last Updated,Data Source,Lat,Lng
Mechanic,Auto Fix Center,123 Service Rd,Kingston,St. Andrew,Jamaica,8761234567,active,,0,0,0,2026-02-01T12:00:00.000Z,import,,
Parts Store,Car Parts Plus,45 Main St,Mandeville,Manchester,Jamaica,8769876543,active,,0,0,0,2026-02-01T12:00:00.000Z,import,,`;

  const reset = () => {
    setStep('input');
    setCsvContent('');
    setParsedData([]);
    setProgress(0);
    setCurrentProcessingIndex(0);
    setApiError(null);
  };

  const handleClose = () => {
    onClose();
    setTimeout(reset, 300);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        setCsvContent(content);
      }
    };
    reader.readAsText(file);
    event.target.value = ''; 
  };

  const parseCSV = () => {
    if (!csvContent.trim()) return;
    setApiError(null);

    const lines = csvContent.split('\n').filter(l => l.trim());
    const headerRow = lines[0].toLowerCase();
    
    // Check which format we have
    const isNewFormat = headerRow.includes('parent company') || headerRow.includes('gas station name');
    
    const dataRows = lines.slice(1);

    const parsed: ParsedStation[] = dataRows.map((row) => {
      // Simple CSV split - in a real app, use a library like Papaparse to handle commas inside quotes
      // For now we assume no commas in fields for simplicity, or basic splitting
      const cols = row.split(',').map(c => c.trim());
      
      let brand = 'Independent';
      let name = '';
      let address = '';
      let city = '';
      let parish = '';
      let country = 'Jamaica';
      let phone = '';
      let status = 'active';
      let amenities = '';
      let avgPrice = 0;
      let lastPrice = 0;
      let totalVisits = 0;
      let lastUpdated = new Date().toISOString();
      let dataSource = 'import';
      let inputLat: number | undefined = undefined;
      let inputLng: number | undefined = undefined;

      if (isNewFormat) {
        // Parent Company, Gas Station Name, Street Address, City, Parish, Country, Telephone, Status, Amenities, Avg Price, Last Price, Total Visits, Last Updated, Data Source, Lat, Lng
        brand = cols[0] || 'Independent';
        name = cols[1] || '';
        address = cols[2] || '';
        city = cols[3] || '';
        parish = cols[4] || '';
        country = cols[5] || 'Jamaica';
        phone = cols[6] || '';
        status = cols[7] || 'active';
        amenities = cols[8] || '';
        avgPrice = parseFloat(cols[9]) || 0;
        lastPrice = parseFloat(cols[10]) || 0;
        totalVisits = parseInt(cols[11]) || 0;
        lastUpdated = cols[12] || new Date().toISOString();
        dataSource = cols[13] || 'import';
        if (cols[14] && cols[15]) {
            const lat = parseFloat(cols[14]);
            const lng = parseFloat(cols[15]);
            if (!isNaN(lat) && !isNaN(lng)) {
                inputLat = lat;
                inputLng = lng;
            }
        }
      } else {
        // Old Format: Main Brand,Vendor Name,Address,City,Parish,Telephone
        brand = cols[0] || 'Independent';
        name = cols[1] || '';
        address = cols[2] || '';
        city = cols[3] || '';
        parish = cols[4] || '';
        phone = cols[5] || '';
      }

      const errors: string[] = [];
      if (!name) errors.push('Missing Station Name');
      if (!address) errors.push('Missing Address');

      // Initial Duplicate Check
      const potentialId = generateStationId(normalizeStationName(name), address);
      const isDuplicate = existingStations.some(s => s.id === potentialId);
      
      // If we have lat/lng, we are "matched"
      const hasCoordinates = inputLat !== undefined && inputLng !== undefined;

      return {
        name,
        brand,
        address,
        city,
        parish,
        country,
        phone,
        status,
        amenities,
        avgPrice,
        lastPrice,
        totalVisits,
        lastUpdated,
        dataSource,
        inputLat,
        inputLng,
        
        isValid: errors.length === 0,
        errors,
        matchStatus: hasCoordinates ? 'matched' : 'pending',
        matchConfidence: hasCoordinates ? 'high' : undefined,
        isSelected: false, // Don't auto-select yet
        isDuplicate,
        duplicateId: isDuplicate ? potentialId : undefined,
        
        coordinates: hasCoordinates ? { lat: inputLat!, lng: inputLng! } : undefined,
        resolvedAddress: hasCoordinates ? address : undefined // Use provided address as resolved if we trust coords
      };
    });

    if (parsed.length === 0) {
        setApiError("No valid rows found in CSV.");
        return;
    }

    setParsedData(parsed);
    setStep('resolving');
    resolveStations(parsed);
  };

  /**
   * Geocoding Strategy:
   * 1. Specific: Brand + Name + Address + City + Parish + Jamaica
   * 2. Broad: Address + City + Parish + Jamaica
   * 3. Fallback: Brand + Name + City + Parish + Jamaica
   */
  const resolveStationLocation = async (station: ParsedStation): Promise<ParsedStation> => {
      if (!station.isValid) return { ...station, matchStatus: 'none' };

      // If already has coordinates from CSV, skip geocoding
      if (station.inputLat !== undefined && station.inputLng !== undefined) {
          return {
              ...station,
              matchStatus: 'matched',
              matchConfidence: 'high',
              isSelected: !station.isDuplicate, // Auto-select if not duplicate
              resolvedAddress: station.address // Assume input address is correct
          };
      }

      const queryA = `${station.brand} ${station.name}, ${station.address}, ${station.city}, ${station.parish}, ${station.country}`;
      const queryB = `${station.address}, ${station.city}, ${station.parish}, ${station.country}`;
      const queryC = `${station.brand} ${station.name}, ${station.city}, ${station.parish}, ${station.country}`;

      const queries = [queryA, queryB, queryC];
      
      for (let i = 0; i < queries.length; i++) {
          const res = await geocodeAddress(queries[i]);
          
          if (res.success && res.result) {
              const confidence = verifyMatch(station, res.result);
              
              // If match is low confidence, try next strategy unless it's the last one
              if (confidence === 'low' && i < queries.length - 1) {
                  continue;
              }

              // Check for duplicate with resolved address
              const resolvedId = generateStationId(normalizeStationName(station.name), res.result.formattedAddress);
              const isResolvedDuplicate = existingStations.some(s => s.id === resolvedId);
              const isDuplicate = station.isDuplicate || isResolvedDuplicate;

              return {
                  ...station,
                  resolvedAddress: res.result.formattedAddress,
                  coordinates: { lat: res.result.lat, lng: res.result.lng },
                  googlePlaceId: res.result.placeId,
                  matchStatus: confidence === 'low' ? 'partial' : 'matched',
                  matchConfidence: confidence,
                  isSelected: confidence === 'high' && !isDuplicate, // Auto-select only if high confidence AND not duplicate
                  isDuplicate,
                  duplicateId: station.duplicateId || (isResolvedDuplicate ? resolvedId : undefined)
              };
          }
      }

      return { ...station, matchStatus: 'none' };
  };

  /**
   * Verification Logic:
   * Compares the returned Google address components (Parish/City) against the CSV input.
   */
  const verifyMatch = (original: ParsedStation, result: GeocodedResult): 'high' | 'medium' | 'low' => {
      const normalize = (s: string) => s.toLowerCase().replace(/saint/g, 'st').replace(/parish/g, '').replace(/[.,]/g, '').trim();
      
      const inputParish = normalize(original.parish);
      const inputCity = normalize(original.city);

      // Check for Parish match (High importance)
      const parishMatch = result.addressComponents.some(c => {
          const val = normalize(c.long_name);
          return val.includes(inputParish) || inputParish.includes(val);
      });

      // Check for City match
      const cityMatch = result.addressComponents.some(c => {
          const val = normalize(c.long_name);
          return val.includes(inputCity) || inputCity.includes(val);
      });

      if (parishMatch && cityMatch) return 'high';
      if (parishMatch) return 'medium';
      return 'low';
  };

  const resolveStations = async (stations: ParsedStation[]) => {
      try {
        const results = await processBatchWithRateLimit(
            stations, 
            resolveStationLocation, 
            300, 
            (completed, total) => {
                setProgress((completed / total) * 100);
                setCurrentProcessingIndex(completed);
            }
        );
        
        const successCount = results.filter(r => r.matchStatus !== 'none').length;
        if (results.length > 0 && successCount === 0) {
            setApiError("Zero matches found. Please check your Google Maps API Key configuration or CSV data quality.");
        }
        
        setParsedData(results);
        setStep('preview');
      } catch (error) {
        console.error("Batch processing failed:", error);
        setApiError("An unexpected error occurred during processing. Please try again.");
        setStep('input');
      }
  };

  const handleRetryFailed = () => {
      const failed = parsedData.filter(d => d.matchStatus === 'none' || d.matchStatus === 'partial');
      if (failed.length === 0) {
          toast.info("No failed items to retry.");
          return;
      }

      setStep('resolving');
      setProgress(0);
      setApiError(null);
      
      processBatchWithRateLimit(
          failed,
          resolveStationLocation,
          300,
          (completed, total) => {
              setProgress((completed / total) * 100);
              setCurrentProcessingIndex(completed);
          }
      ).then(results => {
          setParsedData(prev => prev.map(p => {
              const newVal = results.find(r => r.name === p.name && r.address === p.address);
              return newVal || p;
          }));
          setStep('preview');
          toast.success("Retry complete.");
      });
  };
  
  const updateStation = (index: number, updated: ParsedStation) => {
      const newData = [...parsedData];
      newData[index] = updated;
      setParsedData(newData);
  };

  const confirmImport = () => {
    const validStations = parsedData.filter(p => p.isValid && p.isSelected);
    
    if (validStations.length === 0) {
      toast.error("No stations selected for import.");
      return;
    }

    const overrides: StationOverride[] = validStations.map(s => {
      return {
        name: s.name,
        brand: s.brand,
        address: (s.matchStatus === 'matched' && s.resolvedAddress) ? s.resolvedAddress : s.address,
        city: s.city,
        parish: s.parish,
        country: s.country,
        contactInfo: { phone: s.phone },
        location: s.coordinates ? { lat: s.coordinates.lat, lng: s.coordinates.lng } : undefined,
        plusCode: s.coordinates ? encodePlusCode(s.coordinates.lat, s.coordinates.lng, 11) : undefined,
        dataSource: 'import',
        status: 'unverified',
        category: mode,
        amenities: s.amenities ? s.amenities.split(',').map(a => a.trim()) : [],
        initialStats: {
            avgPrice: s.avgPrice,
            lastPrice: s.lastPrice,
            totalVisits: s.totalVisits,
            lastUpdated: s.lastUpdated
        }
      };
    });

    onImport(overrides);
    toast.success(`Successfully imported ${overrides.length} locations.`);
    handleClose();
  };

  // Filter Logic
  const duplicateItems = parsedData.filter(d => d.isDuplicate);
  const matchedItems = parsedData.filter(d => d.isValid && d.matchConfidence === 'high' && !d.isDuplicate);
  const partialItems = parsedData.filter(d => d.isValid && d.matchConfidence === 'medium' && !d.isDuplicate);
  const issueItems = parsedData.filter(d => (!d.isValid || d.matchStatus === 'none' || d.matchConfidence === 'low') && !d.isDuplicate);
  
  const currentItems = activeTab === 'matched' ? matchedItems 
                     : activeTab === 'partial' ? partialItems 
                     : activeTab === 'duplicates' ? duplicateItems
                     : issueItems;

  const toggleSelection = (index: number) => {
    const originalIndex = parsedData.findIndex(p => p === currentItems[index]);
    if (originalIndex === -1) return;
    
    const newData = [...parsedData];
    newData[originalIndex].isSelected = !newData[originalIndex].isSelected;
    setParsedData(newData);
  };

  const toggleAll = (checked: boolean) => {
    const newData = [...parsedData];
    currentItems.forEach(item => {
      const idx = newData.findIndex(p => p === item);
      if (idx !== -1) {
        newData[idx].isSelected = checked;
      }
    });
    setParsedData(newData);
  };

  const isAllSelected = currentItems.length > 0 && currentItems.every(i => i.isSelected);
  const isSomeSelected = currentItems.some(i => i.isSelected) && !isAllSelected;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[900px] gap-0 p-0 overflow-hidden bg-slate-50 z-[100]">
        <DialogHeader className="p-6 bg-white border-b border-slate-200">
          <DialogTitle>Import {mode === 'fuel' ? 'Stations' : 'Locations'}</DialogTitle>
          <DialogDescription>
            {step === 'input' && `Bulk import ${mode === 'fuel' ? 'station' : 'location'} data using CSV format.`}
            {step === 'resolving' && `Resolving ${mode === 'fuel' ? 'station' : 'location'} locations with Google Maps...`}
            {step === 'preview' && "Review and confirm data before importing."}
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
            
          {apiError && (
              <Alert variant="destructive" className="mb-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Import Issue</AlertTitle>
                  <AlertDescription>{apiError}</AlertDescription>
              </Alert>
          )}

          {step === 'input' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3 text-sm text-blue-800">
                <FileText className="h-5 w-5 flex-shrink-0" />
                <div>
                  <p className="font-semibold mb-1">CSV Format Required</p>
                  <p>Columns: {mode === 'fuel' ? 'Parent Company, Gas Station Name' : 'Category, Location Name'}, Street Address, City, Parish, Country, Telephone, Status, Amenities, Avg Price, Last Price, Total Visits, Last Updated, Data Source, Lat, Lng</p>
                  <p className="mt-2 text-xs opacity-80">Example: {SAMPLE_CSV.split('\n')[1]}</p>
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Upload CSV File</Label>
                <div className="flex gap-3">
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".csv"
                    className="hidden" 
                  />
                  <Button 
                    variant="outline" 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full sm:w-auto"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Select CSV File
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setCsvContent(SAMPLE_CSV)} 
                    className="ml-auto text-slate-500"
                  >
                    <Download className="h-3 w-3 mr-2" /> Load Sample
                  </Button>
                </div>
              </div>

              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink-0 mx-4 text-xs text-slate-400 font-medium">OR PASTE DATA</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              <div>
                <Label className="mb-2 block">Paste CSV Data</Label>
                <Textarea 
                  value={csvContent}
                  onChange={(e) => setCsvContent(e.target.value)}
                  placeholder={SAMPLE_CSV}
                  className="font-mono text-xs h-[200px] whitespace-pre"
                />
              </div>
            </div>
          )}

          {step === 'resolving' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-6">
                <div className="relative">
                    <Loader2 className="h-16 w-16 text-blue-500 animate-spin" />
                    <MapPin className="h-6 w-6 text-slate-900 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                </div>
                
                <div className="w-full max-w-md space-y-2 text-center">
                    <h3 className="text-lg font-semibold text-slate-900">Resolving Locations</h3>
                    <p className="text-sm text-slate-500">
                        Matching {parsedData.length} stations with Google Maps...
                    </p>
                    
                    <Progress value={progress} className="h-2 w-full mt-4" />
                    <p className="text-xs text-slate-400 mt-2">
                        Processing row {currentProcessingIndex} of {parsedData.length}
                    </p>
                </div>
            </div>
          )}

          {step === 'preview' && (
            <TooltipProvider>
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                 <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <div className="flex items-center justify-between mb-4">
                        <TabsList>
                            <TabsTrigger value="matched" className="data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-800 text-emerald-700/70">
                                {matchedItems.length} Matched
                            </TabsTrigger>
                            <TabsTrigger value="partial" className="data-[state=active]:bg-amber-100 data-[state=active]:text-amber-800 text-amber-700/70">
                                {partialItems.length} Partial
                            </TabsTrigger>
                            <TabsTrigger value="duplicates" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-800 text-blue-700/70">
                                {duplicateItems.length} Duplicates
                            </TabsTrigger>
                            <TabsTrigger value="issues" className="data-[state=active]:bg-red-100 data-[state=active]:text-red-800 text-red-700/70">
                                {issueItems.length} Issues
                            </TabsTrigger>
                        </TabsList>

                         <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={handleRetryFailed}>
                                <Wand2 className="h-3 w-3 mr-2" /> Retry Failed
                            </Button>
                            <Button variant="outline" size="sm" onClick={parseCSV}>
                                <RefreshCw className="h-3 w-3 mr-2" /> Restart
                            </Button>
                         </div>
                    </div>
                 </Tabs>
              </div>

              <div className="border rounded-md bg-white overflow-hidden max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 sticky top-0 z-10">
                      <TableHead className="w-[40px]">
                        <Checkbox 
                          checked={isAllSelected || (isSomeSelected ? "indeterminate" : false)}
                          onCheckedChange={(checked) => toggleAll(!!checked)}
                        />
                      </TableHead>
                      <TableHead className="w-[30px]"></TableHead>
                      <TableHead>Station Details</TableHead>
                      <TableHead>Imported Address</TableHead>
                      <TableHead>Google Maps Match</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentItems.length > 0 ? (
                        currentItems.map((row, i) => {
                            // Find original index to update correct item
                            const originalIndex = parsedData.findIndex(p => p === row);
                            return (
                              <TableRow key={originalIndex} className={!row.isValid ? "bg-red-50" : ""}>
                                <TableCell>
                                  <Checkbox 
                                    checked={row.isSelected}
                                    onCheckedChange={() => toggleSelection(i)}
                                    disabled={!row.isValid}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Tooltip>
                                      <TooltipTrigger>
                                        {!row.isValid ? (
                                            <AlertTriangle className="h-4 w-4 text-red-500" />
                                        ) : row.isDuplicate ? (
                                            <div className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100">
                                              <span className="font-bold text-xs text-blue-600">D</span>
                                            </div>
                                        ) : row.matchStatus === 'matched' && row.matchConfidence === 'high' ? (
                                            <Check className="h-4 w-4 text-emerald-500" />
                                        ) : (row.matchStatus === 'partial' || row.matchConfidence === 'medium') ? (
                                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                                        ) : (
                                            <XCircle className="h-4 w-4 text-slate-300" />
                                        )}
                                      </TooltipTrigger>
                                      <TooltipContent>
                                          <p>{!row.isValid ? row.errors.join(', ') : row.isDuplicate ? `Duplicate Station detected. Will overwrite if selected.` : `Status: ${row.matchStatus} (${row.matchConfidence || 'N/A'})`}</p>
                                      </TooltipContent>
                                  </Tooltip>
                                </TableCell>
                                
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="font-medium text-sm text-slate-900">{row.name}</span>
                                        <span className="text-xs text-slate-500">{row.brand}</span>
                                        <span className="text-xs text-slate-400">{row.phone}</span>
                                    </div>
                                </TableCell>

                                <TableCell className="max-w-[200px]">
                                    <div className="text-xs text-slate-700">
                                        <p>{row.address}</p>
                                        <p className="opacity-75">{row.city}, {row.parish}, {row.country}</p>
                                    </div>
                                </TableCell>

                                <TableCell className="max-w-[250px]">
                                    {row.matchStatus === 'matched' || row.matchStatus === 'partial' ? (
                                        <div className="text-xs">
                                            <div className="flex items-start gap-1 text-slate-800">
                                                <MapPin className="h-3 w-3 mt-0.5 text-blue-500 flex-shrink-0" />
                                                <span>{row.resolvedAddress}</span>
                                            </div>
                                            {(row.matchConfidence === 'low' || row.matchConfidence === 'medium') && (
                                                <Badge variant="secondary" className="mt-1 text-[10px] h-4">
                                                    {row.matchConfidence === 'medium' ? 'Medium Confidence' : 'Low Confidence'}
                                                </Badge>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-xs text-slate-400 italic">No location match found</span>
                                    )}
                                </TableCell>

                                <TableCell>
                                     <RowEditor 
                                        station={row} 
                                        onUpdate={(updated) => updateStation(originalIndex, updated)}
                                        verifyMatch={verifyMatch}
                                     />
                                </TableCell>
                              </TableRow>
                            );
                        })
                    ) : (
                        <TableRow>
                            <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                                No items in this category.
                            </TableCell>
                        </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
            </TooltipProvider>
          )}
        </div>

        <DialogFooter className="p-4 bg-white border-t border-slate-200">
          {step === 'input' ? (
            <div className="flex justify-end w-full gap-2">
              <Button variant="ghost" onClick={handleClose}>Cancel</Button>
              <Button onClick={parseCSV} disabled={!csvContent.trim()}>
                Proceed <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          ) : step === 'resolving' ? (
            <div className="flex justify-end w-full gap-2">
                <Button variant="destructive" onClick={() => setStep('input')}>Cancel Process</Button>
            </div>
          ) : (
            <div className="flex justify-end w-full gap-2">
               <Button variant="ghost" onClick={() => setStep('input')}>Back</Button>
               <Button onClick={confirmImport} className="bg-slate-900 text-white hover:bg-slate-800">
                 Import {parsedData.filter(d => d.isSelected).length} Selected Stations
               </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RowEditor({ 
    station, 
    onUpdate, 
    verifyMatch 
}: { 
    station: ParsedStation; 
    onUpdate: (s: ParsedStation) => void;
    verifyMatch: (a: ParsedStation, b: GeocodedResult) => 'high' | 'medium' | 'low';
}) {
    const [query, setQuery] = useState(station.resolvedAddress || `${station.address}, ${station.city}, ${station.country}`);
    const [loading, setLoading] = useState(false);
    const [tempResult, setTempResult] = useState<{ res: GeocodedResult, conf: 'high' | 'medium' | 'low' } | null>(null);

    const handleSearch = async () => {
        if (!query.trim()) return;
        setLoading(true);
        try {
            const res = await searchPlace(query);
            if (res.success && res.result) {
                const conf = verifyMatch(station, res.result);
                setTempResult({ res: res.result, conf });
            } else {
                setTempResult(null);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const applyChange = () => {
        if (!tempResult) return;
        onUpdate({
            ...station,
            resolvedAddress: tempResult.res.formattedAddress,
            coordinates: { lat: tempResult.res.lat, lng: tempResult.res.lng },
            googlePlaceId: tempResult.res.placeId,
            matchStatus: tempResult.conf === 'low' ? 'partial' : 'matched',
            matchConfidence: tempResult.conf,
            isSelected: true
        });
        setTempResult(null);
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-3" align="end">
                <div className="space-y-3">
                    <h4 className="font-medium text-sm">Manual Location Search</h4>
                    <div className="flex gap-2">
                        <Input 
                            value={query} 
                            onChange={(e) => setQuery(e.target.value)}
                            className="h-8 text-xs" 
                            placeholder="Search address..."
                        />
                        <Button size="icon" className="h-8 w-8 flex-shrink-0" onClick={handleSearch} disabled={loading}>
                            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                        </Button>
                    </div>

                    {tempResult && (
                        <div className="bg-slate-50 p-2 rounded border border-slate-100 text-xs space-y-2">
                            <div className="font-medium text-slate-900 line-clamp-2">
                                {tempResult.res.formattedAddress}
                            </div>
                            <div className="flex items-center justify-between">
                                <Badge variant={tempResult.conf === 'high' ? 'default' : 'secondary'} className="text-[10px] h-4 px-1">
                                    {tempResult.conf.toUpperCase()} Match
                                </Badge>
                                <Button size="sm" className="h-6 text-[10px]" onClick={applyChange}>
                                    Apply
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}