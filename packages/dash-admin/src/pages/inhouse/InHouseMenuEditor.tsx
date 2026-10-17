import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  archiveInHouseDish,
  listInHouseChoiceLists,
  listInHouseMenu,
  saveInHouseChoiceList,
  saveInHouseMenu,
  uploadDeskImage,
} from '@roam/dash-admin-client';
import {
  cheapestPizzaPrice,
  defaultPizzaRecipe,
  groupsFromStored,
  groupsToStored,
  listFromGroup,
  parsePizzaMenu,
  parsePizzaRecipe,
  startingRestaurantPrice,
  validateDishChoices,
  type ChoiceGroup,
  type ChoiceList,
  type PizzaMenu,
  type PizzaRecipe,
} from '@roam/merchant-ops';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';
import { EntityDrawer } from '../../components/ui/bits';
import { formatMoney } from '../../components/ui/format';
import { DishChoices } from './DishChoices';
import { PizzaPricesPanel } from './PizzaPrices';

type SectionKind = 'standard' | 'sized' | 'pizza';

type Category = {
  id: string;
  name: string;
  choiceListIds: string[];
  pizzaMenu: PizzaMenu | null;
  sectionKind: SectionKind;
  sortOrder: number;
};

function mapCategories(rows: Array<{ id: string; name: string; choice_list_ids?: string[]; pizza_menu?: unknown; section_kind?: string; sort_order?: number }>): Category[] {
  return rows.map((category, index) => ({
    id: category.id,
    name: category.name,
    choiceListIds: Array.isArray(category.choice_list_ids) ? category.choice_list_ids.map(String) : [],
    pizzaMenu: parsePizzaMenu(category.pizza_menu),
    sectionKind: (category.section_kind === 'sized' || category.section_kind === 'pizza' ? category.section_kind : 'standard') as SectionKind,
    sortOrder: Number.isFinite(Number(category.sort_order)) ? Number(category.sort_order) : index,
  })).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

type Dish = {
  id?: string;
  name: string;
  description: string;
  inStorePrice: string;
  prepMinutes: string;
  categoryId: string;
  imageUrl: string;
  isAvailable: boolean;
  groups: ChoiceGroup[];
  recipe?: PizzaRecipe;
};

const STALE_MS = 14 * 24 * 60 * 60 * 1000;
const emptyDish = (): Dish => ({
  name: '',
  description: '',
  inStorePrice: '',
  prepMinutes: '',
  categoryId: '',
  imageUrl: '',
  isAvailable: true,
  groups: [],
});

/** Same rounding as the server price the customer is charged. */
export function customerPrice(inStoreMajor: number, markupBps: number): number {
  const raw = Number(inStoreMajor) * (1 + Number(markupBps) / 10000);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.ceil(raw / 10) * 10;
}

function money(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return formatMoney(amount);
}

function fresh(checkedAt: unknown, now = Date.now()): boolean {
  if (!checkedAt) return false;
  const at = new Date(String(checkedAt)).getTime();
  if (!Number.isFinite(at)) return false;
  return now - at <= STALE_MS;
}

function ago(checkedAt: unknown): string {
  if (!checkedAt) return 'Never confirmed';
  const at = new Date(String(checkedAt)).getTime();
  if (!Number.isFinite(at)) return 'Never confirmed';
  const days = Math.floor((Date.now() - at) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Confirmed today';
  if (days === 1) return 'Confirmed 1 day ago';
  return `Confirmed ${days} days ago`;
}

function kindOf(categories: Category[], categoryId: string): SectionKind {
  return categories.find((category) => category.id === categoryId)?.sectionKind || 'standard';
}

export function InHouseMenuEditor({
  token,
  merchantId,
  restaurantName,
  markupBps,
  onBack,
}: {
  token: string;
  merchantId: string;
  restaurantName: string;
  marketName?: string;
  initials?: string;
  markupBps: number;
  onBack: () => void;
  onDetails?: () => void;
  onHours?: () => void;
}) {
  const { confirm } = useAdminConfirm();
  const [categories, setCategories] = useState<Category[]>([]);
  const [lists, setLists] = useState<ChoiceList[]>([]);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [sectionName, setSectionName] = useState('');
  const [sectionKind, setSectionKind] = useState<SectionKind>('standard');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [dishFilter, setDishFilter] = useState<'all' | 'stale' | 'soldout'>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dish, setDish] = useState<Dish>(emptyDish());
  const [composing, setComposing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  function load(quiet = false) {
    if (!quiet) {
      setLoading(true);
      setItems([]);
      setCategories([]);
    }
    setLoadError('');
    void listInHouseMenu(token, merchantId).then((result) => {
      setCategories(mapCategories(result.categories || []));
      setItems(result.items || []);
      setLoading(false);
    }).catch((error: Error) => {
      setLoadError(error.message);
      setLoading(false);
    });
    void listInHouseChoiceLists(token, merchantId).then((result) => setLists(result.lists || [])).catch(() => undefined);
  }

  useEffect(() => {
    setDish(emptyDish());
    setComposing(false);
    setDirty(false);
    setSectionFilter('all');
    load();
  }, [token, merchantId]);

  function editItem(item: Record<string, unknown>) {
    if (dirty && composing) {
      void confirm({
        title: 'Discard changes?',
        description: 'You have unsaved edits on this dish.',
        confirmLabel: 'Discard',
        variant: 'danger',
      }).then((ok) => {
        if (ok) openDish(item);
      });
      return;
    }
    openDish(item);
  }

  function openDish(item: Record<string, unknown>) {
    setDish({
      id: String(item.id),
      name: String(item.name || ''),
      description: String(item.description || ''),
      inStorePrice: String(item.in_store_price ?? ''),
      prepMinutes: String(item.prep_time_mins ?? ''),
      categoryId: String(item.category_id || ''),
      imageUrl: String(item.image_url || ''),
      isAvailable: item.is_available !== false,
      groups: groupsFromStored(item.options).map((group) => ({
        ...group,
        applyToSection: Boolean(group.libraryGroupId && (categories.find((category) => category.id === String(item.category_id || ''))?.choiceListIds || []).includes(group.libraryGroupId)),
      })),
      recipe: parsePizzaRecipe(item.pizza_recipe) || undefined,
    });
    setDirty(false);
    setComposing(true);
  }

  function startDish() {
    setDish({ ...emptyDish(), categoryId: sectionFilter === 'all' ? '' : sectionFilter });
    setDirty(false);
    setComposing(true);
  }

  async function uploadPhoto(file: File) {
    setUploading(true);
    try {
      const uploaded = await uploadDeskImage(token, file, 'menu-items');
      setDish((current) => ({ ...current, imageUrl: uploaded.publicUrl }));
      setDirty(true);
      toast.success('Photo added');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload the photo');
    } finally {
      setUploading(false);
    }
  }

  async function syncLists(groups: ChoiceGroup[]) {
    const next: ChoiceGroup[] = [];
    for (const group of groups) {
      if (!group.libraryGroupId && !group.saveForLibrary && !group.applyToSection) {
        next.push(group);
        continue;
      }
      const sectionListId = categories.find((category) => category.id === dish.categoryId)?.choiceListIds?.[0];
      const libraryGroupId = group.libraryGroupId || (group.applyToSection ? sectionListId : undefined);
      const list = listFromGroup(group, libraryGroupId);
      const saved = await saveInHouseChoiceList(token, merchantId, { ...list, id: libraryGroupId });
      next.push({ ...group, libraryGroupId: saved.list.id, saveForLibrary: false });
    }
    return next;
  }

  function saveDish(event: FormEvent) {
    event.preventDefault();
    const section = categories.find((category) => category.id === dish.categoryId);
    const pizza = kindOf(categories, dish.categoryId) === 'pizza';
    const sized = kindOf(categories, dish.categoryId) === 'sized';
    let price = startingRestaurantPrice(Number(dish.inStorePrice), dish.groups);
    let recipe = dish.recipe;
    if (pizza) {
      if (!section?.pizzaMenu) {
        toast.error('Save the pizza prices first');
        return;
      }
      recipe = recipe || defaultPizzaRecipe(section.pizzaMenu);
      const baked = cheapestPizzaPrice(section.pizzaMenu, recipe);
      if (baked == null) {
        toast.error('That crust is not sold on a size');
        return;
      }
      price = baked;
    }
    const invalid = pizza ? null : validateDishChoices(price, dish.groups);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setSaving(true);
    void syncLists(pizza ? [] : dish.groups).then((groups) => {
      const payload = {
        name: dish.name,
        description: dish.description,
        inStorePrice: price,
        prepMinutes: sized ? undefined : Number(dish.prepMinutes),
        categoryId: dish.categoryId || undefined,
        category: section?.name || 'Menu',
        imageUrl: dish.imageUrl,
        isAvailable: dish.isAvailable,
        options: groupsToStored(groups),
        ...(pizza && recipe ? { pizzaRecipe: recipe } : {}),
      };
      const sectionForShare = categories.find((category) => category.id === dish.categoryId);
      const shared = groups.find((group) => group.kind === 'priced' && group.applyToSection && group.libraryGroupId);
      const previous = sectionForShare?.choiceListIds || [];
      const dropped = groups.some((group) => group.kind === 'priced' && group.libraryGroupId && previous.includes(group.libraryGroupId) && !group.applyToSection);
      const choiceListIds = shared ? [shared.libraryGroupId as string] : dropped ? previous.filter((id) => !groups.some((group) => group.libraryGroupId === id && !group.applyToSection)) : undefined;
      const sectionUpdate = sectionForShare && choiceListIds
        ? [{ id: sectionForShare.id, name: sectionForShare.name, choiceListIds, sectionKind: sectionForShare.sectionKind }]
        : undefined;
      return dish.id
        ? saveInHouseMenu(token, merchantId, [{ ...payload, id: dish.id }], true, undefined, sectionUpdate)
        : saveInHouseMenu(token, merchantId, [], true, [payload], sectionUpdate);
    }).then(() => {
      setDish(emptyDish());
      setComposing(false);
      setDirty(false);
      toast.success(dish.id ? 'Dish saved' : 'Dish added');
      load(true);
    }).catch((error: Error) => toast.error(error.message))
      .finally(() => setSaving(false));
  }

  async function removeSection(category: Category) {
    const used = items.filter((item) => String(item.category_id || '') === category.id).length;
    if (used) {
      toast.error(`Move or archive the ${used} dishes in ${category.name} first`);
      return;
    }
    const ok = await confirm({
      title: `Archive ${category.name}?`,
      description: 'This section will come off the menu.',
      confirmLabel: 'Archive section',
      variant: 'danger',
    });
    if (!ok) return;
    void saveInHouseMenu(token, merchantId, [], false, undefined, [{ id: category.id, name: category.name, remove: true }])
      .then(() => {
        if (dish.categoryId === category.id) setDish((current) => ({ ...current, categoryId: '' }));
        if (sectionFilter === category.id) setSectionFilter('all');
        toast.success('Section archived');
        load(true);
      })
      .catch((error: Error) => toast.error(error.message));
  }

  async function addSection(event: FormEvent) {
    event.preventDefault();
    const name = sectionName.trim();
    if (!name) return;
    if (categories.some((category) => category.name.trim().toLowerCase() === name.toLowerCase())) {
      toast.error(`A section called ${name} already exists`);
      return;
    }
    try {
      await saveInHouseMenu(token, merchantId, [], false, undefined, [{ name, sectionKind, sortOrder: categories.length }]);
      setSectionName('');
      toast.success('Section added');
      const result = await listInHouseMenu(token, merchantId);
      const mapped = mapCategories(result.categories || []);
      setCategories(mapped);
      setItems(result.items || []);
      const created = mapped.find((category) => category.name.trim().toLowerCase() === name.toLowerCase());
      if (created) setSectionFilter(created.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add section');
    }
  }

  async function moveSection(categoryId: string, direction: -1 | 1) {
    const index = categories.findIndex((category) => category.id === categoryId);
    const swapWith = index + direction;
    if (index < 0 || swapWith < 0 || swapWith >= categories.length) return;
    const next = [...categories];
    const [moved] = next.splice(index, 1);
    next.splice(swapWith, 0, moved);
    const ordered = next.map((category, sortOrder) => ({ ...category, sortOrder }));
    setCategories(ordered);
    try {
      await saveInHouseMenu(
        token,
        merchantId,
        [],
        false,
        undefined,
        ordered.map((category) => ({
          id: category.id,
          name: category.name,
          sectionKind: category.sectionKind,
          sortOrder: category.sortOrder,
        })),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reorder sections');
      load(true);
    }
  }

  async function confirmSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    await saveInHouseMenu(
      token,
      merchantId,
      ids.map((id) => ({ id })),
      true,
    );
    setSelected(new Set());
    toast.success('Prices confirmed');
    load(true);
  }

  const visibleItems = useMemo(() => {
    const sectionOrder = new Map(categories.map((category, index) => [category.id, index]));
    return items
      .filter((item) => sectionFilter === 'all' || String(item.category_id || '') === sectionFilter)
      .filter((item) => {
        if (dishFilter === 'stale') return !fresh(item.source_price_checked_at);
        if (dishFilter === 'soldout') return item.is_available === false;
        return true;
      })
      .filter((item) => !search.trim() || String(item.name || '').toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => {
        const sa = sectionOrder.get(String(a.category_id || '')) ?? 999;
        const sb = sectionOrder.get(String(b.category_id || '')) ?? 999;
        if (sa !== sb) return sa - sb;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
  }, [items, categories, sectionFilter, dishFilter, search]);

  const staleCount = items.filter((item) => !fresh(item.source_price_checked_at)).length;
  const activeSection = categories.find((category) => category.id === sectionFilter) || null;
  const preview = customerPrice(Number(dish.inStorePrice), markupBps);
  const field = 'mt-1 w-full rounded bg-slate-900 p-2';

  return (
    <div className="space-y-4 text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <button type="button" className="text-sm text-slate-400" onClick={onBack}>← {restaurantName}</button>
          <h2 className="text-lg font-semibold">Menu</h2>
          <p className="text-sm text-slate-400">{items.length} dishes · {staleCount} prices out of date</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="rounded bg-slate-800 px-3 py-1 text-sm" onClick={() => setHelpOpen(true)}>?</button>
          <button type="button" className="rounded bg-slate-800 px-3 py-1 text-sm" onClick={() => setPreviewOpen(true)}>Preview as customer</button>
        </div>
      </div>

      {loadError ? <p className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-100">{loadError}</p> : null}
      {staleCount > 0 ? (
        <p className="rounded border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-sm text-amber-100">
          {staleCount} dishes are hidden from customers because their prices are more than 14 days old.
          Check them on the restaurant&apos;s site, then confirm prices still correct.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-300">Sections</h3>
          </div>
          <button type="button" className={`w-full rounded px-3 py-2 text-left text-sm ${sectionFilter === 'all' ? 'bg-slate-800' : 'text-slate-400'}`} onClick={() => setSectionFilter('all')}>
            All
          </button>
          {categories.map((category, index) => (
            <div key={category.id} className={`rounded border border-slate-800 p-2 ${sectionFilter === category.id ? 'bg-slate-900' : ''}`}>
              <button type="button" className="w-full text-left text-sm" onClick={() => setSectionFilter(category.id)}>
                {category.name}
                <span className="ml-2 text-xs text-slate-500">{category.sectionKind === 'standard' ? '' : category.sectionKind === 'sized' ? 'Sizes' : 'Pizza'}</span>
              </button>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <button type="button" className="text-slate-400 disabled:opacity-30" disabled={index === 0} onClick={() => void moveSection(category.id, -1)}>Up</button>
                <button type="button" className="text-slate-400 disabled:opacity-30" disabled={index === categories.length - 1} onClick={() => void moveSection(category.id, 1)}>Down</button>
                <button type="button" className="text-slate-400" onClick={() => {
                  const next = window.prompt('Rename section', category.name)?.trim();
                  if (!next || next === category.name) return;
                  void saveInHouseMenu(token, merchantId, [], false, undefined, [{ id: category.id, name: next, sectionKind: category.sectionKind, sortOrder: category.sortOrder }])
                    .then(() => { toast.success('Section renamed'); load(true); })
                    .catch((error: Error) => toast.error(error.message));
                }}>Rename</button>
                <select
                  className="rounded bg-slate-900 px-1 py-0.5 text-slate-300"
                  value={category.sectionKind}
                  aria-label={`Type for ${category.name}`}
                  onChange={(event) => {
                    const next = event.target.value as SectionKind;
                    if (!['standard', 'sized', 'pizza'].includes(next) || next === category.sectionKind) return;
                    void saveInHouseMenu(token, merchantId, [], false, undefined, [{ id: category.id, name: category.name, sectionKind: next, sortOrder: category.sortOrder }])
                      .then(() => { toast.success('Section type updated'); load(true); })
                      .catch((error: Error) => toast.error(error.message));
                  }}
                >
                  <option value="standard">Standard</option>
                  <option value="sized">Sizes</option>
                  <option value="pizza">Build-your-own pizza</option>
                </select>
                <button type="button" className="text-red-300" onClick={() => void removeSection(category)}>Archive</button>
              </div>
            </div>
          ))}
          <form className="space-y-2 rounded border border-dashed border-slate-700 p-2" onSubmit={(event) => void addSection(event)}>
            <input className="w-full rounded bg-slate-900 p-2 text-sm" placeholder="New section name" value={sectionName} onChange={(event) => setSectionName(event.target.value)} />
            <select className="w-full rounded bg-slate-900 p-2 text-sm" value={sectionKind} onChange={(event) => setSectionKind(event.target.value as SectionKind)}>
              <option value="standard">Standard</option>
              <option value="sized">Sizes</option>
              <option value="pizza">Build-your-own pizza</option>
            </select>
            <button className="w-full rounded bg-slate-800 px-3 py-1 text-sm" type="submit">+ Add</button>
          </form>
        </aside>

        <div className="space-y-3">
          {activeSection?.sectionKind === 'pizza' ? (
            <PizzaPricesPanel
              menu={activeSection.pizzaMenu}
              onSave={(menu) => {
                void saveInHouseMenu(token, merchantId, [], false, undefined, [{ id: activeSection.id, name: activeSection.name, pizzaMenu: menu, sectionKind: 'pizza' }])
                  .then(() => { toast.success('Pizza prices saved'); load(true); })
                  .catch((error: Error) => toast.error(error.message));
              }}
            />
          ) : null}

          <div className="flex flex-wrap gap-2">
            <input className="rounded bg-slate-900 px-3 py-1 text-sm" placeholder="Search dishes…" value={search} onChange={(event) => setSearch(event.target.value)} />
            {(['all', 'stale', 'soldout'] as const).map((id) => (
              <button key={id} type="button" className={`rounded px-3 py-1 text-sm ${dishFilter === id ? 'bg-amber-500 text-slate-950' : 'bg-slate-800'}`} onClick={() => setDishFilter(id)}>
                {id === 'all' ? 'All' : id === 'stale' ? `Out of date ${staleCount}` : 'Sold out'}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded border border-slate-800">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="p-2"><input type="checkbox" checked={visibleItems.length > 0 && visibleItems.every((item) => selected.has(String(item.id)))} onChange={(event) => {
                    setSelected(event.target.checked ? new Set(visibleItems.map((item) => String(item.id))) : new Set());
                  }} /></th>
                  <th className="p-2">Dish</th>
                  <th className="p-2">Restaurant</th>
                  <th className="p-2">Customer</th>
                  <th className="p-2">Prices checked</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td className="p-3 text-slate-400" colSpan={5}>Loading…</td></tr> : null}
                {!loading && visibleItems.length === 0 ? <tr><td className="p-3 text-slate-400" colSpan={5}>No dishes here yet.</td></tr> : null}
                {visibleItems.map((item) => {
                  const id = String(item.id);
                  const isFresh = fresh(item.source_price_checked_at);
                  return (
                    <tr key={id} className="border-t border-slate-800 hover:bg-slate-900/50">
                      <td className="p-2">
                        <input type="checkbox" checked={selected.has(id)} onChange={(event) => {
                          setSelected((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(id);
                            else next.delete(id);
                            return next;
                          });
                        }} />
                      </td>
                      <td className="p-2">
                        <button type="button" className="text-left font-medium" onClick={() => editItem(item)}>{String(item.name)}</button>
                        {item.is_available === false ? <span className="ml-2 text-xs text-slate-500">Sold out</span> : null}
                      </td>
                      <td className="p-2">{money(item.in_store_price)}</td>
                      <td className="p-2">{money(customerPrice(Number(item.in_store_price || 0), markupBps))}</td>
                      <td className={`p-2 ${isFresh ? 'text-emerald-300' : 'text-[#fbbf24]'}`}>
                        {isFresh ? `✓ ${ago(item.source_price_checked_at)}` : `⚠ ${ago(item.source_price_checked_at)} · hidden from customers`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!selected.size} className="rounded bg-slate-800 px-3 py-1 text-sm disabled:opacity-40" onClick={() => void confirmSelected().catch((error: Error) => toast.error(error.message))}>
              Confirm selected prices
            </button>
            {activeSection ? (
              <button type="button" className="rounded bg-slate-800 px-3 py-1 text-sm" onClick={() => {
                const ids = items.filter((item) => String(item.category_id || '') === activeSection.id).map((item) => String(item.id));
                if (!ids.length) return;
                void saveInHouseMenu(token, merchantId, ids.map((id) => ({ id })), true)
                  .then(() => { toast.success('Section prices confirmed'); load(true); })
                  .catch((error: Error) => toast.error(error.message));
              }}>
                Confirm all in this section
              </button>
            ) : null}
            <button type="button" className="rounded bg-[#f59e0b] px-3 py-1 text-sm text-slate-950" onClick={startDish}>
              + Add dish{activeSection ? ` to ${activeSection.name}` : ''}
            </button>
          </div>
        </div>
      </div>

      <EntityDrawer
        open={composing}
        title={dish.id ? `Edit dish · ${dish.name || 'Untitled'}` : 'Add dish'}
        onClose={() => {
          if (!dirty) {
            setComposing(false);
            return;
          }
          void confirm({
            title: 'Discard changes?',
            description: 'You have unsaved edits on this dish.',
            confirmLabel: 'Discard',
            variant: 'danger',
          }).then((ok) => {
            if (ok) {
              setComposing(false);
              setDirty(false);
            }
          });
        }}
      >
        <form className="space-y-3 text-sm" onSubmit={saveDish} onChange={() => setDirty(true)}>
          <label>Section
            <select className={field} value={dish.categoryId} onChange={(event) => setDish({ ...dish, categoryId: event.target.value })} required>
              <option value="">Choose section</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label>Name<input className={field} value={dish.name} onChange={(event) => setDish({ ...dish, name: event.target.value })} required /></label>
          <label>Description<textarea className={field} value={dish.description} onChange={(event) => setDish({ ...dish, description: event.target.value })} /></label>
          {kindOf(categories, dish.categoryId) !== 'pizza' ? (
            <label>Restaurant charges J$
              <input className={field} value={dish.inStorePrice} onChange={(event) => setDish({ ...dish, inStorePrice: event.target.value })} required />
              <span className="mt-1 block text-xs text-slate-500">Customer pays {money(preview)} (+{Math.round(markupBps / 100)}% markup, rounded up to J$10)</span>
            </label>
          ) : null}
          {kindOf(categories, dish.categoryId) !== 'sized' ? (
            <label>Minutes to prepare<input className={field} value={dish.prepMinutes} onChange={(event) => setDish({ ...dish, prepMinutes: event.target.value })} required /></label>
          ) : null}
          {kindOf(categories, dish.categoryId) !== 'pizza' ? (
            <DishChoices
              lists={lists}
              groups={dish.groups}
              onChange={(groups) => { setDish({ ...dish, groups }); setDirty(true); }}
            />
          ) : null}
          <label>Photo
            <input className="mt-1 block w-full" type="file" accept="image/*" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadPhoto(file); }} />
            {dish.imageUrl ? <img src={dish.imageUrl} alt="" className="mt-2 h-20 w-20 rounded object-cover" /> : null}
          </label>
          <fieldset className="space-y-1">
            <legend>Availability</legend>
            <label className="flex items-center gap-2"><input type="radio" checked={dish.isAvailable} onChange={() => setDish({ ...dish, isAvailable: true })} /> On sale</label>
            <label className="flex items-center gap-2"><input type="radio" checked={!dish.isAvailable} onChange={() => setDish({ ...dish, isAvailable: false })} /> Sold out</label>
          </fieldset>
          <p className="text-xs text-slate-500">Price last {ago(items.find((item) => String(item.id) === dish.id)?.source_price_checked_at)} — saving confirms it today.</p>
          <div className="flex flex-wrap gap-2">
            {dish.id ? (
              <button type="button" className="rounded bg-red-950 px-3 py-2 text-red-100" onClick={() => void confirm({
                title: 'Archive dish?',
                description: 'It will be hidden from the menu and customers.',
                confirmLabel: 'Archive dish',
                variant: 'danger',
              }).then((ok) => {
                if (!ok || !dish.id) return;
                return archiveInHouseDish(token, merchantId, dish.id).then(() => {
                  toast.success('Dish archived');
                  setComposing(false);
                  load(true);
                });
              }).catch((error: Error) => toast.error(error.message))}>
                Archive dish
              </button>
            ) : null}
            {dish.id ? (
              <button type="button" className="rounded bg-slate-800 px-3 py-2" onClick={() => {
                setDish({ ...dish, id: undefined, name: `${dish.name} copy` });
                setDirty(true);
              }}>
                Duplicate dish
              </button>
            ) : null}
            <button type="button" className="rounded bg-slate-800 px-3 py-2" onClick={() => setComposing(false)}>Cancel</button>
            <button disabled={saving} className="rounded-xl bg-[#f59e0b] px-3 py-2 text-slate-950 disabled:opacity-40" type="submit">{saving ? 'Saving…' : 'Save dish'}</button>
          </div>
        </form>
      </EntityDrawer>

      <EntityDrawer open={previewOpen} title="Preview as customer" onClose={() => setPreviewOpen(false)}>
        <div className="mx-auto w-full max-w-[320px] space-y-3 rounded-[2rem] border border-slate-700 bg-slate-900 p-4">
          <h3 className="font-semibold">{restaurantName}</h3>
          {categories.map((category) => {
            const dishes = items.filter((item) => String(item.category_id || '') === category.id && item.is_available !== false);
            return (
              <div key={category.id}>
                <h4 className="text-sm text-slate-400">{category.name}</h4>
                <ul className="space-y-1">
                  {dishes.map((item) => {
                    const isFresh = fresh(item.source_price_checked_at);
                    return (
                      <li key={String(item.id)} className="flex justify-between text-sm">
                        <span className={isFresh ? '' : 'text-slate-500 line-through'}>{String(item.name)}</span>
                        <span>{isFresh ? money(customerPrice(Number(item.in_store_price || 0), markupBps)) : 'hidden · out of date'}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </EntityDrawer>

      <EntityDrawer open={helpOpen} title="How prices work" onClose={() => setHelpOpen(false)}>
        <div className="space-y-2 text-sm text-slate-300">
          <p>Customer price = restaurant price + markup, rounded up to the next J$10.</p>
          <p>Prices older than 14 days are hidden from customers until you confirm them.</p>
          <p>Section type controls the editor: Standard, Sizes, or Build-your-own pizza.</p>
        </div>
      </EntityDrawer>
    </div>
  );
}
