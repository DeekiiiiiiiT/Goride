import { Sheet, SheetContent, SheetTrigger } from '../../ui/sheet';
import type { TripAnalyticsState, AnalyticsPreset, HeatMeasure } from './tripAnalyticsModel';

const PRESETS: { id: AnalyticsPreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'month', label: 'This month' },
  { id: 'custom', label: 'Custom' },
];

type Option = { id: string; label: string };

export function TripAnalyticsToolbar({
  state,
  drivers,
  vehicles,
  zones,
  onChange,
}: {
  state: TripAnalyticsState;
  drivers: Option[];
  vehicles: Option[];
  zones: string[];
  onChange: (next: TripAnalyticsState) => void;
}) {
  const set = (patch: Partial<TripAnalyticsState>) => onChange({ ...state, ...patch });
  return (
    <div className="sticky top-0 z-20 space-y-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`min-h-11 rounded-lg px-3 text-sm font-medium ${state.preset === preset.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}
            onClick={() => set({ preset: preset.id })}
          >
            {preset.label}
          </button>
        ))}
        <label className="ml-auto flex min-h-11 items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={state.compare}
            onChange={(e) => set({ compare: e.target.checked })}
          />
          Compare to previous period
        </label>
      </div>
      {state.preset === 'custom' ? (
        <div className="flex flex-wrap gap-2">
          <input className="min-h-11 rounded-lg border px-3" type="date" value={state.from} onChange={(e) => set({ from: e.target.value })} />
          <input className="min-h-11 rounded-lg border px-3" type="date" value={state.to} onChange={(e) => set({ to: e.target.value })} />
        </div>
      ) : null}
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger className="min-h-11 w-full rounded-lg bg-slate-100 text-sm font-medium">Filters</SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
            <FilterFields state={state} drivers={drivers} vehicles={vehicles} zones={zones} set={set} />
          </SheetContent>
        </Sheet>
      </div>
      <div className="hidden md:block">
        <FilterFields state={state} drivers={drivers} vehicles={vehicles} zones={zones} set={set} />
      </div>
      {(state.hour != null || state.dow != null) ? (
        <button
          type="button"
          className="min-h-11 rounded-full bg-indigo-50 px-3 text-sm text-indigo-800"
          onClick={() => set({ hour: null, dow: null })}
        >
          {state.dow != null ? `Day ${state.dow}` : ''}{state.hour != null ? ` Hour ${state.hour}:00` : ''} ×
        </button>
      ) : null}
    </div>
  );
}

export function measureLabel(measure: HeatMeasure): string {
  if (measure === 'cancelled') return 'Cancellations';
  if (measure === 'surge_share') return 'Surge share';
  if (measure === 'fare_per_km') return 'Fare per km';
  return 'Trips';
}

function FilterFields({
  state,
  drivers,
  vehicles,
  zones,
  set,
}: {
  state: TripAnalyticsState;
  drivers: Option[];
  vehicles: Option[];
  zones: string[];
  set: (patch: Partial<TripAnalyticsState>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
      <select className="min-h-11 rounded-lg border px-2 text-sm" value={state.platforms[0] || ''} onChange={(e) => set({ platforms: e.target.value ? [e.target.value] : [] })}>
        <option value="">All platforms</option>
        <option>Uber</option>
        <option>InDrive</option>
        <option>Roam</option>
      </select>
      <select className="min-h-11 rounded-lg border px-2 text-sm" value={state.driverId} onChange={(e) => set({ driverId: e.target.value })}>
        <option value="">All drivers</option>
        {drivers.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
      </select>
      <select className="min-h-11 rounded-lg border px-2 text-sm" value={state.vehicleId} onChange={(e) => set({ vehicleId: e.target.value })}>
        <option value="">All vehicles</option>
        {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
      </select>
      <select className="min-h-11 rounded-lg border px-2 text-sm" value={state.status} onChange={(e) => set({ status: e.target.value })}>
        <option value="">All statuses</option>
        <option value="completed">Completed</option>
        <option value="cancelled">Cancelled</option>
        <option value="in_progress">In progress</option>
      </select>
      <select className="min-h-11 rounded-lg border px-2 text-sm" value={state.payment} onChange={(e) => set({ payment: e.target.value })}>
        <option value="">All payments</option>
        <option value="cash">Cash</option>
        <option value="digital">Digital</option>
      </select>
      <select className="min-h-11 rounded-lg border px-2 text-sm" value={state.zone} onChange={(e) => set({ zone: e.target.value })}>
        <option value="">All zones</option>
        {zones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
      </select>
      <select className="min-h-11 rounded-lg border px-2 text-sm" value={state.tripType} onChange={(e) => set({ tripType: e.target.value })}>
        <option value="">Platform and manual</option>
        <option value="platform">Platform</option>
        <option value="manual">Manual</option>
      </select>
    </div>
  );
}
