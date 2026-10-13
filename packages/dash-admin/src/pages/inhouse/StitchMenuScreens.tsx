import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { parsePizzaRecipe, type ChoiceList, type PizzaMenu, type PizzaRecipe } from '@roam/merchant-ops';
import { DishChoices, blankChoice } from './DishChoices';
import { PizzaPricesPanel, PizzaRecipeFields, defaultPizzaRecipe } from './PizzaPrices';
import './menu-stitch.css';

export type DeskDish = {
  id?: string;
  name: string;
  description: string;
  inStorePrice: string;
  prepMinutes: string;
  categoryId: string;
  imageUrl: string;
  isAvailable: boolean;
  groups: Parameters<typeof DishChoices>[0]['groups'];
  recipe?: PizzaRecipe;
};

type Row = Record<string, unknown>;

type Props = {
  restaurantName: string;
  marketName: string;
  initials: string;
  markupPercent: number;
  categories: Array<{ id: string; name: string; choiceListIds?: string[]; pizzaMenu?: PizzaMenu | null }>;
  items: Row[];
  lists: ChoiceList[];
  dish: DeskDish;
  setDish: (dish: DeskDish) => void;
  composing: boolean;
  sectionFilter: string;
  setSectionFilter: (id: string) => void;
  sectionName: string;
  setSectionName: (name: string) => void;
  loading: boolean;
  loadError: string;
  uploading: boolean;
  saving: boolean;
  preview: number;
  onBack: () => void;
  onDetails: () => void;
  onHours: () => void;
  onAddDish: () => void;
  onEdit: (item: Row) => void;
  onSave: (event: FormEvent) => void;
  onCloseEditor: () => void;
  onUpload: (file: File) => void;
  onAddSection: (event: FormEvent) => void;
  onRenameSection: (category: { id: string; name: string }, name: string) => void;
  onRemoveSection: (category: { id: string; name: string }) => void;
  onSavePizzaMenu: (categoryId: string, menu: PizzaMenu) => void;
  money: (value: unknown) => string;
  fresh: (checkedAt: unknown) => boolean;
  ago: (checkedAt: unknown) => string;
};

function useDesk(): 'cash' | 'tablet' | 'calm' {
  const [desk, setDesk] = useState<'cash' | 'tablet' | 'calm'>('calm');
  useEffect(() => {
    const cash = window.matchMedia('(max-width: 767px)');
    const tablet = window.matchMedia('(min-width: 768px) and (max-width: 1279px)');
    const apply = () => setDesk(cash.matches ? 'cash' : tablet.matches ? 'tablet' : 'calm');
    apply();
    cash.addEventListener('change', apply);
    tablet.addEventListener('change', apply);
    return () => {
      cash.removeEventListener('change', apply);
      tablet.removeEventListener('change', apply);
    };
  }, []);
  return desk;
}

function pizzaRow(item: Row, categories: Props['categories']) {
  return /pizza/i.test(categories.find((category) => category.id === String(item.category_id || ''))?.name || '');
}

function startsOn(item: Row, categories: Props['categories']) {
  const menu = categories.find((category) => category.id === String(item.category_id || ''))?.pizzaMenu;
  const recipe = parsePizzaRecipe(item.pizza_recipe);
  if (!menu || !recipe) return 'Not set yet';
  const crust = menu.crusts.find((row) => row.id === recipe.crustId)?.name;
  const sauce = menu.sauces.find((row) => row.id === recipe.sauceId)?.name;
  const names = new Map([...menu.meats, ...menu.nonMeats].map((row) => [row.id, row.name]));
  const toppings = recipe.toppings.flatMap((pick) => {
    const name = names.get(pick.id);
    return name ? [pick.portion === 'extra' ? `${name} extra` : name] : [];
  });
  const cheese = recipe.cheese === 'extra' ? 'Extra cheese' : '';
  return [crust, cheese, sauce, ...toppings].filter(Boolean).join(', ') || 'Not set yet';
}

function shownCustomer(item: Row, markupPercent: number, money: (value: unknown) => string) {
  const stored = Number(item.marketplace_price);
  if (Number.isFinite(stored) && stored > 0) return money(stored);
  const raw = Number(item.in_store_price) * (1 + markupPercent / 100);
  if (!Number.isFinite(raw) || raw <= 0) return '—';
  return money(Math.ceil(raw / 10) * 10);
}

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>;
}

function FinishButton({ composing, saving, className }: { composing: boolean; saving: boolean; className: string }) {
  return (
    <button className={className} disabled={!composing || saving} form="dish-editor-form" type="submit">
      <Icon name="check_circle" />
      {saving ? 'Finishing…' : 'Finish'}
    </button>
  );
}

export function StitchMenuScreens(props: Props) {
  const desk = useDesk();
  const [helpOpen, setHelpOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(true);
  const [addingSection, setAddingSection] = useState(false);
  const [staleOnly, setStaleOnly] = useState(false);
  const selected = props.categories.find((category) => category.id === props.sectionFilter) || null;
  const inSection = props.items.filter((item) => props.sectionFilter === 'all' || String(item.category_id || '') === props.sectionFilter);
  const visible = (staleOnly ? inSection.filter((item) => !props.fresh(item.source_price_checked_at)) : inSection)
    .slice()
    .sort((a, b) => Number(a.prep_time_mins || 0) - Number(b.prep_time_mins || 0));
  const staleCount = props.items.filter((item) => !props.fresh(item.source_price_checked_at)).length;
  const sectionStale = visible.filter((item) => !props.fresh(item.source_price_checked_at)).length;

  const editor = (
    <DishEditor
      {...props}
      ago={props.ago}
      menuOpen={menuOpen}
      preview={props.preview}
      selected={selected}
      setMenuOpen={setMenuOpen}
      onRemoveSection={props.onRemoveSection}
    />
  );

  return (
    <div className="stitch-menu -m-4 flex h-[calc(100vh-4rem)] min-h-0 flex-col overflow-hidden bg-[#070e1d] text-[#dde5ff] lg:-m-8">
      {desk === 'cash' ? (
        <CashDesk {...props} editor={editor} helpOpen={helpOpen} setHelpOpen={setHelpOpen} staleCount={staleCount} visible={visible} />
      ) : null}
      {desk === 'tablet' ? (
        <TabletDesk {...props} editor={editor} setHelpOpen={setHelpOpen} staleCount={staleCount} visible={visible} />
      ) : null}
      {desk === 'calm' ? (
        <CalmDesk
          {...props}
          addingSection={addingSection}
          bannerOpen={bannerOpen}
          editor={editor}
          helpOpen={helpOpen}
          sectionStale={sectionStale}
          setAddingSection={setAddingSection}
          setBannerOpen={setBannerOpen}
          setHelpOpen={setHelpOpen}
          setStaleOnly={setStaleOnly}
          staleCount={staleCount}
          staleOnly={staleOnly}
          visible={visible}
        />
      ) : null}
      <HelpSheet markupPercent={props.markupPercent} open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

function CalmDesk(props: Props & {
  visible: Row[];
  staleCount: number;
  sectionStale: number;
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
  bannerOpen: boolean;
  setBannerOpen: (open: boolean) => void;
  addingSection: boolean;
  setAddingSection: (open: boolean) => void;
  staleOnly: boolean;
  setStaleOnly: (value: boolean) => void;
  editor: ReactNode;
}) {
  const pizzaDesk = props.categories.some((category) => category.id === props.sectionFilter && /pizza/i.test(category.name));
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex w-full shrink-0 items-center justify-between border-b border-[#314775]/30 bg-[#070e1d] px-6 py-2.5">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="font-headline text-base font-bold uppercase tracking-wider text-[#ffba3e]">Roam Rush Ops</span>
            <span className="font-mono text-xs text-[#5f75a5]">/</span>
            <span className="font-headline text-xs font-semibold text-[#95abdf]">Operations Desk</span>
          </div>
          <nav className="flex items-center gap-5 pl-2 text-xs font-medium">
            <span className="border-b-2 border-[#ffba3e] pb-1 font-medium text-[#ffba3e]">Dishes</span>
            <Link className="pb-1 text-[#95abdf] hover:text-[#dde5ff]" to="/orders">Orders</Link>
            <Link className="pb-1 text-[#95abdf] hover:text-[#dde5ff]" to="/finance">Payouts</Link>
            <Link className="pb-1 text-[#95abdf] hover:text-[#dde5ff]" to="/settings">Settings</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-[#95abdf] hover:bg-[#091935] hover:text-[#dde5ff]" type="button" onClick={() => props.setHelpOpen(true)}>
            <Icon name="help" />
            <span>Price calculation & rules</span>
          </button>
          <button className="relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-[#95abdf] hover:bg-[#091935]" type="button" onClick={() => { props.setStaleOnly(true); props.setBannerOpen(true); }}>
            <Icon name="notifications" />
            {props.staleCount > 0 ? <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#ff7443]" /> : null}
          </button>
          <div className="mx-1 h-4 w-px bg-[#314775]/40" />
          <button className="rounded-lg border border-[#314775]/60 bg-[#091935] px-3 py-1.5 text-xs font-medium text-[#dde5ff] hover:bg-[#0a1e42]" type="button" onClick={props.onAddDish}>Add dish</button>
          <FinishButton className="flex items-center gap-1.5 rounded-lg bg-[#ffba3e] px-3.5 py-1.5 text-xs font-semibold text-[#583a00] hover:bg-[#f2ab22] disabled:opacity-40" composing={props.composing} saving={props.saving} />
          <div className="ml-2 flex h-7 w-7 items-center justify-center rounded-full border border-[#314775]/50 bg-[#092450] text-xs font-bold text-[#ffba3e]" title={props.restaurantName}>{props.initials}</div>
        </div>
      </header>
      <section className="flex w-full shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#314775]/20 bg-[#081328] px-6 py-2 text-xs">
        <div className="flex items-center gap-3">
          <button className="text-[11px] text-[#95abdf] hover:text-[#ffba3e]" type="button" onClick={props.onBack}>Restaurants</button>
          <span className="text-[#314775]">|</span>
          <Icon className="text-[#5f75a5]" name="storefront" />
          <span className="font-headline text-sm font-bold text-[#dde5ff]">{props.restaurantName || 'Restaurant'}</span>
          <span className="inline-flex items-center rounded border border-[#314775]/40 bg-[#091935] px-2 py-0.5 text-[11px] font-medium text-[#95abdf]">Store markup: +{props.markupPercent}%</span>
          <span className="text-[#314775]/70">|</span>
          <span className="text-[11px] text-[#5f75a5]">Region: {props.marketName || 'Jamaica'} (JMD)</span>
          <button className="text-[11px] text-[#95abdf] hover:text-[#dde5ff]" type="button" onClick={props.onDetails}>Details</button>
          <button className="text-[11px] text-[#95abdf] hover:text-[#dde5ff]" type="button" onClick={props.onHours}>Hours</button>
        </div>
        <div className="flex items-center gap-4 font-mono text-[11px] text-[#95abdf]">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#4db16e]" />Freshness SLA: 14 Days</span>
        </div>
      </section>
      {props.bannerOpen && props.staleCount > 0 ? (
        <aside className="flex w-full items-center justify-between border-b border-[#314775]/30 bg-[#091935] px-6 py-2">
          <div className="flex items-center gap-2.5">
            <Icon className="text-[#ff7443]" name="warning" />
            <p className="text-xs text-[#dde5ff]"><span className="font-medium text-[#ff7443]">Notice:</span> Some prices are old. Open the dish and press Finish so customers can order it.</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="text-xs font-semibold text-[#ffba3e] underline decoration-[#ffba3e]/50 underline-offset-4" type="button" onClick={() => props.setStaleOnly(true)}>Review {props.staleCount} stale {props.staleCount === 1 ? 'dish' : 'dishes'} now</button>
            <button aria-label="Dismiss" className="p-0.5 text-[#5f75a5] hover:text-[#dde5ff]" type="button" onClick={() => props.setBannerOpen(false)}><Icon name="close" /></button>
          </div>
        </aside>
      ) : null}
      {props.loadError ? <p className="bg-[#7e2b17] px-6 py-2 text-xs text-[#ff9b82]">{props.loadError}</p> : null}
      <main className="mx-auto grid min-h-0 w-full max-w-[1720px] flex-1 grid-cols-12 items-start gap-5 overflow-y-auto p-5">
        <div className={`${pizzaDesk ? 'col-span-8' : 'col-span-7 rounded-lg border border-[#314775]/30 bg-[#081328] p-4'} flex min-h-[calc(100vh-180px)] flex-col gap-4`}>
          <div className={`flex flex-col items-center gap-2 border-b border-[#314775]/20 pb-3 ${pizzaDesk ? 'rounded-lg border border-[#314775]/30 bg-[#081328] p-4' : ''}`}>
            <h2 className="font-headline text-sm font-bold tracking-tight">Active Menu Sections</h2>
            <div className="flex flex-nowrap items-center justify-center gap-1.5">
              <SectionPills {...props} addingSection={props.addingSection} setAddingSection={props.setAddingSection} />
            </div>
          </div>
          {(() => {
            const section = props.categories.find((category) => category.id === props.sectionFilter);
            if (!section || !/pizza/i.test(section.name)) return null;
            return <PizzaPricesPanel key={`${section.id}:${section.pizzaMenu ? 'saved' : 'new'}`} menu={section.pizzaMenu || null} onSave={(menu) => props.onSavePizzaMenu(section.id, menu)} />;
          })()}
          <div className={pizzaDesk ? 'flex flex-1 flex-col gap-4 rounded-lg border border-[#314775]/30 bg-[#081328] p-4' : 'contents'}>
          <div className="flex items-center justify-between py-1 text-xs">
            <div className="flex items-center gap-2 text-[#5f75a5]">
              <Icon className="text-sm" name="filter_list" />
              <span>{props.loading ? 'Loading the menu…' : `Showing ${props.visible.length} ${props.staleOnly ? 'stale' : 'catalog'} ${props.visible.length === 1 ? 'item' : 'items'}`}</span>
            </div>
            <span className="text-[11px] font-medium text-[#dde5ff]">Sort by: Prep time</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-[#314775]/30 bg-[#070e1d]">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#314775]/30 bg-[#091935] text-[11px] font-semibold uppercase tracking-wider text-[#5f75a5]">
                  <th className="px-3 py-2.5">Dish</th>
                  {pizzaDesk ? <th className="px-3 py-2.5">Starts with</th> : (
                    <>
                      <th className="px-3 py-2.5 text-right">Restaurant (JMD Amount)</th>
                      <th className="px-3 py-2.5 text-right">Customer (Calculated)</th>
                    </>
                  )}
                  <th className="px-3 py-2.5 text-center">Minutes</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#314775]/20">
                {!props.loading && props.visible.length === 0 ? (
                  <tr><td className="px-3 py-8 text-center text-[#5f75a5]" colSpan={pizzaDesk ? 4 : 5}>{props.items.length === 0 ? 'No dishes yet. Add a section, then add the first dish.' : 'Nothing in this view.'}</td></tr>
                ) : null}
                {props.visible.map((item) => {
                  const stale = !props.fresh(item.source_price_checked_at);
                  const selectedRow = props.composing && props.dish.id === String(item.id);
                  return (
                    <tr key={String(item.id)} className={`cursor-pointer ${selectedRow ? 'border-l-4 border-l-[#ffba3e] bg-[#092450]/80' : 'hover:bg-[#091935]/60'}`} onClick={() => props.onEdit(item)}>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${stale ? 'bg-[#ff7443]' : 'bg-[#4db16e]'}`} />
                          <div>
                            <span className={`block font-semibold leading-tight ${selectedRow ? 'text-[#ffba3e]' : 'text-[#dde5ff]'}`}>{String(item.name)}{item.is_available === false ? ' · Sold out' : ''}</span>
                            {pizzaDesk ? null : <span className="text-[10px] font-normal text-[#5f75a5]">{String(item.description || 'No description')}</span>}
                          </div>
                        </div>
                      </td>
                      {pizzaDesk ? (
                        <td className="px-3 py-3 text-[#95abdf]">{startsOn(item, props.categories)}</td>
                      ) : (
                        <>
                          <td className="tabular-money px-3 py-3 text-right font-medium">{props.money(item.in_store_price)}</td>
                          <td className="tabular-money px-3 py-3 text-right font-semibold">{shownCustomer(item, props.markupPercent, props.money)}</td>
                        </>
                      )}
                      <td className="tabular-money px-3 py-3 text-center text-[#95abdf]">{item.prep_time_mins ? `${String(item.prep_time_mins)} min` : '—'}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={stale ? 'inline-flex rounded border border-[#ff7443]/40 bg-[#e55926]/30 px-2 py-0.5 text-[11px] font-semibold text-[#ff7443]' : 'inline-flex rounded border border-[#4db16e]/30 bg-[#004521] px-2 py-0.5 text-[11px] font-semibold text-[#70d38d]'}>{stale ? 'Stale' : 'Fresh'}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[#314775]/20 pt-3 text-xs text-[#5f75a5]">
            <div className="flex items-center gap-3">
              <span>{props.visible.length} total {props.visible.length === 1 ? 'item' : 'items'} in this section</span>
              <span>•</span>
              <span className="font-medium text-[#ff7443]">{props.sectionStale} stale</span>
            </div>
          </div>
          </div>
        </div>
        <div className={pizzaDesk ? 'col-span-4' : 'col-span-5'}>{props.editor}</div>
      </main>
    </div>
  );
}

function SectionPills(props: Props & { addingSection: boolean; setAddingSection: (open: boolean) => void }) {
  const [editingId, setEditingId] = useState('');
  const [draft, setDraft] = useState('');
  const skipBlur = useRef(false);

  function commit(category: { id: string; name: string }) {
    if (skipBlur.current) return;
    skipBlur.current = true;
    setEditingId('');
    props.onRenameSection(category, draft);
  }

  return (
    <>
      {props.categories.map((category) => {
        const count = props.items.filter((item) => String(item.category_id || '') === category.id).length;
        const active = props.sectionFilter === category.id;
        if (editingId === category.id) {
          return (
            <form key={category.id} className="flex shrink-0 items-center" onSubmit={(event) => { event.preventDefault(); commit(category); }}>
              <input
                autoFocus
                aria-label={`New name for ${category.name}`}
                className="!w-28 shrink-0 rounded border border-[#ffba3e] bg-[#070e1d] px-2 py-1 text-xs text-[#dde5ff] outline-none"
                value={draft}
                onBlur={() => commit(category)}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    skipBlur.current = true;
                    setEditingId('');
                  }
                }}
              />
            </form>
          );
        }
        return (
          <span key={category.id} className={active ? 'flex items-center gap-1 whitespace-nowrap rounded border border-[#ffba3e]/40 bg-[#092450] px-2 py-1 text-xs font-semibold text-[#ffba3e]' : 'flex items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-xs font-medium text-[#95abdf] hover:bg-[#091935] hover:text-[#dde5ff]'}>
            <button type="button" onClick={() => props.setSectionFilter(category.id)}>{category.name}</button>
            <span className={active ? 'tabular-money rounded-full bg-[#ffba3e]/20 px-1.5 text-[10px] text-[#ffba3e]' : 'tabular-money text-[10px] text-[#5f75a5]'}>{count}</span>
            <button aria-label={`Rename ${category.name}`} className="rounded p-0.5 text-[#5f75a5] hover:text-[#ffba3e]" title="Rename section" type="button" onClick={() => { skipBlur.current = false; setEditingId(category.id); setDraft(category.name); }}>
              <Icon className="!text-[14px]" name="edit" />
            </button>
            <button aria-label={`Delete ${category.name}`} className="rounded p-0.5 text-[#5f75a5] hover:text-[#ff7443]" title="Delete section" type="button" onClick={() => props.onRemoveSection(category)}>
              <Icon className="!text-[14px]" name="close" />
            </button>
          </span>
        );
      })}
      <button className="rounded p-1 text-[#5f75a5] hover:bg-[#091935] hover:text-[#ffba3e]" title="Add new section" type="button" onClick={() => props.setAddingSection(!props.addingSection)}><Icon name="add" /></button>
      {props.addingSection ? (
        <form className="flex items-center gap-1" onSubmit={(event) => { props.onAddSection(event); props.setAddingSection(false); }}>
          <input className="w-28 rounded border border-[#314775]/50 bg-[#070e1d] px-2 py-1 text-xs" value={props.sectionName} onChange={(event) => props.setSectionName(event.target.value)} />
          <button className="text-xs text-[#ffba3e]" type="submit">Add</button>
        </form>
      ) : null}
    </>
  );
}

function DishEditor(props: Props & { selected: { id: string; name: string } | null; menuOpen: boolean; setMenuOpen: (open: boolean) => void }) {
  const input = 'w-full rounded-lg border border-[#314775]/50 bg-[#070e1d] px-2.5 py-2 text-xs text-[#dde5ff] outline-none focus:border-[#ffba3e]';
  const typed = Number(props.dish.inStorePrice);
  const sectionName = props.categories.find((category) => category.id === props.dish.categoryId)?.name || '';
  const drink = /drink/i.test(sectionName);
  const pizza = /pizza/i.test(sectionName);
  const pizzaMenu = props.categories.find((category) => category.id === props.dish.categoryId)?.pizzaMenu || null;
  const hasSize = props.dish.groups.some((group) => group.kind === 'priced');
  useEffect(() => {
    if (!drink || hasSize) return;
    const size = blankChoice('priced');
    props.setDish({ ...props.dish, groups: [{ ...size, applyToSection: true, options: size.options.slice(0, 1) }, ...props.dish.groups] });
  }, [drink, hasSize, props.dish.categoryId]);
  const sizeIndex = props.dish.groups.findIndex((group) => group.kind === 'priced');
  const sizeGroup = sizeIndex >= 0 ? props.dish.groups[sizeIndex] : null;
  function setSize(patch: Partial<NonNullable<typeof sizeGroup>>) {
    if (!sizeGroup || sizeIndex < 0) return;
    const groups = props.dish.groups.map((group, index) => (index === sizeIndex ? { ...group, ...patch } : group));
    props.setDish({ ...props.dish, groups });
  }
  if (!props.composing) {
    return (
      <div className="flex min-h-[calc(100vh-180px)] items-center justify-center rounded-lg border border-dashed border-[#314775]/40 bg-[#081328] p-6 text-center text-xs text-[#5f75a5]">
        Select a dish to change it, or add one. Press Finish when the details are done.
      </div>
    );
  }
  return (
    <div className="flex min-h-[calc(100vh-180px)] flex-col rounded-lg border border-[#314775]/30 bg-[#081328]">
      <div className="flex items-center justify-between border-b border-[#314775]/30 bg-[#091935] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#ffba3e]" />
          <h3 className="font-headline text-sm font-bold">{props.dish.id ? `Edit Dish: ${props.dish.name || 'Dish'}` : 'New dish'}</h3>
        </div>
        <div className="relative flex items-center gap-2">
          <button className="text-xs text-[#95abdf] xl:hidden" type="button" onClick={props.onCloseEditor}>Close</button>
          <button aria-label="Dish actions" className="rounded p-1.5 text-[#5f75a5] hover:bg-[#0a1e42] hover:text-[#dde5ff]" type="button" onClick={() => props.setMenuOpen(!props.menuOpen)}><Icon name="more_horiz" /></button>
          {props.menuOpen && props.selected ? (
            <div className="absolute right-0 top-8 z-30 w-44 rounded-lg border border-[#314775]/40 bg-[#070e1d] py-1">
              <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#ff7443] hover:bg-[#0a1e42]" type="button" onClick={() => { props.setMenuOpen(false); props.onRemoveSection(props.selected as { id: string; name: string }); }}>
                <Icon className="text-[#ff7443]" name="folder_delete" />
                Remove section
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <form className="flex flex-1 flex-col" id="dish-editor-form" onSubmit={props.onSave}>
        <div className="max-h-[calc(100vh-270px)] space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold">Dish name
              <input className={`mt-1 ${input}`} value={props.dish.name} required onChange={(event) => props.setDish({ ...props.dish, name: event.target.value })} />
            </label>
            <label className="block text-xs font-semibold">Section
              <select className={`mt-1 ${input}`} value={props.dish.categoryId} onChange={(event) => props.setDish({ ...props.dish, categoryId: event.target.value })}>
                <option value="">Choose a section</option>
                {props.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {pizza ? (
              pizzaMenu ? (
                <div className="col-span-2 space-y-3">
                  <PizzaRecipeFields menu={pizzaMenu} recipe={props.dish.recipe || defaultPizzaRecipe(pizzaMenu)} onChange={(recipe) => props.setDish({ ...props.dish, recipe })} />
                  <label className="block text-xs font-semibold">Minutes to prepare
                    <span className="relative mt-1 block">
                      <input className={`tabular-money pr-12 ${input}`} min={1} type="number" value={props.dish.prepMinutes} required onChange={(event) => props.setDish({ ...props.dish, prepMinutes: event.target.value })} />
                      <span className="pointer-events-none absolute right-2.5 top-2 text-xs text-[#5f75a5]">mins</span>
                    </span>
                  </label>
                </div>
              ) : (
                <p className="col-span-2 text-xs text-[#ffba3e]">Save the pizza prices in this section first. Then each pizza only chooses what starts on it.</p>
              )
            ) : drink ? (
              <div className="col-span-2 space-y-2 rounded-lg border border-[#314775]/30 bg-[#070e1d] p-3">
                <p className="text-xs font-semibold">Sizes and prices</p>
                <p className="text-[10px] text-[#5f75a5]">Each size has its own restaurant price. The customer must pick one.</p>
                {(sizeGroup?.options || []).map((option, optionIndex) => (
                  <div key={option.id} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                    <label className="block text-xs font-semibold">Size
                      <input className={`mt-1 ${input}`} placeholder="20-oz" value={option.name} onChange={(event) => {
                        const options = (sizeGroup?.options || []).map((row, index) => index === optionIndex ? { ...row, name: event.target.value } : row);
                        setSize({ options });
                      }} />
                    </label>
                    <label className="block text-xs font-semibold">Price J$
                      <input className={`tabular-money mt-1 ${input}`} inputMode="decimal" placeholder="200" value={option.priceModifier || ''} onChange={(event) => {
                        const options = (sizeGroup?.options || []).map((row, index) => index === optionIndex ? { ...row, priceModifier: Number(event.target.value) || 0 } : row);
                        setSize({ options });
                      }} />
                    </label>
                    {(sizeGroup?.options.length || 0) > 1 ? (
                      <button aria-label="Remove size" className="mb-1 rounded p-1.5 text-[#5f75a5] hover:bg-[#0a1e42] hover:text-[#ff7443]" type="button" onClick={() => setSize({ options: (sizeGroup?.options || []).filter((_, index) => index !== optionIndex) })}>
                        <Icon name="close" />
                      </button>
                    ) : <span className="w-8" />}
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-3">
                  <button aria-label="Add size" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#ffba3e] text-[#583a00]" type="button" onClick={() => setSize({ options: [...(sizeGroup?.options || []), { id: crypto.randomUUID(), name: '', priceModifier: 0, isAvailable: true }] })}>
                    <Icon name="add" />
                  </button>
                  <label className="flex items-center gap-1 text-[11px] text-[#95abdf]">
                    <input checked={Boolean(sizeGroup?.applyToSection)} type="checkbox" onChange={(event) => setSize({ applyToSection: event.target.checked })} />
                    Use on every dish in {sectionName}
                  </label>
                </div>
              </div>
            ) : (
              <>
            <div>
              <label className="block text-xs font-semibold">Restaurant price
                <input className={`tabular-money mt-1 font-semibold ${input}`} inputMode="decimal" value={props.dish.inStorePrice} required={!props.dish.groups.some((group) => group.kind === 'priced')} onChange={(event) => props.setDish({ ...props.dish, inStorePrice: event.target.value })} />
              </label>
              <p className="mt-1 text-[10px] font-medium text-[#4db16e]">{props.dish.groups.some((group) => group.kind === 'priced') ? 'The menu shows the lowest option. The customer pays the one they pick.' : Number.isFinite(typed) && typed > 0 ? `Customer pays ${props.money(props.preview)} (+${props.markupPercent}% calculated)` : 'Customer price is calculated from the restaurant price.'}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold">Minutes to prepare
                <span className="relative mt-1 block">
                  <input className={`tabular-money pr-12 ${input}`} min={1} type="number" value={props.dish.prepMinutes} required onChange={(event) => props.setDish({ ...props.dish, prepMinutes: event.target.value })} />
                  <span className="pointer-events-none absolute right-2.5 top-2 text-xs text-[#5f75a5]">mins</span>
                </span>
              </label>
            </div>
              </>
            )}
          </div>
          <label className="block text-xs font-semibold">Description
            <textarea className={`mt-1 resize-none ${input}`} rows={2} value={props.dish.description} onChange={(event) => props.setDish({ ...props.dish, description: event.target.value })} />
          </label>
          <div className="flex items-center justify-between rounded-lg border border-[#314775]/30 bg-[#070e1d] p-2.5">
            <div>
              <span className="block text-xs font-semibold">Item availability</span>
              <span className="text-[11px] text-[#5f75a5]">Show immediately in the customer menu</span>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input checked={props.dish.isAvailable} className="peer sr-only" type="checkbox" onChange={(event) => props.setDish({ ...props.dish, isAvailable: event.target.checked })} />
              <div className="h-5 w-9 rounded-full bg-[#092450] after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-[#dde5ff] after:transition-all peer-checked:bg-[#4db16e] peer-checked:after:translate-x-full" />
              <span className="ml-2 text-xs font-medium">Available to customers</span>
            </label>
          </div>
          <div>
            <span className="mb-1 block text-xs font-semibold">Dish photo</span>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-[#314775]/60 bg-[#070e1d] p-3">
              <div className="flex min-w-0 items-center gap-2.5">
                {props.dish.imageUrl ? <img alt="" className="h-8 w-8 rounded object-cover" src={props.dish.imageUrl} /> : <div className="flex h-8 w-8 items-center justify-center rounded bg-[#091935] text-[#5f75a5]"><Icon name="photo_camera" /></div>}
                <div className="truncate">
                  <span className="block truncate text-xs font-medium">{props.uploading ? 'Adding photo…' : props.dish.imageUrl ? 'Photo ready' : 'No photo yet'}</span>
                  <span className="font-mono text-[10px] text-[#5f75a5]">{props.dish.imageUrl ? 'Ready' : 'Add a photo'}</span>
                </div>
              </div>
              <label className="shrink-0 cursor-pointer rounded border border-[#314775]/50 bg-[#091935] px-2 py-1 text-xs text-[#5f75a5] hover:bg-[#0a1e42] hover:text-[#dde5ff]">
                Replace
                <input accept="image/*" className="hidden" disabled={props.uploading} type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) props.onUpload(file); }} />
              </label>
            </div>
          </div>
          {!pizza ? <DishChoices groups={props.dish.groups} lists={props.lists} hidePriced={drink} onChange={(groups) => props.setDish({ ...props.dish, groups })} /> : null}
        </div>
        <div className="mt-auto border-t border-[#314775]/30 bg-[#091935] p-4">
          <span className="font-mono text-[11px] text-[#5f75a5]">{props.dish.id ? props.ago(props.items.find((item) => String(item.id) === props.dish.id)?.source_price_checked_at) : 'Press Finish when this dish is ready'}</span>
        </div>
      </form>
    </div>
  );
}

function CashDesk(props: Props & { visible: Row[]; staleCount: number; editor: ReactNode; helpOpen: boolean; setHelpOpen: (open: boolean) => void }) {
  return (
    <main className="mx-auto flex min-h-0 w-full max-w-[390px] flex-1 flex-col overflow-y-auto bg-[#070e1d] pb-12">
      <header className="sticky top-0 z-10 border-b border-[#314775]/30 bg-[#081328] px-3.5 py-2.5">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button className="font-headline text-xs font-bold uppercase tracking-wider text-[#ffba3e]" type="button" onClick={props.onBack}>Roam Rush Ops</button>
            <span className="text-xs text-[#5f75a5]">/</span>
            <span className="text-xs text-[#95abdf]">Cash desk</span>
          </div>
          <button aria-label="Help" className="flex h-7 w-7 items-center justify-center rounded-lg text-[#95abdf]" type="button" onClick={() => props.setHelpOpen(true)}><Icon name="help_outline" /></button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="font-headline truncate text-sm font-bold">{props.restaurantName}</h1>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="rounded border border-[#ffba3e]/30 bg-[#604100]/30 px-1.5 text-[10px] font-bold text-[#ffba3e]">{props.staleCount} Stale</span>
              <span className="text-[11px] text-[#95abdf]">{props.items.length} total dishes</span>
            </div>
          </div>
          <FinishButton className="flex shrink-0 items-center gap-1 rounded-lg bg-[#ffba3e] px-3.5 py-2 font-headline text-xs font-bold text-[#070e1d] disabled:opacity-40" composing={props.composing} saving={props.saving} />
        </div>
      </header>
      <nav className="flex gap-1.5 overflow-x-auto border-b border-[#314775]/20 bg-[#081328]/60 px-3.5 py-2.5">
        <button className={`shrink-0 rounded-lg border px-3 py-1 text-xs ${props.sectionFilter === 'all' ? 'border-[#ffba3e] bg-[#0a1e42] font-semibold text-[#ffba3e]' : 'border-[#314775]/30 text-[#95abdf]'}`} type="button" onClick={() => props.setSectionFilter('all')}>All</button>
        {props.categories.map((category) => (
          <button key={category.id} className={`shrink-0 rounded-lg border px-3 py-1 text-xs ${props.sectionFilter === category.id ? 'border-[#ffba3e] bg-[#0a1e42] font-semibold text-[#ffba3e]' : 'border-[#314775]/30 text-[#95abdf]'}`} type="button" onClick={() => props.setSectionFilter(category.id)}>{category.name}</button>
        ))}
      </nav>
      <div className="flex flex-col gap-3 px-3.5 pb-6 pt-3">
        {props.composing ? props.editor : (
          <>
        {props.staleCount > 0 ? (
          <section className="flex items-start gap-2.5 rounded-lg border border-[#ffba3e]/40 bg-[#091935] p-2.5">
            <Icon className="text-[#ffba3e]" name="warning" />
            <p className="text-xs font-medium">Open an old dish and press Finish so customers can order it.</p>
          </section>
        ) : null}
        {props.visible.map((item) => {
          const stale = !props.fresh(item.source_price_checked_at);
          return (
            <article key={String(item.id)} className="cursor-pointer rounded-lg border border-[#314775]/40 bg-[#091935] p-3" onClick={() => props.onEdit(item)}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-headline truncate text-xs font-bold">{String(item.name)}</h2>
                    {item.is_available === false ? <span className="rounded border border-[#314775] bg-[#092450] px-1.5 py-0.5 text-[10px] text-[#95abdf]">Sold out</span> : null}
                    <span className={stale ? 'rounded border border-[#ffba3e]/40 bg-[#604100]/40 px-1.5 py-0.5 text-[10px] font-bold text-[#ffba3e]' : 'rounded border border-[#4db16e]/40 bg-[#004521]/40 px-1.5 py-0.5 text-[10px] font-bold text-[#4db16e]'}>{stale ? 'Stale' : 'Fresh'}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-[#95abdf]">Prep: <strong className="tabular-money text-[#dde5ff]">{String(item.prep_time_mins || '—')} Min</strong> · {props.ago(item.source_price_checked_at)}</div>
                </div>
                <Icon className="text-[#5f75a5]" name="chevron_right" />
              </div>
              <div className="mt-2.5 border-t border-[#314775]/20 pt-2 text-xs">
                {pizzaRow(item, props.categories) ? (
                  <p className="text-[11px] text-[#95abdf]">Starts with: {startsOn(item, props.categories)}</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded border border-[#314775]/20 bg-[#081328] px-2 py-1.5">
                      <span className="block text-[10px] font-bold uppercase text-[#95abdf]">Restaurant</span>
                      <span className="tabular-money font-semibold">{props.money(item.in_store_price)}</span>
                    </div>
                    <div className="rounded border border-[#314775]/20 bg-[#081328] px-2 py-1.5">
                      <span className="block text-[10px] font-bold uppercase text-[#95abdf]">Customer</span>
                      <span className="tabular-money text-[#95abdf]">{shownCustomer(item, props.markupPercent, props.money)} <span className="text-[10px] text-[#5f75a5]">(Calculated)</span></span>
                    </div>
                  </div>
                )}
              </div>
            </article>
          );
        })}
        <button className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#314775]/60 py-2.5 text-xs font-semibold text-[#95abdf]" type="button" onClick={props.onAddDish}><Icon name="add" /> Add dish</button>
        <section className="rounded-lg border border-[#314775]/40 bg-[#081328] p-3.5">
          <h3 className="font-headline mb-2 flex items-center gap-1.5 text-xs font-bold"><Icon className="text-[#ffba3e]" name="info" /> How prices work</h3>
          <ol className="space-y-2 text-[12px] text-[#95abdf]">
            <li>1. Restaurant price is what the counter charges.</li>
            <li>2. Customer price is calculated from the store markup and cannot be typed.</li>
            <li>3. A price older than 14 days cannot be ordered until you open that dish and press Finish.</li>
          </ol>
        </section>
          </>
        )}
      </div>
    </main>
  );
}

function TabletDesk(props: Props & { visible: Row[]; staleCount: number; editor: ReactNode; setHelpOpen: (open: boolean) => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 w-full items-center justify-between border-b border-[#314775] bg-[#081328] px-4">
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold text-[#95abdf] hover:text-[#ffba3e]" type="button" onClick={props.onBack}><Icon name="arrow_back" /> Restaurants</button>
          <span className="font-mono text-xs text-[#314775]">/</span>
          <h1 className="font-headline text-sm font-bold">Menu prices</h1>
          <span className="inline-flex items-center gap-1 rounded border border-[#314775] bg-[#0a1e42] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#ffba3e]">Roam Rush Ops Desk</span>
        </div>
        <button className="inline-flex items-center gap-1.5 rounded-lg border border-[#314775] bg-[#091935] px-2.5 py-1.5 text-xs font-semibold" type="button" onClick={() => props.setHelpOpen(true)}><Icon className="text-[#ffba3e]" name="help_outline" /> Help & Rules</button>
      </header>
      <main className="flex min-h-0 flex-1">
        <aside className="flex w-[32%] shrink-0 flex-col border-r border-[#314775] bg-[#091935]">
          <div className="border-b border-[#314775] bg-[#081328] p-3.5">
            <div className="font-mono text-[10px] uppercase tracking-widest text-[#95abdf]">Active merchant</div>
            <div className="font-headline text-sm font-bold">{props.restaurantName}</div>
          </div>
          <div className="flex gap-1.5 overflow-x-auto border-b border-[#314775] px-3 py-2">
            <button className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${props.sectionFilter === 'all' ? 'bg-[#ffba3e] text-[#583a00]' : 'border border-[#314775] bg-[#0a1e42] text-[#95abdf]'}`} type="button" onClick={() => props.setSectionFilter('all')}>All</button>
            {props.categories.map((category) => (
              <button key={category.id} className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${props.sectionFilter === category.id ? 'bg-[#ffba3e] font-semibold text-[#583a00]' : 'border border-[#314775] bg-[#0a1e42] text-[#95abdf]'}`} type="button" onClick={() => props.setSectionFilter(category.id)}>{category.name}</button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {props.visible.map((item) => {
              const stale = !props.fresh(item.source_price_checked_at);
              const selectedRow = props.composing && props.dish.id === String(item.id);
              return (
                <button key={String(item.id)} className={`block w-full border-b border-[#314775]/40 px-3 py-3 text-left ${selectedRow ? 'border-l-4 border-l-[#ffba3e] bg-[#081328]' : ''}`} type="button" onClick={() => props.onEdit(item)}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{String(item.name)}</span>
                    <span className={stale ? 'rounded bg-[#e55926]/30 px-1.5 text-[10px] font-semibold text-[#ff7443]' : 'rounded bg-[#004521] px-1.5 text-[10px] font-semibold text-[#70d38d]'}>{stale ? 'Stale' : 'Fresh'}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-[#95abdf]">{pizzaRow(item, props.categories) ? `Starts with: ${startsOn(item, props.categories)}` : `Restaurant: ${props.money(item.in_store_price)} · Customer: ${shownCustomer(item, props.markupPercent, props.money)}`}</div>
                </button>
              );
            })}
          </div>
        </aside>
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-4">{props.editor}</div>
          <div className="flex items-center justify-end gap-2 border-t border-[#314775] bg-[#081328] px-4 py-3">
            <FinishButton className="rounded-lg bg-[#ffba3e] px-4 py-2 text-xs font-semibold text-[#583a00] disabled:opacity-40" composing={props.composing} saving={props.saving} />
          </div>
        </section>
      </main>
    </div>
  );
}

function HelpSheet({ open, markupPercent, onClose }: { open: boolean; markupPercent: number; onClose: () => void }) {
  if (!open) return null;
  const factor = (1 + markupPercent / 100).toFixed(2);
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-[#314775]/40 bg-[#081328] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#314775]/30 bg-[#091935] p-4">
          <div className="flex items-center gap-2">
            <Icon className="text-[#ffba3e]" name="help_outline" />
            <h3 className="font-headline text-sm font-bold">Price calculation & rules</h3>
          </div>
          <button aria-label="Close sheet" className="rounded p-1 text-[#5f75a5] hover:bg-[#0a1e42] hover:text-[#dde5ff]" type="button" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5 text-xs">
          <div className="space-y-2 rounded-lg border border-[#314775]/30 bg-[#070e1d] p-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-[#ffba3e]"><Icon name="calculate" /> Formula & markup logic</div>
            <p className="leading-relaxed text-[#95abdf]">Customer price is calculated from the restaurant price and this store’s markup (<span className="font-semibold text-[#ffba3e]">+{markupPercent}%</span>). You cannot type it.</p>
            <div className="rounded border border-[#314775]/20 bg-black p-2.5 font-mono text-[11px] text-[#5f75a5]">Customer JMD = Restaurant JMD × {factor}, then up to the next 10</div>
          </div>
          <div className="space-y-2 rounded-lg border border-[#314775]/30 bg-[#070e1d] p-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-[#ff7443]"><Icon name="schedule" /> 14-day freshness block</div>
            <p className="leading-relaxed text-[#95abdf]">A dish that has not been saved in <span className="font-semibold text-[#ff7443]">14 days cannot be ordered</span>. Open it and press Finish.</p>
          </div>
          <div className="space-y-2 rounded-lg border border-[#314775]/30 bg-[#070e1d] p-3.5">
            <div className="flex items-center gap-2 text-xs font-bold"><Icon name="payments" /> Jamaican dollar prices</div>
            <p className="leading-relaxed text-[#95abdf]">Prices are in Jamaican dollars. The customer price rounds up to the next 10 dollars.</p>
          </div>
        </div>
        <div className="flex justify-end border-t border-[#314775]/30 bg-[#091935] p-4">
          <button className="rounded-lg border border-[#314775]/50 bg-[#070e1d] px-4 py-1.5 text-xs font-semibold hover:bg-[#0a1e42]" type="button" onClick={onClose}>Got it</button>
        </div>
      </aside>
    </>
  );
}
