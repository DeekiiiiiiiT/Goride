/** Ported from Stitch — do not simplify layout (audit §0.4). */
export function In17States() {
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full">
      <div className="w-full max-w-[1440px] mx-auto px-margin-desktop py-space-xl flex flex-col gap-space-xl">

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
      <div>
      <div className="flex items-center gap-space-sm mb-space-xs">
      <span className="font-label-code text-caption uppercase tracking-wider text-on-surface-variant bg-surface-container px-2 py-0.5 rounded">SCREEN 17 · DIAGNOSTICS & SYSTEM STATES</span>
      <span className="font-caption text-caption text-outline">JM-KIN-INV-001</span>
      </div>
      <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight font-semibold">Inventory System State Catalog</h1>
      <p className="font-body-md text-body-md text-on-surface-variant mt-1">Defensive UI patterns, error envelopes, transactional fallbacks, and multi-tier network degradation states.</p>
      </div>
      <div className="flex items-center gap-space-sm bg-surface-container px-space-md py-space-xs rounded-lg shadow-sm">
      <span className="w-2 h-2 rounded-full bg-error animate-pulse"></span>
      <span className="font-label-code text-caption text-on-surface font-medium">State Simulator Live</span>
      <button type="button" className="ml-space-sm bg-surface-container-lowest hover:bg-surface-container-high transition-colors px-2 py-1 rounded text-caption font-label-code text-on-surface shadow-sm" data-stitch-data-stitch-id="toggle-state-density">Toggle Density</button>
      </div>
      </div>

      <div className="w-full bg-surface-container-lowest rounded-xl p-space-xs shadow-sm flex flex-col gap-space-xs">
      <div className="flex items-center justify-between px-space-md pt-space-xs pb-1">
      <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-semibold">Module Navigation Hierarchy</span>
      <span className="font-label-code text-caption text-outline">Path: /inventory/stock</span>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto pb-1 px-1">
      <button type="button" className="px-space-md py-2 rounded font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors whitespace-nowrap">Overview</button>
      <button type="button" className="px-space-md py-2 rounded bg-primary text-on-primary font-body-sm text-body-sm font-semibold shadow-sm flex items-center gap-1.5 whitespace-nowrap">
      <span>Stock</span>
      <span className="w-1.5 h-1.5 rounded-full bg-surface-container-lowest"></span>
      </button>
      <button type="button" className="px-space-md py-2 rounded font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors whitespace-nowrap">Vehicle kits</button>
      <button type="button" className="px-space-md py-2 rounded font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors whitespace-nowrap">Assets</button>
      <button type="button" className="px-space-md py-2 rounded font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors whitespace-nowrap">Movements</button>
      <button type="button" className="px-space-md py-2 rounded font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors whitespace-nowrap">Purchasing</button>
      <button type="button" className="px-space-md py-2 rounded font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors whitespace-nowrap">Counts</button>
      <button type="button" className="px-space-md py-2 rounded font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors whitespace-nowrap flex items-center gap-1">
      <span>Alerts</span>
      <span className="bg-error-container text-on-error-container text-[10px] font-label-code font-bold px-1.5 py-0.2 rounded-full">4</span>
      </button>
      </div>
      </div>

      <div className="flex flex-col gap-space-sm">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[18px] text-on-surface">crisis_alert</span>
      <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Global System Status Banners</h2>
      </div>
      <span className="font-caption text-caption text-on-surface-variant">Top-level notifications inject directly below context switcher</span>
      </div>

      <div className="w-full bg-error text-on-error rounded-xl p-space-md shadow-md flex flex-col md:flex-row md:items-center justify-between gap-space-md transition-all">
      <div className="flex items-center gap-space-md">
      <div className="w-9 h-9 rounded-lg bg-surface-container-lowest/20 flex items-center justify-center flex-shrink-0">
      <span className="material-symbols-outlined text-[20px] text-on-error">sync_problem</span>
      </div>
      <div>
      <div className="flex items-center gap-2">
      <span className="font-body-md text-body-md font-bold tracking-tight">Couldn't load stock. Nothing is lost — try again.</span>
      <span className="bg-surface-container-lowest/20 font-label-code text-caption px-1.5 py-0.5 rounded text-on-error font-medium">ERR_FETCH_TIMEOUT_408</span>
      </div>
      <p className="font-caption text-caption text-on-error/80 mt-0.5">Database snapshot at 08:44:12 EST preserved locally. Table view suppresses phantom empty states during connection dropouts.</p>
      </div>
      </div>
      <div className="flex items-center gap-space-sm flex-shrink-0 self-end md:self-auto">
      <button type="button" className="bg-surface-container-lowest hover:bg-surface-container-low text-error font-body-sm text-body-sm font-semibold px-space-md py-1.5 rounded-lg shadow-sm transition-all flex items-center gap-1 active:scale-95">
      <span className="material-symbols-outlined text-[16px]">refresh</span>
      <span>Try again</span>
      </button>
      <button type="button" className="text-on-error/80 hover:text-on-error p-1 rounded transition-colors" title="Dismiss preview">
      <span className="material-symbols-outlined text-[18px]">close</span>
      </button>
      </div>
      </div>

      <div className="w-full bg-error-container text-on-error-container rounded-xl p-space-md shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-space-md">
      <div className="flex items-center gap-space-md">
      <div className="w-9 h-9 rounded-lg bg-on-error-container/10 flex items-center justify-center flex-shrink-0">
      <span className="material-symbols-outlined text-[20px] text-on-error-container">warning</span>
      </div>
      <div>
      <div className="flex items-center gap-2">
      <span className="font-body-md text-body-md font-bold">Some stock numbers don't add up. Open Alerts.</span>
      <span className="font-label-code text-caption bg-on-error-container/10 px-2 py-0.5 rounded font-semibold text-on-error-container">DISCREPANCY: 4 BIN LOCATIONS</span>
      </div>
      <p className="font-caption text-caption text-on-error-container/85 mt-0.5">Automated 03:00 AM nightly reconciliation identified delta mismatch between physical batch count and system ledger in Kingston Hub Bay 4.</p>
      </div>
      </div>
      <div className="flex items-center gap-space-sm flex-shrink-0">
      <a className="bg-error text-on-error hover:bg-on-error-container transition-colors px-space-md py-1.5 rounded-lg font-body-sm text-body-sm font-semibold flex items-center gap-1" href="#">
      <span>Open Alerts</span>
      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
      </a>
      </div>
      </div>

      <div className="w-full bg-surface-container-highest text-on-surface rounded-xl p-space-md shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-space-md">
      <div className="flex items-center gap-space-md">
      <div className="w-9 h-9 rounded-lg bg-surface-dim flex items-center justify-center flex-shrink-0">
      <span className="material-symbols-outlined text-[20px] text-on-surface-variant">lock</span>
      </div>
      <div>
      <div className="flex items-center gap-2">
      <span className="font-body-md text-body-md font-semibold text-on-surface">You can view inventory but not change it. Ask your fleet owner.</span>
      <span className="font-label-code text-caption bg-surface-container px-2 py-0.5 rounded text-on-surface-variant font-medium">ROLE: READ_ONLY_AUDITOR</span>
      </div>
      <p className="font-caption text-caption text-on-surface-variant mt-0.5">Write operations (Receiving, Adjustments, Scrap, Re-binning) are deactivated. Contact Admin (K. Patterson) for elevation.</p>
      </div>
      </div>
      <div className="flex items-center gap-space-xs flex-shrink-0 opacity-60 cursor-not-allowed">
      <button type="button" className="bg-primary text-on-primary px-space-md py-1.5 rounded-lg font-body-sm text-body-sm font-medium opacity-50 cursor-not-allowed flex items-center gap-1" disabled>
      <span className="material-symbols-outlined text-[16px]">add</span>
      <span>Receive stock</span>
      </button>
      <button type="button" className="bg-surface-container-low text-on-surface-variant px-space-md py-1.5 rounded-lg font-body-sm text-body-sm font-medium opacity-50 cursor-not-allowed" disabled>
      <span>Issue stock</span>
      </button>
      </div>
      </div>
      </div>

      <div className="flex flex-col gap-space-lg">
      <div className="flex items-center justify-between">
      <div>
      <span className="font-label-code text-caption uppercase text-outline tracking-wider">Modular State Sandbox</span>
      <h2 className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight">Component States & Transaction Flows</h2>
      </div>
      <div className="flex items-center gap-space-xs text-caption font-label-code text-on-surface-variant">
      <span className="w-2 h-2 rounded-full bg-primary"></span>
      <span>Zero-Blocking Async Standard</span>
      </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">

      <div className="lg:col-span-12 bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-space-xs gap-space-xs">
      <div className="flex items-center gap-space-sm">
      <span className="w-6 h-6 rounded bg-primary text-on-primary flex items-center justify-center font-label-code text-caption font-bold">A</span>
      <div>
      <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Per-Tab Skeleton Loading (Stock Tab Active)</h3>
      <span className="font-caption text-caption text-on-surface-variant">Isolated shimmer lifecycle preserves parent header, search bar, and side drawer responsiveness.</span>
      </div>
      </div>
      <div className="bg-surface-container px-space-md py-1 rounded-lg flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[16px] text-on-surface">bolt</span>
      <span className="font-label-code text-caption text-on-surface font-semibold">Per-tab skeleton loading — never full-page blocking</span>
      </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">

      <div className="bg-surface-container-low rounded-lg p-space-md flex flex-col justify-between h-24">
      <div className="flex items-center justify-between">
      <div className="h-3 w-24 bg-surface-variant rounded animate-pulse"></div>
      <div className="w-5 h-5 rounded-full bg-surface-variant animate-pulse"></div>
      </div>
      <div>
      <div className="h-6 w-32 bg-surface-dim rounded animate-pulse mb-1"></div>
      <div className="h-2.5 w-16 bg-surface-variant rounded animate-pulse"></div>
      </div>
      </div>

      <div className="bg-surface-container-low rounded-lg p-space-md flex flex-col justify-between h-24">
      <div className="flex items-center justify-between">
      <div className="h-3 w-28 bg-surface-variant rounded animate-pulse"></div>
      <div className="w-5 h-5 rounded-full bg-surface-variant animate-pulse"></div>
      </div>
      <div>
      <div className="h-6 w-20 bg-surface-dim rounded animate-pulse mb-1"></div>
      <div className="h-2.5 w-24 bg-surface-variant rounded animate-pulse"></div>
      </div>
      </div>

      <div className="bg-surface-container-low rounded-lg p-space-md flex flex-col justify-between h-24">
      <div className="flex items-center justify-between">
      <div className="h-3 w-20 bg-surface-variant rounded animate-pulse"></div>
      <div className="w-5 h-5 rounded-full bg-surface-variant animate-pulse"></div>
      </div>
      <div>
      <div className="h-6 w-28 bg-surface-dim rounded animate-pulse mb-1"></div>
      <div className="h-2.5 w-36 bg-surface-variant rounded animate-pulse"></div>
      </div>
      </div>

      <div className="bg-surface-container-low rounded-lg p-space-md flex flex-col justify-between h-24">
      <div className="flex items-center justify-between">
      <div className="h-3 w-24 bg-surface-variant rounded animate-pulse"></div>
      <div className="w-5 h-5 rounded-full bg-surface-variant animate-pulse"></div>
      </div>
      <div>
      <div className="h-6 w-16 bg-surface-dim rounded animate-pulse mb-1"></div>
      <div className="h-2.5 w-20 bg-surface-variant rounded animate-pulse"></div>
      </div>
      </div>
      </div>

      <div className="flex flex-wrap items-center gap-space-xs pt-space-xs">
      <div className="h-8 w-28 bg-surface-container rounded-lg animate-pulse"></div>
      <div className="h-8 w-20 bg-surface-container rounded-lg animate-pulse"></div>
      <div className="h-8 w-24 bg-surface-container rounded-lg animate-pulse"></div>
      <div className="h-8 w-32 bg-surface-container rounded-lg animate-pulse"></div>
      <div className="ml-auto h-8 w-44 bg-surface-container rounded-lg animate-pulse"></div>
      </div>

      <div className="w-full bg-surface-container-lowest rounded-lg overflow-hidden flex flex-col">
      <div className="bg-surface-container-low px-space-md py-space-sm grid grid-cols-12 gap-space-sm items-center">
      <div className="col-span-3 h-3 bg-surface-variant rounded w-20 animate-pulse"></div>
      <div className="col-span-2 h-3 bg-surface-variant rounded w-16 animate-pulse"></div>
      <div className="col-span-2 h-3 bg-surface-variant rounded w-16 animate-pulse"></div>
      <div className="col-span-2 h-3 bg-surface-variant rounded w-14 animate-pulse"></div>
      <div className="col-span-2 h-3 bg-surface-variant rounded w-16 animate-pulse"></div>
      <div className="col-span-1 h-3 bg-surface-variant rounded w-8 animate-pulse ml-auto"></div>
      </div>

      <div className="flex flex-col">
      <div className="px-space-md py-3.5 grid grid-cols-12 gap-space-sm items-center bg-surface-container-lowest hover:bg-surface-container-low/40 transition-colors">
      <div className="col-span-3 flex items-center gap-space-sm">
      <div className="w-4 h-4 rounded bg-surface-variant animate-pulse"></div>
      <div className="flex flex-col gap-1 w-full">
      <div className="h-3.5 bg-surface-dim rounded w-4/5 animate-pulse"></div>
      <div className="h-2.5 bg-surface-variant rounded w-2/5 animate-pulse"></div>
      </div>
      </div>
      <div className="col-span-2"><div className="h-3 bg-surface-variant rounded w-24 animate-pulse"></div></div>
      <div className="col-span-2"><div className="h-3 bg-surface-variant rounded w-20 animate-pulse"></div></div>
      <div className="col-span-2"><div className="h-3.5 bg-surface-dim rounded w-16 animate-pulse"></div></div>
      <div className="col-span-2"><div className="h-4 bg-surface-variant rounded-full w-24 animate-pulse"></div></div>
      <div className="col-span-1 flex justify-end"><div className="h-4 w-4 bg-surface-variant rounded animate-pulse"></div></div>
      </div>
      <div className="px-space-md py-3.5 grid grid-cols-12 gap-space-sm items-center bg-surface-container-lowest hover:bg-surface-container-low/40 transition-colors">
      <div className="col-span-3 flex items-center gap-space-sm">
      <div className="w-4 h-4 rounded bg-surface-variant animate-pulse"></div>
      <div className="flex flex-col gap-1 w-full">
      <div className="h-3.5 bg-surface-dim rounded w-3/4 animate-pulse"></div>
      <div className="h-2.5 bg-surface-variant rounded w-1/3 animate-pulse"></div>
      </div>
      </div>
      <div className="col-span-2"><div className="h-3 bg-surface-variant rounded w-20 animate-pulse"></div></div>
      <div className="col-span-2"><div className="h-3 bg-surface-variant rounded w-16 animate-pulse"></div></div>
      <div className="col-span-2"><div className="h-3.5 bg-surface-dim rounded w-14 animate-pulse"></div></div>
      <div className="col-span-2"><div className="h-4 bg-surface-variant rounded-full w-20 animate-pulse"></div></div>
      <div className="col-span-1 flex justify-end"><div className="h-4 w-4 bg-surface-variant rounded animate-pulse"></div></div>
      </div>
      <div className="px-space-md py-3.5 grid grid-cols-12 gap-space-sm items-center bg-surface-container-lowest hover:bg-surface-container-low/40 transition-colors">
      <div className="col-span-3 flex items-center gap-space-sm">
      <div className="w-4 h-4 rounded bg-surface-variant animate-pulse"></div>
      <div className="flex flex-col gap-1 w-full">
      <div className="h-3.5 bg-surface-dim rounded w-5/6 animate-pulse"></div>
      <div className="h-2.5 bg-surface-variant rounded w-2/6 animate-pulse"></div>
      </div>
      </div>
      <div className="col-span-2"><div className="h-3 bg-surface-variant rounded w-28 animate-pulse"></div></div>
      <div className="col-span-2"><div className="h-3 bg-surface-variant rounded w-16 animate-pulse"></div></div>
      <div className="col-span-2"><div className="h-3.5 bg-surface-dim rounded w-20 animate-pulse"></div></div>
      <div className="col-span-2"><div className="h-4 bg-surface-variant rounded-full w-28 animate-pulse"></div></div>
      <div className="col-span-1 flex justify-end"><div className="h-4 w-4 bg-surface-variant rounded animate-pulse"></div></div>
      </div>
      </div>
      </div>
      </div>

      <div className="lg:col-span-5 bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between">
      <div>
      <div className="flex items-center justify-between pb-space-sm">
      <div className="flex items-center gap-space-sm">
      <span className="w-6 h-6 rounded bg-primary text-on-primary flex items-center justify-center font-label-code text-caption font-bold">B</span>
      <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Post-Setup Zero-Stock State</h3>
      </div>
      <span className="font-label-code text-caption text-on-surface-variant bg-surface-container px-2 py-0.5 rounded">Cold Start</span>
      </div>
      <p className="font-caption text-caption text-on-surface-variant mb-space-md">Appears immediately after setup wizard finishes with zero ingested stock ledger lines.</p>

      <div className="bg-surface-container-low rounded-xl p-space-xl flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-2xl bg-surface-container flex items-center justify-center mb-space-md shadow-sm">
      <span className="material-symbols-outlined text-[36px] text-on-surface">inventory_2</span>
      </div>
      <h4 className="font-headline-sm text-headline-sm text-on-surface font-bold">No stock yet. Receive your first delivery.</h4>
      <p className="font-body-md text-body-md text-on-surface-variant max-w-sm mt-space-xs mb-space-lg">
                      Record your supplier arrivals or transfer opening balance to populate the ledger. All parts tracked with serialized bin tags.
                    </p>
      <div className="flex flex-col sm:flex-row items-center gap-space-sm w-full sm:w-auto">
      <button type="button" className="w-full sm:w-auto bg-primary hover:bg-inverse-surface text-on-primary font-body-sm text-body-sm font-semibold px-space-lg py-2.5 rounded-lg shadow-md transition-all flex items-center justify-center gap-space-xs active:scale-95">
      <span className="material-symbols-outlined text-[18px]">add_box</span>
      <span>+ Receive stock</span>
      </button>
      <button type="button" className="w-full sm:w-auto bg-surface-container-lowest hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-medium px-space-md py-2.5 rounded-lg shadow-sm transition-all flex items-center justify-center gap-space-xs">
      <span className="material-symbols-outlined text-[16px]">upload_file</span>
      <span>Import CSV Ledger</span>
      </button>
      </div>

      <div className="mt-space-lg grid grid-cols-2 gap-space-xs w-full text-left">
      <div className="p-space-sm rounded-lg bg-surface-container-lowest">
      <span className="font-caption text-caption text-outline font-semibold uppercase">Quick Template</span>
      <div className="font-body-sm text-body-sm font-semibold text-on-surface mt-0.5">Isuzu NPR Service Kit</div>
      <span className="font-label-code text-[11px] text-on-surface-variant">14 standard fast-movers</span>
      </div>
      <div className="p-space-sm rounded-lg bg-surface-container-lowest">
      <span className="font-caption text-caption text-outline font-semibold uppercase">Barcode Match</span>
      <div className="font-body-sm text-body-sm font-semibold text-on-surface mt-0.5">OEM Direct Scan</div>
      <span className="font-label-code text-[11px] text-on-surface-variant">USB scanner ready</span>
      </div>
      </div>
      </div>
      </div>
      <div className="pt-space-md mt-space-md flex items-center justify-between text-caption font-caption text-on-surface-variant">
      <span>Ledger status: Inactive</span>
      <span className="font-label-code">0 bytes written</span>
      </div>
      </div>

      <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between">
      <div>
      <div className="flex items-center justify-between pb-space-sm">
      <div className="flex items-center gap-space-sm">
      <span className="w-6 h-6 rounded bg-primary text-on-primary flex items-center justify-center font-label-code text-caption font-bold">C</span>
      <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Transactional Dialog & Shortfall States</h3>
      </div>
      <span className="font-label-code text-caption text-on-error bg-error-container px-2 py-0.5 rounded font-semibold">Idempotency Active</span>
      </div>
      <p className="font-caption text-caption text-on-surface-variant mb-space-md">Side-by-side inspection of optimistic update rollback and pre-issue store availability barriers.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">

      <div className="bg-surface-container rounded-xl p-space-md shadow-sm flex flex-col justify-between">
      <div>
      <div className="flex items-center justify-between mb-space-sm">
      <span className="font-body-sm text-body-sm font-bold text-on-surface">Edit Part: ISU-FLT-882</span>
      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">close</span>
      </div>
      <div className="space-y-space-sm text-body-sm">
      <div>
      <label className="block font-caption text-caption text-on-surface-variant mb-1">Standard Shelf Location</label>
      <input className="w-full bg-surface-container-lowest px- space-sm py-1.5 px-2 rounded font-label-code text-label-code text-on-surface focus:outline-none" type="text" value="BAY-04-SHELF-B"/>
      </div>
      <div>
      <label className="block font-caption text-caption text-on-surface-variant mb-1">Reorder Par Level</label>
      <input className="w-full bg-surface-container-lowest px-2 py-1.5 rounded font-label-code text-label-code text-on-surface focus:outline-none" type="number" value="24"/>
      </div>
      </div>

      <div className="mt-space-md p-space-sm bg-error-container text-on-error-container rounded-lg shadow-sm">
      <div className="flex items-start gap-space-xs">
      <span className="material-symbols-outlined text-[18px] text-on-error-container flex-shrink-0">error</span>
      <div>
      <div className="font-body-sm text-body-sm font-bold leading-tight">Couldn't save. Nothing changed. Try again.</div>
      <div className="font-caption text-caption mt-0.5 text-on-error-container/90">Socket connection closed unexpectedly during commit.</div>
      </div>
      </div>
      <div className="mt-space-xs flex items-center justify-between">
      <span className="font-label-code text-[10px] text-on-error-container font-semibold">Retry never saves twice</span>
      <button type="button" className="bg-error text-on-error font-body-sm text-[12px] px-2 py-1 rounded font-semibold hover:bg-on-error-container transition-colors shadow-sm">
                              Retry save
                            </button>
      </div>
      </div>
      </div>

      <div className="mt-space-md pt-space-sm flex items-center justify-end gap-space-xs">
      <button type="button" className="px-space-md py-1.5 text-body-sm font-medium text-on-surface-variant hover:bg-surface-container-high rounded transition-colors">Cancel</button>
      <button type="button" className="px-space-md py-1.5 text-body-sm font-semibold bg-primary text-on-primary rounded shadow-sm">Save</button>
      </div>
      </div>

      <div className="bg-surface-container rounded-xl p-space-md shadow-sm flex flex-col justify-between">
      <div>
      <div className="flex items-center justify-between mb-space-sm">
      <div>
      <span className="font-body-sm text-body-sm font-bold text-on-surface">Issue Flow: Step 2 (Check)</span>
      <div className="font-caption text-caption text-on-surface-variant">Work Order #WO-89104</div>
      </div>
      <span className="font-label-code text-caption bg-surface-container-high px-2 py-0.5 rounded text-on-surface font-semibold">Step 2/3</span>
      </div>

      <div className="p-space-sm bg-error text-on-error rounded-lg shadow-sm mb-space-sm">
      <div className="flex items-start gap-space-xs">
      <span className="material-symbols-outlined text-[18px] text-on-error flex-shrink-0">production_quantity_limits</span>
      <div>
      <div className="font-body-sm text-body-sm font-bold leading-tight">Can issue 1 of 11 items now. 10 are short in store.</div>
      <div className="font-caption text-caption text-on-error/80 mt-0.5">Pending replenishment PO #PO-9418 expected tomorrow.</div>
      </div>
      </div>
      </div>

      <div className="space-y-1.5">

      <div className="p-2 bg-surface-container-lowest rounded flex items-center justify-between">
      <div className="flex flex-col">
      <span className="font-body-sm text-body-sm font-semibold text-on-surface">Engine Oil 15W40 (5L)</span>
      <span className="font-label-code text-[11px] text-on-surface-variant">SKU: LUB-15W40-05</span>
      </div>
      <div className="flex items-center gap-space-sm">
      <span className="font-label-code text-caption font-semibold text-on-surface">1 requested</span>
      <span className="bg-surface-container text-on-surface font-label-code text-[11px] px-2 py-0.5 rounded font-semibold">Available</span>
      </div>
      </div>

      <div className="p-2 bg-surface-container-lowest rounded flex items-center justify-between">
      <div className="flex flex-col">
      <span className="font-body-sm text-body-sm font-semibold text-on-surface">Front Brake Pad Set</span>
      <span className="font-label-code text-[11px] text-on-surface-variant">SKU: BRK-PD-410</span>
      </div>
      <div className="flex items-center gap-space-sm">
      <span className="font-label-code text-caption text-outline line-through">4 requested</span>
      <span className="bg-error-container text-on-error-container font-label-code text-[11px] px-2 py-0.5 rounded font-bold shadow-sm">Short 3</span>
      </div>
      </div>

      <div className="p-2 bg-surface-container-lowest rounded flex items-center justify-between">
      <div className="flex flex-col">
      <span className="font-body-sm text-body-sm font-semibold text-on-surface">Heavy Fuel Cartridge</span>
      <span className="font-label-code text-[11px] text-on-surface-variant">SKU: FLT-DSL-009</span>
      </div>
      <div className="flex items-center gap-space-sm">
      <span className="font-label-code text-caption text-outline line-through">7 requested</span>
      <span className="bg-error-container text-on-error-container font-label-code text-[11px] px-2 py-0.5 rounded font-bold shadow-sm">Short 7</span>
      </div>
      </div>
      </div>
      </div>

      <div className="mt-space-md pt-space-sm flex items-center justify-between gap-space-xs">
      <button type="button" className="px-space-sm py-1 text-caption font-body-sm text-error hover:bg-error-container/40 rounded transition-colors font-medium">Split Work Order</button>
      <div className="flex items-center gap-space-xs">
      <button type="button" className="px-space-md py-1.5 text-body-sm font-medium text-on-surface-variant hover:bg-surface-container-high rounded transition-colors">Back</button>
      <button type="button" className="px-space-md py-1.5 text-body-sm font-semibold bg-primary text-on-primary rounded shadow-sm hover:bg-inverse-surface transition-colors">Issue Available (1)</button>
      </div>
      </div>
      </div>
      </div>
      </div>
      <div className="pt-space-md mt-space-md flex items-center justify-between text-caption font-caption text-on-surface-variant">
      <span>Transaction Safety: Idempotency-Key header auto-injected on POST</span>
      <span className="font-label-code">Status: Safe-Fail Enforced</span>
      </div>
      </div>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col md:flex-row items-center justify-between gap-space-lg">
      <div className="flex items-center gap-space-md">
      <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center flex-shrink-0">
      <span className="material-symbols-outlined text-[28px] text-on-surface">verified_user</span>
      </div>
      <div>
      <h4 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Ledger Fault-Tolerance Rules in Force</h4>
      <p className="font-body-sm text-body-sm text-on-surface-variant">Roam Fleet Engine commits changes using two-phase atomicity. Stock quantities never zero-out during network degradation or unresolved concurrency locks.</p>
      </div>
      </div>
      <div className="flex items-center gap-space-md flex-shrink-0">
      <div className="flex flex-col text-right">
      <span className="font-caption text-caption uppercase text-outline font-semibold">Engine Version</span>
      <span className="font-label-code text-body-sm font-bold text-on-surface">inventory-state-engine</span>
      </div>
      <button type="button" className="bg-surface-container-low hover:bg-surface-container-high transition-colors p-2 rounded-lg text-on-surface"  title="Scroll to top">
      <span className="material-symbols-outlined text-[20px]">arrow_upward</span>
      </button>
      </div>
      </div>
      </div>


      </div></div>
    </div>
  );
}
