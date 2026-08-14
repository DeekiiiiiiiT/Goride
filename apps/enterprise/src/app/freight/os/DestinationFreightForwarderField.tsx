/** Destination picker: connected partner FFs + own warehouse (if turned on). */

export type DestinationWarehouse = {
  id?: unknown;
  name?: unknown;
  code?: unknown;
  address_line?: unknown;
  city?: unknown;
  country_code?: unknown;
  organization_id?: unknown;
  source?: unknown;
  partner_name?: unknown;
};

const fieldClass =
  'mt-1 w-full min-h-11 rounded-lg border border-slate-300 px-3 py-3 text-sm';

export function destinationLabel(f: DestinationWarehouse): string {
  const name = String(f.partner_name || f.name || 'Freight forwarder');
  const code = f.code ? ` (${String(f.code)})` : '';
  const own = String(f.source) === 'own' ? ' · your warehouse' : '';
  return `${name}${code}${own}`;
}

export function DestinationFreightForwarderField({
  value,
  onChange,
  warehouses,
  required,
}: {
  /** Facility UUID, or `external` for unassigned handoff. */
  value: string;
  onChange: (next: string) => void;
  warehouses: DestinationWarehouse[];
  required?: boolean;
}) {
  return (
    <fieldset className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Destination freight forwarder
      </legend>
      <select
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={fieldClass}
      >
        <option value="">
          {warehouses.length === 1 ? 'Use connected freight forwarder' : 'Select freight forwarder…'}
        </option>
        {warehouses.map((f) => (
          <option key={String(f.id)} value={String(f.id)}>
            {destinationLabel(f)}
          </option>
        ))}
        <option value="external">Someone else’s freight forwarder</option>
      </select>
      {value === 'external' ? (
        <p className="mt-2 text-xs text-slate-600">
          Order stays unassigned. Export from Expected if you hand off outside.
        </p>
      ) : null}
      {!warehouses.length ? (
        <p className="mt-2 text-xs text-amber-800">
          No connected freight forwarder yet — add one under Setup → Connect freight forwarders, or
          pick Someone else’s.
        </p>
      ) : null}
    </fieldset>
  );
}

export function resolveIntendedFacilityId(value: string): string | null {
  if (!value || value === 'external') return null;
  return value;
}
