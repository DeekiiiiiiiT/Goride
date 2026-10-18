import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { getJwtRoles, jwtPrimaryRole } from '@roam/auth-client';
import {
  blankTemplatePayload,
  PRODUCT_TYPE_OPTIONS,
  productTypeHint,
  ProductTypeEditor,
  snapshotToTemplate,
  templateToSnapshot,
} from '@roam/menu-builder';
import type { MenuSnapshot, ProductType } from '@roam/menu-engine';
import {
  createCuisine,
  deleteCuisine,
  deleteDishTemplate,
  deleteKit,
  getMenuLibrary,
  mergeCuisine,
  saveDishTemplate,
  saveKit,
  setDishTemplateArchived,
  setKitArchived,
  updateCuisine,
  type DishTemplate,
  type LibraryCuisine,
  type LibraryKit,
  type LibraryKitPayload,
} from '@roam/dash-admin-client';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';
import type { AdminOutletContext } from '../../DashAdminPortal';
import { EntityDrawer } from '../../components/ui/bits';
import { IH } from './inHouseTheme';
import { DESK_ADMIN } from './inHouseUi';

/** The six ways a customer can order a dish. Fixed in code (each has its own pricing); templates build on them. */
const TYPE_DETAILS: Record<ProductType, { example: string; pricing: string }> = {
  standard: { example: 'Beef patty, juice, soup', pricing: 'Base price + any paid extras.' },
  sized: { example: 'Drinks (small / large), oxtail (small / medium / large)', pricing: 'The chosen size sets the price; extras on top.' },
  build_your_own: { example: 'Jamaican plate (meat + 2 sides + gravy), bowls, burgers', pricing: 'Base price; each step can be included, add, or replace the price.' },
  combo: { example: 'Meal deal, family bundle, 2 pizzas + wings', pricing: 'Deal price + upcharges for premium picks.' },
  pizza: { example: 'Build-your-own pizza, specialty pizzas', pricing: 'Size price + toppings priced by size; half toppings follow the half-price rule.' },
  wings: { example: '6 / 12 / 24 wings, chicken pieces, cauliflower bites', pricing: 'Piece-count price; extra flavours and dips add on.' },
};

export const PRODUCT_TYPE_INFO: Array<{ id: ProductType; label: string; summary: string; example: string; pricing: string }> =
  PRODUCT_TYPE_OPTIONS.map((t) => ({ id: t.id, label: t.label, summary: t.hint, ...TYPE_DETAILS[t.id] }));

const TYPE_LABEL = new Map(PRODUCT_TYPE_INFO.map((t) => [t.id, t.label]));

const TABS = [
  { id: 'cuisines', label: 'Cuisines' },
  { id: 'kits', label: 'Starter kits' },
  { id: 'templates', label: 'Dish templates' },
  { id: 'types', label: 'Product types' },
] as const;
type Tab = typeof TABS[number]['id'];

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong';
}

function CuisinePicker({
  cuisines,
  value,
  onChange,
}: {
  cuisines: LibraryCuisine[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {cuisines.filter((c) => !c.archivedAt || value.includes(c.id)).map((c) => {
        const on = value.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
            onClick={() => onChange(on ? value.filter((id) => id !== c.id) : [...value, c.id])}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

// ---- Cuisines ---------------------------------------------------------------

const MARKET_TAGS = [
  'Main Entrée & Specialist',
  'Bakery & Breakfast',
  'Bar & Craft Beverage',
  'Quick Bites & Street Food',
  'Italian & Oven',
  'Noodle & Broth',
] as const;

function readCuisineTags(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem('roam.menuLibrary.cuisineTags') || '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function writeCuisineTag(id: string, tag: string) {
  const next = { ...readCuisineTags(), [id]: tag };
  localStorage.setItem('roam.menuLibrary.cuisineTags', JSON.stringify(next));
}

/** Overlay for one cuisine: rename, other spellings, icon, where it's used, archive / merge / delete. */
function CuisineEditDrawer({
  token,
  cuisine,
  cuisines,
  kits,
  onClose,
  reload,
}: {
  token: string;
  cuisine: LibraryCuisine;
  cuisines: LibraryCuisine[];
  kits: LibraryKit[];
  onClose: () => void;
  reload: () => Promise<void>;
}) {
  const { confirm } = useAdminConfirm();
  const [label, setLabel] = useState(cuisine.label);
  const [aliases, setAliases] = useState<string[]>(cuisine.aliases);
  const [aliasInput, setAliasInput] = useState('');
  const [iconUrl, setIconUrl] = useState(cuisine.iconUrl || '');
  const [mergeInto, setMergeInto] = useState('');
  const [busy, setBusy] = useState(false);

  const restaurants = cuisine.usage?.restaurantList || [];
  const linkedKits = kits.filter((k) => k.cuisineIds.includes(cuisine.id));
  const templateCount = cuisine.usage?.templates || 0;
  const used = (cuisine.usage?.restaurants || 0) + linkedKits.length + templateCount > 0;
  const dirty = label.trim() !== cuisine.label
    || iconUrl.trim() !== (cuisine.iconUrl || '')
    || aliases.join('\n') !== cuisine.aliases.join('\n');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function run(action: () => Promise<unknown>, done: string, close = false) {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      await reload();
      if (close) onClose();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  function addAlias() {
    const value = aliasInput.trim();
    if (!value) return;
    if (!aliases.some((a) => a.toLowerCase() === value.toLowerCase())) setAliases([...aliases, value]);
    setAliasInput('');
  }

  function save() {
    const patch: { label?: string; aliases?: string[]; iconUrl?: string | null } = {};
    if (label.trim() !== cuisine.label) patch.label = label.trim();
    if (aliases.join('\n') !== cuisine.aliases.join('\n')) patch.aliases = aliases;
    if (iconUrl.trim() !== (cuisine.iconUrl || '')) patch.iconUrl = iconUrl.trim() || null;
    void run(() => updateCuisine(token, cuisine.id, patch), 'Cuisine saved', true);
  }

  const field = 'w-full rounded border border-[#354a5c] bg-[#060f17] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-[#22d3ee] focus:outline-none';
  const sectionTitle = 'text-[11px] font-semibold uppercase tracking-wider text-slate-400';

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Edit ${cuisine.label}`}>
      <button type="button" className="absolute inset-0 bg-black/60" aria-label="Close" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-lg flex-col border-l border-[#354a5c] bg-[#0a1b28] text-slate-200 shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-[#354a5c] px-5 py-4">
          <div>
            <p className={sectionTitle}>Edit cuisine</p>
            <h2 className="text-lg font-bold text-white">{cuisine.label}</h2>
            {cuisine.archivedAt ? <span className="mt-1 inline-block rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">Archived</span> : null}
          </div>
          <button type="button" className="rounded px-2 py-1 text-sm text-slate-400 hover:bg-[#122839] hover:text-white" onClick={onClose}>✕</button>
        </header>

        <form
          className="flex-1 space-y-6 overflow-y-auto px-5 py-5"
          onSubmit={(event) => { event.preventDefault(); if (dirty) save(); }}
        >
          <div className="rounded border border-[#354a5c]/70 bg-[#071520] p-3 text-xs leading-relaxed text-slate-400">
            <p className="mb-1 font-semibold text-slate-200">What this cuisine does</p>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>Customers find these restaurants when they search or filter by it.</li>
              <li>If it's a restaurant's <em>first</em> cuisine, it's shown on that restaurant's store card.</li>
              <li>In the menu builder, restaurants with it are offered the starter kits linked below.</li>
            </ul>
          </div>

          <label className="block space-y-1.5">
            <span className={sectionTitle}>Name</span>
            <input className={field} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} required />
            <span className="block text-xs text-slate-500">
              Renaming updates every restaurant that has it. The old name is kept as another spelling so searches still work.
            </span>
          </label>

          <div className="space-y-1.5">
            <span className={sectionTitle}>ID</span>
            <div className="rounded border border-[#354a5c]/60 bg-[#071520] px-3 py-2 font-mono text-xs text-slate-400">{cuisine.id}</div>
            <span className="block text-xs text-slate-500">Never changes. Kits link to this, so a rename can't break them.</span>
          </div>

          <div className="space-y-1.5">
            <span className={sectionTitle}>Other spellings</span>
            <div className="flex flex-wrap gap-1.5">
              {aliases.map((a) => (
                <span key={a} className="inline-flex items-center gap-1 rounded-full border border-[#354a5c] bg-[#122839] px-2.5 py-0.5 text-xs text-slate-200">
                  {a}
                  <button type="button" className="text-slate-500 hover:text-red-300" aria-label={`Remove ${a}`} onClick={() => setAliases(aliases.filter((x) => x !== a))}>✕</button>
                </span>
              ))}
              {aliases.length === 0 ? <span className="text-xs text-slate-500">None yet.</span> : null}
            </div>
            <div className="flex gap-2">
              <input
                className={field}
                placeholder='e.g. "Chicken"'
                value={aliasInput}
                maxLength={60}
                onChange={(e) => setAliasInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAlias(); } }}
              />
              <button type="button" className={IH.secondaryBtn} onClick={addAlias} disabled={!aliasInput.trim()}>Add</button>
            </div>
            <span className="block text-xs text-slate-500">
              Other words that mean this cuisine. A restaurant tagged with one of these still matches this cuisine's kits.
            </span>
          </div>

          <label className="block space-y-1.5">
            <span className={sectionTitle}>Icon image link (optional)</span>
            <div className="flex items-center gap-3">
              {iconUrl.trim().startsWith('https://') ? (
                <img src={iconUrl.trim()} alt="" className="h-10 w-10 shrink-0 rounded border border-[#354a5c] object-cover" />
              ) : null}
              <input className={field} placeholder="https://…" value={iconUrl} onChange={(e) => setIconUrl(e.target.value)} />
            </div>
            <span className="block text-xs text-slate-500">For a cuisine chip in the customer app. Must start with https://.</span>
          </label>

          <div className="space-y-2">
            <span className={sectionTitle}>Used by</span>
            <div className="rounded border border-[#354a5c]/60 bg-[#071520]">
              <div className="border-b border-[#354a5c]/50 px-3 py-2 text-xs font-medium text-slate-300">
                {restaurants.length} restaurant{restaurants.length === 1 ? '' : 's'}
              </div>
              {restaurants.length ? (
                <ul className="max-h-40 divide-y divide-[#354a5c]/40 overflow-y-auto">
                  {restaurants.map((r) => (
                    <li key={r.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                      <span className="text-slate-200">{r.name}</span>
                      {r.primary ? <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">first cuisine</span> : null}
                    </li>
                  ))}
                </ul>
              ) : <p className="px-3 py-2 text-xs text-slate-500">No restaurants yet. Pick it in a restaurant's 1. Basics.</p>}
              <div className="border-y border-[#354a5c]/50 px-3 py-2 text-xs font-medium text-slate-300">
                {linkedKits.length} starter kit{linkedKits.length === 1 ? '' : 's'}
              </div>
              {linkedKits.length ? (
                <ul className="divide-y divide-[#354a5c]/40">
                  {linkedKits.map((k) => (
                    <li key={k.id} className="px-3 py-1.5 text-xs text-slate-200">
                      {k.name}{k.archivedAt ? <span className="ml-1 text-slate-500">(archived)</span> : null}
                      <span className="block text-slate-500">{k.payload.sections.map((s) => s.name).join(' · ')}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="px-3 py-2 text-xs text-slate-500">No kits. Link one from the Starter kits tab.</p>}
              <div className="border-t border-[#354a5c]/50 px-3 py-2 text-xs text-slate-400">
                {templateCount} dish template{templateCount === 1 ? '' : 's'} suggested for it
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded border border-red-900/40 bg-red-950/10 p-3">
            <span className={sectionTitle}>Remove or combine</span>
            {cuisine.archivedAt ? (
              <button type="button" className={IH.secondaryBtn} disabled={busy}
                onClick={() => void run(() => updateCuisine(token, cuisine.id, { archived: false }), `${cuisine.label} restored`)}>
                Restore
              </button>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <select className={`${field} w-auto flex-1`} value={mergeInto} onChange={(e) => setMergeInto(e.target.value)}>
                    <option value="">Merge into another cuisine…</option>
                    {cuisines.filter((o) => o.id !== cuisine.id && !o.archivedAt).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                  <button type="button" className={IH.secondaryBtn} disabled={busy || !mergeInto}
                    onClick={() => {
                      const into = cuisines.find((o) => o.id === mergeInto);
                      if (!into) return;
                      void confirm({
                        title: `Merge "${cuisine.label}" into "${into.label}"?`,
                        description: `Every restaurant, kit and template with ${cuisine.label} switches to ${into.label}, and ${cuisine.label} is removed. Searches for "${cuisine.label}" still find ${into.label}.`,
                        confirmLabel: 'Merge',
                        variant: 'danger',
                      }).then((ok) => (ok ? run(() => mergeCuisine(token, cuisine.id, into.id), `Merged into ${into.label}`, true) : undefined));
                    }}>
                    Merge
                  </button>
                </div>
                <p className="text-xs text-slate-500">Merge moves everything to the other cuisine. Use it for duplicates.</p>
                <button
                  type="button"
                  className="rounded border border-red-900/50 bg-red-950/30 px-3 py-1.5 text-sm text-red-200 hover:bg-red-950/50"
                  disabled={busy}
                  onClick={() => {
                    if (used) {
                      void confirm({
                        title: `Archive "${cuisine.label}"?`,
                        description: 'It\'s in use, so it can\'t be deleted. Archiving hides it from the pickers; restaurants that have it keep it.',
                        confirmLabel: 'Archive',
                      }).then((ok) => (ok ? run(() => updateCuisine(token, cuisine.id, { archived: true }), `${cuisine.label} archived`, true) : undefined));
                      return;
                    }
                    void confirm({
                      title: `Delete "${cuisine.label}"?`,
                      description: 'Nothing uses it. This removes it for good.',
                      confirmLabel: 'Delete',
                      variant: 'danger',
                    }).then((ok) => (ok ? run(() => deleteCuisine(token, cuisine.id), `${cuisine.label} deleted`, true) : undefined));
                  }}
                >
                  {used ? 'Archive cuisine' : 'Delete cuisine'}
                </button>
              </>
            )}
          </div>
        </form>

        <footer className="flex items-center justify-end gap-2 border-t border-[#354a5c] px-5 py-3">
          <button type="button" className={IH.secondaryBtn} onClick={onClose}>Cancel</button>
          <button type="button" className={IH.primaryBtn} disabled={busy || !dirty || !label.trim()} onClick={save}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </footer>
      </aside>
    </div>
  );
}

function CuisinesTab({
  token,
  cuisines,
  kits,
  kitCount,
  isAdmin,
  reload,
}: {
  token: string;
  cuisines: LibraryCuisine[];
  kits: LibraryKit[];
  kitCount: number;
  isAdmin: boolean;
  reload: () => Promise<void>;
}) {
  const { confirm } = useAdminConfirm();
  const [editId, setEditId] = useState<string | null>(null);
  const editCuisine = editId ? cuisines.find((c) => c.id === editId) || null : null;
  const [newLabel, setNewLabel] = useState('');
  const [newTag, setNewTag] = useState<string>(MARKET_TAGS[0]);
  const [tags, setTags] = useState<Record<string, string>>(() => readCuisineTags());
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(null);
  const [merging, setMerging] = useState<{ id: string; intoId: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);

  const visible = cuisines.filter((c) => showArchived || !c.archivedAt);
  const archivedCount = cuisines.filter((c) => c.archivedAt).length;

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      await reload();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  function usageText(c: LibraryCuisine) {
    const u = c.usage;
    if (!u) return '';
    const parts = [
      u.restaurants ? `${u.restaurants} restaurant${u.restaurants === 1 ? '' : 's'}` : '',
      u.kits ? `${u.kits} kit${u.kits === 1 ? '' : 's'}` : '',
      u.templates ? `${u.templates} template${u.templates === 1 ? '' : 's'}` : '',
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'Not used';
  }

  async function remove(c: LibraryCuisine) {
    const used = (c.usage?.restaurants || 0) + (c.usage?.kits || 0) + (c.usage?.templates || 0);
    if (used) {
      const ok = await confirm({
        title: `Archive "${c.label}"?`,
        description: `It's used by ${usageText(c)}, so it can't be deleted. Archiving hides it from the pickers; restaurants that have it keep it. To move them to another cuisine, use Merge instead.`,
        confirmLabel: 'Archive',
      });
      if (ok) await run(() => updateCuisine(token, c.id, { archived: true }), `${c.label} archived`);
      return;
    }
    const ok = await confirm({
      title: `Delete "${c.label}"?`,
      description: 'Nothing uses it. This removes it for good.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (ok) await run(() => deleteCuisine(token, c.id), `${c.label} deleted`);
  }

  async function merge() {
    if (!merging?.intoId) return;
    const from = cuisines.find((c) => c.id === merging.id);
    const into = cuisines.find((c) => c.id === merging.intoId);
    if (!from || !into) return;
    const ok = await confirm({
      title: `Merge "${from.label}" into "${into.label}"?`,
      description: `Every restaurant, kit and template with ${from.label} switches to ${into.label}, and ${from.label} is removed. Searches for "${from.label}" still find ${into.label}.`,
      confirmLabel: 'Merge',
      variant: 'danger',
    });
    if (!ok) return;
    await run(() => mergeCuisine(token, from.id, into.id), `Merged into ${into.label}`);
    setMerging(null);
  }

  const totalActive = cuisines.filter((c) => !c.archivedAt).length;
  const activeCount = cuisines.filter((c) => !c.archivedAt && ((c.usage?.restaurants || 0) + (c.usage?.kits || 0) > 0)).length;
  const unusedCount = cuisines.filter((c) => !c.archivedAt && !(c.usage?.restaurants || c.usage?.kits || c.usage?.templates)).length;

  function marketTag(c: LibraryCuisine) {
    return tags[c.id] || 'Main Entrée & Specialist';
  }

  async function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= visible.length) return;
    const a = visible[index];
    const b = visible[target];
    await run(async () => {
      await updateCuisine(token, a.id, { sort: b.sort });
      await updateCuisine(token, b.id, { sort: a.sort === b.sort ? a.sort + 1 : a.sort });
    }, 'Order saved');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded border border-[#354a5c]/70 bg-[#071520] p-3.5 text-xs">
        <span className="mt-0.5 text-base text-[#22d3ee]">ℹ</span>
        <p className="leading-relaxed text-slate-400">
          <span className="font-semibold text-slate-100">Cuisine Hierarchy Logic:</span>{' '}
          Cuisines label restaurants for marketplace search and discovery, and determine which starter kits and dish taxonomy rules are offered during onboarding.
        </p>
      </div>

      {isAdmin ? (
        <form
          className="flex flex-col items-stretch justify-between gap-3 rounded-lg border border-[#354a5c] bg-[#0a1b28] p-4 shadow-sm md:flex-row md:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            const label = newLabel.trim();
            if (!label) return;
            void run(async () => {
              const result = await createCuisine(token, label);
              writeCuisineTag(result.id, newTag);
              setTags(readCuisineTags());
            }, `${label} added`).then(() => setNewLabel(''));
          }}
        >
          <div className="flex flex-1 flex-col items-stretch gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Add Cuisine Definition</label>
              <input
                className="w-full rounded border border-[#354a5c] bg-[#060f17] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-[#22d3ee] focus:outline-none"
                placeholder="New cuisine, e.g. Soup, Wood-fired Pizza, Artisanal Bakery"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                maxLength={60}
              />
            </div>
            <div className="w-full sm:w-56">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Marketplace Tag</label>
              <select
                className="w-full rounded border border-[#354a5c] bg-[#060f17] px-3 py-2 text-xs text-slate-100 focus:border-[#22d3ee] focus:outline-none"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
              >
                {MARKET_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={busy || !newLabel.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:from-blue-500 hover:to-cyan-400 disabled:opacity-40"
          >
            + Add cuisine
          </button>
        </form>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total Cuisines', value: String(totalActive), icon: '▦', iconClass: 'text-[#22d3ee]' },
          { label: 'Active in Menus', value: String(activeCount), icon: '✓', iconClass: 'text-emerald-400' },
          { label: 'Unused / Draft', value: String(unusedCount), icon: '◻', iconClass: 'text-slate-400' },
          { label: 'Starter Kits Linked', value: String(kitCount), icon: '⧉', iconClass: 'text-[#a4c9ff]' },
        ].map((m) => (
          <div key={m.label} className="flex items-center justify-between rounded border border-[#354a5c] bg-[#0a1b28] p-3">
            <div>
              <span className="text-[11px] font-semibold uppercase text-slate-400">{m.label}</span>
              <div className="text-lg font-bold text-white">{m.value}</div>
            </div>
            <div className={`rounded bg-[#122839] p-2 text-sm ${m.iconClass}`}>{m.icon}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col overflow-hidden rounded-lg border border-[#354a5c] bg-[#0a1b28] shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#354a5c] bg-[#071520] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="w-8 px-3 py-2.5 text-center" />
                <th className="px-4 py-2.5">Cuisine Name & Slug</th>
                <th className="px-4 py-2.5">Marketplace Tag</th>
                <th className="px-4 py-2.5">Linked Restaurants & Kits</th>
                <th className="px-4 py-2.5">Item Count</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#354a5c]/50">
              {visible.map((c, index) => {
                const unused = usageText(c) === 'Not used';
                const templates = c.usage?.templates || 0;
                return (
                  <tr key={c.id} className="group transition-colors hover:bg-[#0f212f]/60">
                    <td className="cursor-grab px-3 py-2.5 text-center text-slate-600 group-hover:text-slate-400">⋮⋮</td>
                    <td className="px-4 py-2.5">
                      {editing?.id === c.id ? (
                        <form
                          className="flex flex-wrap gap-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const label = editing.label.trim();
                            if (!label || label === c.label) { setEditing(null); return; }
                            void run(() => updateCuisine(token, c.id, { label }), `Renamed to ${label}`).then(() => setEditing(null));
                          }}
                        >
                          <input className={`${IH.input} min-w-[12rem] flex-1 py-1`} value={editing.label} onChange={(e) => setEditing({ id: c.id, label: e.target.value })} autoFocus maxLength={60} />
                          <button type="submit" className={IH.primaryBtn} disabled={busy}>Save</button>
                          <button type="button" className={IH.secondaryBtn} onClick={() => setEditing(null)}>Cancel</button>
                        </form>
                      ) : (
                        <div>
                          <div className={`flex items-center gap-2 text-sm font-medium ${c.archivedAt ? 'text-slate-500 line-through' : 'text-slate-100'}`}>
                            <span>{c.label}</span>
                            {unused && !c.archivedAt ? (
                              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-normal text-slate-400">Draft</span>
                            ) : null}
                            {c.archivedAt ? <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-normal text-slate-400">Archived</span> : null}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">{c.id}</div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        className="rounded border border-[#003c70] bg-[#003c70]/60 px-2 py-0.5 text-[11px] text-[#a4c9ff]"
                        value={marketTag(c)}
                        disabled={!isAdmin}
                        onChange={(e) => {
                          writeCuisineTag(c.id, e.target.value);
                          setTags(readCuisineTags());
                        }}
                      >
                        {MARKET_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      {unused ? (
                        <span className="text-slate-400">Not used</span>
                      ) : (
                        <>
                          <span className="font-medium text-slate-100">{c.usage?.restaurants || 0} restaurant{(c.usage?.restaurants || 0) === 1 ? '' : 's'}</span>
                          <span className="text-slate-400"> · {c.usage?.kits || 0} kit{(c.usage?.kits || 0) === 1 ? '' : 's'}</span>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-slate-100">{templates}</span>{' '}
                      <span className="text-slate-400">template{templates === 1 ? '' : 's'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {merging?.id === c.id ? (
                        <div className="inline-flex flex-wrap items-center justify-end gap-2">
                          <span className="text-slate-400">Merge into</span>
                          <select className={`${IH.input} py-1 text-xs`} value={merging.intoId} onChange={(e) => setMerging({ id: c.id, intoId: e.target.value })}>
                            <option value="">Pick a cuisine…</option>
                            {cuisines.filter((o) => o.id !== c.id && !o.archivedAt).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                          </select>
                          <button type="button" className={IH.primaryBtn} disabled={busy || !merging.intoId} onClick={() => void merge()}>Merge</button>
                          <button type="button" className={IH.secondaryBtn} onClick={() => setMerging(null)}>Cancel</button>
                        </div>
                      ) : isAdmin && editing?.id !== c.id ? (
                        <div className="inline-flex items-center justify-end gap-1">
                          {!c.archivedAt ? (
                            <>
                              <button type="button" className="rounded p-1 text-slate-400 hover:bg-[#122839] hover:text-slate-100" disabled={busy || index === 0} title="Move up" onClick={() => void move(index, -1)}>↑</button>
                              <button type="button" className="rounded p-1 text-slate-400 hover:bg-[#122839] hover:text-slate-100" disabled={busy || index >= visible.length - 1} title="Move down" onClick={() => void move(index, 1)}>↓</button>
                              <button type="button" className="rounded bg-amber-500/15 px-2 py-1 font-semibold text-amber-300 ring-1 ring-amber-500/40 hover:bg-amber-500/25" onClick={() => setEditId(c.id)}>Edit</button>
                              <button type="button" className="rounded px-2 py-1 text-slate-100 hover:bg-[#122839]" onClick={() => setEditing({ id: c.id, label: c.label })}>Rename</button>
                              <button type="button" className="rounded px-2 py-1 text-slate-100 hover:bg-[#122839]" onClick={() => setMerging({ id: c.id, intoId: '' })}>Merge</button>
                              <button
                                type="button"
                                className={`rounded px-2 py-1 hover:bg-[#122839] ${unused ? 'text-red-300 hover:text-red-200' : 'text-slate-400 hover:text-slate-100'}`}
                                onClick={() => void remove(c)}
                              >
                                {unused ? 'Delete' : 'Archive'}
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="rounded px-2 py-1 text-slate-100 hover:bg-[#122839]" onClick={() => setEditId(c.id)}>Edit</button>
                              <button type="button" className={IH.secondaryBtn} disabled={busy} onClick={() => void run(() => updateCuisine(token, c.id, { archived: false }), `${c.label} restored`)}>
                                Restore
                              </button>
                            </>
                          )}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visible.length === 0 ? <p className="px-4 py-8 text-sm text-slate-500">No cuisines yet.</p> : null}
        {editCuisine ? (
          <CuisineEditDrawer
            key={editCuisine.id}
            token={token}
            cuisine={editCuisine}
            cuisines={cuisines}
            kits={kits}
            onClose={() => setEditId(null)}
            reload={reload}
          />
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#354a5c] bg-[#071520]/60 px-4 py-2.5 text-[11px] text-slate-500">
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#22d3ee]" />
            Showing {visible.length} of {cuisines.length} cuisines · Batch reorder enabled
          </span>
          <span>Changes sync across In-House restaurant builder in real time.</span>
          {archivedCount ? (
            <button type="button" className={IH.link} onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? 'Hide archived' : `Show ${archivedCount} archived`}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---- Starter kits -------------------------------------------------------------

type KitDraft = { id?: string; name: string; cuisineIds: string[]; sort: number; payload: LibraryKitPayload };

function KitsTab({
  token,
  cuisines,
  kits,
  templates,
  isAdmin,
  reload,
}: {
  token: string;
  cuisines: LibraryCuisine[];
  kits: LibraryKit[];
  templates: DishTemplate[];
  isAdmin: boolean;
  reload: () => Promise<void>;
}) {
  const { confirm } = useAdminConfirm();
  const [draft, setDraft] = useState<KitDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const cuisineLabel = new Map(cuisines.map((c) => [c.id, c.label]));
  const activeTemplates = templates.filter((t) => !t.archivedAt);
  const visible = kits.filter((k) => showArchived || !k.archivedAt);

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      await reload();
      return true;
    } catch (error) {
      toast.error(errorText(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function patchSection(index: number, patch: Partial<LibraryKitPayload['sections'][0]>) {
    if (!draft) return;
    setDraft({
      ...draft,
      payload: { ...draft.payload, sections: draft.payload.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)) },
    });
  }

  function moveSection(index: number, delta: number) {
    if (!draft) return;
    const sections = [...draft.payload.sections];
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    setDraft({ ...draft, payload: { ...draft.payload, sections } });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-slate-400">
          A starter kit is a ready-made set of menu sections. When you build a menu, restaurants are offered the kits
          that share one of their cuisines. Kits are copied in once, so changing a kit never changes an existing menu.
        </p>
        {isAdmin ? (
          <button type="button" className={IH.primaryBtn} onClick={() => setDraft({ name: '', cuisineIds: [], sort: 0, payload: { sections: [{ name: '', sectionType: 'standard' }] } })}>
            + New kit
          </button>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((kit) => (
          <div key={kit.id} className={`${IH.surface} space-y-2 p-3 ${kit.archivedAt ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-slate-100">{kit.name}</div>
                <div className="text-xs text-slate-500">
                  {kit.cuisineIds.length ? kit.cuisineIds.map((id) => cuisineLabel.get(id) || id).join(', ') : <span className="text-amber-400">No cuisine — never offered</span>}
                </div>
              </div>
              {kit.archivedAt ? <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">Archived</span> : null}
            </div>
            <ul className="space-y-0.5 text-xs text-slate-300">
              {kit.payload.sections.map((s, i) => (
                <li key={i}>
                  {s.name} <span className="text-slate-500">· {TYPE_LABEL.get(s.sectionType as ProductType) || s.sectionType}</span>
                  {s.products?.length ? <span className="text-slate-500"> · {s.products.length} starter dish{s.products.length === 1 ? '' : 'es'}</span> : null}
                </li>
              ))}
            </ul>
            {isAdmin ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button type="button" className={IH.secondaryBtn} onClick={() => setDraft({ id: kit.id, name: kit.name, cuisineIds: kit.cuisineIds, sort: kit.sort, payload: structuredClone(kit.payload) })}>Edit</button>
                <button type="button" className={IH.secondaryBtn} onClick={() => setDraft({ name: `${kit.name} (copy)`, cuisineIds: kit.cuisineIds, sort: kit.sort, payload: structuredClone(kit.payload) })}>Duplicate</button>
                <button type="button" className={IH.secondaryBtn} disabled={busy}
                  onClick={() => void run(() => setKitArchived(token, kit.id, !kit.archivedAt), kit.archivedAt ? 'Kit restored' : 'Kit archived')}>
                  {kit.archivedAt ? 'Restore' : 'Archive'}
                </button>
                <button type="button" className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-1.5 text-sm text-red-200 hover:bg-red-950/50" disabled={busy}
                  onClick={() => void confirm({
                    title: `Delete "${kit.name}"?`,
                    description: 'Menus already built from it are not affected.',
                    confirmLabel: 'Delete',
                    variant: 'danger',
                  }).then((ok) => (ok ? run(() => deleteKit(token, kit.id), 'Kit deleted') : undefined))}>
                  Delete
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {kits.some((k) => k.archivedAt) ? (
        <button type="button" className={`text-xs ${IH.link}`} onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? 'Hide archived' : 'Show archived'}
        </button>
      ) : null}

      <EntityDrawer open={Boolean(draft)} title={draft?.id ? 'Edit kit' : 'New kit'} onClose={() => setDraft(null)}>
        {draft ? (
          <form
            className="space-y-4 text-sm text-slate-200"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => saveKit(token, { name: draft.name, cuisineIds: draft.cuisineIds, sort: draft.sort, payload: draft.payload }, draft.id), draft.id ? 'Kit saved' : 'Kit created')
                .then((ok) => { if (ok) setDraft(null); });
            }}
          >
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">Kit name</span>
              <input className={`${IH.input} w-full`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Soup shop" maxLength={80} required />
            </label>
            <div className="space-y-1">
              <span className="text-xs text-slate-400">Offered to restaurants with these cuisines</span>
              <CuisinePicker cuisines={cuisines} value={draft.cuisineIds} onChange={(cuisineIds) => setDraft({ ...draft, cuisineIds })} />
            </div>
            <div className="space-y-2">
              <span className="text-xs text-slate-400">Sections (in menu order)</span>
              {draft.payload.sections.map((section, index) => (
                <div key={index} className="space-y-2 rounded-lg border border-slate-700 p-2">
                  <div className="flex gap-1.5">
                    <input className={`${IH.input} min-w-0 flex-1 py-1`} value={section.name} placeholder="Section name" onChange={(e) => patchSection(index, { name: e.target.value })} required />
                    <select className={`${IH.input} py-1 text-xs`} value={section.sectionType}
                      onChange={(e) => patchSection(index, {
                        sectionType: e.target.value,
                        products: (section.products || []).map((p) => ({ ...p, type: e.target.value, templateId: undefined })),
                      })}>
                      {PRODUCT_TYPE_INFO.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </div>
                  <p className="text-[11px] leading-snug text-slate-400">{productTypeHint(section.sectionType)}</p>
                  {(section.products || []).map((p, pi) => (
                    <div key={pi} className="flex gap-1.5 pl-3">
                      <input className={`${IH.input} min-w-0 flex-1 py-1 text-xs`} value={p.name} placeholder="Starter dish name"
                        onChange={(e) => patchSection(index, { products: section.products!.map((x, xi) => (xi === pi ? { ...x, name: e.target.value } : x)) })} required />
                      <select className={`${IH.input} max-w-[9rem] py-1 text-xs`} value={p.templateId || ''}
                        onChange={(e) => patchSection(index, { products: section.products!.map((x, xi) => (xi === pi ? { ...x, templateId: e.target.value || undefined } : x)) })}>
                        <option value="">Blank dish</option>
                        {activeTemplates.filter((t) => t.productType === section.sectionType).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      <button type="button" className="px-1 text-xs text-slate-500 hover:text-red-300"
                        onClick={() => patchSection(index, { products: section.products!.filter((_, xi) => xi !== pi) })}>✕</button>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button type="button" className={IH.link}
                      onClick={() => patchSection(index, { products: [...(section.products || []), { name: '', type: section.sectionType }] })}>
                      + Starter dish
                    </button>
                    <span className="flex-1" />
                    <button type="button" className="text-slate-400 hover:text-slate-200" disabled={index === 0} onClick={() => moveSection(index, -1)}>↑</button>
                    <button type="button" className="text-slate-400 hover:text-slate-200" disabled={index === draft.payload.sections.length - 1} onClick={() => moveSection(index, 1)}>↓</button>
                    <button type="button" className="text-slate-400 hover:text-red-300" disabled={draft.payload.sections.length === 1}
                      onClick={() => setDraft({ ...draft, payload: { ...draft.payload, sections: draft.payload.sections.filter((_, i) => i !== index) } })}>
                      Remove section
                    </button>
                  </div>
                </div>
              ))}
              <button type="button" className={`text-xs ${IH.link}`}
                onClick={() => setDraft({ ...draft, payload: { ...draft.payload, sections: [...draft.payload.sections, { name: '', sectionType: 'standard' }] } })}>
                + Add section
              </button>
            </div>
            {!draft.cuisineIds.length ? <p className="text-xs text-amber-400">Pick at least one cuisine, or no restaurant will be offered this kit.</p> : null}
            <div className="flex gap-2">
              <button type="submit" className={IH.primaryBtn} disabled={busy || !draft.name.trim() || !draft.cuisineIds.length}>Save kit</button>
              <button type="button" className={IH.secondaryBtn} onClick={() => setDraft(null)}>Cancel</button>
            </div>
          </form>
        ) : null}
      </EntityDrawer>
    </div>
  );
}

// ---- Dish templates -------------------------------------------------------------

type TemplateDraft = {
  id?: string;
  name: string;
  description: string;
  cuisineIds: string[];
  snapshot: MenuSnapshot;
};

function TemplatesTab({
  token,
  cuisines,
  templates,
  kits,
  isAdmin,
  reload,
}: {
  token: string;
  cuisines: LibraryCuisine[];
  templates: DishTemplate[];
  kits: LibraryKit[];
  isAdmin: boolean;
  reload: () => Promise<void>;
}) {
  const { confirm } = useAdminConfirm();
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [newType, setNewType] = useState<ProductType>('standard');
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [typeFilter, setTypeFilter] = useState<ProductType | ''>('');
  const cuisineLabel = new Map(cuisines.map((c) => [c.id, c.label]));
  const visible = templates.filter((t) => (showArchived || !t.archivedAt) && (!typeFilter || t.productType === typeFilter));

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      await reload();
      return true;
    } catch (error) {
      toast.error(errorText(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function open(template?: DishTemplate, copy = false) {
    if (template) {
      setDraft({
        id: copy ? undefined : template.id,
        name: copy ? `${template.name} (copy)` : template.name,
        description: template.description || '',
        cuisineIds: template.cuisineIds,
        snapshot: templateToSnapshot(structuredClone(template.payload)),
      });
      return;
    }
    setDraft({ name: '', description: '', cuisineIds: [], snapshot: templateToSnapshot(blankTemplatePayload(newType)) });
  }

  function save() {
    if (!draft) return;
    const product = draft.snapshot.products[0];
    if (!product) return;
    const snapshot = { ...draft.snapshot, products: [{ ...product, name: product.name || draft.name }] };
    const payload = snapshotToTemplate(snapshot);
    void run(() => saveDishTemplate(token, {
      name: draft.name,
      description: draft.description || null,
      productType: payload.product.type,
      cuisineIds: draft.cuisineIds,
      payload,
    }, draft.id), draft.id ? 'Template saved' : 'Template created').then((ok) => { if (ok) setDraft(null); });
  }

  const product = draft?.snapshot.products[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-slate-400">
          A dish template is a product type with its choices already filled in, such as a "Jamaican plate" with
          plate sizes, two sides and gravy. In the menu builder, "Add dish" can start from a template. The dish is a
          copy, so editing a template never re-prices a live menu.
        </p>
        {isAdmin ? (
          <div className="flex items-center gap-2">
            <select className={`${IH.input} py-1.5 text-xs`} value={newType} onChange={(e) => setNewType(e.target.value as ProductType)} aria-label="Type for new template">
              {PRODUCT_TYPE_INFO.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <button type="button" className={IH.primaryBtn} onClick={() => open()}>+ New template</button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={!typeFilter ? IH.chipActive : IH.chip} onClick={() => setTypeFilter('')}>All</button>
        {PRODUCT_TYPE_INFO.map((t) => (
          <button key={t.id} type="button" className={typeFilter === t.id ? IH.chipActive : IH.chip} onClick={() => setTypeFilter(t.id)}>{t.label}</button>
        ))}
      </div>

      <div className={`${IH.surface} divide-y divide-slate-700/60`}>
        {visible.map((t) => (
          <div key={t.id} className={`flex flex-wrap items-center gap-3 px-3 py-2.5 ${t.archivedAt ? 'opacity-60' : ''}`}>
            <div className="min-w-[12rem] flex-1">
              <div className="text-sm font-medium text-slate-100">
                {t.name}
                <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">{TYPE_LABEL.get(t.productType) || t.productType}</span>
                {t.archivedAt ? <span className="ml-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">Archived</span> : null}
              </div>
              <div className="text-xs text-slate-500">
                {t.payload.groups.length} choice group{t.payload.groups.length === 1 ? '' : 's'}
                {t.cuisineIds.length ? ` · ${t.cuisineIds.map((id) => cuisineLabel.get(id) || id).join(', ')}` : ' · any cuisine'}
                {t.description ? ` · ${t.description}` : ''}
              </div>
            </div>
            {isAdmin ? (
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className={IH.secondaryBtn} onClick={() => open(t)}>Edit</button>
                <button type="button" className={IH.secondaryBtn} onClick={() => open(t, true)}>Duplicate</button>
                <button type="button" className={IH.secondaryBtn} disabled={busy}
                  onClick={() => void run(() => setDishTemplateArchived(token, t.id, !t.archivedAt), t.archivedAt ? 'Template restored' : 'Template archived')}>
                  {t.archivedAt ? 'Restore' : 'Archive'}
                </button>
                <button type="button" className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-1.5 text-sm text-red-200 hover:bg-red-950/50" disabled={busy}
                  onClick={() => {
                    const usedBy = kits.filter((k) => k.payload.sections.some((s) => (s.products || []).some((p) => p.templateId === t.id)));
                    if (usedBy.length) {
                      toast.error(`Used by kit: ${usedBy.map((k) => k.name).join(', ')}. Remove it there or archive it instead.`);
                      return;
                    }
                    void confirm({
                      title: `Delete "${t.name}"?`,
                      description: 'Dishes already made from it are copies and stay as they are.',
                      confirmLabel: 'Delete',
                      variant: 'danger',
                    }).then((ok) => (ok ? run(() => deleteDishTemplate(token, t.id), 'Template deleted') : undefined));
                  }}>
                  Delete
                </button>
              </div>
            ) : null}
          </div>
        ))}
        {visible.length === 0 ? (
          <p className="px-3 py-6 text-sm text-slate-500">
            No templates yet. Pick a type and press "New template" to make your first one.
          </p>
        ) : null}
      </div>
      {templates.some((t) => t.archivedAt) ? (
        <button type="button" className={`text-xs ${IH.link}`} onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? 'Hide archived' : 'Show archived'}
        </button>
      ) : null}

      {draft && product ? (
        <div className="fixed inset-0 z-40 flex justify-end">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close" onClick={() => setDraft(null)} />
          <aside className="relative h-full w-full max-w-3xl overflow-auto border-l border-slate-800 bg-slate-950 p-5 text-sm text-slate-200">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-100">{draft.id ? 'Edit dish template' : 'New dish template'}</h2>
              <button type="button" onClick={() => setDraft(null)} className="text-sm text-slate-400 hover:text-white">Close</button>
            </div>
            <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save(); }}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs text-slate-400">Template name (shown in "Add dish")</span>
                  <input className={`${IH.input} w-full`} value={draft.name} maxLength={80} required placeholder="e.g. Jamaican plate"
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-slate-400">Default dish name</span>
                  <input className={`${IH.input} w-full`} value={product.name} placeholder="e.g. Oxtail plate"
                    onChange={(e) => setDraft({ ...draft, snapshot: { ...draft.snapshot, products: [{ ...product, name: e.target.value }] } })} />
                </label>
                <label className="block space-y-1 sm:col-span-2">
                  <span className="text-xs text-slate-400">Note for the team (optional)</span>
                  <input className={`${IH.input} w-full`} value={draft.description} placeholder="When to use it"
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-slate-400">Starting price (J$)</span>
                  <input className={`${IH.input} w-full`} type="number" min={0} step="0.01" value={product.basePrice}
                    onChange={(e) => setDraft({ ...draft, snapshot: { ...draft.snapshot, products: [{ ...product, basePrice: Number(e.target.value) || 0 }] } })} />
                </label>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-slate-400">Suggest for these cuisines (leave empty for all)</span>
                <CuisinePicker cuisines={cuisines} value={draft.cuisineIds} onChange={(cuisineIds) => setDraft({ ...draft, cuisineIds })} />
              </div>
              <div className="ih-type-editor rounded-lg border border-slate-700 bg-slate-100 p-3 text-[#0f172a]">
                <ProductTypeEditor
                  snapshot={draft.snapshot}
                  productId={product.id}
                  onChange={(snapshot) => setDraft({ ...draft, snapshot })}
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" className={IH.primaryBtn} disabled={busy || !draft.name.trim()}>Save template</button>
                <button type="button" className={IH.secondaryBtn} onClick={() => setDraft(null)}>Cancel</button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

// ---- Product types (reference) ------------------------------------------------------

function ProductTypesTab({ templates }: { templates: DishTemplate[] }) {
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-slate-400">
        Product types are how a dish <em>behaves</em>: how checkout prices it, which editor opens, what the customer
        sees and what prints on the buyer's ticket. They are built into the menu engine, so they can't be added from
        a screen. To make a new <em>kind</em> of dish, make a <strong>dish template</strong> on one of these. A brand-new
        behaviour (for example, sold by weight) is an engineering change.
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {PRODUCT_TYPE_INFO.map((t) => {
          const count = templates.filter((x) => x.productType === t.id && !x.archivedAt).length;
          return (
            <div key={t.id} className={`${IH.surface} space-y-1.5 p-3`}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-100">{t.label}</span>
                <span className="font-mono text-[10px] text-slate-500">{t.id}</span>
              </div>
              <p className="text-sm text-slate-300">{t.summary}</p>
              <p className="text-xs text-slate-500"><span className="text-slate-400">Examples:</span> {t.example}</p>
              <p className="text-xs text-slate-500"><span className="text-slate-400">Pricing:</span> {t.pricing}</p>
              <p className="text-xs text-slate-500">{count} template{count === 1 ? '' : 's'}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Page -----------------------------------------------------------------------

export function MenuLibraryPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const token = session.access_token;
  const isAdmin = getJwtRoles(session.user).some((role) => DESK_ADMIN.has(role)) || DESK_ADMIN.has(jwtPrimaryRole(session.user));
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const saved = localStorage.getItem('roam.menuLibrary.tab');
      return TABS.some((t) => t.id === saved) ? saved as Tab : 'cuisines';
    } catch {
      return 'cuisines';
    }
  });
  const [cuisines, setCuisines] = useState<LibraryCuisine[]>([]);
  const [kits, setKits] = useState<LibraryKit[]>([]);
  const [templates, setTemplates] = useState<DishTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function reload() {
    try {
      const data = await getMenuLibrary(token);
      setCuisines(data.cuisines);
      setKits(data.kits);
      setTemplates(data.templates);
      setError('');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, [token]);
  useEffect(() => {
    try { localStorage.setItem('roam.menuLibrary.tab', tab); } catch { /* storage blocked */ }
  }, [tab]);

  const counts = useMemo(() => ({
    cuisines: cuisines.filter((c) => !c.archivedAt).length,
    kits: kits.filter((k) => !k.archivedAt).length,
    templates: templates.filter((t) => !t.archivedAt).length,
    types: PRODUCT_TYPE_INFO.length,
  }), [cuisines, kits, templates]);

  const [search, setSearch] = useState('');

  function exportTaxonomy() {
    const rows = [
      ['id', 'label', 'slug', 'restaurants', 'kits', 'templates', 'archived'],
      ...cuisines.map((c) => [
        c.id,
        c.label,
        c.id,
        String(c.usage?.restaurants || 0),
        String(c.usage?.kits || 0),
        String(c.usage?.templates || 0),
        c.archivedAt ? 'yes' : 'no',
      ]),
    ];
    const blob = new Blob([rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'menu-library-cuisines.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 text-[#d2e8ff]">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Menu library</h2>
          <p className="mt-0.5 text-sm text-slate-400">The building blocks every restaurant menu is made from.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="w-72 rounded border border-[#354a5c] bg-[#122839] px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-[#22d3ee] focus:outline-none"
            placeholder="Search cuisines, starter kits..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded border border-[#354a5c] bg-[#0a1b28] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-[#122839]"
            onClick={() => toast.message('Changelog coming soon — exports cover today’s taxonomy.')}
          >
            Audit Changelog
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded border border-[#354a5c] bg-[#0a1b28] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-[#122839]"
            onClick={exportTaxonomy}
          >
            Export Taxonomy
          </button>
        </div>
      </div>

      <nav className="flex flex-wrap items-center gap-2 border-b border-[#354a5c]/60 pb-3">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs transition ${
                active
                  ? 'border-[#22d3ee]/30 bg-[#22d3ee]/10 font-semibold text-[#22d3ee] shadow-sm'
                  : 'border-[#354a5c]/70 bg-[#0a1b28] font-medium text-slate-400 hover:bg-[#122839] hover:text-slate-200'
              }`}
              onClick={() => setTab(t.id)}
            >
              <span>{t.label}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? 'bg-[#22d3ee]/20 text-[#22d3ee]' : 'bg-[#122839] text-slate-400'}`}>
                {counts[t.id]}
              </span>
            </button>
          );
        })}
      </nav>

      {!isAdmin ? <p className="text-xs text-slate-500">View only. Desk admins can make changes.</p> : null}
      {error ? (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
          {error} <button type="button" className="ml-2 underline" onClick={() => void reload()}>Retry</button>
        </div>
      ) : null}
      {loading ? <p className="text-sm text-slate-500">Loading…</p> : (
        <>
          {tab === 'cuisines' ? (
            <CuisinesTab
              token={token}
              cuisines={search.trim() ? cuisines.filter((c) => c.label.toLowerCase().includes(search.trim().toLowerCase())) : cuisines}
              kits={kits}
              kitCount={counts.kits}
              isAdmin={isAdmin}
              reload={reload}
            />
          ) : null}
          {tab === 'kits' ? <KitsTab token={token} cuisines={cuisines} kits={search.trim() ? kits.filter((k) => k.name.toLowerCase().includes(search.trim().toLowerCase())) : kits} templates={templates} isAdmin={isAdmin} reload={reload} /> : null}
          {tab === 'templates' ? <TemplatesTab token={token} cuisines={cuisines} templates={search.trim() ? templates.filter((t) => t.name.toLowerCase().includes(search.trim().toLowerCase())) : templates} kits={kits} isAdmin={isAdmin} reload={reload} /> : null}
          {tab === 'types' ? <ProductTypesTab templates={templates} /> : null}
        </>
      )}
    </div>
  );
}
