import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { listInHouseChoiceLists, listInHouseMenu, saveInHouseChoiceList, saveInHouseMenu, uploadDeskImage } from '@roam/dash-admin-client';
import { cheapestPizzaPrice, defaultPizzaRecipe, groupsFromStored, groupsToStored, listFromGroup, parsePizzaMenu, parsePizzaRecipe, startingRestaurantPrice, validateDishChoices, type ChoiceGroup, type ChoiceList, type PizzaMenu, type PizzaRecipe } from '@roam/merchant-ops';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';
import { formatMoney } from '../../components/ui/format';
import { StitchMenuScreens } from './StitchMenuScreens';

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
function customerPrice(inStoreMajor: number, markupBps: number): number {
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

function drinkSection(categories: Array<{ id: string; name: string }>, categoryId: string) {
  const name = categories.find((category) => category.id === categoryId)?.name || '';
  return /drink/i.test(name);
}

function pizzaSection(categories: Array<{ id: string; name: string }>, categoryId: string) {
  const name = categories.find((category) => category.id === categoryId)?.name || '';
  return /pizza/i.test(name);
}

export function InHouseMenuEditor({
  token,
  merchantId,
  restaurantName,
  marketName,
  initials,
  markupBps,
  onBack,
  onDetails,
  onHours,
}: {
  token: string;
  merchantId: string;
  restaurantName: string;
  marketName: string;
  initials: string;
  markupBps: number;
  onBack: () => void;
  onDetails: () => void;
  onHours: () => void;
}) {
  const { confirm } = useAdminConfirm();
  const [categories, setCategories] = useState<Array<{ id: string; name: string; choiceListIds: string[]; pizzaMenu: PizzaMenu | null }>>([]);
  const [lists, setLists] = useState<ChoiceList[]>([]);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [sectionName, setSectionName] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [dish, setDish] = useState<Dish>(emptyDish());
  const [composing, setComposing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  function load(quiet = false) {
    if (!quiet) {
      setLoading(true);
      setItems([]);
      setCategories([]);
    }
    setLoadError('');
    void listInHouseMenu(token, merchantId).then((result) => {
      setCategories((result.categories || []).map((category) => ({
        id: category.id,
        name: category.name,
        choiceListIds: Array.isArray(category.choice_list_ids) ? category.choice_list_ids.map(String) : [],
        pizzaMenu: parsePizzaMenu(category.pizza_menu),
      })));
      setItems(result.items || []);
      setLoading(false);
    }).catch((error: Error) => {
      setLoadError(error.message);
      setLoading(false);
      toast.error(error.message);
    });
    void listInHouseChoiceLists(token, merchantId).then((result) => setLists(result.lists || [])).catch(() => undefined);
  }
  useEffect(() => {
    setDish(emptyDish());
    setComposing(false);
    setSectionFilter('all');
    load();
  }, [token, merchantId]);

  function editItem(item: Record<string, unknown>) {
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
    setComposing(true);
  }

  function chooseSection(id: string) {
    setSectionFilter(id);
    if (id !== 'all' && dish.categoryId !== id) {
      setDish(emptyDish());
      setComposing(false);
    }
  }

  function startDish() {
    setDish({ ...emptyDish(), categoryId: sectionFilter === 'all' ? '' : sectionFilter });
    setComposing(true);
  }

  async function uploadPhoto(file: File) {
    setUploading(true);
    try {
      const uploaded = await uploadDeskImage(token, file, 'menu-items');
      setDish((current) => ({ ...current, imageUrl: uploaded.publicUrl }));
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
    const pizza = pizzaSection(categories, dish.categoryId);
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
        prepMinutes: drinkSection(categories, dish.categoryId) ? undefined : Number(dish.prepMinutes),
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
      const sectionUpdate = sectionForShare && choiceListIds ? [{ id: sectionForShare.id, name: sectionForShare.name, choiceListIds }] : undefined;
      const request = dish.id
        ? saveInHouseMenu(token, merchantId, [{ ...payload, id: dish.id }], false, undefined, sectionUpdate)
        : saveInHouseMenu(token, merchantId, [], false, [payload], sectionUpdate);
      return request;
    }).then(() => {
      setDish(emptyDish());
      setComposing(false);
      toast.success(dish.id ? 'Dish updated' : 'Dish added');
      load(true);
    }).catch((error: Error) => toast.error(error.message))
      .finally(() => setSaving(false));
  }

  async function removeSection(category: { id: string; name: string }) {
    const used = items.some((item) => String(item.category_id || '') === category.id);
    if (used) {
      toast.error(`Move the dishes out of ${category.name} before deleting it`);
      return;
    }
    const ok = await confirm({
      title: `Delete ${category.name}?`,
      description: 'This section will come off the menu.',
      confirmLabel: 'Delete section',
      variant: 'danger',
    });
    if (!ok) return;
    void saveInHouseMenu(token, merchantId, [], false, undefined, [{ id: category.id, name: category.name, remove: true }])
      .then(() => {
        if (dish.categoryId === category.id) setDish((current) => ({ ...current, categoryId: '' }));
        if (sectionFilter === category.id) setSectionFilter('all');
        toast.success('Section removed');
        load(true);
      })
      .catch((error: Error) => toast.error(error.message));
  }

  const markupPercent = Math.round(Number(markupBps) / 100);
  const typedPrice = Number(dish.inStorePrice);
  const preview = customerPrice(typedPrice, markupBps);

  return (
    <StitchMenuScreens
      ago={ago}
      categories={categories}
      composing={composing}
      dish={dish}
      fresh={fresh}
      initials={initials}
      items={items}
      lists={lists}
      loadError={loadError}
      loading={loading}
      marketName={marketName}
      markupPercent={markupPercent}
      money={money}
      preview={preview}
      restaurantName={restaurantName}
      saving={saving}
      sectionFilter={sectionFilter}
      sectionName={sectionName}
      setDish={setDish}
      setSectionFilter={chooseSection}
      setSectionName={setSectionName}
      uploading={uploading}
      onAddDish={startDish}
      onAddSection={(event) => {
        event.preventDefault();
        if (!sectionName.trim()) return;
        void saveInHouseMenu(token, merchantId, [], false, undefined, [{ name: sectionName.trim() }])
          .then(() => { setSectionName(''); toast.success('Section added'); load(true); })
          .catch((error: Error) => toast.error(error.message));
      }}
      onBack={onBack}
      onCloseEditor={() => setComposing(false)}
      onDetails={onDetails}
      onEdit={editItem}
      onHours={onHours}
      onRemoveSection={(category) => void removeSection(category)}
      onRenameSection={(category, name) => {
        const next = name.trim();
        if (!next || next === category.name) return;
        void saveInHouseMenu(token, merchantId, [], false, undefined, [{ id: category.id, name: next }])
          .then(() => { toast.success('Section renamed'); load(true); })
          .catch((error: Error) => toast.error(error.message));
      }}
      onSave={saveDish}
      onSavePizzaMenu={(categoryId, menu) => {
        const category = categories.find((entry) => entry.id === categoryId);
        if (!category) return;
        void saveInHouseMenu(token, merchantId, [], false, undefined, [{ id: category.id, name: category.name, pizzaMenu: menu }])
          .then(() => { toast.success('Pizza prices saved'); load(true); })
          .catch((error: Error) => toast.error(error.message));
      }}
      onUpload={(file) => void uploadPhoto(file)}
    />
  );
}
