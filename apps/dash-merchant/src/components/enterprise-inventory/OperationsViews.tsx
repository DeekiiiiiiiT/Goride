import { useState } from 'react';
import { formatJmd } from '../../lib/partner-utils';
import type {
  InventoryTransfer,
  LedgerEntry,
  LocationHierarchyNode,
  PhysicalCount,
  PurchaseOrder,
  RecipeV2,
  VarianceRow,
  Vendor,
  VendorCatalogEntry,
  ReceivingLineInput,
} from '../../types/enterprise-inventory';
import StatusChip from './StatusChip';

const PO_TONE: Record<PurchaseOrder['status'], 'neutral' | 'success' | 'warning' | 'error' | 'info'> = {
  draft: 'neutral',
  open: 'info',
  partial: 'warning',
  closed: 'success',
  cancelled: 'error',
};

export function VendorDirectoryView({
  vendors,
  onOpenCatalog,
  onBack,
}: {
  vendors: Vendor[];
  onOpenCatalog: (vendorId: string) => void;
  onBack?: () => void;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-inset-md p-margin-mobile md:p-margin-tablet">
      {onBack && (
        <button type="button" onClick={onBack} className="text-label-md text-primary-container">← Back</button>
      )}
      <h2 className="text-title-md font-semibold">Vendors</h2>
      <ul className="space-y-inset-sm">
        {vendors.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              onClick={() => onOpenCatalog(v.id)}
              className="flex w-full items-center justify-between rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md text-left hover:bg-surface-container-low"
            >
              <div>
                <p className="font-semibold">{v.name}</p>
                <p className="text-label-sm text-on-surface-variant">{v.contactEmail ?? v.contactPhone ?? 'No contact'}</p>
              </div>
              <StatusChip label={v.isActive ? 'Active' : 'Inactive'} tone={v.isActive ? 'success' : 'neutral'} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function VendorCatalogView({
  entries,
  vendorName,
  onBack,
}: {
  entries: VendorCatalogEntry[];
  vendorName: string;
  onBack: () => void;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-inset-md p-margin-mobile md:p-margin-tablet">
      <button type="button" onClick={onBack} className="text-label-md text-primary-container">← Back to vendors</button>
      <h2 className="text-title-md font-semibold">{vendorName} catalog</h2>
      <div className="overflow-hidden rounded-xl border border-outline-variant">
        <table className="w-full text-body-sm">
          <thead className="bg-surface-container-low text-label-sm text-on-surface-variant">
            <tr>
              <th className="px-inset-md py-2 text-left">Item</th>
              <th className="px-inset-md py-2 text-left">Vendor SKU</th>
              <th className="px-inset-md py-2 text-left">Pack</th>
              <th className="px-inset-md py-2 text-right">Price</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-outline-variant">
                <td className="px-inset-md py-2">{e.itemName}</td>
                <td className="px-inset-md py-2">{e.vendorSku}</td>
                <td className="px-inset-md py-2">{e.packSize} {e.packUomCode}</td>
                <td className="px-inset-md py-2 text-right">{formatJmd(e.currentPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PurchaseOrdersListView({
  orders,
  onSelect,
  onStartReceive,
  onBack,
}: {
  orders: PurchaseOrder[];
  onSelect: (id: string) => void;
  onStartReceive: (id: string) => void;
  onBack?: () => void;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-inset-md p-margin-mobile md:p-margin-tablet">
      {onBack && (
        <button type="button" onClick={onBack} className="text-label-md text-primary-container">← Back</button>
      )}
      <h2 className="text-title-md font-semibold">Purchase orders</h2>
      <ul className="space-y-inset-sm">
        {orders.map((po) => (
          <li key={po.id} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">PO #{po.id.replace('po-', '')} — {po.vendorName}</p>
                <p className="text-label-sm text-on-surface-variant">{po.lines.length} line(s)</p>
              </div>
              <StatusChip label={po.status} tone={PO_TONE[po.status]} />
            </div>
            <div className="mt-inset-sm flex gap-2">
              <button type="button" onClick={() => onSelect(po.id)} className="text-label-md text-primary-container">View</button>
              {(po.status === 'open' || po.status === 'partial') && (
                <button type="button" onClick={() => onStartReceive(po.id)} className="rounded-lg bg-primary-container px-3 py-1 text-label-md font-semibold text-on-primary-container">
                  Receive
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReceivingWorkflowView({
  po,
  onSubmit,
  onBack,
  useApi,
}: {
  po: PurchaseOrder;
  onSubmit: (lines: ReceivingLineInput[]) => Promise<void>;
  onBack: () => void;
  useApi?: boolean;
}) {
  const [lines, setLines] = useState<ReceivingLineInput[]>(
    po.lines.map((l) => ({ poLineId: l.id, qtyReceived: l.qtyOrdered, uomCode: l.uomCode })),
  );
  const [saving, setSaving] = useState(false);

  return (
    <div className="mx-auto max-w-3xl space-y-inset-lg p-margin-mobile md:p-margin-tablet">
      <button type="button" onClick={onBack} className="text-label-md text-primary-container">← Back</button>
      <h2 className="text-title-md font-semibold">Receive — {po.vendorName}</h2>
      <ol className="space-y-inset-md">
        {po.lines.map((line, idx) => (
          <li key={line.id} className="rounded-xl border border-outline-variant p-inset-md">
            <p className="font-semibold">{line.itemName}</p>
            <p className="text-label-sm text-on-surface-variant">Ordered: {line.qtyOrdered} {line.uomCode}</p>
            <input
              type="number"
              min={0}
              value={lines[idx]?.qtyReceived ?? 0}
              onChange={(e) => {
                const next = [...lines];
                next[idx] = { ...next[idx], qtyReceived: Number(e.target.value) };
                setLines(next);
              }}
              className="mt-2 w-full rounded-lg border border-outline-variant px-3 py-2 text-body-sm sm:w-32"
            />
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={!useApi || saving}
        onClick={async () => {
          setSaving(true);
          try {
            await onSubmit(lines);
          } finally {
            setSaving(false);
          }
        }}
        className="w-full rounded-lg bg-primary-container py-3 text-label-md font-semibold text-on-primary-container disabled:opacity-50 sm:w-auto sm:px-8"
      >
        {saving ? 'Posting…' : 'Confirm receipt'}
      </button>
    </div>
  );
}

export function TransferListView({
  transfers,
  onReceive,
  onBack,
}: {
  transfers: InventoryTransfer[];
  onReceive: (id: string) => void;
  onBack?: () => void;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-inset-md p-margin-mobile md:p-margin-tablet">
      {onBack && (
        <button type="button" onClick={onBack} className="text-label-md text-primary-container">← Back</button>
      )}
      <h2 className="text-title-md font-semibold">Transfers</h2>
      <ul className="space-y-inset-sm">
        {transfers.map((t) => (
          <li key={t.id} className="rounded-xl border border-outline-variant p-inset-md">
            <p className="font-semibold">{t.fromNodeName} → {t.toNodeName}</p>
            <StatusChip label={t.status.replace('_', ' ')} tone={t.status === 'in_transit' ? 'warning' : 'success'} />
            {t.status === 'in_transit' && (
              <button type="button" onClick={() => onReceive(t.id)} className="mt-2 text-label-md font-semibold text-primary-container">
                Receive at destination
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BlindCountView({
  count,
  onSubmitItem,
  onBack,
  useApi,
}: {
  count: PhysicalCount;
  onSubmitItem: (itemId: string, qty: number, uomCode: string) => Promise<void>;
  onBack: () => void;
  useApi?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  return (
    <div className="mx-auto max-w-lg space-y-inset-md p-margin-mobile">
      <button type="button" onClick={onBack} className="text-label-md text-primary-container">← Back</button>
      <h2 className="text-title-md font-semibold">Blind count</h2>
      <p className="text-body-sm text-on-surface-variant">Enter what you see — expected quantities are hidden.</p>
      <ul className="space-y-inset-sm">
        {count.items.map((item) => (
          <li key={item.id} className="rounded-xl border border-outline-variant p-inset-md">
            <p className="font-semibold">{item.itemName}</p>
            <div className="mt-2 flex gap-2">
              <input
                type="number"
                placeholder="Count"
                value={values[item.itemId] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [item.itemId]: e.target.value }))}
                className="flex-1 rounded-lg border border-outline-variant px-3 py-2"
              />
              <button
                type="button"
                disabled={!useApi}
                onClick={() => void onSubmitItem(item.itemId, Number(values[item.itemId] ?? 0), 'each')}
                className="rounded-lg bg-primary-container px-3 py-2 text-label-sm font-semibold text-on-primary-container disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function VarianceReportView({
  rows,
  onBack,
}: {
  rows: VarianceRow[];
  onBack?: () => void;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-inset-md p-margin-mobile md:p-margin-tablet">
      {onBack && (
        <button type="button" onClick={onBack} className="text-label-md text-primary-container">← Back</button>
      )}
      <h2 className="text-title-md font-semibold">Variance report</h2>
      <div className="overflow-x-auto rounded-xl border border-outline-variant">
        <table className="min-w-full text-body-sm">
          <thead className="bg-surface-container-low text-label-sm text-on-surface-variant">
            <tr>
              <th className="px-2 py-2 text-left">Item</th>
              <th className="px-2 py-2 text-right">Expected</th>
              <th className="px-2 py-2 text-right">Actual</th>
              <th className="px-2 py-2 text-right">Variance</th>
              <th className="px-2 py-2 text-right">$</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.itemId} className="border-t border-outline-variant">
                <td className="px-2 py-2">{r.itemName}</td>
                <td className="px-2 py-2 text-right">{r.theoreticalEndingBase}</td>
                <td className="px-2 py-2 text-right">{r.actualCountBase ?? '—'}</td>
                <td className={`px-2 py-2 text-right ${r.varianceQtyBase < 0 ? 'text-error' : ''}`}>{r.varianceQtyBase}</td>
                <td className="px-2 py-2 text-right">{formatJmd(r.varianceCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function LocationHierarchyView({
  tree,
  onBack,
}: {
  tree: LocationHierarchyNode[];
  onBack?: () => void;
}) {
  const renderNode = (node: LocationHierarchyNode, depth = 0) => (
    <li key={node.id} className="py-1" style={{ paddingLeft: depth * 16 }}>
      <span className="font-medium">{node.name}</span>
      <span className="ml-2 text-label-sm capitalize text-on-surface-variant">{node.kind}{node.nodeType ? ` · ${node.nodeType}` : ''}</span>
      {node.children?.length ? <ul>{node.children.map((c) => renderNode(c, depth + 1))}</ul> : null}
    </li>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-inset-md p-margin-mobile md:p-margin-tablet">
      {onBack && (
        <button type="button" onClick={onBack} className="text-label-md text-primary-container">← Back</button>
      )}
      <h2 className="text-title-md font-semibold">Location hierarchy</h2>
      <ul className="rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md">{tree.map((n) => renderNode(n))}</ul>
    </div>
  );
}

export function LedgerAuditView({
  entries,
  onBack,
}: {
  entries: LedgerEntry[];
  onBack?: () => void;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-inset-md p-margin-mobile md:p-margin-tablet">
      {onBack && (
        <button type="button" onClick={onBack} className="text-label-md text-primary-container">← Back</button>
      )}
      <h2 className="text-title-md font-semibold">Ledger audit trail</h2>
      <ul className="space-y-inset-xs">
        {entries.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-outline-variant px-inset-md py-2 text-body-sm">
            <span className="font-medium">{e.itemName}</span>
            <StatusChip label={e.transactionType.replace('_', ' ')} tone="info" />
            <span className={e.quantityBase < 0 ? 'text-error' : 'text-success'}>
              {e.quantityBase > 0 ? '+' : ''}{e.quantityBase} {e.uomCode}
            </span>
            <span className="text-label-sm text-on-surface-variant">{new Date(e.createdAt).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RecipeEditorV2View({
  recipes,
  menuItems,
  onBack,
  onSave,
  useApi,
}: {
  recipes: RecipeV2[];
  menuItems: Array<{ id: string; name: string }>;
  onBack?: () => void;
  onSave?: (menuItemId: string, recipe: RecipeV2) => Promise<void>;
  useApi?: boolean;
}) {
  const [selected, setSelected] = useState(recipes[0]?.menuItemId ?? menuItems[0]?.id ?? '');
  const recipe = recipes.find((r) => r.menuItemId === selected) ?? recipes[0];

  return (
    <div className="mx-auto max-w-3xl space-y-inset-md p-margin-mobile md:p-margin-tablet">
      {onBack && (
        <button type="button" onClick={onBack} className="text-label-md text-primary-container">← Back</button>
      )}
      <h2 className="text-title-md font-semibold">Recipes (yield %)</h2>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="w-full rounded-lg border border-outline-variant px-3 py-2 text-body-sm"
      >
        {menuItems.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
      {recipe && (
        <div className="rounded-xl border border-outline-variant p-inset-md">
          <p className="text-label-sm text-on-surface-variant">Recipe yield: {recipe.yieldPct}%</p>
          <ul className="mt-inset-sm space-y-2">
            {recipe.ingredients.map((ing) => (
              <li key={ing.id} className="flex justify-between text-body-sm">
                <span>{ing.itemName}</span>
                <span>{ing.qtyRequired} {ing.uomCode} · yield {ing.yieldPct}%</span>
              </li>
            ))}
          </ul>
          {onSave && (
            <button
              type="button"
              disabled={!useApi}
              onClick={() => void onSave(recipe.menuItemId, recipe)}
              className="mt-inset-md rounded-lg bg-primary-container px-4 py-2 text-label-md font-semibold text-on-primary-container disabled:opacity-50"
            >
              Save recipe
            </button>
          )}
        </div>
      )}
    </div>
  );
}
