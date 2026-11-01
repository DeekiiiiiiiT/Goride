/** Ported from Stitch gap screen — panel only (audit R16-01). */
import { GapModalShell } from './GapModalShell';
import { useGapCompliance } from './useGapCompliance';

export function GapLocationsBins(p: { onClose?: () => void }) {
  const compliance = useGapCompliance();
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="LocationsBins">
      <div className="fleet-inventory-stitch inventory-stitch-root">
        <div className="inventory-stitch-main"><div className="flex flex-col w-full">

        <div className="px-margin-desktop py-space-md flex flex-col md:flex-row md:items-center justify-between gap-space-md">
        <div className="flex flex-col gap-space-xs">
        <div className="flex items-center gap-space-xs">
        <a className="font-caption text-caption text-secondary hover:text-primary transition-colors flex items-center gap-1" href="#">
        <span className="material-symbols-outlined text-[13px]">arrow_back</span>
                  Settings
                </a>
        <span className="text-surface-dim font-caption text-caption">/</span>
        <span className="font-caption text-caption text-on-surface font-semibold">Locations & Bins</span>
        </div>
        <div className="flex items-baseline gap-space-md">
        <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">Locations & Bins</h1>
        <span className="font-label-code text-[11px] text-secondary bg-surface-container px-2 py-0.5 rounded">HUB: KIN-01</span>
        </div>
        <p className="font-body-sm text-body-sm text-secondary">
                Manage storage depots, vehicle inventory lockers, and physical warehouse bins across the fleet network.
              </p>
        </div>

        <div className="flex items-center gap-space-sm shrink-0">
        <button type="button" className="px-space-md py-2 rounded-lg bg-surface-container-lowest text-primary shadow-sm hover:bg-surface-container transition-all flex items-center gap-1.5 font-body-sm text-body-sm font-semibold" onclick="document.getElementById('modal-new-location').classList.toggle('hidden')">
        <span className="material-symbols-outlined text-[18px]">add_location_alt</span>
                + New location
              </button>
        <button type="button" className="px-space-lg py-2 rounded-lg bg-primary text-on-primary shadow-md hover:bg-primary/90 transition-all flex items-center gap-1.5 font-body-sm text-body-sm font-semibold" onclick="document.getElementById('modal-new-bin').classList.toggle('hidden')">
        <span className="material-symbols-outlined text-[18px] text-on-primary">inventory_2</span>
                + New bin
              </button>
        </div>
        </div>

        <div className="px-margin-desktop pb-space-xl grid grid-cols-1 xl:grid-cols-12 gap-gutter-desktop items-start">

        <div className="xl:col-span-4 flex flex-col gap-space-md w-full">

        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col gap-space-sm">
        <div className="relative w-full">
        <span className="material-symbols-outlined text-secondary absolute left-3 top-2.5 text-[18px]">search</span>
        <input className="w-full pl-9 pr-space-md py-2 bg-surface-container-low rounded-lg font-body-sm text-body-sm text-on-surface focus:outline-none focus:bg-surface-container-lowest transition-colors" placeholder="Search code, plate, or depot..." type="text"/>
        </div>
        <div className="flex items-center justify-between font-caption text-caption text-secondary px-1">
        <span>5 Active Storage Targets</span>
        <span className="font-label-code text-caption font-semibold">TOTAL: J$ 93,185.00</span>
        </div>
        </div>

        <div className="flex flex-col gap-space-md">

        <div className="flex flex-col gap-space-xs">
        <div className="flex items-center justify-between px-space-xs py-1">
        <span className="font-caption text-caption text-secondary font-bold tracking-wider uppercase">Warehouses & Depots (2)</span>
        <span className="material-symbols-outlined text-secondary text-[16px]">warehouse</span>
        </div>

        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-md cursor-pointer transition-all relative overflow-hidden bg-gradient-to-r from-surface-container-high/40 to-surface-container-lowest">
        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary"></div>
        <div className="flex items-start justify-between gap-space-sm pl-2">
        <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-space-xs">
        <span className="font-label-code text-caption px-1.5 py-0.5 bg-primary text-on-primary rounded font-bold">MAIN</span>
        <span className="font-body-md text-body-md text-primary font-semibold">Main store — Kingston</span>
        </div>
        <span className="font-body-sm text-body-sm text-secondary">Terminal 3, Marcus Garvey Dr</span>
        </div>
        <span className="bg-secondary-container text-on-secondary-fixed text-[11px] font-caption px-2 py-0.5 rounded-full font-semibold shrink-0">Default depot</span>
        </div>
        <div className="mt-space-sm pt-space-xs flex items-center justify-between pl-2 font-caption text-caption">
        <span className="text-secondary flex items-center gap-1 font-body-sm">
        <span className="material-symbols-outlined text-[15px]">inventory_2</span> 2 items allocated
                      </span>
        <span className="font-label-price text-label-price text-on-surface">J$ 20,400.00</span>
        </div>
        </div>

        <div className="bg-surface-container-lowest hover:bg-surface-container-low p-space-md rounded-xl shadow-sm cursor-pointer transition-all">
        <div className="flex items-start justify-between gap-space-sm">
        <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-space-xs">
        <span className="font-label-code text-caption px-1.5 py-0.5 bg-surface-container-high text-secondary rounded font-bold">MBY</span>
        <span className="font-body-md text-body-md text-on-surface font-medium">Montego Bay Outpost</span>
        </div>
        <span className="font-body-sm text-body-sm text-secondary">Freeport Wharf Sector 4</span>
        </div>
        <span className="text-secondary font-caption text-caption">Standby</span>
        </div>
        <div className="mt-space-sm flex items-center justify-between font-caption text-caption text-secondary">
        <span>0 items</span>
        <span className="font-label-price text-label-price text-secondary">J$ 0.00</span>
        </div>
        </div>
        </div>

        <div className="flex flex-col gap-space-xs">
        <div className="flex items-center justify-between px-space-xs py-1">
        <span className="font-caption text-caption text-secondary font-bold tracking-wider uppercase">Vehicle Lockers (2 active cars)</span>
        <span className="material-symbols-outlined text-secondary text-[16px]">directions_car</span>
        </div>

        <div className="bg-surface-container-lowest hover:bg-surface-container-low p-space-md rounded-xl shadow-sm cursor-pointer transition-all">
        <div className="flex items-start justify-between gap-space-sm">
        <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-space-xs">
        <span className="font-label-plate text-caption px-1.5 py-0.5 bg-surface-container-highest text-primary rounded font-bold">5179KZ</span>
        <span className="font-body-md text-body-md text-on-surface font-medium">Toyota Roomy</span>
        </div>
        <span className="font-label-code text-caption text-secondary">Lockbox Trunk A & B</span>
        </div>
        <span className="bg-surface-container text-secondary text-[11px] font-caption px-2 py-0.5 rounded-full font-medium">Route En Route</span>
        </div>
        <div className="mt-space-sm flex items-center justify-between font-caption text-caption">
        <span className="text-secondary font-body-sm">6 items</span>
        <span className="font-label-price text-label-price text-on-surface">J$ 48,980.00</span>
        </div>
        </div>

        <div className="bg-surface-container-lowest hover:bg-surface-container-low p-space-md rounded-xl shadow-sm cursor-pointer transition-all">
        <div className="flex items-start justify-between gap-space-sm">
        <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-space-xs">
        <span className="font-label-plate text-caption px-1.5 py-0.5 bg-surface-container-highest text-primary rounded font-bold">1505LM</span>
        <span className="font-body-md text-body-md text-on-surface font-medium">Honda Fit</span>
        </div>
        <span className="font-label-code text-caption text-secondary">Locker Tray #2</span>
        </div>
        <span className="bg-surface-container text-secondary text-[11px] font-caption px-2 py-0.5 rounded-full font-medium">Serviced</span>
        </div>
        <div className="mt-space-sm flex items-center justify-between font-caption text-caption">
        <span className="text-secondary font-body-sm">3 items</span>
        <span className="font-label-price text-label-price text-on-surface">J$ 18,205.00</span>
        </div>
        </div>
        </div>

        <div className="flex flex-col gap-space-xs">
        <div className="flex items-center justify-between px-space-xs py-1">
        <span className="font-caption text-caption text-secondary font-bold tracking-wider uppercase">Custodians & Staff (1)</span>
        <span className="material-symbols-outlined text-secondary text-[16px]">badge</span>
        </div>

        <div className="bg-surface-container-lowest hover:bg-surface-container-low p-space-md rounded-xl shadow-sm cursor-pointer transition-all">
        <div className="flex items-start justify-between gap-space-sm">
        <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-space-xs">
        <span className="font-label-code text-caption px-1.5 py-0.5 bg-surface-container text-on-surface rounded font-bold">STF-DEEKI</span>
        <span className="font-body-md text-body-md text-on-surface font-medium">Deeki T (Field Kit)</span>
        </div>
        <span className="font-body-sm text-body-sm text-secondary">Lead Mobile Tech · Kingston Core</span>
        </div>
        </div>
        <div className="mt-space-sm flex items-center justify-between font-caption text-caption">
        <span className="text-secondary font-body-sm">1 item</span>
        <span className="font-label-price text-label-price text-on-surface">J$ 5,600.00</span>
        </div>
        </div>
        </div>
        </div>
        </div>

        <div className="xl:col-span-8 flex flex-col gap-space-lg w-full">

        <div className="bg-surface-container-lowest p-space-xl rounded-xl shadow-md flex flex-col gap-space-lg">

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-space-md pb-space-sm">
        <div className="flex items-start gap-space-md">
        <div className="w-12 h-12 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-[24px]">corporate_fare</span>
        </div>
        <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-space-sm">
        <span className="font-label-code text-caption px-2 py-0.5 rounded bg-primary text-on-primary font-bold">MAIN</span>
        <h2 className="font-headline-sm text-headline-sm text-primary font-bold">Main store — Kingston</h2>
        </div>
        <span className="font-body-sm text-body-sm text-secondary font-medium">Central Depot Warehouse · Primary Inbound Terminal</span>
        <p className="font-body-sm text-body-sm text-on-surface mt-1 flex items-center gap-1">
        <span className="material-symbols-outlined text-[16px] text-secondary">pin_drop</span>
                        Terminal 3, Marcus Garvey Drive, Kingston Port, Jamaica
                      </p>
        </div>
        </div>
        <div className="flex items-center gap-space-xs self-start shrink-0">
        <button type="button" className="px-space-md py-1.5 rounded-lg bg-surface-container hover:bg-surface-variant font-body-sm text-body-sm text-on-surface font-medium transition-colors flex items-center gap-1">
        <span className="material-symbols-outlined text-[16px]">edit</span> Edit Details
                    </button>
        <button type="button" className="px-space-md py-1.5 rounded-lg bg-surface-container hover:bg-surface-variant font-body-sm text-body-sm text-on-surface font-medium transition-colors flex items-center gap-1">
        <span className="material-symbols-outlined text-[16px]">print</span> Label Sheet
                    </button>
        </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">

        <div className="md:col-span-2 relative rounded-lg overflow-hidden bg-surface-container-high h-40 shadow-sm flex flex-col justify-between p-3" data-location="Terminal 3 Marcus Garvey Drive Kingston Jamaica" style="background-image: url('https://lh3.googleusercontent.com/aida-public/AB6AXuCwbxy-kHvBb5RaTCU9H11JzSZEQbTOc246FvktoeJuKdukZelDfFc6qFn2JTZVz-2Dkrt9ojmeBC7fi2Ju-xH7m5hu47TDGK2DFlvr4K1uT-9I0LRHVSIBQNauH_D8xS8VoHncLHYfTVh-mL2YO_uH-PpyWshI67CAR_86hlgvGi8LuXfh3aZFPHSzylFLqFRmhRAnt_-raj7olE_6EyBtKwXT233cS2VzrmiB5Vs')">
        <div className="absolute inset-0 bg-primary/20 backdrop-blur-[1px]"></div>
        <div className="relative z-10 flex items-center justify-between">
        <span className="font-label-code text-caption px-2 py-0.5 bg-primary text-on-primary rounded font-semibold tracking-wide">GEO: 17.9714° N, 76.8118° W</span>
        <span className="bg-surface-container-lowest text-primary font-caption text-caption px-2 py-0.5 rounded shadow-sm">Kingston Harbour Sector</span>
        </div>
        <div className="relative z-10 bg-surface-container-lowest/95 p-2 rounded-lg backdrop-blur-sm self-start flex items-center gap-2 text-on-surface">
        <span className="material-symbols-outlined text-primary text-[18px]">navigation</span>
        <span className="font-label-code text-caption font-semibold">Berth 11 Access Gate · 24/7 Gatehouse Active</span>
        </div>
        </div>

        <div className="relative rounded-lg overflow-hidden h-40 shadow-sm group">
        <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" data-alt="Modern concrete logistics warehouse depot exterior in Kingston Jamaica industrial port under tropical Caribbean sky with secure metal roller doors and commercial transport bay." src="https://lh3.googleusercontent.com/aida-public/AB6AXuAJbbu4iOJmvIa0SeSCyoDXuukj3FnKrWKgMsyXEWiJPwQkiAl70rOnCwmsPmg8PNwGXqz6BjbHAEtnjNWZ5WBuNibFzOqPt9UaMQ03W4e8cOvrqL_sOa6dUxCrYpNW2Bn6B9wDN3X4dxnFqrtTzIEewroArk6Y5MQ8Shbaewh8loGRPjZyed-zJBg-i0R50FVxfcca3VHG1OodfLka4tMHiYN-2MJaOpZV-yjUemg"/>
        <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-transparent to-transparent flex items-end p-space-sm">
        <span className="font-caption text-caption text-on-primary font-medium flex items-center gap-1">
        <span className="material-symbols-outlined text-[14px]">photo_camera</span> Secure Facility Bay 3
                      </span>
        </div>
        </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-space-md">
        <div className="bg-surface-container p-space-md rounded-lg flex flex-col gap-0.5">
        <span className="font-caption text-caption text-secondary uppercase font-semibold">Total Stock Value</span>
        <span className="font-label-price text-headline-sm text-primary">J$ 20,400.00</span>
        <span className="font-caption text-caption text-secondary">Landed valuation</span>
        </div>
        <div className="bg-surface-container p-space-md rounded-lg flex flex-col gap-0.5">
        <span className="font-caption text-caption text-secondary uppercase font-semibold">Assigned Bins</span>
        <span className="font-headline-sm text-headline-sm text-primary font-bold">5 Bins</span>
        <span className="font-caption text-caption text-secondary">3 With Allocations</span>
        </div>
        <div className="bg-surface-container p-space-md rounded-lg flex flex-col gap-0.5">
        <span className="font-caption text-caption text-secondary uppercase font-semibold">Items Held</span>
        <span className="font-headline-sm text-headline-sm text-primary font-bold">2 SKUs</span>
        <span className="font-caption text-caption text-secondary">1 Tyres · 1 Telematics</span>
        </div>
        <div className="bg-surface-container p-space-md rounded-lg flex flex-col gap-0.5">
        <span className="font-caption text-caption text-secondary uppercase font-semibold">Bin Occupancy</span>
        <div className="flex items-center gap-2 mt-0.5">
        <span className="font-label-code text-body-md text-primary font-bold">42%</span>
        <div className="flex-1 h-2 bg-surface-variant rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full" style="width: 42%;"></div>
        </div>
        </div>
        <span className="font-caption text-caption text-secondary">Max vol: 57 units</span>
        </div>
        </div>

        <div className="p-space-md bg-surface-container-low rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-space-md">
        <div className="flex flex-wrap items-center gap-space-lg">

        <label className="flex items-center gap-space-xs cursor-pointer">
        <div className="relative inline-flex items-center h-5 rounded-full w-9 bg-primary cursor-pointer transition-colors">
        <span className="translate-x-4 inline-block w-3.5 h-3.5 transform bg-on-primary rounded-full transition-transform"></span>
        </div>
        <div className="flex flex-col">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Default location</span>
        <span className="font-caption text-[10px] text-secondary">Preferred inbound receipt hub</span>
        </div>
        </label>

        <label className="flex items-center gap-space-xs cursor-pointer">
        <div className="relative inline-flex items-center h-5 rounded-full w-9 bg-primary cursor-pointer transition-colors">
        <span className="translate-x-4 inline-block w-3.5 h-3.5 transform bg-on-primary rounded-full transition-transform"></span>
        </div>
        <div className="flex flex-col">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Locked store</span>
        <span className="font-caption text-[10px] text-secondary">Keyholder scan required</span>
        </div>
        </label>

        <label className="flex items-center gap-space-xs cursor-pointer">
        <div className="relative inline-flex items-center h-5 rounded-full w-9 bg-primary cursor-pointer transition-colors">
        <span className="translate-x-4 inline-block w-3.5 h-3.5 transform bg-on-primary rounded-full transition-transform"></span>
        </div>
        <div className="flex flex-col">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Active depot</span>
        <span className="font-caption text-[10px] text-secondary">Accepting dispatches</span>
        </div>
        </label>
        </div>

        <div className="relative group shrink-0">
        <button type="button" className="px-space-md py-2 rounded-lg bg-surface-variant text-on-surface-variant/40 font-body-sm text-body-sm font-semibold cursor-not-allowed flex items-center gap-1.5" disabled="">
        <span className="material-symbols-outlined text-[16px]">archive</span>
                      Archive location
                    </button>

        <div className="absolute right-0 bottom-full mb-2 hidden group-hover:flex flex-col w-72 p- space-md bg-inverse-surface text-inverse-on-surface text-caption font-caption rounded-lg shadow-xl z-30">
        <div className="flex items-center gap-1 text-on-tertiary-fixed-variant font-bold mb-0.5">
        <span className="material-symbols-outlined text-[14px]">warning</span> Blocked Action
                      </div>
        <span>Cannot archive Main store while stock is inside. Move the 2 items out first.</span>
        </div>
        </div>
        </div>
        </div>

        <div className="bg-surface-container-lowest p-space-xl rounded-xl shadow-md flex flex-col gap-space-md">

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
        <div className="flex flex-col">
        <h3 className="font-headline-sm text-headline-sm text-primary font-bold">Physical Storage Bins in Main store — Kingston</h3>
        <span className="font-body-sm text-body-sm text-secondary">5 registered bins configured for rack, shelf, and heavy store management</span>
        </div>
        <div className="flex items-center gap-space-sm shrink-0">
        <div className="relative">
        <span className="material-symbols-outlined text-secondary absolute left-2.5 top-2 text-[16px]">filter_list</span>
        <input className="pl-8 pr-3 py-1.5 bg-surface-container-low rounded-lg font-body-sm text-body-sm text-on-surface focus:outline-none focus:bg-surface-container-lowest" placeholder="Filter bins..." type="text"/>
        </div>
        <button type="button" className="px-space-md py-1.5 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-semibold hover:bg-primary/90 transition-all flex items-center gap-1" onclick="document.getElementById('modal-new-bin').classList.remove('hidden')">
        <span className="material-symbols-outlined text-[16px]">add</span> + Add bin
                    </button>
        </div>
        </div>

        <div className="overflow-x-auto w-full">
        <table className="w-full text-left font-body-md text-body-md border-collapse">
        <thead>
        <tr className="bg-surface-container-low text-secondary font-caption text-caption uppercase tracking-wider">
        <th className="py-2.5 px-space-md font-bold rounded-l-lg">Bin Code</th>
        <th className="py-2.5 px-space-md font-bold">Zone / Department</th>
        <th className="py-2.5 px-space-md font-bold">Capacity</th>
        <th className="py-2.5 px-space-md font-bold">Items in Bin</th>
        <th className="py-2.5 px-space-md font-bold text-right">Stock Value</th>
        <th className="py-2.5 px-space-md font-bold text-right rounded-r-lg">Status / Action</th>
        </tr>
        </thead>
        <tbody className="divide-y divide-surface-container-low">

        <tr className="hover:bg-surface-container/50 transition-colors">
        <td className="py-3 px-space-md">
        <div className="flex items-center gap-2">
        <span className="font-label-code text-label-code px-2 py-0.5 bg-surface-container-high rounded font-bold text-primary">A-01</span>
        <span className="material-symbols-outlined text-[16px] text-secondary">pallet</span>
        </div>
        </td>
        <td className="py-3 px-space-md">
        <span className="font-body-sm text-body-sm font-medium text-on-surface">Tyres & Heavy Spares</span>
        <div className="text-[11px] font-caption text-secondary">Ground Level Bay 1</div>
        </td>
        <td className="py-3 px-space-md">
        <span className="font-label-code text-body-sm text-secondary">4 units</span>
        </td>
        <td className="py-3 px-space-md">
        <div className="flex flex-col">
        <span className="font-body-sm text-body-sm font-semibold text-primary">1 item</span>
        <span className="font-caption text-caption text-secondary">Spare tyre 195/65 R15 (OEM Dunlop)</span>
        </div>
        </td>
        <td className="py-3 px-space-md text-right">
        <span className="font-label-price text-label-price text-on-surface">J$ 15,000.00</span>
        </td>
        <td className="py-3 px-space-md text-right">
        <div className="inline-flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-primary"></span>
        <span className="font-caption text-caption font-semibold text-primary">Active</span>
        </div>
        </td>
        </tr>

        <tr className="hover:bg-surface-container/50 transition-colors">
        <td className="py-3 px-space-md">
        <div className="flex items-center gap-2">
        <span className="font-label-code text-label-code px-2 py-0.5 bg-surface-container-high rounded font-bold text-primary">A-02</span>
        <span className="material-symbols-outlined text-[16px] text-secondary">shelves</span>
        </div>
        </td>
        <td className="py-3 px-space-md">
        <span className="font-body-sm text-body-sm font-medium text-on-surface">Cabin Accessories</span>
        <div className="text-[11px] font-caption text-secondary">Shelf Tier 2</div>
        </td>
        <td className="py-3 px-space-md">
        <span className="font-label-code text-body-sm text-secondary">20 units</span>
        </td>
        <td className="py-3 px-space-md">
        <span className="font-body-sm text-body-sm text-secondary italic">0 items (Empty)</span>
        </td>
        <td className="py-3 px-space-md text-right">
        <span className="font-label-price text-label-price text-secondary">J$ 0.00</span>
        </td>
        <td className="py-3 px-space-md text-right">
        <div className="inline-flex items-center gap-2">
        <button type="button" className="px-2 py-0.5 rounded bg-surface-container hover:bg-error-container hover:text-on-error-container text-secondary text-caption font-caption transition-colors">
                              Archive Bin
                            </button>
        </div>
        </td>
        </tr>

        <tr className="hover:bg-surface-container/50 transition-colors">
        <td className="py-3 px-space-md">
        <div className="flex items-center gap-2">
        <span className="font-label-code text-label-code px-2 py-0.5 bg-surface-container-high rounded font-bold text-primary">B-12</span>
        <span className="material-symbols-outlined text-[16px] text-secondary">grid_view</span>
        </div>
        </td>
        <td className="py-3 px-space-md">
        <span className="font-body-sm text-body-sm font-medium text-on-surface">Mobile Mounts</span>
        <div className="text-[11px] font-caption text-secondary">Small Bin Carousel B</div>
        </td>
        <td className="py-3 px-space-md">
        <span className="font-label-code text-body-sm text-secondary">15 units</span>
        </td>
        <td className="py-3 px-space-md">
        <div className="flex flex-col">
        <span className="font-body-sm text-body-sm font-semibold text-primary">1 item</span>
        <span className="font-caption text-caption text-secondary">Phone Holder Mount (Magnetic Vent Clip)</span>
        </div>
        </td>
        <td className="py-3 px-space-md text-right">
        <span className="font-label-price text-label-price text-on-surface">J$ 5,400.00</span>
        </td>
        <td className="py-3 px-space-md text-right">
        <div className="inline-flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-primary"></span>
        <span className="font-caption text-caption font-semibold text-primary">Active</span>
        </div>
        </td>
        </tr>

        <tr className="hover:bg-surface-container/50 transition-colors">
        <td className="py-3 px-space-md">
        <div className="flex items-center gap-2">
        <span className="font-label-code text-label-code px-2 py-0.5 bg-surface-container-high rounded font-bold text-primary">A-04</span>
        <span className="material-symbols-outlined text-[16px] text-secondary">lock</span>
        </div>
        </td>
        <td className="py-3 px-space-md">
        <span className="font-body-sm text-body-sm font-medium text-on-surface">High-Value Telematics & Cameras</span>
        <div className="text-[11px] font-caption text-secondary">Security Vault C-1</div>
        </td>
        <td className="py-3 px-space-md">
        <span className="font-label-code text-body-sm text-secondary">10 units</span>
        </td>
        <td className="py-3 px-space-md">
        <div className="flex items-center gap-1.5 text-on-tertiary-container font-caption text-caption bg-tertiary-fixed px-2 py-1 rounded inline-block">
        <span className="material-symbols-outlined text-[14px]">lock_clock</span> Locked cage (0 pending audits)
                          </div>
        </td>
        <td className="py-3 px-space-md text-right">
        <span className="font-label-price text-label-price text-secondary">—</span>
        </td>
        <td className="py-3 px-space-md text-right">
        <div className="inline-flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-primary"></span>
        <span className="font-caption text-caption font-semibold text-primary">Active</span>
        </div>
        </td>
        </tr>

        <tr className="hover:bg-surface-container/50 transition-colors">
        <td className="py-3 px-space-md">
        <div className="flex items-center gap-2">
        <span className="font-label-code text-label-code px-2 py-0.5 bg-surface-container-high rounded font-bold text-primary">A-05</span>
        <span className="material-symbols-outlined text-[16px] text-secondary">output</span>
        </div>
        </td>
        <td className="py-3 px-space-md">
        <span className="font-body-sm text-body-sm font-medium text-on-surface">Road Safety Kits & Triangles</span>
        <div className="text-[11px] font-caption text-secondary">Dispatch Staging Bay</div>
        </td>
        <td className="py-3 px-space-md">
        <span className="font-label-code text-body-sm text-secondary">8 units</span>
        </td>
        <td className="py-3 px-space-md">
        <div className="flex items-center gap-1 font-body-sm text-body-sm text-on-surface">
        <span className="material-symbols-outlined text-[16px] text-secondary">outbound</span>
        <span>Staged for vehicle</span>
        <span className="font-label-plate text-caption px-1.5 py-0.2 bg-surface-container rounded font-bold">5179KZ</span>
        </div>
        </td>
        <td className="py-3 px-space-md text-right">
        <span className="font-label-price text-label-price text-secondary">—</span>
        </td>
        <td className="py-3 px-space-md text-right">
        <div className="inline-flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-primary"></span>
        <span className="font-caption text-caption font-semibold text-primary">Active</span>
        </div>
        </td>
        </tr>
        </tbody>
        </table>
        </div>

        <div className="p-space-sm bg-surface-container rounded-lg flex items-center justify-between font-caption text-caption text-secondary">
        <div className="flex items-center gap-space-sm">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary"></span> QR Code scanning ready on all listed bins</span>
        <span>·</span>
        <span>Last inventory audit: Today, 14:15 EST by JD</span>
        </div>
        <a className="text-primary hover:underline font-semibold flex items-center gap-1" href="#">
                    Export Bins Catalog (CSV) <span className="material-symbols-outlined text-[14px]">download</span>
        </a>
        </div>
        </div>
        </div>
        </div>

        <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm hidden flex items-center justify-center p-4" id="modal-new-location">
        <div className="bg-surface-container-lowest rounded-xl max-w-lg w-full p-space-xl shadow-2xl flex flex-col gap-space-md relative">
        <div className="flex items-center justify-between pb-space-xs">
        <div className="flex items-center gap-space-xs">
        <div className="w-8 h-8 rounded bg-primary text-on-primary flex items-center justify-center">
        <span className="material-symbols-outlined text-[18px]">add_location</span>
        </div>
        <h3 className="font-headline-sm text-headline-sm text-primary font-bold">Register Storage Depot</h3>
        </div>
        <button type="button" className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-secondary" onclick="document.getElementById('modal-new-location').classList.add('hidden')">
        <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
        </div>
        <div className="flex flex-col gap-space-sm font-body-sm text-body-sm">
        <div className="grid grid-cols-3 gap-space-sm">
        <div className="flex flex-col gap-1">
        <label className="font-caption text-caption text-secondary uppercase font-semibold">Location Code</label>
        <input className="p-2 bg-surface-container-low rounded font-label-code text-label-code uppercase" placeholder="e.g. OCH" type="text"/>
        </div>
        <div className="col-span-2 flex flex-col gap-1">
        <label className="font-caption text-caption text-secondary uppercase font-semibold">Location Name</label>
        <input className="p-2 bg-surface-container-low rounded" placeholder="e.g. Ocho Rios Outpost" type="text"/>
        </div>
        </div>
        <div className="flex flex-col gap-1">
        <label className="font-caption text-caption text-secondary uppercase font-semibold">Physical Type</label>
        <select className="p-2 bg-surface-container-low rounded">
        <option>Warehouse / Regional Depot</option>
        <option>Vehicle Locker Trunk</option>
        <option>Staff Field Bag / Custodian</option>
        <option>External Contractor Workshop</option>
        </select>
        </div>
        <div className="flex flex-col gap-1">
        <label className="font-caption text-caption text-secondary uppercase font-semibold">Address / Port Bay</label>
        <input className="p-2 bg-surface-container-low rounded" placeholder="Street or harbour terminal location..." type="text"/>
        </div>
        <div className="flex items-center gap-space-md pt-2">
        <label className="flex items-center gap-2 cursor-pointer">
        <input className="rounded text-primary" type="checkbox"/>
        <span className="text-body-sm">Set as network default depot</span>
        </label>
        </div>
        </div>
        <div className="flex items-center justify-end gap-space-sm pt-space-sm">
        <button type="button" className="px-space-md py-2 rounded-lg bg-surface-container font-body-sm text-body-sm font-medium hover:bg-surface-variant" onclick="document.getElementById('modal-new-location').classList.add('hidden')">Cancel</button>
        <button type="button" className="px-space-lg py-2 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-semibold hover:bg-primary/90" onclick="document.getElementById('modal-new-location').classList.add('hidden')">Save Location</button>
        </div>
        </div>
        </div>

        <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm hidden flex items-center justify-center p-4" id="modal-new-bin">
        <div className="bg-surface-container-lowest rounded-xl max-w-md w-full p-space-xl shadow-2xl flex flex-col gap-space-md relative">
        <div className="flex items-center justify-between pb-space-xs">
        <div className="flex items-center gap-space-xs">
        <div className="w-8 h-8 rounded bg-primary text-on-primary flex items-center justify-center">
        <span className="material-symbols-outlined text-[18px]">shelves</span>
        </div>
        <h3 className="font-headline-sm text-headline-sm text-primary font-bold">Register Storage Bin</h3>
        </div>
        <button type="button" className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-secondary" onclick="document.getElementById('modal-new-bin').classList.add('hidden')">
        <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
        </div>
        <div className="flex flex-col gap-space-sm font-body-sm text-body-sm">
        <div className="flex flex-col gap-1">
        <label className="font-caption text-caption text-secondary uppercase font-semibold">Assign to Location</label>
        <input className="p-2 bg-surface-container rounded text-secondary font-medium" disabled="" type="text" value="Main store — Kingston (MAIN)"/>
        </div>
        <div className="grid grid-cols-2 gap-space-sm">
        <div className="flex flex-col gap-1">
        <label className="font-caption text-caption text-secondary uppercase font-semibold">Bin Code</label>
        <input className="p-2 bg-surface-container-low rounded font-label-code text-label-code uppercase" placeholder="e.g. C-08" type="text"/>
        </div>
        <div className="flex flex-col gap-1">
        <label className="font-caption text-caption text-secondary uppercase font-semibold">Unit Capacity</label>
        <input className="p-2 bg-surface-container-low rounded font-label-code text-label-code" placeholder="25" type="number"/>
        </div>
        </div>
        <div className="flex flex-col gap-1">
        <label className="font-caption text-caption text-secondary uppercase font-semibold">Zone / Department</label>
        <input className="p-2 bg-surface-container-low rounded" placeholder="e.g. Brake Pads & Fluid Hub" type="text"/>
        </div>
        <div className="flex flex-col gap-1">
        <label className="font-caption text-caption text-secondary uppercase font-semibold">Security Level</label>
        <select className="p-2 bg-surface-container-low rounded">
        <option>Standard Rack Storage</option>
        <option>Locked Wire Cage (Double-auth)</option>
        <option>Hazmat Certified Compartment</option>
        </select>
        </div>
        </div>
        <div className="flex items-center justify-end gap-space-sm pt-space-sm">
        <button type="button" className="px-space-md py-2 rounded-lg bg-surface-container font-body-sm text-body-sm font-medium hover:bg-surface-variant" onclick="document.getElementById('modal-new-bin').classList.add('hidden')">Cancel</button>
        <button type="button" className="px-space-lg py-2 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-semibold hover:bg-primary/90" onclick="document.getElementById('modal-new-bin').classList.add('hidden')">Add Storage Bin</button>
        </div>
        </div>
        </div>
        </div></div>
        {compliance.safetyNotice ? (
          <div className="mt-space-md rounded-lg border border-outline-variant/30 bg-surface-container-low p-space-md font-body-sm text-body-sm text-on-surface-variant">
            {compliance.safetyNotice}
          </div>
        ) : null}
      </div>
    </GapModalShell>
  );
}
