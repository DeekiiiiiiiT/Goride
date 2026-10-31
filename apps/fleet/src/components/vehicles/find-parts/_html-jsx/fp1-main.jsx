<main className="w-full pt-26 bg-surface min-h-[calc(100vh-80px)]"><div className="max-w-[1400px] mx-auto px-margin-desktop py-space-xl w-full"><div className="flex flex-col md:flex-row md:items-center justify-between gap-space-lg mb-space-xl pb-space-lg border-b border-surface-container-high"><div className="flex items-center gap-space-md"><div className="w-11 h-11 rounded-lg bg-tertiary-fixed border border-tertiary-fixed-dim/60 flex items-center justify-center text-on-tertiary-container"><span className="material-symbols-outlined text-[24px]">build</span></div><div><div className="font-headline-lg text-headline-lg text-on-surface">Fleet Maintenance</div><div className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">By vehicle status, the service ledger, and parts for your cars.</div></div></div><div className="flex flex-wrap items-center gap-space-sm"><button className="inline-flex items-center gap-space-xs bg-surface-container-lowest border border-outline-variant text-on-surface px-space-md py-space-sm rounded-lg font-body-sm text-body-sm hover:bg-surface-container transition-colors" type="button"><span className="material-symbols-outlined text-[16px]">refresh</span><span>Refresh</span></button><button className="inline-flex items-center gap-space-xs bg-surface-container-lowest border border-outline-variant text-on-surface px-space-md py-space-sm rounded-lg font-body-sm text-body-sm hover:bg-surface-container transition-colors" type="button"><span className="material-symbols-outlined text-[16px]">tune</span><span>Bootstrap schedules</span></button><button className="inline-flex items-center gap-space-xs bg-secondary-container text-on-secondary-container px-space-md py-space-sm rounded-lg font-body-sm text-body-sm border border-outline-variant/60 hover:bg-secondary-fixed transition-colors" type="button"><span className="material-symbols-outlined text-[16px]">extension</span><span>Compatible parts</span></button><button className="inline-flex items-center gap-space-xs bg-primary text-on-primary px-space-lg py-space-sm rounded-lg font-body-sm text-body-sm hover:bg-surface-tint transition-colors" type="button"><span className="material-symbols-outlined text-[16px]">add</span><span>+ Log new service</span></button></div></div><div className="inline-flex p-1 bg-surface-container rounded-xl border border-outline-variant/40 mb-space-xl"><a className="px-space-lg py-space-sm font-body-sm text-body-sm font-medium text-on-surface-variant hover:text-on-surface rounded-lg transition-colors" data-path="fleet-maintenance-by-vehicle" href="#">By vehicle</a><a className="px-space-lg py-space-sm font-body-sm text-body-sm font-medium text-on-surface-variant hover:text-on-surface rounded-lg transition-colors" data-path="fleet-maintenance-service-ledger" href="#">Service ledger</a><a className="bg-surface-container-lowest text-on-surface shadow-[0_1px_3px_rgba(0,0,0,0.04)] font-semibold rounded-lg px-space-lg py-space-sm flex items-center gap-space-xs border border-outline-variant/30 font-body-sm text-body-sm" data-path="fleet-maintenance-find-parts" href="#"><span className="material-symbols-outlined text-[16px]">inventory_2</span><span>Find parts</span></a></div><div className="w-full"><div className="flex flex-col w-full">

<div className="w-full bg-surface-container-lowest rounded-xl p-space-md mb-space-lg shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-space-md">
<div className="flex items-center gap-space-md">
<div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-on-primary font-label-code text-body-sm font-semibold">
        1
      </div>
<div>
<div className="font-headline-sm text-body-md text-on-surface">Step 1: Pick a car</div>
<div className="font-body-sm text-caption text-on-surface-variant">Select an active vehicle to map directly to verified fitment specs</div>
</div>
</div>

<div className="flex items-center gap-space-xs font-label-code text-caption overflow-x-auto py-1">
<span className="px-space-sm py-1 rounded bg-secondary-container text-on-secondary-container font-semibold">1. Vehicle</span>
<span className="text-outline">›</span>
<span className="px-space-sm py-1 rounded bg-surface-container-high text-on-surface-variant">2. Version & Trim</span>
<span className="text-outline">›</span>
<span className="px-space-sm py-1 rounded bg-surface-container-high text-on-surface-variant">3. Part Category</span>
<span className="text-outline">›</span>
<span className="px-space-sm py-1 rounded bg-surface-container-high text-on-surface-variant">4. Position & Fit</span>
</div>
</div>

<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg w-full items-start">

<div className="lg:col-span-8 flex flex-col gap-space-lg">
<div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col">

<div className="flex flex-col mb-space-lg">
<h2 className="font-headline-lg text-headline-lg text-on-surface">Which car is it?</h2>
<p className="font-body-md text-body-sm text-on-surface-variant mt-0.5">
            Select an active fleet vehicle to match verified inventory or look up parts for any other car.
          </p>
</div>

<div className="flex flex-col mb-space-lg">
<div className="flex items-center justify-between mb-space-xs">
<div className="flex items-center gap-space-sm">
<span className="font-caption text-caption tracking-wider text-on-surface-variant uppercase font-semibold">My Vehicles (in fleet)</span>
<span className="px-space-xs py-0.5 rounded bg-surface-container-high font-label-code text-caption text-on-surface">2 active</span>
</div>
</div>
<p className="font-body-sm text-caption text-on-surface-variant mb-space-md">
            Clicking your vehicle skips straight to parts — specs and engine trims are already verified.
          </p>

<div className="grid grid-cols-1 md:grid-cols-2 gap-space-md" id="fleet-vehicle-grid">

<div className="vehicle-select-card group bg-surface-container-low hover:bg-surface-container p-space-lg rounded-xl cursor-pointer transition-all flex flex-col justify-between shadow-sm relative overflow-hidden" data-vehicle-id="FIT-2018-GP5">
<div className="flex flex-col">
<div className="flex items-center justify-between gap-space-sm mb-space-md">
<div className="w-9 h-9 rounded-lg bg-surface-container-highest flex items-center justify-center text-on-surface group-hover:bg-primary group-hover:text-on-primary transition-colors">
<span className="material-symbols-outlined text-[20px]">directions_car</span>
</div>

<div className="bg-surface-container-lowest px-space-sm py-0.5 rounded shadow-sm flex items-center gap-1">
<span className="w-1.5 h-1.5 rounded-full bg-on-surface"></span>
<span className="font-label-plate text-label-plate text-on-surface tracking-widest">1505LM</span>
</div>
</div>
<div className="font-headline-sm text-headline-sm text-on-surface group-hover:text-primary transition-colors">
                  Honda Fit 2018
                </div>
<div className="font-label-code text-caption text-on-surface-variant mt-0.5">
                  1.5 hybrid · GP5 · FWD
                </div>
</div>
<div className="mt-space-lg pt-space-md flex flex-col gap-space-sm">
<div className="flex flex-wrap items-center gap-space-xs">
<span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded bg-surface-container-lowest font-caption text-caption text-on-surface shadow-xs">
<span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                    Verified specs
                  </span>
<span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded bg-surface-container-highest font-caption text-caption text-on-surface-variant">
                    2 parts on shelf
                  </span>
</div>
<div className="flex items-center justify-between text-on-surface font-body-sm text-caption font-semibold mt-1">
<span>Select vehicle</span>
<span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
</div>
</div>
</div>

<div className="vehicle-select-card group bg-surface-container-low hover:bg-surface-container p-space-lg rounded-xl cursor-pointer transition-all flex flex-col justify-between shadow-sm relative overflow-hidden" data-vehicle-id="ROOMY-2019-M900A">
<div className="flex flex-col">
<div className="flex items-center justify-between gap-space-sm mb-space-md">
<div className="w-9 h-9 rounded-lg bg-surface-container-highest flex items-center justify-center text-on-surface group-hover:bg-primary group-hover:text-on-primary transition-colors">
<span className="material-symbols-outlined text-[20px]">directions_car</span>
</div>

<div className="bg-surface-container-lowest px-space-sm py-0.5 rounded shadow-sm flex items-center gap-1">
<span className="w-1.5 h-1.5 rounded-full bg-on-surface"></span>
<span className="font-label-plate text-label-plate text-on-surface tracking-widest">5179KZ</span>
</div>
</div>
<div className="font-headline-sm text-headline-sm text-on-surface group-hover:text-primary transition-colors">
                  Toyota Roomy 2019
                </div>
<div className="font-label-code text-caption text-on-surface-variant mt-0.5">
                  1.0 petrol · 2WD · M900A
                </div>
</div>
<div className="mt-space-lg pt-space-md flex flex-col gap-space-sm">
<div className="flex flex-wrap items-center gap-space-xs">
<span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded bg-surface-container-lowest font-caption text-caption text-on-surface shadow-xs">
<span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                    Verified specs
                  </span>
<span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded bg-surface-container-highest font-caption text-caption text-on-surface-variant">
                    Service due: Oil & Filter
                  </span>
</div>
<div className="flex items-center justify-between text-on-surface font-body-sm text-caption font-semibold mt-1">
<span>Select vehicle</span>
<span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
</div>
</div>
</div>
</div>
</div>

<div className="relative flex items-center justify-center my-space-lg">
<div className="w-full h-px bg-surface-container-high"></div>
<span className="absolute bg-surface-container-lowest px-space-md font-caption text-caption uppercase text-on-surface-variant tracking-wider font-semibold">
            or another car
          </span>
</div>

<div className="flex flex-col gap-space-md bg-surface-container-low p-space-lg rounded-xl">

<div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">

<div className="flex flex-col">
<label className="font-caption text-caption uppercase tracking-wider text-on-surface-variant mb-1 font-semibold" htmlFor="select-make">Make</label>
<div className="relative bg-surface-container-lowest rounded-lg shadow-xs">
<select className="w-full h-10 px-space-md bg-transparent appearance-none font-body-sm text-body-sm text-on-surface cursor-pointer focus:outline-none" id="select-make">
<option selected="" value="Toyota">Toyota</option>
<option value="Honda">Honda</option>
<option value="Nissan">Nissan</option>
<option value="Mazda">Mazda</option>
<option value="Suzuki">Suzuki</option>
</select>
<span className="material-symbols-outlined absolute right-2.5 top-2.5 text-on-surface-variant pointer-events-none text-[20px]">expand_more</span>
</div>
</div>

<div className="flex flex-col">
<label className="font-caption text-caption uppercase tracking-wider text-on-surface-variant mb-1 font-semibold" htmlFor="select-model">Model</label>
<div className="relative bg-surface-container-lowest rounded-lg shadow-xs">
<select className="w-full h-10 px-space-md bg-transparent appearance-none font-body-sm text-body-sm text-on-surface cursor-pointer focus:outline-none" id="select-model">
<option selected="" value="Probox">Probox</option>
<option value="Axio">Corolla Axio</option>
<option value="Fielder">Corolla Fielder</option>
<option value="Vitz">Vitz</option>
<option value="HiAce">HiAce</option>
</select>
<span className="material-symbols-outlined absolute right-2.5 top-2.5 text-on-surface-variant pointer-events-none text-[20px]">expand_more</span>
</div>
</div>

<div className="flex flex-col">
<label className="font-caption text-caption uppercase tracking-wider text-on-surface-variant mb-1 font-semibold" htmlFor="select-year">Year</label>
<div className="relative bg-surface-container-lowest rounded-lg shadow-xs">
<select className="w-full h-10 px-space-md bg-transparent appearance-none font-body-sm text-body-sm text-on-surface cursor-pointer focus:outline-none" id="select-year">
<option selected="" value="2016">2016</option>
<option value="2017">2017</option>
<option value="2018">2018</option>
<option value="2019">2019</option>
<option value="2020">2020</option>
</select>
<span className="material-symbols-outlined absolute right-2.5 top-2.5 text-on-surface-variant pointer-events-none text-[20px]">expand_more</span>
</div>
</div>
</div>

<div className="flex flex-col mt-space-xs">
<span className="font-caption text-caption text-on-surface-variant font-medium mb-1.5">Or type vehicle / VIN:</span>
<div className="relative flex items-center w-full">
<span className="material-symbols-outlined absolute left-3 text-on-surface-variant text-[20px]">search</span>
<input className="w-full h-10 pl-10 pr-10 bg-surface-container-lowest rounded-lg font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none shadow-xs" id="vehicle-search-input" placeholder="e.g. 1505LM, NCP160V-0012948, or Toyota Probox" type="text" value="Toyota Probox 2016" />
<button className="absolute right-2.5 text-on-surface-variant hover:text-on-surface transition-colors flex items-center justify-center p-1 rounded" type="button">
<span className="material-symbols-outlined text-[16px]">close</span>
</button>
</div>
<span className="font-body-sm text-caption text-on-surface-variant mt-1.5">
              Tip: You can also paste Jamaican registration, chassis serial, or JDM model codes.
            </span>
</div>

<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md mt-space-sm pt-space-md">
<button className="inline-flex items-center justify-center gap-space-xs bg-primary text-on-primary px-space-xl py-2.5 rounded-lg font-body-sm text-body-sm font-semibold hover:bg-surface-tint transition-colors shadow-sm" type="button">
<span>Continue</span>
<span className="material-symbols-outlined text-[18px]">arrow_forward</span>
</button>
<div className="font-body-sm text-caption text-on-surface-variant flex items-center gap-1">
<span className="material-symbols-outlined text-[14px]">info</span>
<span>Next: We'll verify engine version if needed</span>
</div>
</div>
</div>
</div>
</div>

<div className="lg:col-span-4 flex flex-col gap-space-lg">

<div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col">
<div className="flex items-center justify-between pb-space-md mb-space-md">
<div className="font-headline-sm text-headline-sm text-on-surface">Your parts activity</div>
<a className="font-body-sm text-caption font-semibold text-on-surface hover:text-secondary transition-colors underline decoration-surface-dim underline-offset-4" href="#">
            See all
          </a>
</div>

<div className="flex flex-col divide-y divide-surface-container-high/60">

<div className="py-space-md flex flex-col gap-1 first:pt-0">
<div className="flex items-center justify-between">
<span className="font-body-sm text-body-sm font-semibold text-on-surface">Requests</span>
<span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded bg-surface-container-highest font-label-code text-caption text-on-surface font-semibold">
<span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                1 open
              </span>
</div>
<p className="font-body-sm text-caption text-on-surface-variant">
              Toyota Roomy AC Compressor quote pending Kingston Auto Parts.
            </p>
</div>

<div className="py-space-md flex flex-col gap-1">
<div className="flex items-center justify-between">
<span className="font-body-sm text-body-sm font-semibold text-on-surface">Repeat-part alerts</span>
<span className="px-space-xs py-0.5 rounded bg-surface-container-high font-label-code text-caption text-on-surface-variant font-semibold">
                0
              </span>
</div>
<p className="font-body-sm text-caption text-on-surface-variant">
              No frequent wear anomalies detected across Kingston hub this month.
            </p>
</div>

<div className="py-space-md flex flex-col gap-1">
<div className="flex items-center justify-between">
<span className="font-body-sm text-body-sm font-semibold text-on-surface">Warranty claims</span>
<span className="px-space-xs py-0.5 rounded bg-surface-container-high font-label-code text-caption text-on-surface-variant font-semibold">
                0
              </span>
</div>
<p className="font-body-sm text-caption text-on-surface-variant">
              All installed suspension & hybrid parts operating within warranty period.
            </p>
</div>

<div className="py-space-md flex flex-col gap-1 last:pb-0">
<div className="flex items-center justify-between">
<span className="font-body-sm text-body-sm font-semibold text-on-surface">Core returns</span>
<span className="px-space-xs py-0.5 rounded bg-surface-container-high font-label-price text-caption text-on-surface font-semibold">
                J$ 0 pending
              </span>
</div>
<p className="font-body-sm text-caption text-on-surface-variant">
              Alternator and high-voltage battery deposits are fully cleared.
            </p>
</div>
</div>

<div className="mt-space-lg pt-space-md bg-surface-container-low p-space-md rounded-lg flex flex-col">
<div className="flex items-center gap-space-xs text-on-surface font-headline-sm text-body-sm">
<span className="material-symbols-outlined text-[18px]">manage_search</span>
<span>Need a part not in inventory?</span>
</div>
<p className="font-body-sm text-caption text-on-surface-variant mt-1 leading-relaxed">
            Self-serve parts desk: our team sources genuine & OEM replacements across Jamaica & Japan within 24h.
          </p>
<button className="mt-space-md w-full py-2 px-space-md bg-surface-container-lowest hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-semibold rounded shadow-xs flex items-center justify-center gap-space-xs transition-colors" type="button">
<span className="material-symbols-outlined text-[16px]">support_agent</span>
<span>Ask Roam to find it</span>
</button>
</div>
</div>

<div className="bg-surface-container rounded-xl p-space-md flex items-start gap-space-md shadow-xs">
<div className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center text-on-surface shrink-0">
<span className="material-symbols-outlined text-[18px]">verified</span>
</div>
<div className="flex flex-col">
<span className="font-headline-sm text-caption text-on-surface uppercase tracking-wider font-semibold">Zero-Fitment Error Guarantee</span>
<p className="font-body-sm text-caption text-on-surface-variant mt-0.5">
            Every part cataloged is verified against Jamaican road conditions and JDM chassis designations (GP5, M900A, NCP160).
          </p>
</div>
</div>
</div>
</div>

<div className="fixed inset-0 z-50 hidden items-center justify-center bg-inverse-surface/30 backdrop-blur-xs p-space-md" id="sourcing-modal">
<div className="bg-surface-container-lowest rounded-xl max-w-md w-full p-space-xl shadow-xl flex flex-col">
<div className="flex items-center justify-between pb-space-md">
<div className="font-headline-sm text-headline-sm text-on-surface">Submit Parts Request</div>
<button className="text-on-surface-variant hover:text-on-surface p-1" type="button">
<span className="material-symbols-outlined text-[20px]">close</span>
</button>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
        Kingston Hub procurement agents will search local distributors and overseas JDM containers.
      </p>
<div className="flex flex-col gap-space-sm mb-space-lg">
<label className="font-caption text-caption uppercase text-on-surface-variant font-semibold">Part description or OEM number</label>
<input className="h-10 px-space-md bg-surface-container-low rounded-lg font-body-sm text-body-sm text-on-surface focus:outline-none" placeholder="e.g. Front Shock Absorber Pair (GP5)" type="text" />
</div>
<div className="flex items-center justify-end gap-space-sm">
<button className="px-space-md py-2 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm font-medium" type="button">Cancel</button>
<button className="px-space-lg py-2 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-semibold" type="button">Send Request</button>
</div>
</div>
</div>

</div></div></div></main>