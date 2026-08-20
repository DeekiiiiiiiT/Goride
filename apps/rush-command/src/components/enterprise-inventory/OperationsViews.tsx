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
  nodes,
  items,
  onReceive,
  onCreate,
  onBack,
  useApi,
}: {
  transfers: InventoryTransfer[];
  nodes?: Array<{ id: string; name: string }>;
  items?: Array<{ id: string; name: string; baseUomCode?: string }>;
  onReceive: (id: string) => void | Promise<void>;
  onCreate?: (input: {
    fromNodeId: string;
    toNodeId: string;
    itemId: string;
    qty: number;
    uomId: string;
  }) => Promise<void>;
  onBack?: () => void;
  useApi?: boolean;
}) {
  const [fromNodeId, setFromNodeId] = useState(nodes?.[0]?.id ?? '');
  const [toNodeId, setToNodeId] = useState(nodes?.[1]?.id ?? nodes?.[0]?.id ?? '');
  const [itemId, setItemId] = useState(items?.[0]?.id ?? '');
  const [qty, setQty] = useState('1');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!onCreate || !fromNodeId || !toNodeId || !itemId) return;
    setCreating(true);
    try {
      const selected = items?.find((i) => i.id === itemId);
      await onCreate({
        fromNodeId,
        toNodeId,
        itemId,
        qty: Number(qty) || 1,
        uomId: selected?.baseUomCode ?? 'each',
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-inset-md p-margin-mobile md:p-margin-tablet">
      {onBack && (
        <button type="button" onClick={onBack} className="text-label-md text-primary-container">← Back</button>
      )}
      <h2 className="text-title-md font-semibold">Transfers</h2>
      {onCreate && nodes && items && (
        <div className="rounded-xl border border-outline-variant p-inset-md space-y-inset-sm">
          <p className="text-label-md font-semibold">Create transfer</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <select value={fromNodeId} onChange={(e) => setFromNodeId(e.target.value)} className="rounded-lg border border-outline-variant px-3 py-2 text-body-sm">
              {nodes.map((n) => <option key={n.id} value={n.id}>From: {n.name}</option>)}
            </select>
            <select value={toNodeId} onChange={(e) => setToNodeId(e.target.value)} className="rounded-lg border border-outline-variant px-3 py-2 text-body-sm">
              {nodes.map((n) => <option key={n.id} value={n.id}>To: {n.name}</option>)}
            </select>
            <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="rounded-lg border border-outline-variant px-3 py-2 text-body-sm">
              {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <input type="number" min="0.01" step="any" value={qty} onChange={(e) => setQty(e.target.value)} className="rounded-lg border border-outline-variant px-3 py-2 text-body-sm" placeholder="Qty" />
          </div>
          <button
            type="button"
            disabled={!useApi || creating || fromNodeId === toNodeId}
            onClick={() => void handleCreate()}
            className="rounded-lg bg-primary-container px-4 py-2 text-label-md font-semibold text-on-primary-container disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Send transfer'}
          </button>
        </div>
      )}
      <ul className="space-y-inset-sm">
        {transfers.map((t) => (
          <li key={t.id} className="rounded-xl border border-outline-variant p-inset-md">
            <p className="font-semibold">{t.fromNodeName} → {t.toNodeName}</p>
            <StatusChip label={t.status.replace('_', ' ')} tone={t.status === 'in_transit' ? 'warning' : 'success'} />
            {t.status === 'in_transit' && (
              <button type="button" onClick={() => void onReceive(t.id)} className="mt-2 text-label-md font-semibold text-primary-container">
                Receive at destination
              </button>
            )}
          </li>
        ))}
        {transfers.length === 0 && (
          <li className="text-body-sm text-on-surface-variant">No transfers yet.</li>
        )}
      </ul>
    </div>
  );
}

export function BlindCountView({
  count,
  onSubmitItem,
  onReview,
  onBack,
  useApi,
}: {
  count: PhysicalCount;
  onSubmitItem: (itemId: string, qty: number, uomCode: string) => Promise<void>;
  onReview?: () => Promise<void>;
  onBack: () => void;
  useApi?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState(false);

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
                value={values[item.itemId] ?? (item.countedQty != null ? String(item.countedQty) : '')}
                onChange={(e) => setValues((v) => ({ ...v, [item.itemId]: e.target.value }))}
                className="flex-1 rounded-lg border border-outline-variant px-3 py-2"
              />
              <button
                type="button"
                onClick={() => void onSubmitItem(item.itemId, Number(values[item.itemId] ?? item.countedQty ?? 0), item.countedUomCode ?? 'each')}
                className="rounded-lg bg-primary-container px-3 py-2 text-label-sm font-semibold text-on-primary-container"
              >
                Save
              </button>
            </div>
          </li>
        ))}
      </ul>
      {onReview && (
        <button
          type="button"
          disabled={reviewing}
          onClick={() => {
            setReviewing(true);
            void onReview().finally(() => setReviewing(false));
          }}
          className="w-full rounded-lg bg-primary px-4 py-3 text-label-md font-semibold text-on-primary disabled:opacity-50"
        >
          {reviewing ? 'Posting…' : useApi ? 'Review & post count' : 'Review variance'}
        </button>
      )}
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
  inventoryItems,
  onBack,
  onSave,
  useApi,
}: {
  recipes: RecipeV2[];
  menuItems: Array<{ id: string; name: string }>;
  inventoryItems?: Array<{ id: string; name: string; recipeUomCode?: string }>;
  onBack?: () => void;
  onSave?: (menuItemId: string, recipe: RecipeV2) => Promise<void>;
  useApi?: boolean;
}) {
  const [selected, setSelected] = useState(recipes[0]?.menuItemId ?? menuItems[0]?.id ?? '');
  const [draftByMenuItem, setDraftByMenuItem] = useState<Record<string, RecipeV2>>({});
  const [saving, setSaving] = useState(false);

  const baseRecipe =
    recipes.find((r) => r.menuItemId === selected) ??
    ({
      id: `draft-${selected}`,
      menuItemId: selected,
      menuItemName: menuItems.find((m) => m.id === selected)?.name ?? 'Recipe',
      yieldPct: 100,
      ingredients: [],
    } satisfies RecipeV2);

  const recipe = draftByMenuItem[selected] ?? baseRecipe;

  const setRecipe = (next: RecipeV2) => {
    setDraftByMenuItem((prev) => ({ ...prev, [selected]: next }));
  };

  const updateIngredient = (ingId: string, patch: Partial<RecipeV2['ingredients'][number]>) => {
    setRecipe({
      ...recipe,
      ingredients: recipe.ingredients.map((ing) =>
        ing.id === ingId ? { ...ing, ...patch } : ing,
      ),
    });
  };

  const addIngredient = () => {
    const first = inventoryItems?.[0];
    const newIng = {
      id: `new-${Date.now()}`,
      itemId: first?.id ?? '',
      itemName: first?.name ?? '',
      qtyRequired: 1,
      uomCode: first?.recipeUomCode ?? 'each',
      yieldPct: 100,
    };
    setRecipe({ ...recipe, ingredients: [...recipe.ingredients, newIng] });
  };

  const removeIngredient = (ingId: string) => {
    setRecipe({
      ...recipe,
      ingredients: recipe.ingredients.filter((ing) => ing.id !== ingId),
    });
  };

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(recipe.menuItemId, recipe);
    } finally {
      setSaving(false);
    }
  };

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
        <div className="space-y-inset-md rounded-xl border border-outline-variant p-inset-md">
          <label className="block">
            <span className="text-label-sm text-on-surface-variant">Recipe yield %</span>
            <input
              type="number"
              min={1}
              max={100}
              step={0.1}
              value={recipe.yieldPct}
              onChange={(e) => setRecipe({ ...recipe, yieldPct: Number(e.target.value) || 0 })}
              className="mt-1 w-full rounded-lg border border-outline-variant px-3 py-2 text-body-sm"
            />
          </label>

          <ul className="space-y-inset-sm">
            {recipe.ingredients.map((ing) => (
              <li
                key={ing.id}
                className="grid gap-2 rounded-lg border border-outline-variant p-3 sm:grid-cols-[1fr_5rem_5rem_5rem_auto]"
              >
                {inventoryItems && inventoryItems.length > 0 ? (
                  <select
                    value={ing.itemId}
                    onChange={(e) => {
                      const item = inventoryItems.find((i) => i.id === e.target.value);
                      updateIngredient(ing.id, {
                        itemId: e.target.value,
                        itemName: item?.name ?? '',
                        uomCode: item?.recipeUomCode ?? ing.uomCode,
                      });
                    }}
                    className="rounded-lg border border-outline-variant px-2 py-2 text-body-sm"
                  >
                    {inventoryItems.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={ing.itemName}
                    onChange={(e) => updateIngredient(ing.id, { itemName: e.target.value })}
                    className="rounded-lg border border-outline-variant px-2 py-2 text-body-sm"
                    placeholder="Ingredient"
                  />
                )}
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={ing.qtyRequired}
                  onChange={(e) =>
                    updateIngredient(ing.id, { qtyRequired: Number(e.target.value) || 0 })
                  }
                  className="rounded-lg border border-outline-variant px-2 py-2 text-body-sm"
                  aria-label="Quantity"
                />
                <input
                  value={ing.uomCode}
                  onChange={(e) => updateIngredient(ing.id, { uomCode: e.target.value })}
                  className="rounded-lg border border-outline-variant px-2 py-2 text-body-sm"
                  aria-label="UOM"
                />
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={ing.yieldPct}
                  onChange={(e) =>
                    updateIngredient(ing.id, { yieldPct: Number(e.target.value) || 0 })
                  }
                  className="rounded-lg border border-outline-variant px-2 py-2 text-body-sm"
                  aria-label="Line yield %"
                />
                <button
                  type="button"
                  onClick={() => removeIngredient(ing.id)}
                  className="rounded-lg border border-outline-variant px-3 py-2 text-label-sm text-error"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addIngredient}
              className="rounded-lg border border-outline-variant px-4 py-2 text-label-md font-semibold"
            >
              Add ingredient
            </button>
            {onSave && (
              <button
                type="button"
                disabled={!useApi || saving}
                onClick={() => void handleSave()}
                className="rounded-lg bg-primary-container px-4 py-2 text-label-md font-semibold text-on-primary-container disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save recipe'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
