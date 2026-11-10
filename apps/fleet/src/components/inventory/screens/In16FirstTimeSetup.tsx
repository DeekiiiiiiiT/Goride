/** Ported from Stitch — do not simplify layout (audit §0.4). Real steps and counts (IV-14). */
import { STARTER_ITEMS, useIn16SetupForm } from './hooks/useIn16SetupForm';

function StepDot({ n, done }: { n: number; done: boolean }) {
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-label-code text-caption font-bold shadow-sm z-10 ${done ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface'}`}>
      {done ? <span aria-hidden="true" className="material-symbols-outlined text-[16px]">check</span> : n}
    </div>
  );
}

export function In16FirstTimeSetup() {
  const form = useIn16SetupForm();
  const { live } = form;
  const kitName = live.complianceRows[0] ? String(live.complianceRows[0].kit_code ?? 'Kit') : null;
  const kitLines = new Set(live.complianceRows.map((r) => String(r.kit_line_id ?? ''))).size;
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full">
      <div className="w-full max-w-[1240px] mx-auto px-margin-desktop py-space-xl flex flex-col gap-space-xl">

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-lg">
      <div className="flex flex-col gap-space-xs">
      <span className="font-label-code text-caption uppercase tracking-wider text-secondary">First-time setup</span>
      <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Inventory & Asset Management</h1>
      <p className="font-body-md text-body-md text-secondary max-w-2xl">Set up where you keep stock, your items, and the kit for your cars in 3 steps.</p>
      </div>
      <div className="bg-surface-container-high px-space-md py-1.5 rounded-full flex items-center gap-space-sm shadow-sm self-start md:self-auto">
      <span className="font-label-code text-caption font-semibold uppercase tracking-wider text-on-surface">{form.itemCount} item{form.itemCount === 1 ? '' : 's'} set up</span>
      </div>
      </div>

      <div className="w-full flex flex-col items-center gap-space-xl">
      <section className="w-full max-w-[820px] bg-surface-container-lowest rounded-xl shadow-md overflow-hidden">

      <div className="bg-surface-container-low px-space-xl py-space-lg flex items-center justify-between">
      <div className="flex items-center gap-space-md">
      <div className="w-10 h-10 rounded-lg bg-surface-container-lowest shadow-sm flex items-center justify-center text-primary">
      <span aria-hidden="true" className="material-symbols-outlined text-[22px]">inventory_2</span>
      </div>
      <h2 className="font-headline-sm text-headline-sm text-on-surface leading-tight">Set up inventory</h2>
      </div>
      <div className="flex flex-col items-end gap-1">
      <span className="font-label-code text-caption text-on-surface font-bold" data-stitch-data-stitch-id="step-counter-text">{form.stepsDone} of 3 steps done</span>
      <div className="w-32 h-1.5 bg-surface-container-highest rounded-full overflow-hidden flex gap-0.5">
      {[0, 1, 2].map((i) => (
      <div key={i} className={`h-full flex-1 ${i < form.stepsDone ? 'bg-primary' : 'bg-surface-container-high'}`} data-stitch-data-stitch-id="progress-bar-segment"></div>
      ))}
      </div>
      </div>
      </div>

      <div className="p-space-xl flex flex-col gap-space-xl">

      <div className="flex gap-space-lg">
      <div className="flex flex-col items-center">
      <StepDot n={1} done={form.stores.length > 0} />
      <div className="w-0.5 h-full bg-surface-container-highest my-2"></div>
      </div>
      <div className="flex-1 pb-space-lg flex flex-col gap-space-md">
      <div>
      <h3 className="font-headline-sm text-headline-sm text-on-surface">Add where you keep stock</h3>
      <p className="font-body-md text-body-md text-secondary mt-1">Every item lives in a store or in a car.</p>
      </div>
      <div className="bg-surface-container-low p-space-md rounded-lg flex flex-col gap-space-md">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-space-sm">
      <input className="flex-1 bg-surface-container-lowest text-on-surface font-body-md text-body-md px-space-md py-2 rounded shadow-sm focus:outline-none focus:ring-1 focus:ring-primary" data-stitch-data-stitch-id="storeroom-input" placeholder="e.g. Main store" type="text" value={form.locationName} onChange={(e) => form.setLocationName(e.target.value)} aria-label="Store name"/>
      <button type="button" className="bg-primary text-on-primary font-body-md text-body-md font-medium px-space-lg py-2 rounded active:scale-95 flex items-center justify-center gap-space-xs shadow-sm disabled:opacity-60" data-stitch-data-stitch-id="add-location-btn" disabled={form.submit.saving} onClick={() => void form.addLocation().catch(() => undefined)}>
      <span aria-hidden="true" className="material-symbols-outlined text-[16px]">add_location_alt</span>
      <span>Add location</span>
      </button>
      </div>
      {form.stores.map((l) => (
      <div key={String(l.id)} className="flex items-center justify-between bg-surface-container-lowest px-space-md py-space-sm rounded shadow-sm">
      <div className="flex items-center gap-space-sm">
      <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-primary">check</span>
      <span className="font-body-md text-body-md font-semibold text-on-surface">{String(l.name ?? l.code)}</span>
      <span className="font-label-code text-caption text-secondary">{String(l.code ?? '')}</span>
      </div>
      {l.is_default === true ? <span className="font-label-code text-caption text-secondary bg-surface-container-low px-2 py-0.5 rounded">Default</span> : null}
      </div>
      ))}
      </div>
      </div>
      </div>

      <div className="flex gap-space-lg">
      <div className="flex flex-col items-center">
      <StepDot n={2} done={form.itemCount > 0} />
      <div className="w-0.5 h-full bg-surface-container-highest my-2"></div>
      </div>
      <div className="flex-1 pb-space-lg flex flex-col gap-space-md">
      <div>
      <h3 className="font-headline-sm text-headline-sm text-on-surface">Add your items</h3>
      <p className="font-body-md text-body-md text-secondary mt-1">Import a list, or add items one by one.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
      <div className="bg-surface-container-low rounded-lg p-space-md flex flex-col justify-between shadow-sm" data-stitch-data-stitch-id="card-starter-pack">
      <div className="flex flex-col gap-space-sm">
      <span className="font-headline-sm text-[15px] text-on-surface font-semibold">Suggested starter items</span>
      <div className="flex flex-wrap gap-1.5 py-1">
      {STARTER_ITEMS.map((n) => <span key={n} className="bg-surface-container-lowest text-on-surface font-label-code text-[11px] px-2 py-0.5 rounded shadow-sm">{n}</span>)}
      </div>
      </div>
      <div className="pt-space-md mt-space-sm flex items-center justify-end">
      <button type="button" className="bg-primary text-on-primary font-body-sm text-body-sm font-semibold px-space-md py-1.5 rounded flex items-center gap-space-xs shadow-sm" data-stitch-data-stitch-id="load-starter-btn" onClick={() => form.loadStarter()}>
      <span aria-hidden="true" className="material-symbols-outlined text-[16px]">file_download_done</span>
      <span>Load starter list ({STARTER_ITEMS.length} items)</span>
      </button>
      </div>
      </div>
      <div className="bg-surface-container-low rounded-lg p-space-md flex flex-col justify-between shadow-sm">
      <div className="flex flex-col gap-space-sm">
      <span className="font-headline-sm text-[15px] text-on-surface font-semibold">Add items myself</span>
      <p className="font-body-sm text-body-sm text-secondary">Import your own CSV, or add each item by hand.</p>
      </div>
      <div className="pt-space-md mt-space-sm flex items-center justify-end">
      <button type="button" onClick={() => form.shell.openGap('item-editor', { itemId: null })} className="bg-surface-container-lowest hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-medium px-space-md py-1.5 rounded shadow-sm flex items-center gap-space-xs">
      <span aria-hidden="true" className="material-symbols-outlined text-[16px]">edit_document</span>
      <span>Add an item</span>
      </button>
      </div>
      </div>
      </div>
      </div>
      </div>

      <div className="flex gap-space-lg">
      <div className="flex flex-col items-center">
      <StepDot n={3} done={form.carsOnKit > 0} />
      </div>
      <div className="flex-1 flex flex-col gap-space-md">
      <div>
      <h3 className="font-headline-sm text-headline-sm text-on-surface">Pick a kit for your cars</h3>
      <p className="font-body-md text-body-md text-secondary mt-1">The list of items every car should carry.</p>
      </div>
      <div className="bg-surface-container-low rounded-lg p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm shadow-sm">
      <div className="flex items-center gap-space-md">
      <div className="w-10 h-10 rounded-lg bg-surface-container-lowest flex items-center justify-center text-primary shadow-sm">
      <span aria-hidden="true" className="material-symbols-outlined text-[20px]">directions_car</span>
      </div>
      <div>
      <span className="font-headline-sm text-[16px] text-on-surface font-semibold">{kitName ?? 'No kit yet'}</span>
      <p className="font-caption text-caption text-secondary mt-0.5">
      {kitName ? `${kitLines} kit lines · on ${form.carsOnKit} car${form.carsOnKit === 1 ? '' : 's'}` : 'Create the kit, then put cars on it.'}
      </p>
      </div>
      </div>
      <button type="button" className="bg-surface-container-lowest hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-medium px-space-md py-1.5 rounded shadow-sm" onClick={() => form.shell.openModal('kit-editor')}>Edit kit</button>
      </div>
      </div>
      </div>
      </div>

      <div className="bg-surface-container-low px-space-xl py-space-lg flex items-center justify-end">
      <button type="button" className="w-full sm:w-auto bg-primary text-on-primary font-headline-sm text-body-md font-semibold px-8 py-3 rounded-lg shadow-md active:scale-95 flex items-center justify-center gap-space-sm" data-stitch-data-stitch-id="finish-setup-btn" onClick={() => form.finishSetup()}>
      <span>Finish setup</span>
      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_forward</span>
      </button>
      </div>
      </section>

      <section className="w-full max-w-[820px] bg-surface-container-low rounded-xl p-space-xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-space-xl">
      <div className="flex flex-col gap-1">
      <h3 className="font-headline-sm text-headline-sm text-on-surface">Count what you actually have so your numbers start right</h3>
      <p className="font-body-md text-body-md text-secondary">Enter what is in the store and in each car today.</p>
      </div>
      <div className="flex flex-col items-stretch sm:items-end gap-space-sm w-full md:w-auto flex-shrink-0">
      <button type="button" className="bg-primary text-on-primary font-body-md text-body-md font-semibold px-space-xl py-2.5 rounded-lg shadow-sm active:scale-95 flex items-center justify-center gap-space-xs" onClick={() => form.shell.openGap('opening-balances')}>
      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">fact_check</span>
      <span>Enter opening balances</span>
      </button>
      <button type="button" onClick={() => form.finishSetup()} className="px-space-md py-1.5 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface font-body-sm text-body-sm">
                  Count later
                </button>
      </div>
      </section>
      </div>
      </div>
      </div></div>
    </div>
  );
}
