import { useEffect, useMemo, useRef, useState } from 'react';
import { KitStarter, ProductTypeEditor } from '@roam/menu-builder';
import type { MenuKitDef, MenuProduct, MenuSnapshot, ProductType } from '@roam/menu-engine';
import {
  getInHouseEngineMenu,
  publishInHouseEngineMenu,
  saveInHouseEngineMenuDraft,
  saveInHouseLocationOverrides,
  uploadDeskImage,
  type InHouseEngineOverride,
} from '@roam/dash-admin-client';
import { EntityDrawer } from '../../components/ui/bits';
import { IH } from './inHouseTheme';

const SECTION_TYPES: Array<{ id: ProductType; label: string }> = [
  { id: 'standard', label: 'Standard' },
  { id: 'sized', label: 'Sizes' },
  { id: 'pizza', label: 'Pizza' },
  { id: 'wings', label: 'Wings' },
  { id: 'combo', label: 'Combo' },
  { id: 'build_your_own', label: 'Build your own' },
];

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

function money(n: number) {
  return `J$${Number(n).toFixed(2)}`;
}

function customerPrice(base: number, markupBps: number) {
  return Math.round(base * (1 + markupBps / 10000) * 100) / 100;
}

function freshness(p: MenuProduct): { label: string; tone: 'ok' | 'warn' | 'late' } {
  if (p.priceCheckedAt) {
    const age = Date.now() - new Date(p.priceCheckedAt).getTime();
    if (age < 24 * 60 * 60 * 1000) return { label: 'Verified today', tone: 'ok' };
    if (age < 7 * 24 * 60 * 60 * 1000) return { label: 'Needs quick verification', tone: 'warn' };
  }
  return { label: 'Needs verification', tone: 'warn' };
}

function seedProductFields(type: ProductType): Partial<MenuProduct> {
  if (type === 'pizza') {
    return { pizza: { halfPriceRule: 'full', maxToppings: 10, specialtyMode: 'build' } };
  }
  if (type === 'wings') {
    return { wings: { flavourPerPieces: 6, flavourGroupId: '', piecesGroupId: '' } };
  }
  if (type === 'combo') {
    return { comboSlots: [] };
  }
  return {};
}

/** Stitch Menu Builder: sections rail + dish table + edit drawer. */
export function EngineMenuPanel({
  token,
  merchantId,
  markupBps,
  restaurantName = 'Restaurant',
}: {
  token: string;
  merchantId: string;
  markupBps: number;
  restaurantName?: string;
}) {
  const [snapshot, setSnapshot] = useState<MenuSnapshot | null>(null);
  const [publishedBaseline, setPublishedBaseline] = useState<MenuSnapshot | null>(null);
  const [kits, setKits] = useState<MenuKitDef[]>([]);
  const [menuMeta, setMenuMeta] = useState<{ status?: string; version?: number } | null>(null);
  const [sectionId, setSectionId] = useState('');
  const [productId, setProductId] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'needs' | 'active'>('all');
  const [overrides, setOverrides] = useState<InHouseEngineOverride[]>([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipAutosave = useRef(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      setOverrides(data.overrides || []);
      const firstSection = data.snapshot?.sections[0]?.id || '';
      setSectionId(firstSection);
      const firstProduct = data.snapshot?.products.find((p) => p.sectionId === firstSection)
        || data.snapshot?.products[0];
      if (firstProduct) {
        setProductId(firstProduct.id);
        setDrawerOpen(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load menu';
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
  }, [snapshot, overrides]);

  async function saveDraft(showStatus: boolean) {
    if (!snapshot) return;
    setSaving(true);
    if (showStatus) setStatus('Saving…');
    try {
      await saveInHouseEngineMenuDraft(token, merchantId, snapshot, null);
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
      await saveInHouseEngineMenuDraft(token, merchantId, snapshot, null);
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
      sort: snapshot.sections.length + i,
    }));
    const products: MenuProduct[] = [];
    kit.payload.sections.forEach((section, si) => {
      const sec = sections[si];
      (section.products || []).forEach((p) => {
        const type = (section.sectionType as MenuProduct['type']) || 'standard';
        products.push({
          id: crypto.randomUUID(),
          sectionId: sec.id,
          type,
          name: p.name,
          basePrice: 0,
          groupLinks: [],
          ...seedProductFields(type),
        });
      });
    });
    setSnapshot({
      ...snapshot,
      sections: [...snapshot.sections, ...sections],
      products: [...snapshot.products, ...products],
    });
    if (sections[0]) setSectionId(sections[0].id);
  }

  function addSection() {
    if (!snapshot) return;
    const name = window.prompt('Section name');
    if (!name?.trim()) return;
    const typeRaw = window.prompt(
      `Section type (${SECTION_TYPES.map((t) => t.id).join(', ')})`,
      'standard',
    );
    const sectionType = (SECTION_TYPES.find((t) => t.id === typeRaw?.trim())?.id || 'standard') as ProductType;
    const id = crypto.randomUUID();
    setSnapshot({
      ...snapshot,
      sections: [
        ...snapshot.sections,
        { id, name: name.trim(), sectionType, sort: snapshot.sections.length },
      ],
    });
    setSectionId(id);
  }

  function patchSection(id: string, patch: Partial<MenuSnapshot['sections'][0]>) {
    if (!snapshot) return;
    setSnapshot({
      ...snapshot,
      sections: snapshot.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  }

  function addDish() {
    if (!snapshot || !sectionId) return;
    const section = snapshot.sections.find((s) => s.id === sectionId);
    const type = (section?.sectionType === 'standard' || !section?.sectionType
      ? 'standard'
      : section.sectionType) as ProductType;
    const id = crypto.randomUUID();
    const product: MenuProduct = {
      id,
      sectionId,
      type,
      name: type === 'pizza' ? 'New pizza' : type === 'wings' ? 'New wings' : type === 'combo' ? 'New deal' : 'New dish',
      description: '',
      basePrice: 0,
      groupLinks: [],
      ...seedProductFields(type),
    };
    setSnapshot({ ...snapshot, products: [...snapshot.products, product] });
    setProductId(id);
    setDrawerOpen(true);
  }

  function patchProduct(id: string, patch: Partial<MenuProduct>) {
    if (!snapshot) return;
    setSnapshot({
      ...snapshot,
      products: snapshot.products.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });
  }

  function archiveProduct(id: string) {
    if (!window.confirm('Archive this dish? It will leave the list but stay in the draft until you publish.')) return;
    patchProduct(id, { archivedAt: new Date().toISOString() });
    setDrawerOpen(false);
    setProductId('');
  }

  async function uploadPhoto(file: File) {
    if (!productId) return;
    setUploading(true);
    setError('');
    try {
      const uploaded = await uploadDeskImage(token, file, 'menu-items');
      patchProduct(productId, { imageUrl: uploaded.publicUrl });
      setStatus('Photo uploaded');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed');
    } finally {
      setUploading(false);
    }
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

  function productAvailable(p: MenuProduct): boolean {
    const row = overrides.find((o) => o.targetId === p.id && o.targetKind === 'product');
    if (row?.isAvailable === false) return false;
    return true;
  }

  function setProductAvailable(id: string, available: boolean) {
    setOverrides((list) => upsertOverride(list, 'product', id, { isAvailable: available }));
  }

  const optionAvailability = useMemo(() => {
    const map = new Map<string, boolean | null>();
    for (const row of overrides) {
      if (row.targetKind === 'option') map.set(row.targetId, row.isAvailable ?? null);
    }
    return map;
  }, [overrides]);

  if (unavailable) {
    return (
      <div className="m-4 rounded-lg border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
        Menu tools are not available for this restaurant yet.
      </div>
    );
  }
  if (loading) {
    return <div className={`m-4 px-3 py-4 text-sm ${IH.muted}`}>Loading menu…</div>;
  }
  if (error && !snapshot) {
    return (
      <div className="m-4 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-100">
        Could not load menu: {error}
      </div>
    );
  }
  if (!snapshot) return null;

  const empty = snapshot.products.length === 0 && snapshot.sections.length === 0;
  const published = menuMeta?.status === 'published';
  const sections = [...snapshot.sections].sort((a, b) => a.sort - b.sort);
  const activeSection = sections.find((s) => s.id === sectionId) || sections[0];
  const activeSectionId = activeSection?.id || '';
  const sectionProducts = snapshot.products.filter((p) => p.sectionId === activeSectionId && !p.archivedAt);
  const filtered = sectionProducts.filter((p) => {
    if (filter && !`${p.name} ${p.description || ''}`.toLowerCase().includes(filter.toLowerCase())) return false;
    if (statusFilter === 'needs' && p.priceCheckedAt) return false;
    if (statusFilter === 'active' && !productAvailable(p)) return false;
    return true;
  });
  const selected = snapshot.products.find((p) => p.id === productId) || null;
  const initials = restaurantName.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'RR';
  const markupPct = Math.round(markupBps / 100);
  const previewSections = sections.filter((s) => !s.archivedAt);

  if (empty) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700 bg-[#1e293b] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-100">Draft · empty menu</p>
            <p className="text-xs text-slate-400">Start from a kit, then edit dishes in the table.</p>
          </div>
          <button type="button" disabled={saving} className={IH.primaryBtn} onClick={() => void publish()}>
            Review & publish
          </button>
        </div>
        <div className="space-y-4 rounded-lg border border-slate-700 bg-[#1e293b] p-6 sm:p-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">Template library</p>
            <h3 className="mt-1 text-2xl font-bold tracking-tight text-slate-100">Start from a kit</h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Accelerate setup for {restaurantName} with pre-configured menu structures, or create sections manually.
            </p>
          </div>
          <KitStarter kits={kits} onApply={applyKit} />
          <button type="button" className={IH.secondaryBtn} onClick={addSection}>
            + Add section manually
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-[560px] flex-col overflow-hidden bg-[#0f172a] text-slate-200">
      {/* Top action strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/80 bg-[#1e293b] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-600 bg-[#0f172a] px-2.5 py-1 text-xs text-slate-300">
            <span className={`h-2 w-2 rounded-full ${published ? 'bg-emerald-400' : 'animate-pulse bg-amber-400'}`} />
            {published
              ? `Live · menu v${menuMeta?.version ?? ''}`
              : `Draft · ${snapshot.products.filter((p) => !p.archivedAt).length} dish${snapshot.products.filter((p) => !p.archivedAt).length === 1 ? '' : 'es'} not live`}
          </span>
          {status ? <span className="text-xs text-slate-400">{status}</span> : null}
          {error ? <span className="text-xs text-amber-300">{error}</span> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={IH.secondaryBtn} onClick={() => setPreviewOpen(true)}>
            Preview as customer
          </button>
          <button type="button" disabled={saving || !snapshot.products.length} className={IH.secondaryBtn} onClick={() => confirmPrices()}>
            Confirm all prices
          </button>
          <button type="button" disabled={saving} className={IH.secondaryBtn} onClick={() => void saveDraft(true)}>
            Save draft
          </button>
          <button type="button" disabled={saving} className={IH.primaryBtn} onClick={() => void publish()}>
            {saving ? 'Working…' : 'Review & publish'}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Sections rail */}
        <aside className="flex w-56 shrink-0 flex-col justify-between border-r border-slate-700/80 bg-[#071520] p-3 sm:w-64">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5 rounded-lg border border-slate-700/60 bg-[#1e293b] px-2 py-1.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-amber-950 text-xs font-bold text-amber-300">
                {initials}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-slate-100">{restaurantName}</h2>
                <p className="truncate text-xs text-slate-400">Menu sections</p>
              </div>
            </div>
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Sections <span className="ml-1 font-mono text-[10px] text-amber-400">{sections.length}</span>
              </span>
              <button type="button" className={`text-xs font-medium ${IH.link}`} onClick={addSection}>
                + Add
              </button>
            </div>
            <nav className="flex max-h-[60vh] flex-col gap-1 overflow-auto">
              {sections.map((sec) => {
                const count = snapshot.products.filter((p) => p.sectionId === sec.id && !p.archivedAt).length;
                const active = sec.id === activeSectionId;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition ${
                      active
                        ? 'bg-amber-500 font-semibold text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                    }`}
                    onClick={() => {
                      setSectionId(sec.id);
                      const first = snapshot.products.find((p) => p.sectionId === sec.id && !p.archivedAt);
                      if (first) setProductId(first.id);
                    }}
                  >
                    <span className="truncate">{sec.name}</span>
                    <span className={`font-mono text-[10px] ${active ? 'text-slate-800' : 'text-slate-500'}`}>{count}</span>
                  </button>
                );
              })}
            </nav>
            {activeSection ? (
              <label className="block space-y-1 px-1 text-[10px] text-slate-500">
                Section type
                <select
                  className={`${IH.input} w-full text-xs`}
                  value={activeSection.sectionType || 'standard'}
                  onChange={(e) => patchSection(activeSection.id, { sectionType: e.target.value as ProductType })}
                >
                  {SECTION_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </aside>

        {/* Dish table */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#0f172a]">
          <div className="flex flex-col gap-3 border-b border-slate-700/60 bg-[#071520]/60 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-bold tracking-tight text-slate-100">{activeSection?.name || 'Section'}</h1>
                <span className="text-xs text-slate-400">{sectionProducts.length} items</span>
              </div>
              <button type="button" className={IH.primaryBtn} onClick={addDish} disabled={!activeSectionId}>
                + Add dish
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className={`${IH.input} max-w-md flex-1`}
                placeholder="Filter dishes…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              {(
                [
                  { id: 'all' as const, label: 'All' },
                  { id: 'needs' as const, label: 'Needs verification' },
                  { id: 'active' as const, label: 'Available' },
                ] as const
              ).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={statusFilter === chip.id ? IH.chipActive : IH.chip}
                  onClick={() => setStatusFilter(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 border-b border-slate-700 bg-[#1e293b] text-slate-400">
                <tr>
                  <th className="w-8 py-2.5 pl-4 text-center">#</th>
                  <th className="px-3 py-2.5">Dish</th>
                  <th className="w-28 px-3 py-2.5">POS price</th>
                  <th className="w-36 px-3 py-2.5">In-House price</th>
                  <th className="w-40 px-3 py-2.5">Status</th>
                  <th className="w-12 px-2 py-2.5 text-center">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.map((p, i) => {
                  const fr = freshness(p);
                  const selectedRow = p.id === productId;
                  const ihPrice = customerPrice(p.basePrice, markupBps);
                  return (
                    <tr
                      key={p.id}
                      className={`cursor-pointer transition-colors ${
                        selectedRow
                          ? 'border-l-2 border-l-amber-400 bg-slate-800/70'
                          : 'hover:bg-slate-900/80'
                      }`}
                      onClick={() => {
                        setProductId(p.id);
                        setDrawerOpen(true);
                      }}
                    >
                      <td className="py-3 pl-4 text-center font-mono text-slate-500">{i + 1}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
                            {p.imageUrl ? (
                              <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-[10px] text-slate-500">No photo</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-100">{p.name}</p>
                            <p className="mt-0.5 max-w-sm truncate text-[11px] text-slate-400">{p.description || 'No description'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono font-medium text-slate-200">{money(p.basePrice)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="font-bold text-slate-100">{money(ihPrice)}</span>
                          <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1 text-[10px] text-amber-300">
                            +{markupPct}%
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${fr.tone === 'ok' ? 'bg-emerald-400' : fr.tone === 'warn' ? 'bg-amber-400' : 'bg-red-400'}`} />
                          <span className={fr.tone === 'ok' ? 'text-emerald-300' : fr.tone === 'warn' ? 'text-amber-300' : 'text-red-300'}>
                            {fr.label}
                          </span>
                        </div>
                        {!productAvailable(p) ? <p className="mt-0.5 text-[10px] text-slate-500">Hidden from customers</p> : null}
                      </td>
                      <td className="px-2 py-3 text-center">
                        <button
                          type="button"
                          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            setProductId(p.id);
                            setDrawerOpen(true);
                          }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 ? (
              <p className="p-6 text-sm text-slate-400">No dishes in this section. Add a dish or clear filters.</p>
            ) : null}
          </div>
        </main>

        {/* Edit drawer */}
        {drawerOpen && selected ? (
          <aside className="flex w-80 shrink-0 flex-col overflow-hidden border-l border-slate-700/80 bg-[#071520] shadow-xl lg:w-[28rem] xl:w-[32rem]">
            <div className="flex items-start justify-between border-b border-slate-700 bg-[#1e293b] p-4">
              <div>
                <h2 className="text-sm font-bold text-slate-100">Edit item</h2>
                <p className="mt-0.5 truncate text-[11px] text-slate-400">{selected.name}</p>
              </div>
              <button
                type="button"
                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                onClick={() => setDrawerOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
              <label className="block space-y-1">
                <span className="font-medium text-slate-400">Item name</span>
                <input
                  className={`${IH.input} w-full`}
                  value={selected.name}
                  onChange={(e) => patchProduct(selected.id, { name: e.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className="font-medium text-slate-400">Category</span>
                <select
                  className={`${IH.input} w-full`}
                  value={selected.sectionId}
                  onChange={(e) => patchProduct(selected.id, { sectionId: e.target.value })}
                >
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="font-medium text-slate-400">Description</span>
                <textarea
                  className={`${IH.input} w-full min-h-[72px]`}
                  value={selected.description || ''}
                  onChange={(e) => patchProduct(selected.id, { description: e.target.value })}
                />
              </label>
              <div className="space-y-2">
                <span className="font-medium text-slate-400">Photo</span>
                <div className="flex items-center gap-3">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
                    {selected.imageUrl ? (
                      <img src={selected.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-slate-500">None</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadPhoto(file);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      disabled={uploading}
                      className={IH.secondaryBtn}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploading ? 'Uploading…' : 'Upload photo'}
                    </button>
                    <input
                      className={`${IH.input} w-full`}
                      value={selected.imageUrl || ''}
                      onChange={(e) => patchProduct(selected.id, { imageUrl: e.target.value })}
                      placeholder="Or paste image URL…"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2.5 rounded-lg border border-slate-700 bg-[#1e293b] p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-100">In-House pricing</span>
                  <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
                    +{markupPct}%
                  </span>
                </div>
                <label className="block space-y-1">
                  <span className="text-[10px] text-slate-500">Restaurant POS price (J$)</span>
                  <input
                    type="number"
                    step="0.01"
                    className={`${IH.input} w-full`}
                    value={selected.basePrice}
                    onChange={(e) => patchProduct(selected.id, { basePrice: Number(e.target.value) || 0 })}
                  />
                </label>
                <div className="rounded border border-slate-700/60 bg-[#0f172a] p-2">
                  <div className="text-[10px] text-slate-500">Customer pays</div>
                  <div className="font-mono text-sm font-bold text-slate-100">
                    {money(customerPrice(selected.basePrice, markupBps))}
                  </div>
                </div>
              </div>
              <label className="flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-[#1e293b] px-3 py-2">
                <span className="font-medium text-slate-200">Available to customers</span>
                <input
                  type="checkbox"
                  checked={productAvailable(selected)}
                  onChange={(e) => setProductAvailable(selected.id, e.target.checked)}
                />
              </label>
              <button
                type="button"
                className={IH.secondaryBtn}
                onClick={() => patchProduct(selected.id, { priceCheckedAt: new Date().toISOString() })}
              >
                Mark price verified
              </button>

              {/* Type editors — light partner chrome inside desk skin wrapper */}
              <div className="ih-type-editor rounded-lg border border-slate-700 bg-slate-100 p-3 text-[#0f172a]">
                <ProductTypeEditor
                  snapshot={snapshot}
                  productId={selected.id}
                  onChange={setSnapshot}
                  markupBps={markupBps}
                  optionAvailability={optionAvailability}
                  onOptionAvailability={(optionId, isAvailable) => {
                    setOverrides((list) => upsertOverride(list, 'option', optionId, { isAvailable }));
                  }}
                  onConfirmPrices={() =>
                    patchProduct(selected.id, { priceCheckedAt: new Date().toISOString() })
                  }
                />
              </div>

              <button
                type="button"
                className="w-full rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs font-medium text-red-200 hover:bg-red-950/50"
                onClick={() => archiveProduct(selected.id)}
              >
                Archive dish
              </button>
            </div>
          </aside>
        ) : null}
      </div>

      <EntityDrawer open={previewOpen} title="Preview as customer" onClose={() => setPreviewOpen(false)}>
        <div className="mx-auto w-full max-w-[320px] space-y-3 rounded-[2rem] border border-slate-700 bg-slate-900 p-4">
          <h3 className="font-semibold text-slate-100">{restaurantName}</h3>
          {previewSections.map((section) => {
            const dishes = snapshot.products.filter(
              (p) => p.sectionId === section.id && !p.archivedAt && productAvailable(p),
            );
            if (!dishes.length) return null;
            return (
              <div key={section.id}>
                <h4 className="text-sm text-slate-400">{section.name}</h4>
                <ul className="space-y-1">
                  {dishes.map((item) => {
                    const isFresh = Boolean(item.priceCheckedAt);
                    return (
                      <li key={item.id} className="flex justify-between gap-2 text-sm text-slate-200">
                        <span className={isFresh ? '' : 'text-slate-500 line-through'}>{item.name}</span>
                        <span className="shrink-0 font-mono text-xs">
                          {isFresh ? money(customerPrice(item.basePrice, markupBps)) : 'hidden'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </EntityDrawer>
    </div>
  );
}
