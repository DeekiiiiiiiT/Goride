/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { useInventoryLive } from '../inventoryLive';
import { useInventoryShell } from '../InventoryShellContext';
export function In15VehicleKitCard() {
  const shell = useInventoryShell();
  const live = useInventoryLive(shell);
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full">

      <div className="bg-surface-container-lowest px-margin md:px-margin-desktop py-space-md shadow-sm">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-space-sm">
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
      <div className="flex items-center gap-space-sm">
      <a className="flex items-center gap-space-xs font-body-sm text-body-sm text-secondary hover:text-on-surface transition-colors" href="#">
      <span className="material-symbols-outlined text-[16px]">arrow_back</span>
      <span>Back to Vehicles</span>
      </a>
      <span className="text-outline-variant font-caption text-caption">/</span>
      <div className="flex items-center gap-space-xs">
      <span className="font-label-plate text-label-plate px-space-xs py-0.5 rounded bg-surface-container-high text-on-surface font-bold">{live.primaryPlate}</span>
      <span className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight">Toyota Roomy 2019</span>
      </div>
      </div>
      <div className="flex flex-wrap items-center gap-space-sm">
      <div className="flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-surface-container-high text-on-surface font-caption text-caption">
      <span className="w-2 h-2 rounded-full bg-surface-tint"></span>
      <span className="font-medium">Active · Rideshare Fleet #01</span>
      </div>
      <div className="flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-surface-container-high text-on-surface font-caption text-caption">
      <span className="material-symbols-outlined text-sm text-secondary">person</span>
      <span className="font-medium">Driver: —</span>
      </div>
      <div className="flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-surface-container-high text-on-surface font-label-code text-caption">
      <span className="material-symbols-outlined text-sm text-secondary">speed</span>
      <span>64,820 km</span>
      </div>
      <button type="button" className="flex items-center gap-space-xs px-space-sm py-1 rounded bg-primary text-on-primary font-body-sm text-body-sm hover:opacity-90 transition-opacity">
      <span className="material-symbols-outlined text-base">tune</span>
      <span>Manage Status</span>
      </button>
      </div>
      </div>

      <div className="flex items-center gap-space-lg pt-space-xs">
      <a className="flex items-center gap-space-xs py-space-xs font-body-md text-body-md font-semibold text-on-surface border-b-2 border-primary" href="#">
      <span className="material-symbols-outlined text-base">directions_car</span>
      <span>Profile</span>
      </a>
      <a className="flex items-center gap-space-xs py-space-xs font-body-md text-body-md text-secondary hover:text-on-surface transition-colors" href="#">
      <span className="material-symbols-outlined text-base">build</span>
      <span>Maintenance</span>
      </a>
      <a className="flex items-center gap-space-xs py-space-xs font-body-md text-body-md text-secondary hover:text-on-surface transition-colors" href="#">
      <span className="material-symbols-outlined text-base">history</span>
      <span>Service History</span>
      </a>
      <a className="flex items-center gap-space-xs py-space-xs font-body-md text-body-md text-secondary hover:text-on-surface transition-colors" href="#">
      <span className="material-symbols-outlined text-base">sensors</span>
      <span>Telemetry</span>
      </a>
      <a className="flex items-center gap-space-xs py-space-xs font-body-md text-body-md text-secondary hover:text-on-surface transition-colors" href="#">
      <span className="material-symbols-outlined text-base">description</span>
      <span>Documents</span>
      </a>
      </div>
      </div>
      </div>

      <div className="px-margin md:px-margin-desktop py-space-xl max-w-[1440px] mx-auto w-full">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">

      <div className="lg:col-span-8 flex flex-col gap-space-lg">

      <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg flex flex-col gap-space-md">

      <div className="flex flex-col gap-space-xs">
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
      <div className="flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-on-surface text-[24px]">inventory_2</span>
      <h2 className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight">Kit & equipment</h2>
      </div>
      <div className="flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-label-code text-caption font-semibold">
      <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container animate-pulse"></span>
      <span>70% · 7 of 10 items</span>
      </div>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Assigned standard spec: <span className="font-semibold text-on-surface">Rideshare car kit (v2)</span> · 
                    <span className="text-error font-medium">3 missing items</span> required for road-clearance dispatch.
                  </p>

      <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden mt-space-xs flex">
      <div className="bg-primary h-full" style={{ width: "70%" }}></div>
      <div className="bg-error-container h-full" style={{ width: "30%" }}></div>
      </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md pt-space-xs">

      <div className="flex flex-col gap-space-sm">
      <div className="flex items-center justify-between px-space-xs">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-error text-base">warning</span>
      <span className="font-caption text-caption uppercase tracking-wider text-error font-bold">Missing (3 items)</span>
      </div>
      <span className="font-caption text-caption text-secondary">Road Clearance Blocked</span>
      </div>
      <div className="flex flex-col gap-space-sm">

      <div className="bg-error-container/40 p-space-sm rounded-lg flex flex-col gap-space-xs">
      <div className="flex items-start justify-between gap-space-sm">
      <div className="flex flex-col min-w-0">
      <div className="flex items-center gap-space-xs">
      <span className="font-body-md text-body-md font-semibold text-on-surface truncate">Tyre pump</span>
      <span className="font-label-code text-caption text-secondary">TLS-PMP-01</span>
      </div>
      <span className="font-caption text-caption text-error font-medium">Needs 1 unit</span>
      </div>
      <button type="button" className="px-space-sm py-1 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-medium shadow-sm transition-colors flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-sm">add_box</span>
      <span>Issue</span>
      </button>
      </div>
      <div className="flex items-center gap-space-xs text-secondary font-label-code text-caption pt-space-xs">
      <span className="material-symbols-outlined text-xs">warehouse</span>
      <span>Storeroom stock: 14 available in Main store</span>
      </div>
      </div>

      <div className="bg-error-container/40 p-space-sm rounded-lg flex flex-col gap-space-xs">
      <div className="flex items-start justify-between gap-space-sm">
      <div className="flex flex-col min-w-0">
      <div className="flex items-center gap-space-xs">
      <span className="font-body-md text-body-md font-semibold text-on-surface truncate">First-aid kit</span>
      <span className="font-label-code text-caption text-secondary">SAF-FAK-01</span>
      </div>
      <span className="font-caption text-caption text-error font-medium">Needs 1 unit (Sealed)</span>
      </div>
      <button type="button" className="px-space-sm py-1 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-medium shadow-sm transition-colors flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-sm">add_box</span>
      <span>Issue</span>
      </button>
      </div>
      <div className="flex items-center gap-space-xs text-secondary font-label-code text-caption pt-space-xs">
      <span className="material-symbols-outlined text-xs">warehouse</span>
      <span>Storeroom stock: 6 available in Main store</span>
      </div>
      </div>

      <div className="bg-error-container/40 p-space-sm rounded-lg flex flex-col gap-space-xs">
      <div className="flex items-start justify-between gap-space-sm">
      <div className="flex flex-col min-w-0">
      <div className="flex items-center gap-space-xs">
      <span className="font-body-md text-body-md font-semibold text-on-surface truncate">Warning triangle</span>
      <span className="font-label-code text-caption text-secondary">SAF-TRG-01</span>
      </div>
      <span className="font-caption text-caption text-error font-medium">Needs 1 unit (Reflective)</span>
      </div>
      <button type="button" className="px-space-sm py-1 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-medium shadow-sm transition-colors flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-sm">add_box</span>
      <span>Issue</span>
      </button>
      </div>
      <div className="flex items-center gap-space-xs text-secondary font-label-code text-caption pt-space-xs">
      <span className="material-symbols-outlined text-xs">warehouse</span>
      <span>Storeroom stock: 22 available in Main store</span>
      </div>
      </div>
      </div>
      </div>

      <div className="flex flex-col gap-space-sm">
      <div className="flex items-center justify-between px-space-xs">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-surface-tint text-base">verified</span>
      <span className="font-caption text-caption uppercase tracking-wider text-on-surface font-bold">On this car (7 items verified)</span>
      </div>
      <span className="font-caption text-caption text-secondary">Inspected Yesterday</span>
      </div>
      <div className="flex flex-col gap-space-xs bg-surface-container-low p-space-xs rounded-lg">

      <div className="p-space-sm bg-surface-container-lowest rounded flex items-center justify-between gap-space-sm">
      <div className="flex flex-col min-w-0">
      <div className="flex items-center gap-space-xs">
      <span className="font-body-sm text-body-sm font-semibold text-on-surface">Spare tyre · 195/65 R15</span>
      <span className="font-label-code text-caption text-secondary">TYR-SPR-01</span>
      </div>
      <span className="font-caption text-caption text-secondary">Location: Boot wheel well</span>
      </div>
      <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-caption text-caption font-medium">Good</span>
      </div>

      <div className="p-space-sm bg-surface-container-lowest rounded flex items-center justify-between gap-space-sm">
      <div className="flex flex-col min-w-0">
      <div className="flex items-center gap-space-xs">
      <span className="font-body-sm text-body-sm font-semibold text-on-surface">Car jack · 2.5T Scissor</span>
      <span className="font-label-code text-caption text-secondary">TLS-JCK-01</span>
      </div>
      <span className="font-caption text-caption text-secondary">Location: Boot tool bay</span>
      </div>
      <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-caption text-caption font-medium">Good</span>
      </div>

      <div className="p-space-sm bg-surface-container-lowest rounded flex items-center justify-between gap-space-sm">
      <div className="flex flex-col min-w-0">
      <div className="flex items-center gap-space-xs">
      <span className="font-body-sm text-body-sm font-semibold text-on-surface">Lug wrench · 21mm</span>
      <span className="font-label-code text-caption text-secondary">TLS-WRN-01</span>
      </div>
      <span className="font-caption text-caption text-secondary">Location: Boot tool bay</span>
      </div>
      <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-caption text-caption font-medium">Good</span>
      </div>

      <div className="p-space-sm bg-surface-container-lowest rounded flex items-center justify-between gap-space-sm">
      <div className="flex flex-col min-w-0">
      <div className="flex items-center gap-space-xs">
      <span className="font-body-sm text-body-sm font-semibold text-on-surface">Phone Holder Mount</span>
      <span className="font-label-code text-caption text-secondary">ACC-PHM-01</span>
      </div>
      <span className="font-caption text-caption text-secondary">Location: Dashboard</span>
      </div>
      <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-caption text-caption font-medium">Good</span>
      </div>

      <div className="p-space-sm bg-surface-container-lowest rounded flex items-center justify-between gap-space-sm">
      <div className="flex flex-col min-w-0">
      <div className="flex items-center gap-space-xs">
      <span className="font-body-sm text-body-sm font-semibold text-on-surface">Dash camera · Dual-Lens</span>
      <span className="font-label-code text-caption text-secondary">ELC-DCM-01</span>
      </div>
      <div className="flex items-center gap-space-xs font-caption text-caption text-secondary">
      <span className="font-label-code">S/N: DC-70A-0042118</span>
      <span>· Windscreen</span>
      </div>
      </div>
      <span className="px-2 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-caption text-caption font-medium">Flickering (Reported)</span>
      </div>

      <div className="p-space-sm bg-surface-container-lowest rounded flex items-center justify-between gap-space-sm">
      <div className="flex flex-col min-w-0">
      <div className="flex items-center gap-space-xs">
      <span className="font-body-sm text-body-sm font-semibold text-on-surface">Toll tag · RFID #JM-TOLL-9921</span>
      </div>
      <span className="font-caption text-caption text-secondary">Location: Windscreen center</span>
      </div>
      <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface font-caption text-caption font-medium">Active</span>
      </div>

      <div className="p-space-sm bg-surface-container-lowest rounded flex items-center justify-between gap-space-sm">
      <div className="flex flex-col min-w-0">
      <div className="flex items-center gap-space-xs">
      <span className="font-body-sm text-body-sm font-semibold text-on-surface">Fuel card · PetroJam Fleet</span>
      <span className="font-label-code text-caption text-secondary">#4410</span>
      </div>
      <span className="font-caption text-caption text-secondary">Location: Glove compartment</span>
      </div>
      <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface font-caption text-caption font-medium">Active</span>
      </div>
      </div>

      <div className="px-space-xs font-body-sm text-caption text-secondary flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-xs">add</span>
      <span>Extra accessory: Car mats × 1 — not part of standard kit manifest.</span>
      </div>
      </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-space-sm pt-space-sm mt-space-xs">
      <div className="flex flex-wrap items-center gap-space-sm">
      <button type="button" className="px-space-lg py-2 rounded-lg bg-primary hover:opacity-90 text-on-primary font-body-sm text-body-sm font-semibold flex items-center gap-space-xs shadow-sm transition-opacity">
      <span className="material-symbols-outlined text-base">outgoing_mail</span>
      <span>Issue missing (3)</span>
      </button>
      <button type="button" className="px-space-lg py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-medium transition-colors flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-base">keyboard_return</span>
      <span>Return item</span>
      </button>
      </div>
      <button type="button" className="px-space-md py-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm transition-colors flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-base text-secondary">report_problem</span>
      <span>Report problem</span>
      </button>
      </div>
      </div>

      <div className="flex items-center gap-space-xs px-space-sm py-space-xs rounded bg-surface-container-low text-secondary font-body-sm text-caption">
      <span className="material-symbols-outlined text-sm text-secondary">info</span>
      <span>Tyres and wheels fitted to the car are in <a className="font-semibold text-on-surface underline" href="#">Maintenance → Parts of the car</a>.</span>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg flex flex-col gap-space-md">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-on-surface text-base">badge</span>
      <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Technical Profile & Configuration</h3>
      </div>
      <span className="font-label-code text-caption text-secondary">VIN: M900A-0248811</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-space-md">
      <div className="flex flex-col gap-0.5 p-space-sm rounded bg-surface-container-low">
      <span className="font-caption text-caption text-secondary uppercase">Make & Model</span>
      <span className="font-body-md text-body-md font-semibold text-on-surface">Toyota Roomy G</span>
      </div>
      <div className="flex flex-col gap-0.5 p-space-sm rounded bg-surface-container-low">
      <span className="font-caption text-caption text-secondary uppercase">Engine</span>
      <span className="font-body-md text-body-md font-semibold text-on-surface">1.0L 1KR-FE I3</span>
      </div>
      <div className="flex flex-col gap-0.5 p-space-sm rounded bg-surface-container-low">
      <span className="font-caption text-caption text-secondary uppercase">Fuel Type</span>
      <span className="font-body-md text-body-md font-semibold text-on-surface">Gasoline 87 Octane</span>
      </div>
      <div className="flex flex-col gap-0.5 p-space-sm rounded bg-surface-container-low">
      <span className="font-caption text-caption text-secondary uppercase">Transmission</span>
      <span className="font-body-md text-body-md font-semibold text-on-surface">Super CVT-i</span>
      </div>
      </div>
      </div>
      </div>

      <div className="lg:col-span-4 flex flex-col gap-space-lg">

      <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg flex flex-col gap-space-md">
      <div className="flex items-center justify-between">
      <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Current Assignment</h3>
      <span className="px-space-xs py-0.5 rounded bg-surface-container text-secondary font-caption text-caption">Shift Active</span>
      </div>
      <div className="flex items-center gap-space-md p-space-sm rounded-lg bg-surface-container-low">
      <div className="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center font-headline-sm font-semibold">
                    DC
                  </div>
      <div className="flex flex-col min-w-0">
      <span className="font-body-lg text-body-lg font-bold text-on-surface">—</span>
      <span className="font-caption text-caption text-secondary font-label-code">DRV-KGN-0482 · Kingston East</span>
      <div className="flex items-center gap-space-xs mt-1">
      <span className="material-symbols-outlined text-xs text-secondary">star</span>
      <span className="font-caption text-caption font-semibold text-on-surface">4.92 Rating</span>
      <span className="text-outline-variant font-caption text-caption">·</span>
      <span className="font-caption text-caption text-secondary">386 Trips</span>
      </div>
      </div>
      </div>
      <div className="flex flex-col gap-space-xs">
      <span className="font-caption text-caption text-secondary uppercase font-semibold">Handover Notes & Observations</span>
      <div className="p-space-sm rounded-lg bg-surface-container-low font-body-sm text-body-sm text-on-surface flex flex-col gap-space-xs">
      <p className="italic text-on-surface-variant leading-relaxed">
                      "Driver noted dash camera power supply cuts off intermittently when vehicle is parked on slope. Front tyre pressure re-checked at PetroJam Cross Roads."
                    </p>
      <div className="flex items-center justify-between pt-space-xs font-caption text-caption text-secondary">
      <span>Logged by Dispatcher Marcus P.</span>
      <span>Today, 06:15 AM</span>
      </div>
      </div>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg flex flex-col gap-space-md">
      <div className="flex items-center justify-between">
      <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Service Schedule</h3>
      <span className="font-label-code text-caption text-secondary">65,000 KM Marker</span>
      </div>
      <div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col gap-space-xs">
      <div className="flex items-center justify-between">
      <span className="font-body-sm text-body-sm font-semibold text-on-surface">Next A-Service Interval</span>
      <span className="font-label-code text-caption font-bold text-secondary">180 km remaining</span>
      </div>
      <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
      <div className="bg-surface-tint h-full" style={{ width: "96%" }}></div>
      </div>
      <span className="font-caption text-caption text-secondary">Estimated trigger date: Tomorrow afternoon</span>
      </div>
      <div className="flex flex-col gap-space-sm pt-space-xs">
      <div className="flex items-center justify-between text-body-sm font-body-sm">
      <span className="text-secondary">Depot Base</span>
      <span className="font-medium text-on-surface">{live.hubName}</span>
      </div>
      <div className="flex items-center justify-between text-body-sm font-body-sm">
      <span className="text-secondary">COF Expiration</span>
      <span className="font-label-code text-on-surface font-semibold">14 Nov 2025</span>
      </div>
      <div className="flex items-center justify-between text-body-sm font-body-sm">
      <span className="text-secondary">Fitness Certificate</span>
      <span className="font-label-code text-on-surface font-semibold">Valid (JM-KGN-990)</span>
      </div>
      </div>
      <button type="button" className="w-full py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-medium transition-colors flex items-center justify-center gap-space-xs">
      <span className="material-symbols-outlined text-base">calendar_month</span>
      <span>Book Early Service Slot</span>
      </button>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg flex flex-col gap-space-sm">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-base text-surface-tint">rss_feed</span>
      <h4 className="font-body-md text-body-md font-semibold text-on-surface">Live Telemetry Node</h4>
      </div>
      <span className="font-label-code text-caption text-secondary">24s ago</span>
      </div>
      <div className="grid grid-cols-2 gap-space-sm pt-space-xs">
      <div className="p-space-xs rounded bg-surface-container-low flex flex-col">
      <span className="font-caption text-caption text-secondary">Battery Voltage</span>
      <span className="font-label-code text-body-md font-semibold text-on-surface">12.6 V</span>
      </div>
      <div className="p-space-xs rounded bg-surface-container-low flex flex-col">
      <span className="font-caption text-caption text-secondary">Fuel Reserve</span>
      <span className="font-label-code text-body-md font-semibold text-on-surface">78%</span>
      </div>
      <div className="p-space-xs rounded bg-surface-container-low flex flex-col">
      <span className="font-caption text-caption text-secondary">Coolant Temp</span>
      <span className="font-label-code text-body-md font-semibold text-on-surface">89 °C</span>
      </div>
      <div className="p-space-xs rounded bg-surface-container-low flex flex-col">
      <span className="font-caption text-caption text-secondary">GPS Lock</span>
      <span className="font-label-code text-body-md font-semibold text-on-surface">3D Fix (14 Sat)</span>
      </div>
      </div>
      </div>
      </div>
      </div>
      </div>
      </div></div>
    </div>
  );
}
