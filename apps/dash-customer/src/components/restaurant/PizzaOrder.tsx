import { crustFee, type PizzaMenu, type PizzaPick, type PizzaPortion, type PizzaRecipe } from '@roam/merchant-ops/pizzaMenu';

export function startingPizzaPick(menu: PizzaMenu, recipe: PizzaRecipe): PizzaPick {
  const size = menu.sizes.find((entry) => crustFee(menu, recipe.crustId, entry.id) != null) || menu.sizes[0];
  const crusts = menu.crusts.filter((crust) => size && crustFee(menu, crust.id, size.id) != null);
  const crustId = crusts.some((crust) => crust.id === recipe.crustId) ? recipe.crustId : crusts[0]?.id || recipe.crustId;
  return { sizeId: size?.id || '', crustId, cheese: recipe.cheese, sauceId: recipe.sauceId, toppings: recipe.toppings };
}

export function PizzaOrder({
  menu,
  pick,
  money,
  onChange,
}: {
  menu: PizzaMenu;
  pick: PizzaPick;
  money: (amount: number) => string;
  onChange: (pick: PizzaPick) => void;
}) {
  const size = menu.sizes.find((entry) => entry.id === pick.sizeId) || menu.sizes[0];
  const crusts = menu.crusts.filter((crust) => size && crustFee(menu, crust.id, size.id) != null);
  const toppings = [...menu.meats.map((topping) => ({ ...topping, group: 'Meats' })), ...menu.nonMeats.map((topping) => ({ ...topping, group: 'Non-meats' }))];
  function feeLabel(amount: number) {
    if (amount <= 0) return 'Included';
    return `+${money(amount)}`;
  }
  function setSize(sizeId: string) {
    const stillThere = crustFee(menu, pick.crustId, sizeId) != null;
    const nextCrust = stillThere ? pick.crustId : menu.crusts.find((crust) => crustFee(menu, crust.id, sizeId) != null)?.id || pick.crustId;
    onChange({ ...pick, sizeId, crustId: nextCrust });
  }
  function portionFor(id: string): '' | PizzaPortion {
    return pick.toppings.find((topping) => topping.id === id)?.portion || '';
  }
  function setPortion(id: string, value: string) {
    const rest = pick.toppings.filter((topping) => topping.id !== id);
    onChange({
      ...pick,
      toppings: value === 'normal' || value === 'extra' ? [...rest, { id, portion: value }] : rest,
    });
  }
  return (
    <div className="px-margin-mobile py-inset-md space-y-6">
      <section>
        <h2 className="mb-3 font-headline-sm text-headline-sm text-on-surface">Size</h2>
        <div className="flex flex-wrap gap-2">
          {menu.sizes.map((entry) => (
            <button key={entry.id} className={`rounded-full border px-4 py-2 font-label-md text-label-md ${entry.id === size?.id ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant text-on-surface'}`} type="button" onClick={() => setSize(entry.id)}>
              {entry.name}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-3 font-headline-sm text-headline-sm text-on-surface">Crust</h2>
        <div className="space-y-3">
          {crusts.map((crust) => {
            const fee = size ? crustFee(menu, crust.id, size.id) : null;
            return (
              <label key={crust.id} className="flex items-start justify-between gap-3">
                <span>
                  <span className="block font-body-md text-body-md text-on-surface">{crust.name}</span>
                  {crust.description ? <span className="block font-body-sm text-body-sm text-on-surface-variant">{crust.description}</span> : null}
                  <span className="block font-body-sm text-body-sm text-on-surface-variant">{feeLabel(fee || 0)}</span>
                </span>
                <input checked={pick.crustId === crust.id} className="custom-radio" name="pizza-crust" type="radio" onChange={() => onChange({ ...pick, crustId: crust.id })} />
              </label>
            );
          })}
        </div>
      </section>
      <section>
        <h2 className="mb-3 font-headline-sm text-headline-sm text-on-surface">Cheese</h2>
        {(['normal', 'extra'] as const).map((amount) => (
          <label key={amount} className="mb-2 flex items-center justify-between">
            <span className="font-body-md text-body-md text-on-surface">{amount === 'extra' ? `Extra · ${feeLabel(size ? menu.extraCheese[size.id] || 0 : 0)}` : 'Normal · Included'}</span>
            <input checked={pick.cheese === amount} className="custom-radio" name="pizza-cheese" type="radio" onChange={() => onChange({ ...pick, cheese: amount })} />
          </label>
        ))}
      </section>
      <section>
        <h2 className="mb-3 font-headline-sm text-headline-sm text-on-surface">Sauce</h2>
        {menu.sauces.map((sauce) => (
          <label key={sauce.id} className="mb-2 flex items-center justify-between">
            <span className="font-body-md text-body-md text-on-surface">{sauce.name}</span>
            <input checked={pick.sauceId === sauce.id} className="custom-radio" name="pizza-sauce" type="radio" onChange={() => onChange({ ...pick, sauceId: sauce.id })} />
          </label>
        ))}
      </section>
      {['Meats', 'Non-meats'].map((group) => (
        <section key={group}>
          <h2 className="mb-3 font-headline-sm text-headline-sm text-on-surface">{group}</h2>
          <div className="space-y-3">
            {toppings.filter((topping) => topping.group === group).map((topping) => {
              const price = size ? topping.prices[size.id] || 0 : 0;
              return (
                <label key={topping.id} className="flex items-center justify-between gap-3">
                  <span>
                    <span className="block font-body-md text-body-md text-on-surface">{topping.name}</span>
                    <span className="block font-body-sm text-body-sm text-on-surface-variant">{feeLabel(price)} · Extra is double</span>
                  </span>
                  <select className="rounded-lg border border-outline-variant bg-surface px-2 py-1 text-on-surface" value={portionFor(topping.id)} onChange={(event) => setPortion(topping.id, event.target.value)}>
                    <option value="">Off</option>
                    <option value="normal">Normal</option>
                    <option value="extra">Extra</option>
                  </select>
                </label>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
