import React, { useState, useEffect } from 'react';
// cache-bust: v1.0.3 - Explicitly standardizing Badge import
import { api } from '../../../services/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { Badge } from '../../ui/badge';
import { cn } from '../../ui/utils';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '../../ui/dialog';
import { AlertTriangle, Loader2, ShieldCheck, MapPin, Search, History, Trash2, Plus, ArrowUpCircle, Info, Grid3X3, Pencil, RotateCcw, Check } from 'lucide-react';
import { Input } from '../../ui/input';
import { StationProfile, StationAlias } from '../../../types/station';
import { Button } from '../../ui/button';
import { toast } from 'sonner@2.0.3';
import { Checkbox } from '../../ui/checkbox';
import { encodePlusCode, getDefaultGeofenceRadius } from '../../../utils/plusCode';
import { Slider } from '../../ui/slider';
import { 
  Popover,
  PopoverContent,
  PopoverTrigger
} from "../../ui/popover";
import { Label } from '../../ui/label';

// ─── Inline Geofence Radius Popover ────────────────────────────────────────
function GeofenceRadiusPopover({ 
  station, 
  onSave, 
  children 
}: { 
  station: StationProfile; 
  onSave: (stationId: string, radius: number | undefined) => Promise<void>; 
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const defaultRadius = getDefaultGeofenceRadius(station.plusCode);
  const currentRadius = station.geofenceRadius ?? defaultRadius;
  const [localRadius, setLocalRadius] = useState(currentRadius);
  const [inputValue, setInputValue] = useState(String(currentRadius));

  // Sync when popover opens
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      const r = station.geofenceRadius ?? defaultRadius;
      setLocalRadius(r);
      setInputValue(String(r));
    }
    setOpen(nextOpen);
  };

  const handleSliderChange = ([val]: number[]) => {
    setLocalRadius(val);
    setInputValue(String(val));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    const num = parseInt(e.target.value, 10);
    if (!isNaN(num) && num >= 20 && num <= 500) {
      setLocalRadius(num);
    }
  };

  const handleInputBlur = () => {
    const num = parseInt(inputValue, 10);
    if (isNaN(num) || num < 20) {
      setLocalRadius(20);
      setInputValue('20');
    } else if (num > 500) {
      setLocalRadius(500);
      setInputValue('500');
    } else {
      setLocalRadius(num);
      setInputValue(String(num));
    }
  };

  const handleReset = () => {
    setLocalRadius(defaultRadius);
    setInputValue(String(defaultRadius));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // If it matches default, save as undefined (clear custom override)
      const valueToSave = localRadius === defaultRadius ? undefined : localRadius;
      await onSave(station.id, valueToSave);
      toast.success(`Geofence radius ${valueToSave ? `set to ${localRadius}m` : 'reset to default'} for ${station.name}`);
      setOpen(false);
    } catch (err) {
      toast.error('Failed to save geofence radius');
    } finally {
      setSaving(false);
    }
  };

  const isCustom = localRadius !== defaultRadius;
  const tier = localRadius <= 50
    ? { label: 'Ultra Tight', color: 'text-emerald-700', dot: 'bg-emerald-500' }
    : localRadius <= 100
    ? { label: 'Tight', color: 'text-green-700', dot: 'bg-green-500' }
    : localRadius <= 150
    ? { label: 'Standard', color: 'text-blue-700', dot: 'bg-blue-500' }
    : localRadius <= 250
    ? { label: 'Wide', color: 'text-amber-700', dot: 'bg-amber-500' }
    : { label: 'Extended', color: 'text-orange-700', dot: 'bg-orange-500' };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" side="bottom">
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-4 rounded-lg">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-amber-600" />
              <span className="text-[10px] uppercase text-amber-700 font-bold tracking-wide">
                Geofence Radius
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`inline-block h-2 w-2 rounded-full ${tier.dot}`} />
              <span className={`text-[10px] font-semibold ${tier.color}`}>{tier.label}</span>
              {isCustom && (
                <span className="text-[8px] font-bold text-amber-600 bg-amber-100 px-1 py-0.5 rounded">CUSTOM</span>
              )}
            </div>
          </div>

          {/* Station name context */}
          <p className="text-[10px] text-amber-600/70 mb-3 truncate">
            {station.name} — {station.plusCode || 'No Plus Code'}
          </p>

          {/* Slider + Input Row */}
          <div className="flex items-center gap-3 mb-2">
            <div className="flex-1">
              <Slider
                value={[localRadius]}
                onValueChange={handleSliderChange}
                min={20}
                max={500}
                step={5}
                className="[&_[data-slot=slider-track]]:h-2 [&_[data-slot=slider-range]]:bg-amber-500 [&_[data-slot=slider-thumb]]:border-amber-500 [&_[data-slot=slider-thumb]]:size-4"
              />
            </div>
            <div className="relative w-[72px] shrink-0">
              <Input
                type="number"
                min={20}
                max={500}
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onKeyDown={(e) => { if (e.key === 'Enter') { handleInputBlur(); handleSave(); } }}
                className="h-8 text-xs font-mono font-bold text-amber-800 text-center pr-5 bg-white/80 border-amber-200 focus:border-amber-400"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-amber-500 font-medium pointer-events-none">m</span>
            </div>
          </div>

          {/* Scale labels */}
          <div className="flex justify-between mb-3">
            <span className="text-[8px] text-amber-400">20m (tight)</span>
            <span className="text-[8px] text-amber-400">Default: {defaultRadius}m</span>
            <span className="text-[8px] text-amber-400">500m (wide)</span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] text-amber-600 hover:text-amber-700 hover:bg-amber-100 gap-1 flex-1"
              onClick={handleReset}
              disabled={!isCustom}
            >
              <RotateCcw className="h-3 w-3" />
              Reset to Default ({defaultRadius}m)
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 text-[10px] bg-amber-600 hover:bg-amber-700 text-white gap-1 flex-1"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
interface VerifiedStationsTabProps {
  stations?: StationProfile[];
  onRefresh?: () => void;
  onSelectStation?: (station: StationProfile) => void;
  onSaveGeofenceRadius?: (stationId: string, radius: number | undefined) => Promise<void>;
}

export function VerifiedStationsTab({ stations: propsStations, onRefresh, onSelectStation, onSaveGeofenceRadius }: VerifiedStationsTabProps) {
  const [internalStations, setInternalStations] = useState<StationProfile[]>([]);
  const [loading, setLoading] = useState(false); // Default to false if we have props
  const [searchTerm, setSearchTerm] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  
  // Phase 6 State
  const [selectedStation, setSelectedStation] = useState<StationProfile | null>(null);
  const [newAliasLabel, setNewAliasLabel] = useState('');
  const [newAliasLat, setNewAliasLat] = useState('');
  const [newAliasLng, setNewAliasLng] = useState('');
  const [isAddingAlias, setIsAddingAlias] = useState(false);

  const handleAddAlias = async (stationId: string) => {
    if (!newAliasLat || !newAliasLng) {
      toast.error('Coordinates are required');
      return;
    }
    try {
      setIsAddingAlias(true);
      await api.addStationAlias(stationId, {
        lat: parseFloat(newAliasLat),
        lng: parseFloat(newAliasLng),
        label: newAliasLabel || 'GPS Alias'
      });
      toast.success('GPS Alias added to station');
      setNewAliasLabel('');
      setNewAliasLat('');
      setNewAliasLng('');
      await fetchStations();
    } catch (error) {
      toast.error('Failed to add GPS alias');
    } finally {
      setIsAddingAlias(false);
    }
  };

  const handleSyncMasterPin = async (stationId: string, lat: number, lng: number) => {
    try {
      await api.syncMasterPin(stationId, {
        lat,
        lng,
        transactionId: 'manual_override'
      });
      toast.success('Master Pin synchronized');
      await fetchStations();
    } catch (error) {
      toast.error('Failed to sync master pin');
    }
  };

  const stations = propsStations || internalStations;

  const fetchStations = async () => {
    if (propsStations) {
      onRefresh?.();
      return;
    }
    try {
      setLoading(true);
      const data = await api.getStations();
      setInternalStations(data.filter((s: any) => s.status === 'verified'));
    } catch (error) {
      console.error('Error fetching verified stations:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!propsStations) {
      fetchStations();
    }
  }, [propsStations]);

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      const result = await api.reconcileLedgerOrphans();
      const matched = result?.matchesFound || 0;
      if (matched > 0) {
        toast.success(`Orphan sync complete: ${matched} transaction${matched > 1 ? 's' : ''} linked to verified stations.`);
      } else {
        toast.info('Sync complete — no unlinked orphan transactions found.');
      }
      await fetchStations();
    } catch (error) {
      toast.error('Failed to sync ledger');
    } finally {
      setIsSyncing(false);
    }
  };

  const filtered = stations.filter(s => {
    const lower = searchTerm.toLowerCase();
    return s.name.toLowerCase().includes(lower) ||
      s.address.toLowerCase().includes(lower) ||
      s.brand.toLowerCase().includes(lower) ||
      (s.plusCode || '').toLowerCase().includes(lower)
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filtered.map(s => s.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    
    try {
      setIsDeleting(true);
      const idsToDelete = Array.from(selectedIds);
      
      // Perform deletions
      await Promise.all(idsToDelete.map(id => api.deleteStation(id)));
      
      toast.success(`Successfully deleted ${idsToDelete.length} stations from the ledger.`);
      setSelectedIds(new Set());
      setIsDeleteDialogOpen(false);
      await fetchStations();
    } catch (error) {
      console.error('Error deleting stations:', error);
      toast.error('Failed to delete some stations from the cloud.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm text-slate-500 font-medium">Accessing Master Audit Ledger...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-slate-900">Master Verified Ledger</h3>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-100 flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" />
              Source of Truth
            </Badge>
          </div>
          <p className="text-sm text-slate-500">
            These stations are verified via cryptographic evidence and high-accuracy GPS audits.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && (
            <Button 
              variant="destructive" 
              size="sm" 
              className="h-9 animate-in zoom-in-95 duration-200"
              onClick={() => setIsDeleteDialogOpen(true)}
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete Selected ({selectedIds.size})
            </Button>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            className="h-9 border-slate-200"
            onClick={handleSync}
            disabled={isSyncing}
          >
            {isSyncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <History className="h-4 w-4 mr-2" />}
            Sync Orphans
          </Button>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search verified stations..." 
              className="pl-9 h-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-[50px]">
                <Checkbox 
                  checked={filtered.length > 0 && selectedIds.size === filtered.length}
                  onCheckedChange={(checked) => handleSelectAll(!!checked)}
                />
              </TableHead>
              <TableHead>Station / Brand</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Audit Status</TableHead>
              <TableHead>GPS Aliases</TableHead>
              <TableHead>Regional Efficiency</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-slate-500 italic">
                  {searchTerm ? "No verified stations match your search." : "No verified stations in the master ledger yet."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((s) => (
                <TableRow key={s.id} className={cn("hover:bg-slate-50/50 transition-colors", selectedIds.has(s.id) && "bg-blue-50/30")}>
                  <TableCell>
                    <Checkbox 
                      checked={selectedIds.has(s.id)}
                      onCheckedChange={(checked) => handleSelectRow(s.id, !!checked)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-900">{s.name}</span>
                      <span className="text-xs text-slate-500">{s.brand}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-sm text-slate-600">
                        <MapPin className="h-3.5 w-3.5 text-slate-400" />
                        <span title={s.address} className="truncate max-w-[200px]">{s.address}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-violet-600 font-mono">
                        <Grid3X3 className="h-3 w-3 text-violet-400" />
                        <span className="tracking-wider">{s.plusCode || (s.location ? encodePlusCode(s.location.lat, s.location.lng, 11) : 'N/A')}</span>
                      </div>
                      {s.masterPinEvidence && (
                        <div className="flex items-center gap-1 text-[10px] text-green-600 font-medium">
                          <ShieldCheck className="h-3 w-3" />
                          Master Pin Synced: {new Date(s.masterPinEvidence.lastSyncedAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-blue-50 text-blue-700 border-blue-100 font-medium flex items-center gap-1 w-fit">
                      <ShieldCheck className="h-3 w-3" />
                      Verified Station
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-2">
                        {[...(s.aliases || [])].slice(0, 3).map((a, i) => (
                          <div key={a.id || i} className="h-6 w-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] text-slate-500 font-bold" title={a.label}>
                            {a.label[0]}
                          </div>
                        ))}
                      </div>
                      <span className="text-xs text-slate-500 font-medium">
                        {(s.aliases?.length || 0)} Aliases
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const radius = s.geofenceRadius ?? getDefaultGeofenceRadius(s.plusCode);
                      const isCustom = s.geofenceRadius !== undefined && s.geofenceRadius !== getDefaultGeofenceRadius(s.plusCode);
                      const tier = radius <= 50
                        ? { label: 'Ultra Tight', color: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-500' }
                        : radius <= 100
                        ? { label: 'Tight', color: 'text-green-700', bg: 'bg-green-50', dot: 'bg-green-500' }
                        : radius <= 150
                        ? { label: 'Standard', color: 'text-blue-700', bg: 'bg-blue-50', dot: 'bg-blue-500' }
                        : radius <= 250
                        ? { label: 'Wide', color: 'text-amber-700', bg: 'bg-amber-50', dot: 'bg-amber-500' }
                        : { label: 'Extended', color: 'text-orange-700', bg: 'bg-orange-50', dot: 'bg-orange-500' };
                      return onSaveGeofenceRadius ? (
                        <GeofenceRadiusPopover station={s} onSave={onSaveGeofenceRadius}>
                          <button
                            type="button"
                            className={`flex flex-col gap-1 text-left rounded-md px-2 py-1 -mx-2 -my-1 transition-colors hover:${tier.bg} cursor-pointer group`}
                            title="Click to adjust geofence radius"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className={`inline-block h-2 w-2 rounded-full ${tier.dot}`} />
                              <span className={`text-xs font-semibold ${tier.color}`}>{tier.label}</span>
                              <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <span className="text-slate-500 text-[10px] tabular-nums">
                              ±{radius}m radius{isCustom ? ' (custom)' : ''}
                            </span>
                          </button>
                        </GeofenceRadiusPopover>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`inline-block h-2 w-2 rounded-full ${tier.dot}`} />
                            <span className={`text-xs font-semibold ${tier.color}`}>{tier.label}</span>
                          </div>
                          <span className="text-slate-500 text-[10px] tabular-nums">
                            ±{radius}m radius{isCustom ? ' (custom)' : ''}
                          </span>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-blue-600">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-4" align="end">
                          <div className="space-y-4">
                            <div className="space-y-1">
                              <h4 className="text-sm font-semibold leading-none">Add GPS Alias</h4>
                              <p className="text-xs text-slate-500">Link another coordinate set to this station.</p>
                            </div>
                            <div className="grid gap-2">
                              <div className="grid grid-cols-3 items-center gap-4">
                                <Label htmlFor="label" className="text-xs">Label</Label>
                                <Input
                                  id="label"
                                  placeholder="Gate B"
                                  className="col-span-2 h-8 text-xs"
                                  value={newAliasLabel}
                                  onChange={(e) => setNewAliasLabel(e.target.value)}
                                />
                              </div>
                              <div className="grid grid-cols-3 items-center gap-4">
                                <Label htmlFor="lat" className="text-xs">Lat</Label>
                                <Input
                                  id="lat"
                                  placeholder="18.000"
                                  className="col-span-2 h-8 text-xs"
                                  value={newAliasLat}
                                  onChange={(e) => setNewAliasLat(e.target.value)}
                                />
                              </div>
                              <div className="grid grid-cols-3 items-center gap-4">
                                <Label htmlFor="lng" className="text-xs">Lng</Label>
                                <Input
                                  id="lng"
                                  placeholder="-76.000"
                                  className="col-span-2 h-8 text-xs"
                                  value={newAliasLng}
                                  onChange={(e) => setNewAliasLng(e.target.value)}
                                />
                              </div>
                            </div>
                            <Button 
                              size="sm" 
                              className="w-full h-8 text-xs" 
                              onClick={() => handleAddAlias(s.id)}
                              disabled={isAddingAlias}
                            >
                              {isAddingAlias ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                              Save Alias
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>

                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-slate-400 hover:text-green-600"
                        title="Sync Master Pin"
                        onClick={() => setSelectedStation(s)}
                      >
                        <ArrowUpCircle className="h-4 w-4" />
                      </Button>

                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-slate-400 hover:text-slate-600"
                        title="View Station Details"
                        onClick={() => onSelectStation?.(s)}
                      >
                        <Info className="h-4 w-4" />
                      </Button>

                      {onSaveGeofenceRadius ? (
                        <GeofenceRadiusPopover station={s} onSave={onSaveGeofenceRadius}>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-slate-400 hover:text-amber-600"
                            title="Adjust Geofence Radius"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </GeofenceRadiusPopover>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selectedStation} onOpenChange={(open) => !open && setSelectedStation(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpCircle className="h-5 w-5 text-blue-600" />
              Sync Master Pin
            </DialogTitle>
            <DialogDescription>
              Select a high-integrity coordinate set to promote as the primary "Master Pin" for <span className="font-bold text-slate-900">{selectedStation?.name}</span>.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 p-3 border-b border-slate-200">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Current Master Pin</span>
              </div>
              <div className="p-3 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-slate-900">{selectedStation?.location.lat.toFixed(6)}, {selectedStation?.location.lng.toFixed(6)}</span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Grid3X3 className="h-3 w-3 text-violet-400" />
                    <span className="text-[10px] font-mono text-violet-600 tracking-wider">
                      {selectedStation ? encodePlusCode(selectedStation.location.lat, selectedStation.location.lng, 11) : ''}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500">Primary Coordinate</span>
                </div>
                <Badge className="bg-blue-100 text-blue-700">Active</Badge>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 uppercase">Available Alias Evidence</Label>
              {(!selectedStation?.aliases || selectedStation.aliases.length === 0) ? (
                <div className="text-sm text-slate-500 italic p-4 text-center border border-dashed rounded-lg">
                  No alias coordinates available for promotion.
                </div>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                  {selectedStation.aliases.map((alias) => (
                    <div key={alias.id} className="p-3 border rounded-lg hover:bg-slate-50 flex items-center justify-between group transition-colors">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-slate-900">{alias.label}</span>
                        <span className="text-[10px] text-slate-500">{alias.lat.toFixed(6)}, {alias.lng.toFixed(6)}</span>
                      </div>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-8 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleSyncMasterPin(selectedStation.id, alias.lat, alias.lng)}
                      >
                        Promote to Master
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelectedStation(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Audit Ledger Removal
            </DialogTitle>
            <DialogDescription className="pt-2">
              Are you sure you want to delete <span className="font-bold text-slate-900">{selectedIds.size}</span> verified stations? 
              This will permanently remove them from the Master Audit Ledger.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6 flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="min-w-[100px]"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                'Confirm Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}