import { useState } from 'react';
import {
  defaultPizzaRecipe,
  validatePizzaMenu,
  type PizzaCrust,
  type PizzaMenu,
  type PizzaPortion,
  type PizzaRecipe,
  type PizzaTopping,
} from '@roam/merchant-ops';

type FeeCell = { mode: 'off' | 'price'; amount: string };
type SizeDraft = { id: string; name: string; basePrice: string };
type CrustDraft = { id: string; name: string; description: string; fees: Record<string, FeeCell> };
type ToppingDraft = { id: string; name: string; prices: Record<string, string> };
type Draft = {
  sizes: SizeDraft[];
  crusts: CrustDraft[];
  extraCheese: Record<string, string>;
  sauces: Array<{ id: string; name: string }>;
  meats: ToppingDraft[];
  nonMeats: ToppingDraft[];
};

const quiet = 'w-full bg-transparent text-xs outline-none placeholder:text-[#5f75a5]';

function blankId() {
  return crypto.randomUUID();
}

function priceCell(): FeeCell {
  return { mode: 'price', amount: '' };
}

function feesFor(sizes: SizeDraft[], current: Record<string, FeeCell> | undefined, fallback: FeeCell): Record<string, FeeCell> {
  return Object.fromEntries(sizes.map((size) => [size.id, current?.[size.id] || fallback]));
}

function pricesFor(sizes: SizeDraft[], current: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(sizes.map((size) => [size.id, current?.[size.id] ?? '']));
}

function fromMenu(menu: PizzaMenu): Draft {
  const sizes = menu.sizes.map((size) => ({ id: size.id, name: size.name, basePrice: String(size.basePrice) }));
  return {
    sizes,
    crusts: menu.crusts.map((crust) => ({
      id: crust.id,
      name: crust.name,
      description: crust.description,
      fees: Object.fromEntries(sizes.map((size) => {
        const fee = crust.fees[size.id];
        return [size.id, fee == null ? { mode: 'off' as const, amount: '' } : { mode: 'price' as const, amount: String(fee) }];
      })),
    })),
    extraCheese: Object.fromEntries(sizes.map((size) => [size.id, String(menu.extraCheese[size.id] ?? '')])),
    sauces: menu.sauces.map((sauce) => ({ ...sauce })),
    meats: menu.meats.map((topping) => ({ id: topping.id, name: topping.name, prices: pricesFor(sizes, topping.prices) })),
    nonMeats: menu.nonMeats.map((topping) => ({ id: topping.id, name: topping.name, prices: pricesFor(sizes, topping.prices) })),
  };
}

function amount(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export function menuFromDraft(draft: Draft): { ok: true; menu: PizzaMenu } | { ok: false; error: string } {
  const sizes = draft.sizes.map((size) => {
    const basePrice = amount(size.basePrice);
    return basePrice != null && basePrice > 0 && size.name.trim()
      ? { id: size.id, name: size.name.trim(), basePrice }
      : null;
  });
  if (sizes.some((size) => !size)) return { ok: false, error: 'Every size needs a name and a price' };
  const crusts: PizzaCrust[] = [];
  for (const crust of draft.crusts) {
    if (!crust.name.trim()) return { ok: false, error: 'Every crust needs a name' };
    const fees: Record<string, number | null> = {};
    for (const size of draft.sizes) {
      const cell = crust.fees[size.id];
      if (!cell || cell.mode === 'off') {
        fees[size.id] = null;
        continue;
      }
      const fee = amount(cell.amount);
      if (fee == null) return { ok: false, error: `Enter the ${size.name || 'size'} fee for ${crust.name}, or turn that size off` };
      fees[size.id] = fee;
    }
    crusts.push({ id: crust.id, name: crust.name.trim(), description: crust.description.trim(), fees });
  }
  const extraCheese: Record<string, number> = {};
  for (const size of draft.sizes) {
    const fee = amount(draft.extraCheese[size.id] || '');
    if (fee == null) return { ok: false, error: `Enter the extra cheese price for ${size.name || 'each size'}` };
    extraCheese[size.id] = fee;
  }
  const toToppings = (rows: ToppingDraft[], label: string): PizzaTopping[] | string => {
    const toppings: PizzaTopping[] = [];
    for (const row of rows) {
      if (!row.name.trim()) return `Every ${label} needs a name`;
      const prices: Record<string, number> = {};
      for (const size of draft.sizes) {
        const price = amount(row.prices[size.id] || '');
        if (price == null) return `Enter the ${size.name || 'size'} price for ${row.name}`;
        prices[size.id] = price;
      }
      toppings.push({ id: row.id, name: row.name.trim(), prices });
    }
    return toppings;
  };
  const meats = toToppings(draft.meats, 'meat');
  if (typeof meats === 'string') return { ok: false, error: meats };
  const nonMeats = toToppings(draft.nonMeats, 'topping');
  if (typeof nonMeats === 'string') return { ok: false, error: nonMeats };
  const menu: PizzaMenu = {
    sizes: sizes as PizzaMenu['sizes'],
    crusts,
    extraCheese,
    sauces: draft.sauces.filter((sauce) => sauce.name.trim()).map((sauce) => ({ id: sauce.id, name: sauce.name.trim() })),
    meats,
    nonMeats,
  };
  const invalid = validatePizzaMenu(menu);
  if (invalid) return { ok: false, error: invalid };
  return { ok: true, menu };
}

function standardDraft(): Draft {
  const sizes = ['Individual', 'Medium', 'Large', 'X-Large'].map((name) => ({ id: blankId(), name, basePrice: '' }));
  const cell = (amountValue: string): FeeCell => ({ mode: 'price', amount: amountValue });
  const off = (): FeeCell => ({ mode: 'off', amount: '' });
  const byName = (name: string) => sizes.find((size) => size.name === name)?.id || '';
  const all = (fill: FeeCell) => Object.fromEntries(sizes.map((size) => [size.id, fill]));
  const crust = (name: string, description: string, fees: Record<string, FeeCell>): CrustDraft => ({ id: blankId(), name, description, fees });
  const topping = (name: string): ToppingDraft => ({ id: blankId(), name, prices: pricesFor(sizes, {}) });
  return {
    sizes,
    crusts: [
      crust('Hand Tossed', 'Traditional hand-stretched classic crust', all(cell('0'))),
      crust('Crunchy Thin', 'Crispy thin crust baked golden', all(cell('0'))),
      crust('Handmade Pan', 'Thick golden buttery crust', { ...all(off()), [byName('Medium')]: priceCell() }),
      crust('Stuffed Crust', 'Crust filled with warm melted mozzarella', {
        ...all(off()),
        [byName('Large')]: priceCell(),
        [byName('X-Large')]: priceCell(),
      }),
    ],
    extraCheese: pricesFor(sizes, {}),
    sauces: [{ id: blankId(), name: 'Pizza Sauce' }],
    meats: ['Pepperoni', 'Ham', 'Beef', 'BBQ Chicken', 'Jerk Chicken'].map(topping),
    nonMeats: ['Pineapple', 'Mushrooms', 'Onions', 'Green Peppers', 'Black Olives', 'Jalapeños', 'Provolone', 'Cheddar'].map(topping),
  };
}

function columns(count: number) {
  return { gridTemplateColumns: `minmax(9.5rem, 1.4fr) repeat(${Math.max(count, 1)}, minmax(5.25rem, 1fr))` };
}

function MoneyField({ value, onChange, marked }: { value: string; onChange: (value: string) => void; marked?: boolean }) {
  return (
    <div className="relative rounded-lg border border-[#314775]/40 bg-[#091935] focus-within:border-[#ffba3e]">
      {marked ? <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase text-[#5f75a5]">JMD</span> : null}
      <input className={`tabular-money w-full bg-transparent py-1 pr-2 text-right text-xs text-[#dde5ff] outline-none placeholder:text-[#5f75a5]/70 ${marked ? 'pl-9' : 'px-2'}`} inputMode="decimal" placeholder="Amount" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function AddLink({ label, onClick }: { label: string; onClick: () => void }) {
  return <button className="flex items-center gap-0.5 text-[11px] font-medium text-[#ffba3e] hover:text-[#ffcc7d]" type="button" onClick={onClick}>+ {label}</button>;
}

export function PizzaPricesPanel({ menu, onSave }: { menu: PizzaMenu | null; onSave: (menu: PizzaMenu) => void }) {
  const [draft, setDraft] = useState<Draft>(() => (menu ? fromMenu(menu) : standardDraft()));
  const [error, setError] = useState('');
  function save() {
    const parsed = menuFromDraft(draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError('');
    onSave(parsed.menu);
  }
  function setSizes(sizes: SizeDraft[]) {
    setDraft((current) => ({
      ...current,
      sizes,
      crusts: current.crusts.map((crust) => ({ ...crust, fees: feesFor(sizes, crust.fees, { mode: 'off', amount: '' }) })),
      extraCheese: pricesFor(sizes, current.extraCheese),
      meats: current.meats.map((topping) => ({ ...topping, prices: pricesFor(sizes, topping.prices) })),
      nonMeats: current.nonMeats.map((topping) => ({ ...topping, prices: pricesFor(sizes, topping.prices) })),
    }));
  }
  return (
    <div className="overflow-hidden rounded-lg border border-[#314775]/30 bg-[#081328]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#314775]/30 bg-[#091935]/40 p-4">
        <div>
          <h2 className="font-headline text-base font-bold tracking-tight">Pizza prices</h2>
          <p className="mt-0.5 text-xs text-[#95abdf]">These prices are shared by every pizza in this section.</p>
        </div>
        <button className="flex items-center gap-1 text-xs font-medium text-[#ffba3e] hover:text-[#ffcc7d]" type="button" onClick={() => { setDraft(standardDraft()); setError(''); }}>Use the standard pizza layout</button>
      </div>
      <div className="space-y-6 overflow-x-auto p-4">
        <SizeBoard draft={draft} onChange={setSizes} onCheese={(extraCheese) => setDraft({ ...draft, extraCheese })} />
        <CrustBoard draft={draft} onChange={(crusts) => setDraft({ ...draft, crusts })} />
        <ToppingBoard addLabel="Add meat" label="Meats" rows={draft.meats} sizes={draft.sizes} onChange={(meats) => setDraft({ ...draft, meats })} />
        <ToppingBoard addLabel="Add topping" label="Non-meats" rows={draft.nonMeats} sizes={draft.sizes} onChange={(nonMeats) => setDraft({ ...draft, nonMeats })} />
        <SauceBoard draft={draft} onChange={(sauces) => setDraft({ ...draft, sauces })} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#314775]/30 bg-[#091935] p-4">
        <p className={`text-[11px] ${error ? 'text-[#ff7443]' : 'text-[#95abdf]'}`}>{error || 'A blank price cannot be saved. Zero means free.'}</p>
        <button className="rounded-lg bg-[#ffba3e] px-5 py-2 text-xs font-bold text-[#583a00] hover:bg-[#f2ab22]" type="button" onClick={save}>Save pizza prices</button>
      </div>
    </div>
  );
}

function SizeBoard({ draft, onChange, onCheese }: { draft: Draft; onChange: (sizes: SizeDraft[]) => void; onCheese: (fees: Record<string, string>) => void }) {
  return (
    <div className="min-w-[36rem] overflow-hidden rounded-lg border border-[#314775]/30 bg-[#091935]/20">
      <div className="grid items-center border-b border-[#314775]/30 bg-[#0a1e42]/40 px-3 py-2 text-xs" style={columns(draft.sizes.length)}>
        <div className="flex items-center justify-between pr-3">
          <span className="font-headline text-[11px] font-semibold uppercase tracking-wider text-[#95abdf]">Size tier</span>
          <AddLink label="Add size" onClick={() => onChange([...draft.sizes, { id: blankId(), name: '', basePrice: '' }])} />
        </div>
        {draft.sizes.map((size, index) => (
          <div key={size.id} className="flex items-center justify-between gap-1 border-l border-[#314775]/30 px-2">
            <input className={`${quiet} font-headline font-bold`} placeholder="Size" value={size.name} onChange={(event) => onChange(draft.sizes.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} />
            {draft.sizes.length > 1 ? <button aria-label="Remove size" className="text-[#5f75a5] hover:text-[#ff7443]" type="button" onClick={() => onChange(draft.sizes.filter((row) => row.id !== size.id))}>×</button> : null}
          </div>
        ))}
      </div>
      <div className="grid items-center border-b border-[#314775]/20 bg-[#081328] px-3 py-2.5" style={columns(draft.sizes.length)}>
        <div className="pr-3">
          <p className="text-xs font-semibold">Base JMD</p>
          <p className="text-[11px] text-[#95abdf]">Standard dough, default sauce and cheese</p>
        </div>
        {draft.sizes.map((size, index) => (
          <div key={size.id} className="px-1">
            <MoneyField marked value={size.basePrice} onChange={(basePrice) => onChange(draft.sizes.map((row, rowIndex) => rowIndex === index ? { ...row, basePrice } : row))} />
          </div>
        ))}
      </div>
      <div className="grid items-center bg-[#081328]/70 px-3 py-2.5" style={columns(draft.sizes.length)}>
        <div className="pr-3">
          <p className="text-xs font-semibold">Extra cheese</p>
          <p className="text-[11px] text-[#95abdf]">Fee when the customer asks for extra</p>
        </div>
        {draft.sizes.map((size) => (
          <div key={size.id} className="px-1">
            <MoneyField marked value={draft.extraCheese[size.id] || ''} onChange={(amountValue) => onCheese({ ...draft.extraCheese, [size.id]: amountValue })} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CrustBoard({ draft, onChange }: { draft: Draft; onChange: (crusts: CrustDraft[]) => void }) {
  return (
    <div className="min-w-[36rem] overflow-hidden rounded-lg border border-[#314775]/30">
      <div className="flex items-center justify-between border-b border-[#314775]/30 bg-[#0a1e42]/60 px-3 py-2">
        <span className="font-headline text-xs font-bold uppercase tracking-wider">Crusts</span>
        <AddLink label="Add crust" onClick={() => onChange([...draft.crusts, { id: blankId(), name: '', description: '', fees: feesFor(draft.sizes, {}, { mode: 'off', amount: '' }) }])} />
      </div>
      <div className="divide-y divide-[#314775]/20">
        {draft.crusts.map((crust, index) => (
          <div key={crust.id} className="grid items-center bg-[#081328] px-3 py-2" style={columns(draft.sizes.length)}>
            <div className="pr-3">
              <div className="flex items-center gap-1">
                <input className={`${quiet} font-semibold`} placeholder="Crust name" value={crust.name} onChange={(event) => onChange(draft.crusts.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} />
                <button aria-label="Remove crust" className="text-[#5f75a5] hover:text-[#ff7443]" type="button" onClick={() => onChange(draft.crusts.filter((row) => row.id !== crust.id))}>×</button>
              </div>
              <input className={`${quiet} text-[11px] text-[#95abdf]`} placeholder="Short description" value={crust.description} onChange={(event) => onChange(draft.crusts.map((row, rowIndex) => rowIndex === index ? { ...row, description: event.target.value } : row))} />
            </div>
            {draft.sizes.map((size) => {
              const cell = crust.fees[size.id] || { mode: 'off' as const, amount: '' };
              const on = cell.mode === 'price';
              return (
                <div key={size.id} className="flex items-center gap-1.5 px-1">
                  <button className={on ? 'rounded bg-[#ffba3e] px-1.5 py-0.5 text-[10px] font-bold text-[#583a00]' : 'rounded border border-[#314775]/30 bg-[#091935] px-2 py-0.5 text-[10px] font-medium text-[#5f75a5]'} type="button" onClick={() => onChange(draft.crusts.map((row, rowIndex) => rowIndex === index ? { ...row, fees: { ...row.fees, [size.id]: { mode: on ? 'off' : 'price', amount: cell.amount } } } : row))}>{on ? 'On' : 'Off'}</button>
                  {on ? <MoneyField value={cell.amount} onChange={(amountValue) => onChange(draft.crusts.map((row, rowIndex) => rowIndex === index ? { ...row, fees: { ...row.fees, [size.id]: { mode: 'price', amount: amountValue } } } : row))} /> : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function ToppingBoard({ label, addLabel, rows, sizes, onChange }: { label: string; addLabel: string; rows: ToppingDraft[]; sizes: SizeDraft[]; onChange: (rows: ToppingDraft[]) => void }) {
  return (
    <div className="min-w-[36rem] overflow-hidden rounded-lg border border-[#314775]/30">
      <div className="flex items-center justify-between border-b border-[#314775]/30 bg-[#0a1e42]/60 px-3 py-2">
        <span className="font-headline text-xs font-bold uppercase tracking-wider">{label}</span>
        <AddLink label={addLabel} onClick={() => onChange([...rows, { id: blankId(), name: '', prices: pricesFor(sizes, {}) }])} />
      </div>
      <div className="divide-y divide-[#314775]/20">
        {rows.map((row, index) => (
          <div key={row.id} className="grid items-center bg-[#081328] px-3 py-1.5" style={columns(sizes.length)}>
            <div className="flex items-center gap-1 pr-3">
              <input className={`${quiet} font-medium`} placeholder="Name" value={row.name} onChange={(event) => onChange(rows.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} />
              <button aria-label={`Remove ${label}`} className="text-[#5f75a5] hover:text-[#ff7443]" type="button" onClick={() => onChange(rows.filter((item) => item.id !== row.id))}>×</button>
            </div>
            {sizes.map((size) => (
              <div key={size.id} className="px-1">
                <MoneyField value={row.prices[size.id] || ''} onChange={(amountValue) => onChange(rows.map((item, itemIndex) => itemIndex === index ? { ...item, prices: { ...item.prices, [size.id]: amountValue } } : item))} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SauceBoard({ draft, onChange }: { draft: Draft; onChange: (sauces: Draft['sauces']) => void }) {
  return (
    <div className="rounded-lg border border-[#314775]/30 bg-[#081328] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-headline text-xs font-bold uppercase tracking-wider">Sauces</span>
        <span className="text-[11px] text-[#95abdf]">Sauces are included. They do not add a price.</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {draft.sauces.map((sauce, index) => (
          <div key={sauce.id} className="flex items-center gap-2 rounded-lg border border-[#314775]/40 bg-[#091935] px-3 py-1 text-xs">
            <input className={`${quiet} w-28 font-medium`} placeholder="Sauce" value={sauce.name} onChange={(event) => onChange(draft.sauces.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} />
            <span className="text-[10px] font-semibold uppercase text-[#5f75a5]">Included</span>
            <button aria-label="Remove sauce" className="text-[#5f75a5] hover:text-[#ff7443]" type="button" onClick={() => onChange(draft.sauces.filter((row) => row.id !== sauce.id))}>×</button>
          </div>
        ))}
        <button className="flex items-center gap-1 rounded-lg border border-dashed border-[#314775] px-3 py-1 text-xs font-medium text-[#95abdf] hover:border-[#ffba3e] hover:text-[#ffba3e]" type="button" onClick={() => onChange([...draft.sauces, { id: blankId(), name: '' }])}>+ Add sauce</button>
      </div>
    </div>
  );
}

function PortionSwitch({ value, onPick }: { value: '' | PizzaPortion; onPick: (value: '' | PizzaPortion) => void }) {
  const options: Array<['' | PizzaPortion, string]> = [['', 'Off'], ['normal', 'Normal'], ['extra', 'Extra']];
  return (
    <div className="inline-flex rounded-lg border border-[#314775]/40 bg-[#0a1e42] p-0.5">
      {options.map(([option, label]) => (
        <button key={label} className={value === option ? 'rounded bg-[#ffba3e] px-2.5 py-0.5 text-[10px] font-bold text-[#583a00]' : 'px-2 py-0.5 text-[10px] font-medium text-[#5f75a5]'} type="button" onClick={() => onPick(option)}>{label}</button>
      ))}
    </div>
  );
}

export function PizzaRecipeFields({ menu, recipe, onChange }: { menu: PizzaMenu; recipe: PizzaRecipe; onChange: (recipe: PizzaRecipe) => void }) {
  function portionFor(id: string): '' | PizzaPortion {
    return recipe.toppings.find((topping) => topping.id === id)?.portion || '';
  }
  function setPortion(id: string, value: '' | PizzaPortion) {
    const rest = recipe.toppings.filter((topping) => topping.id !== id);
    onChange({ ...recipe, toppings: value ? [...rest, { id, portion: value }] : rest });
  }
  return (
    <div className="space-y-4 rounded-lg border border-[#314775]/30 bg-[#091935]/20 p-3">
      <div className="border-b border-[#314775]/20 pb-2">
        <h3 className="font-headline text-xs font-bold">How this pizza starts</h3>
        <p className="text-[11px] text-[#95abdf]">What is already on it when a customer opens this pizza.</p>
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-[#95abdf]">Cheese</p>
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-[#314775]/30 bg-[#091935] p-0.5">
          {(['normal', 'extra'] as const).map((cheese) => (
            <button key={cheese} className={recipe.cheese === cheese ? 'rounded bg-[#ffba3e] py-1 text-xs font-bold text-[#583a00]' : 'py-1 text-xs font-medium text-[#95abdf]'} type="button" onClick={() => onChange({ ...recipe, cheese })}>{cheese === 'normal' ? 'Normal' : 'Extra'}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-[#95abdf]">Usual crust</p>
        <div className="space-y-1.5">
          {menu.crusts.map((crust) => (
            <label key={crust.id} className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-1.5 ${recipe.crustId === crust.id ? 'border-[#314775]/20 bg-[#091935]/80' : 'border-[#314775]/10 bg-[#091935]/40'}`}>
              <input checked={recipe.crustId === crust.id} className="accent-[#ffba3e]" name={`crust-${menu.sizes[0]?.id || 'pizza'}`} type="radio" onChange={() => onChange({ ...recipe, crustId: crust.id })} />
              <span className="text-xs font-medium">{crust.name}</span>
              {recipe.crustId === crust.id ? <span className="ml-auto font-mono text-[10px] text-[#ffba3e]">Starts on this</span> : null}
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-[#95abdf]">Sauce</p>
        <div className="flex flex-wrap items-center gap-3">
          {menu.sauces.map((sauce) => (
            <label key={sauce.id} className="flex cursor-pointer items-center gap-2 text-xs">
              <input checked={recipe.sauceId === sauce.id} className="accent-[#ffba3e]" name={`sauce-${menu.sizes[0]?.id || 'pizza'}`} type="radio" onChange={() => onChange({ ...recipe, sauceId: sauce.id })} />
              <span className={recipe.sauceId === sauce.id ? 'font-medium' : 'text-[#95abdf]'}>{sauce.name}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-3 border-t border-[#314775]/20 pt-3">
        <div className="flex items-center justify-between">
          <span className="font-headline text-[11px] font-bold uppercase tracking-wider">Toppings already on it</span>
          <span className="font-mono text-[10px] text-[#5f75a5]">Cheese is separate</span>
        </div>
        {([{ title: 'Meats', rows: menu.meats }, { title: 'Non-meats', rows: menu.nonMeats }] as const).map((group) => (
          <div key={group.title} className="space-y-2">
            <span className="block text-[11px] font-semibold text-[#95abdf]">{group.title}</span>
            {group.rows.map((topping) => {
              const portion = portionFor(topping.id);
              return (
                <div key={topping.id} className={`flex items-center justify-between rounded-lg border p-2 ${portion ? 'border-[#314775]/30 bg-[#091935]' : 'border-[#314775]/20 bg-[#091935]/60'}`}>
                  <span className={portion ? 'text-xs font-medium' : 'text-xs text-[#95abdf]'}>{topping.name}</span>
                  <PortionSwitch value={portion} onPick={(value) => setPortion(topping.id, value)} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export { defaultPizzaRecipe };
