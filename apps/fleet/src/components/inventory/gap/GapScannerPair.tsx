/** Ported from Stitch gap screen — panel only (audit R16-01). */
import { useEffect, useState } from 'react';
import { inventoryApi } from '../inventoryApi';
import { GapModalShell } from './GapModalShell';
import { useGapCompliance } from './useGapCompliance';

export function GapScannerPair(p: { onClose?: () => void }) {
  const compliance = useGapCompliance();
  const [device, setDevice] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    void inventoryApi.scanners().then((payload) => {
      const items = (payload as { items?: Record<string, unknown>[] }).items ?? [];
      setDevice(items[0] ?? null);
    });
  }, []);
  const locationCode = device?.location_id ? String(device.location_id).slice(0, 8) : '—';
  const lastSeen = device?.last_seen_at ? new Date(String(device.last_seen_at)).toLocaleString('en-JM') : '—';
  const readsOk = device?.reads_ok ?? '—';
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="ScannerPair">
      <div className="fleet-inventory-stitch inventory-stitch-root">
        <div className="mb-space-md flex flex-wrap gap-2 font-label-code text-caption text-on-surface-variant">
          <span className="rounded bg-surface-container px-2 py-1">Loc {locationCode}</span>
          <span className="rounded bg-surface-container px-2 py-1">Last seen {lastSeen}</span>
          <span className="rounded bg-surface-container px-2 py-1">Reads {String(readsOk)}</span>
        </div>
        <div className="inventory-stitch-main"><div className="flex flex-col w-full">
        <div className="px-margin-desktop py-space-xl max-w-[1440px] mx-auto w-full">

        <div className="flex items-center justify-between mb-space-lg">
        <div className="flex items-center gap-space-sm font-label-code text-label-code text-on-surface-variant">
        <span className="hover:text-primary cursor-pointer transition-colors">INVENTORY</span>
        <span>/</span>
        <span className="hover:text-primary cursor-pointer transition-colors">COUNTS & AUDITS</span>
        <span>/</span>
        <span className="text-on-surface font-semibold">SCANNERS & HARDWARE CONSOLE</span>
        </div>
        <div className="flex items-center gap-space-md">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-high text-on-surface font-label-code text-caption">
        <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                  STATION: KGN-HUB-STK-01
                </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-high text-on-surface-variant font-label-code text-caption">
                  LATENCY: 14ms (JMS-OPTIC)
                </span>
        </div>
        </div>

        <div className="relative w-full max-w-[820px] mx-auto bg-surface-container-lowest rounded-xl shadow-xl overflow-hidden flex flex-col mb-space-xl">

        <div className="p-space-lg bg-surface-container-lowest flex items-start justify-between">
        <div>
        <div className="flex items-center gap-space-sm mb-1">
        <span className="material-symbols-outlined text-[20px] text-primary">qr_code_scanner</span>
        <h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">Pair a scanner</h2>
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant">
                    Use a phone or handheld scanner to count, issue, and receive stock faster.
                  </p>
        </div>
        <button type="button" className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors" id="modal-close-icon">
        <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
        </div>

        <div className="px-space-lg bg-surface-container-lowest">
        <div className="grid grid-cols-3 gap-space-sm p-1 rounded-lg bg-surface-container">

        <div className="flex items-center gap-space-sm px-3 py-2 rounded bg-surface-container-lowest shadow-sm text-on-surface cursor-pointer select-none">
        <span className="w-5 h-5 rounded-full bg-primary text-on-primary font-label-code text-[11px] font-bold flex items-center justify-center">1</span>
        <div className="flex flex-col min-w-0">
        <span className="font-caption text-caption text-on-surface font-semibold truncate">Device Type</span>
        <span className="font-caption text-[10px] text-on-surface-variant leading-none">Phone selected</span>
        </div>
        </div>

        <div className="flex items-center gap-space-sm px-3 py-2 rounded bg-surface-container-lowest shadow-sm text-on-surface cursor-pointer select-none">
        <span className="w-5 h-5 rounded-full bg-primary text-on-primary font-label-code text-[11px] font-bold flex items-center justify-center">2</span>
        <div className="flex flex-col min-w-0">
        <span className="font-caption text-caption text-on-surface font-semibold truncate">Code & Pairing</span>
        <span className="font-caption text-[10px] text-on-surface-variant leading-none">Awaiting handshake</span>
        </div>
        </div>

        <div className="flex items-center gap-space-sm px-3 py-2 rounded text-on-surface-variant hover:text-on-surface cursor-pointer select-none transition-colors">
        <span className="w-5 h-5 rounded-full bg-surface-container-highest text-on-surface font-label-code text-[11px] font-bold flex items-center justify-center">3</span>
        <div className="flex flex-col min-w-0">
        <span className="font-caption text-caption font-semibold truncate">Location & Naming</span>
        <span className="font-caption text-[10px] text-on-surface-variant/70 leading-none">Kingston Main Hub</span>
        </div>
        </div>
        </div>
        </div>

        <div className="p-space-lg flex flex-col gap-space-xl">

        <div>
        <div className="flex items-center justify-between mb-space-sm">
        <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-semibold">1. Select Protocol & Form Factor</span>
        <span className="font-label-code text-[11px] text-on-surface-variant">4 Modes Enabled</span>
        </div>
        <div className="grid grid-cols-4 gap-space-sm">

        <div className="device-card relative p-3 rounded-lg bg-surface-container-low cursor-pointer transition-all flex flex-col justify-between h-32" data-device="phone">
        <div className="flex items-center justify-between">
        <span className="material-symbols-outlined text-[22px] text-primary" style="font-variation-settings: 'FILL' 1;">smartphone</span>
        <span className="material-symbols-outlined text-[16px] text-primary">check_circle</span>
        </div>
        <div>
        <p className="font-headline-sm text-[14px] leading-tight font-bold text-on-surface">Phone</p>
        <p className="font-caption text-[11px] text-on-surface-variant mt-1 leading-tight">Built-in camera via mobile browser</p>
        </div>
        </div>

        <div className="device-card relative p-3 rounded-lg bg-surface-container hover:bg-surface-container-high cursor-pointer transition-all flex flex-col justify-between h-32" data-device="handheld">
        <div className="flex items-center justify-between">
        <span className="material-symbols-outlined text-[22px] text-on-surface">barcode_scanner</span>
        <span className="font-label-code text-[10px] text-on-surface-variant bg-surface-container-highest px-1 py-0.5 rounded">Zebra/HW</span>
        </div>
        <div>
        <p className="font-headline-sm text-[14px] leading-tight font-bold text-on-surface">Handheld</p>
        <p className="font-caption text-[11px] text-on-surface-variant mt-1 leading-tight">Rugged mobile Android computer</p>
        </div>
        </div>

        <div className="device-card relative p-3 rounded-lg bg-surface-container hover:bg-surface-container-high cursor-pointer transition-all flex flex-col justify-between h-32" data-device="usb">
        <div className="flex items-center justify-between">
        <span className="material-symbols-outlined text-[22px] text-on-surface">usb</span>
        <span className="font-label-code text-[10px] text-on-surface-variant bg-surface-container-highest px-1 py-0.5 rounded">HID-POS</span>
        </div>
        <div>
        <p className="font-headline-sm text-[14px] leading-tight font-bold text-on-surface">USB Scanner</p>
        <p className="font-caption text-[11px] text-on-surface-variant mt-1 leading-tight">Tethered laser barcode reader</p>
        </div>
        </div>

        <div className="device-card relative p-3 rounded-lg bg-surface-container hover:bg-surface-container-high cursor-pointer transition-all flex flex-col justify-between h-32" data-device="gate">
        <div className="flex items-center justify-between">
        <span className="material-symbols-outlined text-[22px] text-on-surface">sensors</span>
        <span className="font-label-code text-[10px] text-on-surface-variant bg-surface-container-highest px-1 py-0.5 rounded">Fixed</span>
        </div>
        <div>
        <p className="font-headline-sm text-[14px] leading-tight font-bold text-on-surface">Gate reader</p>
        <p className="font-caption text-[11px] text-on-surface-variant mt-1 leading-tight">Depot optical/RFID bay gantry</p>
        </div>
        </div>
        </div>
        </div>

        <div className="rounded-xl bg-surface-container-low p-space-lg">
        <div className="flex items-center justify-between mb-space-md">
        <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-semibold">2. Live Handshake Session</span>
        <div className="flex items-center gap-1.5 font-label-code text-caption text-on-surface">
        <span className="w-2 h-2 rounded-full bg-primary animate-ping"></span>
                      SECURE WEBRTC WSS
                    </div>
        </div>
        <div className="grid grid-cols-12 gap-space-lg items-center">

        <div className="col-span-5 flex flex-col items-center justify-center p-space-md bg-surface-container-lowest rounded-xl shadow-sm">
        <div className="relative w-44 h-44 bg-surface-container-lowest p-2 flex items-center justify-center">

        <svg className="w-full h-full text-primary" fill="currentColor" viewbox="0 0 100 100">

        <rect height="28" rx="2" width="28" x="5" y="5"></rect>
        <rect fill="#ffffff" height="20" rx="1" width="20" x="9" y="9"></rect>
        <rect height="12" rx="1" width="12" x="13" y="13"></rect>

        <rect height="28" rx="2" width="28" x="67" y="5"></rect>
        <rect fill="#ffffff" height="20" rx="1" width="20" x="71" y="9"></rect>
        <rect height="12" rx="1" width="12" x="75" y="13"></rect>

        <rect height="28" rx="2" width="28" x="5" y="67"></rect>
        <rect fill="#ffffff" height="20" rx="1" width="20" x="9" y="71"></rect>
        <rect height="12" rx="1" width="12" x="13" y="75"></rect>

        <rect height="4" width="4" x="37" y="7"></rect>
        <rect height="4" width="4" x="45" y="7"></rect>
        <rect height="4" width="4" x="53" y="7"></rect>
        <rect height="4" width="4" x="7" y="37"></rect>
        <rect height="4" width="4" x="7" y="45"></rect>
        <rect height="4" width="4" x="7" y="53"></rect>
        <rect height="4" width="4" x="37" y="15"></rect>
        <rect height="4" width="4" x="49" y="15"></rect>
        <rect height="4" width="4" x="41" y="23"></rect>
        <rect height="4" width="4" x="53" y="23"></rect>

        <rect height="6" width="6" x="37" y="37"></rect>
        <rect height="6" width="6" x="47" y="37"></rect>
        <rect height="6" width="6" x="57" y="37"></rect>
        <rect height="6" width="6" x="37" y="47"></rect>
        <rect fill="#000000" height="6" width="6" x="47" y="47"></rect>
        <rect height="6" width="6" x="57" y="47"></rect>
        <rect height="6" width="6" x="37" y="57"></rect>
        <rect height="6" width="6" x="47" y="57"></rect>
        <rect height="6" width="6" x="57" y="57"></rect>

        <rect height="4" width="4" x="67" y="37"></rect>
        <rect height="4" width="4" x="75" y="37"></rect>
        <rect height="4" width="4" x="87" y="37"></rect>
        <rect height="4" width="4" x="71" y="45"></rect>
        <rect height="4" width="4" x="83" y="45"></rect>
        <rect height="4" width="4" x="67" y="53"></rect>
        <rect height="4" width="4" x="79" y="53"></rect>
        <rect height="4" width="4" x="91" y="53"></rect>
        <rect height="4" width="4" x="37" y="67"></rect>
        <rect height="4" width="4" x="45" y="67"></rect>
        <rect height="4" width="6" x="53" y="67"></rect>
        <rect height="4" width="4" x="37" y="75"></rect>
        <rect height="4" width="4" x="49" y="75"></rect>
        <rect height="4" width="4" x="57" y="75"></rect>
        <rect height="4" width="4" x="41" y="83"></rect>
        <rect height="4" width="4" x="49" y="83"></rect>
        <rect height="4" width="4" x="57" y="83"></rect>
        <rect height="4" width="4" x="67" y="67"></rect>
        <rect height="4" width="4" x="79" y="67"></rect>
        <rect height="4" width="4" x="87" y="67"></rect>
        <rect height="4" width="4" x="71" y="75"></rect>
        <rect height="4" width="4" x="83" y="75"></rect>
        <rect height="4" width="4" x="75" y="83"></rect>
        <rect height="4" width="4" x="87" y="83"></rect>
        </svg>

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-6 h-6 rounded bg-surface-container-lowest flex items-center justify-center shadow-sm">
        <span className="material-symbols-outlined text-[14px] text-primary">local_shipping</span>
        </div>
        </div>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-on-surface font-body-sm text-[12px] font-medium">
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">photo_camera</span>
                        Scan with your phone's camera
                      </div>
        </div>

        <div className="col-span-7 flex flex-col justify-between h-full pl-space-md">

        <div>
        <p className="font-caption text-caption text-on-surface-variant uppercase tracking-wider mb-1 font-semibold">DIRECT URL LINK</p>
        <div className="flex items-center justify-between p-2 rounded bg-surface-container-lowest px-3">
        <span className="font-label-code text-label-code text-on-surface font-medium select-all">roamfleet.co/scan</span>
        <button type="button" className="flex items-center gap-1 font-caption text-caption text-on-surface hover:text-primary font-semibold">
        <span className="material-symbols-outlined text-[14px]">content_copy</span>
                            COPY
                          </button>
        </div>
        </div>

        <div className="my-space-sm">
        <p className="font-caption text-caption text-on-surface-variant uppercase tracking-wider mb-1 font-semibold">ONE-TIME PAIRING PIN</p>
        <div className="bg-surface-container-lowest rounded-lg p-3 flex items-baseline justify-between shadow-sm">
        <div className="font-label-plate text-[28px] tracking-[0.25em] text-on-surface font-bold">
                            482<span className="text-on-surface-variant/40 mx-2">·</span>913
                          </div>
        <span className="font-label-code text-[11px] text-on-surface-variant bg-surface-container px-2 py-1 rounded font-semibold uppercase"></span>
        </div>
        </div>

        <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-label-code text-body-sm text-on-surface font-medium">
        <span className="material-symbols-outlined text-[16px] text-on-surface animate-spin" style="animation-duration: 4s;">schedule</span>
                            Code expires in <span className="font-bold text-primary" id="countdown-timer">09:41</span>
        </div>
        <button type="button" className="font-caption text-caption text-on-surface-variant hover:text-on-surface flex items-center gap-1 transition-colors" id="refresh-code-btn">
        <span className="material-symbols-outlined text-[13px]">refresh</span>
                            Regenerate PIN
                          </button>
        </div>

        <div className="w-full p-2.5 rounded-lg bg-surface-container-lowest flex items-center justify-between transition-all" id="handshake-banner">
        <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" id="handshake-spinner"></div>
        <span className="font-body-sm text-body-sm text-on-surface font-medium" id="handshake-label">
                              Waiting for the phone to connect...
                            </span>
        </div>
        <span className="font-label-code text-[11px] text-on-surface-variant" id="handshake-badge">LISTENING</span>
        </div>
        </div>
        </div>
        </div>
        </div>

        <div>
        <div className="flex items-center justify-between mb-space-sm">
        <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-semibold">3. Device Metadata & Operational Zone</span>
        <span className="font-label-code text-[11px] text-on-surface-variant">Auto-filled on pair</span>
        </div>
        <div className="grid grid-cols-2 gap-space-md">

        <div className="flex flex-col gap-1.5">
        <label className="font-caption text-caption text-on-surface font-medium">Device Name</label>
        <div className="relative">
        <input className="w-full h-9 px-3 rounded bg-surface-container text-on-surface font-body-md text-body-md focus:outline-none focus:bg-surface-container-low transition-colors" type="text" value="Store phone 1"/>
        <span className="absolute right-2.5 top-2 material-symbols-outlined text-[18px] text-on-surface-variant">edit</span>
        </div>
        </div>

        <div className="flex flex-col gap-1.5">
        <label className="font-caption text-caption text-on-surface font-medium">Assigned Location</label>
        <div className="relative">
        <select className="w-full h-9 px-3 pr-8 rounded bg-surface-container text-on-surface font-body-md text-body-md appearance-none focus:outline-none focus:bg-surface-container-low cursor-pointer">
        <option selected="">Main store — Kingston</option>
        <option>Main store — Bay 2</option>
        <option>Main store — Check-in desk</option>
        <option>North Depot — Montego Bay</option>
        <option>Transit Compound — Spanish Town</option>
        </select>
        <span className="absolute right-2.5 top-2 pointer-events-none material-symbols-outlined text-[18px] text-on-surface-variant">expand_more</span>
        </div>
        </div>
        </div>
        </div>
        </div>

        <div className="bg-surface-container-lowest p-space-lg">
        <div className="flex items-center justify-between mb-space-md">
        <div className="flex items-center gap-space-sm">
        <span className="material-symbols-outlined text-[18px] text-on-surface">devices</span>
        <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">Paired Scanners & Devices at Kingston Hub</h3>
        </div>
        <span className="font-label-code text-[11px] px-2 py-0.5 rounded bg-surface-container text-on-surface font-semibold">3 ACTIVE</span>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-left font-body-sm text-body-sm">
        <thead>
        <tr className="bg-surface-container-low text-on-surface-variant font-caption text-caption uppercase tracking-wider">
        <th className="py-2.5 px-3 rounded-l">Device Name</th>
        <th className="py-2.5 px-3">Type</th>
        <th className="py-2.5 px-3">Assigned Location</th>
        <th className="py-2.5 px-3">Last Seen</th>
        <th className="py-2.5 px-3">Read Accuracy</th>
        <th className="py-2.5 px-3 text-right rounded-r">Action</th>
        </tr>
        </thead>
        <tbody className="divide-y-0">

        <tr className="hover:bg-surface-container-low transition-colors group">
        <td className="py-2.5 px-3 font-semibold text-on-surface flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-primary"></span>
                          Store phone 1
                        </td>
        <td className="py-2.5 px-3 text-on-surface-variant">
        <span className="font-label-code text-[12px] bg-surface-container px-1.5 py-0.5 rounded text-on-surface">Mobile (iPhone 14)</span>
        </td>
        <td className="py-2.5 px-3 text-on-surface">Main store — Kingston</td>
        <td className="py-2.5 px-3 font-label-code text-[12px] text-on-surface font-medium">Just now</td>
        <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
        <span className="font-label-code text-label-code font-bold text-on-surface">98%</span>
        <span className="font-caption text-[11px] text-on-surface-variant">(98/100 scans)</span>
        </div>
        </td>
        <td className="py-2.5 px-3 text-right">
        <button type="button" className="unpair-btn font-caption text-caption text-error hover:text-on-error-container uppercase font-bold tracking-wider hover:underline transition-all">Unpair</button>
        </td>
        </tr>

        <tr className="hover:bg-surface-container-low transition-colors group">
        <td className="py-2.5 px-3 font-semibold text-on-surface flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-surface-tint"></span>
                          Depot Zebra TC26
                        </td>
        <td className="py-2.5 px-3 text-on-surface-variant">
        <span className="font-label-code text-[12px] bg-surface-container px-1.5 py-0.5 rounded text-on-surface">Rugged Handheld</span>
        </td>
        <td className="py-2.5 px-3 text-on-surface">Main store — Bay 2</td>
        <td className="py-2.5 px-3 font-label-code text-[12px] text-on-surface-variant">2 hours ago</td>
        <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
        <span className="font-label-code text-label-code font-bold text-on-surface">100%</span>
        <span className="font-caption text-[11px] text-on-surface-variant">(142/142 scans)</span>
        </div>
        </td>
        <td className="py-2.5 px-3 text-right">
        <button type="button" className="unpair-btn font-caption text-caption text-error hover:text-on-error-container uppercase font-bold tracking-wider hover:underline transition-all">Unpair</button>
        </td>
        </tr>

        <tr className="hover:bg-surface-container-low transition-colors group">
        <td className="py-2.5 px-3 font-semibold text-on-surface flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-outline-variant"></span>
                          Counter USB Laser
                        </td>
        <td className="py-2.5 px-3 text-on-surface-variant">
        <span className="font-label-code text-[12px] bg-surface-container px-1.5 py-0.5 rounded text-on-surface">USB Tethered</span>
        </td>
        <td className="py-2.5 px-3 text-on-surface">Main store — Check-in desk</td>
        <td className="py-2.5 px-3 font-label-code text-[12px] text-on-surface-variant">Yesterday</td>
        <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
        <span className="font-label-code text-label-code font-bold text-on-surface">99.6%</span>
        <span className="font-caption text-[11px] text-on-surface-variant">(512/514 scans)</span>
        </div>
        </td>
        <td className="py-2.5 px-3 text-right">
        <button type="button" className="unpair-btn font-caption text-caption text-error hover:text-on-error-container uppercase font-bold tracking-wider hover:underline transition-all">Unpair</button>
        </td>
        </tr>
        </tbody>
        </table>
        </div>
        </div>

        <div className="p-space-lg bg-surface-container-low flex items-center justify-between">
        <div className="flex items-center gap-2 text-on-surface-variant font-caption text-caption">
        <span className="material-symbols-outlined text-[16px] text-on-surface">shield</span>
        <span>End-to-end telemetry verified via Jamaica Hub Keyring</span>
        </div>
        <div className="flex items-center gap-space-sm">
        <button type="button" className="px-4 py-2 rounded-lg bg-surface-container text-on-surface font-body-md text-body-md font-medium hover:bg-surface-container-high transition-colors" id="modal-close-footer">
                    Close
                  </button>
        <button type="button" className="px-5 py-2 rounded-lg bg-primary text-on-primary font-body-md text-body-md font-semibold hover:bg-primary/90 active:scale-95 transition-all shadow-sm flex items-center gap-1.5" id="modal-done-footer">
        <span>Done</span>
        <span className="material-symbols-outlined text-[16px]">check</span>
        </button>
        </div>
        </div>
        </div>

        <div className="max-w-[820px] mx-auto grid grid-cols-3 gap-space-md opacity-75">
        <div className="p-space-md rounded-lg bg-surface-container flex items-center gap-space-md">
        <span className="material-symbols-outlined text-primary text-[24px]">network_ping</span>
        <div>
        <p className="font-caption text-caption text-on-surface-variant uppercase font-semibold">Hub Mesh Status</p>
        <p className="font-headline-sm text-[15px] font-bold text-on-surface">Sync Channel 08 Online</p>
        </div>
        </div>
        <div className="p-space-md rounded-lg bg-surface-container flex items-center gap-space-md">
        <span className="material-symbols-outlined text-primary text-[24px]">inventory_2</span>
        <div>
        <p className="font-caption text-caption text-on-surface-variant uppercase font-semibold">Active Cycle Count</p>
        <p className="font-headline-sm text-[15px] font-bold text-on-surface">#CC-2025-04A (Kingston)</p>
        </div>
        </div>
        <div className="p-space-md rounded-lg bg-surface-container flex items-center gap-space-md">
        <span className="material-symbols-outlined text-primary text-[24px]">security</span>
        <div>
        <p className="font-caption text-caption text-on-surface-variant uppercase font-semibold">Hardware Policies</p>
        <p className="font-headline-sm text-[15px] font-bold text-on-surface"></p>
        </div>
        </div>
        </div>
        </div>
        </div>
        </div>
        {compliance.safetyNotice ? (
          <div className="mt-space-md rounded-lg border border-outline-variant/30 bg-surface-container-low p-space-md font-body-sm text-body-sm text-on-surface-variant">
            {compliance.safetyNotice}
          </div>
        ) : null}
      </div>
    </GapModalShell>
  );
}
