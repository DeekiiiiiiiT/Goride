/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { useInventoryLive } from '../inventoryLive';
import { useInventoryShell } from '../InventoryShellContext';
export function In10Movements() {
  const shell = useInventoryShell();
  const live = useInventoryLive(shell);
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full">

      <div className="w-full bg-surface-container-low px-margin-desktop py-space-sm flex items-center justify-between">
      <div className="flex items-center gap-space-md">
      <div className="flex items-center gap-space-xs font-label-code text-caption text-on-surface-variant">
      <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
      <span className="font-semibold text-on-surface uppercase tracking-wider">Custody Node:</span>
      <span>KGN-LEDGER-01</span>
      </div>
      <span className="text-surface-variant">|</span>
      <div className="flex items-center gap-space-xs font-caption text-caption text-on-surface-variant">
      <span className="material-symbols-outlined text-[14px]">lock</span>
      <span>Append-only state verified (Block #11,942)</span>
      </div>
      </div>
      <div className="flex items-center gap-space-sm font-label-code text-caption text-on-surface-variant">
      <span>08:47 PM EST · America/Jamaica · JM (JMD) · DE · Deeki T · <strong className="text-on-surface font-semibold">platform_owner</strong></span>
      </div>
      </div>

      <div className="px-margin-desktop py-space-xl flex flex-col gap-space-lg">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
      <div>
      <div className="flex items-center gap-space-xs text-on-surface-variant font-caption text-caption uppercase tracking-wider mb-space-xs">
      <span>Fleet Operations</span>
      <span className="text-outline-variant">/</span>
      <span className="text-on-surface font-semibold">Vehicle Operations</span>
      <span className="text-outline-variant">/</span>
      <span>Warehousing & Telematics</span>
      </div>
      <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight font-bold">Inventory & Asset Management</h1>
      <p className="font-body-md text-body-md text-on-surface-variant mt-1">What you have, where it is, and what every car is missing.</p>
      </div>

      <div className="flex items-center gap-space-md self-start md:self-auto">
      <div className="bg-surface-container-lowest p-space-md rounded-lg shadow-sm flex items-center gap-space-md">
      <div className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-on-surface">
      <span className="material-symbols-outlined text-[18px]">receipt_long</span>
      </div>
      <div>
      <div className="font-caption text-caption uppercase text-on-surface-variant">Ledger Entries</div>
      <div className="font-label-price text-label-price text-on-surface font-bold">1,842 total</div>
      </div>
      </div>
      <div className="bg-surface-container-lowest p-space-md rounded-lg shadow-sm flex items-center gap-space-md">
      <div className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-on-surface">
      <span className="material-symbols-outlined text-[18px]">security</span>
      </div>
      <div>
      <div className="font-caption text-caption uppercase text-on-surface-variant">Zero Tamper State</div>
      <div className="font-label-code text-caption text-on-surface font-semibold">100% SHA-256</div>
      </div>
      </div>
      </div>
      </div>

      <div className="flex items-center gap-space-xs overflow-x-auto py-1">
      <a className="px-space-md py-space-sm rounded font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all" href="#">Overview</a>
      <a className="px-space-md py-space-sm rounded font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all" href="#">Stock</a>
      <a className="px-space-md py-space-sm rounded font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all" href="#">Vehicle kits</a>
      <a className="px-space-md py-space-sm rounded font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all" href="#">Assets</a>

      <a className="px-space-md py-space-sm rounded font-body-sm text-body-sm bg-primary text-on-primary font-semibold shadow-sm flex items-center gap-space-xs" href="#">
      <span className="material-symbols-outlined text-[15px]">swap_horiz</span>
              Movements
            </a>
      <a className="px-space-md py-space-sm rounded font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all" href="#">Purchasing</a>
      <a className="px-space-md py-space-sm rounded font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all" href="#">Counts</a>
      <a className="px-space-md py-space-sm rounded font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all flex items-center gap-space-xs" href="#">
      <span>Alerts</span>
      <span className="bg-error-container text-on-error-container font-label-code text-[11px] px-1.5 py-0.2 rounded-full font-bold">5</span>
      </a>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md bg-surface-container-lowest p-space-lg rounded-xl shadow-sm">
      <div className="flex items-start gap-space-md max-w-4xl">
      <div className="w-10 h-10 rounded bg-surface-container-low flex items-center justify-center text-on-surface mt-1 shrink-0">
      <span className="material-symbols-outlined text-[20px]">enhanced_encryption</span>
      </div>
      <div>
      <div className="flex items-center gap-space-sm">
      <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Movements — every stock change, kept forever</h2>
      <span className="font-label-code text-[11px] bg-surface-container px-2 py-0.5 rounded text-on-surface uppercase font-semibold">Immutable Ledger</span>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  Cryptographic, append-only custody ledger. Movements can never be edited or deleted — corrections occur solely via auditable reversals with linked cryptographic trails.
                </p>
      </div>
      </div>
      <div className="flex items-center gap-space-sm shrink-0">
      <button type="button" className="flex items-center gap-space-xs px-space-md py-2 rounded bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-medium transition-all shadow-sm" data-stitch-id="btn-export-csv">
      <span className="material-symbols-outlined text-[16px]">download</span>
      <span>Export CSV</span>
      </button>
      <button type="button" className="flex items-center gap-space-xs px-space-md py-2 rounded bg-primary text-on-primary font-body-sm text-body-sm font-medium transition-all shadow-sm">
      <span className="material-symbols-outlined text-[16px]">add_circle</span>
      <span>Record Movement</span>
      </button>
      </div>
      </div>

      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center gap-space-sm justify-between">
      <div className="flex flex-wrap items-center gap-space-sm flex-1">

      <div className="flex items-center gap-space-xs bg-surface-container-low px-3 py-1.5 rounded text-on-surface font-body-sm text-body-sm cursor-pointer hover:bg-surface-container transition-colors">
      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">calendar_today</span>
      <span className="font-medium">Last 30 days</span>
      <span className="material-symbols-outlined text-[14px] text-on-surface-variant">arrow_drop_down</span>
      </div>

      <div className="flex items-center gap-space-xs bg-surface-container-low px-3 py-1.5 rounded text-on-surface font-body-sm text-body-sm cursor-pointer hover:bg-surface-container transition-colors">
      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">filter_list</span>
      <span className="font-medium">All types</span>
      <span className="font-caption text-caption text-on-surface-variant">(RECEIVE, ISSUE, RET, XFER, REVERSAL)</span>
      <span className="material-symbols-outlined text-[14px] text-on-surface-variant">arrow_drop_down</span>
      </div>

      <div className="flex items-center gap-space-xs bg-surface-container-low px-3 py-1.5 rounded text-on-surface font-body-sm text-body-sm cursor-pointer hover:bg-surface-container transition-colors">
      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">location_on</span>
      <span className="font-medium">All locations</span>
      <span className="material-symbols-outlined text-[14px] text-on-surface-variant">arrow_drop_down</span>
      </div>

      <div className="flex items-center gap-space-xs bg-surface-container-low px-3 py-1.5 rounded text-on-surface font-body-sm text-body-sm cursor-pointer hover:bg-surface-container transition-colors">
      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">person_outline</span>
      <span className="font-medium">All actors</span>
      <span className="material-symbols-outlined text-[14px] text-on-surface-variant">arrow_drop_down</span>
      </div>

      <div className="flex-1 min-w-[240px] relative">
      <span className="material-symbols-outlined absolute left-3 top-2 text-[16px] text-on-surface-variant">search</span>
      <input className="w-full bg-surface-container-low pl-9 pr-3 py-1.5 rounded font-body-sm text-body-sm text-on-surface focus:outline-none focus:bg-surface-container-lowest transition-all placeholder:text-on-surface-variant/60" data-stitch-id="movement-search" placeholder="Search item, SKU, reference or car..." type="text"/>
      </div>
      </div>
      <div className="flex items-center gap-space-md justify-end pt-space-xs lg:pt-0">
      <button type="button" className="font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface transition-colors underline decoration-outline-variant" data-stitch-id="clear-filters-btn">
                Clear filters
              </button>
      </div>
      </div>

      <div className="relative bg-surface-container-lowest rounded-xl shadow-sm overflow-visible">
      <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
      <thead>
      <tr className="bg-surface-container-low text-on-surface-variant font-caption text-caption uppercase tracking-wider">
      <th className="py-space-md px-space-lg font-semibold">Date & Time</th>
      <th className="py-space-md px-space-md font-semibold">Type Tag</th>
      <th className="py-space-md px-space-md font-semibold">Item & SKU</th>
      <th className="py-space-md px-space-md font-semibold text-right">Qty</th>
      <th className="py-space-md px-space-lg font-semibold">From → To</th>
      <th className="py-space-md px-space-md font-semibold">Reference / PO</th>
      <th className="py-space-md px-space-md font-semibold">Recorded By</th>
      <th className="py-space-md px-space-lg font-semibold">Reason / Notes</th>
      <th className="py-space-md px-space-md text-right font-semibold">Actions</th>
      </tr>
      </thead>
      <tbody className="divide-y divide-surface-container font-body-sm text-body-sm">

      <tr className="hover:bg-surface-container-low/50 transition-colors bg-secondary-container/10">
      <td className="py-space-md px-space-lg whitespace-nowrap">
      <div className="font-label-code text-label-code font-semibold text-on-surface">1 Nov 2026</div>
      <div className="font-caption text-caption text-on-surface-variant">08:35 AM EST</div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap">
      <span className="inline-flex items-center gap-1 font-label-code text-[11px] font-bold px-2 py-0.5 rounded bg-primary text-on-primary">
      <span className="material-symbols-outlined text-[12px]">replay</span>
                        REVERSAL
                      </span>
      </td>
      <td className="py-space-md px-space-md">
      <div className="font-medium text-on-surface">Phone Holder Mount</div>
      <div className="font-label-code text-caption text-on-surface-variant tracking-wide">ACC-PHM-01</div>
      </td>
      <td className="py-space-md px-space-md text-right whitespace-nowrap">
      <span className="font-label-price text-label-price font-bold text-on-surface bg-surface-container-high px-2 py-0.5 rounded">+1</span>
      </td>
      <td className="py-space-md px-space-lg whitespace-nowrap">
      <div className="flex items-center gap-space-xs font-label-code text-caption">
      <span className="bg-surface-container px-1.5 py-0.5 rounded font-bold font-label-plate text-on-surface">{live.secondaryPlate}</span>
      <span className="material-symbols-outlined text-[14px] text-on-surface-variant">arrow_forward</span>
      <span className="text-on-surface">Main store — Kingston</span>
      </div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap">
      <div className="font-label-code text-label-code text-on-surface font-semibold">REV-2026-0042</div>
      <div className="font-caption text-caption text-on-surface-variant">reverses MV-8824</div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap">
      <div className="flex items-center gap-space-xs">
      <span className="w-5 h-5 rounded-full bg-primary-container text-on-primary font-label-code text-[10px] flex items-center justify-center font-bold">DT</span>
      <span className="text-on-surface font-medium">Deeki T</span>
      </div>
      </td>
      <td className="py-space-md px-space-lg">
      <div className="text-on-surface max-w-xs truncate" title="Dispatched to wrong bay; re-issuing under revised work order">
                        Dispatched to wrong bay; re-issuing under revised work order
                      </div>
      </td>
      <td className="py-space-md px-space-md text-right whitespace-nowrap">
      <button type="button" className="p-1 hover:bg-surface-container rounded text-on-surface-variant hover:text-on-surface transition-colors" title="View reversal audit certificate">
      <span className="material-symbols-outlined text-[18px]">verified</span>
      </button>
      </td>
      </tr>

      <tr className="hover:bg-surface-container-low/40 transition-colors bg-surface-container-low/20">
      <td className="py-space-md px-space-lg whitespace-nowrap line-through text-on-surface-variant opacity-75">
      <div className="font-label-code text-label-code">1 Nov 2026</div>
      <div className="font-caption text-caption">08:31 AM EST</div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap">
      <div className="flex items-center gap-1.5 flex-wrap">
      <span className="font-label-code text-[11px] font-semibold px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant line-through opacity-75">ISSUE</span>
      <span className="font-label-code text-[10px] font-semibold px-1.5 py-0.5 rounded bg-surface-variant text-on-surface-variant">Reversed 1 Nov 2026</span>
      </div>
      </td>
      <td className="py-space-md px-space-md line-through text-on-surface-variant opacity-75">
      <div className="font-medium">Phone Holder Mount</div>
      <div className="font-label-code text-caption">ACC-PHM-01</div>
      </td>
      <td className="py-space-md px-space-md text-right whitespace-nowrap">
      <span className="font-label-price text-label-price font-bold text-on-surface-variant line-through opacity-75">−1</span>
      </td>
      <td className="py-space-md px-space-lg whitespace-nowrap line-through text-on-surface-variant opacity-75">
      <div className="flex items-center gap-space-xs font-label-code text-caption">
      <span>Main store</span>
      <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
      <span className="bg-surface-container px-1 py-0.5 rounded font-label-plate">{live.secondaryPlate}</span>
      </div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap line-through text-on-surface-variant opacity-75">
      <div className="font-label-code text-label-code">Kit: Rideshare car kit</div>
      <div className="font-caption text-caption">alloc #MV-8824</div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap line-through text-on-surface-variant opacity-75">
      <div className="flex items-center gap-space-xs">
      <span className="w-5 h-5 rounded-full bg-surface-container-high text-on-surface-variant font-label-code text-[10px] flex items-center justify-center">DT</span>
      <span>Deeki T</span>
      </div>
      </td>
      <td className="py-space-md px-space-lg text-on-surface-variant opacity-60">
                      —
                    </td>
      <td className="py-space-md px-space-md text-right whitespace-nowrap">
      <button type="button" className="p-1 text-outline-variant cursor-not-allowed" disabled title="Already reversed">
      <span className="material-symbols-outlined text-[18px]">more_horiz</span>
      </button>
      </td>
      </tr>

      <tr className="hover:bg-surface-container-low transition-colors relative" data-stitch-id="row-rcv-8821">
      <td className="py-space-md px-space-lg whitespace-nowrap">
      <div className="font-label-code text-label-code font-semibold text-on-surface">1 Nov 2026</div>
      <div className="font-caption text-caption text-on-surface-variant">08:10 AM EST</div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap">
      <span className="inline-flex items-center gap-1 font-label-code text-[11px] font-bold px-2 py-0.5 rounded bg-surface-container-high text-on-surface">
      <span className="material-symbols-outlined text-[12px]">input</span>
                        RECEIVE
                      </span>
      </td>
      <td className="py-space-md px-space-md">
      <div className="font-medium text-on-surface">Phone Holder Mount</div>
      <div className="font-label-code text-caption text-on-surface-variant tracking-wide">ACC-PHM-01</div>
      </td>
      <td className="py-space-md px-space-md text-right whitespace-nowrap">
      <span className="font-label-price text-label-price font-bold text-on-surface">+5</span>
      </td>
      <td className="py-space-md px-space-lg whitespace-nowrap">
      <div className="flex items-center gap-space-xs font-label-code text-caption">
      <span className="text-on-surface">Car Toys Jamaica</span>
      <span className="material-symbols-outlined text-[14px] text-on-surface-variant">arrow_forward</span>
      <span className="text-on-surface font-semibold">Main store — Kingston</span>
      </div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap">
      <div className="font-label-code text-label-code text-on-surface font-semibold">PO-0001</div>
      <div className="font-caption text-caption text-on-surface-variant">Audit ledger #RCV-8821</div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap">
      <div className="flex items-center gap-space-xs">
      <span className="w-5 h-5 rounded-full bg-primary-container text-on-primary font-label-code text-[10px] flex items-center justify-center font-bold">DT</span>
      <span className="text-on-surface font-medium">Deeki T</span>
      </div>
      </td>
      <td className="py-space-md px-space-lg">
      <div className="text-on-surface">Stock replenishment</div>
      </td>
      <td className="py-space-md px-space-md text-right whitespace-nowrap relative">
      <button type="button" className="p-1 hover:bg-surface-container rounded text-on-surface-variant hover:text-on-surface transition-colors" data-stitch-id="row-3-action-btn" title="Manage line record">
      <span className="material-symbols-outlined text-[18px]">more_horiz</span>
      </button>
      </td>
      </tr>

      <tr className="hover:bg-surface-container-low transition-colors">
      <td className="py-space-md px-space-lg whitespace-nowrap">
      <div className="font-label-code text-label-code font-semibold text-on-surface">1 Nov 2026</div>
      <div className="font-caption text-caption text-on-surface-variant">08:10 AM EST</div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap">
      <span className="inline-flex items-center gap-1 font-label-code text-[11px] font-bold px-2 py-0.5 rounded bg-surface-container-high text-on-surface">
      <span className="material-symbols-outlined text-[12px]">input</span>
                        RECEIVE
                      </span>
      </td>
      <td className="py-space-md px-space-md">
      <div className="font-medium text-on-surface">Dash camera (ELC-DCM-01)</div>
      <div className="font-label-code text-caption text-on-surface-variant">S/N: <span className="text-on-surface font-medium">DC-70A-0042118</span></div>
      </td>
      <td className="py-space-md px-space-md text-right whitespace-nowrap">
      <span className="font-label-price text-label-price font-bold text-on-surface">+1</span>
      </td>
      <td className="py-space-md px-space-lg whitespace-nowrap">
      <div className="flex items-center gap-space-xs font-label-code text-caption">
      <span className="text-on-surface">Car Toys Jamaica</span>
      <span className="material-symbols-outlined text-[14px] text-on-surface-variant">arrow_forward</span>
      <span className="text-on-surface font-semibold">Main store — Kingston</span>
      </div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap">
      <div className="font-label-code text-label-code text-on-surface font-semibold">PO-0001</div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap">
      <div className="flex items-center gap-space-xs">
      <span className="w-5 h-5 rounded-full bg-primary-container text-on-primary font-label-code text-[10px] flex items-center justify-center font-bold">DT</span>
      <span className="text-on-surface font-medium">Deeki T</span>
      </div>
      </td>
      <td className="py-space-md px-space-lg">
      <div className="text-on-surface">Warranty replacement received</div>
      </td>
      <td className="py-space-md px-space-md text-right whitespace-nowrap">
      <button type="button" className="p-1 hover:bg-surface-container rounded text-on-surface-variant hover:text-on-surface transition-colors">
      <span className="material-symbols-outlined text-[18px]">more_horiz</span>
      </button>
      </td>
      </tr>

      <tr className="hover:bg-surface-container-low transition-colors">
      <td className="py-space-md px-space-lg whitespace-nowrap">
      <div className="font-label-code text-label-code font-semibold text-on-surface">11 Jan 2026</div>
      <div className="font-caption text-caption text-on-surface-variant">09:00 AM EST</div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap">
      <span className="inline-flex items-center gap-1 font-label-code text-[11px] font-bold px-2 py-0.5 rounded bg-surface-container-high text-on-surface">
      <span className="material-symbols-outlined text-[12px]">input</span>
                        RECEIVE
                      </span>
      </td>
      <td className="py-space-md px-space-md">
      <div className="font-medium text-on-surface">Phone Holder Mount</div>
      <div className="font-label-code text-caption text-on-surface-variant tracking-wide">ACC-PHM-01</div>
      </td>
      <td className="py-space-md px-space-md text-right whitespace-nowrap">
      <span className="font-label-price text-label-price font-bold text-on-surface">+1</span>
      </td>
      <td className="py-space-md px-space-lg whitespace-nowrap">
      <div className="flex items-center gap-space-xs font-label-code text-caption">
      <span className="text-on-surface-variant italic">Opening balance</span>
      <span className="material-symbols-outlined text-[14px] text-on-surface-variant">arrow_forward</span>
      <span className="text-on-surface font-semibold">Main store — Kingston</span>
      </div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap">
      <div className="font-label-code text-label-code text-on-surface">LEG-104</div>
      <div className="font-caption text-caption text-on-surface-variant">System legacy migration</div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap">
      <div className="flex items-center gap-space-xs">
      <span className="w-5 h-5 rounded-full bg-surface-variant text-on-surface font-label-code text-[10px] flex items-center justify-center font-bold">SYS</span>
      <span className="text-on-surface font-medium">System (Automated)</span>
      </div>
      </td>
      <td className="py-space-md px-space-lg">
      <div className="text-on-surface-variant">Moved from old system during depot digitisation</div>
      </td>
      <td className="py-space-md px-space-md text-right whitespace-nowrap">
      <button type="button" className="p-1 hover:bg-surface-container rounded text-on-surface-variant hover:text-on-surface transition-colors">
      <span className="material-symbols-outlined text-[18px]">more_horiz</span>
      </button>
      </td>
      </tr>

      <tr className="hover:bg-surface-container-low transition-colors">
      <td className="py-space-md px-space-lg whitespace-nowrap">
      <div className="font-label-code text-label-code font-semibold text-on-surface">06 Jan 2026</div>
      <div className="font-caption text-caption text-on-surface-variant">11:15 AM EST</div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap">
      <span className="inline-flex items-center gap-1 font-label-code text-[11px] font-bold px-2 py-0.5 rounded bg-surface-container-high text-on-surface">
      <span className="material-symbols-outlined text-[12px]">output</span>
                        ISSUE
                      </span>
      </td>
      <td className="py-space-md px-space-md">
      <div className="font-medium text-on-surface">Dash camera (ELC-DCM-01)</div>
      <div className="font-label-code text-caption text-on-surface-variant">Kit Component</div>
      </td>
      <td className="py-space-md px-space-md text-right whitespace-nowrap">
      <span className="font-label-price text-label-price font-bold text-on-surface">−1</span>
      </td>
      <td className="py-space-md px-space-lg whitespace-nowrap">
      <div className="flex items-center gap-space-xs font-label-code text-caption">
      <span className="text-on-surface">Main store</span>
      <span className="material-symbols-outlined text-[14px] text-on-surface-variant">arrow_forward</span>
      <span className="bg-surface-container px-1.5 py-0.5 rounded font-label-plate text-on-surface font-bold">{live.primaryPlate}</span>
      <span className="font-caption text-caption text-on-surface-variant font-normal">(Toyota Roomy 2019)</span>
      </div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap">
      <div className="font-body-sm text-body-sm text-on-surface">Rideshare vehicle kit rollout</div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap">
      <div className="flex items-center gap-space-xs">
      <span className="w-5 h-5 rounded-full bg-primary-container text-on-primary font-label-code text-[10px] flex items-center justify-center font-bold">DT</span>
      <span className="text-on-surface font-medium">Deeki T</span>
      </div>
      </td>
      <td className="py-space-md px-space-lg">
      <div className="text-on-surface">Mandatory fleet telematics install</div>
      </td>
      <td className="py-space-md px-space-md text-right whitespace-nowrap">
      <button type="button" className="p-1 hover:bg-surface-container rounded text-on-surface-variant hover:text-on-surface transition-colors">
      <span className="material-symbols-outlined text-[18px]">more_horiz</span>
      </button>
      </td>
      </tr>

      <tr className="hover:bg-surface-container-low transition-colors">
      <td className="py-space-md px-space-lg whitespace-nowrap">
      <div className="font-label-code text-label-code font-semibold text-on-surface">06 Jan 2026</div>
      <div className="font-caption text-caption text-on-surface-variant">11:00 AM EST</div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap">
      <span className="inline-flex items-center gap-1 font-label-code text-[11px] font-bold px-2 py-0.5 rounded bg-surface-container-high text-on-surface">
      <span className="material-symbols-outlined text-[12px]">sync_alt</span>
                        TRANSFER
                      </span>
      </td>
      <td className="py-space-md px-space-md">
      <div className="font-medium text-on-surface">Tyre pump</div>
      <div className="font-label-code text-caption text-on-surface-variant">TLS-PMP-01</div>
      </td>
      <td className="py-space-md px-space-md text-right whitespace-nowrap">
      <span className="font-label-price text-label-price font-bold text-on-surface">0</span>
      </td>
      <td className="py-space-md px-space-lg whitespace-nowrap">
      <div className="flex items-center gap-space-xs font-label-code text-caption">
      <span className="text-on-surface">Montego Bay Hub</span>
      <span className="material-symbols-outlined text-[14px] text-on-surface-variant">arrow_forward</span>
      <span className="text-on-surface font-semibold">Main store — Kingston</span>
      </div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap">
      <div className="font-label-code text-label-code text-on-surface font-semibold">TRF-5510</div>
      <div className="font-caption text-caption text-on-surface-variant">Inter-hub transfer</div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap">
      <div className="flex items-center gap-space-xs">
      <span className="w-5 h-5 rounded-full bg-surface-container-highest text-on-surface font-label-code text-[10px] flex items-center justify-center font-bold">DC</span>
      <span className="text-on-surface font-medium">—</span>
      </div>
      </td>
      <td className="py-space-md px-space-lg">
      <div className="text-on-surface">Balance stock across depots</div>
      </td>
      <td className="py-space-md px-space-md text-right whitespace-nowrap">
      <button type="button" className="p-1 hover:bg-surface-container rounded text-on-surface-variant hover:text-on-surface transition-colors">
      <span className="material-symbols-outlined text-[18px]">more_horiz</span>
      </button>
      </td>
      </tr>
      </tbody>
      </table>
      </div>

      <div className="hidden absolute top-36 right-8 z-30 w-full max-w-md bg-surface-container-lowest rounded-xl shadow-xl p-space-lg animate-in fade-in zoom-in-95" data-stitch-id="reversal-specimen-dialog">
      <div className="flex items-start justify-between pb-space-sm">
      <div className="flex items-center gap-space-sm">
      <div className="w-7 h-7 rounded bg-error-container text-on-error-container flex items-center justify-center">
      <span className="material-symbols-outlined text-[16px]">undo</span>
      </div>
      <div>
      <h3 className="font-headline-sm text-[16px] leading-5 text-on-surface font-bold">Reverse movement #MV-8821?</h3>
      <p className="font-caption text-caption text-on-surface-variant mt-0.5">Append-only correction action</p>
      </div>
      </div>
      <button type="button" className="text-on-surface-variant hover:text-on-surface p-1 rounded hover:bg-surface-container" data-stitch-id="close-reversal-modal">
      <span className="material-symbols-outlined text-[18px]">close</span>
      </button>
      </div>
      <div className="py-space-md flex flex-col gap-space-md font-body-sm text-body-sm">
      <p className="text-on-surface-variant leading-relaxed text-[13px]">
                  Reversals cannot be undone. A new <strong className="text-on-surface font-label-code">REVERSAL</strong> line will be appended to the ledger to restore inventory balances.
                </p>

      <div className="bg-surface-container-low p-space-md rounded-lg">
      <div className="font-caption text-caption uppercase text-on-surface-variant font-semibold tracking-wider mb-1">State Modification Preview</div>
      <div className="font-label-code text-caption text-on-surface flex items-center justify-between">
      <span>Main store — Kingston</span>
      <span className="font-bold text-on-surface">ACC-PHM-01</span>
      </div>
      <div className="flex items-center gap-2 mt-1 font-label-price text-label-price">
      <span className="text-on-surface">6 in stock</span>
      <span className="material-symbols-outlined text-[14px] text-on-surface-variant">arrow_forward</span>
      <span className="text-on-surface font-bold">1 in stock</span>
      <span className="font-label-code text-caption font-semibold text-on-surface-variant bg-surface-container px-1.5 py-0.2 rounded">(−5)</span>
      </div>
      </div>

      <div className="flex flex-col gap-space-xs">
      <label className="font-caption text-caption uppercase text-on-surface-variant font-semibold tracking-wider">Reason for reversal <span className="text-error">*</span></label>
      <select className="w-full bg-surface-container-low px-3 py-1.5 rounded font-body-sm text-body-sm text-on-surface focus:outline-none">
      <option>Incorrect quantity entered / Vendor delivery discrepancy</option>
      <option>Duplicate receipt logged</option>
      <option>Damaged in transit upon final inspection</option>
      <option>Administrative clerical correction</option>
      </select>
      </div>
      <div className="flex flex-col gap-space-xs">
      <label className="font-caption text-caption uppercase text-on-surface-variant font-semibold tracking-wider">Audit notes <span className="text-error">*</span></label>
      <textarea className="w-full bg-surface-container-low p-2 rounded font-body-sm text-body-sm text-on-surface focus:outline-none placeholder:text-on-surface-variant/60" placeholder="E.g. Dispatched with bill of lading #004-B revision by —." rows={2}></textarea>
      </div>
      </div>
      <div className="pt-space-md flex items-center justify-end gap-space-sm">
      <button type="button" className="px-space-md py-1.5 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container font-body-sm text-body-sm transition-colors" data-stitch-id="cancel-reversal-btn">
                  Cancel
                </button>
      <button type="button" className="px-space-md py-1.5 rounded bg-primary text-on-primary font-body-sm text-body-sm font-semibold hover:bg-on-surface transition-all flex items-center gap-space-xs shadow-sm" data-stitch-id="confirm-reversal-btn">
      <span className="material-symbols-outlined text-[16px]">verified</span>
                  Confirm Reversal
                </button>
      </div>
      </div>

      <div className="px-space-lg py-space-md bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-space-md">
      <div className="flex items-center gap-space-md">
      <span className="font-body-sm text-body-sm text-on-surface-variant">Showing <strong className="text-on-surface">1–7</strong> of <strong className="text-on-surface">48</strong> movements</span>
      <span className="text-surface-variant hidden sm:inline">|</span>
      <div className="flex items-center gap-space-xs font-label-code text-caption text-on-surface-variant">
      <span className="material-symbols-outlined text-[14px]">lock_clock</span>
      <span>Immutable block SHA-256: <span className="text-on-surface font-semibold underline decoration-dotted">7f8c92b449e7...a19</span> verified</span>
      </div>
      </div>

      <div className="flex items-center gap-space-xs">
      <button type="button" className="px-2.5 py-1 rounded bg-surface-container-lowest text-on-surface-variant hover:text-on-surface disabled:opacity-40 transition-colors shadow-sm font-body-sm text-body-sm" disabled>
      <span className="material-symbols-outlined text-[16px] align-middle">chevron_left</span>
      </button>
      <button type="button" className="px-3 py-1 rounded bg-primary text-on-primary font-label-code text-caption font-bold shadow-sm">1</button>
      <button type="button" className="px-3 py-1 rounded bg-surface-container-lowest text-on-surface hover:bg-surface-container font-label-code text-caption transition-colors shadow-sm">2</button>
      <button type="button" className="px-3 py-1 rounded bg-surface-container-lowest text-on-surface hover:bg-surface-container font-label-code text-caption transition-colors shadow-sm">3</button>
      <span className="px-1 text-on-surface-variant font-label-code text-caption">...</span>
      <button type="button" className="px-3 py-1 rounded bg-surface-container-lowest text-on-surface hover:bg-surface-container font-label-code text-caption transition-colors shadow-sm">7</button>
      <button type="button" className="px-2.5 py-1 rounded bg-surface-container-lowest text-on-surface hover:text-on-surface hover:bg-surface-container transition-colors shadow-sm font-body-sm text-body-sm">
      <span className="material-symbols-outlined text-[16px] align-middle">chevron_right</span>
      </button>
      </div>
      </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-lg mt-space-md mb-space-xl">

      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between">
      <div>
      <div className="flex items-center justify-between mb-space-sm">
      <span className="font-caption text-caption uppercase text-on-surface-variant font-semibold">Active Depot Storage</span>
      <span className="w-2 h-2 rounded-full bg-primary"></span>
      </div>
      <h4 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Kingston Central Vault</h4>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Primary warehouse for Caribbean rideshare installation kits and fleet telematics spares.</p>
      </div>
      <div className="mt-space-md pt-space-sm flex items-center justify-between font-label-code text-caption text-on-surface">
      <span>Bin capacity: 84% utilized</span>
      <span className="font-bold">Zone B-14</span>
      </div>
      </div>

      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between">
      <div>
      <div className="flex items-center justify-between mb-space-sm">
      <span className="font-caption text-caption uppercase text-on-surface-variant font-semibold">Audit Compliance</span>
      <span className="material-symbols-outlined text-[16px] text-on-surface">gavel</span>
      </div>
      <h4 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Zero-Overwrite Policy</h4>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Every physical piece of equipment retains end-to-end custody logs from supplier port landing to vehicle installation.</p>
      </div>
      <div className="mt-space-md pt-space-sm flex items-center justify-between font-label-code text-caption text-on-surface">
      <span>Reversal frequency: 0.14%</span>
      <span className="font-bold">Strict Audit</span>
      </div>
      </div>

      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between">
      <div>
      <div className="flex items-center justify-between mb-space-sm">
      <span className="font-caption text-caption uppercase text-on-surface-variant font-semibold">Cryptographic Trail</span>
      <span className="material-symbols-outlined text-[16px] text-on-surface">fingerprint</span>
      </div>
      <h4 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Chain Consistency</h4>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">All 1,842 block hashes validated against Jamaica Operations root cert with zero broken lineages.</p>
      </div>
      <div className="mt-space-md pt-space-sm flex items-center justify-between">
      <span className="font-label-code text-caption text-on-surface">Last verify: 2 mins ago</span>
      <button type="button" onClick={() => void shell.verifyLedger()} className="font-body-sm text-body-sm text-on-surface font-semibold hover:underline">Verify now</button>
      </div>
      </div>
      </div>
      </div>


      </div></div>
    </div>
  );
}
