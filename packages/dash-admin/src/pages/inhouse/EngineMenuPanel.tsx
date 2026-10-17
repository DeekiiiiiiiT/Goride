import { useEffect, useRef, useState } from 'react';
import { BrandCatalogPanel, KitStarter, ProductTypeEditor } from '@roam/menu-builder';
import type { MenuKitDef, MenuSnapshot } from '@roam/menu-engine';
import {
  createInHouseMenuBrand,
  getInHouseEngineMenu,
  publishInHouseEngineMenu,
  saveInHouseEngineMenuDraft,
  saveInHouseLocationOverrides,
  type InHouseEngineOverride,
} from '@roam/dash-admin-client';

function draftDiff(before: MenuSnapshot | null, after: MenuSnapshot): string {
  const beforeIds = new Set((before?.products || []).map((p) => p.id));
  const afterIds = new Set(after.products.map((p) => p.id));
  const added = after.products.filter((p) => !beforeIds.has(p.id)).map((p) => p.name);
  const removed = (before?.products || []).filter((p) => !afterIds.has(p.id)).map((p) => p.name);
  const priceChanged: string[] = [];
  for (const p of after.products) {
    const prev = before?.products.find((x) => x.id === p.id);
    if (prev && Number(prev.basePrice) !== Number(p.basePrice)) {
      priceChanged.push(`${p.name}: J$${prev.basePrice} → J$${p.basePrice}`);
    }
  }
  const lines = [
    `Products: ${before?.products.length ?? 0} → ${after.products.length}`,
    added.length ? `Added: ${added.join(', ')}` : null,
    removed.length ? `Removed: ${removed.join(', ')}` : null,
    priceChanged.length ? `Price: ${priceChanged.slice(0, 5).join('; ')}` : null,
  ].filter(Boolean);
  return lines.join('\n') || 'No product-level changes detected.';
}

function upsertOverride(
  list: InHouseEngineOverride[],
  targetKind: string,
  targetId: string,
  patch: { price?: number | null; isAvailable?: boolean | null },
): InHouseEngineOverride[] {
  const existing = list.find((r) => r.targetId === targetId && r.targetKind === targetKind);
  if (existing) {
    return list.map((r) =>
      r.targetId === targetId && r.targetKind === targetKind ? { ...r, ...patch } : r,
    );
  }
  return [
    ...list,
    {
      targetKind,
      targetId,
      price: patch.price ?? null,
      isAvailable: patch.isAvailable ?? null,
    },
  ];
}

/** Engine menu editor (kits + product-type panels) alongside the legacy builder. */
export function EngineMenuPanel({
  token,
  merchantId,
  markupBps,
}: {
  token: string;
  merchantId: string;
  markupBps: number;
}) {
  const [snapshot, setSnapshot] = useState<MenuSnapshot | null>(null);
  const [publishedBaseline, setPublishedBaseline] = useState<MenuSnapshot | null>(null);
  const [kits, setKits] = useState<MenuKitDef[]>([]);
  const [menuMeta, setMenuMeta] = useState<{ status?: string; version?: number } | null>(null);
  const [productId, setProductId] = useState('');
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<InHouseEngineOverride[]>([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipAutosave = useRef(true);

  async function load() {
    setError('');
    setUnavailable(false);
    setLoading(true);
    skipAutosave.current = true;
    try {
      const data = await getInHouseEngineMenu(token, merchantId);
      setSnapshot(data.snapshot);
      setPublishedBaseline(data.menu?.status === 'published' ? data.snapshot : null);
      setKits(data.kits || []);
      setMenuMeta(data.menu);
      setBrands((data.brands || []).map((b) => ({ id: b.id, name: b.name })));
      setBrandId(data.brandId);
      setOverrides(data.overrides || []);
      if (data.snapshot?.products[0]) setProductId(data.snapshot.products[0].id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load engine menu';
      if (/404|not found|Invalid JSON/i.test(message)) {
        setUnavailable(true);
        setError('');
      } else {
        setError(message);
      }
      setSnapshot(null);
    } finally {
      setLoading(false);
      setTimeout(() => {
        skipAutosave.current = false;
      }, 400);
    }
  }

  useEffect(() => {
    void load();
  }, [merchantId, token]);

  useEffect(() => {
    if (!snapshot || skipAutosave.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveDraft(false);
    }, 1200);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [snapshot, brandId, overrides]);

  async function saveDraft(showStatus: boolean) {
    if (!snapshot) return;
    setSaving(true);
    if (showStatus) setStatus('Saving…');
    try {
      await saveInHouseEngineMenuDraft(token, merchantId, snapshot, brandId);
      await saveInHouseLocationOverrides(token, merchantId, overrides);
      if (showStatus) setStatus('Draft saved');
      setMenuMeta((m) => (m ? { ...m, status: m.status || 'draft' } : m));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save draft failed');
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!snapshot) return;
    const summary = draftDiff(publishedBaseline, snapshot);
    if (!window.confirm(`Publish this menu?\n\n${summary}`)) return;
    setSaving(true);
    setError('');
    try {
      await saveInHouseEngineMenuDraft(token, merchantId, snapshot, brandId);
      await saveInHouseLocationOverrides(token, merchantId, overrides);
      await publishInHouseEngineMenu(token, merchantId, snapshot);
      setStatus('Published');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setSaving(false);
    }
  }

  function applyKit(kit: MenuKitDef) {
    if (!snapshot) return;
    const sections = kit.payload.sections.map((section, i) => ({
      id: crypto.randomUUID(),
      name: section.name,
      sectionType: section.sectionType as MenuSnapshot['sections'][0]['sectionType'],
      sort: i,
    }));
    setSnapshot({
      ...snapshot,
      sections: [...snapshot.sections, ...sections],
    });
  }

  async function onBrandChange(next: string | null) {
    setBrandId(next);
    if (next && !brands.some((b) => b.id === next)) return;
  }

  async function addBrand() {
    const name = window.prompt('Brand name (e.g. Domino\'s Jamaica)');
    if (!name?.trim()) return;
    try {
      const { brand } = await createInHouseMenuBrand(token, name.trim());
      setBrands((list) => [...list, { id: brand.id, name: brand.name }]);
      setBrandId(brand.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create brand');
    }
  }

  function onProductOverride(
    targetId: string,
    patch: { price?: number | null; isAvailable?: boolean | null },
  ) {
    setOverrides((list) => upsertOverride(list, 'product', targetId, patch));
  }

  function onOptionAvailability(optionId: string, isAvailable: boolean | null) {
    setOverrides((list) => upsertOverride(list, 'option', optionId, { isAvailable }));
  }

  function confirmPrices() {
    if (!snapshot) return;
    const now = new Date().toISOString();
    setSnapshot({
      ...snapshot,
      products: snapshot.products.map((p) => ({ ...p, priceCheckedAt: now })),
    });
    setStatus('Prices confirmed — save or publish');
  }

  if (unavailable) return null;
  if (loading) return null;
  if (error && !snapshot) {
    return (
      <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
        Menu engine: {error}
      </div>
    );
  }
  if (!snapshot) return null;

  const empty = snapshot.products.length === 0 && snapshot.sections.length === 0;
  const overrideRows = snapshot.products.map((p) => {
    const row = overrides.find((o) => o.targetId === p.id && o.targetKind === 'product');
    return {
      targetId: p.id,
      label: p.name,
      price: row?.price ?? null,
      isAvailable: row?.isAvailable ?? null,
    };
  });
  const optionAvailability = new Map<string, boolean | null>();
  for (const row of overrides) {
    if (row.targetKind === 'option') optionAvailability.set(row.targetId, row.isAvailable ?? null);
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-950/40 p-4">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        onClick={() => setOpen((value) => !value)}
      >
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Menu engine</h3>
          <p className="text-xs text-slate-400">
            {menuMeta?.status === 'published'
              ? `Published v${menuMeta.version} — drafts autosave`
              : 'Draft — autosaves; classic editor below still works'}
            {status ? ` · ${status}` : ''}
          </p>
        </div>
        <span className="text-xs text-slate-400">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open ? (
        <div className="space-y-4 border-t border-slate-800 pt-3">
          {error ? <p className="text-xs text-amber-300">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={saving || !snapshot.products.length}
              className="rounded-xl border border-slate-600 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-40"
              onClick={() => confirmPrices()}
            >
              Confirm all prices
            </button>
            <button
              type="button"
              disabled={saving}
              className="rounded-xl border border-slate-600 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-40"
              onClick={() => void saveDraft(true)}
            >
              Save draft
            </button>
            <button
              type="button"
              disabled={saving}
              className="rounded-xl bg-amber-500 px-3 py-1.5 text-sm text-slate-950 disabled:opacity-40"
              onClick={() => void publish()}
            >
              {saving ? 'Working…' : 'Publish snapshot'}
            </button>
          </div>

          <div className="rounded-lg bg-white p-3 text-slate-900 space-y-2">
            <BrandCatalogPanel
              brands={brands}
              brandId={brandId}
              onBrandChange={(id) => void onBrandChange(id)}
              overrides={overrideRows}
              onOverride={onProductOverride}
            />
            <button
              type="button"
              className="text-xs text-[#2563eb] underline"
              onClick={() => void addBrand()}
            >
              + New brand
            </button>
          </div>

          {empty ? <KitStarter kits={kits} onApply={applyKit} /> : null}

          {snapshot.products.length > 0 ? (
            <>
              <label className="block text-xs text-slate-400">
                Product
                <select
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                >
                  {snapshot.products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                  ))}
                </select>
              </label>
              <div className="rounded-lg bg-white p-3 text-slate-900">
                <ProductTypeEditor
                  snapshot={snapshot}
                  productId={productId}
                  onChange={setSnapshot}
                  markupBps={markupBps}
                  optionAvailability={optionAvailability}
                  onOptionAvailability={onOptionAvailability}
                  onConfirmPrices={confirmPrices}
                />
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-400">
              Apply a kit or keep using the classic editor — migrate + publish to go live on the engine.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
