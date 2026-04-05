import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Car,
  Package,
  Navigation,
  Truck,
  Ship,
  HardDrive,
  Table2,
  Fuel,
  Tags,
  Check,
  X,
  GripVertical,
  Plus,
  Trash2,
  Loader2,
  Save,
  AlertCircle,
} from 'lucide-react';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { useAuth } from '../auth/AuthContext';
import { BusinessType } from '../../types/data';
import { BUSINESS_TYPES } from '../../utils/businessTypes';

interface LedgerColumnSettingsProps {
  onBack: () => void;
}

type LedgerType = 'main' | 'trip' | 'fuel' | 'toll';

interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  custom?: boolean;
}

interface LedgerConfig {
  businessType: BusinessType;
  enabledLedgers: LedgerType[];
  columns: Record<LedgerType, ColumnConfig[]>;
}

const BUSINESS_TYPE_ICONS: Record<BusinessType, React.ElementType> = {
  rideshare: Car,
  delivery: Package,
  taxi: Navigation,
  trucking: Truck,
  shipping: Ship,
};

const LEDGER_INFO: { id: LedgerType; label: string; icon: React.ElementType }[] = [
  { id: 'main', label: 'Main Ledger', icon: HardDrive },
  { id: 'trip', label: 'Trip Ledger', icon: Table2 },
  { id: 'fuel', label: 'Fuel Ledger', icon: Fuel },
  { id: 'toll', label: 'Toll Ledger', icon: Tags },
];

/**
 * DEFAULT_COLUMNS must match the actual column keys used in each ledger table.
 * Trip Ledger: keys from TripLedgerTable ALL_COLUMNS
 * Fuel Ledger: keys from FuelLedgerTable ALL_COLUMNS  
 * Toll Ledger: keys from TollLedgerTable ALL_COLUMNS
 */
const DEFAULT_COLUMNS: Record<LedgerType, ColumnConfig[]> = {
  main: [
    { key: 'date', label: 'Date', visible: true },
    { key: 'type', label: 'Type', visible: true },
    { key: 'amount', label: 'Amount', visible: true },
    { key: 'description', label: 'Description', visible: true },
    { key: 'reference', label: 'Reference', visible: true },
  ],
  trip: [
    // Core columns (default visible)
    { key: 'id', label: 'ID', visible: true },
    { key: 'date', label: 'Date/Time', visible: true },
    { key: 'tripDate', label: 'Date', visible: false },
    { key: 'tripTime', label: 'Time', visible: false },
    { key: 'driver', label: 'Driver', visible: true },
    { key: 'vehicle', label: 'Vehicle', visible: true },
    { key: 'platform', label: 'Platform', visible: true },
    { key: 'status', label: 'Status', visible: true },
    { key: 'distance', label: 'Distance', visible: true },
    { key: 'duration', label: 'Duration', visible: true },
    // Financial columns
    { key: 'amount', label: 'Amount', visible: true },
    { key: 'netIncome', label: 'Net Income', visible: true },
    { key: 'paymentMethod', label: 'Payment', visible: true },
    { key: 'cashCollected', label: 'Cash Collected', visible: true },
    { key: 'tips', label: 'Tips', visible: false },
    { key: 'surge', label: 'Surge', visible: false },
    { key: 'tolls', label: 'Tolls', visible: false },
    { key: 'serviceFee', label: 'Service Fee', visible: false },
    // Metadata columns
    { key: 'pickup', label: 'Pickup', visible: false },
    { key: 'dropoff', label: 'Dropoff', visible: false },
    { key: 'serviceCategory', label: 'Service Category', visible: false },
    { key: 'batchSource', label: 'Batch Source', visible: false },
    { key: 'efficiencyScore', label: 'Efficiency', visible: false },
  ],
  fuel: [
    { key: 'id', label: 'ID', visible: true },
    { key: 'date', label: 'Date', visible: true },
    { key: 'vehicleId', label: 'Vehicle', visible: true },
    { key: 'driverId', label: 'Driver', visible: true },
    { key: 'amount', label: 'Amount', visible: true },
    { key: 'liters', label: 'Liters', visible: true },
    { key: 'pricePerLiter', label: 'Price/Liter', visible: true },
    { key: 'odometer', label: 'Odometer', visible: true },
    { key: 'location', label: 'Location', visible: true },
    { key: 'paymentSource', label: 'Payment Source', visible: true },
    { key: 'entryMode', label: 'Entry Mode', visible: false },
    { key: 'type', label: 'Type', visible: false },
    { key: 'auditStatus', label: 'Audit Status', visible: false },
  ],
  toll: [
    { key: 'id', label: 'ID', visible: true },
    { key: 'date', label: 'Date', visible: true },
    { key: 'vehiclePlate', label: 'Vehicle', visible: true },
    { key: 'driverName', label: 'Driver', visible: true },
    { key: 'plaza', label: 'Plaza', visible: true },
    { key: 'amount', label: 'Amount', visible: true },
    { key: 'type', label: 'Type', visible: true },
    { key: 'reconciliationStatus', label: 'Reconciliation', visible: true },
    { key: 'status', label: 'Status', visible: false },
    { key: 'paymentMethod', label: 'Payment Method', visible: false },
    { key: 'matchedTripId', label: 'Matched Trip', visible: false },
  ],
};

const DEFAULT_ENABLED_LEDGERS: LedgerType[] = ['trip', 'fuel', 'toll'];

/**
 * Merge saved trip columns with defaults so new keys (e.g. tripDate/tripTime) appear for legacy KV configs.
 */
export function mergeTripLedgerColumnConfig(saved: ColumnConfig[] | undefined): ColumnConfig[] {
  const defaults = DEFAULT_COLUMNS.trip;
  if (!saved?.length) return defaults.map(c => ({ ...c }));
  const savedMap = new Map(saved.map(c => [c.key, c]));
  const merged: ColumnConfig[] = [];
  for (const def of defaults) {
    const s = savedMap.get(def.key);
    merged.push(
      s
        ? { ...def, ...s, label: s.label?.trim() ? s.label : def.label }
        : { ...def }
    );
  }
  for (const s of saved) {
    if (!defaults.some(d => d.key === s.key)) merged.push(s);
  }
  return merged;
}

export function LedgerColumnSettings({ onBack }: LedgerColumnSettingsProps) {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const queryClient = useQueryClient();

  const [selectedBusinessType, setSelectedBusinessType] = useState<BusinessType>('rideshare');
  const [enabledLedgers, setEnabledLedgers] = useState<LedgerType[]>(DEFAULT_ENABLED_LEDGERS);
  const [columns, setColumns] = useState<Record<LedgerType, ColumnConfig[]>>(DEFAULT_COLUMNS);
  const [expandedLedger, setExpandedLedger] = useState<LedgerType | null>('trip');
  const [newColumnName, setNewColumnName] = useState('');
  const [addingToLedger, setAddingToLedger] = useState<LedgerType | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: savedConfig, isLoading } = useQuery<LedgerConfig>({
    queryKey: ['ledgerConfig', selectedBusinessType],
    queryFn: async () => {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/ledger-config/${selectedBusinessType}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        return {
          businessType: selectedBusinessType,
          enabledLedgers: DEFAULT_ENABLED_LEDGERS,
          columns: DEFAULT_COLUMNS,
        };
      }
      return res.json();
    },
    enabled: !!accessToken,
  });

  useEffect(() => {
    if (savedConfig) {
      setEnabledLedgers(savedConfig.enabledLedgers || DEFAULT_ENABLED_LEDGERS);
      setColumns({
        main: savedConfig.columns?.main ?? DEFAULT_COLUMNS.main,
        trip: mergeTripLedgerColumnConfig(savedConfig.columns?.trip),
        fuel: savedConfig.columns?.fuel ?? DEFAULT_COLUMNS.fuel,
        toll: savedConfig.columns?.toll ?? DEFAULT_COLUMNS.toll,
      });
      setHasChanges(false);
    }
  }, [savedConfig]);

  const saveMutation = useMutation({
    mutationFn: async (config: LedgerConfig) => {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/ledger-config/${selectedBusinessType}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error('Failed to save');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledgerConfig'] });
      setHasChanges(false);
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      businessType: selectedBusinessType,
      enabledLedgers,
      columns,
    });
  };

  const toggleLedger = (ledger: LedgerType) => {
    setEnabledLedgers(prev =>
      prev.includes(ledger) ? prev.filter(l => l !== ledger) : [...prev, ledger]
    );
    setHasChanges(true);
  };

  const toggleColumnVisibility = (ledger: LedgerType, columnKey: string) => {
    setColumns(prev => ({
      ...prev,
      [ledger]: prev[ledger].map(col =>
        col.key === columnKey ? { ...col, visible: !col.visible } : col
      ),
    }));
    setHasChanges(true);
  };

  const addCustomColumn = (ledger: LedgerType) => {
    if (!newColumnName.trim()) return;
    const key = newColumnName.toLowerCase().replace(/\s+/g, '_');
    setColumns(prev => ({
      ...prev,
      [ledger]: [...prev[ledger], { key, label: newColumnName.trim(), visible: true, custom: true }],
    }));
    setNewColumnName('');
    setAddingToLedger(null);
    setHasChanges(true);
  };

  const removeCustomColumn = (ledger: LedgerType, columnKey: string) => {
    setColumns(prev => ({
      ...prev,
      [ledger]: prev[ledger].filter(col => col.key !== columnKey),
    }));
    setHasChanges(true);
  };

  const updateColumnLabel = (ledger: LedgerType, columnKey: string, label: string) => {
    setColumns(prev => ({
      ...prev,
      [ledger]: prev[ledger].map(col =>
        col.key === columnKey ? { ...col, label } : col
      ),
    }));
    setHasChanges(true);
  };

  const Icon = BUSINESS_TYPE_ICONS[selectedBusinessType];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Ledger Settings</h1>
            <p className="text-sm text-slate-500">
              Configure enabled ledgers and columns per business type
            </p>
          </div>
        </div>
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Changes
          </button>
        )}
      </div>

      {/* Business Type Selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-medium text-slate-700 mb-3">Business Type</p>
        <div className="flex flex-wrap gap-2">
          {BUSINESS_TYPES.map(bt => {
            const BtIcon = BUSINESS_TYPE_ICONS[bt.key];
            const isSelected = selectedBusinessType === bt.key;
            return (
              <button
                key={bt.key}
                onClick={() => setSelectedBusinessType(bt.key)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                  ${isSelected
                    ? 'bg-amber-50 text-amber-700 border-2 border-amber-300'
                    : 'bg-slate-50 text-slate-600 border-2 border-transparent hover:bg-slate-100'
                  }
                `}
              >
                <BtIcon className="w-4 h-4" />
                {bt.label}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      ) : (
        <>
          {/* Enabled Ledgers */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-700 mb-3">Enabled Ledgers</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {LEDGER_INFO.map(ledger => {
                const LedgerIcon = ledger.icon;
                const isEnabled = enabledLedgers.includes(ledger.id);
                return (
                  <button
                    key={ledger.id}
                    onClick={() => toggleLedger(ledger.id)}
                    className={`
                      flex items-center gap-3 p-3 rounded-lg border-2 transition-all
                      ${isEnabled
                        ? 'bg-green-50 border-green-300 text-green-700'
                        : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
                      }
                    `}
                  >
                    <div className={`p-2 rounded-lg ${isEnabled ? 'bg-green-100' : 'bg-slate-100'}`}>
                      <LedgerIcon className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium flex-1 text-left">{ledger.label}</span>
                    {isEnabled ? (
                      <Check className="w-5 h-5 text-green-600" />
                    ) : (
                      <X className="w-5 h-5 text-slate-400" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Column Configuration */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <p className="text-sm font-medium text-slate-700">Column Configuration</p>
              <p className="text-xs text-slate-500 mt-1">
                Edit the display name (label) for each column. The key is fixed — it tells the app which data to show. Toggle visibility or add custom columns.
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              {LEDGER_INFO.filter(l => enabledLedgers.includes(l.id)).map(ledger => {
                const LedgerIcon = ledger.icon;
                const isExpanded = expandedLedger === ledger.id;
                const ledgerColumns = columns[ledger.id] || [];

                return (
                  <div key={ledger.id}>
                    <button
                      onClick={() => setExpandedLedger(isExpanded ? null : ledger.id)}
                      className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors"
                    >
                      <LedgerIcon className="w-5 h-5 text-slate-500" />
                      <span className="font-medium text-slate-700 flex-1 text-left">{ledger.label}</span>
                      <span className="text-sm text-slate-400">
                        {ledgerColumns.filter(c => c.visible).length} / {ledgerColumns.length} columns
                      </span>
                      <div className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                        <ArrowLeft className="w-4 h-4 text-slate-400 rotate-180" />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 bg-slate-50">
                        <div className="space-y-2">
                          {ledgerColumns.map(col => (
                            <div
                              key={col.key}
                              className="flex items-center gap-3 p-2 bg-white rounded-lg border border-slate-200"
                            >
                              <GripVertical className="w-4 h-4 text-slate-300 shrink-0" />
                              <div className="flex-1 min-w-0 space-y-1">
                                <input
                                  type="text"
                                  value={col.label}
                                  onChange={e => updateColumnLabel(ledger.id, col.key, e.target.value)}
                                  className="w-full text-sm text-slate-800 border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-300"
                                  aria-label={`Label for column ${col.key}`}
                                />
                                <span className="block text-[11px] font-mono text-slate-400 truncate" title="Internal key used by the app for this column">
                                  key: {col.key}
                                </span>
                              </div>
                              {col.custom && (
                                <button
                                  onClick={() => removeCustomColumn(ledger.id, col.key)}
                                  className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => toggleColumnVisibility(ledger.id, col.key)}
                                className={`
                                  p-1.5 rounded-lg transition-colors
                                  ${col.visible
                                    ? 'bg-green-100 text-green-600'
                                    : 'bg-slate-100 text-slate-400'
                                  }
                                `}
                              >
                                {col.visible ? (
                                  <Check className="w-4 h-4" />
                                ) : (
                                  <X className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          ))}

                          {/* Add Custom Column */}
                          {addingToLedger === ledger.id ? (
                            <div className="flex items-center gap-2 p-2 bg-white rounded-lg border-2 border-amber-300">
                              <input
                                type="text"
                                value={newColumnName}
                                onChange={e => setNewColumnName(e.target.value)}
                                placeholder="Column name"
                                className="flex-1 text-sm border-0 focus:ring-0 p-0"
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Enter') addCustomColumn(ledger.id);
                                  if (e.key === 'Escape') setAddingToLedger(null);
                                }}
                              />
                              <button
                                onClick={() => addCustomColumn(ledger.id)}
                                className="p-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setAddingToLedger(null)}
                                className="p-1.5 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setAddingToLedger(ledger.id)}
                              className="w-full flex items-center justify-center gap-2 p-2 text-sm text-slate-500 border-2 border-dashed border-slate-200 rounded-lg hover:border-amber-300 hover:text-amber-600 transition-colors"
                            >
                              <Plus className="w-4 h-4" />
                              Add Custom Column
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {enabledLedgers.length === 0 && (
              <div className="p-8 text-center">
                <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No ledgers enabled. Enable at least one ledger above.</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Success/Error Messages */}
      {saveMutation.isSuccess && (
        <div className="fixed bottom-4 right-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
          <Check className="w-5 h-5" />
          Settings saved successfully
        </div>
      )}
      {saveMutation.isError && (
        <div className="fixed bottom-4 right-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          Failed to save settings
        </div>
      )}
    </div>
  );
}
