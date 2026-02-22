import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Textarea } from '../ui/textarea';
import {
  Info,
  Pencil,
  Save,
  X,
  CalendarDays,
  Loader2,
  Car,
  Truck,
  Bus,
  Bike,
  DollarSign,
  CreditCard,
  Building2,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  History,
  Download,
  Link2,
  Unlink,
  Database,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { api } from '../../services/api';
import { TollPlaza } from '../../types/toll';

// ── Icon Mapping ──────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  car: Car,
  truck: Truck,
  bus: Bus,
  bike: Bike,
};

const ICON_OPTIONS = [
  { value: 'car', label: 'Car' },
  { value: 'truck', label: 'Truck' },
  { value: 'bus', label: 'Bus' },
  { value: 'bike', label: 'Motorcycle/Bike' },
];

function getClassIcon(iconName: string): LucideIcon {
  return ICON_MAP[iconName] || Car;
}

// ── Fleet Relevance Options ───────────────────────────────────────────

const FLEET_RELEVANCE_OPTIONS = [
  { value: 'Most Fleet Vehicles', color: 'emerald' },
  { value: 'Some Fleet Vehicles', color: 'amber' },
  { value: 'Rare in Fleet', color: 'slate' },
  { value: 'Not Applicable', color: 'rose' },
];

function getRelevanceBadgeClasses(color: string): string {
  switch (color) {
    case 'emerald': return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-none';
    case 'amber': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-none';
    case 'rose': return 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border-none';
    default: return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-none';
  }
}

// ── Types ──────────────────────────────────────────────────────────────

interface TollRate {
  withTag: number;
  withoutTag: number;
}

interface VehicleClass {
  id: string;
  label: string;
  iconName: string;
  description: string;
  examples: string;
  height: string;
  length: string;
  fleetRelevance: string;
  fleetRelevanceColor: string;
}

interface PlazaRates {
  plazaId?: string;
  plazaName: string;
  rates: Record<string, TollRate>; // classId → { withTag, withoutTag }
}

interface TollRateSchedule {
  effectiveDate: string; // DD/MM/YYYY
  operator: string;
  currency: string;
  plazas: PlazaRates[];
  vehicleClasses: VehicleClass[];
}

interface TollOperator {
  name: string;
  road: string;
  website: string;
  phone: string;
  tagBrand: string;
}

// ── Default Jamaica Toll Data ──────────────────────────────────────────

const DEFAULT_VEHICLE_CLASSES: VehicleClass[] = [
  {
    id: 'class1',
    label: 'Class 1',
    iconName: 'car',
    description: 'Vehicles less than 1.7m high, but any length',
    examples: 'Cars, SUVs, Pickup trucks',
    height: '< 1.7m',
    length: 'Any',
    fleetRelevance: 'Most Fleet Vehicles',
    fleetRelevanceColor: 'emerald',
  },
  {
    id: 'class2',
    label: 'Class 2',
    iconName: 'truck',
    description: 'Vehicles more than 1.7m high, but less than 5.5m long',
    examples: 'Minibuses, small trucks, large vans',
    height: '> 1.7m',
    length: '< 5.5m',
    fleetRelevance: 'Some Fleet Vehicles',
    fleetRelevanceColor: 'amber',
  },
  {
    id: 'class3',
    label: 'Class 3',
    iconName: 'bus',
    description: 'Vehicles more than 1.7m high and more than 5.5m long',
    examples: 'Buses, tractor-trailers, large trucks',
    height: '> 1.7m',
    length: '> 5.5m',
    fleetRelevance: 'Rare in Fleet',
    fleetRelevanceColor: 'slate',
  },
];

const JAMAICA_OPERATORS: TollOperator[] = [
  {
    name: 'TransJamaican Highway Limited',
    road: 'Highway 2000 East-West (Portmore to May Pen)',
    website: 'https://transjamaicanhighway.com',
    phone: '1-888-429-5637',
    tagBrand: 'T-Tag',
  },
  {
    name: 'Jamaica North South Highway Company Limited',
    road: 'North-South Highway (Caymanas to Ocho Rios)',
    website: 'https://jnshighway.com',
    phone: '1-888-429-5637',
    tagBrand: 'T-Tag',
  },
];

const DEFAULT_RATE_SCHEDULE: TollRateSchedule = {
  effectiveDate: '27/12/2025',
  operator: 'TransJamaican Highway Limited',
  currency: 'JMD',
  vehicleClasses: DEFAULT_VEHICLE_CLASSES,
  plazas: [
    {
      plazaName: 'Portmore',
      rates: {
        class1: { withTag: 370, withoutTag: 380 },
        class2: { withTag: 690, withoutTag: 710 },
        class3: { withTag: 1150, withoutTag: 1150 },
      },
    },
    {
      plazaName: 'Spanish Town',
      rates: {
        class1: { withTag: 275, withoutTag: 285 },
        class2: { withTag: 510, withoutTag: 530 },
        class3: { withTag: 850, withoutTag: 850 },
      },
    },
    {
      plazaName: 'Vineyards',
      rates: {
        class1: { withTag: 780, withoutTag: 790 },
        class2: { withTag: 1180, withoutTag: 1200 },
        class3: { withTag: 2400, withoutTag: 2400 },
      },
    },
    {
      plazaName: 'May Pen',
      rates: {
        class1: { withTag: 260, withoutTag: 270 },
        class2: { withTag: 410, withoutTag: 430 },
        class3: { withTag: 770, withoutTag: 770 },
      },
    },
    {
      plazaName: 'Toll Gate - Main Line',
      rates: {
        class1: { withTag: 470, withoutTag: 480 },
        class2: { withTag: 700, withoutTag: 720 },
        class3: { withTag: 1400, withoutTag: 1400 },
      },
    },
    {
      plazaName: 'Toll Gate - Ramp',
      rates: {
        class1: { withTag: 235, withoutTag: 240 },
        class2: { withTag: 350, withoutTag: 360 },
        class3: { withTag: 700, withoutTag: 700 },
      },
    },
  ],
};

const PAYMENT_METHODS = [
  { name: 'T-Tag (Prepaid)', description: 'Electronic tag deducted from prepaid balance. Discounted rates.', recommended: true },
  { name: 'Cash', description: 'Pay at booth with exact change or bills. Higher rates apply.', recommended: false },
  { name: 'Fleet Account', description: 'Post-paid corporate account billed monthly.', recommended: true },
];

const KV_KEY = 'toll_rate_schedule';

// ── Migration: convert old class1/class2/class3 format to rates map ──

function migrateSchedule(raw: any): TollRateSchedule {
  const vehicleClasses: VehicleClass[] = raw.vehicleClasses || DEFAULT_VEHICLE_CLASSES;

  const plazas: PlazaRates[] = (raw.plazas || []).map((p: any) => {
    // Already new format
    if (p.rates && typeof p.rates === 'object' && !Array.isArray(p.rates)) {
      return { plazaId: p.plazaId, plazaName: p.plazaName, rates: p.rates };
    }
    // Old format: class1, class2, class3 as top-level keys
    const rates: Record<string, TollRate> = {};
    if (p.class1) rates['class1'] = p.class1;
    if (p.class2) rates['class2'] = p.class2;
    if (p.class3) rates['class3'] = p.class3;
    // Also check for any other classN keys
    for (const key of Object.keys(p)) {
      if (key.startsWith('class') && key !== 'plazaId' && key !== 'plazaName' && !rates[key]) {
        rates[key] = p[key];
      }
    }
    return { plazaId: p.plazaId, plazaName: p.plazaName, rates };
  });

  return {
    effectiveDate: raw.effectiveDate || '27/12/2025',
    operator: raw.operator || 'TransJamaican Highway Limited',
    currency: raw.currency || 'JMD',
    vehicleClasses,
    plazas,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

function emptyRatesForClasses(classes: VehicleClass[]): Record<string, TollRate> {
  const rates: Record<string, TollRate> = {};
  classes.forEach(vc => {
    rates[vc.id] = { withTag: 0, withoutTag: 0 };
  });
  return rates;
}

function generateClassId(existingClasses: VehicleClass[]): string {
  let n = existingClasses.length + 1;
  while (existingClasses.some(c => c.id === `class${n}`)) n++;
  return `class${n}`;
}

// ── Component ──────────────────────────────────────────────────────────

export function TollInfoPage() {
  const [schedule, setSchedule] = useState<TollRateSchedule>(DEFAULT_RATE_SCHEDULE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editSchedule, setEditSchedule] = useState<TollRateSchedule>(DEFAULT_RATE_SCHEDULE);
  const [showAddPlaza, setShowAddPlaza] = useState(false);
  const [newPlazaName, setNewPlazaName] = useState('');
  const [activeTab, setActiveTab] = useState('rates');

  // ── Toll Database Plaza State ───────────────────────────────────────
  const [dbPlazas, setDbPlazas] = useState<TollPlaza[]>([]);
  const [dbPlazasLoading, setDbPlazasLoading] = useState(false);
  const [addMode, setAddMode] = useState<'database' | 'manual'>('database');
  const [selectedDbPlazaId, setSelectedDbPlazaId] = useState<string>('');
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkingPlazaIndex, setLinkingPlazaIndex] = useState<number>(-1);

  // ── Vehicle Class Edit State ────────────────────────────────────────
  const [classEditMode, setClassEditMode] = useState(false);
  const [editClasses, setEditClasses] = useState<VehicleClass[]>(DEFAULT_VEHICLE_CLASSES);
  const [showAddClass, setShowAddClass] = useState(false);
  const [editingClassIndex, setEditingClassIndex] = useState<number>(-1);
  const [classForm, setClassForm] = useState<VehicleClass>({
    id: '', label: '', iconName: 'car', description: '', examples: '',
    height: '', length: '', fleetRelevance: 'Most Fleet Vehicles', fleetRelevanceColor: 'emerald',
  });

  // ── Lookup map: database plaza ID → plaza object ────────────────────
  const dbPlazaMap = useMemo(() => {
    const map = new Map<string, TollPlaza>();
    dbPlazas.forEach(p => map.set(p.id, p));
    return map;
  }, [dbPlazas]);

  // ── Active vehicle classes (from edit or saved) ─────────────────────
  const activeClasses = useMemo(() => {
    return editMode ? editSchedule.vehicleClasses : schedule.vehicleClasses;
  }, [editMode, editSchedule.vehicleClasses, schedule.vehicleClasses]);

  // ── Load Database Plazas ────────────────────────────────────────────
  const loadDbPlazas = useCallback(async () => {
    setDbPlazasLoading(true);
    try {
      const data = await api.getTollPlazas();
      setDbPlazas(data);
      console.log(`[TollInfo] Loaded ${data.length} database plazas`);
    } catch (err) {
      console.log('[TollInfo] Failed to load database plazas:', err);
    } finally {
      setDbPlazasLoading(false);
    }
  }, []);

  // ── Load from KV Store ───────────────────────────────────────────────

  useEffect(() => {
    loadSchedule();
    loadDbPlazas();
  }, [loadDbPlazas]);

  const loadSchedule = async () => {
    setLoading(true);
    try {
      const resp = await api.getTollInfo();
      if (resp) {
        const raw = typeof resp === 'string' ? JSON.parse(resp) : resp;
        const migrated = migrateSchedule(raw);
        setSchedule(migrated);
        setEditSchedule(migrated);
        setEditClasses(migrated.vehicleClasses);
      }
    } catch (err) {
      console.log('[TollInfo] No saved schedule, using defaults');
    } finally {
      setLoading(false);
    }
  };

  // ── Save to KV Store ─────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.saveTollInfo(editSchedule);
      setSchedule(editSchedule);
      setEditMode(false);
      toast.success('Toll rates saved successfully');
    } catch (err) {
      console.error('[TollInfo] Save failed:', err);
      toast.error('Failed to save toll rates');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditSchedule(schedule);
    setEditMode(false);
  };

  // ── Rate Editing Helpers ─────────────────────────────────────────────

  const updateRate = (
    plazaIndex: number,
    classId: string,
    field: 'withTag' | 'withoutTag',
    value: string
  ) => {
    const numVal = parseFloat(value) || 0;
    setEditSchedule(prev => {
      const updated = { ...prev, plazas: [...prev.plazas] };
      const plaza = { ...updated.plazas[plazaIndex] };
      plaza.rates = { ...plaza.rates };
      plaza.rates[classId] = {
        ...(plaza.rates[classId] || { withTag: 0, withoutTag: 0 }),
        [field]: numVal,
      };
      updated.plazas[plazaIndex] = plaza;
      return updated;
    });
  };

  const handleAddPlaza = () => {
    if (!newPlazaName.trim()) return;
    setEditSchedule(prev => ({
      ...prev,
      plazas: [
        ...prev.plazas,
        {
          plazaName: newPlazaName.trim(),
          rates: emptyRatesForClasses(prev.vehicleClasses),
        },
      ],
    }));
    setNewPlazaName('');
    setShowAddPlaza(false);
    toast.success(`Added "${newPlazaName.trim()}" plaza`);
  };

  const handleAddFromDatabase = () => {
    const dbPlaza = dbPlazaMap.get(selectedDbPlazaId);
    if (!dbPlaza) return;
    const alreadyExists = editSchedule.plazas.some(p => p.plazaId === dbPlaza.id);
    if (alreadyExists) {
      toast.error(`"${dbPlaza.name}" is already in the rate table`);
      return;
    }
    setEditSchedule(prev => ({
      ...prev,
      plazas: [
        ...prev.plazas,
        {
          plazaId: dbPlaza.id,
          plazaName: dbPlaza.name,
          rates: emptyRatesForClasses(prev.vehicleClasses),
        },
      ],
    }));
    setSelectedDbPlazaId('');
    setShowAddPlaza(false);
    toast.success(`Added "${dbPlaza.name}" from Toll Database`);
  };

  const handleRemovePlaza = (index: number) => {
    const name = editSchedule.plazas[index].plazaName;
    setEditSchedule(prev => ({
      ...prev,
      plazas: prev.plazas.filter((_, i) => i !== index),
    }));
    toast.success(`Removed "${name}" plaza`);
  };

  // ── Link Plaza to Database ───────────────────────────────────────────

  const handleLinkPlaza = () => {
    const dbPlaza = dbPlazaMap.get(selectedDbPlazaId);
    if (!dbPlaza) return;
    setEditSchedule(prev => {
      const updated = { ...prev, plazas: [...prev.plazas] };
      updated.plazas[linkingPlazaIndex] = {
        ...updated.plazas[linkingPlazaIndex],
        plazaId: dbPlaza.id,
        plazaName: dbPlaza.name,
      };
      return updated;
    });
    setShowLinkDialog(false);
    toast.success(`Linked "${dbPlaza.name}" to plaza`);
  };

  const handleUnlinkPlaza = (index: number) => {
    setEditSchedule(prev => {
      const updated = { ...prev, plazas: [...prev.plazas] };
      updated.plazas[index] = {
        ...updated.plazas[index],
        plazaId: undefined,
        plazaName: updated.plazas[index].plazaName,
      };
      return updated;
    });
    toast.success(`Unlinked plaza`);
  };

  // ── Auto-Link ───────────────────────────────────────────────────────
  const handleAutoLink = () => {
    let linked = 0;
    setEditSchedule(prev => {
      const updated = { ...prev, plazas: prev.plazas.map(plaza => {
        if (plaza.plazaId) return plaza;
        const normalizedName = plaza.plazaName.toLowerCase().trim();
        const match = dbPlazas.find(dbP => {
          const dbName = dbP.name.toLowerCase().trim();
          return dbName === normalizedName
            || dbName.includes(normalizedName)
            || normalizedName.includes(dbName);
        });
        if (match) {
          linked++;
          return { ...plaza, plazaId: match.id, plazaName: match.name };
        }
        return plaza;
      })};
      return updated;
    });
    setTimeout(() => {
      if (linked > 0) {
        toast.success(`Auto-linked ${linked} plaza${linked > 1 ? 's' : ''} to the Toll Database`);
      } else {
        toast.info('No matching plazas found. Names may differ — try linking manually.');
      }
    }, 100);
  };

  // ── Vehicle Class Management ────────────────────────────────────────

  const handleSaveClasses = async () => {
    setSaving(true);
    try {
      // Update the schedule with new classes and ensure all plazas have rates for new classes
      const updatedSchedule: TollRateSchedule = {
        ...schedule,
        vehicleClasses: editClasses,
        plazas: schedule.plazas.map(plaza => {
          const newRates = { ...plaza.rates };
          // Add empty rates for any new classes
          editClasses.forEach(vc => {
            if (!newRates[vc.id]) {
              newRates[vc.id] = { withTag: 0, withoutTag: 0 };
            }
          });
          // Remove rates for deleted classes
          const validIds = new Set(editClasses.map(vc => vc.id));
          for (const key of Object.keys(newRates)) {
            if (!validIds.has(key)) delete newRates[key];
          }
          return { ...plaza, rates: newRates };
        }),
      };
      await api.saveTollInfo(updatedSchedule);
      setSchedule(updatedSchedule);
      setEditSchedule(updatedSchedule);
      setClassEditMode(false);
      toast.success('Vehicle classifications saved');
    } catch (err) {
      console.error('[TollInfo] Save classes failed:', err);
      toast.error('Failed to save vehicle classifications');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelClasses = () => {
    setEditClasses(schedule.vehicleClasses);
    setClassEditMode(false);
  };

  const openAddClassDialog = () => {
    const newId = generateClassId(editClasses);
    setClassForm({
      id: newId,
      label: `Class ${editClasses.length + 1}`,
      iconName: 'car',
      description: '',
      examples: '',
      height: '',
      length: '',
      fleetRelevance: 'Some Fleet Vehicles',
      fleetRelevanceColor: 'amber',
    });
    setEditingClassIndex(-1);
    setShowAddClass(true);
  };

  const openEditClassDialog = (index: number) => {
    setClassForm({ ...editClasses[index] });
    setEditingClassIndex(index);
    setShowAddClass(true);
  };

  const handleSaveClassForm = () => {
    if (!classForm.label.trim()) return;
    if (editingClassIndex >= 0) {
      // Edit existing
      setEditClasses(prev => prev.map((c, i) => i === editingClassIndex ? { ...classForm } : c));
      toast.success(`Updated "${classForm.label}"`);
    } else {
      // Add new
      setEditClasses(prev => [...prev, { ...classForm }]);
      toast.success(`Added "${classForm.label}"`);
    }
    setShowAddClass(false);
  };

  const handleDeleteClass = (index: number) => {
    const name = editClasses[index].label;
    if (editClasses.length <= 1) {
      toast.error('You must have at least one vehicle class');
      return;
    }
    setEditClasses(prev => prev.filter((_, i) => i !== index));
    toast.success(`Removed "${name}"`);
  };

  // ── Export as CSV ────────────────────────────────────────────────────

  const handleExport = () => {
    const data = schedule;
    const classLabels = data.vehicleClasses.map(vc => vc.label);
    const headers = ['Plaza', 'Class', 'With T-Tag (JMD)', 'Without T-Tag (JMD)'];
    const rows: string[][] = [headers];

    data.plazas.forEach(p => {
      data.vehicleClasses.forEach(vc => {
        const rate = p.rates[vc.id] || { withTag: 0, withoutTag: 0 };
        rows.push([p.plazaName, vc.label, rate.withTag.toFixed(2), rate.withoutTag.toFixed(2)]);
      });
    });

    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `toll_rates_${data.effectiveDate.replace(/\//g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Toll rates exported');
  };

  // ── Computed: Tag savings summary ────────────────────────────────────

  const tagSavings = useMemo(() => {
    const s = editMode ? editSchedule : schedule;
    const firstClass = s.vehicleClasses[0];
    if (!firstClass) return { perTrip: 0, total: 0 };
    let totalSaved = 0;
    let trips = 0;
    s.plazas.forEach(p => {
      const rate = p.rates[firstClass.id];
      if (rate) {
        totalSaved += (rate.withoutTag - rate.withTag);
        trips++;
      }
    });
    return { perTrip: trips > 0 ? totalSaved / trips : 0, total: totalSaved };
  }, [schedule, editSchedule, editMode]);

  // ── Computed: Link status summary ───────────────────────────────────

  const linkStatus = useMemo(() => {
    const s = editMode ? editSchedule : schedule;
    const linked = s.plazas.filter(p => p.plazaId && dbPlazaMap.has(p.plazaId)).length;
    const unlinked = s.plazas.length - linked;
    return { linked, unlinked, total: s.plazas.length };
  }, [schedule, editSchedule, editMode, dbPlazaMap]);

  // ── Render ───────────────────────────────────────────────────────────

  const displaySchedule = editMode ? editSchedule : schedule;
  const displayClasses = classEditMode ? editClasses : schedule.vehicleClasses;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Toll Info
            </h2>
            <p className="text-slate-500 dark:text-slate-400">
              Manage toll plaza rates, vehicle classifications, and payment information for Jamaica's highway network.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <Button variant="outline" size="sm" onClick={handleCancel} disabled={saving}>
                  <X className="h-4 w-4 mr-1" /> Cancel
                </Button>
                {linkStatus.unlinked > 0 && dbPlazas.length > 0 && (
                  <Button variant="outline" size="sm" onClick={handleAutoLink}>
                    <Link2 className="h-4 w-4 mr-1" /> Auto-Link
                  </Button>
                )}
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                  Save Changes
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-1" /> Export CSV
                </Button>
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setEditMode(true)}>
                  <Pencil className="h-4 w-4 mr-1" /> Edit Rates
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="rates">Toll Rates & Fees</TabsTrigger>
          <TabsTrigger value="classes">Vehicle Classifications</TabsTrigger>
          <TabsTrigger value="operators">Operators & Payment</TabsTrigger>
        </TabsList>

        {/* ═══ TAB 1: TOLL RATES ═══ */}
        <TabsContent value="rates" className="mt-6 space-y-6">
          {/* Effective Date & Meta */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-emerald-600" />
              {editMode ? (
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">Effective Date:</Label>
                  <Input
                    value={editSchedule.effectiveDate}
                    onChange={e => setEditSchedule(prev => ({ ...prev, effectiveDate: e.target.value }))}
                    placeholder="DD/MM/YYYY"
                    className="w-[140px] h-8 text-sm"
                  />
                </div>
              ) : (
                <span className="text-sm font-semibold text-emerald-600">
                  Effective {displaySchedule.effectiveDate}
                </span>
              )}
            </div>
            <Badge variant="outline" className="text-xs">
              <DollarSign className="h-3 w-3 mr-1" />
              {displaySchedule.currency}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {displaySchedule.plazas.length} Plazas
            </Badge>
            <Badge variant="outline" className="text-xs">
              {activeClasses.length} Classes
            </Badge>
            {linkStatus.linked > 0 && (
              <Badge className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 text-xs">
                <Database className="h-3 w-3 mr-1" />
                {linkStatus.linked}/{linkStatus.total} Linked
              </Badge>
            )}
            {linkStatus.unlinked > 0 && linkStatus.linked > 0 && (
              <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 text-xs">
                {linkStatus.unlinked} Unlinked
              </Badge>
            )}
            {!editMode && (
              <Badge className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800 text-xs">
                <Info className="h-3 w-3 mr-1" />
                Avg T-Tag savings: ${tagSavings.perTrip.toFixed(0)} per plaza
              </Badge>
            )}
          </div>

          {/* Rate Table — Vertical layout: plazas as rows */}
          <Card className="border-none shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    {/* Header Row 1: grouped by vehicle class */}
                    <tr className="bg-slate-700 dark:bg-slate-800 text-white">
                      <th className="p-3 text-left font-semibold border-r border-slate-600 min-w-[180px]" rowSpan={2}>
                        Toll Plaza
                      </th>
                      {activeClasses.map(vc => {
                        const Icon = getClassIcon(vc.iconName);
                        return (
                          <th
                            key={vc.id}
                            className="p-2 text-center font-semibold border-r border-slate-600 last:border-r-0"
                            colSpan={2}
                          >
                            <div className="flex items-center justify-center gap-1.5">
                              <Icon className="h-3.5 w-3.5" />
                              {vc.label}
                            </div>
                          </th>
                        );
                      })}
                      {editMode && (
                        <th className="p-2 text-center border-l border-slate-600 w-[70px]" rowSpan={2}>
                          Actions
                        </th>
                      )}
                    </tr>
                    {/* Header Row 2: T-Tag / Cash sub-headers */}
                    <tr className="bg-slate-600 dark:bg-slate-700 text-white text-xs">
                      {activeClasses.flatMap(vc => [
                        <th key={`${vc.id}-tag`} className="p-2 text-center font-medium border-r border-slate-500 min-w-[80px]">
                          T-Tag
                        </th>,
                        <th key={`${vc.id}-cash`} className="p-2 text-center font-medium border-r border-slate-500 last:border-r-0 min-w-[80px]">
                          Cash
                        </th>,
                      ])}
                    </tr>
                  </thead>
                  <tbody>
                    {displaySchedule.plazas.map((plaza, pi) => {
                      const isLinked = plaza.plazaId && dbPlazaMap.has(plaza.plazaId);
                      const dbPlaza = isLinked ? dbPlazaMap.get(plaza.plazaId!)! : null;
                      const bgClass = pi % 2 === 0
                        ? 'bg-white dark:bg-slate-900'
                        : 'bg-slate-50 dark:bg-slate-800/50';
                      return (
                        <tr key={plaza.plazaId || `plaza-${pi}`} className={`${bgClass} border-b border-slate-200 dark:border-slate-700`}>
                          {/* Plaza Name Cell */}
                          <td className="p-3 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                            <div className="flex items-center gap-2">
                              {isLinked ? (
                                <Database className="h-3.5 w-3.5 text-emerald-500 shrink-0" title="Linked to Toll Database" />
                              ) : (
                                <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" title="Not linked" />
                              )}
                              <div className="min-w-0">
                                <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate">
                                  {dbPlaza ? dbPlaza.name : plaza.plazaName}
                                </span>
                                {dbPlaza?.highway && (
                                  <span className="text-[10px] text-slate-400 block truncate">
                                    {dbPlaza.highway}
                                  </span>
                                )}
                              </div>
                              {editMode && (
                                <div className="flex items-center gap-0.5 ml-auto shrink-0">
                                  {plaza.plazaId ? (
                                    <button
                                      onClick={() => handleUnlinkPlaza(pi)}
                                      className="text-amber-500 hover:text-amber-700 transition-colors p-0.5"
                                      title="Unlink from database"
                                    >
                                      <Unlink className="h-3.5 w-3.5" />
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => { setLinkingPlazaIndex(pi); setSelectedDbPlazaId(''); setShowLinkDialog(true); }}
                                      className="text-blue-500 hover:text-blue-700 transition-colors p-0.5"
                                      title="Link to database plaza"
                                    >
                                      <Link2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          {/* Rate Cells: dynamic classes × T-Tag/Cash */}
                          {activeClasses.flatMap(vc => {
                            const rate = plaza.rates[vc.id] || { withTag: 0, withoutTag: 0 };
                            const editRate = editSchedule.plazas[pi]?.rates?.[vc.id] || { withTag: 0, withoutTag: 0 };
                            return [
                              /* T-Tag */
                              <td key={`${pi}-${vc.id}-tag`} className="p-2 text-center border-r border-slate-200 dark:border-slate-700">
                                {editMode ? (
                                  <Input
                                    type="number"
                                    value={editRate.withTag}
                                    onChange={e => updateRate(pi, vc.id, 'withTag', e.target.value)}
                                    className="w-[80px] h-7 text-sm text-center mx-auto"
                                  />
                                ) : (
                                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                                    ${rate.withTag.toLocaleString('en-JM', { minimumFractionDigits: 2 })}
                                  </span>
                                )}
                              </td>,
                              /* Cash */
                              <td key={`${pi}-${vc.id}-cash`} className="p-2 text-center border-r border-slate-200 dark:border-slate-700 last:border-r-0">
                                {editMode ? (
                                  <Input
                                    type="number"
                                    value={editRate.withoutTag}
                                    onChange={e => updateRate(pi, vc.id, 'withoutTag', e.target.value)}
                                    className="w-[80px] h-7 text-sm text-center mx-auto"
                                  />
                                ) : (
                                  <span className="font-medium text-slate-700 dark:text-slate-300">
                                    ${rate.withoutTag.toLocaleString('en-JM', { minimumFractionDigits: 2 })}
                                  </span>
                                )}
                              </td>,
                            ];
                          })}
                          {/* Edit mode: actions */}
                          {editMode && (
                            <td className="p-2 text-center">
                              <button
                                onClick={() => handleRemovePlaza(pi)}
                                className="text-red-400 hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                                title="Remove plaza"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {/* Add Plaza Row (edit mode only) */}
                    {editMode && (
                      <tr className="bg-slate-50 dark:bg-slate-800/30 border-t-2 border-dashed border-slate-300 dark:border-slate-600">
                        <td colSpan={1 + activeClasses.length * 2 + 1} className="p-3 text-center">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 dark:text-indigo-400 dark:border-indigo-800 dark:hover:bg-indigo-900/20"
                            onClick={() => setShowAddPlaza(true)}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Toll Plaza
                          </Button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Vehicle Class Legend */}
          <div className="flex flex-col gap-2 px-1">
            {activeClasses.map(vc => {
              const Icon = getClassIcon(vc.iconName);
              return (
                <div key={vc.id} className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <Icon className="h-4 w-4 text-slate-500 dark:text-slate-400 shrink-0" />
                  <span>
                    <strong className="text-slate-800 dark:text-slate-200">{vc.label}</strong>
                    {' '}vehicles are {vc.description.toLowerCase()}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Quick Reference Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="dark:bg-slate-900">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">Cheapest T-Tag Route</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {(() => {
                  const firstClass = schedule.vehicleClasses[0];
                  if (!firstClass) return <p className="text-sm text-slate-500">No classes defined</p>;
                  const cheapest = [...schedule.plazas].sort((a, b) =>
                    (a.rates[firstClass.id]?.withTag ?? 0) - (b.rates[firstClass.id]?.withTag ?? 0)
                  )[0];
                  return cheapest ? (
                    <div>
                      <p className="text-xl font-bold text-emerald-600">
                        ${(cheapest.rates[firstClass.id]?.withTag ?? 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{cheapest.plazaName} - {firstClass.label}</p>
                    </div>
                  ) : <p className="text-sm text-slate-500">No data</p>;
                })()}
              </CardContent>
            </Card>

            <Card className="dark:bg-slate-900">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">Most Expensive Route</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {(() => {
                  const firstClass = schedule.vehicleClasses[0];
                  if (!firstClass) return <p className="text-sm text-slate-500">No classes defined</p>;
                  const most = [...schedule.plazas].sort((a, b) =>
                    (b.rates[firstClass.id]?.withoutTag ?? 0) - (a.rates[firstClass.id]?.withoutTag ?? 0)
                  )[0];
                  return most ? (
                    <div>
                      <p className="text-xl font-bold text-rose-600">
                        ${(most.rates[firstClass.id]?.withoutTag ?? 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{most.plazaName} - {firstClass.label} (No Tag)</p>
                    </div>
                  ) : <p className="text-sm text-slate-500">No data</p>;
                })()}
              </CardContent>
            </Card>

            <Card className="dark:bg-slate-900">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Total All-Plaza Cost ({schedule.vehicleClasses[0]?.label || 'Class 1'})
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {(() => {
                  const firstClass = schedule.vehicleClasses[0];
                  if (!firstClass) return <p className="text-sm text-slate-500">No classes defined</p>;
                  const totalTag = schedule.plazas.reduce((s, p) => s + (p.rates[firstClass.id]?.withTag ?? 0), 0);
                  const totalCash = schedule.plazas.reduce((s, p) => s + (p.rates[firstClass.id]?.withoutTag ?? 0), 0);
                  return (
                    <div>
                      <p className="text-xl font-bold text-indigo-600">
                        ${totalTag.toLocaleString()} <span className="text-sm font-normal text-slate-400">/ ${totalCash.toLocaleString()}</span>
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">T-Tag / Cash (full highway)</p>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══ TAB 2: VEHICLE CLASSIFICATIONS ═══ */}
        <TabsContent value="classes" className="mt-6 space-y-6">
          {/* Edit Controls */}
          <div className="flex justify-end gap-2">
            {classEditMode ? (
              <>
                <Button variant="outline" size="sm" onClick={handleCancelClasses} disabled={saving}>
                  <X className="h-4 w-4 mr-1" /> Cancel
                </Button>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSaveClasses} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                  Save Classifications
                </Button>
              </>
            ) : (
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => { setEditClasses([...schedule.vehicleClasses]); setClassEditMode(true); }}>
                <Pencil className="h-4 w-4 mr-1" /> Edit Classifications
              </Button>
            )}
          </div>

          {/* Class Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayClasses.map((vc, index) => {
              const Icon = getClassIcon(vc.iconName);
              return (
                <Card key={vc.id} className="dark:bg-slate-900 relative group">
                  {classEditMode && (
                    <div className="absolute top-3 right-3 flex items-center gap-1 z-10">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-slate-400 hover:text-indigo-600"
                        onClick={() => openEditClassDialog(index)}
                        title="Edit class"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
                        onClick={() => handleDeleteClass(index)}
                        title="Remove class"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30">
                        <Icon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{vc.label}</CardTitle>
                        <CardDescription className="text-xs">{vc.examples}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                      {vc.description}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
                      {vc.height && <span>Height: <strong className="text-slate-700 dark:text-slate-300">{vc.height}</strong></span>}
                      {vc.length && <span>Length: <strong className="text-slate-700 dark:text-slate-300">{vc.length}</strong></span>}
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge className={getRelevanceBadgeClasses(vc.fleetRelevanceColor)}>
                        {vc.fleetRelevance}
                      </Badge>
                    </div>
                    <Separator className="my-3" />
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Rate Range (T-Tag)</p>
                      {(() => {
                        const rates = schedule.plazas.map(p => p.rates[vc.id]?.withTag ?? 0);
                        const min = rates.length > 0 ? Math.min(...rates) : 0;
                        const max = rates.length > 0 ? Math.max(...rates) : 0;
                        return (
                          <p className="text-lg font-bold text-emerald-600">
                            ${min.toLocaleString()} — ${max.toLocaleString()}
                            <span className="text-xs font-normal text-slate-400 ml-1">JMD</span>
                          </p>
                        );
                      })()}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {/* Add Class Card (edit mode only) */}
            {classEditMode && (
              <Card
                className="dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-indigo-600 transition-colors cursor-pointer flex items-center justify-center min-h-[200px]"
                onClick={openAddClassDialog}
              >
                <div className="text-center text-slate-400 dark:text-slate-500">
                  <Plus className="h-8 w-8 mx-auto mb-2" />
                  <p className="text-sm font-medium">Add Vehicle Class</p>
                </div>
              </Card>
            )}
          </div>

          {/* Classification Reference Table */}
          <Card className="dark:bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base">Classification Reference</CardTitle>
              <CardDescription>Height and length thresholds for Jamaica's toll system</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead>
                    <TableHead>Height</TableHead>
                    <TableHead>Length</TableHead>
                    <TableHead>Typical Vehicles</TableHead>
                    <TableHead>Fleet Relevance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayClasses.map(vc => (
                    <TableRow key={vc.id}>
                      <TableCell className="font-medium">{vc.label}</TableCell>
                      <TableCell>{vc.height || '—'}</TableCell>
                      <TableCell>{vc.length || '—'}</TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-400">{vc.examples}</TableCell>
                      <TableCell>
                        <Badge className={getRelevanceBadgeClasses(vc.fleetRelevanceColor)}>
                          {vc.fleetRelevance}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB 3: OPERATORS & PAYMENT ═══ */}
        <TabsContent value="operators" className="mt-6 space-y-6">
          {/* Operators */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {JAMAICA_OPERATORS.map(op => (
              <Card key={op.name} className="dark:bg-slate-900">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30">
                      <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{op.name}</CardTitle>
                      <CardDescription className="text-xs">{op.road}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Website</p>
                      <a href={op.website} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline truncate block">
                        {op.website.replace('https://', '')}
                      </a>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Phone</p>
                      <p className="font-medium text-slate-800 dark:text-slate-200">{op.phone}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Tag System</p>
                      <p className="font-medium text-slate-800 dark:text-slate-200">{op.tagBrand}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Payment Methods */}
          <Card className="dark:bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base">Accepted Payment Methods</CardTitle>
              <CardDescription>How tolls can be paid on Jamaica's highways</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {PAYMENT_METHODS.map(pm => (
                  <div
                    key={pm.name}
                    className={`p-4 rounded-lg border ${
                      pm.recommended
                        ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <CreditCard className={`h-4 w-4 ${pm.recommended ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`} />
                      <span className="font-medium text-sm text-slate-800 dark:text-slate-200">{pm.name}</span>
                      {pm.recommended && (
                        <Badge className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-none text-[10px] h-4 px-1">
                          Recommended
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">{pm.description}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Fleet Tips */}
          <Card className="dark:bg-slate-900 border-indigo-200 dark:border-indigo-800">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Info className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <CardTitle className="text-base">Fleet Management Tips</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span><strong>Always use T-Tags</strong> — Even small savings of $10 per trip add up quickly across a fleet. At {schedule.plazas.length} plazas, a single daily round trip saves ~${(tagSavings.total * 2).toLocaleString()} JMD per vehicle per day.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span><strong>Reconcile weekly</strong> — Cross-reference T-Tag statements against trip logs to catch any toll charges not matching your expected routes.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span><strong>Track vehicle class</strong> — Ensure each vehicle in your fleet is assigned the correct toll class. A misclassified vehicle could be overcharged.</span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <span><strong>Rate changes</strong> — Toll rates are reviewed periodically. Update this page when new rates are published to keep reconciliation accurate.</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Add Plaza Dialog ─────────────────────────────────────────── */}
      <Dialog open={showAddPlaza} onOpenChange={(open) => { setShowAddPlaza(open); if (!open) { setNewPlazaName(''); setSelectedDbPlazaId(''); setAddMode('database'); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Toll Plaza to Rate Table</DialogTitle>
            <DialogDescription>
              Choose a plaza from the Toll Database (linked) or enter a name manually (unlinked).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Mode toggle */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant={addMode === 'database' ? 'default' : 'outline'}
                size="sm"
                className={addMode === 'database' ? 'bg-indigo-600 hover:bg-indigo-700 flex-1' : 'flex-1'}
                onClick={() => setAddMode('database')}
              >
                <Database className="h-3.5 w-3.5 mr-1.5" />
                From Database
              </Button>
              <Button
                type="button"
                variant={addMode === 'manual' ? 'default' : 'outline'}
                size="sm"
                className={addMode === 'manual' ? 'bg-indigo-600 hover:bg-indigo-700 flex-1' : 'flex-1'}
                onClick={() => setAddMode('manual')}
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Manual Entry
              </Button>
            </div>

            {addMode === 'database' ? (
              <div>
                <Label className="text-sm">Select from Toll Database</Label>
                <Select
                  value={selectedDbPlazaId}
                  onValueChange={setSelectedDbPlazaId}
                  disabled={dbPlazasLoading}
                >
                  <SelectTrigger className="w-full mt-1.5">
                    <SelectValue placeholder={dbPlazasLoading ? 'Loading plazas...' : 'Select a plaza'} />
                  </SelectTrigger>
                  <SelectContent>
                    {dbPlazas.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-slate-500">
                        No plazas in database. Add plazas in Toll Database first.
                      </div>
                    ) : (
                      dbPlazas
                        .filter(p => !editSchedule.plazas.some(ep => ep.plazaId === p.id))
                        .map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            <div className="flex items-center gap-2">
                              <span>{p.name}</span>
                              {p.highway && (
                                <span className="text-xs text-slate-400">— {p.highway}</span>
                              )}
                            </div>
                          </SelectItem>
                        ))
                    )}
                  </SelectContent>
                </Select>
                {selectedDbPlazaId && dbPlazaMap.has(selectedDbPlazaId) && (
                  <div className="mt-2 p-2 rounded bg-slate-50 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                    <p><strong>Highway:</strong> {dbPlazaMap.get(selectedDbPlazaId)!.highway || '—'}</p>
                    <p><strong>Operator:</strong> {dbPlazaMap.get(selectedDbPlazaId)!.operator || '—'}</p>
                    <p><strong>Parish:</strong> {dbPlazaMap.get(selectedDbPlazaId)!.parish || '—'}</p>
                    <p><strong>Status:</strong> {dbPlazaMap.get(selectedDbPlazaId)!.status}</p>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <Label className="text-sm">Plaza Name</Label>
                <Input
                  value={newPlazaName}
                  onChange={e => setNewPlazaName(e.target.value)}
                  placeholder="e.g. Caymanas"
                  className="mt-1.5"
                  onKeyDown={e => e.key === 'Enter' && newPlazaName.trim() && handleAddPlaza()}
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  This plaza won't be linked to the Toll Database. You can link it later.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddPlaza(false)}>Cancel</Button>
            {addMode === 'database' ? (
              <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={handleAddFromDatabase} disabled={!selectedDbPlazaId}>
                <Link2 className="h-4 w-4 mr-1" /> Add Linked Plaza
              </Button>
            ) : (
              <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={handleAddPlaza} disabled={!newPlazaName.trim()}>
                <Plus className="h-4 w-4 mr-1" /> Add Plaza
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Link Plaza Dialog ──────────────────────────────────────────── */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link Toll Plaza</DialogTitle>
            <DialogDescription>Select a toll plaza from the database to link to the rate table.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Plaza Name</Label>
              <Select
                value={selectedDbPlazaId}
                onValueChange={setSelectedDbPlazaId}
                disabled={dbPlazasLoading}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a plaza" />
                </SelectTrigger>
                <SelectContent>
                  {dbPlazasLoading ? (
                    <div className="px-3 py-2 text-sm text-slate-500">Loading...</div>
                  ) : dbPlazas.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-500">No plazas found</div>
                  ) : (
                    dbPlazas.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkDialog(false)}>Cancel</Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={handleLinkPlaza} disabled={!selectedDbPlazaId}>
              <Link2 className="h-4 w-4 mr-1" /> Link Plaza
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add/Edit Vehicle Class Dialog ──────────────────────────────── */}
      <Dialog open={showAddClass} onOpenChange={setShowAddClass}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingClassIndex >= 0 ? 'Edit Vehicle Class' : 'Add Vehicle Class'}</DialogTitle>
            <DialogDescription>
              {editingClassIndex >= 0
                ? 'Update the details for this vehicle classification.'
                : 'Define a new vehicle classification. Rates for this class will be added to all plazas (starting at $0).'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Class Label *</Label>
                <Input
                  value={classForm.label}
                  onChange={e => setClassForm(prev => ({ ...prev, label: e.target.value }))}
                  placeholder="e.g. Class 4"
                />
              </div>
              <div className="space-y-2">
                <Label>Icon</Label>
                <Select
                  value={classForm.iconName}
                  onValueChange={val => setClassForm(prev => ({ ...prev, iconName: val }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map(opt => {
                      const OptIcon = ICON_MAP[opt.value];
                      return (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex items-center gap-2">
                            <OptIcon className="h-4 w-4" />
                            {opt.label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={classForm.description}
                onChange={e => setClassForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="e.g. Vehicles more than 2.5m high and more than 10m long"
                className="h-16 resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label>Example Vehicles</Label>
              <Input
                value={classForm.examples}
                onChange={e => setClassForm(prev => ({ ...prev, examples: e.target.value }))}
                placeholder="e.g. Large trucks, tankers"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Height Threshold</Label>
                <Input
                  value={classForm.height}
                  onChange={e => setClassForm(prev => ({ ...prev, height: e.target.value }))}
                  placeholder="e.g. > 2.5m"
                />
              </div>
              <div className="space-y-2">
                <Label>Length Threshold</Label>
                <Input
                  value={classForm.length}
                  onChange={e => setClassForm(prev => ({ ...prev, length: e.target.value }))}
                  placeholder="e.g. > 10m"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Fleet Relevance</Label>
              <Select
                value={classForm.fleetRelevance}
                onValueChange={val => {
                  const opt = FLEET_RELEVANCE_OPTIONS.find(o => o.value === val);
                  setClassForm(prev => ({
                    ...prev,
                    fleetRelevance: val,
                    fleetRelevanceColor: opt?.color || 'slate',
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FLEET_RELEVANCE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddClass(false)}>Cancel</Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={handleSaveClassForm}
              disabled={!classForm.label.trim()}
            >
              {editingClassIndex >= 0 ? (
                <><Save className="h-4 w-4 mr-1" /> Update Class</>
              ) : (
                <><Plus className="h-4 w-4 mr-1" /> Add Class</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
