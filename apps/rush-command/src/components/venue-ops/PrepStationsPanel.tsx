import { useState } from 'react';
import type { Merchant } from '../../hooks/useMerchant';
import { usePrepStations } from '../../hooks/usePrepStations';
import type { PrepStationKind } from '../../lib/venue-ops-presets';
import { MaterialIcon } from '../../signup/components/MaterialIcon';

const KIND_OPTIONS: { value: PrepStationKind; label: string }[] = [
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'bar', label: 'Bar' },
  { value: 'other', label: 'Other' },
];

const fieldClass =
  'h-10 w-full rounded-lg border border-outline-variant bg-surface px-inset-sm text-body-sm text-on-surface partner-field';

interface PrepStationsPanelProps {
  merchantId: string;
  merchant?: Merchant | null;
}

export default function PrepStationsPanel({ merchantId, merchant }: PrepStationsPanelProps) {
  const {
    prepStations,
    useApi,
    isLoading,
    createPrepStation,
    updatePrepStation,
    deletePrepStation,
    isSaving,
  } = usePrepStations(merchantId, merchant);

  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<PrepStationKind>('kitchen');

  const handleAdd = () => {
    const name = newName.trim();
    if (!name || isSaving) return;
    createPrepStation(name, newKind);
    setNewName('');
    setNewKind('kitchen');
  };

  return (
    <section className="space-y-inset-md rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm">
      <div>
        <h3 className="text-title-md font-semibold text-on-background">Prep stations</h3>
        <p className="mt-inset-xs text-body-sm text-on-surface-variant">
          Label stations as Kitchen, Bar, or Other so bar and kitchen queues route correctly.
        </p>
      </div>

      {!useApi && (
        <p className="rounded-lg border border-outline-variant bg-surface-container-low px-inset-md py-inset-sm text-body-sm text-on-surface-variant">
          Preview only — in-store operations is not enabled for this store, so prep station changes
          will not save.
        </p>
      )}

      {isLoading ? (
        <p className="text-body-sm text-on-surface-variant">Loading stations…</p>
      ) : (
        <ul className="divide-y divide-outline-variant overflow-hidden rounded-lg border border-outline-variant">
          {prepStations.length === 0 ? (
            <li className="px-inset-sm py-inset-md text-body-sm text-on-surface-variant">
              No prep stations yet. Add one below.
            </li>
          ) : (
            prepStations.map((station) => (
              <li
                key={station.id}
                className="flex flex-col gap-inset-sm p-inset-sm sm:flex-row sm:items-center"
              >
                <input
                  type="text"
                  className={`${fieldClass} sm:flex-1`}
                  defaultValue={station.name}
                  disabled={!useApi || isSaving}
                  aria-label={`Name for ${station.name}`}
                  onBlur={(event) => {
                    const next = event.target.value.trim();
                    if (!next || next === station.name) return;
                    updatePrepStation(station.id, { name: next });
                  }}
                />
                <select
                  className={`${fieldClass} sm:w-36`}
                  value={station.kind ?? 'kitchen'}
                  disabled={!useApi || isSaving}
                  aria-label={`Kind for ${station.name}`}
                  onChange={(event) => {
                    const kind = event.target.value as PrepStationKind;
                    updatePrepStation(station.id, { kind });
                  }}
                >
                  {KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!useApi || isSaving}
                  onClick={() => {
                    if (!window.confirm(`Remove prep station “${station.name}”?`)) return;
                    deletePrepStation(station.id);
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-error transition-colors hover:bg-error-container/20 disabled:opacity-50"
                  aria-label={`Delete ${station.name}`}
                >
                  <MaterialIcon name="delete" size={20} />
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      <div className="flex flex-col gap-inset-sm border-t border-outline-variant pt-inset-md sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1">
          <label className="text-label-md text-on-surface-variant" htmlFor="prep-station-name">
            New station
          </label>
          <input
            id="prep-station-name"
            type="text"
            className={fieldClass}
            placeholder="e.g. Fountain"
            value={newName}
            disabled={!useApi || isSaving}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleAdd();
              }
            }}
          />
        </div>
        <div className="space-y-1 sm:w-36">
          <label className="text-label-md text-on-surface-variant" htmlFor="prep-station-kind">
            Kind
          </label>
          <select
            id="prep-station-kind"
            className={fieldClass}
            value={newKind}
            disabled={!useApi || isSaving}
            onChange={(event) => setNewKind(event.target.value as PrepStationKind)}
          >
            {KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!useApi || isSaving || !newName.trim()}
          className="flex h-10 items-center justify-center gap-1 rounded-lg bg-primary-container px-inset-md text-label-md font-semibold text-on-primary-container disabled:opacity-50"
        >
          <MaterialIcon name="add" size={18} />
          Add
        </button>
      </div>
    </section>
  );
}
