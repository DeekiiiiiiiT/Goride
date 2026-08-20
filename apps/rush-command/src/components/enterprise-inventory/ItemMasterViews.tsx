import { useMemo, useState } from 'react';
import type { ItemMaster, StorageZone } from '../../types/enterprise-inventory';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import StatusChip from './StatusChip';

interface ItemMasterListViewProps {
  items: ItemMaster[];
  onSelect: (itemId: string) => void;
  onBack?: () => void;
}

export function ItemMasterListView({ items, onSelect, onBack }: ItemMasterListViewProps) {
  const [query, setQuery] = useState('');
  const [zone, setZone] = useState<StorageZone | 'all'>('all');

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchesQuery =
        !query ||
        item.name.toLowerCase().includes(query.toLowerCase()) ||
        item.sku?.toLowerCase().includes(query.toLowerCase());
      const matchesZone = zone === 'all' || item.storageZone === zone;
      return matchesQuery && matchesZone && item.isActive;
    });
  }, [items, query, zone]);

  return (
    <div className="mx-auto max-w-5xl space-y-inset-md p-margin-mobile md:p-margin-tablet">
      {onBack && (
        <button type="button" onClick={onBack} className="text-label-md text-primary-container">
          ← Back to overview
        </button>
      )}
      <div className="flex flex-col gap-inset-sm sm:flex-row sm:items-center">
        <input
          type="search"
          placeholder="Search name or SKU…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-sm"
        />
        <select
          value={zone}
          onChange={(e) => setZone(e.target.value as StorageZone | 'all')}
          className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-sm"
        >
          <option value="all">All zones</option>
          <option value="walk_in">Walk-in</option>
          <option value="dry">Dry</option>
          <option value="freezer">Freezer</option>
          <option value="ambient">Ambient</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant">
        <table className="w-full text-left text-body-sm">
          <thead className="bg-surface-container-low text-label-sm text-on-surface-variant">
            <tr>
              <th className="px-inset-md py-2">Item</th>
              <th className="hidden px-inset-md py-2 sm:table-cell">Zone</th>
              <th className="px-inset-md py-2">On hand</th>
              <th className="hidden px-inset-md py-2 md:table-cell">Reorder</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const low = item.quantityOnHandBase <= item.reorderLevelBase;
              return (
                <tr
                  key={item.id}
                  className="cursor-pointer border-t border-outline-variant hover:bg-surface-container-low"
                  onClick={() => onSelect(item.id)}
                >
                  <td className="px-inset-md py-3">
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-label-sm text-on-surface-variant">{item.sku ?? '—'}</p>
                  </td>
                  <td className="hidden px-inset-md py-3 capitalize sm:table-cell">
                    {item.storageZone?.replace('_', ' ') ?? '—'}
                  </td>
                  <td className="px-inset-md py-3">
                    <span className={low ? 'font-semibold text-error' : ''}>
                      {item.quantityOnHandBase} {item.baseUomCode}
                    </span>
                    {low && <StatusChip label="Low" tone="error" />}
                  </td>
                  <td className="hidden px-inset-md py-3 md:table-cell">
                    {item.reorderLevelBase} {item.baseUomCode}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="p-inset-md text-center text-body-sm text-on-surface-variant">No items match your filters.</p>
        )}
      </div>
    </div>
  );
}

interface ItemMasterDetailViewProps {
  item: ItemMaster;
  onBack: () => void;
  onOpenUom: () => void;
  onAdjust?: (delta: number, reason: string) => Promise<void>;
  useApi?: boolean;
}

export function ItemMasterDetailView({ item, onBack, onOpenUom, onAdjust, useApi }: ItemMasterDetailViewProps) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('manual_adjustment');
  const [saving, setSaving] = useState(false);

  const handleAdjust = async () => {
    const value = Number(delta);
    if (!value || !onAdjust) return;
    setSaving(true);
    try {
      await onAdjust(value, reason);
      setDelta('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-inset-lg p-margin-mobile md:p-margin-tablet">
      <button type="button" onClick={onBack} className="text-label-md text-primary-container">
        ← Back to items
      </button>
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md">
        <h2 className="text-title-lg font-semibold">{item.name}</h2>
        <dl className="mt-inset-md grid gap-inset-sm text-body-sm sm:grid-cols-2">
          <div><dt className="text-on-surface-variant">SKU</dt><dd className="font-medium">{item.sku ?? '—'}</dd></div>
          <div><dt className="text-on-surface-variant">UPC</dt><dd className="font-medium">{item.upc ?? '—'}</dd></div>
          <div><dt className="text-on-surface-variant">Zone</dt><dd className="font-medium capitalize">{item.storageZone?.replace('_', ' ') ?? '—'}</dd></div>
          <div><dt className="text-on-surface-variant">On hand</dt><dd className="font-medium">{item.quantityOnHandBase} {item.baseUomCode}</dd></div>
        </dl>
        <div className="mt-inset-md flex flex-wrap gap-2">
          <StatusChip label={`Buy: ${item.purchaseUomCode}`} tone="info" />
          <StatusChip label={`Store: ${item.storageUomCode}`} tone="info" />
          <StatusChip label={`Recipe: ${item.recipeUomCode}`} tone="info" />
        </div>
        <button
          type="button"
          onClick={onOpenUom}
          className="mt-inset-md flex items-center gap-1 text-label-md font-semibold text-primary-container"
        >
          <MaterialIcon name="straighten" className="text-[18px]" />
          Edit UOM conversions
        </button>
      </div>

      {onAdjust && (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md">
          <h3 className="text-title-md font-semibold">Manual adjustment</h3>
          <p className="mt-1 text-body-sm text-on-surface-variant">Writes to immutable ledger (base units).</p>
          <div className="mt-inset-md flex flex-col gap-inset-sm sm:flex-row">
            <input
              type="number"
              placeholder="± quantity (base)"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              disabled={!useApi}
              className="flex-1 rounded-lg border border-outline-variant px-3 py-2 text-body-sm disabled:opacity-50"
            />
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-lg border border-outline-variant px-3 py-2 text-body-sm"
            >
              <option value="manual_adjustment">Manual adjustment</option>
              <option value="waste">Waste</option>
            </select>
            <button
              type="button"
              onClick={() => void handleAdjust()}
              disabled={!useApi || saving}
              className="rounded-lg bg-primary-container px-4 py-2 text-label-md font-semibold text-on-primary-container disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Apply'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface UomConversionEditorViewProps {
  item: ItemMaster;
  onBack: () => void;
  onSave?: (conversions: ItemMaster['conversions']) => Promise<void>;
  useApi?: boolean;
}

export function UomConversionEditorView({ item, onBack, onSave, useApi }: UomConversionEditorViewProps) {
  const defaultCodes = useMemo(
    () =>
      Array.from(
        new Set(
          [
            item.purchaseUomCode,
            item.storageUomCode,
            item.recipeUomCode,
            item.baseUomCode,
            ...item.conversions.flatMap((c) => [c.fromUomCode, c.toUomCode]),
          ].filter(Boolean),
        ),
      ),
    [item],
  );

  const [rows, setRows] = useState(() =>
    item.conversions.map((c) => ({
      ...c,
      localId: c.id,
    })),
  );
  const [saving, setSaving] = useState(false);

  const updateRow = (
    localId: string,
    patch: Partial<{ fromUomCode: string; toUomCode: string; factor: number }>,
  ) => {
    setRows((current) =>
      current.map((row) => (row.localId === localId ? { ...row, ...patch } : row)),
    );
  };

  const addRow = () => {
    const from = defaultCodes[0] ?? 'each';
    const to = defaultCodes[1] ?? defaultCodes[0] ?? 'each';
    setRows((current) => [
      ...current,
      {
        id: '',
        localId: `new-${Date.now()}`,
        fromUomId: '',
        toUomId: '',
        fromUomCode: from,
        toUomCode: to,
        factor: 1,
      },
    ]);
  };

  const removeRow = (localId: string) => {
    setRows((current) => current.filter((row) => row.localId !== localId));
  };

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(
        rows.map((row) => ({
          id: row.id || row.localId,
          fromUomId: row.fromUomId,
          toUomId: row.toUomId,
          fromUomCode: row.fromUomCode.trim(),
          toUomCode: row.toUomCode.trim(),
          factor: Number(row.factor) || 0,
        })),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-inset-md p-margin-mobile md:p-margin-tablet">
      <button type="button" onClick={onBack} className="text-label-md text-primary-container">
        ← Back to item
      </button>
      <h2 className="text-title-md font-semibold">UOM chain — {item.name}</h2>
      <p className="text-body-sm text-on-surface-variant">
        Purchase ({item.purchaseUomCode}) → Storage ({item.storageUomCode}) → Recipe ({item.recipeUomCode}) → Base ({item.baseUomCode})
      </p>
      <ul className="space-y-inset-sm">
        {rows.map((c) => (
          <li
            key={c.localId}
            className="grid gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-inset-md py-3 sm:grid-cols-[1fr_auto_1fr_5rem_auto] sm:items-center"
          >
            <input
              value={c.fromUomCode}
              onChange={(e) => updateRow(c.localId, { fromUomCode: e.target.value })}
              list={`uom-codes-${item.id}`}
              className="rounded-lg border border-outline-variant px-2 py-2 text-body-sm"
              aria-label="From UOM"
            />
            <span className="text-center text-label-sm text-on-surface-variant">=</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step="any"
                value={c.factor}
                onChange={(e) => updateRow(c.localId, { factor: Number(e.target.value) || 0 })}
                className="w-24 rounded-lg border border-outline-variant px-2 py-2 text-body-sm"
                aria-label="Factor"
              />
              <input
                value={c.toUomCode}
                onChange={(e) => updateRow(c.localId, { toUomCode: e.target.value })}
                list={`uom-codes-${item.id}`}
                className="min-w-0 flex-1 rounded-lg border border-outline-variant px-2 py-2 text-body-sm"
                aria-label="To UOM"
              />
            </div>
            <span className="hidden text-label-sm text-on-surface-variant sm:inline">factor</span>
            <button
              type="button"
              onClick={() => removeRow(c.localId)}
              className="rounded-lg border border-outline-variant px-3 py-2 text-label-sm text-error"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <datalist id={`uom-codes-${item.id}`}>
        {defaultCodes.map((code) => (
          <option key={code} value={code} />
        ))}
      </datalist>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={addRow}
          className="rounded-lg border border-outline-variant px-4 py-2 text-label-md font-semibold"
        >
          Add conversion
        </button>
        {onSave && (
          <button
            type="button"
            disabled={!useApi || saving}
            onClick={() => void handleSave()}
            className="rounded-lg bg-primary-container px-4 py-2 text-label-md font-semibold text-on-primary-container disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save conversions'}
          </button>
        )}
      </div>
    </div>
  );
}

