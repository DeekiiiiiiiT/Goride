import React, { useState, useMemo } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '../ui/table';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Slider } from '../ui/slider';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover';
import {
  Search,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  AlertTriangle,
  Loader2,
  MapPin,
  RotateCcw,
  Check,
  Building2,
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { TollPlaza } from '../../types/toll';

// ─── Constants ──────────────────────────────────────────────────────────────
const DEFAULT_GEOFENCE_RADIUS = 200;

// ─── Geofence Radius Popover ────────────────────────────────────────────────
function GeofenceRadiusPopover({
  plaza,
  onSave,
  children,
}: {
  plaza: TollPlaza;
  onSave: (id: string, updates: Partial<TollPlaza>) => Promise<void>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const currentRadius = plaza.geofenceRadius ?? DEFAULT_GEOFENCE_RADIUS;
  const [localRadius, setLocalRadius] = useState(currentRadius);
  const [inputValue, setInputValue] = useState(String(currentRadius));

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      const r = plaza.geofenceRadius ?? DEFAULT_GEOFENCE_RADIUS;
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
    if (!isNaN(num) && num >= 50 && num <= 1000) {
      setLocalRadius(num);
    }
  };

  const handleInputBlur = () => {
    const num = parseInt(inputValue, 10);
    if (isNaN(num) || num < 50) {
      setLocalRadius(50);
      setInputValue('50');
    } else if (num > 1000) {
      setLocalRadius(1000);
      setInputValue('1000');
    } else {
      setLocalRadius(num);
      setInputValue(String(num));
    }
  };

  const handleReset = () => {
    setLocalRadius(DEFAULT_GEOFENCE_RADIUS);
    setInputValue(String(DEFAULT_GEOFENCE_RADIUS));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(plaza.id, { geofenceRadius: localRadius });
      toast.success(`Geofence radius set to ${localRadius}m for ${plaza.name}`);
      setOpen(false);
    } catch {
      toast.error('Failed to save geofence radius');
    } finally {
      setSaving(false);
    }
  };

  const isCustom = localRadius !== DEFAULT_GEOFENCE_RADIUS;

  const tier =
    localRadius <= 100
      ? { label: 'Tight', color: 'text-emerald-700', dot: 'bg-emerald-500' }
      : localRadius <= 200
      ? { label: 'Standard', color: 'text-blue-700', dot: 'bg-blue-500' }
      : localRadius <= 400
      ? { label: 'Wide', color: 'text-amber-700', dot: 'bg-amber-500' }
      : { label: 'Extended', color: 'text-orange-700', dot: 'bg-orange-500' };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" side="bottom">
        <div className="bg-gradient-to-r from-indigo-50 to-violet-50 p-4 rounded-lg">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-indigo-600" />
              <span className="text-[10px] uppercase text-indigo-700 font-bold tracking-wide">
                Geofence Radius
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`inline-block h-2 w-2 rounded-full ${tier.dot}`} />
              <span className={`text-[10px] font-semibold ${tier.color}`}>{tier.label}</span>
              {isCustom && (
                <span className="text-[8px] font-bold text-indigo-600 bg-indigo-100 px-1 py-0.5 rounded">
                  CUSTOM
                </span>
              )}
            </div>
          </div>

          {/* Plaza name context */}
          <p className="text-[10px] text-indigo-600/70 mb-3 truncate">
            {plaza.name} — {plaza.highway || 'No Highway'}
          </p>

          {/* Slider + Input */}
          <div className="flex items-center gap-3 mb-2">
            <div className="flex-1">
              <Slider
                value={[localRadius]}
                onValueChange={handleSliderChange}
                min={50}
                max={1000}
                step={10}
                className="[&_[data-slot=slider-track]]:h-2 [&_[data-slot=slider-range]]:bg-indigo-500 [&_[data-slot=slider-thumb]]:border-indigo-500 [&_[data-slot=slider-thumb]]:size-4"
              />
            </div>
            <div className="relative w-[72px] shrink-0">
              <Input
                type="number"
                min={50}
                max={1000}
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleInputBlur();
                    handleSave();
                  }
                }}
                className="h-8 text-xs font-mono font-bold text-indigo-800 text-center pr-5 bg-white/80 border-indigo-200 focus:border-indigo-400"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-indigo-500 font-medium pointer-events-none">
                m
              </span>
            </div>
          </div>

          {/* Scale labels */}
          <div className="flex justify-between mb-3">
            <span className="text-[8px] text-indigo-400">50m (tight)</span>
            <span className="text-[8px] text-indigo-400">Default: {DEFAULT_GEOFENCE_RADIUS}m</span>
            <span className="text-[8px] text-indigo-400">1000m (wide)</span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] text-indigo-600 hover:text-indigo-700 hover:bg-indigo-100 gap-1 flex-1"
              onClick={handleReset}
              disabled={!isCustom}
            >
              <RotateCcw className="h-3 w-3" />
              Reset to Default ({DEFAULT_GEOFENCE_RADIUS}m)
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 text-[10px] bg-indigo-600 hover:bg-indigo-700 text-white gap-1 flex-1"
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

// ─── Direction icon helper ──────────────────────────────────────────────────
function directionIcon(direction: string) {
  switch (direction) {
    case 'Eastbound':  return <ArrowRight className="h-3.5 w-3.5 text-slate-500" />;
    case 'Westbound':  return <ArrowLeft  className="h-3.5 w-3.5 text-slate-500" />;
    case 'Northbound': return <ArrowUp    className="h-3.5 w-3.5 text-slate-500" />;
    case 'Southbound': return <ArrowDown  className="h-3.5 w-3.5 text-slate-500" />;
    default:           return <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />;
  }
}

// ─── Props ──────────────────────────────────────────────────────────────────
interface VerifiedTollPlazasTabProps {
  plazas: TollPlaza[];
  onUpdatePlaza: (id: string, updates: Partial<TollPlaza>) => Promise<void>;
  onDemotePlaza: (id: string) => Promise<void>;
  onRefresh: () => void;
}

// ─── Main Component ─────────────────────────────────────────────────────────
export function VerifiedTollPlazasTab({
  plazas,
  onUpdatePlaza,
  onDemotePlaza,
  onRefresh,
}: VerifiedTollPlazasTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [demotingId, setDemotingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return plazas;
    const lower = searchTerm.toLowerCase();
    return plazas.filter(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        (p.highway || '').toLowerCase().includes(lower) ||
        (p.parish || '').toLowerCase().includes(lower)
    );
  }, [plazas, searchTerm]);

  const handleDemote = async (plaza: TollPlaza) => {
    if (!confirm(`Demote "${plaza.name}" from the verified ledger? It will return to unverified status.`)) return;
    setDemotingId(plaza.id);
    try {
      await onDemotePlaza(plaza.id);
    } finally {
      setDemotingId(null);
    }
  };

  // ── Empty state ────────────────────────────────────────────────────────────
  if (plazas.length === 0) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[400px] text-center">
        <ShieldCheck className="h-12 w-12 text-slate-300 mb-4" />
        <h4 className="text-lg font-semibold text-slate-700 mb-1">No verified toll plazas yet</h4>
        <p className="text-sm text-slate-500 max-w-md">
          Promote plazas from the All Toll Plazas tab to build your verified ledger — the single source of truth for spatial matching.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-slate-900">Master Verified Ledger</h3>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-100 flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" />
              Source of Truth
            </Badge>
            <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 text-[10px]">
              {plazas.length} plaza{plazas.length !== 1 ? 's' : ''}
            </Badge>
          </div>
          <p className="text-sm text-slate-500">
            These toll plazas are the confirmed source of truth for spatial matching.
          </p>
        </div>

        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search verified plazas..."
            className="pl-9 h-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Name</TableHead>
              <TableHead>Highway</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Operator</TableHead>
              <TableHead>GPS</TableHead>
              <TableHead>Plus Code</TableHead>
              <TableHead>Geofence</TableHead>
              <TableHead className="text-right">Transactions</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-slate-500 italic">
                  {searchTerm ? `No verified plazas match "${searchTerm}"` : 'No verified plazas.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((plaza) => (
                <TableRow key={plaza.id} className="hover:bg-slate-50/50 transition-colors">
                  {/* Name */}
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <span className="font-semibold text-slate-900">{plaza.name}</span>
                    </div>
                  </TableCell>

                  {/* Highway */}
                  <TableCell className="text-sm text-slate-700">{plaza.highway || '—'}</TableCell>

                  {/* Direction */}
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm text-slate-600">
                      {directionIcon(plaza.direction)}
                      <span>{plaza.direction}</span>
                    </div>
                  </TableCell>

                  {/* Operator */}
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm text-slate-600">
                      <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="truncate max-w-[120px]">{plaza.operator || '—'}</span>
                    </div>
                  </TableCell>

                  {/* GPS */}
                  <TableCell>
                    {plaza.location?.lat && plaza.location?.lng ? (
                      <span className="text-xs font-mono text-slate-600">
                        {plaza.location.lat.toFixed(4)}, {plaza.location.lng.toFixed(4)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 italic">N/A</span>
                    )}
                  </TableCell>

                  {/* Plus Code */}
                  <TableCell>
                    {plaza.plusCode ? (
                      <Badge variant="outline" className="font-mono text-[10px] bg-violet-50 text-violet-700 border-violet-200">
                        {plaza.plusCode}
                      </Badge>
                    ) : (
                      <span className="text-xs text-slate-400 italic">—</span>
                    )}
                  </TableCell>

                  {/* Geofence (editable) */}
                  <TableCell>
                    <GeofenceRadiusPopover plaza={plaza} onSave={onUpdatePlaza}>
                      <button
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-xs font-mono font-semibold text-indigo-700 cursor-pointer transition-colors"
                        title="Click to edit geofence radius"
                      >
                        <MapPin className="h-3 w-3 text-indigo-500" />
                        {plaza.geofenceRadius ?? DEFAULT_GEOFENCE_RADIUS}m
                      </button>
                    </GeofenceRadiusPopover>
                  </TableCell>

                  {/* Transactions */}
                  <TableCell className="text-right text-sm font-medium text-slate-700 tabular-nums">
                    {(plaza.stats?.totalTransactions || 0).toLocaleString()}
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50 gap-1 text-xs"
                      onClick={() => handleDemote(plaza)}
                      disabled={demotingId === plaza.id}
                      title="Demote to unverified"
                    >
                      {demotingId === plaza.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5" />
                      )}
                      Demote
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
