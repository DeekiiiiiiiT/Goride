<main className="w-full pt-26 bg-surface min-h-[calc(100vh-80px)]"><div className="flex flex-col w-full">

<div className="bg-surface-container-lowest shadow-sm">
<div className="max-w-[1400px] mx-auto px-margin md:px-margin-desktop py-space-sm flex items-center justify-between">
<div className="flex items-center gap-space-lg">
<a className="font-body-md text-body-md text-on-surface-variant hover:text-on-surface flex items-center gap-1 transition-colors" href="#">
<span className="material-symbols-outlined text-[18px]">directions_car</span>
<span>By vehicle</span>
</a>
<a className="font-body-md text-body-md text-on-surface-variant hover:text-on-surface flex items-center gap-1 transition-colors" href="#">
<span className="material-symbols-outlined text-[18px]">receipt_long</span>
<span>Service ledger</span>
</a>
<a className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-1 border-b-2 border-primary pb-1" href="#">
<span className="material-symbols-outlined text-[18px]">search_insights</span>
<span>Find parts</span>
</a>
</div>
<div className="hidden sm:flex items-center gap-space-md text-on-surface-variant font-label-code text-caption">
<span className="inline-flex items-center gap-1 bg-surface-container px-2 py-0.5 rounded">
<span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container"></span>
<span>CATALOG v4.88 · JM SPEC</span>
</span>
</div>
</div>
</div>

<div className="bg-surface-container-low">
<div className="max-w-[1400px] mx-auto px-margin md:px-margin-desktop py-space-md">
<div className="flex items-center justify-between flex-wrap gap-y-space-sm">
<ol className="flex items-center gap-space-md sm:gap-space-xl flex-wrap">

<li className="flex items-center gap-space-xs text-on-surface cursor-pointer group">
<span className="w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center font-caption text-[11px]">
<span className="material-symbols-outlined text-[14px]">check</span>
</span>
<span className="font-body-sm text-body-sm font-semibold text-on-surface group-hover:underline">1. Vehicle</span>
<span className="material-symbols-outlined text-outline text-[16px] ml-space-xs">chevron_right</span>
</li>

<li className="flex items-center gap-space-xs text-on-surface">
<span className="w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center font-label-code text-[11px] font-bold">2</span>
<span className="font-headline-sm text-body-md font-bold text-on-surface">Version &amp; Trim</span>
<span className="material-symbols-outlined text-outline text-[16px] ml-space-xs">chevron_right</span>
</li>

<li className="flex items-center gap-space-xs text-on-surface-variant opacity-60">
<span className="w-5 h-5 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center font-label-code text-[11px]">3</span>
<span className="font-body-sm text-body-sm">Part Category</span>
<span className="material-symbols-outlined text-outline text-[16px] ml-space-xs">chevron_right</span>
</li>

<li className="flex items-center gap-space-xs text-on-surface-variant opacity-60">
<span className="w-5 h-5 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center font-label-code text-[11px]">4</span>
<span className="font-body-sm text-body-sm">Position &amp; Fit</span>
</li>
</ol>
<div className="hidden lg:flex items-center gap-2 font-label-code text-caption text-on-surface-variant">
<span className="material-symbols-outlined text-[16px]">verified</span>
<span>DISAMBIGUATION ENGINE · 100% FIT SPEC</span>
</div>
</div>
</div>
</div>

<div className="sticky top-26 z-40 bg-surface-container-lowest/95 backdrop-blur-md shadow-sm">
<div className="max-w-[1400px] mx-auto px-margin md:px-margin-desktop py-2.5 flex items-center justify-between">
<div className="flex items-center gap-space-md">
<div className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-primary">
<span className="material-symbols-outlined text-[20px]">directions_car</span>
</div>
<div className="flex flex-col sm:flex-row sm:items-center sm:gap-space-md">
<div className="flex items-center gap-2">
<span className="font-headline-sm text-headline-sm text-on-surface">2018 Honda Fit</span>
<span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-label-code text-caption">JDM / GK-GP SERIES</span>
</div>
<span className="hidden sm:inline text-surface-dim font-label-code">/</span>
<span className="font-caption text-caption text-on-surface-variant">Awaiting chassis &amp; drivetrain specification confirmation</span>
</div>
</div>
<button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-medium transition-all shadow-sm">
<span className="material-symbols-outlined text-[15px]">edit</span>
<span>Change car</span>
</button>
</div>
</div>

<div className="max-w-[1400px] mx-auto w-full px-margin md:px-margin-desktop py-space-xl">
<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">

<section className="lg:col-span-8 flex flex-col gap-space-lg">

<div className="bg-surface-container-lowest p-space-lg sm:p-space-xl rounded-xl shadow-sm">
<div className="flex flex-col gap-1 mb-space-lg">
<div className="flex items-center justify-between">
<span className="font-label-code text-caption uppercase tracking-wider text-secondary">Step 02 Disambiguation</span>
<span className="font-label-code text-caption text-on-tertiary-container bg-tertiary-fixed/30 px-2 py-0.5 rounded">FITMENT SENSITIVE</span>
</div>
<h1 className="font-headline-lg text-headline-lg text-on-surface">Which 2018 Honda Fit is it?</h1>
<p className="font-body-md text-body-md text-on-surface-variant mt-1">
              These versions take different filters, brakes, fluids, and suspension mounts. Pick the exact powertrain on your fitness certificate or chassis plate.
            </p>
</div>

<div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md" id="trim-selector">

<label className="relative flex flex-col justify-between p-space-lg rounded-xl bg-surface-container-lowest shadow-md ring-2 ring-primary cursor-pointer transition-all duration-150 hover:shadow-lg">
<input checked="" className="sr-only" name="trim_choice" type="radio" value="hybrid" />
<div>
<div className="flex items-start justify-between gap-2 mb-space-sm">
<div className="flex flex-col">
<span className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-1.5">
                      1.5 hybrid
                    </span>
<span className="font-label-code text-caption text-secondary mt-0.5">GP5 · LEB · 7-speed DCT</span>
</div>
<span className="w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
<span className="material-symbols-outlined text-[14px]">check</span>
</span>
</div>
<div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed font-caption text-caption mb-space-md font-semibold">
<span className="material-symbols-outlined text-[13px]">verified</span>
<span>Most common in fleet (Kingston)</span>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
                  Takes 0W-20 hybrid synthetic oil, dedicated dual-clutch fluid (DW-1/ATF-TYPE 2.0 equivalent), and electronic servo brake booster units.
                </p>
</div>
<div className="pt-space-sm bg-surface-container-low -mx-space-lg -mb-space-lg p-space-md rounded-b-xl flex items-center justify-between font-label-code text-caption text-on-surface">
<span className="text-secondary">Chassis match:</span>
<span className="font-bold">GP5-1000001+</span>
</div>
</label>

<label className="relative flex flex-col justify-between p-space-lg rounded-xl bg-surface-container-lowest shadow-sm hover:shadow-md cursor-pointer transition-all duration-150">
<input className="sr-only" name="trim_choice" type="radio" value="petrol_15" />
<div>
<div className="flex items-start justify-between gap-2 mb-space-sm">
<div className="flex flex-col">
<span className="font-headline-sm text-headline-sm text-on-surface">
                      1.5 petrol
                    </span>
<span className="font-label-code text-caption text-secondary mt-0.5">GK5 · L15B · CVT</span>
</div>
<span className="w-5 h-5 rounded-full bg-surface-container-high text-transparent flex items-center justify-center shrink-0">
<span className="material-symbols-outlined text-[14px]">check</span>
</span>
</div>
<div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-caption text-caption mb-space-md">
<span>Standard i-VTEC Sport / RS</span>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
                  Naturally aspirated direct-injection engine with HCF-2 transmission fluid requirements and mechanical vacuum brake boosters.
                </p>
</div>
<div className="pt-space-sm bg-surface-container-low -mx-space-lg -mb-space-lg p-space-md rounded-b-xl flex items-center justify-between font-label-code text-caption text-on-surface">
<span className="text-secondary">Chassis match:</span>
<span className="font-bold">GK5-1200001+</span>
</div>
</label>

<label className="relative flex flex-col justify-between p-space-lg rounded-xl bg-surface-container-lowest shadow-sm hover:shadow-md cursor-pointer transition-all duration-150">
<input className="sr-only" name="trim_choice" type="radio" value="petrol_13" />
<div>
<div className="flex items-start justify-between gap-2 mb-space-sm">
<div className="flex flex-col">
<span className="font-headline-sm text-headline-sm text-on-surface">
                      1.3 petrol
                    </span>
<span className="font-label-code text-caption text-secondary mt-0.5">GK3 · L13B · CVT</span>
</div>
<span className="w-5 h-5 rounded-full bg-surface-container-high text-transparent flex items-center justify-center shrink-0">
<span className="material-symbols-outlined text-[14px]">check</span>
</span>
</div>
<div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-caption text-caption mb-space-md">
<span>Entry JDM petrol engine</span>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
                  Atkinson cycle L13B Atkinson powertrain with smaller front disc calipers (240mm rotor) and alternate alternator clutch assembly.
                </p>
</div>
<div className="pt-space-sm bg-surface-container-low -mx-space-lg -mb-space-lg p-space-md rounded-b-xl flex items-center justify-between font-label-code text-caption text-on-surface">
<span className="text-secondary">Chassis match:</span>
<span className="font-bold">GK3-1200001+</span>
</div>
</label>

<label className="relative flex flex-col justify-between p-space-lg rounded-xl bg-surface-container-low shadow-sm hover:shadow-md cursor-pointer transition-all duration-150">
<input className="sr-only" name="trim_choice" type="radio" value="unsure" />
<div>
<div className="flex items-start justify-between gap-2 mb-space-sm">
<div className="flex flex-col">
<span className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-1.5">
<span>Not sure</span>
<span className="material-symbols-outlined text-[18px] text-secondary">help_outline</span>
</span>
<span className="font-label-code text-caption text-secondary mt-0.5">Universal Catalog Mode</span>
</div>
<span className="w-5 h-5 rounded-full bg-surface-container-high text-transparent flex items-center justify-center shrink-0">
<span className="material-symbols-outlined text-[14px]">check</span>
</span>
</div>
<div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container-highest text-on-surface font-caption text-caption mb-space-md font-semibold">
<span>Shows all matching options</span>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
                  We'll present items that fit each variant and flag parts with a color-coded version chip so technicians never install incompatible spares.
                </p>
</div>
<div className="pt-space-sm bg-surface-container -mx-space-lg -mb-space-lg p-space-md rounded-b-xl flex items-center justify-between font-label-code text-caption text-on-surface">
<span className="text-secondary">Filter mode:</span>
<span className="font-bold text-on-tertiary-container">Annotated Comparison</span>
</div>
</label>
</div>

<div className="mt-space-lg p-space-md rounded-lg bg-surface-container flex items-start gap-space-md shadow-sm">
<div className="w-7 h-7 rounded bg-surface-container-highest flex items-center justify-center text-primary shrink-0 mt-0.5">
<span className="material-symbols-outlined text-[18px]">info</span>
</div>
<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full gap-space-sm">
<p className="font-body-sm text-body-sm text-on-surface">
                It's the <strong className="font-semibold text-primary">Model Code</strong> on your fitness certificate or the aluminum stamped plate riveted to the driver's door B-pillar.
              </p>
<div className="shrink-0 font-label-code text-caption bg-surface-container-lowest px-2.5 py-1 rounded text-primary font-bold shadow-sm">
                e.g. GP5-3204918
              </div>
</div>
</div>

<div className="mt-space-lg pt-space-md flex flex-col gap-space-sm bg-surface-container-low p-space-md rounded-lg">
<div className="flex items-center justify-between text-on-surface font-label-code text-caption">
<span className="font-bold">PARTS FIT COMPATIBILITY RADAR</span>
<span className="text-secondary">GP5 HYBRID SELECTION</span>
</div>
<div className="grid grid-cols-3 gap-2">
<div className="p-2 rounded bg-surface-container-lowest">
<span className="font-caption text-caption text-secondary block">Powertrain</span>
<span className="font-label-code text-caption font-semibold text-on-surface">1,496 cc DOHC</span>
</div>
<div className="p-2 rounded bg-surface-container-lowest">
<span className="font-caption text-caption text-secondary block">Transmission</span>
<span className="font-label-code text-caption font-semibold text-on-surface">7-Spd Dual Clutch</span>
</div>
<div className="p-2 rounded bg-surface-container-lowest">
<span className="font-caption text-caption text-secondary block">Front Brake Rotor</span>
<span className="font-label-code text-caption font-semibold text-on-surface">262mm Vented Disc</span>
</div>
</div>
</div>

<div className="mt-space-xl pt-space-lg flex items-center justify-between">
<button className="px-space-lg py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-semibold flex items-center gap-1.5 transition-all">
<span className="material-symbols-outlined text-[16px]">arrow_back</span>
<span>Back</span>
</button>
<button className="px-space-xl py-2.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-body-md text-body-md font-semibold flex items-center gap-2 transition-all shadow-md active:scale-95">
<span>Continue to Categories</span>
<span className="material-symbols-outlined text-[18px]">arrow_forward</span>
</button>
</div>
</div>
</section>

<aside className="lg:col-span-4 flex flex-col gap-space-lg">

<div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">
<div className="flex items-center justify-between mb-space-md">
<span className="font-label-code text-caption text-secondary">ACTIVE VEHICLE CONTEXT</span>
<span className="w-2 h-2 rounded-full bg-on-tertiary-container animate-pulse"></span>
</div>
<div className="relative rounded-lg overflow-hidden mb-space-md bg-surface-container">
<img className="w-full h-36 object-cover object-center" data-alt="Modern Japanese white hatchback parked cleanly under bright morning Caribbean sunlight with crisp road reflection, precision side-angle showcase in a modern fleet bay with concrete floor and minimal technical equipment in Kingston." src="https://lh3.googleusercontent.com/aida-public/AB6AXuBC94boDsO6smYsCV8uBJPN5CZzAazM8yHv0CMvqPh-Psz7E0bn9Wyv0XVU3HVK3PDFirfBXkTBzjAuLhhcyhCsU5zgXcQzPSvgqZjrG9x285Icgeu5_TD7J6XKmwnQwPGrflwH2EPDb5uGTGqk0DH2hJ4KRuMOHMFE45rqQBk7k5X9pVOwbp1JXilY2ubk9sTCLrZeYOZ6jRvxurpz64Vns7j7oAbImPHJDD8eHYw" />
<div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-primary/80 backdrop-blur-md text-on-primary font-label-plate text-[12px]">
              2018 HONDA FIT
            </div>
</div>
<div className="flex flex-col gap-2 font-body-sm text-body-sm">
<div className="flex items-center justify-between py-1 bg-surface-container-low px-2 rounded">
<span className="text-on-surface-variant font-caption text-caption">Generation:</span>
<span className="font-label-code font-bold text-on-surface">3rd Gen (GK/GP Facelift)</span>
</div>
<div className="flex items-center justify-between py-1 bg-surface-container-low px-2 rounded">
<span className="text-on-surface-variant font-caption text-caption">Drive Layout:</span>
<span className="font-label-code font-bold text-on-surface">FF (Front-Wheel Drive)</span>
</div>
<div className="flex items-center justify-between py-1 bg-surface-container-low px-2 rounded">
<span className="text-on-surface-variant font-caption text-caption">Body Style:</span>
<span className="font-label-code font-bold text-on-surface">5-Door Hatchback</span>
</div>
</div>
</div>

<div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">
<div className="flex items-center gap-2 mb-space-sm text-primary">
<span className="material-symbols-outlined text-[20px]">hub</span>
<h3 className="font-headline-sm text-body-md font-bold text-on-surface">Kingston Hub Fleet Telemetry</h3>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
            There are <strong className="font-semibold text-primary">2 Honda Fits</strong> registered in the local Kingston Roam fleet inventory.
          </p>
<div className="flex flex-col gap-space-sm">
<div className="p-space-sm rounded-lg bg-surface-container-low flex items-center justify-between">
<div className="flex items-center gap-space-sm">
<span className="w-7 h-7 rounded bg-surface-container-highest flex items-center justify-center font-label-code text-caption font-bold">#04</span>
<div className="flex flex-col">
<span className="font-label-code text-caption font-semibold">2781-KM (Fit Hybrid)</span>
<span className="font-caption text-caption text-secondary">Active Dispatch · Kingston</span>
</div>
</div>
<span className="font-label-code text-caption font-bold px-2 py-0.5 rounded bg-surface-container-highest">GP5</span>
</div>
<div className="p-space-sm rounded-lg bg-surface-container-low flex items-center justify-between">
<div className="flex items-center gap-space-sm">
<span className="w-7 h-7 rounded bg-surface-container-highest flex items-center justify-center font-label-code text-caption font-bold">#19</span>
<div className="flex flex-col">
<span className="font-label-code text-caption font-semibold">8943-JX (Fit Hybrid)</span>
<span className="font-caption text-caption text-secondary">In Depot · St. Andrew East</span>
</div>
</div>
<span className="font-label-code text-caption font-bold px-2 py-0.5 rounded bg-surface-container-highest">GP5</span>
</div>
</div>
<div className="mt-space-md p-space-sm rounded bg-surface-container text-on-surface font-caption text-caption flex items-center gap-1.5">
<span className="material-symbols-outlined text-[16px] text-secondary">insights</span>
<span>100% of Roam fleet fits are 1.5 Hybrid GP5 variants.</span>
</div>
</div>

<div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">
<div className="flex items-center gap-2 mb-space-sm text-primary">
<span className="material-symbols-outlined text-[20px]">description</span>
<h3 className="font-headline-sm text-body-md font-bold text-on-surface">Jamaica MV-99 Paper Guide</h3>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
            Look for these fields on your Tax Administration Jamaica (TAJ) Fitness Certificate or Certificate of Title:
          </p>
<div className="space-y-space-sm">
<div className="p-2 rounded-lg bg-surface-container-low flex items-start gap-2">
<span className="material-symbols-outlined text-secondary text-[16px] mt-0.5">pin</span>
<div className="flex flex-col">
<span className="font-label-code text-caption font-semibold">CHASSIS / FRAME NO.</span>
<span className="font-caption text-caption text-on-surface-variant">The prefix characters before the hyphen (e.g. <span className="font-bold text-on-surface">GP5</span>-3012948) dictate the powertrain.</span>
</div>
</div>
<div className="p-2 rounded-lg bg-surface-container-low flex items-start gap-2">
<span className="material-symbols-outlined text-secondary text-[16px] mt-0.5">speed</span>
<div className="flex flex-col">
<span className="font-label-code text-caption font-semibold">ENGINE NUMBER / CC</span>
<span className="font-caption text-caption text-on-surface-variant"><span className="font-bold text-on-surface">LEB-H1</span> indicates 1.5 Hybrid; <span className="font-bold text-on-surface">L15B</span> indicates 1.5 Petrol non-hybrid.</span>
</div>
</div>
</div>
</div>

<div className="bg-primary text-on-primary rounded-xl p-space-lg shadow-md">
<div className="flex items-center gap-space-sm mb-space-sm">
<div className="w-8 h-8 rounded-full bg-surface-container-lowest/10 flex items-center justify-center">
<span className="material-symbols-outlined text-[18px]">verified_user</span>
</div>
<div>
<h4 className="font-headline-sm text-body-md font-bold">Zero-Fitment Guarantee</h4>
<span className="font-label-code text-caption opacity-80">PROTECTION PROTOCOL</span>
</div>
</div>
<p className="font-body-sm text-body-sm opacity-90 mb-space-md">
            Orders placed via verified trim matching include free dispatch exchange if parts fail mechanical fit verification during Kingston depot install.
          </p>
<div className="flex items-center justify-between text-caption font-label-code opacity-75">
<span>AUDIT ID: KIN-VER-2025</span>
<span className="flex items-center gap-1">
<span className="material-symbols-outlined text-[13px]">lock</span>
<span>LOCKED FIT SPEC</span>
</span>
</div>
</div>

<div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">
<div className="flex items-center justify-between mb-space-sm">
<span className="font-label-code text-caption text-secondary">PARTS DESK HELP</span>
<span className="font-caption text-caption text-on-tertiary-container bg-surface-container px-1.5 py-0.5 rounded">24/7 ROAM LEAD</span>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
            Unsure of the chassis serial? Send your MV registration plate number or photo to our certified Jamaican parts dispatch team.
          </p>
<button className="w-full py-2 px-space-md rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-semibold flex items-center justify-center gap-2 transition-all">
<span className="material-symbols-outlined text-[18px]">support_agent</span>
<span>Lookup Chassis for Me</span>
</button>
</div>
</aside>
</div>
</div>
</div>
</main>